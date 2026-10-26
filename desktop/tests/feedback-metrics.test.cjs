'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeFeedbackSession } = require('../core/feedback-metrics.cjs');
const events = rows => rows.map(([type, atMs, category], sequence) => ({ sequence, type, atMs, ...(category ? { category } : {}) }));

test('measures the verified preview and counts actual required choices by category', () => {
  const input = events([
    ['study.started', 0], ['choice.required', 100, 'data'], ['prompt.submitted', 1000],
    ['work.started', 1200], ['activity.visible', 1400], ['choice.required', 2000, 'plan'],
    ['work.paused', 2100], ['question.repeated', 2200], ['observer.helped', 3000],
    ['work.resumed', 5000], ['activity.visible', 25000], ['work.ended', 30000],
    ['preview.verified', 35000], ['study.completed', 40000],
  ]);
  const before = JSON.stringify(input);
  const result = summarizeFeedbackSession(input);
  assert.equal(result.outcome, 'completed');
  assert.deepEqual(result.firstPreview, { status: 'observed', elapsedMs: 35000, fromFirstPromptMs: 34000, observedForMs: 40000, censored: false, censorReason: null });
  assert.equal(result.requiredChoices.total, 2);
  assert.equal(result.requiredChoices.byCategory.data, 1);
  assert.equal(result.requiredChoices.byCategory.plan, 1);
  assert.equal(result.repeatedQuestions, 1);
  assert.equal(result.observerHelp, 1);
  assert.deepEqual(result.activity, { available: true, workingMs: 25900, longestSilenceMs: 20000, silenceExcessMs: 5000, silenceThresholdMs: 15000, workingIntervals: 2, censored: false });
  assert.equal(JSON.stringify(input), before);
});

test('excludes time spent waiting for a user from model working silence', () => {
  const result = summarizeFeedbackSession(events([
    ['study.started', 0], ['prompt.submitted', 0], ['work.started', 0],
    ['work.paused', 2000], ['activity.visible', 100000], ['work.resumed', 500000],
    ['work.ended', 502000], ['preview.verified', 502000], ['study.completed', 502000],
  ]));
  assert.equal(result.activity.workingMs, 4000);
  assert.equal(result.activity.longestSilenceMs, 2000);
  assert.equal(result.activity.silenceExcessMs, 0);
});

test('unfinished work remains censored and is never reported as a successful preview', () => {
  const result = summarizeFeedbackSession(events([
    ['study.started', 0], ['prompt.submitted', 100], ['work.started', 200], ['activity.visible', 1000],
  ]), { observedThroughMs: 31000 });
  assert.equal(result.outcome, 'incomplete');
  assert.equal(result.firstPreview.elapsedMs, null);
  assert.equal(result.firstPreview.censored, true);
  assert.equal(result.firstPreview.censorReason, 'incomplete');
  assert.equal(result.activity.longestSilenceMs, 30000);
  assert.equal(result.activity.censored, true);
});

test('failure and user stop remain distinct even without a preview', () => {
  for (const outcome of ['failed', 'stopped']) {
    const result = summarizeFeedbackSession(events([
      ['study.started', 0], ['prompt.submitted', 100], ['work.started', 200], [`study.${outcome}`, 10200],
    ]));
    assert.equal(result.outcome, outcome);
    assert.equal(result.firstPreview.elapsedMs, null);
    assert.equal(result.firstPreview.censorReason, outcome);
    assert.equal(result.activity.workingMs, 10000);
    assert.equal(result.activity.censored, false);
  }
});

test('absence of working evidence is unknown, not zero latency', () => {
  const result = summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', 5000]]));
  assert.equal(result.activity.available, false);
  assert.equal(result.activity.workingMs, null);
  assert.equal(result.activity.longestSilenceMs, null);
  assert.equal(result.firstPreview.elapsedMs, null);
});

test('keeps the first verified preview across later revisions and work intervals', () => {
  const result = summarizeFeedbackSession(events([
    ['study.started', 0], ['prompt.submitted', 500], ['work.started', 600], ['work.ended', 2000],
    ['preview.verified', 3000], ['prompt.submitted', 4000], ['work.started', 4100],
    ['work.ended', 5000], ['preview.verified', 5500], ['study.completed', 6000],
  ]));
  assert.equal(result.firstPreview.elapsedMs, 3000);
  assert.equal(result.firstPreview.fromFirstPromptMs, 2500);
  assert.equal(result.prompts, 2);
  assert.equal(result.activity.workingIntervals, 2);
});

test('rejects private or unexpected fields and does not echo their contents', () => {
  for (const field of ['prompt', 'name', 'apiKey', 'path', 'question', 'id']) {
    const input = events([['study.started', 0], ['study.stopped', 1]]);
    input[0][field] = 'PRIVATE_CANARY';
    assert.throws(() => summarizeFeedbackSession(input), error => error instanceof TypeError && !error.message.includes('PRIVATE_CANARY'));
  }
  assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['choice.required', 1, 'PRIVATE_CANARY'], ['study.stopped', 2]])), /Invalid feedback observation/);
  const result = summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', 1]]));
  assert.equal(JSON.stringify(result).includes('PRIVATE_CANARY'), false);
});

test('rejects replayed sequence numbers, reversed time and post-terminal events', () => {
  const duplicate = events([['study.started', 0], ['choice.required', 1, 'data'], ['study.stopped', 2]]);
  duplicate[2] = { ...duplicate[1] };
  assert.throws(() => summarizeFeedbackSession(duplicate, { observedThroughMs: 3 }));
  assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['prompt.submitted', 50], ['study.stopped', 10]])));
  assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', 10], ['prompt.submitted', 20]])));
});

test('requires an explicit observation horizon if no terminal event exists', () => {
  const input = events([['study.started', 0], ['prompt.submitted', 10]]);
  assert.throws(() => summarizeFeedbackSession(input));
  assert.throws(() => summarizeFeedbackSession(input, { observedThroughMs: 9 }));
  assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', 10]]), { observedThroughMs: 20 }));
  assert.throws(() => summarizeFeedbackSession(input, { observedThroughMs: 20, user: 'PRIVATE_CANARY' }));
});

test('rejects impossible lifecycle transitions and unsupported timestamp values', () => {
  const broken = [
    [['study.started', 1]],
    [['study.started', 0], ['study.started', 1]],
    [['study.started', 0], ['work.started', 1]],
    [['study.started', 0], ['work.paused', 1]],
    [['study.started', 0], ['work.resumed', 1]],
    [['study.started', 0], ['work.ended', 1]],
    [['study.started', 0], ['preview.verified', 1]],
    [['study.started', 0], ['study.completed', 1]],
    [['study.started', 0], ['prompt.submitted', 1], ['work.started', 2], ['work.started', 3]],
    [['study.started', 0], ['prompt.submitted', 1], ['work.started', 2], ['preview.verified', 3], ['study.completed', 4]],
  ];
  for (const rows of broken) assert.throws(() => summarizeFeedbackSession(events(rows), { observedThroughMs: 5 }));
  for (const atMs of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', atMs]])));
  }
});

test('counts only explicitly observed progress, with an adjustable analysis threshold', () => {
  const result = summarizeFeedbackSession(events([
    ['study.started', 0], ['prompt.submitted', 0], ['work.started', 0],
    ['activity.visible', 1000], ['activity.visible', 1000], ['work.ended', 6000], ['study.stopped', 6000],
  ]), { silenceThresholdMs: 2000 });
  assert.equal(result.activity.longestSilenceMs, 5000);
  assert.equal(result.activity.silenceExcessMs, 3000);
  assert.throws(() => summarizeFeedbackSession(events([['study.started', 0], ['study.stopped', 1]]), { silenceThresholdMs: 0 }));
});

test('CLI analyzes stdin offline and emits only the aggregate JSON', () => {
  const { spawnSync } = require('node:child_process');
  const cli = require('node:path').join(__dirname, '../scripts/analyze-feedback.cjs');
  const result = spawnSync(process.execPath, [cli, '-', '--observed-through-ms', '12000'], {
    input: JSON.stringify(events([['study.started', 0], ['prompt.submitted', 1000], ['work.started', 1100]])), encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const summary = JSON.parse(result.stdout);
  assert.equal(summary.outcome, 'incomplete');
  assert.equal(summary.firstPreview.elapsedMs, null);
  assert.equal(summary.activity.workingMs, 10900);
  assert.equal(Object.hasOwn(summary, 'events'), false);
});

test('CLI rejects malformed/private input and unknown flags without echoing values or paths', () => {
  const { spawnSync } = require('node:child_process');
  const cli = require('node:path').join(__dirname, '../scripts/analyze-feedback.cjs');
  for (const [args, input] of [
    [['-'], 'PRIVATE_CANARY'],
    [['-'], JSON.stringify([{ sequence: 0, type: 'study.started', atMs: 0, prompt: 'PRIVATE_CANARY' }])],
    [['-', '--recipient', 'PRIVATE_CANARY'], '[]'],
    [['/nonexistent/PRIVATE_CANARY.json'], ''],
  ]) {
    const result = spawnSync(process.execPath, [cli, ...args], { input, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr.includes('PRIVATE_CANARY'), false);
    assert.match(result.stderr, /Målingen kunne ikke læses/);
  }
});
