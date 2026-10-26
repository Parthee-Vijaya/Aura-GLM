// SPDX-License-Identifier: EUPL-1.2
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {createHash,randomBytes,createCipheriv,createDecipheriv}=require('node:crypto');
const {Workbench}=require('../core/workbench.cjs');
const {Restoration}=require('../core/restoration.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'aura-copy-labels-')),projectRoot=path.join(root,'project');await fs.mkdir(projectRoot);
  await fs.writeFile(path.join(projectRoot,'source.txt'),'Original aggregate');
  const key=randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,encryptString(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);},decryptString(bytes){const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString();}};
  const bench=new Workbench({directory:path.join(root,'profile'),safeStorage,profiles:path.join(__dirname,'../../profiles'),emit(){}});bench.restoration=new Restoration(bench.git,bench.store);
  t.after(async()=>{await bench.close();await fs.rm(root,{recursive:true,force:true});});await bench.activate({root:projectRoot,name:'Synthetic'});
  const provider=bench.privacyRuntimeProvider,scope={kind:'project',root:projectRoot,chat:null},projectScope=await provider.ledgerScope(scope);
  const entry=(name,text,classification='strict')=>({path:name,sha256:sha(text),provenance:[{classification,attributes:{personalData:classification==='strict'}}],parents:[]});
  await provider.ledger.record(projectScope,[entry('source.txt','Original aggregate')],{assertCurrent:()=>true});
  const original=bench.chat;await original.saveDraft({text:"Original synthetic conversation",mode:"free"});await bench.newChat();const chat=bench.chat;chat.prepared={root:projectRoot};original.running=true;bench.claim(original);
  await bench.allocate(chat);original.running=false;bench.release(original);bench.release(chat);
  return{root,projectRoot,bench,provider,scope,projectScope,chat,entry};
}
test('real Workbench copy allocation and merge preserve strict labels even with Privacy Gate not selected',async t=>{
  const f=await fixture(t),copyScope=await f.provider.ledgerScope(f.scope,f.chat.root);
  assert.notEqual(f.chat.root,f.projectRoot);assert.equal((await f.provider.ledger.provenance(copyScope,[{path:'source.txt',sha256:sha('Original aggregate')}]))[0].classification,'strict');
  await fs.writeFile(path.join(f.chat.root,'result.txt'),'Derived local result');await f.provider.ledger.record(copyScope,[f.entry('result.txt','Derived local result')],{assertCurrent:()=>true});
  const review=await f.bench.mergeReview({chat:f.chat.id}),apply=f.bench.restoration.apply.bind(f.bench.restoration);let checkedBeforeWrite=false;
  f.bench.restoration.apply=async(...args)=>{assert.equal((await f.provider.ledger.provenance(f.projectScope,[{path:'result.txt',sha256:sha('Derived local result')}]))[0].classification,'strict');await assert.rejects(fs.stat(path.join(f.projectRoot,'result.txt')),{code:'ENOENT'});checkedBeforeWrite=true;return apply(...args);};
  await f.bench.mergeApply({chat:f.chat.id,token:review.token});assert.equal(checkedBeforeWrite,true);assert.equal(await fs.readFile(path.join(f.projectRoot,'result.txt'),'utf8'),'Derived local result');
  assert.equal((await f.provider.ledger.provenance(f.projectScope,[{path:'result.txt',sha256:sha('Later manual or merged bytes')}]))[0].classification,'strict');
});
test('missing copy provenance blocks merge before modifying project files or deleting the copy',async t=>{
  const f=await fixture(t),copyRoot=f.chat.root,copyScope=await f.provider.ledgerScope(f.scope,copyRoot);
  await fs.writeFile(path.join(copyRoot,'result.txt'),'Derived local result');await f.provider.ledger.record(copyScope,[f.entry('result.txt','Derived local result')],{assertCurrent:()=>true});
  const review=await f.bench.mergeReview({chat:f.chat.id});await fs.unlink(f.provider.ledger.file(copyScope));
  await assert.rejects(f.bench.mergeApply({chat:f.chat.id,token:review.token}),{code:'PRIVACY_PROVENANCE_MISSING'});
  await assert.rejects(fs.stat(path.join(f.projectRoot,'result.txt')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(copyRoot,'result.txt'),'utf8'),'Derived local result');assert.equal(f.chat.root,copyRoot);
});
test('copy requests retain original project labels strengthened after allocation',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.projectRoot,'later.txt'),'Later aggregate');await fs.writeFile(path.join(f.chat.root,'later.txt'),'Later aggregate');
  await f.provider.ledger.record(f.projectScope,[f.entry('later.txt','Later aggregate')],{assertCurrent:()=>true});
  assert.ok((await f.provider.inheritedSources(f.scope,f.chat.root)).some(source=>source.path==='later.txt'&&source.classification==='strict'));
});
