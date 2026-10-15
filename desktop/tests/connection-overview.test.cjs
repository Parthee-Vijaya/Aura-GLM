const test = require('node:test');
const assert = require('node:assert/strict');
const { tracker, page } = require('../ui/connection-overview.js');

test('en gammel kontrol kan hverken overskrive en ny fejl eller genoplive en fjernet forbindelse', () => {
  const checks = tracker();
  const first = checks.begin('a'), second = checks.begin('a');
  assert.equal(checks.finish('a', second, { status: 'error', detail: 'Adgang afvist' }), true);
  assert.equal(checks.finish('a', first, { status: 'ready', count: 4 }), false);
  assert.equal(checks.get('a').status, 'error');
  const third = checks.begin('a'); checks.clear('a');
  assert.equal(checks.finish('a', third, { status: 'ready', count: 4 }), false);
  assert.equal(checks.get('a'), undefined);
});

test('kontroller tilhører én appsession og holdes adskilt mellem forbindelser', () => {
  const checks = tracker(), a = checks.begin('a'), b = checks.begin('b');
  checks.finish('a', a, { status: 'ready', count: 2 });
  checks.finish('b', b, { status: 'empty', count: 0 });
  assert.equal(checks.get('a').count, 2); assert.equal(checks.get('b').status, 'empty');
  assert.ok(checks.get('a').checkedAt); assert.equal(tracker().get('a'), undefined);
});

test('ti forbindelser vises fire ad gangen og kan findes på navn, udbyder og organisation', () => {
  const connections = Array.from({ length: 10 }, (_, i) => ({ id: String(i), name: `Konto ${i}`, kind: i === 9 ? 'komplai' : 'compatible', ...(i === 9 ? { account: { organisationName: 'Demokommune' } } : {}) }));
  const definitions = { komplai: { name: 'Komplai' }, compatible: { name: 'Egen server' } };
  assert.equal(page(connections, definitions).items.length, 4);
  assert.equal(page(connections, definitions, '', 2).items.length, 2);
  assert.equal(page(connections, definitions, '', 30).index, 2);
  for (const query of [' KOMPLAI ', 'demokommune', 'Konto 9']) assert.deepEqual(page(connections, definitions, query, 2).items.map(c => c.id), ['9']);
  assert.equal(page(connections, definitions, 'findes ikke').total, 0);
  assert.deepEqual(page([], definitions).items, []);
});
