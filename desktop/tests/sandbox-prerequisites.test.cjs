const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sandboxPrerequisiteReason } = require('./helpers/sandbox-prerequisites.cjs');

test('native prerequisites refuse unqualified Linux command retirement without probing tools', async () => {
  assert.match(await sandboxPrerequisiteReason({ platform: 'linux', canExecute: async () => { throw Error('must not probe'); } }), /ikke kvalificeret.*linux/);
});
test('native prerequisites identify unsupported platforms and the Mac launcher', async () => {
  assert.match(await sandboxPrerequisiteReason({ platform: 'win32', canExecute: async () => { throw Error('must not probe'); } }), /win32/);
  assert.match(await sandboxPrerequisiteReason({ platform: 'darwin', canExecute: async () => false }), /sandbox-exec/);
  assert.equal(await sandboxPrerequisiteReason({ platform: 'darwin', canExecute: async file => file === '/usr/bin/sandbox-exec' }), null);
});
test('unexpected probe errors fail rather than becoming a skip', async () => {
  await assert.rejects(sandboxPrerequisiteReason({ platform: 'darwin', canExecute: async () => { throw Error('unexpected probe failure'); } }), /unexpected probe failure/);
});
test('the real filesystem probe preserves I/O errors rather than skipping isolation', async t => {
  t.mock.method(require('node:fs/promises'), 'access', async () => { throw Object.assign(new Error('Synthetic I/O failure'), { code: 'EIO' }); });
  await assert.rejects(sandboxPrerequisiteReason({ platform: 'darwin' }), { code: 'EIO' });
});
