// Ti gemte forbindelser gennem den rigtige Electron-app. Kun lokale modelkataloger, ingen inferens.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const helpers = require('./ui-test-helpers.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-connections-'));
  const userdata = path.join(root, 'appdata'), project = path.join(root, 'Mit projekt');
  await fs.mkdir(path.join(userdata, 'harness'), { recursive: true });
  await fs.mkdir(path.join(project, 'public'), { recursive: true });
  await fs.writeFile(path.join(project, 'public/index.html'), '<h1>Bevar projektet</h1>');
  const requests = []; let fail = true;
  const server = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url });
    res.setHeader('content-type', 'application/json');
    if (req.url === '/9/v1/models' && fail) { res.writeHead(401); return res.end('{}'); }
    res.end(JSON.stringify({ data: [{ id: 'test-model', name: 'Testmodel' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connections = Array.from({ length: 10 }, (_, i) => ({ id: `connection-${i}`, kind: 'compatible', name: `Testforbindelse ${i + 1}`, baseURL: `http://127.0.0.1:${server.address().port}/${i}/v1` }));
  const initial = { version: 1, connections, projects: {} };
  await fs.writeFile(path.join(userdata, 'harness/settings.json'), JSON.stringify(initial));
  let app; const errors = [], measurements = [];
  async function launch() {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + userdata], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await app.evaluate(() => {
      const original = global.fetch;
      global.fetch = (url, options) => {
        if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(String(url))) throw new Error('Kun lokale tjenester i denne prøve.');
        return original(url, options);
      };
    });
    const page = await app.firstWindow(); page.on('pageerror', e => { errors.push(e.message); console.error('UI:', e.message); });
    await page.emulateMedia({ reducedMotion: 'reduce' }); try { await helpers.skipIntroduction(page); } catch (error) { console.error(await page.locator('#message').textContent()); throw error; }
    return page;
  }
  async function measure(page, name) {
    measurements.push({ name, ...await page.locator('#connections-dialog').evaluate(el => ({
      words: el.innerText.trim().split(/\s+/).length,
      choices: [...el.querySelectorAll('button,select,summary')].filter(e => e.checkVisibility({ checkVisibilityCSS: true })).length,
      rows: el.querySelectorAll('.saved-connection').length
    })) });
    await page.screenshot({ path: path.join(root, name + '.png') });
  }
  try {
    let page = await launch();
    await helpers.menuClick(page, '#connections-button'); await measure(page, process.argv.includes('--before') ? 'foer' : 'efter');
    if (!process.argv.includes('--before')) {
      assert.equal(await page.locator('.saved-connection').count(), 4);
      assert.equal(requests.length, 0, 'listen henter ikke modeller uden brugerens valg');
      await page.click('#connections-next'); assert.match(await page.locator('#saved-connections').innerText(), /Testforbindelse 5/);
      await page.fill('#connections-search', 'Testforbindelse 10'); assert.equal(await page.locator('.saved-connection').count(), 1);
      await page.fill('#connections-search', '');
      await page.click('#connections-check');
      await page.locator('#connections-feedback').filter({ hasText: '9 af 10' }).waitFor();
      assert.equal(requests.length, 10); assert(requests.every(r => r.method === 'GET'));
      await page.fill('#connections-search', 'Testforbindelse 10');
      assert.match(await page.locator('#saved-connections').innerText(), /Ikke forbundet/);
      await page.locator('#saved-connections button').first().click();
      assert.match(await page.locator('#connection-feedback').innerText(), /afviste/);
      fail = false; await page.click('#connection-test');
      await page.locator('#connection-feedback').filter({ hasText: /1 model/ }).waitFor();
      await page.click('#connection-back'); await page.fill('#connections-search', ''); await measure(page, 'kontrolleret');
      await page.click('[data-close="connections-dialog"]');
      await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
      await page.click('#open'); await page.waitForSelector('#workspace:not([hidden])');
      await page.fill('#prompt', 'Min kladde skal bevares.');
      await helpers.menuClick(page, '#connections-button');
      await page.fill('#connections-search', 'Testforbindelse 3'); await page.locator('#saved-connections button').first().click();
      await page.click('#connection-use'); await page.waitForSelector('#task-dialog[open]');
      assert.equal(await page.inputValue('#connection-select'), 'connection-2');
      await helpers.closeTaskOptions(page);
      await helpers.menuClick(page, '#connections-button');
      await page.click('#connections-setup'); await page.waitForSelector('#setup-choice:not([hidden])');
      await page.click('#setup-add-provider'); await page.click('#setup-back'); await page.click('#setup-back');
      await page.waitForSelector('#connections-dialog[open]'); await page.click('[data-close="connections-dialog"]');
      assert.equal(await page.inputValue('#connection-select'), 'connection-2');
      assert.equal(await page.inputValue('#prompt'), 'Min kladde skal bevares.');
      assert.equal(await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), '<h1>Bevar projektet</h1>');
      assert.deepEqual(JSON.parse(await fs.readFile(path.join(userdata, 'harness/settings.json'))).connections, initial.connections);
      await app.close(); page = await launch(); await helpers.menuClick(page, '#connections-button');
      assert.doesNotMatch(await page.locator('#saved-connections').innerText(), /Forbundet ·/);
      assert.equal((await page.evaluate(() => window.harness.connectionState())).value.connections.length, 10);
      assert(requests.every(r => r.method === 'GET'), 'ingen modelopgave sendes'); assert.deepEqual(errors, []);
    }
    await fs.writeFile(path.join(root, 'maalinger.json'), JSON.stringify(measurements, null, 2));
    console.log(JSON.stringify({ status: 'bestået', root, measurements, catalogRequests: requests.length }));
  } finally { await app?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
