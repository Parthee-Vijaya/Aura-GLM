const { test } = require('node:test');
const assert = require('node:assert/strict');
const { progress, phase, activityEntry, activitySummary } = require('../ui/chat-display.js');
test('status skelner mellem svar, tavshed og brugerens godkendelse uden at opfinde tokens', () => {
  const v = { runStartedAt: 1000, lastSignalAt: 1000, receivedChars: 0, waitingFor: [] };
  assert.match(progress(v, 1100).text, /Venter på svar/);
  assert.deepEqual(progress(v, 17000), { quiet: true, text: 'Ingen nye signaler i 16 s. Du kan vente eller stoppe.' });
  v.lastSignalAt = 17000; v.receivedChars = 200;
  assert.deepEqual(progress(v, 18000), { quiet: false, text: '200 tegn modtaget' });
  v.waitingFor = [{}];
  assert.deepEqual(progress(v, 80000), { quiet: false, text: '' });
});
test('activity shows understandable action categories without commands, output or filenames', () => {
  const raw = { kind: 'tool', tool: 'bash', status: 'completed', title: 'Kør kommando', target: 'npm test && echo PRIVATE', output: 'PRIVATE output', started: 1000, ended: 2500, exit: 0 };
  const before = { ...raw }, shown = activityEntry(raw);
  assert.equal(shown.title, 'Har kørt et arbejdstrin');
  assert.equal(shown.completed, true); assert.equal(shown.elapsed, 1500);
  assert.doesNotMatch(JSON.stringify(shown), /npm|PRIVATE|bestået/);
  assert.deepEqual(raw, before); // Exact details remain available to the technical disclosure.
  const file = activityEntry({ kind: 'tool', tool: 'write', status: 'running', target: '/private/example.html' });
  assert.equal(file.title, 'Skriver en fil'); assert.equal(file.completed, false); assert.equal(file.elapsed, null);
  assert.doesNotMatch(JSON.stringify(file), /example|private/);
  assert.equal(phase({ modelProgress: { phase: 'tool', draft: { file: '/private/example.html' } } }), 'Forbereder en filændring …');
});
test('failed commands never receive a completed checkmark and counts use actual tool results', () => {
  const failed = { kind: 'tool', tool: 'bash', status: 'completed', exit: 1, started: 2000, ended: 1000 };
  assert.equal(activityEntry(failed).status, 'error'); assert.equal(activityEntry(failed).completed, false);
  assert.equal(activityEntry(failed).elapsed, null);
  assert.deepEqual(activitySummary([failed, { kind: 'tool', tool: 'read', status: 'completed' }, { kind: 'tool', tool: 'write', status: 'running' }, { kind: 'approval', status: 'allowed' }]), { total: 3, completed: 1, errors: 1 });
  for (const status of ['pending', 'running', 'waiting', 'allowed', 'stopped', 'error']) assert.equal(activityEntry({ kind: 'tool', tool: 'unknown', status }).completed, false);
});
test('ending a run without a tool result stops its indicator without inventing completion', () => {
  for (const status of ['pending', 'running', 'waiting']) {
    const entry = { kind: 'tool', tool: 'bash', status };
    const shown = activityEntry(entry, { finished: true });
    assert.equal(shown.status, 'stopped'); assert.equal(shown.completed, false);
    assert.match(shown.title, /ikke afsluttet/); assert.equal(entry.status, status);
  }
  assert.equal(activityEntry({ kind: 'tool', status: 'completed' }, { finished: true }).completed, true);
});
