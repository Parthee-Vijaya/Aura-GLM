// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { composePolicy } = require('../core/privacy/index.cjs');
const { createProject } = require('../core/projects.cjs');
const profiles = path.resolve(__dirname, '../../profiles');
const input = { name: 'Synthetic private idea', purpose: 'An apparently harmless derived description.', links: [], tests: 'manuel' };
const idea = { kind: 'idea', root: null, chat: null };
async function fixture(t, enabled = true) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-idea-project-'));
  const root = await fs.realpath(temporary), key = randomBytes(32);
  const safeStorage = { isEncryptionAvailable: () => true,
    encryptString: text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), bytes]); },
    decryptString: bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); },
  };
  const store = new Store(root, safeStorage), connection = { id: 'synthetic-cloud', kind: 'compatible', name: 'Synthetic cloud', baseURL: 'https://controlled.invalid/v1' };
  await store.update(state => { state.connections = [connection]; if (enabled) state.privacyIdea = { enabled: true, version: 'idea-v1', workMode: 'local', defaultClass: 'public', allowedDestinationIds: [connection.id], protectedSources: [{ path: 'protected/source.csv', classification: 'confidential' }] }; });
  const bench = { store, project: null, chat: null, chats: new Map(), emit: () => {} }, service = new PrivacyService(bench);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const create = async () => createProject(root, input, [], profiles, { beforeWrite: await service.prepareIdeaProjectInheritance() });
  const request = scope => ({ scope, connection, model: { id: 'synthetic' }, url: connection.baseURL + '/chat/completions', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'synthetic', messages: [{ role: 'user', content: input.purpose }] }), purpose: 'project-chat', revision: 1, contextPartition: 'test-chat', assertCurrent: () => true });
  return { root, store, service, bench, create, request };
}

test('a local private idea transfers policy and derived protection before project files; cloud stays blocked after disable and restart', async t => {
  const f = await fixture(t);
  await f.service.ensureDataFloor(idea, [{ classification: 'strict', attributes: { personalData: true } }], { inheritedValues: [{ kind: 'protected', value: 'SYNTHETIC-PRIVATE-HISTORY' }] });
  const created = await f.create();
  await f.store.saveProject(created.root, { startup: {}, autoCheckpoint: true }); // The remaining main-process creation step must preserve inherited privacy.
  const scope = { kind: 'conversation', root: created.root, chat: 'test-chat' };
  const policy = composePolicy(await f.service.policies(scope));
  assert.equal(policy.enabled, true); assert.equal(policy.workMode, 'local');
  assert(policy.protectedSources.some(source => source.path === 'protected/source.csv'));
  assert(policy.protectedSources.some(source => source.path === '__aura_idea_derivation__' && source.classification === 'strict'));
  assert.equal((await f.service.getDataFloor(scope)).attributes.personalData, true);
  assert(policy.protectedValues.some(value => value.value === 'SYNTHETIC-PRIVATE-HISTORY'));
  assert.doesNotMatch(await fs.readFile(path.join(f.root, 'settings.json'), 'utf8'), /SYNTHETIC-PRIVATE-HISTORY/);
  let sent = 0; const transport = async () => { sent++; return new Response('{}'); };
  await assert.rejects(f.service.dispatch(f.request(scope), transport), { code: 'PRIVACY_LOCAL_REQUIRED' });
  await f.store.update(state => { state.projects[f.store.projectKey(created.root)].privacy = { enabled: false, version: 'disabled', workMode: 'cloud-controlled', defaultClass: 'public', allowedDestinationIds: ['synthetic-cloud'] }; });
  const restored = new PrivacyService(f.bench);
  assert.equal((await restored.getDataFloor(scope)).classification, 'strict');
  await assert.rejects(restored.dispatch(f.request(scope), transport), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(sent, 0);
  assert.match(await fs.readFile(path.join(created.root, 'harness.json'), 'utf8'), /apparently harmless/);
});

test('unprotected idea creation preserves existing defaults without enabling privacy', async t => {
  const f = await fixture(t, false), created = await f.create();
  assert.equal(composePolicy(await f.service.policies({ kind: 'project', root: created.root, chat: null })).enabled, false);
  assert.equal((await f.store.project(created.root)).privacy, undefined);
});

test('changed idea policy invalidates the prepared inheritance before any project content is written', async t => {
  const f = await fixture(t), beforeWrite = await f.service.prepareIdeaProjectInheritance();
  await f.store.update(state => { state.privacyIdea.version = 'changed'; });
  await assert.rejects(createProject(f.root, input, [], profiles, { beforeWrite }), /Idéens dataregler er ændret/);
  const names = await fs.readdir(f.root), folder = names.find(name => name.startsWith('projekt-'));
  assert(folder); assert.deepEqual(await fs.readdir(path.join(f.root, folder)), []);
});

test('lost idea-floor ciphertext prevents project creation rather than dropping provenance', async t => {
  const f = await fixture(t);
  await f.service.ensureDataFloor(idea, [{ classification: 'strict' }]);
  const directory = path.join(f.root, 'privacy', 'history-floors');
  await fs.unlink(path.join(directory, (await fs.readdir(directory))[0]));
  await assert.rejects(f.create(), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal((await fs.readdir(f.root)).some(name => name.startsWith('projekt-')), false);
});

test('inheritance refuses populated, existing and symlink directories and is one-use', async t => {
  const f = await fixture(t), populated = path.join(f.root, 'populated');
  await fs.mkdir(populated); await fs.writeFile(path.join(populated, 'keep.txt'), 'existing');
  await assert.rejects((await f.service.prepareIdeaProjectInheritance())(populated), { code: 'PRIVACY_CONTROL_FAILED' });
  const empty = path.join(f.root, 'existing'); await fs.mkdir(empty); await f.store.saveProject(empty, { startup: {} });
  await assert.rejects((await f.service.prepareIdeaProjectInheritance())(empty), { code: 'PRIVACY_CONTROL_FAILED' });
  const symlink = path.join(f.root, 'link'); await fs.symlink(empty, symlink);
  await assert.rejects((await f.service.prepareIdeaProjectInheritance())(symlink), { code: 'PRIVACY_CONTROL_FAILED' });
  const fresh = path.join(f.root, 'fresh'); await fs.mkdir(fresh); const once = await f.service.prepareIdeaProjectInheritance();
  assert.equal(await once(fresh), true); await assert.rejects(once(fresh), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal(await fs.readFile(path.join(populated, 'keep.txt'), 'utf8'), 'existing');
});

test('organization-only protection also follows a new derived project', async t => {
  const f = await fixture(t, false), directory = path.join(f.root, 'privacy');
  await fs.mkdir(directory, { mode: 0o700 });
  await fs.writeFile(path.join(directory, 'organization-policy.json'), JSON.stringify({ enabled: true, version: 'org-1', workMode: 'local', defaultClass: 'confidential', allowedDestinationIds: ['synthetic-cloud'] }), { mode: 0o600 });
  const created = await f.create(), scope = { kind: 'project', root: created.root, chat: null };
  assert.equal((await f.store.project(created.root)).privacy.workMode, 'local');
  assert.equal((await f.service.getDataFloor(scope)).classification, 'confidential');
});
