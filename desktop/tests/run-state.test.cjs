const { test } = require('node:test');
const assert = require('node:assert/strict');
const { derive, badgeClass, KEYS } = require('../ui/run-state.js');

// Én statusafledning: alle forbrugere rammes af de samme regler, og badge-farven følger
// tilstanden — ikke en gætten på den danske tekst, som gjorde 'Stoppet' rødt før.
const base = { running: false, waitingFor: [], runLabel: '', statusDetail: '' };

test('prioriteten er: venter på dig → gendannelse → arbejde → afslutning → klar', () => {
  assert.deepEqual(derive(null), { key: 'idle', label: 'Klar', detail: '' });
  assert.equal(derive(base).key, 'idle');
  assert.equal(derive({ ...base, running: true }).key, 'working');
  assert.equal(derive({ ...base, running: true, runLabel: 'Starter motoren' }).label, 'Starter motoren');
  assert.equal(derive({ ...base, running: true, waitingFor: [{ title: 'Filændring' }] }).key, 'waiting');
  assert.equal(derive({ ...base, running: true, recovery: 'Tredje forsøg' }).key, 'recovering');
  assert.equal(derive({ ...base, running: true, waitingFor: [{ title: 'Godkendelse' }], recovery: 'x' }).key, 'waiting', 'venten vinder over gendannelse');
});

test('seneste resultatkort bestemmer afslutningen, når turen er slut', () => {
  assert.equal(derive({ ...base, lastReview: { status: 'completed' } }).key, 'done');
  assert.equal(derive({ ...base, lastReview: { status: 'stopped' } }).key, 'stopped');
  assert.equal(derive({ ...base, lastReview: { status: 'rejected' } }).key, 'stopped');
  const failure = derive({ ...base, lastReview: { status: 'error', failure: { kind: 'timeout' } } });
  assert.equal(failure.key, 'error'); assert.equal(failure.detail, 'Tidsgrænsen blev nået');
  assert.equal(derive({ ...base, lastReview: { status: 'error' } }).detail, '');
  // En afslutning overstyrer aldrig en kørende tur.
  assert.equal(derive({ ...base, running: true, lastReview: { status: 'completed' } }).key, 'working');
});

test('badge-klassen følger tilstanden, ikke teksten', () => {
  assert.equal(badgeClass({ ...base, running: true, runLabel: 'Arbejder' }), 'run-working');
  assert.equal(badgeClass({ ...base, running: true, waitingFor: [{ title: 'x' }] }), 'run-working', 'venten er aktivt arbejde');
  assert.equal(badgeClass({ ...base, lastReview: { status: 'stopped' } }), 'run-stopped', 'Stoppet er ikke en fejl');
  assert.equal(badgeClass({ ...base, lastReview: { status: 'error' } }), 'run-error');
  assert.equal(badgeClass({ ...base, lastReview: { status: 'completed' } }), 'run-idle');
  assert.equal(badgeClass(base), 'run-idle');
  assert.deepEqual(KEYS, ['idle', 'working', 'waiting', 'recovering', 'done', 'stopped', 'error']);
});
