// Rigtigt browserlogin og modelkald. Starter aldrig som del af npm test eller CI.
// Uden --live læses kun den offentlige loginopsætning. Ingen tokens eller nøgler i argumenter.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');
const { API, ISSUER, json } = require('../core/komplai.cjs');
const flag = name => { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; };
async function main() {
  const config = await json(`${API}/config`);
  assert.equal(config.issuer, ISSUER); assert(config.clientId);
  if (!process.argv.includes('--live')) { console.log('Komplais loginopsætning svarer. Ingen login eller modelkald er foretaget.'); return; }
  const organisationId = flag('--organisation'), modelId = flag('--model');
  if (!organisationId || !modelId) throw new Error('Angiv --organisation med Komplais organisations-id og --model med den aftalte model. Ingen adgangsnøgler.');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-komplai-live-'));
  const project = path.join(root, 'Syntetisk prøve'), file = path.join(project, 'public/index.html');
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, '<!doctype html><html lang="da"><title>Prøve</title><h1>Start</h1></html>');
  const report = { status: 'ikke afsluttet', organisationId, modelId, maximumDkk: 10, revoked: false };
  let app, page, connectionId;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    await app.evaluate((_, options) => {
      const { KomplaiLiveBudget, budgetedFetch } = process.getBuiltinModule('module').createRequire(options.module)(options.module);
      const budget = new KomplaiLiveBudget(options);
      globalThis.komplaiLiveBudget = budget;
      globalThis.fetch = budgetedFetch(globalThis.fetch, budget);
    }, { organisationId, modelId, module: path.join(__dirname, 'komplai-live-budget.cjs') });
    page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await helpers.skipIntroduction(page); await helpers.openSetup(page);
    await page.click('#setup-add-provider'); await page.click('#provider-cards [data-kind="komplai"]');
    console.log('Log ind i den browser, Aura åbner. Prøven bruger kun den valgte organisation og højst 10 kr.');
    await page.click('#komplai-login'); await page.waitForSelector('#komplai-organisations:not([hidden])', { timeout: 300000 });
    if (await page.locator('#komplai-organisation').isVisible()) await page.selectOption('#komplai-organisation', organisationId);
    else assert.equal(await page.inputValue('#komplai-organisation'), organisationId, 'Login gav ikke den aftalte testorganisation.');
    // Denne prøve gælder AI. Publish-login og udgivelse afprøves særskilt.
    if (await page.locator('#komplai-publish-also').isVisible()) await page.uncheck('#komplai-publish-also');
    await page.click('#komplai-confirm'); await page.waitForSelector('#setup-continue:not([disabled])', { timeout: 60000 });
    const state = (await page.evaluate(() => window.harness.connectionState())).value;
    const connection = state.connections.find(c => c.kind === 'komplai' && c.account.organisationId === organisationId);
    assert(connection); connectionId = connection.id;
    await page.click('#setup-continue');
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, project);
    await page.click('#open'); await page.waitForFunction(id => [...document.querySelector('#model-select').options].some(o => o.value === id), modelId);
    await helpers.taskOptions(page); await page.locator('#model-catalog').evaluate(el => el.open = true);
    await page.selectOption('#model-select', modelId); await page.click('#model-done'); await helpers.selectMode(page, 'free');
    for (const heading of ['Bygget gennem Komplai', 'Rettet gennem Komplai']) {
      await page.fill('#prompt', `Dette er en afgrænset prøve med opdigtede data. Læs public/index.html og ret kun h1-teksten til ${heading}. Brug read, edit eller write. Ingen Git, kommandoer, netopslag, pakker eller andre filer. Svar kort på dansk.`);
      await page.click('#send');
      await page.waitForFunction(() => document.querySelector('#data-dialog').open || !document.querySelector('#stop').hidden);
      if (await page.locator('#data-dialog').evaluate(el => el.open)) await page.click('#accept-send');
      await page.waitForFunction(() => !document.querySelector('#stop').hidden);
      const deadline = Date.now() + 300000;
      while (await page.locator('#stop').isVisible()) {
        if (Date.now() > deadline) { await page.click('#stop'); throw new Error('Modelprøven nåede sin stopgrænse.'); }
        for (const box of await page.locator('#approvals .approval').all()) {
          const target = await box.locator('.action-target').textContent().catch(() => '');
          const once = box.getByRole('button', { name: 'Kun denne fil', exact: true });
          if (target === 'public/index.html' && await once.count()) await once.click();
          else { await box.getByRole('button', { name: 'Afvis', exact: true }).click(); throw new Error('Modellen bad om en handling uden for den aftalte prøve.'); }
        }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      assert((await fs.readFile(file, 'utf8')).includes(heading), 'Den aftalte filændring blev ikke gennemført.');
      await page.frameLocator('#preview').locator('h1').filter({ hasText: heading }).waitFor();
    }
    report.usageShown = await page.locator('#usage-status').innerText();
    await page.screenshot({ path: path.join(root, 'preview.png') });
    report.status = 'bestået';
  } finally {
    if (page) {
      await page.evaluate(() => window.harness.stop()).catch(() => {});
      // Find også en adgang, der blev oprettet før en senere opsætningsfejl.
      if (!connectionId) connectionId = await page.evaluate(() => window.harness.connectionState()).then(r => r.value?.connections.find(c => c.kind === 'komplai')?.id).catch(() => null);
      if (connectionId) { const result = await page.evaluate(id => window.harness.removeConnection(id), connectionId).catch(() => null); report.revoked = result?.ok === true; }
      report.budget = await app.evaluate(() => globalThis.komplaiLiveBudget.summary()).catch(() => null);
    }
    await app?.close().catch(() => {});
    // Bevar det krypterede lager ved mislykket tilbagekaldelse, så adgangen kan tilbagekaldes senere.
    if (!connectionId || report.revoked) await fs.rm(path.join(root, 'appdata'), { recursive: true, force: true });
    if (connectionId && !report.revoked) report.status = 'tilbagekaldelse mangler';
    await fs.writeFile(path.join(root, 'rapport.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ ...report, root }));
  }
  if (report.status !== 'bestået') throw new Error('Prøven er ikke afsluttet. Se rapporten; ingen automatisk gentagelse.');
}
main().catch(error => { console.error(error.message.split('\n')[0]); process.exitCode = 1; });
