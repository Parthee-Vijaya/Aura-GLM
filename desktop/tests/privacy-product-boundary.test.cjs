// SPDX-License-Identifier: EUPL-1.2
'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'), os=require('node:os'), path=require('node:path');
const {Store}=require('../core/store.cjs');
const {PrivacyService}=require('../core/privacy-service.cjs');
const {authorize}=require('../core/privacy-product-boundary.cjs');
const {installSession}=require('../core/preview-session.cjs');
async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'aura-boundary-')), root=path.join(directory,'project');await fs.mkdir(root);
  const store=new Store(path.join(directory,'profile'),{isEncryptionAvailable:()=>false});
  const bench={store,project:{root},chats:new Map(),emit(){}};bench.privacy=new PrivacyService(bench);
  await store.saveProject(root,{privacy:{enabled:false,version:'base',conversations:{protectedChat:{enabled:true,version:'chat-rule',workMode:'local',defaultClass:'strict'}}}});
  t.after(async()=>{await fs.rm(directory,{recursive:true,force:true});});return {bench,root,store};
}
test('renderer network actions honor a different protected conversation; local inspection stays available',async t=>{
  const {bench,root}=await fixture(t);
  for(const channel of ['komplai:publish-address','support:feedback','hosting:create','hosting:catalog','deployment:setup','promte:preview-fetch','links:open','updates:download']) {
    await assert.rejects(authorize(channel,bench.privacy,root),{code:'PRIVACY_EXTERNAL_ADAPTER_REQUIRED'},channel);
  }
  for(const channel of ['code:read','activity:list','privacy:get','agent:stop'])assert.equal((await authorize(channel,bench.privacy,root))(),true);
});
test('preview denies even local assets from a conversation-protected project before they reach ordinary renderer',async t=>{
  const {bench,root,store}=await fixture(t);let before;
  const ctx={root,owner:bench,key:'safe-project',preview:{url:'aura-preview://safe-project/'}};
  const ses={protocol:{handle(){}},webRequest:{onBeforeRequest(fn){before=fn;},onHeadersReceived(){}}};
  installSession(ses,{contexts:()=>[ctx]});
  const details={url:'aura-preview://safe-project/index.html',resourceType:'subFrame',referrer:'harness://app/'};
  const check=input=>new Promise(resolve=>before(input,resolve));
  assert.deepEqual(await check(details),{cancel:true});
  assert.deepEqual(await check({url:'harness://app/privacy-gate.js',initiatorOrigin:'harness://app',resourceType:'script'}),{cancel:false});
  await store.saveProject(root,{privacy:{enabled:false,version:'off'}});
  assert.deepEqual(await check(details),{cancel:false});
});
