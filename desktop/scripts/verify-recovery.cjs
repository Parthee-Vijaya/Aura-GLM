const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { GitVersions, run } = require('../core/git.cjs');
const { skipIntroduction, menuClick, taskOptions, selectMode } = require('./ui-test-helpers.cjs');
(async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-recovery-'))), project = path.join(root,'Prøve med mellemrum');
  await fs.mkdir(path.join(project,'public'),{recursive:true}); await fs.writeFile(path.join(project,'.gitignore'),'.env\n');
  const pageFile = path.join(project,'public/index.html'); await fs.writeFile(pageFile,'<h1>Godkendt version</h1>');
  const git = new GitVersions(); await git.initialize(project);
  for (const [key,value] of [['user.name','Testbruger'],['user.email','test@example.invalid'],['commit.gpgsign','false'],['core.hooksPath',path.join(root,'hooks')]]) await run(project,['config','--local',key,value]);
  let review = await git.review(project); const first = await git.commit(project,{token:review.token,files:review.files.map(f=>f.file),message:'Godkendt udgangspunkt'});
  await fs.writeFile(pageFile,'<h1>Anden version</h1>'); review=await git.review(project); const second=await git.commit(project,{token:review.token,files:['public/index.html'],message:'Anden prøveversion'});
  await fs.writeFile(pageFile,'<h1>Ugemt forsøg</h1>'); await fs.writeFile(path.join(project,'.env'),'PRIVATE=kun-lokalt'); await fs.writeFile(path.join(project,'noter.txt'),'Bevar denne fil');
  let mode='ok', requests=0, summaryRequests=0, continuationRequests=0, app, page;
  const requestKinds=[];
  const sentPrompts=[];
  let previousTask=null;
  const digest=value=>createHash('sha256').update(JSON.stringify(value??null)).digest('hex');
  // Full final-user-message digests observed in the pinned V2 wire contract:
  // first summary and later summaries that also carry its checkpoint guidance.
  // A marker elsewhere in conversation history must never classify a task call.
  const summaryRequestDigests=new Set(['17aa9eb49309dff5268a052723e8c1d947f78b12ebccdf896e7615f4469d3790','07518c4a63f28b9641348ed01321ed7d2627f7077339170051275c43764add72']);
  const isSummaryRequest=messages=>{const last=messages?.at(-1);return last?.role==='user'&&typeof last.content==='string'&&summaryRequestDigests.has(digest(last.content));};
  const planReminder=`<system-reminder>\nYou are in Plan mode. Discuss the plan with the user directly in the conversation. Do not create or update plan files unless the user explicitly asks you to; when they do, write them only in:\n${path.join(root,'appdata/harness/runtime-v2',createHash('sha256').update(project).digest('hex'),'home/.opencode/plan')}\n\nDo not modify any other files or ask a subagent to do so.\n\nYou remain in Plan mode until the user switches agents. If the user asks you to implement changes, do not do so. Tell them they need to switch agents.\n</system-reminder>`;
  const isPlanReminder=message=>message?.role==='user'&&message.content===planReminder;
  // En plan tæller kun med alle fire afsnit; ellers bliver svaret i samtalen uden plan.
  const plan='## Det bygger vi\nVi bevarer den eksisterende side og dens lokale data. Næste ændring er en tydelig tilmeldingsknap.\n## Sådan skal det se ud\nKnappen står tydeligt under overskriften.\n## Teknik og data\nVi bruger projektets HTML. Ingen ny konto er nødvendig.\n## Det skal du prøve\nKontrollér knappen på mobil og computer.';
  // V2 can compact the unknown model's conservative 32K window after an error.
  // Answer its actual summary protocol; do not enlarge the window or disable it.
  const summary='## Objective\n- Continue the controlled recovery test and preserve the existing page.\n\n## Requirements\n- Keep the selected model, current approvals and private local files.\n\n## Decisions\n- Plan only; no file changes.\n\n## Work State\n### Completed\n- Restored and undid a local version.\n### Active\n- Respond to the latest recovery request with the four-section plan.\n### Blocked\n- (none)\n\n## Next Move\n1. Return the requested plan without tools.\n\n## Relevant Files\n- public/index.html remains unchanged.\n\n## Important Context\n- Authentication, quota, stream and user-stop failures are controlled test cases.';
  const server=http.createServer(async(req,res)=>{
    if(req.url==='/v1/models'){res.setHeader('content-type','application/json');return res.end(JSON.stringify({data:[{id:'recovery-model'}]}));}
    let raw='';for await(const chunk of req) raw+=chunk;const body=JSON.parse(raw);
    const isSummary=isSummaryRequest(body.messages);
    const isContinuation=!isSummary&&isPlanReminder(body.messages?.at(-1));
    const bodyHash=digest(body);
    let continuation;
    if(isSummary)summaryRequests++;
    else if(isContinuation){
      continuationRequests++;
      // V2 emits one Plan-mode reminder after an automatic compaction's first
      // successful answer. It is a new generation with that completed answer in
      // history, not a replay. Accept only this exact, observed wire transition.
      continuation={previousKind:requestKinds.at(-1)?.kind,previousMode:previousTask?.mode,distinctPayload:bodyHash!==previousTask?.bodyHash,
        completedAnswer:body.messages.at(-2)?.role==='assistant'&&body.messages.at(-2)?.content===plan,
        unchangedContext:digest(body.messages.slice(0,-2))===digest(previousTask?.messages.filter(message=>!isPlanReminder(message)))};
    }else{
      requests++;previousTask={mode,bodyHash,messages:body.messages};
    }
    requestKinds.push({kind:isSummary?'summary':isContinuation?'plan-reminder':'task',mode,model:body.model,bodyHash,...(continuation?{continuation}:{})});
    if(!isSummary&&(mode==='key'||mode==='quota')){res.writeHead(mode==='key'?401:402,{'content-type':'application/json'});return res.end(JSON.stringify({error:{message:'SKJULT_UDVIDERTEKST'}}));}
    const chunk={id:'recovery-'+requestKinds.length,object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta:{role:'assistant',content:isSummary?summary:mode==='ok'?plan:mode==='wait'?'Delvist svar før brugerens stop.':'Delvist svar før afbrydelsen.'},finish_reason:null}]};
    res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify(chunk)+'\n\n');
    if(!isSummary&&mode==='stream'){setTimeout(()=>res.destroy(),100);return;}
    if(!isSummary&&mode==='wait')return;
    res.write('data: '+JSON.stringify({...chunk,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const launch=async()=>{
    ({app}=await require('./electron-test-launch.cjs').launchTestApp({electron,profile:path.join(root,'appdata')}));
    page=await app.firstWindow();await skipIntroduction(page);
    await app.evaluate(({dialog},project)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[project]});},project);await page.click('#open');await page.waitForSelector('#workspace:not([hidden])');
  };
  const send=async text=>{
    sentPrompts.push(text);
    await page.fill('#prompt',text);await page.click('#send');
    await page.waitForFunction(()=>document.querySelector('#data-dialog').open||!document.querySelector('#stop').hidden);
    if(await page.locator('#data-dialog').evaluate(el=>el.open))await page.click('#accept-send');
  };
  try {
    // Gendannelsens resultat står i samtalens resultatkort.
    await launch();await menuClick(page,'#git-button');
    const restoreTo=async name=>{await page.locator('#git-history .version-row').filter({hasText:name}).click();await page.click('#version-restore');await page.waitForSelector('#restore-dialog[open]');await page.waitForFunction(()=>!document.querySelector('#restore-confirm').disabled);};
    await restoreTo('Godkendt udgangspunkt');
    await page.click('#restore-dialog > details > summary'); await page.locator('#restore-files').filter({hasText:'Ugemt forsøg'}).waitFor();
    await page.click('[data-close="restore-dialog"]'); assert.match(await fs.readFile(pageFile,'utf8'),/Ugemt/);
    await page.click('#version-restore');await page.waitForFunction(()=>!document.querySelector('#restore-confirm').disabled);await page.click('#restore-confirm');
    await page.locator('#run-review').filter({hasText:'1 fil er sat tilbage'}).waitFor();
    await page.click('#tab-preview');await page.frameLocator('#preview').getByRole('heading',{name:'Godkendt version'}).waitFor();
    assert.equal((await git.status(project)).head,second.head); assert.equal(await fs.readFile(path.join(project,'.env'),'utf8'),'PRIVATE=kun-lokalt');
    await page.screenshot({path:path.join(root,'gendannet.png'),animations:'disabled'});
    await app.close();app=null;await launch();await menuClick(page,'#git-button');await page.click('#restore-undo');await page.waitForFunction(()=>!document.querySelector('#restore-confirm').disabled);await page.click('#restore-confirm');
    await page.locator('#run-review').filter({hasText:'er sat tilbage'}).waitFor();
    await page.click('#tab-preview');await page.frameLocator('#preview').getByRole('heading',{name:'Ugemt forsøg'}).waitFor();
    assert.equal((await git.status(project)).head,second.head);assert.equal(await fs.readFile(path.join(project,'noter.txt'),'utf8'),'Bevar denne fil');
    await require('./ui-test-helpers.cjs').addConnection(page,{name:'Kontrolleret fejlprøve',baseURL:`http://127.0.0.1:${server.address().port}/v1`});
    const state=await page.evaluate(()=>window.harness.connectionState());await taskOptions(page);await page.selectOption('#connection-select',state.value.connections[0].id);await page.locator('#model-shortlist button').first().click();await selectMode(page,'plan');
    for(const [failure,text] of [['key','prøve med forkert nøgle'],['quota','prøve med opbrugt kvote'],['stream','prøve med afbrudt forbindelse']]){
      mode=failure;await send(text);await page.locator('#run-status').filter({hasText:'Fejl'}).waitFor({timeout:60000});
      assert.equal(await page.inputValue('#prompt'),text);assert.equal(await page.isVisible('#plan-card'),false);
      assert.equal((await page.locator('#messages').textContent()).includes('SKJULT_UDVIDERTEKST'),false);
      await page.screenshot({path:path.join(root,failure+'.png'),animations:'disabled'});
      mode='ok';await send('Prøv igen efter '+failure);await page.locator('#run-status').filter({hasText:'Klar'}).waitFor({timeout:60000});await page.waitForSelector('#plan-card:not([hidden])');
    }
    mode='wait';await send('Bevar denne besked efter stop');await page.locator('#messages .assistant').filter({hasText:'Delvist svar før brugerens stop.'}).waitFor({timeout:60000});await page.click('#stop');await page.locator('#run-status').filter({hasText:'Stoppet'}).waitFor();
    assert.equal(await page.inputValue('#prompt'),'Bevar denne besked efter stop');assert.equal(await page.isVisible('#plan-card'),false);
    mode='ok';await send('Prøv igen efter stop');await page.locator('#run-status').filter({hasText:'Klar'}).waitFor({timeout:60000});
    assert.equal(requests,8,'Ingen automatisk gentagelse af fejlede opgavekald; separate V2-sammenfatninger er ikke genafsendelser');
    assert.deepEqual(requestKinds.filter(item=>item.kind==='task').map(item=>item.mode),['key','ok','quota','ok','stream','ok','wait','ok']);
    assert.equal(summaryRequests,7,'Præcis de syv observerede native sammenfatninger');
    assert.deepEqual(requestKinds.map(item=>`${item.kind}:${item.mode}`),[
      'task:key','summary:ok','task:ok','plan-reminder:ok',
      'summary:quota','task:quota','summary:ok','task:ok','plan-reminder:ok',
      'summary:stream','task:stream','summary:ok','task:ok','plan-reminder:ok',
      'summary:wait','task:wait','summary:ok','task:ok','plan-reminder:ok',
    ],'Alle 19 fysiske modelkald skal følge den afprøvede V2-sekvens uden ekstra kald');
    assert.equal(continuationRequests,4,'Kun én afgrænset native planpåmindelse efter hvert vellykket svar');
    for(const item of requestKinds.filter(item=>item.kind==='plan-reminder')){
      assert.equal(item.mode,'ok');
      assert.deepEqual(item.continuation,{previousKind:'task',previousMode:'ok',distinctPayload:true,completedAnswer:true,unchangedContext:true},'En fortsættelse må ikke skjule et genafsendt kald eller ændret opgavekontekst');
    }
    assert.equal(new Set(requestKinds.map(item=>item.bodyHash)).size,requestKinds.length,'Ingen identisk modelanmodning må blive genafsendt');
    assert.deepEqual(await page.locator('#messages .user').allTextContents(),sentPrompts,'Hver brugerbesked optræder præcis én gang i samtalen');
    assert.ok(requestKinds.every(item=>item.model==='recovery-model'),'Sammenfatning og opgaver bruger den valgte model');
    await page.waitForSelector('#plan-card:not([hidden])');await menuClick(page,'#git-button');await restoreTo('Godkendt udgangspunkt');await page.click('#restore-confirm');await page.locator('#run-review').filter({hasText:'er sat tilbage'}).waitFor();
    assert.equal(await page.isVisible('#plan-card'),false);assert.equal((await page.evaluate(()=>window.harness.connectionState())).value.workspace.plan,null);
    await app.evaluate(({safeStorage})=>{ safeStorage.isEncryptionAvailable=()=>{throw new Error('Hjælp må ikke kontakte nøgleringen');}; });
    await menuClick(page,'#support-button'); await page.getByText('Fejlrapport uden projektindhold',{exact:true}).click(); const report=await page.locator('#support-report').textContent();
    assert.equal(JSON.parse(report).noeglelagring,'ikke kontrolleret');
    for(const privateText of [project,'127.0.0.1','PRIVATE','recovery-model','Prøv igen'])assert.equal(report.includes(privateText),false);
    assert.ok(JSON.parse(report).senesteFejl.length>0);
    const target=path.join(root,'rapport.json');await app.evaluate(({dialog},target)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:target});},target);await page.click('#support-save');await page.locator('#support-status').filter({hasText:'gemt'}).waitFor();assert.equal(JSON.parse(await fs.readFile(target)).format,1);
    // Feedback følger kontakten i package.json: navn og adresse vises, og knappen åbner en e-mailkladde. Uden kontakt kun den generelle tekst.
    const person=require('../core/feedback.cjs').contact();
    if(person){
      await app.evaluate(({shell})=>{global.openedFeedback=[];shell.openExternal=async url=>{global.openedFeedback.push(url);};});
      assert.equal(await page.textContent('#support-contact'),`Send feedback til ${person.name}, ${person.email}.`);
      await page.click('#support-feedback');
      let opened=[];for(let i=0;i<50&&!opened.length;i++){opened=await app.evaluate(()=>global.openedFeedback);if(!opened.length)await new Promise(r=>setTimeout(r,100));}
      assert.equal(opened.length,1,'knappen åbner én e-mailkladde');
      const mail=new URL(opened[0]);assert.equal(mail.protocol,'mailto:');assert.equal(mail.pathname,person.email);assert.match(mail.searchParams.get('subject'),/^Feedback om Aura /);
    }else{assert.equal(await page.textContent('#support-contact'),'Send feedback til den, der inviterede dig.');assert.equal(await page.isVisible('#support-feedback'),false);}
    await page.screenshot({path:path.join(root,'feedback.png'),animations:'disabled'});
    console.log(JSON.stringify({status:'bestået',root,requests,summaryRequests,continuationRequests,requestKinds,checks:['gendan og fortryd gennem UI og genstart','HEAD og private filer bevaret','forkert nøgle og kvote med kladde bevaret','afbrudt HTTP-strøm bliver en fejl','ny plan efter hver fejl og stop','fejlrapport gennem filvælger uden projektindhold','feedback til kontakten i package.json'],limitation:'Kontrolleret modelserver; ingen vurdering af en rigtig models svar. V2 foretager et ekstra modelkald med planpåmindelsen efter sammenfatning og et vellykket svar; det er ekstra modelarbejde, ikke en genafsendt brugerbesked.'}));
  }catch(error){console.error('Testmateriale: '+root);console.error(JSON.stringify({requests,summaryRequests,continuationRequests,requestKinds}));console.error(error.message);await page?.screenshot({path:path.join(root,'fejl.png'),animations:'disabled',timeout:3000}).catch(()=>{});throw error;}
  finally{await app?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
