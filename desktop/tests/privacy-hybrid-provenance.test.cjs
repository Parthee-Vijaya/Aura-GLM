// SPDX-License-Identifier: EUPL-1.2
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomBytes,createCipheriv,createDecipheriv,createHash}=require('node:crypto');
const {FileProvenanceLedger}=require('../core/privacy/file-provenance-ledger.cjs');
const sha=text=>createHash('sha256').update(text).digest('hex');
async function fixture(t){
  const root=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'aura-labels-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const key=randomBytes(32);
  const crypto={encrypt(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);},decrypt(bytes){const cipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([cipher.update(bytes.subarray(12,-16)),cipher.final()]).toString();}};
  const directory=path.join(root,'labels'),scope={root,projectRoot:root,rootIdentity:'native-synthetic-inode'};
  const create=overrides=>new FileProvenanceLedger({directory,...crypto,...overrides});const ledger=create();
  const entry=(name,content,classification='strict',parents=[])=>({path:name,sha256:sha(content),provenance:[{classification,attributes:{personalData:classification==='strict'}}],parents});
  return {root,scope,crypto,create,ledger,entry};
}
test('file labels survive rename, edits and process recreation without plaintext metadata',async t=>{
  const f=await fixture(t),entry=f.entry('private-derived.txt','Derived aggregate');await f.ledger.record(f.scope,[entry],{assertCurrent:()=>true});
  const next=f.create();for(const file of [{path:'renamed.txt',sha256:entry.sha256},{path:entry.path,sha256:sha('Changed by a model')}])assert.equal((await next.provenance(f.scope,[file]))[0].classification,'strict');
  assert.equal((await fs.readFile(f.ledger.file(f.scope))).includes(Buffer.from('private-derived.txt')),false);
});
test('later stronger parent labels propagate to already derived results',async t=>{
  const f=await fixture(t),parent=f.entry('parent.txt','Parent','internal'),child=f.entry('summary.txt','Summary','internal',[parent.sha256]);
  await f.ledger.record(f.scope,[parent,child],{assertCurrent:()=>true});await f.ledger.record(f.scope,[f.entry('parent.txt','Parent','strict')],{assertCurrent:()=>true});
  assert.equal((await f.ledger.provenance(f.scope,[{path:child.path,sha256:child.sha256}]))[0].classification,'strict');
});
test('deleting required ciphertext or substituting a hardlink cannot erase known file labels',async t=>{
  const f=await fixture(t);await f.ledger.record(f.scope,[f.entry('summary.txt','Private')],{assertCurrent:()=>true});const file=f.ledger.file(f.scope),saved=await fs.readFile(file);await fs.unlink(file);
  await assert.rejects(f.create().sources(f.scope),{code:'PRIVACY_PROVENANCE_MISSING'});await fs.writeFile(file,saved,{mode:0o600});await fs.link(file,path.join(f.root,'second-link'));
  await assert.rejects(f.create().sources(f.scope),{code:'PRIVACY_PROVENANCE_MISSING'});
});
test('multiple workbenches serialize updates to the same encrypted provenance ledger',async t=>{
  const f=await fixture(t);let resume,started;const entered=new Promise(resolve=>started=resolve);
  const first=f.create({encrypt:async text=>{started();await new Promise(resolve=>resume=resolve);return f.crypto.encrypt(text);}}),second=f.create();
  const one=first.record(f.scope,[f.entry('one.txt','One')],{assertCurrent:()=>true});await entered;
  const two=second.record(f.scope,[f.entry('two.txt','Two')],{assertCurrent:()=>true});void two.catch(()=>{});await new Promise(resolve=>setImmediate(resolve));resume();await Promise.all([one,two]);
  assert.equal((await f.create().sources(f.scope)).length,2);
});
test('stale or cyclic derivations fail closed and never lower an existing classification',async t=>{
  const f=await fixture(t),one=f.entry('one.txt','One'),two=f.entry('two.txt','Two','internal',[one.sha256]);await f.ledger.record(f.scope,[one,two],{assertCurrent:()=>true});
  await assert.rejects(f.ledger.record(f.scope,[f.entry('one.txt','One','public')],{assertCurrent:()=>false}),{code:'PRIVACY_PROVENANCE_MISSING'});
  const fresh=f.create();assert.equal((await fresh.provenance(f.scope,[{path:one.path,sha256:one.sha256}]))[0].classification,'strict');
  await fresh.record(f.scope,[{...one,parents:[two.sha256]}],{assertCurrent:()=>true});await assert.rejects(fresh.sources(f.scope),{code:'PRIVACY_PROVENANCE_MISSING'});
});
test('copy and merge transfer all historical labels before bytes and preserve resolved ancestry across scopes',async t=>{
  const f=await fixture(t),copyScope={...f.scope,root:path.join(f.root,'copy'),rootIdentity:'copy-inode'},parent=f.entry('source.txt','Source','strict'),summary=f.entry('summary.txt','Summary','public',[parent.sha256]);
  await f.ledger.record(f.scope,[parent,summary],{assertCurrent:()=>true});await f.ledger.inheritScope(f.scope,copyScope,{assertCurrent:()=>true});
  assert.equal((await f.ledger.provenance(copyScope,[{path:'renamed-summary.txt',sha256:summary.sha256}]))[0].classification,'strict');
  const derived=f.entry('result.txt','Copy result','confidential');await f.ledger.record(copyScope,[derived],{assertCurrent:()=>true});await f.ledger.inheritScope(copyScope,f.scope,{assertCurrent:()=>true});
  assert.equal((await f.ledger.provenance(f.scope,[{path:'result.txt',sha256:sha('Merged lines differ')}]))[0].classification,'confidential');
  assert.equal((await f.ledger.provenance(f.scope,[{path:summary.path,sha256:summary.sha256}]))[0].classification,'strict');
});
