'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Store } = require('../core/store.cjs');
const { Plugins, defaults, normalize, validateValue, validateServer } = require('../core/plugins.cjs');
const { permissions, engineConfig, OpenCodeEngine } = require('../core/engine.cjs');
const { nativeConfig, normalizedConfig, validateConfigEntries } = require('../core/engine-opencode2.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-plugins-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  return { root, store, plugins: new Plugins(store) };
}
const local = { id: 'local-test', type: 'local', command: '/usr/bin/false', args: [] };
const remote = { id: 'remote-test', type: 'remote', url: 'https://mcp.example.invalid/tools' };

test('new extensions default off; existing webfetch and shell behavior is preserved without writing settings', async t => {
  const f = await fixture(t), result = await f.plugins.get();
  assert.deepEqual(result.values, { subagents: false, webfetch: 'ask', websearch: false, shell: {}, lsp: false, mcp: false, contextHud: false });
  assert.deepEqual(result.mcp, { servers: [] });
  await assert.rejects(fs.stat(path.join(f.root, 'settings.json')), { code: 'ENOENT' });
  assert.equal(result.definitions.length, 7);
  for (const definition of result.definitions) {
    assert.ok(definition.title && definition.summary && ['builtin', 'experimental'].includes(definition.group));
    assert.deepEqual(definition.default, result.values[definition.id]);
    if (!definition.available) assert.ok(definition.reason.length > 25);
  }
  result.definitions[0].available = true; result.values.shell.untrusted = true;
  assert.equal((await f.plugins.get()).definitions[0].available, false);
  assert.deepEqual((await f.plugins.get()).values.shell, {});
});

test('plugin updates persist globally and preserve other settings through serialized writes', async t => {
  const f = await fixture(t);
  await f.store.update(state => { state.profile = { name: 'Synthetic profile' }; state.projects = { synthetic: { keep: true } }; });
  await Promise.all([f.plugins.save({ id: 'webfetch', value: 'deny' }), f.plugins.save({ id: 'contextHud', value: true })]);
  const state = await f.store.read(), fresh = await new Plugins(new Store(f.root, {})).get();
  assert.equal(fresh.values.webfetch, 'deny'); assert.equal(fresh.values.contextHud, true);
  assert.deepEqual(state.profile, { name: 'Synthetic profile' }); assert.deepEqual(state.projects, { synthetic: { keep: true } });
  assert.deepEqual(state.plugins.values, fresh.values);
  await f.plugins.save({ id: 'webfetch', value: 'ask' });
  assert.equal((await f.plugins.get()).values.webfetch, 'ask');
});

test('validation rejects unknown fields, coercion, allow, unavailable activation and unsupported concurrency atomically', async t => {
  const f = await fixture(t);
  await f.plugins.save({ id: 'contextHud', value: false });
  const before = await f.store.read();
  for (const input of [null, [], {}, { id: 'unknown', value: true }, { id: '__proto__', value: true }, { id: 'webfetch', value: 'allow' }, { id: 'webfetch', value: true }, { id: 'contextHud', value: 1 }, { id: 'contextHud', value: true, permission: 'allow' }, { id: 'subagents', value: { enabled: true, maxConcurrent: 4 } }, ...['subagents', 'websearch', 'lsp', 'mcp'].map(id => ({ id, value: true })), { id: 'shell', value: { timeoutSeconds: 120, outputLimitKB: 50 } }, { id: 'contextHud', value: true, mcp: { remove: 'local-test' } }]) {
    await assert.rejects(f.plugins.save(input));
    assert.deepEqual(await f.store.read(), before);
  }
  for (const value of [{ timeoutSeconds: 29 }, { timeoutSeconds: 1801 }, { timeoutSeconds: 30.5 }, { outputLimitKB: 15 }, { outputLimitKB: 1025 }, { timeoutSeconds: '120' }]) assert.throws(() => validateValue('shell', value), /interval/);
  for (const value of [{ timeoutSeconds: 30 }, { timeoutSeconds: 1800 }, { outputLimitKB: 16 }, { outputLimitKB: 1024 }]) assert.throws(() => validateValue('shell', value), /global timeoutgrænse/);
  assert.deepEqual(validateValue('shell', {}), {});
});

test('MCP CRUD stores definitions only; both transports stay unavailable and never enter engine config', async t => {
  const f = await fixture(t);
  await f.plugins.save({ mcp: { add: local } });
  const result = await f.plugins.save({ mcp: { add: remote } });
  assert.equal(result.mcp.servers.length, 2);
  for (const server of result.mcp.servers) { assert.equal(server.enabled, false); assert.equal(server.available, false); assert.ok(server.reason.length > 25); }
  await f.plugins.save({ mcp: { update: { ...local, command: '/usr/bin/true', name: 'Synthetic replacement' } } });
  assert.equal((await f.plugins.get()).mcp.servers[0].command, '/usr/bin/true');
  const state = await f.store.read();
  assert.equal(Object.hasOwn(state.plugins.mcp.servers[0], 'available'), false);
  await f.plugins.save({ mcp: { remove: local.id } });
  assert.deepEqual((await f.plugins.get()).mcp.servers.map(server => server.id), [remote.id]);
  for (const input of [{ mcp: { add: remote } }, { mcp: { update: local } }, { mcp: { remove: 'missing' } }, { mcp: {} }, { mcp: { add: local, remove: remote.id } }, { mcp: { remove: remote.id }, value: true }]) await assert.rejects(f.plugins.save(input));
});

test('MCP validation rejects malformed definitions, credential fields, interpolation and active servers', () => {
  for (const input of [null, [], { ...local, id: 'x' }, { ...local, id: '../escape' }, { ...local, id: 'constructor' }, { ...local, enabled: true }, { ...local, type: 'other' }, { ...local, command: 'node; echo unsafe' }, { ...local, command: '{env:HOME}' }, { ...local, args: 'not-array' }, { ...local, args: ['bad\nargument'] }, { ...local, args: ['{file:/private/file}'] }, { ...local, args: Array(65).fill('x') }, { ...local, environment: { SYNTHETIC: 'value' } }, { ...local, url: remote.url }, { ...remote, url: 'http://example.invalid' }, { ...remote, url: 'https://user:synthetic@example.invalid' }, { ...remote, url: 'https://example.invalid?token=synthetic' }, { ...remote, url: 'https://example.invalid#synthetic' }, { ...remote, url: 'https://example.invalid/\n' }, { ...remote, url: 'https://example.invalid\\@other.invalid' }, { ...remote, headers: { Authorization: 'synthetic' } }, { ...remote, command: 'node' }]) assert.throws(() => validateServer(input));
  assert.equal(validateServer({ ...local, command: 'npx', args: ['--no-install', 'synthetic-server'] }).enabled, false);
  assert.equal(validateServer(remote).url, remote.url);
  assert.throws(() => normalize({ mcp: { servers: null } }));
  assert.throws(() => normalize({ mcp: { servers: [local, local] } }));
  assert.throws(() => normalize({ mcp: { servers: Array.from({ length: 33 }, (_, i) => ({ ...local, id: 'server-' + i })) } }));
  assert.throws(() => normalize({ values: { task: 'allow' } }));
  assert.throws(() => normalize({ values: { subagents: true } }));
});

test('chat and plan permissions remain exactly unchanged even with hostile plugin values', () => {
  const hostile = { ...defaults(), webfetch: 'deny', subagents: true, websearch: true, lsp: true, mcp: true, contextHud: true, shell: { timeoutSeconds: 1800 } };
  for (const mode of ['chat', 'plan']) {
    const existing = permissions('/synthetic', ['references/selected.txt'], mode);
    assert.deepEqual(permissions('/synthetic', ['references/selected.txt'], mode, null, hostile), existing);
    assert.equal(existing['*'], 'deny'); assert.equal(existing.webfetch, 'ask');
    assert.equal(existing.bash, undefined); assert.equal(existing.task, undefined);
  }
});

test('build/free offer only ask or deny and preserve protected files, skills and external boundaries', () => {
  for (const mode of ['free', 'build']) {
    const skills = { directory: '/synthetic/private-engine', names: ['harness-design'] };
    const base = permissions('/synthetic', ['references/selected.txt'], mode, skills);
    for (const webfetch of ['ask', 'deny', 'allow']) {
      const result = permissions('/synthetic', ['references/selected.txt'], mode, skills, { webfetch, subagents: true, websearch: true, lsp: true, mcp: true });
      assert.deepEqual(result, { ...base, webfetch: webfetch === 'deny' ? 'deny' : 'ask' });
      assert.equal(result.bash, 'ask'); assert.equal(result.task, 'deny'); assert.equal(result.lsp, 'deny'); assert.equal(result.websearch, 'deny');
      assert.ok(Object.values(result.read).includes('deny')); assert.ok(Object.values(result.edit).includes('deny'));
      assert.equal(result.external_directory['*'], 'ask');
    }
  }
});

test('native config carries webfetch restriction while disabling MCP, LSP and Code Mode', () => {
  const permission = permissions('/synthetic', [], 'free', null, { webfetch: 'deny' });
  const config = nativeConfig(engineConfig({ models: {} }, { id: 'synthetic-model' }, permission), []);
  assert.ok(config.permissions.some(rule => rule.action === 'webfetch' && rule.effect === 'deny'));
  assert.ok(config.permissions.some(rule => rule.action === 'subagent' && rule.effect === 'deny'));
  assert.deepEqual(config.permissions.at(-1), { action: 'execute', resource: '*', effect: 'deny' });
  assert.deepEqual(config.mcp, { servers: {} }); assert.equal(config.lsp, false);
  const entries = [{ type: 'document', info: normalizedConfig(config) }];
  assert.equal(validateConfigEntries(entries, config, '/synthetic/engine'), true);
  entries[0].info.permissions.find(rule => rule.action === 'webfetch').effect = 'ask';
  assert.equal(validateConfigEntries(entries, config, '/synthetic/engine'), false);
});

test('engine rejects a stale global permission before sending and never forwards MCP storage', async t => {
  const f = await fixture(t), engine = new OpenCodeEngine({ root: '/synthetic', directory: f.root, provider: {}, model: { id: 'synthetic-model' }, pluginStore: f.store });
  engine.active = true; engine.session = { id: 'synthetic-session' }; engine.pluginValues = defaults();
  const requests = []; engine.request = async (...args) => { requests.push(args); return null; };
  await f.plugins.save({ id: 'webfetch', value: 'deny' });
  await assert.rejects(engine.send('synthetic prompt', ''), /Pluginvalgene er ændret/);
  assert.equal(requests.length, 0);
  engine.pluginValues = (await f.plugins.get()).values;
  await f.plugins.save({ mcp: { add: remote } });
  await f.plugins.save({ id: 'contextHud', value: true });
  await engine.send('synthetic prompt', '');
  assert.equal(requests.length, 1);
  assert.equal(JSON.stringify(requests).includes(remote.url), false);
  engine.cancelCompletionCheck(); engine.lifecycle.abort();
});

test('corrupt persisted authority fails before executable discovery or process launch', async () => {
  const engine = new OpenCodeEngine({ root: '/synthetic', directory: '/synthetic/unused', provider: {}, model: {}, pluginStore: { read: async () => ({ plugins: { values: { mcp: true } } }) } });
  await assert.rejects(engine.startActual(), /MCP/);
});

test('engine waits for queued saves and cannot send with the old permission during an atomic rename', async t => {
  const f = await fixture(t);
  await f.plugins.save({ id: 'webfetch', value: 'ask' });
  let release, entered;
  const held = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const blocking = f.store.update(async () => { entered(); await held; });
  await ready;
  const saving = f.plugins.save({ id: 'webfetch', value: 'deny' });
  const engine = new OpenCodeEngine({ root: '/synthetic', directory: f.root, provider: {}, model: {}, pluginStore: f.store });
  engine.active = true; engine.pluginValues = defaults();
  let sent = 0, settled = false;
  engine.request = async () => { sent++; };
  const rejection = assert.rejects(engine.send('synthetic', '').finally(() => { settled = true; }), /Pluginvalgene er ændret/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false); assert.equal(sent, 0);
  release(); await blocking; await saving; await rejection;
  assert.equal(sent, 0);
});

test('preload exposes exactly the additive plugin IPC methods', async () => {
  const calls = []; let api;
  vm.runInNewContext(await fs.readFile(path.join(__dirname, '../preload.cjs'), 'utf8'), { require: () => ({ contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } }, ipcRenderer: { invoke: (...args) => { calls.push(args); }, on() {}, removeListener() {} } }) });
  api.pluginsGet(); api.pluginsSave({ id: 'webfetch', value: 'deny' });
  assert.equal(calls[0][0], 'plugins:get'); assert.equal(calls[1][0], 'plugins:save');
});

test('native: pinned engine enforces stored webfetch config inside Privacy isolation without a model call', { skip: process.platform !== 'darwin' || process.arch !== 'arm64', timeout: 45000 }, async t => {
  const f = await fixture(t), parent = await fs.realpath(f.root);
  const root = path.join(parent, 'workspace'), directory = path.join(parent, 'engine');
  await fs.mkdir(root, { mode: 0o700 }); await fs.mkdir(directory, { mode: 0o700 });
  const seen = [], server = require('node:http').createServer((request, response) => { seen.push(request.url); response.writeHead(500).end(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const gatewayURL = `http://127.0.0.1:${server.address().port}`;
  await f.plugins.save({ id: 'webfetch', value: 'deny' });
  await f.plugins.save({ mcp: { add: remote } });
  const model = { id: 'synthetic-no-call', name: 'Synthetic no-call', limit: { context: 4096, output: 1024 } };
  const provider = { npm: '@ai-sdk/openai-compatible', options: { baseURL: gatewayURL + '/v1', apiKey: 'synthetic-token' }, models: { [model.id]: model } };
  const engine = new OpenCodeEngine({ root, directory, provider, model, pluginStore: f.store, mode: 'free', privacyIsolation: ({ root, directory, port, guardian }) => require('../privacy/isolation/engine-isolation.cjs').createEngineIsolation({ workspaceRoot: root, stateRoot: directory, runtimeRoot: path.resolve(__dirname, '../.runtime/darwin-arm64'), gatewayURL, enginePort: port, trustedReadFiles: [guardian] }) });
  t.after(() => engine.close());
  assert.match(await engine.start(), /^ses_/);
  assert.ok(engine.config.permissions.some(rule => rule.action === 'webfetch' && rule.effect === 'deny'));
  assert.equal(engine.config.lsp, false); assert.deepEqual(engine.config.mcp, { servers: {} });
  assert.deepEqual(seen, []);
});
