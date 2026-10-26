// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { HybridEngineExecutor } = require('../core/privacy/hybrid-engine-executor.cjs');
const { PrivacyGateError } = require('../core/privacy/policy.cjs');
const hasCode = code => error => error instanceof PrivacyGateError && error.code === code;

// These are adapter contracts with an explicitly controlled event driver, not
// claims about a real OpenCode binary, native sandbox or production model.
function fixture({ send, requestPermission, answerQuestion, validateLease, preparePartition, authorizeStage, start, remaining, maxStageMs, close, cleanupTimeoutMs, releaseLease, closeAfterStage } = {}) {
  const state = { engines: [], gateways: [], events: [], replies: [], answers: [], released: [], aborted: 0, closed: 0, validated: 0, selection: {
    connection: { id: 'external', kind: 'openai', baseURL: 'http://127.0.0.1:9/v1' }, model: { id: 'fixture-model', capabilities: { tools: true } }, key: '',
  } };
  const executor = new HybridEngineExecutor({ resolveSelection: async () => state.selection,
    preparePartition: preparePartition || (async stage => ({ root: `/synthetic/${stage.partitionID}/project`, directory: `/synthetic/${stage.partitionID}/engine`, mode: stage.mode })),
    validateLease: validateLease || (async () => { state.validated++; return true; }), requestPermission, answerQuestion,
    authorizeStage: authorizeStage || (async () => true), releaseLease: async (lease, stage) => { state.released.push({ lease, stage }); return releaseLease ? releaseLease(lease, stage) : true; },
    onEvent: (event, context) => state.events.push({ event, context }),
    createGateway: async (_connection, _model, _key, _route, failure, options) => {
      const gateway = { url: 'http://127.0.0.1:54321/v1', token: 'synthetic-gateway-token', options, failure,
        abort: () => { state.aborted++; }, close: async () => { state.closed++; } };
      state.gateways.push(gateway); return gateway;
    },
    createEngine: options => {
      const engine = { active: false, options, session: { id: options.resume || `ses_${randomUUID()}` },
        start: async () => { if (start) await start(engine, state); engine.active = true; },
        send: async (text, system) => { state.sent = { text, system }; if (send) return send(engine, state); finish(engine, 'Actual controlled event result.'); },
        abort: async () => { state.aborted++; }, close: async () => { engine.active = false; state.closed++; if (close) return close(); },
        reply: async (...args) => { state.replies.push(args); finish(engine, 'Permission result.'); },
        answerQuestion: async (...args) => { state.answers.push(args); finish(engine, 'Question result.'); },
      }; state.engines.push(engine); return engine;
    }, ...(closeAfterStage ? { closeAfterStage } : {}), ...(remaining ? { remaining } : {}), ...(maxStageMs ? { maxStageMs } : {}), ...(cleanupTimeoutMs ? { cleanupTimeoutMs } : {}) });
  const controller = new AbortController();
  const stage = overrides => ({ taskID: 'synthetic-task', partitionID: randomUUID(), stageID: 'cloud-design', kind: 'cloud', mode: 'chat', destinationRef: 'external',
    destination: { id: 'external', model: state.selection.model.id, route: '', endpoint: state.selection.connection.baseURL }, engineSessionID: null,
    materials: [{ text: 'Only this permitted stage input.' }], instruction: 'Only this trusted stage instruction.', history: [{ role: 'user', content: 'Do not replay global visible history.' }],
    dispatch: async ({ body, transport }) => transport(body), signal: controller.signal, ...overrides });
  return { state, executor, controller, stage };
}
function finish(engine, text) {
  const sessionID = engine.session.id;
  engine.options.onEvent({ type: 'message.updated', properties: { info: { id: 'message-1', role: 'assistant' }, sessionID } });
  engine.options.onEvent({ type: 'message.part.updated', properties: { part: { id: 'part-1', messageID: 'message-1', type: 'text', text }, sessionID } });
  engine.options.onEvent({ type: 'session.idle', properties: { sessionID } });
}

test('adapter requires the trusted opaque lease validator, not a root or isolation boolean', () => {
  assert.throws(() => new HybridEngineExecutor({ resolveSelection: () => {}, preparePartition: () => ({ root: '/tmp', isolation: true }) }), TypeError);
});

test('actual event result binds the real engine session and forwards stage-tagged events without replaying global history', async t => {
  const f = fixture(); t.after(() => f.executor.dispose()); const stage = f.stage(); const result = await f.executor.execute(stage);
  assert.equal(result.text, 'Actual controlled event result.'); assert.equal(result.sessionID, f.state.engines[0].session.id);
  assert.equal(f.state.sent.text, 'Only this permitted stage input.'); assert.ok(f.state.sent.system.startsWith(stage.instruction)); assert.ok(f.state.sent.system.includes(`actual writable workspace is /synthetic/${stage.partitionID}/project`));
  assert.equal(f.state.sent.text.includes('global visible history'), false);
  assert.equal(f.state.events.length, 3); assert.ok(f.state.events.every(row => row.context.partitionID === stage.partitionID && row.context.stageID === stage.stageID));
  assert.ok(f.state.validated >= 3);
});

test('same-partition follow-ups use fresh stage leases and resume the exact engine session; separate partitions have separate roots and runtimes', async t => {
  const f = fixture(); t.after(() => f.executor.dispose()); const first = f.stage(), result = await f.executor.execute(first);
  await f.executor.execute({ ...first, stageID: 'next', engineSessionID: result.sessionID, materials: [{ text: 'Next public input.' }] });
  assert.equal(f.state.engines.length, 2); assert.equal(f.state.engines[1].options.resume, result.sessionID); assert.equal(f.state.released.length, 1); assert.equal(f.state.released[0].stage, first);
  assert.equal(f.state.engines[0].options.directory, f.state.engines[1].options.directory);
  await f.executor.execute(f.stage({ kind: 'local' })); assert.equal(f.state.engines.length, 3);
  assert.notEqual(f.state.engines[0].options.directory, f.state.engines[2].options.directory);
  assert.notEqual(f.state.engines[0].options.root, f.state.engines[2].options.root);
});

test('invalid or revoked D3 lease and cross-partition root reuse fail closed', async () => {
  const invalidLease = fixture({ validateLease: async () => false });
  await assert.rejects(invalidLease.executor.execute(invalidLease.stage()), hasCode('PRIVACY_CONTROL_FAILED')); assert.equal(invalidLease.state.engines.length, 0);
  const reused = fixture({ preparePartition: async stage => ({ root: '/synthetic/reused', directory: '/synthetic/reused-engine', mode: stage.mode }) });
  await reused.executor.execute(reused.stage()); await assert.rejects(reused.executor.execute(reused.stage()), hasCode('PRIVACY_CONTROL_FAILED'));
  await reused.executor.dispose();
});

test('sharing does not approve a tool: actual permission waits for the caller and uses only that concrete answer', async t => {
  let answer, waiting; const ready = new Promise(resolve => { waiting = resolve; });
  const f = fixture({ send: engine => engine.options.onEvent({ type: 'permission.asked', properties: { id: 'permission-1', permission: 'edit', sessionID: engine.session.id } }),
    requestPermission: async (_request, context) => { assert.equal(context.mode, 'build'); waiting(); return new Promise(resolve => { answer = resolve; }); } });
  t.after(() => f.executor.dispose()); const running = f.executor.execute(f.stage({ mode: 'build' })); await ready;
  assert.equal(f.state.replies.length, 0); answer({ allow: true, scope: 'task' }); const result = await running;
  assert.equal(result.text, 'Permission result.'); assert.deepEqual(f.state.replies, [['permission-1', true, '']]);
});

test('Stop during a pending tool grant rejects a late answer and closes the engine and gateway', async () => {
  let answer, waiting; const ready = new Promise(resolve => { waiting = resolve; });
  const f = fixture({ send: engine => engine.options.onEvent({ type: 'permission.asked', properties: { id: 'permission-1', sessionID: engine.session.id } }),
    requestPermission: () => { waiting(); return new Promise(resolve => { answer = resolve; }); } });
  const running = f.executor.execute(f.stage()); await ready; f.controller.abort();
  await assert.rejects(running, hasCode('PRIVACY_ABORTED')); answer({ allow: true }); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.state.replies, []); assert.ok(f.state.closed >= 2);
});

test('actual question flow waits for caller answers and a missing approval callback is never autoaccepted', async t => {
  const f = fixture({ send: engine => engine.options.onEvent({ type: 'question.asked', properties: { id: 'question-1', sessionID: engine.session.id } }), answerQuestion: async () => [['Local only']] });
  t.after(() => f.executor.dispose()); assert.equal((await f.executor.execute(f.stage({ mode: 'plan' }))).text, 'Question result.');
  assert.deepEqual(f.state.answers, [['question-1', [['Local only']]]]);
  const missing = fixture({ send: engine => engine.options.onEvent({ type: 'permission.asked', properties: { id: 'permission-2', sessionID: engine.session.id } }) });
  await assert.rejects(missing.executor.execute(missing.stage()), hasCode('PRIVACY_APPROVAL_REQUIRED')); assert.equal(missing.state.replies.length, 0);
});

test('a host-denied mode change or a different actual session cannot silently upgrade a plan or replace history', async t => {
  const f = fixture({ authorizeStage: async stage => stage.mode === 'chat' }); t.after(() => f.executor.dispose()); const stage = f.stage(); await f.executor.execute(stage);
  await assert.rejects(f.executor.execute({ ...stage, mode: 'build' }), hasCode('PRIVACY_BLOCKED'));
  await assert.rejects(f.executor.execute({ ...stage, engineSessionID: 'wrong-session' }), hasCode('PRIVACY_STALE'));
});

test('an explicitly host-authorized plan-to-build transition gets a fresh lease and keeps the exact session', async t => {
  const f = fixture({ authorizeStage: async stage => ['plan', 'build'].includes(stage.mode) }); t.after(() => f.executor.dispose());
  const stage = f.stage({ mode: 'plan' }), result = await f.executor.execute(stage);
  await f.executor.execute({ ...stage, mode: 'build', engineSessionID: result.sessionID });
  assert.equal(f.state.engines[1].options.mode, 'build'); assert.equal(f.state.engines[1].options.resume, result.sessionID); assert.equal(f.state.released.length, 1);
});

test('gateway transport sends exactly the checked whole body to a controlled receiver', async t => {
  const received = []; const server = http.createServer(async (request, response) => { const chunks = []; for await (const chunk of request) chunks.push(chunk); received.push(Buffer.concat(chunks).toString('utf8')); response.end('controlled'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  let checked = 0;
  const f = fixture({ send: async (engine, state) => {
    const response = await state.gateways[0].options.dispatch({ url: `http://127.0.0.1:${server.address().port}/v1/chat/completions`, headers: { 'content-type': 'application/json' }, body: '{ "messages": [{"content":"Whole body"}] }', signal: new AbortController().signal });
    await response.text(); finish(engine, 'Wire finished.');
  } }); t.after(() => f.executor.dispose());
  f.state.selection.connection.baseURL = `http://127.0.0.1:${server.address().port}/v1`;
  const raw = '{ "messages": [{"content":"Whole body"}] }';
  await f.executor.execute(f.stage({ dispatch: async request => { checked++; assert.equal(request.body, raw); return request.transport(request.body); } }));
  assert.equal(checked, 1); assert.deepEqual(received, [raw]);
});

test('expiry and never-settling send do not leave a running adapter after the task is stopped', async () => {
  const f = fixture({ maxStageMs: 10, send: () => new Promise(() => {}) });
  await assert.rejects(f.executor.execute(f.stage()), hasCode('PRIVACY_ABORTED')); assert.ok(f.state.closed >= 2);
});

test('Stop while lease preparation is pending revokes the late lease without creating an engine', async () => {
  let finishLease, preparing; const ready = new Promise(resolve => { preparing = resolve; });
  const f = fixture({ preparePartition: stage => { preparing(); return new Promise(resolve => { finishLease = () => resolve({ root: '/synthetic/late/project', directory: '/synthetic/late/engine', mode: stage.mode }); }); } });
  const running = f.executor.execute(f.stage()); await ready; f.controller.abort();
  await assert.rejects(running, hasCode('PRIVACY_ABORTED')); finishLease(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.state.engines.length, 0); assert.equal(f.state.released.length, 1);
});

test('failed or hanging engine close still revokes the exact lease and reports only a sanitized cleanup failure', async t => {
  for (const scenario of ['reject', 'hang']) await t.test(scenario, async () => {
    const f = fixture({ cleanupTimeoutMs: 10, close: () => scenario === 'hang' ? new Promise(() => {}) : Promise.reject(Error('SYNTHETIC_PRIVATE_CLOSE_DETAIL')) });
    const stage = f.stage(); await f.executor.execute(stage);
    await assert.rejects(f.executor.dispose(), error => hasCode('PRIVACY_CONTROL_FAILED')(error) && !error.message.includes('PRIVATE_CLOSE'));
    assert.equal(f.state.released.length, 1); assert.equal(f.state.released[0].stage, stage);
    await f.executor.dispose(); assert.equal(f.state.released.length, 1, 'The failed record must already have left the active session map.');
  });
});


test('successful retirement awaits reviewable writeback beyond the process cleanup deadline', async t => {
  let review, ready; const waiting = new Promise(resolve => { ready = resolve; });
  const f = fixture({ closeAfterStage: true, cleanupTimeoutMs: 10, releaseLease: async () => { ready(); return new Promise(resolve => { review = resolve; }); } });
  t.after(() => f.executor.dispose()); let settled = false;
  const running = f.executor.execute(f.stage()).finally(() => { settled = true; }); await waiting;
  await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false, 'A human review is not a process shutdown deadline.');
  review(true); assert.equal((await running).text, 'Actual controlled event result.'); assert.equal(f.state.released.length, 1);
});
test('patch hydration reads only the current lane and binds exact session, message, part and call identities before approval', async t => {
  for (const mismatch of [false,true]) {
    let requested=0;const f=fixture({send(engine){
      const sessionID=engine.session.id,part={id:'part_patch',messageID:'msg_patch',sessionID,type:'tool',tool:'apply_patch',callID:'call_patch',state:{status:'pending',input:{}}};
      engine.request=async url=>{requested++;assert.equal(url,`/session/${sessionID}/message/msg_patch`);return{info:{id:'msg_patch',sessionID},parts:[{...part,callID:mismatch?'other_call':'call_patch',state:{status:'running',input:{patchText:'*** Begin Patch\n*** Add File: public/new.txt\n+Approved\n*** End Patch'}}}]};};
      engine.options.onEvent({type:'message.part.updated',properties:{part,sessionID}});
      engine.options.onEvent({type:'permission.asked',properties:{id:'permission_patch',sessionID,permission:'edit',tool:{callID:'call_patch',messageID:'msg_patch'}}});
    },requestPermission:async()=>{const updates=f.state.events.filter(row=>row.event.type==='message.part.updated'&&row.event.properties.part.type==='tool');assert.equal(updates.length,mismatch?1:2);return{allow:!mismatch};}});
    t.after(()=>f.executor.dispose());await f.executor.execute(f.stage());assert.equal(requested,1);assert.equal(f.state.replies[0][1],!mismatch);
  }
});
