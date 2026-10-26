// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { PrivacyActivationGuard } = require('../core/privacy/activation-guard.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { Store } = require('../core/store.cjs');
const blocked = { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' };
async function folder(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-activation-'));
  t.after(() => fs.rm(root, {recursive:true,force:true})); return root;
}
test('ordinary engine exit or Stop cannot clear knowledge of uncontained descendants', async t => {
  const root = await folder(t), guard = new PrivacyActivationGuard(); let started = 0;
  const engine = guard.trackEngine({start(value) { started++; return value; }, close() {}}, root);
  assert.equal(guard.activation(root)(), true);
  assert.equal(engine.start('actual-start-result'), 'actual-start-result'); engine.close();
  assert.equal(started, 1); assert.throws(() => guard.activation(root), blocked);
  assert.equal(guard.activation(root, {enabled:false})(), true);
  assert.throws(() => guard.activation(root), blocked);
  const other = path.join(root,'new-project'); await fs.mkdir(other);
  assert.equal(guard.activation(other)(), true);
});
test('installer, server and starts that fail after launch conservatively block later activation', async t => {
  const root = await folder(t);
  for (const kind of ['installation','preview']) {
    const guard = new PrivacyActivationGuard(); guard.record(root,kind);
    assert.throws(() => guard.activation(root), blocked);
  }
  const guard = new PrivacyActivationGuard(), engine = guard.trackEngine({start() {throw Error('failed after possible spawn');}},root);
  assert.throws(() => engine.start(), /possible spawn/);
  assert.throws(() => guard.activation(root), blocked);
});
test('an activation check is invalidated by a new uncontained start and path aliases cannot bypass it', async t => {
  const root = await folder(t), guard = new PrivacyActivationGuard(), current = guard.activation(root);
  guard.record(root,'agent'); assert.throws(current,blocked);
  const alias = root+'-alias'; await fs.symlink(root,alias); t.after(() => fs.unlink(alias));
  assert.throws(() => guard.activation(alias),blocked);
});
test('product configuration preserves old policy when activation or its final recheck fails', async t => {
  for (const race of [false,true]) await t.test(race?'new start before store write':'prior uncontained engine',async t => {
    const root=await folder(t), project={root:path.join(root,'project')}; await fs.mkdir(project.root);
    const store=new Store(path.join(root,'profile'),{isEncryptionAvailable:()=>false});
    const prior={enabled:false,version:'prior',workMode:'cloud-controlled',defaultClass:'public'};
    await store.saveProject(project.root,{privacy:prior});
    const guard=new PrivacyActivationGuard(), bench={project,store,chats:new Map(),running:false,catalogs:new Map(),routeCatalogs:new Map(),emit() {}};
    bench.privacyRuntimeProvider={beforeConfigure:async(scope,{settings})=>guard.activation(scope.root,settings)};
    const service=bench.privacy=new PrivacyService(bench);
    if(race) { const update=store.update.bind(store); store.update=(...args)=>{guard.record(project.root,'preview');return update(...args);}; }
    else guard.record(project.root,'agent');
    await assert.rejects(service.configure({scope:'project',settings:{enabled:true,workMode:'cloud-controlled',defaultClass:'public',requireApproval:false}}),blocked);
    assert.deepEqual((await store.project(project.root)).privacy,prior);
  });
});
