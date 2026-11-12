'use strict';
const { definitions } = require('./connections.cjs');
const PHASES = Object.freeze(['starting-engine', 'waiting-model', 'waiting-approval', 'retrying', 'responding', 'idle']);
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max ? value : null;
function safeConnection(input = {}) {
  const providerType = typeof input.providerType === 'string' && Object.hasOwn(definitions, input.providerType) ? input.providerType : 'unknown';
  const time = value => integer(value, 0, 8_640_000_000_000_000);
  const since = time(input.since), until = time(input.until);
  return { providerType, protocol: ['openai', 'responses', 'anthropic'].includes(input.protocol) ? input.protocol : 'unknown',
    errorStep: PHASES.includes(input.errorStep) && input.errorStep !== 'idle' ? input.errorStep : null,
    httpStatus: integer(input.httpStatus, 100, 599), since, until,
    durationMs: since !== null && until !== null && until >= since ? until - since : null };
}
class WorkPhases {
  constructor({ emit = () => {}, now = Date.now } = {}) { this.emit = emit; this.now = now; this.active = false; this.phase = 'idle'; this.data = safeConnection(); }
  clock() { let value; try { value = this.now(); } catch {} return integer(value, 0, 8_640_000_000_000_000) ?? 0; }
  begin(connection) {
    this.data = safeConnection({ providerType: connection?.kind, protocol: connection?.protocol || definitions[connection?.kind]?.protocol, since: this.clock() });
    this.active = true; this.phase = 'idle'; this.attempt = null; this.of = null; this.approvalWaits = new Set();
    this.set('starting-engine');
  }
  set(phase, { attempt, of } = {}) {
    if (!this.active || !PHASES.includes(phase) || phase === 'idle') return;
    this.requested = { phase, attempt: integer(attempt, 1, 100), of: integer(of, 1, 100) };
    if (this.approvalWaits.size) { phase = 'waiting-approval'; attempt = undefined; of = undefined; }
    const nextAttempt = integer(attempt, 1, 100), nextOf = integer(of, 1, 100);
    if (this.phase === phase && this.attempt === nextAttempt && this.of === nextOf) return;
    this.phase = phase; this.attempt = nextAttempt; this.of = nextOf;
    const event = { type: 'work.phase', phase, since: this.clock(), ...(nextAttempt !== null ? { attempt: nextAttempt } : {}), ...(nextOf !== null && (nextAttempt === null || nextOf >= nextAttempt) ? { of: nextOf } : {}) };
    try { this.emit(event); } catch {}
  }
  waitForApproval() {
    if (!this.active) return () => {};
    const waits = this.approvalWaits, token = {};
    waits.add(token); this.set(this.requested.phase, this.requested);
    return () => {
      if (!waits.delete(token) || !this.active || this.approvalWaits !== waits || waits.size) return;
      this.set(this.requested.phase, this.requested);
    };
  }
  failure(status) { if (this.active) { this.data.errorStep = this.phase === 'idle' ? null : this.phase; this.data.httpStatus = integer(status, 100, 599); } }
  finish() {
    if (!this.active) return;
    this.data.until = Math.max(this.data.since, this.clock()); this.active = false; this.phase = 'idle';
    try { this.emit({ type: 'work.phase', phase: 'idle', since: this.data.until }); } catch {}
  }
  snapshot() { return safeConnection({ ...this.data, until: this.active ? Math.max(this.data.since, this.clock()) : this.data.until }); }
}
module.exports = { PHASES, WorkPhases, safeConnection };
