const test = require('node:test');
const assert = require('node:assert/strict');
const { responseSchema, validateResponse, instruction, MODEL } = require('./codex_bridge.cjs');
const tools = [{ type: 'function', function: { name: 'apply_patch', parameters: { $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', properties: { patchText: { type: 'string' } }, required: ['patchText'] } } }, { type: 'function', function: { name: 'read', parameters: { type: 'object', properties: { filePath: { type: 'string' }, offset: { type: 'integer', minimum: 0 } }, required: ['filePath'] } } }];
const body = { model: MODEL, messages: [{ role: 'system', content: 'Keep approvals' }, { role: 'user', content: 'Build my task' }, { role: 'tool', tool_call_id: 'a', content: 'Actual output' }], tools };
const response = (name, args) => ({ content: '', tool_calls: [{ name, arguments: args }] });
test('patch content is a typed string rather than JSON encoded inside a string', () => { const schema = responseSchema(tools); assert.equal(schema.properties.tool_calls.items.anyOf[0].properties.arguments.properties.patchText.type, 'string'); });
test('complete request/history/schemas are unchanged in prompt', () => { const embedded = instruction(body).split('AURA REQUEST:\n')[1]; assert.deepEqual(JSON.parse(embedded), body); });
test('valid patch arguments keep exact bytes and pass original schema', () => { const value = response('apply_patch', { patchText: '*** Begin Patch\n+æøå\n*** End Patch' }); assert.equal(validateResponse(body, value), value); });
test('invalid or incomplete arguments fail before any Aura tool release', () => { assert.throws(() => validateResponse(body, response('apply_patch', {}))); assert.throws(() => validateResponse(body, response('read', { filePath: '/x', offset: -1 }))); assert.throws(() => validateResponse(body, { content: '', tool_calls: [{ name: 'read', arguments: '{' }] })); });
test('unknown tools and malformed envelopes fail closed', () => { assert.throws(() => validateResponse(body, response('shell', { command: 'x' }))); assert.throws(() => validateResponse(body, { content: '', tool_calls: [], extra: true })); });
test('no-tools request cannot emit a tool', () => { assert.deepEqual(validateResponse({ tools: [] }, { content: 'done', tool_calls: [] }), { content: 'done', tool_calls: [] }); assert.throws(() => validateResponse({ tools: [] }, response('read', { filePath: '/x' }))); });
test('optional non-nullable placeholders are restored to omitted fields', () => { const value = validateResponse(body, response('read', { filePath: '/x', offset: null })); assert.deepEqual(value.tool_calls[0].arguments, { filePath: '/x' }); });
test('genuinely nullable values are preserved while required null is rejected', () => { const nullable = { tools: [{ function: { name: 'example', parameters: { type: 'object', properties: { value: { type: ['string', 'null'] } } } } }] }; assert.equal(validateResponse(nullable, response('example', { value: null })).tool_calls[0].arguments.value, null); assert.throws(() => validateResponse(body, response('apply_patch', { patchText: null }))); });
test('source containing JS quotes crosses the wire without escaping corruption', () => { const patchText = "*** Begin Patch\n+const escape = x => ({'\"': '&quot;', \"'\": '&#39;'})[x];\n*** End Patch"; const result = validateResponse(body, JSON.parse(JSON.stringify(response('apply_patch', { patchText })))); assert.equal(JSON.parse(JSON.stringify(result.tool_calls[0].arguments)).patchText, patchText); });
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { start } = require('./codex_bridge.cjs');
async function fixture(t, options = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-codex-bridge-test-'));
  const kills = [], children = [];
  const bridge = await start(directory, { requestTimeoutMs: 100, ...options, spawnProcess: (_bin, args) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); children.push(child);
    child.kill = signal => { kills.push(signal); setImmediate(() => child.emit('close', null, signal)); return true; };
    if (!options.hang) child.stdin.on('finish', async () => {
      const output = args[args.indexOf('-o') + 1];
      await fs.writeFile(output, JSON.stringify(options.answer || { content: 'Live fixture', tool_calls: [] }));
      for (const event of options.events || [{ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5, cached_input_tokens: 2 } }]) child.stdout.write(JSON.stringify(event) + '\n');
      child.emit('close', 0, null);
    });
    return child;
  } });
  t.after(async () => { await bridge.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { bridge, kills, children };
}
test('loopback adapter forwards validated response and usage without executing tools', async t => {
  const f = await fixture(t, { answer: response('apply_patch', { patchText: '*** Begin Patch\n*** End Patch' }) });
  const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  const value = await res.json(); assert.equal(res.status, 200); assert.equal(value.choices[0].finish_reason, 'tool_calls'); assert.equal(value.usage.total_tokens, 15); assert.equal(f.children.length, 1); assert.equal(f.kills.length, 0);
});
test('wrong model never spawns an alternative backend', async t => {
  const f = await fixture(t); const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, model: 'other' }) });
  assert.equal(res.status, 502); await res.text(); assert.equal(f.children.length, 0);
});
test('native-tool evidence prevents releasing a tool response', async t => {
  const f = await fixture(t, { events: [{ type: 'item.completed', item: { type: 'command_execution' } }, { type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 5 } }] });
  const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 502); assert.match(await res.text(), /forbidden/);
});
test('timeout terminates only that child and cannot replay an action', async t => {
  const f = await fixture(t, { hang: true, requestTimeoutMs: 25 });
  const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 502); assert.match(await res.text(), /timed out/); assert.deepEqual(f.kills, ['SIGTERM']); assert.equal(f.children.length, 1);
});
test('client cancellation stops inference and releases no response', async t => {
  const f = await fixture(t, { hang: true, requestTimeoutMs: 5000 }); const controller = new AbortController();
  const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify({ ...body, stream: true }), signal: controller.signal });
  await res.body.getReader().read(); controller.abort();
  await new Promise(resolve => setTimeout(resolve, 30)); assert.deepEqual(f.kills, ['SIGTERM']); assert.equal(f.children.length, 1);
});

test('failed argument validation still records real model usage', async t => {
  const f = await fixture(t, { answer: response('apply_patch', { patchText: 12 }) });
  const res = await fetch(f.bridge.url + '/chat/completions', { method: 'POST', body: JSON.stringify(body) });
  assert.equal(res.status, 502); await res.text(); assert.equal(f.bridge.records[0].usage.output_tokens, 5); assert.equal(f.bridge.records[0].success, undefined);
});
