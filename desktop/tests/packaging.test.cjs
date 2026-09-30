const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHash}=require('node:crypto');
const {download}=require('../scripts/prepare-runtime.cjs');
const {generate}=require('../scripts/release-site.cjs');
async function temp(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-package-unit-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('runtime-download afviser forkert kontrolsum og bruger verificeret cache',async t=>{
 const root=await temp(t), file=path.join(root,'runtime.tar.gz'), data=Buffer.from('syntetisk runtime');
 const entry={url:'https://example.invalid/runtime',checksum:createHash('sha256').update(data).digest('hex')};
 const original=global.fetch;let calls=0;t.after(()=>global.fetch=original);
 global.fetch=async()=>{calls++;return new Response('forkert');};
 await assert.rejects(download(entry,file),/Kontrolsum/);await assert.rejects(fs.access(file));
 await fs.writeFile(file,data);await download(entry,file);assert.equal(calls,1);
});
test('downloadside viser kun eksisterende pakker og notarisation med matchende filhash',async t=>{
 const root=await temp(t),name='AI-Harness-0.2.0-beta.1-mac-arm64.dmg';await fs.writeFile(path.join(root,name),'testpakke');await fs.writeFile(path.join(root,'privat.env'),'ikke en download');
 await fs.writeFile(path.join(root,name+'.notarized.json'),JSON.stringify({status:'Accepted',sha256:'forkert'}));
 let files=await generate(root);assert.equal(files.length,1);assert.equal(files[0].notarized,false);
 await fs.writeFile(path.join(root,name+'.notarized.json'),JSON.stringify({status:'Accepted',sha256:files[0].sha256}));
 files=await generate(root);assert.equal(files[0].notarized,true);
 const html=await fs.readFile(path.join(root,'index.html'),'utf8');assert.match(html,/Notariseret af Apple/);assert.ok(!html.includes('privat.env'));
});
test('Git-opstartsformular udfylder kun manglende lokal identitet',async t=>{
 const {GitVersions,run}=require('../core/git.cjs'),root=await temp(t),git=new GitVersions();
 await git.initialize(root);
 await run(root,['config','--local','user.name','']);await run(root,['config','--local','user.email','']);
 await assert.rejects(git.setIdentity(root,{name:'Test',email:'forkert'}),/gyldig/);
 await git.setIdentity(root,{name:'Testperson',email:'test@example.invalid'});
 assert.equal((await run(root,['config','--local','user.name'])).toString().trim(),'Testperson');
 await assert.rejects(git.setIdentity(root,{name:'Anden',email:'anden@example.invalid'}),/allerede/);
});
test('pakket runtime afviser forkert platform og manglende værktøjer',async t=>{
 const root=await temp(t);await fs.mkdir(path.join(root,'runtime'));const manifest=path.join(root,'runtime/manifest.json');
 const runtime=require('../core/runtime.cjs');await fs.writeFile(manifest,JSON.stringify({target:'ukendt'}));assert.throws(()=>runtime.configure(root),/passer ikke/);
 await fs.writeFile(manifest,JSON.stringify({target:`${process.platform}-${process.arch}`}));assert.throws(()=>runtime.configure(root),/mangler git/);
});
test('motorens forventede version er den låste OpenCode-version', () => {
  assert.equal(require('../core/engine.cjs').VERSION, require('../runtime-lock.json').opencode);
});
