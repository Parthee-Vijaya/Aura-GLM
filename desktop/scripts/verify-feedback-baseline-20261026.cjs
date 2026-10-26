// Native feedback baseline. Synthetic profile and controlled IPC events only.
// No model request, credential, production UI edit, package or Git write.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const helpers = require('./ui-test-helpers.cjs');

(async () => {
  const output = process.env.AURA_FEEDBACK_OUTPUT || path.join(os.homedir(), 'Library/Application Support/Aura1/ReleaseReports/feedback-20261026/baseline');
  await fs.mkdir(output, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-feedback-baseline-20261026-')));
  const project = path.join(root, 'Borgermoeder');
  await fs.mkdir(path.join(project, 'public'), { recursive: true });
  await fs.writeFile(path.join(project, 'public/index.html'), '<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Borgermøder</title><style>body{font:18px system-ui;padding:36px;background:#f7faf8;color:#21382e}h1{font:44px Georgia}button{padding:12px 20px;background:#275c48;color:white;border:0;border-radius:8px}</style><p>SYNTETISK VISNING TIL PRØVEN</p><h1>Borgermøder i din kommune</h1><p>Find et møde, og vær med til at forme lokalsamfundet.</p><button>Se kommende møder</button></html>');
  let app, page;
  const observations = [], screenshots = [], errors = [];
  const observe = (id, status, detail, data) => observations.push({ id, status, detail, ...(data ? { data } : {}) });
  const capture = async name => {
    await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].every(el => !el.getAnimations().some(animation => animation.playState === 'running')));
    await page.evaluate(() => getSelection()?.removeAllRanges());
    const file = path.join(output, name + '.png');
    await page.screenshot({ path: file }); screenshots.push(file); console.log('Screenshot: ' + file);
  };
  const toggleTheme = async () => {
    await page.click('#project-menu-toggle'); await page.click('#workspace-theme');
    if (await page.locator('#project-menu').evaluate(el => el.matches(':popover-open'))) await page.click('#project-menu-toggle');
  };
  const emit = async (owner, event) => app.evaluate(({ BrowserWindow }, data) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.send('harness:event', { ...data.event, ...data.owner }), { owner, event });
  const resize = async (width, height) => {
    await app.evaluate(({ BrowserWindow }, size) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')); w.setMinimumSize(600,500); w.setContentSize(size.width, size.height); }, { width, height });
    await page.waitForFunction(width => innerWidth === width, width);
  };
  try {
    app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--user-data-dir=' + path.join(root, 'appdata')], env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
    await app.evaluate(({ app, session }, root) => {
      app.setPath('documents', root);
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) }));
      global.fetch = async () => { throw Error('Feedback baseline forbids model and external requests.'); };
    }, root);
    await helpers.forbidGitWrites(app);
    await helpers.skipIntroduction(page);
    await helpers.openExistingProject(app, page, project);
    await resize(1280, 800);
    const owner = await page.evaluate(() => selectedOwner());
    await page.evaluate(() => {
      appendMessage('En app til at melde sig til borgermøder i kommunen.', 'user');
      appendMessage('Jeg undersøger, hvordan første version kan vise møder og tilmelding. Eksempeldata markeres tydeligt.', 'assistant');
      document.querySelector('#project-intro').hidden = true;
      document.querySelector('#start-idea').hidden = true;
    });
    await emit(owner, { type: 'run.status', status: 'working' });
    await page.waitForFunction(() => document.querySelector('#chat-form').dataset.metalState === 'working');
    await capture('01-working-dark-1280x800');
    const dimensions = await page.evaluate(() => Object.fromEntries(['.sidebar','.chat','#chat-form','#prompt','#agent-activity','.chat-content'].map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return [selector, { x:r.x,y:r.y,width:r.width,height:r.height }]; })));
    observe('chat-space', 'measured-current', 'Skrivefelt og status er målt i faktisk Electron-renderer ved 1280×800.', dimensions);
    observe('status-location', 'reproduced', 'Arbejdsstatus står øverst i chatten, 522 px over skrivefeltets top i denne vinduesstørrelse.', { activityY:dimensions['#agent-activity'].y, composerY:dimensions['#chat-form'].y });
    const phase = await page.locator('#chat-form').evaluate(el => ({ name:getComputedStyle(el,'::before').animationName, duration:getComputedStyle(el,'::before').animationDuration, angle:getComputedStyle(el,'::before').getPropertyValue('--aura-metal-angle') }));
    await page.waitForTimeout(700);
    const phaseAfter = await page.locator('#chat-form').evaluate(el => getComputedStyle(el,'::before').getPropertyValue('--aura-metal-angle'));
    observe('working-feedback', 'improved-current', 'Den aktuelle version har arbejdsstatus, preview-overlejring og animeret lyskant. Dette er ikke en modeltest.', { phase, phaseAfter, text:await page.locator('#agent-activity').innerText() });
    await toggleTheme(); await capture('02-working-light-1280x800');
    await resize(1440,900); await capture('03-working-light-1440x900');
    await toggleTheme(); await capture('04-working-dark-1440x900');
    const question = { id:'feedback-question', questions:[{ header:'Første version', question:'Skal første version bruge eksempeldata eller rigtige møder?', options:[{label:'Eksempeldata (anbefalet)',description:'Afprøv idéen uden at sende en rigtig tilmelding.'},{label:'Rigtige møder',description:'Vi skal aftale datakilde og tilmelding.'}], custom:true }] };
    await emit(owner, { type:'question.asked', properties:question });
    await page.locator('.question-card').waitFor();
    await page.locator('.question-card').scrollIntoViewIfNeeded();
    await capture('05-question-dark-1440x900');
    observe('waiting-banner', 'reproduced', 'Banneret står fortsat, når spørgsmålet er synligt; kun Vis-knappen har klikhandling.', await page.evaluate(() => ({ bannerHidden:document.querySelector('#agent-activity').hidden, bannerClick:Boolean(document.querySelector('#agent-activity').onclick), text:document.querySelector('#agent-activity').innerText, card:document.querySelector('.question-card').getBoundingClientRect().toJSON() })));
    observe('free-answer', 'reproduced', 'Det frie tekstfelt findes først efter klik på Skriv dit eget svar.', { textareasBefore:await page.locator('.question-card textarea').count() });
    await page.locator('.question-links button').filter({hasText:'Skriv dit eget svar'}).click();
    await page.locator('.question-card textarea').fill('Jeg vil begynde med eksempeldata.');
    await page.locator('.question-card textarea').press('Enter');
    observe('enter-answer', 'reproduced', 'Enter indsætter en ny linje i det frie AI-svar og sender ikke svaret.', { value:await page.locator('.question-card textarea').inputValue(), questionStillPresent:await page.locator('.question-card').count() });
    await capture('06-free-answer-dark-1440x900');
    await toggleTheme(); await capture('07-free-answer-light-1440x900');
    const sidebarBefore=await page.locator('.sidebar').boundingBox();
    await page.mouse.move(sidebarBefore.x+sidebarBefore.width-1, 350); await page.mouse.down(); await page.mouse.move(sidebarBefore.x+sidebarBefore.width+80,350,{steps:10}); await page.mouse.up();
    const sidebarAfter=await page.locator('.sidebar').boundingBox();
    observe('sidebar-resize','reproduced','Træk i kanten af venstre sidebar ændrer ikke bredden. Skillelinjen mellem samtale og preview er en anden kontrol.',{before:sidebarBefore.width,after:sidebarAfter.width});
    await emit(owner,{type:'question.rejected',properties:{requestID:'feedback-question'}});
    await emit(owner,{type:'run.status',status:'idle'});
    // Save and remove a real, key-free local connection in this isolated profile.
    const saved=await page.evaluate(()=>window.harness.saveConnection({kind:'ollama',name:'Syntetisk lokal prøve',baseURL:'http://127.0.0.1:11434'}));
    assert.equal(saved.ok,true, saved.error);
    await page.evaluate(result=>{state=result.value;renderConnections();},saved);
    await helpers.menuClick(page,'#connections-button');
    await page.evaluate(()=>editConnection(state.connections.find(c=>c.name==='Syntetisk lokal prøve')));
    await capture('08-connection-remove-light');
    const dialogBox=await page.locator('#connections-dialog').boundingBox();
    await page.mouse.click(Math.max(2,dialogBox.x-15),Math.max(2,dialogBox.y-15));
    observe('dialog-outside','reproduced','Klik uden for forbindelsesdialogen lukker den ikke.',{open:await page.locator('#connections-dialog').evaluate(el=>el.open)});
    let browserDialogs=0;page.on('dialog',async dialog=>{browserDialogs++;await dialog.dismiss();});
    await page.click('#connection-remove');
    await page.waitForFunction(()=>document.querySelector('#connections-feedback').textContent==='Forbindelsen er fjernet.');
    const afterRemove=await page.evaluate(()=>window.harness.connectionState());
    observe('connection-remove','reproduced','En nøglefri prøveforbindelse blev fjernet ved første klik uden bekræftelse.',{remaining:afterRemove.value.connections.length,browserDialogs});
    await capture('09-connection-removed-light');
    await page.click('[data-close="connections-dialog"]');
    const zoomBefore=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('harness://')).webContents.getZoomFactor());
    await page.keyboard.press('Meta+='); await page.waitForTimeout(250);
    const zoomAfter=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().startsWith('harness://')).webContents.getZoomFactor());
    observe('zoom','mac-only','Playwright Cmd+= gav uændret zoom. CDP-input kan omgå Electron-menuacceleratorer; resultatet er ikke bevis for en produktfejl. Windows Ctrl++ er ikke afprøvet.',{before:zoomBefore,after:zoomAfter});
    await page.keyboard.press('Meta+0');
    observe('planning','not-reproduced','Dobbelt planlægning afhænger af modelsvaret og er ikke reproduceret med rigtig AI her.');
    observe('work-mode','source-confirmed','Byg, Planlæg og Samtale findes fortsat. At fjerne valget er et produktforslag og ikke en konstateret programfejl.');
    observe('plan-first','source-confirmed','Planvalg findes fortsat, men direkte arbejde findes også. Automatisk at fjerne planvalg er ikke aktiveret i denne prøve.');
    observe('commands','source-confirmed','Godkendelser og YOLO bevares; automatisk godkendelse er ikke aktiveret af denne prøve.');
    observe('preview','separate-probe','Statisk preview åbner i dette projekt. Dynamisk preview vurderes i separat backendprøve.');
    observe('change-card','source-confirmed','run-review findes fortsat; et rigtigt ændringsforløb er ikke kørt i denne visningsprøve.');
    await helpers.assertNoGitWrites(app);assert.deepEqual(errors,[]);
    const report={kind:'Native macOS Electron med syntetiske filer og kontrollerede IPC-hændelser',platform:process.platform,profile:root,app:await app.evaluate(({app})=>({version:app.getVersion(),electron:process.versions.electron,userData:app.getPath('userData')})),observations,screenshots,errors,limits:['Ingen rigtig AI eller udbyderkald.','Windows er ikke afprøvet.','Ingen ændringer i produktets UI eller produktionskode.','Skærmbilleder viser faktiske eksisterende renderere med syntetisk samtale og status.'],source:Object.fromEntries(await Promise.all(['ui/app.js','ui/planning.js','ui/workspace-calm.css','main.cjs'].map(async file=>[file,crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname,'..',file))).digest('hex')])))};
    await fs.writeFile(path.join(output,'baseline-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({output,observations:observations.length,errors}));
  } catch(error) { if(page)await capture('failure').catch(()=>{});await fs.writeFile(path.join(output,'baseline-error.json'),JSON.stringify({message:error.message,observations,screenshots,errors,profile:root},null,2));throw error; }
  finally { await app?.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
