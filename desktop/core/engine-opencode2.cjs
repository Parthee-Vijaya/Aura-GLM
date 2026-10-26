// SPDX-License-Identifier: EUPL-1.2
// OpenCode v2.1.4 contract boundary. The rest of Aura deliberately retains its
// existing event/approval shapes; wire contracts come from the released V2 API.
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const fs = require('node:fs/promises');

const legacyAction = action => ({ shell: 'bash', subagent: 'task' })[action] || action;
const nativeAction = action => ({ bash: 'shell', task: 'subagent', write: 'edit', patch: 'edit' })[action] || action;
const compact = value => JSON.parse(JSON.stringify(value));
function nativePermissions(permission) {
  return Object.entries(permission).flatMap(([name, value]) => Object.entries(typeof value === 'string' ? { '*': value } : value).map(([resource, effect]) => ({ action: nativeAction(name), resource, effect })));
}
function nativeProvider(provider) {
  const models = Object.fromEntries(Object.entries(provider.models || {}).map(([id, model]) => [id, compact({
    modelID: model.id, name: model.name, family: model.family,
    capabilities: { tools: model.tool_call, input: model.modalities?.input, output: model.modalities?.output },
    limit: model.limit,
    cost: model.cost && { input: model.cost.input, output: model.cost.output, cache: { read: model.cost.cache_read, write: model.cost.cache_write } },
    settings: model.options, headers: model.headers,
  })]));
  return compact({ name: provider.name, package: `aisdk:${provider.npm}`, settings: provider.options, models });
}
function nativeConfig(config, plugin) {
  // V2's new code-mode tool can move sessions or create/remove worktrees. Aura
  // owns these controls and must not acquire an unreviewed second execution path.
  const permissions = [...nativePermissions(config.permission), { action: 'execute', resource: '*', effect: 'deny' }];
  return {
    model: config.model,
    policies: [{ action: 'provider.use', resource: '*', effect: 'deny' }, { action: 'provider.use', resource: 'harness', effect: 'allow' }],
    providers: { harness: nativeProvider(config.provider.harness) },
    permissions,
    agents: { plan: { permissions }, title: { model: config.small_model } },
    share: 'disabled', update: 'disable', snapshots: false,
    plugins: Array.isArray(plugin) ? plugin : plugin ? [plugin] : [], mcp: { servers: {} }, lsp: false, formatter: false, warming: false,
  };
}
function normalizedConfig(config) {
  const result = compact(config);
  // Released V2 strips an empty MCP container during schema normalization.
  if (result.mcp && Object.keys(result.mcp).length === 1 && Object.keys(result.mcp.servers || {}).length === 0) delete result.mcp;
  const ref = value => {
    if (typeof value !== 'string') return value;
    const slash = value.indexOf('/');
    return { providerID: value.slice(0, slash), model: value.slice(slash + 1) };
  };
  result.model = ref(result.model);
  for (const agent of Object.values(result.agents || {})) if (agent.model) agent.model = ref(agent.model);
  return result;
}
function validateConfigEntries(entries, expected, directory) {
  if (!Array.isArray(entries)) return false;
  const documents = entries.filter(entry => entry?.type === 'document');
  if (documents.length !== 1 || documents[0].path !== undefined || !isDeepStrictEqual(documents[0].info, normalizedConfig(expected))) return false;
  // Config entries are ordered sources, not a merged effective-config response.
  // Reject additional authority instead of assuming the last document wins for
  // every V2 subsystem (provider and policy merge orders intentionally differ).
  return entries.every(entry => entry.type === 'document' || (entry.type === 'directory' && path.resolve(entry.path) === path.join(directory, 'config')));
}
async function validatePrivateConfigDirectory(directory) {
  const config = path.join(directory, 'config');
  const fail = () => new Error('Agentens effektive indstillinger afviger. En lokal eller administreret konfiguration kan være årsagen.');
  await fs.mkdir(config, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  const info = await fs.lstat(config);
  if (!info.isDirectory() || info.isSymbolicLink() || await fs.realpath(config) !== config) throw fail();
  const legacyIgnore = 'node_modules\npackage.json\npackage-lock.json\nbun.lock\n.gitignore';
  async function checkIgnore(file) {
    const entry = await fs.lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || await fs.readFile(file, 'utf8') !== legacyIgnore) throw fail();
  }
  for (const name of await fs.readdir(config)) {
    if (name === 'skills') continue;
    // V1 creates precisely these inert package-cache ignore files itself.
    // They are not config authority and must not block an existing Aura session.
    if (name === '.gitignore') { await checkIgnore(path.join(config, name)); continue; }
    if (name === 'opencode') {
      const legacy = path.join(config, name), entry = await fs.lstat(legacy);
      if (!entry.isDirectory() || entry.isSymbolicLink() || (await fs.readdir(legacy)).some(name => name !== '.gitignore')) throw fail();
      if ((await fs.readdir(legacy)).includes('.gitignore')) await checkIgnore(path.join(legacy, '.gitignore')); continue;
    }
    throw fail();
  }
  // V2's directory sources can independently discover agent Markdown and local
  // plugins, which are absent from /api/config's document list. Only the skill
  // tree that Aura rewrites below may exist in this private discovery root.
  let checked = 0;
  async function inspect(target, depth) {
    if (++checked > 10000 || depth > 8) throw fail();
    const entry = await fs.lstat(target);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) throw fail();
    if (entry.isDirectory()) for (const child of await fs.readdir(target)) await inspect(path.join(target, child), depth + 1);
  }
  const skills = path.join(config, 'skills');
  if ((await fs.readdir(config)).includes('skills')) await inspect(skills, 0);
}
async function writeTrustedPlugin(directory, source) {
  const fail = () => new Error('Agentens lokale plugin kan ikke kontrolleres. Ukendte filer er bevaret.');
  await fs.mkdir(directory, { recursive:true, mode:0o700 });
  const entry = await fs.lstat(directory);
  if (!entry.isDirectory() || entry.isSymbolicLink() || await fs.realpath(directory) !== directory) throw fail();
  // V2 resolves server entries before index.mjs. Never let an unverified
  // package/server entry execute before the post-start activation check.
  for (const name of await fs.readdir(directory)) if (name !== 'index.mjs') throw fail();
  const file = path.join(directory,'index.mjs');
  const previous = await fs.lstat(file).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw fail();
  const temporary = path.join(path.dirname(directory), '.aura-plugin-' + require('node:crypto').randomUUID());
  await fs.writeFile(temporary, source, { mode:0o600, flag:'wx' });
  try { await fs.rename(temporary,file); } finally { await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;}); }
}
function inputForLegacy(tool, input, root) {
  const result = { ...(input || {}) };
  if (['read', 'write', 'edit'].includes(tool) && typeof result.path === 'string') result.filePath = path.resolve(root, result.path);
  return result;
}
const textContent = content => (content || []).filter(item => item.type === 'text').map(item => item.text || '').join('\n');
function structuredError(error = {}) {
  return { name: error.type || 'Error', data: { message: error.message || '', statusCode: error.status, ...(error.response?.body ? { responseBody: error.response.body } : {}) } };
}
class EventAdapter {
  constructor(root) { this.root = root; this.parts = new Map(); this.tools = new Map(); this.forms = new Map(); this.models = new Map(); this.requestedInterrupts = new Set(); }
  expectUserInterrupt(sessionID) { this.requestedInterrupts.add(sessionID); }
  cancelExpectedInterrupt(sessionID) { this.requestedInterrupts.delete(sessionID); }
  partID(messageID, type, key) { return `${messageID}:${type}:${key}`; }
  toolPart(data, name) {
    const id = this.partID(data.assistantMessageID, 'tool', data.id);
    let part = this.tools.get(id);
    if (!part) { part = { id, type: 'tool', sessionID: data.sessionID, messageID: data.assistantMessageID, callID: data.id, tool: legacyAction(name || 'unknown'), state: { status: 'pending', input: '' } }; this.tools.set(id, part); }
    if (name) part.tool = legacyAction(name);
    return part;
  }
  normalize(event) {
    const d = event?.data || {}, out = [];
    const emit = (type, properties) => out.push({ type, properties });
    const update = part => emit('message.part.updated', { part: compact(part) });
    const info = (id, role = 'assistant', more = {}) => emit('message.updated', { info: { id, sessionID: d.sessionID, role, ...more } });
    if (event.type === 'session.step.started') {
      this.models.set(d.assistantMessageID, d.model);
      info(d.assistantMessageID, 'assistant', { providerID: d.model?.providerID, modelID: d.model?.id });
    } else if (event.type === 'session.step.ended') {
      update({ id: this.partID(d.assistantMessageID, 'step', 'finish'), type: 'step-finish', sessionID: d.sessionID, messageID: d.assistantMessageID, reason: d.finish, cost: d.cost, tokens: d.tokens });
      info(d.assistantMessageID, 'assistant', { finish: d.finish, time: { completed: Date.now() }, tokens: d.tokens, cost: d.cost, providerID: this.models.get(d.assistantMessageID)?.providerID, modelID: this.models.get(d.assistantMessageID)?.id });
    } else if (/^session\.(text|reasoning)\.(started|delta|ended)$/.test(event.type)) {
      const [, kind, phase] = event.type.split('.');
      const id = this.partID(d.assistantMessageID, kind, d.ordinal);
      let part = this.parts.get(id);
      if (!part) { part = { id, type: kind, sessionID: d.sessionID, messageID: d.assistantMessageID, text: '' }; this.parts.set(id, part); update(part); }
      if (phase === 'delta') { part.text += d.delta || ''; emit('message.part.delta', { sessionID: d.sessionID, messageID: d.assistantMessageID, partID: id, field: 'text', delta: d.delta || '' }); }
      if (phase === 'ended') { part.text = d.text || ''; update(part); }
    } else if (event.type === 'session.tool.input.started') {
      update(this.toolPart(d, d.name));
    } else if (event.type === 'session.tool.input.delta' || event.type === 'session.tool.input.ended') {
      const part = this.toolPart(d);
      if (part.state.status === 'pending') {
        part.state.input = event.type.endsWith('delta') ? String(part.state.input || '') + (d.delta || '') : d.text || '';
        update(part);
      }
    } else if (event.type === 'session.tool.called') {
      const part = this.toolPart(d); part.state = { status: 'running', input: inputForLegacy(part.tool, d.input, this.root), metadata: {} }; update(part);
    } else if (event.type === 'session.tool.progress') {
      const part = this.toolPart(d); part.state.metadata = d.metadata || {}; update(part);
    } else if (['session.tool.success', 'session.tool.failed'].includes(event.type)) {
      const part = this.toolPart(d);
      part.state = { ...part.state, status: event.type.endsWith('success') ? 'completed' : 'error', output: textContent(d.content), metadata: d.metadata || {}, ...(d.error ? { error: d.error.message || d.error.type } : {}) }; update(part);
    } else if (event.type === 'permission.asked') {
      const part = d.source?.id ? this.tools.get(this.partID(d.source.messageID, 'tool', d.source.id)) : null;
      const files = (d.metadata?.files || []).map(file => ({ ...file, file: typeof file.file === 'string' ? path.resolve(this.root, file.file) : file.file }));
      const file = files.length === 1 ? files[0].file : part?.state?.input?.filePath;
      const metadata = { ...(d.metadata || {}), ...(files.length ? { files } : {}), ...(file ? { filepath: file } : {}) };
      if (files.length === 1 && typeof files[0].patch === 'string') metadata.diff = files[0].patch;
      emit('permission.asked', { id: d.id, sessionID: d.sessionID, permission: legacyAction(d.action), patterns: d.resources || [], always: d.save || [], metadata, ...(d.source ? { tool: { messageID: d.source.messageID, callID: d.source.id } } : {}) });
    } else if (event.type === 'permission.replied') emit(event.type, { ...d, requestID: d.requestID || d.id, reply: d.reply || d.decision });
    else if (event.type === 'form.created' && d.form?.metadata?.kind === 'question') {
      const form = d.form;
      this.forms.set(form.id, form);
      emit('question.asked', { id: form.id, sessionID: form.sessionID, questions: form.fields.map(field => ({ question: field.description || field.title || '', header: field.title || '', options: (field.options || []).map(option => ({ label: option.label, description: option.description || '' })), multiple: field.type === 'multiselect', custom: field.custom !== false })), ...(form.metadata.tool ? { tool: { messageID: form.metadata.tool.messageID, callID: form.metadata.tool.id } } : {}) });
    } else if (event.type === 'form.replied' || event.type === 'form.cancelled') {
      if (this.forms.has(d.id)) { this.forms.delete(d.id); emit(event.type === 'form.replied' ? 'question.replied' : 'question.rejected', { sessionID: d.sessionID, requestID: d.id }); }
    } else if (event.type === 'session.execution.started') emit('session.status', { sessionID: d.sessionID, status: { type: 'busy' } });
    else if (event.type === 'session.execution.succeeded') emit('session.idle', { sessionID: d.sessionID });
    else if (event.type === 'session.execution.failed') emit('session.error', { sessionID: d.sessionID, error: structuredError(d.error) });
    else if (event.type === 'session.retry.scheduled') emit('session.status', { sessionID: d.sessionID, status: { type: 'retry', attempt: d.attempt, message: d.error?.message || '', next: d.at } });
    else if (event.type === 'session.execution.interrupted') {
      // The caller arms this before its own HTTP interrupt. V2 emits the same
      // reason:user for a declined permission, which must still finish as an
      // actual neutral error when Aura did not request Stop for this session.
      if (d.reason === 'user' && this.requestedInterrupts.delete(d.sessionID)) return out;
      // V2 also uses reason:user for a plain rejected permission. Only Aura's
      // explicit Stop owns a user-stopped result (acknowledged above). An
      // otherwise interrupted execution must finish neutrally as a real error,
      // never hang or manufacture successful idle/tool completion.
      emit('engine.error', { sessionID: d.sessionID, interrupted: true, reason: d.reason, error: structuredError({ type: 'Interrupted', message: 'Agentmotoren afbrød opgaven.' }) });
    }
    return out;
  }
  message(message, sessionID) {
    const role = message.type === 'assistant' ? 'assistant' : message.type === 'user' ? 'user' : message.type;
    const info = { id: message.id, role, sessionID, ...(message.status ? { status:message.status } : {}), ...(message.model ? { providerID: message.model.providerID, modelID: message.model.id } : {}), ...(message.tokens ? { tokens: message.tokens, cost: message.cost } : {}), ...(message.error ? { error: structuredError(message.error) } : {}), ...(message.finish ? { finish: message.finish, time: { completed: message.time?.completed || message.time?.created || 1 } } : {}) };
    const content = message.type === 'assistant' ? message.content || [] : message.type === 'user' ? [{ type: 'text', text: message.text || message.prompt?.text || '' }] : [];
    const ordinals = { text: 0, reasoning: 0 };
    const parts = content.map((part, index) => {
      if (part.type !== 'tool') return { id: this.partID(message.id, part.type, part.type in ordinals ? ordinals[part.type]++ : index), type: part.type, messageID: message.id, sessionID, text: part.text || '' };
      return { id: this.partID(message.id, 'tool', part.id), type: 'tool', messageID: message.id, sessionID, callID: part.id, tool: legacyAction(part.name), state: { ...part.state, input: inputForLegacy(legacyAction(part.name), part.state.input, this.root), ...(part.state.content ? { output: textContent(part.state.content) } : {}), ...(part.state.error ? { error: part.state.error.message || part.state.error.type } : {}) } };
    });
    if (message.tokens) parts.push({ id: this.partID(message.id, 'step', 'finish'), type: 'step-finish', messageID: message.id, sessionID, reason: message.finish, tokens: message.tokens, cost: message.cost });
    return { info, parts };
  }
}
module.exports = { nativePermissions, nativeProvider, nativeConfig, normalizedConfig, validateConfigEntries, validatePrivateConfigDirectory, inputForLegacy, EventAdapter, writeTrustedPlugin };
