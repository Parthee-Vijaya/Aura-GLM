// Local scripted model responses for synthetic tests. No external calls or persistence.
const http = require('node:http');
const { setTimeout: delay } = require('node:timers/promises');

const SYNTHETIC_KEY = 'aura-fixture-synthetic-key';
const PATHS = Object.freeze({ '/v1/chat/completions': 'chat', '/v1/responses': 'responses', '/v1/messages': 'anthropic' });
const PROTOCOLS = new Set(Object.values(PATHS));
const STEP_KEYS = new Set(['protocol', 'text', 'chunks', 'toolCalls', 'status', 'errorCode', 'retryAfter', 'delayMs', 'pauseAfterContentMs', 'abort', 'abortDelayMs']);
const MAX_PAUSE = 60000;
const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 };
function validateStep(step) {
  if (!step || typeof step !== 'object' || Array.isArray(step) || Object.keys(step).some(key => !STEP_KEYS.has(key))) throw new Error('Invalid synthetic provider step.');
  if (step.protocol !== undefined && !PROTOCOLS.has(step.protocol)) throw new Error('Unknown synthetic provider protocol.');
  for (const key of ['delayMs', 'pauseAfterContentMs', 'abortDelayMs']) if (step[key] !== undefined && (!Number.isSafeInteger(step[key]) || step[key] < 0 || step[key] > MAX_PAUSE)) throw new Error('Invalid synthetic provider delay.');
  if (step.status !== undefined && (!Number.isInteger(step.status) || step.status < 400 || step.status > 599)) throw new Error('Invalid synthetic provider HTTP failure.');
  if (step.abort !== undefined && !['before-headers', 'before-content', 'after-content'].includes(step.abort)) throw new Error('Invalid synthetic provider interruption.');
  if (step.errorCode !== undefined && !/^[a-z_]{1,80}$/.test(step.errorCode)) throw new Error('Invalid synthetic provider error code.');
  if (step.retryAfter !== undefined && !/^\d{1,6}$/.test(String(step.retryAfter))) throw new Error('Invalid synthetic provider retry delay.');
  if (step.text !== undefined && (typeof step.text !== 'string' || step.text.length > 100000)) throw new Error('Invalid synthetic provider text.');
  if (step.chunks !== undefined && (!Array.isArray(step.chunks) || step.chunks.length > 100 || step.chunks.some(text => typeof text !== 'string') || step.chunks.join('').length > 100000)) throw new Error('Invalid synthetic provider chunks.');
  if (step.toolCalls !== undefined && (!Array.isArray(step.toolCalls) || step.toolCalls.length > 10 || step.toolCalls.some(tool => !tool || typeof tool !== 'object' || Object.keys(tool).some(key => !['id', 'name', 'arguments'].includes(key)) || !/^[a-zA-Z0-9_-]{1,80}$/.test(tool.id) || !/^[a-zA-Z0-9_-]{1,80}$/.test(tool.name) || typeof tool.arguments !== 'string' || tool.arguments.length > 100000))) throw new Error('Invalid synthetic provider tool call.');
  if (step.status !== undefined && (step.abort || step.text !== undefined || step.chunks || step.toolCalls)) throw new Error('An HTTP failure cannot contain a successful response.');
  return structuredClone(step);
}
function encodeEvent(data, name) { return (name ? `event: ${name}\n` : '') + 'data: ' + JSON.stringify(data) + '\n\n'; }

function payload(protocol, model, step, index) {
  const chunks = step.chunks || [step.text ?? 'Synthetic answer.'];
  const text = chunks.join(''), tools = step.toolCalls || [], id = 'fixture_' + index;
  const partial = [], terminal = [];
  if (protocol === 'chat') {
    const packet = (delta, finish_reason = null) => encodeEvent({ id: 'chatcmpl_' + id, object: 'chat.completion.chunk', created: 1, model,
      choices: [{ index: 0, delta, finish_reason }], ...(finish_reason ? { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } : {}) });
    partial.push(packet({ role: 'assistant' }));
    for (const content of chunks) if (content) partial.push(packet({ content }));
    tools.forEach((tool, toolIndex) => partial.push(packet({ tool_calls: [{ index: toolIndex, id: tool.id, type: 'function', function: { name: tool.name, arguments: tool.arguments } }] })));
    terminal.push(packet({}, tools.length ? 'tool_calls' : 'stop'), 'data: [DONE]\n\n');
    return { partial, terminal, json: { id: 'chatcmpl_' + id, object: 'chat.completion', created: 1, model, choices: [{ index: 0,
      message: { role: 'assistant', content: text || null, ...(tools.length ? { tool_calls: tools.map(tool => ({ id: tool.id, type: 'function', function: { name: tool.name, arguments: tool.arguments } })) } : {}) },
      finish_reason: tools.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } };
  }
  if (protocol === 'responses') {
    const output = [];
    if (text) output.push({ type: 'message', id: 'msg_' + id, role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
    tools.forEach(tool => output.push({ type: 'function_call', id: 'fc_' + tool.id, call_id: tool.id, name: tool.name, arguments: tool.arguments, status: 'completed' }));
    const json = { id: 'resp_' + id, object: 'response', created_at: 1, status: 'completed', model, output, usage };
    let sequence = 0;
    const event = (type, data) => encodeEvent({ type, sequence_number: sequence++, ...data }, type);
    partial.push(event('response.created', { response: { ...json, status: 'in_progress', output: [], usage: null } }));
    output.forEach((item, output_index) => {
      const item_id = item.id;
      partial.push(event('response.output_item.added', { output_index, item: { ...item, status: 'in_progress', ...(item.type === 'message' ? { content: [] } : { arguments: '' }) } }));
      if (item.type === 'message') {
        partial.push(event('response.content_part.added', { item_id, output_index, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }));
        for (const delta of chunks) if (delta) partial.push(event('response.output_text.delta', { item_id, output_index, content_index: 0, delta }));
        terminal.push({ type: 'response.output_text.done', data: { item_id, output_index, content_index: 0, text } });
        terminal.push({ type: 'response.content_part.done', data: { item_id, output_index, content_index: 0, part: item.content[0] } });
      } else {
        partial.push(event('response.function_call_arguments.delta', { item_id, output_index, delta: item.arguments }));
        terminal.push({ type: 'response.function_call_arguments.done', data: { item_id, output_index, name: item.name, arguments: item.arguments } });
      }
      terminal.push({ type: 'response.output_item.done', data: { output_index, item } });
    });
    return { partial, terminal: [...terminal.map(item => event(item.type, item.data)), event('response.completed', { response: json })], json };
  }
  const content = [];
  if (text) content.push({ type: 'text', text });
  // The JSON path requires valid JSON arguments. Streaming can deliberately carry malformed tool JSON.
  tools.forEach(tool => content.push({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.arguments }));
  const message = { id: 'msg_' + id, type: 'message', role: 'assistant', model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } };
  const event = (type, data) => encodeEvent({ type, ...data }, type);
  partial.push(event('message_start', { message }));
  content.forEach((block, blockIndex) => {
    partial.push(event('content_block_start', { index: blockIndex, content_block: block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} } }));
    if (block.type === 'text') for (const chunk of chunks) if (chunk) partial.push(event('content_block_delta', { index: blockIndex, delta: { type: 'text_delta', text: chunk } }));
    if (block.type === 'tool_use') partial.push(event('content_block_delta', { index: blockIndex, delta: { type: 'input_json_delta', partial_json: block.input } }));
    partial.push(event('content_block_stop', { index: blockIndex }));
  });
  const stop_reason = tools.length ? 'tool_use' : 'end_turn';
  terminal.push(event('message_delta', { delta: { stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } }), event('message_stop', {}));
  return { partial, terminal, json: () => ({ ...message, content: content.map(block => block.type === 'tool_use' ? { ...block, input: JSON.parse(block.input) } : block), stop_reason, usage: { input_tokens: 10, output_tokens: 5 } }) };
}

async function startFakeProvider(options = {}) {
  if (!options || typeof options !== 'object' || Object.keys(options).some(key => !['synthetic', 'script', 'model', 'host', 'maxRequestBytes'].includes(key)) || options.synthetic !== true) throw new Error('Synthetic-only acknowledgement is required.');
  const { script, model = 'fixture-model', host = '127.0.0.1', maxRequestBytes = 1000000 } = options;
  if (host !== '127.0.0.1') throw new Error('Synthetic provider must bind to IPv4 loopback.');
  if (typeof model !== 'string' || !/^[a-zA-Z0-9_./:-]{1,100}$/.test(model)) throw new Error('Invalid synthetic model identifier.');
  if (!Array.isArray(script) || !script.length || script.length > 100 || !Number.isSafeInteger(maxRequestBytes) || maxRequestBytes < 1 || maxRequestBytes > 4000000) throw new Error('Invalid synthetic provider limits.');
  const steps = script.map(validateStep), observed = [], active = new Set();
  let origin, closing = false, cursor = 0;
  const failure = (res, status, code, protocol = 'chat', retryAfter) => {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(retryAfter !== undefined ? { 'retry-after': String(retryAfter) } : {}) });
    const error = { type: code, code, message: 'Synthetic provider failure.' };
    res.end(JSON.stringify(protocol === 'anthropic' ? { type: 'error', error } : { error }));
  };
  const server = http.createServer(async (req, res) => {
    const protocol = PATHS[req.url];
    const controller = new AbortController(); active.add(controller);
    let record;
    res.once('close', () => { controller.abort(); active.delete(controller); if (record) record.closed = true; });
    res.once('finish', () => { if (record) record.finished = true; });
    try {
      if (closing) return failure(res, 503, 'fixture_closed');
      if (req.headers.host !== new URL(origin).host) return failure(res, 403, 'fixture_host_rejected');
      if (req.method !== 'POST' || !protocol) return failure(res, 404, 'fixture_route_rejected');
      if ((req.headers.authorization !== undefined && req.headers.authorization !== `Bearer ${SYNTHETIC_KEY}`)
        || (req.headers['x-api-key'] !== undefined && req.headers['x-api-key'] !== SYNTHETIC_KEY)
        || (req.headers['api-key'] !== undefined && req.headers['api-key'] !== SYNTHETIC_KEY)) return failure(res, 401, 'fixture_credentials_rejected');
      const buffers = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > maxRequestBytes) return failure(res, 413, 'fixture_body_too_large'); buffers.push(chunk); }
      const rawBody = Buffer.concat(buffers).toString('utf8');
      let body;
      try { body = JSON.parse(rawBody); } catch { return failure(res, 400, 'fixture_json_rejected'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.model !== model) return failure(res, 400, 'fixture_model_rejected');
      const step = steps[cursor++];
      record = { index: cursor, protocol, url: req.url, rawBody, body, finished: false, closed: false };
      observed.push(record);
      if (!step) return failure(res, 409, 'fixture_script_exhausted', protocol);
      if (step.protocol && step.protocol !== protocol) return failure(res, 400, 'fixture_protocol_rejected', protocol);
      const pause = async ms => { if (ms) await delay(ms, undefined, { signal: controller.signal }); controller.signal.throwIfAborted(); };
      await pause(step.delayMs);
      if (step.abort === 'before-headers') { await pause(step.abortDelayMs ?? 10); return res.destroy(); }
      if (step.status) return failure(res, step.status, step.errorCode || (step.status === 429 ? 'rate_limit_error' : step.status === 413 ? 'context_length_exceeded' : 'api_error'), protocol, step.retryAfter);
      const response = payload(protocol, model, step, cursor);
      if (body.stream !== true) {
        if (step.abort || step.pauseAfterContentMs) return failure(res, 400, 'fixture_stream_required', protocol);
        const value = typeof response.json === 'function' ? response.json() : response.json;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        return res.end(JSON.stringify(value));
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      if (step.abort === 'before-content') {
        res.write(': synthetic heartbeat\n\n');
        await pause(step.abortDelayMs ?? 10); return res.destroy();
      }
      for (const frame of response.partial) res.write(frame);
      await pause(step.pauseAfterContentMs);
      if (step.abort === 'after-content') { await pause(step.abortDelayMs ?? 10); return res.destroy(); }
      res.end(response.terminal.join(''));
    } catch (error) {
      if (!controller.signal.aborted) {
        if (res.headersSent) res.destroy();
        else failure(res, 500, 'fixture_response_failed', protocol);
      }
    }
  });
  server.requestTimeout = 5000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, host, resolve); });
  origin = `http://${host}:${server.address().port}`;
  let closePromise;
  return {
    url: origin + '/v1', origin, model, key: SYNTHETIC_KEY,
    get requests() { return structuredClone(observed); },
    close() {
      if (!closePromise) {
        closing = true;
        for (const controller of active) controller.abort();
        closePromise = new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
      }
      return closePromise;
    }
  };
}
module.exports = { startFakeProvider, SYNTHETIC_KEY };
