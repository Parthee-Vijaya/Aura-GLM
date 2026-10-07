// Demoens første forløb uden konto: rigtig Electron og faktiske filer, ingen ekstern AI.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');
const { auditUI } = require('./ui-audit.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-demo-')));
  const observe = process.argv.includes('--observe');
  const bundle = process.env.HARNESS_TEST_PACKAGE && path.resolve(process.env.HARNESS_TEST_PACKAGE);
  const executablePath = bundle ? (bundle.endsWith('.app') ? path.join(bundle, 'Contents/MacOS', path.basename(bundle, '.app')) : bundle) : require('electron');
  let app, page; const errors = [], checks = [], findings = [], screens = [];
  function check(value, title) { checks.push({ title, passed: Boolean(value) }); if (!value) findings.push(title); }
  async function snapshot(name, selector) {
    await page.waitForTimeout(250); // Lad den faktiske dialogovergang og vindueslayout afslutte før billedet.
    const audit = await page.evaluate(auditUI, selector);
    const image = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.capturePage()).toPNG().toString('base64'));
    const file = path.join(root, name + '.png'); await fs.writeFile(file, Buffer.from(image, 'base64'));
    screens.push({ name, file, audit });
    check(!audit.unnamed.length, `${name}: alle synlige felter og kontroller har navne`);
    check(audit.dialogs.every(d => d.name && d.visibleLabel), `${name}: dialogen bruger sin synlige overskrift`);
    check(!audit.duplicateIDs.length && !audit.horizontalOverflow, `${name}: ingen dublerede ID'er eller vandret overløb`);
  }
  try {
    app = await electron.launch({ executablePath, args: [...(bundle ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await helpers.isolateDocuments(app, path.join(root, 'Dokumenter'));
    page = await app.firstWindow(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(e.message));
    await page.waitForFunction(() => !document.querySelector('#welcome-build').disabled);
    await app.evaluate(() => { global.demoExternalRequests = 0; global.fetch = async url => { if (String(url) === 'http://127.0.0.1:11434/api/tags') return new Response(JSON.stringify({ models: [] })); global.demoExternalRequests++; throw Error('Demo-prøven tillader ingen ekstern forbindelse'); }; });
    await snapshot('velkomst', '#welcome-dialog');
    await page.click('#path-app'); await snapshot('start', '#welcome-dialog');
    await page.click('#welcome-example'); await page.frameLocator('#demo-preview').locator('h1').waitFor();
    await snapshot('eksempel', '#welcome-dialog');
    await page.click('#demo-back'); await page.click('#welcome-skip');
    await page.fill('#purpose', 'En oversigt over tre opdigtede aktiviteter på biblioteket.');
    await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
    await page.locator('#draft-status').filter({ hasText: /gemt|hentet/ }).waitFor();
    const draft = await page.inputValue('#prompt');
    await snapshot('uden-ai', '#workspace');
    await page.click('#model-chip');
    const guided = await page.isVisible('#setup');
    check(guided && !await page.locator('#task-dialog').evaluate(el => el.open), 'Uden AI går Vælg AI direkte til forbindelsesguiden');
    await snapshot('tilslut-ai', guided ? '#setup' : '#task-dialog');
    if (guided) await page.click('#setup-local'); else await page.click('[data-close="task-dialog"]');
    check(await page.inputValue('#prompt') === draft, 'Vælg senere bevarer beskedkladden');
    await page.click('#send');
    check(await page.isVisible('#setup') && !await page.locator('#task-dialog').evaluate(el => el.open), 'Send uden AI viser en vej videre i første lag');
    if (await page.isVisible('#setup')) await page.click('#setup-local'); else await page.click('[data-close="task-dialog"]');
    await helpers.menuClick(page, '#features-button'); await snapshot('funktioner', '#features-dialog');
    const switches = page.locator('#features-list input[role=switch]');
    const first = switches.first(); const old = await first.isChecked(); await first.focus(); await page.keyboard.press('Space');
    await page.locator('#features-feedback').filter({ hasText: 'Gemt' }).waitFor();
    check(await first.isChecked() !== old, 'Funktioner kan ændres med tastatur');
    await page.keyboard.press('Space'); await page.keyboard.press('Escape');
    await helpers.menuClick(page, '#git-button'); await snapshot('versioner', '#panel-changes');
    await page.click('#tab-preview');
    await helpers.menuClick(page, '#support-button'); await snapshot('hjaelp', '#support-dialog');
    check(await page.locator('#support-version').textContent().then(text => /Aura \d+\.\d+/.test(text)), 'Feedback viser appens faktiske version');
    const report = JSON.parse(await page.locator('#support-report').textContent());
    check(!JSON.stringify(report).includes(root) && !JSON.stringify(report).includes(draft), 'Fejlrapporten medtager ikke projektsti eller kladde');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    check(await page.evaluate(() => document.activeElement.id) === 'settings-toggle', 'Escape fra Hjælp giver fokus tilbage til den synlige menuåbner');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).setSize(980, 720));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.setZoomFactor(1.5));
    await page.waitForFunction(() => innerWidth < 700);
    await snapshot('arbejde-980-150', '#workspace');
    const sendVisible = await page.locator('#send').evaluate(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom <= innerHeight && r.right <= innerWidth && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; });
    check(sendVisible, 'Send kan ses og rammes ved 980 × 720 og 150 % zoom');
    await helpers.menuClick(page, '#support-button'); await snapshot('hjaelp-980-150', '#support-dialog'); await page.keyboard.press('Escape');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.setZoomFactor(1));
    await page.fill('#prompt', 'Min kladde skal overleve lukning lige efter indtastning.');
    check(await app.evaluate(() => global.demoExternalRequests) === 0, 'Ingen ekstern AI, upload eller konto bruges');
    await app.close(); app = null;
    app = await electron.launch({ executablePath, args: [...(bundle ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#workspace:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#prompt').value.includes('lige efter indtastning'));
    check(await page.inputValue('#prompt') === 'Min kladde skal overleve lukning lige efter indtastning.', 'Genstart genåbner samme projekt og den sidste kladde');
    check(errors.length === 0, 'Ingen sidefejl');
    const result = { status: findings.length ? 'fund' : 'bestået', root, packaged: Boolean(bundle), checks, findings, screens, errors, limitation: 'Ingen rigtig model, ekstern udgivelse, ren testcomputer eller brugerobservation.' };
    await fs.writeFile(path.join(root, 'rapport.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
    if (!observe) assert.deepEqual(findings, [], 'Demoens konkrete forløb skal bestå');
  } finally { await app?.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
