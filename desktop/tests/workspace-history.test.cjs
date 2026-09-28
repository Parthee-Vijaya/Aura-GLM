const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../core/store.cjs');
const { WorkspaceHistory } = require('../core/workspace-history.cjs');
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'harness-history-'));
  t.after(() => fs.rm(root,{recursive:true,force:true}));
  const history = new WorkspaceHistory(new Store(path.join(root,'state')));
  return {root,history};
}
test('kladde, plan og samtale genåbnes fra appdata uden tilladelser eller projektændringer', async t => {
  const {root,history}=await setup(t); const project={root:path.join(root,'projekt med mellemrum'),name:'Testprojekt'};
  await fs.mkdir(project.root); await history.open(project);
  const plan={id:'p1',text:'En plan',context:'Afklaringen'};
  await history.saveRun(project.root,{messages:[{id:'u',role:'user',text:'Min idé',apiKey:'må ikke gemmes'},{id:'a',role:'assistant',text:'Mit forslag'}],plan,planConversation:['Min idé','Mit forslag'],status:'idle',mode:'plan'});
  await Promise.all([history.draft(project.root,{text:'Ny kladde',mode:'plan'}),history.saveRun(project.root,{messages:[],plan,planConversation:['Min idé','Mit forslag'],status:'idle',mode:'plan'})]);
  const fresh=new WorkspaceHistory(history.store); const reopened=await fresh.open(project);
  assert.equal(reopened.draft,'Ny kladde'); assert.equal(reopened.plan.id,'p1'); assert.equal(reopened.messages.length,2);
  assert.equal((await fs.readFile(history.file(project.root),'utf8')).includes('må ikke gemmes'),false);
  assert.deepEqual(await fs.readdir(project.root),[]); assert.equal((await fresh.recent())[0].root,project.root);
});
test('afbrudt opgave bliver ikke genstartet eller præsenteret som en godkendt plan', async t => {
  const {root,history}=await setup(t); const project={root,name:'Afbrudt'};
  await history.saveRun(root,{messages:[{id:'u',role:'user',text:'Fortsæt min idé'}],plan:{id:'gammel'},planConversation:[],status:'working',mode:'build',clearDraft:true});
  const reopened=await history.open(project);
  assert.equal(reopened.status,'interrupted'); assert.equal(reopened.plan,null); assert.equal(reopened.draft,'Fortsæt min idé');
});
test('projekter holdes adskilt og beskadiget historik bevares', async t => {
  const {root,history}=await setup(t);
  await history.draft('/projekt-a',{text:'A',mode:'plan'}); await history.draft('/projekt-b',{text:'B',mode:'free'});
  assert.equal((await history.read('/projekt-a')).draft,'A');
  assert.throws(() => history.draft(root,{text:'A',mode:'ukendt'}),/Ugyldig/);
  const file=history.file('/projekt-a'); await fs.writeFile(file,'beskadiget');
  await assert.rejects(history.draft('/projekt-a',{text:'overskriv',mode:'plan'}),/bevare/);
  assert.equal(await fs.readFile(file,'utf8'),'beskadiget');
});
test('historikken har en øvre grænse, og værktøjsdata lagres ikke', async t => {
  const {root,history}=await setup(t);
  await history.saveRun(root,{messages:[...Array.from({length:220},(_,i)=>({id:String(i),role:'assistant',text:'Svar '+i})),{id:'tool',role:'tool',text:'hemmeligt værktøjsoutput'}],plan:null,planConversation:[],status:'idle',mode:'free'});
  const stored=await history.read(root); assert.equal(stored.messages.length,200); assert.equal(stored.trimmed,true); assert.equal(stored.messages.at(-1).text,'Svar 219');
});
test('ny samtale arkiverer også beskadigede data uden at overskrive dem', async t => {
  const {root,history}=await setup(t);
  await history.open({root,name:'Arkiv'});
  await fs.writeFile(history.file(root), 'beskadiget indhold, der skal bevares');
  await history.startConversation(root);
  assert.equal((await history.read(root)).draft, '');
  const archive=history.file(root).replace(/\.json$/, '')+'-archives';
  const entries=await fs.readdir(archive);
  assert.equal(entries.length,1);
  assert.equal(await fs.readFile(path.join(archive,entries[0]),'utf8'),'beskadiget indhold, der skal bevares');
});
