// Real Electron controls + IPC, isolated profile, no credentials or external model calls.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron: electron } = require('playwright');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
 const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-yolo-')));
 const evidence = process.env.AURA_PR_EVIDENCE || root;
 await fs.mkdir(evidence,{recursive:true}); await fs.mkdir(path.join(root,'documents'));
 const checks=[], errors=[]; let app,page;
 const check=(name,value)=>{assert.ok(value,name);checks.push(name);};
 const launch=async()=>{
  app=await electron.launch({executablePath:require('electron'),args:[path.join(__dirname,'..'),'--user-data-dir='+path.join(root,'profile')],env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});
  await helpers.isolateDocuments(app,path.join(root,'documents'));
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await helpers.skipIntroduction(page);
 };
 const openMode=async mode=>{
  await page.click('#composer-mode');await page.selectOption('#work-mode',mode);
 };
 const activate=async()=>{
  await page.click('#yolo-toggle');await page.waitForSelector('#conversation-permission-dialog[open]');
  await page.check('#conversation-permission-ack');await page.click('#conversation-permission-confirm');
  await page.waitForFunction(()=>!document.querySelector('#conversation-permission-dialog').open);
 };
 try {
  await launch();
  const saved=await page.evaluate(()=>window.harness.featuresSave({scope:'alle',values:{versioner:false,planlaegning:true}}));check('Test settings saved',saved.ok);
  await page.reload();await helpers.skipIntroduction(page);
  await page.fill('#name','YOLO kontrol');await page.fill('#purpose','En lokal prøve af samtaletilladelser.');
  await page.click('#create');await page.waitForSelector('#workspace:not([hidden])');
  const original=await page.evaluate(()=>view.id);
  await openMode('chat');check('YOLO is absent in Conversation',!await page.isVisible('#yolo-toggle'));
  await page.selectOption('#work-mode','plan');check('YOLO is absent in Plan',!await page.isVisible('#yolo-toggle'));
  await page.selectOption('#work-mode','free');check('Build offers YOLO before the first task',await page.isVisible('#yolo-toggle'));
  await page.locator('#task-dialog .workflow').screenshot({path:path.join(evidence,'build-yolo.png')});
  await page.click('#yolo-toggle');await page.waitForSelector('#conversation-permission-dialog[open]');
  check('Explicit acknowledgment is required',await page.isDisabled('#conversation-permission-confirm'));
  check('Warning explains external files and preserved limits',(await page.textContent('#conversation-permission-dialog')).includes('også uden for projektet')&&(await page.textContent('#conversation-permission-dialog')).includes('Valget godkender ikke en plan'));
  await page.locator('#conversation-permission-dialog').screenshot({path:path.join(evidence,'yolo-warning.png')});
  await page.click('#conversation-permission-cancel');
  check('Cancel keeps YOLO off',await page.getAttribute('#yolo-toggle','aria-pressed')==='false');
  await activate();check('Build shows active YOLO',await page.getAttribute('#yolo-toggle','aria-pressed')==='true');
  await page.click('[data-close="task-dialog"]');
  check('Persistent status offers revocation',await page.isVisible('#conversation-permission-status button'));
  check('No task was launched by opting in',await page.locator('#stop').isHidden());
  await page.screenshot({path:path.join(evidence,'yolo-active.png')});
  await page.click('#project-list .project-entry.is-current .project-add');
  await page.waitForFunction(id=>view.id!==id,original);
  check('New conversation has no grant',await page.locator('#conversation-permission-status').isHidden());
  await page.locator('.chat-row[data-chat="'+original+'"]').click();
  await page.waitForFunction(id=>view.id===id,original);
  check('Original conversation retains its grant',await page.isVisible('#conversation-permission-status'));
  await page.click('#conversation-permission-status button');
  check('Revoke clears active status',await page.locator('#conversation-permission-status').isHidden());
  await openMode('free');await activate();await page.click('[data-close="task-dialog"]');
  await app.close();app=null;await launch();await page.waitForSelector('#workspace:not([hidden])');
  check('App restart forgets the grant',await page.locator('#conversation-permission-status').isHidden());
  await openMode('free');check('Restart shows YOLO off',await page.getAttribute('#yolo-toggle','aria-pressed')==='false');
  check('No renderer errors',errors.length===0);
  await fs.writeFile(path.join(evidence,'native.json'),JSON.stringify({passed:true,root,checks,errors,externalModelCalls:0},null,2)+'\n');
  console.log(JSON.stringify({passed:true,checks:checks.length,evidence,root}));
 } catch(error) {
  await page?.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});
  console.error(JSON.stringify({root,checks,errors}));throw error;
 } finally {
  await app?.close();
  // Only our closed synthetic profile is removed. Project source and evidence stay.
  await fs.rm(path.join(root,'profile'),{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
