'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Workbench } = require('../core/workbench.cjs');
const requiredBuildSkills = require('./fixtures/required-build-skills.cjs');

const profiles = path.resolve(__dirname, '../../profiles');
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// Faktisk samtale-, opgave-, godkendelses- og diskhistoriklogik. Kun den eksterne
// motor er kontrolleret; ingen model, nøglering eller brugerprojekter kontaktes.
async function fixture(t) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-lifecycle-characterization-')));
  const root = path.join(directory, 'project'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'source.txt'), 'Synthetic unchanged source.');
  const events = [], engines = [], releases = [], finishCalls = [], saves = [], gates = [];
  const bench = new Workbench({ directory: path.join(directory, 'profile'), profiles, safeStorage: {}, emit: event => events.push(event), engineFactory: options => {
    const engine = { active: false, session: { id: 'synthetic-session' }, pending: new Map(), sent: [], replies: [], aborts: 0, closes: 0,
      async start() { this.active = true; },
      async send(...args) { this.sent.push(args); },
      async reply(...args) { this.replies.push(args); this.pending.delete(args[0]); },
      async abort() { this.aborts++; },
      async close() { this.closes++; this.active = false; },
      event: event => options.onEvent(event),
    };
    engines.push(engine); return engine;
  } });
  await bench.activate({ root, name: 'Synthetic lifecycle' });
  const chat = bench.chat;
  const release = bench.release.bind(bench);
  bench.release = owner => { releases.push({ owner: owner.id, held: bench.claims.get(owner.root) === owner }); return release(owner); };
  const finish = chat.finishTask.bind(chat);
  chat.finishTask = (...args) => { finishCalls.push({ status: args[0], task: chat.task?.id || null }); return finish(...args); };
  const save = chat.saveHistory.bind(chat);
  chat.saveHistory = async (...args) => { saves.push(args[0]); return save(...args); };
  t.after(async () => { for (const gate of gates) gate.resolve(); await bench.close(); await fs.rm(directory, { recursive: true, force: true }); });
  function pause(target, method, at = 1) {
    const reached = deferred(), gate = deferred(), original = target[method].bind(target); let calls = 0;
    gates.push(gate);
    target[method] = async (...args) => { if (++calls === at) { reached.resolve(); await gate.promise; } return original(...args); };
    return { entered: reached.promise, release: gate.resolve };
  }
  async function send() {
    chat.prepared = { mode: 'free', root, disclosure: { fingerprint: 'synthetic', consentKey: 'synthetic' },
      connection: { id: 'fixture', kind: 'compatible', name: 'Controlled engine', baseURL: 'http://127.0.0.1:1/v1' },
      model: { id: 'fixture' }, references: [], context: { rules: '', skills: requiredBuildSkills(), titles: [], features: {} } };
    await bench.send({ text: 'Synthetic lifecycle request', fingerprint: 'synthetic' });
    assert.equal(chat.running, true); assert.equal(bench.claims.get(root), chat);
    return chat.engine;
  }
  async function settled(status, { reviews = 1, releaseCalls = 1 } = {}) {
    await chat.finishing; await bench.history.queue;
    assert.equal(chat.running, false); assert.equal(bench.claims.has(root), false);
    assert.equal(chat.changes.tasks.length, 1, 'one persisted task result');
    assert.equal(finishCalls.filter(call => call.task).length, 1, 'one owner finalizes the task');
    assert.equal(releases.filter(call => call.held).length, 1, 'project claim is released once');
    assert.equal(releases.length, releaseCalls, 'no competing release attempts');
    assert.equal(events.filter(event => event.type === 'run.review').length, reviews, 'one result presentation');
    assert.equal((await bench.history.readChat(root, chat.id)).status, status, 'saved history is terminal');
    assert.equal(chat.changes.tasks[0].status, status, 'task agrees with saved history');
    assert.equal(await fs.readFile(path.join(root, 'source.txt'), 'utf8'), 'Synthetic unchanged source.');
  }
  async function ask(id = 'permission') {
    const p = { id, permission: 'edit', patterns: ['source.txt'], metadata: { filepath: path.join(root, 'source.txt') } };
    chat.engine.pending.set(id, p);
    await chat.permissionAsked({ type: 'permission.asked', properties: p });
    return p;
  }
  async function observation() {
    return { finalizations: finishCalls.map(call => ({ status: call.status, hasTask: Boolean(call.task) })),
      releases: releases.map(call => call.held), reviews: events.filter(event => event.type === 'run.review').map(event => event.status),
      taskStatuses: chat.changes.tasks.map(task => task.status), historyStatus: (await bench.history.readChat(root, chat.id)).status };
  }
  return { bench, chat, root, events, engines, releases, finishCalls, saves, pause, send, settled, ask, observation };
}

for (const first of ['session.idle', 'session.error', 'engine.error']) test(`duplicate terminal events after ${first} keep one finalization and release`, { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(f.chat.checkpoints, 'finish');
  engine.event({ type: first, message: 'Synthetic failure' }); await gate.entered;
  const finishing = f.chat.finishing;
  for (const type of ['session.idle', 'session.error', 'engine.error', 'session.idle']) engine.event({ type, message: 'Synthetic duplicate' });
  assert.equal(f.chat.finishing, finishing); assert.equal(f.releases.length, 0);
  gate.release(); await finishing;
  await f.settled(first === 'session.idle' ? 'idle' : 'error');
});

test('Stop during terminal finalization rejects instead of taking ownership twice', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(f.chat.checkpoints, 'finish');
  engine.event({ type: 'session.idle' }); await gate.entered;
  await assert.rejects(f.chat.stop(), /Afslutningen er i gang/);
  assert.equal(engine.aborts, 0); assert.equal(f.chat.runStopped, false);
  gate.release(); await f.chat.finishing; await f.settled('idle');
});

test('close waits for an existing finalization and preserves the single terminal history', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(f.chat.checkpoints, 'finish');
  engine.event({ type: 'session.idle' }); await gate.entered;
  const closing = f.chat.close();
  assert.equal(engine.closes, 0); assert.equal(f.releases.length, 0);
  gate.release(); await closing; await f.settled('idle');
  assert.equal(engine.closes, 1); assert.equal(f.chat.engine, null);
});

test('Stop owns abort-triggered idle and error events without duplicate results', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(engine, 'abort');
  const stopping = f.chat.stop(); await gate.entered;
  for (const type of ['session.idle', 'session.error', 'engine.error']) engine.event({ type, message: 'Synthetic abort response' });
  assert.equal(f.chat.finishing, null); assert.equal(f.releases.length, 0);
  gate.release(); await stopping; await f.settled('stopped');
  assert.equal(engine.aborts, 1); assert.equal(engine.sent.length, 1);
});

test('late permission-policy resolution after Stop cannot offer or answer an approval', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(f.bench.approvalsPolicy, 'allowed');
  const asking = f.ask(); await gate.entered;
  await f.chat.stop(); gate.release(); await asking;
  assert.equal(f.chat.approvals.size, 0); assert.equal(engine.replies.length, 0);
  assert.equal(f.events.some(event => event.type === 'permission.asked'), false);
  await f.settled('stopped');
});

test('Stop during automatic permission revalidation cancels the queued allowance', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send();
  const p = { id: 'automatic', permission: 'edit', patterns: ['source.txt'], metadata: { filepath: path.join(f.root, 'source.txt') } };
  const context = f.chat.approvalContext(), descriptor = await f.bench.approvalsPolicy.describe(context, p);
  await f.bench.approvalsPolicy.grant(context, p, { scope: 'task', fingerprint: descriptor.fingerprint });
  const gate = f.pause(f.bench.approvalsPolicy, 'allowed', 2);
  const asking = f.ask('automatic'); await gate.entered;
  await f.chat.stop(); gate.release(); await asking;
  assert.equal(engine.replies.length, 0); assert.equal(f.chat.approvals.size, 0);
  assert.equal(f.events.some(event => event.type === 'permission.auto'), false);
  await f.settled('stopped');
});

for (const validation of [1, 2]) test(`Stop during approval validation ${validation} prevents its engine reply`, { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(); await f.ask();
  assert.equal(f.chat.approvals.size, 1);
  const gate = f.pause(f.bench.approvalsPolicy, 'describe', validation);
  const replying = f.chat.reply({ id: 'permission', allow: true });
  const rejected = assert.rejects(replying, /ændret|findes ikke længere/);
  await gate.entered; await f.chat.stop(); gate.release(); await rejected;
  assert.equal(engine.replies.length, 0); assert.equal(f.chat.approvals.size, 0);
  assert.equal(f.chat.changes.activity.get('approval-permission').status, 'expired');
  await f.settled('stopped');
});

test('late permission and terminal events after Stop cannot reopen or refinalize the task', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(); await f.chat.stop();
  await f.ask('late');
  for (const type of ['session.idle', 'engine.error', 'session.error']) engine.event({ type, message: 'Synthetic late failure' });
  await assert.rejects(f.chat.reply({ id: 'late', allow: true }), /findes ikke længere/);
  assert.equal(f.chat.approvals.size, 0); assert.equal(engine.replies.length, 0);
  assert.equal(f.chat.waiting, false); await f.settled('stopped');
});

test('concurrent closes interrupt a running task exactly once', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send();
  await Promise.all([f.chat.close(), f.chat.close()]);
  await f.settled('interrupted', { reviews: 0 }); assert.equal(engine.closes, 1);
});

test('concurrent Stop calls produce exactly one result and release', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(engine, 'abort');
  const first = f.chat.stop(); await gate.entered;
  const second = f.chat.stop();
  gate.release(); await Promise.all([first, second]);
  t.diagnostic(JSON.stringify(await f.observation()));
  await f.settled('stopped');
});

test('close during pending Stop cannot finalize the same task with a conflicting status', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(engine, 'abort');
  const stopping = f.chat.stop(); await gate.entered;
  const closing = f.chat.close();
  await Promise.resolve();
  const releasedBeforeAbort = !f.bench.claims.has(f.root);
  assert.equal(releasedBeforeAbort, false); assert.equal(engine.closes, 0);
  gate.release(); await Promise.all([stopping, closing]);
  t.diagnostic(JSON.stringify({ releasedBeforeAbort, ...(await f.observation()) }));
  await f.settled('stopped');
});

test('Stop joins an already started close without overwriting its interruption', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send();
  const closing = f.chat.close(), stopping = f.chat.stop();
  await Promise.all([closing, stopping]);
  await f.settled('interrupted', { reviews: 0 });
  assert.equal(engine.aborts, 0); assert.equal(engine.closes, 1);
});

test('a pending Stop history write blocks a new run and is shared with duplicate Stop and close', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(f.chat, 'saveHistory');
  const stopping = f.chat.stop(); await gate.entered;
  assert.equal(f.chat.running, false, 'the task has ended but its terminal history is still pending');
  await assert.rejects(f.chat.prepare({ mode: 'free' }), /Vent på opgaven/);
  await assert.rejects(f.chat.send({ text: 'A new task must not start', fingerprint: 'synthetic' }), /allerede en opgave/);
  const repeated = f.chat.stop(), closing = f.chat.close();
  assert.equal(engine.aborts, 1); assert.equal(engine.closes, 0);
  gate.release(); await Promise.all([stopping, repeated, closing]);
  await f.settled('stopped');
  assert.equal(engine.sent.length, 1); assert.equal(engine.closes, 1);
});

test('engine-only close waits for Stop while preserving its terminal history', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(), gate = f.pause(engine, 'abort');
  const stopping = f.chat.stop(); await gate.entered;
  const closing = f.chat.close(false); await Promise.resolve();
  assert.equal(engine.closes, 0); assert.equal(f.bench.claims.get(f.root), f.chat);
  gate.release(); await Promise.all([stopping, closing]);
  await f.settled('stopped'); assert.equal(engine.closes, 1);
});

test('repeated public Stop after completion is a no-op, including a subsequently reviewed plan', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send(); await f.bench.stop();
  const plan = f.chat.plan = { id: 'reviewed-after-stop', text: 'A new reviewed plan', source: 'dig', at: 1 };
  await f.chat.persistPlan();
  const generation = f.chat.generation, eventCount = f.events.length, activityCount = f.chat.activityList().length;
  await f.bench.stop(); await f.bench.stop();
  assert.equal(f.chat.plan, plan); assert.equal(f.chat.generation, generation);
  assert.equal(f.events.length, eventCount); assert.equal(f.chat.activityList().length, activityCount);
  assert.equal(engine.aborts, 1); await f.settled('stopped');
  assert.equal((await f.bench.history.readChat(f.root, f.chat.id)).plan.id, plan.id);
});

test('public Stop after normal completion preserves the generated plan and idle history', { timeout: 10000 }, async t => {
  const f = await fixture(t), engine = await f.send();
  f.chat.runMode = 'plan';
  const text = '## Det bygger vi\nEn lokal side.\n## Sådan skal det se ud\nEn tydelig overskrift.\n## Teknik og data\nHTML uden netværk.\n## Det skal du prøve\nLæs overskriften.';
  engine.event({ type: 'message.updated', properties: { info: { id: 'answer', role: 'assistant' } } });
  engine.event({ type: 'message.part.updated', properties: { part: { id: 'answer-text', messageID: 'answer', type: 'text', text } } });
  engine.event({ type: 'session.idle' }); await f.chat.finishing;
  const plan = f.chat.plan; assert.ok(plan?.id);
  const generation = f.chat.generation, eventCount = f.events.length;
  await f.bench.stop(); await f.bench.stop();
  assert.equal(f.chat.plan, plan); assert.equal(f.chat.generation, generation);
  assert.equal(f.events.length, eventCount); assert.equal(engine.aborts, 0);
  await f.settled('idle');
  assert.equal((await f.bench.history.readChat(f.root, f.chat.id)).plan.id, plan.id);
});

test('public Stop in a fresh idle conversation changes no history or activity', { timeout: 10000 }, async t => {
  const f = await fixture(t), before = await f.bench.history.readChat(f.root, f.chat.id);
  const eventCount = f.events.length, activityCount = f.chat.activityList().length;
  await f.bench.stop();
  assert.deepEqual(await f.bench.history.readChat(f.root, f.chat.id), before);
  assert.equal(f.events.length, eventCount); assert.equal(f.chat.activityList().length, activityCount);
  assert.equal(f.releases.length, 0); assert.equal(f.finishCalls.length, 0);
});
