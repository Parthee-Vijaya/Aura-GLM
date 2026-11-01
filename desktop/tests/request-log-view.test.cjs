const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../ui/request-log-view.js');

test('én journalpost bliver til tekst med klokkeslæt, modtager, omfang og kilder', () => {
  const line = describe({ at: '2026-11-01T14:03:12.000Z', recipient: { model: 'corti-s1', route: null }, request: { bytes: 12345, sha256: 'a'.repeat(64), messages: 4 }, items: [{ source: 'user', bytes: 100 }, { source: 'system', bytes: 200 }, { source: 'user', bytes: 50 }] });
  assert.equal(line.time, '14:03');
  assert.equal(line.label, 'corti-s1 · 4 beskeddele · 12,1 kB');
  assert.equal(line.detail, 'Kilder: bruger, systemprompt');
  const few = describe({ at: '2026-11-01T09:00:00.000Z', recipient: { model: 'm1' }, request: { bytes: 300, messages: 1 }, items: [{ source: 'user', bytes: 300 }] });
  assert.equal(few.label, 'm1 · 1 beskeddel · 1 kB');
  assert.equal(few.detail, 'Kilder: bruger');
});

test('manglende fakta bliver til ærlig tekst, og ulæselige poster afvises', () => {
  const unknown = describe({ at: 'ikke et tidspunkt', recipient: {}, request: {} });
  assert.equal(unknown.time, '');
  assert.equal(unknown.label, 'ukendt model · ukendt størrelse');
  assert.equal(unknown.detail, 'Ingen dele registreret');
  assert.equal(describe(null), null);
  assert.equal(describe('x'), null);
});
