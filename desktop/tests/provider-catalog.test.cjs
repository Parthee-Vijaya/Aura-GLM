const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { definitions, normalize, endpoint, modelCatalogURL, listModels, disclosure, engineProvider } = require('../core/connections.cjs');
const { CredentialReceipts } = require('../core/credential-entry.cjs');

const addedKinds = ['google', 'groq', 'together', 'fireworks', 'cerebras', 'xai', 'perplexity', 'huggingface', 'nvidia', 'moonshot', 'cloudflare', 'lmstudio', 'vllm'];
const accountURL = 'https://api.cloudflare.com/client/v4/accounts/' + 'a'.repeat(32) + '/ai/v1';
const custom = { kind: 'compatible', name: 'Synthetic server', baseURL: 'https://synthetic.example.invalid/v1' };
const secret = 'synthetic-provider-catalog-not-a-real-key';
const model = { id: 'synthetic-model', name: 'Synthetic model' };
const gatewayURL = 'http://127.0.0.1:1/v1';

test('catalog metadata is complete and dated evidence stays separate from unverified terms', () => {
  assert.equal(Object.hasOwn(definitions, 'deepseek'), false);
  for (const [kind, def] of Object.entries(definitions)) {
    assert.ok(['popular', 'eu', 'local', 'custom'].includes(def.group), kind);
    assert.ok(['openai', 'responses', 'anthropic'].includes(def.protocol), kind);
    assert.equal(typeof def.termsVerified, 'boolean', kind);
    assert.equal(typeof def.provider, 'string', kind);
    assert.equal(typeof def.keyURL, 'string', kind);
    if (def.keyURL) assert.equal(new URL(def.keyURL).protocol, 'https:', kind);
    if (def.termsVerified) {
      assert.match(def.source, /^https:\/\//, kind);
      assert.match(def.checkedAt, /^\d{4}-\d{2}-\d{2}$/, kind);
    } else for (const field of ['training', 'region', 'retention']) {
      // Local servers keep region empty, so disclosure() can name a loopback address honestly.
      if (field === 'region' && ['ollama', 'compatible'].includes(kind)) { assert.equal(def.region, undefined, `${kind}.region`); continue; }
      // Older unverified providers keep their own sourced sentence; new ones carry the neutral text.
      const own = { openrouter: ['training'], ollama: ['training'], compatible: ['training'] }[kind] || [];
      if (own.includes(field)) assert.ok(def[field] && !def[field].includes('Ikke kontrolleret af Aura'), `${kind}.${field} keeps its own text`);
      else assert.ok(def[field].includes('Ikke kontrolleret af Aura. Læs udbyderens vilkår.'), `${kind}.${field}`);
    }
  }
  for (const kind of ['openai', 'azure', 'corti', 'alexandra', 'mistral', 'anthropic', 'zen']) assert.equal(definitions[kind].termsVerified, true, kind);
  for (const kind of ['cerebras', 'nvidia', 'lmstudio', 'vllm']) assert.equal(definitions[kind].termsVerified, false, kind);
  for (const kind of addedKinds) {
    assert.match(definitions[kind].endpointSource, /^https:\/\//, kind);
    assert.equal(definitions[kind].checkedAt, '2026-11-04', kind);
  }
});

for (const kind of addedKinds) test(`${kind}: normalize, engine adapter and disclosure use the catalog`, () => {
  const connection = normalize({ kind, name: ` Synthetic ${kind} `, ...(kind === 'cloudflare' ? { baseURL: accountURL } : {}) });
  assert.equal(connection.name, `Synthetic ${kind}`);
  assert.equal(connection.baseURL, kind === 'cloudflare' ? accountURL : definitions[kind].baseURL);
  const data = disclosure(connection, model);
  assert.equal(data.termsVerified, definitions[kind].termsVerified);
  assert.equal(data.checkedAt, '2026-11-04');
  assert.equal(data.source, definitions[kind].source);
  assert.equal(data.endpointSource, definitions[kind].endpointSource);
  assert.match(data.recipients, new RegExp(new URL(connection.baseURL).hostname.replaceAll('.', '\\.')));
  const provider = engineProvider(connection, model, gatewayURL, 'synthetic-session-token');
  assert.equal(provider.npm, ['xai', 'perplexity'].includes(kind) ? '@ai-sdk/openai' : '@ai-sdk/openai-compatible');
  assert.equal(provider.options.baseURL, gatewayURL);
});

test('hosted providers keep their destination; local servers allow explicit addresses and defaults', () => {
  for (const kind of addedKinds.filter(kind => !['cloudflare', 'lmstudio', 'vllm'].includes(kind))) {
    assert.equal(normalize({ kind, name: kind, baseURL: 'https://other.example.invalid/v1', protocol: 'anthropic' }).baseURL, definitions[kind].baseURL);
  }
  for (const kind of ['lmstudio', 'vllm', 'ollama']) {
    assert.equal(normalize({ kind, name: kind }).baseURL, definitions[kind].baseURL);
    assert.equal(normalize({ kind, name: kind, baseURL: 'http://localhost:12345/v1/' }).baseURL, 'http://localhost:12345/v1');
  }
});

test('editable base URLs are declared only for providers whose normalization accepts user addresses', () => {
  const editable = ['azure', 'ollama', 'compatible', 'cloudflare', 'lmstudio', 'vllm'];
  for (const [kind, def] of Object.entries(definitions)) assert.equal(def.editableBaseURL === true, editable.includes(kind), kind);
});

test('provider account IPC opens only catalog HTTPS links or existing fixed pages', () => {
  const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../main.cjs'), 'utf8');
  const start = source.indexOf('const accountPages = {');
  const end = source.indexOf("handle('setup:status'", start);
  assert.ok(start >= 0 && end > start);
  const handlers = new Map(), opened = [];
  require('node:vm').runInNewContext(source.slice(start, end), {
    require: id => { assert.equal(id, './core/connections.cjs'); return { definitions: { ...definitions, syntheticHttp: { keyURL: 'http://synthetic.example.invalid/keys' }, syntheticMissing: {} } }; },
    handle: (channel, handler) => handlers.set(channel, handler),
    shell: { openExternal: url => { opened.push(url); return url; } }
  });
  const open = handlers.get('connections:account');
  for (const kind of addedKinds) assert.equal(open({ kind, page: 'start' }), definitions[kind].keyURL, kind);
  assert.equal(open('google'), definitions.google.keyURL);
  assert.equal(open({ kind: 'openai', page: 'start' }), 'https://platform.openai.com/', 'existing starts are preserved');
  assert.equal(open({ kind: 'anthropic', page: 'billing' }), 'https://platform.claude.com/settings/billing');
  assert.equal(open({ kind: 'google', page: 'start', url: 'https://other.example.invalid/' }), definitions.google.keyURL, 'renderer URLs are ignored');
  const before = opened.length;
  for (const input of [{ kind: 'syntheticHttp' }, { kind: 'syntheticMissing' }, { kind: 'compatible' }, { kind: 'unknown', url: 'https://other.example.invalid' }, { kind: 'https://other.example.invalid' }, { kind: '__proto__' }, { kind: 'constructor' }, { kind: 'google', page: '__proto__' }, { kind: 'google', page: 'keys' }, { kind: 'google', page: 'https://other.example.invalid' }]) assert.throws(() => open(input), /egen server/);
  assert.equal(opened.length, before);
});

test('custom protocols and optional providerID survive normalization and affect disclosure', () => {
  assert.equal(normalize(custom).protocol, 'openai');
  for (const [protocol, npm] of [['openai', '@ai-sdk/openai-compatible'], ['responses', '@ai-sdk/openai'], ['anthropic', '@ai-sdk/anthropic']]) {
    const connection = normalize({ ...custom, protocol, providerID: 'synthetic-provider-2' });
    assert.equal(connection.protocol, protocol);
    assert.equal(connection.providerID, 'synthetic-provider-2');
    assert.equal(engineProvider(connection, model, gatewayURL, 'synthetic-session-token').npm, npm);
    const data = disclosure(connection, model);
    assert.equal(data.providerID, connection.providerID);
    assert.equal(data.protocol, protocol);
    assert.notEqual(data.fingerprint, disclosure({ ...connection, providerID: 'other-provider' }, model).fingerprint);
    assert.notEqual(data.fingerprint, disclosure({ ...connection, protocol: protocol === 'openai' ? 'responses' : 'openai' }, model).fingerprint);
  }
  for (const protocol of ['', null, false, 'gemini', 'Anthropic', {}, []]) assert.throws(() => normalize({ ...custom, protocol }), /Vælg/);
  for (const providerID of ['a', 'a'.repeat(41), 'Provider', '2provider', '-provider', 'provider_id', 'provider/id', 'provider.id', ' provider', null, 2, {}]) assert.throws(() => normalize({ ...custom, providerID }), /Udbyder-id/);
  for (const providerID of ['ab', 'a'.repeat(40), 'a-1']) assert.equal(normalize({ ...custom, providerID }).providerID, providerID);
  assert.equal(Object.hasOwn(normalize({ ...custom, providerID: '' }), 'providerID'), false);
});

test('baseURL rejects login, query strings, fragments and unsupported protocols without reflecting secrets', () => {
  const invalid = [`https://${secret}@example.invalid/v1`, `https://example.invalid/v1?key=${secret}`, `https://example.invalid/v1#${secret}`, `file:///${secret}`, secret, ''];
  for (const kind of ['compatible', 'lmstudio', 'vllm', 'ollama']) for (const baseURL of invalid.filter(value => value || kind === 'compatible')) {
    assert.throws(() => normalize({ ...custom, kind, baseURL }), error => !error.message.includes(secret));
  }
  assert.equal(endpoint('http://[::1]:1234/v1/'), 'http://[::1]:1234/v1');
});

test('Cloudflare requires its own HTTPS origin, account ID and exact AI path', () => {
  assert.equal(normalize({ kind: 'cloudflare', name: 'Cloudflare', baseURL: accountURL + '/' }).baseURL, accountURL);
  assert.equal(modelCatalogURL({ kind: 'cloudflare', baseURL: accountURL }), accountURL.replace(/\/v1$/, '/models/search'));
  for (const baseURL of ['', 'https://api.cloudflare.com', accountURL.replace('https:', 'http:'), accountURL.replace('api.cloudflare.com', 'api.cloudflare.com.evil.invalid'), accountURL.replace('/ai/v1', '/ai/run'), accountURL.replace('a'.repeat(32), 'account'), accountURL.replace('api.cloudflare.com', 'api.cloudflare.com:8443'), accountURL + '?key=' + secret, accountURL + '#' + secret, accountURL.replace('https://', `https://${secret}@`)]) {
    assert.throws(() => normalize({ kind: 'cloudflare', name: 'Cloudflare', baseURL }), error => !error.message.includes(secret));
  }
});

test('providerID is bound to the secure one-use key receipt', () => {
  const receipts = new CredentialReceipts();
  const configuration = { ...custom, providerID: 'synthetic-provider', protocol: 'anthropic' };
  const receipt = receipts.put('connection', configuration, secret);
  assert.throws(() => receipts.consume('connection', { ...configuration, providerID: 'different-provider' }, receipt), /ændret/);
  assert.throws(() => receipts.consume('connection', configuration, receipt), /udløbet/);
  const bound = receipts.put('connection', configuration, secret);
  assert.equal(receipts.consume('connection', configuration, bound), secret);
});

test('custom model catalogs use the selected protocol authentication over actual HTTP', async t => {
  const received = [];
  const server = http.createServer((req, res) => {
    received.push({ url: req.url, headers: req.headers });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ data: [model] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  for (const protocol of ['openai', 'responses', 'anthropic']) {
    const connection = normalize({ ...custom, baseURL: `http://127.0.0.1:${server.address().port}/v1`, protocol });
    assert.deepEqual((await listModels(connection, secret)).map(value => value.id), [model.id]);
    const request = received.at(-1);
    assert.equal(request.url, '/v1/models');
    assert.equal(request.headers.authorization, protocol === 'anthropic' ? undefined : `Bearer ${secret}`);
    assert.equal(request.headers['x-api-key'], protocol === 'anthropic' ? secret : undefined);
    assert.equal(request.headers['anthropic-version'], protocol === 'anthropic' ? '2023-06-01' : undefined);
  }
});

test('every new hosted model catalog uses the documented URL and recognizes its response shape', async t => {
  let expected;
  t.mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, expected.url);
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    return new Response(JSON.stringify(expected.response));
  });
  for (const kind of addedKinds) {
    const connection = normalize({ kind, name: kind, ...(kind === 'cloudflare' ? { baseURL: accountURL } : {}) });
    expected = { url: kind === 'cloudflare' ? accountURL.replace(/\/v1$/, '/models/search') : connection.baseURL + '/models', response: kind === 'cloudflare' ? { result: [{ id: 'uuid', name: '@cf/synthetic-model', task: { name: 'Text Generation' } }, { id: 'embedding-uuid', name: '@cf/embedding', task: { name: 'Text Embeddings' } }] } : kind === 'together' ? [model] : { data: [model] } };
    const models = await listModels(connection, secret);
    assert.equal(models.length, 1, kind);
    assert.equal(models[0].id, kind === 'cloudflare' ? '@cf/synthetic-model' : model.id, kind);
  }
});

test('recommendations only replace unsupported model-list routes, never access or network failures', async t => {
  let status = 404;
  t.mock.method(global, 'fetch', async () => new Response(secret, { status }));
  for (const kind of ['fireworks', 'nvidia']) {
    const connection = normalize({ kind, name: kind });
    for (status of [404, 405]) {
      const models = await listModels(connection, secret);
      assert.deepEqual(models.map(value => value.id), definitions[kind].models);
      assert.equal(models[0].catalogFallback, true);
      assert.equal(models[0].capabilities.tools, null);
    }
    for (status of [401, 403, 429, 500]) await assert.rejects(listModels(connection, secret), error => error.status === status && !error.message.includes(secret));
    await assert.rejects(listModels(connection, ''), /API-nøgle/);
  }
  status = 404;
  await assert.rejects(listModels(normalize({ kind: 'groq', name: 'Groq' }), secret), /HTTP 404/);
});

test('catalog and validation errors never include provider bodies, API keys or decoded key content', async t => {
  const connection = normalize(custom);
  t.mock.method(global, 'fetch', async () => { throw new Error(secret); });
  await assert.rejects(listModels(connection, secret), error => !String(error).includes(secret));
  global.fetch.mock.mockImplementation(async () => new Response(secret));
  await assert.rejects(listModels(connection, secret), error => !String(error).includes(secret));
  global.fetch.mock.mockImplementation(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(secret)); } })));
  await assert.rejects(listModels(connection, secret), error => /kunne ikke læses/.test(error.message) && !String(error).includes(secret));
  const decodedSecret = secret.replaceAll('-', '');
  const encoded = Buffer.from(`xx-${decodedSecret}:synthetic-payload`).toString('base64');
  assert.throws(() => normalize({ kind: 'corti', name: 'Corti', apiKey: encoded }), error => !error.message.includes(decodedSecret) && !error.message.includes(encoded));
  assert.throws(() => normalize({ ...custom, apiKey: secret + '\n' }), error => !error.message.includes(secret));
});

test('catalog discovery rechecks the privacy lease and refuses a different destination', async t => {
  let calls = 0;
  t.mock.method(global, 'fetch', async () => { calls++; return new Response(JSON.stringify({ data: [model] })); });
  await assert.rejects(listModels(normalize(custom), secret, { assertCurrent: () => false }), /dataregler/);
  assert.equal(calls, 0);
  await assert.rejects(listModels(normalize({ kind: 'cloudflare', name: 'Cloudflare', baseURL: accountURL }), secret, { assertCurrent: address => {
    if (address !== accountURL + '/models') throw new Error('Synthetic destination mismatch');
    return true;
  } }), /destination mismatch/);
  assert.equal(calls, 0);
});

test('compatible Anthropic streams tool calls through a real local gateway without exposing credentials', async t => {
  const received = [], failures = [];
  let denied = false;
  const server = http.createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ url: req.url, headers: req.headers, body: JSON.parse(raw) });
    if (denied) { res.writeHead(401); res.end(secret); return; }
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"synthetic-tool","name":"read","input":{}}}\n\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{}"}}\n\nevent: message_stop\ndata: {"type":"message_stop"}\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const connection = normalize({ ...custom, baseURL: `http://127.0.0.1:${server.address().port}/v1`, protocol: 'anthropic', providerID: 'synthetic-anthropic' });
  const gateway = await require('../core/gateway.cjs').startGateway(connection, model, secret, null, (...args) => failures.push(args), { effort: 'low', retryDelays: [] });
  t.after(() => gateway.close());
  const messages = [{ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'synthetic-previous', content: 'Synthetic result' }] }];
  const body = { model: model.id, system: 'Synthetic reviewed instructions', messages, stream: true, max_tokens: 1024, tools: [{ name: 'read', input_schema: { type: 'object', properties: {} } }], plugins: ['untrusted'], models: ['other'] };
  const send = key => fetch(gateway.url + '/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key }, body: JSON.stringify(body) });
  assert.equal((await send(secret)).status, 401, 'only the temporary gateway credential admits engine traffic');
  assert.equal(received.length, 0);
  const response = await send(gateway.token);
  assert.equal(response.status, 200);
  const stream = await response.text();
  assert.match(stream, /tool_use/); assert.match(stream, /message_stop/); assert.doesNotMatch(stream, new RegExp(secret));
  assert.equal(received[0].url, '/v1/messages');
  assert.equal(received[0].headers['x-api-key'], secret);
  assert.equal(received[0].headers['anthropic-version'], '2023-06-01');
  assert.equal(received[0].headers.authorization, undefined);
  assert.deepEqual(received[0].body.messages, messages);
  assert.equal(received[0].body.system, body.system);
  assert.deepEqual(received[0].body.tools, body.tools);
  assert.deepEqual(received[0].body.output_config, { effort: 'low' });
  assert.equal(received[0].body.plugins, undefined); assert.equal(received[0].body.models, undefined);
  assert.deepEqual(failures, []);
  denied = true;
  const failure = await send(gateway.token);
  assert.equal(failure.status, 401); assert.doesNotMatch(await failure.text(), new RegExp(secret));
  assert.equal(failures[0][1].kind, 'key'); assert.doesNotMatch(failures[0][0], new RegExp(secret));
  assert.equal((await send(gateway.token)).status, 409);
  assert.equal(received.length, 2, 'a failed connection does not retry or select another provider');
});
