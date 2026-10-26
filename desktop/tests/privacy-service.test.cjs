// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EventEmitter, once } = require('node:events');
const { randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { IdeaRefinement } = require('../core/idea-refinement.cjs');
const { forwardModel } = require('../core/model-transport.cjs');
const { ExternalEgress } = require('../core/privacy/external-egress.cjs');
const { Workbench } = require('../core/workbench.cjs');
const connections = require('../core/connections.cjs');

const packet = content => JSON.stringify({ model: 'synthetic', messages: [{ role: 'user', content }] });
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-service-'));
  const received = [], events = [], emitter = new EventEmitter();
  let respond = (_request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ description: 'Et offentligt forslag.', plan: 'Afklar, byg og test.', questions: [] }) } }] }));
  };
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({ url: request.url, body: Buffer.concat(chunks).toString('utf8') });
    await respond(request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(root, { recursive: true, force: true }); });
  const connection = { id: 'controlled-cloud', name: 'Synthetic provider', kind: 'compatible', baseURL: `http://127.0.0.1:${server.address().port}/v1` };
  const model = { id: 'synthetic', name: 'Synthetic model' };
  const syntheticKey = randomBytes(32);
  const safeStorage = { isEncryptionAvailable: () => true,
    encryptString: text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', syntheticKey, iv); const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]); return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]); },
    decryptString: bytes => { const decipher = createDecipheriv('aes-256-gcm', syntheticKey, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'); },
  };
  const store = new Store(root, safeStorage);
  const project = { root: path.join(root, 'project') }, chat = { id: 'conversation-1' };
  const rule = { enabled: true, version: 'project-v1', allowedDestinationIds: [connection.id], workMode: 'cloud-controlled', defaultClass: 'public', maxClass: 'internal' };
  await store.update(state => { state.connections = [connection]; state.privacyIdea = { ...rule }; state.projects[store.projectKey(project.root)] = { privacy: { ...rule } }; });
  const library = await require('../core/library.cjs').loadLibrary(path.resolve(__dirname, '../../profiles'));
  const bench = { store, project, chat, chats: new Map(), running: false, catalogs: new Map(), routeCatalogs: new Map(),
    connection: async id => (await store.read()).connections.find(item => item.id === id), models: async () => [model], routes: async () => [],
    skills: { context: async () => ({ features: { design: true }, skills: library.skills }) },
    emit: event => { events.push(event); emitter.emit(event.type, event); },
  };
  const service = bench.privacy = new PrivacyService(bench);
  t.after(() => service.cancelScope());
  const scope = service.scope({ scope: 'conversation' });
  const outgoing = overrides => ({ scope, connection, model, url: connection.baseURL + '/chat/completions', headers: { 'content-type': 'application/json' }, body: packet('Public task.'), signal: new AbortController().signal, purpose: 'project-chat', revision: 1, contextPartition: 'external-conversation-1', assertCurrent: () => true, ...overrides });
  const dispatch = (overrides, transport) => service.dispatch(outgoing(overrides), transport);
  const nextReview = () => once(emitter, 'privacy.review', { signal: AbortSignal.timeout(2000) }).then(([event]) => event);
  const writeConfig = async (name, content) => { await fs.mkdir(path.join(root, 'privacy'), { recursive: true, mode: 0o700 }); await fs.writeFile(path.join(root, 'privacy', name), JSON.stringify(content), { mode: 0o600 }); };
  return { root, received, events, bench, store, connection, model, service, scope, outgoing, dispatch, nextReview, writeConfig, rule, reply: value => { respond = value; } };
}

test('service sends exact reviewed sanitized bytes and records metadata without private content', async t => {
  const f = await fixture(t), reviewReady = f.nextReview();
  const sending = f.dispatch({ body: packet('Write to alice@example.invalid about 010190-1234.') });
  const review = await reviewReady;
  assert.equal(f.received.length, 0);
  assert.doesNotMatch(review.body, /alice@example.invalid|010190-1234/);
  assert.equal(review.purpose, 'project-chat');
  f.service.decide({ id: review.id, decision: 'approve' });
  await (await sending).text();
  assert.equal(f.received.length, 1);
  assert.equal(f.received[0].body, review.body);
  const audit = await fs.readFile(path.join(f.root, 'privacy/audit.jsonl'), 'utf8');
  assert.doesNotMatch(audit, /alice@example|010190|EMAIL_|CPR_|project-chat|\/project/);
  assert.equal(JSON.parse(audit.trim()).decision, 'rewrite');
});

test('trusted IPC conversation scope survives a selected-tab change and ignores renderer retargeting', async t => {
  const f = await fixture(t), first = { ...f.bench.chat, project: f.bench.project, close: async () => {} }, other = { id: 'conversation-2', project: f.bench.project, close: async () => {} };
  f.bench.chats = new Map([[first.id, first], [other.id, other]]); f.bench.chat = other;
  f.bench.chatFor = id => { const chat = f.bench.chats.get(id); if (!chat) throw Error('missing chat'); return chat; };
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.conversations = { [first.id]: { ...f.rule, defaultClass: 'confidential' }, [other.id]: { ...f.rule, defaultClass: 'public' } }; });
  assert.equal((await f.service.get({ scope: 'conversation', chat: other.id, scopeChat: other.id }, first.id)).settings.defaultClass, 'confidential');
  assert.equal((await f.service.get({ scope: 'conversation', chat: first.id, scopeChat: first.id })).settings.defaultClass, 'public');
  f.bench.privacyRuntimeProvider = { beforeConfigure: async scope => { assert.equal(scope.chat, first.id); f.bench.chat = first; } };
  const result = await f.service.configure({ scope: 'conversation', chat: other.id, settings: { enabled: true, workMode: 'local', defaultClass: 'strict', requireApproval: true } }, first.id);
  assert.equal(result.settings.defaultClass, 'strict');
  const saved = (await f.store.read()).projects[f.store.projectKey(f.bench.project.root)].privacy.conversations;
  assert.equal(saved[first.id].workMode, 'local'); assert.equal(saved[other.id].defaultClass, 'public');
  await assert.rejects(f.service.get({ scope: 'conversation' }, 'unknown-chat'));
});

test('destination status cannot label an omitted organization allowlist as approved', async t => {
  const f = await fixture(t);
  await f.writeConfig('organization-policy.json', { enabled: true, version: 'organization-with-no-approved-recipient' });
  const status = await f.service.get({ scope: 'conversation' });
  assert.equal(status.enabled, true); assert.equal(status.destinations.length, 1);
  assert.equal(status.destinations[0].allowed, false);
  await assert.rejects(f.service.assertSelection(f.scope, { connectionID: f.connection.id }), { code: 'PRIVACY_BLOCKED' });
});

test('a removed bound conversation cannot receive settings after asynchronous activation', async t => {
  const f = await fixture(t), chat = { ...f.bench.chat, project: f.bench.project, close: async () => {} };
  f.bench.chats.set(chat.id, chat); f.bench.chat = chat;
  f.bench.chatFor = id => { const value = f.bench.chats.get(id); if (!value) throw Error('missing chat'); return value; };
  f.bench.privacyRuntimeProvider = { beforeConfigure: async () => { f.bench.chats.delete(chat.id); } };
  await assert.rejects(f.service.configure({ scope: 'conversation', settings: { enabled: true, workMode: 'local', defaultClass: 'strict', requireApproval: true } }, chat.id), { code: 'PRIVACY_STALE' });
  assert.equal((await f.store.read()).projects[f.store.projectKey(f.bench.project.root)].privacy.conversations, undefined);
});

test('synchronous external guards retain encrypted history protection after settings are disabled', async t => {
  const f = await fixture(t), egress = new ExternalEgress(() => f.service);
  await f.service.ensureDataFloor(f.scope, [{ classification: 'strict' }]);
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy = { enabled: false, version: 'disabled' }; });
  assert.equal(await egress.active(f.bench.project.root), true);
  assert.equal(egress.activeSync(f.bench.project.root), true);
  const state = await f.store.read(), [key] = f.service.floorEntries(f.scope, state)[0];
  await fs.writeFile(path.join(f.service.directory, 'history-floors', key + '.enc'), 'damaged ciphertext');
  assert.throws(() => egress.activeSync(f.bench.project.root), { code: 'PRIVACY_CONTROL_FAILED' });
});

function useCatalogMethods(f) {
  Object.assign(f.bench, { catalogRequests: new Map(), catalogTimes: new Map(), discoveryScope: Workbench.prototype.discoveryScope, models: Workbench.prototype.models, routes: Workbench.prototype.routes });
  f.reply((_request, response) => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'synthetic', name: 'Synthetic' }] })); });
}
test('catalog discovery applies the trusted conversation rules, including a background local-only conversation', async t => {
  const f = await fixture(t); useCatalogMethods(f);
  const selected = f.bench.chat, background = { id: 'local-background' };
  f.bench.chats = new Map([[selected.id, selected], [background.id, background]]);
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.conversations = { [background.id]: { enabled: true, version: 'local-chat', workMode: 'local' } }; });
  await assert.rejects(f.bench.models(f.connection.id, background.id), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(f.received.length, 0);
  assert.equal((await f.bench.models(f.connection.id, selected.id))[0].id, 'synthetic');
  assert.equal(f.received.length, 1);
});
test('catalog and route leases detect policy or credential changes during keychain access before network bytes', async t => {
  for (const kind of ['models', 'routes']) await t.test(kind, async t => {
    const f = await fixture(t); useCatalogMethods(f);
    if (kind === 'routes') await f.store.update(state => { state.connections[0].kind = 'openrouter'; });
    f.store.decrypt = () => {
      const file = path.join(f.root, 'settings.json'), state = JSON.parse(fsSync.readFileSync(file, 'utf8'));
      if (kind === 'models') state.projects[f.store.projectKey(f.bench.project.root)].privacy.workMode = 'local';
      else state.connections[0].secret = 'synthetic-replaced-credential';
      fsSync.writeFileSync(file, JSON.stringify(state)); return 'synthetic-key';
    };
    await assert.rejects(kind === 'models' ? f.bench.models(f.connection.id) : f.bench.routes(f.connection.id, 'provider/synthetic'), { code: 'PRIVACY_STALE' });
    assert.equal(f.received.length, 0);
  });
});
test('a catalog response cannot enter the cache after the data policy changes in flight', async t => {
  const f = await fixture(t); useCatalogMethods(f);
  f.reply(async (_request, response) => {
    await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.workMode = 'local'; });
    response.end(JSON.stringify({ data: [{ id: 'synthetic' }] }));
  });
  await assert.rejects(f.bench.models(f.connection.id), { code: 'PRIVACY_STALE' });
  assert.equal(f.received.length, 1); assert.equal(f.bench.catalogs.has(f.connection.id), false);
});
test('discovery permits bind the exact catalog URL and reject async final guards or route traversal', async t => {
  const f = await fixture(t), permit = await f.service.discoveryPermit(f.scope, f.connection);
  await assert.rejects(connections.requestJSON(f.connection.baseURL + '/different', { assertCurrent: permit }), { code: 'PRIVACY_DESTINATION_INVALID' });
  await assert.rejects(connections.requestJSON(f.connection.baseURL + '/models', { assertCurrent: async () => true }), /genvalideres/);
  await assert.rejects(f.service.discoveryPermit(f.scope, f.connection, { kind: 'routes', modelID: '../private' }), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal(f.received.length, 0);
});

test('the first idea and retained idea history pass the same gate before a byte is sent', async t => {
  const f = await fixture(t), idea = new IdeaRefinement({ getWorkbench: () => f.bench });
  t.after(() => idea.stop());
  const input = { name: 'Public demo', idea: 'En tilmeldingsside for alice@example.invalid', connectionID: f.connection.id, modelID: f.model.id };
  for (const message of ['', 'Lav en kortere beskrivelse']) {
    const prepared = await idea.prepare({ ...input, message });
    const count = f.received.length, reviewReady = f.nextReview();
    const sending = idea.send({ token: prepared.token });
    const review = await reviewReady;
    assert.equal(f.received.length, count);
    assert.equal(review.purpose, 'idea-refinement');
    assert.doesNotMatch(review.body, /alice@example.invalid/);
    f.service.decide({ id: review.id, decision: 'approve' });
    assert.equal((await sending).description, 'Et offentligt forslag.');
    assert.equal(f.received[count].body, review.body);
  }
  assert.equal(f.received.length, 2);
});

test('strict project provenance blocks generic-looking history or tool summaries and YOLO cannot waive it', async t => {
  const f = await fixture(t);
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.protectedSources = [{ path: 'private/cases.csv', classification: 'strict' }]; });
  f.bench.yolo = true;
  await assert.rejects(f.dispatch({ body: JSON.stringify({ model: f.model.id, messages: [{ role: 'tool', content: 'Everything is fine.' }] }) }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(f.received.length, 0);
  assert.equal(f.service.pending.size, 0);
});

test('changed policy or encrypted credential while reviewing invalidates exact sharing', async t => {
  for (const kind of ['policy', 'credential']) await t.test(kind, async t => {
    const f = await fixture(t), reviewReady = f.nextReview();
    const sending = f.dispatch({ body: packet('Contact alice@example.invalid') });
    const rejected = assert.rejects(sending, { code: 'PRIVACY_STALE' });
    const review = await reviewReady;
    await f.store.update(state => {
      if (kind === 'credential') state.connections[0].secret = 'synthetic-encrypted-replacement';
      else state.projects[f.store.projectKey(f.bench.project.root)].privacy.version = 'project-v2';
    });
    f.service.decide({ id: review.id, decision: 'approve' });
    await rejected;
    assert.equal(f.received.length, 0);
  });
});

test('last synchronous authority check rejects a rule change during destination revalidation', async t => {
  const f = await fixture(t), original = f.service.destination.bind(f.service);
  let resolutions = 0;
  f.service.destination = async ref => {
    const result = await original(ref);
    // dispatch resolves once; the gate resolves once and then revalidates.
    if (++resolutions === 3) await f.writeConfig('organization-policy.json', { enabled: true, version: 'organization-v2', workMode: 'local', allowedDestinationIds: [f.connection.id] });
    return result;
  };
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_STALE' });
  assert.equal(f.received.length, 0);
});

test('the gate rechecks after local audit writes and before dispatch', async t => {
  const f = await fixture(t), audit = f.service.audit.bind(f.service);
  let changed = false;
  f.service.audit = async entry => {
    await audit(entry);
    if (!changed && entry.decision === 'allow') { changed = true; await f.store.update(state => { state.privacyIdea.version = 'idea-v2'; state.projects[f.store.projectKey(f.bench.project.root)].privacy.version = 'project-v2'; }); }
  };
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_STALE' });
  assert.equal(f.received.length, 0);
});

test('every transient retry rechecks policy and stops before a second request when rules change', async t => {
  const f = await fixture(t);
  f.reply(async (_request, response) => {
    await f.writeConfig('organization-policy.json', { enabled: true, version: 'local-only-v2', workMode: 'local', allowedDestinationIds: [f.connection.id] });
    response.writeHead(503); response.end('temporary');
  });
  let attempts = 0;
  await assert.rejects(forwardModel({
    url: f.connection.baseURL + '/chat/completions', headers: { 'content-type': 'application/json' }, payload: packet('Public task.'), signal: new AbortController().signal,
    res: { writeHead: () => assert.fail('No stream may be delivered'), write: () => assert.fail('No stream may be delivered'), end: () => {} }, progress: { write: () => {}, end: () => {} },
    retryDelays: [1, 1], idleLimit: 1000, totalLimit: 3000,
    dispatch: (request, transport) => { attempts++; return f.dispatch({ ...request }, transport); },
  }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(attempts, 2);
  assert.equal(f.received.length, 1);
});

test('a loopback proxy is external until a trusted registry documents device processing', async t => {
  const f = await fixture(t);
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.workMode = 'local'; });
  assert.equal((await f.service.destination({ connectionID: f.connection.id, modelID: f.model.id })).locality, 'cloud');
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_LOCAL_REQUIRED' });
  await f.writeConfig('destinations.json', { [f.connection.id]: { endpoint: f.connection.baseURL, locality: 'organization', revision: 'org-v1' } });
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(f.received.length, 0);
  await f.writeConfig('destinations.json', { [f.connection.id]: { endpoint: f.connection.baseURL, locality: 'device', revision: 'device-v1' } });
  await (await f.dispatch({ body: packet('Private alice@example.invalid'), provenance: [{ classification: 'strict' }] })).text();
  assert.equal(f.received.length, 1);
  assert.match(f.received[0].body, /alice@example.invalid/);
});

test('unsupported media, local-choice and Stop cause zero external dispatches', async t => {
  const f = await fixture(t);
  await assert.rejects(f.dispatch({ body: JSON.stringify({ messages: [{ content: [{ type: 'input_image', image_url: 'data:image/png;base64,U1lOVEhFVElD' }] }] }) }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  for (const decision of ['local', 'abort']) {
    const controller = new AbortController(), reviewReady = f.nextReview();
    const sending = f.dispatch({ body: packet('Contact alice@example.invalid'), signal: controller.signal });
    const rejected = assert.rejects(sending, { code: decision === 'local' ? 'PRIVACY_LOCAL_REQUIRED' : 'PRIVACY_ABORTED' });
    const review = await reviewReady;
    if (decision === 'abort') controller.abort(); else f.service.decide({ id: review.id, decision });
    await rejected;
    assert.equal(f.service.pending.size, 0);
    assert.throws(() => f.service.decide({ id: review.id, decision: 'approve' }), /ikke længere/);
  }
  assert.equal(f.received.length, 0);
});

test('model address, malformed private config and async caller guards fail closed', async t => {
  const f = await fixture(t);
  await assert.rejects(f.dispatch({ url: f.connection.baseURL + '/unapproved' }), { code: 'PRIVACY_DESTINATION_INVALID' });
  await assert.rejects(f.dispatch({ assertCurrent: async () => true }), { code: 'PRIVACY_STALE' });
  await fs.mkdir(path.join(f.root, 'privacy'), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(f.root, 'privacy/organization-policy.json'), 'not JSON');
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal(f.received.length, 0);
});

test('historical source labels survive disable, source removal and restart, without tainting other chats or ideas', async t => {
  const f = await fixture(t);
  const sensitive = { path: 'private/synthetic-case.csv', classification: 'strict', attributes: { personalData: true } };
  await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.protectedSources = [sensitive]; });
  await assert.rejects(f.dispatch({ body: packet('A generic summary of the local work.') }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  const stored = await f.store.read(), keys = Object.keys(stored.privacyHistoryFloors);
  assert.equal(keys.length, 1);
  const file = path.join(f.service.directory, 'history-floors', keys[0] + '.enc');
  assert.doesNotMatch((await fs.readFile(file)).toString('utf8'), /synthetic-case|strict|conversation-1/);
  await f.service.configure({ scope: 'project', settings: { enabled: false, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: false, protectedSources: [] } });
  const restored = new PrivacyService(f.bench);
  await assert.rejects(restored.dispatch(f.outgoing({ body: packet('A generic summary.') })), { code: 'PRIVACY_LOCAL_REQUIRED' });
  const otherScope = { kind: 'conversation', root: f.bench.project.root, chat: 'unrelated-chat' };
  await (await restored.dispatch(f.outgoing({ scope: otherScope }))).text();
  await (await restored.dispatch(f.outgoing({ scope: { kind: 'idea', root: null, chat: null }, contextPartition: 'idea' }))).text();
  assert.equal(f.received.length, 2);
  assert.equal(compose(await restored.policies({ kind: 'project', root: f.bench.project.root, chat: null })).protectedSources.some(source => source.classification === 'strict'), true);
  function compose(layers) { return require('../core/privacy/index.cjs').composePolicy(layers); }
});

test('a local model summary retains detected personal-data protection when the destination later becomes external', async t => {
  const f = await fixture(t);
  await f.writeConfig('destinations.json', { [f.connection.id]: { endpoint: f.connection.baseURL, locality: 'device', revision: 'local-v1' } });
  await (await f.dispatch({ body: packet('Private source: synthetic-person@example.invalid') })).text();
  assert.equal(f.received.length, 1);
  await f.writeConfig('destinations.json', {});
  await assert.rejects(f.dispatch({ body: packet('A generic summary of the prior source.') }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(f.received.length, 1);
});

test('missing or corrupted encrypted historical labels fail closed after policy disable', async t => {
  for (const damage of ['missing', 'corrupt', 'index']) await t.test(damage, async t => {
    const f = await fixture(t);
    await f.service.ensureDataFloor(f.scope, [{ classification: 'strict' }]);
    const state = await f.store.read(), key = Object.keys(state.privacyHistoryFloors)[0];
    await f.store.update(state => { state.projects[f.store.projectKey(f.bench.project.root)].privacy.enabled = false; });
    const file = path.join(f.service.directory, 'history-floors', key + '.enc');
    if (damage === 'missing') await fs.unlink(file);
    else if (damage === 'corrupt') await fs.writeFile(file, 'corrupt');
    else await f.store.update(state => { delete state.privacyHistoryFloors; });
    await assert.rejects(f.dispatch(), { code: 'PRIVACY_CONTROL_FAILED' });
    assert.equal(f.received.length, 0);
  });
});

test('historical floors are monotonic, idempotent and encrypted before a protected call', async t => {
  const f = await fixture(t);
  assert.equal(await f.service.ensureDataFloor(f.scope, [{ classification: 'strict' }]), true);
  const first = f.service.snapshotBinding(f.scope, f.connection.id);
  assert.equal(await f.service.ensureDataFloor(f.scope, [{ classification: 'public' }]), false);
  assert.equal(f.service.snapshotBinding(f.scope, f.connection.id), first);
  const separate = { kind: 'conversation', root: f.bench.project.root, chat: 'new-chat' };
  f.store.safeStorage.isEncryptionAvailable = () => false;
  await assert.rejects(f.service.ensureDataFloor(separate, [{ classification: 'internal' }]), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal(f.received.length, 0);
});

test('multiple workbenches share one audit queue and retain every concurrent record', async t => {
  const f = await fixture(t), other = new PrivacyService({ ...f.bench, project: { root: path.join(f.root, 'other-project') } });
  const tasks = Array.from({ length: 40 }, (_, index) => (index % 2 ? other : f.service).audit({ action: 'model-call', decision: 'allow', destinationId: 'synthetic-' + index, locality: 'cloud', classification: 'public', attributes: {}, policyVersions: [] }));
  await Promise.all(tasks);
  const lines = (await fs.readFile(path.join(f.service.directory, 'audit.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 40); assert.equal(new Set(lines.map(item => item.destinationId)).size, 40);
});

test('private parent symlinks and shared permissions block rules, floors and audit writes', async t => {
  for (const attack of ['symlink', 'shared']) await t.test(attack, async t => {
    const f = await fixture(t), outside = path.join(f.root, 'untrusted');
    await fs.mkdir(outside, { mode: 0o700 });
    if (attack === 'symlink') await fs.symlink(outside, f.service.directory);
    else { await fs.mkdir(f.service.directory, { mode: 0o700 }); await fs.chmod(f.service.directory, 0o755); }
    await assert.rejects(f.dispatch(), /Privacy Gate/);
    await assert.rejects(f.service.audit({ decision: 'allow' }), { code: 'PRIVACY_CONTROL_FAILED' });
    assert.deepEqual(await fs.readdir(outside), []); assert.equal(f.received.length, 0);
  });
});

test('configuration waits for existing preview processes to stop before changing policy', async t => {
  const f = await fixture(t); let stopped = false;
  f.bench.privacyRuntimeProvider = { beforeConfigure: async scope => {
    assert.equal(scope.kind, 'project');
    assert.equal((await f.store.project(f.bench.project.root)).privacy.workMode, 'cloud-controlled');
    await new Promise(resolve => setTimeout(resolve, 5)); stopped = true;
  } };
  await f.service.configure({ scope: 'project', settings: { enabled: true, workMode: 'local', defaultClass: 'public', requireApproval: false, protectedSources: [] } });
  assert.equal(stopped, true);
  assert.equal((await f.store.project(f.bench.project.root)).privacy.workMode, 'local');
});

test('a floor in another conversation does not invalidate an unrelated conversation binding', async t => {
  const f = await fixture(t), binding = f.service.snapshotBinding(f.scope, f.connection.id);
  await f.service.ensureDataFloor({ ...f.scope, chat: 'independent-chat' }, [{ classification: 'strict' }]);
  assert.equal(f.service.snapshotBinding(f.scope, f.connection.id), binding);
  await (await f.dispatch()).text();
  assert.equal(f.received.length, 1);
});

test('a policy change during encryption cannot authorize a protected request under a fresh unreviewed baseline', async t => {
  const f = await fixture(t), encrypt = f.store.encrypt.bind(f.store);
  f.store.encrypt = value => {
    const fsSync = require('node:fs'), filename = path.join(f.root, 'settings.json');
    const state = JSON.parse(fsSync.readFileSync(filename, 'utf8'));
    state.projects[f.store.projectKey(f.bench.project.root)].privacy.version = 'changed-while-encrypting';
    fsSync.writeFileSync(filename, JSON.stringify(state));
    return encrypt(value);
  };
  await assert.rejects(f.dispatch(), { code: 'PRIVACY_STALE' });
  assert.equal(f.received.length, 0);
});
