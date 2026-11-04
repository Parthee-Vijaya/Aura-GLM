'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { Plugins, defaults } = require('../core/plugins.cjs');
const { permissions, engineConfig, OpenCodeEngine } = require('../core/engine.cjs');
const { nativeConfig, normalizedConfig, validateConfigEntries } = require('../core/engine-opencode2.cjs');

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-command-disabled-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  return { root, store, plugins: new Plugins(store) };
}

test('terminal limits cannot be saved as an enforced promise while descendant and output ceilings are unqualified', async t => {
  const f = await fixture(t);
  const before = await f.plugins.get(), definition = before.definitions.find(item => item.id === 'shell');
  assert.equal(definition.available, false); assert.deepEqual(before.values.shell, {});
  assert.match(definition.reason, /outputfil-loft/);
  assert.match(definition.reason, /timeout og Stop.*efterkommerprocesser/);
  for (const timeoutSeconds of [30, 120, 1800]) for (const outputLimitKB of [16, 128, 1024]) {
    await assert.rejects(f.plugins.save({ id: 'shell', value: { timeoutSeconds, outputLimitKB } }), /Terminalgrænser er slået fra/);
    assert.deepEqual(await f.plugins.get(), before);
  }
  await f.plugins.save({ id: 'shell', value: {} });
  assert.deepEqual((await f.plugins.get()).values.shell, {});
});

test('a user supplied locked-server label grants no MCP authority in any mode', async t => {
  const f = await fixture(t), server = { id: 'aura-calculator', name: 'Locked calculator', type: 'local', command: 'node', args: ['synthetic-only.cjs'] };
  await f.plugins.save({ mcp: { add: server } });
  const before = await f.plugins.get(), definition = before.definitions.find(item => item.id === 'mcp');
  assert.equal(definition.available, false); assert.equal(before.values.mcp, false);
  assert.match(definition.reason, /net- og filadgang/); assert.match(definition.reason, /præcise argumenter/);
  for (const input of [{ id: 'mcp', value: true }, { mcp: { update: { ...server, enabled: true } } }, { mcp: { update: { ...server, builtin: true } } }]) {
    await assert.rejects(f.plugins.save(input)); assert.deepEqual(await f.plugins.get(), before);
  }
  for (const mode of ['chat', 'plan', 'free', 'build']) {
    const permission = permissions('/synthetic', [], mode, null, { ...defaults(), mcp: true, shell: { timeoutSeconds: 30, outputLimitKB: 16 } });
    assert.deepEqual(permission, permissions('/synthetic', [], mode));
    const config = nativeConfig(engineConfig({ models: {} }, { id: 'synthetic' }, permission));
    assert.deepEqual(config.mcp, { servers: {} });
    assert.ok(config.permissions.some(rule => rule.action === 'execute' && rule.effect === 'deny'));
    for (const injected of [{ type: 'local', command: ['node', 'synthetic-only.cjs'], codemode: false }, { type: 'remote', url: 'https://synthetic.example.invalid/mcp', codemode: false }]) {
      const effective = normalizedConfig(config); effective.mcp = { servers: { 'aura-calculator': injected } };
      assert.equal(validateConfigEntries([{ type: 'document', info: effective }], config, '/synthetic-engine'), false);
    }
  }
});

test('native: stored local MCP executable never starts and exposes no tool to the pinned model', {
  skip: process.platform !== 'darwin' || process.arch !== 'arm64', timeout: 45000,
}, async t => {
  const f = await fixture(t), workspace = path.join(f.root, 'workspace'), directory = path.join(f.root, 'engine');
  await fs.mkdir(workspace, { mode: 0o700 }); await fs.mkdir(directory, { mode: 0o700 });
  const marker = path.join(workspace, 'unexpected-mcp-start'), script = path.join(workspace, 'synthetic-mcp.cjs');
  await fs.writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected');`);
  const node = path.resolve(__dirname, '../.runtime/darwin-arm64/node/bin/node');
  await f.plugins.save({ mcp: { add: { id: 'aura-calculator', type: 'local', command: node, args: [script] } } });
  const model = await require('../scripts/fixtures/fake-provider.cjs').startFakeProvider({ synthetic: true, script: [{ text: 'SYNTHETIC_NO_MCP' }] });
  t.after(() => model.close());
  const provider = { npm: '@ai-sdk/openai-compatible', options: { baseURL: model.url, apiKey: model.key }, models: { [model.model]: { tool_call: true, limit: { context: 8192, output: 1024 } } } };
  const engine = new OpenCodeEngine({ root: workspace, directory, provider, model: { id: model.model }, pluginStore: f.store, mode: 'free',
    privacyIsolation: ({ root, directory, port, guardian }) => require('../privacy/isolation/engine-isolation.cjs').createEngineIsolation({ workspaceRoot: root, stateRoot: directory, runtimeRoot: path.resolve(__dirname, '../.runtime/darwin-arm64'), gatewayURL: model.url, enginePort: port, trustedReadFiles: [guardian] }) });
  t.after(() => engine.close());
  await engine.start();
  assert.deepEqual(engine.config.mcp, { servers: {} }); assert.equal(model.requests.length, 0);
  await engine.send('SYNTHETIC_NO_MCP', 'Return the fixed synthetic response.');
  const deadline = Date.now() + 10000;
  while (!model.requests.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(model.requests.length, 1);
  const tools = model.requests[0].body.tools;
  assert.ok(tools.length > 0);
  assert.equal(tools.some(tool => /mcp|aura.calculator/i.test(tool.function?.name || tool.name || '')), false);
  await assert.rejects(fs.access(marker), { code: 'ENOENT' });
  assert.equal(engine.pending.size, 0);
});
