// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');

// Execute the real service with Windows paths and filesystem metadata. No ACL,
// Windows runtime, real provider, credentials or native isolation is simulated
// as qualified: only the absence-only compatibility path is under test.
function fixture() {
  const win = path.win32, root = 'C:\\Users\\Synthetic\\Aura', project = 'C:\\Projects\\Example';
  const nodes = new Map(), errors = new Map(), hooks = new Map(); let inode = 0, reads = 0, updates = 0;
  const key = file => win.resolve(file).toLowerCase();
  const missing = () => Object.assign(new Error('Synthetic missing path'), { code: 'ENOENT' });
  const put = (file, type, text = '') => nodes.set(key(file), { type, text, ino: ++inode, dev: 1, uid: 0, nlink: 1, mode: type === 'directory' ? 0o040666 : 0o100666, mtimeMs: inode, ctimeMs: inode });
  const entry = file => { if (errors.has(key(file))) throw Object.assign(new Error('Synthetic filesystem failure'), { code: errors.get(key(file)) }); const value = nodes.get(key(file)); if (!value) throw missing(); return value; };
  const stat = file => { const value = entry(file); return { ...value, size: Buffer.byteLength(value.text), isDirectory: () => value.type === 'directory', isFile: () => value.type === 'file', isSymbolicLink: () => value.type === 'link' }; };
  const controlledFs = {
    constants: fs.constants,
    lstatSync: stat,
    realpathSync(file) { const value = entry(file); return value.real || win.resolve(file); },
    readFileSync(file, encoding) { const value = entry(file), text = value.text; hooks.get(key(file))?.(); return encoding ? text : Buffer.from(text); },
    readdirSync(file) { entry(file); return [...nodes.keys()].filter(value => win.dirname(value) === key(file)).map(value => win.basename(value)); },
    mkdirSync() { throw new Error('No Windows private storage may be created.'); },
  };
  const controlledAsync = {
    lstat: async file => stat(file), realpath: async file => controlledFs.realpathSync(file), readdir: async file => controlledFs.readdirSync(file),
    open: async () => { throw new Error('No private file may be opened on unqualified Windows.'); },
  };
  put(root, 'directory'); put(project, 'directory');
  const settings = win.join(root, 'settings.json'), privateRoot = win.join(root, 'privacy');
  const connection = { id: 'synthetic-provider', kind: 'compatible', name: 'Synthetic provider', baseURL: 'https://provider.example.invalid/v1' };
  const initial = { version: 1, connections: [connection], projects: {} };
  const save = value => put(settings, 'file', JSON.stringify(value)); save(initial);
  const read = () => { try { return JSON.parse(controlledFs.readFileSync(settings, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return { version: 1, connections: [], projects: {} }; throw error; } };
  const store = { root, projectKey: value => createHash('sha256').update(value).digest('hex'), read: async () => { reads++; return read(); },
    update: async change => { updates++; const state = read(); await change(state); save(state); },
    encrypt() { throw new Error('No encryption may be needed for privacy-off.'); }, decrypt() { throw new Error('No ciphertext may be read for privacy-off.'); } };
  const host = Object.create(process); Object.defineProperties(host, { platform: { value: 'win32' }, getuid: { value: undefined } });
  const file = path.resolve(__dirname, '../core/privacy-service.cjs'), mod = { exports: {} }, realRequire = createRequire(file);
  const wrapper = vm.runInNewContext('(function(require,module,exports){' + fs.readFileSync(file, 'utf8') + '\n})',
    { process: host, Buffer, URL, structuredClone, setTimeout, clearTimeout, fetch: () => { throw new Error('No network allowed.'); } }, { filename: file });
  wrapper(id => id === 'node:fs' ? controlledFs : id === 'node:fs/promises' ? controlledAsync : id === 'node:path' ? win : realRequire(id), mod, mod.exports);
  const bench = { store, project: { root: project }, chats: new Map(), catalogs: new Map(), routeCatalogs: new Map(), running: false, emit() {},
    privacyRuntimeProvider: { getAvailability: async () => ({ hybrid: false, isolation: false }) } };
  const service = new mod.exports.PrivacyService(bench), scope = { kind: 'idea', root: null, chat: null };
  const model = { id: 'synthetic-model' }, body = JSON.stringify({ model: model.id, messages: [{ role: 'user', content: 'Build a synthetic example.' }] });
  const sent = [];
  const dispatch = overrides => service.dispatch({ scope, connection, model, url: connection.baseURL + '/chat/completions', headers: {}, body, purpose: 'idea', revision: 1, contextPartition: 'synthetic-idea', assertCurrent: () => true, ...overrides },
    async (url, options) => { sent.push({ url, body: options.body }); return new Response('synthetic response'); });
  return { service, bench, store, scope, connection, body, root, project, settings, privateRoot, nodes, errors, hooks, put, key, read, save, stat, dispatch, sent, counts: () => ({ reads, updates }) };
}
const failed = { code: 'PRIVACY_CONTROL_FAILED' };

test('Windows privacy-off permits settings, model discovery and exact ordinary model bytes', async () => {
  const f = fixture();
  assert.equal(Object.keys(await f.service.policies(f.scope)).length, 0);
  assert.equal(await f.service.ensureDataFloor(f.scope), false);
  assert.equal(await f.service.getDataFloor(f.scope), null);
  assert.equal((await f.service.destination({ connectionID: f.connection.id, modelID: 'synthetic-model' })).locality, 'cloud');
  const permit = await f.service.discoveryPermit(f.scope, f.connection); assert.equal(permit(f.connection.baseURL + '/models'), true);
  const status = await f.service.get({ scope: 'idea' }); assert.equal(status.enabled, false); assert.equal(status.capabilities.isolation, false);
  const projectStatus = await f.service.get({ scope: 'project' }); assert.equal(projectStatus.enabled, false); assert.equal(projectStatus.capabilities.hybrid, false);
  const response = await f.dispatch(); assert.equal(await response.text(), 'synthetic response'); assert.equal(response.privacyAssertCurrent(), true);
  assert.deepEqual(f.sent, [{ url: f.connection.baseURL + '/chat/completions', body: f.body }]);
  assert.equal(f.nodes.has(f.key(f.privateRoot)), false); assert.equal(f.counts().updates, 0);
});

test('Windows new empty profiles and empty privacy objects retain ordinary project creation', async () => {
  for (const variant of ['missing-settings', 'empty-metadata']) {
    const f = fixture();
    if (variant === 'missing-settings') f.nodes.delete(f.key(f.settings));
    else { const state = f.read(); state.privacyIdea = {}; state.privacyHistoryFloors = {}; state.projects[f.store.projectKey(f.project)] = { privacy: {} }; f.save(state); }
    const inherit = await f.service.prepareIdeaProjectInheritance();
    assert.equal(await inherit(f.project), false); assert.equal(f.counts().updates, 0);
    await assert.rejects(inherit(f.project), failed);
  }
});

for (const variant of ['directory', 'file', 'link', 'unreadable']) {
  test(`Windows existing or inaccessible private root remains blocked: ${variant}`, async () => {
    const f = fixture(); if (variant === 'unreadable') f.errors.set(f.key(f.privateRoot), 'EACCES'); else f.put(f.privateRoot, variant);
    await assert.rejects(f.service.policies(f.scope), failed); await assert.rejects(f.dispatch(), failed);
    await assert.rejects(f.service.prepareIdeaProjectInheritance(), failed);
    assert.equal(f.sent.length, 0); assert.equal(f.counts().updates, 0);
  });
}

for (const variant of ['idea-policy', 'disabled-history', 'other-project-policy', 'conversation-policy', 'indexed-floor', 'malformed-floor', 'null-floor', 'null-policy']) {
  test(`Windows protected or unknown settings cannot use the absence path: ${variant}`, async () => {
    const f = fixture(), state = f.read();
    if (variant === 'idea-policy') state.privacyIdea = { enabled: true, defaultClass: 'strict' };
    if (variant === 'disabled-history') state.privacyIdea = { enabled: false, protectedSources: [{ path: 'private.csv', classification: 'strict' }] };
    if (variant === 'other-project-policy') state.projects.other = { privacy: { enabled: true } };
    if (variant === 'conversation-policy') state.projects.other = { privacy: { conversations: { old: { enabled: true } } } };
    if (variant === 'indexed-floor') { state.privacyIdea = {}; state.privacyHistoryFloors = { ['a'.repeat(64) + '.' + 'b'.repeat(64)]: 'c'.repeat(64) }; }
    if (variant === 'malformed-floor') state.privacyHistoryFloors = [];
    if (variant === 'null-floor') state.privacyHistoryFloors = null;
    if (variant === 'null-policy') state.privacyIdea = null;
    f.save(state);
    await assert.rejects(f.service.policies(f.scope), failed); await assert.rejects(f.dispatch(), failed);
    assert.equal(f.sent.length, 0);
  });
}

test('Windows malformed settings, symlinks, hardlinks and changed identities stay blocked', async () => {
  for (const variant of ['bad-json', 'settings-link', 'settings-hardlink', 'root-link', 'settings-replaced', 'root-replaced', 'unknown-settings']) {
    const f = fixture();
    if (variant === 'bad-json') f.put(f.settings, 'file', '{');
    if (variant === 'settings-link') f.put(f.settings, 'link', JSON.stringify(f.read()));
    if (variant === 'settings-hardlink') f.nodes.get(f.key(f.settings)).nlink = 2;
    if (variant === 'root-link') f.put(f.root, 'link');
    if (variant === 'settings-replaced') f.hooks.set(f.key(f.settings), () => { f.hooks.clear(); f.put(f.settings, 'file', JSON.stringify(f.read())); });
    if (variant === 'root-replaced') f.hooks.set(f.key(f.settings), () => { f.hooks.clear(); f.put(f.root, 'directory'); });
    if (variant === 'unknown-settings') f.errors.set(f.key(f.settings), 'EACCES');
    await assert.rejects(f.service.privateConfig('organization-policy.json'), failed, variant);
  }
});

test('Windows permits are invalidated by changed connection or protection metadata', async () => {
  for (const variant of ['connection', 'floor', 'private-directory']) {
    const f = fixture(), permit = await f.service.discoveryPermit(f.scope, f.connection);
    const response = await f.dispatch();
    if (variant === 'connection') { const state = f.read(); state.connections[0].baseURL = 'https://different.example.invalid/v1'; f.save(state); }
    if (variant === 'floor') { const state = f.read(); state.privacyHistoryFloors = { damaged: 'floor' }; f.save(state); }
    if (variant === 'private-directory') f.put(f.privateRoot, 'directory');
    assert.throws(() => permit(), error => ['PRIVACY_STALE', 'PRIVACY_CONTROL_FAILED'].includes(error.code));
    assert.throws(() => response.privacyAssertCurrent(), error => ['PRIVACY_STALE', 'PRIVACY_CONTROL_FAILED'].includes(error.code));
    await assert.rejects(f.dispatch(), error => ['PRIVACY_STALE', 'PRIVACY_CONTROL_FAILED'].includes(error.code));
    assert.equal(f.sent.length, 1);
  }
});

test('Windows protection added during dispatch blocks transport without fallback', async () => {
  const f = fixture(); let calls = 0;
  await assert.rejects(f.dispatch({ assertCurrent() { if (++calls === 1) f.put(f.privateRoot, 'directory'); return true; } }), failed);
  assert.equal(f.sent.length, 0);
});

test('Windows project inheritance still requires an empty canonical nonsymlink directory', async () => {
  for (const variant of ['nonempty', 'symlink', 'noncanonical', 'changed-policy']) {
    const f = fixture(), inherit = await f.service.prepareIdeaProjectInheritance();
    if (variant === 'nonempty') f.put(path.win32.join(f.project, 'keep.txt'), 'file', 'synthetic content');
    if (variant === 'symlink') f.put(f.project, 'link');
    if (variant === 'noncanonical') f.nodes.get(f.key(f.project)).real = 'C:\\Projects\\Other';
    if (variant === 'changed-policy') { const state = f.read(); state.privacyIdea = { enabled: true }; f.save(state); }
    await assert.rejects(inherit(f.project), error => ['PRIVACY_STALE', 'PRIVACY_CONTROL_FAILED'].includes(error.code));
    assert.equal(f.counts().updates, 0);
  }
});

test('Windows unqualified privacy configuration and private writes fail before state mutation', async () => {
  const f = fixture();
  for (const enabled of [true, false]) await assert.rejects(f.service.configure({ scope: 'idea', settings: { enabled, workMode: 'cloud-controlled', defaultClass: 'internal', requireApproval: false } }), failed);
  await assert.rejects(f.service.audit({ action: 'model-call', decision: 'allow' }), failed);
  assert.throws(() => f.service.privateDirectorySync(f.privateRoot, true), failed);
  assert.equal(f.counts().updates, 0); assert.equal(f.nodes.has(f.key(f.privateRoot)), false);
  assert.equal(Object.keys(await f.service.policies(f.scope)).length, 0);
});
