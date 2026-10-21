// Forhåndsvisningen af en Promte-app i den rigtige app: Aura svarer appens init, beder om login,
// opretter appen og sender appens kald videre. Promtes netværk er erstattet af lokale adaptere.
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
    await app.evaluate(({ dialog }, { project, modulePath }) => {
      const require = process.getBuiltinModule('module').createRequire(modulePath), { PromtePreview } = require(modulePath);
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [project] });
      const calls = globalThis.promtePreviewCalls = []; let connected = false, linked = false;
      PromtePreview.prototype.connect = async root => {
        calls.push(['connect', root]);
        if (!connected) return { active: true, connected: false, host: 'https://kodning.promte.dk' };
        const created = !linked; linked = true;
        return { active: true, connected: true, created, host: 'https://kodning.promte.dk', workspaceId: 'ws-ny', name: 'Moedereferat', settings: { workspaceId: 'ws-ny', version: 0, backendUrl: 'https://kodning.promte.dk/api', fetchProxy: true, user: { email: 'test@example.invalid' } } };
      };
      // Som det rigtige login gemmes en krypteret Promte-adgang, så Del bliver anbefalet.
      PromtePreview.prototype.login = async function (root) { calls.push(['login', root]); connected = true; await this.store.update(state => { state.hosting = { ...state.hosting, promte: { 'https://kodning.promte.dk': { secret: 'krypteret', email: 'test@example.invalid', expiresAt: '2099-01-01T00:00:00.000Z' } } }; }); return this.connect(root); };
      PromtePreview.prototype.fetch = async (root, request) => { calls.push(['fetch', request.path, request.method]); return { status: 200, statusText: 'OK', headers: [['content-type', 'application/json']], body: new TextEncoder().encode(JSON.stringify({ models: [{ label: 'GPT test' }, { label: 'Claude test' }] })).buffer }; };
    }, { project, modulePath: path.resolve(__dirname, '../core/promte-preview.cjs') });
    await helpers.skipIntroduction(window); await window.click('#open'); await window.waitForSelector('#workspace:not([hidden])');
    await helpers.menuClick(window, '#attach-preview'); await window.fill('#preview-url', `http://127.0.0.1:${server.address().port}/`); await window.click('#preview-form button[type="submit"]');
    // 1. Uden login: appen venter, og Aura tilbyder login i forhåndsvisningen.
    await window.locator('#promte-preview').filter({ hasText: 'Log ind med Promte' }).waitFor();
    assert.equal(await window.frameLocator('#preview').locator('#status').textContent(), 'Venter på Promte');
    assert.equal(await window.locator('#deploy-button').isHidden(), true, 'Del er skjult før login');
    // 2. Efter login opretter Aura appen, og appen får forbindelse og data gennem Aura.
    await window.click('#promte-preview');
    await window.frameLocator('#preview').locator('#status').filter({ hasText: 'Forbundet' }).waitFor();
    assert.equal(await window.frameLocator('#preview').locator('#status').textContent(), 'Forbundet · ws-ny · https://kodning.promte.dk/api · GPT test, Claude test');
    assert.equal(await window.textContent('#promte-preview'), 'Promte · Moedereferat (ny app oprettet)');
    await window.locator('#deploy-button').waitFor({ state: 'visible', timeout: 10000 });
    const calls = await app.evaluate(() => globalThis.promtePreviewCalls);
    assert.deepEqual(calls.filter(c => c[0] !== 'connect'), [['login', project], ['fetch', 'app-api/models?type=llm', 'GET']]);
    assert.ok(calls.filter(c => c[0] === 'connect').every(c => c[1] === project));
    assert.deepEqual(errors, []);
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.capturePage()).toPNG().toString('base64'));
    await fs.writeFile(path.join(root, 'promte-forhaandsvisning.png'), Buffer.from(png, 'base64'));
    console.log(JSON.stringify({ status: 'bestået', root, calls: calls.map(c => c[0]), limitations: ['lokale Promte-adaptere', 'testside i stedet for app-biblioteket'] }, null, 2));
  } finally { await app?.close(); server?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
