// Rigtig model gennem Aura: idé → plan → bygning → funktion → rettelse → fortrydelse.
// Nøglen indtastes direkte i isoleret Aura. Kun opdigtede data; modelkald kan koste penge.
// --controlled afprøver prøven med rigtig OpenCode og en lokal, kontrolleret model.
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const http = require('node:http');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { _electron: electron } = require('playwright');
const helpers = require('./ui-test-helpers.cjs');
const { capture } = require('../core/changes.cjs');
const desktop = path.join(__dirname, '..');
const controlled = process.argv.includes('--controlled');
const failureControl = process.argv.includes('--controlled-failure');
if (failureControl && !controlled) throw Error('--controlled-failure kræver --controlled.');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const provider = process.env.HARNESS_LIVE_PROVIDER || 'mistral';
if (!['anthropic', 'mistral', 'corti', 'alexandra'].includes(provider)) throw Error('HARNESS_LIVE_PROVIDER skal være anthropic, mistral, corti eller alexandra.');
const wanted = controlled ? 'test-model' : args[1] || (provider === 'corti' ? 'corti-s1' : provider === 'alexandra' ? 'glm-5.3-flash' : '');
const idea = 'Lav en dansk oversigt over tre fiktive mødelokaler: Birk med 4 pladser, Bøg med 8 og Ask med 12. Overskriften skal være Mødelokaler. Et talfelt med den synlige etiket Antal deltagere skal straks filtrere listen, så kun lokaler med mindst det antal pladser vises. Ved 99 deltagere skal ingen lokaler vises, og beskeden Ingen lokaler passer. skal stå på siden. Brug kun public/index.html og eventuelt CSS/JavaScript i public. Ingen pakker, server, installation, netopslag eller shellkommandoer. Planlæg først.';
const correction = 'Ret kun overskriften Mødelokaler til Find dit mødelokale. Bevar filtrering, lokaler og alt andet. Brug edit eller write; ingen kommandoer eller netopslag.';
let out, stage = 'opsætning', project, app, page, server;
const log = [], checks = [], approvals = [], reviews = [], errors = [], usage = {}, observations = [], providerRequests = [];
const permissionRequests = new Map(), stageResults = new Map();
const note = text => { const line = `[${new Date().toISOString()}] ${text}`; log.push(line); console.log(line); };
const digest = text => createHash('sha256').update(text).digest('hex');
const snapshot = async () => {
  const data = await capture(project);
  assert.equal(data.skipped, 0, 'Ingen filer må være udeladt fra bytekontrollen.');
  return [...data.files].sort(([a], [b]) => a.localeCompare(b));
};
const hashes = files => files.map(([file, text]) => ({ file, sha256: digest(text) }));
let imageCount = 0;
async function shot(name) {
  const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.capturePage()).toPNG().toString('base64'));
  await fs.writeFile(path.join(out, `${++imageCount}-${name}.png`), Buffer.from(png, 'base64'));
}
async function check(title, action) { await action(); checks.push(title); note(`Bestået: ${title}`); }
function controlledHTML(heading) {
  return `<!doctype html><html lang="da"><meta charset="utf-8"><title>Mødelokaler</title><h1>${heading}</h1><label for="n">Antal deltagere</label><input id="n" type="number" min="1" value="1"><ul><li data-cap="4">Birk</li><li data-cap="8">Bøg</li><li data-cap="12">Ask</li></ul><p id="none" hidden>Ingen lokaler passer.</p><script>n.oninput=()=>{for(const li of document.querySelectorAll('li'))li.hidden=+li.dataset.cap<+n.value;document.getElementById('none').hidden=[...document.querySelectorAll('li')].some(li=>!li.hidden)};n.oninput()</script></html>`;
}
async function startControlledServer() {
  const written = new Set(); let questionAsked = false;
  server = http.createServer(async (req, res) => {
    if (req.url === '/v1/models') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ data: [{ id: wanted, name: 'Kontrolleret testmodel' }] })); }
    if (failureControl) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Bevidst afvist modeladgang', type: 'authentication_error' } })); }
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    providerRequests.push({ stage, toolNames: (body.tools || []).map(tool => tool.function?.name), at: Date.now() });
    const currentTools = Array.isArray(body.tools) && body.tools.length > 0;
    if (stage === 'stop' && currentTools) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: ' + JSON.stringify({ id: 'stop-probe', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content: 'Jeg afventer næste lokale testtrin.' }, finish_reason: null }] }) + '\n\n');
      return; // Deliberately quiet until the user presses Stop. No tool call is issued.
    }
    const tool = currentTools && stage === 'question' && !questionAsked ? {
      id: 'controlled_question', type: 'function', function: { name: 'question', arguments: JSON.stringify({ questions: [{ header: 'Prøvesvar', question: 'Hvilken afgrænsning skal den separate svarprøve bevare?', options: [{ label: 'Kun den lokale demo', description: 'Ingen installation eller deling.' }], custom: true }] }) }
    } : currentTools && ['bygning', 'rettelse'].includes(stage) && !written.has(stage) ? {
      id: `write_${stage}`, type: 'function', function: { name: 'write', arguments: JSON.stringify({ path: path.join(project, 'public/index.html'), content: controlledHTML(stage === 'rettelse' ? 'Find dit mødelokale' : 'Mødelokaler') }) }
    } : null;
    if (tool?.function.name === 'question') questionAsked = true;
    else if (tool) written.add(stage);
    const planText = '## Det bygger vi\nTre fiktive mødelokaler med et dansk talfilter.\n\n## Sådan skal det se ud\nEn læsbar, mobilvenlig liste med en tydelig tom tilstand.\n\n## Teknik og data\nKun public/index.html og lokale eksempeldata. Ingen installation.\n\n## Det skal du prøve\nPrøv 1, 5, 9 og 99 deltagere.';
    const chunk = { id: 'controlled', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta: tool ? { role: 'assistant', tool_calls: [{ index: 0, ...tool }] } : { role: 'assistant', content: stage === 'plan' ? planText : 'Ændringen er skrevet. Prøv filtreringen.' }, finish_reason: null }] };
    res.setHeader('content-type', 'text/event-stream');
    res.write('data: ' + JSON.stringify(chunk) + '\n\n');
    res.write('data: ' + JSON.stringify({ ...chunk, choices: [{ index: 0, delta: {}, finish_reason: tool ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } }) + '\n\n'); res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
async function answerApprovals() {
  for (const box of await page.locator('#approvals .approval').all()) {
    if (await box.locator('.question-title').count()) {
      approvals.push({ stage, kind: 'spørgsmål', answer: 'den afgrænsede prøve' });
      const answer = box.locator('textarea');
      assert.equal(await answer.isVisible(), true, 'Eget svar er synligt uden et ekstra klik.');
      await answer.fill('Følg den konkrete idé: lokal HTML/CSS/JavaScript, de tre fiktive lokaler og filteret. Ingen installation eller deling.');
      await box.locator('button[type="submit"]').click(); continue;
    }
    const once = box.getByRole('button', { name: 'Tillad én gang', exact: true });
    const target = await box.locator('.action-target').textContent().catch(() => '');
    const request = permissionRequests.get(await box.getAttribute('data-id'));
    // Check the actual permission and host classification, not just a button label.
    const allowed = await once.count() && request?.permission === 'edit' && request.policy?.projectFile === true && /^public\/[a-zA-Z0-9_./-]+\.(html|css|js)$/.test(target) && !target.split('/').includes('..');
    approvals.push({ stage, target, allowed: Boolean(allowed) });
    observations.push({ stage, at: 'approval', status: await page.locator('#run-status').innerText(), glow: await page.locator('#chat-form').getAttribute('data-metal-state') });
    assert.equal(observations.at(-1).glow, 'waiting', 'En konkret filgodkendelse viser ventetilstand.');
    await shot(`${stage}-godkendelse`);
    if (allowed) await once.click();
    else {
      await box.getByRole('button', { name: 'Flere valg', exact: true }).click();
      await box.getByRole('button', { name: 'Afvis med en besked', exact: true }).click();
      await box.locator('textarea').fill('Prøven tillader kun HTML/CSS/JavaScript i public/. Brug read, edit eller write der. Ingen shell, netopslag eller adgang uden for projektet.');
      await box.getByRole('button', { name: 'Afvis og send beskeden', exact: true }).click();
    }
  }
}
async function runUntilDone(label, startAction) {
  stage = label;
  const deadline = Date.now() + 12 * 60000, count = reviews.length;
  await startAction();
  await page.waitForFunction(() => !document.querySelector('#stop').hidden || document.querySelector('#data-dialog').open, null, { timeout: 60000 });
  if (await page.locator('#data-dialog').evaluate(el => el.open)) { await shot(`${label}-foer-du-sender`); await page.click('#accept-send'); }
  while (Date.now() < deadline) {
    await answerApprovals();
    if (reviews.length > count && await page.locator('#stop').isHidden()) break;
    await page.waitForTimeout(500);
  }
  if (reviews.length === count || !await page.locator('#stop').isHidden()) {
    await page.click('#stop').catch(() => {}); throw Error(`${label}: ingen afsluttet opgave inden prøvens grænse.`);
  }
  const result = reviews.at(-1);
  stageResults.set(label, result);
  assert.equal(result.status, 'idle', `${label}: opgaven skal afslutte uden fejl eller Stop (${result.failure?.kind || result.status}).`);
  // Et værktøj, prøven selv afviste med sin policy-besked, er ikke en fejl: modellen skal kunne komme videre efter afvisningen.
  assert(!result.tools.some(tool => tool.status === 'error' && !tool.error.includes('Prøven tillader kun')), `${label}: et værktøj fejlede.`);
  if (!['plan', 'question'].includes(label)) assert(result.files.length, `${label}: ingen faktisk filændring.`);
  note(`${label}: ${result.status}, ${result.files.length} ændrede filer`);
}
async function tryFilter(heading) {
  const frame = page.frameLocator('#preview');
  await frame.getByRole('heading', { name: heading, exact: true }).waitFor({ timeout: 30000 });
  const number = frame.getByRole('spinbutton', { name: 'Antal deltagere', exact: true });
  for (const [n, expected] of [[1, ['Birk', 'Bøg', 'Ask']], [5, ['Bøg', 'Ask']], [9, ['Ask']], [99, []]]) {
    await number.fill(String(n));
    await page.waitForTimeout(150);
    const actual = [];
    for (const room of ['Birk', 'Bøg', 'Ask']) if (await frame.getByText(room, { exact: true }).isVisible()) actual.push(room);
    assert.deepEqual(actual, expected, `Filteret ved ${n} deltagere`);
    if (n === 99) assert(await frame.getByText('Ingen lokaler passer.', { exact: true }).isVisible());
  }
  await number.fill('1');
}
async function main() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-rigtig-model-')));
  out = args[0] ? path.resolve(args[0]) : path.join(root, 'resultat');
  // En resultatmappe må ikke erstatte evidens fra en tidligere kørsel.
  await fs.mkdir(out, { recursive: false });
  const documents = path.join(root, 'Dokumenter'), appdata = path.join(root, 'appdata');
  const bundle = process.env.HARNESS_TEST_PACKAGE && path.resolve(process.env.HARNESS_TEST_PACKAGE);
  const executablePath = bundle ? (bundle.endsWith('.app') ? path.join(bundle, 'Contents/MacOS', path.basename(bundle, '.app')) : bundle) : require('electron');
  const platformPath = process.platform === 'win32' ? path.join(process.env.SystemRoot, 'System32') : '/usr/bin:/bin:/usr/sbin:/sbin';
  const report = { status: 'ikke gennemført', provider: controlled ? 'lokal kontrolleret model' : provider, model: wanted, realModel: !controlled, packaged: Boolean(bundle), bundle, root, checks, approvals, reviews, errors, observations, providerRequests };
  report.sourceSHA256 = Object.fromEntries(await Promise.all(['scripts/verify-live-app.cjs', 'core/engine.cjs', 'core/chat-session.cjs', 'ui/app.js', 'ui/planning.js'].map(async file => [file, digest(await fs.readFile(path.join(desktop, file)))])));
  report.engineVersion = require('../core/engine.cjs').VERSION;
  note(`Resultater: ${out}`);
  try {
    if (controlled) await startControlledServer();
    app = await electron.launch({ executablePath, args: [...(bundle ? [] : [desktop]), '--user-data-dir=' + appdata], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ...(bundle ? { PATH: platformPath, HARNESS_OPENCODE_PATH: '' } : {}) } });
    await helpers.isolateDocuments(app, documents);
    page = await app.firstWindow(); page.setDefaultTimeout(30000);
    // Fejl fra AI'ens egne projektfiler i forhåndsvisningen (http://127.0.0.1:port) er prøvens emne,
    // ikke appfejl. De fanges i stedet af funktionstjekket på siden. Appens egne fejl (harness://) tæller med.
    page.on('pageerror', e => { if (!/\/\/127\.0\.0\.1:\d+\//.test(String(e.stack || ''))) errors.push(e.message); });
    await page.waitForFunction(() => !document.querySelector('#welcome-build').disabled);
    await page.exposeFunction('liveDemoEvent', event => {
      if (event.type === 'run.review') reviews.push(event);
      if (event.type === 'permission.asked') permissionRequests.set(event.properties.id, event.properties);
      const info = event.properties?.info;
      if (event.type === 'message.updated' && info?.role === 'assistant' && info.tokens) usage[info.id] = info.tokens;
    });
    await page.evaluate(() => window.harness.onEvent(event => window.liveDemoEvent(event)));
    if (controlled) {
      await helpers.skipIntroduction(page);
      await helpers.addConnection(page, { name: 'Kontrolleret lokal prøve', baseURL: `http://127.0.0.1:${server.address().port}/v1`, apiKey: 'syntetisk-noegle' });
    } else {
      await page.click('#path-app'); await page.click('#welcome-build'); await page.click('#setup-add-provider');
      await page.click(`#provider-cards [data-kind="${provider}"]`); await page.locator('.key-guide > summary').click();
      // Intet skærmbillede eller DOM-udtræk af feltet, mens nøglen tastes.
      note(`KLAR TIL NØGLE: Indtast ${provider}-nøglen direkte i dette Aura-vindue, og klik Gem og kontrollér. Ingen nøgle i chat eller terminal.`);
      await page.waitForFunction(() => !document.querySelector('#setup-continue').hidden && !document.querySelector('#setup-continue').disabled, null, { timeout: 30 * 60000, polling: 1000 });
      await page.click('#setup-continue'); await page.click('#features-all');
    }
    await page.waitForSelector('#create-form'); await page.fill('#purpose', idea); await page.click('#create');
    await page.waitForSelector('#workspace:not([hidden])', { timeout: 60000 });
    if (controlled) await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')); window.unmaximize(); window.setContentSize(1440, 900); });
    const folders = await fs.readdir(path.join(documents, 'Aura')); assert.equal(folders.length, 1);
    project = path.join(documents, 'Aura', folders[0]); report.project = project;
    if (wanted && await page.inputValue('#model-select') !== wanted) {
      await helpers.taskOptions(page); await page.locator('#model-catalog').evaluate(el => el.open = true);
      await page.waitForFunction(id => [...document.querySelector('#model-select').options].some(option => option.value === id), wanted);
      await page.selectOption('#model-select', wanted); await page.click('#model-done');
    }
    await page.waitForFunction(() => document.querySelector('#model-select').value);
    report.model = await page.inputValue('#model-select'); if (wanted) assert.equal(report.model, wanted);
    note(`Model: ${report.model}`);
    // Standardtilstanden er Samtale; prøvens planforløb kræver Planlæg.
    await helpers.selectMode(page, 'plan');
    await runUntilDone('plan', () => page.click('#send'));
    await check('Plan uden filændring', async () => { assert.equal(reviews.at(-1).files.length, 0); assert(await page.isVisible('#plan-card')); });
    await fs.writeFile(path.join(out, 'plan.txt'), await page.locator('#plan-text').textContent()); await shot('plan');
    await runUntilDone('bygning', () => page.click('#build-plan'));
    await check('Bygget preview filtrerer 1, 5, 9 og 99 deltagere', () => tryFilter('Mødelokaler'));
    const before = await snapshot(); report.before = hashes(before); await shot('bygget');
    await page.selectOption('#viewport-preset', 'phone'); await tryFilter('Mødelokaler'); await shot('mobil'); await page.selectOption('#viewport-preset', 'fluid');
    await page.fill('#prompt', correction); await runUntilDone('rettelse', () => page.click('#send'));
    await check('AI-rettelsen ændrer overskrift og bevarer funktionen', () => tryFilter('Find dit mødelokale'));
    const changed = await snapshot(); assert.notDeepEqual(changed, before); report.changed = hashes(changed); await shot('rettet');
    await page.locator('#run-review .result-receipt').filter({ hasText: 'Prøv resultatet' }).waitFor();
    await page.locator('#run-review').getByRole('button', { name: 'Fortryd opgaven', exact: true }).click();
    await page.waitForSelector('#restore-dialog[open]'); await page.waitForFunction(() => !document.querySelector('#restore-confirm').disabled);
    await shot('gennemgaa-fortrydelse'); await page.click('#restore-confirm'); await page.waitForSelector('#restore-dialog', { state: 'hidden' });
    await check('Fortryd genskaber byteidentiske projektfiler', async () => assert.deepEqual(await snapshot(), before));
    await check('Preview virker igen efter fortrydelse', () => tryFilter('Mødelokaler')); await shot('fortrudt');
    if (controlled && !failureControl) {
      await check('Hver ønsket filændring udføres præcis én gang', async () => {
        for (const label of ['bygning', 'rettelse']) {
          const writes = stageResults.get(label).tools.filter(tool => tool.tool === 'write');
          assert.equal(writes.length, 1, `${label}: ét faktisk skriveværktøj`);
          assert.equal(writes[0].status, 'completed');
          assert.equal(approvals.filter(item => item.stage === label && item.allowed).length, 1, `${label}: kun én filgodkendelse`);
        }
        const writtenTools = reviews.flatMap(result => result.tools).filter(tool => tool.tool === 'write');
        assert.equal(writtenTools.length, 2, 'Præcis to skriveværktøjer i de to ændringsforløb.');
      });
      const beforeQuestion = await snapshot();
      // Undo intentionally invalidates the old plan. The operator explicitly
      // selects read-only conversation mode for the independent question/Stop probes.
      await helpers.selectMode(page, 'chat');
      await page.fill('#prompt', 'Dette er en særskilt test af spørgsmål: spørg hvilken afgrænsning svarprøven skal bevare. Ændr ingen filer.');
      await runUntilDone('question', () => page.click('#send'));
      await check('Rigtigt question-værktøj besvares i det direkte svarfelt uden at ændre filer', async () => {
        assert.equal(approvals.filter(item => item.stage === 'question' && item.kind === 'spørgsmål').length, 1);
        assert.deepEqual(await snapshot(), beforeQuestion);
      });
      stage = 'stop'; const prior = await snapshot();
      await page.fill('#prompt', 'Kontrolleret stopprøve: vent på næste testtrin uden at ændre filer.');
      await page.click('#send');
      await page.waitForFunction(() => document.querySelector('#data-dialog').open || !document.querySelector('#stop').hidden);
      if (await page.locator('#data-dialog').evaluate(el => el.open)) await page.click('#accept-send');
      await page.getByText('Jeg afventer næste lokale testtrin.', { exact: true }).waitFor({ timeout: 90000 });
      await check('Faktisk stille model viser ærlig ventestatus uden falsk fremdrift', async () => {
        await page.waitForFunction(() => /Ingen nye signaler/.test(document.querySelector('#agent-progress').textContent), null, { timeout: 30000 });
        observations.push({ stage, at: 'quiet', status: await page.locator('#agent-activity').innerText(), glow: await page.locator('#chat-form').getAttribute('data-metal-state') });
        assert.equal(await page.locator('#agent-activity').evaluate(el => el.classList.contains('is-quiet')), true);
        // The existing glow still denotes an active request, not new progress.
        assert.equal(observations.at(-1).glow, 'working'); await shot('stille-model');
      });
      await page.click('#stop');
      await page.waitForFunction(() => document.querySelector('#stop').hidden && document.querySelector('#chat-form').dataset.metalState === 'idle', null, { timeout: 30000 });
      await check('Stop afslutter lyskant og bevarer filerne uden genforsøg', async () => {
        assert.deepEqual(await snapshot(), prior); assert.equal(reviews.at(-1).status, 'stopped');
        const stoppedCount = providerRequests.filter(request => request.stage === 'stop' && request.toolNames.length).length;
        await page.waitForTimeout(700);
        assert.equal(providerRequests.filter(request => request.stage === 'stop' && request.toolNames.length).length, stoppedCount);
        observations.push({ stage, at: 'stopped', glow: await page.locator('#chat-form').getAttribute('data-metal-state'), modelRequests: stoppedCount }); await shot('stoppet');
      });
    }
    assert.deepEqual(errors, []); assert(Object.keys(usage).length, 'Motoren rapporterer faktisk tokenforbrug.');
    report.status = 'bestået';
  } catch (error) {
    report.status = 'fejl'; report.stage = stage; report.error = error.message.split('\n')[0];
    if (controlled) note(error.stack || error.message);
    // Kun projekt/samtale efter opsætning; optag aldrig nøglefeltet ved opsætningsfejl.
    if (project) { await shot('fejl').catch(() => {}); await fs.writeFile(path.join(out, 'samtale.txt'), await page.locator('#messages').innerText().catch(() => '')); }
    throw error;
  } finally {
    if (project && report.status === 'bestået') await fs.writeFile(path.join(out, 'samtale.txt'), await page.locator('#messages').innerText());
    await app?.close().catch(() => {});
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await fs.rm(appdata, { recursive: true, force: true });
    await fs.writeFile(path.join(out, 'forbrug.json'), JSON.stringify(Object.values(usage), null, 2));
    await fs.writeFile(path.join(out, 'rapport.json'), JSON.stringify(report, null, 2));
    note('Prøvens isolerede appdata med den krypterede nøgle er slettet. Brugerens appdata og nøglering er uændret.');
    await fs.writeFile(path.join(out, 'log.txt'), log.join('\n'));
  }
  console.log(JSON.stringify({ status: report.status, realModel: report.realModel, packaged: report.packaged, out, checks }));
}
main().catch(error => { note(`STOP: ${error.message.split('\n')[0]}`); process.exitCode = 1; });
