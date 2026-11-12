'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { Plugins, defaults, normalize } = require('../core/plugins.cjs');
const { permissions, engineConfig, OpenCodeEngine } = require('../core/engine.cjs');
const { nativeConfig, normalizedConfig, validateConfigEntries } = require('../core/engine-opencode2.cjs');

test('web search remains unavailable with a concrete review and revocation explanation', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-search-disabled-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {}), plugins = new Plugins(store);
  const before = await plugins.get(), definition = before.definitions.find(item => item.id === 'websearch');
  assert.equal(definition.available, false); assert.equal(before.values.websearch, false);
  assert.match(definition.reason, /søgeord.*datagennemgang/);
  assert.match(definition.reason, /modtager.*tilbagekaldelse/);
  const privateQuery = 'SYNTHETIC_PRIVATE_QUERY';
  for (const value of [true, { enabled: true, endpoint: 'http://127.0.0.1:1/search', query: privateQuery }, { enabled: false, endpoint: 'https://synthetic.example.invalid/search' }]) {
    await assert.rejects(plugins.save({ id: 'websearch', value }), error => !error.message.includes(privateQuery));
    assert.deepEqual(await plugins.get(), before);
  }
  await plugins.save({ id: 'websearch', value: false });
  assert.equal((await plugins.get()).values.websearch, false);
  assert.throws(() => normalize({ values: { websearch: true } }));
});

test('every mode denies search and removes it from native model context despite hostile plugin data', () => {
  const provider = { npm: '@ai-sdk/openai-compatible', options: {}, models: { synthetic: {} } };
  for (const mode of ['chat', 'plan', 'build', 'free']) {
    const permission = permissions('/synthetic', [], mode, null, { ...defaults(), websearch: true });
    assert.equal(permission.websearch || permission['*'], 'deny');
    const config = nativeConfig(engineConfig(provider, { id: 'synthetic' }, permission));
    assert.equal(config.websearch, false);
    assert.equal(config.permissions.filter(rule => ['*', 'websearch'].includes(rule.action) && rule.resource === '*').at(-1).effect, 'deny');
    const entries = [{ type: 'document', info: normalizedConfig(config) }];
    assert.equal(validateConfigEntries(entries, config, '/synthetic-engine'), true);
    for (const changed of [undefined, { provider: 'exa' }, { provider: 'random' }, { provider: 'synthetic' }]) {
      const injected = structuredClone(entries);
      if (changed === undefined) delete injected[0].info.websearch;
      else injected[0].info.websearch = changed;
      assert.equal(validateConfigEntries(injected, config, '/synthetic-engine'), false);
    }
  }
});

test('native: pinned engine excludes search from the actual model request inside network isolation', {
  skip: process.platform !== 'darwin' || process.arch !== 'arm64', timeout: 45000,
}, async t => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-search-native-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const workspace = path.join(root, 'workspace'), directory = path.join(root, 'engine');
  await fs.mkdir(workspace, { mode: 0o700 }); await fs.mkdir(directory, { mode: 0o700 });
  const model = await require('../scripts/fixtures/fake-provider.cjs').startFakeProvider({ synthetic: true, script: [{ text: 'SYNTHETIC_DONE' }] });
  t.after(() => model.close());
  const provider = { npm: '@ai-sdk/openai-compatible', options: { baseURL: model.url, apiKey: model.key }, models: { [model.model]: { tool_call: true, limit: { context: 8192, output: 1024 } } } };
  const engine = new OpenCodeEngine({ root: workspace, directory, provider, model: { id: model.model }, mode: 'free',
    privacyIsolation: ({ root, directory, port, guardian }) => require('../privacy/isolation/engine-isolation.cjs').createEngineIsolation({ workspaceRoot: root, stateRoot: directory, runtimeRoot: path.resolve(__dirname, '../.runtime/darwin-arm64'), gatewayURL: model.url, enginePort: port, trustedReadFiles: [guardian] }) });
  t.after(() => engine.close());
  await engine.start();
  assert.equal(engine.config.websearch, false); assert.equal(model.requests.length, 0);
  await engine.send('SYNTHETIC_NO_SEARCH', 'Return the fixed synthetic response.');
  const deadline = Date.now() + 10000;
  while (!model.requests.length && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(model.requests.length, 1);
  assert.ok(model.requests[0].body.tools.length > 0, 'Inspect the actual nonempty native tool catalog');
  assert.equal(model.requests[0].body.tools.some(tool => /web.?search/i.test(tool.function?.name || tool.name || '')), false);
  assert.equal(engine.pending.size, 0);
});
