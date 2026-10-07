const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
 const bundle = path.resolve(process.argv[2] || 'release/mac-arm64/Aura.app');
 const mac = bundle.endsWith('.app'), executablePath = mac ? path.join(bundle,'Contents/MacOS',path.basename(bundle,'.app')) : bundle;
 const resources = mac ? path.join(bundle,'Contents/Resources') : path.join(path.dirname(bundle),'resources');
 const runtime = require('../core/runtime.cjs').configure(resources);
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'harness-package-'));
 const platformPath = process.platform==='win32' ? path.join(process.env.SystemRoot,'System32') : '/usr/bin:/bin:/usr/sbin:/sbin';
 const env={...process.env,PATH:platformPath,HARNESS_OPENCODE_PATH:'',ELECTRON_RUN_AS_NODE:undefined};
 assert.equal(execFileSync(runtime.opencode,['--version'],{env,encoding:'utf8'}).trim(),require('../runtime-lock.json').opencode);
 assert.match(execFileSync(runtime.node,['--version'],{env,encoding:'utf8'}),/v22\.23\.3/);
 assert.match(execFileSync(runtime.git,['--version'],{env,encoding:'utf8'}),/2\.53\.0/);
 const npm = path.join(resources,'runtime/node',process.platform==='win32'?'node_modules/npm/bin/npm-cli.js':'lib/node_modules/npm/bin/npm-cli.js');
 assert.match(execFileSync(runtime.node,[npm,'--version'],{env,encoding:'utf8'}),/^\d+\./);
 let app,page;
 try {
  app = await electron.launch({executablePath,args:['--user-data-dir='+path.join(root,'appdata')],env});
  page=await app.firstWindow(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await require('./ui-test-helpers.cjs').skipIntroduction(page);
  await require('./ui-test-helpers.cjs').isolateDocuments(app,path.join(root,'Dokumenter'));
  await page.fill('#name','Installationsprøve'); await page.fill('#purpose','En syntetisk side fra installationspakken');
  await require('./ui-test-helpers.cjs').chooseLocation(app,page,root); await page.click('#create');
  await page.waitForSelector('#workspace:not([hidden])');
  await require('./ui-test-helpers.cjs').firstVersion(page,path.join(root,'projekt-installationsproeve'),'Installationsprøve');
  assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  // Nye projekter har versioner fra start: den medfølgende Git har gemt startfilerne som første version.
  const project=path.join(root,'projekt-installationsproeve');
  assert.equal(execFileSync(runtime.git,['-C',project,'log','--format=%s'],{env,encoding:'utf8'}).trim(),'Projekt oprettet');
  // firstVersion har rettet startfilen for at udløse et rigtigt preview. Den rettelse skal vises som ugemt.
  await require('./ui-test-helpers.cjs').menuClick(page, '#git-button');await page.locator('#git-summary').filter({hasText:'1 ændring er ikke gemt endnu.'}).waitFor();
  await page.locator('#git-refresh').evaluate(el=>{el.closest('details').open=true;});
  await fs.mkdir(path.join(root,'hooks'));
  execFileSync(runtime.git,['-C',project,'config','--local','core.hooksPath',path.join(root,'hooks')],{env});
  execFileSync(runtime.git,['-C',project,'config','--local','commit.gpgsign','false'],{env});
  for(const key of ['user.name','user.email']) execFileSync(runtime.git,['-C',project,'config','--local',key,''],{env});
  await page.click('#git-refresh');await page.waitForSelector('#git-identity:not([hidden])');
  // Genindlæs også, mens identitetsformularen allerede er synlig. Et gammelt svar må ikke overskrive indtastningen.
  await page.waitForFunction(()=>!document.querySelector('#git-refresh').disabled);
  assert.equal(await page.evaluate(()=>{document.querySelector('#git-refresh').click();return document.querySelector('#git-identity').hidden;}),true);
  await page.waitForFunction(()=>!document.querySelector('#git-refresh').disabled&&!document.querySelector('#git-identity').hidden);
  await page.fill('#git-name','Installationsprøve');await page.fill('#git-email','test@example.invalid');await page.click('#git-identity button');
  await page.waitForFunction(()=>document.querySelector('#git-identity').hidden&&!document.querySelector('#git-refresh').disabled);
  // Forlæng kun prøvens læsning, så Gem version faktisk forsøges, mens gennemgangen stadig hentes.
  await app.evaluate(({ipcMain})=>{const read=ipcMain._invokeHandlers.get('git:review');if(!read)throw Error('Prøven fandt ikke filgennemgangens IPC-handler');ipcMain._invokeHandlers.set('git:review',async(...args)=>{const result=await read(...args);await new Promise(resolve=>setTimeout(resolve,1000));return result;});});
  await fs.writeFile(path.join(project,'public','noter.txt'),'Afprøvning af installationspakken');await page.click('#git-refresh');
  await page.locator('#git-summary').filter({hasText:'2 ændringer er ikke gemt endnu.'}).waitFor();
  assert.equal(await page.isEnabled('#git-save-all'),false,'Gem version venter på den igangværende filgennemgang');
  await page.fill('#git-note','Afprøv installationspakken');await page.click('#git-save-all');await page.locator('#git-feedback').filter({hasText:'er gemt lokalt'}).waitFor();
  assert.match(execFileSync(runtime.git,['-C',project,'log','-1','--format=%an <%ae>'],{env,encoding:'utf8'}),/Installationsprøve <test@example.invalid>/);
  await page.locator('#git-summary').filter({hasText:'Alt er gemt.'}).waitFor();
  await page.click('#tab-preview');await page.screenshot({path:path.join(root,'installeret.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'bestået',root,checks:['pakket app','isoleret brugerdata','begrænset PATH','medfølgende OpenCode/Git/Node/npm','projektoprettelse med profiler','rigtigt preview','Git fra start med første version','Git-identitet og Gem version med ét klik kun i syntetisk testprojekt'],limitation:'Ikke en separat ren computer; ingen ekstern AI eller Windows-kørsel på Mac.'}));
 } catch(error) {
  await page?.screenshot({path:path.join(root,'fejl.png'),timeout:3000}).catch(()=>{});
  const status=await page?.evaluate(()=>({git:document.querySelector('#git-summary')?.textContent,feedback:document.querySelector('#git-feedback')?.textContent,identity:!document.querySelector('#git-identity')?.hidden,files:document.querySelectorAll('#git-files input').length})).catch(()=>null);
  console.error(JSON.stringify({root,status}));throw error;
 } finally {await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
