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
  const page=await app.firstWindow(),errors=[]; await require('./ui-test-helpers.cjs').skipIntroduction(page);await require('./ui-test-helpers.cjs').enableSharing(page);page.on('pageerror',e=>errors.push(e.message));await page.waitForFunction(()=>!document.querySelector('#open').disabled);
  await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);
  if(!live)await app.evaluate(async(_,modulePath)=>{const {VercelDeployment}=process.mainModule.require(modulePath);global.deploymentUploads=0;VercelDeployment.prototype.inspect=async()=>({id:'prj_test',name:'test',access:'Syntetisk kontrol',region:'Ukendt',environmentKeys:[],portal:'https://vercel.com/test/test'});VercelDeployment.prototype.deploy=async()=>{global.deploymentUploads++;return {id:'dpl_test',state:'QUEUED',url:'https://test.vercel.app'};};VercelDeployment.prototype.status=async()=>({state:'READY',url:'https://test.vercel.app'});global.fetch=async()=>new Response('Login',{status:401});},path.resolve(__dirname,'../core/deployment-providers.cjs'));
  await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');await page.click('#deploy-button');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);
  await page.fill('#deploy-project',live?'ai-harness-test':'test');await page.fill('#deploy-scope',live?'progressify':'test');
  await page.click('#deployment-form button[type=submit]');await page.waitForFunction(()=>!document.querySelector('#deployment-review').hidden || (!document.querySelector('#deployment-fields').disabled && document.querySelector('#deployment-feedback').textContent!=='Vælg destination, og gennemgå den gemte version før upload.'),{},{timeout:75000});if(await page.locator('#deployment-review').isHidden())throw Error(await page.locator('#deployment-feedback').textContent());await page.waitForSelector('#deployment-review:not([hidden])',{timeout:75000}).catch(async error=>{await page.screenshot({path:path.join(root,'fejl.png')});throw Error(error.message+' · '+await page.locator('#deployment-feedback').textContent());});
  assert.equal(await page.isEnabled('#deployment-send'),false);assert.match(await page.locator('#deployment-files').textContent(),/index.html/);
  if(!live){assert.equal(await app.evaluate(()=>global.deploymentUploads),0);await fs.writeFile(path.join(project,'public/index.html'),'Ugemt ændring');await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>document.querySelector('#deployment-feedback').textContent.includes('lokale ændringer'));assert.equal(await app.evaluate(()=>global.deploymentUploads),0);await fs.writeFile(path.join(project,'public/index.html'),content);await page.click('#deployment-form button[type=submit]');await page.waitForSelector('#deployment-review:not([hidden])');}
  await page.screenshot({path:path.join(root,'gennemgang.png')});
  await page.check('#deployment-ack');await page.click('#deployment-send');await page.waitForFunction(()=>!document.querySelector('#deployment-result').hidden && !document.querySelector('#deployment-fields').disabled,{},{timeout:120000});
  let receipt=(await page.evaluate(()=>window.harness.deploymentState())).value.last;
  assert.ok(receipt.id,'Udgivelsen skal have et ID: '+receipt.state);
  await fs.writeFile(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2));
  await page.click('#deployment-check');await page.waitForFunction(()=>!document.querySelector('#deployment-fields').disabled);receipt=(await page.evaluate(()=>window.harness.deploymentState())).value.last;
  await page.screenshot({path:path.join(root,'resultat.png')});
  assert.equal((await run(project,['status','--porcelain'])).length,0);assert.deepEqual(errors,[]);
  if(!live){assert.equal(await app.evaluate(()=>global.deploymentUploads),1);assert.match(receipt.verification,/kræver adgang/);}
  console.log(JSON.stringify({status:'bestået',live,root,id:receipt.id,url:receipt.url,state:receipt.state,verification:receipt.verification}));
 }finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
