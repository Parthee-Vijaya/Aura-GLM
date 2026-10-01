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
test('instruktioner kan tilpasses og gendannes pr. projekt uden at ændre biblioteket', async t => {
 const bench = new Workbench({ directory: await temp(t), profiles, emit: () => {}, safeStorage: {} });
 const original = (await bench.skills.list('/a')).find(s => s.id === 'harness-git-og-samarbejde');
 assert.equal(original.title, 'Git og samarbejde'); assert.equal(original.enabled, true);
 await bench.skills.save('/a', { id: original.id, content: original.content + '\nEkstra prøvekrav.' });
 assert.ok((await bench.skills.context('/a')).skills.find(s => s.name === original.id).files[0].content.includes('Ekstra prøvekrav.'));
 assert.equal((await bench.skills.list('/b')).find(s => s.id === original.id).content, original.content, 'andre projekter bruger den fælles version');
 await assert.rejects(bench.skills.save('/a', { id: original.id, content: 'Uden YAML-felt' }), /YAML-felt/);
 await assert.rejects(bench.skills.save('/a', { id: original.id, content: original.content.replace('name: harness-git-og-samarbejde', 'name: noget-andet') }), /samme som mappens navn/);
 await assert.rejects(bench.skills.save('/a', { id: 'git-og-versioner', content: 'x' }), /ugyldige/, 'appens gamle skills findes ikke længere');
 await bench.skills.save('/a', { id: original.id, content: original.content, reset: true });
 assert.equal((await bench.skills.list('/a')).find(s => s.id === original.id).customized, false);
 // Grundreglerne gælder altid. En tilpasning fra en tidligere version med YAML-felt vises uden feltet.
 await bench.store.saveProject('/a', { skills: { 'faelles-grundregler': { content: '---\nname: faelles-grundregler\ndescription: Gammel.\n---\n\nEgne regler.', enabled: false } } });
 const rules = (await bench.skills.list('/a'))[0];
 assert.equal(rules.content, 'Egne regler.'); assert.equal(rules.enabled, true);
 assert.equal((await bench.skills.context('/a')).rules, 'Egne regler.');
 // En slået fra funktion fjerner dens skills fra det, AI’en kan hente.
 await bench.features.save('/a', { scope: 'projekt', values: { versioner: false } });
 const context = await bench.skills.context('/a');
 assert.ok(!context.skills.some(s => ['harness-git-og-samarbejde', 'harness-udgivelse-og-gendannelse'].includes(s.name)));
 assert.equal(context.skills.length, 9); assert.equal(context.features.deling, false);
 assert.equal((await bench.skills.context('/b')).skills.length, 10, 'deling er ikke med i den anbefalede pakke');
 assert.ok(context.skills.find(s => s.name === 'harness-design-og-tilgaengelighed').files.some(f => f.path === 'references/tilgaengelighed.md'), 'referencer følger med skillen');
});
test('gendannelsens markør fjerner gamle planer, også når historikskrivning fejler',async t=>{
 const bench=new Workbench({directory:await temp(t),profiles,emit:()=>{},safeStorage:{}});const project={root:bench.store.root,name:'Prøve'};await bench.activate(project);
 await bench.history.update(project.root,data=>{data.plan={id:'gammel',text:'Byg den gamle fil'};data.draft='Bevar kladden';});await bench.activate(project);
 const update=bench.history.update.bind(bench.history);bench.history.update=async()=>{throw Error('Syntetisk diskfejl');};
 await bench.invalidatePlan('gendannelse-1');assert.equal(bench.plan,null);assert.equal(bench.workspace.plan,null);assert.equal(bench.workspace.draft,'Bevar kladden');assert.match(bench.historyWarning,/kunne ikke/);
 bench.history.update=update;await bench.activate(project);assert.equal(bench.plan.id,'gammel');await bench.invalidatePlan('gendannelse-1');assert.equal(bench.plan,null);assert.equal((await bench.history.read(project.root)).plan,null);
 await bench.history.update(project.root,data=>{data.plan={id:'ny',text:'Ny plan for gendannede filer'};});await bench.activate(project);await bench.invalidatePlan('gendannelse-1');assert.equal(bench.plan.id,'ny');await bench.close();
});
test('stop under motoropstart sender aldrig prompten', async t => {
 let entered, release, calls=0; const reached = new Promise(r=>entered=r); const blocked = new Promise(r=>release=r);
 const bench = new Workbench({ directory:await temp(t), profiles, emit:()=>{}, safeStorage:{}, engineFactory:()=>({ active:false, start:async()=>{entered();await blocked;}, send:async()=>calls++, abort:async()=>{}, close:async()=>{} }) });
 bench.project = {root:bench.store.root};
 bench.prepared = { root:bench.project.root, disclosure:{fingerprint:'test'}, connection:{kind:'compatible',name:'Prøve',baseURL:'http://127.0.0.1:1/v1'}, model:{id:'test'}, references:[], context:{ rules:'', skills:[], titles:[], features:{ versioner:true } } };
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
 assert.equal((await send({model:'test:free',provider:{allow_fallbacks:true},models:['anden']})).status,200);
 assert.deepEqual(received[0].body.provider,{only:['valgt'],allow_fallbacks:false,max_price:{prompt:0,completion:0,request:0,image:0}});
 assert.equal(received[0].body.models,undefined);
 assert.equal(received[0].headers.authorization,'Bearer prøvenøgle');
 await send({model:'anden'}); assert.equal(received.length,1);
 assert.equal((await send({model:'test:free'})).status,409); assert.equal(received.length,1);
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
 assert.equal(policy.read['references/*'], 'deny');
 assert.equal(policy.webfetch, 'ask');
 assert.deepEqual(policy.external_directory, { '*': 'ask' });
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

test('Tillad for denne opgave gælder kun filer i projektmappen og kun indtil opgaven slutter', async t => {
 const emitted = [], replies = [], root = await temp(t);
 const bench = new Workbench({ directory: await temp(t), profiles, emit: event => emitted.push(event), safeStorage: {} });
 bench.project = { root }; bench.running = true; bench.historyWarning = 'Ingen historik i denne prøve.';
 bench.engine = { pending: new Map(), reply: async (id, allow) => { replies.push([id, allow]); } };
 const ask = (id, permission, metadata = {}) => { const properties = { id, permission, metadata, patterns: [] }; bench.engine.pending.set(id, properties); bench.event({ type: 'permission.asked', properties }); };
 const settle = () => new Promise(resolve => setImmediate(resolve));
 ask('1', 'edit', { filepath: path.join(root, 'public/index.html') });
 assert.equal(emitted.at(-1).properties.id, '1'); assert.deepEqual(replies, []);
 // Kun en filændring i projektet kan tillades for hele opgaven.
 ask('2', 'bash', { command: 'ls' });
 await assert.rejects(bench.reply({ id: '2', allow: true, scope: 'task' }), /projektmappen/);
 assert.equal(bench.allowProjectEdits, false);
 await bench.reply({ id: '1', allow: true, scope: 'task' });
 ask('3', 'edit', { filepath: path.join(root, 'public/styles.css') }); await settle();
 assert.deepEqual(replies, [['1', true], ['3', true]]);
 assert.deepEqual(emitted.at(-1), { type: 'permission.auto', file: 'public/styles.css' });
 // Uden for projektet, Git-historik, hemmeligheder, kommandoer og web spørger stadig.
 for (const [id, permission, metadata] of [['4', 'edit', { filepath: path.join(path.dirname(root), 'andet', 'fil.txt') }], ['5', 'edit', { filepath: path.join(root, '.git', 'config') }], ['6', 'edit', { filepath: path.join(root, '.env.local') }], ['7', 'edit', { filepath: path.join(root, 'noegler', 'server.pem') }], ['8', 'edit', { filepath: 'public/relativ.html' }], ['9', 'bash', { command: 'rm -rf public' }], ['10', 'webfetch']]) {
  ask(id, permission, metadata); await settle();
  assert.equal(emitted.at(-1).properties?.id, id, `handling ${id} skal vises for brugeren`);
 }
 assert.equal(replies.length, 2);
 // Når opgaven er slut, gælder tilladelsen ikke længere.
 bench.event({ type: 'session.idle' }); await bench.finishing;
 assert.equal(bench.allowProjectEdits, false);
 bench.running = true;
 ask('11', 'edit', { filepath: path.join(root, 'public/index.html') }); await settle();
 assert.equal(emitted.at(-1).properties?.id, '11'); assert.equal(replies.length, 2);
});


test('forbruget tælles pr. modelkald og prissættes med ræsonnement som output', async t => {
 const emitted = [];
 const bench = new Workbench({ directory: await temp(t), profiles, emit: event => emitted.push(event), safeStorage: {} });
 const root = await temp(t); await bench.activate({ root, name: 'Prøve' });
 assert.deepEqual(bench.currentUsage(), { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, calls: 0, cost: 0, unpriced: 0 });
 bench.runSteps = new Map(); bench.runPrice = require('../core/connections.cjs').priceFor({ kind: 'anthropic' }, { id: 'claude-opus-5-5' });
 const step = (id, tokens) => bench.event({ type: 'message.part.updated', properties: { part: { id, type: 'step-finish', tokens } } });
 step('a', { input: 1000, output: 200, reasoning: 100, cache: { read: 10000, write: 2000 } });
 step('a', { input: 1000, output: 200, reasoning: 100, cache: { read: 10000, write: 2000 } });
 step('b', { input: 500, output: 100, reasoning: 0, cache: { read: 0, write: 0 } });
 const usage = bench.currentUsage();
 assert.equal(usage.calls, 2, 'samme modelkald tælles kun én gang');
 assert.equal(usage.input, 1500); assert.equal(usage.output, 300); assert.equal(usage.reasoning, 100);
 // Opus 5.5: 4 USD ind, 20 USD ud, 0,2 USD fra cache og 5 USD til cache pr. million tokens.
 assert.ok(Math.abs(usage.cost - (1500 * 4 + 400 * 20 + 10000 * 0.2 + 2000 * 5) / 1e6) < 1e-12);
 assert.equal(emitted.filter(e => e.type === 'usage').length, 2);
 // Forbruget gemmes med samtalen og er nulstillet i en ny samtale.
 bench.running = true; await bench.saveHistory('idle'); bench.running = false;
 await bench.activate({ root, name: 'Prøve' });
 assert.equal(bench.currentUsage().calls, 2);
 await bench.newConversation();
 assert.equal(bench.currentUsage().calls, 0);
 bench.runPrice = null; step('c', { input: 10, output: 5 });
 assert.equal(bench.currentUsage().unpriced, 1);
 await bench.close();
});

test('en Corti-forbindelse beholder miljø og nøgle, når den redigeres uden ny nøgle', async t => {
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: text => Buffer.from(`krypteret:${text}`), decryptString: data => data.toString().slice('krypteret:'.length) };
  const bench = new Workbench({ directory: await temp(t), profiles, emit: () => {}, safeStorage });
  const key = Buffer.from('fr:password:testklient:testbruger:hemmelighed').toString('base64');
  const first = (await bench.saveConnection({ kind: 'corti', name: 'Corti', apiKey: key })).connections[0];
  assert.equal(first.baseURL, 'https://ai.fr.corti.app/v1');
  const renamed = (await bench.saveConnection({ id: first.id, kind: 'corti', name: 'Corti i Frankrig' })).connections[0];
  assert.equal(renamed.baseURL, 'https://ai.fr.corti.app/v1', 'miljøet fra nøglen bevares');
  assert.equal(renamed.hasKey, true, 'nøglen bevares, fordi adressen er den samme');
  assert.equal(bench.store.decrypt((await bench.store.read()).connections[0]), key);
});
