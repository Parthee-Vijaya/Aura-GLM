// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const Module = require('node:module');
const { promisify } = require('node:util');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createHash } = require('node:crypto');
const { HybridEngineExecutor } = require('../core/privacy/hybrid-engine-executor.cjs');

// Execute complete, unchanged product modules with instance-local dependencies.
// No source extraction, global monkeypatch, require.cache mutation, real child,
// native sandbox, model, credential or network request is used in these tests.
function isolatedModule(relative, overrides) {
  const filename = path.resolve(__dirname, relative), owner = Module.createRequire(filename);
  const localRequire = name => Object.hasOwn(overrides, name) ? overrides[name] : owner(name);
  localRequire.resolve = owner.resolve;
  const module = { exports: {} };
  vm.runInThisContext(Module.wrap(fsSync.readFileSync(filename, 'utf8')), { filename })(module.exports, localRequire, module, filename, path.dirname(filename));
  return module.exports;
}
function latch() {
  let release, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  return { ready, release, async wait() { entered(); await held; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const macCodePath = { skip: process.platform !== 'darwin' ? 'Karakteriserer macOS-kodevejen med simulerede native kald; starter ingen sandbox.' : false, timeout: 10000 };

async function isolationFixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-lifecycle-characterization-')));
  const root = path.join(directory, 'project'), state = path.join(directory, 'state'), runtime = path.join(directory, 'runtime');
  for (const folder of [root, state, runtime]) await fs.mkdir(folder, { mode: 0o700 });
  const executable = path.join(runtime, 'node'), reaper = path.join(runtime, 'reaper'), source = path.join(directory, 'reaper.c');
  await fs.writeFile(executable, 'synthetic executable - never started', { mode: 0o500 });
  await fs.writeFile(reaper, 'synthetic reaper - never started', { mode: 0o500 });
  await fs.writeFile(source, 'synthetic source');
  await fs.writeFile(reaper + '.json', JSON.stringify({ version: 2, platform: process.platform, arch: process.arch, executableSha256: 'synthetic-digest', sourceSha256: createHash('sha256').update('synthetic source').digest('hex') }));
  const gate = latch(), countGate = latch(), calls = [], scopes = []; let pause = false, pauseCount = false;
  const localFS = { ...fs, async realpath(file, ...args) { if (pause && file === executable) { pause = false; await gate.wait(); } return fs.realpath(file, ...args); }, async mkdtemp(...args) { const value = await fs.mkdtemp(...args); scopes.push(value); return value; } };
  function execFile() { throw new Error('Unexpected callback subprocess invocation.'); }
  execFile[promisify.custom] = async (file, args) => {
    calls.push({ file, action: args[0] });
    if (args[0] === '--version') return { stdout: 'opencode v2.1.4\n', stderr: '' };
    if (file === '/usr/bin/codesign') return { stdout: '', stderr: '' };
    assert.equal(file, reaper, 'Only the synthetic helper may be requested.');
    if (args[0] === '--count' && pauseCount) { pauseCount = false; await countGate.wait(); }
    const value = args[0] === '--self-test' ? { available: true, implementation: 'macos-seatbelt-scope-v1' }
      : args[0] === '--stop' ? { writersStopped: true, matchingProcesses: 0, processTreeBoundary: 'inherited-seatbelt-scope' }
        : { matchingProcesses: 1 };
    return { stdout: JSON.stringify(value), stderr: '' };
  };
  const isolation = isolatedModule('../privacy/isolation/engine-isolation.cjs', {
    'node:fs/promises': localFS,
    'node:child_process': { execFile, spawn() { throw new Error('No actual process may be started by the characterization.'); } },
    './prepare-helper.cjs': { defaultHelperPath: () => reaper, sourcePath: source },
    './helper-integrity.cjs': { executableDigest: () => 'synthetic-digest' },
  });
  const leases = [];
  const createLease = async port => { const lease = await isolation.createEngineIsolation({ workspaceRoot: root, stateRoot: state, runtimeRoot: runtime, gatewayURL: 'http://127.0.0.1:40002/v1', enginePort: port || 40001, reaperPath: reaper }); leases.push(lease); return lease; };
  t.after(async () => { gate.release(); countGate.release(); for (const lease of leases) await lease.dispose(); for (const scope of scopes) await fs.rm(scope, { recursive: true, force: true }); await fs.rm(directory, { recursive: true, force: true }); });
  return { root, state, runtime, executable, reaper, execFile, createLease, gate, pause() { pause = true; }, countGate, pauseCount() { pauseCount = true; }, calls };
}

test('revoking an isolation lease during launchSpec must not return a later launch capability', macCodePath, async t => {
  const f = await isolationFixture(t), lease = await f.createLease();
  f.pause(); const pending = lease.launchSpec(f.executable, [], { cwd: f.root }); void pending.catch(() => {});
  await f.gate.ready; const retiring = lease.dispose(); f.gate.release();
  const [launch, retirement] = await Promise.allSettled([pending, retiring]);
  assert.equal(retirement.status, 'fulfilled');
  assert.equal(launch.status, 'rejected', 'Revocation must invalidate an already-entered launchSpec too.');
  assert.equal(launch.reason.code, 'PRIVACY_ISOLATION_UNAVAILABLE');
});

test('OpenCodeEngine close during launchSpec must prevent spawning after close has acknowledged', macCodePath, async t => {
  const f = await isolationFixture(t), children = [], events = [];
  const spawn = () => {
    const child = new EventEmitter(); child.exitCode = null; child.signalCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kills = [];
    child.kill = signal => { child.kills.push(signal || 'SIGTERM'); queueMicrotask(() => { child.exitCode = 0; child.stdout.end(); child.stderr.end(); child.emit('exit', 0, signal || 'SIGTERM'); }); return true; };
    children.push(child); queueMicrotask(() => child.emit('spawn')); return child;
  };
  const { OpenCodeEngine } = isolatedModule('../core/engine.cjs', {
    'node:child_process': { execFile: f.execFile, spawn },
    'node:net': { createServer() { const probe = new EventEmitter(); probe.listen = (_port, _host, callback) => queueMicrotask(callback); probe.address = () => ({ port: 40001 }); probe.close = callback => queueMicrotask(callback); return probe; } },
    './runtime.cjs': { get: () => ({ node: f.executable, opencode: f.executable }), gitEnvironment: value => value },
  });
  const engine = new OpenCodeEngine({ root: f.root, directory: f.state, provider: { npm: '@ai-sdk/openai-compatible', name: 'Synthetic', options: { baseURL: 'http://127.0.0.1:40002/v1', apiKey: 'synthetic-token' }, models: { fixture: { name: 'Fixture' } } }, model: { id: 'fixture' }, mode: 'chat', onEvent: event => events.push(event), privacyIsolation: async details => { const lease = await f.createLease(details.port); f.pause(); return lease; } });
  t.after(() => engine.close());
  const starting = engine.start(); void starting.catch(() => {});
  await f.gate.ready;
  const closing = engine.close();
  // Let both continuations finish. A future close that joins startup must not
  // deadlock this test; no fixed sleep is used to stand in for synchronization.
  f.gate.release(); const [start, close] = await Promise.allSettled([starting, closing]);
  t.diagnostic(JSON.stringify({ start: start.status, startError: start.reason?.name, close: close.status, spawnedAfterCloseRequested: children.length, childrenNotRetired: children.filter(child => child.exitCode === null).length, emittedEvents: events.map(event => event.type) }));
  assert.equal(close.status, 'fulfilled'); assert.equal(start.status, 'rejected');
  assert.equal(children.length, 0, 'A launch blocked before spawn must remain blocked once close requests retirement.');
  assert.notEqual(start.reason?.name, 'TypeError', 'Cancellation is a controlled lifecycle result, not a cleared-lease dereference.');
});

test('Hybrid executor ignores late permission, completion and start events after Stop and retires its lease once', { timeout: 10000 }, async t => {
  const gate = latch(), controller = new AbortController(), effects = { sends: 0, permissions: 0, replies: 0, releases: 0, events: [] }; let emit, starting;
  const engine = { active: false, session: { id: 'ses_characterization' }, start() { return starting = gate.wait().then(() => { engine.active = true; }); }, async send() { effects.sends++; }, async abort() {}, async close() { engine.active = false; }, async reply() { effects.replies++; }, async answerQuestion() {} };
  const executor = new HybridEngineExecutor({ resolveSelection: async () => ({ connection: { id: 'selected', kind: 'compatible', baseURL: 'http://127.0.0.1:40002/v1' }, model: { id: 'fixture' } }),
    authorizeStage: async () => true, preparePartition: async stage => ({ root: '/synthetic/project', directory: '/synthetic/state', mode: stage.mode }), validateLease: async () => true,
    releaseLease: async () => { effects.releases++; return true; }, createGateway: async () => ({ url: 'http://127.0.0.1:40002/v1', token: 'synthetic-token', abort() {}, async close() {} }),
    createEngine: options => { emit = options.onEvent; return engine; }, requestPermission: async () => { effects.permissions++; return { allow: true }; }, onEvent: event => effects.events.push(event.type) });
  t.after(async () => { gate.release(); await starting; await executor.dispose(); });
  const running = executor.execute({ taskID: 'synthetic-task', partitionID: 'synthetic-partition', stageID: 'synthetic-stage', kind: 'cloud', mode: 'chat', destinationRef: 'selected', destination: { id: 'selected', model: 'fixture', route: '', endpoint: 'http://127.0.0.1:40002/v1' }, engineSessionID: null, materials: [{ text: 'Synthetic task' }], signal: controller.signal, dispatch: async () => { throw new Error('No model dispatch is allowed.'); } }); void running.catch(() => {});
  await gate.ready; controller.abort(); await assert.rejects(running, { code: 'PRIVACY_ABORTED' });
  gate.release(); await starting; await tick();
  emit({ type: 'permission.asked', properties: { id: 'late-permission', sessionID: engine.session.id } });
  emit({ type: 'session.idle', properties: { sessionID: engine.session.id } });
  emit({ type: 'engine.error', properties: {} }); await tick();
  assert.deepEqual(effects, { sends: 0, permissions: 0, replies: 0, releases: 1, events: [] });
});


test('a revoked lease rejects an in-flight attestation even if its previous process count arrives late', macCodePath, async t => {
  const f = await isolationFixture(t), lease = await f.createLease();
  await lease.launchSpec(f.executable, [], { cwd: f.root });
  f.pauseCount(); const checking = lease.attest(); void checking.catch(() => {});
  await f.countGate.ready; const closing = lease.dispose(); f.countGate.release();
  await assert.rejects(checking, { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
  await closing; assert.equal(f.calls.filter(call => call.action === '--stop').length, 1);
});

test('concurrent launch validation grants exactly one process capability', macCodePath, async t => {
  const f = await isolationFixture(t), lease = await f.createLease();
  f.pause(); const earlier = lease.launchSpec(f.executable, [], { cwd: f.root }); void earlier.catch(() => {});
  await f.gate.ready; const winner = await lease.launchSpec(f.executable, [], { cwd: f.root }); f.gate.release();
  assert.ok(winner.file); await assert.rejects(earlier, { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
});

async function controlledEngine(t, { gateAt, synchronousExit = false, disposalError = null } = {}) {
  const f = await isolationFixture(t), gate = latch(), children = [], events = [], calls = { create: 0, verify: 0, launch: 0, attest: 0, dispose: 0, requests: 0 };
  const step = async name => { calls[name]++; if (gateAt === name) await gate.wait(); };
  const lease = {
    async verify() { await step('verify'); return { available: true }; },
    async launchSpec(file, args, options) { await step('launch'); return { file, args, options }; },
    async attest() { await step('attest'); return { scoped: true }; },
    async dispose() { calls.dispose++; if (disposalError) throw disposalError; },
  };
  const spawn = () => {
    const child = new EventEmitter(); child.pid = 1; child.exitCode = null; child.signalCode = null;
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kills = [];
    child.kill = signal => {
      child.kills.push(signal || 'SIGTERM');
      const exit = () => { child.signalCode = signal || 'SIGTERM'; child.stdout.end(); child.stderr.end(); child.emit('exit', null, child.signalCode); };
      synchronousExit ? exit() : queueMicrotask(exit); return true;
    };
    children.push(child);
    if (gateAt === 'url') child.stdout.on('newListener', name => {
      if (name === 'data') queueMicrotask(async () => { await gate.wait(); child.stdout.emit('data', Buffer.from('http://127.0.0.1:40001')); });
    });
    queueMicrotask(async () => { if (gateAt === 'spawn') await gate.wait(); child.emit('spawn'); });
    return child;
  };
  const { OpenCodeEngine } = isolatedModule('../core/engine.cjs', {
    'node:child_process': { execFile: f.execFile, spawn },
    'node:net': { createServer() { const probe = new EventEmitter(); probe.listen = (_port, _host, callback) => queueMicrotask(callback); probe.address = () => ({ port: 40001 }); probe.close = callback => queueMicrotask(callback); return probe; } },
    './runtime.cjs': { get: () => ({ node: f.executable, opencode: f.executable }), gitEnvironment: value => value },
  });
  const engine = new OpenCodeEngine({ root: f.root, directory: f.state, provider: { npm: '@ai-sdk/openai-compatible', name: 'Synthetic', options: { baseURL: 'http://127.0.0.1:40002/v1', apiKey: 'synthetic-token' }, models: { fixture: { name: 'Fixture' } } }, model: { id: 'fixture' }, mode: 'chat', onEvent: event => events.push(event), privacyIsolation: async () => { await step('create'); return lease; } });
  engine.request = engine.wire = async () => { calls.requests++; throw new Error('No request may occur after a cancelled startup.'); };
  t.after(async () => { gate.release(); try { await engine.close(); } catch (error) { if (error !== disposalError) throw error; } });
  return { engine, gate, children, events, calls };
}

test('close joins pending isolation ownership and suppresses late validation and attestation', macCodePath, async t => {
  for (const gateAt of ['create', 'verify', 'launch', 'attest']) await t.test(gateAt, async t => {
    const f = await controlledEngine(t, { gateAt, synchronousExit: true });
    const starting = f.engine.start(); void starting.catch(() => {});
    assert.equal(f.engine.start(), starting, 'Concurrent starts must share one owner.');
    await f.gate.ready;
    let closed = false; const closing = f.engine.close(); closing.then(() => { closed = true; });
    assert.equal(f.engine.close(), closing, 'Concurrent closes must join the same retirement.');
    await tick(); assert.equal(closed, false, 'Close must await the lease/start continuation it owns.');
    f.gate.release(); await assert.rejects(starting, /stoppet/); await closing;
    assert.equal(f.calls.dispose, 1); assert.equal(f.calls.requests, 0); assert.equal(f.engine.active, false);
    assert.equal(f.children.length, gateAt === 'attest' ? 1 : 0);
    for (const child of f.children) assert.deepEqual(child.kills, ['SIGTERM'], 'Close and startup failure share one child retirement, including synchronous exit.');
    f.engine.handleEvent({ type: 'permission.asked', properties: { id: 'late', sessionID: 'late' } });
    f.engine.handleEvent({ type: 'session.idle', properties: {} });
    assert.deepEqual(f.events, []); assert.equal(f.engine.pending.size, 0);
    await f.engine.close(); assert.equal(f.calls.dispose, 1);
    await assert.rejects(f.engine.start(), /lukket/); assert.equal(f.calls.create, 1);
  });
});

test('close cancels a pending spawn and a late spawn event cannot start attestation or a session', macCodePath, async t => {
  const f = await controlledEngine(t, { gateAt: 'spawn' });
  const starting = f.engine.start(); void starting.catch(() => {}); await f.gate.ready;
  await f.engine.close(); await assert.rejects(starting, /stoppet/);
  f.gate.release(); await tick();
  assert.deepEqual(f.children[0].kills, ['SIGTERM']); assert.equal(f.calls.attest, 0);
  assert.equal(f.calls.dispose, 1); assert.equal(f.calls.requests, 0); assert.deepEqual(f.events, []);
});

test('a process error during attestation stays handled and retires the exact process and lease once', macCodePath, async t => {
  const f = await controlledEngine(t, { gateAt: 'attest' });
  const starting = f.engine.start(); void starting.catch(() => {}); await f.gate.ready;
  f.children[0].emit('error', new Error('Synthetic process error')); f.gate.release();
  await assert.rejects(starting, /afsluttede under opstart/); await f.engine.close();
  assert.deepEqual(f.children[0].kills, ['SIGTERM']); assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.requests, 0); assert.deepEqual(f.events, []);
});


test('a failed isolation retirement remains a failed close and is never acknowledged as clean', macCodePath, async t => {
  const disposalError = new Error('Synthetic retirement could not confirm zero processes');
  const f = await controlledEngine(t, { gateAt: 'attest', disposalError });
  const starting = f.engine.start(); void starting.catch(() => {}); await f.gate.ready;
  const closing = f.engine.close(); void closing.catch(() => {}); f.gate.release();
  await assert.rejects(starting, error => error === disposalError);
  await assert.rejects(closing, error => error === disposalError);
  assert.equal(f.engine.close(), closing); assert.equal(f.calls.dispose, 1);
  assert.deepEqual(f.children[0].kills, ['SIGTERM']); assert.equal(f.engine.active, false); assert.equal(f.calls.requests, 0);
});


test('close cancels startup URL wait and ignores a late URL without contacting the engine', macCodePath, async t => {
  const f = await controlledEngine(t, { gateAt: 'url' });
  const starting = f.engine.start(); void starting.catch(() => {}); await f.gate.ready;
  await f.engine.close(); await assert.rejects(starting, /afsluttede under opstart/);
  f.gate.release(); await tick();
  assert.deepEqual(f.children[0].kills, ['SIGTERM']); assert.equal(f.calls.dispose, 1);
  assert.equal(f.calls.requests, 0); assert.deepEqual(f.events, []); assert.equal(f.engine.active, false);
});
