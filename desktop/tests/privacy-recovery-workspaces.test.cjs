// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { HybridSeatbeltWorkspaces } = require('../core/privacy/hybrid-seatbelt-workspaces.cjs');

// Controlled host-boundary failures, never a claim of native isolation. Native
// worker retirement is qualified separately in the product/Seatbelt suites.
async function fixture(t, options = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-recovery-workspaces-'));
  const projectRoot = path.join(root, 'project'), runtimeRoot = path.join(root, 'runtime'), directory = path.join(root, 'workers');
  await fs.mkdir(projectRoot, { mode: 0o700 }); await fs.mkdir(runtimeRoot, { mode: 0o700 });
  await fs.writeFile(path.join(projectRoot, 'first.txt'), 'First before', { mode: 0o600 });
  await fs.writeFile(path.join(projectRoot, 'second.txt'), 'Second before', { mode: 0o600 });
  const key = randomBytes(32), encrypt = text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); };
  const decrypt = bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(); };
  const state = { current: true, authority: 'a'.repeat(64), stages: new WeakSet(), applied: [], retired: 0, labels: [], approvals: 0 };
  const config = { directory, projectRoot, runtimeRoot, encrypt, decrypt,
    validateStage: stage => state.stages.has(stage), assertCurrent: () => state.current, getAuthoritySnapshot: () => state.authority,
    isolationFactory: async () => ({ verify: async () => true, dispose: async () => { state.retired++; return { writersStopped: true, matchingProcesses: 0 }; } }),
    requestWritebackApproval: async () => { state.approvals++; return { allow: true }; }, recordProvenance: async values => state.labels.push(values),
    onApplied: (name, bytes) => { state.applied.push({ name, bytes: bytes?.toString() ?? null }); options.onApplied?.(name, state); }, ...options };
  const host = new HybridSeatbeltWorkspaces(config), others = [];
  t.after(async () => { for (const value of [host, ...others]) await value.close().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  const stage = { partitionID: randomUUID(), stageID: 'local_assemble', taskID: 'one-task', kind: 'local', mode: 'build', destination: { id: 'local', model: 'fixture' }, scope: { root: projectRoot, chat: 'synthetic-chat' }, signal: new AbortController().signal, references: [], skills: [], getSourceProvenance: () => [{ classification: 'strict', attributes: { personalData: true, secrets: false }, uninspectable: false }] };
  state.stages.add(stage);
  const prepare = async (input = stage) => {
    const lease = await host.preparePartition(input, { gateway: { url: 'http://127.0.0.1:41000/v1' } });
    const engine = await host.engineOptions(lease, input); await engine.privacyIsolation({ root: lease.root, directory: lease.directory, port: 41001 });
    return lease;
  };
  const write = async lease => { await host.recordPermission(lease, { permission: 'bash' }, { allow: true }); await fs.writeFile(path.join(lease.root, 'first.txt'), 'First after'); await fs.writeFile(path.join(lease.root, 'second.txt'), 'Second after'); };
  const complete = lease => host.complete(lease, stage, { text: 'A completed private result.', sessionID: 'preserved-session' });
  const restart = extra => { const value = new HybridSeatbeltWorkspaces({ ...config, ...extra }); others.push(value); return value; };
  return { root, projectRoot, directory, config, host, state, stage, prepare, write, complete, restart, read: name => fs.readFile(path.join(projectRoot, name), 'utf8') };
}

test('partial publication resumes only its remaining approved bytes, then acknowledges without replay', async t => {
  let crashed = false;
  const f = await fixture(t, { onApplied: name => { if (!crashed && name === 'first.txt') { crashed = true; throw Error('Synthetic interruption after first host write'); } } });
  const lease = await f.prepare(); await f.write(lease); await f.complete(lease);
  await assert.rejects(f.host.release(lease), /Synthetic interruption/);
  assert.equal(await f.read('first.txt'), 'First after'); assert.equal(await f.read('second.txt'), 'Second before');
  assert.equal((await f.host.journal.read(f.stage.partitionID)).status, 'publication'); assert.equal(f.state.retired, 1);
  const calls = [], restarted = f.restart({ onApplied: name => calls.push(name) });
  const recovered = await restarted.recoverStage(f.stage);
  assert.equal(recovered.status, 'finished'); assert.equal(recovered.outcome, 'completed'); assert.equal(recovered.result.sessionID, 'preserved-session');
  assert.deepEqual(calls, ['second.txt']); assert.equal(await f.read('second.txt'), 'Second after');
  assert.equal(f.state.approvals, 2); assert.equal(f.state.retired, 1, 'recovery does not run an engine or replay its actions');
  await restarted.acknowledgeStage(f.stage); await restarted.acknowledgeStage(f.stage);
  assert.equal(await restarted.recoverStage(f.stage), null); assert.deepEqual(calls, ['second.txt']);
});

test('partial publication refuses manual source edits, policy changes and prohibited publication', async t => {
  for (const kind of ['changed-output', 'unrelated-file', 'policy', 'not-authorized']) await t.test(kind, async t => {
    let crashed = false;
    const f = await fixture(t, { onApplied: () => { if (!crashed) { crashed = true; throw Error('Synthetic interruption'); } } });
    const lease = await f.prepare(); await f.write(lease); await f.complete(lease); await assert.rejects(f.host.release(lease));
    if (kind === 'changed-output') await fs.writeFile(path.join(f.projectRoot, 'first.txt'), 'User edit');
    if (kind === 'unrelated-file') await fs.writeFile(path.join(f.projectRoot, 'manual.txt'), 'User file');
    if (kind === 'policy') f.state.authority = 'b'.repeat(64);
    const restarted = f.restart();
    await assert.rejects(restarted.recoverStage(f.stage, { allowPublication: kind !== 'not-authorized' }), { code: 'PRIVACY_STALE' });
    assert.equal(await f.read('second.txt'), 'Second before'); assert.equal((await restarted.journal.read(f.stage.partitionID)).status, 'publication');
  });
});

test('unknown running or crashed writer markers never become a recoverable retirement', async t => {
  for (const completed of [false, true]) await t.test(completed ? 'result was saved' : 'no result yet', async t => {
    const f = await fixture(t), lease = await f.prepare(); await f.write(lease); if (completed) await f.complete(lease);
    const marker = path.join(f.directory, f.stage.partitionID, 'active-run.json'), bytes = await fs.readFile(marker);
    const restarted = f.restart(); await assert.rejects(restarted.recoverStage(f.stage), { code: 'PRIVACY_UNRETIRED_PARTITION' });
    assert.deepEqual(await fs.readFile(marker), bytes); assert.equal(await f.read('first.txt'), 'First before'); assert.equal(f.state.retired, 0);
  });
});

test('failed result persistence retires writers and rolls back exact isolated engine state without host changes', async t => {
  for (const written of [false, true]) await t.test(written ? 'durable result but interrupted return' : 'no durable result', async t => {
  const f = await fixture(t), lease = await f.prepare(); await f.write(lease);
  await fs.writeFile(path.join(lease.directory, 'engine-state'), 'Unfinished turn');
  const result = f.host.journal.result.bind(f.host.journal);
  f.host.journal.result = async (...args) => { if (written) await result(...args); throw Error('Synthetic result snapshot failure'); };
  await assert.rejects(f.complete(lease), /Synthetic result snapshot failure/); f.host.journal.result = result;
  await f.host.release(lease);
  assert.equal(await f.read('first.txt'), 'First before'); assert.equal(await f.read('second.txt'), 'Second before');
  await assert.rejects(fs.stat(path.join(lease.directory, 'engine-state')), { code: 'ENOENT' });
  const state = await f.host.journal.read(f.stage.partitionID); assert.equal(state.status, 'finished'); assert.equal(state.outcome, 'rolled-back'); assert.equal(!!state.result, written);
  const restarted = f.restart(), recovered = await restarted.recoverStage(f.stage); assert.equal(recovered.outcome, 'rolled-back');
  await restarted.acknowledgeStage(f.stage); assert.equal(await restarted.recoverStage(f.stage), null);
  });
});

test('Stop restores the preceding accepted engine conversation and permits a later explicit turn', async t => {
  const f = await fixture(t), accepted = await f.prepare();
  await fs.writeFile(path.join(accepted.directory, 'engine-state'), 'Prior accepted conversation');
  await f.complete(accepted); await f.host.release(accepted); await f.host.acknowledgeStage(f.stage);
  const controller = new AbortController(), stopped = { ...f.stage, taskID: 'second-task', engineSessionID: 'preserved-session', signal: controller.signal };
  f.state.stages.add(stopped); const lease = await f.prepare(stopped);
  assert.equal(await fs.readFile(path.join(lease.directory, 'engine-state'), 'utf8'), 'Prior accepted conversation');
  await fs.writeFile(path.join(lease.directory, 'engine-state'), 'Unfinished second turn'); await f.write(lease); controller.abort();
  await f.host.release(lease);
  assert.equal(await fs.readFile(path.join(lease.directory, 'engine-state'), 'utf8'), 'Prior accepted conversation');
  assert.equal(await f.read('first.txt'), 'First before'); assert.equal((await f.host.journal.read(stopped.partitionID)).outcome, 'rolled-back');
  await f.host.acknowledgeStage(stopped);
  const next = { ...f.stage, taskID: 'third-task', engineSessionID: 'preserved-session' }; f.state.stages.add(next);
  const resumed = await f.prepare(next); assert.equal(await fs.readFile(path.join(resumed.directory, 'engine-state'), 'utf8'), 'Prior accepted conversation');
  await f.host.release(resumed);
});

test('unconfirmed native retirement preserves its marker and prevents all host publication and replay', async t => {
  const f = await fixture(t, { isolationFactory: async () => ({ verify: async () => true, dispose: async () => ({ writersStopped: true, matchingProcesses: 1 }) }) });
  const lease = await f.prepare(); await f.write(lease); await f.complete(lease);
  await assert.rejects(f.host.release(lease), { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
  const restarted = f.restart(); await assert.rejects(restarted.recoverStage(f.stage), { code: 'PRIVACY_UNRETIRED_PARTITION' });
  assert.equal(await f.read('first.txt'), 'First before'); assert.equal((await restarted.journal.read(f.stage.partitionID)).status, 'result');
});

test('retired rollback rejects a changed engine backup instead of creating a fresh empty history', async t => {
  const f = await fixture(t), lease = await f.prepare();
  await fs.writeFile(path.join(lease.directory, 'engine-state'), 'Unfinished turn');
  const finish = f.host.journal.finish.bind(f.host.journal);
  f.host.journal.finish = async () => { throw Error('Synthetic crash before final snapshot'); };
  await assert.rejects(f.host.release(lease), /Synthetic crash/); f.host.journal.finish = finish;
  assert.equal((await f.host.journal.read(f.stage.partitionID)).status, 'retired');
  await fs.writeFile(path.join(f.directory, f.stage.partitionID, 'engine-before', 'unexpected'), 'Altered backup');
  const restarted = f.restart(); await assert.rejects(restarted.recoverStage(f.stage), { code: 'PRIVACY_UNRETIRED_PARTITION' });
  assert.equal(await f.read('first.txt'), 'First before');
});
