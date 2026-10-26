// Native UI and real local restoration; engine events are controlled, with no AI/provider calls.
const { _electron: electron } = require('playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const helpers = require('./ui-test-helpers.cjs');
const { launchTestApp } = require('./electron-test-launch.cjs');
(async () => {
  const output = process.env.AURA_FEEDBACK_OUTPUT || path.join(os.homedir(), 'Library/Application Support/Aura1/ReleaseReports/feedback-rest-20261026/native');
  await fs.mkdir(output, { recursive: true });
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-feedback-modes-results-'))), project = path.join(root, 'Fjordby-proeve');
  const before = '<!doctype html><html lang="da"><meta charset="utf-8"><title>Fjordby prøve</title><style>body{font:18px system-ui;padding:40px;background:#f7faf8;color:#21382e}h1{font:42px Georgia}button{padding:12px 20px;background:#275c48;color:white;border:0;border-radius:8px}</style><p>OPDIGTET INDHOLD TIL UI-PRØVE</p><h1>Borgermøder i Fjordby</h1><p>Find et møde og deltag i samtalen.</p><button>Se kommende møder</button></html>';
  const after = before.replace('Find et møde og deltag i samtalen.', 'Find det næste borgermøde og vær med til at forme din by.');
  await fs.mkdir(path.join(project, 'public'), { recursive: true }); await fs.writeFile(path.join(project, 'public/index.html'), before);
  let app, page, launch; const checks = [], screenshots = [], errors = [], failedResources = [];
  const pass = (id, evidence) => { checks.push({ id, evidence }); console.log('PASS ' + id); };
  const emit = (owner, event) => app.evaluate(({ BrowserWindow }, data) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')).webContents.send('harness:event', { ...data.event, ...data.owner }), { owner, event });
  const capture = async name => { await page.waitForFunction(() => [...document.querySelectorAll('dialog[open]')].every(el => !el.getAnimations().some(a => a.playState === 'running'))); const file = path.join(output, name + '.png'); await page.screenshot({ path: file, animations:'disabled' }); screenshots.push(file); };
  const resize = async (width, height) => { await app.evaluate(({ BrowserWindow }, size) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('harness://')); w.setMinimumSize(380, 400); w.setContentSize(size.width, size.height); }, { width, height }); await page.waitForFunction(width => innerWidth === width, width); };
  const menu = async () => { await page.click('#composer-mode'); await page.waitForFunction(() => document.querySelector('#composer-mode-menu').matches(':popover-open')); };
  try {
    ({ app, evidence: launch } = await launchTestApp({ electron, profile: path.join(root, 'appdata') }));
    page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message)); page.on('response', response => { if (response.url().startsWith('harness://') && response.status() >= 400) failedResources.push(response.url()); });
    await app.evaluate(({ app, session }, root) => {
      app.setPath('documents', root); session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:/.test(details.url) })); global.fetch = async () => { throw Error('Native feedback check forbids external/model requests.'); };
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const ChatSession = require('./core/chat-session.cjs').ChatSession;
      globalThis.feedbackChats = new Map();
      for (const method of ['view','permissionReview']) { const original = ChatSession.prototype[method]; ChatSession.prototype[method] = function(...args) { globalThis.feedbackChats.set(this.id, this); return original.apply(this, args); }; }
      globalThis.feedbackServerStarts = 0; require('./core/dev-server.cjs').DevServer.prototype.execute = async () => { globalThis.feedbackServerStarts++; throw Error('No server start is allowed by this UI check.'); };
    }, root);
    await helpers.forbidGitWrites(app); await helpers.skipIntroduction(page); await helpers.openExistingProject(app, page, project); await resize(1440, 900);
    await page.evaluate(() => { appendMessage('En oversigt over borgermøder. Opdigtet indhold til UI-prøven.', 'user'); appendMessage('Syntetisk resultat: prøven har ændret teksten i de lokale eksempeldata. Ingen AI er kontaktet.', 'assistant'); $('#project-intro').hidden = true; $('#start-idea').hidden = true; });
    const owner = await page.evaluate(() => selectedOwner());
    await page.fill('#prompt', 'Min kladde og mine valg bevares.');
    const focusedHeight = (await page.locator('#chat-form').boundingBox()).height;
    await page.click('.section-title h2');
    assert.ok(Math.abs((await page.locator('#chat-form').boundingBox()).height - focusedHeight) < 1, 'Focus and blur must not move action targets by changing composer height.');
    await page.locator('#prompt').focus();
    assert.equal(await page.locator('#prompt').inputValue(), 'Min kladde og mine valg bevares.');
    await capture('12-focused-composer-dark-1440x900');
    pass('composer-focus-and-blur-do-not-move-action-targets');
    await menu(); assert.equal(await page.locator('#composer-mode-menu [role=radio]').count(), 3); await capture('01-mode-dark-1440x900');
    await page.click('[data-work-mode=chat]'); assert.equal(await page.locator('#work-mode').inputValue(), 'chat');
    await menu(); assert.equal(await page.locator('#composer-yolo').isVisible(), false); assert.match(await page.locator('#composer-mode-menu').innerText(), /ingen ekstra rettigheder/);
    await page.locator('[data-work-mode=chat]').press('ArrowDown'); assert.equal(await page.locator('#work-mode').inputValue(), 'plan'); assert.equal(await page.locator('[data-work-mode=plan]').getAttribute('aria-checked'), 'true'); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#prompt').inputValue(), 'Min kladde og mine valg bevares.'); assert.equal(await page.evaluate(() => view.running), false); pass('explicit-pointer-and-keyboard-modes-preserve-draft-without-sending');
    await emit(owner, { type: 'plan.ready', plan: { id: 'feedback-plan', text: '## Det bygger vi\nEn oversigt over borgermøder.\n\n## Sådan skal det se ud\nEn rolig mobilvenlig side.\n\n## Teknik og data\nLokale eksempeldata.\n\n## Det skal du prøve\nFind et møde.', source: 'ai' } });
    await page.locator('#plan-card').waitFor(); await menu(); await page.click('[data-work-mode=free]');
    assert.equal(await page.locator('#work-mode').inputValue(), 'build'); assert.equal(await page.evaluate(() => activePlan.id), 'feedback-plan'); assert.equal(await page.evaluate(() => view.running), false); assert.equal(await page.locator('#build-plan').isVisible(), true); pass('build-retains-selected-plan-and-its-explicit-build-action');
    await menu(); await page.click('#composer-yolo'); await page.locator('#conversation-permission-dialog[open]').waitFor();
    assert.equal(await page.locator('#conversation-permission-confirm').isDisabled(), true); assert.match(await page.locator('#conversation-permission-dialog').innerText(), /Planer og dataregler gælder stadig/); await capture('02-yolo-existing-warning-1440x900');
    await page.click('#conversation-permission-cancel'); assert.equal(await page.evaluate(() => Boolean(view.conversationPermission?.active)), false); pass('yolo-existing-warning-cancel-does-not-grant-permission');
    await menu(); await page.click('#composer-yolo'); await page.check('#conversation-permission-ack'); await page.click('#conversation-permission-confirm');
    await page.waitForFunction(() => view.conversationPermission?.active); await menu(); assert.equal(await page.locator('#composer-yolo').getAttribute('aria-pressed'), 'true'); await page.click('[data-work-mode=chat]');
    await menu(); assert.equal(await page.locator('#composer-yolo').isVisible(), false); assert.match(await page.locator('#composer-mode-boundary').innerText(), /ingen ekstra rettigheder/); await page.click('[data-work-mode=free]'); await menu(); await page.click('#composer-yolo');
    await page.waitForFunction(() => !view.conversationPermission?.active); pass('yolo-existing-backend-grant-and-revoke-with-mode-boundaries');
    await menu(); await emit(owner, {type:'run.status', status:'working'}); await page.waitForFunction(() => !document.querySelector('#composer-mode-menu').matches(':popover-open')); assert.equal(await page.locator('#composer-mode').isDisabled(), true); await emit(owner, {type:'run.status', status:'idle'}); pass('working-state-closes-menu-and-disables-mode-changes');
    const task = await app.evaluate(async ({ app }, data) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json'), fs = require('node:fs/promises');
      const chat = globalThis.feedbackChats.get(data.owner.chat); if (!chat) throw Error('Native chat was not captured.');
      await chat.ensureBaseline(); await fs.writeFile(data.project + '/public/index.html', data.after);
      return chat.recordEdit({kind:'direct', label:'Syntetisk prøveændring', files:[{file:'public/index.html',before:data.before,after:data.after}], title:'UI-prøven ændrede lokal eksempeltekst', target:'public/index.html', detail:'Kontrolleret ændring uden AI.'}).id;
    }, { owner, project, before, after });
    await page.frameLocator('#preview').getByText('Find det næste borgermøde og vær med til at forme din by.', {exact:true}).waitFor();
    const result = {status:'idle',mode:'free',answered:true,task,files:['public/index.html'],tools:[]};
    await emit(owner, {type:'run.review',...result}); await page.locator('#run-review .result-try').waitFor(); await page.locator('#run-review').scrollIntoViewIfNeeded();
    assert.match(await page.locator('#run-review').innerText(), /Ikke gennemgået af dig/); assert.doesNotMatch(await page.locator('#run-review').innerText(), /1 fil ændret|bestået|testet med AI/i); await capture('03-result-dark-1440x900'); pass('result-receipt-without-invented-quality-or-technical-file-counts');
    await page.locator('#run-review').getByRole('button',{name:'Ændringer',exact:true}).click(); await page.locator('#panel-changes').waitFor(); assert.equal(await page.evaluate(task => view.reviewedTask === task, task), false);
    assert.match(await page.locator('#panel-changes').innerText(), /public\/index\.html/); pass('real-change-panel-preserved-and-does-not-mark-result-reviewed');
    await page.click('#run-review .result-try'); assert.equal(await page.locator('#panel-preview').isVisible(), true); assert.equal(await app.evaluate(() => globalThis.feedbackServerStarts), 0); assert.equal(await page.evaluate(task => view.reviewedTask === task, task), false); pass('try-opens-existing-preview-without-server-start-or-review-acknowledgement');
    const previewURL = await page.evaluate(() => { const url=current.previewURL; current.previewURL=null; syncResultPreview(); return url; });
    assert.equal(await page.locator('#run-review .result-try').isDisabled(),true); assert.equal(await page.locator('#run-review .result-preview-note').isVisible(),true);
    await page.evaluate(url => { current.previewURL=url; syncResultPreview(); }, previewURL); assert.equal(await page.locator('#run-review .result-try').isEnabled(),true); pass('missing-preview-disables-try-with-manual-next-step');
    await resize(390,844); await page.locator('#run-review').scrollIntoViewIfNeeded(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await capture('04-result-dark-390x844'); await page.locator('#prompt').focus(); await capture('13-focused-composer-dark-390x844');
    await menu(); await capture('05-mode-dark-390x844'); assert.equal(await page.evaluate(() => { const r=$('#composer-mode-menu').getBoundingClientRect(); return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight; }), true); await page.keyboard.press('Escape'); pass('mobile-result-and-mode-menu-fit-390');
    await resize(1440,900); await page.click('#project-menu-toggle'); await page.click('#workspace-theme'); await page.locator('#run-review').scrollIntoViewIfNeeded(); await capture('06-result-light-1440x900'); await menu(); await capture('07-mode-light-1440x900'); await page.keyboard.press('Escape');
    await resize(390,844); await page.locator('#run-review').scrollIntoViewIfNeeded(); await capture('10-result-light-390x844'); await menu(); await capture('11-mode-light-390x844'); await page.keyboard.press('Escape'); await resize(1440,900); pass('light-and-dark-use-existing-theme');
    await page.locator('#run-review').getByRole('button',{name:'Marker som gennemgået',exact:true}).click(); assert.equal(await page.evaluate(task => view.reviewedTask === task, task), true); assert.match(await page.locator('#run-review').innerText(), /Du har markeret resultatet som gennemgået/); pass('only-explicit-click-marks-result-reviewed');
    for (const item of [{...result,status:'stopped'},{...result,status:'error',failure:{kind:'quality',message:'Synthetic quality failure'}}]) { await emit(owner,{type:'run.review',...item}); await page.waitForFunction(() => !document.querySelector('#run-review .result-try')); assert.equal(await page.locator('#run-review').getByRole('button',{name:'Marker som gennemgået',exact:true}).count(),0); }
    pass('stopped-and-quality-error-keep-existing-recovery-instead-of-completion');
    await emit(owner,{type:'run.review',...result}); await page.locator('#run-review .result-undo').click(); await page.locator('#restore-dialog[open]').waitFor(); await page.waitForFunction(() => !document.querySelector('#restore-confirm').disabled);
    assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),after); await capture('08-real-local-undo-review-1440x900'); await page.click('[data-close="restore-dialog"]'); assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),after); pass('undo-review-cancel-preserves-files');
    await fs.writeFile(path.join(project,'my-notes.txt'),'User-owned later notes stay intact.');
    await page.locator('#run-review .result-undo').click(); await page.waitForFunction(() => !document.querySelector('#restore-confirm').disabled); await page.click('#restore-confirm'); await page.waitForFunction(() => document.querySelector('#run-review').textContent.includes('Opgaven er fortrudt'));
    assert.equal(await fs.readFile(path.join(project,'public/index.html'),'utf8'),before); assert.equal(await fs.readFile(path.join(project,'my-notes.txt'),'utf8'),'User-owned later notes stay intact.'); assert.equal(await page.locator('#run-review .result-undo').count(),0); await page.frameLocator('#preview').getByText('Find et møde og deltag i samtalen.',{exact:true}).waitFor(); pass('real-local-undo-restores-exact-change-and-preserves-other-files'); await capture('09-restored-result-1440x900');
    await emit(owner,{type:'run.review',...result}); await page.waitForFunction(() => document.querySelector('#run-review').textContent.startsWith('Opgaven er fortrudt')); assert.equal(await page.locator('#run-review .result-try').count(),0); pass('late-completion-does-not-resurrect-undone-result');
    await helpers.assertNoGitWrites(app); assert.deepEqual(errors,[]); assert.deepEqual(failedResources,[]); assert.equal(await app.evaluate(() => globalThis.feedbackServerStarts),0); pass('no-renderer-errors-or-missing-assets-or-server-start-or-git-write');
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify({launch,checks,screenshots,errors,failedResources,profile:root,platform:process.platform,electron:await app.evaluate(()=>process.versions.electron),limits:['Controlled engine events and actual native UI. No AI generation, provider call or credential.','Real synthetic local file restoration; no user project.','macOS only; Windows remains deferred.','No automatic server start, release, Git write or upstream change.']},null,2)+'\n'); console.log(JSON.stringify({output,passed:checks.length}));
  } catch(error) { await capture('failure').catch(()=>{}); await fs.writeFile(path.join(output,'error.json'),JSON.stringify({message:error.message,stack:error.stack,launch:launch||error.testLaunch,checks,errors,failedResources,profile:root},null,2)); throw error; }
  finally { await app?.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
