// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID, randomBytes, createHash, createCipheriv, createDecipheriv } = require('node:crypto');
const { HybridRecoveryJournal } = require('../core/privacy/hybrid-recovery-journal.cjs');
const { stable } = require('../core/privacy/policy.cjs');
const { PrivacyGate, PrivacyGateError } = require('../core/privacy/index.cjs');
const { HybridCoordinator } = require('../core/privacy/hybrid.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');
function basis(files = [{ path: 'index.html', sha256: hash('Before'), mode: 0o644 }], directories = [], identity = '1:2') {
  return { identity, fingerprint: hash(stable({ identity, files: files.map(file => [file.path, file.sha256, file.mode]), directories: directories.map(item => [item.path, item.mode]) })), files, directories };
}
const output = () => ({ text: 'SYNTHETIC_PRIVATE_RESULT', sessionID: 'ses_preserved', provenance: [{ classification: 'strict', attributes: { personalData: true, secrets: false }, uninspectable: false }] });
const write = () => ({ kind: 'file', name: 'index.html', before: hash('Before'), beforeMode: 0o644, after: hash('After'), mode: 0o644, base64: Buffer.from('After').toString('base64') });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-recovery-journal-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const directory = path.join(root, 'journal'), key = randomBytes(32);
  const encrypt = text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); };
  const decrypt = bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString(); };
  const options = { directory, encrypt, decrypt }, partitionID = randomUUID(), transactionID = randomUUID();
  const data = { transactionID, stageID: 'local_assemble', taskID: 'task-one', binding: 'a'.repeat(64), engineBefore: true, engineFingerprint: 'b'.repeat(64), stageKind: 'local', stageMode: 'build', hostBasis: basis() };
  return { root, options, partitionID, transactionID, data, journal: new HybridRecoveryJournal(options) };
}
const rejected = { code: 'PRIVACY_RECOVERY_REQUIRED' };

test('coordinator denies partial publication for a changed prompt even when its generic stage plan is identical', async t => {
  for (const change of ['prompt', 'plan']) await t.test(change, async () => {
    const layers = { project: { enabled: true, version: 'one', workMode: 'hybrid', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['local'] } };
    const destination = { id: 'local', locality: 'device', endpoint: 'http://127.0.0.1:1/v1', model: 'synthetic', account: 'synthetic-account', route: '', revision: 'one' };
    const getPolicy = () => structuredClone(layers), resolveDestination = () => structuredClone(destination);
    const gate = new PrivacyGate({ getPolicy, resolveDestination, audit: async () => {} });
    let saved = null, executions = 0; const recoveryOptions = [];
    const stages = [{ id: 'prepare', kind: 'local', purpose: 'prepare', instruction: 'Inspect the local task.', inputs: ['original'] }, { id: 'assemble', kind: 'local', purpose: 'assemble', instruction: 'Complete the requested app.', inputs: ['original', 'prepare'] }];
    const shared = { getPolicy, resolveDestination, getAuthoritySnapshot: () => hash(stable([layers, destination])), gate,
      sessionStore: { load: async () => structuredClone(saved), save: async (_scope, value) => { saved = structuredClone(value); } },
      recoverStage: async (_pending, options) => { recoveryOptions.push(options); throw new PrivacyGateError('PRIVACY_STALE', 'Refuse changed publication.'); }, acknowledgeStage: async () => {},
      executeStage: async stage => { executions++; if (stage.stageID === 'assemble') throw Error('Synthetic partial publication interruption'); await stage.dispatch({ body: JSON.stringify({ messages: [{ role: 'user', content: 'Prepare a public app.' }] }), transport: () => ({ ok: true }) }); return { text: 'Saved preparation.', sessionID: 'exact-session' }; } };
    const input = { scope: { root: '/synthetic/project', chat: 'one' }, taskID: 'first-task', originalPrompt: 'Build the first public app.', localRef: 'local', revision: 1, stages };
    await assert.rejects(new HybridCoordinator(shared).run(input)); assert.equal(saved.status, 'checkpoint'); assert.equal(saved.pending.stageID, 'assemble'); assert.equal(executions, 2);
    const changed = structuredClone(input); changed.taskID = 'second-task'; changed.revision = 2;
    if (change === 'prompt') changed.originalPrompt = 'Build a different public app.'; else changed.stages[1].instruction = 'A different approved assembly plan.';
    await assert.rejects(new HybridCoordinator(shared).run(changed), { code: 'PRIVACY_STALE' });
    assert.deepEqual(recoveryOptions, [{ allowPublication: false }]); assert.equal(executions, 2, 'no completed or pending stage may replay to resolve the changed request');
  });
});

test('recovery journal binds an encrypted exact write-set and acknowledged completion without replay', async t => {
  const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f;
  assert.equal(await j.read(p), null); await j.begin(p, f.data); await j.result(p, tx, output()); await j.retired(p, tx);
  await j.publication(p, tx, { basis: basis(), changes: [write()] });
  const hostAfter = basis([{ path: 'index.html', sha256: hash('After'), mode: 0o644 }]);
  const complete = await j.finish(p, tx, { outcome: 'completed', hostAfter }); assert.equal(complete.status, 'finished');
  await j.acknowledge(p, tx); const restored = await new HybridRecoveryJournal(f.options).read(p);
  assert.equal(restored.status, 'acknowledged'); assert.equal(restored.result.sessionID, 'ses_preserved'); assert.deepEqual(restored.hostAfter, hostAfter);
  assert.ok(Object.isFrozen(restored)); assert.ok(Object.isFrozen(restored.result.provenance));
  const files = await fs.readdir(f.options.directory); assert.equal(files.length, 1);
  const ciphertext = await fs.readFile(path.join(f.options.directory, files[0])); assert.equal(ciphertext.includes(Buffer.from('SYNTHETIC_PRIVATE_RESULT')), false);
  await assert.rejects(j.result(p, tx, output()), rejected); await assert.rejects(j.publication(p, tx, { basis: basis(), changes: [write()] }), rejected);
  await assert.rejects(j.begin(p, f.data), rejected);
  assert.equal((await j.begin(p, { ...f.data, transactionID: randomUUID() })).status, 'started');
});

test('unknown crash stages remain explicit and cannot be silently replaced, published or acknowledged', async t => {
  for (const status of ['started', 'result', 'retired', 'publication']) {
    const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f;
    await j.begin(p, f.data);
    if (status !== 'started') await j.result(p, tx, output());
    if (['retired', 'publication'].includes(status)) await j.retired(p, tx);
    if (status === 'publication') await j.publication(p, tx, { basis: basis(), changes: [write()] });
    const restarted = new HybridRecoveryJournal(f.options);
    assert.equal((await restarted.read(p)).status, status);
    await assert.rejects(restarted.begin(p, { ...f.data, transactionID: randomUUID() }), rejected);
    await assert.rejects(restarted.acknowledge(p, tx), rejected);
    assert.equal((await restarted.read(p)).status, status);
  }
});

test('writeback cannot start before retirement and rollback cannot conceal already-started publication', async t => {
  const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f; await j.begin(p, f.data);
  await assert.rejects(j.finish(p, tx, { outcome: 'rolled-back', hostAfter: basis() }), rejected);
  await j.result(p, tx, output()); await assert.rejects(j.publication(p, tx, { basis: basis(), changes: [write()] }), rejected);
  await j.retired(p, tx); await assert.rejects(j.retired(p, tx), rejected); await assert.rejects(j.result(p, tx, output()), rejected);
  await j.publication(p, tx, { basis: basis(), changes: [write()] });
  await assert.rejects(j.finish(p, tx, { outcome: 'rolled-back', hostAfter: basis() }), rejected);
  assert.equal((await j.read(p)).status, 'publication');
});

test('a safely retired stage can roll back only to its exact original host descriptor', async t => {
  const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f; await j.begin(p, f.data); await j.retired(p, tx);
  await assert.rejects(j.finish(p, tx, { outcome: 'completed', hostAfter: basis() }), rejected);
  await assert.rejects(j.finish(p, tx, { outcome: 'rolled-back', hostAfter: basis([], []) }), rejected);
  const state = await j.finish(p, tx, { outcome: 'rolled-back', hostAfter: basis() }); assert.equal(state.result, null);
  await j.acknowledge(p, tx); assert.equal((await j.read(p)).outcome, 'rolled-back');
});

test('host reconciliation rejects changed root identity, unrelated files, permissions and partial publication', async t => {
  const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f; await j.begin(p, f.data); await j.result(p, tx, output()); await j.retired(p, tx); await j.publication(p, tx, { basis: basis(), changes: [write()] });
  for (const hostAfter of [basis(), basis([], []), basis([{ path: 'index.html', sha256: hash('After'), mode: 0o755 }]), basis([{ path: 'index.html', sha256: hash('After'), mode: 0o644 }, { path: 'unreviewed.txt', sha256: hash('Extra'), mode: 0o644 }]), basis([{ path: 'index.html', sha256: hash('After'), mode: 0o644 }], [], '1:999')]) {
    await assert.rejects(j.finish(p, tx, { outcome: 'completed', hostAfter }), rejected); assert.equal((await j.read(p)).status, 'publication');
  }
});

test('journal rejects traversal, aliases, protected output paths and mismatched payload hashes', async t => {
  const f = await fixture(t), { journal: j, partitionID: p, transactionID: tx } = f; await j.begin(p, f.data); await j.result(p, tx, output()); await j.retired(p, tx);
  for (const change of [{ ...write(), name: '../outside.txt' }, { ...write(), name: '/outside.txt' }, { ...write(), name: '.git/config' }, { ...write(), name: 'references/private.csv' }, { ...write(), after: hash('Other') }, { ...write(), base64: 'YWZ0ZXI=\n' }, { ...write(), before: hash('Wrong basis') }, { ...write(), mode: 0o4755 }]) await assert.rejects(j.publication(p, tx, { basis: basis(), changes: [change] }), rejected);
  await assert.rejects(j.publication(p, tx, { basis: basis(), changes: [write(), { ...write(), name: 'INDEX.HTML' }] }), rejected);
  for (const name of ['.GNUPG/private', '.KUBE/config', '.AZURE/token', 'certificate.P12', 'certificate.pfx', 'SERVICE.KEY', 'public:credentials.json', 'notes:private.key', '.AURA-PRIVATE/state', 'nested/REFERENCES/private']) {
    const change = { ...write(), name, before: null, beforeMode: null };
    await assert.rejects(j.publication(p, tx, { basis: basis(), changes: [change] }), rejected, name);
  }
  await assert.rejects(j.publication(p, tx, { basis: { ...basis(), fingerprint: 'f'.repeat(64) }, changes: [write()] }), rejected);
  assert.equal((await j.read(p)).status, 'retired');
});

test('parallel journal instances cannot overwrite one another or use another transaction ID', async t => {
  const f = await fixture(t), second = new HybridRecoveryJournal(f.options);
  const attempts = await Promise.allSettled([f.journal.begin(f.partitionID, f.data), second.begin(f.partitionID, { ...f.data, transactionID: randomUUID() })]);
  assert.equal(attempts.filter(item => item.status === 'fulfilled').length, 1); assert.equal(attempts.filter(item => item.status === 'rejected').length, 1);
  await assert.rejects(second.retired(f.partitionID, randomUUID()), rejected);
  assert.equal((await second.read(f.partitionID)).transactionID, f.transactionID);
});

test('pending encrypted saves snapshot caller inputs and no unacknowledged state is recreated after crypto failure', async t => {
  const f = await fixture(t); let release, started; const entered = new Promise(resolve => { started = resolve; });
  const j = new HybridRecoveryJournal({ ...f.options, encrypt: async value => { started(); await new Promise(resolve => { release = resolve; }); return f.options.encrypt(value); } });
  const writing = j.begin(f.partitionID, f.data); await entered; f.data.taskID = 'changed'; f.data.hostBasis.files[0].sha256 = hash('Different'); release();
  assert.equal((await writing).taskID, 'task-one'); assert.equal((await j.read(f.partitionID)).hostBasis.files[0].sha256, hash('Before'));
  const broken = new HybridRecoveryJournal({ ...f.options, decrypt: () => { throw Error('SYNTHETIC_PRIVATE_KEY_FAILURE'); } });
  await assert.rejects(broken.begin(f.partitionID, { ...f.data, hostBasis: basis(), transactionID: randomUUID() }), error => !error.message.includes('PRIVATE_KEY_FAILURE'));
});

test('malformed or cross-partition stored state cannot be mistaken for safely finished recovery', async t => {
  const f = await fixture(t), { journal: j, partitionID: p } = f; await j.begin(p, f.data);
  const state = structuredClone(await j.read(p)); state.status = 'acknowledged'; state.outcome = 'completed'; state.hostAfter = basis();
  await j.store.save({ partitionID: p }, state); await assert.rejects(j.read(p), rejected);
  await assert.rejects(j.read('../other'), rejected);
});
