const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {setTimeout:delay}=require('node:timers/promises');
const {OpenCodeEngine}=require('../core/engine.cjs');
const native={skip:process.env.AURA_ENGINE_NATIVE!=='1'?'Set AURA_ENGINE_NATIVE=1 with the prepared pinned runtime.':false,timeout:60000};
async function fixture(t,{context=32768,usageInput=0,invalidSummary=false}={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aura-v2-engine-native-'))),project=path.join(root,'project');await fs.mkdir(project);
 const requests=[],events=[];let handler;
 const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);requests.push(body);if(process.env.AURA_ENGINE_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify(body.messages));if(handler)return handler(body,res);
  res.writeHead(200,{'content-type':'text/event-stream'});
  const packet=(delta,finish_reason=null)=>'data: '+JSON.stringify({id:'native-contract',object:'chat.completion.chunk',created:1,model:'probe',choices:[{index:0,delta,finish_reason}],...(finish_reason?{usage:{prompt_tokens:requests.length===1?usageInput:100,completion_tokens:10,total_tokens:(requests.length===1?usageInput:100)+10}}:{})})+'\n\n';
  const summary = JSON.stringify(body.messages).includes('<template>');
  const content = summary && !invalidSummary ? '## Objective\n- Preserve SMALL_WINDOW_CANARY and continue the synthetic task.\n\n## Requirements\n- Keep current approvals and use the selected model.\n\n## Decisions\n- No file changes.\n\n## Work State\n### Completed\n- Returned a controlled answer.\n### Active\n- Continue the task.\n### Blocked\n- (none)\n\n## Next Move\n1. Answer the latest request.\n\n## Relevant Files\n- (none)\n\n## Important Context\n- SMALL_WINDOW_CANARY remains relevant.' : 'A synthetic preserved answer and conversation summary.';
  res.end(packet({role:'assistant',content})+packet({},'stop')+'data: [DONE]\n\n');
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const provider={npm:'@ai-sdk/openai-compatible',name:'Controlled native contract',options:{baseURL:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'synthetic'},models:{probe:{name:'Probe',tool_call:true,limit:{context,output:1024}}}};
 const engine=new OpenCodeEngine({root:project,directory:path.join(root,'engine'),provider,model:{id:'probe'},onEvent:event=>events.push(event)});
 t.after(async()=>{await engine.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});});
 if(process.env.AURA_ENGINE_NATIVE_TRACE==='1'){const decode=engine.decodeEvent.bind(engine);engine.decodeEvent=event=>{if(/compact|execution/.test(event.type))t.diagnostic(JSON.stringify(event));return decode(event);};}
 await engine.start();
 async function send(text,system){const before=events.length;await engine.send(text,system);for(let i=0;i<1000;i++){const terminal=events.slice(before).find(e=>['session.idle','session.error','engine.error'].includes(e.type));if(terminal){assert.equal(terminal.type,'session.idle',JSON.stringify(terminal));return;}await delay(10);}assert.fail('No native completion');}
 return{engine,requests,events,send,setHandler:fn=>{handler=fn;}};
}
test('native V2 preserves a selected model, updates task instructions in the same history, compacts and resumes',native,async t=>{
 const f=await fixture(t,{context:32768});
 await f.send('Remember the synthetic word NATIVE_CONTEXT_CANARY.','AURA_NATIVE_POLICY_V1: plan only.');
 const firstID=f.engine.session.id,before=f.requests.length;
 await f.send('Continue under the updated instruction.','AURA_NATIVE_POLICY_V2: build the approved plan.');
 assert.equal(f.engine.session.id,firstID);assert.ok(f.requests.length>before);
 const second=JSON.stringify(f.requests.at(-1).messages);
 assert.match(second,/AURA_NATIVE_POLICY_V2/);assert.match(second,/supersedes the previous value/);assert.match(second,/NATIVE_CONTEXT_CANARY/);
 assert.ok(second.lastIndexOf('AURA_NATIVE_POLICY_V2')>second.indexOf('AURA_NATIVE_POLICY_V1'));
 const calls=f.requests.length;await f.engine.summarize({timeout:15000});assert.ok(f.requests.length>calls,'Compaction must actually call the selected model, not only acknowledge an inbox item');assert.ok(f.requests.slice(calls).some(request=>JSON.stringify(request.messages).includes('<template>')));
 assert.ok(f.requests.every(request=>request.model==='probe'));
 await f.send('Continue after the summary.','AURA_NATIVE_POLICY_V3: continue with the existing approvals.');
 assert.equal(f.engine.session.id,firstID);assert.match(JSON.stringify(f.requests.at(-1).messages),/AURA_NATIVE_POLICY_V3/);
 assert.equal(f.events.some(event=>event.type==='permission.asked'),false);
});

test('native V2 automatically compacts a small model window and continues the same owned prompt',native,async t=>{
 const f=await fixture(t,{context:12000,usageInput:10500});
 await f.send('Remember SMALL_WINDOW_CANARY.','Preserve the current task and approvals.');
 const before=f.requests.length;
 await f.send('Continue the same synthetic task without tools.','Preserve the current task and approvals.');
 assert.ok(f.requests.length>before+1,'A small model window must exercise a real additional summary request');
 assert.ok(f.requests.some(request=>JSON.stringify(request.messages).includes('<template>')),'The selected model receives an actual summary request');
 assert.match(JSON.stringify(f.requests.at(-1).messages),/SMALL_WINDOW_CANARY/);
 assert.equal(f.events.some(event=>['engine.error','session.error'].includes(event.type)),false);
 assert.ok(f.requests.every(request=>request.model==='probe'));
});

test('native V2 rejects a failed manual summary instead of claiming successful compaction',native,async t=>{
 const f=await fixture(t,{invalidSummary:true});await f.send('Preserve the existing conversation.','Keep the same model and approvals.');
 await assert.rejects(f.engine.summarize({timeout:5000}).then(async result=>{if(process.env.AURA_ENGINE_NATIVE_TRACE==='1')t.diagnostic(JSON.stringify(await f.engine.wire(`/api/session/${f.engine.session.id}/message?limit=100&order=asc`)));return result;}),/summary|sammenfat|template/i);
 assert.ok(f.requests.every(request=>request.model==='probe'));
});
