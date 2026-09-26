const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  if (!process.argv[2]) throw Error('Angiv mappen med det genererede prøveprojekt.');
  const project = await fs.realpath(process.argv[2]);
  const before = await fs.readFile(path.join(project, 'public/index.html'));
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-preview-review-'));
  let app;
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root,'appdata')], env: {...process.env, ELECTRON_RUN_AS_NODE:undefined} });
    const page = await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);
    await app.evaluate(({dialog}, project) => { dialog.showOpenDialog = async () => ({ canceled:false, filePaths:[project] }); }, project);
    await page.click('#open'); await page.waitForSelector('#workspace:not([hidden])');
    const frame = page.frameLocator('#preview');
    await frame.locator('h1').filter({hasText:'Mødelokaler'}).waitFor();
    const filter = frame.getByRole('spinbutton',{name:/antal pladser/i});
    await filter.fill('9999');
    const empty = await frame.locator('body').innerText(); assert.match(empty,/ingen|ikke fundet|ikke nogen/i);
    await page.screenshot({animations:'disabled',path:path.join(root,'tom-tilstand.png')});
    await filter.fill('0'); assert.notEqual(await frame.locator('body').innerText(),empty);
    await page.screenshot({animations:'disabled',path:path.join(root,'desktop.png')});
    await page.selectOption('#viewport-preset','phone');
    await page.waitForFunction(()=>document.querySelector('#viewport-info').textContent.includes('390'));
    assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({animations:'disabled',path:path.join(root,'mobil.png')});
    assert.deepEqual(await fs.readFile(path.join(project,'public/index.html')),before);
    console.log(JSON.stringify({status:'bestået',root,project,checks:['genereret app i Electron','filter med tom tilstand','nulstillet filter','mobil uden vandret overløb','ingen ændring af projektfil']}));
  } finally { await app?.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
