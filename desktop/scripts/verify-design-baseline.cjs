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
    await page.waitForSelector('#setup:not([hidden])');
    // Første guidede start viser profil-trinnet; Fortsæt fører til valget af adgang.
    await helpers.continuePastProfileStep(page);
    await page.click('#setup-local');
    // Onboarding spørger ikke om funktioner: grundpakken med designhjælpen gælder fra starten.
    await page.waitForSelector('#create-form');
    check('First run asks for neither optional features nor a design opt-out',
      await page.locator('input[data-feature="design"]').count() === 0 &&
      await page.locator('[data-phase="features"]').count() === 0);
    const selected = (await page.evaluate(() => window.harness.featuresGet())).value;
    check('The fresh base package retains design only', selected.chosen === '' && selected.effective.design && Object.entries(selected.effective).every(([id, enabled]) => id === 'design' || !enabled));
    await page.screenshot({ path: path.join(evidence, 'setup-design-baseline.png') });
    const obsolete = await page.evaluate(() => window.harness.featuresSave({ scope: 'alle', values: { design: false } }));
    check('The real IPC cannot switch design off', obsolete.ok && obsolete.value.effective.design === true);
    // Fuldvinduesfladen: idéfladen viser intet panel — prøven opretter først
    // en idé, så panelets indgange er tilbage.
    await page.fill('#name', 'Designprøve'); await page.fill('#purpose', 'Holder designgrundlagets prøver adskilt.');
    await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
    await helpers.menuClick(page, '#features-button');
    await page.click('.features-always > summary');
    const rules = await page.locator('.features-always li').allTextContents();
    check('The always-on list includes the design method and all five existing rules', rules.length === 6 && rules.some(text => text.includes('Aura-design og din byggevejledning')));
    check('Settings has no contradictory design switch', await page.locator('#features-list input[data-feature="design"]').count() === 0);
    check('Settings fits horizontally', await page.locator('#features-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    check('The panel shows the lean base package for the new user',
      await page.evaluate(() => [...document.querySelectorAll('#features-list input[data-feature]')].every(input => !input.checked)));
    await page.screenshot({ path: path.join(evidence, 'always-on-design.png') });
    await page.locator('.features-always').screenshot({ path: path.join(evidence, 'always-on-design-detail.png') });
    await page.click('[data-close="features-dialog"]');
    await app.close(); app = null; await launch();
    const reloaded = (await page.evaluate(() => window.harness.featuresGet())).value;
    check('Restart retains the lean base package and mandatory design',
      reloaded.chosen === '' && reloaded.effective.design && Object.entries(reloaded.effective).every(([id, enabled]) => id === 'design' || !enabled));
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
