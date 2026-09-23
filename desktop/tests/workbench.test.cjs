const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { Workbench } = require('../core/workbench.cjs');
const { Store } = require('../core/store.cjs');
const { Skills } = require('../core/skills.cjs');
const { startGateway } = require('../core/gateway.cjs');
const { endpoint, disclosure } = require('../core/connections.cjs');
const profiles = path.join(__dirname, '../../profiles');
async function temp(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-state-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
test('nøglelager afviser manglende kryptering; offentlige forbindelser udelader hemmeligheder', async t => {
 const store = new Store(await temp(t), { isEncryptionAvailable: () => false });
 assert.throws(() => store.encrypt('hemmelig'), /ikke tilgængelig/);
 assert.deepEqual(store.publicConnection({ id:'1', secret:'cipher' }), { id:'1', hasKey:true });
 await Promise.all([store.saveProject('/projekt-a', {selection:'a'}), store.saveProject('/projekt-b', {selection:'b'})]);
 assert.equal((await store.project('/projekt-a')).selection, 'a');
 assert.equal((await store.project('/projekt-b')).selection, 'b');
});
test('skills kan ændres og gendannes uden at ændre andre projekter eller grundfiler', async t => {
 const store = new Store(await temp(t)); const skills = new Skills(path.join(profiles,'skills'), store);
 const original = (await skills.list('/a')).find(s => s.id === 'git-og-versioner');
 await skills.save('/a', { id: original.id, content: original.content+'\nEkstra prøvekrav.', enabled:false });
 assert.ok(!(await skills.context('/a')).includes('Ekstra prøvekrav.'));
 assert.equal((await skills.list('/b')).find(s => s.id === original.id).content, original.content);
 await skills.save('/a', { id:original.id, content:original.content, enabled:true, reset:true });
 assert.equal((await skills.list('/a')).find(s => s.id === original.id).customized,false);
});
test('stop under motoropstart sender aldrig prompten', async t => {
 let entered, release, calls=0; const reached = new Promise(r=>entered=r); const blocked = new Promise(r=>release=r);
 const bench = new Workbench({ directory:await temp(t), profiles, emit:()=>{}, safeStorage:{}, engineFactory:()=>({ active:false, start:async()=>{entered();await blocked;}, send:async()=>calls++, abort:async()=>{}, close:async()=>{} }) });
 bench.project = {root:bench.store.root};
 bench.prepared = { root:bench.project.root, disclosure:{fingerprint:'test'}, connection:{kind:'compatible',name:'Prøve',baseURL:'http://127.0.0.1:1/v1'}, model:{id:'test'}, references:[], skills:'' };
 const pending = bench.send({text:'Må ikke sendes',fingerprint:'test'});
 const rejection = assert.rejects(pending, /stoppet/);
 await reached; await bench.stop(); release(); await rejection;
 assert.equal(calls,0); assert.equal(bench.running,false);
 await bench.close();
});
test('gateway kræver nøgle, fastholder model og OpenRouter-udbyder uden fallback', async t => {
 const received=[];
 const upstream=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;received.push({headers:req.headers,body:JSON.parse(raw)});res.setHeader('content-type','application/json');res.end('{}');});
 await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const gateway=await startGateway({kind:'openrouter',baseURL:`http://127.0.0.1:${upstream.address().port}/v1`},{id:'test'},'prøvenøgle',{id:'valgt'});
 t.after(async()=>{await gateway.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));});
 assert.equal((await fetch(gateway.url+'/chat/completions',{method:'POST',body:'{}'})).status,401);
 const send=body=>fetch(gateway.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gateway.token}`,'content-type':'application/json'},body:JSON.stringify(body)});
 await send({model:'anden'}); assert.equal(received.length,0);
 assert.equal((await send({model:'test',provider:{allow_fallbacks:true},models:['anden']})).status,200);
 assert.deepEqual(received[0].body.provider,{only:['valgt'],allow_fallbacks:false});
 assert.equal(received[0].body.models,undefined);
 assert.equal(received[0].headers.authorization,'Bearer prøvenøgle');
});
test('serveradresser og ukendte vilkår er tydelige', () => {
 for(const value of ['file:///tmp/a','https://user:password@example.com','https://example.com/?key=secret']) assert.throws(()=>endpoint(value));
 const data=disclosure({kind:'compatible',name:'Egen server',baseURL:'http://spark:8000/v1'},{id:'qwen'});
 assert.match(data.region,/Ukendt/);assert.match(data.price,/Ukendt/);assert.match(data.security,/HTTP uden TLS/);
});
