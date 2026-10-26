// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const { CsvReleaseAuthority, claimCsvRelease } = require('../core/privacy/hybrid-csv-release.cjs');
const { HybridCoordinator } = require('../core/privacy/hybrid.cjs');
const { PrivacyGate, PrivacyGateError, composePolicy } = require('../core/privacy/index.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const sha = value => createHash('sha256').update(value).digest('hex');
const denied = error => error instanceof PrivacyGateError && ['PRIVACY_BLOCKED', 'PRIVACY_STALE', 'PRIVACY_LOCAL_REQUIRED'].includes(error.code);
const scope = { kind: 'conversation', root: '/synthetic/project', chat: 'synthetic-chat' };
function fixture() {
  const state = { now: 1000, source: { id: 'approved-source', revision: 'source-1', classification: 'confidential', attributes: { personalData: true, secrets: false },
    text: 'Original person,Private email,Duration,Enabled,Opened\r\n"Example Citizen",private.person@example.invalid,17,true,2026-10-21\r\n' },
    destination: { id: 'cloud', locality: 'cloud', endpoint: 'https://synthetic.invalid/v1', model: 'model-1', account: 'account-1', route: 'route-1', revision: 'destination-1' },
    policy: { organization: { enabled: true, version: 'org-1', workMode: 'hybrid', maxClass: 'internal', allowedDestinationIds: ['local', 'cloud'], hybridReleaseRules: [{
      id: 'generic-csv', version: 'release-1', transform: 'csv-generic-schema-v1', projectRoot: scope.root, sourceIds: ['approved-source'], destinationIds: ['cloud'], purposes: ['generic-csv-ui'],
      sourceClasses: ['internal', 'confidential'], allowPersonalData: true, maxColumns: 16, ttlMs: 300_000,
    }] } } };
  const getPolicy = () => copy(state.policy), resolveDestination = () => copy(state.destination);
  const authority = new CsvReleaseAuthority({ getPolicy, resolveDestination, resolveSource: () => copy(state.source), now: () => state.now,
    assertSourceCurrent: (_scope, _ref, binding) => binding.id === state.source.id && binding.revision === state.source.revision && binding.sha256 === sha(state.source.text)
      && binding.classification === state.source.classification && JSON.stringify(binding.attributes) === JSON.stringify(state.source.attributes) });
  const release = overrides => authority.release({ scope, sourceRef: 'opaque-source-ref', destinationRef: 'cloud', purpose: 'generic-csv-ui', revision: 'task-revision-1', ...overrides });
  const claim = (capability, overrides) => claimCsvRelease(capability, { scope, destination: state.destination, purpose: 'generic-csv-ui', revision: 'task-revision-1', policyBinding: composePolicy(state.policy).binding, runID: 'run-1', ...overrides });
  return { state, authority, release, claim, getPolicy, resolveDestination };
}

test('only a named organization rule can authorize release; project and conversation may restrict but never create it', async t => {
  for (const scenario of ['no-rule', 'forged-project', 'project-restriction', 'conversation-restriction']) await t.test(scenario, async () => {
    const f = fixture();
    if (scenario === 'no-rule') delete f.state.policy.organization.hybridReleaseRules;
    if (scenario === 'forged-project') { f.state.policy.project = { version: 'p1', hybridReleaseRules: copy(f.state.policy.organization.hybridReleaseRules) }; delete f.state.policy.organization.hybridReleaseRules; }
    if (scenario === 'project-restriction') f.state.policy.project = { version: 'p1', releaseRuleIds: [] };
    if (scenario === 'conversation-restriction') f.state.policy.conversation = { version: 'c1', releaseRuleIds: [] };
    await assert.rejects(f.release(), denied);
  });
});

test('released schema has generic columns and fixed synthetic rows, never original headers, values, row counts or filename', async () => {
  const f = fixture(), first = f.claim(await f.release()), result = JSON.parse(first.text);
  assert.deepEqual(Object.keys(result), ['format', 'columns', 'rows']); assert.equal(result.rows.length, 2);
  assert.deepEqual(result.columns.map(value => value.name), ['COLUMN_1', 'COLUMN_2', 'COLUMN_3', 'COLUMN_4', 'COLUMN_5']);
  assert.deepEqual(result.columns.map(value => value.type), ['text', 'text', 'number', 'boolean', 'date']);
  for (const original of ['Original person', 'Private email', 'Example Citizen', 'private.person', '2026-10-21']) assert.equal(first.text.includes(original), false);
  assert.deepEqual(Object.keys(first), ['text', 'provenance', 'requiresApproval', 'purpose', 'assertCurrent']);
  assert.equal(first.requiresApproval, true);
  f.state.source.text = 'Different header,Different email,Other duration,Other state,Other date\n' + Array(9).fill('Someone Else,another@example.invalid,999,false,1999-01-01').join('\n');
  assert.equal(f.claim(await f.release()).text, first.text, 'Changing headers, values, row counts and distributions does not alter the fixed examples.');
});

test('strict, secret, opaque and malformed CSV sources cannot be released even with an administrative rule', async t => {
  for (const scenario of ['strict', 'secret', 'secret-header', 'secret-value', 'opaque', 'encoded', 'malformed', 'too-many-columns', 'pii-not-authorized']) await t.test(scenario, async () => {
    const f = fixture();
    if (scenario === 'strict') f.state.source.classification = 'strict';
    if (scenario === 'secret') f.state.source.attributes.secrets = true;
    if (scenario === 'secret-header') f.state.source.text = 'password,value\nunusual-secret,12';
    if (scenario === 'secret-value') f.state.source.text = 'value\n' + ['Bearer', 'A'.repeat(24)].join(' ');
    if (scenario === 'opaque') f.state.source.uninspectable = true;
    if (scenario === 'encoded') f.state.source.text = 'image\ndata:image/png;base64,U1lOVEhFVElD';
    if (scenario === 'malformed') f.state.source.text = 'a,b\n"unclosed';
    if (scenario === 'too-many-columns') f.state.source.text = Array(17).fill('header').join(',');
    if (scenario === 'pii-not-authorized') f.state.policy.organization.hybridReleaseRules[0].allowPersonalData = false;
    await assert.rejects(f.release(), denied);
  });
});

test('capability cannot be forged, reused by another run, widened to a new purpose or moved to a new recipient or revision', async () => {
  const f = fixture(), cap = await f.release();
  assert.throws(() => f.claim({ id: cap.id }), denied);
  for (const change of [{ purpose: 'another-purpose' }, { revision: 'another-task' }, { destination: { ...f.state.destination, model: 'another' } }, { destination: { ...f.state.destination, account: 'another' } }, { destination: { ...f.state.destination, route: 'another' } }, { scope: { ...scope, chat: 'another' } }, { policyBinding: 'another' }]) assert.throws(() => f.claim(cap, change), denied);
  f.claim(cap); assert.throws(() => f.claim(cap, { runID: 'run-2' }), denied);
});

test('source changes, expired caps and asynchronous source guards invalidate pending material', async () => {
  const f = fixture(), cap = await f.release(); f.state.source.text += '\nChanged,Source,1,false,2000-01-01'; assert.throws(() => f.claim(cap), denied);
  const expired = fixture(), expiring = await expired.release(); expired.state.now += 300_000; assert.throws(() => expired.claim(expiring), denied);
  const asyncGuard = fixture(); asyncGuard.authority.assertSourceCurrent = async () => true; await assert.rejects(asyncGuard.release(), denied);
});

async function receiver(t) {
  const requests = [], server = http.createServer(async (request, response) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); requests.push(Buffer.concat(chunks).toString('utf8')); response.setHeader('content-type', 'application/json'); response.end('{}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { requests, endpoint: `http://127.0.0.1:${server.address().port}/v1` };
}
async function hybridFixture(t, { mutateLastSource = false } = {}) {
  const f = fixture(), external = await receiver(t); f.state.destination.endpoint = external.endpoint;
  const local = { id: 'local', locality: 'device', endpoint: 'http://127.0.0.1:1/v1', model: 'local-model', account: 'local-account', route: '', revision: 'local-1' };
  const resolveDestination = ref => copy(ref === 'local' ? local : f.state.destination), reviews = [], sentKinds = [];
  const gate = new PrivacyGate({ getPolicy: f.getPolicy, resolveDestination, requestApproval: async review => { reviews.push(review); assert.equal(external.requests.length, reviews.length - 1); return 'approve'; } });
  const cap = await f.release(); let coordinator;
  coordinator = new HybridCoordinator({ getPolicy: f.getPolicy, resolveDestination,
    getAuthoritySnapshot: () => sha(JSON.stringify([f.state.policy, f.state.destination, local])), gate,
    executeStage: async stage => {
      if (mutateLastSource && stage.kind === 'cloud') {
        const original = coordinator.resolveDestination; let reads = 0;
        coordinator.resolveDestination = ref => { const result = original(ref); if (ref === 'cloud' && ++reads === 2) f.state.source.revision = 'changed-during-final-guard'; return result; };
      }
      const body = '{ "model": ' + JSON.stringify(stage.destination.model) + ', "messages": ' + JSON.stringify(stage.history.map(({ role, content }) => ({ role, content }))) + ' }';
      const response = await stage.dispatch({ body, transport: approved => { sentKinds.push(stage.kind); return stage.kind === 'cloud' ? fetch(`${external.endpoint}/chat/completions`, { method: 'POST', body: approved, signal: stage.signal }) : { ok: true }; } });
      if (stage.kind === 'cloud') await response.text();
      return { text: 'Generic code result.', sessionID: stage.engineSessionID || `ses_${stage.partitionID}` };
    } });
  const run = () => coordinator.run({ scope, taskID: 'task-1', originalPrompt: 'Use a confidential local CSV to build a viewer.', sourceProvenance: [{ classification: 'confidential', attributes: { personalData: true } }],
    materials: [{ key: 'released-csv', release: cap }], localRef: 'local', externalRef: 'cloud', revision: 'task-revision-1', stages: [
      { id: 'intake', kind: 'local', purpose: 'local-intake', instruction: 'Inspect locally.', inputs: ['original'] },
      { id: 'design', kind: 'cloud', purpose: 'generic-csv-ui', instruction: 'Build generic CSV viewer code.', inputs: ['released-csv'] },
      { id: 'final', kind: 'local', purpose: 'local-final', instruction: 'Use the actual protected file locally.', inputs: ['original', 'intake', 'design'] },
    ] });
  return { ...f, external, reviews, sentKinds, run };
}

test('an authorized release still requires exact whole-body sharing approval before any actual cloud byte', async t => {
  const f = await hybridFixture(t); const result = await f.run();
  assert.equal(f.reviews.length, 1); assert.equal(f.external.requests.length, 1); assert.equal(f.external.requests[0], f.reviews[0].payload);
  assert.deepEqual(f.sentKinds, ['local', 'cloud', 'local']);
  assert.equal(f.external.requests[0].includes('private.person'), false); assert.equal(f.external.requests[0].includes('Original person'), false);
  assert.equal(result.provenance[0].classification, 'confidential'); assert.equal(result.provenance[0].attributes.personalData, true);
});

test('source revocation inside the final destination read cannot reuse a released-material approval', async t => {
  const f = await hybridFixture(t, { mutateLastSource: true });
  await assert.rejects(f.run(), denied); assert.equal(f.reviews.length, 1); assert.equal(f.external.requests.length, 0); assert.deepEqual(f.sentKinds, ['local']);
});
