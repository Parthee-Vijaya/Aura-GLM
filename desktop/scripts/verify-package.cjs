const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
(async () => {
 const bundle = path.resolve(process.argv[2] || 'release/mac-arm64/AI Harness.app');
 const mac = bundle.endsWith('.app'), executablePath = mac ? path.join(bundle,'Contents/MacOS/AI Harness') : bundle;
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
  await page.frameLocator('#preview').locator('h1').filter({hasText:'Installationsprøve'}).waitFor();
  assert.equal(await app.evaluate(({app})=>app.isPackaged),true);
  await require('./ui-test-helpers.cjs').menuClick(page, '#git-button');await page.click('#git-init');await page.waitForFunction(()=>document.querySelector('#git-init').hidden&&!document.querySelector('#git-init').disabled);
  const project=path.join(root,'projekt-installationsproeve');
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
  await page.locator('#git-files input:not(:disabled)').first().waitFor();
  for(const item of await page.locator('#git-files input:not(:disabled)').all()) await item.check();
  await page.fill('#git-message','Afprøv installationspakken');await page.click('#git-save');await page.locator('#git-feedback').filter({hasText:'er gemt lokalt'}).waitFor();
  assert.match(execFileSync(runtime.git,['-C',project,'log','-1','--format=%an <%ae>'],{env,encoding:'utf8'}),/Installationsprøve <test@example.invalid>/);
  await page.click('[data-close="git-dialog"]');await page.screenshot({path:path.join(root,'installeret.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'bestået',root,checks:['pakket app','isoleret brugerdata','begrænset PATH','medfølgende OpenCode/Git/Node/npm','projektoprettelse med profiler','rigtigt preview','Git-identitet og commit kun i syntetisk testprojekt'],limitation:'Ikke en separat ren computer; ingen ekstern AI eller Windows-kørsel på Mac.'}));
 } catch(error) {
  await page?.screenshot({path:path.join(root,'fejl.png'),timeout:3000}).catch(()=>{});
  const status=await page?.evaluate(()=>({git:document.querySelector('#git-summary')?.textContent,feedback:document.querySelector('#git-dialog .dialog-notice')?.textContent,identity:!document.querySelector('#git-identity')?.hidden,files:document.querySelectorAll('#git-files input').length})).catch(()=>null);
  console.error(JSON.stringify({root,status}));throw error;
 } finally {await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
