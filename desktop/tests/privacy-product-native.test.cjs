// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Opt-in process/transport acceptance, not a model-quality benchmark. The real
// pinned OpenCode, gateway, provider, history and macOS sandbox run against a
// controlled HTTP model protocol. All source data and model responses are synthetic.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { randomBytes, createCipheriv, createDecipheriv, randomUUID } = require('node:crypto');
const { Workbench } = require('../core/workbench.cjs');
const { PrivacyRuntimeProvider } = require('../core/privacy-runtime-provider.cjs');
const { startGateway } = require('../core/gateway.cjs');
const enabled = process.platform === 'darwin' && process.env.AURA_PRIVACY_NATIVE === '1';
const native = { skip: enabled ? false : 'Set AURA_PRIVACY_NATIVE=1 on a qualified macOS host.', timeout: 150_000 };
function safeStorage() {
  const key = randomBytes(32);
  return { isEncryptionAvailable: () => true, encryptString(text) { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); },
    decryptString(bytes) { const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12)); cipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString(); } };
}
function send(res, body, { content = 'Controlled model completed this stage.', tool, hold = false } = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const chunk = (delta, finish_reason = null) => res.write('data: ' + JSON.stringify({ id:'chatcmpl-'+randomUUID(),object:'chat.completion.chunk',created:1,model:body.model,choices:[{index:0,delta,finish_reason}] }) + '\n\n');
  if (tool) chunk({role:'assistant',tool_calls:[{index:0,id:tool.id,type:'function',function:{name:tool.name,arguments:JSON.stringify(tool.input)}}]});
  else chunk({role:'assistant',content});
  if (hold) return;
  chunk({},tool?'tool_calls':'stop'); res.end('data: [DONE]\n\n');
}
async function fixture(t,{mode='cloud-controlled',response,privateSources=false,appInterface=false,decision=()=> 'approve'}={}) {
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'aura native privacy-'));
  const projectRoot=path.join(root,'project'), profile=path.join(root,'profile');
  await fs.mkdir(projectRoot,{mode:0o700}); await fs.mkdir(profile,{mode:0o700}); await fs.mkdir(path.join(projectRoot,'public'));
  await fs.writeFile(path.join(projectRoot,'public/index.html'),'<main>Original demo</main>');
  await fs.writeFile(path.join(projectRoot,'.env'),'SYNTHETIC_SECRET_MUST_STAY_HOST');
  if(privateSources)await fs.writeFile(path.join(projectRoot,'citizens.csv'),'Citizen,Email,Duration\nPRIVATE_CANARY_PERSON,private.canary@example.invalid,17\n');
  const wire=[], events=[], permissions=[], pending=[], model={id:'privacy-fixture',name:'Privacy fixture',limits:{context:262144,output:4096},capabilities:{tools:true}};
  const server=http.createServer(async(req,res)=>{try{if(req.method==='GET'&&/^\/(local|cloud)\/v1\/models$/.test(req.url)){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({data:[{id:model.id,name:model.name,context_length:262144,max_output_tokens:4096,capabilities:{function_calling:true}}]}));return;}const buffers=[];for await(const chunk of req)buffers.push(chunk);const body=JSON.parse(Buffer.concat(buffers).toString());const request={path:req.url,body};wire.push(request);if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify({path:request.path,activeInstructions:systemText(body),toolNames:body.tools?.map(v=>v.function?.name),messageCount:body.messages?.length}));response?await response(request,res,wire):send(res,body);}catch{res.writeHead(500);res.end('Controlled fixture error');}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
  const storage=safeStorage();let engine;
  const makeBench=()=>new Workbench({directory:profile,safeStorage:storage,library:appInterface?()=>require('../core/library.cjs').loadLibrary(path.resolve(__dirname,'../../profiles')):async()=>({rules:'Use only synthetic fixtures. Preserve concrete tool approvals and the approved plan.',skills:[],features:[]}),emit(event){events.push(event);if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1'&&['session.error','engine.error'].includes(event.type))t.diagnostic(JSON.stringify(event));if(event.type==='privacy.review')setImmediate(()=>bench.privacy.decide({id:event.id,decision:decision(event,wire)}));if(appInterface&&event.type==='permission.asked'){permissions.push(event.properties);const answer=new Promise(resolve=>setImmediate(resolve)).then(()=>bench.reply({chat:event.chat,id:event.properties.id,allow:true,scope:'once'}));pending.push(answer);answer.catch(error=>t.diagnostic('Concrete approval failed: '+error.message));}}});
  let bench=makeBench();const project={root:projectRoot,name:'Synthetic privacy project',purpose:'Controlled transport acceptance'};bench.project=project;
  const connections=['local','cloud'].map(id=>({id,kind:'compatible',name:id,baseURL:origin+'/'+id+'/v1'}));
  await bench.store.update(state=>{state.connections=connections;});for(const connection of connections)bench.catalogs.set(connection.id,[model]);
  const history=await bench.history.open(project);let data=await bench.history.readChat(projectRoot,history.active);
  let chat={project,root:projectRoot,id:data.id,data,task:{id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()}};
  bench.chats.set(chat.id,chat);bench.chatID=chat.id;
  const pair={local:{connectionID:'local',modelID:model.id},external:{connectionID:'cloud',modelID:model.id}};
  const rules={enabled:true,version:'synthetic-policy-1',workMode:mode,defaultClass:'public',maxClass:'internal',allowedDestinationIds:['local','cloud'],hybridPair:pair,...(privateSources?{protectedSources:[{path:'citizens.csv',classification:'confidential',attributes:{personalData:true}}]}:{})};
  await bench.store.saveProject(projectRoot,{privacy:rules});await fs.mkdir(path.join(profile,'privacy'),{mode:0o700});
  await fs.writeFile(path.join(profile,'privacy/destinations.json'),JSON.stringify(Object.fromEntries(connections.map(c=>[c.id,{endpoint:c.baseURL,locality:c.id==='local'?'device':'cloud',revision:'synthetic-registry-1'}]))),{mode:0o600});
  if(mode==='hybrid'){
    await fs.writeFile(path.join(profile,'privacy/organization-policy.json'),JSON.stringify({enabled:true,version:'org-1',workMode:'hybrid',maxClass:'internal',allowedDestinationIds:['local','cloud'],hybridReleaseRules:[{id:'csv',version:'1',transform:'csv-generic-schema-v1',projectRoot,sourceIds:['cases'],destinationIds:['cloud'],purposes:['hybrid-cloud-help'],sourceClasses:['confidential'],allowPersonalData:true,maxColumns:16,ttlMs:300000}]}),{mode:0o600});
    await fs.writeFile(path.join(profile,'privacy/hybrid-sources.json'),JSON.stringify({sources:[{id:'cases',path:'citizens.csv',projectRoot,classification:'confidential',attributes:{personalData:true}}]}),{mode:0o600});
  }
  if(appInterface){bench.chats.clear();bench.chatID=null;await bench.activate(await require('../core/projects.cjs').openProject(projectRoot));assert.ok(bench.chat,'The real Workbench opens a ChatSession');chat=bench.chat;}
  const open=async()=>{
    bench.privacyRuntimeProvider=new PrivacyRuntimeProvider(bench,{createGateway:(c,m,k,r,f,o)=>startGateway(c,m,k,r,(message,info)=>{t.diagnostic(JSON.stringify({gatewayFailure:message,...info,wireCount:wire.length}));f(message,info);},{...o,dispatch:async(...args)=>{try{return await o.dispatch(...args);}catch(error){if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify({dispatchFailure:error.message,code:error.code,details:error.details}));throw error;}}})});
    chat.data=await bench.history.readChat(projectRoot,chat.id);
    const prepared={mode:'free',connection:connections.find(c=>c.id===(mode==='local'?'local':'cloud')),model,context:{rules:'Synthetic approved task context.',skills:[]},references:[],chatMaterials:{files:[]}};
    prepared.privacy=await bench.privacyRuntimeProvider.prepareChat(chat,prepared);
    engine=await bench.privacyRuntimeProvider.createChatEngine({chat,prepared,assertCurrent:()=>true,onEvent(event){events.push(event);if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1'&&['session.error','engine.error'].includes(event.type))t.diagnostic(JSON.stringify(event));if(event.type==='permission.asked'){permissions.push(event.properties);const task=Promise.resolve().then(()=>engine.reply(event.properties.id,true));pending.push(task);task.catch(()=>{});}}});
    await engine.start();return engine;
  };
  t.after(async()=>{await engine?.close().catch(()=>{});if(appInterface)await bench.close();clearTimeout(bench.chatsTimer);bench.privacy.cancelScope();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
  const restart=async()=>{await engine?.close();bench=makeBench();bench.project=project;for(const c of connections)bench.catalogs.set(c.id,[model]);bench.chats.set(chat.id,chat);bench.chatID=chat.id;return open();};
  return {root,profile,projectRoot,wire,events,permissions,pending,chat,open,restart,get engine(){return engine;},get bench(){return bench;},send};
}
function systemText(body){
  // V2 preserves the initial system prompt and appends an authoritative
  // instruction update when resuming the same session. Drive this controlled
  // model from the latest task entry, not the obsolete first-stage text.
  for(const message of [...body.messages].reverse()) {
    const content=typeof message.content==='string'?message.content:'';
    if(!content.startsWith('<system-update>')||!content.includes('changed and supersedes the previous value:'))continue;
    const update=/&lt;context key="aura-task"&gt;\n([\s\S]*?)\n&lt;\/context&gt;/.exec(content);
    if(update)return update[1].replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  }
  return body.messages.filter(m=>m.role==='system').map(m=>typeof m.content==='string'?m.content:JSON.stringify(m.content)).join('\n');
}
function pathTool(body, name) {
  const tool = body.tools?.find(value => value.function?.name === name);
  assert.ok(tool, `The real engine must expose ${name}.`);
  assert.ok(tool.function.parameters?.properties?.path, `${name} must exercise the actual V2 path contract, not fail schema validation before its security checks.`);
  return tool;
}
function writeReply(request,res,wire){
  const body=request.body, system=systemText(body), writable=body.tools?.find(tool=>tool.function?.name==='write');
  const completed=body.messages.some(m=>m.role==='tool'&&m.tool_call_id==='call_write_once');
  if(writable&&!completed){pathTool(body,'write');request.generatedTool='write';const root=/actual writable workspace is (.+?)\nUse only this workspace/.exec(system)?.[1];assert.ok(root,'actual workspace instruction');send(res,body,{tool:{id:'call_write_once',name:'write',input:{path:path.join(root,'public/result.txt'),content:'Approved isolated result\n'}}});}
  else send(res,body,{content:completed?'Finished one approved write.':'Prepared generic synthetic UI.'});
}
test('native product controlled-cloud: actual isolated OpenCode writes after concrete permission and restores its own history',native,async t=>{
  const f=await fixture(t,{response:writeReply});let engine=await f.open();
  await engine.send('Create one result file in this public demo.','Use the approved synthetic task.');
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');assert.ok(f.permissions.length>=1);
  assert.equal(f.wire.every(r=>r.path==='/cloud/v1/chat/completions'),true);
  assert.equal(JSON.stringify(f.wire).includes('PRIVATE_CANARY_PERSON'),false);assert.equal(JSON.stringify(f.wire).includes('SYNTHETIC_SECRET_MUST_STAY_HOST'),false);
  const before=f.wire.length;engine=await f.restart();f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send('Confirm the previous result without making another write.','Use this conversation history.');
  assert.ok(f.wire.length>before);assert.ok(JSON.stringify(f.wire.slice(before)).includes('Finished one approved write.'));
  assert.equal(f.wire.filter(r=>r.generatedTool==='write').length,1,'Restart must not replay the previous write.');
  assert.equal(f.chat.data.privacySession.state,'complete');
});
test('native product local-only: actual pinned engine completes without any cloud request',native,async t=>{
  const f=await fixture(t,{mode:'local'});const engine=await f.open();await engine.send('Keep PRIVATE_LOCAL_CANARY in this local-only conversation.','Only this computer.');
  assert.ok(f.wire.length>0);assert.ok(f.wire.every(r=>r.path==='/local/v1/chat/completions'));assert.ok(JSON.stringify(f.wire).includes('PRIVATE_LOCAL_CANARY'));
  assert.equal(f.chat.data.privacySession.state,'complete');
});
test('native product hybrid: local preparation, content-bound synthetic CSV cloud help, local assembly and approved write',native,async t=>{
  const f=await fixture(t,{mode:'hybrid',privateSources:true,response(request,res,wire){if(request.path.startsWith('/local/')&&systemText(request.body).includes('Saml resultatet lokalt.'))writeReply(request,res,wire);else send(res,request.body);}});
  const engine=await f.open();await engine.send('Build the case overview for private.canary@example.invalid from citizens.csv.','Follow the approved synthetic project plan.');
  const local=f.wire.filter(r=>r.path.startsWith('/local/')),cloud=f.wire.filter(r=>r.path.startsWith('/cloud/'));
  assert.ok(local.length>=2);assert.ok(cloud.length>=1);assert.ok(JSON.stringify(local).includes('private.canary@example.invalid'));
  for(const value of ['PRIVATE_CANARY_PERSON','private.canary@example.invalid','Citizen','citizens.csv','SYNTHETIC_SECRET_MUST_STAY_HOST'])assert.equal(JSON.stringify(cloud).includes(value),false,value);
  assert.ok(JSON.stringify(cloud).includes('COLUMN_1'));assert.ok(f.events.some(e=>e.type==='privacy.review'));assert.ok(f.permissions.length);
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');assert.equal(f.chat.data.privacySession.state,'complete');
});
test('native product Stop retires actual engine scope and does not replay or publish an unfinished response',native,async t=>{
  let observed;const seen=new Promise(resolve=>observed=resolve);
  const f=await fixture(t,{response(request,res){send(res,request.body,{content:'Still working',hold:true});observed();}});const engine=await f.open();
  const running=engine.send('Do not finish before Stop.','Synthetic cancellation test.');void running.catch(()=>{});await seen;await engine.abort();await assert.rejects(running);
  assert.equal(f.wire.length,1);assert.equal(await fs.readFile(path.join(f.projectRoot,'public/index.html'),'utf8'),'<main>Original demo</main>');await assert.rejects(fs.stat(path.join(f.projectRoot,'public/result.txt')),{code:'ENOENT'});
});

test('native V2 protected shell rejects background execution without granting or publishing a write',native,async t=>{
  let workerRoot;
  const f=await fixture(t,{mode:'local',response(request,res){
    const body=request.body, completed=body.messages.some(message=>message.role==='tool'&&message.tool_call_id==='background_attempt');
    if(completed){send(res,body,{content:'The forbidden background command did not run.'});return;}
    const shell=body.tools?.find(tool=>tool.function?.name==='shell');assert.ok(shell,'V2 exposes its actual shell contract.');
    workerRoot=/actual writable workspace is (.+?)\nUse only this workspace/.exec(systemText(body))?.[1];assert.ok(workerRoot);
    send(res,body,{tool:{id:'background_attempt',name:'shell',input:{command:'printf forbidden > public/background.txt',workdir:workerRoot,background:true}}});
  }});
  const engine=await f.open();await engine.send('Exercise the prohibited background shell with synthetic data.','No background processes are authorized.');
  assert.ok(workerRoot);assert.equal(f.permissions.length,0,'The forbidden execution must not acquire a normal tool grant.');
  const results=f.wire.flatMap(request=>request.body.messages.filter(message=>message.role==='tool'));
  assert.ok(results.some(message=>/denied|invalid|false|schema|background|permission/i.test(JSON.stringify(message.content))),'The actual V2 tool reports the rejected input.');
  await assert.rejects(fs.stat(path.join(workerRoot,'public/background.txt')),{code:'ENOENT'});
  await assert.rejects(fs.stat(path.join(f.projectRoot,'public/background.txt')),{code:'ENOENT'});
  await engine.close();
});

test('native V2 protected foreground shell obeys Stop and never publishes its interrupted writes',native,async t=>{
  let workerRoot, observed;const seen=new Promise(resolve=>observed=resolve);
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  const f=await fixture(t,{response(request,res){
    const body=request.body;assert.ok(body.tools?.some(tool=>tool.function?.name==='shell'),'V2 exposes its actual shell contract.');
    workerRoot=/actual writable workspace is (.+?)\nUse only this workspace/.exec(systemText(body))?.[1];assert.ok(workerRoot);
    const code="const fs=require('node:fs');const tick=()=>fs.appendFileSync('public/running.txt','.');tick();setInterval(tick,5);";
    const node=path.resolve(__dirname,'../.runtime/darwin-arm64/node/bin/node');
    send(res,body,{tool:{id:'foreground_stop',name:'shell',input:{command:quote(node)+' -e '+quote(code),workdir:workerRoot,background:false,timeout:30000}}});observed();
  }});
  const engine=await f.open(),running=engine.send('Start one explicitly approved synthetic foreground command, then stop it.','Do not publish unfinished files.');void running.catch(()=>{});
  await seen;const writing=path.join(workerRoot,'public/running.txt');let bytes;
  for(let attempt=0;attempt<200;attempt++){bytes=await fs.readFile(writing,'utf8').catch(()=>null);if(bytes)break;await new Promise(resolve=>setTimeout(resolve,25));}
  assert.ok(bytes,'The actual approved V2 shell must execute before Stop.');assert.ok(f.permissions.some(permission=>permission.permission==='bash'));
  await engine.abort();await assert.rejects(running);const stoppedBytes=await fs.readFile(writing,'utf8');
  await new Promise(resolve=>setTimeout(resolve,150));assert.equal(await fs.readFile(writing,'utf8'),stoppedBytes,'No isolated writer remains after Stop acknowledges.');
  assert.equal(f.wire.length,1,'Stop must not replay the interrupted tool.');
  await assert.rejects(fs.stat(path.join(f.projectRoot,'public/running.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/index.html'),'utf8'),'<main>Original demo</main>');
});


test('native product full tool grant still cannot read an original host secret from cloud isolation',native,async t=>{
  let target;
  const f=await fixture(t,{response(request,res){const body=request.body;const finished=body.messages.some(m=>m.role==='tool'&&m.tool_call_id==='call_forbidden_read');if(!finished){pathTool(body,'read');send(res,body,{tool:{id:'call_forbidden_read',name:'read',input:{path:target}}});}else send(res,body,{content:'The protected original could not be read.'});}});
  target=path.join(f.projectRoot,'.env');const engine=await f.open();await engine.send('Test an original-file read under a synthetic explicit tool grant.','Only the isolated workspace is allowed.');
  assert.ok(f.wire.length>=2);assert.equal(JSON.stringify(f.wire).includes('SYNTHETIC_SECRET_MUST_STAY_HOST'),false);assert.equal(await fs.readFile(target,'utf8'),'SYNTHETIC_SECRET_MUST_STAY_HOST');
  const toolMessages=f.wire.flatMap(r=>r.body.messages.filter(m=>m.role==='tool'));
  if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify(toolMessages));
  assert.ok(toolMessages.some(m=>/denied|not permitted|not found|protected|uden for|ikke tilladt|afvist|beskytter|EACCES|EPERM|ENOENT/i.test(JSON.stringify(m.content))),'The real tool must report denied access.');
});

const concretePlan = '## Det bygger vi\nEn offentlig demofil i projektet.\n\n## Sådan skal det se ud\nEn enkel, læsbar tekstvisning.\n\n## Teknik og data\nKun syntetiske data og en lokal tekstfil.\n\n## Det skal du prøve\nÅbn resultatfilen og kontrollér teksten.';
async function appSend(f, text, mode, extra={}) {
  const chat=f.bench.chat;
  const review=await f.bench.prepare({chat:chat.id,text,mode,connectionID:'cloud',modelID:'privacy-fixture',...extra});
  assert.ok(review.fingerprint);assert.ok(review.contextBinding);
  if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1')process.stderr.write(JSON.stringify({mode,appContextBytes:Buffer.byteLength(chat.prepared.appContext.system)})+'\n');
  await f.bench.send({chat:chat.id,text,fingerprint:review.fingerprint,contextBinding:review.contextBinding});
  if(chat.finishing)await chat.finishing;
  await Promise.all(f.pending);
  assert.equal(chat.running,false,'The real ChatSession has completed its lifecycle.');
  return review;
}
test('native Workbench and ChatSession preserve Plan → explicit Build → concrete permission → isolated writeback',native,async t=>{
  const f=await fixture(t,{appInterface:true,response(request,res,wire){if(systemText(request.body).includes('PLANLÆGNING:'))send(res,request.body,{content:concretePlan});else writeReply(request,res,wire);}});
  await appSend(f,'Foreslå en konkret plan for én offentlig resultatfil.','plan');
  const plan=f.bench.chat.plan;assert.ok(plan?.id,'The real assistant reply becomes a concrete plan');assert.equal(plan.text,concretePlan);
  assert.equal(f.permissions.length,0);await assert.rejects(fs.stat(path.join(f.projectRoot,'public/result.txt')),{code:'ENOENT'});
  await assert.rejects(f.bench.prepare({text:'Byg den.',mode:'build',connectionID:'cloud',modelID:'privacy-fixture',planID:'unapproved-plan'}),/seneste plan/);
  await appSend(f,'Byg den valgte plan.','build',{planID:plan.id});
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');
  assert.ok(f.permissions.length>=1);if(process.env.AURA_PRIVACY_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify(f.permissions));assert.ok(f.permissions.every(p=>p.policy?.projectFile===true&&p.policy.blockedMode!==true),'Actual ChatSession permission policy validates the mapped host file.');
  assert.equal(f.bench.chat.plan.id,plan.id);assert.ok(f.bench.chat.plan.builtAt);
  assert.ok(f.events.some(e=>e.type==='plan.ready'));assert.ok(f.events.some(e=>e.type==='run.review'&&e.mode==='build'&&e.status==='idle'&&e.files.includes('public/result.txt')));
  assert.equal(f.wire.filter(r=>r.generatedTool==='write').length,1);assert.ok(f.wire.every(r=>r.path==='/cloud/v1/chat/completions'));
  assert.equal(JSON.stringify(f.wire).includes('SYNTHETIC_SECRET_MUST_STAY_HOST'),false);
  assert.equal(f.bench.chat.data.privacySession.state,'complete');
});
test('native Workbench rejects private first-message content before any cloud model byte is sent',native,async t=>{
  const f=await fixture(t,{appInterface:true});
  const text='Build a case overview for private.canary@example.invalid.';
  await assert.rejects(appSend(f,text,'plan'),error=>['PRIVACY_LOCAL_REQUIRED','PRIVACY_BLOCKED'].includes(error.code));
  assert.equal(f.wire.length,0);assert.equal(await fs.readFile(path.join(f.projectRoot,'public/index.html'),'utf8'),'<main>Original demo</main>');
});
test('native Workbench keeps a reviewed private attachment local even when the typed prompt is public',native,async t=>{
  const f=await fixture(t,{appInterface:true});const chat=f.bench.chat;
  f.bench.chatMaterials=new (require('../core/chat-materials.cjs').ChatMaterials)({onChange:event=>f.bench.emit(event)});
  const source=path.join(f.root,'selected-cases.csv');await fs.writeFile(source,'Name,Email\nPRIVATE_ATTACHMENT_CANARY,attachment.canary@example.invalid\n');
  const offered=await f.bench.chatMaterials.offerFiles(chat,[source]);
  const review=await f.bench.chatMaterials.preview(chat,{scope:offered.scope,revision:offered.revision,ids:offered.candidates.map(file=>file.id)});
  const attached=await f.bench.chatMaterials.attach(chat,{scope:review.scope,revision:review.revision,token:review.token});
  assert.equal(attached.selected.length,1);
  await assert.rejects(appSend(f,'Describe the selected data structure.','plan',{chatMaterials:{scope:attached.scope,revision:attached.revision}}),error=>error.code==='PRIVACY_LOCAL_REQUIRED');
  assert.equal(f.wire.length,0);assert.equal(JSON.stringify(f.wire).includes('PRIVATE_ATTACHMENT_CANARY'),false);
  assert.equal(await fs.readFile(source,'utf8'),'Name,Email\nPRIVATE_ATTACHMENT_CANARY,attachment.canary@example.invalid\n');
});
test('native product hybrid local-model failure never falls back to its configured cloud model',native,async t=>{
  const f=await fixture(t,{mode:'hybrid',privateSources:true,response(request,res){res.writeHead(400,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'Synthetic local model unavailable',type:'invalid_request_error'}}));}});
  const engine=await f.open();await assert.rejects(engine.send('Build a case overview from the local CSV.','Keep protected work local.'));
  assert.ok(f.wire.length>=1);assert.ok(f.wire.every(r=>r.path.startsWith('/local/')));
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/index.html'),'utf8'),'<main>Original demo</main>');
  await assert.rejects(fs.stat(path.join(f.projectRoot,'public/result.txt')),{code:'ENOENT'});
});
test('native Workbench hybrid preserves an approved plan while private data stays in local stages',native,async t=>{
  const f=await fixture(t,{appInterface:true,mode:'hybrid',privateSources:true,response(request,res,wire){
    const system=systemText(request.body);
    if(request.path.startsWith('/local/')&&system.includes('Saml resultatet lokalt.')){
      if(system.includes('PLANLÆGNING:'))send(res,request.body,{content:concretePlan});else writeReply(request,res,wire);
    }else send(res,request.body,{content:'Prepared the permitted stage.'});
  }});
  await appSend(f,'Lav en plan for oversigten fra citizens.csv til private.canary@example.invalid.','plan');
  const plan=f.bench.chat.plan;assert.ok(plan?.id);assert.equal(f.permissions.length,0);
  await appSend(f,'Byg den godkendte oversigt.','build',{planID:plan.id});
  const cloud=f.wire.filter(request=>request.path.startsWith('/cloud/'));
  assert.ok(cloud.length>=2);assert.ok(f.wire.filter(request=>request.path.startsWith('/local/')).length>=4);
  for(const value of ['citizens.csv','PRIVATE_CANARY_PERSON','private.canary@example.invalid','SYNTHETIC_SECRET_MUST_STAY_HOST'])assert.equal(JSON.stringify(cloud).includes(value),false,value);
  assert.ok(cloud.every(request=>JSON.stringify(request.body).includes('COLUMN_1')));
  assert.equal(f.bench.chat.plan.id,plan.id);assert.ok(f.bench.chat.plan.builtAt);
  assert.ok(f.permissions.length>=1);assert.ok(f.permissions.every(p=>p.policy?.projectFile===true));
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');
  assert.equal(f.bench.chat.data.privacySession.state,'complete');
});

test('native recovery: Stop then a different explicit send preserves successful history and interrupted context',native,async t=>{
  let hold=true, observed;const seen=new Promise(resolve=>observed=resolve);
  const f=await fixture(t,{response(request,res){
    const last=request.body.messages.filter(m=>m.role==='user').at(-1)?.content||'';
    if(hold&&String(last).includes('INTERRUPTED_PRIVATE_TASK')){send(res,request.body,{content:'Partial response must not become completed context.',hold:true});observed();}
    else send(res,request.body,{content:'SUCCESSFUL_PRIOR_CONTEXT'});
  }});
  let engine=await f.open();await engine.send('Remember successful prior context.','Stable approved context.');
  f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  const running=engine.send('INTERRUPTED_PRIVATE_TASK: keep the original task context.','Stable approved context.');void running.catch(()=>{});await seen;await engine.abort();await assert.rejects(running);
  hold=false;const before=f.wire.length;engine=await f.restart();f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send('Fortsæt med min opgave.','Stable approved context.');
  const sent=JSON.stringify(f.wire.slice(before));assert.ok(sent.includes('SUCCESSFUL_PRIOR_CONTEXT'));assert.ok(sent.includes('INTERRUPTED_PRIVATE_TASK'));
  assert.equal(sent.includes('Partial response must not become completed context.'),false);
  assert.equal(f.chat.data.privacySession.state,'complete');
});

test('native recovery: hybrid Stop in cloud stage resumes identical task without repeating completed local preparation',native,async t=>{
  let hold=true,observed;const seen=new Promise(resolve=>observed=resolve);
  const f=await fixture(t,{mode:'hybrid',privateSources:true,response(request,res){
    if(hold&&request.path.startsWith('/cloud/')){send(res,request.body,{content:'Unfinished cloud work',hold:true});observed();}
    else send(res,request.body,{content:request.path.startsWith('/local/')?'SAVED_LOCAL_STAGE_RESULT':'CLOUD_STAGE_RESULT'});
  }});
  let engine=await f.open();const prompt='Build a protected overview from citizens.csv.',system='Stable approved synthetic plan.';
  const running=engine.send(prompt,system);void running.catch(()=>{});await seen;await engine.abort();await assert.rejects(running);
  const preparations=()=>f.wire.filter(r=>r.path.startsWith('/local/')&&systemText(r.body).includes('Undersøg opgaven lokalt.')).length;
  assert.equal(preparations(),1);hold=false;const before=f.wire.length;engine=await f.restart();f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send(prompt,system);assert.equal(preparations(),1,'Completed local stage must not execute again.');
  assert.ok(JSON.stringify(f.wire.slice(before).filter(r=>r.path.startsWith('/local/'))).includes('SAVED_LOCAL_STAGE_RESULT'));
  assert.equal(JSON.stringify(f.wire.filter(r=>r.path.startsWith('/cloud/'))).includes('citizens.csv'),false);
});

test('native recovery: completed writeback before history-save failure returns the saved result without duplicate tools or permissions',native,async t=>{
  const f=await fixture(t,{response:writeReply});let engine=await f.open();
  const store=engine.runtime.store,save=store.save.bind(store);let fail=true;
  store.save=async(scope,state)=>{if(fail&&state.status==='complete'){fail=false;throw Error('Controlled history-save fault after publication');}return save(scope,state);};
  const prompt='Write one approved file exactly once.',system='Stable approved recovery plan.';
  await assert.rejects(engine.send(prompt,system));assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');
  const requests=f.wire.length,permissions=f.permissions.length;engine=await f.restart();f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send(prompt,system);
  assert.equal(f.wire.length,requests,'Reconciled successful output must not be sent to the model again.');assert.equal(f.permissions.length,permissions,'Exact previous approvals must not be emitted a second time.');
  assert.equal(f.chat.data.privacySession.state,'complete');
});

test('native controlled-cloud local choice preserves separate local history and performs approved local work after zero-writer retirement',native,async t=>{
  let localChoice=false;
  const f=await fixture(t,{decision:()=>localChoice?'local':'approve',response(request,res,wire){if(request.path.startsWith('/local/'))writeReply(request,res,wire);else send(res,request.body,{content:'SYNTHETIC_CLOUD_PRIOR_REPLY'});}});
  await f.bench.store.update(state=>{state.projects[f.bench.store.projectKey(f.projectRoot)].privacy.requireApproval=true;});
  let engine=await f.open();await engine.send('CLOUD-ONLY-HISTORY request.','Trusted approved context.');
  const cloudBefore=f.wire.filter(r=>r.path.startsWith('/cloud/')).length;assert.equal(cloudBefore,1);
  localChoice=true;f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send('LOCAL-ONLY-TASK: create the requested result.','Trusted approved context.');
  assert.equal(f.wire.filter(r=>r.path.startsWith('/cloud/')).length,cloudBefore);
  const local=f.wire.filter(r=>r.path.startsWith('/local/'));assert.ok(local.length>=2);
  assert.doesNotMatch(JSON.stringify(local),/CLOUD-ONLY-HISTORY|SYNTHETIC_CLOUD_PRIOR_REPLY/);
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');
  assert.ok(f.permissions.length);assert.ok(f.events.some(e=>e.type==='privacy.local-processing'&&e.properties.connectionID==='local'));
  assert.ok(f.events.some(e=>e.type==='message.part.updated'&&e.properties.part?.type==='step-finish'&&e.privacySelection?.connectionID==='local'&&e.privacySelection.contextWindow===262144),'actual local metadata is attached to usage, not the originally selected cloud model');
  engine=await f.restart();f.chat.task={id:randomUUID(),aiFiles:new Set(),aiHashes:new Map()};
  await engine.send('Confirm the prior local result.','Trusted approved context.');
  const later=f.wire.filter(r=>r.path.startsWith('/local/')).slice(local.length);
  assert.match(JSON.stringify(later),/Finished one approved write/);assert.doesNotMatch(JSON.stringify(later),/CLOUD-ONLY-HISTORY|SYNTHETIC_CLOUD_PRIOR_REPLY/);
  assert.equal(f.wire.filter(r=>r.generatedTool==='write').length,1,'local recovery never replays the already completed write');
});

test('native local choice after a cloud tool turn discards the cloud copy before independent local work',native,async t=>{
  const f=await fixture(t,{decision:(_review,wire)=>wire.some(r=>r.path.startsWith('/cloud/'))?'local':'approve',response(request,res,wire){
    if(request.path.startsWith('/cloud/')){pathTool(request.body,'write');const root=/actual writable workspace is (.+?)\nUse only this workspace/.exec(systemText(request.body))?.[1];assert(root);send(res,request.body,{tool:{id:'cloud_uncommitted',name:'write',input:{path:path.join(root,'public/cloud-uncommitted.txt'),content:'CLOUD_PRIVATE_RESULT'}}});}
    else writeReply(request,res,wire);
  }});
  await f.bench.store.update(state=>{state.projects[f.bench.store.projectKey(f.projectRoot)].privacy.requireApproval=true;});
  const engine=await f.open();await engine.send('Create the requested result.','Trusted approved context.');
  assert.equal(f.wire.filter(r=>r.path.startsWith('/cloud/')).length,1,'the pending second cloud request must not leave Aura');
  const local=f.wire.filter(r=>r.path.startsWith('/local/'));assert.ok(local.length>=2);assert.doesNotMatch(JSON.stringify(local),/CLOUD_PRIVATE_RESULT|cloud_uncommitted/);
  await assert.rejects(fs.access(path.join(f.projectRoot,'public/cloud-uncommitted.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');
});

test('native hybrid local choice skips the declined cloud stage and preserves local preparation for approved assembly',native,async t=>{
  const f=await fixture(t,{mode:'hybrid',privateSources:true,decision:()=> 'local',response(request,res,wire){
    if(systemText(request.body).includes('Saml resultatet lokalt.'))writeReply(request,res,wire);
    else send(res,request.body,{content:'PRESERVED_LOCAL_PREPARATION'});
  }});
  const engine=await f.open();await engine.send('Build the case overview from citizens.csv.','Keep the approved task and concrete tool permissions.');
  assert.ok(f.events.some(e=>e.type==='privacy.review'),'the concrete sharing was reviewed');
  assert.equal(f.wire.filter(r=>r.path.startsWith('/cloud/')).length,0,'declined sharing sends zero cloud bytes');
  assert.equal(f.wire.filter(r=>systemText(r.body).includes('Undersøg opgaven lokalt.')).length,1,'completed preparation is retained, not replayed');
  const assembly=f.wire.filter(r=>systemText(r.body).includes('Saml resultatet lokalt.'));
  assert.ok(assembly.length>=2);assert.match(JSON.stringify(assembly),/PRESERVED_LOCAL_PREPARATION/);
  assert.ok(f.events.some(e=>e.type==='privacy.local-processing'&&e.properties.connectionID==='local'));
  const usages=f.events.filter(e=>e.type==='message.part.updated'&&e.properties.part?.type==='step-finish');
  assert.ok(usages.length>=2);assert.ok(usages.every(e=>e.privacySelection?.connectionID==='local'&&typeof e.privacySelection.stageSessionID==='string'));
  assert.equal(await fs.readFile(path.join(f.projectRoot,'public/result.txt'),'utf8'),'Approved isolated result\n');assert.ok(f.permissions.length);
  assert.equal(f.chat.data.privacySession.state,'complete');
});

test('native Workbench Stop permits a new explicit message with previous and interrupted context intact',native,async t=>{
  let hold=false,observed;const seen=new Promise(resolve=>observed=resolve);
  const f=await fixture(t,{appInterface:true,response(request,res){
    if(hold){send(res,request.body,{content:'UNFINISHED_RESPONSE',hold:true});observed();}
    else send(res,request.body,{content:'SUCCESSFUL_WORKBENCH_CONTEXT'});
  }});
  await appSend(f,'Husk min tidligere afsluttede opgave.','chat');
  hold=true;
  const running=appSend(f,'INTERRUPTED_WORKBENCH_TASK: fortsæt med denne opgave.','chat');void running.catch(()=>{});
  await seen;await f.bench.stop({chat:f.bench.chat.id});await assert.rejects(running);
  assert.equal(f.bench.chat.running,false);const before=f.wire.length;hold=false;
  await appSend(f,'Fortsæt med min opgave.','chat');
  const sent=JSON.stringify(f.wire.slice(before));assert.match(sent,/SUCCESSFUL_WORKBENCH_CONTEXT/);assert.match(sent,/INTERRUPTED_WORKBENCH_TASK/);
  assert.doesNotMatch(sent,/UNFINISHED_RESPONSE/);assert.equal(f.bench.chat.data.privacySession.state,'complete');
  assert.equal(f.permissions.length,0);assert.equal(await fs.readFile(path.join(f.projectRoot,'public/index.html'),'utf8'),'<main>Original demo</main>');
});
