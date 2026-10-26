// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HybridForkEngine } = require('../core/privacy/hybrid-fork-engine.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture(overrides = {}) {
  const state = { events: [], markers: [], calls: [], current: true, task: { id: 'task-1' }, closed: 0, stopped: 0 };
  const engine = new HybridForkEngine({ selection: { binding: 'a'.repeat(64) }, snapshots: { skills: [{ name: 'private-skill' }], references: [{ path: 'references/private.txt' }] }, images: [], projectRoot: '/original/project', mode: 'build',
    assertCurrent: () => state.current, authorizeStage: () => true, task: () => state.task, onEvent: event => state.events.push(event), persistMarker: async value => state.markers.push(value),
    createRuntime: async callbacks => { state.callbacks = callbacks; return { run: async input => { state.calls.push(input); state.plan = callbacks.planForRun(); return { text: 'Local final result.' }; }, stop: () => { state.stopped++; }, close: async () => { state.closed++; } }; }, ...overrides });
  return { engine, state };
}
test('product adapter keeps private task, project instructions, skills and references out of cloud work', async () => {
  const f = fixture({ releaseMaterials: async () => [{ key: 'released-schema', release: {} }] });
  await f.engine.start(); await f.engine.send('Private task', 'Private approved-plan context');
  assert.deepEqual(f.state.plan.map(stage => stage.kind), ['local', 'cloud', 'local']);
  const cloud = f.state.plan[1]; assert.deepEqual(cloud.inputs, ['released-schema']); assert.deepEqual(cloud.skills, []); assert.deepEqual(cloud.references, []); assert.equal(cloud.instruction.includes('Private'), false); assert.equal(cloud.mode, 'plan');
  assert.deepEqual(f.state.plan[0].inputs, ['original']); assert.equal(f.state.plan[0].mode, 'plan'); assert.equal(f.state.plan[2].mode, 'build'); assert.deepEqual(f.state.markers, ['in-progress', 'complete']);
  assert.equal(f.state.events.filter(event => event.type === 'session.idle').length, 1); await f.engine.close();
});
test('no eligible handoff stays local without inventing a cloud prompt or switching model on failure', async () => {
  const f = fixture(); await f.engine.start(); await f.engine.send('Private', 'System');
  assert.deepEqual(f.state.plan.map(stage => stage.kind), ['local', 'local']); assert.equal(f.engine.requireExistingSession, true);
  await f.engine.send('Follow up', 'System'); assert.equal(f.state.calls[1].requireExistingSession, true); await f.engine.close();
});
test('permission and question events preserve existing exact request bindings and only route explicit answers', async () => {
  const f = fixture(); await f.engine.start(); const stage = { partitionID: 'local-partition', stageID: 'local_assemble', taskID: 'task', kind: 'local', root: '/private/worker', signal: new AbortController().signal };
  const waiting = f.state.callbacks.requestPermission({ id: 'ask-1', permission: 'edit', metadata: { filepath: '/private/worker/public/a.txt' } }, stage);
  const event = f.state.events.at(-1); assert.equal(event.properties.metadata.filepath, '/original/project/public/a.txt'); assert.equal(f.engine.pending.get(event.properties.id), event.properties);
  assert.equal(f.engine.pending.size, 1); await f.engine.reply(event.properties.id, true); assert.deepEqual(await waiting, { allow: true, message: '' }); assert.equal(f.engine.pending.size, 0);
  await assert.rejects(f.engine.reply(event.properties.id, true), { code: 'PRIVACY_STALE' });
  const question = f.state.callbacks.answerQuestion({ id: 'question-1', questions: [{ question: 'Choose?' }] }, stage); const id = f.state.events.at(-1).properties.id;
  assert.equal(f.engine.pending.size, 0); await f.engine.request(`/question/${encodeURIComponent(id)}/reply`, 'POST', { answers: [['Local']] }); assert.deepEqual(await question, [['Local']]);
  await assert.rejects(f.engine.request('/session/global', 'GET'), { code: 'PRIVACY_STALE' }); await f.engine.close();
});
test('Stop during permission approval rejects a late grant and joins runtime closure', async () => {
  const f = fixture(); await f.engine.start(); f.engine.taskID = 'task';
  const waiting = f.state.callbacks.requestPermission({ id: 'ask' }, { kind: 'local', signal: new AbortController().signal });
  const rejected = assert.rejects(waiting, { code: 'PRIVACY_STALE' }); const id = [...f.engine.pending.keys()][0];
  await f.engine.abort(); await rejected; assert.equal(f.state.closed, 1); assert.equal(f.state.stopped, 1); await assert.rejects(f.engine.reply(id, true), { code: 'PRIVACY_STALE' });
});
test('internal idle events cannot finish a product task and global history cannot compact into a lane', async () => {
  const f = fixture(); await f.engine.start(); f.state.callbacks.onEvent({ type: 'session.idle' }, { kind: 'local' }); f.state.callbacks.onEvent({ type: 'session.error' }, { kind: 'cloud' });
  assert.deepEqual(f.state.events, []); assert.deepEqual(await f.engine.messages(), []); await assert.rejects(f.engine.summarize(), { code: 'PRIVACY_CONTROL_FAILED' }); await f.engine.close();
});
test('invalid host task does not leave the send lock stuck; failed first run never records complete', async () => {
  const f = fixture(); await f.engine.start(); f.state.task = null; await assert.rejects(f.engine.send('One', 'System'), { code: 'PRIVACY_STALE' }); assert.notEqual(f.engine.sending, true);
  f.state.task = { id: 'valid' }; await f.engine.send('One', 'System'); await f.engine.close();
  const failed = fixture({ createRuntime: async () => ({ run: async () => { throw Error('Local model unavailable'); }, stop() {}, close() {} }) }); await failed.engine.start(); await assert.rejects(failed.engine.send('Private', 'System')); assert.deepEqual(failed.state.markers, ['in-progress']); assert.equal(failed.state.events.some(event => event.type === 'session.idle'), false); await failed.engine.close();
});
test('Stop while runtime acquisition is pending closes the late runtime before resolving', async () => {
  let release; const f = fixture({ createRuntime: () => new Promise(resolve => { release = resolve; }) }); const started = f.engine.start(); const rejected = assert.rejects(started, { code: 'PRIVACY_STALE' }); let closed = false;
  const stopping = f.engine.abort(); release({ run() {}, stop() {}, close: async () => { closed = true; } }); await stopping; await rejected; assert.equal(closed, true); assert.equal(f.engine.active, false); await tick();
});
test('exact worker permission paths and slash-stripped patterns bind to the same host file without widening access', () => {
  const f=fixture(),stage={kind:'local',root:'/private/worker'};
  const input={patterns:['private/worker/public/a.txt'],metadata:{filepath:'/private/worker/public/a.txt',diff:'Index: /private/worker/public/a.txt\n--- /private/worker/public/a.txt\n+++ /private/worker/public/a.txt\n+literal /private/worker/public/a.txt'}};
  const mapped=f.engine.hostProperties(input,stage);
  assert.deepEqual(mapped.patterns,['/original/project/public/a.txt']);assert.equal(mapped.metadata.filepath,mapped.patterns[0]);assert.equal(input.metadata.filepath,'/private/worker/public/a.txt');
  assert.ok(mapped.metadata.diff.includes('+literal /private/worker/public/a.txt'),'File contents are not rewritten.');
  for(const unsafe of ['/private/worker-sibling/public/a.txt','/private/worker/../private/a.txt','/private/worker/public/*','private/other/public/a.txt'])assert.equal(f.engine.hostPath(unsafe,stage,true),unsafe);
  assert.deepEqual(f.engine.hostProperties(input,{...stage,kind:'cloud'}).patterns,input.patterns);
});
test('apply_patch maps exact source/move targets and display list while preserving patch contents', () => {
  const f=fixture(),stage={kind:'local',root:'/private/worker'},patterns=['public/a.txt','public/b.txt'];
  const mapped=f.engine.hostProperties({patterns,metadata:{filepath:patterns.join(', '),files:[{filePath:'/private/worker/public/a.txt',movePath:'/private/worker/public/b.txt',type:'move'}]}},stage);
  assert.equal(mapped.metadata.filepath,patterns.join(', '));assert.deepEqual(mapped.metadata.files,[{filePath:'/original/project/public/a.txt',movePath:'/original/project/public/b.txt',type:'move'}]);
  f.engine.emit({type:'message.part.updated',properties:{part:{id:'part',messageID:'msg',type:'tool',state:{input:{patchText:'*** Begin Patch\n*** Update File: /private/worker/public/a.txt\n*** Move to: /private/worker/public/b.txt\n@@\n-old\n+literal /private/worker/public/a.txt\n*** End Patch'}}}}},stage);
  const patch=f.state.events.at(-1).properties.part.state.input.patchText;
  assert.ok(patch.includes('*** Move to: /original/project/public/b.txt'));assert.ok(patch.includes('+literal /private/worker/public/a.txt'));
});
