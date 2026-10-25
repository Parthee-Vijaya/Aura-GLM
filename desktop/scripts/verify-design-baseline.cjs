// Real Electron UI in an isolated profile. No credentials or external AI calls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-design-baseline-')));
  const evidence = process.env.AURA_PR_EVIDENCE || root;
  await fs.mkdir(evidence, { recursive: true });
  const checks = [], errors = [];
  let app, page;
  const check = (name, value) => { assert.ok(value, name); checks.push(name); };
  const launch = async () => {
    app = await electron.launch({ executablePath: require('electron'),
      args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'profile')],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await helpers.isolateDocuments(app, path.join(root, 'documents'));
    page = await app.firstWindow(); page.setDefaultTimeout(30000);
    page.on('pageerror', error => errors.push(error.message));
    await page.waitForFunction(() => !document.querySelector('#create')?.disabled && !document.querySelector('#new')?.disabled);
  };
  try {
    await launch();
    await page.click('#path-app'); await page.click('#welcome-build');
    await page.waitForSelector('#setup:not([hidden])'); await page.click('#setup-local');
    await page.click('#features-pick');
    check('Setup offers five optional functions and no design opt-out',
      await page.locator('#setup-features-list input[data-feature]').count() === 5 &&
      await page.locator('input[data-feature="design"]').count() === 0);
    check('Setup explains the mandatory design baseline', (await page.textContent('#setup-features-pick')).includes('Design og tilgængelighed er altid med'));
    check('Zero optional choices continue with the baseline', await page.textContent('#features-continue') === 'Fortsæt med grundpakken');
    await page.screenshot({ path: path.join(evidence, 'setup-design-baseline.png') });
    await page.click('#features-continue');
    const selected = (await page.evaluate(() => window.harness.featuresGet())).value;
    check('Choosing no optional features retains design only', selected.effective.design && Object.entries(selected.effective).every(([id, enabled]) => id === 'design' || !enabled));
    const obsolete = await page.evaluate(() => window.harness.featuresSave({ scope: 'alle', values: { design: false } }));
    check('The real IPC cannot switch design off', obsolete.ok && obsolete.value.effective.design === true);
    await helpers.menuClick(page, '#features-button');
    await page.click('.features-always > summary');
    const rules = await page.locator('.features-always li').allTextContents();
    check('The always-on list includes the design method and all five existing rules', rules.length === 6 && rules.some(text => text.includes('Aura-design og din byggevejledning')));
    check('Settings has no contradictory design switch', await page.locator('#features-list input[data-feature="design"]').count() === 0);
    check('Settings fits horizontally', await page.locator('#features-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.screenshot({ path: path.join(evidence, 'always-on-design.png') });
    await page.locator('.features-always').screenshot({ path: path.join(evidence, 'always-on-design-detail.png') });
    await page.click('[data-close="features-dialog"]');
    await app.close(); app = null; await launch();
    const reloaded = (await page.evaluate(() => window.harness.featuresGet())).value;
    check('Restart retains mandatory design without enabling optional features',
      reloaded.chosen === 'valgt' && reloaded.effective.design && Object.entries(reloaded.effective).every(([id, enabled]) => id === 'design' || !enabled));
    check('No renderer errors', errors.length === 0);
    const report = { passed: true, root, checks, errors, externalModelCalls: 0 };
    await fs.writeFile(path.join(evidence, 'native.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await page?.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
    console.error(JSON.stringify({ root, checks, errors })); throw error;
  } finally {
    await app?.close();
    // Source and screenshots remain; this profile contains only this test's synthetic settings.
    await fs.rm(path.join(root, 'profile'), { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
