const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
(async () => {
 let key='', app;
 const scenarioID = process.env.HARNESS_LIVE_SCENARIO === 'first-app' ? 'rooms' : process.env.HARNESS_LIVE_SCENARIO;
 const scenario = require('./live-scenarios.cjs').scenarios[scenarioID];
 const firstApp = Boolean(scenario);
 const allowInspection = process.env.HARNESS_LIVE_ALLOW_INSPECTION === 'true';
 const commandInstruction = allowInspection ? 'Du må bede om godkendelse til pwd eller ls i projektmappen. Andre kommandoer er ikke tilladt.' : 'Kør ingen kommandoer.';
 const provider = process.env.HARNESS_LIVE_PROVIDER || 'openrouter';
 assert.ok(['openrouter','ollama','compatible'].includes(provider));
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-openrouter-')));
 const project=path.join(root,'project');await fs.mkdir(path.join(project,'public'),{recursive:true});await fs.writeFile(path.join(project,'public/index.html'),'<h1>Start</h1>');
 try {
  if (provider === 'openrouter') {
  if(!process.stdin.isTTY)throw new Error('Kør testen interaktivt, så nøglen kan indtastes uden ekko.');
  process.stdout.write('Indtast testnøglen (skjult): ');execFileSync('stty',['-echo'],{stdio:'inherit'});
  const input=readline.createInterface({input:process.stdin,terminal:false});key=await new Promise(resolve=>input.once('line',resolve));input.close();execFileSync('stty',['echo'],{stdio:'inherit'});process.stdout.write('\n');
  }
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  const page=await app.firstWindow(); await require('./ui-test-helpers.cjs').skipIntroduction(page);await page.waitForSelector('#onboarding'); await page.waitForFunction(() => !document.querySelector('#new').disabled); await require('./ui-test-helpers.cjs').openSetup(page);await page.click('#setup-local');
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');
  const result=await page.evaluate(value=>window.harness.saveConnection(value),{kind:provider,name:'Afgrænset modelprøve',baseURL:provider==='openrouter'?'':process.env.HARNESS_LIVE_URL||'http://127.0.0.1:11434',apiKey:key});if(!result.ok)throw new Error(result.error);
  const connection=result.value.connections[0];if(key)assert.equal(JSON.stringify(result).includes(key),false);
  const modelID=process.env.HARNESS_LIVE_MODEL||'cohere/north-mini-code:free';if(provider==='openrouter')assert.ok(modelID.endsWith(':free'));else assert.ok(process.env.HARNESS_LIVE_MODEL,'Vælg den konkrete lokale model eksplicit');
  const catalog=await page.evaluate(id=>window.harness.models(id),connection.id);if(!catalog.ok)throw new Error(catalog.error);
  const model=catalog.value.find(m=>m.id===modelID);assert.ok(model,'Modellen findes ikke i kataloget');if(provider==='openrouter')assert.ok(model?.capabilities.tools&&model.price&&Object.values(model.price).every(p=>Number(p)===0),'Modellen skal have oplyst gratispris og værktøjskald');
  let route; if(provider==='openrouter'){
  const routes=await page.evaluate(value=>window.harness.routes(value),{connectionID:connection.id,modelID});if(!routes.ok)throw new Error(routes.error);
  route=routes.value.find(r=>r.price&&r.price.prompt!=null&&r.price.completion!=null&&Object.values(r.price).every(p=>Number(p)===0));assert.ok(route,'Ingen verificeret gratis rute');
  }
  console.log(JSON.stringify({root,model:modelID,provider:route?.id||provider,pricing:route?.price||'egen server',material:'Kun syntetisk startside, testbesked og fælles offentlige regler',allowInspection,paidFallback:false}));
  await require('./ui-test-helpers.cjs').menuClick(page, '#connections-button');await page.click('[data-close="connections-dialog"]');await require('./ui-test-helpers.cjs').taskOptions(page); await page.selectOption('#connection-select',connection.id);
  await page.waitForFunction(id=>[...document.querySelector('#model-select').options].some(o=>o.value===id),modelID);await page.locator('#model-catalog').evaluate(el => el.open = true); await page.selectOption('#model-select',modelID);
  if(route){await page.waitForFunction(id=>[...document.querySelector('#route-select').options].some(o=>o.value===id),route.id);await page.selectOption('#route-select',route.id);} await page.click('#model-done');
  await page.evaluate(({project,allowInspection})=>{
   const commands = new Set(['pwd','ls','ls -la','ls -l','ls public','ls -la public',...['ls','ls -la','ls -l'].flatMap(command=>[`${command} ${project}`,`${command} "${project}"`,`${command} ${project}/public`,`${command} "${project}/public"`])]);
   window.testEvents=[];window.testPermissions=[];window.harness.onEvent(event=>{window.testEvents.push(event.type);if(event.type==='permission.asked'){const p=event.properties;const allow=p.patterns.length>0&&((p.permission==='edit'&&p.patterns.every(file=>file==='public/index.html'||file===project+'/public/index.html'||file===project.slice(1)+'/public/index.html'))||(allowInspection&&p.permission==='bash'&&p.patterns.every(command=>commands.has(command))));window.testPermissions.push({permission:p.permission,patterns:p.patterns,allow});window.harness.reply({id:p.id,allow});}});
  },{project,allowInspection});
  const send = async text => {
    await page.evaluate(()=>{window.testEvents=[];});
    if (text !== null) { await page.fill('#prompt', text); await page.click('#send'); }
    await page.waitForFunction(()=>document.querySelector('#data-dialog').open||!document.querySelector('#stop').hidden);
    if(await page.locator('#data-dialog').evaluate(el=>el.open))await page.click('#accept-send');
    await page.waitForFunction(()=>!document.querySelector('#stop').hidden,{},{timeout:60000});
    await page.waitForFunction(()=>document.querySelector('#stop').hidden&&['Klar','Fejl'].includes(document.querySelector('#run-status').textContent),{},{timeout:180000});
    const events=await page.evaluate(()=>window.testEvents);
    if(events.includes('session.error')||events.includes('engine.error'))throw new Error('Eksternt modelkald fejlede.');
  };
  if (firstApp) {
    await require('./ui-test-helpers.cjs').selectMode(page, 'plan');
    await send(`Jeg vil bygge ${scenario.name}. ${scenario.idea} Dette er en demonstration med opdigtede data, uden login, backend, netværk eller installationer. Brug kun public/index.html med indlejret CSS og JavaScript, fordi den skal kunne vises i den lokale forhåndsvisning. Designet skal være roligt og gennemarbejdet på mobil og desktop med god typografi, tydeligt fokus og læsbare farver. Hovedoverskriften skal være ${scenario.name}. Foreslå en kort plan med begrundede valg; vælg for mig inden for disse rammer. Læs ingen andre filer, og hent ingen websider. ${commandInstruction} Svar på dansk.`);
    await page.waitForSelector('#plan-card:not([hidden])');
    const plan = await page.locator('#plan-text').textContent();
    assert.ok(plan.length > 100, 'Modellen skal give et reelt projektforslag');
    await fs.writeFile(path.join(root,'plan.txt'),plan);
    assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),'<h1>Start</h1>');
    await page.click('#build-plan');
    await send(null);
    const frame=page.frameLocator('#preview');
    await frame.locator('h1').filter({hasText:scenario.name}).waitFor();
    await scenario.check(frame);
    await page.screenshot({animations:'disabled',path:path.join(root,'første-udkast.png'),fullPage:true});
    await require('./ui-test-helpers.cjs').selectMode(page, 'free');
    await send(scenario.refinement+' Brug kun public/index.html. '+commandInstruction+' Svar på dansk.');
    await page.waitForTimeout(1800);
    await scenario.checkRefinement(frame);
    await fs.writeFile(path.join(root,'samtale.txt'),await page.locator('#messages').innerText());
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
  console.log(JSON.stringify({status:'bestået',scenario:scenarioID||'filændring',root,model:modelID,provider:route?.id||provider,evidence:'Rigtig model → OpenCode → godkendt filændring → preview → opfølgende ændring',quality:'Dansk og design kræver særskilt gennemgang af plan, samtale og skærmbilleder'}));
 } catch(error){if(app){try{const page=await app.firstWindow();console.error((await page.locator('#messages').textContent()).split(key||'\0').join('[skjult]'));console.error(JSON.stringify(await page.evaluate(()=>window.testPermissions)));await page.screenshot({animations:'disabled',path:path.join(root,'fejl.png'),fullPage:true});}catch{}}console.error(String(error.message).split(key||'\0').join('[skjult]'));process.exitCode=1;}
 finally {if(process.stdin.isTTY)try{execFileSync('stty',['echo'],{stdio:'inherit'});}catch{}; if(app){try{const page=await app.firstWindow();await page.evaluate(()=>window.harness.stop()).catch(()=>{});const state=await page.evaluate(()=>window.harness.connectionState());for(const c of state.value?.connections||[])await page.evaluate(id=>window.harness.removeConnection(id),c.id);}catch{}await app.close();}await fs.rm(path.join(root,'appdata'),{recursive:true,force:true});key='';}
})().catch(()=>{process.exitCode=1;});
