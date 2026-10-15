const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {run}=require('../core/git.cjs');
(async()=>{
 const live=process.argv.includes('--live-vercel');
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-deployment-ui-'))),project=path.join(root,'projekt');let app;
 const content='<!doctype html><html lang="da"><meta charset="utf-8"><title>Aura · testudgivelse</title><h1>Aura testudgivelse</h1><p>Kun syntetisk testmateriale. Version '+path.basename(root)+'</p></html>';
 await fs.mkdir(path.join(project,'public'),{recursive:true});await fs.writeFile(path.join(project,'public/index.html'),content);
 await run(project,['init']);await run(project,['add','.']);await run(project,['-c','core.hooksPath=/dev/null','-c','commit.gpgsign=false','-c','user.name=Testbruger','-c','user.email=test@example.invalid','commit','-m','Gem isoleret udgivelsestest']);
 try{
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'appdata')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  const page=await app.firstWindow(),errors=[],screens=[];
  const capture=async(name)=>{const png=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('harness://')).webContents.capturePage()).toPNG().toString('base64'));await fs.writeFile(path.join(root,name+'.png'),Buffer.from(png,'base64'));screens.push(await page.locator('#deployment-dialog').evaluate((dialog,name)=>{const visible=el=>el.checkVisibility({checkVisibilityCSS:true,contentVisibilityAuto:true})&&el.getBoundingClientRect().width>0;return {name,words:dialog.innerText.trim().split(/\s+/).length,choices:[...dialog.querySelectorAll('button,input[type=checkbox],select,summary')].filter(visible).filter(el=>!el.classList.contains('info')).length,infos:[...dialog.querySelectorAll('.info')].filter(visible).length,fields:[...dialog.querySelectorAll('input:not([type=checkbox]):not([type=hidden])')].filter(visible).length,overflow:dialog.scrollWidth>dialog.clientWidth+1};},name));}; await require('./ui-test-helpers.cjs').skipIntroduction(page);await require('./ui-test-helpers.cjs').enableSharing(page);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
  if(!live)await app.evaluate(async(_,modulePath)=>{const {VercelDeployment}=process.mainModule.require(modulePath);global.deploymentUploads=0;global.deploymentInspections=0;VercelDeployment.prototype.inspect=async()=>{global.deploymentInspections++;return ({id:'prj_test',name:'test',access:'Syntetisk kontrol',region:'Ukendt',environmentKeys:[],portal:'https://vercel.com/test/test'});};VercelDeployment.prototype.deploy=async()=>{global.deploymentUploads++;return {id:'dpl_test',state:'QUEUED',url:'https://test.vercel.app'};};VercelDeployment.prototype.status=async()=>({state:'READY',url:'https://test.vercel.app'});global.fetch=async()=>new Response('Login',{status:401});},path.resolve(__dirname,'../core/deployment-providers.cjs'));
  await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');await page.click('#deploy-button');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);
  if (!live) {
   assert.match(await page.locator('#hosting-guide-current').innerText(), /Amerikansk leverandør/);
   assert.equal(await page.locator('#hosting-guide-current details').evaluate(el => el.open), false);
   assert.equal(await page.locator('#hosting-other').evaluate(el => el.open), false);
   await capture('hostingvalg');
   await page.click('#hosting-other > summary');
   assert.deepEqual(await page.locator('#hosting-guide-choice option').evaluateAll(items => items.map(item => item.value)), ['cloudflare','netlify','github-pages','komplai','promte']);
   await app.evaluate(({shell}) => { global.hostingLinks=[]; shell.openExternal=async url=>{global.hostingLinks.push(url);}; });
   for (const id of ['cloudflare','netlify','github-pages','komplai','promte']) {
    await page.selectOption('#hosting-guide-choice',id);
    assert.match(await page.locator('#hosting-guide-other').innerText(), /Aura uploader ikke herfra/);
    await page.click('#hosting-guide-other details > summary');
    assert.match(await page.locator('#hosting-guide-other').innerText(), /Kilder gennemgået/);
    await page.locator('#hosting-guide-other button').first().click();
    assert.notEqual(await page.locator('#deployment-feedback').textContent(), 'Arbejder …');
    assert.equal(await app.evaluate(()=>global.deploymentUploads),0);
   }
   assert.equal((await app.evaluate(()=>global.hostingLinks)).length,5);
   const invalid=await page.evaluate(()=>window.harness.deploymentGuideOpen({id:'https://example.invalid',kind:'guide'}));
   assert.equal(invalid.ok,false);assert.equal((await app.evaluate(()=>global.hostingLinks)).length,5);
   await page.selectOption('#hosting-guide-choice','cloudflare');await page.click('#hosting-guide-other details > summary');
   await capture('hostingvejledning');await page.click('#hosting-other > summary');
   await page.selectOption('#deploy-provider','azure');assert.match(await page.locator('#hosting-guide-current').innerText(),/Microsoft/);
   await page.selectOption('#deploy-provider','vercel');
  }
  await page.fill('#deploy-project',live?'ai-harness-test':'test');if(!live){await page.locator('#deployment-form').evaluate(form=>form.addEventListener('invalid',event=>{window.invalidDeploymentField=event.target.id;},true));await page.click('#deployment-form button[type=submit]');assert.equal(await page.evaluate(()=>window.invalidDeploymentField),'deploy-scope');assert.equal(await app.evaluate(()=>global.deploymentInspections),0);}await page.fill('#deploy-scope',live?'progressify':'test');
  await page.click('#deployment-form button[type=submit]');await page.waitForFunction(()=>!document.querySelector('#deployment-review').hidden || (!document.querySelector('#deployment-fields').disabled && document.querySelector('#deployment-feedback').textContent!=='Vælg destination, og gennemgå den gemte version før upload.'),{},{timeout:75000});if(await page.locator('#deployment-review').isHidden())throw Error(await page.locator('#deployment-feedback').textContent());await page.waitForSelector('#deployment-review:not([hidden])',{timeout:75000}).catch(async error=>{await page.screenshot({path:path.join(root,'fejl.png')});throw Error(error.message+' · '+await page.locator('#deployment-feedback').textContent());});
  assert.equal(await page.isEnabled('#deployment-send'),false);assert.equal(await page.isVisible('#deployment-form'),false);assert.equal(await page.isVisible('#deployment-details'),false);assert.match(await page.locator('#deployment-summary').textContent(),/Gem isoleret udgivelsestest/);assert.match(await page.locator('#deployment-files').textContent(),/index.html/);
  if(!live){assert.equal(await app.evaluate(()=>global.deploymentUploads),0);await fs.writeFile(path.join(project,'public/index.html'),'Ugemt ændring');await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>document.querySelector('#deployment-feedback').textContent.includes('lokale ændringer'));assert.equal(await app.evaluate(()=>global.deploymentUploads),0);await fs.writeFile(path.join(project,'public/index.html'),content);await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');}
  await capture('gennemgang');assert.equal(await page.evaluate(()=>document.activeElement.id),'deployment-review-title');await page.click('#deployment-edit');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);assert.equal(await page.inputValue('#deploy-project'),live?'ai-harness-test':'test');await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');
  await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>!document.querySelector('#deployment-result').hidden && !document.querySelector('#deployment-fields').disabled,{},{timeout:120000});
  let receipt=(await page.evaluate(()=>window.harness.deploymentState())).value.last;
  assert.ok(receipt.id,'Udgivelsen skal have et ID: '+receipt.state);
  await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2));
  await page.click('#deployment-check');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);receipt=(await page.evaluate(()=>window.harness.deploymentState())).value.last;
  await capture('resultat');assert.equal(await page.isVisible('#deployment-form'),false);assert.match(await page.locator('#deployment-checks').textContent(),/Testerens adgang.*Ikke afprøvet/);
  assert.equal((await run(project,['status','--porcelain'])).length,0);assert.deepEqual(errors,[]);
  if(!live){assert.equal(await app.evaluate(()=>global.deploymentUploads),1);assert.match(receipt.verification,/kræver adgang/);}
  if(!live){
   // Mislykket frisk kontrol må ikke vise den tidligere READY-kontrol som aktuel.
   await app.evaluate(async(_,modulePath)=>{const {VercelDeployment}=process.mainModule.require(modulePath);VercelDeployment.prototype.status=async()=>{throw Error('syntetisk statusfejl');};},path.resolve(__dirname,'../core/deployment-providers.cjs'));
   await page.click('#deployment-check');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);
   assert.match(await page.locator('#deployment-checks').textContent(),/Seneste statuskontrol mislykkedes/);assert.doesNotMatch(await page.locator('#deployment-checks').textContent(),/Udgivet ifølge/);assert.equal(await page.isVisible('#deployment-portal'),true);
   await capture('statusfejl');
   // Genåbning henter evidensen; formændringer ændrer ikke den registrerede upload.
   await page.click('[data-close="deployment-dialog"]');await page.click('#deploy-button');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);assert.match(await page.locator('#deployment-checks').textContent(),/mislykkedes/);
   await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('harness://'));w.setSize(980,720);w.webContents.setZoomFactor(1.5);});await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>!document.querySelector('#deployment-dialog').getAnimations().some(a=>a.playState==='running'));await page.locator('#deployment-result-title').scrollIntoViewIfNeeded();await capture('resultat-980-150');await page.locator('#deployment-open').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'deployment-portal');
   assert.equal(await page.locator('#deployment-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth+1),true);
   await page.click('#deployment-new');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);await page.fill('#deploy-project','andet-projekt');assert.equal((await page.evaluate(()=>window.harness.deploymentState())).value.last.config.project,'test');
   await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');await capture('gennemgang-980-150');
   await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'deploy-button');
   await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('harness://'));w.webContents.setZoomFactor(1);w.setSize(1280,820);});
   await page.click('#deploy-button');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);await page.click('#deployment-new');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);
   await app.evaluate(async(_,modulePath)=>{const {VercelDeployment}=process.mainModule.require(modulePath);VercelDeployment.prototype.deploy=async()=>{global.deploymentUploads++;throw Error('syntetisk uploadfejl');};},path.resolve(__dirname,'../core/deployment-providers.cjs'));
   await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);
   assert.equal((await page.evaluate(()=>window.harness.deploymentState())).value.last.state,'UNKNOWN');assert.equal(await page.isDisabled('#deployment-check'),true);assert.equal(await page.isVisible('#deployment-portal'),true);assert.match(await page.locator('#deployment-checks').textContent(),/Upload ikke bekræftet.*registreret lokalt/);assert.equal(await app.evaluate(()=>global.deploymentUploads),2);await capture('ukendt-upload');await page.click('[data-close="deployment-dialog"]');await page.click('#deploy-button');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);assert.match(await page.locator('#deployment-verification').textContent(),/oversigt, før du prøver en ny upload/);assert.equal(await app.evaluate(()=>global.deploymentUploads),2);
   await app.evaluate(async(_,input)=>{const {AzureDeployment}=process.mainModule.require(input.modulePath);AzureDeployment.prototype.inspect=async()=>({id:'/subscriptions/test/resourceGroups/test/providers/Microsoft.Web/staticSites/test',name:'Azure-test',access:'Testmiljø er ikke adgangsbeskyttelse',environmentKeys:[],portal:'https://portal.azure.com/'});AzureDeployment.prototype.deploy=async()=>({id:'harness-test',state:'UPLOADED',url:null});AzureDeployment.prototype.status=async()=>({state:'READY',url:'https://test.azurestaticapps.net'});global.fetch=async()=>new Response(input.content);},{modulePath:path.resolve(__dirname,'../core/deployment-providers.cjs'),content});
   await page.click('#deployment-new');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);await page.selectOption('#deploy-provider','azure');await page.fill('#deploy-project','Azure-test');await page.fill('#deploy-subscription','test-abonnement');await page.fill('#deploy-group','test-gruppe');
   assert.equal(await page.locator('#deploy-mode option[value=source]').isDisabled(),true);await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');assert.match(await page.locator('#deployment-summary').textContent(),/test-abonnement.*test-gruppe.*harness-test.*erstatter/);await capture('azure-gennemgang');
   await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);assert.equal(await page.isVisible('#deployment-open'),false);
   await page.click('#deployment-check');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);receipt=(await page.evaluate(()=>window.harness.deploymentState())).value.last;
   assert.equal(receipt.checks.content.status,'matched');assert.match(await page.locator('#deployment-checks').textContent(),/HTTP 200 uden login.*matcher.*Testerens adgang.*Ikke afprøvet/);await capture('azure-resultat');
  }
  await fs.writeFile(path.join(root,'skaermmaaling.json'),JSON.stringify(screens,null,2));assert.ok(screens.every(s=>!s.overflow));assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'bestået',live,root,id:receipt.id,url:receipt.url,state:receipt.state,verification:receipt.verification}));
 }finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
