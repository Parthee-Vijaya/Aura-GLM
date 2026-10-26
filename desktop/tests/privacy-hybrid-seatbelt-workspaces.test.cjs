// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { HybridSeatbeltWorkspaces, projectSnapshot } = require('../core/privacy/hybrid-seatbelt-workspaces.cjs');
const sha = value => createHash('sha256').update(value).digest('hex');
async function fixture(t, extra = {}) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-hybrid-copies-'));
  const projectRoot = path.join(root, 'project'), runtimeRoot = path.join(root, 'runtime'); for (const folder of [projectRoot, runtimeRoot, path.join(projectRoot, 'public')]) await fs.mkdir(folder, { mode: 0o700 });
  await fs.writeFile(path.join(projectRoot, 'public/index.html'), 'Original public app', { mode: 0o600 }); await fs.writeFile(path.join(projectRoot, 'citizens.csv'), 'SYNTHETIC_PRIVATE_CANARY', { mode: 0o600 });
  await fs.writeFile(path.join(projectRoot, '.env'), 'SYNTHETIC_SECRET_CANARY', { mode: 0o600 }); await fs.mkdir(path.join(projectRoot, '.git')); await fs.writeFile(path.join(projectRoot, '.git/config'), 'Must not copy');
  const state = { current: true, stages: new WeakSet(), isolation: [], grants: [], provenance: [], applied: [], events: [] };
  const host = new HybridSeatbeltWorkspaces({ directory: path.join(root, 'workers'), projectRoot, runtimeRoot, validateStage: stage => state.stages.has(stage), assertCurrent: () => state.current, getAuthoritySnapshot: () => 'a'.repeat(64),
    isolationFactory: async options => { state.isolation.push(options); let disposed = false; return { verify: async () => { if (disposed) throw Error('Disposed'); return { available: true }; }, async dispose() { disposed = true; return { writersStopped: true, matchingProcesses: 0 }; }, launchSpec() {} }; },
    requestWritebackApproval: async request => { state.grants.push(request); return { allow: true }; }, recordProvenance: async (changes, stage) => state.provenance.push({ changes, stage }), onApplied: (name, bytes) => state.applied.push({ name, bytes }), onWritebackEvent: event => state.events.push(event), ...extra });
  t.after(async () => { try { await host.close(); } finally { await fs.rm(root, { recursive: true, force: true }); } });
  const stage = (overrides = {}) => { const value = { partitionID: randomUUID(), kind: 'local', mode: 'build', taskID: 'task', stageID: 'local_assemble', destination: { id: 'local', model: 'fixture' }, scope: { root: projectRoot }, signal: new AbortController().signal, references: [], skills: [], getSourceProvenance: () => [{ classification: 'strict' }], ...overrides }; state.stages.add(value); return value; };
  const prepare = async input => { const value = input || stage(), lease = await host.preparePartition(value, { gateway: { url: 'http://127.0.0.1:41000/v1' } }); const options = await host.engineOptions(lease, value); await options.privacyIsolation({ root: lease.root, directory: lease.directory, port: 41001 }); return { stage: value, lease }; };
  return { root, projectRoot, runtimeRoot, host, state, stage, prepare };
}
// These are deterministic host-boundary tests. The actual seatbelt process test
// lives in engine-isolation-native; this injected verifier is not sandbox proof.
test('local lane receives a bounded private copy; cloud has no source files, skills, references or sibling state access', async t => {
  const f = await fixture(t); const local = await f.prepare(); const cloud = await f.prepare(f.stage({ kind: 'cloud', mode: 'plan', skills: [{ name: 'must-not-copy' }], references: [{ path: 'citizens.csv' }] }));
  assert.equal(await fs.readFile(path.join(local.lease.root, 'citizens.csv'), 'utf8'), 'SYNTHETIC_PRIVATE_CANARY');
  await assert.rejects(fs.stat(path.join(local.lease.root, '.env')), { code: 'ENOENT' }); await assert.rejects(fs.stat(path.join(local.lease.root, '.git')), { code: 'ENOENT' });
  assert.deepEqual(await fs.readdir(cloud.lease.root), []); assert.deepEqual(cloud.lease.skills, []); assert.deepEqual(cloud.lease.references, []); assert.notEqual(local.lease.directory, cloud.lease.directory);
  assert.equal(f.state.isolation[1].workspaceRoot, cloud.lease.root); assert.equal(f.state.isolation[1].stateRoot, cloud.lease.directory);
});
test('exact approved write publishes only after successful stage retirement and records inherited labels first', async t => {
  const f = await fixture(t); const { stage, lease } = await f.prepare(); const file = path.join(lease.root, 'public/index.html');
  await f.host.recordPermission(lease, { permission: 'edit', metadata: { filepath: file }, proposedTool: { tool: 'write', state: { input: { filePath: file, content: 'Approved app' } } } }, { allow: true });
  await fs.writeFile(file, 'Approved app'); assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Original public app');
  await f.host.complete(lease, stage); await f.host.release(lease); assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Approved app');
  assert.equal(f.state.grants.length, 0); assert.equal(f.state.provenance.length, 1); assert.equal(f.state.provenance[0].changes[0].provenance[0].classification, 'strict'); assert.equal(f.state.applied.length, 1);
});
test('unexpected write bytes need a new frozen-result approval; changed output cannot reuse an old write grant', async t => {
  const f = await fixture(t); const { stage, lease } = await f.prepare(); const file = path.join(lease.root, 'public/index.html');
  await f.host.recordPermission(lease, { permission: 'edit', metadata: { filepath: file }, proposedTool: { tool: 'write', state: { input: { filePath: file, content: 'First proposed output' } } } }, { allow: true });
  await fs.writeFile(file, 'Different actual output'); await f.host.complete(lease, stage); await f.host.release(lease);
  assert.equal(f.state.grants.length, 1); assert.equal(f.state.grants[0].metadata.sha256, sha('Different actual output')); assert.equal(f.state.grants[0].metadata.sourceSHA256, sha('Original public app'));
});
test('Stop and failed stages keep all host files unchanged even after concrete tool approval', async t => {
  for (const kind of ['stopped', 'failed']) {
    const f = await fixture(t), controller = new AbortController(), { stage, lease } = await f.prepare(f.stage({ signal: controller.signal }));
    await f.host.recordPermission(lease, { permission: 'bash' }, { allow: true }); await fs.writeFile(path.join(lease.root, 'public/index.html'), 'Unfinished output');
    if (kind === 'stopped') { await f.host.complete(lease, stage); controller.abort(); }
    await f.host.release(lease); assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Original public app'); assert.equal(f.state.provenance.length, 0);
  }
});
test('manual source edits invalidate the whole pending output before any host write', async t => {
  const f = await fixture(t), { stage, lease } = await f.prepare(); await f.host.recordPermission(lease, { permission: 'bash' }, { allow: true });
  await fs.writeFile(path.join(lease.root, 'public/index.html'), 'Worker output'); await fs.writeFile(path.join(lease.root, 'public/new.html'), 'Second output'); await f.host.complete(lease, stage);
  await fs.writeFile(path.join(f.projectRoot, 'citizens.csv'), 'Manual source update'); await assert.rejects(f.host.release(lease), { code: 'PRIVACY_STALE' });
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Original public app'); await assert.rejects(fs.stat(path.join(f.projectRoot, 'public/new.html')), { code: 'ENOENT' });
});
test('source changes while a user reviews output invalidate the reviewed bytes', async t => {
  let project; const f = await fixture(t, { requestWritebackApproval: async () => { await fs.writeFile(path.join(project, 'public/index.html'), 'Manual edit during review'); return { allow: true }; } }); project = f.projectRoot;
  const { stage, lease } = await f.prepare(); await f.host.recordPermission(lease, { permission: 'bash' }, { allow: true }); await fs.writeFile(path.join(lease.root, 'public/index.html'), 'Worker output'); await f.host.complete(lease, stage);
  await assert.rejects(f.host.release(lease), { code: 'PRIVACY_STALE' }); assert.equal(await fs.readFile(path.join(project, 'public/index.html'), 'utf8'), 'Manual edit during review');
});
test('unknown writes, protected names, symlinks and failed provenance cannot publish files', async t => {
  for (const kind of ['unapproved', 'secret', 'symlink', 'labels']) {
    const f = await fixture(t, kind === 'labels' ? { recordProvenance: async () => { throw Error('Encryption unavailable'); } } : {}), { stage, lease } = await f.prepare();
    if (kind !== 'unapproved') await f.host.recordPermission(lease, { permission: 'bash' }, { allow: true });
    if (kind === 'secret') await fs.writeFile(path.join(lease.root, '.env'), 'Untrusted secret');
    else if (kind === 'symlink') await fs.symlink(path.join(f.projectRoot, 'public/index.html'), path.join(lease.root, 'public/link.html'));
    else await fs.writeFile(path.join(lease.root, 'public/index.html'), 'Unapproved output');
    await f.host.complete(lease, stage); await assert.rejects(f.host.release(lease)); assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Original public app');
  }
});
test('same partition resumes its exact runtime; missing or changed owner never becomes a new session', async t => {
  const f = await fixture(t), first = await f.prepare(); await f.host.release(first.lease);
  const resumed = await f.prepare(f.stage({ partitionID: first.stage.partitionID, engineSessionID: 'exact-prior-session' })); assert.equal(resumed.lease.directory, first.lease.directory); assert.equal(resumed.lease.root, first.lease.root);
  await assert.rejects(f.prepare(f.stage({ engineSessionID: 'missing-prior-session' })), { code: 'PRIVACY_SESSION_MISSING' });
  await assert.rejects(f.prepare(f.stage({ partitionID: first.stage.partitionID, kind: 'cloud', engineSessionID: 'wrong-lane' })));
});
test('source snapshot rejects hardlinks, symlinks and ambiguous paths instead of following them', async t => {
  const f = await fixture(t); await fs.link(path.join(f.projectRoot, 'citizens.csv'), path.join(f.projectRoot, 'alias.csv')); await assert.rejects(projectSnapshot(f.projectRoot));
  await fs.unlink(path.join(f.projectRoot, 'alias.csv')); await fs.symlink(f.projectRoot, path.join(f.projectRoot, 'loop')); await assert.rejects(projectSnapshot(f.projectRoot));
});

test('controlled cloud receives only independently checked public paths and bytes, never protected originals', async t => {
  const checked = [];
  const f = await fixture(t, { checkCloudFile: async file => { checked.push({ path: file.path, content: file.bytes.toString() }); return file.path === 'public/index.html'; } });
  const { stage, lease } = await f.prepare(f.stage({ kind: 'cloud', allowProjectInput: true, allowWriteback: true }));
  assert.equal(await fs.readFile(path.join(lease.root, 'public/index.html'), 'utf8'), 'Original public app');
  await assert.rejects(fs.stat(path.join(lease.root, 'citizens.csv')), { code: 'ENOENT' });
  assert.ok(checked.some(file => file.path === 'citizens.csv')); assert.equal(checked.some(file => file.path === '.env'), false);
  await f.host.recordPermission(lease, { permission: 'edit', metadata: { filepath: path.join(lease.root, 'public/index.html') }, proposedTool: { tool: 'write', state: { input: { filePath: path.join(lease.root, 'public/index.html'), content: 'Public controlled output' } } } }, { allow: true });
  await fs.writeFile(path.join(lease.root, 'public/index.html'), 'Public controlled output'); await f.host.complete(lease, stage); await f.host.release(lease);
  assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Public controlled output'); assert.equal(await fs.readFile(path.join(f.projectRoot, 'citizens.csv'), 'utf8'), 'SYNTHETIC_PRIVATE_CANARY');
});
test('controlled cloud cannot replace an undisclosed existing host path even with a command grant', async t => {
  const f = await fixture(t, { checkCloudFile: async file => file.path === 'public/index.html' });
  const { stage, lease } = await f.prepare(f.stage({ kind: 'cloud', allowProjectInput: true, allowWriteback: true }));
  await f.host.recordPermission(lease, { permission: 'bash' }, { allow: true }); await fs.writeFile(path.join(lease.root, 'citizens.csv'), 'Blind overwrite attempt');
  await f.host.complete(lease, stage); await assert.rejects(f.host.release(lease)); assert.equal(await fs.readFile(path.join(f.projectRoot, 'citizens.csv'), 'utf8'), 'SYNTHETIC_PRIVATE_CANARY');
});

test('a persistent run marker prevents another process from rotating a live or crash-left partition', async t => {
  const f = await fixture(t), first = await f.prepare();
  const marker = path.join(path.dirname(first.lease.root), 'active-run.json');
  const originalMarker = await fs.readFile(marker, 'utf8');
  assert.equal((await fs.stat(marker)).mode & 0o077, 0);
  await fs.writeFile(path.join(first.lease.directory, 'history-canary'), 'Original isolated history');
  await fs.writeFile(path.join(first.lease.root, 'public/index.html'), 'Unfinished isolated work');
  const second = new HybridSeatbeltWorkspaces({ ...f.host });
  try {
    const resumed = f.stage({ partitionID: first.stage.partitionID, engineSessionID: 'same-session' });
    await assert.rejects(second.preparePartition(resumed, { gateway: { url: 'http://127.0.0.1:41000/v1' } }), { code: 'PRIVACY_UNRETIRED_PARTITION' });
    assert.equal(await fs.readFile(marker, 'utf8'), originalMarker);
    assert.equal(await fs.readFile(path.join(first.lease.root, 'public/index.html'), 'utf8'), 'Unfinished isolated work');
    assert.equal(await fs.readFile(path.join(first.lease.directory, 'history-canary'), 'utf8'), 'Original isolated history');
    await f.host.release(first.lease);
    await assert.rejects(fs.stat(marker), { code: 'ENOENT' });
    const safe = await second.preparePartition(resumed, { gateway: { url: 'http://127.0.0.1:41000/v1' } });
    assert.equal(await fs.readFile(path.join(safe.root, 'public/index.html'), 'utf8'), 'Original public app');
    await second.release(safe);
  } finally { await second.close(); }
});
test('an unknown or unsuccessful process retirement preserves the marker and blocks session reuse', async t => {
  for (const ack of [null, { writersStopped: true, matchingProcesses: 1 }, { writersStopped: false, matchingProcesses: 0 }]) {
    const f = await fixture(t, { isolationFactory: async () => ({ verify: async () => true, dispose: async () => ack }) });
    const { stage, lease } = await f.prepare();
    await assert.rejects(f.host.release(lease), { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
    assert.ok(await fs.stat(path.join(path.dirname(lease.root), 'active-run.json')));
    const second = new HybridSeatbeltWorkspaces({ ...f.host });
    try { await assert.rejects(second.preparePartition(f.stage({ partitionID: stage.partitionID }), { gateway: { url: 'http://127.0.0.1:41000/v1' } }), { code: 'PRIVACY_UNRETIRED_PARTITION' }); }
    finally { await second.close(); }
    assert.equal(await fs.readFile(path.join(f.projectRoot, 'public/index.html'), 'utf8'), 'Original public app');
  }
});
test('retirement waits for an in-flight isolation creation and prevents a late launch capability', async t => {
  let ready, finish, disposals = 0;
  const creating = new Promise(resolve => ready = resolve), waiting = new Promise(resolve => finish = resolve);
  const f = await fixture(t, { isolationFactory: async () => { ready(); await waiting; return { verify: async () => true, dispose: async () => { disposals++; return { writersStopped: true, matchingProcesses: 0 }; } }; } });
  const stage = f.stage(), lease = await f.host.preparePartition(stage, { gateway: { url: 'http://127.0.0.1:41000/v1' } });
  const options = await f.host.engineOptions(lease, stage);
  const starting = options.privacyIsolation({ root: lease.root, directory: lease.directory, port: 41001 }); void starting.catch(() => {});
  await creating; const retiring = f.host.release(lease); finish();
  await assert.rejects(starting); await retiring; assert.equal(disposals, 1);
  await assert.rejects(fs.stat(path.join(path.dirname(lease.root), 'active-run.json')), { code: 'ENOENT' });
  await assert.rejects(options.privacyIsolation({ root: lease.root, directory: lease.directory, port: 41001 }));
});
test('pinned apply_patch filePath and movePath grant only concrete source and destination; final bytes are reviewed', async t => {
  const f=await fixture(t),{stage,lease}=await f.prepare(),filePath=path.join(lease.root,'public/index.html'),movePath=path.join(lease.root,'public/moved.html');
  await f.host.recordPermission(lease,{permission:'edit',metadata:{files:[{filePath,movePath,type:'move'}]}},{allow:true});
  await fs.rename(filePath,movePath);await f.host.complete(lease,stage);await f.host.release(lease);
  await assert.rejects(fs.stat(path.join(f.projectRoot,'public/index.html')),{code:'ENOENT'});assert.equal(await fs.readFile(path.join(f.projectRoot,'public/moved.html'),'utf8'),'Original public app');assert.equal(f.state.grants.length,2);
});

test('resuming a V1 lane retains its exact database before any V2 launch capability is granted', async t => {
  const f = await fixture(t), prior = await f.prepare(); await f.host.release(prior.lease);
  const database = path.join(prior.lease.directory, 'data/opencode/opencode.db');
  await fs.mkdir(path.dirname(database), { recursive: true, mode: 0o700 });
  const db = new (require('node:sqlite').DatabaseSync)(database), sessionID = 'ses_hostmigration123';
  db.exec('CREATE TABLE session(id TEXT, directory TEXT, version TEXT); CREATE TABLE message(id TEXT); CREATE TABLE part(id TEXT); CREATE TABLE project(id TEXT)');
  db.prepare('INSERT INTO session VALUES (?, ?, ?)').run(sessionID, prior.lease.root, '1.18.33'); db.close();
  const original = await fs.readFile(database), stage = f.stage({ partitionID: prior.stage.partitionID, engineSessionID: sessionID });
  const lease = await f.host.preparePartition(stage, { gateway: { url: 'http://127.0.0.1:41000/v1' } });
  const backup = path.join(path.dirname(lease.directory), 'engine-v1-preserved');
  assert.deepEqual(await fs.readFile(path.join(backup, 'payload/data/opencode/opencode.db')), original);
  assert.equal(f.state.isolation.length, 1, 'No V2 launch lease exists until the permanent backup has been secured.');
  const options = await f.host.engineOptions(lease, stage); await options.privacyIsolation({ root: lease.root, directory: lease.directory, port: 41001 });
  assert.equal(f.state.isolation[1].stateRoot, lease.directory); assert.equal(f.state.isolation[1].workspaceRoot, lease.root);
  assert.ok(!backup.startsWith(lease.directory + path.sep) && !backup.startsWith(lease.root + path.sep));
  await f.host.release(lease);
  assert.deepEqual(await fs.readFile(path.join(backup, 'payload/data/opencode/opencode.db')), original);
});
