const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { startFakeProvider, SYNTHETIC_KEY } = require('../scripts/fixtures/fake-provider.cjs');
const { startGateway } = require('../core/gateway.cjs');

const suffix = { chat: '/chat/completions', responses: '/responses', anthropic: '/messages' };
const kind = { chat: 'compatible', responses: 'openai', anthropic: 'anthropic' };
const task = { role: 'user', content: 'Synthetic fixture task.' };
async function fixture(t, script, options = {}) {
  const provider = await startFakeProvider({ synthetic: true, script, ...options });
  t.after(() => provider.close());
  return provider;
}
function send(provider, protocol = 'chat', stream = true, options = {}) {
  return fetch(provider.url + suffix[protocol], { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${SYNTHETIC_KEY}` },
    body: JSON.stringify({ model: provider.model, stream, ...(protocol === 'responses' ? { input: [task] } : { messages: [task], ...(protocol === 'anthropic' ? { max_tokens: 100 } : {}) }) }), ...options });
}
function frames(text) { return text.split('\n').filter(line => line.startsWith('data: ') && line !== 'data: [DONE]').map(line => JSON.parse(line.slice(6))); }
async function gate(t, provider, protocol = 'chat', options = {}) {
  const failures = [], recovery = [];
  const gateway = await startGateway({ kind: kind[protocol], baseURL: provider.url }, { id: provider.model }, provider.key, null,
    (...event) => failures.push(event), { retryDelays: [5, 10], idleLimit: 1000, graceLimit: 0, totalLimit: 3000, onRecovery: event => recovery.push(event), ...options });
  t.after(() => gateway.close());
  const run = () => send({ ...provider, url: gateway.url }, protocol, true, { headers: { authorization: `Bearer ${gateway.token}` } });
  return { gateway, failures, recovery, send: run };
}

test('provider requires explicit synthetic input, loopback binding and a bounded declarative script', async () => {
  for (const options of [{}, { script: [{}] }, { synthetic: true, script: [] }, { synthetic: true, script: [{}], host: '0.0.0.0' },
    { synthetic: true, script: [{}], recordFile: '/tmp/not-allowed' }, { synthetic: true, script: [{ delayMs: 60001 }] },
    { synthetic: true, script: [{ protocol: 'unknown' }] }, { synthetic: true, script: [{ status: 200 }] },
    { synthetic: true, script: [{ status: 503, text: 'not both' }] }, { synthetic: true, script: [{}], maxRequestBytes: 4000001 }]) {
    await assert.rejects(startFakeProvider(options));
  }
});

for (const protocol of ['chat', 'responses', 'anthropic']) test(`${protocol}: real loopback HTTP returns text and tool JSON in both response modes`, async t => {
  const tool = { id: 'call_once', name: 'write', arguments: JSON.stringify({ file: 'public/index.html', content: '<p>Synthetic æøå</p>' }) };
  const step = { protocol, chunks: ['Synthetic ', 'æøå'], toolCalls: [tool] };
  const provider = await fixture(t, [step, step]);
  assert.equal(new URL(provider.url).hostname, '127.0.0.1');
  const streamed = await send(provider, protocol), wire = await streamed.text(), events = frames(wire);
  assert.equal(streamed.status, 200); assert.match(streamed.headers.get('content-type'), /text\/event-stream/);
  const complete = await send(provider, protocol, false), body = await complete.json();
  assert.equal(complete.status, 200); assert.equal(body.model, provider.model);
  if (protocol === 'chat') {
    assert.equal(events.flatMap(event => event.choices).map(choice => choice.delta.content || '').join(''), 'Synthetic æøå');
    assert.equal(events.at(-1).choices[0].finish_reason, 'tool_calls'); assert.match(wire, /data: \[DONE\]/);
    assert.deepEqual(body.choices[0].message.tool_calls[0].function, { name: tool.name, arguments: tool.arguments });
  } else if (protocol === 'responses') {
    assert.equal(events.filter(event => event.type === 'response.output_text.delta').map(event => event.delta).join(''), 'Synthetic æøå');
    assert.equal(events.at(-1).type, 'response.completed'); assert.deepEqual(events.map(event => event.sequence_number), events.map((_, i) => i));
    assert.equal(body.output[1].call_id, tool.id); assert.equal(body.output[1].arguments, tool.arguments);
  } else {
    assert.equal(events.filter(event => event.delta?.type === 'text_delta').map(event => event.delta.text).join(''), 'Synthetic æøå');
    assert.equal(events.at(-1).type, 'message_stop'); assert.equal(body.stop_reason, 'tool_use');
    assert.deepEqual(body.content[1].input, JSON.parse(tool.arguments));
  }
  assert.equal(provider.requests.length, 2);
  assert.ok(provider.requests.every(request => request.protocol === protocol && request.body.model === provider.model));
  assert.doesNotMatch(JSON.stringify(provider.requests), new RegExp(SYNTHETIC_KEY));
  const copy = provider.requests; copy[0].body.model = 'mutated'; assert.equal(provider.requests[0].body.model, provider.model);
});

for (const protocol of ['chat', 'responses', 'anthropic']) test(`${protocol}: real Aura gateway accepts the scripted successful stream`, async t => {
  const provider = await fixture(t, [{ protocol, text: 'A synthetic complete answer.' }]);
  const f = await gate(t, provider, protocol);
  const response = await f.send(); assert.match(await response.text(), /synthetic complete answer/);
  assert.equal(response.status, 200); assert.equal(provider.requests.length, 1); assert.equal(f.failures.length, 0);
});

for (const status of [429, 500, 502, 503, 504, 413]) test(`HTTP ${status} injection preserves status and structured error without a model call`, async t => {
  const provider = await fixture(t, [{ status, retryAfter: '2' }]);
  const response = await send(provider, 'chat', false);
  assert.equal(response.status, status); assert.equal(response.headers.get('retry-after'), '2');
  assert.equal((await response.json()).error.code, status === 429 ? 'rate_limit_error' : status === 413 ? 'context_length_exceeded' : 'api_error');
  assert.equal(provider.requests.length, 1);
});

test('context length can be injected with provider-style HTTP 400 and Anthropic error envelope', async t => {
  const provider = await fixture(t, [{ protocol: 'anthropic', status: 400, errorCode: 'context_length_exceeded' }]);
  const response = await send(provider, 'anthropic'); const body = await response.json();
  assert.equal(response.status, 400); assert.equal(body.type, 'error'); assert.equal(body.error.code, 'context_length_exceeded');
});

test('gateway retries scripted transient errors with exactly the same model and payload', async t => {
  const provider = await fixture(t, [{ status: 503 }, { status: 429, retryAfter: '0' }, { text: 'Recovered.' }]);
  const f = await gate(t, provider);
  assert.match(await (await f.send()).text(), /Recovered/);
  assert.equal(provider.requests.length, 3); assert.equal(new Set(provider.requests.map(request => request.rawBody)).size, 1);
  assert.ok(provider.requests.every(request => request.body.model === provider.model));
  assert.deepEqual(f.recovery.map(event => event.phase), ['retrying', 'retrying', 'recovered']); assert.equal(f.failures.length, 0);
});

for (const abort of ['before-headers', 'before-content']) test(`gateway can retry ${abort} without a delivered content event`, async t => {
  const provider = await fixture(t, [{ abort }, { text: 'Recovered before content.' }]);
  const f = await gate(t, provider);
  const wire = await (await f.send()).text(); assert.match(wire, /Recovered before content/); assert.doesNotMatch(wire, /heartbeat/);
  assert.equal(provider.requests.length, 2); assert.equal(f.failures.length, 0);
});

test('gateway never retries a script after a partial tool response', async t => {
  const provider = await fixture(t, [{ text: '', toolCalls: [{ id: 'one', name: 'write', arguments: '{}' }], abort: 'after-content' }, { text: 'Must not be requested.' }]);
  const f = await gate(t, provider);
  await assert.rejects((await f.send()).text());
  assert.equal(f.failures.length, 1); assert.equal(provider.requests.length, 1);
  assert.equal((await f.send()).status, 409); assert.equal(provider.requests.length, 1);
});

for (const status of [400, 413]) test(`gateway does not retry context rejection HTTP ${status}`, async t => {
  const provider = await fixture(t, [{ status, errorCode: 'context_length_exceeded' }, { text: 'Must not be requested.' }]);
  const f = await gate(t, provider);
  const response = await f.send(); assert.equal(response.status, status); await response.text();
  assert.equal(provider.requests.length, 1); assert.equal(f.failures.length, 1);
});

test('header and content pauses are observable and close cancels pending work idempotently', async t => {
  const provider = await fixture(t, [{ delayMs: 40, pauseAfterContentMs: 40, text: 'Delayed.' }, { delayMs: 60000 }]);
  const started = performance.now(); const response = await send(provider); const wire = await response.text();
  assert.ok(performance.now() - started >= 60); assert.match(wire, /Delayed/);
  const pending = send(provider).catch(() => null);
  for (let i = 0; i < 100 && provider.requests.length < 2; i++) await delay(5);
  assert.equal(provider.requests.length, 2);
  const close = provider.close(); assert.equal(provider.close(), close);
  await close; assert.equal(await pending, null);
  await assert.rejects(send(provider));
});

test('unknown routes, model changes, real-looking credentials and wrong host are rejected without consuming script', async t => {
  const provider = await fixture(t, [{ text: 'Owned script.' }]);
  const headers = { 'content-type': 'application/json' };
  for (const [url, body, extra, status] of [
    [provider.url + '/unknown', { model: provider.model }, {}, 404],
    [provider.url + '/chat/completions', { model: 'other' }, {}, 400],
    [provider.url + '/chat/completions', { model: provider.model }, { authorization: 'Bearer unrelated-synthetic-marker' }, 401]
  ]) {
    const response = await fetch(url, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify(body) });
    assert.equal(response.status, status); await response.text();
  }
  const hostStatus = await new Promise((resolve, reject) => {
    const request = http.request(provider.url + '/chat/completions', { method: 'POST', headers: { host: 'elsewhere.invalid' } }, response => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
    request.once('error', reject); request.end('{}');
  });
  assert.equal(hostStatus, 403); assert.equal(provider.requests.length, 0);
  assert.match(await (await send(provider)).text(), /Owned script/);
  const exhausted = await send(provider); assert.equal(exhausted.status, 409); assert.equal((await exhausted.json()).error.code, 'fixture_script_exhausted');
});

test('oversized payloads and invalid JSON are rejected before observation', async t => {
  const provider = await fixture(t, [{}], { maxRequestBytes: 100 });
  for (const [body, status] of [['{', 400], [JSON.stringify({ model: provider.model, content: 'x'.repeat(200) }), 413]]) {
    const response = await fetch(provider.url + '/chat/completions', { method: 'POST', body });
    assert.equal(response.status, status); await response.text();
  }
  assert.equal(provider.requests.length, 0);
});
