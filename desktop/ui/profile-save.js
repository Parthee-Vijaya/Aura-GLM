// SPDX-License-Identifier: EUPL-1.2
// One shared save queue for every renderer writer of the profile. main.cjs's
// exclusive() rejects overlapping profile writes, so the theme button, the
// panel toggle and the settings dialog must wait for each other instead of
// racing — a rejected save would leave the screen and the profile apart with
// the error swallowed. The module also owns the aura:profile-saved
// announcement used by the workspace writers, so the app.js cache and the
// sidebar chip follow every successful save without a restart.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.profileSaveQueued = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  let chain = Promise.resolve();
  // One task at a time, in call order; a failed task never blocks the next,
  // and the returned promise carries the task's own outcome.
  function queued(task) {
    const run = chain.then(task, task);
    chain = run.catch(() => {});
    return run;
  }
  // The canonical profile is announced on the document, so listeners on the
  // window (app.js's cache, the sidebar chip) receive it through bubbling.
  function saved(profile) {
    try { (root.document || root).dispatchEvent(new CustomEvent('aura:profile-saved', { detail: profile, bubbles: true })); }
    catch { /* a missing event target never blocks a save */ }
  }
  return Object.freeze({ queued, saved });
});
