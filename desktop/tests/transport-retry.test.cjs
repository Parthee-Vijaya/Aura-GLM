const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { startGateway } = require('../core/gateway.cjs');
const { retryAfter } = require('../core/model-transport.cjs');
const end = res => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"choices":[{"delta":{"content":"Hej æøå"}}]}\n\ndata: [DONE]\n\n'); };
async function fixture(t, handler, options = {}) {
  const requests = [], failures = [], recovery = [];
  const server = http.createServer(async (req, res) => { let body = ''; for await (const c of req) body += c; requests.push({ body, url: req.url, headers: req.headers }); handler(req, res, requests.length); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const gateway = await startGateway({ kind: 'compatible', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, { id: 'selected' }, 'test-only', null, (...args) => failures.push(args), { retryDelays: [5, 10], idleLimit: 1000, graceLimit: 0, totalLimit: 2000, onRecovery: e => recovery.push(e), ...options });
  t.after(async () => { await gateway.close(); server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const send = () => fetch(gateway.url + '/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${gateway.token}` }, body: JSON.stringify({ model: 'selected', stream: true, messages: [{ role: 'user', content: 'Same task and context' }] }) });
  return { gateway, requests, failures, recovery, send };
}
test('transient provider failures retry identical approved payload, credentials and destination', async t => {
  const f = await fixture(t, (_, res, n) => n < 3 ? res.writeHead(n === 1 ? 503 : 429, { 'retry-after': '0' }).end('private error') : end(res));
  const response = await f.send(); assert.match(await response.text(), /Hej æøå/); assert.equal(response.status, 200);
  assert.equal(f.requests.length, 3); assert.equal(new Set(f.requests.map(x => x.body)).size, 1); assert.equal(new Set(f.requests.map(x => x.url)).size, 1);
  assert.ok(f.requests.every(x => x.headers.authorization === 'Bearer test-only')); assert.equal(f.failures.length, 0);
  assert.deepEqual(f.recovery.map(x => x.phase), ['retrying', 'retrying', 'recovered']);
});
test('waiting grace lets a slow model finish without restarting it', async t => {
  const f = await fixture(t, (_, res) => setTimeout(() => end(res), 70), { idleLimit: 35, graceLimit: 150 });
  assert.match(await (await f.send()).text(), /Hej/); assert.equal(f.requests.length, 1); assert.equal(f.recovery[0].phase, 'waiting'); assert.equal(f.failures.length, 0);
});
test('timeout before any content retries with the same request after cancelling the old stream', async t => {
  let closed = false;
  const f = await fixture(t, (_, res, n) => { if (n === 1) { res.on('close', () => closed = true); return; } assert.equal(closed, true); end(res); }, { idleLimit: 40 });
  assert.match(await (await f.send()).text(), /Hej/); assert.equal(f.requests.length, 2); assert.equal(f.failures.length, 0);
});
test('heartbeat-only stream can reconnect; heartbeats are not replayed as model content', async t => {
  const f = await fixture(t, (_, res, n) => { if (n > 1) return end(res); res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': heartbeat\n\n'); setTimeout(() => res.destroy(), 20); });
  const text = await (await f.send()).text(); assert.match(text, /Hej/); assert.doesNotMatch(text, /heartbeat/); assert.equal(f.requests.length, 2);
});
for (const status of [400, 401, 402, 403, 404]) test(`HTTP ${status} is never retried and raw provider errors stay private`, async t => {
  const f = await fixture(t, (_, res) => res.writeHead(status).end('private-provider-detail'));
  const response = await f.send(); assert.equal(response.status, status); assert.doesNotMatch(await response.text(), /private-provider-detail/); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1);
});
for (const clean of [false, true]) test(`partial tool stream is never replayed (${clean ? 'truncated clean EOF' : 'socket loss'})`, async t => {
  const f = await fixture(t, (_, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('data: {"choices":[{"delta":{"tool_calls":[{"id":"one","function":{"name":"write","arguments":"{}"}}]}}]}\n\n'); setTimeout(() => clean ? res.end() : res.destroy(), 20); });
  await assert.rejects((await f.send()).text()); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1); assert.equal((await f.send()).status, 409);
});
test('Stop during backoff cancels all later attempts without blaming the provider', async t => {
  const f = await fixture(t, (_, res) => res.writeHead(503).end(), { retryDelays: [200, 200] });
  const pending = f.send().then(r => r.text()).catch(() => null);
  while (!f.recovery.length) await delay(5);
  f.gateway.abort(); await pending; await delay(250); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 0);
});
test('retry count is bounded and exhaustion blocks independent engine retries', async t => {
  const f = await fixture(t, (_, res) => res.writeHead(502).end());
  assert.equal((await f.send()).status, 502); assert.equal(f.requests.length, 3); assert.equal(f.failures.length, 1); assert.equal((await f.send()).status, 409); assert.equal(f.requests.length, 3);
});
test('total deadline bounds attempts and backoff together', async t => {
  const f = await fixture(t, (_, res) => res.writeHead(503).end(), { totalLimit: 80, retryDelays: [1000, 1000] });
  assert.equal((await f.send()).status, 502); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1);
});
test('Retry-After seconds/date are respected; long quota waits are not silently retried', async t => {
  assert.equal(retryAfter('2'), 2000); assert.equal(retryAfter('invalid'), 0); assert.equal(retryAfter(new Date(10000).toUTCString(), 5000), 5000);
  const f = await fixture(t, (_, res) => res.writeHead(429, { 'retry-after': '120' }).end());
  assert.equal((await f.send()).status, 429); assert.equal(f.requests.length, 1);
});


test('engine timeouts leave room for the gateway deadline on every supported protocol', () => {
  const { engineProvider } = require('../core/connections.cjs');
  const { TOTAL_LIMIT } = require('../core/model-transport.cjs');
  for (const kind of ['compatible', 'mistral', 'corti', 'anthropic', 'openai', 'azure', 'openrouter']) {
    const provider = engineProvider({ kind, baseURL: 'https://example.test/v1' }, { id: 'selected' }, 'http://127.0.0.1:1234/v1', 'temporary');
    for (const key of ['timeout', 'headerTimeout', 'chunkTimeout']) assert.ok(provider.options[key] > TOTAL_LIMIT, kind + ':' + key);
  }
});
