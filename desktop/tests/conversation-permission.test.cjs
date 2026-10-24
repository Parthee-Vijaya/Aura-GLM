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
 assert.equal((await f.policy.allowed(f.context,edit(path.join(f.base,'outside.txt')))).allowed,false);
 for(const ctx of [{mode:'plan'},{mode:'chat'},{conversationPermission:new ConversationPermission()},{commandSandbox:false}])assert.equal((await f.policy.allowed({...f.context,...ctx},cmd)).allowed,false);
 assert.equal((await f.policy.allowed(f.context,{id:'web',permission:'webfetch',patterns:['https://example.com']})).allowed,false);
 f.permission.revoke();assert.equal((await f.policy.allowed(f.context,edit(path.join(f.root,'index.html')))).allowed,false);
 assert.deepEqual(await f.policy.settings(f.root),{autoProjectFiles:false,autoCommands:false,rules:[]});
});
test('a stopped or replaced pending request cannot activate a reviewed conversation',async t=>{
 const f=await fixture(t),entries=new Map();const bench={project:{root:f.root},emit(){},chatsChanged(){},approvalsPolicy:f.policy,changesFor(){return {activity:{put(e){entries.set(e.id,e);return e},get:id=>entries.get(id),list:()=>[...entries.values()]}}}};
 const chat=new ChatSession(bench,{id:'chat-a'},f.root);t.after(()=>clearTimeout(chat.historyTimer));chat.running=true;chat.runMode='free';chat.generation=1;chat.commandSandbox={};chat.engine={sandbox:chat.commandSandbox,pending:new Map()};
 const p={id:'edit',permission:'edit',metadata:{filepath:path.join(f.root,'index.html')},patterns:[]};const request={};chat.engine.pending.set('edit',request);chat.approvals.set('edit',{p,descriptor:await f.policy.describe(f.context,p),request,engine:chat.engine,generation:1});
 const review=chat.permissionReview({id:'edit'});chat.engine.pending.set('edit',{});await assert.rejects(chat.permissionConfirm({token:review.token,acknowledged:true}),/ikke længere/);assert.equal(chat.conversationPermission.active,false);
});

test('external command dispatcher is shipped outside asar for the pinned Node process', () => {
 assert.ok(require('../electron-builder.cjs').asarUnpack.includes('core/command-dispatch.cjs'));
});
