// SPDX-License-Identifier: EUPL-1.2
// A factual total for the activity status line: the number of steps with a
// measured start and end, and the sum of those durations. This is time spent
// in tools, not wall-clock time for the task, and the wording says so.
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.ActivitySummary = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function summarize(entries) {
    let steps = 0, ms = 0;
    for (const entry of entries || []) {
      if (!entry || !Number.isFinite(entry.started) || !Number.isFinite(entry.ended) || entry.ended < entry.started) continue;
      steps++; ms += entry.ended - entry.started;
    }
    return { steps, ms };
  }
  function duration(ms) {
    const seconds = Math.round(ms / 1000);
    if (seconds < 1) return 'under 1 s';
    if (seconds < 60) return `${seconds} s`;
    const rest = seconds % 60;
    return `${Math.floor(seconds / 60)} min${rest ? ` ${rest} s` : ''}`;
  }
  function text(summary) {
    if (!summary || !summary.steps) return '';
    return `${summary.steps} trin · ${duration(summary.ms)} i værktøjer`;
  }
  return Object.freeze({ summarize, duration, text });
});
