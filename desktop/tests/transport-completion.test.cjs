const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');
const { forwardModel } = require('../core/model-transport.cjs');
async function fixture(t, handler, options = {}) {
  let calls = 0, result = '', ended = false;
  const server = http.createServer((req, res) => { calls++; req.resume(); res.writeHead(200, { 'content-type': 'text/event-stream' }); handler(res); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const res = { writeHead() {}, write(chunk) { result += chunk; }, end() { ended = true; } };
  const controller = new AbortController();
  return { controller, text: () => result, ended: () => ended, calls: () => calls,
    run: () => forwardModel({ url: `http://127.0.0.1:${server.address().port}`, headers: {}, payload: '{}', res,
      signal: controller.signal, progress: { write() {}, end() {} }, idleLimit: 80, graceLimit: 0, totalLimit: 1000, retryDelays: [], ...options }) };
}
const answer = 'data: {"choices":[{"delta":{"content":"Hej æøå"},"finish_reason":"stop"}]}\n\n';
const tool = 'data: {"choices":[{"delta":{"tool_calls":[{"id":"once","function":{"name":"write","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\n';
for (const [name, content] of [['text', answer], ['tool', tool]]) test(`complete ${name} response survives a reset after DONE without replay`, async t => {
  const f = await fixture(t, res => { res.write(content + 'data: [DONE]\n\n'); setTimeout(() => res.destroy(), 30); });
  await f.run(); assert.equal(f.calls(), 1); assert.equal(f.ended(), true); assert.equal(f.text(), content + 'data: [DONE]\n\n');
});
test('a complete protocol frame finishes even if the HTTP connection stays open', async t => {
  const f = await fixture(t, res => res.write(answer + 'data: [DONE]\n\n'));
  await f.run(); assert.equal(f.ended(), true); assert.equal(f.calls(), 1);
});
test('finish_reason waits for reported usage and the complete split CRLF terminator', async t => {
  const usage = 'data: {"choices":[],"usage":{"total_tokens":4}}\r\n\r\n';
  const f = await fixture(t, res => { res.write(answer); setTimeout(() => res.write(usage + 'data: [DO'), 10); setTimeout(() => res.write('NE]\r\n'), 20); setTimeout(() => res.write('\r\n'), 30); setTimeout(() => res.destroy(), 60); });
  await f.run(); assert.equal(f.text(), answer + usage + 'data: [DONE]\r\n\r\n'); assert.equal(f.calls(), 1);
});
for (const [protocol, frame] of [['anthropic', 'event: message_stop\ndata: {"type":"message_stop"}\n\n'], ['responses', 'event: response.completed\ndata: {"type":"response.completed"}\n\n']]) test(`${protocol} explicit terminal frame survives HTTP tail failure`, async t => {
  const f = await fixture(t, res => { res.write(frame); setTimeout(() => res.destroy(), 30); });
  await f.run(); assert.equal(f.ended(), true); assert.equal(f.text(), frame); assert.equal(f.calls(), 1);
});
for (const tail of ['', 'data: [DONE]\n']) test('finish_reason or an incomplete terminal frame cannot hide a reset', async t => {
  const f = await fixture(t, res => { res.write(tool + tail); setTimeout(() => res.destroy(), 30); });
  await assert.rejects(f.run()); assert.equal(f.ended(), false); assert.equal(f.calls(), 1);
});
test('privacy revalidation still rejects a terminal chunk before delivery', async t => {
  const f = await fixture(t, res => res.write(answer + 'data: [DONE]\n\n'), {
    dispatch: async (request, send) => { const response = await send(request.url, { method: 'POST', body: request.body, signal: request.signal }); response.privacyAssertCurrent = () => { throw Object.assign(Error('Policy changed'), { code: 'PRIVACY_STALE' }); }; return response; }
  });
  await assert.rejects(f.run(), { code: 'PRIVACY_STALE' }); assert.equal(f.text(), ''); assert.equal(f.ended(), false); assert.equal(f.calls(), 1);
});
test('Stop after partial content cancels rather than manufacturing completion', async t => {
  const f = await fixture(t, res => res.write(tool));
  const pending = f.run(); while (!f.text()) await delay(2);
  f.controller.abort(); await assert.rejects(pending); assert.equal(f.ended(), false); assert.equal(f.calls(), 1);
});
