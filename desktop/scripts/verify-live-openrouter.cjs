const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
(async () => {
 let key='', app;
 const firstApp = process.env.HARNESS_LIVE_SCENARIO === 'first-app';
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-openrouter-')));
 const project=path.join(root,'project');await fs.mkdir(path.join(project,'public'),{recursive:true});await fs.writeFile(path.join(project,'public/index.html'),'<h1>Start</h1>');
 try {
  if(!process.stdin.isTTY)throw new Error('Kør testen interaktivt, så nøglen kan indtastes uden ekko.');
  process.stdout.write('Indtast testnøglen (skjult): ');execFileSync('stty',['-echo'],{stdio:'inherit'});
  const input=readline.createInterface({input:process.stdin,terminal:false});key=await new Promise(resolve=>input.once('line',resolve));input.close();execFileSync('stty',['echo'],{stdio:'inherit'});process.stdout.write('\n');
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  const page=await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);await page.waitForSelector('#onboarding'); await page.waitForFunction(() => !document.querySelector('#new').disabled); await require('./ui-test-helpers.cjs').menuClick(page, '#setup-button');await page.click('#setup-local');
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');
  const result=await page.evaluate(apiKey=>window.harness.saveConnection({kind:'openrouter',name:'OpenRouter gratisprøve',baseURL:'',apiKey}),key);if(!result.ok)throw new Error(result.error);
  const connection=result.value.connections[0];assert.equal(JSON.stringify(result).includes(key),false);
  const modelID=process.env.HARNESS_LIVE_MODEL||'cohere/north-mini-code:free';assert.ok(modelID.endsWith(':free'));
  const catalog=await page.evaluate(id=>window.harness.models(id),connection.id);if(!catalog.ok)throw new Error(catalog.error);
  const model=catalog.value.find(m=>m.id===modelID);assert.ok(model?.capabilities.tools&&model.price&&Object.values(model.price).every(p=>Number(p)===0),'Modellen skal have oplyst gratispris og værktøjskald');
  const routes=await page.evaluate(value=>window.harness.routes(value),{connectionID:connection.id,modelID});if(!routes.ok)throw new Error(routes.error);
  const route=routes.value.find(r=>r.price&&r.price.prompt!=null&&r.price.completion!=null&&Object.values(r.price).every(p=>Number(p)===0));assert.ok(route,'Ingen verificeret gratis rute');
  console.log(JSON.stringify({root,model:modelID,provider:route.id,pricing:route.price,material:'Kun syntetisk startside, testbesked og fælles offentlige regler',paidFallback:false}));
  await require('./ui-test-helpers.cjs').menuClick(page, '#connections-button');await page.click('[data-close="connections-dialog"]');await require('./ui-test-helpers.cjs').taskOptions(page); await page.selectOption('#connection-select',connection.id);
  await page.waitForFunction(id=>[...document.querySelector('#model-select').options].some(o=>o.value===id),modelID);await page.locator('#model-catalog').evaluate(el => el.open = true); await page.selectOption('#model-select',modelID);
  await page.waitForFunction(id=>[...document.querySelector('#route-select').options].some(o=>o.value===id),route.id);await page.selectOption('#route-select',route.id); await page.click('#model-done');
  await page.evaluate(project=>{
   window.testEvents=[];window.testPermissions=[];window.harness.onEvent(event=>{window.testEvents.push(event.type);if(event.type==='permission.asked'){const p=event.properties;const allow=p.permission==='edit'&&p.patterns.every(file=>file==='public/index.html'||file===project+'/public/index.html'||file===project.slice(1)+'/public/index.html');window.testPermissions.push({permission:p.permission,patterns:p.patterns,allow});window.harness.reply({id:p.id,allow});}});
  },project);
  const send = async text => {
    if (text !== null) { await page.fill('#prompt', text); await page.click('#send'); }
    await page.waitForSelector('#data-dialog[open]'); await page.click('#accept-send');
    await page.waitForFunction(()=>!document.querySelector('#stop').hidden,{},{timeout:60000});
    await page.waitForFunction(()=>document.querySelector('#stop').hidden&&['Klar','Fejl'].includes(document.querySelector('#run-status').textContent),{},{timeout:180000});
    const events=await page.evaluate(()=>window.testEvents);
    if(events.includes('session.error')||events.includes('engine.error'))throw new Error('Eksternt modelkald fejlede.');
  };
  if (firstApp) {
    await require('./ui-test-helpers.cjs').selectMode(page, 'plan');
    await send('Jeg vil bygge Mødelokaler: en enkel dansk oversigt over kommunens tre fiktive mødelokaler med navn, kapacitet, sted og udstyr. Man skal kunne filtrere på mindst antal pladser og få en tydelig tom tilstand. Dette er en demonstration med opdigtede data, uden login, backend, netværk eller installationer. Brug kun public/index.html med indlejret CSS og JavaScript, fordi den skal kunne vises i den lokale forhåndsvisning. Designet skal være roligt og gennemarbejdet på mobil og desktop med god typografi, tydeligt fokus og læsbare farver. Brug en label med teksten Mindst antal pladser til et numerisk input, der straks filtrerer lokaleoversigten. Foreslå en kort plan med begrundede valg; du må vælge for mig inden for disse rammer. Læs ingen andre filer, kør ingen kommandoer, og hent ingen websider.');
    await page.waitForSelector('#plan-card:not([hidden])');
    const plan = await page.locator('#plan-text').textContent();
    assert.ok(plan.length > 100, 'Modellen skal give et reelt projektforslag');
    await fs.writeFile(path.join(root,'plan.txt'),plan);
    assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),'<h1>Start</h1>');
    await page.click('#build-plan');
    await send(null);
    const frame=page.frameLocator('#preview');
    await frame.locator('h1').filter({hasText:'Mødelokaler'}).waitFor();
    const filter=frame.getByRole('spinbutton',{name:/antal pladser/i});
    await filter.fill('9999');
    await page.screenshot({animations:'disabled',path:path.join(root,'tom-tilstand.png'),fullPage:true});
    const emptyText=await frame.locator('body').innerText();
    assert.match(emptyText,/ingen|ikke fundet|ikke nogen/i, 'Filteret skal vise en forståelig tom tilstand');
    await filter.fill('0');
    assert.notEqual(await frame.locator('body').innerText(),emptyText,'Nulstillet filter skal vise lokaler igen');
    await page.selectOption('#viewport-preset','phone');
    await page.screenshot({animations:'disabled',path:path.join(root,'mobil.png'),fullPage:true});
    assert.ok(await frame.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Mobilvisningen må ikke kræve vandret rulning');
    await page.selectOption('#viewport-preset','fluid');
  } else {
    await require('./ui-test-helpers.cjs').selectMode(page, 'free');
    await send('Dette er en afgrænset integrationstest. Læs kun public/index.html og skift h1-teksten fra Start til Gratis modeltest bestået. Brug read og edit eller write direkte. Kør ingen kommandoer, brug ikke Git, hent ingen websider, og læs ingen andre filer. Svar kort på dansk, når ændringen er gemt.');
    assert.match(await fs.readFile(path.join(project,'public/index.html'),'utf8'),/Gratis modeltest bestået/);
    await page.frameLocator('#preview').locator('h1').filter({hasText:'Gratis modeltest bestået'}).waitFor();
  }
  await page.screenshot({animations:'disabled',path:path.join(root,'gratis-model.png'),fullPage:true});
  console.log(JSON.stringify({status:'bestået',scenario:firstApp?'første app':'filændring',root,model:modelID,provider:route.id,evidence:'Rigtig OpenRouter-model → OpenCode → godkendt filændring → preview i Electron'}));
 } catch(error){if(app){try{const page=await app.firstWindow();console.error((await page.locator('#messages').textContent()).split(key||'\0').join('[skjult]'));console.error(JSON.stringify(await page.evaluate(()=>window.testPermissions)));await page.screenshot({animations:'disabled',path:path.join(root,'fejl.png'),fullPage:true});}catch{}}console.error(String(error.message).split(key||'\0').join('[skjult]'));process.exitCode=1;}
 finally {if(process.stdin.isTTY)try{execFileSync('stty',['echo'],{stdio:'inherit'});}catch{}; if(app){try{const page=await app.firstWindow();const state=await page.evaluate(()=>window.harness.connectionState());for(const c of state.value?.connections||[])await page.evaluate(id=>window.harness.removeConnection(id),c.id);}catch{}await app.close();}key='';}
})().catch(()=>{process.exitCode=1;});
