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
test('automatisk version efter hver opgave med præcis opgavens filer; hemmeligheder og hooks gemmes aldrig',async t=>{
 const {project,git,save}=await fixture(t);const events=[];const checkpoints=new Checkpoints(git,e=>events.push(e));const file=path.join(project,'a.txt');await fs.writeFile(file,'Start');await save(['a.txt']);
 const log=async()=>(await run(project,['log','--format=%s','-1'])).toString().trim();
 const files=async()=>(await run(project,['show','--name-only','--format=','HEAD'])).toString().trim().split('\n').filter(Boolean);
 // En almindelig opgave gemmes med opgavens tekst, uanset værktøj.
 await checkpoints.begin(project,true,'Byg første udkast');await fs.writeFile(file,'Agentændring');await fs.writeFile(path.join(project,'ny.txt'),'Ny fil fra en kommando');await checkpoints.finish();
 assert.equal(events.at(-1).status,'saved');assert.equal(await log(),'AI-opgave: Byg første udkast');assert.deepEqual((await files()).sort(),['a.txt','ny.txt']);
 assert.ok(events.at(-1).previous && events.at(-1).head!==events.at(-1).previous);
 // Ugemte ændringer fra før opgaven bliver ugemte; kun opgavens fil kommer med.
 await fs.writeFile(path.join(project,'mine.txt'),'Brugerens egen kladde');
 await checkpoints.begin(project,true,'Ret overskriften');await fs.writeFile(file,'Ny overskrift');await checkpoints.finish();
 assert.deepEqual(await files(),['a.txt']);assert.match((await run(project,['status','--porcelain'])).toString(),/\?\? mine\.txt/);
 // Et stop gemmes som en afbrudt opgave, så den kan fortrydes.
 await checkpoints.begin(project,true,'Lav en mobilvisning');await fs.writeFile(file,'Halvt færdig');checkpoints.cancel();await checkpoints.finish();
 assert.equal(events.at(-1).status,'saved');assert.equal(await log(),'Afbrudt AI-opgave: Lav en mobilvisning');
 // Ingen ændringer giver ingen version.
 const head=(await git.status(project)).head;await checkpoints.begin(project,true,'Forklar koden');await checkpoints.finish();
 assert.equal(events.at(-1).status,'unchanged');assert.equal((await git.status(project)).head,head);
 // En fil med en mulig nøgle gemmes aldrig automatisk; resten af opgaven gemmes.
 await checkpoints.begin(project,true,'Tilføj konfiguration');await fs.writeFile(file,'Sidste tekst');await fs.writeFile(path.join(project,'config.js'),'const apiKey = "sk-ant-abcdefghijklmnopqrstuvwxyz0123";');await checkpoints.finish();
 assert.equal(events.at(-1).status,'saved');assert.deepEqual(events.at(-1).kept,['config.js']);assert.deepEqual(await files(),['a.txt']);
 await fs.rm(path.join(project,'config.js'));
 // Historik ændret under opgaven giver ingen automatisk version.
 await checkpoints.begin(project,true,'Samtidig');await fs.writeFile(file,'Agent');await save(['a.txt'],'Gemt i et andet program');await fs.writeFile(file,'Agent igen');await checkpoints.finish();
 assert.equal(events.at(-1).status,'skipped');assert.match(events.at(-1).message,/historikken/);
 await save(['a.txt']);
 // Git-hooks kan køre programmer; så gemmes intet automatisk.
 const hooks=path.join(project,'.git','hooks');await fs.writeFile(path.join(hooks,'pre-commit'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 await checkpoints.begin(project,true,'Med hook');await fs.writeFile(file,'Hook');await checkpoints.finish();
 assert.equal(events.at(-1).status,'skipped');assert.match(events.at(-1).message,/hooks/);
});
test('nye projekter får Git, en anonym identitet og en første version; eksisterende repositories røres ikke',async t=>{
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-start-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const home=path.join(root,'home');await fs.mkdir(home);process.env.HOME=home;process.env.USERPROFILE=home;process.env.XDG_CONFIG_HOME=path.join(home,'.config');
 const project=path.join(root,'projekt');await fs.mkdir(path.join(project,'public'),{recursive:true});
 await fs.writeFile(path.join(project,'public/index.html'),'<h1>Start</h1>');await fs.writeFile(path.join(project,'.gitignore'),'/references/\n');
 await fs.mkdir(path.join(project,'references'));await fs.writeFile(path.join(project,'references/intern.txt'),'Privat');
 await fs.writeFile(path.join(project,'.env'),'NOEGLE=hemmelig');
 const { ANONYMOUS } = require('../core/git.cjs');const git=new GitVersions();
 assert.deepEqual(await git.startProject(project),{started:true,files:2});
 const status=await git.status(project);
 assert.equal(status.branch,'main');assert.deepEqual(status.identity,ANONYMOUS);assert.equal(status.history.length,1);assert.equal(status.history[0].message,'Projekt oprettet');
 assert.deepEqual((await run(project,['show','--name-only','--format=','HEAD'])).toString().trim().split('\n').sort(),['.gitignore','public/index.html']);
 assert.match((await run(project,['status','--porcelain','--untracked-files=all'])).toString(),/\?\? \.env/,'hemmeligheder gemmes aldrig');
 assert.deepEqual(await git.startProject(project),{started:false});assert.equal((await git.status(project)).history.length,1);
});
test('Gem version med ét klik gemmer alle tilladte ændringer og nævner de afviste',async t=>{
 const {project,git}=await fixture(t);
 await fs.writeFile(path.join(project,'a.txt'),'A');await fs.writeFile(path.join(project,'b.txt'),'B');await fs.writeFile(path.join(project,'.env'),'NOEGLE=hemmelig');
 const first=await git.saveAll(project,'');
 assert.equal(first.saved,2);assert.deepEqual(first.kept,['.env']);assert.equal((await git.status(project)).history[0].message,'Gemt version');
 assert.match((await git.status(project)).history[0].at,/^\d{4}-\d{2}-\d{2}T/);
 await fs.writeFile(path.join(project,'a.txt'),'A2');
 assert.equal((await git.saveAll(project,'Ny overskrift')).saved,1);assert.equal((await git.status(project)).history[0].message,'Ny overskrift');
 assert.deepEqual(await git.saveAll(project,''),{saved:0,kept:['.env']});
 await assert.rejects(git.saveAll(project,'To\nlinjer'),/én linje/);
});

test('et globalt Git-filter som Git LFS stopper ikke automatiske versioner, men et filter, projektet bruger, gør', async t => {
 const { root, project } = await fixture(t);
 const { filterBlock } = require('../core/checkpoints.cjs');
 // Som når Git LFS er installeret: filteret står i brugerens globale Git-opsætning.
 await fs.writeFile(path.join(root, 'home', '.gitconfig'), '[filter "lfs"]\n\tclean = git-lfs clean -- %f\n\tsmudge = git-lfs smudge -- %f\n\tprocess = git-lfs filter-process\n\trequired = true\n');
 assert.match((await run(project, ['config', '--get-regexp', '^filter\\.'])).toString(), /filter\.lfs/, 'filteret er synligt for Git i projektet');
 await fs.writeFile(path.join(project, 'index.html'), '<h1>Hej</h1>');
 assert.equal(await filterBlock({ root: project }), '', 'et filter, projektet ikke bruger, blokerer ikke');
 await fs.writeFile(path.join(project, '.gitattributes'), '*.psd filter=lfs diff=lfs merge=lfs -text\n');
 await fs.writeFile(path.join(project, 'logo.psd'), 'billede');
 assert.match(await filterBlock({ root: project }), /Git-filtre, fx Git LFS/);
});
