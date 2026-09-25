const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
(async () => {
 let key='', app;
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-openrouter-')));
 const project=path.join(root,'project');await fs.mkdir(path.join(project,'public'),{recursive:true});await fs.writeFile(path.join(project,'public/index.html'),'<h1>Start</h1>');
 try {
  if(!process.stdin.isTTY)throw new Error('Kør testen interaktivt, så nøglen kan indtastes uden ekko.');
  process.stdout.write('Indtast testnøglen (skjult): ');execFileSync('stty',['-echo'],{stdio:'inherit'});
  const input=readline.createInterface({input:process.stdin,terminal:false});key=await new Promise(resolve=>input.once('line',resolve));input.close();execFileSync('stty',['echo'],{stdio:'inherit'});process.stdout.write('\n');
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  const page=await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);await page.waitForSelector('#onboarding'); await page.waitForFunction(() => !document.querySelector('#new').disabled); await page.click('#setup-button');await page.click('#setup-local');
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');
  const result=await page.evaluate(apiKey=>window.harness.saveConnection({kind:'openrouter',name:'OpenRouter gratisprøve',baseURL:'',apiKey}),key);if(!result.ok)throw new Error(result.error);
  const connection=result.value.connections[0];assert.equal(JSON.stringify(result).includes(key),false);
  const modelID=process.env.HARNESS_LIVE_MODEL||'cohere/north-mini-code:free';assert.ok(modelID.endsWith(':free'));
  const catalog=await page.evaluate(id=>window.harness.models(id),connection.id);if(!catalog.ok)throw new Error(catalog.error);
  const model=catalog.value.find(m=>m.id===modelID);assert.ok(model?.capabilities.tools&&model.price&&Object.values(model.price).every(p=>Number(p)===0),'Modellen skal have oplyst gratispris og værktøjskald');
  const routes=await page.evaluate(value=>window.harness.routes(value),{connectionID:connection.id,modelID});if(!routes.ok)throw new Error(routes.error);
  const route=routes.value.find(r=>r.price&&r.price.prompt!=null&&r.price.completion!=null&&Object.values(r.price).every(p=>Number(p)===0));assert.ok(route,'Ingen verificeret gratis rute');
  console.log(JSON.stringify({root,model:modelID,provider:route.id,pricing:route.price,material:'Kun syntetisk startside, testbesked og fælles offentlige regler',paidFallback:false}));
  await page.click('#connections-button');await page.click('[data-close="connections-dialog"]');await page.locator('#model-options').evaluate(el => el.open = true); await page.selectOption('#connection-select',connection.id);
  await page.waitForFunction(id=>[...document.querySelector('#model-select').options].some(o=>o.value===id),modelID);await page.selectOption('#model-select',modelID);
  await page.waitForFunction(id=>[...document.querySelector('#route-select').options].some(o=>o.value===id),route.id);await page.selectOption('#route-select',route.id);
  await page.evaluate(project=>{
   window.testEvents=[];window.testPermissions=[];window.harness.onEvent(event=>{window.testEvents.push(event.type);if(event.type==='permission.asked'){const p=event.properties;const allow=p.permission==='edit'&&p.patterns.every(file=>file==='public/index.html'||file===project+'/public/index.html'||file===project.slice(1)+'/public/index.html');window.testPermissions.push({permission:p.permission,patterns:p.patterns,allow});window.harness.reply({id:p.id,allow});}});
  },project);
  await page.fill('#prompt','Dette er en afgrænset integrationstest. Læs kun public/index.html og skift h1-teksten fra Start til Gratis modeltest bestået. Brug read og edit eller write direkte. Kør ingen kommandoer, brug ikke Git, hent ingen websider, og læs ingen andre filer. Svar kort på dansk, når ændringen er gemt.');await page.click('#send');await page.waitForSelector('#data-dialog[open]');await page.click('#accept-send');
  await page.waitForFunction(()=>window.testEvents.includes('session.new'),{},{timeout:60000});
  await page.waitForFunction(()=>document.querySelector('#stop').hidden&&['Klar','Fejl'].includes(document.querySelector('#run-status').textContent),{},{timeout:180000});
  const events=await page.evaluate(()=>window.testEvents);if(events.includes('session.error')||events.includes('engine.error'))throw new Error('Eksternt modelkald fejlede: '+await page.locator('#setup-reason').textContent());
  assert.match(await fs.readFile(path.join(project,'public/index.html'),'utf8'),/Gratis modeltest bestået/);
  await page.frameLocator('#preview').locator('h1').filter({hasText:'Gratis modeltest bestået'}).waitFor();
  await page.screenshot({path:path.join(root,'gratis-model.png'),fullPage:true});
  console.log(JSON.stringify({status:'bestået',root,model:modelID,provider:route.id,evidence:'Rigtig OpenRouter-model → OpenCode → godkendt filændring → preview i Electron'}));
 } catch(error){if(app){try{const page=await app.firstWindow();console.error((await page.locator('#messages').textContent()).split(key||'\0').join('[skjult]'));console.error(JSON.stringify(await page.evaluate(()=>window.testPermissions)));await page.screenshot({path:path.join(root,'fejl.png'),fullPage:true});}catch{}}console.error(String(error.message).split(key||'\0').join('[skjult]'));process.exitCode=1;}
 finally {if(process.stdin.isTTY)try{execFileSync('stty',['echo'],{stdio:'inherit'});}catch{}; if(app){try{const page=await app.firstWindow();const state=await page.evaluate(()=>window.harness.connectionState());for(const c of state.value?.connections||[])await page.evaluate(id=>window.harness.removeConnection(id),c.id);}catch{}await app.close();}key='';}
})().catch(()=>{process.exitCode=1;});
