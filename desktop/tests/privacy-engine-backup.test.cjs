// SPDX-License-Identifier: EUPL-1.2
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { stable } = require('../core/privacy/policy.cjs');
const { preserveLegacyEngine } = require('../core/privacy/hybrid-seatbelt-workspaces.cjs');
async function fixture(t, options = {}) {
  const partition = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-legacy-backup-'));
  t.after(() => fs.rm(partition, { recursive: true, force: true }));
  const directory = path.join(partition, 'engine'), workspaceRoot = path.join(partition, 'workspace'), sessionID = 'ses_synthetic123';
  await fs.mkdir(path.join(directory, 'data/opencode'), { recursive: true, mode: 0o700 }); await fs.mkdir(workspaceRoot, { mode: 0o700 });
  const owner = stable({ kind: 'local', partition: randomUUID(), project: workspaceRoot, destination: { id: 'local', model: 'synthetic' } });
  await fs.writeFile(path.join(partition, 'owner.json'), owner, { mode: 0o600 });
  const database = path.join(directory, 'data/opencode/opencode.db'), db = new DatabaseSync(database);
  db.exec('CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, version TEXT); CREATE TABLE message(id TEXT); CREATE TABLE part(id TEXT); CREATE TABLE project(id TEXT)');
  db.prepare('INSERT INTO session VALUES (?, ?, ?)').run(sessionID, options.workspaceRoot || workspaceRoot, options.version || '1.18.33');
  if (options.v2) db.exec('CREATE TABLE session_v2 (id TEXT PRIMARY KEY)');
  db.close(); await fs.writeFile(path.join(directory, 'history-canary'), 'EXACT_LOCAL_HISTORY', { mode: 0o600 });
  const input = { partition, directory, workspaceRoot, owner, sessionID };
  return { ...input, database, backup: path.join(partition, 'engine-v1-preserved'), preserve: override => preserveLegacyEngine({ ...input, ...override }) };
}
test('V1 history is retained byte-for-byte once, bound to its exact owner and session', async t => {
  const f = await fixture(t), original = await fs.readFile(f.database), manifest = await f.preserve();
  assert.equal(manifest.sourceVersion, '1.18.33'); assert.equal(manifest.sessionID, f.sessionID);
  assert.deepEqual(await fs.readFile(f.database), original);
  assert.deepEqual(await fs.readFile(path.join(f.backup, 'payload/data/opencode/opencode.db')), original);
  const file = path.join(f.backup, 'manifest.json'), before = await fs.stat(file);
  await fs.writeFile(path.join(f.directory, 'history-canary'), 'NEW_V2_HISTORY');
  assert.deepEqual(await f.preserve(), manifest);
  assert.equal((await fs.stat(file)).ino, before.ino, 'Retry does not replace the manifest.');
  assert.equal(await fs.readFile(path.join(f.backup, 'payload/history-canary'), 'utf8'), 'EXACT_LOCAL_HISTORY');
  assert.equal((await fs.stat(f.backup)).mode & 0o077, 0); assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal(path.dirname(f.backup), path.dirname(f.directory), 'The backup is outside the agent state root.');
});
test('unknown version, wrong workspace, owner or session never authorizes historical migration', async t => {
  for (const item of [{ version: '0.99.0' }, { workspaceRoot: '/some-other-partition' }, { override: { sessionID: 'ses_missing' } }, { override: { owner: 'different-owner' } }]) {
    const f = await fixture(t, item), original = await fs.readFile(f.database);
    await assert.rejects(f.preserve(item.override), { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
    assert.deepEqual(await fs.readFile(f.database), original); await assert.rejects(fs.stat(f.backup), { code: 'ENOENT' });
  }
});
test('a modified, incomplete or redirected backup fails closed and is not overwritten', async t => {
  for (const kind of ['bytes', 'owner', 'incomplete', 'symlink', 'ignored-link']) {
    const f = await fixture(t);
    if (kind === 'incomplete') await fs.mkdir(f.backup, { mode: 0o700 });
    else if (kind === 'symlink') await fs.symlink(f.directory, f.backup);
    else {
      await f.preserve();
      if (kind === 'ignored-link') { await fs.mkdir(path.join(f.backup, 'payload/config'), { recursive: true, mode: 0o700 }); await fs.symlink(f.directory, path.join(f.backup, 'payload/config/node_modules')); }
      else if (kind === 'bytes') await fs.writeFile(path.join(f.backup, 'payload/history-canary'), 'MODIFIED');
      else { const file = path.join(f.backup, 'manifest.json'), manifest = JSON.parse(await fs.readFile(file)); manifest.owner = 'a'.repeat(64); await fs.writeFile(file, JSON.stringify(manifest)); }
    }
    const before = await fs.lstat(f.backup); await assert.rejects(f.preserve()); assert.equal((await fs.lstat(f.backup)).ino, before.ino);
    assert.equal(await fs.readFile(path.join(f.directory, 'history-canary'), 'utf8'), 'EXACT_LOCAL_HISTORY');
  }
});
test('existing V2 and empty new state do not manufacture a legacy backup', async t => {
  const f = await fixture(t, { v2: true }); assert.equal(await f.preserve(), null); await assert.rejects(fs.stat(f.backup), { code: 'ENOENT' });
  await fs.unlink(f.database); assert.equal(await f.preserve(), null); await assert.rejects(fs.stat(f.backup), { code: 'ENOENT' });
});
