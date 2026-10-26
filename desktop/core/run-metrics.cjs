'use strict';

// Host-only, bounded diagnostics. No prompt text, hashes, paths, endpoints or
// credentials are retained, and this module has no disk/network/renderer sink.
const { performance } = require('node:perf_hooks');
const { randomUUID } = require('node:crypto');
const COMPONENT_IDS = Object.freeze({
  'Appens grundregler og projektkontekst': 'base-and-project',
  'Projektvejledning': 'project-guidance', 'Hovedskill til bygning': 'build-guidance',
  'Projektets AGENTS.md': 'project-instructions', 'Samtaleregler': 'conversation-rules',
  'Arbejdsmåde': 'conversation-mode', 'Fravalg af planforslag': 'dismissed-plan',
  'Projektbrief': 'brief', 'Tidligere samtale': 'conversation-handoff',
  'Spørgsmål': 'questions', 'Planlægning og afklaring': 'planning',
  'Godkendt plan': 'approved-plan', 'Afslutning og kontroller': 'completion-checks',
});
const MODES = new Set(['chat', 'plan', 'build', 'free']);
const PRIVACY = new Set(['off', 'local', 'hybrid', 'cloud-controlled']);
const OUTCOMES = new Set(['completed', 'error', 'stopped', 'superseded', 'closed']);
const TOKEN_FIELDS = ['input', 'output', 'reasoning', 'cacheRead', 'cacheWrite'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const sizes = text => {
  const bytes = typeof text === 'string' ? Buffer.byteLength(text, 'utf8') : 0;
  return { bytes, estimatedTokens: Math.ceil(bytes / 4) };
};
function promptComponents(components) {
  if (!Array.isArray(components)) return [];
  return components.slice(0, 64).map(part => ({ id: typeof part?.id === 'string' && Object.hasOwn(COMPONENT_IDS, part.id) ? COMPONENT_IDS[part.id] : 'other', ...sizes(part?.text) }));
}

class RunMeasurement {
  constructor({ mode, origin = 'engine-only', now = () => performance.now(), observer = () => {}, publish = () => {} } = {}) {
    this.now = now; this.observer = observer; this.publish = publish;
    this.marks = {}; this.lastTime = 0; this.terminal = false;
    this.assistants = new Set(); this.parts = new Map(); this.steps = new Set();
    this.data = {
      schemaVersion: 1, id: randomUUID(), origin: origin === 'conversation' ? 'conversation' : 'engine-only', mode: MODES.has(mode) ? mode : null,
      outcomeScope: 'measured-prompt',
      // Engine-only probes do not know the owning project's Privacy Gate mode.
      privacyMode: null, outcome: 'created', engineSupport: 'pending', engineReused: false,
      prepare_ms: null, engine_start_ms: null, send_setup_ms: null, send_ack_ms: null,
      ack_observed_ms: null, ackSource: null, ttft_ms: null, ttft_upper_bound_ms: null, ttftSource: null,
      prompt: { scope: 'aura-added-text-only', estimateMethod: 'utf8-bytes-div4-v1',
        components: [], reviewed: null, system: null, runtimeSuffix: null, user: null },
      providerUsage: { source: 'engine-step-finish', calls: 0, partial: false, input: null, output: null, reasoning: null, cacheRead: null, cacheWrite: null },
    };
    this.update();
  }
  clock() {
    try { const value = this.now(); if (Number.isFinite(value) && value >= this.lastTime) this.lastTime = value; } catch {}
    return this.lastTime;
  }
  elapsed(start) { return this.marks[start] == null ? null : Math.round(Math.max(0, this.clock() - this.marks[start]) * 1000) / 1000; }
  snapshot() { return structuredClone(this.data); }
  update() {
    // Diagnostic consumers never own delivery, even if they throw or mutate.
    try { this.publish(this.snapshot()); } catch {}
    try { this.observer(this.snapshot()); } catch {}
  }
  prepareStarted() { if (!this.terminal && this.marks.prepare == null) { this.marks.prepare = this.clock(); this.data.outcome = 'preparing'; this.update(); } }
  prepared(components, privacyMode = 'off') {
    if (this.terminal) return;
    this.data.prepare_ms = this.elapsed('prepare');
    this.data.prompt.components = promptComponents(components);
    const bytes = this.data.prompt.components.reduce((sum, item) => sum + item.bytes, 0);
    this.data.prompt.reviewed = { bytes, estimatedTokens: Math.ceil(bytes / 4) };
    this.data.privacyMode = PRIVACY.has(privacyMode) ? privacyMode : 'off';
    this.data.outcome = 'prepared'; this.update();
  }
  unsupported(reason) {
    if (this.terminal) return;
    this.data.engineSupport = reason === 'privacy-runtime' ? 'privacy-runtime-unsupported' : 'observer-unavailable';
    this.update();
  }
  engineStarting() {
    if (this.terminal || this.marks.engine != null) return;
    this.marks.engine = this.clock(); this.data.engineSupport = 'native-engine'; this.update();
  }
  engineReady() {
    if (this.terminal) return;
    this.data.engine_start_ms = this.elapsed('engine'); this.update();
  }
  sending(text, system) {
    if (this.terminal || this.marks.send != null) return;
    this.marks.send = this.clock(); this.data.outcome = 'sending'; this.data.engineSupport = 'native-engine';
    if (this.marks.engine == null) { this.data.engineReused = true; this.data.engine_start_ms = 0; }
    this.data.prompt.user = sizes(text); this.data.prompt.system = sizes(system);
    if (this.data.prompt.reviewed) {
      const bytes = Math.max(0, this.data.prompt.system.bytes - this.data.prompt.reviewed.bytes);
      this.data.prompt.runtimeSuffix = { bytes, estimatedTokens: Math.ceil(bytes / 4) };
    }
    this.update();
  }
  dispatched() {
    if (this.terminal || this.marks.dispatch != null) return;
    this.data.send_setup_ms = this.elapsed('send'); this.marks.dispatch = this.clock(); this.update();
  }
  acknowledged(source = 'http') {
    // A fast answer can complete before its HTTP acknowledgement. Accept only
    // that pending acknowledgement after completion, never output after Stop.
    if (this.data.ackSource || this.marks.dispatch == null || this.terminal && this.data.outcome !== 'completed') return;
    this.data.ackSource = source === 'reconciled' ? 'reconciled' : 'http';
    this.data.ack_observed_ms = this.elapsed('dispatch');
    if (this.data.ackSource === 'http') this.data.send_ack_ms = this.data.ack_observed_ms;
    if (!this.terminal) this.data.outcome = 'running';
    this.update();
  }
  content(recovered) {
    if (this.terminal || this.marks.dispatch == null || this.data.ttftSource) return;
    this.data.ttftSource = recovered ? 'recovered-snapshot-upper-bound' : 'engine-content-observed';
    this.data[recovered ? 'ttft_upper_bound_ms' : 'ttft_ms'] = this.elapsed('dispatch');
    this.update();
  }
  observe(event) {
    if (this.terminal) return;
    const p = event?.properties || {};
    if (event?.type === 'message.updated' && p.info?.role === 'assistant' && this.assistants.size < 4096) this.assistants.add(p.info.id);
    if (event?.type === 'message.part.updated' && this.assistants.has(p.part?.messageID)) {
      const part = p.part;
      if (['text', 'reasoning'].includes(part.type)) {
        if (this.parts.size < 4096) this.parts.set(part.id, true);
        if (typeof part.text === 'string' && part.text.length) this.content(event.recovered === true);
      }
      if (part.type === 'step-finish' && typeof part.id === 'string' && !this.steps.has(part.id) && this.steps.size < 4096) {
        this.steps.add(part.id); const tokens = part.tokens || {};
        const values = { input: tokens.input, output: tokens.output, reasoning: tokens.reasoning, cacheRead: tokens.cache?.read, cacheWrite: tokens.cache?.write };
        this.data.providerUsage.calls++;
        for (const key of TOKEN_FIELDS) {
          if (!integer(values[key])) { this.data.providerUsage.partial = true; continue; }
          const total = (this.data.providerUsage[key] || 0) + values[key];
          if (integer(total)) this.data.providerUsage[key] = total;
          else this.data.providerUsage.partial = true;
        }
        this.update();
      }
    }
    if (event?.type === 'message.part.delta' && p.field === 'text' && this.parts.has(p.partID) && typeof p.delta === 'string' && p.delta.length) this.content(event.recovered === true);
    if (event?.type === 'session.idle') this.finish('completed');
    if (['session.error', 'engine.error'].includes(event?.type)) this.finish('error');
  }
  finish(outcome) {
    if (this.terminal) return;
    if (this.data.prepare_ms == null && this.marks.prepare != null) this.data.prepare_ms = this.elapsed('prepare');
    this.data.outcome = OUTCOMES.has(outcome) ? outcome : 'error'; this.terminal = true;
    this.assistants.clear(); this.parts.clear(); this.steps.clear(); this.update();
  }
}

function createMetricsBuffer({ limit = 100, observer = () => {}, now } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid diagnostic capacity.');
  const records = new Map();
  return {
    create(options = {}) {
      let admitted = false;
      return new RunMeasurement({ mode: options.mode, origin: options.origin, now, observer, publish(record) {
        // An evicted, long-running measurement cannot grow/re-enter the ring.
        if (admitted && !records.has(record.id)) return;
        admitted = true; records.set(record.id, record);
        while (records.size > limit) records.delete(records.keys().next().value);
      } });
    },
    snapshots: () => structuredClone([...records.values()]),
  };
}
const localMetrics = createMetricsBuffer();
module.exports = { RunMeasurement, promptComponents, createMetricsBuffer, localMetrics };
