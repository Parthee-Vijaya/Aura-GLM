const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { ApprovalsPolicy } = require('../../desktop/core/approvals-policy.cjs');
const policy = require('./policy.cjs');
const { replyPermission } = require('./permission-control.cjs');

function replyFixture() {
  const request = { id: 'per_fixture', sessionID: 'ses_fixture', permission: 'grep', tool: { messageID: 'msg_fixture', callID: 'call_fixture' } }, events = [], calls = [];
  const message = { id: 'msg_fixture', type: 'assistant', content: [{ type: 'tool', id: 'call_fixture', name: 'grep', state: { status: 'error', error: { type: 'permission.rejected' } } }] };
  const pending = [];
  const engine = { session: { id: 'ses_fixture' }, promptID: 'user_fixture', promptEpoch: 1, pending: new Map([['per_fixture', request]]),
    async request(url) { calls.push({ method: 'GET', url }); return pending; },
    async wire(url) { calls.push({ method: 'GET', url }); return { data: message }; },
    handleEvent(event) { events.push(event); engine.pending.delete(event.properties.requestID); chat.approvals.delete(event.properties.requestID); }
  };
  const record = { engine, request, generation: 1, p: { permission: 'grep', tool: { messageID: 'msg_fixture', callID: 'call_fixture' } } };
  const chat = { engine, running: true, generation: 1, runStopped: false, approvals: new Map([['per_fixture', record]]) };
  const error = Object.assign(Error('Agentmotoren afviste handlingen (HTTP 404).'), { status: 404 });
  const bench = { chat, async reply(input) { calls.push({ method: 'POST', input }); throw error; } };
  const options = { bench, id: 'per_fixture', seen: new Set(), review: async () => false, message: 'Synthetic rejection feedback.' };
  return { engine, chat, bench, record, message, pending, error, calls, events, options, run: () => replyPermission(options) };
}

test('already rejected exact read is reconciled after HTTP 404 without replay or grant', async () => {
  const x = replyFixture(), result = await x.run();
  assert.equal(result.status, 'already-rejected'); assert.equal(x.calls.filter(c => c.method === 'POST').length, 1);
  assert.equal(x.calls.find(c => c.method === 'POST').input.allow, false);
  assert.equal(x.calls.find(c => c.method === 'POST').input.scope, 'once');
  assert.equal(x.engine.pending.size, 0); assert.equal(x.chat.approvals.size, 0);
  assert.equal(x.events.length, 1); assert.equal(x.events[0].recovered, true); assert.equal(x.events[0].properties.reply, undefined);
});
test('a vanished local read callback also needs authoritative rejection proof', async () => {
  const x = replyFixture(); x.record.p.permission = 'read'; x.record.request.permission = 'read'; x.message.content[0].name = 'read';
  delete x.error.status; x.error.message = 'Godkendelsen findes ikke længere.';
  x.bench.reply = async input => { x.calls.push({ method: 'POST', input }); x.engine.pending.delete('per_fixture'); throw x.error; };
  assert.equal((await x.run()).status, 'already-rejected'); assert.equal(x.events.length, 1);
  const y = replyFixture(); delete y.error.status; y.error.message = 'Godkendelsen findes ikke længere.'; y.message.content[0].state.error.type = 'tool.failed';
  await assert.rejects(y.run(), error => error === y.error);
});
for (const [name, mutate] of [
  ['allow decision', x => { x.options.review = async () => true; }],
  ['write permission', x => { x.record.p.permission = 'edit'; }],
  ['still pending', x => { x.pending.push({ id: 'per_fixture', sessionID: 'ses_fixture' }); }],
  ['malformed pending snapshot', x => { x.engine.request = async () => null; }],
  ['foreign pending snapshot', x => { x.pending.push({ id: 'other', sessionID: 'ses_other' }); }],
  ['wrong message', x => { x.message.id = 'msg_other'; }],
  ['foreign message', x => { x.message.sessionID = 'ses_other'; }],
  ['wrong tool', x => { x.message.content[0].id = 'call_other'; }],
  ['wrong tool type', x => { x.message.content[0].name = 'write'; }],
  ['changed source binding', x => { x.record.request.tool.callID = 'call_other'; }],
  ['completed tool', x => { x.message.content[0].state.status = 'completed'; }],
  ['unrelated tool failure', x => { x.message.content[0].state.error.type = 'tool.failed'; }],
  ['duplicate tool', x => { x.message.content.push(structuredClone(x.message.content[0])); }],
  ['missing source', x => { delete x.record.p.tool; }],
  ['untrusted HTTP text', x => { delete x.error.status; }],
  ['server failure', x => { x.error.status = 500; }],
  ['snapshot failure', x => { x.engine.request = async () => { throw Error('snapshot unavailable'); }; }],
  ['Stop during reconciliation', x => { x.engine.request = async () => { x.chat.runStopped = true; return []; }; }],
  ['new generation during reconciliation', x => { x.engine.request = async () => { x.chat.generation++; return []; }; }],
  ['new prompt during reconciliation', x => { x.engine.request = async () => { x.engine.promptEpoch++; return []; }; }],
  ['new session during reconciliation', x => { x.engine.request = async () => { x.engine.session.id = 'ses_other'; return []; }; }],
  ['changed engine during reconciliation', x => { x.engine.request = async () => { x.chat.engine = {}; return []; }; }],
  ['replaced request during reconciliation', x => { x.engine.request = async () => { x.engine.pending.set('per_fixture', {}); return []; }; }],
]) test(`404 remains a real driver failure for ${name}`, async () => {
  const x = replyFixture(); mutate(x); await assert.rejects(x.run(), error => error === x.error);
  assert.equal(x.calls.filter(c => c.method === 'POST').length, 1); assert.deepEqual(x.events, []);
});
test('duplicate callbacks and changed policy-review bindings cause no extra reply', async () => {
  const x = replyFixture(); x.bench.reply = async input => x.calls.push({ method: 'POST', input });
  assert.equal((await x.run()).status, 'answered'); assert.equal((await x.run()).status, 'skipped');
  assert.equal(x.calls.length, 1);
  const y = replyFixture(); y.options.review = async () => { y.chat.generation++; return true; };
  assert.equal((await y.run()).status, 'skipped'); assert.deepEqual(y.calls, []);
});
const { reviewWrite, reviewPermission, modelCallBudgetReached } = policy;

test('pilot approves only explicit public writes in build mode, with no links or broad grants', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pilot-policy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); // This test owns only its synthetic fixture.
  await fs.mkdir(path.join(root, 'public'));
  await fs.symlink(os.tmpdir(), path.join(root, 'public', 'escape'));
  const request = patterns => ({ permission: 'edit', patterns });
  assert.equal(await reviewWrite(root, request(['public/index.html']), 'build'), true);
  assert.equal(await reviewWrite(root, request([path.join(root, 'public/styles.css')]), 'build'), true);
  for (const file of ['../private.js', '/tmp/private.js', 'public/../secret.js', 'public/.env', 'public/*', 'public/escape/index.html', 'AGENTS.md', 'public/app.cjs']) {
    assert.equal(await reviewWrite(root, request([file]), 'build'), false, file);
  }
  assert.equal(await reviewWrite(root, request(['public/index.html', '../private.js']), 'build'), false);
  assert.equal(await reviewWrite(root, request(['public/index.html']), 'plan'), false);
  assert.equal(await reviewWrite(root, { permission: 'bash', patterns: ['echo ok'] }, 'build'), false);
  assert.equal(await reviewWrite(root, request([]), 'build'), false);
});

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pilot-read-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'public', 'styles.css'), 'body { color: #222; }');
  await fs.writeFile(path.join(root, 'public', 'app.js'), 'console.log("demo");');
  await fs.writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg/>');
  await fs.writeFile(path.join(root, 'private.js'), 'private');
  const product = new ApprovalsPolicy(null);
  const record = async (p, mode = 'build') => ({ p, descriptor: await product.describe({ projectRoot: root, workspaceRoot: root, mode }, p) });
  const read = filePath => ({ id: 'read', permission: 'read', patterns: [filePath], toolInput: { tool: 'read', filePath }, metadata: { filepath: filePath } });
  const grep = target => ({ id: 'grep', permission: 'grep', patterns: ['color|demo'], toolInput: { tool: 'grep', path: target, pattern: 'color|demo' } });
  return { root, record, read, grep };
}

test('validated read and grep requests can inspect their own public files and safe subtrees once, including during planning', async t => {
  const { root, record, read, grep } = await fixture(t);
  for (const mode of ['plan', 'build']) for (const p of [read(path.join(root, 'public/styles.css')), grep(path.join(root, 'public/styles.css')), grep(path.join(root, 'public')), grep(path.join(root, 'public/assets'))]) {
    const approval = await record(p, mode);
    assert.equal(approval.descriptor.projectFile, false, 'read approval is not the product-wide write grant');
    assert.equal(await reviewPermission(root, approval, mode), true, `${mode}: ${JSON.stringify(p.toolInput)}`);
  }
  const relative = read('public/styles.css'); relative.metadata.filepath = path.join(root, 'public/styles.css');
  assert.equal(await reviewPermission(root, await record(relative), 'build'), true, 'product-bound relative file input');
});

test('read and grep fail closed for outside, traversal, unknown, missing and broad targets', async t => {
  const { root, record, read, grep } = await fixture(t);
  for (const target of [root, path.join(root, 'private.js'), '/etc/hosts', root + '/public/../private.js', root + '/public/../public/app.js', path.join(root, 'public/*'), path.join(root, 'public/missing.js'), path.join(root, 'public/.env'), path.join(root, 'public/key.pem')]) {
    for (const request of [read(target), grep(target)]) assert.equal(await reviewPermission(root, await record(request), 'build'), false, target);
  }
  const safe = await record(grep(path.join(root, 'public')));
  for (const changed of [null, { p: safe.p }, { descriptor: safe.descriptor }, { ...safe, descriptor: { ...safe.descriptor, match: undefined } }, { ...safe, descriptor: { ...safe.descriptor, fingerprint: '' } }, { ...safe, descriptor: { ...safe.descriptor, blockedMode: true } }, { ...safe, p: { ...safe.p, toolInput: undefined } }, { ...safe, p: { ...safe.p, toolInput: { ...safe.p.toolInput, tool: 'bash' } } }, { ...safe, p: { ...safe.p, toolInput: { tool: 'grep', pattern: 'color' } } }, { ...safe, descriptor: { ...safe.descriptor, match: { kind: 'grep', targets: [{ path: path.join(root, 'public'), subtree: true }] } } }]) {
    assert.equal(await reviewPermission(root, changed, 'build'), false);
  }
  assert.equal(await reviewPermission(root, safe, 'unknown'), false);
  for (const permission of ['bash', 'webfetch', 'glob', 'list', 'external_directory', 'unknown']) assert.equal(await reviewPermission(root, await record({ permission, patterns: [path.join(root, 'public')] }), 'build'), false, permission);
  const mismatched = await record(grep(path.join(root, 'public/styles.css')));
  mismatched.p.toolInput.path = path.join(root, 'public/app.js');
  assert.equal(await reviewPermission(root, mismatched, 'build'), false, 'changed concrete input cannot reuse descriptor');
});

test('reads reject links even when the product canonical descriptor resolves inside public', async t => {
  const { root, record, read, grep } = await fixture(t);
  const publicRoot = path.join(root, 'public');
  await fs.symlink(path.join(publicRoot, 'styles.css'), path.join(publicRoot, 'alias.css'));
  await fs.symlink(path.join(root, 'private.js'), path.join(publicRoot, 'outside.js'));
  await fs.symlink(path.join(publicRoot, 'missing.js'), path.join(publicRoot, 'dangling.js'));
  await fs.symlink(publicRoot, path.join(publicRoot, 'cycle'));
  for (const name of ['alias.css', 'outside.js', 'dangling.js', 'cycle/styles.css']) for (const p of [read(path.join(publicRoot, name)), grep(path.join(publicRoot, name))]) {
    assert.equal(await reviewPermission(root, await record(p), 'build'), false, name);
  }
  assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), false, 'recursive search rejects nested links');
  assert.equal(await reviewPermission(root, await record(read(path.join(publicRoot, 'styles.css'))), 'build'), true, 'an exact unrelated safe file stays readable');
  const before = await record(read(path.join(publicRoot, 'app.js')));
  await fs.unlink(path.join(publicRoot, 'app.js'));
  await fs.symlink(path.join(root, 'private.js'), path.join(publicRoot, 'app.js'));
  assert.equal(await reviewPermission(root, before, 'build'), false, 'filesystem change after descriptor is not accepted');
});

test('directory search rejects protected or unsupported descendants rather than approving the whole tree', async t => {
  const { root, record, read, grep } = await fixture(t);
  const publicRoot = path.join(root, 'public');
  for (const relative of ['.env', '.GIT/config', 'secrets/data.json', 'REFERENCES/data.json', 'keys/key.pem', 'assets/photo.png', 'code/app.cjs']) {
    const target = path.join(publicRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'synthetic');
    assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), false, relative);
    assert.equal(await reviewPermission(root, await record(read(target)), 'build'), false, relative);
    await fs.rm(target);
    const parent = path.dirname(target);
    if (parent !== publicRoot && parent !== path.join(publicRoot, 'assets')) await fs.rmdir(parent);
  }
  assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), true);
});

test('descriptor routing preserves public-only reviewed writes and never grants writes during planning', async t => {
  const { root, record } = await fixture(t);
  for (const mode of ['plan', 'build']) for (const file of ['public/index.html', 'public/styles.css', 'public/app.js', 'public/data.json', 'public/assets/icon.svg', 'private.js', 'public/.env', 'public/command.sh']) {
    const target = path.join(root, file);
    const p = { id: 'edit', permission: 'edit', patterns: [file], metadata: { filepath: target }, toolInput: { tool: 'write', filePath: target } };
    assert.equal(await reviewPermission(root, await record(p, mode), mode), mode === 'build' && /^public\/.*\.(html|css|js|json|svg)$/.test(file), `${mode}: ${file}`);
  }
});

test('model-call budget stops on the limit, not the next call, and invalid limits fail closed', () => {
  for (const count of [0, 1, 63]) assert.equal(modelCallBudgetReached(count, 64), false);
  for (const count of [64, 65, 100]) assert.equal(modelCallBudgetReached(count, 64), true);
  for (const limit of [0, -1, undefined, '64', Infinity]) assert.equal(modelCallBudgetReached(1, limit), true);
  for (const count of [undefined, NaN, -1, 1.5]) assert.equal(modelCallBudgetReached(count, 64), true);
});

for (const worker of ['worker.cjs', 'codex_comparison_worker.cjs']) test(`${worker} routes actual events through shared once-only policy and stops at exactly 64`, async t => {
  const { root, record, grep } = await fixture(t);
  const source = await fs.readFile(path.join(__dirname, worker), 'utf8');
  const replies = [], stops = [], imports = [];
  const approval = await record(grep(path.join(root, 'public')));
  const request = {}, engine = { session: { id: 'ses_fixture' }, promptEpoch: 1, promptID: 'user_fixture', pending: new Map([['grep', request]]) };
  Object.assign(approval, { engine, request, generation: 1 });
  const bench = { project: { root }, chat: { engine, running: true, generation: 1, approvals: new Map([['grep', approval]]) }, reply: async input => replies.push(input), stop: async () => stops.push(true) };
  const context = vm.createContext({ benchFixture: bench, console, setTimeout, clearTimeout, structuredClone, Buffer,
    process: { argv: ['', '', '', '', root], stdout: { write() {} }, on() {} },
    require(name) {
      imports.push(name);
      if (name === './policy.cjs') return policy;
      if (name === './permission-control.cjs') return { replyPermission };
      if (name.startsWith('node:')) return require(name);
      if (name === 'electron') return { app: { setName() {}, setPath() {}, on() {}, whenReady() { return { then() {} }; } } };
      if (name.endsWith('/store.cjs')) return { Store: class {} };
      return {};
    },
  });
  vm.runInContext(source + '\nbench = benchFixture; config = { maxModelCalls: 64 }; mode = "build"; stage = "build";', context, { filename: worker });
  vm.runInContext('event({ type: "permission.asked", properties: { id: "grep", permission: "grep" } });', context);
  await vm.runInContext('permissionQueue', context);
  assert.equal(imports.filter(name => name === './policy.cjs').length, 1);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].allow, true);
  assert.equal(replies[0].scope, 'once');
  assert.equal(vm.runInContext('audit[0].allow', context), true);
  const outsideRequest = {};
  bench.chat.approvals.set('outside', { ...await record(grep(path.join(root, 'private.js'))), engine, request: outsideRequest, generation: 1 }); engine.pending.set('outside', outsideRequest);
  vm.runInContext('event({ type: "permission.asked", properties: { id: "outside", permission: "grep" } }); event({ type: "permission.asked", properties: { id: "missing", permission: "read" } });', context);
  await vm.runInContext('permissionQueue', context);
  assert.equal(replies.length, 2);
  assert.equal(replies[1].allow, false, 'worker does not expand the safe scope');
  assert.equal(vm.runInContext('audit.at(-1).status', context), 'skipped', 'missing validated approval record sends no stale reply');
  assert.ok(replies.every(reply => reply.scope === 'once'));
  vm.runInContext('event({ type: "usage", usage: { calls: 63 } });', context);
  assert.equal(stops.length, 0);
  vm.runInContext('event({ type: "usage", usage: { calls: 64 } }); event({ type: "usage", usage: { calls: 65 } });', context);
  assert.equal(stops.length, 1);
  assert.deepEqual(Array.from(vm.runInContext('faults', context)), ['model_call_budget']);
});

test('parallel native rejected reads reconcile delayed events without replay', { skip: process.env.AURA_ENGINE_NATIVE !== '1' && 'Set AURA_ENGINE_NATIVE=1 for the pinned native engine, localhost models only.' }, async t => {
  const { OpenCodeEngine } = require('../../desktop/core/engine.cjs');
  const { ChatSession } = require('../../desktop/core/chat-session.cjs');
  const { startFakeProvider } = require('../../desktop/scripts/fixtures/fake-provider.cjs');
  const { setTimeout: delay } = require('node:timers/promises');
  const base = await fs.realpath(await fs.mkdtemp(path.join(process.env.AURA_PERMISSION_EVIDENCE || os.tmpdir(), 'aura-denied-reads-')));
  const root = path.join(base, 'project'); await fs.mkdir(path.join(root, 'public'), { recursive: true });
  for (const file of ['app.js', 'styles.css']) await fs.writeFile(path.join(root, 'public', file), 'SYNTHETIC_SAFE_CONTENT\n');
  const original = await Promise.all(['app.js', 'styles.css'].map(file => fs.readFile(path.join(root, 'public', file), 'utf8')));
  const fake = await startFakeProvider({ synthetic: true, script: [
    { toolCalls: ['public/app.js', 'public/styles.css', 'public'].map((file, index) => ({ id: 'call_denied_' + index, name: 'grep', arguments: JSON.stringify({ path: file, pattern: 'SYNTHETIC_SAFE_CONTENT' }) })) },
    { text: 'Synthetic read denials handled.', delayMs: 1000 }
  ] });
  const events = [], outcomes = [], faults = [], calls = [], held = [], parts = new Map(), seen = new Set(); let queue = Promise.resolve();
  const until = async (check, label) => { const end = Date.now() + 20000; while (Date.now() < end) { if (await check()) return; await delay(10); } assert.fail('Native denied-read timeout: ' + label); };
  const approvalsPolicy = new ApprovalsPolicy({ read: async () => ({ version: 1, projects: {} }), update: async () => { throw Error('No persistent grant is allowed'); } });
  const chat = { root, running: true, generation: 1, runStopped: false, runTools: parts, approvals: new Map(), questions: new Map(),
    approvalContext: () => ({ projectRoot: root, workspaceRoot: root, mode: 'build' }), log() {},
    emit(event) { if (event.type === 'permission.asked') queue = queue.then(() => replyPermission({ bench, id: event.properties.id, seen,
      review: async () => { if (!outcomes.length) await until(() => chat.approvals.size === 3, 'three concurrent reads'); return false; },
      message: 'Synthetic test: these reads are denied. Continue without reading them.'
    })).then(result => outcomes.push(result)).catch(error => faults.push({ status: error.status || null, name: error.name })); }
  };
  const bench = { chat, approvalsPolicy, chatsChanged() {}, reply: input => ChatSession.prototype.reply.call(chat, input) }; chat.bench = bench;
  const provider = { npm: '@ai-sdk/openai-compatible', name: 'Synthetic denied reads', options: { baseURL: fake.url, apiKey: fake.key }, models: { [fake.model]: { name: 'Synthetic', tool_call: true, limit: { context: 32768, output: 4096 } } } };
  const engine = new OpenCodeEngine({ root, directory: path.join(base, 'runtime'), provider, model: { id: fake.model }, onEvent(event) {
    events.push(event); const p = event.properties, part = p?.part; if (part?.type === 'tool') parts.set(part.id, part);
    if (event.type === 'permission.asked') ChatSession.prototype.permissionAsked.call(chat, event).catch(error => faults.push({ name: error.name }));
    if (event.type === 'permission.replied') chat.approvals.delete(p.requestID);
  } }); chat.engine = engine;
  const handle = engine.handleEvent.bind(engine), wire = engine.wire.bind(engine);
  // Reproduce the observed race deterministically: the server has rejected all
  // three tools, but the evaluator has not yet received its SSE notifications.
  engine.handleEvent = event => event.type === 'permission.replied' && !event.recovered ? held.push(event) : handle(event);
  engine.wire = async (url, method = 'GET', ...args) => { const record = { method, url }; calls.push(record); try { const value = await wire(url, method, ...args); record.status = 200; return value; } catch (error) { record.status = error.status || null; throw error; } };
  t.after(async () => { chat.running = false; await engine.close(); await fake.close(); });
  await engine.start(); const sessionID = engine.session.id; await engine.send('Perform the three fixed synthetic grep calls.', 'Use only the localhost fixture. No file writes.');
  await until(() => outcomes.length + faults.length === 3, 'all callbacks'); await queue;
  for (const event of held) handle(event);
  await until(() => events.some(event => ['session.idle', 'session.error', 'engine.error'].includes(event.type)), 'native completion');
  assert.deepEqual(faults, []); assert.equal(outcomes.filter(x => x.status === 'already-rejected').length, 2);
  assert.equal(events.some(event => ['session.error', 'engine.error'].includes(event.type)), false);
  const replies = calls.filter(call => call.method === 'POST' && call.url.includes('/permission/'));
  assert.equal(replies.length, 3); assert.equal(replies.filter(call => call.status === 404).length, 2);
  assert.equal(engine.pending.size, 0); assert.equal(chat.approvals.size, 0); assert.equal(fake.requests.length, 2); assert.equal(engine.session.id, sessionID);
  const messages = (await engine.wire(`/api/session/${sessionID}/message?limit=100&order=asc`)).data;
  const tools = messages.flatMap(message => message.content || []).filter(part => part?.type === 'tool');
  assert.equal(messages.filter(message => message.type === 'user').length, 1);
  assert.equal(tools.length, 3); assert.ok(tools.every(part => part.state.status === 'error' && part.state.error?.type === 'permission.rejected'));
  assert.deepEqual(await Promise.all(['app.js', 'styles.css'].map(file => fs.readFile(path.join(root, 'public', file), 'utf8'))), original);
  const result = { synthetic: true, pinnedEngine: '2.1.4', delayedPermissionNotifications: true, callbacks: outcomes, faults,
    permissionPosts: 3, expectedStale404s: 2, deniedReads: 3, prompts: 1, modelCalls: 2, sameSession: true, filesUnchanged: true, persistentGrants: 0 };
  await fs.writeFile(path.join(base, 'result.json'), JSON.stringify(result, null, 2)); t.diagnostic('Retained native evidence: ' + base);
});
