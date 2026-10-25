// Native transport regression: synthetic local server, no external model calls.
const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {OpenCodeEngine}=require('../../desktop/core/engine.cjs');
const {ChatSession}=require('../../desktop/core/chat-session.cjs');
const {ApprovalsPolicy}=require('../../desktop/core/approvals-policy.cjs');
const {reviewWrite}=require('./policy.cjs');
(async()=>{
 const output=path.resolve(process.argv[2]);await fs.mkdir(output,{recursive:false});const root=path.join(output,'Project with spaces');await fs.mkdir(path.join(root,'public'),{recursive:true});
 const patchText='*** Begin Patch\n*** Add File: public/menu.js\n+window.TEST=true;\n*** Add File: public/assets/food.svg\n+<svg xmlns="http://www.w3.org/2000/svg"/>\n*** End Patch';
 const events=[],failures=[],parts=new Map();let count=0,finish;const completed=new Promise(r=>finish=r);
 const server=http.createServer(async(req,res)=>{
  try{let raw='';for await(const c of req)raw+=c;const body=JSON.parse(raw);const call=body.tools?.some(t=>t.function.name==='read')&&++count===1;
   const delta=call?{role:'assistant',tool_calls:[{index:0,id:'patch-native',type:'function',function:{name:'apply_patch',arguments:JSON.stringify({patchText})}}]}:{role:'assistant',content:'Native permission check completed.'};
   const frame={id:'controlled',object:'chat.completion.chunk',created:1,model:'gpt-6.1-sol',choices:[{index:0,delta,finish_reason:null}]};res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: '+JSON.stringify(frame)+'\n\n');res.end('data: '+JSON.stringify({...frame,choices:[{index:0,delta:{},finish_reason:call?'tool_calls':'stop'}]})+'\n\ndata: [DONE]\n\n');
  }catch(e){failures.push(e.message);res.writeHead(500);res.end();}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const policy=new ApprovalsPolicy({read:async()=>({version:1,projects:{}}),update:async()=>{throw Error('No persistent grant');}});
 const chat={root,running:true,generation:1,runStopped:false,runTools:parts,approvals:new Map(),approvalContext:()=>({projectRoot:root,workspaceRoot:root,mode:'build'}),bench:{approvalsPolicy:policy,chatsChanged(){}},log(){},emit:e=>{
  if(e.type==='permission.asked'){
   (async()=>{const p=e.properties,descriptor=p.policy;const paths=descriptor.match?.targets.map(t=>t.path)||[];const allowed=descriptor.projectFile===true&&await reviewWrite(root,{permission:p.permission,patterns:paths},'build');events.push({permission:p.permission,paths:paths.map(p=>path.relative(root,p)),allowed,hydratedPatch:p.toolInput?.patchText===patchText});await engine.reply(p.id,allowed);})().catch(e=>{failures.push(e.message);finish('error');});
  }
 }};
 const provider={npm:'@ai-sdk/openai-compatible',name:'Controlled replay',options:{baseURL:`http://127.0.0.1:${server.address().port}/v1`,apiKey:'synthetic'},models:{'gpt-6.1-sol':{name:'gpt-6.1-sol',tool_call:true,limit:{context:200000,output:16384}}}};
 const engine=new OpenCodeEngine({root,directory:path.join(output,'runtime'),provider,model:{id:'gpt-6.1-sol'},mode:'build',skills:[],onEvent:e=>{
  const part=e.properties?.part;if(part?.type==='tool')parts.set(part.id,part);
  if(e.type==='permission.asked')ChatSession.prototype.permissionAsked.call(chat,e).catch(e=>{failures.push(e.message);finish('error');});
  if(['session.idle','session.error','engine.error'].includes(e.type))finish(e.type);
 }});chat.engine=engine;
 const timer=setTimeout(()=>finish('timeout'),60000);
 try{await engine.start();await engine.send('Replay one known patch under the normal policy.','Native transport regression only.');const status=await completed;
  assert.equal(status,'session.idle');assert.deepEqual(failures,[]);assert.equal(events.length,1);assert.equal(events[0].allowed,true);assert.equal(events[0].hydratedPatch,true);assert.deepEqual(events[0].paths,['public/assets/food.svg','public/menu.js']);
  assert.equal(await fs.readFile(path.join(root,'public/menu.js'),'utf8'),'window.TEST=true;\n');
  const result={passed:true,status,events,scope:'Actual OpenCode and unchanged Aura approvals policy; controlled local model response, not real-model design evidence'};await fs.writeFile(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{clearTimeout(timer);chat.running=false;await engine.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
