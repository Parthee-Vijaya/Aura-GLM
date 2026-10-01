const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
(async () => {
  const oldBundle=path.resolve(process.argv[2]||''), newBundle=path.resolve(process.argv[3]||'');
  if(process.platform!=='darwin'||!oldBundle.endsWith('.app')||!newBundle.endsWith('.app')||oldBundle===newBundle)throw new Error('Angiv to forskellige Mac-apps: tidligere version og ny version.');
  await fs.access(oldBundle);await fs.access(newBundle);
  // Hver app lægges under sit eget navn i Programmer, ligesom når brugeren trækker den nye version derind. Fra AI Harness til Aura skifter navnet.
  const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-upgrade-'))), programs=path.join(root,'Programmer'), data=path.join(root,'appdata');
  let installed=path.join(programs,path.basename(oldBundle));
  await fs.mkdir(programs);
  let app,page,requests=0;
  const key='SYNTHETISK_TESTNOEGLE_KUN_LOKALT';
  const server=http.createServer((req,res)=>{requests++;assert.equal(req.headers.authorization,'Bearer '+key);res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'opdateringsproeve'}]}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  async function launch(){app=await electron.launch({executablePath:path.join(installed,'Contents/MacOS',path.basename(installed,'.app')),args:['--user-data-dir='+data],env:{...process.env,PATH:'/usr/bin:/bin:/usr/sbin:/sbin',ELECTRON_RUN_AS_NODE:undefined}});await require('./ui-test-helpers.cjs').isolateDocuments(app,path.join(root,'Dokumenter'));page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForFunction(()=>!document.querySelector('#create').disabled);if(await page.locator('#welcome-dialog').count()&&await page.locator('#welcome-dialog').evaluate(el=>el.open))await page.click('#welcome-skip');}
  try{
    await fs.cp(oldBundle,installed,{recursive:true,verbatimSymlinks:true});await launch();
    const oldVersion=await app.evaluate(({app})=>app.getVersion());
    console.log('Tidligere version startet: '+oldVersion);
    await app.evaluate(({dialog},root)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[root]});},root);
    await page.fill('#name','Bevaret projekt');await page.fill('#purpose','Syntetisk prøve af opdatering');await page.click('#create');await page.waitForSelector('#workspace:not([hidden])');
    const project=await page.locator('#project-path').textContent();const original=await fs.readFile(path.join(project,'public/index.html'));
    const connection=await page.evaluate(value=>window.harness.saveConnection(value),{kind:'compatible',name:'Bevaret forbindelse',baseURL:`http://127.0.0.1:${server.address().port}/v1`,apiKey:key});assert.equal(connection.ok,true);assert.equal(JSON.stringify(connection).includes(key),false);
    const id=connection.value.connections[0].id;
    const catalog=await page.evaluate(id=>window.harness.models(id),id);assert.equal(catalog.ok,true);assert.equal(requests,1);
    const designSupported=await page.evaluate(()=>typeof window.harness.saveDesign==='function');
    if(designSupported){const saved=await page.evaluate(()=>window.harness.saveDesign({name:'Bevaret design',color:'#0052cc',links:['https://design.gentofte.dk/']}));assert.equal(saved.ok,true);}
    const draftSupported=await page.evaluate(()=>typeof window.harness.saveDraft==='function');
    if(draftSupported){
      await page.fill('#prompt','Bevar kladden gennem opdatering');
      await page.waitForFunction(async()=>{const result=await window.harness.connectionState();return result.ok&&result.value.workspace?.draft==='Bevar kladden gennem opdatering';});
    }
    console.log('Projekt, forbindelse og design er gemt. Udskifter testappen.');
    await app.close();app=null;
    await fs.rm(installed,{recursive:true});installed=path.join(programs,path.basename(newBundle));await fs.cp(newBundle,installed,{recursive:true,verbatimSymlinks:true});await launch();
    const newVersion=await app.evaluate(({app})=>app.getVersion());assert.notEqual(newVersion,oldVersion);
    console.log('Ny version startet: '+newVersion);
    assert.equal(requests,1,'Opdatering må ikke selv sende til den gemte forbindelse');
    const state=await page.evaluate(()=>window.harness.connectionState());assert.ok(state.value.connections.some(c=>c.id===id));assert.equal(JSON.stringify(state).includes(key),false);
    const after=await page.evaluate(id=>window.harness.models(id),id);assert.equal(after.ok,true,'Den samme signerede app skal kunne bruge den gemte syntetiske nøgle');assert.equal(requests,2);
    assert.deepEqual(await fs.readFile(path.join(project,'public/index.html')),original);
    await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');await page.frameLocator('#preview').getByRole('heading',{name:'Bevaret projekt'}).waitFor();
    if(draftSupported)assert.equal(await page.inputValue('#prompt'),'Bevar kladden gennem opdatering');
    if(designSupported){const designs=await page.evaluate(()=>window.harness.listDesigns());assert.ok(designs.value.some(d=>d.name==='Bevaret design'));}
    await page.screenshot({path:path.join(root,'opdateret.png'),animations:'disabled'});
    console.log(JSON.stringify({status:'bestået',root,oldVersion,newVersion,checks:['udskiftning af app samme sted','uændrede projektfiler','forbindelse og krypteret testnøgle bevaret','ingen automatisk modelsendelse',...(designSupported?['designpakke bevaret']:[]),...(draftSupported?['kladde bevaret']:[])],limitation:'Mac på udviklingsmaskinen med isoleret brugerdata. Windows-installation og separat maskine kræver egen prøve.'}));
  }catch(error){await page?.screenshot({path:path.join(root,'fejl.png'),timeout:3000}).catch(()=>{});console.error('Testmateriale: '+root);throw error;}
  finally{await app?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
