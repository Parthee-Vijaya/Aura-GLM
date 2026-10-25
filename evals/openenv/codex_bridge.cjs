// Evaluation-only adapter: live Codex inference, Aura-owned tools and approvals.
// This is not a shipping provider and never executes a model's tool request itself.
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const Ajv = require('../../desktop/node_modules/ajv/dist/2020').default;
const MODEL = 'gpt-6.1-sol';
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

// Codex structured output requires optional object keys to be nullable. Keep
// argument objects typed so generated source crosses only one JSON string layer.
function strictSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const result = { ...schema };
  if (result.properties) {
    const required = new Set(result.required || []);
    result.properties = Object.fromEntries(Object.entries(result.properties).map(([key, child]) => [key,
      required.has(key) ? strictSchema(child) : { anyOf: [strictSchema(child), { type: 'null' }] }]));
    result.required = Object.keys(result.properties);
    result.additionalProperties = false;
  }
  if (result.items) result.items = strictSchema(result.items);
  for (const key of ['anyOf', 'oneOf', 'allOf']) if (result[key]) result[key] = result[key].map(strictSchema);
  return result;
}
function responseSchema(tools = []) {
  return { type: 'object', properties: {
    content: { type: 'string' },
    tool_calls: { type: 'array', ...(tools.length ? {} : { maxItems: 0 }), items: tools.length ? {
      anyOf: tools.map(tool => ({ type: 'object', properties: {
        name: { type: 'string', enum: [tool.function.name] }, arguments: strictSchema(tool.function.parameters)
      }, required: ['name', 'arguments'], additionalProperties: false }))
    } : { type: 'object', properties: {}, required: [], additionalProperties: false } }
  }, required: ['content', 'tool_calls'], additionalProperties: false };
}
function restoreOptionalArguments(value, schema, ajv) {
  if (Array.isArray(value)) return value.map(item => restoreOptionalArguments(item, schema.items || {}, ajv));
  if (!value || typeof value !== 'object') return value;
  const required = new Set(schema.required || []);
  return Object.fromEntries(Object.entries(value).flatMap(([key, child]) => {
    const property = schema.properties?.[key];
    // Drop only null placeholders introduced for optional non-nullable fields.
    // Required or genuinely nullable values must retain their original meaning.
    if (child === null && property && !required.has(key) && !ajv.validate(property, null)) return [];
    return [[key, restoreOptionalArguments(child, property || {}, ajv)]];
  }));
}
function validateResponse(body, value) {
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  if (!ajv.validate(responseSchema(body.tools), value)) throw Error('Invalid response envelope or typed tool arguments');
  for (const call of value.tool_calls) {
    const tool = body.tools?.find(item => item.function.name === call.name);
    if (!tool) throw Error('Unknown Aura tool');
    const argumentsObject = restoreOptionalArguments(call.arguments, tool.function.parameters, ajv);
    if (!ajv.validate(tool.function.parameters, argumentsObject)) throw Error('Tool arguments do not match the supplied schema');
    call.arguments = argumentsObject;
  }
  return value;
}
function instruction(body) {
  return 'You are the live language-model backend for Aura. The JSON below is the COMPLETE model request from Aura. Follow its system and user messages in order and choose the next assistant response from the supplied history and tool results. Return content plus tool_calls according to the outer response schema. Each tool call name must exactly match a provided function name. Its arguments field must be a typed object matching that function parameter schema, not a JSON string. Use null only for optional fields that are omitted from the original arguments. Do not invent results: Aura executes returned calls and sends real outputs in the next request. Do NOT use Codex built-in tools, access files yourself, browse, or execute commands. All actions must go through the provided Aura tools. If no tools are offered, return content and an empty tool_calls array. Preserve any JSON format requested inside content. No extra wrapper prose.\n\nAURA REQUEST:\n' + JSON.stringify(body);
}
async function start(root, { port = 0, requestTimeoutMs = 300000, codexPath = path.join(os.homedir(), '.local/bin/codex'), spawnProcess = spawn } = {}) {
  await fs.mkdir(path.join(root, 'calls'), { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(root, 'adapter-workdir'), { recursive: true });
  let count = 0, closing = false;
  const records = [], children = new Map();
  const persist = () => fs.writeFile(path.join(root, 'provider-evidence.json'), JSON.stringify({ live: true, evaluationOnly: true, model: MODEL, envelope: 'typed-function-arguments', records }, null, 2), { mode: 0o600 });
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/v1/models') {
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ data: [{ id: MODEL, name: 'Codex · GPT-6.1-Sol (live evaluation adapter)', owned_by: 'OpenAI', context_window: 200000, max_output_tokens: 16384, capabilities: { function_calling: true, reasoning: true }, effort: { supported: true, levels: ['low'] } }] }));
    }
    if (closing || req.method !== 'POST' || req.url !== '/v1/chat/completions') { res.writeHead(404); return res.end(); }
    let heartbeat, deadline, child, record, killTimer, done;
    try {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 4e6) throw Error('Request too large'); }
      const body = JSON.parse(raw);
      if (body.model !== MODEL || !Array.isArray(body.messages)) throw Error('Exact GPT-6.1-Sol model and messages required');
      if (count >= 64) throw Error('Codex bridge call limit reached');
      const index = ++count, base = path.join(root, 'calls', String(index).padStart(3, '0'));
      const prompt = instruction(body), schema = responseSchema(body.tools);
      record = { index, started: new Date().toISOString(), model: MODEL, requestSha256: digest(raw), messages: body.messages.length, tools: (body.tools || []).map(tool => tool.function.name), schemaBytes: Buffer.byteLength(JSON.stringify(schema)), primaryDesignSkill: JSON.stringify(body).includes('HOVEDSKILL TIL BYGNING: harness-aura-design') };
      records.push(record);
      await Promise.all([fs.writeFile(base + '.request.json', JSON.stringify(body, null, 2), { mode: 0o600 }), fs.writeFile(base + '.schema.json', JSON.stringify(schema), { mode: 0o600 }), fs.writeFile(base + '.transport-prompt.txt', prompt, { mode: 0o600 })]);
      if (body.stream) { res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' }); res.write(': Live Codex request started\n\n'); heartbeat = setInterval(() => { if (!res.destroyed) res.write(': Waiting for live Codex response\n\n'); }, 10000); }
      const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '-C', path.join(root, 'adapter-workdir'), '-s', 'read-only', '-m', MODEL, '-c', 'features.shell_tool=false', '-c', 'features.unified_exec=false', '-c', 'features.multi_agent=false', '-c', 'web_search="disabled"', '-c', 'project_doc_max_bytes=0', '-c', 'model_reasoning_effort="low"', '--json', '--output-schema', base + '.schema.json', '-o', base + '.response.json', '-'];
      child = spawnProcess(codexPath, args, { stdio: ['pipe', 'pipe', 'pipe'], env: Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'LANG', 'USER'].filter(key => process.env[key]).map(key => [key, process.env[key]])) });
      done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal })); });
      children.set(child, done);
      let stdout = '', stderr = '';
      const terminate = reason => { if (record.termination) return; record.termination = reason; child.kill('SIGTERM'); killTimer ??= setTimeout(() => child.kill('SIGKILL'), 2000); };
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4e6) terminate('output_limit'); });
      child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 1e6) terminate('stderr_limit'); });
      child.stdin.on('error', () => {});
      child.stdin.end(prompt);
      res.once('close', () => { if (!res.writableEnded) terminate('client_closed'); });
      deadline = setTimeout(() => terminate('timeout'), requestTimeoutMs);
      const exit = await done;
      children.delete(child);
      clearTimeout(killTimer); clearTimeout(deadline);
      await Promise.all([fs.writeFile(base + '.events.jsonl', stdout, { mode: 0o600 }), fs.writeFile(base + '.stderr.txt', stderr, { mode: 0o600 })]);
      if (exit.code !== 0) throw Error(record.termination === 'timeout' ? 'Codex request timed out' : 'Codex process did not complete');
      const events = stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const usage = events.findLast(event => event.type === 'turn.completed')?.usage;
      if (!usage || !Number.isFinite(usage.input_tokens) || !Number.isFinite(usage.output_tokens)) throw Error('No live usage evidence');
      record.usage = usage; // Failed validation still consumed actual model tokens.
      if (events.some(event => event.item && ['command_execution', 'file_change', 'mcp_tool_call', 'web_search'].includes(event.item.type))) throw Error('Native tools are forbidden in the Aura adapter');
      const value = validateResponse(body, JSON.parse(await fs.readFile(base + '.response.json', 'utf8')));
      const mapped = { prompt_tokens: usage.input_tokens, completion_tokens: usage.output_tokens, total_tokens: usage.input_tokens + usage.output_tokens, prompt_tokens_details: { cached_tokens: usage.cached_input_tokens || 0 } };
      Object.assign(record, { finished: new Date().toISOString(), usage, toolCalls: value.tool_calls.map(tool => tool.name), contentLength: value.content.length, success: true });
      const calls = value.tool_calls.map((tool, i) => ({ id: `codex_${index}_${i}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.arguments) } }));
      const finish = calls.length ? 'tool_calls' : 'stop';
      if (res.destroyed) return;
      if (body.stream) {
        const send = (delta, reason = null, usageValue) => res.write('data: ' + JSON.stringify({ id: 'live-codex-' + index, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: MODEL, choices: [{ index: 0, delta, finish_reason: reason }], ...(usageValue ? { usage: usageValue } : {}) }) + '\n\n');
        send({ role: 'assistant', ...(value.content ? { content: value.content } : {}) });
        if (calls.length) send({ tool_calls: calls.map((tool, i) => ({ index: i, ...tool })) });
        send({}, finish, mapped); res.end('data: [DONE]\n\n');
      } else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ id: 'live-codex-' + index, object: 'chat.completion', model: MODEL, choices: [{ index: 0, message: { role: 'assistant', content: value.content || null, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }], usage: mapped })); }
    } catch (error) {
      if (record) { record.error = error.message; record.finished = new Date().toISOString(); }
      // No prompt, credential, stderr or tool input is exposed in the HTTP error.
      if (!res.headersSent && !res.destroyed) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: error.message } })); } else res.destroy();
    } finally { clearInterval(heartbeat); clearTimeout(deadline); clearTimeout(killTimer); await persist(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}/v1`, records, model: MODEL, close: async () => {
    closing = true;
    const waiting = [...children.values()];
    for (const child of children.keys()) child.kill('SIGTERM');
    const force = setTimeout(() => { for (const child of children.keys()) child.kill('SIGKILL'); }, 2000);
    server.closeAllConnections();
    await Promise.allSettled([...waiting, new Promise(resolve => server.close(resolve))]);
    clearTimeout(force); await persist();
  } };
}
module.exports = { start, responseSchema, validateResponse, instruction, MODEL };
