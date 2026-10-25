const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {IdeaRefinement,parseResponse}=require('../core/idea-refinement.cjs');
const input={name:'Madbestilling',idea:'En madbestillingsdemo',connectionID:'local',modelID:'test'};
const valid={description:'En madbestillingsdemo. Designforslag: varm elfenben, aubergine og tydelig kurv.',plan:'Afklar, byg og afprøv på mobil og desktop.',questions:[]};
const oversized=JSON.stringify({...valid,description:'x'.repeat(3056)});
const envelope=(content,extra={})=>({choices:[{finish_reason:'stop',message:{content},...extra}]});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fixture(t,{kind='corti',timeout=2000}={}){
  const sent=[];let respond=async()=>({body:envelope(JSON.stringify(valid))}),instructions='';
  const server=http.createServer(async(req,res)=>{
    let raw='';for await(const part of req)raw+=part;
    sent.push({url:req.url,body:JSON.parse(raw)});
    const response=await respond(sent.length);
    if(!response)return;
    res.statusCode=response.status||200;res.setHeader('content-type','application/json');
    res.end(response.raw===undefined?JSON.stringify(response.body):response.raw);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const connection={id:'local',name:'Lokal formatprøve',kind,baseURL:`http://127.0.0.1:${server.address().port}/v1`};
  const model={id:'test',name:'Test',capabilities:{reasoning:true},limits:{output:64000}};
  const route={id:'chosen',name:'Chosen'};
  const library=await require('../core/library.cjs').loadLibrary(require('node:path').resolve(__dirname,'../../profiles'));
  const bench={connection:async()=>structuredClone(connection),models:async()=>[structuredClone(model)],routes:async()=>[structuredClone(route)],store:{decrypt:()=>''},skills:{context:async()=>({skills:library.skills,features:{design:true}})}};
  const service=new IdeaRefinement({getWorkbench:()=>bench,timeout});
  const original=service.system.bind(service);service.system=async(...args)=>(await original(...args))+instructions;
  t.after(()=>service.stop());
  return {service,sent,connection,model,route,reply:fn=>{respond=fn},instructions:value=>{instructions=value}};
}

test('a 3056-character completed Corti proposal gets one exact-context format continuation, never truncation',async t=>{
  const f=await fixture(t);f.reply(async n=>({body:envelope(n===1?oversized:JSON.stringify(valid))}));
  const review=await f.service.prepare(input),exact=structuredClone(f.service.review.request.body);
  const answer=await f.service.send({token:review.token});
  assert.deepEqual(answer,valid);assert.equal(f.sent.length,2);
  assert.deepEqual(f.sent[0].body,exact,'first reviewed request is unchanged');
  const first=f.sent[0].body,second=f.sent[1].body;
  assert.equal(second.model,first.model);assert.equal(second.max_tokens,first.max_tokens);
  assert.deepEqual(second.messages.slice(0,-2),first.messages);
  assert.deepEqual(second.messages.at(-2),{role:'assistant',content:oversized},'all 3056 characters go to the same model without truncation');
  assert.match(second.messages.at(-1).content,/FORMATRETTELSE/);assert.match(second.messages.at(-1).content,/Bevar alle brugerens krav/);
  assert.equal(second.tools,undefined);assert.equal(second.reasoning_effort,undefined);
  const next=await f.service.prepare(input);
  assert.equal(next.content.length,3);assert.deepEqual(JSON.parse(next.content[1].content),valid);
  assert.equal(JSON.stringify(next.content).includes('FORMATRETTELSE'),false,'format plumbing stays out of idea history');
});

test('malformed completed JSON may be repaired, but a second invalid result ends with the original history intact',async t=>{
  const f=await fixture(t);const before=[{role:'user',content:'Tidligere idé'},{role:'assistant',content:'Tidligere forslag'}];
  let review=await f.service.prepare(input);f.service.messages=before;f.service.draft=f.service.review.source;
  review=await f.service.prepare(input);f.reply(async()=>({body:envelope('{"description":"unfinished')}));
  await assert.rejects(f.service.send({token:review.token}),error=>{assert.match(error.message,/ufuldstændigt/);assert.equal(error.proposalText,undefined);return true;});
  assert.equal(f.sent.length,2);assert.deepEqual(f.service.messages,before);assert.equal(f.service.active,null);
});

for(const kind of ['mistral','openrouter','anthropic','openai'])test(`${kind}: format continuation preserves the provider protocol and destination constraints`,async t=>{
  const f=await fixture(t,{kind});
  const response=content=>kind==='anthropic'?{stop_reason:'end_turn',content:[{type:'text',text:content}]}:kind==='openai'?{status:'completed',output:[{type:'message',content:[{type:'output_text',text:content}]}]}:envelope(content);
  f.reply(async n=>({body:response(n===1?'{"description":"Unescaped\nline","plan":"Plan","questions":[]}':JSON.stringify(valid))}));
  const review=await f.service.prepare({...input,routeID:'chosen'});assert.deepEqual(await f.service.send({token:review.token}),valid);
  assert.equal(f.sent.length,2);assert.equal(f.sent[1].url,f.sent[0].url);
  const first=f.sent[0].body,second=f.sent[1].body;
  assert.equal(second.model,first.model);assert.equal(second.tools,undefined);
  if(kind==='mistral')assert.deepEqual(second.response_format,{type:'json_object'});
  if(kind==='openrouter')assert.deepEqual(second.provider,{only:['chosen'],allow_fallbacks:false});
  if(kind==='anthropic'){assert.equal(second.system,review.system);assert.deepEqual(second.messages.slice(0,-2),first.messages);}
  if(kind==='openai'){assert.equal(second.instructions,review.system);assert.deepEqual(second.input.slice(0,-2),first.input);assert.equal(second.store,false);}
});

for(const [name,response] of [
  ['truncated output',{body:envelope(oversized,{finish_reason:'length'})}],
  ['filtered output',{body:envelope(oversized,{finish_reason:'content_filter'})}],
  ['missing finish reason',{body:envelope(oversized,{finish_reason:undefined})}],
  ['tool calls',{body:envelope(oversized,{message:{content:oversized,tool_calls:[{id:'no-tools'}]}})}],
  ['empty text',{body:envelope('')}],
  ['invalid HTTP envelope',{raw:'not json'}],
  ['HTTP rejection',{status:429,body:{error:'synthetic'}}],
])test(`${name} never triggers a format continuation`,async t=>{
  const f=await fixture(t);f.reply(async()=>response);const review=await f.service.prepare(input);
  await assert.rejects(f.service.send({token:review.token}));assert.equal(f.sent.length,1);assert.deepEqual(f.service.messages,[]);
});

for(const kind of ['openai','anthropic'])test(`${kind}: missing completion status permits valid legacy text but never a format continuation`,async t=>{
  const body=content=>kind==='openai'?{output:[{type:'message',content:[{type:'output_text',text:content}]}]}:{content:[{type:'text',text:content}]};
  assert.deepEqual(parseResponse(body(JSON.stringify(valid)),kind==='openai'?{responses:true}:{anthropic:true}),valid);
  const f=await fixture(t,{kind});f.reply(async()=>({body:body(oversized)}));
  const review=await f.service.prepare(input);await assert.rejects(f.service.send({token:review.token}),/format/);
  assert.equal(f.sent.length,1);assert.deepEqual(f.service.messages,[]);
});

for(const mutation of ['connection','model','route','instructions'])test(`changed ${mutation} blocks a second send and needs a fresh review`,async t=>{
  const f=await fixture(t,{kind:mutation==='route'?'openrouter':'corti'});
  f.reply(async()=>{if(mutation==='connection')f.connection.baseURL+='/changed';if(mutation==='model')f.model.name='Changed catalogue';if(mutation==='route')f.route.name='Changed route';if(mutation==='instructions')f.instructions('\nChanged design');return {body:envelope(oversized)};});
  const review=await f.service.prepare({...input,routeID:'chosen'});
  await assert.rejects(f.service.send({token:review.token}),/ændret/);assert.equal(f.sent.length,1);assert.deepEqual(f.service.messages,[]);
});

test('Stop before the format continuation sends no second request',async t=>{
  const f=await fixture(t);f.reply(async()=>{f.service.stop();return {body:envelope(oversized)};});
  const review=await f.service.prepare(input);await assert.rejects(f.service.send({token:review.token}),/stoppet/);
  assert.equal(f.sent.length,1);assert.deepEqual(f.service.messages,[]);
});

test('Stop during the format continuation cannot publish a late answer',async t=>{
  const f=await fixture(t);f.reply(async n=>n===1?{body:envelope(oversized)}:null);
  const review=await f.service.prepare(input),sending=f.service.send({token:review.token});
  const rejected=assert.rejects(sending,/stoppet/);
  while(f.sent.length<2)await delay(5);f.service.stop();await rejected;
  assert.equal(f.sent.length,2);assert.deepEqual(f.service.messages,[]);
});

test('both attempts share one signal and one total deadline',async t=>{
  const f=await fixture(t,{timeout:100});const signals=[],original=f.service.fetchImpl;
  f.service.fetchImpl=(url,options)=>{signals.push(options.signal);return original(url,options);};
  f.reply(async n=>{if(n===1){await delay(60);return {body:envelope(oversized)};}return null;});
  const review=await f.service.prepare(input),start=Date.now();await assert.rejects(f.service.send({token:review.token}),/tidsfristen/);
  assert.equal(f.sent.length,2);assert.equal(signals[0],signals[1]);assert.equal(signals[1].aborted,true);
  assert(Date.now()-start<250);assert.deepEqual(f.service.messages,[]);
});
