const { test } = require('node:test');
const assert = require('node:assert/strict');
const { format } = require('../ui/status-line.js');

const measured = value => ({ selected: { modelID: 'synthetic' }, speed: { known: true, value, stepCount: 2 } });
test('large observed speeds use unambiguous compact Danish values', () => {
  assert.equal(format(measured(1232)).speed, '1,2k tok/s');
  assert.equal(format(measured(662636)).speed, '662,6k tok/s');
  assert.equal(format(measured(229)).speed, '229 tok/s');
});
test('the tooltip retains the exact observed integer without thousands grouping', () => {
  const result = format(measured(1232));
  assert.ok(result.tooltip.some(line => line.includes('1232 tok/s')));
  assert.ok(result.tooltip.every(line => !line.includes('1.232 tok/s')));
});
