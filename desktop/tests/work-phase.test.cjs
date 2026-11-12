const { test } = require('node:test');
const assert = require('node:assert/strict');
const { WorkPhases } = require('../core/work-phase.cjs');
const { diagnostics } = require('../core/diagnostics.cjs');
const { ChatSession } = require('../core/chat-session.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const secret = 'SYNTHETIC_PRIVATE_/project/file?api-key=canary';

test('work phases retain fixed counters, timestamps and a terminal idle without storing source content', () => {
  let now = 1000; const events = [];
  const phases = new WorkPhases({ now: () => now, emit: event => events.push(event) });
  phases.begin({ kind: 'compatible', protocol: 'anthropic', baseURL: secret, apiKey: secret, name: secret });
  now = 1010; phases.set('waiting-model');
  now = 1020; phases.set('retrying', { attempt: 2, of: 3, message: secret, endpoint: secret });
  phases.set('retrying', { attempt: 2, of: 3 });
  now = 1030; phases.failure(429); phases.finish();
  phases.set('waiting-model'); phases.failure(500); phases.finish();
  assert.deepEqual(events.map(event => event.phase), ['starting-engine', 'waiting-model', 'retrying', 'idle']);
  assert.deepEqual(events[2], { type: 'work.phase', phase: 'retrying', since: 1020, attempt: 2, of: 3 });
  assert.deepEqual(phases.snapshot(), { providerType: 'compatible', protocol: 'anthropic', errorStep: 'retrying', httpStatus: 429, since: 1000, until: 1030, durationMs: 30 });
  assert.equal(JSON.stringify([events, phases.snapshot()]).includes(secret), false);
});

test('unknown phases, provider IDs and nonnumeric counters cannot leak through observations', () => {
  const events = [], phases = new WorkPhases({ emit: event => events.push(event) });
  phases.begin({ kind: secret, protocol: secret }); phases.set(secret, { attempt: secret });
  phases.set('retrying', { attempt: secret, of: secret }); phases.failure(secret); phases.finish();
  assert.equal(JSON.stringify([events, phases.snapshot()]).includes(secret), false);
  assert.equal(phases.snapshot().providerType, 'unknown'); assert.equal(phases.snapshot().httpStatus, null);
  assert.equal(Object.hasOwn(events.find(event => event.phase === 'retrying'), 'attempt'), false);
});

test('observer exceptions and mutation never control phase delivery or the next run', () => {
  const phases = new WorkPhases({ emit: event => { event.phase = secret; throw Error(secret); } });
  assert.doesNotThrow(() => { phases.begin({ kind: 'groq' }); phases.set('waiting-model'); phases.failure(401); phases.finish(); });
  assert.equal(phases.snapshot().errorStep, 'waiting-model');
  phases.begin({ kind: 'ollama' });
  assert.equal(phases.snapshot().errorStep, null); assert.equal(phases.snapshot().httpStatus, null);
});

test('support export whitelists every connection field and never includes nested or raw failure data', () => {
  const report = diagnostics({ connection: { providerType: secret, protocol: secret, errorStep: secret, httpStatus: secret, since: secret, until: secret, message: secret, apiKey: secret, root: secret }, failures: [{ area: 'agent', type: 'model', at: new Date().toISOString(), message: secret }] });
  assert.equal(JSON.stringify(report).includes(secret), false);
  assert.deepEqual(report.connection, { providerType: 'unknown', protocol: 'unknown', errorStep: null, httpStatus: null, since: null, until: null, durationMs: null });
  const valid = diagnostics({ connection: { providerType: 'openai', protocol: 'responses', errorStep: 'waiting-model', httpStatus: 401, since: 100, until: 150, address: secret } }).connection;
  assert.equal(valid.providerType, 'openai'); assert.equal(valid.durationMs, 50); assert.equal(valid.httpStatus, 401);
  for (const providerType of ['__proto__', 'constructor', 'toString']) assert.equal(diagnostics({ connection: { providerType } }).connection.providerType, 'unknown');
});

test('real chat event handling emits routed phases with no project paths, prompts or provider details', t => {
  const events = [], bench = { project: { root: secret }, changesFor: () => ({ activity: { put() {}, get() {} } }), emit: event => events.push(event), chatsChanged() {} };
  const chat = new ChatSession(bench, { id: 'synthetic-chat' }, secret);
  t.after(() => { clearTimeout(chat.historyTimer); chat.running = false; });
  chat.running = true; chat.engine = { session: { id: 'synthetic-session' } };
  chat.workPhases.begin({ kind: 'compatible', name: secret, baseURL: secret });
  chat.event({ type: 'engine.recovery', recovery: { phase: 'retrying', attempt: 2, of: 3, message: secret } });
  chat.event({ type: 'question.asked', properties: { id: 'q', sessionID: 'synthetic-session', questions: [{ question: secret }] } });
  chat.event({ type: 'question.replied', properties: { requestID: 'q' } });
  chat.event({ type: 'message.updated', properties: { info: { id: 'assistant', role: 'assistant' } } });
  chat.event({ type: 'message.part.updated', properties: { part: { id: 'text', messageID: 'assistant', type: 'text', text: secret } } });
  chat.workPhases.finish();
  const phases = events.filter(event => event.type === 'work.phase');
  assert.deepEqual(phases.map(event => event.phase), ['starting-engine', 'retrying', 'waiting-approval', 'waiting-model', 'responding', 'idle']);
  assert.ok(phases.every(event => event.chat === 'synthetic-chat'));
  assert.equal(JSON.stringify(phases).includes(secret), false);
  assert.ok(phases.every(event => !Object.hasOwn(event, 'root') && !Object.hasOwn(event, 'workspaceRoot')));
});

test('permission phases wait for every pending human decision and do not grant a tool', async t => {
  const events = [], descriptor = { kind: 'webfetch', label: 'Synthetic', blockedMode: false };
  const bench = { project: { root: '/synthetic' }, changesFor: () => ({ activity: { put() {}, get() {} } }), emit: event => events.push(event), chatsChanged() {}, approvalsPolicy: { allowed: async () => ({ allowed: false, descriptor }) } };
  const chat = new ChatSession(bench, { id: 'synthetic-chat' }, '/synthetic');
  t.after(() => { clearTimeout(chat.historyTimer); chat.running = false; });
  chat.running = true;
  const permission = { id: 'p', sessionID: 'synthetic-session', permission: 'webfetch', patterns: ['https://synthetic.example.invalid/'] };
  let granted = 0;
  chat.engine = { session: { id: 'synthetic-session' }, pending: new Map([['p', permission]]), reply: async () => { granted++; } };
  chat.workPhases.begin({ kind: 'groq' });
  await chat.permissionAsked({ type: 'permission.asked', properties: permission });
  assert.equal(events.filter(event => event.type === 'work.phase').at(-1).phase, 'waiting-approval');
  chat.questions.set('q', {});
  chat.event({ type: 'permission.replied', properties: { requestID: 'p', reply: 'reject' } });
  assert.equal(events.filter(event => event.type === 'work.phase').at(-1).phase, 'waiting-approval');
  chat.event({ type: 'question.replied', properties: { requestID: 'q' } });
  assert.equal(events.filter(event => event.type === 'work.phase').at(-1).phase, 'waiting-model');
  assert.equal(granted, 0);
});

test('privacy review holds the bound conversation phase until every review resolves', async t => {
  const events = [], phases = new WorkPhases({ emit: event => events.push(event) });
  const chat = { id: 'bound-chat', project: { root: '/synthetic' }, workPhases: phases };
  const other = new WorkPhases(); other.begin({ kind: 'ollama' });
  const bench = { store: { root: '/synthetic-profile' }, project: chat.project, chats: new Map([[chat.id, chat]]), chat: { id: 'other-chat', workPhases: other }, emit: event => events.push(event) };
  const service = new PrivacyService(bench), scope = { kind: 'conversation', root: chat.project.root, chat: chat.id };
  t.after(() => service.cancelScope());
  phases.begin({ kind: 'groq' });
  const first = service.requestApproval({ payload: secret }, { scope });
  const firstID = [...service.pending.keys()][0];
  assert.equal(events.filter(event => event.type === 'work.phase').at(-1).phase, 'waiting-approval');
  assert.equal(other.phase, 'starting-engine');
  const second = service.requestApproval({ payload: secret }, { scope });
  const secondID = [...service.pending.keys()][1];
  phases.set('waiting-model'); phases.set('responding');
  assert.equal(phases.phase, 'waiting-approval');
  service.decide({ id: firstID, decision: 'approve' }); await first;
  assert.equal(phases.phase, 'waiting-approval');
  service.decide({ id: secondID, decision: 'local' }); await second;
  assert.equal(phases.phase, 'responding');
  assert.deepEqual(events.filter(event => event.type === 'work.phase').map(event => event.phase), ['starting-engine', 'waiting-approval', 'responding']);
  assert.equal(JSON.stringify(events.filter(event => event.type === 'work.phase')).includes(secret), false);
});

test('privacy wait releases on cancel, abort and expiry without reviving a stopped or newer run', async t => {
  const phases = new WorkPhases(), chat = { id: 'bound-chat', project: { root: '/synthetic' }, workPhases: phases };
  const service = new PrivacyService({ store: { root: '/synthetic-profile' }, project: chat.project, chat, chats: new Map(), emit() {} });
  const scope = { kind: 'conversation', root: chat.project.root, chat: chat.id };
  t.after(() => service.cancelScope());
  for (const outcome of ['cancel', 'abort', 'expiry']) {
    phases.begin({ kind: 'groq' });
    const controller = new AbortController();
    const pending = service.requestApproval({ expiresAt: Date.now() + (outcome === 'expiry' ? 10 : 120000) }, { scope, signal: controller.signal });
    assert.equal(phases.phase, 'waiting-approval');
    if (outcome === 'abort') { const rejection = assert.rejects(pending); controller.abort(); await rejection; }
    else { if (outcome === 'cancel') service.cancelScope(scope); assert.equal(await pending, 'cancel'); }
    assert.equal(phases.phase, 'starting-engine');
  }
  const pending = service.requestApproval({}, { scope });
  phases.finish(); phases.begin({ kind: 'ollama' }); phases.set('waiting-model');
  service.cancelScope(scope); await pending;
  assert.equal(phases.phase, 'waiting-model');
  phases.finish();
  const inactive = service.requestApproval({}, { scope });
  assert.equal(phases.phase, 'idle'); service.cancelScope(scope); await inactive;
  phases.begin({ kind: 'groq' });
  for (const unrelated of [{ kind: 'idea' }, { ...scope, root: '/other' }, { ...scope, chat: 'other' }]) {
    const review = service.requestApproval({}, { scope: unrelated });
    assert.equal(phases.phase, 'starting-engine'); service.cancelScope(); await review;
  }
});

test('a recovery status while a question or approval waits keeps waiting-approval', t => {
  for (const recoveryPhase of ['waiting', 'retrying']) {
    const events = [], bench = { project: { root: secret }, changesFor: () => ({ activity: { put() {}, get() {} } }), emit: event => events.push(event), chatsChanged() {} };
    const chat = new ChatSession(bench, { id: 'synthetic-chat' }, secret);
    t.after(() => { clearTimeout(chat.historyTimer); chat.running = false; });
    chat.running = true; chat.engine = { session: { id: 'synthetic-session' } };
    chat.workPhases.begin({ kind: 'compatible' });
    chat.event({ type: 'question.asked', properties: { id: 'q', sessionID: 'synthetic-session', questions: [{ question: 'Syntetisk?' }] } });
    chat.event({ type: 'engine.recovery', recovery: { phase: recoveryPhase, attempt: 1, of: 3 } });
    const phases = events.filter(event => event.type === 'work.phase').map(event => event.phase);
    assert.equal(chat.questions.size, 1, recoveryPhase);
    assert.equal(phases.at(-1), 'waiting-approval', `${recoveryPhase}: ${phases.join(',')}`);
  }
});
