const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { nativePermissions, nativeConfig, normalizedConfig, validateConfigEntries, validatePrivateConfigDirectory, EventAdapter } = require('../core/engine-opencode2.cjs');
const { engineConfig, permissions, isolatedEnv, OpenCodeEngine } = require('../core/engine.cjs');

function fixture(mode = 'free') {
  const root = '/synthetic/project', directory = '/synthetic/engine';
  const provider = { npm: '@ai-sdk/openai-compatible', name: 'Chosen', options: { baseURL: 'http://127.0.0.1:12345/v1', apiKey: 'synthetic-private-proxy-token' }, models: { 'vendor/chosen': { name: 'Chosen model', tool_call: true, limit: { context: 8192, output: 1024 }, modalities: { input: ['text', 'image'], output: ['text'] } } } };
  const model = { id: 'vendor/chosen' }, permission = permissions(root, ['references/selected.txt'], mode);
  const config = nativeConfig(engineConfig(provider, model, permission), '/synthetic/engine/aura-task-list');
  return { root, directory, provider, model, permission, config, mode };
}
const wire = (type, data) => ({ id: 'evt_released_contract', created: 1, type, data });

test('V2 permissions preserve order, explicit external review and no-write planning; new code mode is denied', () => {
  assert.deepEqual(nativePermissions({ '*': 'deny', bash: { '*': 'ask', 'git status': 'allow' }, task: 'deny', write: 'ask' }), [
    { action: '*', resource: '*', effect: 'deny' }, { action: 'shell', resource: '*', effect: 'ask' }, { action: 'shell', resource: 'git status', effect: 'allow' }, { action: 'subagent', resource: '*', effect: 'deny' }, { action: 'edit', resource: '*', effect: 'ask' },
  ]);
  for (const mode of ['chat', 'plan']) {
    const { config } = fixture(mode);
    assert.deepEqual(config.permissions[0], { action: '*', resource: '*', effect: 'deny' });
    assert.deepEqual(config.permissions.at(-1), { action: 'execute', resource: '*', effect: 'deny' });
    assert.ok(config.permissions.some(rule => rule.action === 'external_directory' && rule.effect === 'ask'));
    assert.ok(!config.permissions.some(rule => ['edit', 'shell'].includes(rule.action) && rule.effect === 'allow'));
    assert.deepEqual(config.agents.plan.permissions, config.permissions);
  }
});

test('V2 exact config gate rejects any additional authority, changed credential, route or permission', () => {
  const { config, directory } = fixture();
  const valid = [{ type: 'directory', path: path.join(directory, 'config') }, { type: 'document', info: normalizedConfig(config) }];
  assert.equal(validateConfigEntries(valid, config, directory), true);
  assert.equal(config.providers.harness.package, 'aisdk:@ai-sdk/openai-compatible');
  assert.deepEqual(config.policies, [{ action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: 'harness', effect: 'allow' }]);
  assert.equal(config.update, 'disable'); assert.equal(config.snapshots, false); assert.equal(config.share, 'disabled');
  for (const mutate of [
    items => items.push({ type: 'document', path: '/managed/opencode.json', info: { permissions: [{ action: '*', resource: '*', effect: 'allow' }] } }),
    items => items.push({ type: 'document', info: {} }),
    items => items.push({ type: 'directory', path: '/other/plugins' }),
    items => { items[1].info.providers.harness.settings.apiKey = 'other'; },
    items => { items[1].info.providers.harness.settings.baseURL = 'https://unselected.invalid/v1'; },
    items => { items[1].info.permissions[0].effect = 'allow'; },
    items => { items[1].info.plugins.push('unselected-plugin'); },
    items => { items[1].info.mcp = { servers: { unwanted: { type: 'remote', url: 'https://unselected.invalid' } } }; },
    items => { delete items[1].info.policies; },
  ]) { const items = structuredClone(valid); mutate(items); assert.equal(validateConfigEntries(items, config, directory), false); }
});

test('V2 isolation preserves XDG database location and closes independent global skill discovery', () => {
  const env = isolatedEnv('/synthetic/engine', {}, 'synthetic-password');
  assert.equal(env.XDG_DATA_HOME, '/synthetic/engine/data');
  assert.equal(env.OPENCODE_CONFIG_DIR, '/synthetic/engine/config');
  assert.equal(env.OPENCODE_TEST_HOME, '/synthetic/engine/home');
  assert.equal(env.OPENCODE_DISABLE_PROJECT_CONFIG, 'true');
  assert.equal(env.OPENCODE_DISABLE_MODELS_FETCH, 'true');
  assert.equal(env.OPENCODE_DISABLE_AUTOUPDATE, 'true');
});

test('V2 stream preserves text IDs, exact final text, selected model and explicit per-step token counters', () => {
  const adapter = new EventAdapter('/synthetic/project'), d = { sessionID: 'ses_one', assistantMessageID: 'msg_one', ordinal: 0 };
  const start = adapter.normalize(wire('session.step.started', { ...d, model: { providerID: 'harness', id: 'vendor/chosen' } }));
  assert.equal(start[0].properties.info.modelID, 'vendor/chosen');
  const text = adapter.normalize(wire('session.text.started', d))[0].properties.part;
  const delta = adapter.normalize(wire('session.text.delta', { ...d, delta: 'Actual streamed text' }))[0];
  assert.equal(delta.type, 'message.part.delta'); assert.equal(delta.properties.partID, text.id);
  assert.equal(adapter.normalize(wire('session.text.ended', { ...d, text: 'Actual streamed text' }))[0].properties.part.text, 'Actual streamed text');
  const tokens = { input: 140, output: 20, reasoning: 0, cache: { read: 6, write: 8 } };
  const finish = adapter.normalize(wire('session.step.ended', { ...d, finish: 'stop', cost: 0, tokens }));
  assert.equal(finish[0].properties.part.type, 'step-finish'); assert.deepEqual(finish[0].properties.part.tokens, tokens);
  assert.equal(finish[1].properties.info.modelID, 'vendor/chosen');
  assert.equal(adapter.normalize(wire('session.execution.succeeded', d))[0].type, 'session.idle');
});

test('V2 actual file approval retains absolute file, exact call, patch and legacy tool input without approving', () => {
  const adapter = new EventAdapter('/synthetic/project');
  const d = { sessionID: 'ses_one', assistantMessageID: 'msg_one', id: 'call_write' };
  adapter.normalize(wire('session.tool.input.started', { ...d, name: 'write' }));
  const running = adapter.normalize(wire('session.tool.called', { ...d, input: { path: 'public/index.html', content: 'changed' }, executed: true }))[0].properties.part;
  assert.equal(running.state.input.filePath, '/synthetic/project/public/index.html');
  const asked = adapter.normalize(wire('permission.asked', { id: 'per_one', sessionID: 'ses_one', action: 'edit', resources: ['public/index.html'], save: ['*'], metadata: { files: [{ file: 'public/index.html', patch: '@@\n-before\n+changed' }] }, source: { type: 'tool', messageID: 'msg_one', id: 'call_write' } }))[0];
  assert.equal(asked.properties.permission, 'edit');
  assert.equal(asked.properties.metadata.filepath, '/synthetic/project/public/index.html');
  assert.equal(asked.properties.metadata.diff, '@@\n-before\n+changed');
  assert.deepEqual(asked.properties.tool, { messageID: 'msg_one', callID: 'call_write' });
  assert.deepEqual(asked.properties.patterns, ['public/index.html']);
  const completed = adapter.normalize(wire('session.tool.success', { ...d, content: [{ type: 'text', text: 'Created file successfully' }] }))[0].properties.part;
  assert.equal(completed.state.status, 'completed'); assert.equal(completed.state.input.content, 'changed');
  assert.equal(adapter.normalize(wire('permission.replied', { sessionID: 'ses_one', requestID: 'per_one', reply: 'once' }))[0].properties.requestID, 'per_one');
  assert.equal(adapter.normalize(wire('permission.replied', { sessionID: 'ses_one', requestID: 'per_one', decision: 'reject' }))[0].properties.reply, 'reject');
});

test('V2 interruptions including plain permission rejection terminate neutrally and never claim successful idle or user Stop', () => {
  const adapter = new EventAdapter('/synthetic/project');
  for (const reason of ['user', 'shutdown', 'superseded', 'inactivity']) {
    const events = adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_one', reason }));
    assert.equal(events.length, 1); assert.equal(events[0].type, 'engine.error');
    assert.equal(events[0].properties.error.name, 'Interrupted');
    assert.equal(events.some(event => event.type === 'session.idle' || event.type === 'run.status'), false);
  }
});

test('V2 suppresses only the matching own Stop acknowledgement; decline, foreign session and later executions retain errors', () => {
  const adapter = new EventAdapter('/synthetic/project');
  adapter.expectUserInterrupt('ses_owned');
  assert.equal(adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_foreign', reason: 'user' }))[0].type, 'engine.error');
  assert.deepEqual(adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' })), []);
  assert.equal(adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' }))[0].type, 'engine.error', 'a later plain permission rejection is not an own Stop');
  adapter.expectUserInterrupt('ses_owned');
  adapter.normalize(wire('session.execution.started', { sessionID: 'ses_owned' }));
  assert.deepEqual(adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' })), [], 'a previously queued started event cannot erase ownership of the current Stop');
  adapter.expectUserInterrupt('ses_owned');
  assert.equal(adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'shutdown' }))[0].type, 'engine.error');
});

test('V2 Stop arms acknowledgement before the HTTP request and cancels ownership on request failure', async () => {
  const engine = new OpenCodeEngine({ root: '/synthetic/project' }); engine.session = { id: 'ses_owned' }; engine.url = 'http://127.0.0.1:1';
  engine.request = async () => assert.deepEqual(engine.adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' })), []);
  await engine.abort();
  engine.active = true; engine.model = { id: 'chosen' };
  engine.adapter.expectUserInterrupt('ses_owned'); engine.request = async () => {};
  await engine.send('Explicit next task', 'Existing policy');
  assert.equal(engine.adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' }))[0].type, 'engine.error', 'an explicit new send cannot inherit an idle interrupt');
  engine.request = async () => { throw new Error('Controlled transport failure'); };
  await assert.rejects(engine.abort(), /Controlled transport failure/);
  assert.equal(engine.adapter.normalize(wire('session.execution.interrupted', { sessionID: 'ses_owned', reason: 'user' }))[0].type, 'engine.error');
});

test('V2 streamed tool JSON remains incremental and call IDs reused in another model step do not alias', () => {
  const adapter = new EventAdapter('/synthetic/project');
  const d = { sessionID: 'ses_one', assistantMessageID: 'msg_one', id: 'reused_call' };
  adapter.normalize(wire('session.tool.input.started', { ...d, name: 'write' }));
  assert.equal(adapter.normalize(wire('session.tool.input.delta', { ...d, delta: '{"path":"public/' }))[0].properties.part.state.input, '{"path":"public/');
  const streamed = '{"path":"public/index.html","content":"line 1\\nline 2"}';
  assert.equal(adapter.normalize(wire('session.tool.input.delta', { ...d, delta: 'index.html","content":"line 1\\nline 2"}' }))[0].properties.part.state.input, streamed);
  assert.equal(adapter.normalize(wire('session.tool.input.ended', { ...d, text: streamed }))[0].properties.part.state.input, streamed);
  const first = adapter.normalize(wire('session.tool.called', { ...d, input: JSON.parse(streamed) }))[0].properties.part;
  const second = adapter.normalize(wire('session.tool.input.started', { ...d, assistantMessageID: 'msg_two', name: 'shell' }))[0].properties.part;
  assert.notEqual(first.id, second.id); assert.equal(first.tool, 'write'); assert.equal(second.tool, 'bash');
  assert.equal(second.state.status, 'pending'); assert.equal(first.state.input.filePath, '/synthetic/project/public/index.html');
});

test('V2 forms become existing questions and only an owned question form can be answered', async () => {
  const engine = new OpenCodeEngine({ root: '/synthetic/project' }); engine.session = { id: 'ses_one' };
  const form = { id: 'frm_one', sessionID: 'ses_one', title: 'Questions', metadata: { kind: 'question' }, fields: [{ key: 'q0', type: 'string', title: 'Where', description: 'Where should it run?', custom: true, options: [{ value: 'Local', label: 'Local', description: 'This computer' }] }, { key: 'q1', type: 'multiselect', title: 'Options', description: 'Choose options', custom: true, options: [{ value: 'A', label: 'A' }] }] };
  const asked = engine.adapter.normalize(wire('form.created', { form }))[0];
  assert.equal(asked.type, 'question.asked'); assert.equal(asked.properties.questions[0].question, 'Where should it run?');
  assert.equal(asked.properties.questions[1].multiple, true);
  let sent; engine.wire = async (...args) => { sent = args.slice(0,3); };
  await engine.answerQuestion('frm_one', [['Local'], ['A', 'Custom']]);
  assert.deepEqual(sent, ['/api/session/ses_one/form/frm_one/reply', 'POST', { answer: { q0: 'Local', q1: ['A', 'Custom'] } }]);
  await assert.rejects(engine.answerQuestion('frm_foreign', [['Local']]), /ikke længere aktuelt/);
  const replied = engine.adapter.normalize(wire('form.replied', { id: 'frm_one', sessionID: 'ses_one', answer: { q0: 'Local' } }))[0];
  assert.equal(replied.type, 'question.replied'); assert.equal(replied.properties.requestID, 'frm_one');
  await assert.rejects(engine.answerQuestion('frm_one', [['Local'], ['A']]), /ikke længere aktuelt/);
});

test('V2 send sets selected agent, model and task policy before one explicit prompt; Stop never resumes', async () => {
  const f = fixture('plan'), engine = new OpenCodeEngine(f); engine.active = true; engine.session = { id: 'ses_one' };
  const calls = []; engine.wire = async (...args) => { calls.push(args.slice(0,3)); }; engine.captureBaseline=async()=>{};
  await engine.send('Approved user message', 'Existing task policies');
  assert.deepEqual(calls, [
    ['/api/session/ses_one/agent', 'POST', { agent: 'plan' }],
    ['/api/session/ses_one/model', 'POST', { model: { providerID: 'harness', id: 'vendor/chosen' } }],
    ['/api/experimental/session/ses_one/instructions/entries/aura-task', 'PUT', { value: 'Existing task policies' }],
    ['/api/session/ses_one/prompt', 'POST', { id:engine.promptID, text: 'Approved user message', resume: true }],
  ]);
  engine.url = 'http://127.0.0.1:1'; engine.pending.set('per_one', {});
  await engine.abort();
  assert.deepEqual(calls.at(-1), ['/api/session/ses_one/interrupt?resume=false', 'POST', undefined]);
  assert.equal(engine.pending.size, 0);
});

test('V2 message pagination follows opaque cursors without order and detects a broken repeated cursor', async () => {
  const engine = new OpenCodeEngine({ root: '/synthetic/project' }); engine.session = { id: 'ses_one' };
  const calls = [];
  engine.wire = async url => { calls.push(url); return calls.length === 1 ? { data: [{ id: 'msg_one', type: 'user', text: 'Remember this' }], cursor: { next: 'opaque/one' } } : { data: [{ id: 'msg_two', type: 'assistant', content: [{ type: 'text', text: 'Remembered' }] }], cursor: {} }; };
  const messages = await engine.messages();
  assert.deepEqual(calls, ['/api/session/ses_one/message?limit=100&order=asc', '/api/session/ses_one/message?limit=100&cursor=opaque%2Fone']);
  assert.equal(messages[0].parts[0].text, 'Remember this'); assert.equal(messages[1].parts[0].text, 'Remembered');
  engine.wire = async () => ({ data: [{ id: 'msg_one', type: 'user', text: 'Remember this' }], cursor: { next: 'broken' } });
  await assert.rejects(engine.messages(), /samtale|paginering/);
});

test('V2 bundled task-list compatibility asset is bounded, hashable and contains no IO or network imports', () => {
  const { SOURCE, SHA256 } = require('../core/engine-opencode2-todos.cjs');
  assert.equal(createHash('sha256').update(SOURCE).digest('hex'), SHA256);
  assert.match(SOURCE, /Schema\.isMaxLength\(30\)/); assert.match(SOURCE, /Schema\.isMaxLength\(2000\)/);
  assert.match(SOURCE, /ctx\.permission\.assert/); assert.match(SOURCE, /context\.signal\.throwIfAborted/);
  assert.match(SOURCE, /name: "todowrite"/); assert.match(SOURCE, /name: "todoread"/);
  assert.match(SOURCE, /Schema\.Literal\(false\)/); assert.match(SOURCE, /execute\.before/);
  assert.match(SOURCE, /background: false/);
  assert.doesNotMatch(SOURCE, /node:|fetch\(|https?:|child_process/);
});

test('V2 fixed task asset writer rejects linked directories and entries without following or replacing their targets', async t => {
  const fs = require('node:fs/promises'), os = require('node:os');
  const { writeTrustedAsset, SHA256 } = require('../core/engine-opencode2-todos.cjs');
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-v2-asset-test-')));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const good = path.join(temporary, 'good'); await writeTrustedAsset(good);
  assert.equal(createHash('sha256').update(await fs.readFile(path.join(good, 'index.mjs'))).digest('hex'), SHA256);
  const residue = path.join(temporary, '.aura-task-list-index.mjs.synthetic-crash-residue');
  await fs.writeFile(residue, 'Synthetic old atomic write residue');
  await writeTrustedAsset(good);
  assert.deepEqual((await fs.readdir(good)).sort(), ['index.mjs', 'package.json']);
  assert.equal(await fs.readFile(residue, 'utf8'), 'Synthetic old atomic write residue');
  const preserved = path.join(temporary, 'preserved'); await fs.writeFile(preserved, 'User data remains');
  const linked = path.join(temporary, 'linked'); await fs.symlink(good, linked, 'dir');
  await assert.rejects(writeTrustedAsset(linked));
  const unsafe = path.join(temporary, 'unsafe'); await fs.mkdir(unsafe); await fs.symlink(preserved, path.join(unsafe, 'index.mjs'));
  await assert.rejects(writeTrustedAsset(unsafe));
  assert.equal(await fs.readFile(preserved, 'utf8'), 'User data remains');
  const shadow = path.join(good, 'server.js'); await fs.writeFile(shadow, 'Synthetic server fallback canary');
  await assert.rejects(writeTrustedAsset(good));
  assert.equal(await fs.readFile(shadow, 'utf8'), 'Synthetic server fallback canary');
});

test('V2 private discovery directory allows activated skill files and rejects hidden agent authority or links without deleting', async t => {
  const fs = require('node:fs/promises'), os = require('node:os');
  const temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-v2-config-test-')));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  await validatePrivateConfigDirectory(temporary);
  const config = path.join(temporary, 'config'), skills = path.join(config, 'skills');
  await fs.mkdir(path.join(skills, 'harness-active', 'references'), { recursive: true });
  await fs.writeFile(path.join(skills, 'harness-active', 'SKILL.md'), 'Active skill');
  await fs.writeFile(path.join(skills, 'harness-active', 'references', 'chosen.md'), 'Chosen reference');
  await validatePrivateConfigDirectory(temporary);
  const legacyIgnore = 'node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore';
  await fs.writeFile(path.join(config, '.gitignore'), legacyIgnore);
  await fs.mkdir(path.join(config, 'opencode')); await fs.writeFile(path.join(config, 'opencode', '.gitignore'), legacyIgnore);
  await validatePrivateConfigDirectory(temporary);
  await fs.writeFile(path.join(config, 'opencode', '.gitignore'), legacyIgnore + 'unexpected\n');
  await assert.rejects(validatePrivateConfigDirectory(temporary), /effektive indstillinger afviger/);
  await fs.writeFile(path.join(config, 'opencode', '.gitignore'), legacyIgnore);
  const foreign = path.join(config, 'AGENTS.md'); await fs.writeFile(foreign, 'Unreviewed agent authority');
  await assert.rejects(validatePrivateConfigDirectory(temporary), /effektive indstillinger afviger/);
  assert.equal(await fs.readFile(foreign, 'utf8'), 'Unreviewed agent authority');
  await fs.unlink(foreign);
  const linked = path.join(skills, 'harness-linked'); await fs.symlink(path.join(skills, 'harness-active'), linked, 'dir');
  await assert.rejects(validatePrivateConfigDirectory(temporary), /effektive indstillinger afviger/);
  assert.equal((await fs.lstat(linked)).isSymbolicLink(), true);
});
