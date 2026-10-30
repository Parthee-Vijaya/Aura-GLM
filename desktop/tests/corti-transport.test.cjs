const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startGateway } = require('../core/gateway.cjs');
const data = event => `data: ${JSON.stringify(event)}\n\n`;
// Corti's observed extra keys are safe only when their values are null.
const reasoning = data({ id: 'test-only', prompt_token_ids: null, prompt_text: null, choices: [{ index: 0, delta: { role: 'assistant', reasoning: 'Synthetic private reasoning' }, finish_reason: null, token_ids: null }] });
const complete = data({ choices: [{ delta: { content: 'Hej æøå' }, finish_reason: 'stop' }] }) + 'data: [DONE]\n\n';
async function fixture(t, handler, options = {}) {
  const requests = [], failures = [], recovery = [], progress = [];
  const upstream = http.createServer(async (req, res) => { const chunks = []; for await (const chunk of req) chunks.push(chunk); requests.push(Buffer.concat(chunks).toString('utf8')); res.writeHead(200, { 'content-type': 'text/event-stream' }); handler(res, requests.length); });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  let checked = 0;
  const gateway = await startGateway({ kind: 'corti', baseURL: `http://127.0.0.1:${upstream.address().port}/v1` }, { id: 'corti-s1' }, 'test-only', null, (...args) => failures.push(args), {
    idleLimit: 200, graceLimit: 0, totalLimit: 2000, retryDelays: [5, 5], onRecovery: event => recovery.push(event), onProgress: event => progress.push(event),
    dispatch: async (request, send) => { checked++; return send(request.url, { method: 'POST', headers: request.headers, body: request.body, signal: request.signal }); }, ...options
  });
  t.after(async () => { await gateway.close(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); });
  const send = () => fetch(gateway.url + '/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${gateway.token}` }, body: JSON.stringify({ model: 'corti-s1', stream: true, messages: [{ role: 'user', content: 'Same approved task' }] }) });
  return { requests, failures, recovery, progress, send, gateway, checked: () => checked };
}
test('Corti can retry undelivered metadata and reasoning after a socket reset', async t => {
  const f = await fixture(t, (res, n) => { res.write(reasoning); if (n === 1) setTimeout(() => res.destroy(), 20); else res.end(complete); });
  const body = await (await f.send()).text(); assert.equal(body, reasoning + complete);
  assert.equal(f.requests.length, 2); assert.equal(f.checked(), 2); assert.equal(new Set(f.requests).size, 1); assert.equal(f.failures.length, 0);
  assert.equal(f.recovery[0].phase, 'retrying'); assert.ok(f.progress.some(event => event.phase === 'reasoning'));
});
test('buffered Corti reasoning is forwarded exactly once on success', async t => {
  const f = await fixture(t, res => res.end(reasoning + complete));
  assert.equal(await (await f.send()).text(), reasoning + complete); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 0);
});
for (const delta of [{ content: 'Partial answer' }, { tool_calls: [{ id: 'once', function: { name: 'write', arguments: '{}' } }] }, { refusal: 'Declined' }, { unknown: 'Future protocol field' }]) test('Corti never replays delivered text, tools, refusals or unknown data: ' + Object.keys(delta)[0], async t => {
  const f = await fixture(t, res => { res.write(reasoning + data({ choices: [{ delta }] })); setTimeout(() => res.destroy(), 20); });
  await assert.rejects((await f.send()).text()); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1); assert.equal((await f.send()).status, 409);
});
test('Corti reasoning-only retries remain bounded', async t => {
  const f = await fixture(t, res => { res.write(reasoning); setTimeout(() => res.destroy(), 20); });
  const response = await f.send(); assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /Synthetic private reasoning/); assert.equal(f.requests.length, 3); assert.equal(f.failures.length, 1);
});
test('Corti reasoning buffering is bounded and becomes non-replayable on overflow', async t => {
  const chunk = data({ choices: [{ delta: { reasoning: 'x'.repeat(512 * 1024) } }] });
  const f = await fixture(t, res => { for (let i = 0; i < 9; i++) res.write(chunk); setTimeout(() => res.destroy(), 70); });
  await assert.rejects((await f.send()).text()); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1);
});
test('a changed privacy rule prevents retrying buffered Corti reasoning', async t => {
  let checks = 0;
  const f = await fixture(t, res => { res.write(reasoning); setTimeout(() => res.destroy(), 20); }, {
    dispatch: async (request, send) => { if (++checks === 2) throw Object.assign(Error('Policy changed'), { code: 'PRIVACY_STALE' }); return send(request.url, { method: 'POST', body: request.body, signal: request.signal }); }
  });
  const response = await f.send(); assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /Synthetic private reasoning/); assert.equal(f.requests.length, 1); assert.equal(checks, 2);
});
for (const extra of [{ prompt_text: 'Unexpected echoed content' }, { prompt_token_ids: [1, 2] }, { future_field: null }]) test('unrecognized or non-null Corti metadata commits the stream: ' + Object.keys(extra)[0], async t => {
  const f = await fixture(t, res => { res.write(data({ ...extra, choices: [{ delta: { role: 'assistant' } }] })); setTimeout(() => res.destroy(), 20); });
  await assert.rejects((await f.send()).text()); assert.equal(f.requests.length, 1); assert.equal(f.failures.length, 1);
});
