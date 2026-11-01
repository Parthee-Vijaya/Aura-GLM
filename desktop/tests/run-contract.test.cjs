const { test } = require('node:test');
const assert = require('node:assert/strict');
const { identity, outcome, succeeded, describeOutcome, evidence, commandEvidence } = require('../core/run-contract.cjs');

test('udfald normaliseres uden at opfinde felter, og ukendt forbliver ukendt', () => {
  assert.deepEqual(outcome({ exitCode: 0 }), { exitCode: 0, signal: null, timedOut: false, cancelled: false, durationMs: null });
  assert.deepEqual(outcome(), { exitCode: null, signal: null, timedOut: false, cancelled: false, durationMs: null, unknown: true });
  assert.equal(outcome({ exitCode: 'x' }).exitCode, null);
  assert.equal(outcome({ signal: 'SIGKILL' }).signal, 'SIGKILL');
  assert.equal(outcome({ signal: 'SIGKILL'.repeat(10) }).signal.length, 15, 'signalet afkortes');
  assert.equal(outcome({ durationMs: -5 }).durationMs, null);
  assert.deepEqual(outcome({ timedOut: 1, cancelled: 'ja' }), { exitCode: null, signal: null, timedOut: false, cancelled: false, durationMs: null, unknown: true });
});

test('kode 0 er kun en succes uden samtidig timeout, stop eller signal', () => {
  assert.equal(succeeded({ exitCode: 0 }), true);
  assert.equal(succeeded({ exitCode: 0, timedOut: true }), false);
  assert.equal(succeeded({ exitCode: 0, cancelled: true }), false);
  assert.equal(succeeded({ exitCode: 0, signal: 'SIGTERM' }), false);
  assert.equal(succeeded({ exitCode: 1 }), false);
  assert.equal(succeeded({}), false, 'ukendt udfald er aldrig en succes');
});

test('udfaldsteksterne er korte, danske og skelner alle fire fakta fra hinanden', () => {
  assert.equal(describeOutcome({ exitCode: 0 }), 'Afsluttet');
  assert.equal(describeOutcome({ exitCode: 1 }), 'Afsluttet med fejl (kode 1)');
  assert.equal(describeOutcome({ timedOut: true }), 'Tidsgrænse nået');
  assert.equal(describeOutcome({ cancelled: true, timedOut: true }), 'Stoppet af dig', 'brugerens stop vinder over timeout');
  assert.equal(describeOutcome({ signal: 'SIGKILL' }), 'Afbrudt af signal SIGKILL');
  assert.equal(describeOutcome({}), 'Udfald ukendt');
});

test('hændelsesidentitet kræver projekt, samtale og opgave som rene strenge', () => {
  const valid = identity({ root: '/projekt', chat: 'chat-1', task: 'task-9' });
  assert.deepEqual(valid, { root: '/projekt', chat: 'chat-1', task: 'task-9' });
  for (const bad of [undefined, {}, { root: '', chat: 'c', task: 't' }, { root: 'r', chat: 'c' }, { root: 'r', chat: 'c', task: 42 }, { root: 'r\n', chat: 'c', task: 't' }]) assert.throws(() => identity(bad));
});

test('bevisblokken tæller målinger og markerer manglende kilder som ukendte', () => {
  const full = evidence({ files: { count: 3, source: 'disk' }, commands: { run: 2, failed: 1 }, quality: { ran: true, findings: 0 } });
  assert.deepEqual(full, { files: { count: 3, source: 'disk' }, commands: { run: 2, failed: 1, unknown: false }, quality: { ran: true, unsupported: false, findings: 0 } });
  const empty = evidence();
  assert.equal(empty.files.count, null); assert.equal(empty.files.source, null);
  assert.equal(empty.commands.run, null); assert.equal(empty.quality.ran, false); assert.equal(empty.quality.findings, null);
  assert.equal(evidence({ files: { count: -1 } }).files.count, null);
  assert.equal(evidence({ commands: { run: 2, unknown: true } }).commands.unknown, true);
});

test('kommandobeviset tæller kun afsluttede kald og adskiller manglende exitkoder', () => {
  const part = (tool, status, exit) => ({ tool, state: { status, ...(Number.isInteger(exit) ? { metadata: { exit } } : {}) } });
  assert.deepEqual(commandEvidence([part('bash', 'completed', 0), part('bash', 'completed', 1), part('bash', 'error', 2)]), { run: 3, failed: 2, unknown: false });
  assert.deepEqual(commandEvidence([part('bash', 'completed', 0), part('bash', 'error')]), { run: 2, failed: 0, unknown: true }, 'en manglende exitkode gør udfaldet delvist ukendt');
  assert.deepEqual(commandEvidence([part('bash', 'running', 0), part('read', 'completed'), part('bash', 'pending')]), { run: 0, failed: 0, unknown: false }, 'kun afsluttede bash-kald tæller');
  assert.deepEqual(commandEvidence([]), { run: 0, failed: 0, unknown: false });
});

test('kvalitetsfakta skelner gennemført, ikke mulig og ikke kørt', () => {
  assert.deepEqual(evidence({ quality: { ran: true, findings: 2 } }).quality, { ran: true, unsupported: false, findings: 2 });
  assert.equal(evidence({ quality: { unsupported: true } }).quality.unsupported, true);
  assert.equal(evidence({ quality: { unsupported: true } }).quality.ran, false, 'ikke mulig er ikke gennemført');
  assert.equal(evidence().quality.unsupported, false);
});
