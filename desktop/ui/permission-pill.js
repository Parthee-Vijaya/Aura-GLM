// SPDX-License-Identifier: EUPL-1.2
// The permission pill's honest summary (D2+D3, Codex R1).
//
// The pill is a SUMMARY, not a rule. The work mode decides which actions can
// come up at all; approval is decided by the conversation's YOLO choice, the
// project's rules, the task's already-given permissions and the active
// technical boundary (core/approvals-policy.cjs allowed(): taskRules,
// autoProjectFiles, sandboxed auto commands, saved concrete rules and folder
// rules). The renderer cannot see those per-task grants, so under Build the
// pill reads "Projektets tilladelser" — never a claim that every change will
// ask. "Kun læsning" is exact for Samtale and Planlæg: those modes block
// writes and commands outright (blockedMode in approvals-policy.cjs), with
// or without YOLO.
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.PermissionPill = api;
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  const READ = 'read', BUILD = 'build', YOLO = 'yolo';
  const labels = Object.freeze({ read: 'Kun læsning', build: 'Projektets tilladelser', yolo: 'YOLO · kun denne samtale' });
  const explanations = Object.freeze({
    read: 'Samtale og Planlæg kan læse relevante projektfiler. AI\u2019en \u00e6ndrer ingen filer og k\u00f8rer ingen kommandoer.',
    build: 'Under Byg godkender du hver handling \u2014 medmindre projektets regler, opgavens tilladelser eller en gemt regel allerede tillader den.',
    yolo: 'YOLO er sl\u00e5et til i denne samtale: almindelige v\u00e6rkt\u00f8jshandlinger under Byg kr\u00e6ver ikke nye godkendelser. Planer, dataregler og beskyttede filer g\u00e6lder stadig.'
  });
  function summary(mode, { active = false } = {}) {
    const build = mode === 'free' || mode === 'build';
    const tone = !build ? READ : active ? YOLO : BUILD;
    return {
      label: labels[tone],
      tone,
      explanation: explanations[tone],
      // R1: deactivation never disappears. An armed YOLO can be revoked from
      // any mode (also Samtale/Planlæg, where the mode menu's Build point
      // would be hidden); the activation point exists only under Build —
      // exactly like the review dialog it opens.
      yolo: active ? 'disable' : build ? 'enable' : 'none'
    };
  }
  return Object.freeze({ summary });
});
