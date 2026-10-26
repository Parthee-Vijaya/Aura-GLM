// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { ExternalEgress } = require('../core/privacy/external-egress.cjs');
const { Publishing, GitTransport } = require('../core/publishing.cjs');
const { Deployments } = require('../core/deployments.cjs');
const { PromteDeployment } = require('../core/provider-promte.cjs');
const { DevServer } = require('../core/dev-server.cjs');
const { buildSaved } = require('../core/komplai-build.cjs');
const blocked = error => error.code?.startsWith('PRIVACY_');

async function fixture(t, enabled = true) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-egress-test-')), root = path.join(directory, 'project');
  await fs.mkdir(root);
  const store = new Store(path.join(directory, 'profile'), { isEncryptionAvailable: () => false });
  const bench = { store, project: { root }, chats: new Map(), emit() {} };
  const service = bench.privacy = new PrivacyService(bench), getPrivacy = () => service;
  const rule = { enabled, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['receiver'], requireApproval: true };
  await store.saveProject(root, { privacy: rule });
  const reviews = [];
  service.requestApproval = async review => { reviews.push(review); return 'approve'; };
  t.after(async () => { service.cancelScope(); await service.auditQueue; await fs.rm(directory, { recursive: true, force: true }); });
  const register = async endpoint => { await fs.mkdir(service.directory, { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(service.directory, 'external-destinations.json'), JSON.stringify({ receiver: { endpoint, locality: 'cloud', revision: 'recipient-v1', actions: ['integration','browser-http'] } }), { mode: 0o600 }); };
  const egress = new ExternalEgress(getPrivacy);
  return { root, directory, store, bench, service, getPrivacy, rule, reviews, register, egress };
}
async function receiver(t) {
  const records = [];
  const server = http.createServer(async (request, response) => { const parts = []; for await (const part of request) parts.push(part); records.push({ address: request.url, body: Buffer.concat(parts), headers: request.headers }); response.end('received'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { records, endpoint: `http://127.0.0.1:${server.address().port}` };
}

test('typed integration sends only snapshotted reviewed bytes and keeps broker authorization out of review and audit', async t => {
  const f = await fixture(t), server = await receiver(t); await f.register(server.endpoint + '/approved');
  const body = Buffer.from('{ "description": "Public release notes" }');
  f.service.requestApproval = async review => { f.reviews.push(review); body.fill(88); return 'approve'; };
  const response = await f.egress.request({ root: f.root, destinationId: 'receiver', url: server.endpoint + '/approved/send?purpose=synthetic', method: 'POST', body, headers: { Authorization: 'Bearer SYNTHETIC_BROKER_VALUE' } });
  await response.text();
  assert.equal(server.records.length, 1);
  assert.equal(server.records[0].body.toString(), '{ "description": "Public release notes" }');
  const manifest = JSON.parse(f.reviews[0].payload);
  assert.equal(manifest.material.requestAddress, server.endpoint + '/approved/send?purpose=synthetic');
  assert.equal(manifest.material.content.json.description, 'Public release notes');
  assert.doesNotMatch(JSON.stringify(f.reviews), /SYNTHETIC_BROKER_VALUE|Authorization/);
  const audit = await fs.readFile(path.join(f.service.directory, 'audit.jsonl'), 'utf8');
  assert.doesNotMatch(audit, /Public release notes|SYNTHETIC_BROKER_VALUE|purpose=synthetic|approved\/send/);
});

test('masked manifest cannot authorize original upload; opaque artifacts, unsafe addresses and strict provenance stay local', async t => {
  const f = await fixture(t), server = await receiver(t); await f.register(server.endpoint + '/approved');
  for (const input of [
    { body: '{"description":"person@example.invalid"}' },
    { body: '{"description":"person@example.invalid","description":"Public"}' },
    { body: Buffer.from([255, 0, 1]), contentType: 'application/octet-stream' },
    { body: '{"description":"Public"}', provenance: [{ classification: 'strict' }] },
    { url: server.endpoint + '/approved/person%40example.invalid' },
    { url: server.endpoint + '/approved%252foutside' },
    { url: server.endpoint + '/outside' },
    { headers: { Cookie: 'private=synthetic' } },
  ]) await assert.rejects(f.egress.request({ root: f.root, destinationId: 'receiver', url: server.endpoint + '/approved/send', method: 'POST', ...input }), blocked);
  assert.equal(server.records.length, 0);
});

test('a changed destination registry during approval cannot dispatch the old or new address', async t => {
  const f = await fixture(t), server = await receiver(t); await f.register(server.endpoint + '/approved');
  f.service.requestApproval = async () => { await f.register(server.endpoint + '/changed'); return 'approve'; };
  await assert.rejects(f.egress.request({ root: f.root, destinationId: 'receiver', url: server.endpoint + '/approved/send', method: 'POST', body: '{"description":"Public"}' }), { code: 'PRIVACY_STALE' });
  assert.equal(server.records.length, 0);
});

test('protected conversations also prohibit generic project exports after switching chats', async t => {
  const f = await fixture(t, false);
  await f.store.saveProject(f.root, { privacy: { ...f.rule, conversations: { priorChat: { enabled: true, version: 'prior-chat-v1', defaultClass: 'strict' } } } });
  f.bench.chat = { id: 'different-chat' };
  assert.equal(await f.egress.active(f.root), true);
  assert.equal(f.egress.activeSync(f.root), true);
  await assert.rejects(f.egress.legacyPermit(f.root), { code: 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED' });
});

test('legacy lease keeps the disabled workflow available but cannot survive policy activation', async t => {
  const f = await fixture(t, false), permit = await f.egress.legacyPermit(f.root);
  assert.equal(permit(), true);
  await f.store.saveProject(f.root, { privacy: { ...f.rule, enabled: true, version: 'enabled-v2' } });
  assert.throws(permit, { code: 'PRIVACY_STALE' });
  await assert.rejects(f.egress.legacyPermit(f.root), { code: 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED' });
});

test('protected Git publication stops before provider calls, local commands or injected transport', async t => {
  const f = await fixture(t); let calls = 0;
  const forbidden = () => { calls++; throw Error('must not run'); };
  const publication = new Publishing({ store: f.store, git: { repository: forbidden }, provider: { id: 'github', get: forbidden }, transport: { head: forbidden, fetch: forbidden, push: forbidden }, getPrivacy: f.getPrivacy });
  for (const operation of [() => publication.attach(f.root, 'synthetic/repo'), () => publication.target(f.root), () => publication.review(f.root), () => publication.push(f.root, 'old-token')]) await assert.rejects(operation(), blocked);
  const transport = new GitTransport({ credential: forbidden }, { getPrivacy: f.getPrivacy });
  await assert.rejects(transport.command(f.root, { gitURL: 'https://github.com/synthetic/repo.git' }, () => []), blocked);
  assert.equal(calls, 0);
});

test('protected deploy, provider multipart upload and local saved build fail closed before side effects', async t => {
  const f = await fixture(t); let calls = 0;
  const forbidden = () => { calls++; throw Error('must not run'); };
  const deployment = new Deployments(f.store, { getPrivacy: f.getPrivacy, providers: { promte: { inspect: forbidden, deploy: forbidden, status: forbidden } }, artifact: forbidden, builder: forbidden });
  for (const operation of [() => deployment.review(f.root, { provider: 'promte' }), () => deployment.settings(f.root), () => deployment.deploy(f.root, 'old-token'), () => deployment.check(f.root), () => deployment.material(f.root, { provider: 'komplai', build: true })]) await assert.rejects(operation(), blocked);
  const promte = new PromteDeployment({ store: f.store, getPrivacy: f.getPrivacy, fetcher: forbidden, lookup: forbidden, readCredentials: forbidden });
  await assert.rejects(promte.call('https://example.invalid', '/upload', { root: f.root, body: Buffer.from('synthetic') }), blocked);
  await assert.rejects(promte.deploy({}, { root: f.root }, {}), blocked);
  await assert.rejects(buildSaved({ root: f.root }, { getPrivacy: f.getPrivacy, runtime: forbidden }), blocked);
  assert.equal(calls, 0);
});

test('protected preview and package installation require isolation before reading manifests or starting host tools', async t => {
  const f = await fixture(t), server = new DevServer({ getPrivacy: f.getPrivacy });
  await server.activate(f.root);
  for (const action of ['install', 'start']) await assert.rejects(server.prepare(action), blocked);
  server.review = { token: 'old-token', root: f.root };
  await assert.rejects(server.execute('old-token'), blocked);
  await assert.rejects(server.executeServices({ action: 'install' }, {}), blocked);
  assert.equal(server.child, null);
  assert.equal(server.children.length, 0);
  await server.stop();
});

test('a physical path alias keeps the saved policy identity; conflicting host identities fail closed', async t => {
  const f = await fixture(t), canonical = await fs.realpath(f.root);
  assert.equal(f.egress.scope(canonical).root, f.root);
  await assert.rejects(f.egress.legacyPermit(canonical), blocked);
  const alias = path.join(f.directory, 'project-link'); await fs.symlink(f.root, alias);
  assert.equal(f.egress.scope(alias).root, f.root);
  f.bench.chats.set('conflicting', { root: alias, project: { root: alias } });
  assert.throws(() => f.egress.scope(alias), { code: 'PRIVACY_CONTROL_FAILED' });
});

test('destination registration limits action type as well as endpoint', async t => {
  const f = await fixture(t), server = await receiver(t); await f.register(server.endpoint + '/approved');
  await assert.rejects(f.egress.request({ root: f.root, action: 'upload', destinationId: 'receiver', url: server.endpoint + '/approved/send', method: 'POST', body: '{"description":"Public"}' }), { code: 'PRIVACY_DESTINATION_INVALID' });
  assert.equal(server.records.length, 0);
});

test('generic host exports inherit protected sources even when filenames and explicit labels are omitted', async t => {
  const f = await fixture(t), server = await receiver(t); await f.register(server.endpoint + '/approved');
  await f.store.saveProject(f.root, { privacy: { ...f.rule, protectedSources: [{ path: 'private/cases.csv', classification: 'strict' }] } });
  await assert.rejects(f.egress.request({ root: f.root, destinationId: 'receiver', url: server.endpoint + '/approved/send', method: 'POST', body: '{"summary":"Three records processed successfully"}' }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(server.records.length, 0);
  assert.equal(f.reviews.length, 0);
});
