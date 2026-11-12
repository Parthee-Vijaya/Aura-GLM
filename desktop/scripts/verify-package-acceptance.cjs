// Packaged-app acceptance only. No product modules are loaded from the checkout.
// Usage: node verify-package-acceptance.cjs --app /path/App.app --from /path/older.app|older.dmg --out /path/report.json
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { performance } = require('node:perf_hooks');

function argumentsFor(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--app', '--from', '--out'].includes(key) || !argv[i + 1] || argv[i + 1].startsWith('--') || result[key.slice(2)]) throw Error('Brug --app <færdig .app> [--from <ældre .app eller DMG>] --out <JSON-fil>.');
    result[key.slice(2)] = path.resolve(argv[i + 1]);
  }
  if (!result.app?.endsWith('.app') || !result.out || result.from && !/\.(?:app|dmg)$/.test(result.from)) throw Error('Angiv en færdig .app, valgfri ældre .app/DMG og --out. Kildekørsel understøttes ikke.');
  return result;
}
function networkBootstrap() {
  const net = require('node:net'), { app, safeStorage } = require('electron');
  const local = host => ['127.0.0.1', '::1', '[::1]', 'localhost'].includes(host);
  globalThis.acceptanceBoundary = { installedBeforeReady: !app.isReady(), blocked: 0, keychainCalls: 0, availabilityChecks: 0, scopedEngines: 0 };
  const children = require('node:child_process'), spawn = children.spawn;
  children.spawn = function (file, args, options) {
    if (Array.isArray(args) && /[\\/]engine-guardian\.cjs$/.test(args[0] || '')) {
      globalThis.acceptanceBoundary.scopedEngines++;
      return spawn.call(this, '/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))', file, ...args], options);
    }
    return spawn.call(this, file, args, options);
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : net._normalizeArgs(args)[0];
    if (!options.path && options.host && !local(options.host)) {
      globalThis.acceptanceBoundary.blocked++;
      throw Object.assign(Error('Acceptprøven blokerer eksternt netværk.'), { code: 'EACCES' });
    }
    return connect.apply(this, args);
  };
  safeStorage.isEncryptionAvailable = () => { globalThis.acceptanceBoundary.availabilityChecks++; return false; };
  for (const method of ['encryptString', 'decryptString']) safeStorage[method] = () => {
    globalThis.acceptanceBoundary.keychainCalls++;
    throw Error('Acceptprøven tillader ikke nøgleringsadgang. Brug nøglefri forbindelse.');
  };
  const protect = session => {
    const request = session.webRequest, original = request.onBeforeRequest.bind(request);
    request.onBeforeRequest = (filter, listener) => {
      if (typeof filter === 'function') { listener = filter; filter = undefined; }
      const wrapped = (details, callback) => {
        const url = new URL(details.url);
        if (['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) && !local(url.hostname)) {
          globalThis.acceptanceBoundary.blocked++; return callback({ cancel: true });
        }
        if (listener) return listener(details, callback);
        callback({});
      };
      return filter ? original(filter, wrapped) : original(wrapped);
    };
    request.onBeforeRequest((_details, callback) => callback({}));
  };
  app.on('session-created', protect);
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('use-mock-keychain');
}
async function timed(promise, label, milliseconds = 30000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(Error(label + ' overskred tidsgrænsen.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
class Inspector {
  constructor(url) {
    this.socket = new WebSocket(url); this.id = 0; this.pending = new Map(); this.events = new Map();
    this.ready = new Promise((resolve, reject) => { this.socket.addEventListener('open', resolve, { once: true }); this.socket.addEventListener('error', reject, { once: true }); });
    this.socket.addEventListener('message', event => {
      const data = JSON.parse(event.data);
      if (data.id) { const request = this.pending.get(data.id); if (request) { this.pending.delete(data.id); data.error ? request.reject(Error(data.error.message)) : request.resolve(data.result); } }
      else for (const callback of this.events.get(data.method) || []) callback(data.params);
    });
    this.socket.addEventListener('close', () => { for (const request of this.pending.values()) request.reject(Error('Appens inspector blev lukket.')); this.pending.clear(); });
  }
  once(method) { return new Promise(resolve => { const callbacks = this.events.get(method) || []; const callback = data => { this.events.set(method, callbacks.filter(value => value !== callback)); resolve(data); }; callbacks.push(callback); this.events.set(method, callbacks); }); }
  async call(method, params = {}) {
    await timed(this.ready, 'Inspector-forbindelse'); const id = ++this.id;
    const result = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.socket.send(JSON.stringify({ id, method, params }));
    try { return await timed(result, method); } finally { this.pending.delete(id); }
  }
  async evaluate(expression) {
    const result = await this.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, includeCommandLineAPI: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
}
async function launchPackaged(executable, args, env, cwd) {
  const child = require('node:child_process').spawn(executable, ['--inspect-brk=0', '--remote-debugging-port=0', ...args], { env, cwd, detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let log = '', browserURL, inspectorURL;
  let resolveInspector, resolveBrowser, rejectLaunch, abortStartup;
  const aborted = new Promise((_resolve, reject) => { abortStartup = reject; });
  aborted.catch(() => {});
  const startup = promise => Promise.race([promise, aborted]);
  const inspectorReady = new Promise((resolve, reject) => { resolveInspector = resolve; rejectLaunch = reject; });
  const browserReady = new Promise(resolve => { resolveBrowser = resolve; });
  child.stderr.on('data', chunk => {
    log = (log + chunk).slice(-12000);
    if (!inspectorURL) { inspectorURL = /Debugger listening on (ws:\/\/[^\s]+)/.exec(log)?.[1]; if (inspectorURL) resolveInspector(inspectorURL); }
    if (!browserURL) { browserURL = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log)?.[1]; if (browserURL) resolveBrowser(browserURL); }
  });
  child.once('error', error => { rejectLaunch(error); abortStartup(error); }); child.once('exit', () => { const error = Error('Den pakkede app stoppede under opstart: ' + log.slice(-1200)); rejectLaunch(error); abortStartup(error); });
  let inspector, browser;
  const deadline = setTimeout(() => { abortStartup(Error('Pakkens samlede opstart overskred 30 sekunder.')); }, 30000);
  try {
    inspector = new Inspector(await startup(inspectorReady));
    await startup(inspector.call('Runtime.enable')); await startup(inspector.call('Debugger.enable'));
    const paused = inspector.once('Debugger.paused');
    await startup(inspector.call('Runtime.runIfWaitingForDebugger')); await startup(paused);
    const injected = await startup(inspector.call('Runtime.evaluate', { expression: '(' + networkBootstrap.toString() + ')()', includeCommandLineAPI: true, returnByValue: true, awaitPromise: false }));
    if (injected.exceptionDetails) throw Error(injected.exceptionDetails.exception?.description || injected.exceptionDetails.text);
    await startup(inspector.call('Debugger.resume')); await startup(inspector.call('Debugger.disable'));
    browser = await startup(require('playwright').chromium.connectOverCDP(await startup(browserReady), { timeout: 30000 }));
    clearTimeout(deadline);
    return {
      evaluate: (fn, value) => inspector.evaluate('(' + fn.toString() + ')(require(\'electron\'), ' + (value === undefined ? 'undefined' : JSON.stringify(value)) + ')'),
      firstWindow: async () => { const context = browser.contexts()[0]; return context.pages().find(page => page.url().startsWith('harness://')) || await context.waitForEvent('page'); },
      async close() {
        if (child.exitCode === null && child.signalCode === null) await Promise.race([inspector.call('Runtime.evaluate', { expression: "require('electron').app.quit()", includeCommandLineAPI: true, awaitPromise: false }).catch(() => {}), new Promise(resolve => setTimeout(resolve, 1000))]);
        inspector.socket.close();
        if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => { const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 10000); child.once('exit', () => { clearTimeout(timer); resolve(); }); });
        await browser.close().catch(() => {});
      }
    };
  } catch (error) { inspector?.socket.close(); if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); try { process.kill(-child.pid, 'SIGTERM'); } catch {} const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }, 2000); await exited; clearTimeout(timer); } throw error; }
  finally { clearTimeout(deadline); }
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of require('node:fs').createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function metadata(bundle) {
  const info = path.join(bundle, 'Contents', 'Info.plist');
  const executableName = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleExecutable', info])).stdout.trim();
  if (!executableName || path.basename(executableName) !== executableName) throw Error('Ugyldigt programnavn i pakkens metadata.');
  const executable = path.join(bundle, 'Contents', 'MacOS', executableName), resources = path.join(bundle, 'Contents', 'Resources');
  const archive = path.join(resources, 'app.asar');
  const packed = JSON.parse(require('@electron/asar').extractFile(archive, 'package.json'));
  const proof = JSON.parse(await fs.readFile(path.join(resources, 'source-proof.json'), 'utf8'));
  assert.match(proof.sourceCommit, /^[a-f0-9]{40}$/);
  return { app: bundle, executable, archive, version: packed.version, kildecommit: proof.sourceCommit, sha256: { executable: await sha256(executable), asar: await sha256(archive), sourceProof: await sha256(path.join(resources, 'source-proof.json')) } };
}
async function mockModel() {
  const state = { phase: 'chat', requests: [], active: new Set(), closedStreams: 0 };
  const server = http.createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/v1/models') {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ data: [{ id: 'acceptance-model', name: 'Lokal syntetisk acceptmodel' }] }));
    }
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') { response.writeHead(404); return response.end(); }
    let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4 * 1024 * 1024) { response.writeHead(413); return response.end(); } }
    const body = JSON.parse(raw), phase = state.phase;
    // Keep metadata only. Request contents, prompts and headers never enter reports.
    state.requests.push({ phase, model: body.model, stream: body.stream === true, tools: (body.tools || []).map(tool => tool.function?.name).filter(Boolean) });
    const content = phase === 'plan' ? '## Det bygger vi\nEn lokal syntetisk acceptprøve.\n\n## Sådan skal det se ud\nEn enkel oversigt.\n\n## Teknik og data\nKun opdigtede data, ingen filændringer eller installation.\n\n## Det skal du prøve\nKontroller svaret.' : `Pakket acceptprøve: ${phase}. Kun syntetiske data.`;
    if (!body.stream) {
      response.setHeader('content-type', 'application/json');
      return response.end(JSON.stringify({ id: 'acceptance', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
    }
    response.setHeader('content-type', 'text/event-stream');
    const send = (delta, finish = null) => response.write('data: ' + JSON.stringify({ id: 'acceptance', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(finish ? { usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } } : {}) }) + '\n\n');
    send({ role: 'assistant', content });
    if (phase === 'stop') {
      state.active.add(response);
      response.once('close', () => { state.active.delete(response); state.closedStreams++; });
      return;
    }
    send({}, 'stop'); response.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}/v1`, async close() { for (const stream of state.active) stream.destroy(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
async function main(argv = process.argv.slice(2)) {
  const options = argumentsFor(argv);
  if (process.platform !== 'darwin') throw Error('Denne pakkeprøve kræver macOS og en færdig .app.');
  await fs.mkdir(path.dirname(options.out), { recursive: true });
  await fs.access(options.out).then(() => { throw Error('Resultatfilen findes allerede. Vælg en ny --out, så tidligere evidens bevares.'); }, error => { if (error.code !== 'ENOENT') throw error; });
  const temp = await fs.realpath(await fs.mkdtemp('/private/tmp/aura-accept-'));
  const report = { format: 1, startedAt: new Date().toISOString(), status: 'failed', kildecommit: null, version: null, package: null, from: null, steps: [], modelRequests: [], externalTraffic: 'Pre-bootstrap Node socket guard, Electron session filter and rejecting Chromium proxy. Native engine guardians inherit an OS loopback-only network sandbox; Chromium renderer sandbox stays enabled.', upgradeScope: 'Profilopgradering ved start af nyere app på samme testprofil. Feed-download og installation via updater afprøves ikke.', cleanup: { processes: false, mounts: false, temp: false } };
  const mounts = []; let app, page, mock, proxy;
  let currentStage = 'setup';
  async function step(id, action) {
    currentStage = id; const started = performance.now();
    try { const detail = await action(); report.steps.push({ id, status: 'pass', durationMs: Math.round(performance.now() - started), ...(detail ? { detail } : {}) }); process.stdout.write(`PASS ${id}\n`); }
    catch (error) { report.steps.push({ id, status: 'fail', durationMs: Math.round(performance.now() - started), detail: String(error.message).slice(0, 900) }); throw error; }
  }
  async function bundleAt(input, role) {
    if (input.endsWith('.app')) return fs.realpath(input);
    const mount = path.join(temp, 'mount-' + role); await fs.mkdir(mount);
    await run('/usr/bin/hdiutil', ['attach', '-readonly', '-nobrowse', '-mountpoint', mount, input], { timeout: 60000 });
    mounts.push(mount);
    const names = (await fs.readdir(mount)).filter(name => name.endsWith('.app'));
    assert.equal(names.length, 1, 'DMG skal indeholde præcis én app.');
    return path.join(mount, names[0]);
  }
  const documents = path.join(temp, 'documents'), profile = path.join(temp, 'profile');
  await fs.mkdir(documents); await fs.mkdir(profile);
  const profileSettings = path.join(profile, 'harness', 'settings.json');
  const artifacts = options.out.replace(/\.json$/i, '') + '-artifacts';
  await fs.mkdir(artifacts, { recursive: true });
  async function launch(bundle) {
    const home = path.join(temp, 'home'), tmp = path.join(temp, 'tmp');
    await fs.mkdir(home, { recursive: true }); await fs.mkdir(tmp, { recursive: true });
    app = await launchPackaged(bundle.executable, ['--user-data-dir=' + profile, '--disable-gpu', '--disable-breakpad', '--proxy-server=http://127.0.0.1:' + proxy.address().port, '--use-mock-keychain', '--disable-background-networking'],
      { PATH: '/usr/bin:/bin:/usr/sbin:/sbin', HOME: home, CFFIXED_USER_HOME: home, TMPDIR: tmp + '/', LANG: 'en_US.UTF-8' }, temp);
    assert.equal(await app.evaluate(() => globalThis.acceptanceBoundary?.installedBeforeReady), true, 'Netværksvagten skal installeres før app-ready.');
    await app.evaluate(({ app }, documents) => app.setPath('documents', documents), documents);
    const actual = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), path: app.getAppPath(), profile: app.getPath('userData'), documents: app.getPath('documents') }));
    assert.equal(actual.packaged, true); assert.equal(actual.version, bundle.version); assert.equal(actual.path, bundle.archive); assert.equal(actual.profile, profile); assert.equal(actual.documents, documents);
    page = await app.firstWindow(); page.setDefaultTimeout(25000);
    await page.waitForFunction(() => document.querySelector('#new')?.disabled === false);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().startsWith('harness://'))?.webContents.getLastWebPreferences().sandbox), true, 'Pakkens renderer-sandbox skal være bevaret.');
    await page.waitForFunction(label => [...document.querySelectorAll('[data-app-version]')].some(element => element.textContent === label), bundle.version.replace('-beta.', ' beta '));
    await page.evaluate(() => { window.acceptanceEvents = []; window.harness.onEvent(event => { if (['run.review', 'session.error', 'engine.error'].includes(event.type)) window.acceptanceEvents.push({ type: event.type, status: event.status }); }); });
  }
  async function stopApp() { if (app) { const owner = app; app = null; const boundary = await owner.evaluate(() => globalThis.acceptanceBoundary).catch(() => null); await owner.close(); if (boundary) { report.networkBoundaries ||= []; report.networkBoundaries.push(boundary); assert.equal(boundary.keychainCalls, 0); } } }
  async function ipc(method, value) {
    return page.evaluate(async ({ method, value }) => { const result = await window.harness[method](value); if (!result.ok) throw Error(result.error); return result.value; }, { method, value });
  }
  async function closeDialogs() {
    for (const id of ['settings-dialog', 'connections-dialog', 'task-dialog']) if (await page.locator('#' + id).evaluate(element => element.open)) await page.locator(`[data-close="${id}"]`).click();
  }
  async function mode(value) {
    await closeDialogs();
    await page.click('#model-chip');
    await page.click('#model-picker-more');
    if (!await page.locator('#task-dialog .workflow').evaluate(element => element.open)) await page.click('#task-dialog .workflow > summary');
    await page.selectOption('#work-mode', value);
    await page.click('[data-close="task-dialog"]');
    assert.equal(await page.inputValue('#work-mode'), value);
  }
  async function newProject(purpose) {
    if (await page.locator('#welcome-dialog').evaluate(element => element.open)) await page.click('#welcome-skip');
    // On first start the visible page is already New project. Exercise the real navigation too.
    await page.evaluate(() => document.querySelector('#new').click());
    await page.locator('#purpose').fill(purpose);
    await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])', { timeout: 60000 });
    const project = await page.locator('#project-path').textContent();
    assert.ok(project.startsWith(documents + path.sep), 'Projektet skal ligge i testens dokumentmappe.');
    return project;
  }
  async function addConnection() {
    // Dialog controls are UI; only the hidden sidebar opener uses its existing click handler.
    await page.evaluate(() => document.querySelector('#connections-button').click());
    await page.click('#connections-setup');
    if (await page.locator('#setup-profile').isVisible()) { await page.click('#profile-continue'); await page.click('#detail-continue'); }
    await page.click('#setup-add-provider');
    await page.click('#provider-cards [data-kind="compatible"]');
    if (!await page.locator('#connection-advanced').evaluate(element => element.open)) await page.click('#connection-advanced > summary');
    await page.fill('#connection-name', 'Lokal acceptprøve uden nøgle');
    await page.fill('#base-url', mock.url);
    await page.click('#save-connection');
    await page.waitForFunction(() => document.querySelector('#setup').dataset.step === 'saved' && !/Henter/.test(document.querySelector('#setup-ai').textContent));
    await page.click('#setup-continue');
    await page.waitForSelector('#setup', { state: 'hidden' });
    const connections = (await ipc('connectionState')).connections;
    const connection = connections.find(item => item.name === 'Lokal acceptprøve uden nøgle');
    assert.ok(connection); assert.equal(connection.hasKey, false); assert.equal(connection.baseURL, mock.url);
    return connection;
  }
  async function selectModel(id) {
    await closeDialogs();
    await page.click('#model-chip'); await page.click('#model-picker-more');
    if (!await page.locator('#model-options').evaluate(element => element.open)) await page.click('#model-summary');
    await page.selectOption('#connection-select', id);
    if (!await page.locator('#model-catalog').evaluate(element => element.open)) await page.click('#model-catalog > summary');
    await page.waitForFunction(() => [...document.querySelector('#model-select').options].some(option => option.value === 'acceptance-model'));
    await page.selectOption('#model-select', 'acceptance-model');
    await page.click('[data-close="task-dialog"]');
  }
  async function send(phase, selectedMode) {
    await mode(selectedMode); mock.state.phase = phase;
    const previous = await page.evaluate(() => window.acceptanceEvents.length), count = mock.state.requests.length;
    await page.fill('#prompt', 'Svar kort på denne syntetiske acceptprøve. Ingen værktøjer, filændringer eller netopslag.');
    await page.click('#send');
    await page.waitForFunction(previous => document.querySelector('#data-dialog').open || !document.querySelector('#stop').hidden || window.acceptanceEvents.length > previous, previous, { timeout: 60000 });
    const reviewed = await page.locator('#data-dialog').evaluate(element => element.open);
    if (phase === 'chat') assert.equal(reviewed, true, 'Første afsendelse skal gennem datagennemgangen.');
    if (reviewed) { assert.equal(mock.state.requests.length, count, 'Ingen modelkald før datagennemgangen er accepteret.'); await page.click('#accept-send'); }
    if (phase === 'stop') {
      await page.waitForFunction(() => !document.querySelector('#stop').hidden && document.querySelector('#messages').textContent.includes('acceptprøve: stop'), null, { timeout: 120000 });
      await page.click('#stop');
    }
    await page.waitForFunction(previous => window.acceptanceEvents.slice(previous).some(event => event.type === 'run.review') && document.querySelector('#stop').hidden, previous, { timeout: 120000 });
    const events = await page.evaluate(previous => window.acceptanceEvents.slice(previous), previous);
    assert.equal(events.some(event => event.type === 'engine.error' || event.type === 'session.error'), false, 'Opgaven må ikke afslutte med motorfejl.');
    assert.ok(mock.state.requests.slice(count).some(request => request.phase === phase));
    if (phase !== 'stop') assert.equal(events.find(event => event.type === 'run.review').status, 'idle');
    return { mode: selectedMode, dataReviewShown: reviewed, reviewStatus: events.find(event => event.type === 'run.review').status, requests: mock.state.requests.length - count };
  }
  async function plugins(value) {
    await closeDialogs();
    await page.evaluate(() => document.querySelector('#plugins-button').click());
    const select = page.locator('[data-plugin="webfetch"] select');
    await select.waitFor(); await select.selectOption(value);
    await page.waitForFunction(value => document.querySelector('[data-plugin="webfetch"] select')?.value === value, value);
    await assert.doesNotReject(async () => assert.equal((await ipc('pluginsGet')).values.webfetch, value));
    await page.click('[data-close="settings-dialog"]');
    await page.reload(); await page.waitForFunction(() => document.querySelector('#new')?.disabled === false);
    assert.equal((await ipc('pluginsGet')).values.webfetch, value);
  }
  try {
    mock = await mockModel();
    proxy = http.createServer((_req, res) => { res.writeHead(502).end(); });
    proxy.on('connect', (_req, socket) => socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'));
    await new Promise(resolve => proxy.listen(0, '127.0.0.1', resolve));
    const target = await metadata(await bundleAt(options.app, 'target'));
    report.package = target; report.version = target.version; report.kildecommit = target.kildecommit;
    let project, connection;
    const draft = 'Syntetisk kladde, som skal overleve genstart og opgradering.';
    if (options.from) {
      const previous = await metadata(await bundleAt(options.from, 'from')); report.from = previous;
      assert.equal(require('semver').lt(previous.version, target.version), true, '--from skal være en ældre appversion.');
      await step('older-package-start-version', () => launch(previous));
      await step('older-package-create-project', async () => { project = await newProject('Syntetisk opgraderingsprojekt med opdigtede data.'); });
      await step('older-package-keyless-connection', async () => { connection = await addConnection(); });
      await step('older-package-draft', async () => { await page.fill('#prompt', draft); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('Kladde gemt')); });
      await stopApp();
      await step('older-profile-plugin-fixture', async () => {
        const state = JSON.parse(await fs.readFile(profileSettings, 'utf8'));
        // Beta 4 predates plugin UI. Seed a forward-compatible unknown setting, never claim beta 4 could configure it.
        if (!state.plugins) state.plugins = { values: { webfetch: 'deny', contextHud: false }, mcp: { servers: [] } };
        await fs.writeFile(profileSettings, JSON.stringify(state, null, 2), { mode: 0o600 });
        return 'Beta 4 har ingen plugin-UI. Dette trin tilføjer særskilte syntetiske pluginværdier til den afsluttede testprofil.';
      });
      await step('upgrade-same-profile-version', () => launch(target));
      await step('upgrade-project-draft-connection-plugins', async () => {
        await page.waitForSelector('#workspace:not([hidden])');
        assert.equal(await page.locator('#project-path').textContent(), project);
        await page.waitForFunction(draft => document.querySelector('#prompt').value === draft, draft);
        const saved = (await ipc('connectionState')).connections.find(item => item.id === connection.id);
        assert.equal(saved.baseURL, mock.url); assert.equal(saved.hasKey, false);
        assert.equal((await ipc('pluginsGet')).values.webfetch, 'deny');
      });
      await stopApp();
    }
    // Independent fresh install, still completely isolated from the upgrade profile.
    await fs.rename(profile, path.join(temp, 'upgrade-profile'));
    await fs.mkdir(profile);
    await step('package-start-version', () => launch(target));
    await step('network-and-keychain-boundary', async () => {
      const proof = await app.evaluate(() => {
        const net = process.getBuiltinModule('node:net');
        let network;
        try { const socket = net.connect({ host: '192.0.2.1', port: 443 }); socket.destroy(); network = 'UNBLOCKED'; } catch (error) { network = error.code; }
        return { ...globalThis.acceptanceBoundary, network };
      });
      assert.equal(proof.installedBeforeReady, true); assert.equal(proof.network, 'EACCES'); assert.equal(proof.keychainCalls, 0);
      return proof;
    });
    await step('native-engine-network-boundary', async () => {
      const node = path.join(path.dirname(target.archive), 'runtime/node/bin/node');
      const source = "const s=require('node:net').connect({host:'192.0.2.1',port:443});s.on('error',e=>{console.log(e.code);s.destroy()});s.on('connect',()=>{console.log('UNBLOCKED');s.destroy()});s.setTimeout(1000,()=>{console.log('TIMEOUT');s.destroy()})";
      const result = await run('/usr/bin/sandbox-exec', ['-p', '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))', node, '-e', source], { timeout: 5000, env: { PATH: '/usr/bin:/bin', HOME: path.join(temp, 'home'), TMPDIR: path.join(temp, 'tmp') } });
      assert.ok(['EPERM', 'EACCES'].includes(result.stdout.trim()));
      return { externalSocket: result.stdout.trim(), runtime: 'Node fra den faktiske pakke; samme OS-netprofil som engine-guardian' };
    });
    await step('skip-profile-new-project-create', async () => { project = await newProject('En lokal acceptprøve med opdigtede data, uden konto og uden udgivelse.'); });
    await step('own-server-keyless-connection', async () => { connection = await addConnection(); await selectModel(connection.id); });
    await step('conversation-reviewed-answer', () => send('chat', 'chat'));
    await step('planning-reviewed-answer', () => send('plan', 'plan'));
    await step('build-reviewed-answer', () => send('build', 'free'));
    await step('webfetch-deny-save-reload', () => plugins('deny'));
    await step('webfetch-ask-save-reload', () => plugins('ask'));
    await step('webfetch-deny-final-save', () => plugins('deny'));
    // Reload creates a new renderer observer. Reattach through the packaged preload.
    await page.evaluate(() => { window.acceptanceEvents = []; window.harness.onEvent(event => { if (['run.review', 'session.error', 'engine.error'].includes(event.type)) window.acceptanceEvents.push({ type: event.type, status: event.status }); }); });
    await step('stop-during-stream', async () => { await selectModel(connection.id); const value = await send('stop', 'chat'); await page.waitForTimeout(250); assert.equal(mock.state.active.size, 0); assert.ok(mock.state.closedStreams > 0); return value; });
    await step('draft-before-restart', async () => { await page.fill('#prompt', draft); await page.waitForFunction(() => document.querySelector('#draft-status').textContent.includes('Kladde gemt')); });
    await step('package-restart-retains-project-draft-plugins', async () => {
      await stopApp(); await launch(target);
      await page.waitForSelector('#workspace:not([hidden])');
      assert.equal(await page.locator('#project-path').textContent(), project);
      await page.waitForFunction(draft => document.querySelector('#prompt').value === draft, draft);
      assert.equal((await ipc('pluginsGet')).values.webfetch, 'deny');
      assert.ok((await ipc('connectionState')).connections.some(item => item.id === connection.id && !item.hasKey));
      await page.screenshot({ path: path.join(artifacts, 'restart-retained.png') });
    });
    assert.ok(report.networkBoundaries.some(boundary => boundary.scopedEngines > 0), 'Den native motor skal have kørt under testens netværksprofil.');
    await step('package-digests-unchanged', async () => { assert.equal(await sha256(target.executable), target.sha256.executable); assert.equal(await sha256(target.archive), target.sha256.asar); });
    report.status = 'passed';
  } catch (error) {
    report.error = { stage: currentStage, message: String(error.message).slice(0, 1400) };
    if (page) await page.screenshot({ path: path.join(artifacts, 'failure.png'), timeout: 5000 }).catch(() => {});
    process.stderr.write(`FAIL ${currentStage}: ${String(error.message).slice(0, 1000)}\n`);
  } finally {
    report.modelRequests = mock?.state.requests || [];
    try { await stopApp(); report.cleanup.processes = true; } catch { report.cleanup.processes = false; }
    try { await mock?.close(); if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); } } catch { report.cleanup.processes = false; }
    let unmounted = true;
    for (const mount of mounts.reverse()) { let detached = false; for (let attempt = 0; attempt < 4; attempt++) { try { await run('/usr/bin/hdiutil', ['detach', mount], { timeout: 10000 }); detached = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 300)); } } if (!detached) unmounted = false; }
    report.cleanup.mounts = unmounted;
    if (report.cleanup.processes && unmounted) { await fs.rm(temp, { recursive: true, force: true }); report.cleanup.temp = true; }
    report.finishedAt = new Date().toISOString();
    if (!Object.values(report.cleanup).every(Boolean)) report.status = 'failed';
    await fs.writeFile(options.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  }
  if (report.status !== 'passed') process.exitCode = 1;
  return report;
}
if (require.main === module) main().catch(error => { process.stderr.write(String(error.message) + '\n'); process.exitCode = 1; });
module.exports = { argumentsFor, networkBootstrap, metadata, mockModel, launchPackaged, main };
