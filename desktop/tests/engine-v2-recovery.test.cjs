const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { OpenCodeEngine } = require('../core/engine.cjs');
const waitFor = async check => { for(let n=0;n<400;n++){if(check())return;await delay(5);}assert.fail('V2 recovery did not finish'); };
async function fixture(t) {
  const events=[],calls=[],streams=[];
  const state={idle:1,outcome:'succeeded',active:true,permissions:[],forms:[],messages:[{id:'msg_current',type:'user',text:'One approved operation'},{id:'msg_answer',type:'assistant',content:[{type:'text',text:'Partial'}]}]};
  const server=http.createServer(async(req,res)=>{
    let input='';for await(const part of req)input+=part;calls.push({url:req.url,method:req.method,body:input?JSON.parse(input):null});
    if(req.url==='/api/event'){res.writeHead(200,{'content-type':'text/event-stream'});res.write(': ready\n\n');streams.push(res);return;}
    res.setHeader('content-type','application/json');let value;
    if(req.url==='/api/session/ses_test')value={data:{id:'ses_test',location:{directory:'/synthetic'},outcome:state.outcome,time:{idle:state.idle,...(state.suspended?{suspended:state.suspended}:{})}}};
    if(req.url==='/api/session/active')value={data:state.active?{ses_test:{type:'running'}}:{}};
    if(req.url.startsWith('/api/session/ses_test/message?'))value={data:state.messages,cursor:{}};
    if(req.url==='/api/session/ses_test/permission')value={data:state.permissions};
    if(req.url==='/api/session/ses_test/form')value={data:state.forms};
    if(req.url==='/api/session/ses_test/compact'){state.messages.push({type:'compaction',id:'inbox_compact',status:'pending'});value={data:{id:'inbox_compact'}};}
    if(req.url==='/api/session/ses_test/interrupt?resume=false')value={data:true};
    if(req.url==='/api/session/ses_test/permission/per_owned/reply')value={data:true};
    if(value===undefined){res.writeHead(404);value={};}res.end(JSON.stringify(value));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=new OpenCodeEngine({root:'/synthetic',model:{id:'selected'},onEvent:event=>events.push(event),recovery:{delays:[5,10],idleLimit:1000}});
  Object.assign(engine,{active:true,session:{id:'ses_test'},url:`http://127.0.0.1:${server.address().port}`,auth:'Basic synthetic',promptID:'msg_current',promptEpoch:1,turnBaseline:{ids:new Set(),idle:'1'}});
  const running=engine.listen();await engine.eventStream.ready;
  t.after(async()=>{await engine.close();await running;server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  const emit=(type,data)=>streams.at(-1).write('data: '+JSON.stringify({type,data:{sessionID:'ses_test',...data}})+'\n\n');
  return{engine,state,events,calls,streams,emit};
}
test('V2 wire recovery preserves approval identity and exact final snapshot without repeating prompts or tools',async t=>{
  const f=await fixture(t);const ask={id:'per_exact',sessionID:'ses_test',action:'edit',resources:['public/index.html'],save:[],metadata:{files:[{file:'public/index.html',patch:'synthetic patch'}]}};
  f.state.permissions=[ask];f.emit('permission.asked',ask);await waitFor(()=>f.engine.pending.has(ask.id));const bound=f.engine.pending.get(ask.id);
  f.state.messages[1].content=[{type:'text',text:'Whole recovered answer'},{type:'tool',id:'call_once',name:'write',state:{status:'completed',input:{path:'public/index.html',content:'approved'},content:[{type:'text',text:'written'}]}}];
  f.streams[0].destroy();await waitFor(()=>f.events.some(e=>e.type==='engine.recovery'&&e.recovery.phase==='recovered'));
  assert.equal(f.engine.pending.get(ask.id),bound);assert.equal(bound.metadata.filepath,'/synthetic/public/index.html');
  assert.equal(f.events.filter(e=>e.type==='permission.asked').length,1);
  assert.ok(f.events.some(e=>e.properties?.part?.text==='Whole recovered answer'));
  assert.ok(f.events.some(e=>e.properties?.part?.state?.input?.filePath==='/synthetic/public/index.html'));
  assert.ok(f.calls.every(call=>call.method==='GET'));
});
test('V2 lost terminal is proven by changed durable outcome and restores final text first',async t=>{
  const f=await fixture(t);f.state.messages[1].content=[{type:'text',text:'Final result'}];f.state.messages[1].finish='stop';f.state.messages[1].time={completed:12};f.state.active=false;f.state.idle=2;
  f.streams[0].destroy();await waitFor(()=>f.events.some(e=>e.type==='session.idle'));
  assert.ok(f.events.findIndex(e=>e.properties?.part?.text==='Final result')<f.events.findIndex(e=>e.type==='session.idle'));
  ++f.engine.promptEpoch;f.engine.promptID='msg_next';f.engine.currentReplySeen=false;f.engine.turnBaseline={ids:new Set(f.state.messages.map(m=>m.id)),idle:'2'};const before=f.events.filter(e=>e.type==='session.idle').length;
  f.emit('session.execution.succeeded',{});await delay(25);assert.equal(f.events.filter(e=>e.type==='session.idle').length,before);
});
test('V2 compaction acknowledgement cannot complete the summary before a new durable idle',async t=>{
  const f=await fixture(t);f.state.active=false;let finished=false;
  const pending=f.engine.summarize({timeout:1500}).then(()=>{finished=true;});
  await waitFor(()=>f.calls.some(call=>call.url.endsWith('/compact')));await f.engine.eventStream.settle();assert.equal(finished,false);
  f.state.idle=3;f.state.messages.at(-1).status='completed';f.emit('session.execution.succeeded',{});await pending;assert.equal(finished,true);
});
test('V2 lost rejected execution terminates neutrally rather than becoming user Stop or success',async t=>{
  const f=await fixture(t);f.state.messages=[f.state.messages[0]];f.state.active=false;f.state.idle=4;f.state.outcome='interrupted';
  f.streams[0].destroy();await waitFor(()=>f.events.some(e=>e.type==='session.error'));
  assert.equal(f.events.some(e=>e.type==='session.idle'),false);assert.ok(f.calls.every(call=>call.method==='GET'));
});

test('V2 permission rejection suspends the turn without changing old idle outcome and still ends neutrally',async t=>{
  const f=await fixture(t);f.state.active=false;
  f.state.messages[1].error={type:'aborted',message:'Step interrupted'};f.state.messages[1].finish='error';
  f.emit('session.execution.interrupted',{reason:'user'});
  await waitFor(()=>f.events.some(e=>e.type==='session.error'));
  assert.equal(f.events.some(e=>e.type==='session.idle'),false);assert.equal(f.engine.completedPromptID,'msg_current');
  assert.equal(f.state.idle,1,'The preceding successful idle is unchanged');
});


test('V2 ordinary denial binds to the exact pending permission and keeps its own terminal classification',async t=>{
  const f=await fixture(t);const ask={id:'per_owned',sessionID:'ses_test',action:'edit',resources:['safe.txt'],save:[]};
  f.emit('permission.asked',ask);await waitFor(()=>f.engine.pending.has(ask.id));await f.engine.reply(ask.id,false);
  f.state.active=false;f.state.messages[1].error={type:'aborted',message:'Step interrupted'};f.state.messages[1].finish='error';
  f.emit('session.execution.interrupted',{reason:'shutdown'});await waitFor(()=>f.events.some(e=>e.type==='session.error'));
  const end=f.events.find(e=>e.type==='session.error');assert.equal(end.permissionRejected,true);assert.equal(end.properties.requestID,'per_owned');
  assert.equal(f.events.some(e=>e.type==='session.idle'),false);assert.equal(f.engine.completedPromptID,'msg_current');
  assert.equal(f.calls.filter(call=>call.method==='POST').length,1,'No prompt or tool is retried');
});

test('V2 rejection ownership cannot leak from feedback, failed replies, foreign permissions or earlier prompts',async t=>{
  const f=await fixture(t);const pending={id:'per_owned',sessionID:'ses_test'};
  f.engine.pending.set(pending.id,pending);await f.engine.reply(pending.id,false,'Use a different approach.');assert.equal(f.engine.permissionRejection,undefined);
  f.engine.pending.set('per_foreign',{id:'per_foreign',sessionID:'ses_other'});await assert.rejects(f.engine.reply('per_foreign',false),/ikke længere/);
  f.engine.pending.set('per_failed',{id:'per_failed',sessionID:'ses_test'});await assert.rejects(f.engine.reply('per_failed',false),/404/);assert.equal(f.engine.permissionRejection,null);
  f.engine.pending.set(pending.id,pending);await f.engine.reply(pending.id,false);assert.equal(f.engine.permissionRejection.accepted,true);
  ++f.engine.promptEpoch;f.engine.permissionRejection.promptID='msg_previous';
  f.state.active=false;f.state.messages[1].error={type:'aborted',message:'Step interrupted'};f.state.messages[1].finish='error';
  f.emit('session.execution.interrupted',{reason:'user'});await waitFor(()=>f.events.some(e=>e.type==='session.error'));
  assert.equal(f.events.find(e=>e.type==='session.error').permissionRejected,undefined);
});
