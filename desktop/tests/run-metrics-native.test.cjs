const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { Workbench } = require('../core/workbench.cjs');
const { OpenCodeEngine, VERSION } = require('../core/engine.cjs');
const { localMetrics } = require('../core/run-metrics.cjs');
const { startFakeProvider } = require('../scripts/fixtures/fake-provider.cjs');
const native = { skip: process.env.AURA_ENGINE_NATIVE !== '1' ? 'Set AURA_ENGINE_NATIVE=1 with the prepared pinned runtime.' : false, timeout: 60000 };

test('native run measurements cover real preparation, cold/reused engine and unchanged reviewed bytes', native, async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-run-metrics-native-')));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  await fs.writeFile(path.join(project, 'unchanged.txt'), 'Synthetic source remains unchanged.');
  const provider = await startFakeProvider({ synthetic: true, model: 'probe', script: Array.from({ length: 10 }, () => ({ text: 'Synthetic controlled answer.', delayMs: 30 })) });
  const events = [], posts = [];
  const bench = new Workbench({ directory: path.join(root, 'profile'), profiles: path.resolve(__dirname, '../../profiles'), safeStorage: {}, emit: event => events.push(event), engineFactory: options => {
    const engine = new OpenCodeEngine(options), wire = engine.wire.bind(engine);
    engine.wire = async (url, method, body, signal) => {
      if (method === 'POST' && url.endsWith('/prompt')) posts.push(structuredClone(body));
      return wire(url, method, body, signal);
    };
    return engine;
  } });
  t.after(async () => { await bench.close(); await provider.close(); await fs.rm(root, { recursive: true, force: true }); });
  await bench.activate({ root: project, name: 'Synthetic measurements' });
  const selection = { connection: { id: 'fixture', kind: 'compatible', name: 'Synthetic local provider', baseURL: provider.url }, model: { id: 'probe', limits: { context: 32768, output: 1024 } } };
  await bench.store.update(state => { state.connections = [selection.connection]; });
  // This test isolates app preparation/start/dispatch. External catalog discovery
  // is deliberately replaced, and no real account or credentials are accessed.
  bench.selection = async () => selection;
  const observed = [];
  for (const text of ['SYNTHETIC_METRIC_PROMPT_ONE Æ🌳', 'SYNTHETIC_METRIC_PROMPT_TWO Æ🌳']) {
    const before = localMetrics.snapshots().map(item => item.id), eventOffset = events.length;
    const disclosure = await bench.prepare({ mode: 'chat', connectionID: 'fixture', modelID: 'probe', text });
    const entry = localMetrics.snapshots().find(item => !before.includes(item.id) && item.origin === 'conversation');
    assert.ok(entry); assert.ok(Number.isFinite(entry.prepare_ms));
    await bench.send({ text, fingerprint: disclosure.fingerprint, contextBinding: disclosure.contextBinding });
    for (let i = 0; i < 2000 && (bench.running || bench.finishing); i++) await delay(10);
    assert.equal(bench.running, false); assert.equal(Boolean(bench.finishing), false);
    const failures = events.slice(eventOffset).filter(event => ['engine.error', 'session.error'].includes(event.type));
    assert.deepEqual(failures, []);
    const result = localMetrics.snapshots().find(item => item.id === entry.id);
    assert.equal(result.outcome, 'completed');
    for (const key of ['prepare_ms', 'engine_start_ms', 'send_setup_ms', 'send_ack_ms']) assert.ok(Number.isFinite(result[key]) && result[key] >= 0, key);
    assert.ok(Number.isFinite(result.ttft_ms) || Number.isFinite(result.ttft_upper_bound_ms), 'actual or explicitly recovered content latency');
    assert.equal(posts.filter(body => body.text === text).length, 1, 'one immutable user prompt');
    assert.equal(result.prompt.user.bytes, Buffer.byteLength(text));
    assert.equal(result.prompt.reviewed.bytes, disclosure.appContext.components.reduce((sum, component) => sum + Buffer.byteLength(component.text), 0));
    assert.equal(result.prompt.system.bytes, Buffer.byteLength(bench.chat.runSystem));
    for (const component of disclosure.appContext.components) {
      assert.equal(component.hash, createHash('sha256').update(component.text).digest('hex'));
      assert.ok(bench.chat.runSystem.includes(component.text));
      assert.ok(provider.requests.some(request => JSON.stringify(request.body.messages).includes(JSON.stringify(component.text).slice(1, -1))), 'reviewed bytes reached the controlled provider');
    }
    assert.equal(JSON.stringify(result).includes(text), false);
    assert.equal(JSON.stringify(result).includes(root), false);
    observed.push(result);
  }
  assert.equal(observed[0].engineReused, false); assert.equal(observed[1].engineReused, true);
  assert.equal(observed[1].engine_start_ms, 0); assert.equal(posts.length, 2);
  assert.equal(await fs.readFile(path.join(project, 'unchanged.txt'), 'utf8'), 'Synthetic source remains unchanged.');
  t.diagnostic(JSON.stringify({ engineVersion: VERSION, provider: 'controlled-loopback', catalog: 'stubbed-selection', observations: observed }));
});
