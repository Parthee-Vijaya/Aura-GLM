const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { listModels, engineProvider } = require('../core/connections.cjs');
async function fixture(t, models) {
  let status = 200;
  const requests = [];
  const server = http.createServer((req, res) => { requests.push(req.url); res.writeHead(status); res.end(status === 200 ? JSON.stringify({ data: models }) : '{}'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { connection: { kind: 'compatible', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, requests, status: value => { status = value; } };
}
const fields = model => Object.fromEntries(['tools', 'images', 'streaming', 'reasoning'].map(field => [field, model.capabilities[field]]));

test('explicit provider capabilities preserve true and false and derive advisory build suitability', async t => {
  const f = await fixture(t, [
    { id: 'positive', capabilities: { function_calling: true, vision: true, streaming: true, reasoning: true } },
    { id: 'negative', capabilities: { function_calling: false, vision: false, streaming: false, reasoning: false } },
    { id: 'mixed', capabilities: { tools: true, images: false } }
  ]);
  const [positive, negative, mixed] = await listModels(f.connection);
  assert.deepEqual(fields(positive), { tools: true, images: true, streaming: true, reasoning: true });
  assert.deepEqual(fields(negative), { tools: false, images: false, streaming: false, reasoning: false });
  assert.deepEqual(fields(mixed), { tools: true, images: false, streaming: null, reasoning: null });
  for (const model of [positive, negative, mixed]) assert.equal(model.source, 'provider');
  assert.equal(positive.buildSuitable, true); assert.equal(negative.buildSuitable, false); assert.equal(mixed.buildSuitable, true);
  assert.equal(positive.capabilities.vision, true); assert.equal(negative.capabilities.vision, false);
  assert.deepEqual(f.requests, ['/v1/models']);
});

test('unknown or malformed metadata never guesses true from names, protocol or chat support', async t => {
  const f = await fixture(t, [
    { id: 'vision-tools-reasoning-streaming' },
    { id: 'explicit-chat', capabilities: { completion_chat: true } },
    { id: 'bad-types', capabilities: { function_calling: 'true', vision: 1, streaming: 'yes', reasoning: {} }, supported_parameters: [123], architecture: { input_modalities: [123] } }
  ]);
  for (const model of await listModels(f.connection)) {
    assert.deepEqual(fields(model), { tools: null, images: null, streaming: null, reasoning: null });
    assert.equal(model.source, 'unknown'); assert.equal(model.buildSuitable, null);
    assert.equal(model.capabilities.vision, undefined, 'the existing unknown vision alias remains absent');
  }
});

test('documented provider modality and supported-parameter lists normalize to tri-state fields', async t => {
  const f = await fixture(t, [
    { id: 'with-images', architecture: { input_modalities: ['text', 'image'] }, supported_parameters: ['tools', 'reasoning'] },
    { id: 'text-only', architecture: { input_modalities: ['text'] }, supported_parameters: [] },
    { id: 'image-input', capabilities: { image_input: { supported: true } } },
    { id: 'no-image-input', capabilities: { image_input: { supported: false } } }
  ]);
  const [images, text, nested, noNested] = await listModels(f.connection);
  assert.deepEqual(fields(images), { tools: true, images: true, streaming: null, reasoning: true });
  assert.deepEqual(fields(text), { tools: false, images: false, streaming: null, reasoning: false });
  assert.equal(nested.capabilities.images, true); assert.equal(noNested.capabilities.images, false);
});

test('existing dated model knowledge may establish reasoning but never tools, images or streaming', async t => {
  const f = await fixture(t, [{ id: 'claude-sonnet-5-5' }, { id: 'claude-haiku-4-5' }]);
  const [known, unknown] = await listModels({ ...f.connection, kind: 'anthropic' }, 'synthetic-key');
  assert.deepEqual(fields(known), { tools: null, images: null, streaming: null, reasoning: true });
  assert.equal(known.source, 'catalog'); assert.equal(known.buildSuitable, null);
  assert.deepEqual(fields(unknown), { tools: null, images: null, streaming: null, reasoning: null });
  assert.equal(unknown.source, 'unknown');
});

test('explicit provider reasoning false wins over known-model reasoning', async t => {
  const f = await fixture(t, [{ id: 'claude-sonnet-5-5', capabilities: { reasoning: false }, effort: { supported: true, levels: ['low', 'high'] } }]);
  const [model] = await listModels({ ...f.connection, kind: 'anthropic' }, 'synthetic-key');
  assert.equal(model.capabilities.reasoning, false); assert.equal(model.source, 'provider');
  assert.deepEqual(model.capabilities.effort, ['low', 'high']);
});

test('documented fallback catalogs and configured Azure deployment names never imply model capabilities', async t => {
  const f = await fixture(t, [{ id: 'gpt-5-synthetic' }]);
  const [deployment] = await listModels({ ...f.connection, kind: 'azure', deployment: 'gpt-5-synthetic' }, 'synthetic-key');
  assert.deepEqual(fields(deployment), { tools: null, images: null, streaming: null, reasoning: null });
  assert.equal(deployment.source, 'unknown'); assert.equal(deployment.configuredDeployment, true);
  f.status(404);
  for (const model of await listModels({ ...f.connection, kind: 'fireworks' }, 'synthetic-key')) {
    assert.deepEqual(fields(model), { tools: null, images: null, streaming: null, reasoning: null });
    assert.equal(model.source, 'catalog'); assert.equal(model.catalogFallback, true); assert.equal(model.buildSuitable, null);
  }
});

test('build suitability remains guidance and does not create a new engine permission or model block', async t => {
  const f = await fixture(t, [{ id: 'negative', capabilities: { function_calling: false } }, { id: 'unknown' }]);
  for (const model of await listModels(f.connection)) {
    assert.notEqual(model.buildSuitable, true);
    const provider = engineProvider(f.connection, model, 'http://127.0.0.1:1/v1', 'synthetic-session');
    assert.equal(provider.npm, '@ai-sdk/openai-compatible');
    assert.ok(provider.models[model.id], 'advisory capability data does not block an existing selection');
  }
});
