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
 const gateway=await startGateway({kind:'openrouter',baseURL:`http://127.0.0.1:${upstream.address().port}/v1`},{id:'test:free',price:{prompt:'0',completion:'0'}},'prøvenøgle',{id:'valgt',price:{prompt:'0',completion:'0'}});
 t.after(async()=>{await gateway.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));});
 assert.equal((await fetch(gateway.url+'/chat/completions',{method:'POST',body:'{}'})).status,401);
 const send=body=>fetch(gateway.url+'/chat/completions',{method:'POST',headers:{authorization:`Bearer ${gateway.token}`,'content-type':'application/json'},body:JSON.stringify(body)});
 await send({model:'anden'}); assert.equal(received.length,0);
 assert.equal((await send({model:'test:free',provider:{allow_fallbacks:true},models:['anden']})).status,200);
 assert.deepEqual(received[0].body.provider,{only:['valgt'],allow_fallbacks:false,max_price:{prompt:0,completion:0,request:0,image:0}});
 assert.equal(received[0].body.models,undefined);
 assert.equal(received[0].headers.authorization,'Bearer prøvenøgle');
});
test('serveradresser og ukendte vilkår er tydelige', () => {
 for(const value of ['file:///tmp/a','https://user:password@example.com','https://example.com/?key=secret']) assert.throws(()=>endpoint(value));
 const data=disclosure({kind:'compatible',name:'Egen server',baseURL:'http://spark:8000/v1'},{id:'qwen'});
 assert.match(data.region,/Ukendt/);assert.match(data.price,/Ukendt/);assert.match(data.security,/HTTP uden TLS/);
});

test('planlægning lukker skrive-, shell- og ukendte værktøjer, men bevarer læsebeskyttelsen', () => {
 const { permissions } = require('../core/engine.cjs');
 const policy = permissions('/projekt', [], 'plan');
 assert.equal(policy['*'], 'deny');
 for (const tool of ['write', 'edit', 'bash', 'task', 'skill', 'apply_patch']) assert.equal(policy[tool] || policy['*'], 'deny');
 assert.equal(policy.read['*.env'], 'deny');
 assert.equal(policy.read['**/references/**'], 'deny');
 assert.equal(policy.webfetch, 'ask');
 assert.equal(policy.external_directory, 'ask');
});

test('svar på planlægningsspørgsmål følger med i afklaringen, og afvist stop ændrer ikke status', async t => {
 const bench = new Workbench({directory:await temp(t), profiles, emit:()=>{}, safeStorage:{}});
 bench.runMode='plan'; bench.planConversation=[]; bench.engine={request:async()=>true};
 await bench.question({id:'spørgsmål',answers:[['Kun interne brugere']]});
 assert.match(bench.planConversation[0],/Kun interne brugere/);
 bench.runStopped=false; bench.plan={id:'bevar'}; bench.finishing=Promise.resolve();
 await assert.rejects(bench.stop(),/Afslutningen/);
 assert.equal(bench.runStopped,false); assert.equal(bench.plan.id,'bevar');
});

test('planlægning vælger plan-agenten og beholder de samme eksplicitte tilladelser', async () => {
  const { OpenCodeEngine, engineConfig, permissions } = require('../core/engine.cjs');
  for (const mode of ['plan', 'build', 'free']) {
    const engine = new OpenCodeEngine({ root: '/tmp/testprojekt', mode, model: { id: 'test' } });
    engine.active = true; engine.session = { id: 'testsession' };
    let sent;
    engine.request = async (url, method, body) => { sent = body; };
    await engine.send('Prøve', 'Regler');
    assert.equal(sent.agent, mode === 'plan' ? 'plan' : 'build');
    const permission = permissions('/tmp/testprojekt', [], mode);
    const config = engineConfig({}, { id: 'test' }, permission);
    assert.deepEqual(config.agent.plan.permission, permission);
  }
});


test('planen bruger kun sidste agentsvar; tidligere arbejdsnoter bevares som kontekst', () => {
 const { planningReply } = require('../core/workbench.cjs');
 const roles = new Map([['u', 'user'], ['a1', 'assistant'], ['a2', 'assistant']]);
 const parts = new Map([
  ['p1', {messageID:'a1', text:'Jeg undersøger filerne.'}],
  ['pu', {messageID:'u', text:'Brugerens besked'}],
  ['p2', {messageID:'a2', text:'Det bygger vi'}],
  ['p3', {messageID:'a2', text:'En side med lokale eksempeldata.'}]
 ]);
 assert.deepEqual(planningReply(roles, parts), {text:'Det bygger vi\nEn side med lokale eksempeldata.', context:'Jeg undersøger filerne.\nDet bygger vi\nEn side med lokale eksempeldata.'});
 roles.set('a3','assistant');
 assert.equal(planningReply(roles, parts).text, '', 'Et sidste svar uden tekst må ikke genbruge en tidligere arbejdsnote som plan');
 assert.equal(planningReply(new Map(),new Map()).text,'');
});

test('streamet tekst bevares ved stop, mens arbejdsnoter og tilladelser udelades', async t => {
 const directory=await temp(t), root=path.join(directory,'projekt'); await fs.mkdir(root);
 const bench=new Workbench({directory:path.join(directory,'data'),profiles,emit:()=>{},safeStorage:{}});
 await bench.activate({root,name:'Prøve'});
 bench.runUser={id:'u',role:'user',text:'Min besked'}; bench.runMode='plan'; bench.running=true;
 bench.event({type:'message.updated',properties:{info:{id:'a',role:'assistant'}}});
 bench.event({type:'message.part.updated',properties:{part:{id:'t',messageID:'a',type:'text',text:'Svar'}}});
 bench.event({type:'message.part.delta',properties:{partID:'t',field:'text',delta:' som streames'}});
 bench.event({type:'message.part.updated',properties:{part:{id:'r',messageID:'a',type:'reasoning',text:'Intern note'}}});
 bench.event({type:'permission.asked',properties:{id:'approval',permission:'edit'}});
 await bench.stop(); await bench.close();
 const reopened=await bench.activate({root,name:'Prøve'});
 assert.equal(reopened.workspace.status,'stopped'); assert.equal(reopened.workspace.plan,null);
 assert.equal(reopened.workspace.messages[1].text,'Svar som streames');
 assert.doesNotMatch(JSON.stringify(reopened.workspace), /Intern note|approval/);
 await bench.close();
});
