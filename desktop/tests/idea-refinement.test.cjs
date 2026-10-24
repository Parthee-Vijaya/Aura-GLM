const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {IdeaRefinement,buildRequest,parseResponse}=require('../core/idea-refinement.cjs');
const input={name:'Syntetisk projekt',idea:'En tilmeldingsside',connectionID:'local',modelID:'test'};
async function fixture(t){
 const sent=[];let reply={description:'En lokal tilmeldingsside.',plan:'Afklar, byg og test.',questions:['Skal deltagerne dele data?']};let hold=false;
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;sent.push({url:req.url,body:JSON.parse(body)});if(hold)return;res.setHeader('content-type','application/json');res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const connection={id:'local',name:'Lokal prøve',kind:'compatible',baseURL:`http://127.0.0.1:${server.address().port}/v1`};
 const bench={connection:async()=>({...connection}),models:async()=>[{id:'test',name:'Test'}],routes:async()=>[],store:{decrypt:()=>''},skills:{context:async()=>({features:{design:false},skills:[]})}};
 const service=new IdeaRefinement({getWorkbench:()=>bench});t.after(()=>service.stop());
 return {sent,connection,bench,service,hold:()=>{hold=true},reply:value=>{reply=value}};
}
test('review sends nothing; exact reviewed content, history and follow-up use a real controlled HTTP endpoint',async t=>{
 const f=await fixture(t),review=await f.service.prepare(input);assert.equal(f.sent.length,0);const result=await f.service.send({token:review.token});assert.match(result.description,/tilmeldingsside/);assert.equal(f.sent.length,1);assert.equal(f.sent[0].body.tools,undefined);assert.equal(f.sent[0].body.messages[1].content,review.content[0].content);
 await assert.rejects(f.service.send({token:review.token}),/Gennemgå/);
 const second=await f.service.prepare({...input,message:'Kun lokalt, ingen delte data'});assert.equal(second.content.length,3);assert.match(second.content[1].content,/Skal deltagerne/);await f.service.send({token:second.token});assert.match(f.sent[1].body.messages.at(-1).content,/Kun lokalt/);
});
test('changed destination invalidates approval and cancellation has no fallback',async t=>{
 const f=await fixture(t);let review=await f.service.prepare(input);f.connection.baseURL+='/other';await assert.rejects(f.service.send({token:review.token}),/ændret/);assert.equal(f.sent.length,0);
 review=await f.service.prepare(input);f.hold();const sending=f.service.send({token:review.token});const rejected=assert.rejects(sending,/stoppet/);while(!f.sent.length)await new Promise(r=>setTimeout(r,5));f.service.stop();await rejected;assert.equal(f.sent.length,1);
});
test('malformed JSON, oversized descriptions and tool calls never appear as ordinary proposals',()=>{
 const parse=(content,extra={})=>parseResponse({choices:[{message:{content,...extra},finish_reason:'stop'}]},{});
 assert.throws(()=>parse('{"description":"unfinished'),/ufuldstændigt/);assert.throws(()=>parse('a'.repeat(3001)),/lang/);assert.throws(()=>parse('hello',{tool_calls:[{}]}),/tekstsvar/);
 assert.throws(()=>parse(JSON.stringify({description:'a'.repeat(3001),plan:'a',questions:[]})),/format/);
 assert.equal(parse('En almindelig beskrivelse.').description,'En almindelig beskrivelse.');
});
test('all supported provider protocols keep tools absent and explicit OpenRouter route cannot fallback',()=>{
 const model={id:'test'};for(const kind of ['compatible','anthropic','openai','azure','mistral','corti','ollama','openrouter']){
 const request=buildRequest({connection:{kind,baseURL:'http://127.0.0.1:1/v1'},model,route:{id:'chosen'}},[{role:'user',content:'Syntetisk'}]);assert.equal(request.body.tools,undefined);assert.equal(request.body.stream,false);if(kind==='openrouter')assert.deepEqual(request.body.provider,{only:['chosen'],allow_fallbacks:false});
 }assert.throws(()=>buildRequest({connection:{kind:'openrouter',baseURL:'x'},model},[]),/konkret/);
});

for(const kind of ['mistral','corti'])test(`${kind}: idea guidance is present in the exact reviewed HTTP request, without files or tools`,async t=>{
 const f=await fixture(t),{loadLibrary}=require('../core/library.cjs');
 const library=await loadLibrary(require('node:path').resolve(__dirname,'../../profiles'));
 if (!library.skills.some(skill => skill.name === 'harness-aura-design')) library.skills.push({name:'harness-aura-design',files:[{path:'SKILL.md',content:'---\nname: harness-aura-design\ndescription: Synthetic method\n---\n\nByg noget der fungerer.'}]});
 let enabled=true;f.connection.kind=kind;
 f.bench.skills.context=async root=>{assert.equal(root,null);return {features:{design:enabled},skills:library.skills};};
 const review=await f.service.prepare(input);assert.equal(f.sent.length,0);assert.match(review.system,/HOVEDSKILL TIL BYGNING/);
 assert.match(review.system,/ingen værktøjer i idéhjælpen/);await f.service.send({token:review.token});
 assert.equal(f.sent[0].body.messages[0].content,review.system);assert.equal(f.sent[0].body.tools,undefined);
 const next=await f.service.prepare(input);enabled=false;
 await assert.rejects(f.service.send({token:next.token}),/Designinstruktionerne blev ændret/);assert.equal(f.sent.length,1);
 const disabled=await f.service.prepare(input);assert.doesNotMatch(disabled.system,/HOVEDSKILL TIL BYGNING/);
});
test('custom core is carried by all supported idea API formats',()=>{
 const system='SYNTHETIC-EXACT-REVIEWED-CORE',messages=[{role:'user',content:'En idé'}];
 for(const kind of ['mistral','corti','openai','azure','anthropic','ollama','compatible','openrouter']){
  const request=buildRequest({connection:{kind,baseURL:'http://127.0.0.1:1/v1'},model:{id:'test'},route:{id:'chosen'}},messages,system);
  assert.equal(request.responses?request.body.instructions:request.anthropic?request.body.system:request.body.messages[0].content,system);
  assert.equal(request.body.tools,undefined);
 }
});
