// SPDX-License-Identifier: EUPL-1.2
// Actual Electron app and real local store, with two key-free synthetic
// connections. No model/server request or existing user profile is used.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');
(async () => {
  const reportRoot = process.argv[2] || path.join(os.homedir(), 'Library/Application Support/Aura1/ReleaseReports/feedback-20261026/connections');
  await fs.mkdir(reportRoot, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(reportRoot, 'synthetic-profile-'))), userData = path.join(root, 'appdata'), project = path.join(root, 'project');
  await fs.mkdir(path.join(userData, 'harness'), { recursive: true }); await fs.mkdir(path.join(project, 'public'), { recursive: true });
  const original = '<h1>Bevar den syntetiske projektfil</h1>'; await fs.writeFile(path.join(project, 'public/index.html'), original);
  await fs.writeFile(path.join(userData, 'harness/settings.json'), JSON.stringify({ version: 1, connections: [{ id: 'one', kind: 'compatible', name: 'Prøveforbindelse ét', baseURL: 'http://127.0.0.1:1/v1' }, { id: 'two', kind: 'compatible', name: 'Prøveforbindelse to', baseURL: 'http://127.0.0.1:2/v1' }], projects: {} }));
  let app, page; const checks = [], errors = [];
  const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push({ name, passed: true }); };
  const count = async () => (await page.evaluate(() => window.harness.connectionState())).value.connections.length;
  const backdrop = async selector => { const box = await page.locator(selector).boundingBox(); await page.mouse.click(Math.max(1, box.x - 15), Math.max(1, box.y - 15)); };
  const confirm = '#connection-removal-dialog';
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + userData], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ app, session }) => {
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
      global.fetch = async () => { throw Error('Connection confirmation test forbids network requests.'); };
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const { Workbench } = require('./core/workbench.cjs'), previous = Workbench.prototype.removeConnection;
      globalThis.feedbackRemovalCalls = [];
      Workbench.prototype.removeConnection = async function(id) { globalThis.feedbackRemovalCalls.push(id); return previous.call(this, id); };
    });
    await helpers.forbidGitWrites(app); await helpers.skipIntroduction(page); await helpers.openExistingProject(app, page, project);
    await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().startsWith('harness://')); window.unmaximize(); window.setContentSize(1280, 800); });
    await page.waitForFunction(() => innerWidth === 1280);
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.fill('#prompt', 'Min kladde skal bevares.');
    await helpers.menuClick(page, '#connections-button'); await page.locator('#saved-connections button').first().click();
    await page.click('#connection-remove'); await page.locator(confirm + '[open]').waitFor();
    check('initial click does not delete', await count(), 2);
    check('Cancel has native keyboard focus', await page.locator(confirm + ' [data-action="cancel"]').evaluate(element => element === document.activeElement), true);
    await page.screenshot({ path: path.join(reportRoot, '01-confirmation.png') });
    await page.keyboard.press('Enter'); await page.locator(confirm).waitFor({ state: 'detached' }); check('default Enter cancels', await count(), 2);
    await page.click('#connection-remove'); await page.keyboard.press('Escape'); await page.locator(confirm).waitFor({ state: 'detached' }); check('Escape cancels', await count(), 2);
    await page.click('#connection-remove'); await backdrop(confirm); await page.locator(confirm).waitFor({ state: 'detached' }); check('outside click cancels', await count(), 2);
    await page.click('#connection-remove'); await page.locator(confirm + ' [data-action="cancel"]').click(); check('Cancel button preserves connection', await count(), 2);
    await page.fill('#connection-name', 'Usaved draft name'); await backdrop('#connections-dialog');
    check('connection editor ignores outside click', await page.locator('#connections-dialog').evaluate(element => element.open), true);
    check('connection draft survives outside click', await page.inputValue('#connection-name'), 'Usaved draft name');
    await page.click('#connection-remove'); await page.evaluate(() => { editingConnection = 'two'; });
    await page.locator(confirm + ' [data-action="confirm"]').click(); check('changed selection cannot remove either connection', await count(), 2);
    check('changed selection disables confirmation', await page.locator(confirm + ' [data-action="confirm"]').isDisabled(), true);
    await page.screenshot({ path: path.join(reportRoot, '02-stale-selection.png') });
    await page.locator(confirm + ' [data-action="cancel"]').click(); await page.evaluate(() => { editingConnection = 'one'; });
    await page.click('#connection-remove');
    await page.evaluate(() => { const button = document.querySelector('#connection-removal-dialog [data-action="confirm"]'); button.click(); button.click(); });
    await page.locator(confirm).waitFor({ state: 'detached' });
    check('confirmed removal removes exactly one connection', await count(), 1);
    check('double-click reaches the backend once for the captured id', await app.evaluate(() => globalThis.feedbackRemovalCalls), ['one']);
    const state = await page.evaluate(() => window.harness.connectionState()); check('other connection is preserved', state.value.connections[0].id, 'two');
    await page.screenshot({ path: path.join(reportRoot, '03-removed.png') });
    await page.click('[data-close="connections-dialog"]'); check('chat draft survives removal', await page.inputValue('#prompt'), 'Min kladde skal bevares.');
    check('project file survives removal', await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), original);
    await helpers.menuClick(page, '#support-button'); await backdrop('#support-dialog');
    check('informational support dialog dismisses outside', await page.locator('#support-dialog').evaluate(element => element.open), false);
    check('no renderer errors', errors, []); await helpers.assertNoGitWrites(app);
    await fs.writeFile(path.join(reportRoot, 'native-results.json'), JSON.stringify({ passed: true, platform: process.platform, arch: process.arch, checks, errors, root, limitations: ['Synthetic connections contain no key.', 'No real provider or AI was contacted.', 'Windows native UI remains untested.'] }, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, checks: checks.length, reportRoot }));
  } finally { if (app) await app.close(); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
