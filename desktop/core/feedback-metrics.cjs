'use strict';

// Offline analysis of an explicitly recorded usability observation. This module
// does not subscribe to the app, persist data, contact a model or send telemetry.
const EVENT_TYPES = Object.freeze([
  'study.started', 'prompt.submitted', 'choice.required', 'question.repeated',
  'observer.helped', 'work.started', 'work.paused', 'work.resumed', 'work.ended',
  'activity.visible', 'preview.verified', 'study.completed', 'study.stopped', 'study.failed',
]);
const CHOICE_CATEGORIES = Object.freeze(['product', 'plan', 'data', 'tool', 'technical']);
const TYPES = new Set(EVENT_TYPES), CATEGORIES = new Set(CHOICE_CATEGORIES);
const TERMINAL = new Map([['study.completed', 'completed'], ['study.stopped', 'stopped'], ['study.failed', 'failed']]);
const MAX_EVENTS = 10000;
const invalid = () => { throw new TypeError('Invalid feedback observation. Use only ordered, anonymous events.'); };
const time = value => Number.isSafeInteger(value) && value >= 0;
const record = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function summarizeFeedbackSession(events, options = {}) {
  if (!Array.isArray(events) || !events.length || events.length > MAX_EVENTS || !record(options)) invalid();
  if (Reflect.ownKeys(options).some(key => !['observedThroughMs', 'silenceThresholdMs'].includes(key))) invalid();
  const silenceThresholdMs = options.silenceThresholdMs ?? 15000;
  if (!time(silenceThresholdMs) || silenceThresholdMs === 0) invalid();
  const counts = Object.fromEntries(CHOICE_CATEGORIES.map(category => [category, 0]));
  let last = -1, outcome = 'incomplete', terminal = false, firstPrompt = null, firstPreview = null;
  let repeatedQuestions = 0, observerHelp = 0, prompts = 0, work = 'idle';
  let workSeen = false, activeSince = null, quietSince = null, workingMs = 0, maxQuietMs = 0, excessQuietMs = 0, intervals = 0;

  const closeQuiet = atMs => {
    if (quietSince === null) return;
    const gap = atMs - quietSince;
    maxQuietMs = Math.max(maxQuietMs, gap);
    excessQuietMs += Math.max(0, gap - silenceThresholdMs);
    quietSince = atMs;
  };
  const closeWork = atMs => {
    if (work !== 'working') return;
    closeQuiet(atMs); workingMs += atMs - activeSince;
    activeSince = null; quietSince = null;
  };

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    if (!record(event)) invalid();
    const allowed = event.type === 'choice.required' ? ['sequence', 'type', 'atMs', 'category'] : ['sequence', 'type', 'atMs'];
    if (Reflect.ownKeys(event).length !== allowed.length || Reflect.ownKeys(event).some(key => !allowed.includes(key))) invalid();
    if (event.sequence !== index || !TYPES.has(event.type) || !time(event.atMs) || event.atMs < last || terminal) invalid();
    const { type, atMs } = event;
    if (index === 0 && (type !== 'study.started' || atMs !== 0) || index > 0 && type === 'study.started') invalid();
    last = atMs;
    if (type === 'prompt.submitted') { firstPrompt ??= atMs; prompts++; }
    if (type === 'choice.required') {
      if (!CATEGORIES.has(event.category)) invalid();
      counts[event.category]++;
    }
    if (type === 'question.repeated') repeatedQuestions++;
    if (type === 'observer.helped') observerHelp++;
    if (type === 'work.started' || type === 'work.resumed') {
      if (type === 'work.started' && work !== 'idle' || type === 'work.resumed' && work !== 'waiting' || firstPrompt === null) invalid();
      work = 'working'; workSeen = true; activeSince = atMs; quietSince = atMs; intervals++;
    }
    if (type === 'work.paused') {
      if (work !== 'working') invalid();
      closeWork(atMs); work = 'waiting';
    }
    if (type === 'work.ended') {
      if (work === 'idle') invalid();
      closeWork(atMs); work = 'idle';
    }
    if (type === 'activity.visible' && work === 'working') closeQuiet(atMs);
    if (type === 'preview.verified') {
      if (firstPrompt === null) invalid();
      firstPreview ??= atMs;
    }
    if (TERMINAL.has(type)) {
      if (type === 'study.completed' && (firstPreview === null || work !== 'idle')) invalid();
      closeWork(atMs); outcome = TERMINAL.get(type); terminal = true;
    }
  }

  const end = options.observedThroughMs ?? (terminal ? last : null);
  if (!time(end) || end < last || terminal && end !== last) invalid();
  const activeAtEnd = !terminal && work === 'working';
  if (!terminal) closeWork(end);
  return {
    schemaVersion: 1,
    outcome,
    observedDurationMs: end,
    prompts,
    requiredChoices: { total: Object.values(counts).reduce((sum, count) => sum + count, 0), byCategory: counts },
    repeatedQuestions,
    observerHelp,
    firstPreview: {
      status: firstPreview === null ? 'not-observed' : 'observed',
      elapsedMs: firstPreview,
      fromFirstPromptMs: firstPreview === null ? null : firstPreview - firstPrompt,
      observedForMs: end,
      censored: firstPreview === null,
      censorReason: firstPreview === null ? outcome : null,
    },
    activity: {
      available: workSeen,
      workingMs: workSeen ? workingMs : null,
      longestSilenceMs: workSeen ? maxQuietMs : null,
      silenceExcessMs: workSeen ? excessQuietMs : null,
      silenceThresholdMs,
      workingIntervals: intervals,
      censored: activeAtEnd,
    },
  };
}

module.exports = { summarizeFeedbackSession, EVENT_TYPES, CHOICE_CATEGORIES };
