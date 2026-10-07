const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { GitVersions, run } = require('../core/git.cjs');
const { Store } = require('../core/store.cjs');
const { Publishing, GitTransport } = require('../core/publishing.cjs');
async function fixture(t) {
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'harness-publish-'))); t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const home=path.join(root,'home'); await fs.mkdir(home); process.env.HOME=home; process.env.USERPROFILE=home; process.env.XDG_CONFIG_HOME=path.join(home,'.config');
 const project=path.join(root,'project');const remote=path.join(root,'server.git'); await fs.mkdir(project);await fs.mkdir(remote);await run(remote,['init','--bare']);
 const git=new GitVersions();await git.initialize(project);await run(project,['config','user.name','Testbruger']);await run(project,['config','user.email','test@example.invalid']);
 const save=async(text)=>{await fs.writeFile(path.join(project,'index.html'),text);const r=await git.review(project);await git.commit(project,{token:r.token,files:['index.html'],message:'Gem testversion'});};
 await save('Første');
 let isPrivate=true;
 const provider={id:'github',get:async()=>({id:1,fullName:'test/projekt',private:isPrivate,writable:true,archived:false,gitURL:'https://github.com/test/projekt.git'})};
 const transport={head:async(_root,_target,branch)=>{const out=(await run(remote,['ls-remote','--heads',remote,`refs/heads/${branch}`])).toString().trim();return out?out.split(/\s+/)[0]:null;},fetch:async(_root,_target,branch)=>run(project,['fetch','--no-tags','--no-write-fetch-head',remote,`refs/heads/${branch}`]),push:async(_root,_target,branch,sha)=>run(project,['push',remote,`${sha}:refs/heads/${branch}`])};
 const store=new Store(path.join(root,'state'),{});const publishing=new Publishing({store,git,provider,transport});
 await publishing.attach(project,'test/projekt');
 return {project,remote,git,save,publishing,provider,transport,setPublic:()=>{isPrivate=false;}};
}
test('gennemgå og push rigtige commits til isoleret Git-server; genkend synkronisering',async t=>{
 const {project,remote,publishing,save}=await fixture(t);
 await run(project,['config','filter.ubrugt.clean','kommando-der-ikke-findes']);
 let review=await publishing.review(project);assert.equal(review.version.name,'Gem testversion');assert.ok(Number.isFinite(Date.parse(review.checkedAt)));assert.equal(review.remoteHead,null);assert.deepEqual(review.files,['index.html']);
 const result=await publishing.push(project,review.token);assert.deepEqual(result.version,review.version);assert.equal((await run(remote,['rev-parse',`refs/heads/${result.branch}`])).toString().trim(),result.head);
 assert.equal((await publishing.review(project)).synchronized,true);
 await save('Anden');review=await publishing.review(project);assert.equal(review.commits.length,1);await publishing.push(project,review.token);
 assert.equal((await run(remote,['show',`${result.branch}:index.html`])).toString(),'Anden');
});
test('afvis ændret synlighed, lokale ændringer og serverhistorik uden force push',async t=>{
 const {project,remote,publishing,save,transport,setPublic}=await fixture(t);
 let review=await publishing.review(project);setPublic();await assert.rejects(publishing.push(project,review.token),/destination/);
 review=await publishing.review(project);await publishing.push(project,review.token);const first=review.head;
 await save('Lokal ny version');review=await publishing.review(project);await save('Endnu en lokal version');await assert.rejects(publishing.push(project,review.token),/Projekt/);
 const latest=(await publishing.review(project)).head;await transport.push(project,{},review.branch,latest);
 await run(remote,['update-ref',`refs/heads/${review.branch}`,first]);
 review=await publishing.review(project);await run(remote,['update-ref',`refs/heads/${review.branch}`,latest]);await assert.rejects(publishing.push(project,review.token),/Serveren/);
 // En separat servercommit har den lokale version som forælder; arbejdsområdet forbliver urørt.
 const tree=(await run(project,['rev-parse',latest+'^{tree}'])).toString().trim();
 const ahead=(await run(project,['commit-tree',tree,'-p',latest,'-m','Kun på testserveren'])).toString().trim();
 await transport.push(project,{},review.branch,ahead);await assert.rejects(publishing.review(project),/foran/);
 assert.equal((await run(project,['rev-parse','HEAD'])).toString().trim(),latest);
});
test('find hemmeligheder i tidligere commits selv efter filen er slettet',async t=>{
 const {project,publishing}=await fixture(t);
 await fs.writeFile(path.join(project,'.env'),'TEST=kun-syntetiske-data');await run(project,['add','.env']);await run(project,['commit','-m','Syntetisk historiktest']);
 await fs.unlink(path.join(project,'.env'));await run(project,['add','.env']);await run(project,['commit','-m','Fjern syntetisk fil']);
 await assert.rejects(publishing.review(project),/historikken|Historikken/);
});
test('publicering tilsidesætter ikke URL-regler, hooks eller eksisterende remote',async t=>{
 const {project,publishing,provider}=await fixture(t);
 const hooks=path.join(process.env.HOME,'test-hooks');await fs.mkdir(hooks);await fs.writeFile(path.join(hooks,'pre-push'),'#!/bin/sh\nexit 1\n',{mode:0o755});
 await run(project,['config','core.hooksPath','~/test-hooks']);await assert.rejects(publishing.review(project),/hooks/);await run(project,['config','--unset','core.hooksPath']);
 await run(project,['remote','add','harness-github','https://github.com/anden/bevar.git']);provider.get=async()=>({id:2,fullName:'test/anden',private:true,writable:true,gitURL:'https://github.com/test/anden.git'});
 await assert.rejects(publishing.attach(project,'test/anden'),/allerede i brug/);
 await run(project,['config','url.https://example.invalid/.insteadOf','https://github.com/']);
 await assert.rejects(new GitTransport(provider).guard(project),/URL-regler/);
});

test('LFS-pointere afvises, så manglende binærfiler ikke erklæres publiceret',async t=>{
 const {project,publishing,save}=await fixture(t);
 await save('version https://git-lfs.github.com/spec/v1\noid sha256:'+'0'.repeat(64)+'\nsize 12\n');
 await assert.rejects(publishing.review(project),/Git LFS/);
});
