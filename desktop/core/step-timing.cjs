// SPDX-License-Identifier: EUPL-1.2
'use strict';
// D5a: trinregistret bag statuslinjens tok/s. Én turn = ét register, bundet til
// samtalen, turen (generationen), motorsessionen og den valgte forbindelse,
// model og rute. Alle tider kommer fra ÉN monoton klokke (process.hrtime.bigint)
// i hovedprocessen — rendereren ser aldrig rå tider, kun det færdige aggregat.
//
// Kontrakten (opencode-formlen, Codex-bindende): tok/s = Σ(output + reasoning)
// / Σ(streamed − første indhold) over turens gyldige trin. Et trin er gyldigt
// kun, når BÅDE en observeret første-indholds-delta og en `session.step.streamed`
// findes (begge fra levende hændelser — recovery-snapshots opfinder aldrig
// tider), intervallet er positivt, og udbyderens output-/reasoning-tal kendes.
// Ugyldige trin udelades fra BEGGE summer, så tælleren aldrig løber fra tiden.
// Kører Privacy Gate-runtiden, måles der ikke: DTO'en er ukendt, og 0 i linjen
// er en visningsværdi, ikke en måling.
const hrtimeNow = () => process.hrtime.bigint();
const NANOSECONDS_PER_SECOND = 1e9;
const CAPACITY = 4096;
const idText = value => typeof value === 'string' && value.length <= 300 && !/[\x00-\x1f\x7f]/.test(value) ? value : null;
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

// One step = one engine model call (the assistant message the engine reports).
const emptyStep = id => ({ id, startedAt: null, firstContentAt: null, streamedAt: null, endedAt: null, tokens: null });

class StepTiming {
  constructor({ chatID = '', engineID = '', connectionID = '', modelID = '', routeID = '', sessionID = '', now = hrtimeNow } = {}) {
    const ids = { chatID, engineID, connectionID, modelID, routeID, sessionID };
    for (const key of Object.keys(ids)) ids[key] = idText(ids[key]) || '';
    this.binding = ids;
    this.now = typeof now === 'function' ? now : hrtimeNow;
    this.steps = new Map();
    this.closed = false;
  }
  // The engine session is known first when the engine has started for this
  // turn; it binds exactly once and is never re-targeted afterwards.
  bindSession(sessionID) {
    const id = idText(sessionID);
    if (id && !this.binding.sessionID) this.binding.sessionID = id;
    return { ...this.binding };
  }
  step(messageID) {
    const id = idText(messageID);
    if (!id) return null;
    let step = this.steps.get(id);
    if (!step) {
      if (this.steps.size >= CAPACITY) return null;
      step = emptyStep(id);
      this.steps.set(id, step);
    }
    return step;
  }
  mark(step, key, recovered) {
    // First live observation wins: duplicates and recovery replays change nothing.
    if (this.closed || recovered || step[key] != null) return;
    try { step[key] = this.now(); } catch { /* A broken clock never invents a timing. */ }
  }
  firstContent(messageID, recovered) {
    const step = this.step(messageID);
    if (step) this.mark(step, 'firstContentAt', recovered);
  }
  // Normalized engine events only; the caller owns session and turn filtering
  // (engine.cjs guards), so this register re-checks the binding as belt and
  // suspenders: foreign sessions and unowned steps are rejected here too.
  observe(event) {
    if (this.closed || !event || typeof event.type !== 'string') return false;
    const p = event.properties || {};
    const sessionID = p.sessionID || p.part?.sessionID || p.info?.sessionID;
    if (typeof sessionID !== 'string' || sessionID !== this.binding.sessionID) return false;
    const recovered = event.recovered === true;
    if (event.type === 'message.updated' && p.info?.role === 'assistant') {
      const step = this.step(p.info.id);
      if (step) this.mark(step, 'startedAt', recovered);
      return true;
    }
    if (event.type === 'message.part.streamed') {
      const step = this.step(p.messageID);
      if (step) this.mark(step, 'streamedAt', recovered);
      return true;
    }
    if (event.type === 'message.part.updated') {
      const part = p.part;
      if (part?.type === 'text' || part?.type === 'reasoning') {
        if (typeof part.text === 'string' && part.text.length) this.firstContent(part.messageID, recovered);
        return true;
      }
      if (part?.type === 'tool') {
        // A streamed tool input is observed content for a tool-only step.
        if (typeof part.state?.input === 'string' && part.state.input.length) this.firstContent(part.messageID, recovered);
        return true;
      }
      if (part?.type === 'step-finish') {
        const step = this.step(part.messageID);
        if (!step) return true;
        this.mark(step, 'endedAt', recovered);
        if (step.tokens == null) {
          const tokens = part.tokens || {};
          step.tokens = { output: count(tokens.output), reasoning: count(tokens.reasoning) };
        }
        return true;
      }
      return false;
    }
    if (event.type === 'message.part.delta' && p.field === 'text' && typeof p.delta === 'string' && p.delta.length) {
      this.firstContent(p.messageID, recovered);
      return true;
    }
    return false;
  }
  // Σ(output + reasoning) / Σ(streamed − firstContent) over the valid steps of
  // THIS turn, in seconds. Same steps in both sums; none when nothing measured.
  result() {
    let tokenSum = 0, nanoseconds = 0n, steps = 0;
    for (const step of this.steps.values()) {
      if (step.firstContentAt == null || step.streamedAt == null || step.tokens == null) continue;
      if (step.tokens.output == null || step.tokens.reasoning == null) continue;
      const interval = step.streamedAt - step.firstContentAt;
      if (typeof interval !== 'bigint' || interval <= 0n) continue;
      tokenSum += step.tokens.output + step.tokens.reasoning;
      nanoseconds += interval;
      steps++;
    }
    if (!steps) return null;
    const seconds = Number(nanoseconds) / NANOSECONDS_PER_SECOND;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    const value = Math.round(tokenSum / seconds);
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return { value, steps };
  }
  // The content-free DTO the renderer and the chat file see. `known: false`
  // means "no qualified measurement this turn" — the line shows 0 as a display
  // value, and the tooltip says so; the backend never turns unknown into zero.
  dto() {
    const aggregate = this.result();
    return {
      value: aggregate ? aggregate.value : null,
      known: Boolean(aggregate),
      quality: aggregate ? 'observed' : 'unknown',
      source: aggregate ? 'engine-step-streamed' : 'unmeasured-turn',
      unit: 'tok/s',
      stepCount: aggregate ? aggregate.steps : 0,
      ...this.binding,
    };
  }
  close() { this.closed = true; }
}

// A stored DTO is untrusted file content: it survives a reload only when it is
// exactly the fields this module writes — no foreign keys, text or payloads.
function toDTO(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.unit !== 'tok/s' || typeof value.known !== 'boolean') return null;
  if (!['observed', 'unknown'].includes(value.quality) || !['engine-step-streamed', 'unmeasured-turn'].includes(value.source)) return null;
  const stepCount = count(value.stepCount);
  if (stepCount == null) return null;
  const speed = count(value.value);
  if (value.known !== (speed != null)) return null;
  const dto = { value: speed, known: value.known, quality: value.quality, source: value.source, unit: 'tok/s', stepCount };
  if (value.ttftMs !== undefined) {
    const ttft = count(value.ttftMs);
    if (ttft == null) return null;
    dto.ttftMs = ttft;
  }
  for (const key of ['chatID', 'engineID', 'connectionID', 'modelID', 'routeID', 'sessionID']) {
    const id = value[key];
    if (id === undefined) continue;
    if (idText(id) === null) return null;
    dto[key] = id;
  }
  return dto;
}

module.exports = { StepTiming, toDTO };
