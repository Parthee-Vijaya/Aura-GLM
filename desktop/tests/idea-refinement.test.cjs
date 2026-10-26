const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {IdeaRefinement,buildRequest,parseResponse}=require('../core/idea-refinement.cjs');
const input={name:'Syntetisk projekt',idea:'En tilmeldingsside',connectionID:'local',modelID:'test'};
async function fixture(t){
 const sent=[];let reply={description:'En lokal tilmeldingsside.',plan:'Afklar, byg og test.',questions:['Skal deltagerne dele data?']};let hold=false;
 const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;sent.push({url:req.url,body:JSON.parse(body)});if(hold)return;res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.endsWith('/responses')?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const connection={id:'local',name:'Lokal prøve',kind:'compatible',baseURL:`http://127.0.0.1:${server.address().port}/v1`};
 const library=await require('../core/library.cjs').loadLibrary(require('node:path').resolve(__dirname,'../../profiles'));
 const bench={connection:async()=>({...connection}),models:async()=>[{id:'test',name:'Test'}],routes:async()=>[],store:{decrypt:()=>''},skills:{context:async()=>({features:{design:true},skills:library.skills})}};
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
 if(kind==='mistral')assert.deepEqual(request.body.response_format,{type:'json_object'});else assert.equal(request.body.response_format,undefined,'do not assume JSON mode support on other providers');
 }assert.throws(()=>buildRequest({connection:{kind:'openrouter',baseURL:'x'},model},[]),/konkret/);
});

test('Mistral JSON mode preserves multiline visual proposals and their reviewed request through follow-up',async t=>{
 const f=await fixture(t);f.connection.kind='mistral';
 const proposal={description:'En madbestillingsdemo.\n\nDesignforslag: Varm elfenbensbaggrund, kulsort tekst og tomatrød kurvhandling. Menuen prioriterer ret, pris og tilvalg. På mobil ligger kurven nederst.',plan:'Visuel gennemgang på mobil og desktop; gennemfør menu → kurv → bekræftelse.',questions:['Skal bestillinger sendes til et rigtigt spisested?']};
 f.reply(proposal);
 const reviewed=await f.service.prepare({...input,idea:'En madbestillingsapp'});
 assert.match(reviewed.system,/DESIGN GENNEM SKILLS/);
 assert.doesNotMatch(reviewed.system,/#FAF7F1|#B84A37|--color-background:|grid-template-columns:|LAYOUTREFERENCE TIL ET NYT MAD-UI/);
 assert.match(reviewed.system,/godkendte designforslag har forrang/);
 assert.equal(f.sent.length,0);
 const result=await f.service.send({token:reviewed.token});
 assert.deepEqual(result,proposal);
 assert.deepEqual(f.sent[0].body.response_format,{type:'json_object'});
 assert.equal(f.sent[0].body.messages[0].content,reviewed.system);
 const next=await f.service.prepare({...input,idea:'En madbestillingsapp',message:'Kun en demo med fiktive data'});
 assert.deepEqual(JSON.parse(next.content[1].content),proposal);
 assert.equal(f.sent.length,1,'follow-up preparation does not send automatically');
 // A provider that still returns invalid JSON must remain rejected.
 assert.throws(()=>parseResponse({choices:[{finish_reason:'stop',message:{content:'{"description":"Madapp\nDesignforslag","plan":"Plan","questions":[]}'}}]},{}),/ufuldstændigt/);
});

for(const kind of ['mistral','corti','openai'])test(`${kind}: idea guidance is present in the exact reviewed HTTP request, without files or tools`,async t=>{
 const f=await fixture(t),{loadLibrary}=require('../core/library.cjs');
 const library=await loadLibrary(require('node:path').resolve(__dirname,'../../profiles'));
 if (!library.skills.some(skill => skill.name === 'harness-aura-design')) library.skills.push({name:'harness-aura-design',files:[{path:'SKILL.md',content:'---\nname: harness-aura-design\ndescription: Synthetic method\n---\n\nByg noget der fungerer.'}]});
 f.connection.kind=kind;
 f.bench.skills.context=async root=>{assert.equal(root,null);return {features:{design:true},skills:library.skills};};
 const review=await f.service.prepare({...input,idea:'En madbestillingsapp'});assert.equal(f.sent.length,0);assert.match(review.system,/HOVEDSKILL TIL BYGNING/);
 assert.match(review.system,/DESIGN GENNEM SKILLS/);assert.doesNotMatch(review.system,/#FAF7F1|#B84A37|--color-background:|grid-template-columns:|LAYOUTREFERENCE TIL ET NYT MAD-UI/);
 assert.match(review.system,/ingen værktøjer i idéhjælpen/);await f.service.send({token:review.token});
 assert.equal(kind==='openai'?f.sent[0].body.instructions:f.sent[0].body.messages[0].content,review.system);assert.equal(f.sent[0].body.tools,undefined);
 const next=await f.service.prepare(input);
 library.skills.find(s=>s.name==='harness-aura-design').files.find(f=>f.path==='SKILL.md').content+='\nCHANGED-DESIGN-INSTRUCTIONS';
 await assert.rejects(f.service.send({token:next.token}),/Designinstruktionerne blev ændret/);assert.equal(f.sent.length,1);
 const updated=await f.service.prepare(input);assert.match(updated.system,/CHANGED-DESIGN-INSTRUCTIONS/);
});
test('custom core is carried by all supported idea API formats',()=>{
 const system='SYNTHETIC-EXACT-REVIEWED-CORE',messages=[{role:'user',content:'En idé'}];
 for(const kind of ['mistral','corti','openai','azure','anthropic','ollama','compatible','openrouter']){
  const request=buildRequest({connection:{kind,baseURL:'http://127.0.0.1:1/v1'},model:{id:'test'},route:{id:'chosen'}},messages,system);
  assert.equal(request.responses?request.body.instructions:request.anthropic?request.body.system:request.body.messages[0].content,system);
  assert.equal(request.body.tools,undefined);
 }
});

test('reasoning idea models retain room for their visible proposal without changing effort',()=>{
 const connection={kind:'corti',baseURL:'https://example.invalid/v1'};
 const request=model=>buildRequest({connection,model},[{role:'user',content:'En madbestillingsapp'}]).body;
 const reasoning=request({id:'test',capabilities:{reasoning:true},limits:{context:128000,output:64000}});
 assert.equal(reasoning.max_tokens,32768);
 assert.equal(reasoning.reasoning_effort,undefined);
 assert.equal(reasoning.reasoning,undefined);
 assert.equal(request({id:'test',capabilities:{reasoning:true},limits:{output:12000}}).max_tokens,12000);
 assert.equal(request({id:'test',capabilities:{reasoning:false},limits:{output:64000}}).max_tokens,8192);
});


test('idea history survives harmless catalogue and check metadata refresh while an in-flight review stays exact',async t=>{
 const f=await fixture(t);let price=1;f.bench.models=async()=>[{id:'test',name:'Test',price:{input:price}}];
 let review=await f.service.prepare(input);await f.service.send({token:review.token});
 f.connection.checkedAt='later';price=2;
 review=await f.service.prepare({...input,message:'Bevar funktionerne.'});assert.equal(review.content.length,3);
 price=3;await assert.rejects(f.service.send({token:review.token}),/ændret/);assert.equal(f.sent.length,1);
 review=await f.service.prepare(input);assert.equal(review.content.length,3);
 f.connection.secret='another-encrypted-account';
 review=await f.service.prepare(input);assert.equal(review.content.length,1,'a different account must never inherit the previous history');
});
