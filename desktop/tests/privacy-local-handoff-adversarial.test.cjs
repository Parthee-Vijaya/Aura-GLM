// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { EventEmitter, once } = require('node:events');
const { createHash, randomBytes, createCipheriv, createDecipheriv } = require('node:crypto');
const { PrivacyGate, PrivacyGateError, isLocalChoiceRequest, takeLocalChoice } = require('../core/privacy/index.cjs');
const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { IdeaRefinement } = require('../core/idea-refinement.cjs');
const hash = value => createHash('sha256').update(value).digest('hex');

const scope = Object.freeze({ kind: 'conversation', root: '/synthetic/project', chat: 'first-chat' });
const body = JSON.stringify({ model: 'selected', messages: [{ role: 'user', content: 'Build a public event listing.' }] });
function fixture(overrides = {}) {
  const state = { now: 1000, current: true, sent: 0, review: null, audit: [],
    policy: { project: { enabled: true, version: 'one', workMode: 'cloud-controlled', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['cloud', 'local'], requireApproval: true } },
    destination: { id: 'cloud', locality: 'cloud', endpoint: 'https://example.invalid/v1', model: 'selected', account: 'synthetic-account', route: '', revision: 'one' } };
  const gate = new PrivacyGate({ getPolicy: () => structuredClone(state.policy), resolveDestination: () => structuredClone(state.destination), now: () => state.now,
    requestApproval: async review => { state.review = review; await overrides.duringReview?.(state); return 'local'; },
    audit: async entry => { state.audit.push(entry); await overrides.duringAudit?.(state); } });
  const run = async (input = {}) => {
    try { await gate.executeAction({ scope, destinationRef: { connectionID: 'cloud', modelID: 'selected' }, purpose: 'project-conversation', contextPartition: 'first-partition', revision: 'task-one', body,
      assertCurrent: () => state.current, transport: () => { state.sent++; }, ...input }); }
    catch (error) { return error; }
    throw Error('A local choice must not dispatch the cloud request.');
  };
  return { state, gate, run };
}

test('local processing requires an actual dialog decision, never an error code or copied exception', async () => {
  const f = fixture(), error = await f.run();
  assert.equal(isLocalChoiceRequest(error), true); assert.equal(f.state.sent, 0);
  for (const forged of [new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Local please'), { ...error }, { code: 'PRIVACY_LOCAL_REQUIRED' }, null]) {
    assert.equal(isLocalChoiceRequest(forged), false);
    assert.throws(() => takeLocalChoice(forged, { scope }), { code: 'PRIVACY_STALE' });
  }
});

test('local choice is immutable, one use and bound to conversation, purpose, revision and history partition', async () => {
  for (const mismatch of [{ scope: { ...scope, chat: 'other-chat' } }, { purpose: 'other-purpose' }, { revision: 'task-two' }, { contextPartition: 'other-partition' }, { requestHash: hash(body + ' ') }]) {
    const f = fixture(), error = await f.run();
    assert.throws(() => takeLocalChoice(error, mismatch), { code: 'PRIVACY_STALE' });
    assert.equal(f.state.sent, 0);
  }
  const f = fixture(), error = await f.run(), receipt = takeLocalChoice(error, { scope, purpose: 'project-conversation', revision: 'task-one', contextPartition: 'first-partition' });
  assert.ok(Object.isFrozen(receipt)); assert.ok(Object.isFrozen(receipt.scope)); assert.ok(Object.isFrozen(receipt.destination));
  assert.equal(receipt.destination.model, 'selected');
  assert.equal(receipt.requestHash, hash(body));
  assert.throws(() => { receipt.scope.chat = 'other-chat'; }, TypeError);
  assert.throws(() => takeLocalChoice(error, { scope }), { code: 'PRIVACY_STALE' });
});

test('local choice cannot be minted after policy, recipient, task, deadline or signal changes during review', async () => {
  const variants = [
    state => { state.policy.project.maxClass = 'public'; }, // No version bump.
    state => { state.destination.account = 'another-account'; },
    state => { state.destination.endpoint = 'https://different.invalid/v1'; },
    state => { state.current = false; },
    state => { state.now = state.review.expiresAt; },
  ];
  for (const duringReview of variants) {
    const f = fixture({ duringReview }), error = await f.run();
    assert.equal(error.code, 'PRIVACY_STALE'); assert.equal(isLocalChoiceRequest(error), false); assert.equal(f.state.sent, 0);
  }
  const abort = new AbortController(), f = fixture({ duringReview: () => abort.abort() }), error = await f.run({ signal: abort.signal });
  assert.equal(error.code, 'PRIVACY_ABORTED'); assert.equal(isLocalChoiceRequest(error), false); assert.equal(f.state.sent, 0);
});

test('an expired local choice cannot be consumed after audit or scheduler delay', async () => {
  const f = fixture(), error = await f.run(); f.state.now = f.state.review.expiresAt;
  assert.throws(() => takeLocalChoice(error, { scope }), { code: 'PRIVACY_STALE' }); assert.equal(f.state.sent, 0);
});

test('an asynchronous final task guard cannot authorize a typed local handoff', async () => {
  const f = fixture(), error = await f.run({ assertCurrent: async () => true });
  assert.equal(error.code, 'PRIVACY_CONTROL_FAILED'); assert.equal(isLocalChoiceRequest(error), false); assert.equal(f.state.sent, 0);
});

test('automatic strict-data rejection does not pretend the user chose a local model', async () => {
  const f = fixture(), error = await f.run({ provenance: [{ classification: 'strict' }] });
  assert.equal(error.code, 'PRIVACY_LOCAL_REQUIRED'); assert.equal(isLocalChoiceRequest(error), false);
  assert.equal(f.state.review, null); assert.equal(f.state.sent, 0);
});

async function serviceFixture(t) {
  const directory = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-local-handoff-'));
  const received = [], events = new EventEmitter(); let responseHook, proposal = 'LOCAL_ONLY_HISTORY';
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    received.push({ url: request.url, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
    if (responseHook) await responseHook(request);
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ description: request.url.startsWith('/cloud/') ? 'CLOUD_ONLY_HISTORY' : proposal, plan: 'A proposed plan.', questions: [] }) } }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  const key = randomBytes(32), crypto = {
    isEncryptionAvailable: () => true,
    encryptString: text => { const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv); return Buffer.concat([iv, cipher.update(text), cipher.final(), cipher.getAuthTag()]); },
    decryptString: bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); decipher.setAuthTag(bytes.subarray(-16)); return Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString('utf8'); },
  };
  const store = new Store(directory, crypto), endpoint = `http://127.0.0.1:${server.address().port}`;
  const cloud = { id: 'cloud', kind: 'compatible', name: 'Synthetic cloud', baseURL: endpoint + '/cloud/v1' };
  const local = { id: 'local', kind: 'compatible', name: 'Synthetic device', baseURL: endpoint + '/local/v1' };
  const model = { id: 'synthetic', name: 'Synthetic model' };
  const rules = { enabled: true, version: 'one', workMode: 'cloud-controlled', defaultClass: 'public', maxClass: 'internal', requireApproval: true, allowedDestinationIds: ['cloud', 'local'], hybridPair: { local: { connectionID: 'local', modelID: model.id }, external: { connectionID: 'cloud', modelID: model.id } } };
  await store.update(state => { state.connections = [cloud, local]; state.privacyIdea = structuredClone(rules); });
  const writeRegistry = async (locality = 'device') => { await fs.mkdir(path.join(directory, 'privacy'), { mode: 0o700 }); await fs.writeFile(path.join(directory, 'privacy/destinations.json'), JSON.stringify({ local: { endpoint: local.baseURL, locality, revision: 'one' } }), { mode: 0o600 }); };
  await writeRegistry();
  const library = await require('../core/library.cjs').loadLibrary(path.resolve(__dirname, '../../profiles'));
  const bench = { store, project: null, chat: null, chats: new Map(), catalogs: new Map([['cloud', [model]], ['local', [model]]]), routeCatalogs: new Map(),
    connection: async id => structuredClone((await store.read()).connections.find(value => value.id === id)),
    models: async id => bench.catalogs.get(id), routes: async () => [], skills: { context: async () => ({ features: { design: true }, skills: library.skills }) }, emit: event => events.emit(event.type, event) };
  const service = bench.privacy = new PrivacyService(bench), idea = new IdeaRefinement({ getWorkbench: () => bench });
  t.after(() => { idea.stop(); service.cancelScope(); });
  const ideaScope = service.scope({ scope: 'idea' });
  const nextReview = () => once(events, 'privacy.review', { signal: AbortSignal.timeout(2000) }).then(([value]) => value);
  const outgoing = { scope: ideaScope, connection: cloud, model, url: cloud.baseURL + '/chat/completions', headers: {}, body, purpose: 'idea-refinement', revision: 'one', contextPartition: 'idea-cloud', assertCurrent: () => true };
  const choice = async () => { const ready = nextReview(), pending = service.dispatch(outgoing).catch(error => error), review = await ready; service.decide({ id: review.id, decision: 'local' }); const error = await pending; assert.equal(isLocalChoiceRequest(error), true); return error; };
  const sendIdea = async (input, decision) => { const prepared = await idea.prepare(input); const ready = decision ? nextReview() : null, pending = idea.send({ token: prepared.token }); if (ready) { const review = await ready; service.decide({ id: review.id, decision }); } return pending; };
  return { directory, received, events, store, bench, service, idea, ideaScope, outgoing, choice, nextReview, sendIdea, cloud, local, model, rules, response: fn => { responseHook = fn; }, proposal: value => { proposal = value; } };
}

test('service local handoff requires an allowed documented device and a current catalog, never a loopback guess', async t => {
  for (const variant of ['missing-pair', 'cloud-locality', 'organization-locality', 'not-allowed', 'missing-model']) await t.test(variant, async t => {
    const f = await serviceFixture(t);
    if (variant === 'missing-pair') await f.store.update(state => { delete state.privacyIdea.hybridPair; });
    if (variant.endsWith('-locality')) await fs.writeFile(path.join(f.directory, 'privacy/destinations.json'), JSON.stringify({ local: { endpoint: f.local.baseURL, locality: variant.split('-')[0], revision: 'one' } }));
    if (variant === 'not-allowed') await f.store.update(state => { state.privacyIdea.allowedDestinationIds = ['cloud']; });
    if (variant === 'missing-model') f.bench.catalogs.set('local', []);
    const cause = await f.choice();
    await assert.rejects(f.service.resolveLocalChoice(cause, { scope: f.ideaScope }), { code: 'PRIVACY_LOCAL_REQUIRED' });
    assert.equal(f.received.length, 0);
  });
});

test('service local handoff rejects changed policy, accounts, catalog and task after the exact decision', async t => {
  for (const variant of ['policy', 'cloud-account', 'local-account', 'catalog', 'async-guard', 'stopped']) await t.test(variant, async t => {
    const f = await serviceFixture(t), cause = await f.choice(), controller = new AbortController();
    let guard = () => true;
    if (variant === 'policy') await f.store.update(state => { state.privacyIdea.requireApproval = false; });
    if (variant === 'cloud-account') await f.store.update(state => { state.connections[0].secret = 'synthetic-replaced-credential'; });
    if (variant === 'async-guard') guard = async () => true;
    if (variant === 'stopped') controller.abort();
    if (['local-account', 'catalog'].includes(variant)) {
      const original = f.bench.connection;
      f.bench.connection = async id => { const value = await original(id); if (id === 'local') {
        if (variant === 'local-account') await f.store.update(state => { state.connections[1].secret = 'synthetic-replaced-credential'; });
        else queueMicrotask(() => f.bench.catalogs.set('local', [{ ...f.model, name: 'Changed model' }]));
      } return value; };
    }
    if (variant === 'catalog') {
      const local = await f.service.resolveLocalChoice(cause, { scope: f.ideaScope });
      f.bench.catalogs.set('local', [{ ...f.model, limits: { context: 8 } }]);
      assert.throws(() => local.isCurrent(), { code: 'PRIVACY_STALE' });
    } else await assert.rejects(f.service.resolveLocalChoice(cause, { scope: f.ideaScope, assertCurrent: guard, signal: controller.signal }), variant === 'stopped' ? { name: 'AbortError' } : { code: 'PRIVACY_STALE' });
    assert.equal(f.received.length, 0);
  });
});

test('actual idea handoff sends originals only to the device and never brings cloud history into its local lane', async t => {
  const f = await serviceFixture(t), input = { name: 'Public workshop', idea: 'Build a public event page.', connectionID: 'cloud', modelID: f.model.id };
  await f.sendIdea(input, 'approve');
  assert.equal(f.received.length, 1);
  const result = await f.sendIdea({ ...input, message: 'Add keyboard navigation.' }, 'local');
  assert.equal(result.processing.locality, 'device'); assert.equal(result.selection.connectionID, 'local');
  assert.equal(f.received.filter(value => value.url.startsWith('/cloud/')).length, 1);
  assert.equal(f.received.length, 2); assert.doesNotMatch(JSON.stringify(f.received[1].body), /CLOUD_ONLY_HISTORY/);
  assert.match(JSON.stringify(f.received[1].body), /keyboard navigation/);
  const third = await f.sendIdea({ ...input, message: 'Add a visible focus indicator.' }, 'local');
  assert.equal(third.selection.connectionID, 'local');
  assert.match(JSON.stringify(f.received[2].body), /LOCAL_ONLY_HISTORY/); assert.doesNotMatch(JSON.stringify(f.received[2].body), /CLOUD_ONLY_HISTORY/);
  const preparedCloud = await f.idea.prepare({ ...input, message: 'Cloud again.' });
  assert.match(JSON.stringify(preparedCloud.content), /CLOUD_ONLY_HISTORY/); assert.doesNotMatch(JSON.stringify(preparedCloud.content), /LOCAL_ONLY_HISTORY/);
  await f.store.update(state => { state.connections[0].secret = 'another-synthetic-account'; });
  const differentAccount = await f.idea.prepare({ ...input, message: 'Fresh account.' });
  assert.doesNotMatch(JSON.stringify(differentAccount.content), /CLOUD_ONLY_HISTORY|LOCAL_ONLY_HISTORY/);
});

test('device-only original values retain protection after a successful local idea proposal', async t => {
  const f = await serviceFixture(t), input = { name: 'Private workshop', idea: 'Contact alice@example.invalid about the event.', connectionID: 'cloud', modelID: f.model.id };
  const result = await f.sendIdea(input, 'local');
  assert.equal(result.processing.locality, 'device'); assert.equal(f.received.length, 1);
  assert.match(JSON.stringify(f.received[0].body), /alice@example.invalid/);
  const layers = await f.service.policies(f.ideaScope);
  assert.equal(layers.project.protectedSources.some(source => source.attributes?.personalData === true), true);
  // A harmless-looking summary does not erase the original local history label.
  await assert.rejects(f.service.dispatch({ ...f.outgoing, body: JSON.stringify({ messages: [{ role: 'user', content: 'Just summarize the event.' }] }) }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(f.received.length, 1);
});
