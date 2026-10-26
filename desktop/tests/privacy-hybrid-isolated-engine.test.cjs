// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { IsolatedForkEngine, IsolatedRuntime } = require('../core/privacy/isolated-fork-engine.cjs');
const { PrivacyGate } = require('../core/privacy/index.cjs');
function crypto() {
  const key = randomBytes(32);
  return { encrypt: text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); },
    decrypt: bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(); } };
}
async function fixture(t, { locality = 'cloud', mode = 'cloud-controlled', planner, fail = false, recoverable = false } = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-single-test-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const state = { calls: [], engines: [], stages: [], closed: [], complete: [], authority: 'a'.repeat(64), current: true, layers: { organization: { enabled: true, version: 'one', workMode: mode, defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['selected'] } } };
  const destination = { id: 'selected', locality, endpoint: 'http://127.0.0.1:41100/v1', model: 'fixture', account: 'account', route: '', revision: 'one' };
  const getPolicy = () => structuredClone(state.layers), resolveDestination = () => structuredClone(destination);
  const gate = new PrivacyGate({ getPolicy, resolveDestination });
  let gateway;
  const options = { directory: root, projectRoot: path.join(root, 'source'), scope: { root: path.join(root, 'source'), chat: 'chat' }, destinationRef: { connectionID: 'selected', modelID: 'fixture' }, getPolicy,
    getAuthoritySnapshot: () => state.authority, resolveDestination, resolveSelection: () => ({ connection: { id: 'selected', kind: 'openai', baseURL: destination.endpoint }, model: { id: 'fixture', capabilities: { tools: true } } }), gate,
    planForRun: planner || (() => [{ id: 'local_assemble', kind: locality === 'device' ? 'local' : 'cloud', mode: 'plan', purpose: 'single-model', instruction: 'Trusted instructions', skills: [], references: [] }]), authorizeStage: () => true, assertCurrent: () => state.current,
    ...crypto(), workspaceFactory: () => ({ preparePartition: async stage => { state.stages.push(stage); if (state.stopBeforeDispatch) state.runtime.stop(stage.taskID); return { root: '/synthetic/isolated-workspace', directory: path.join(root, 'engine'), mode: stage.mode }; }, validateLease: () => true,
      engineOptions: async () => ({}), complete: async () => state.complete.push(true), release: async () => state.closed.push(true), close: async () => {},
      ...(recoverable ? { recoverStage: async () => ({ outcome: 'rolled-back' }), acknowledgeStage: async () => { if (state.crashAfterComplete) { state.crashAfterComplete = false; throw Error('Crash after durable complete'); } } } : {}) }),
    createGateway: async (_c, _m, _k, _r, _fail, options) => { gateway = options; return { url: 'http://127.0.0.1:41200/v1', token: 'synthetic', abort() {}, close: async () => {} }; },
    createEngine: options => {
      const engine = { options, active: false, session: { id: options.resume || 'ses_fixture' }, start: async () => { engine.active = true; }, abort: async () => {}, close: async () => { engine.active = false; }, reply: async () => {}, request: async () => {},
        send: async (text, system) => {
          if (fail) throw Error('Local model unavailable');
          await gateway.dispatch({ url: destination.endpoint + '/chat/completions', headers: {}, body: JSON.stringify({ model: 'fixture', messages: [{ role: 'system', content: system }, { role: 'user', content: text }] }), signal: new AbortController().signal }, async (_url, options) => { state.calls.push(options.body); return { ok: true }; });
          options.onEvent({ type: 'message.updated', properties: { info: { id: 'message', role: 'assistant' } } }); options.onEvent({ type: 'message.part.updated', properties: { part: { id: 'part', messageID: 'message', type: 'text', text: 'Exact final result.' } } }); options.onEvent({ type: 'session.idle' });
        } }; state.engines.push(engine); return engine;
    } };
  const restart = () => { const runtime = state.runtime = new IsolatedRuntime(options); t.after(() => runtime.close()); return runtime; };
  const runtime = restart(); return { runtime, state, destination, restart, root, scope: options.scope };
}
test('single controlled-cloud mode uses one guarded isolated stage, exact transport and separate durable memory', async t => {
  const f = await fixture(t); const first = await f.runtime.run({ taskID: 'one', originalPrompt: 'Make a public landing page', revision: 'one' });
  assert.equal(first.text, 'Exact final result.'); assert.equal(f.state.calls.length, 1); assert.equal(f.state.stages[0].allowProjectInput, true); assert.equal(f.state.complete.length, 1);
  await f.runtime.run({ taskID: 'two', originalPrompt: 'Improve it', revision: 'two', requireExistingSession: true });
  assert.equal(f.state.engines[1].options.resume, 'ses_fixture'); assert.equal(f.state.stages[1].partitionID, f.state.stages[0].partitionID);
});
test('local-only mode cannot choose cloud and local failure never invokes a different destination', async t => {
  const cloud = await fixture(t, { mode: 'local' }); await assert.rejects(cloud.runtime.run({ taskID: 'one', originalPrompt: 'Private', revision: 1 }), { code: 'PRIVACY_LOCAL_REQUIRED' }); assert.equal(cloud.state.engines.length, 0);
  const local = await fixture(t, { locality: 'device', mode: 'local', fail: true }); await assert.rejects(local.runtime.run({ taskID: 'one', originalPrompt: 'Private', revision: 1 }), { code: 'PRIVACY_CONTROL_FAILED' }); assert.equal(local.state.engines.length, 1); assert.equal(local.state.calls.length, 0); assert.equal(local.state.complete.length, 0);
});
test('protected first message and inherited source data cannot enter controlled cloud', async t => {
  const f = await fixture(t); await assert.rejects(f.runtime.run({ taskID: 'one', originalPrompt: 'Private case', sourceProvenance: [{ classification: 'strict' }], revision: 1 }), { code: 'PRIVACY_LOCAL_REQUIRED' }); assert.equal(f.state.calls.length, 0); assert.equal(f.state.engines.length, 0);
});
test('changed policy or destination cannot reuse a previous isolated engine history', async t => {
  const f = await fixture(t); await f.runtime.run({ taskID: 'one', originalPrompt: 'Public task', revision: 1 }); f.destination.model = 'different';
  await assert.rejects(f.runtime.run({ taskID: 'two', originalPrompt: 'More', revision: 2, requireExistingSession: true }), { code: 'PRIVACY_SESSION_MISSING' }); assert.equal(f.state.calls.length, 1);
});
test('Stop interrupts a never-resolving single-mode planner with no engine or model call', async t => {
  const f = await fixture(t, { planner: () => new Promise(() => {}) }); const running = f.runtime.run({ taskID: 'one', originalPrompt: 'Task', revision: 1 });
  await new Promise(resolve => setImmediate(resolve)); f.runtime.stop('one'); await assert.rejects(running, { code: 'PRIVACY_ABORTED' }); assert.equal(f.state.engines.length, 0);
});
test('single product adapter builds only the selected lane and never invents a second model', async () => {
  let plan; const engine = new IsolatedForkEngine({ locality: 'cloud', selection: { binding: 'a'.repeat(64) }, snapshots: { skills: [], references: [] }, projectRoot: '/synthetic/project', mode: 'build', task: () => ({ id: 'task' }), onEvent() {}, assertCurrent: () => true, authorizeStage: () => true, persistMarker: async () => {},
    createRuntime: async callbacks => ({ run: async () => { plan = callbacks.planForRun(); return { text: 'Done' }; }, stop() {}, close() {} }) });
  await engine.start(); await engine.send('Task', 'Approved plan'); assert.equal(plan.length, 1); assert.equal(plan[0].kind, 'cloud'); assert.equal(plan[0].mode, 'build'); assert.equal(plan[0].allowWriteback, true); await engine.close();
});
test('local history and interrupted context survive durable complete crash and two more Stops before dispatch', async t => {
  const f = await fixture(t, { locality: 'device', mode: 'local', recoverable: true });
  let runtime = f.runtime;
  await runtime.run({ taskID: 'success', originalPrompt: 'Earlier successful local design', revision: 1 });
  f.state.stopBeforeDispatch = true;
  await assert.rejects(runtime.run({ taskID: 'interrupted', originalPrompt: 'Keep the original private requirements', revision: 2 }), { code: 'PRIVACY_ABORTED' });
  await runtime.close(); runtime = f.restart();
  f.state.stopBeforeDispatch = false; f.state.crashAfterComplete = true;
  await assert.rejects(runtime.run({ taskID: 'crash-window', originalPrompt: 'This turn never reached the engine', revision: 3 }), { code: 'PRIVACY_CONTROL_FAILED' });
  let saved = await runtime.store.load(f.scope);
  assert.equal(saved.status, 'complete');
  assert.equal(saved.pendingContext.length, 1);
  assert.match(saved.pendingContext[0].text, /Keep the original private requirements/);
  assert.equal(saved.partition.engineSessionID, 'ses_fixture');
  assert.equal(f.state.calls.length, 1);
  // Each new explicit Send is stopped before engine creation. Earlier carry
  // must survive both the recovered-complete snapshot and new checkpoint.
  f.state.stopBeforeDispatch = true;
  for (const [taskID, originalPrompt] of [['stop-one', 'First follow-up context'], ['stop-two', 'Second follow-up context']]) {
    await runtime.close(); runtime = f.restart();
    await assert.rejects(runtime.run({ taskID, originalPrompt, revision: taskID }), { code: 'PRIVACY_ABORTED' });
  }
  assert.equal(f.state.calls.length, 1);
  await runtime.close(); runtime = f.restart(); f.state.stopBeforeDispatch = false;
  await runtime.run({ taskID: 'resume', originalPrompt: 'Continue only this explicit request', revision: 6 });
  assert.equal(f.state.calls.length, 2);
  const sent = JSON.parse(f.state.calls[1]).messages.at(-1).content;
  for (const value of ['Keep the original private requirements', 'First follow-up context', 'Second follow-up context']) assert.equal(sent.split(value).length - 1, 1);
  assert.match(sent, /context only; no unfinished action was applied/);
  assert.match(sent, /Continue only this explicit request/);
  assert.doesNotMatch(sent, /This turn never reached the engine/);
  assert.equal(f.state.engines.at(-1).options.resume, 'ses_fixture');
  assert.ok(f.state.stages.at(-1).history.some(message => message.content === 'Earlier successful local design'));
  saved = await runtime.store.load(f.scope);
  assert.equal(saved.status, 'complete'); assert.deepEqual(saved.pendingContext, []);
  const encrypted = await fs.readFile(path.join(f.root, 'single-sessions', runtime.store.key(f.scope) + '.hybrid.enc'));
  assert.equal(encrypted.includes(Buffer.from('Keep the original private requirements')), false);
});
