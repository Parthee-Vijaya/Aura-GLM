'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { ChildProcess } = require('node:child_process');
const { Workbench } = require('../core/workbench.cjs');
const requiredBuildSkills = require('./fixtures/required-build-skills.cjs');

const profiles = path.resolve(__dirname, '../../profiles');
const baseSeed = 0x41555241;
const terminalEvents = ['session.idle', 'session.error', 'engine.error'];
const scenarios = ['finish-owner', 'stop-abort', 'stop-history', 'close-owner', 'approval-validation', 'question-ack', 'terminal-noop', 'idle-before-ack'];

function random(seed) {
  let state = seed >>> 0;
  return max => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % max; };
}
function shuffled(values, next) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = next(i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

// This is characterization of the real Workbench/ChatSession completion paths,
// not a replacement state-machine model. The sole engine is already connected:
// startup, gateways, native isolation, quality repair and actual AI are separate
// tests. No process or even loopback server is allowed in this suite.
async function fixture(t, seed, trace) {
  const forbidden = [];
  const forbid = name => function () { forbidden.push(name); throw new Error(`Unexpected external operation: ${name}`); };
  t.mock.method(net.Server.prototype, 'listen', forbid('server.listen'));
  t.mock.method(net.Socket.prototype, 'connect', forbid('socket.connect'));
  t.mock.method(ChildProcess.prototype, 'spawn', forbid('process.spawn'));
  t.mock.method(globalThis, 'fetch', forbid('fetch'));
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-completion-sequences-')));
  const root = path.join(directory, 'project'); await fs.mkdir(root);
  const originalSource = 'Synthetic unchanged source.';
  await fs.writeFile(path.join(root, 'source.txt'), originalSource);
  const events = [], releases = [], finalizations = [], saves = [], gates = [], pending = [];
  const bench = new Workbench({ directory: path.join(directory, 'profile'), profiles, safeStorage: {}, emit: event => events.push(event), engineFactory: forbid('engineFactory') });
  await bench.activate({ root, name: 'Synthetic sequence' });
  const chat = bench.chat;
  assert.ok(chat, 'actual disk-backed conversation was opened');
  const engine = {
    active: true, session: { id: `synthetic-${seed}` }, pending: new Map(), sent: [], replies: [], requests: [], aborts: 0, closes: 0,
    async send(...args) { this.sent.push(args); },
    async reply(...args) { this.replies.push(args); this.pending.delete(args[0]); },
    async request(...args) { this.requests.push(args); return true; },
    async abort() { this.aborts++; },
    async close() { this.closes++; this.active = false; },
    event(event) { if (chat.engine === engine) return chat.event(event); },
  };
  chat.engine = engine; chat.engineIdentity = 'synthetic'; chat.engineConversation = '';
  const plan = { id: `reviewed-${seed}`, text: 'Build the reviewed local page.', source: 'dig', at: 1 };
  chat.plan = plan; await chat.persistPlan();
  chat.prepared = { mode: 'build', root, disclosure: { fingerprint: 'synthetic', consentKey: 'synthetic', planID: plan.id },
    connection: { id: 'fixture', kind: 'compatible', name: 'Controlled engine', baseURL: 'http://127.0.0.1:1/v1' },
    model: { id: 'fixture' }, references: [], context: { rules: '', skills: requiredBuildSkills(), titles: [], features: {} } };
  const release = bench.release.bind(bench);
  bench.release = owner => { releases.push({ id: owner.id, held: bench.claims.get(owner.root) === owner }); return release(owner); };
  const finish = chat.finishTask.bind(chat);
  chat.finishTask = (...args) => { finalizations.push({ status: args[0], task: chat.task?.id || null }); return finish(...args); };
  const save = chat.saveHistory.bind(chat);
  chat.saveHistory = (...args) => { saves.push(args[0]); return save(...args); };
  const briefWrites = [];
  const storeBrief = bench.storeBrief.bind(bench);
  bench.storeBrief = (...args) => { briefWrites.push(args); return storeBrief(...args); };
  t.after(async () => {
    for (const gate of gates) gate.resolve();
    await Promise.allSettled(pending);
    await bench.close();
    await fs.rm(directory, { recursive: true, force: true });
    assert.deepEqual(forbidden, [], 'no network, process, native engine or model was used');
  });
  function track(promise) { pending.push(promise); return promise; }
  function pause(target, method, { at = 1, after = false } = {}) {
    const entered = deferred(), gate = deferred(), original = target[method].bind(target); let calls = 0;
    gates.push(gate);
    target[method] = async (...args) => {
      if (++calls !== at) return original(...args);
      const result = after ? await original(...args) : undefined;
      entered.resolve(); await gate.promise;
      return after ? result : original(...args);
    };
    return { entered: entered.promise, release() { trace.push(`release:${method}`); gate.resolve(); } };
  }
  function send() { trace.push('send'); return track(bench.send({ text: 'Synthetic lifecycle request', fingerprint: 'synthetic' })); }
  function event(type) { trace.push(type); return engine.event({ type, message: 'Synthetic lifecycle event' }); }
  async function blocked() {
    trace.push('reject:prepare+send');
    await assert.rejects(chat.prepare({ mode: 'build' }), /Vent på opgaven/);
    await assert.rejects(chat.send({ text: 'Must not start a second run', fingerprint: 'synthetic' }), /allerede en opgave/);
  }
  function askQuestion(id = 'question') {
    trace.push(`question:${id}`);
    engine.event({ type: 'question.asked', properties: { id, sessionID: engine.session.id, questions: [{ question: 'Who uses this synthetic page?', header: 'Users', options: [] }] } });
  }
  async function askPermission(id = 'permission') {
    trace.push(`permission:${id}`);
    const p = { id, permission: 'edit', patterns: ['source.txt'], metadata: { filepath: path.join(root, 'source.txt') } };
    engine.pending.set(id, p); await chat.permissionAsked({ type: 'permission.asked', properties: p });
  }
  async function settled(status, { reviews = 1, replacementPlan = null } = {}) {
    await chat.finishing; await bench.history.queue;
    assert.equal(chat.running, false); assert.equal(chat.starting, false); assert.equal(chat.sending, false);
    assert.equal(chat.finishing, null); assert.equal(chat.stopping, null); assert.equal(chat.closing, null);
    assert.equal(bench.claims.has(root), false);
    assert.equal(chat.changes.tasks.length, 1, 'one task result');
    assert.equal(finalizations.length, 1, 'one finalization attempt');
    assert.ok(finalizations[0].task, 'the finalizer owns the task');
    assert.equal(finalizations[0].status, status);
    assert.deepEqual(releases.map(item => item.held), [true], 'one release, held by this conversation');
    assert.equal(events.filter(item => item.type === 'run.review').length, reviews, 'one presentation, or none for interruption');
    assert.equal(events.some(item => item.type === 'run.review' && item.unavailable), false, 'no swallowed finalization failure');
    const disk = await bench.history.readChat(root, chat.id);
    assert.equal(disk.status, status); assert.equal(chat.changes.tasks[0].status, status);
    assert.equal(saves.filter(value => value !== 'working').length, 1, 'one terminal history write');
    assert.equal(disk.messages.filter(item => item.role === 'user').length, 1, 'user prompt persisted once');
    assert.equal(engine.sent.length, 1, 'no prompt replay');
    assert.equal(engine.replies.length, 0, 'no stale or implicit approval reply');
    assert.ok(engine.requests.length <= 1, 'question response is not replayed');
    assert.ok(engine.closes <= 1, 'engine teardown has one owner');
    assert.equal(chat.approvals.size, 0); assert.equal(chat.questions.size, 0);
    assert.equal(await fs.readFile(path.join(root, 'source.txt'), 'utf8'), originalSource);
    assert.equal(chat.gateway, null, 'the controlled active engine never opens a gateway');
    assert.deepEqual(forbidden, []);
    if (replacementPlan) { assert.equal(chat.plan, replacementPlan); assert.equal(disk.plan?.id, replacementPlan.id); }
    else if (status === 'stopped') { assert.equal(chat.plan, null); assert.equal(disk.lastPlan?.id, plan.id); assert.equal(disk.lastPlan?.reason, 'stoppet'); }
    else { assert.equal(chat.plan?.id, plan.id); assert.equal(disk.plan?.id, plan.id); assert.equal(Boolean(disk.plan?.builtAt), status === 'idle'); }
  }
  return { bench, chat, engine, events, releases, finalizations, briefWrites, plan, pause, track, send, event, blocked, askQuestion, askPermission, settled };
}

async function runSequence(f, scenario, next, trace) {
  const { chat, engine } = f;
  const noise = () => shuffled([...terminalEvents, terminalEvents[next(3)]], next);
  const competing = [];
  function stop() { trace.push('stop'); const result = f.track(chat.stop()); competing.push(result); return result; }
  function close(reset = true) { trace.push(`close:${reset}`); const result = f.track(chat.close(reset)); competing.push(result); return result; }
  async function terminalNoise() { for (const type of noise()) { f.event(type); if (next(2)) await Promise.resolve(); } }
  async function stoppedApprovals() {
    f.askQuestion('late'); await f.askPermission('late');
    await assert.rejects(chat.reply({ id: 'late', allow: true }), chat.engine ? /findes ikke længere/ : /Ingen aktiv agent/);
    await assert.rejects(chat.question({ id: 'late', answers: [['Late answer']] }), chat.engine ? /ikke længere aktuelt/ : /Ugyldigt svar/);
  }
  if (scenario === 'idle-before-ack') {
    const ack = f.pause(engine, 'send', { after: true });
    const sending = f.send(); await ack.entered;
    assert.equal(engine.sent.length, 1); assert.equal(chat.sending, true); assert.equal(chat.starting, true);
    const finish = f.pause(chat.checkpoints, 'finish'); f.event('session.idle'); await finish.entered;
    await terminalNoise(); await f.blocked(); finish.release(); await chat.finishing;
    assert.equal(chat.running, false); assert.equal(chat.sending, true, 'terminal result does not acknowledge the pending send');
    await f.blocked(); ack.release(); await sending;
    await f.settled('idle'); return;
  }
  await f.send(); assert.equal(chat.running, true); assert.equal(f.bench.claims.get(chat.root), chat);
  if (scenario === 'finish-owner') {
    const gate = f.pause(chat.checkpoints, 'finish'), first = terminalEvents[next(3)];
    f.event(first); await gate.entered;
    const owner = chat.finishing;
    for (const action of shuffled(['noise', 'blocked', 'stop', 'close'], next)) {
      trace.push(`during-finish:${action}`);
      if (action === 'noise') await terminalNoise();
      if (action === 'blocked') await f.blocked();
      if (action === 'stop') {
        // Once close owns shutdown, Stop joins it. Otherwise it must reject
        // without taking over the terminal result already being persisted.
        if (chat.closing) stop(); else await assert.rejects(chat.stop(), /Afslutningen er i gang/);
      }
      if (action === 'close' && next(2)) { close(); if (next(2)) close(); }
    }
    assert.equal(chat.finishing, owner); assert.equal(f.releases.length, 0); assert.equal(engine.aborts, 0);
    gate.release(); await owner; await Promise.all(competing);
    await f.settled(first === 'session.idle' ? 'idle' : 'error');
  } else if (scenario === 'stop-abort' || scenario === 'stop-history') {
    const gate = scenario === 'stop-abort' ? f.pause(engine, 'abort') : f.pause(chat, 'saveHistory');
    const stopping = stop(); await gate.entered;
    if (scenario === 'stop-history') assert.equal(chat.running, false, 'history remains an active barrier after running ends');
    for (const action of shuffled(['noise', 'blocked', 'stop', 'close'], next)) {
      trace.push(`during-${scenario}:${action}`);
      if (action === 'noise') await terminalNoise();
      if (action === 'blocked') await f.blocked();
      if (action === 'stop') { stop(); if (next(2)) stop(); }
      if (action === 'close' && next(2)) close(Boolean(next(2)));
    }
    assert.equal(engine.closes, 0); assert.equal(chat.finishing, null);
    gate.release(); await stopping; await Promise.all(competing);
    await stoppedApprovals(); await f.settled('stopped'); assert.equal(engine.aborts, 1);
  } else if (scenario === 'close-owner') {
    const gate = f.pause(engine, 'close'); const closing = close(); await gate.entered;
    assert.equal(chat.running, false); assert.equal(chat.engine, null);
    for (const action of shuffled(['noise', 'blocked', 'stop', 'close'], next)) {
      trace.push(`during-close:${action}`);
      if (action === 'noise') await terminalNoise();
      if (action === 'blocked') await f.blocked();
      if (action === 'stop') stop();
      if (action === 'close') { close(); if (next(2)) close(); }
    }
    gate.release(); await closing; await Promise.all(competing);
    await f.settled('interrupted', { reviews: 0 }); assert.equal(engine.aborts, 0); assert.equal(engine.closes, 1);
  } else if (scenario === 'approval-validation' || scenario === 'question-ack') {
    for (const kind of shuffled(['question', 'permission'], next)) {
      if (kind === 'question') f.askQuestion(); else await f.askPermission();
    }
    assert.equal(chat.approvals.size, 1); assert.equal(chat.questions.size, 1, 'questions and approvals coexist');
    const validation = 1 + next(2);
    const gate = scenario === 'approval-validation' ? f.pause(f.bench.approvalsPolicy, 'describe', { at: validation }) : f.pause(engine, 'request', { after: true });
    trace.push(scenario === 'approval-validation' ? `reply-validation:${validation}` : 'answer-await-ack');
    const replying = scenario === 'approval-validation' ? chat.reply({ id: 'permission', allow: true }) : chat.question({ id: 'question', answers: [['Only synthetic users']] });
    const rejected = f.track(assert.rejects(replying, /ændret|findes ikke længere|ikke længere aktuelt/));
    await gate.entered;
    if (scenario === 'question-ack') {
      f.askQuestion();
      await assert.rejects(chat.question({ id: 'question', answers: [['Duplicate answer']] }), /ikke længere aktuelt/);
      assert.equal(engine.requests.length, 1, 'only one question response is dispatched');
    }
    await stop(); await terminalNoise();
    if (next(2)) await close();
    gate.release(); await rejected; await stoppedApprovals();
    assert.equal(f.briefWrites.length, 0, 'late answer never enters the brief');
    assert.deepEqual(chat.planConversation, [], 'late answer never enters planning context');
    assert.equal(chat.changes.activity.get('approval-permission').status, 'expired');
    assert.equal(chat.changes.activity.get('question-question').status, 'expired');
    await f.settled('stopped');
  } else if (scenario === 'terminal-noop') {
    const outcome = next(3);
    if (outcome === 2) await stop(); else { f.event(outcome ? 'engine.error' : 'session.idle'); await chat.finishing; }
    const replacementPlan = chat.plan = { id: 'reviewed-after-completion', text: 'A new reviewed plan.', source: 'dig', at: 2 };
    await chat.persistPlan();
    const generation = chat.generation, terminalWrites = f.finalizations.length;
    for (const action of shuffled(['noise', 'stop', 'stop', 'late-questions'], next)) {
      trace.push(`after-terminal:${action}`);
      if (action === 'noise') await terminalNoise();
      if (action === 'stop') await stop();
      if (action === 'late-questions') await stoppedApprovals();
    }
    assert.equal(chat.generation, generation); assert.equal(f.finalizations.length, terminalWrites);
    await f.settled(outcome === 2 ? 'stopped' : outcome ? 'error' : 'idle', { replacementPlan });
  } else assert.fail(`Unknown scenario: ${scenario}`);
}

// Eight distinct ownership/ACK situations, each with 32 seeded interleavings.
// The seed and executed actions accompany a failure; none is retried or skipped.
for (let index = 0; index < 256; index++) {
  const scenario = scenarios[index % scenarios.length];
  const seed = (baseSeed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  test(`completion sequence ${index + 1}/256 ${scenario} seed=0x${seed.toString(16)}`, { timeout: 10000 }, async t => {
    const trace = [];
    try { await runSequence(await fixture(t, seed, trace), scenario, random(seed), trace); }
    catch (error) { t.diagnostic(JSON.stringify({ seed, scenario, sequence: trace })); throw error; }
  });
}
