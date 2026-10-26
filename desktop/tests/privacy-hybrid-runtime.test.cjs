// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HybridRuntime } = require('../core/privacy/hybrid-runtime.cjs');
const { PrivacyGate } = require('../core/privacy/index.cjs');

function fixture(planForRun) {
  let policyReads = 0, kernelLeases = 0;
  const getPolicy = async () => { policyReads++; throw new Error('A stopped planner must never reach policy resolution.'); };
  const runtime = new HybridRuntime({ directory: '/synthetic/private-profile', projectRoot: '/synthetic/project', node: '/synthetic/node', opencode: '/synthetic/opencode', guardian: '/synthetic/guardian.cjs',
    workspaceFactory: () => ({ preparePartition() { kernelLeases++; throw new Error('A stopped planner must never launch.'); }, validateLease: () => false, release: () => {}, close: async () => {} }),
    scope: { kind: 'conversation', root: '/synthetic/project', chat: 'synthetic' }, localRef: { connectionID: 'local', modelID: 'test' }, externalRef: { connectionID: 'external', modelID: 'test' },
    getPolicy, getAuthoritySnapshot: () => 'a'.repeat(64), resolveDestination: () => ({}), resolveSelection: () => ({}),
    gate: new PrivacyGate({ getPolicy, resolveDestination: () => ({}) }), planForRun, authorizeStage: () => true, assertCurrent: () => true,
    encrypt: () => { throw new Error('No persistence allowed in planner-only test.'); }, decrypt: () => { throw new Error('No persistence allowed in planner-only test.'); } });
  return { runtime, counts: () => ({ policyReads, kernelLeases }) };
}
const stages = [{ id: 'first', kind: 'local', purpose: 'test', instruction: '', inputs: ['original'] }, { id: 'last', kind: 'local', purpose: 'test', instruction: '', inputs: ['first'] }];

test('Stop while an async planner is pending prevents late coordinator, persistence and worker start', async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const running = f.runtime.run({ taskID: 'test-task', originalPrompt: 'Synthetic task', revision: 1 });
  f.runtime.stop('test-task');
  await assert.rejects(running, { code: 'PRIVACY_ABORTED' });
  release(stages); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.counts(), { policyReads: 0, kernelLeases: 0 });
  await f.runtime.close();
});

test('close and caller cancellation also retire a never-resolving planner without starting a replacement', async () => {
  for (const kind of ['close', 'caller']) {
    const f = fixture(() => new Promise(() => {})), controller = new AbortController();
    const running = f.runtime.run({ taskID: 'test-task', originalPrompt: 'Synthetic task', revision: 1, signal: controller.signal });
    if (kind === 'close') await f.runtime.close(); else controller.abort();
    await assert.rejects(running, { code: 'PRIVACY_ABORTED' });
    assert.deepEqual(f.counts(), { policyReads: 0, kernelLeases: 0 }); await f.runtime.close();
  }
});

test('two pending planners cannot claim the same runtime scope', async () => {
  const f = fixture(() => new Promise(() => {}));
  const running = f.runtime.run({ taskID: 'first', originalPrompt: 'Synthetic task', revision: 1 });
  await assert.rejects(f.runtime.run({ taskID: 'second', originalPrompt: 'Other task', revision: 1 }), { code: 'PRIVACY_STALE' });
  f.runtime.stop('first'); await assert.rejects(running, { code: 'PRIVACY_ABORTED' });
  assert.deepEqual(f.counts(), { policyReads: 0, kernelLeases: 0 }); await f.runtime.close();
});
