const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { GitVersions, run } = require('../core/git.cjs');
const { Checkpoints } = require('../core/checkpoints.cjs');
// Brugeren har godkendt commits og testidentitet alene i disse nye testrepositories.
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-git-')));
 const home=path.join(root,'home');await fs.mkdir(home);process.env.HOME=home;process.env.USERPROFILE=home;process.env.XDG_CONFIG_HOME=path.join(home,'.config');
 const project=path.join(root,'projekt');await fs.mkdir(project);t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const git=new GitVersions();await git.initialize(project);await run(project,['config','--local','user.name','Testbruger']);await run(project,['config','--local','user.email','test@example.invalid']);
 const save=async(files,message='Gem prøveversion')=>{const review=await git.review(project);return git.commit(project,{token:review.token,files,message});};
 return {root,project,git,save};
}
test('rigtige commits med aktivt filvalg, historik, sletning og ingen push',async t=>{
 const {project,git,save}=await fixture(t);await fs.writeFile(path.join(project,'første.txt'),'Første');await fs.writeFile(path.join(project,'anden.txt'),'Anden');
 const first=await save(['første.txt']);assert.ok(first.head);assert.equal((await git.status(project)).history[0].message,'Gem prøveversion');
 assert.equal((await run(project,['ls-tree','--name-only','HEAD'])).toString().includes('anden.txt'),false);
 assert.equal((await run(project,['remote'])).toString(),'');await fs.unlink(path.join(project,'første.txt'));await save(['første.txt']);
 assert.equal((await run(project,['ls-tree','--name-only','HEAD'])).toString(),'');assert.equal(await fs.readFile(path.join(project,'anden.txt'),'utf8'),'Anden');
});
test('stale gennemgang, hemmeligheder og eksisterende stage bliver afvist',async t=>{
 const {project,git,save}=await fixture(t);await fs.writeFile(path.join(project,'a.txt'),'Start');await save(['a.txt']);
 await fs.writeFile(path.join(project,'a.txt'),'Ændring');const review=await git.review(project);await fs.writeFile(path.join(project,'a.txt'),'Ny ændring');
 await assert.rejects(git.commit(project,{token:review.token,files:['a.txt'],message:'Prøve'}),/ændret/);
 await fs.writeFile(path.join(project,'.env'),'SECRET=prøve');await fs.writeFile(path.join(project,'config.js'),'const api_key = "sk-'+'x'.repeat(30)+'";');
 const secret=await git.review(project);assert.ok(secret.files.find(f=>f.file==='.env').blocked);assert.ok(secret.files.find(f=>f.file==='config.js').blocked);
 assert.equal(JSON.stringify(secret).includes('x'.repeat(30)),false);await assert.rejects(git.commit(project,{token:secret.token,files:['config.js'],message:'Prøve'}),/blokerede/);
 await run(project,['add','--','a.txt']);const before=await fs.readFile(path.join(project,'.git/index'));await assert.rejects(git.review(project),/staged/);assert.deepEqual(await fs.readFile(path.join(project,'.git/index')),before);
});
test('afvis overordnet repository og symbolske links; bevar afvisende hook',async t=>{
 const {project,git,save}=await fixture(t);await fs.mkdir(path.join(project,'under'));assert.match((await git.status(path.join(project,'under'))).block,/rodmappe/);await assert.rejects(git.initialize(path.join(project,'under')));
 await fs.writeFile(path.join(project,'a.txt'),'A');await save(['a.txt']);await fs.symlink('a.txt',path.join(project,'link.txt'));assert.ok((await git.review(project)).files.find(f=>f.file==='link.txt').blocked);
 await fs.writeFile(path.join(project,'.git/hooks/pre-commit'),'#!/bin/sh\nexit 1\n',{mode:0o755});await fs.writeFile(path.join(project,'a.txt'),'B');const head=(await git.status(project)).head;
 await assert.rejects(save(['a.txt']),/kunne ikke gemmes/);assert.equal((await git.status(project)).head,head);assert.equal(await fs.readFile(path.join(project,'a.txt'),'utf8'),'B');
});
test('automatisk checkpoint kun efter afgrænset filændring; aldrig efter stop eller ukendte ændringer',async t=>{
 const {project,git,save}=await fixture(t);const events=[];const checkpoints=new Checkpoints(git,e=>events.push(e));const file=path.join(project,'a.txt');await fs.writeFile(file,'Start');await save(['a.txt']);
 const edit=()=>checkpoints.observe({type:'message.part.updated',properties:{part:{id:'1',type:'tool',tool:'write',state:{status:'completed',input:{filePath:file}}}}});
 await checkpoints.begin(project,true);await fs.writeFile(file,'Agentændring');edit();await checkpoints.finish();assert.equal(events.at(-1).status,'saved');const head=(await git.status(project)).head;
 await checkpoints.begin(project,true);await fs.writeFile(file,'Stoppet');edit();checkpoints.cancel();await checkpoints.finish();assert.equal(events.at(-1).status,'skipped');assert.equal((await git.status(project)).head,head);
 await save(['a.txt']);await checkpoints.begin(project,true);await fs.writeFile(file,'Ikke agentens filværktøj');await checkpoints.finish();assert.equal(events.at(-1).status,'skipped');
 await checkpoints.begin(project,true);edit();await checkpoints.finish();assert.match(events.at(-1).message,/ugemte/);
 await save(['a.txt']);
 for (const tool of ['bash','apply_patch']) {
  await checkpoints.begin(project,true);await fs.writeFile(file,tool);edit();
  checkpoints.observe({type:'message.part.updated',properties:{part:{id:'2',type:'tool',tool,state:{status:'completed',input:{}}}}});
  await checkpoints.finish();assert.equal(events.at(-1).status,'skipped');await save(['a.txt']);
 }
 await checkpoints.begin(project,true);await fs.writeFile(file,'Afvist opgave');edit();
 checkpoints.observe({type:'message.part.updated',properties:{part:{id:'2',type:'tool',tool:'write',state:{status:'error'}}}});
 await checkpoints.finish();assert.equal(events.at(-1).status,'skipped');await save(['a.txt']);
 await checkpoints.begin(project,true);await fs.writeFile(file,'Agent');edit();await checkpoints.active.pending;await fs.writeFile(file,'Samtidig ændring');
 await checkpoints.finish();assert.equal(events.at(-1).status,'skipped');
});
