const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../core/store.cjs');
const { GitHub } = require('../core/github.cjs');
async function fixture(t, fetcher, options={}) {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'harness-github-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const store=new Store(root,{isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(value.split('').reverse().join('')),decryptString:value=>value.toString().split('').reverse().join('')});
 return {store,github:new GitHub(store,{fetcher,...options}),root};
}
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});
test('token kontrolleres, holdes uden for offentlige data og slettes lokalt',async t=>{
 const {store,github,root}=await fixture(t,async url=>{assert.equal(url,'https://api.github.com/user');return response({login:'testbruger'});});
 await github.connectToken('syntetisk_github_token');assert.equal((await github.state()).login,'testbruger');assert.equal(JSON.stringify(await github.state()).includes('syntetisk'),false);
 assert.equal((await fs.readFile(path.join(root,'settings.json'),'utf8')).includes('syntetisk_github_token'),false);
 assert.equal(await github.credential(),'syntetisk_github_token');await github.disconnect();await assert.rejects(github.credential());assert.equal((await store.read()).hosting.github,undefined);
});
test('Device Flow respekterer interval, slow_down, identitet og annullering',async t=>{
 let now=0,polls=0;
 const {github}=await fixture(t,async url=>url.endsWith('/device/code')?response({device_code:'device',user_code:'TEST-CODE',verification_uri:'https://github.com/login/device',expires_in:900,interval:5}):url.endsWith('/access_token')?response(++polls===1?{error:'slow_down'}:{access_token:'syntetisk_oauth_token',expires_in:30}):response({login:'testbruger'}),{clientID:'test-client',now:()=>now});
 const login=await github.startLogin();assert.equal('device_code' in login,false);assert.equal((await github.poll(login.id)).waiting,true);assert.equal(polls,0);
 now=5000;assert.equal((await github.poll(login.id)).retryAfter,10000);now=15000;assert.equal((await github.poll(login.id)).waiting,false);
 now=45001;await assert.rejects(github.credential(),/gyldig/);const again=await github.startLogin();github.cancel();await assert.rejects(github.poll(again.id));
});
test('annulleret login gemmer ikke et sent tokensvar; HTTP-fejl lækker ikke respons',async t=>{
 let release;const gate=new Promise(resolve=>{release=resolve;});
 const {github}=await fixture(t,async()=>{await gate;return response({login:'testbruger'});});
 const pending=github.connectToken('syntetisk_github_token');github.cancel();release();await assert.rejects(pending,/annulleret/);assert.equal((await github.state()).connected,false);
 github.fetcher=async()=>response({secret:'hemmeligt-respons'},401);await assert.rejects(github.connectToken('syntetisk_github_token'),error=>!error.message.includes('hemmeligt')&&/afvist/.test(error.message));
});
test('konto, organisationsvalg og eksplicit synlighed ved oprettelse',async t=>{
 const requests=[];const {github}=await fixture(t,async(url,opts)=>{requests.push({url,body:opts.body});if(url.endsWith('/user'))return response({login:'testbruger'});if(url.includes('/user/orgs'))return response([{login:'egen-kommune'},{login:'ai-alliancen-org'}]);return response({id:1,full_name:'egen-kommune/test',private:true,permissions:{push:true}});});
 await github.connectToken('syntetisk_github_token');await github.create({owner:'egen-kommune',repo:'test',visibility:'private'});
 assert.equal(JSON.parse(requests.at(-1).body).auto_init,false);assert.equal(JSON.parse(requests.at(-1).body).private,true);
 await assert.rejects(github.create({owner:'anden',repo:'test',visibility:'private'}),/ejer/);await assert.rejects(github.create({owner:'egen-kommune',repo:'test',visibility:'ukendt'}),/privat/);
});
