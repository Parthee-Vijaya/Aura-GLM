const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'harness-preferences-ui-')); let app;
 async function launch() {
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  const page=await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page); await page.waitForFunction(()=>!document.querySelector('#create').disabled && !document.querySelector('#new').disabled && !document.querySelector('#startup-summary').textContent.includes('Indlæser'));
  await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},root);
  return page;
 }
 try {
  let page=await launch(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const connection=(await page.evaluate(()=>window.harness.saveConnection({kind:'compatible',name:'Egen testserver',baseURL:'http://127.0.0.1:1/v1'}))).value.connections[0];
  await page.evaluate(()=>window.harness.saveDesign({name:'Testdesign',color:'#123456',links:['https://design.gentofte.dk/']}));
  await page.reload(); await page.waitForFunction(()=>!document.querySelector('#create').disabled && document.querySelector('#design-select').options.length===2);
  await app.evaluate(()=>{ global.preferenceTestRequests=0; global.fetch=async()=>{ ++global.preferenceTestRequests; throw Error('Ingen netværkskald forventet'); }; });
  await page.fill('#name','Første projekt'); await page.fill('#purpose','Et projekt med huskede valg');
  await page.click('.startup-summary > summary'); await page.click('#startup-customize'); await page.selectOption('#startup-hosting','vercel'); await page.selectOption('#startup-connection',connection.id);
  await page.click('#design-options > summary'); await page.selectOption('#design-select',{label:'Testdesign · 0 filer'}); await page.waitForFunction(()=>document.querySelector('#color').value==='#123456');
  await page.locator('#onboarding .advanced > summary').click(); await page.selectOption('#tests','automatiske');
  await page.check('#remember-startup'); await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
  const first=(await page.evaluate(()=>window.harness.connectionState())).value.projectSettings.startup;
  assert.equal(first.hosting,'vercel'); assert.equal(first.tests,'automatiske');
  assert.equal(await page.inputValue('#connection-select'),connection.id);
  assert.equal(await app.evaluate(()=>global.preferenceTestRequests),0);
  assert.equal(await page.locator('#reference-choices input:checked').count(),0);
  await app.close(); page=await launch();
  assert.equal(await page.inputValue('#startup-hosting'),'vercel'); assert.equal(await page.isChecked('#remember-startup'),false);
  assert.match(await page.locator('#startup-summary').textContent(),/Vercel/);
  assert.equal(await page.inputValue('#color'),'#123456'); assert.equal(await page.inputValue('#links'),'https://design.gentofte.dk/');
  await page.screenshot({path:path.join(root,'huskede-valg.png')});
  if(!await page.locator('.startup-summary').evaluate(el=>el.open))await page.click('.startup-summary > summary'); await page.click('#startup-skip'); assert.equal(await page.inputValue('#links'),''); assert.equal(await page.inputValue('#startup-connection'),''); assert.equal(await page.inputValue('#startup-hosting'),'');
  assert.equal((await page.evaluate(()=>window.harness.preferencesGet())).value.values.hosting,'vercel');
  await page.fill('#name','Andet projekt'); await page.fill('#purpose','Beslut senere'); await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
  assert.equal((await page.evaluate(()=>window.harness.connectionState())).value.projectSettings.startup.hosting,'');
  await page.click('#new'); await page.waitForFunction(()=>document.querySelector('#startup-hosting').value==='vercel');
  await page.click('#forget-startup'); await page.locator('#startup-warning').filter({hasText:'glemt'}).waitFor();
  assert.equal(await page.inputValue('#startup-hosting'),'vercel');
  assert.equal((await page.evaluate(()=>window.harness.preferencesGet())).value.values.hosting,'');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'bestået',root,checks:['gem ved oprettelse','genstart med huskede valg','beslut senere uden ændrede standarder','nye projekter har egne valg','glem uden ændring af kladde']}));
 } finally { await app?.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
