// Forhåndsvisningen af en Promte-app i den rigtige app: Aura svarer kun appens init med integrationen slået til,
// beder om login, opretter appen efter brugerens klik og sender appens kald videre. Promtes netværk er erstattet af lokale adaptere.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const helpers = require('./ui-test-helpers.cjs');
// Siden opfører sig som @promte/app-library: init, indstillinger og kald gennem forælderen.
const page = `<!doctype html><meta charset="utf-8"><h1 id="status">Venter på Promte</h1><script>
let settings = null;
const ask = setInterval(() => { if (!settings) parent.postMessage({ type: 'init', fetchProxy: true }, '*'); }, 300);
addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'set-settings' && event.source === parent) {
    settings = data.value; clearInterval(ask);
    parent.postMessage({ type: 'promte-fetch-request', id: 'm1', path: 'app-api/models?type=llm', method: 'GET', headers: [['accept', 'application/json']], body: null }, event.origin);
  }
  if (data.type === 'promte-fetch-response' && data.id === 'm1') {
    const models = JSON.parse(new TextDecoder().decode(data.body)).models;
    document.getElementById('status').textContent = 'Forbundet · ' + settings.workspaceId + ' · ' + settings.backendUrl + ' · ' + models.map(m => m.label).join(', ');
  }
});
</script>`;
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-promte-preview-'))), project = path.join(root, 'moedereferat'); let app, server;
  await fs.mkdir(project); await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({ name: 'moedereferat', private: true, devDependencies: { '@promte/app-library': '^0.1.6' } }));
  server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(page); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    const window = await app.firstWindow(), errors = [];
    window.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ dialog }, { project, modulePath, setupPath }) => {
      const require = process.getBuiltinModule('module').createRequire(modulePath), { PromtePreview } = require(modulePath), { PromteSetup } = require(setupPath);
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
      // Promtes netværk er erstattet; Auras egen kobling, funktionsvalg og oprettelse kører uændret.
      const calls = globalThis.promtePreviewCalls = []; let connected = false;
      PromteSetup.prototype.state = async ({ host }) => { calls.push(['state', host]); return { host, connected, loginSource: connected ? 'aura' : null, email: connected ? 'test@example.invalid' : '' }; };
      // Som det rigtige login gemmes en Promte-adgang, så Udgivelse bliver anbefalet (PR 14).
      PromteSetup.prototype.login = async function ({ host }) { calls.push(['login', host]); connected = true; await this.store.update(state => { state.hosting = { ...state.hosting, promte: { [host]: { secret: 'krypteret', email: 'test@example.invalid', expiresAt: '2099-01-01T00:00:00.000Z' } } }; }); };
      PromteSetup.prototype.createWorkspace = async ({ host, name }) => { calls.push(['create', host, name]); return { id: 'ws-ny', name, activeAppVersion: null }; };
      const connect = PromtePreview.prototype.connect;
      PromtePreview.prototype.connect = async function (root, options) { calls.push(['connect', root]); return connect.call(this, root, options); };
      PromtePreview.prototype.fetch = async (root, request) => { calls.push(['fetch', request.path, request.method]); return { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']], body: new TextEncoder().encode(JSON.stringify({ models: [{ label: 'GPT test' }, { label: 'Claude test' }] })).buffer }; };
    }, { project, modulePath: path.resolve(__dirname, '../core/promte-preview.cjs'), setupPath: path.resolve(__dirname, '../core/provider-promte.cjs') });
    const calls = () => app.evaluate(() => globalThis.promtePreviewCalls);
    const capture = async name => { const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.capturePage()).toPNG().toString('base64')); await fs.writeFile(path.join(root, name), Buffer.from(png, 'base64')); };
    await helpers.skipIntroduction(window); await window.click('#open'); await window.waitForSelector('#workspace:not([hidden])');
    await helpers.menuClick(window, '#attach-preview'); await window.fill('#preview-url', `http://127.0.0.1:${server.address().port}/`); await window.click('#preview-form button[type="submit"]');
    // 1. Promte-integrationen er slået fra som standard: Aura svarer ikke appen og kontakter ikke Promte.
    for (let i = 0; i < 50 && !(await calls()).some(c => c[0] === 'connect'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    await new Promise(resolve => setTimeout(resolve, 1500));
    assert.ok((await calls()).some(c => c[0] === 'connect'), 'appen spurgte om forbindelse');
    assert.deepEqual((await calls()).filter(c => c[0] !== 'connect'), [], 'ingen kontakt til Promte, før integrationen er slået til');
    assert.equal(await window.locator('#promte-preview').isHidden(), true);
    assert.equal(await window.frameLocator('#preview').locator('#status').textContent(), 'Venter på Promte');
    // 2. Med integrationen slået til tilbyder Aura login i forhåndsvisningen.
    const saved = await window.evaluate(() => window.harness.featuresSave({ scope: 'alle', values: { 'integration-promte': true } }));
    assert.equal(saved.ok, true, saved.error);
    await window.locator('#promte-preview').filter({ hasText: 'Log ind med Promte' }).waitFor();
    // Udgiv er altid synlig; udgivelse er endnu ikke slået til.
    assert.equal(await window.locator('#deploy-button').isVisible(), true); assert.equal(await window.evaluate(() => window.sharingOn()), false);
    assert.equal(await window.frameLocator('#preview').locator('#status').textContent(), 'Venter på Promte');
    // 3. Login opretter ingen app. Aura spørger først, og appen oprettes med ét klik.
    await window.click('#promte-preview');
    await window.locator('#promte-preview').filter({ hasText: 'Opret appen Moedereferat i Promte' }).waitFor();
    // Integrationen er slået til i Funktioner, så udgivelse følger brugerens eget valg; Udgiv er fortsat synlig (PR 14).
    assert.equal(await window.locator('#deploy-button').isVisible(), true);
    assert.equal((await calls()).some(c => c[0] === 'create'), false, 'login opretter ingen app');
    await capture('promte-opret.png');
    await window.click('#promte-preview');
    await window.frameLocator('#preview').locator('#status').filter({ hasText: 'Forbundet' }).waitFor();
    assert.equal(await window.frameLocator('#preview').locator('#status').textContent(), 'Forbundet · ws-ny · https://kodning.promte.dk/api · GPT test, Claude test');
    assert.equal(await window.textContent('#promte-preview'), 'Promte · Moedereferat (ny app oprettet)');
    const log = await calls();
    assert.deepEqual(log.filter(c => ['login', 'create', 'fetch'].includes(c[0])), [['login', 'https://kodning.promte.dk'], ['create', 'https://kodning.promte.dk', 'Moedereferat'], ['fetch', 'app-api/models?type=llm', 'GET']]);
    assert.ok(log.filter(c => c[0] === 'connect').every(c => c[1] === project));
    // Projektet husker appen, så Udgiv forvælger den samme.
    assert.deepEqual((await window.evaluate(() => window.harness.deploymentSetup({ action: 'promte-link', config: {} }))).value.link, { host: 'https://kodning.promte.dk', workspaceId: 'ws-ny', name: 'Moedereferat' });
    assert.deepEqual(errors, []);
    await capture('promte-forhaandsvisning.png');
    console.log(JSON.stringify({ status: 'bestået', root, calls: log.map(c => c[0]), limitations: ['lokale Promte-adaptere', 'testside i stedet for app-biblioteket'] }, null, 2));
  } finally { await app?.close(); server?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
