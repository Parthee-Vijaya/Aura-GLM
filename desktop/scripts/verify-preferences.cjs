// Projektopstartens Flere valg: én flad liste, præudfyldt fra profilens projektstandarder
// og standard-AI. Projektets egne valg gælder projektet alene — profilen er et fast valg,
// der kun ændres eksplicit i Indstillinger eller gennem Brug som standard i modelvælgeren.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const helpers = require('./ui-test-helpers.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'harness-preferences-ui-')); let app;
  async function launch() {
    app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
    await helpers.isolateDocuments(app,path.join(root,'Dokumenter'));
    const page=await app.firstWindow(); await helpers.skipIntroduction(page); await helpers.toOnboarding(page); await page.waitForFunction(()=>!document.querySelector('#create').disabled && !document.querySelector('#new').disabled);
    return page;
  }
  const profile = async page => (await page.evaluate(()=>window.harness.profileGet())).value.profile;
  try {
    let page=await launch(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    // Udgivelsesønsket hører til Udgivelse, som ikke er med i den anbefalede pakke.
    await helpers.enableSharing(page);
    const connection=(await page.evaluate(()=>window.harness.saveConnection({kind:'compatible',name:'Egen testserver',baseURL:'http://127.0.0.1:1/v1'}))).value.connections[0];
    await page.evaluate(()=>window.harness.saveDesign({name:'Testdesign',color:'#123456',links:['https://design.gentofte.dk/']}));
    const design=(await page.evaluate(()=>window.harness.listDesigns())).value.find(item=>item.name==='Testdesign');
    // Standarderne er et eksplicit profilvalg — ikke et sidespring fra projektoprettelsen.
    await page.evaluate(values=>window.harness.profileSave(values),{ projectDefaults:{hosting:'vercel',designID:design.id,tests:'automatiske'}, standardAI:{connectionID:connection.id,modelID:''} });
    await page.reload(); await helpers.skipIntroduction(page); await helpers.toOnboarding(page);
    await page.waitForFunction(()=>!document.querySelector('#create').disabled && document.querySelector('#design-select').options.length===2);
    await app.evaluate(()=>{ global.preferenceTestRequests=0; global.fetch=async()=>{ ++global.preferenceTestRequests; throw Error('Ingen netværkskald forventet'); }; });
    // Flere valg er én flad liste, præudfyldt fra profilen, uden afkrydsning og uden tilbage-skrivningslinje.
    await helpers.projectOptions(page);
    assert.equal(await page.locator('#project-options details').count(),1);
    assert.equal(await page.locator('#remember-startup').count(),0,'ingen afkrydsning for at huske');
    assert.equal(await page.locator('#forget-startup').count(),0,'Glem dem findes kun i Indstillinger');
    assert.equal(await page.locator('#remember-info').count(),0,'tilbage-skrivningslinjen er fjernet');
    assert.equal(await page.inputValue('#startup-connection'),connection.id,'standard-AI’ets forbindelse forvælges');
    assert.equal(await page.inputValue('#startup-hosting'),'vercel');
    assert.equal(await page.inputValue('#tests'),'automatiske');
    assert.equal(await page.inputValue('#design-select'),design.id);
    await page.waitForFunction(()=>document.querySelector('#color').value==='#123456');
    assert.equal(await page.inputValue('#links'),'https://design.gentofte.dk/');
    assert.match(await page.textContent('#project-options-summary'),/Egen testserver · Vercel · Testdesign/);
    await page.screenshot({path:path.join(root,'forudfyldte-valg.png')});
    // Projektets egne valg gælder projektet alene.
    await page.fill('#name','Første projekt'); await page.fill('#purpose','Et projekt med egne valg');
    await page.selectOption('#startup-hosting','azure'); await page.selectOption('#tests','manuel');
    await page.selectOption('#design-select',''); await page.waitForFunction(()=>document.querySelector('#links').value==='');
    await page.click('#create'); await page.waitForSelector('#workspace:not([hidden])');
    const first=(await page.evaluate(()=>window.harness.connectionState())).value.projectSettings.startup;
    assert.equal(first.hosting,'azure'); assert.equal(first.tests,'manuel');
    assert.equal(await app.evaluate(()=>global.preferenceTestRequests),0);
    // Profilen er uændret: projektoprettelsen skriver aldrig tilbage.
    const after=await profile(page);
    assert.deepEqual([after.projectDefaults.hosting,after.projectDefaults.tests,after.projectDefaults.designID],['vercel','automatiske',design.id],'projektstandarderne består');
    assert.equal(after.standardAI.connectionID,connection.id,'standard-AI består');
    // Næste projekt præudfyldes stadig fra profilen — ikke fra det seneste projekts valg.
    await page.click('#new'); await page.waitForFunction(()=>!document.querySelector('#create').disabled);
    await helpers.projectOptions(page);
    assert.equal(await page.inputValue('#startup-hosting'),'vercel','profilen er udgangspunktet igen');
    assert.equal(await page.inputValue('#tests'),'automatiske');
    assert.equal(await page.inputValue('#startup-connection'),connection.id);
    assert.equal(await page.inputValue('#design-select'),design.id);
    await page.screenshot({path:path.join(root,'profilen-bestaar.png')});
    // En fjernet standardforbindelse rydder standard-AI'et i samme atomare
    // skrivning: forudvalgtelsen er tom, og profilen fortæller det selv.
    await page.evaluate(id=>window.harness.removeConnection(id),connection.id);
    await page.reload(); await helpers.skipIntroduction(page); await helpers.toOnboarding(page);
    await page.waitForFunction(()=>!document.querySelector('#create').disabled);
    await helpers.projectOptions(page);
    assert.equal(await page.inputValue('#startup-connection'),'','en fjernet forbindelse forvælges aldrig');
    const cleared=await profile(page);
    assert.equal(cleared.standardAI.connectionID,'','profilens standard-AI er ryddet sammen med forbindelsen');
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'bestået',root,checks:['Flere valg er én flad liste præudfyldt fra profilens projektstandarder og standard-AI','ingen afkrydsning og ingen tilbage-skrivningslinje i projektopstarten','projektets egne valg gælder projektet alene','profilen er uændret efter projektoprettelsen','næste projekt præudfyldes stadig fra profilen','fjernet standardforbindelse rydder standard-AI og giver tom forudvalgtelse','ingen netværkskald']}));
  } finally { await app?.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
