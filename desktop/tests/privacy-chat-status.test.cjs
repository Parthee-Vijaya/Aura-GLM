// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChatSession } = require('../core/chat-session.cjs');
const { Activity } = require('../core/activity.cjs');
const { ContextUsage } = require('../core/context-usage.cjs');

function fixture(overrides = {}) {
  const activity = new Activity();
  const chat = { bench: {}, running: true, runPrivacy: { mode: 'cloud-controlled' },
    runStopped: false, finishing: false, task: { id: 'synthetic-task' },
    plan: { id: 'approved-plan', text: 'Keep this approved plan.' },
    approvals: new Map([['pending-permission', { permission: 'edit' }]]),
    log: entry => activity.put(entry), ...overrides };
  return { chat, activity, send: properties => ChatSession.prototype.event.call(chat, { type: 'privacy.local-processing', properties }) };
}

test('actual local handoff is visible without granting tools, changing the plan or recording raw request data', () => {
  const f = fixture(), plan = f.chat.plan, approval = f.chat.approvals.get('pending-permission');
  f.send({ locality: 'device', model: 'Local model', connectionID: 'configured-local', body: 'PRIVATE_PROMPT_CANARY', secret: 'PRIVATE_SECRET_CANARY' });
  f.send({ locality: 'device', model: 'Local model' });
  const entries = f.activity.list();
  assert.equal(entries.length, 1); assert.match(entries[0].detail, /Denne computer · Local model/);
  assert.doesNotMatch(JSON.stringify(entries), /PRIVATE_PROMPT_CANARY|PRIVATE_SECRET_CANARY/);
  assert.equal(f.chat.plan, plan); assert.equal(f.chat.approvals.get('pending-permission'), approval);
});

test('late, unprotected and non-device events cannot announce local processing', () => {
  for (const overrides of [{ running: false }, { runStopped: true }, { finishing: true }, { runPrivacy: null }]) {
    const f = fixture(overrides); f.send({ locality: 'device', model: 'Local model' }); assert.deepEqual(f.activity.list(), []);
  }
  for (const locality of ['cloud', 'organization', undefined]) {
    const f = fixture(); f.send({ locality, model: 'Remote model' }); assert.deepEqual(f.activity.list(), []);
  }
});

test('mixed-stage context and cost use the actual model rather than the initial cloud selection', () => {
  const events = [], contextUsage = new ContextUsage();
  contextUsage.bind({ connectionID: 'cloud', modelID: 'cloud-model', sessionID: 'cloud-session', model: { limits: { context: 1000000 } } });
  const chat = { bench: {}, compacting: true, runPrivacy: { mode: 'hybrid' }, contextUsage,
    runSteps: new Map(), runPrice: { input: 10, output: 10, cacheRead: 10, cacheWrite: 10 },
    currentUsage: ChatSession.prototype.currentUsage, emit: event => events.push(event) };
  function step(id, selection, price) {
    ChatSession.prototype.event.call(chat, { type: 'message.part.updated', privacySelection: selection, privacyPrice: price,
      properties: { part: { id, type: 'step-finish', sessionID: 'wrapper-session', tokens: { input: 2000, output: 10, cache: { read: 0, write: 0 } } } } });
  }
  step('local-step', { connectionID: 'local', modelID: 'local-model', stageSessionID: 'local-session', contextWindow: 8000 }, null);
  assert.equal(contextUsage.snapshot().windowTokens, 8000);
  assert.equal(contextUsage.snapshot().percentage, 25);
  assert.equal(contextUsage.snapshot().binding.sessionID, 'local-session');
  assert.equal(events.at(-1).usage.cost, 0); assert.equal(events.at(-1).usage.unpriced, 1);
  step('cloud-step', { connectionID: 'cloud', modelID: 'cloud-model', stageSessionID: 'cloud-session', contextWindow: 1000000 }, { input: 10, output: 10, cacheRead: 10, cacheWrite: 10 });
  assert.equal(contextUsage.snapshot().percentage, 0.2);
  assert.equal(events.at(-1).usage.calls, 2); assert.equal(events.at(-1).usage.cost, 0.0201);
  step('unknown-step', undefined, null);
  assert.equal(contextUsage.snapshot().windowTokens, null); assert.equal(contextUsage.snapshot().percentage, null);
});

test('ordinary runs retain the existing context binding without privacy metadata', () => {
  const contextUsage = new ContextUsage();
  contextUsage.bind({ modelID: 'ordinary', sessionID: 'ordinary-session', model: { limits: { context: 16000 } } });
  const chat = { bench: {}, compacting: true, contextUsage, runSteps: new Map(), currentUsage: ChatSession.prototype.currentUsage, emit() {} };
  ChatSession.prototype.event.call(chat, { type: 'message.part.updated', properties: { part: { id: 'ordinary-step', type: 'step-finish', tokens: { input: 4000, cache: { read: 0, write: 0 } } } } });
  assert.equal(contextUsage.snapshot().percentage, 25);
  assert.equal(contextUsage.snapshot().binding.sessionID, 'ordinary-session');
});
