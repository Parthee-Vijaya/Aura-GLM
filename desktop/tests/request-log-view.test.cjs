const { test } = require('node:test');
const assert = require('node:assert/strict');
const { describe } = require('../ui/request-log-view.js');

test('én journalpost bliver til tekst med klokkeslæt, modtager, omfang og kilder', () => {
  const line = describe({ at: '2026-11-01T14:03:12.000Z', recipient: { model: 'corti-s1', route: null }, request: { bytes: 12345, sha256: 'a'.repeat(64), messages: 4 }, items: [{ source: 'user', bytes: 100 }, { source: 'system', bytes: 200 }, { source: 'user', bytes: 50 }] });
  assert.equal(line.time, '14:03');
  assert.equal(line.label, 'corti-s1 · 4 beskeddele · 12,1 kB');
  assert.equal(line.detail, 'Kilder: bruger, systemprompt · ikke kontrolleret');
  const few = describe({ at: '2026-11-01T09:00:00.000Z', recipient: { model: 'm1' }, request: { bytes: 300, messages: 1 }, items: [{ source: 'user', bytes: 300 }] });
  assert.equal(few.label, 'm1 · 1 beskeddel · 1 kB');
  assert.equal(few.detail, 'Kilder: bruger · ikke kontrolleret');
});

test('manglende fakta bliver til ærlig tekst, og ulæselige poster afvises', () => {
  const unknown = describe({ at: 'ikke et tidspunkt', recipient: {}, request: {} });
  assert.equal(unknown.time, '');
  assert.equal(unknown.label, 'ukendt model · ukendt størrelse');
  assert.equal(unknown.detail, 'Ingen dele registreret · ikke kontrolleret');
  assert.equal(describe(null), null);
  assert.equal(describe('x'), null);
});

test('gatens kontrolstatus vises pr. kald', () => {
  const controlled = describe({ at: '2026-11-01T12:00:00.000Z', recipient: { model: 'm1' }, request: { bytes: 200, messages: 1 }, items: [{ source: 'user', bytes: 200 }], gate: { requestId: 'r-1', decision: 'allow', approvedBy: 'user', classification: 'internal' } });
  assert.match(controlled.detail, /kontrolleret/);
  assert.match(controlled.detail, /godkendt af dig/);
  assert.match(controlled.detail, /internal/);
  const rewritten = describe({ at: '2026-11-01T12:00:00.000Z', recipient: { model: 'm1' }, request: { bytes: 200, messages: 1 }, items: [], gate: { requestId: 'r-2', decision: 'rewrite', approvedBy: 'policy', classification: 'public' } });
  assert.match(rewritten.detail, /omskrevet/);
  assert.match(rewritten.detail, /automatisk tilladt/);
  assert.doesNotMatch(rewritten.detail, /public/, 'offentligt indhold vises ikke som klassifikation');
  const off = describe({ at: '2026-11-01T12:00:00.000Z', recipient: { model: 'm1' }, request: { bytes: 200, messages: 1 }, items: [] });
  assert.match(off.detail, /ikke kontrolleret/);
});
