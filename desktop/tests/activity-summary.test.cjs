// SPDX-License-Identifier: EUPL-1.2
// The activity status line adds a factual total: how many steps have a measured
// duration and the sum of those durations. It is tool time, not wall-clock time,
// and the wording says so. Steps without both timestamps are not counted.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const summary = require('../ui/activity-summary.js');
const ui = path.join(__dirname, '..', 'ui');

test('only steps with a measured start and end are counted', () => {
  const entries = [
    { id: 'a', started: 1000, ended: 3000 },
    { id: 'b', started: 3000, ended: 3400 },
    { id: 'waiting', started: 5000 },
    { id: 'backwards', started: 9000, ended: 8000 },
    { id: 'text', started: '1', ended: '2' },
    null,
  ];
  assert.deepEqual(summary.summarize(entries), { steps: 2, ms: 2400 });
  assert.deepEqual(summary.summarize(new Map([['a', { started: 0, ended: 61000 }]]).values()), { steps: 1, ms: 61000 });
  assert.deepEqual(summary.summarize(undefined), { steps: 0, ms: 0 });
});

test('the wording names tool time and stays empty without measured steps', () => {
  assert.equal(summary.text({ steps: 0, ms: 0 }), '');
  assert.equal(summary.text({ steps: 1, ms: 400 }), '1 trin · under 1 s i værktøjer');
  assert.equal(summary.text({ steps: 4, ms: 4000 }), '4 trin · 4 s i værktøjer');
  assert.equal(summary.text({ steps: 12, ms: 125000 }), '12 trin · 2 min 5 s i værktøjer');
  assert.equal(summary.text({ steps: 3, ms: 120000 }), '3 trin · 2 min i værktøjer');
});

test('the status line uses the summary and the module is served', () => {
  assert.match(fs.readFileSync(path.join(ui, 'index.html'), 'utf8'), /<script src="activity-summary\.js" defer><\/script>/);
  assert.ok(require('../core/ui-assets.cjs').FILES.includes('activity-summary.js'));
  const workspace = fs.readFileSync(path.join(ui, 'workspace.js'), 'utf8');
  assert.match(workspace, /ActivitySummary\.text\(ActivitySummary\.summarize\(activity\.entries\.values\(\)\)\)/);
  assert.match(workspace, /Ingen opgave i gang/, 'the idle wording is unchanged');
});
