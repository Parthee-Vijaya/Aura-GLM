// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { PrivacyGate, PrivacyGateError, composePolicy } = require('../core/privacy/index.cjs');
const { HybridCoordinator } = require('../core/privacy/hybrid.cjs');
const { HybridMaterialLedger } = require('../core/privacy/hybrid-materials.cjs');
const { HybridSessionPartitions } = require('../core/privacy/hybrid-partitions.cjs');

const copy = value => JSON.parse(JSON.stringify(value));
const CANARY = 'SYNTHETIC_PRIVATE_CASE_CANARY_42';
const policyLayers = changes => ({ organization: { enabled: true, version: 'org-1', workMode: 'hybrid', allowedDestinationIds: ['local', 'external'], maxClass: 'internal', protectedValues: [{ value: CANARY, kind: 'protected' }], ...changes } });
const hasCode = code => error => error instanceof PrivacyGateError && error.code === code;
const plan = () => [
  { id: 'intake', kind: 'local', purpose: 'local-intake', instruction: 'Inspect the original task locally.', inputs: ['original'] },
  { id: 'design', kind: 'cloud', purpose: 'public-code', instruction: 'Build a generic public dashboard.', inputs: ['public-brief'] },
  { id: 'validate', kind: 'local', purpose: 'local-test', instruction: 'Validate code against protected local inputs.', inputs: ['original', 'intake', 'design'] },
  { id: 'improve', kind: 'cloud', purpose: 'public-code-revision', instruction: 'Improve the generic public code.', inputs: ['design'] },
  { id: 'final', kind: 'local', purpose: 'local-assembly', instruction: 'Assemble the final result locally.', inputs: ['original', 'validate', 'improve'] },
];
async function receiver(t) {
  const received = [];
  const server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString('utf8'); received.push({ raw, path: request.url });
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ text: 'Controlled synthetic model response.' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return { received, endpoint: `http://127.0.0.1:${server.address().port}` };
}
function fixture({ endpoints = {}, executeStage, approve, changes, assertCurrent, sessionStore, getRequestProvenance } = {}) {
  const state = { layers: policyLayers(changes), stages: [], reviews: [], audits: [], transports: [], current: true,
    destinations: {
      local: { id: 'local', locality: 'device', endpoint: endpoints.local || 'http://127.0.0.1:1', model: 'local-fixture', account: 'local-account', route: '', revision: 'local-1' },
      external: { id: 'external', locality: 'cloud', endpoint: endpoints.external || 'http://127.0.0.1:2', model: 'external-fixture', account: 'cloud-account', route: 'approved-route', revision: 'external-1' },
    } };
  const getPolicy = () => copy(state.layers), resolveDestination = ref => copy(state.destinations[ref]);
  const gate = new PrivacyGate({ getPolicy, resolveDestination, audit: async row => state.audits.push(row), requestApproval: async (review, options) => { state.reviews.push(review); return approve ? approve(review, options, state) : 'approve'; } });
  const execute = async descriptor => {
    state.stages.push(descriptor);
    if (executeStage) return executeStage(descriptor, state);
    const body = JSON.stringify({ model: descriptor.destination.model, messages: descriptor.history.map(({ role, content }) => ({ role, content })) });
    const response = await descriptor.dispatch({ body, transport: approved => { state.transports.push({ kind: descriptor.kind, body: approved }); return { ok: true }; } });
    assert.equal(response.ok, true);
    return { text: descriptor.kind === 'local' ? `Local ${descriptor.stageID} result.` : `Public ${descriptor.stageID} result.`, sessionID: descriptor.engineSessionID || `session-${descriptor.partitionID}` };
  };
  const getAuthoritySnapshot = () => createHash('sha256').update(JSON.stringify([state.layers, state.destinations])).digest('hex');
  const coordinator = new HybridCoordinator({ getPolicy, resolveDestination, getAuthoritySnapshot, getRequestProvenance, gate, executeStage: execute, sessionStore, audit: async row => state.audits.push(row) });
  const run = overrides => coordinator.run({ scope: { project: 'synthetic-project', conversation: 'synthetic-conversation' }, taskID: 'task-1', originalPrompt: `Use the protected local file for ${CANARY}.`,
    sourceProvenance: [{ classification: 'strict', attributes: { personalData: true, secrets: false } }], materials: [{ key: 'public-brief', text: 'Create a dashboard with a generic date and duration schema.', provenance: [{ classification: 'public' }] }],
    localRef: 'local', externalRef: 'external', revision: 1, stages: plan(), assertCurrent: assertCurrent || (() => state.current), ...overrides });
  return { state, coordinator, run, gate };
}

test('actual controlled wire: local-first intake, repeated separate stages and final local assembly never send private canary externally', async t => {
  const local = await receiver(t), external = await receiver(t);
  const f = fixture({ endpoints: { local: local.endpoint, external: external.endpoint }, executeStage: async (stage, state) => {
    const body = JSON.stringify({ model: stage.destination.model, messages: stage.history.map(({ role, content }) => ({ role, content })) });
    const response = await stage.dispatch({ body, transport: approved => fetch(`${stage.destination.endpoint}/model`, { method: 'POST', body: approved, signal: stage.signal }) });
    const result = await response.json();
    return { text: result.text, sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
  } });
  const result = await f.run();
  assert.equal(result.stages.length, 5); assert.equal(local.received.length, 3); assert.equal(external.received.length, 2);
  assert.match(local.received[0].raw, new RegExp(CANARY));
  for (const request of external.received) assert.equal(request.raw.includes(CANARY), false);
  assert.deepEqual(f.state.stages.map(stage => stage.kind), ['local', 'cloud', 'local', 'cloud', 'local']);
  assert.notEqual(result.localPartitionID, result.externalPartitionID);
  assert.equal(new Set(f.state.stages.filter(stage => stage.kind === 'local').map(stage => stage.sessionKey)).size, 1);
  assert.equal(new Set(f.state.stages.filter(stage => stage.kind === 'cloud').map(stage => stage.sessionKey)).size, 1);
  assert.equal(result.provenance[0].classification, 'strict'); assert.equal(result.provenance[0].attributes.personalData, true);
  assert.ok(f.state.stages[3].history.some(message => message.content === 'Controlled synthetic model response.'));
  assert.equal(f.state.stages[3].history.some(message => message.content.includes(CANARY)), false);
  assert.equal(JSON.stringify(f.state.audits).includes(CANARY), false);
});

test('a local model failure stops the run without invoking cloud, even when the error asks for fallback', async () => {
  const f = fixture({ executeStage: async () => { throw Error(`Fallback to external with ${CANARY}`); } });
  await assert.rejects(f.run(), hasCode('PRIVACY_CONTROL_FAILED'));
  assert.equal(f.state.stages.length, 1); assert.equal(f.state.transports.length, 0);
});

test('an organization server or unregistered cloud loopback cannot masquerade as local intake', async t => {
  for (const locality of ['organization', 'cloud']) await t.test(locality, async () => {
    const f = fixture(); f.state.destinations.local.locality = locality;
    await assert.rejects(f.run(), hasCode('PRIVACY_LOCAL_REQUIRED')); assert.equal(f.state.stages.length, 0);
  });
});

test('strict derived summaries and model declassification fields cannot be handed to the cloud', async () => {
  const f = fixture({ executeStage: async (stage, state) => {
    await stage.dispatch({ body: JSON.stringify({ messages: [{ content: 'Local call' }] }), transport: () => { state.transports.push(stage.kind); return {}; } });
    return { text: 'A harmless-looking summary.', classification: 'public', attributes: { personalData: false }, release: true, sessionID: `session-${stage.partitionID}` };
  } });
  const stages = plan(); stages[1].inputs = ['intake'];
  await assert.rejects(f.run({ stages }), hasCode('PRIVACY_LOCAL_REQUIRED'));
  assert.deepEqual(f.state.transports, ['local']); assert.equal(f.state.stages.length, 1);
});

test('derived PII and secrets stay sticky even if local output no longer contains the original values', async t => {
  for (const attributes of [{ personalData: true, secrets: false }, { personalData: false, secrets: true }]) await t.test(JSON.stringify(attributes), async () => {
    const f = fixture(); const stages = plan(); stages[1].inputs = ['intake'];
    await assert.rejects(f.run({ originalPrompt: 'Protected input without identifying text.', sourceProvenance: [{ classification: 'internal', attributes }], stages }), hasCode('PRIVACY_LOCAL_REQUIRED'));
    assert.equal(f.state.stages.length, 1);
  });
});

test('new protected tool results and trusted source provenance taint a local summary before any external handoff', async t => {
  for (const scenario of ['pii-tool-result', 'strict-provenance', 'opaque-tool-result']) await t.test(scenario, async () => {
    const f = fixture({ executeStage: async (stage, state) => {
      const body = JSON.stringify({ messages: [{ role: 'tool', content: scenario === 'pii-tool-result' ? 'synthetic.tool@example.invalid' : scenario === 'opaque-tool-result' ? 'data:image/png;base64,U1lOVEhFVElD' : 'Harmless-looking source structure.' }] });
      await stage.dispatch({ body, provenance: scenario === 'strict-provenance' ? [{ classification: 'strict' }] : [], transport: () => { state.transports.push(stage.kind); return {}; } });
      return { text: 'A short apparently harmless summary.', sessionID: `session-${stage.partitionID}` };
    } });
    const stages = plan(); stages[1].inputs = ['intake'];
    await assert.rejects(f.run({ stages, originalPrompt: 'Inspect the file.', sourceProvenance: [] }), hasCode('PRIVACY_LOCAL_REQUIRED'));
    assert.deepEqual(f.state.transports, ['local']);
  });
});

test('ordinary approval cannot release strict, opaque or organization-denied personal data', async t => {
  for (const source of [
    { classification: 'strict' }, { classification: 'internal', uninspectable: true }, { classification: 'internal', attributes: { personalData: true } },
  ]) await t.test(JSON.stringify(source), async () => {
    const f = fixture({ approve: () => 'approve' }), stages = plan(); stages[1].inputs = ['intake'];
    await assert.rejects(f.run({ stages, originalPrompt: 'Local source', sourceProvenance: [source] }), hasCode('PRIVACY_LOCAL_REQUIRED'));
    assert.equal(f.state.reviews.length, 0);
  });
});

test('explicit policy-authorized confidential handoff still requires exact complete-body sharing approval', async t => {
  const external = await receiver(t);
  const f = fixture({ changes: { maxClass: 'confidential', allowConfidentialRelease: true, allowPersonalData: true }, endpoints: { external: external.endpoint }, executeStage: async (stage, state) => {
    const body = '{ "model": ' + JSON.stringify(stage.destination.model) + ', "messages": ' + JSON.stringify(stage.history.map(({ role, content }) => ({ role, content }))) + ' }';
    const response = await stage.dispatch({ body, transport: approved => stage.kind === 'cloud' ? fetch(`${stage.destination.endpoint}/model`, { method: 'POST', body: approved }) : { ok: true } });
    return { text: 'An allowed derived result.', sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
  } });
  const stages = plan(); stages[1].inputs = ['intake'];
  await f.run({ stages, originalPrompt: 'Use the explicitly releasable confidential input.', sourceProvenance: [{ classification: 'confidential', attributes: { personalData: true } }] });
  assert.equal(external.received.length, 2); assert.equal(f.state.reviews.length, 2);
  external.received.forEach((request, index) => assert.equal(request.raw, f.state.reviews[index].payload));
});

test('higher-level permission denial cannot be loosened by a project hybrid setting', async () => {
  const f = fixture({ changes: { allowPersonalData: false } });
  f.state.layers.project = { enabled: true, version: 'project-1', workMode: 'hybrid', allowPersonalData: true };
  const stages = plan(); stages[1].inputs = ['intake'];
  await assert.rejects(f.run({ stages, sourceProvenance: [{ classification: 'internal', attributes: { personalData: true } }] }), hasCode('PRIVACY_LOCAL_REQUIRED'));
  assert.equal(f.state.stages.length, 1);
});

test('each actual retry is independently gated and a changed body cannot reuse an earlier approval', async () => {
  const f = fixture({ changes: { requireApproval: true }, executeStage: async (stage, state) => {
    for (const suffix of ['first attempt', 'changed retry']) await stage.dispatch({ body: JSON.stringify({ messages: [{ content: suffix }] }), transport: body => { state.transports.push({ kind: stage.kind, body }); return {}; } });
    return { text: 'Actual stage reply.', sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
  } });
  await f.run(); assert.equal(f.state.reviews.length, 4); assert.equal(new Set(f.state.reviews.map(review => review.id)).size, 4);
  assert.notEqual(f.state.reviews[0].payload, f.state.reviews[1].payload);
});

test('Stop while approval is pending aborts the stage and a late decision sends no cloud request', async () => {
  let reached, finish; const pending = new Promise(resolve => { reached = resolve; });
  const f = fixture({ changes: { requireApproval: true }, approve: () => { reached(); return new Promise(resolve => { finish = resolve; }); } });
  const running = f.run(); await pending; f.coordinator.stop('task-1');
  await assert.rejects(running, hasCode('PRIVACY_ABORTED')); finish('approve'); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.transports.filter(item => item.kind === 'cloud').length, 0);
});

test('Stop remains effective when the real executor does not settle its promise promptly', async () => {
  let reached, descriptor; const started = new Promise(resolve => { reached = resolve; });
  const f = fixture({ executeStage: stage => { descriptor = stage; reached(); return new Promise(() => {}); } });
  const running = f.run(); await started; f.coordinator.stop('task-1');
  await assert.rejects(running, hasCode('PRIVACY_ABORTED'));
  assert.throws(() => descriptor.dispatch({ body: '{}', transport: () => {} }), hasCode('PRIVACY_ABORTED'));
});

test('revision changes after local intake invalidate the remaining task instead of continuing in cloud', async () => {
  const f = fixture({ executeStage: async (stage, state) => {
    await stage.dispatch({ body: '{}', transport: () => ({ ok: true }) }); state.current = false;
    return { text: 'Local result', sessionID: 'local-session' };
  } });
  await assert.rejects(f.run(), hasCode('PRIVACY_STALE')); assert.equal(f.state.stages.length, 1);
});

test('policy edits without version changes and destination/model/account/route edits invalidate dispatch', async t => {
  for (const change of ['policy', 'endpoint', 'model', 'account', 'route', 'revision']) await t.test(change, async () => {
    const f = fixture({ executeStage: async (stage, state) => {
      if (stage.kind === 'cloud') {
        if (change === 'policy') state.layers.organization.requireApproval = true;
        else state.destinations.external[change] += change === 'endpoint' ? '/changed' : '-changed';
      }
      await stage.dispatch({ body: '{}', transport: () => { state.transports.push(stage.kind); return {}; } });
      return { text: 'Result', sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
    } });
    await assert.rejects(f.run(), hasCode('PRIVACY_STALE')); assert.deepEqual(f.state.transports, ['local']);
  });
});

test('policy revoked inside the final destination resolver cannot reach transport after the earlier fresh policy read', async () => {
  let f;
  f = fixture({ executeStage: async (stage, state) => {
    if (stage.kind === 'cloud') {
      const original = f.coordinator.resolveDestination; let calls = 0;
      f.coordinator.resolveDestination = ref => {
        const value = original(ref);
        if (ref === 'external' && ++calls === 2) state.layers.organization.allowedDestinationIds = [];
        return value;
      };
    }
    await stage.dispatch({ body: '{}', transport: () => { state.transports.push(stage.kind); return {}; } });
    return { text: 'Stage result', sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
  } });
  await assert.rejects(f.run(), hasCode('PRIVACY_STALE')); assert.deepEqual(f.state.transports, ['local']);
});

test('authority snapshot is mandatory and an async or nondigest callback fails before the first policy read', async () => {
  const f = fixture();
  assert.throws(() => new HybridCoordinator({ getPolicy: () => {}, resolveDestination: () => {}, gate: f.gate, executeStage: () => {} }), TypeError);
  for (const callback of [async () => '0'.repeat(64), () => 'not-a-digest']) {
    let policyRead = false; f.coordinator.getPolicy = () => { policyRead = true; return f.state.layers; };
    f.coordinator.getAuthoritySnapshot = callback;
    await assert.rejects(f.run(), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(policyRead, false);
  }
});

test('late dispatch from a completed stage and an executor with no gated call are rejected', async () => {
  const f = fixture(); await f.run();
  assert.throws(() => f.state.stages[0].dispatch({ body: '{}', transport: () => {} }), hasCode('PRIVACY_CONTROL_FAILED'));
  const noCall = fixture({ executeStage: async () => ({ text: 'Claimed success.', sessionID: 'fake' }) });
  await assert.rejects(noCall.run(), hasCode('PRIVACY_CONTROL_FAILED'));
});

test('follow-up tasks keep separate session/history memory; changed recipient rotates both internal partitions', async () => {
  const f = fixture(), first = await f.run(), count = f.state.stages.length;
  const second = await f.run({ taskID: 'task-2', originalPrompt: 'Continue the local work.', sourceProvenance: [] });
  assert.equal(first.localPartitionID, second.localPartitionID); assert.equal(first.externalPartitionID, second.externalPartitionID);
  const followupCloud = f.state.stages.slice(count).find(stage => stage.kind === 'cloud');
  assert.equal(followupCloud.history.some(row => row.content.includes(CANARY)), false);
  assert.ok(followupCloud.engineSessionID);
  f.state.destinations.external.model = 'another-allowed-model';
  const third = await f.run({ taskID: 'task-3' }); assert.notEqual(third.externalPartitionID, first.externalPartitionID); assert.notEqual(third.localPartitionID, first.localPartitionID);
});

test('material identities are unforgeable, output provenance immutable and payload limits fail closed', () => {
  const ledger = new HybridMaterialLedger(composePolicy(policyLayers()));
  const source = ledger.addSource({ text: 'Private source', provenance: [{ classification: 'strict', attributes: { personalData: true } }] });
  const result = ledger.derive({ text: 'Seemingly public output', parents: [source] });
  assert.equal(ledger.read(result).provenance[0].classification, 'strict');
  assert.throws(() => ledger.read({ id: source.id }), hasCode('PRIVACY_CONTROL_FAILED'));
  assert.throws(() => { ledger.read(result).provenance[0].classification = 'public'; }, TypeError);
  assert.throws(() => ledger.addSource({ text: 'x'.repeat(512_001) }), hasCode('PRIVACY_CONTROL_FAILED'));
});
test('protected project terms taint material and transient tool-result summaries independently of allowPersonalData', () => {
  const ledger = new HybridMaterialLedger(composePolicy(policyLayers({ allowPersonalData: true })));
  const source = ledger.addSource({ text: CANARY });
  assert.equal(ledger.read(source).provenance[0].classification, 'strict');
  const summary = ledger.derive({ text: 'A bland generic summary', parents: [source] });
  assert.throws(() => ledger.assertExternal([summary]), hasCode('PRIVACY_LOCAL_REQUIRED'));
  const transient = ledger.requestProvenance(JSON.stringify({ messages: [{ role: 'tool', content: CANARY }] }));
  assert.equal(transient.classification, 'strict');
  const result = ledger.addSource({ text: 'Another bland summary', provenance: [transient] });
  assert.throws(() => ledger.assertExternal([result]), hasCode('PRIVACY_LOCAL_REQUIRED'));
});

test('partition compaction cannot import local history into cloud; each summary inherits only its entire own partition', () => {
  const ledger = new HybridMaterialLedger(composePolicy(policyLayers())), partitions = new HybridSessionPartitions(ledger);
  const local = partitions.create({ kind: 'local', binding: { conversation: 'x' } }), cloud = partitions.create({ kind: 'cloud', binding: { conversation: 'x' } });
  const privateInput = ledger.addSource({ text: CANARY, provenance: [{ classification: 'strict' }] });
  const publicInput = ledger.addSource({ text: 'Public code scaffold.' });
  partitions.append(local, { role: 'user', material: privateInput }); partitions.append(cloud, { role: 'user', material: publicInput });
  const localSummary = partitions.compact(local, 'Short local summary.'), cloudSummary = partitions.compact(cloud, 'Short public code summary.');
  assert.equal(ledger.read(localSummary).provenance[0].classification, 'strict');
  assert.equal(ledger.read(cloudSummary).provenance[0].classification, 'internal');
  assert.equal(JSON.stringify(partitions.history(cloud)).includes(CANARY), false);
  assert.throws(() => partitions.history({ ...local }), hasCode('PRIVACY_CONTROL_FAILED'));
});

test('unsafe host plans fail before model execution and concurrent same-conversation runs cannot share state', async () => {
  const f = fixture(); const invalidPlans = [[], [plan()[1], plan()[4]], [plan()[0], plan()[1]], [{ ...plan()[0], inputs: ['public-brief'] }, plan()[4]]];
  for (const stages of invalidPlans) await assert.rejects(f.run({ stages }), hasCode('PRIVACY_CONTROL_FAILED'));
  assert.equal(f.state.stages.length, 0);
  let reached; const started = new Promise(resolve => { reached = resolve; });
  const concurrent = fixture({ executeStage: stage => { reached(); return new Promise(() => {}); } });
  const running = concurrent.run(); await started;
  await assert.rejects(concurrent.run({ taskID: 'another' }), hasCode('PRIVACY_STALE'));
  concurrent.coordinator.stop('task-1'); await assert.rejects(running, hasCode('PRIVACY_ABORTED'));
});

test('trusted saved partitions restore exact separate engine sessions and histories across coordinator restart', async () => {
  let saved; const store = { load: async () => saved ? copy(saved) : null, save: async (_scope, value) => { saved = copy(value); } };
  const first = fixture({ sessionStore: store }), initial = await first.run(); first.coordinator.dispose();
  assert.equal(saved.status, 'complete');
  assert.ok(saved.local.materials.some(value => value.text.includes(CANARY)));
  assert.equal(JSON.stringify(saved.cloud).includes(CANARY), false);
  const restored = fixture({ sessionStore: store }); const result = await restored.run({ taskID: 'after-restart', requireExistingSession: true });
  assert.equal(result.continuity, 'restored'); assert.equal(result.localPartitionID, initial.localPartitionID); assert.equal(result.externalPartitionID, initial.externalPartitionID);
  assert.ok(restored.state.stages[0].engineSessionID); assert.ok(restored.state.stages[1].engineSessionID);
  assert.equal(restored.state.stages[1].history.some(value => value.content.includes(CANARY)), false);
});

test('missing, incomplete or policy/destination-mismatched persisted session never becomes an empty replacement', async t => {
  const missing = fixture(); await assert.rejects(missing.run({ requireExistingSession: true }), hasCode('PRIVACY_SESSION_MISSING')); assert.equal(missing.state.stages.length, 0);
  let saved; const store = { load: async () => saved ? copy(saved) : null, save: async (_scope, value) => { saved = copy(value); } };
  await fixture({ sessionStore: store }).run();
  for (const scenario of ['incomplete', 'policy', 'destination', 'partition-kind']) await t.test(scenario, async () => {
    const value = copy(saved); if (scenario === 'incomplete') value.status = 'in-progress';
    if (scenario === 'partition-kind') value.cloud.kind = 'local';
    const f = fixture({ sessionStore: { load: async () => value, save: async () => {} } });
    if (scenario === 'policy') f.state.layers.organization.version = 'org-2';
    if (scenario === 'destination') f.state.destinations.external.account = 'another-account';
    await assert.rejects(f.run({ requireExistingSession: true }), error => error instanceof PrivacyGateError && ['PRIVACY_SESSION_MISSING', 'PRIVACY_CONTROL_FAILED'].includes(error.code));
    assert.equal(f.state.stages.length, 0);
  });
});

// Exact host derivation labels remain independent of model-written summaries.
test('known derived file provenance is checked on every actual hybrid request and taints later local summaries', async () => {
  const f = fixture({ changes: { protectedValues: [] }, getRequestProvenance: async body => ({ provenance: body.includes('stats.txt') ? [{ classification: 'strict', attributes: { personalData: true } }] : [], assertCurrent: () => true }), executeStage: async (stage, state) => {
    await stage.dispatch({ body: JSON.stringify({ messages: [{ content: stage.kind === 'local' ? 'Read stats.txt' : 'Public code' }] }), transport: () => { state.transports.push(stage.kind); return {}; } });
    return { text: 'A harmless-looking local summary.', sessionID: `session-${stage.partitionID}` };
  } });
  const stages = plan(); stages[1].inputs = ['intake'];
  await assert.rejects(f.run({ stages, sourceProvenance: [], originalPrompt: 'Read a local file.' }), hasCode('PRIVACY_LOCAL_REQUIRED'));
  assert.deepEqual(f.state.transports, ['local']);
});
test('a derivation-label revision changed during sharing approval cannot dispatch hybrid bytes', async () => {
  let current = true; const f = fixture({ changes: { requireApproval: true, protectedValues: [] }, getRequestProvenance: async () => ({ provenance: [], assertCurrent: () => current }), approve: () => { current = false; return 'approve'; } });
  await assert.rejects(f.run({ sourceProvenance: [], originalPrompt: 'Public task' }), hasCode('PRIVACY_STALE'));
  assert.equal(f.state.transports.filter(item => item.kind === 'cloud').length, 0);
});

test('trusted workspace can read immutable inherited provenance after a local dispatch', async () => {
  let inherited;
  const f = fixture({ executeStage: async stage => {
    await stage.dispatch({ body: JSON.stringify({ messages: [{ role: 'user', content: 'Safe fixture request.' }] }), transport: () => ({ ok: true }) });
    if (stage.kind === 'local') inherited = stage.getSourceProvenance();
    return { text: 'Checked result', sessionID: stage.engineSessionID || `session-${stage.partitionID}` };
  } });
  await f.run(); assert.equal(inherited[0].classification, 'strict'); assert.equal(inherited[0].attributes.personalData, true);
  inherited[0].classification = 'public';
  assert.equal(f.state.stages.at(-1).getSourceProvenance()[0].classification, 'strict');
});


test('trusted full app instructions fit the bounded material budget without truncation', async () => {
  const f = fixture(), stages = plan();
  stages[0].instruction = 'Public approved skill guidance. '.repeat(2000);
  await f.run({ stages });
  assert.equal(f.state.stages[0].instruction, stages[0].instruction);
  const rejected = fixture(), tooLarge = plan(); tooLarge[0].instruction = 'æ'.repeat(256001);
  await assert.rejects(rejected.run({ stages: tooLarge }), hasCode('PRIVACY_CONTROL_FAILED'));
  assert.equal(rejected.state.stages.length, 0);
});
