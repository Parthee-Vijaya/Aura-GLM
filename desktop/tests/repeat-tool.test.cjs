const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RepeatTool, key, THRESHOLDS } = require('../core/repeat-tool.cjs');

test('ens kald i træk tælles, og signalet kommer præcis ved tærsklerne 3, 5 og 8', () => {
  assert.deepEqual(THRESHOLDS, [3, 5, 8]);
  const guard = new RepeatTool();
  assert.equal(guard.observe('bash', { command: 'npm test' }), null);
  assert.equal(guard.observe('bash', { command: 'npm test' }), null);
  assert.deepEqual(guard.observe('bash', { command: 'npm test' }), { tool: 'bash', count: 3, level: 0 });
  assert.equal(guard.observe('bash', { command: 'npm test' }), null, 'samme tærskel annonceres kun én gang');
  assert.deepEqual(guard.observe('bash', { command: 'npm test' }), { tool: 'bash', count: 5, level: 1 });
  assert.equal(guard.observe('bash', { command: 'npm test' }), null);
  assert.equal(guard.observe('bash', { command: 'npm test' }), null);
  assert.deepEqual(guard.observe('bash', { command: 'npm test' }), { tool: 'bash', count: 8, level: 2 });
});

test('et kald med en anden signatur starter rækken forfra, og reset rydder alt', () => {
  const guard = new RepeatTool();
  for (let i = 0; i < 4; i++) guard.observe('bash', { command: 'npm test' });
  assert.equal(guard.observe('bash', { command: 'npm run build' }), null, 'ny signatur starter rækken forfra');
  assert.equal(guard.observe('bash', { command: 'npm run build' }), null);
  assert.deepEqual(guard.observe('bash', { command: 'npm run build' }), { tool: 'bash', count: 3, level: 0 });
  guard.observe('read', { filePath: '/x' });
  assert.equal(guard.observe('read', { filePath: '/x' }), null, 'skift af værktøj starter også forfra');
  assert.deepEqual(guard.observe('read', { filePath: '/x' }), { tool: 'read', count: 3, level: 0 });
  guard.reset();
  assert.equal(guard.observe('read', { filePath: '/x' }), null, 'efter reset tælles rækken fra nul');
});

test('nøglen er kanonisk: felter, mellemrum, store input og manglende input', () => {
  assert.equal(key('bash', { command: 'a  b', x: 1 }), key('bash', { x: 1, command: ' a b ' }));
  assert.notEqual(key('bash', { command: 'a' }), key('bash', { command: 'b' }));
  assert.notEqual(key('bash', { command: 'a' }), key('read', { command: 'a' }));
  const long = 'x'.repeat(500);
  assert.equal(key('bash', { command: long }).length < 400, true, 'langt input afkortes i nøglen');
  assert.doesNotThrow(() => key('bash', null));
  assert.doesNotThrow(() => key(null, { command: 'a' }));
});
