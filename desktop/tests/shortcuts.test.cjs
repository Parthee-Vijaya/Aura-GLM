const { test } = require('node:test');
const assert = require('node:assert/strict');
const { decide, TABS } = require('../ui/shortcuts.js');

// Beslutningen er ren: genvej + tilstand → handling. Stop kræver en kørende opgave,
// dialoger/popovers spærrer navigationen, og en skjult Plan-fane giver ingen handling.
test('stop virker kun, når en opgave kører', () => {
  assert.equal(decide('stop', { running: true }), 'stop');
  assert.equal(decide('stop', { running: false, overlay: false }), null);
  assert.equal(decide('stop', { running: true, overlay: true }), 'stop', 'Stop består også over en åben dialog');
});

test('navigationsgenveje spærres af åbne dialoger og popovers', () => {
  assert.equal(decide('composer', { running: false, overlay: true }), null);
  assert.equal(decide('composer', { running: false, overlay: false }), 'composer');
  assert.equal(decide('model', { running: false, overlay: true }), null);
  assert.equal(decide('model', { running: false, overlay: false }), 'model');
  assert.equal(decide('tab-1', { running: false, overlay: true, hiddenTab: null }), null);
});

test('fanegenerøjerne følger den faste rækkefølge; en skjult Plan-fane giver ingen handling', () => {
  assert.deepEqual(TABS, { '1': 'preview', '2': 'plan', '3': 'changes', '4': 'code', '5': 'activity' });
  assert.equal(decide('tab-1', { running: false, overlay: false, hiddenTab: null }), 'tab:preview');
  assert.equal(decide('tab-5', { running: false, overlay: false, hiddenTab: null }), 'tab:activity');
  assert.equal(decide('tab-2', { running: false, overlay: false, hiddenTab: 'plan' }), null, 'Plan er skjult i Samtale');
  assert.equal(decide('tab-2', { running: false, overlay: false, hiddenTab: null }), 'tab:plan');
  assert.equal(decide('tab-9', { running: false, overlay: false, hiddenTab: null }), null);
  assert.equal(decide('ukendt', { running: false, overlay: false }), null);
});
