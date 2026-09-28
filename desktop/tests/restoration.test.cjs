const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { GitVersions, run } = require('../core/git.cjs');
const { Restoration } = require('../core/restoration.cjs');
async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-restore-'))), root = path.join(base, 'Projekt med mellemrum');
  await fs.mkdir(root); t.after(() => fs.rm(base, { recursive: true, force: true }));
  const git = new GitVersions(); await git.initialize(root);
  // Brugerens særskilte tilladelse gælder kun syntetiske testrepositories.
  for (const [key, value] of [['user.name','Testbruger'], ['user.email','test@example.invalid'], ['commit.gpgsign','false'], ['core.hooksPath',path.join(base, 'hooks')]]) await run(root, ['config','--local',key,value]);
  const store = { root: path.join(base, 'appdata'), projectKey: x => createHash('sha256').update(x).digest('hex') };
  const restore = new Restoration(git, store);
  const write = async (name, value) => { await fs.mkdir(path.dirname(path.join(root,name)), { recursive: true }); await fs.writeFile(path.join(root,name), value); };
  const save = async () => { const review = await git.review(root); return (await git.commit(root, { token: review.token, files: review.files.filter(f => !f.blocked).map(f => f.file), message: 'Syntetisk version' })).head; };
  await write('public/index.html', '<h1>Første version</h1>'); await write('.gitignore', '.env\nnode_modules/\n'); const first = await save();
  await write('public/index.html', '<h1>Anden version</h1>'); await write('extra.txt', 'Senere fil'); const second = await save();
  return { base, root, git, store, restore, write, save, first, second };
}
test('gendan og fortryd efter genstart, med uændret HEAD/index og bevarede private/nye filer', async t => {
  const f = await fixture(t); await f.write('public/index.html', '<h1>Ugemt forsøg</h1>'); await f.write('ny.txt', 'Uden for historikken'); await f.write('.env', 'LOKAL=bevar');
  if(process.platform!=='win32')await fs.chmod(path.join(f.root,'public/index.html'),0o600);
  const index = await fs.readFile(path.join(f.root,'.git/index'));
  const review = await f.restore.review(f.root, { commit:f.first }); assert.equal(review.files.length,2); assert.equal(review.untracked,1);
  assert.match(review.files.find(x=>x.file==='public/index.html').before,/Ugemt/);
  await f.restore.apply(f.root, review.token);
  assert.match(await fs.readFile(path.join(f.root,'public/index.html'),'utf8'),/Første/);
  if(process.platform!=='win32')assert.equal((await fs.stat(path.join(f.root,'public/index.html'))).mode&0o777,0o600);
  await assert.rejects(fs.stat(path.join(f.root,'extra.txt')),{code:'ENOENT'});
  assert.equal(await fs.readFile(path.join(f.root,'ny.txt'),'utf8'),'Uden for historikken'); assert.equal(await fs.readFile(path.join(f.root,'.env'),'utf8'),'LOKAL=bevar');
  assert.equal((await f.git.status(f.root)).head, f.second); assert.deepEqual(await fs.readFile(path.join(f.root,'.git/index')),index);
  const reopened = new Restoration(f.git, f.store); const undo = await reopened.review(f.root, {undo:true}); await reopened.apply(f.root, undo.token);
  assert.match(await fs.readFile(path.join(f.root,'public/index.html'),'utf8'),/Ugemt/); assert.equal(await fs.readFile(path.join(f.root,'extra.txt'),'utf8'),'Senere fil');
  if(process.platform!=='win32')assert.equal((await fs.stat(path.join(f.root,'public/index.html'))).mode&0o777,0o600);
  assert.deepEqual(await fs.readFile(path.join(f.root,'.git/index')),index);
  await assert.rejects(reopened.apply(f.root, undo.token),/Gennemgå/);
});
test('afvis nye ændringer, stage, symlink, hemmeligheder og uvedkommende commits før filskrivning', async t => {
  const f=await fixture(t); let review=await f.restore.review(f.root,{commit:f.first}); await f.write('public/index.html','Samtidig ændring');
  await assert.rejects(f.restore.apply(f.root,review.token),/ændret/);
  review=await f.restore.review(f.root,{commit:f.first}); await run(f.root,['add','public/index.html']); await assert.rejects(f.restore.apply(f.root,review.token),/staged/);
  await run(f.root,['reset','--','public/index.html']);
  await f.write('public/index.html','const api_key = "sk-'+'x'.repeat(30)+'"'); await assert.rejects(f.restore.review(f.root,{commit:f.first}),/hemmelighed/);
  await fs.unlink(path.join(f.root,'public/index.html')); await fs.symlink(path.join(f.base,'outside'),path.join(f.root,'public/index.html')); await assert.rejects(f.restore.review(f.root,{commit:f.first}),/links/);
  await assert.rejects(f.restore.review(f.root,{commit:'HEAD~1'}),/Vælg/);
});
test('afbrudt filskrivning giver en vedvarende kopi, der kan genskabe delvis gendannelse', async t => {
  const f=await fixture(t); const review=await f.restore.review(f.root,{commit:f.first}); const rename=fs.rename;
  fs.rename=async (from,to) => { if(to===path.join(f.root,'public/index.html')) throw new Error('Syntetisk diskfejl'); return rename(from,to); };
  try { await assert.rejects(f.restore.apply(f.root,review.token),/afbrudt/); } finally { fs.rename=rename; }
  assert.equal((await f.restore.status(f.root)).state,'failed');
  const reopened=new Restoration(f.git,f.store); await assert.rejects(reopened.review(f.root,{commit:f.first}),/afbrudt/);
  // En efterfølgende faktisk ændring gør genskabelsen synlig, selv hvis fejlen lå før første skrivning.
  await f.write('public/index.html','Delvis ændring'); const undo=await reopened.review(f.root,{undo:true}); await reopened.apply(f.root,undo.token);
  assert.match(await fs.readFile(path.join(f.root,'public/index.html'),'utf8'),/Anden/); assert.equal((await f.git.status(f.root)).head,f.second);
});
test('historisk fil må ikke overskrive en ny ignoreret fil med samme navn',async t=>{
  const f=await fixture(t); await fs.unlink(path.join(f.root,'extra.txt')); await f.save();
  await f.write('.gitignore','extra.txt\n'); await f.save(); await f.write('extra.txt','Privat nyt indhold');
  await assert.rejects(f.restore.review(f.root,{commit:f.second}),/uden for historikken/);
  assert.equal(await fs.readFile(path.join(f.root,'extra.txt'),'utf8'),'Privat nyt indhold');
});
