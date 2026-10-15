// Observerer en kopi af udbyderens svar. Ændrer aldrig strømmen til OpenCode og gemmer intet på disk.
// OpenCode 1.18.33 videresender tekst, men ikke delvise værktøjsargumenter. Derfor aflæses disse her.
const { randomUUID } = require('node:crypto');
const { StringDecoder } = require('node:string_decoder');
const { projectFile, patchFiles } = require('./activity.cjs');
const { normalize, isProtected } = require('./project-files.cjs');
const { secretContent } = require('./git.cjs');
const LIMIT = 512 * 1024;

// Læs kun tekstfelter på JSON-objektets øverste niveau. En uafsluttet streng må vises som udkast,
// men en uafsluttet filsti bruges aldrig. Escapes og strenge, der selv indeholder JSON, ændrer ikke niveauet.
function partialStrings(raw) {
  const fields = Object.create(null); let depth = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '{' || ch === '[') { depth++; continue; }
    if (ch === '}' || ch === ']') { depth--; continue; }
    if (ch !== '"') continue;
    const start = i++; let text = '', complete = false;
    for (; i < raw.length; i++) {
      if (raw[i] === '"') { complete = true; break; }
      if (raw[i] !== '\\') { text += raw[i]; continue; }
      const esc = raw[++i];
      if (!esc) break;
      if (esc === 'u') {
        const hex = raw.slice(i + 1, i + 5); if (!/^[a-f\d]{4}$/i.test(hex)) break;
        text += String.fromCharCode(parseInt(hex, 16)); i += 4;
      } else if ('"\\/bfnrt'.includes(esc)) text += ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' })[esc] || esc;
      else break;
    }
    if (depth !== 1 || !complete) continue;
    let next = i + 1; while (/\s/.test(raw[next] || '') && next < raw.length) next++;
    if (raw[next] !== ':') continue;
    const key = text; next++; while (/\s/.test(raw[next] || '') && next < raw.length) next++;
    if (raw[next] !== '"') continue;
    // Genbrug strengafkodningen, uden at fortolke indhold som nye felter.
    const tail = raw.slice(next); let end = 1, escaped = false;
    for (; end < tail.length; end++) { if (!escaped && tail[end] === '"') break; if (!escaped && tail[end] === '\\') escaped = true; else escaped = false; }
    const closed = end < tail.length;
    let value = tail.slice(0, end);
    if (!closed) value = value.replace(/\\(?:u[a-f\d]{0,3})?$/i, '');
    try { fields[key] = { text: JSON.parse(value + '"'), complete: closed }; } catch {}
    i = next + end;
    if (i <= start) break;
  }
  return fields;
}
function safeFile(root, value) {
  try { const file = normalize(projectFile(root, value)); return !isProtected(file) ? file : null; } catch { return null; }
}
function codeDraft(tool, root) {
  if (!['write', 'edit', 'apply_patch', 'patch'].includes(tool.name) || tool.overflow) return null;
  const fields = partialStrings(tool.raw); const patch = fields.patchText || fields.patch;
  const fileField = fields.filePath || fields.path;
  const file = fileField?.complete ? safeFile(root, fileField.text) : null;
  let source = fields.content || fields.newString;
  let paths = file ? [file] : [];
  if (patch) { const completeLines = patch.complete ? patch.text : patch.text.slice(0, patch.text.lastIndexOf('\n') + 1); paths = patchFiles(completeLines).map(p => safeFile(root, p)); source = { ...patch, text: completeLines }; }
  if (!source || !paths.length || paths.some(p => !p)) return null;
  // Vent på hele linjer, så en nøgle fordelt over flere netværkspakker aldrig vises bid for bid.
  const text = source.complete ? source.text : source.text.slice(0, source.text.lastIndexOf('\n') + 1);
  const hidden = secretContent(text) || /(?:api[_-]?key|password|secret|authorization)\s*[=:]/i.test(text);
  return { id: tool.id, file: paths.join(', '), kind: patch ? 'patch' : tool.name === 'edit' ? 'edit' : 'file', text: hidden ? '' : text.slice(-16000), lines: text ? text.split('\n').length : 0, clipped: text.length > 16000, hidden: Boolean(hidden), complete: source.complete };
}

class StreamProgress {
  constructor({ emit = () => {}, root = '', interval = 150, now = Date.now } = {}) {
    this.emit = emit; this.root = root; this.interval = interval; this.now = now;
    this.state = { id: randomUUID(), phase: 'waiting', startedAt: now(), lastContentAt: now(), packets: 0, textChars: 0, reasoningChars: 0, toolChars: 0, draft: null };
    this.tools = new Map(); this.decoder = new StringDecoder('utf8'); this.buffer = ''; this.data = []; this.disabled = false; this.lastEmit = 0;
    this.publish(true);
  }
  publish(force = false) {
    if (!force && this.now() - this.lastEmit < this.interval) return;
    this.lastEmit = this.now();
    try {
      if (this.latestTool) this.state.draft = codeDraft(this.latestTool, this.root);
      this.emit({ ...this.state, at: this.now() });
    } catch { /* Visning må aldrig afbryde et modelkald. */ }
  }
  signal(phase, text) {
    if (typeof text !== 'string' || !text.length) return;
    const changed = this.state.phase !== phase;
    this.state.phase = phase; this.state.lastContentAt = this.now(); this.state[`${phase}Chars`] += text.length;
    if (phase !== 'tool') { this.latestTool = null; this.state.draft = null; }
    this.publish(changed);
  }
  tool(id, name, delta = '', complete = false) {
    if (!this.tools.has(id) && this.tools.size >= 32) return;
    let tool = this.tools.get(id);
    if (!tool) { tool = { id: String(id).slice(0, 200), name: '', raw: '' }; this.tools.set(id, tool); }
    if (typeof name === 'string') tool.name = name.slice(0, 100);
    if (typeof delta === 'string' && !tool.overflow) { if (tool.raw.length + delta.length > LIMIT) { tool.raw = ''; tool.overflow = true; } else tool.raw += delta; }
    this.latestTool = tool; this.state.tool = tool.name;
    this.signal('tool', delta); if (complete) this.publish(true);
  }
  event(event) {
    if (!event || typeof event !== 'object') return;
    // OpenAI Chat Completions: også Corti, Komplai, Mistral, Ollama og kompatible forbindelser.
    for (const choice of (Array.isArray(event.choices) ? event.choices : []).slice(0, 1)) {
      if (!choice || typeof choice !== 'object') continue;
      const d = choice.delta || choice.message || {};
      this.signal('reasoning', d.reasoning_content || d.reasoning);
      this.signal('text', typeof d.content === 'string' ? d.content : '');
      for (const t of (Array.isArray(d.tool_calls) ? d.tool_calls : []).slice(0, 32)) if (t && typeof t === 'object') this.tool(`chat:${t.index ?? t.id ?? 0}`, t.function?.name, t.function?.arguments);
    }
    // Anthropic Messages.
    if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') this.tool(`claude:${event.index}`, event.content_block.name);
    if (event.type === 'content_block_delta') {
      const d = event.delta || {};
      if (d.type === 'text_delta') this.signal('text', d.text);
      if (d.type === 'thinking_delta') this.signal('reasoning', d.thinking);
      if (d.type === 'input_json_delta') this.tool(`claude:${event.index}`, null, d.partial_json);
    }
    // OpenAI og Azure Responses. Argumenterne kan komme i andre pakker end værktøjets navn.
    if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') this.tool(`response:${event.item.id}`, event.item.name, event.item.arguments);
    if (event.type === 'response.function_call_arguments.delta') this.tool(`response:${event.item_id}`, null, event.delta);
    if (event.type === 'response.function_call_arguments.done') {
      const id = `response:${event.item_id}`;
      if (!this.tools.get(id)?.raw) this.tool(id, event.name, event.arguments, true);
    }
    if (event.type === 'response.output_text.delta') this.signal('text', event.delta);
    if (/^response\.reasoning.*\.delta$/.test(event.type || '')) this.signal('reasoning', event.delta);
    // Ikke-streamende svar har samme kategorier, men kan først observeres ved afslutningen.
    for (const part of Array.isArray(event.content) ? event.content : []) {
      if (part?.type === 'text') this.signal('text', part.text);
      if (part?.type === 'thinking') this.signal('reasoning', part.thinking);
      if (part?.type === 'tool_use') this.tool(`claude:${part.id}`, part.name, JSON.stringify(part.input || {}), true);
    }
  }
  frame() {
    if (this.data.length) { try { this.event(JSON.parse(this.data.join('\n'))); } catch {} }
    this.data = [];
  }
  write(chunk, sse = true) {
    if (this.disabled) return;
    this.state.packets++;
    this.buffer += this.decoder.write(Buffer.from(chunk));
    if (this.buffer.length > LIMIT) { this.buffer = ''; this.data = []; this.disabled = true; return; }
    if (!sse) return;
    let newline;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline).replace(/\r$/, ''); this.buffer = this.buffer.slice(newline + 1);
      if (!line) this.frame();
      else if (line.startsWith('data:')) this.data.push(line.slice(5).replace(/^ /, ''));
      if (this.data.reduce((sum, v) => sum + v.length, 0) > LIMIT) { this.disabled = true; this.data = []; break; }
    }
    this.publish();
  }
  end(sse = true) {
    this.buffer += this.decoder.end();
    if (!sse && !this.disabled) { try { this.event(JSON.parse(this.buffer)); } catch {} }
    if (sse && !this.disabled) { if (this.buffer.startsWith('data:')) this.data.push(this.buffer.slice(5).trim()); this.frame(); }
    this.state.phase = 'received'; this.publish(true); this.tools.clear(); this.latestTool = null; this.buffer = ''; this.data = [];
  }
}
module.exports = { StreamProgress, partialStrings, codeDraft, safeFile };
