// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { ExternalActions, ACTIONS, MAX_ARTIFACT_BYTES } = require('../core/privacy/external-actions.cjs');
const { PrivacyGateError } = require('../core/privacy/index.cjs');

const clone = value => JSON.parse(JSON.stringify(value));
const hasCode = code => error => error instanceof PrivacyGateError && error.code === code;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function fixture(options = {}) {
  const state = {
    context: { scope: { project: 'fixture-project', chat: 'fixture-chat' }, contextPartition: 'fixture-cloud', epoch: 'epoch-1', revision: 1 },
    policy: { project: { enabled: true, version: 'policy-1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['fixture-destination'] } },
    destination: { id: 'fixture-destination', locality: 'cloud', endpoint: 'https://receiver.invalid/artifact', account: 'fixture-account', revision: 'destination-1' },
    bytes: Buffer.from('{ "text": "Public event" }'), metadata: { filename: 'public.json' }, reviews: [], audit: [], sent: [], preparations: 0, inspections: 0,
  };
  const adapter = {
    id: 'fixture-json-v1', maxBytes: 100_000,
    prepare: async (ref, context) => { state.preparations++; assert.equal(ref, 'artifact-1'); assert.ok(Object.isFrozen(context)); if (options.prepare) return options.prepare(state, context); return { body: state.bytes, contentType: 'application/json', metadata: state.metadata }; },
    inspect: async body => { state.inspections++; if (options.inspect) return options.inspect(body, state); return { material: JSON.parse(Buffer.from(body.data, 'base64').toString('utf8')) }; },
    dispatch: (packet, controls) => { if (options.dispatch) return options.dispatch(packet, controls, state); state.sent.push(packet); return { ok: true }; },
  };
  const service = new ExternalActions({
    getContext: () => options.getContext ? options.getContext(state) : clone(state.context),
    getPolicy: async () => options.getPolicy ? options.getPolicy(state) : clone(state.policy),
    resolveDestination: async ref => { assert.equal(ref, 'destination-1'); return options.resolveDestination ? options.resolveDestination(state) : clone(state.destination); },
    adapters: options.adapters || Object.fromEntries(ACTIONS.map(action => [action, adapter])),
    requestApproval: async review => { state.reviews.push(review); return options.approve ? options.approve(review, state) : 'approve'; },
    audit: async record => { state.audit.push(record); if (options.audit) await options.audit(record, state); },
  });
  const execute = input => service.execute({ action: 'upload', destinationRef: 'destination-1', artifactRef: 'artifact-1', ...input });
  return { state, service, adapter, execute };
}

test('all registered typed actions dispatch only frozen bytes with fixed destination/context and complete manifest', async t => {
  for (const action of ACTIONS) await t.test(action, async () => {
    const f = fixture(); f.state.policy.project.requireApproval = true;
    assert.deepEqual(await f.execute({ action }), { ok: true });
    const packet = f.state.sent[0], manifest = JSON.parse(f.state.reviews[0].payload);
    assert.equal(packet.action, action); assert.equal(packet.purpose, `external-action:${action}`);
    assert.equal(packet.destination.endpoint, f.state.destination.endpoint); assert.equal(packet.destination.model, `external:${action}`);
    assert.deepEqual(Buffer.from(packet.body.data, 'base64'), f.state.bytes);
    assert.equal(packet.body.sha256, createHash('sha256').update(f.state.bytes).digest('hex'));
    assert.equal(manifest.artifact.sha256, packet.body.sha256); assert.equal(manifest.artifact.byteLength, f.state.bytes.length);
    assert.equal(manifest.artifact.decoder, 'fixture-json-v1'); assert.deepEqual(manifest.material, { text: 'Public event' });
    assert.equal(manifest.context.epoch, 'epoch-1'); assert.equal(manifest.context.revision, 1);
    assert.ok(Object.isFrozen(packet)); assert.ok(Object.isFrozen(packet.body)); assert.ok(Object.isFrozen(packet.material)); assert.ok(Object.isFrozen(packet.metadata)); assert.ok(Object.isFrozen(packet.destination));
    assert.equal(packet.artifactRef, undefined); assert.equal(packet.destinationRef, undefined); assert.equal(packet.scope, undefined);
  });
});

test('actual controlled HTTP receiver gets exact snapshotted bytes once; receiver is live independently', async t => {
  const received = [];
  const server = http.createServer(async (req, res) => { const chunks = []; for await (const c of req) chunks.push(c); received.push(Buffer.concat(chunks)); res.end('ok'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}/artifact`;
  await fetch(endpoint, { method: 'POST', body: 'SYNTHETIC_RECEIVER_CONTROL' });
  const f = fixture({ dispatch: (packet, controls) => { controls.assertCurrent(); return fetch(packet.destination.endpoint, { method: 'POST', body: Buffer.from(packet.body.data, 'base64'), headers: { 'content-type': packet.body.contentType }, redirect: 'error', signal: controls.signal }); } });
  f.state.destination.endpoint = endpoint;
  assert.equal((await f.execute()).status, 200);
  assert.equal(received.length, 2); assert.deepEqual(received[1], f.state.bytes);
  f.state.bytes = Buffer.from(JSON.stringify({ text: 'Synthetic mail: ' + 'person@example.invalid' }));
  await assert.rejects(f.execute(), hasCode('PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED'));
  assert.equal(received.length, 2, 'masked manifest must never cause original body upload');
});

test('public input accepts only opaque references; transport, policy, scope and coverage flags are rejected', async t => {
  for (const extra of [{ transport: () => {} }, { dispatch: () => {} }, { approved: true }, { allow: true }, { coverage: true }, { scope: {} }, { epoch: 1 }, { purpose: 'different' }, { body: 'other bytes' }, { material: {} }, { destination: { locality: 'device' } }]) await t.test(Object.keys(extra)[0], async () => {
    const f = fixture(); await assert.rejects(f.execute(extra), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.preparations, 0); assert.equal(f.state.sent.length, 0);
  });
  for (const ref of ['https://receiver.invalid', '/private/tmp/source.json', '', '../source', null, {}]) {
    const f = fixture(); await assert.rejects(f.execute({ artifactRef: ref }), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0);
  }
});

test('missing adapter/decoder fails closed; renderer cannot register or replace one', async () => {
  const f = fixture({ adapters: {} }); await assert.rejects(f.execute(), hasCode('PRIVACY_EXTERNAL_ADAPTER_REQUIRED'));
  assert.equal(f.state.preparations, 0); assert.equal(f.state.sent.length, 0);
  const g = fixture(); g.adapter.dispatch = () => { throw new Error('replacement adapter must not run'); };
  await g.execute(); assert.equal(g.state.sent.length, 1, 'constructor freezes a copy of the registered adapter');
  assert.throws(() => new ExternalActions({ getContext() {}, getPolicy() {}, resolveDestination() {}, adapters: { upload: { id: 'invalid', maxBytes: 100, prepare() {}, dispatch() {} } } }), TypeError);
});

test('snapshot copies mutable buffers and metadata before review and dispatch', async () => {
  const expected = Buffer.from('{ "text": "Public event" }');
  const f = fixture({ approve: (_review, state) => { state.bytes.fill(88); state.metadata.filename = 'changed.json'; return 'approve'; } });
  f.state.policy.project.requireApproval = true;
  await f.execute(); assert.deepEqual(Buffer.from(f.state.sent[0].body.data, 'base64'), expected); assert.equal(f.state.sent[0].metadata.filename, 'public.json');
});

test('decoder and dispatcher receive immutable snapshot/material rather than mutable source refs', async () => {
  const f = fixture({ inspect: body => { assert.throws(() => { body.data = 'changed'; }, TypeError); return { material: { text: 'Public event' } }; }, dispatch: (packet, _controls, state) => { assert.throws(() => { packet.body.data = 'changed'; }, TypeError); assert.throws(() => { packet.material.text = 'changed'; }, TypeError); assert.equal(packet.artifactRef, undefined); state.sent.push(packet); return 'ok'; } });
  assert.equal(await f.execute(), 'ok'); assert.equal(f.state.sent.length, 1);
});

test('artifact rewriting is rejected for Git packs and uploads before an inapplicable human approval', async t => {
  for (const action of ['git-push', 'upload']) await t.test(action, async () => {
    const f = fixture(); f.state.bytes = Buffer.from(JSON.stringify({ text: 'Synthetic contact ' + 'person@example.invalid' }));
    await assert.rejects(f.execute({ action }), hasCode('PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED'));
    assert.equal(f.state.reviews.length, 0); assert.equal(f.state.sent.length, 0);
  });
});

test('complete decoded material and artifact metadata are both inspected', async t => {
  for (const location of ['decoded-content', 'metadata']) await t.test(location, async () => {
    const f = fixture();
    if (location === 'decoded-content') f.state.bytes = Buffer.from(JSON.stringify({ history: [{ content: 'person@example.invalid' }] }));
    else f.state.metadata = { filename: 'person@example.invalid' };
    await assert.rejects(f.execute(), hasCode('PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED')); assert.equal(f.state.sent.length, 0);
  });
});

test('opaque artifacts, strict provenance and unsupported complete decoding stay local', async t => {
  const cases = [
    { inspect: () => ({ material: { type: 'document', data: 'opaque' } }) },
    { inspect: () => ({ material: { text: 'Public summary' }, provenance: [{ classification: 'strict' }] }) },
    { inspect: () => ({ material: { text: 'Public summary' }, provenance: [{ classification: 'public', uninspectable: true }] }) },
  ];
  for (const [index, options] of cases.entries()) await t.test(`opaque or inherited ${index}`, async () => { const f = fixture(options); await assert.rejects(f.execute(), hasCode('PRIVACY_LOCAL_REQUIRED')); assert.equal(f.state.sent.length, 0); });
  const f = fixture(); f.state.bytes = Buffer.from([0, 255, 1, 128]); await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0);
});

test('a decoder coverage boolean is not accepted as a material snapshot or permission', async () => {
  const f = fixture({ inspect: () => ({ complete: true, material: {} }) }); await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0);
  const g = fixture({ prepare: state => ({ body: state.bytes, contentType: 'application/json', complete: true }) }); await assert.rejects(g.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(g.state.inspections, 0);
});

test('local-only never uses organization/cloud fallback; disabled protection does not mint an external permit', async () => {
  const f = fixture(); f.state.policy.project.workMode = 'local';
  for (const locality of ['organization', 'cloud']) { f.state.destination.locality = locality; await assert.rejects(f.execute(), hasCode('PRIVACY_LOCAL_REQUIRED')); }
  assert.equal(f.state.sent.length, 0);
  f.state.policy = { project: { enabled: false } }; await assert.rejects(f.execute(), hasCode('PRIVACY_EXTERNAL_POLICY_REQUIRED')); assert.equal(f.state.sent.length, 0);
});

test('cancellation before preparation, during decode and during review sends no bytes', async t => {
  await t.test('before preparation', async () => { const f = fixture(), controller = new AbortController(); controller.abort(); await assert.rejects(f.execute({ signal: controller.signal }), hasCode('PRIVACY_ABORTED')); assert.equal(f.state.preparations, 0); });
  await t.test('during decode', async () => { const entered = deferred(), wait = deferred(), controller = new AbortController(); const f = fixture({ inspect: async () => { entered.resolve(); await wait.promise; return { material: {} }; } }); const task = f.execute({ signal: controller.signal }); await entered.promise; controller.abort(); await assert.rejects(task, hasCode('PRIVACY_ABORTED')); wait.resolve(); assert.equal(f.state.sent.length, 0); });
  await t.test('during review', async () => { const entered = deferred(), wait = deferred(), controller = new AbortController(); const f = fixture({ approve: async () => { entered.resolve(); return wait.promise; } }); f.state.policy.project.requireApproval = true; const task = f.execute({ signal: controller.signal }); await entered.promise; controller.abort(); await assert.rejects(task, hasCode('PRIVACY_ABORTED')); wait.resolve('approve'); assert.equal(f.state.sent.length, 0); });
});

test('dispatcher receives cancellation signal and completion abort never triggers retry', async () => {
  const entered = deferred(), controller = new AbortController(); let count = 0;
  const f = fixture({ dispatch: (_packet, controls) => { count++; assert.equal(controls.signal, controller.signal); entered.resolve(); return new Promise((_resolve, reject) => controls.signal.addEventListener('abort', () => reject(new Error('synthetic unknown transport outcome')), { once: true })); } });
  const task = f.execute({ signal: controller.signal }); await entered.promise; controller.abort(); await assert.rejects(task, hasCode('PRIVACY_ABORTED')); assert.equal(count, 1);
});

test('context is captured before first awaited resolver; changing it during prepare fails closed', async () => {
  const entered = deferred(), wait = deferred(); const f = fixture({ resolveDestination: async state => { entered.resolve(); await wait.promise; return clone(state.destination); } });
  const task = f.execute(); await entered.promise; f.state.context.epoch = 'epoch-2'; wait.resolve(); await assert.rejects(task, hasCode('PRIVACY_STALE')); assert.equal(f.state.preparations, 0);
  const g = fixture({ prepare: state => { state.context.revision++; return { body: state.bytes, contentType: 'application/json' }; } }); await assert.rejects(g.execute(), hasCode('PRIVACY_STALE')); assert.equal(g.state.inspections, 0);
});

test('scope/partition/epoch/revision changes during audit revoke exact action', async t => {
  for (const field of ['scope', 'contextPartition', 'epoch', 'revision']) await t.test(field, async () => {
    const f = fixture({ audit: (_record, state) => { if (field === 'scope') state.context.scope.chat = 'another-chat'; else state.context[field] = String(state.context[field]) + '-changed'; } });
    await assert.rejects(f.execute(), hasCode('PRIVACY_STALE')); assert.equal(f.state.sent.length, 0);
  });
});

test('policy and fixed destination change during approval cannot reuse reviewed manifest', async t => {
  for (const field of ['endpoint', 'account', 'revision', 'locality']) await t.test(field, async () => {
    const f = fixture({ approve: (_review, state) => { state.destination[field] = field === 'endpoint' ? 'https://other.invalid/upload' : field === 'locality' ? 'organization' : 'changed'; return 'approve'; } }); f.state.policy.project.requireApproval = true;
    await assert.rejects(f.execute(), hasCode('PRIVACY_STALE')); assert.equal(f.state.sent.length, 0);
  });
  const f = fixture({ approve: (_review, state) => { state.policy.project.version = 'policy-2'; return 'approve'; } }); f.state.policy.project.requireApproval = true; await assert.rejects(f.execute(), hasCode('PRIVACY_STALE')); assert.equal(f.state.sent.length, 0);
});

test('async or fabricated current-context objects are not a synchronous execution binding', async () => {
  const f = fixture({ getContext: state => Promise.resolve(clone(state.context)) }); await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.preparations, 0);
  const g = fixture({ getContext: state => ({ ...state.context, productionReady: true }) }); await assert.rejects(g.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(g.state.sent.length, 0);
});

test('bad artifacts, oversize data, getters and non-JSON decoder output fail closed', async t => {
  const cases = [
    { prepare: () => ({ body: Buffer.alloc(MAX_ARTIFACT_BYTES + 1), contentType: 'application/octet-stream' }) },
    { prepare: state => ({ body: state.bytes, contentType: 'text/plain; charset=utf-8' }) },
    { inspect: () => ({ material: { hidden: undefined } }) },
    { inspect: () => { const material = {}; Object.defineProperty(material, 'text', { enumerable: true, get() { throw new Error('getter should not run'); } }); return { material }; } },
  ];
  for (const [index, options] of cases.entries()) await t.test(`invalid artifact ${index}`, async () => { const f = fixture(options); await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0); });
});

test('raw artifacts/source refs/sensitive callback errors never enter audit or public error; no automatic retry', async () => {
  const canary = 'SYNTHETIC_PRIVATE_ERROR_NO_EXPORT'; let calls = 0;
  const f = fixture({ dispatch: () => { calls++; throw new Error('/private/fixture/source ' + canary); } });
  await assert.rejects(f.execute(), error => hasCode('PRIVACY_CONTROL_FAILED')(error) && !error.message.includes(canary) && !error.message.includes('/private/'));
  assert.equal(calls, 1); const audit = JSON.stringify(f.state.audit);
  assert.doesNotMatch(audit, /Public event|public\.json|artifact-1|destination-1|\/private\/|SYNTHETIC_PRIVATE_ERROR|body|payload|sha256/);
  assert.equal(f.state.audit.at(-1).action, 'upload'); assert.ok(f.state.audit.every(entry => !Object.hasOwn(entry, 'scope')));
});

test('sensitive wrapped PrivacyGateErrors and fabricated error codes are sanitized too', async t => {
  for (const code of ['PRIVACY_LOCAL_REQUIRED', 'SYNTHETIC_PRIVATE_ERROR_CODE']) await t.test(code, async () => {
    const f = fixture({ inspect: () => { throw new PrivacyGateError(code, '/private/fixture/SYNTHETIC_PRIVATE_ERROR', { raw: 'SYNTHETIC_PRIVATE_ERROR' }); } });
    await assert.rejects(f.execute(), error => error instanceof PrivacyGateError && !JSON.stringify(error).includes('SYNTHETIC_PRIVATE_ERROR') && !error.message.includes('/private/'));
    assert.equal(f.state.sent.length, 0);
  });
});

test('oversize decoded material and metadata are rejected before manifest construction', async () => {
  const f = fixture({ inspect: () => ({ material: { text: 'X'.repeat(MAX_ARTIFACT_BYTES + 1) } }) });
  await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0);
  const g = fixture(); g.state.metadata = { description: 'X'.repeat(MAX_ARTIFACT_BYTES + 1) };
  await assert.rejects(g.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(g.state.inspections, 0);
});

test('source-like destination ids are rejected and unsafe policy labels do not enter audit', async () => {
  const f = fixture(); f.state.destination.id = '/private/fixture/source';
  await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(f.state.sent.length, 0); assert.equal(f.state.audit.length, 0);
  const g = fixture(); g.state.policy.project.version = '/private/fixture/policy-label';
  await g.execute(); assert.doesNotMatch(JSON.stringify(g.state.audit), /\/private\/|policy-label/);
  assert.match(g.state.audit[0].policyVersions[0].version, /^binding-[a-f0-9]{64}$/);
});

test('new explicit execution after unknown outcome is re-prepared, re-decoded and re-reviewed', async () => {
  let calls = 0; const f = fixture({ dispatch: () => { calls++; throw new Error('unknown result'); } }); f.state.policy.project.requireApproval = true;
  await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(calls, 1);
  f.state.context.epoch = 'epoch-2'; f.state.policy.project.version = 'policy-2';
  await assert.rejects(f.execute(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(calls, 2); assert.equal(f.state.preparations, 2); assert.equal(f.state.inspections, 2); assert.equal(f.state.reviews.length, 2);
});
