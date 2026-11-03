// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Slash tokens in the composer (S2 of the GradientDeck UI/UX overhaul). The
// renderer inserts the token; the host re-validates BOTH inserted and
// hand-typed tokens from the exact message text right before anything is
// activated, so removing the token removes the activation. The token grammar
// lives in ui/slash-commands.js — one source shared with the popup, required
// here the same way chat-session requires conversation-mode — so the popup can
// never offer what the host refuses, and vice versa.
const shared = require('../ui/slash-commands.js');

// The ground-rules catalog entry is not a command: the rules always ship with
// every send and can never be switched off through a token.
const RULES = 'faelles-grundregler';

// Resolve the message's slash tokens against the project's skill catalog.
// Known skills become activations (in first-occurrence order, deduplicated).
// S3: /design is the claimed invocation alias of the ported GradientDeck
// skill (harness-design) — the alias resolves to the skill when it is in the
// catalog, and falls back to inert reserved text when it is not. Other
// reserved names (/stil, /style) and the ground rules never activate
// anything; unknown names stay inert message text for the model to read.
function resolve(text, skillsList) {
  const tokens = shared.parseTokens(typeof text === 'string' ? text : '');
  const known = new Map((Array.isArray(skillsList) ? skillsList : [])
    .filter(entry => entry?.id && entry.id !== RULES)
    .map(entry => [String(entry.id).toLowerCase(), entry]));
  const skills = [], invocations = [], unknown = [], reserved = [];
  const seen = new Set();
  for (const token of tokens) {
    const name = token.name;
    const entry = known.get(shared.tokenSkill(name) || name);
    if (!entry) {
      if (shared.RESERVED.includes(name)) { if (!reserved.includes(name)) reserved.push(name); }
      else if (!unknown.includes(name)) unknown.push(name);
      continue;
    }
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    skills.push(entry.id);
    invocations.push({ token: '/' + name, name: entry.id, title: entry.title || entry.id });
  }
  return { tokens, skills, invocations, unknown, reserved };
}

module.exports = { resolve, parseTokens: shared.parseTokens, tokenAt: shared.tokenAt, RESERVED: shared.RESERVED, SKILL_TOKENS: shared.SKILL_TOKENS, skillToken: shared.skillToken, tokenSkill: shared.tokenSkill, RULES };
