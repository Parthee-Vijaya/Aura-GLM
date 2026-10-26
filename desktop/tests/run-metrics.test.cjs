const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMetricsBuffer, RunMeasurement, promptComponents } = require('../core/run-metrics.cjs');
const { OpenCodeEngine } = require('../core/engine.cjs');

function fixture(options = {}) {
  let at = 0;
  const buffer = createMetricsBuffer({ now: () => at, ...options });
  const measurement = buffer.create({ mode: 'chat', origin: 'conversation' });
  return { buffer, measurement, at(value) { at = value; }, snapshot: () => measurement.snapshot() };
}
function assistant(measurement, { recovered = false, text = 'Synthetic answer.' } = {}) {
  measurement.observe({ type: 'message.updated', properties: { info: { id: 'assistant', role: 'assistant' } } });
  measurement.observe({ type: 'message.part.updated', recovered, properties: { part: { id: 'text', messageID: 'assistant', type: 'text', text } } });
}
test('separates preparation, startup, setup, acknowledgement and observed content with a monotonic clock', () => {
  const f = fixture(), m = f.measurement;
  m.prepareStarted(); f.at(12); m.prepared([{ id: 'Projektbrief', text: 'Æble 🌳' }]);
  f.at(5000); m.engineStarting(); f.at(5100); m.engineReady();
  f.at(5110); m.sending('Synthetic question.', 'Æble 🌳\nRuntime policy.');
  f.at(5130); m.dispatched(); f.at(5150); m.acknowledged(); f.at(5230); assistant(m);
  const result = f.snapshot();
  assert.equal(result.prepare_ms, 12); assert.equal(result.engine_start_ms, 100);
  assert.equal(result.send_setup_ms, 20); assert.equal(result.send_ack_ms, 20); assert.equal(result.ttft_ms, 100);
  assert.equal(result.prompt.components[0].bytes, Buffer.byteLength('Æble 🌳'));
  assert.equal(result.prompt.runtimeSuffix.bytes, Buffer.byteLength('\nRuntime policy.'));
  assert.equal(result.providerUsage.input, null);
  assert.equal(result.engineReused, false);
});
test('never exports text, caller labels, hashes, errors, paths or credentials', () => {
  const observed = [], f = fixture({ observer: record => observed.push(record) }), m = f.measurement;
  const secret = 'PRIVATE_CANARY_/private/file?key=synthetic';
  m.prepareStarted(); m.prepared([{ id: secret, text: secret, hash: secret, source: secret }]);
  m.sending(secret, secret); m.dispatched(); assistant(m, { text: secret });
  m.observe({ type: 'engine.error', message: secret, properties: { error: { data: { message: secret } } } });
  assert.equal(JSON.stringify([observed, f.buffer.snapshots()]).includes(secret), false);
  assert.deepEqual(promptComponents([{ id: secret, text: 'abc' }]), [{ id: 'other', bytes: 3, estimatedTokens: 1 }]);
  for (const id of ['__proto__', 'constructor', 'toString']) assert.equal(promptComponents([{ id, text: '' }])[0].id, 'other');
});
test('records a recovered first output as an upper bound, not a precise TTFT', () => {
  const f = fixture(), m = f.measurement;
  m.sending('question', 'rules'); m.dispatched(); f.at(250); assistant(m, { recovered: true });
  f.at(400); assistant(m);
  assert.equal(f.snapshot().ttft_ms, null); assert.equal(f.snapshot().ttft_upper_bound_ms, 250);
  assert.equal(f.snapshot().ttftSource, 'recovered-snapshot-upper-bound');
  m.acknowledged('reconciled');
  assert.equal(f.snapshot().send_ack_ms, null); assert.equal(f.snapshot().ack_observed_ms, 400);
});
test('ignores empty events, user text and heartbeat traffic; counts current partial text once', () => {
  const f = fixture(), m = f.measurement; m.sending('question', 'rules'); m.dispatched();
  m.observe({ type: 'message.part.updated', properties: { part: { messageID: 'user', type: 'text', text: 'private' } } });
  m.observe({ type: 'server.heartbeat' }); assistant(m, { text: '' });
  assert.equal(f.snapshot().ttft_ms, null);
  f.at(15); m.observe({ type: 'message.part.delta', properties: { partID: 'text', field: 'text', delta: 'x' } });
  f.at(30); assistant(m);
  assert.equal(f.snapshot().ttft_ms, 15);
});
test('fast completion can precede its acknowledgement, while Stop ignores all later evidence', () => {
  const f = fixture(), m = f.measurement; m.sending('x', 'y'); m.dispatched(); f.at(1); assistant(m); m.finish('completed');
  f.at(5); m.acknowledged(); assert.equal(f.snapshot().send_ack_ms, 5); assert.equal(f.snapshot().outcome, 'completed');
  const stopped = f.buffer.create(); stopped.sending('x', 'y'); stopped.dispatched(); stopped.finish('stopped');
  const before = stopped.snapshot(); f.at(100); assistant(stopped); stopped.acknowledged(); stopped.finish('completed');
  assert.deepEqual(stopped.snapshot(), before);
});
test('usage is provider-reported, deduplicated and distinct from heuristic prompt estimates', () => {
  const f = fixture(), m = f.measurement; m.sending('x'.repeat(400), 'rules'); m.dispatched(); assistant(m);
  const event = { type: 'message.part.updated', properties: { part: { id: 'step', messageID: 'assistant', type: 'step-finish', tokens: { input: 7, output: 3, reasoning: 2, cache: { read: 10, write: 0 } } } } };
  m.observe(event); m.observe(event);
  assert.equal(f.snapshot().prompt.user.estimatedTokens, 100);
  assert.deepEqual(f.snapshot().providerUsage, { source: 'engine-step-finish', calls: 1, partial: false, input: 7, output: 3, reasoning: 2, cacheRead: 10, cacheWrite: 0 });
});
test('bounded snapshots cannot be mutated and evicted operations cannot re-enter the ring', () => {
  const f = fixture({ limit: 2 }); f.buffer.create(); const last = f.buffer.create();
  f.measurement.prepareStarted(); assert.equal(f.buffer.snapshots().length, 2);
  assert.equal(f.buffer.snapshots().some(item => item.id === f.measurement.snapshot().id), false);
  const copy = f.buffer.snapshots(); copy[1].outcome = 'PRIVATE_CANARY';
  assert.equal(f.buffer.snapshots().at(-1).outcome, last.snapshot().outcome);
});
test('diagnostics are passive when an observer throws, mutates or the clock moves backwards', () => {
  const f = fixture({ observer: record => { record.outcome = 'PRIVATE_CANARY'; throw new Error('PRIVATE_CANARY'); } });
  f.at(10); f.measurement.prepareStarted(); f.at(5); f.measurement.prepared([]);
  assert.equal(f.snapshot().prepare_ms, 0); assert.equal(f.snapshot().outcome, 'prepared');
  const m = new RunMeasurement({ now: () => { throw new Error(); } });
  assert.doesNotThrow(() => { m.prepareStarted(); m.prepared([]); m.finish('error'); });
});
test('hybrid facade reports no invented engine timings', () => {
  assert.equal(new RunMeasurement().snapshot().privacyMode, null, 'an engine-only probe must not imply Privacy Gate is disabled');
  const f = fixture(), m = f.measurement; m.prepareStarted(); f.at(20); m.prepared([], 'hybrid'); m.unsupported('privacy-runtime'); m.finish('completed');
  assert.equal(f.snapshot().privacyMode, 'hybrid'); assert.equal(f.snapshot().engineSupport, 'privacy-runtime-unsupported');
  for (const name of ['engine_start_ms', 'send_setup_ms', 'send_ack_ms', 'ttft_ms']) assert.equal(f.snapshot()[name], null);
});
test('actual engine hooks preserve prompt/system bytes and exclude rejected old events', async () => {
  const f = fixture(); const calls = [];
  const engine = new OpenCodeEngine({ root: '/synthetic', directory: '/synthetic-engine', model: { id: 'synthetic' }, mode: 'chat', measurement: f.measurement });
  engine.active = true; engine.session = { id: 'session' }; engine.eventsAbort = new AbortController();
  engine.captureBaseline = async () => {}; engine.wire = async (url, method, body) => { calls.push({ url, method, body: structuredClone(body) }); f.at(f.snapshot().send_setup_ms == null ? calls.length * 5 : 25); return null; };
  const text = 'USER_BYTES_Æ🌳', system = 'SYSTEM_BYTES_Æ🌳';
  await engine.send(text, system);
  assert.equal(calls.find(call => call.url.endsWith('/aura-task')).body.value, system);
  assert.equal(calls.find(call => call.url.endsWith('/prompt')).body.text, text);
  assert.equal(calls.filter(call => call.url.endsWith('/prompt')).length, 1);
  f.at(40); engine.handleEvent({ type: 'message.updated', properties: { info: { id: 'old', parentID: 'old-prompt', role: 'assistant' } } });
  engine.handleEvent({ type: 'message.part.updated', properties: { part: { id: 'old-text', messageID: 'old', type: 'text', text: 'OLD' } } });
  assert.equal(f.snapshot().ttft_ms, null);
  engine.handleEvent({ type: 'message.updated', properties: { info: { id: 'assistant', parentID: engine.promptID, role: 'assistant' } } });
  engine.handleEvent({ type: 'message.part.updated', properties: { part: { id: 'answer', messageID: 'assistant', type: 'text', text: 'Actual' } } });
  assert.equal(f.snapshot().ttft_ms, 25); assert.equal(f.snapshot().send_ack_ms, 10);
  assert.equal(f.snapshot().engineReused, true);
  engine.handleEvent({ type: 'session.idle', properties: { sessionID: 'session' } });
  await engine.close(); assert.equal(f.snapshot().outcome, 'completed');
});
test('actual lost-ACK reconciliation is explicitly measured without a second prompt POST', async () => {
  const f = fixture(); let posts = 0;
  const engine = new OpenCodeEngine({ root: '/synthetic', directory: '/synthetic-engine', model: { id: 'synthetic' }, measurement: f.measurement, recovery: { delays: [0] } });
  engine.active = true; engine.session = { id: 'session' }; engine.eventsAbort = new AbortController(); engine.captureBaseline = async () => {};
  engine.wire = async (url, method) => {
    if (url.endsWith('/prompt') && method === 'POST') { posts++; f.at(10); throw new Error('SYNTHETIC_LOST_ACK'); }
    if (url.endsWith('/active')) return { data: { session: { type: 'running' } } };
    return null;
  };
  engine.messages = async () => [{ info: { id: engine.promptID, role: 'user' } }];
  engine.eventStream = { close() {}, async reconcile() {
    f.at(30);
    engine.handleEvent({ type: 'message.updated', recovered: true, properties: { info: { id: 'assistant', parentID: engine.promptID, role: 'assistant' } } });
    engine.handleEvent({ type: 'message.part.updated', recovered: true, properties: { part: { id: 'answer', messageID: 'assistant', type: 'text', text: 'Synthetic recovered answer.' } } });
  } };
  await engine.send('question', 'rules');
  assert.equal(posts, 1); assert.equal(f.snapshot().send_ack_ms, null); assert.equal(f.snapshot().ack_observed_ms, 30);
  assert.equal(f.snapshot().ttft_ms, null); assert.equal(f.snapshot().ttft_upper_bound_ms, 30);
  assert.equal(f.snapshot().ackSource, 'reconciled'); await engine.close();
});
test('two concurrent measurements keep independent clocks, components and terminal states', () => {
  const f = fixture(), one = f.measurement, two = f.buffer.create({ mode: 'plan' });
  one.sending('one', 'system one'); one.dispatched(); f.at(10); two.sending('two', 'system two'); two.dispatched();
  f.at(30); assistant(two); f.at(50); assistant(one); one.finish('stopped'); two.finish('completed');
  assert.equal(one.snapshot().ttft_ms, 50); assert.equal(two.snapshot().ttft_ms, 20);
  assert.equal(one.snapshot().outcome, 'stopped'); assert.equal(two.snapshot().outcome, 'completed');
});
