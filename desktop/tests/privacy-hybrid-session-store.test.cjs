// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { HybridSessionStore } = require('../core/privacy/hybrid-session-store.cjs');
const { PrivacyGateError } = require('../core/privacy/policy.cjs');
const missing = error => error instanceof PrivacyGateError && error.code === 'PRIVACY_SESSION_MISSING';
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-hybrid-memory-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const key = randomBytes(32), directory = path.join(root, 'memory');
  const encrypt = plaintext => {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
    return Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  };
  const decrypt = ciphertext => {
    const bytes = Buffer.from(ciphertext), decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8');
  };
  return { root, directory, encrypt, decrypt, store: new HybridSessionStore({ directory, encrypt, decrypt }) };
}
const scope = { project: 'synthetic-project', conversation: 'synthetic-conversation' };
const state = () => ({ status: 'complete', binding: 'exact-policy-and-destination-binding', local: { history: ['SYNTHETIC_PRIVATE_MEMORY_CANARY'] }, cloud: { history: ['Only allowed public material.'] } });

test('hybrid session store requires real host crypto callbacks; no plaintext fallback is provided', () => {
  assert.throws(() => new HybridSessionStore({ directory: '/synthetic/private' }), TypeError);
  assert.throws(() => new HybridSessionStore({ directory: 'relative', encrypt: () => {}, decrypt: () => {} }), TypeError);
});

test('atomic private encrypted snapshot restores distinct local/cloud histories without raw material on disk', async t => {
  const f = await fixture(t); assert.equal(await f.store.load(scope), null);
  await f.store.save(scope, state()); const files = await fs.readdir(f.directory);
  assert.equal(files.length, 1); assert.match(files[0], /^[a-f0-9]{64}\.hybrid\.enc$/);
  const file = path.join(f.directory, files[0]), bytes = await fs.readFile(file);
  assert.equal(bytes.includes(Buffer.from('SYNTHETIC_PRIVATE_MEMORY_CANARY')), false);
  assert.equal((await fs.stat(file)).mode & 0o077, 0); assert.equal((await fs.stat(f.directory)).mode & 0o077, 0);
  const restored = await f.store.load(scope); assert.deepEqual(restored, state()); assert.equal(JSON.stringify(restored.cloud).includes('PRIVATE'), false);
  await f.store.save(scope, { ...state(), status: 'in-progress' }); assert.equal((await f.store.load(scope)).status, 'in-progress');
  assert.equal((await fs.readdir(f.directory)).length, 1);
});

test('corrupt ciphertext, wrong crypto service or cross-scope copied ciphertext fail closed', async t => {
  const f = await fixture(t); await f.store.save(scope, state());
  const file = path.join(f.directory, `${f.store.key(scope)}.hybrid.enc`), original = await fs.readFile(file);
  const changed = Buffer.from(original); changed[16] ^= 1; await fs.writeFile(file, changed); await assert.rejects(f.store.load(scope), missing);
  await fs.writeFile(file, original);
  const wrong = new HybridSessionStore({ directory: f.directory, encrypt: f.encrypt, decrypt: () => { throw Error('No key service'); } });
  await assert.rejects(wrong.load(scope), missing);
  const other = { ...scope, conversation: 'another' }; await fs.writeFile(path.join(f.directory, `${f.store.key(other)}.hybrid.enc`), original, { mode: 0o600 });
  await assert.rejects(f.store.load(other), missing);
});

test('crypto failure or nonbinary encryption never writes plaintext or leaks its exception', async t => {
  const f = await fixture(t);
  for (const encrypt of [() => { throw Error('SYNTHETIC_PRIVATE_MEMORY_CANARY'); }, plaintext => plaintext]) {
    const store = new HybridSessionStore({ directory: f.directory, encrypt, decrypt: f.decrypt });
    await assert.rejects(store.save(scope, state()), error => missing(error) && !error.message.includes('CANARY'));
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});

test('symlinked or publicly readable stores and files are not accepted as private memory', async t => {
  const f = await fixture(t); await f.store.save(scope, state());
  const link = path.join(f.root, 'linked'); await fs.symlink(f.directory, link);
  const linked = new HybridSessionStore({ directory: link, encrypt: f.encrypt, decrypt: f.decrypt }); await assert.rejects(linked.load(scope), missing);
  const file = path.join(f.directory, `${f.store.key(scope)}.hybrid.enc`); await fs.chmod(file, 0o644); await assert.rejects(f.store.load(scope), missing);
  await fs.chmod(file, 0o600); const target = path.join(f.root, 'cipher-copy'); await fs.rename(file, target); await fs.symlink(target, file);
  await assert.rejects(f.store.load(scope), missing);
});

test('queued saves freeze the exact scope and history before awaiting encryption', async t => {
  const f = await fixture(t); let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const blocked = new HybridSessionStore({ directory: f.directory, decrypt: f.decrypt, encrypt: async plaintext => { entered(); await new Promise(resolve => { release = resolve; }); return f.encrypt(plaintext); } });
  const sourceScope = { ...scope }, sourceState = state(); const saving = blocked.save(sourceScope, sourceState); await ready;
  sourceScope.conversation = 'changed'; sourceState.cloud.history.push('Must not enter captured cloud history'); release(); await saving;
  assert.deepEqual(await f.store.load(scope), state()); assert.equal(await f.store.load(sourceScope), null);
});
test('hardlinked encrypted snapshots cannot be read or overwritten as private memory', async t => {
  const f = await fixture(t); await f.store.save(scope, state()); const file = path.join(f.directory, `${f.store.key(scope)}.hybrid.enc`);
  await fs.link(file, path.join(f.root, 'second-name')); await assert.rejects(f.store.load(scope), missing); await assert.rejects(f.store.save(scope, state()), missing);
});

test('snapshot acknowledgement waits for the renamed directory entry to be synced', async t => {
  const f = await fixture(t), original = fs.open.bind(fs), events = [];
  t.mock.method(fs, 'open', async (name, ...args) => {
    const handle = await original(name, ...args), sync = handle.sync.bind(handle);
    if (name === f.directory) t.mock.method(handle, 'sync', async () => {
      const bytes = await fs.readFile(path.join(f.directory, f.store.key(scope) + '.hybrid.enc'));
      assert.equal(JSON.parse(f.decrypt(bytes)).session.status, 'complete');
      events.push('directory-sync'); await sync();
    });
    return handle;
  });
  await f.store.save(scope, state()); events.push('acknowledged');
  assert.deepEqual(events, ['directory-sync', 'acknowledged']);
});

test('directory sync failure cannot acknowledge a readable but unconfirmed history snapshot', async t => {
  const f = await fixture(t), original = fs.open.bind(fs); let failSync = true, acknowledged = false;
  t.mock.method(fs, 'open', async (name, ...args) => {
    const handle = await original(name, ...args);
    if (name === f.directory && failSync) t.mock.method(handle, 'sync', async () => { throw Error('Synthetic directory sync failure'); });
    return handle;
  });
  await assert.rejects(f.store.save(scope, state()).then(() => { acknowledged = true; }), missing);
  assert.equal(acknowledged, false);
  failSync = false;
  await f.store.save(scope, state());
  assert.deepEqual(await f.store.load(scope), state());
});
