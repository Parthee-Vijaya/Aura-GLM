const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const path=require('node:path');const os=require('node:os');
const {ConversationPermission}=require('../core/conversation-permission.cjs');const {ApprovalsPolicy}=require('../core/approvals-policy.cjs');const {Store}=require('../core/store.cjs');const {ChatSession}=require('../core/chat-session.cjs');
test('explicit acknowledgment, one use, expiration, revocation and fresh-instance scope',()=>{
 let now=100;const permission=new ConversationPermission({now:()=>now});const review=permission.review({chat:'a'});
 assert.throws(()=>permission.check(review.token,false),/advarslen/);assert.throws(()=>permission.check('wrong',true),/advarslen/);permission.activate(permission.check(review.token,true));assert.equal(permission.active,true);assert.throws(()=>permission.check(review.token,true),/advarslen/);assert.equal(new ConversationPermission().active,false);permission.revoke();assert.equal(permission.active,false);const exp=permission.review({});now+=300001;assert.throws(()=>permission.check(exp.token,true),/advarslen/);
});
async function fixture(t){
 const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'aura-session-grant-')));t.after(()=>fs.rm(base,{recursive:true,force:true}));const root=path.join(base,'project');await fs.mkdir(root);const policy=new ApprovalsPolicy(new Store(path.join(base,'profile'),{}));const permission=new ConversationPermission();permission.activate(permission.check(permission.review({}).token,true));return {root,base,policy,permission,context:{projectRoot:root,workspaceRoot:root,mode:'free',commandSandbox:true,conversationPermission:permission,taskRules:new Set()}};
}
test('session grant allows project edits and isolated commands but not data boundaries, other chats or plan mode',async t=>{
 const f=await fixture(t),edit=file=>({id:'edit',permission:'edit',metadata:{filepath:file},patterns:[]});const cmd={id:'cmd',permission:'bash',toolInput:{command:'echo ok',workdir:f.root}};
 assert.equal((await f.policy.allowed(f.context,edit(path.join(f.root,'index.html')))).source,'conversation');assert.equal((await f.policy.allowed(f.context,cmd)).source,'conversation');
 for(const file of ['.env','secrets/key.txt','references/file.txt','.git/config','x.pem'])assert.equal((await f.policy.allowed(f.context,edit(path.join(f.root,file)))).allowed,false,file);
 assert.equal((await f.policy.allowed(f.context,edit(path.join(f.base,'outside.txt')))).source,'conversation');
 for(const ctx of [{mode:'plan'},{mode:'chat'},{conversationPermission:new ConversationPermission()},{commandSandbox:false}])assert.equal((await f.policy.allowed({...f.context,...ctx},cmd)).allowed,false);
 assert.equal((await f.policy.allowed(f.context,{id:'web',permission:'webfetch',patterns:['https://example.com']})).source,'conversation');
 f.permission.revoke();assert.equal((await f.policy.allowed(f.context,edit(path.join(f.root,'index.html')))).allowed,false);
 assert.deepEqual(await f.policy.settings(f.root),{autoProjectFiles:false,autoCommands:false,rules:[]});
});
test('a stopped or replaced pending request cannot activate a reviewed conversation',async t=>{
 const f=await fixture(t),entries=new Map();const bench={project:{root:f.root},emit(){},chatsChanged(){},approvalsPolicy:f.policy,changesFor(){return {activity:{put(e){entries.set(e.id,e);return e},get:id=>entries.get(id),list:()=>[...entries.values()]}}}};
 const chat=new ChatSession(bench,{id:'chat-a'},f.root);t.after(()=>clearTimeout(chat.historyTimer));chat.running=true;chat.runMode='free';chat.generation=1;chat.commandSandbox={};chat.engine={sandbox:chat.commandSandbox,pending:new Map()};
 const p={id:'edit',permission:'edit',metadata:{filepath:path.join(f.root,'index.html')},patterns:[]};const request={};chat.engine.pending.set('edit',request);chat.approvals.set('edit',{p,descriptor:await f.policy.describe(f.context,p),request,engine:chat.engine,generation:1});
 const review=await chat.permissionReview({id:'edit'});chat.engine.pending.set('edit',{});await assert.rejects(chat.permissionConfirm({token:review.token,acknowledged:true}),/ikke længere/);assert.equal(chat.conversationPermission.active,false);
});

test('external command dispatcher is shipped outside asar for the pinned Node process', () => {
 assert.ok(require('../electron-builder.cjs').asarUnpack.includes('core/command-dispatch.cjs'));
});

function chatFixture(f, id = 'chat-a') {
 const events = [], entries = new Map();
 const bench = { project: { root: f.root }, emit: event => events.push(event), chatsChanged(){}, approvalsPolicy: f.policy,
  changesFor(){return {activity:{put(e){entries.set(e.id,e);return e},get:id=>entries.get(id),list:()=>[...entries.values()]}}} };
 return { chat: new ChatSession(bench, { id, plan: { id: 'plan-kept' }, messages: [{role:'user',text:'Keep context'}] }, f.root), events };
}
test('YOLO before a task requires acknowledgment, preserves plans/context and invalidates an unisolated prepared send', async t => {
 const f = await fixture(t), {chat, events} = chatFixture(f);
 t.mock.method(require('../core/command-sandbox.cjs'), 'support', async () => ({ available: true }));
 chat.prepared = { commandIsolation: false };
 const review = await chat.permissionReview({mode:'free'});
 assert.equal(chat.conversationPermission.active, false);
 await assert.rejects(chat.permissionConfirm({token:review.token,acknowledged:false}), /advarslen/);
 await assert.rejects(chatFixture(f,'other').chat.permissionConfirm({token:review.token,acknowledged:true}), /advarslen/);
 await chat.permissionConfirm({token:review.token,acknowledged:true});
 assert.equal(chat.conversationPermission.active, true); assert.equal(chat.prepared, null);
 assert.deepEqual(chat.plan,{id:'plan-kept'}); assert.equal(chat.data.messages[0].text,'Keep context');
 assert.equal(chat.running,false); assert.equal(events.at(-1).type,'conversation.permission');
 assert.equal(chatFixture(f).chat.conversationPermission.active,false);
 assert.equal(Object.hasOwn(chat.data,'conversationPermission'),false);
 chat.permissionRevoke(); assert.equal(chat.conversationPermission.active,false);
 await assert.rejects(chat.permissionConfirm({token:review.token,acknowledged:true}), /advarslen/);
});
test('YOLO cannot activate without isolation, in read-only modes, during startup or with a stale review', async t => {
 const f = await fixture(t), {chat} = chatFixture(f), sandbox = require('../core/command-sandbox.cjs');
 const support=t.mock.method(sandbox,'support',async()=>({available:false,reason:'No isolation'}));
 await assert.rejects(chat.permissionReview({mode:'free'}),/No isolation/);
 support.mock.mockImplementation(async()=>({available:true}));
 for(const mode of ['chat','plan','anything']) await assert.rejects(chat.permissionReview({mode}),/Vælg Byg/);
 chat.starting=true; await assert.rejects(chat.permissionReview({mode:'free'}),/Vent/); chat.starting=false;
 const review=await chat.permissionReview({mode:'build'}); chat.generation++;
 await assert.rejects(chat.permissionConfirm({token:review.token,acknowledged:true}),/ikke længere/);
 assert.equal(chat.conversationPermission.active,false);
 const next=await chat.permissionReview({mode:'free'}); chat.permissionRevoke();
 await assert.rejects(chat.permissionConfirm({token:next.token,acknowledged:true}),/advarslen/);
 support.mock.mockImplementation(async()=>{chat.running=true;return {available:true};});
 await assert.rejects(chat.permissionReview({mode:'free'}),/ændret/);
});
test('YOLO allows ordinary web/external access, but no secrets, broad directories, ambiguous paths, read-only modes or unknown tools', async t => {
 const f=await fixture(t), folder=path.join(f.base,'ordinary');
 await fs.mkdir(folder); await fs.mkdir(path.join(f.base,'.ssh')); await fs.symlink(path.join(f.base,'.ssh'),path.join(f.base,'alias'));
 const requests=[
  {id:'web',permission:'webfetch',patterns:['https://example.com/docs']},
  {id:'read',permission:'read',metadata:{filepath:path.join(folder,'guide.md')}},
  {id:'outside',permission:'external_directory',patterns:[folder+'/*']},
  {id:'edit',permission:'edit',metadata:{filepath:path.join(folder,'guide.md')}}
 ];
 for(const p of requests) {
  assert.equal((await f.policy.allowed(f.context,p)).source,'conversation',p.id);
  for(const mode of ['chat','plan']) assert.equal((await f.policy.allowed({...f.context,mode},p)).allowed,false,p.id+mode);
  assert.equal((await f.policy.allowed({...f.context,conversationPermission:new ConversationPermission()},p)).allowed,false,p.id);
 }
 for(const file of ['.ssh/id_rsa','.aws/credentials','.npmrc','.pypirc','references/readonly.txt','alias/id_rsa']) {
  assert.equal((await f.policy.allowed(f.context,{id:file,permission:'read',metadata:{filepath:path.join(f.base,file)}})).allowed,false,file);
 }
 for(const url of ['file:///etc/passwd','https://user:password@example.com','https://*.example.com']) {
  assert.equal((await f.policy.allowed(f.context,{id:'url',permission:'webfetch',patterns:[url]})).allowed,false);
 }
 for(const p of [
  {permission:'external_directory',patterns:[os.homedir()+'/*']},
  {permission:'edit',patterns:['*']},
  {permission:'bash',toolInput:{command:'echo ok',workdir:folder}},
  {permission:'custom-tool',patterns:['anything']}
 ]) assert.equal((await f.policy.allowed(f.context,{id:'denied',...p})).allowed,false);
 assert.deepEqual(await f.policy.settings(f.root),{autoProjectFiles:false,autoCommands:false,rules:[]});
});
test('activating YOLO during Build rechecks waiting tools and revocation prevents later automatic replies', async t => {
 const f=await fixture(t), {chat}=chatFixture(f), replies=[];
 const sandbox={enforced:false};
 t.mock.method(require('../core/command-sandbox.cjs'),'activate',async value=>{assert.equal(value,sandbox);value.enforced=true;});
 chat.running=true;chat.runMode='free';chat.generation=1;chat.commandSandbox=sandbox;
 chat.prepared={commandSandboxSupported:true};
 chat.engine={sandbox,pending:new Map(),reply:async id=>{replies.push(id);chat.engine.pending.delete(id);}};
 const p={id:'web',permission:'webfetch',patterns:['https://example.com/docs']};
 chat.engine.pending.set(p.id,{});
 await chat.permissionAsked({properties:p});
 assert.deepEqual(replies,[]);
 const review=await chat.permissionReview({id:p.id});
 await chat.permissionConfirm({token:review.token,acknowledged:true});
 assert.deepEqual(replies,['web']);assert.equal(sandbox.enforced,true);
 chat.permissionRevoke();
 chat.engine.pending.set('next',{});await chat.permissionAsked({properties:{...p,id:'next'}});
 assert.deepEqual(replies,['web']);assert.ok(chat.approvals.has('next'));
});
