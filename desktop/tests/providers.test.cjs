const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {normalize,listModels,disclosure,engineProvider}=require('../core/connections.cjs');
const {startGateway}=require('../core/gateway.cjs');
test('Corti og Mistral fastholder destination; ukendte udbydere afvises',()=>{
 for(const [kind,host] of [['corti','ai.eu.corti.app'],['mistral','api.mistral.ai']]) {
  const c=normalize({kind,name:kind,baseURL:'https://example.invalid'});assert.equal(new URL(c.baseURL).hostname,host);
  assert.match(disclosure(c,{id:'test'}).price,/Ukendt/);
  assert.equal(engineProvider(c,{id:'test'},'http://127.0.0.1:1/v1','midlertidig').options.apiKey,'midlertidig');
 }
 assert.throws(()=>normalize({kind:'promte',name:'Promte',baseURL:'https://example.invalid'}),/understøttet/);
});
for(const kind of ['corti','mistral']) test(`${kind}: katalog, streaming, værktøjskald og fejl gennem rigtig HTTP-gateway`,async t=>{
 const received=[];let fail=false;
 const server=http.createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,'Bearer test-noegle');
  if(req.url==='/v1/models')return res.end(JSON.stringify({data:[{id:'kode',capabilities:{completion_chat:true,function_calling:true}},{id:'embedding',capabilities:{completion_chat:false}}]}));
  let raw='';for await(const chunk of req)raw+=chunk;received.push(JSON.parse(raw));
  if(fail){res.writeHead(401);return res.end('hemmelig leverandørfejl');}
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.write('data: '+JSON.stringify({choices:[{index:0,delta:{tool_calls:[{index:0,id:'tool1',type:'function',function:{name:'read',arguments:'{}'}}]}}]})+'\n\n');res.end('data: [DONE]\n\n');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const c={kind,name:kind,baseURL:`http://127.0.0.1:${server.address().port}/v1`};
 const gateway=await startGateway(c,{id:'kode'},'test-noegle');
 t.after(async()=>{await gateway.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 await assert.rejects(listModels(c,''),/API-nøgle/);
 const models=await listModels(c,'test-noegle');assert.equal(models.length,1);assert.equal(models[0].capabilities.tools,true);
 const send=()=>fetch(gateway.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gateway.token}`},body:JSON.stringify({model:'kode',stream:true,messages:[{role:'user',content:'Læs filen'}],tools:[{type:'function',function:{name:'read',parameters:{type:'object'}}}]})});
 const response=await send();assert.match(await response.text(),/tool_calls/);assert.equal(received[0].tools[0].function.name,'read');
 fail=true;const rejected=await send();assert.equal(rejected.status,401);assert.doesNotMatch(await rejected.text(),/hemmelig/);assert.equal(received.length,2);
});
