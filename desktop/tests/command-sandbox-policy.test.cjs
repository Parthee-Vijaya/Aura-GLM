const { test: nativeTest } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const policy = require('../core/command-sandbox-policy.cjs');
const supported = ['darwin', 'linux'].includes(process.platform);
const test = (name, fn) => nativeTest(name, { skip: supported ? false : 'Command isolation is supported only on macOS and Linux; no unsecured Windows fallback.' }, fn);

nativeTest('Windows policy creation remains unsupported without a fallback', () => {
  assert.throws(() => policy.createPolicy({ workspaceRoot: 'C:\\project', scratchRoot: 'C:\\scratch', node: 'C:\\node.exe', platform: 'win32' }), { code: 'AURA_SANDBOX_POLICY_INVALID' });
});

const roots = { workspaceRoot: '/tmp/aura-policy/project', scratchRoot: '/tmp/aura-policy/scratch', node: '/opt/aura/node/bin/node' };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-policy-boundary-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'policy.json');
  const value = policy.createPolicy(roots);
  await fs.writeFile(file, JSON.stringify(value), { mode: 0o600 });
  return { directory, file, value };
}

test('current policy retains exact package hosts, literal filesystem roots and protected paths', () => {
  for (const platform of ['darwin', 'linux']) {
    const value = policy.createPolicy({ ...roots, platform });
    assert.equal(policy.validatePolicy(value, { platform }), value);
    assert.deepEqual(value.config.network, { allowedDomains: ['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org'], deniedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowUnixSockets: [], allowAllUnixSockets: false });
    assert.deepEqual(value.config.filesystem.allowWrite, [{ path: roots.workspaceRoot, literal: true }, { path: roots.scratchRoot, literal: true }]);
    assert.ok(value.config.filesystem.denyRead.some(entry => entry.includes('[kK][uU][bB][eE]')));
    assert.equal(value.config.allowPty, false);
    assert.equal(value.config.enableWeakerNestedSandbox, false);
    assert.equal(value.config.enableWeakerNetworkIsolation, false);
    assert.equal(value.env.HOME, path.join(roots.scratchRoot, 'home'));
  }
});

test('every unused SRT option is rejected instead of silently stripped', () => {
  const changes = [
    value => { value.config.network.tlsTerminate = {}; },
    value => { value.config.network.mitmProxy = { socketPath: '/private/SENSITIVE' }; },
    value => { value.config.network.parentProxy = { http: 'https://SECRET@example.invalid' }; },
    value => { value.config.network.decider = { fd: 3 }; },
    value => { value.config.credentials = { env: { SECRET: 'secret' } }; },
    value => { value.config.network.filterRequest = 'untrusted'; },
    value => { value.config.network.futureOption = true; },
    value => { value.config.windows = {}; },
    value => { value.config.network.allowedDomains.push('example.invalid'); },
    value => { value.config.network.strictAllowlist = false; },
    value => { value.config.filesystem.allowWrite.push({ path: '/', literal: true }); },
    value => { value.config.filesystem.denyRead.pop(); },
    value => { value.config.filesystem.allowRead[0].literal = false; },
    value => { value.config.allowPty = true; },
    value => { value.env.NODE_EXTRA_CA_CERTS = '/private/SENSITIVE'; },
    value => { value.env.HOME = '/private/SENSITIVE'; },
    value => { value.version = 2; },
    value => { value.extra = 'secret'; }
  ];
  for (const change of changes) {
    const value = policy.createPolicy(roots); change(value);
    assert.throws(() => policy.validatePolicy(value), error => error.code === 'AURA_SANDBOX_POLICY_INVALID' && !/SENSITIVE|SECRET|example\.invalid/.test(error.message));
  }
});

test('bounded validation rejects excessive depth, node count, strings and executable values', () => {
  const values = [];
  const deep = policy.createPolicy(roots); let cursor = deep;
  for (let i = 0; i < 100; i++) cursor = cursor.next = {};
  values.push(deep);
  const many = policy.createPolicy(roots); many.extra = Array(policy.MAX_POLICY_NODES + 1).fill(false); values.push(many);
  const huge = policy.createPolicy(roots); huge.extra = 'x'.repeat(policy.MAX_POLICY_BYTES + 1); values.push(huge);
  const cyclic = policy.createPolicy(roots); cyclic.extra = cyclic; values.push(cyclic);
  const executable = policy.createPolicy(roots); executable.extra = () => false; values.push(executable);
  let getterCalled = false; const accessor = policy.createPolicy(roots); Object.defineProperty(accessor, 'extra', { enumerable: true, get() { getterCalled = true; return ''; } }); values.push(accessor);
  for (const value of values) assert.throws(() => policy.validatePolicy(value), { code: 'AURA_SANDBOX_POLICY_INVALID' });
  assert.equal(getterCalled, false);
});

test('direct API validation rejects hidden unknown and allowlisted fields', () => {
  for (const [key, value] of [['tlsTerminate', { caKeyPath: '/private/SENSITIVE' }], ['strictAllowlist', true]]) {
    const input = policy.createPolicy(roots);
    Object.defineProperty(input.config.network, key, { value, enumerable: false });
    assert.throws(() => policy.validatePolicy(input), error => error.code === 'AURA_SANDBOX_POLICY_INVALID' && !error.message.includes('SENSITIVE'));
  }
  // Ordinary arrays retain their standard non-enumerable length property.
  const input = policy.createPolicy(roots);
  assert.equal(policy.validatePolicy(input), input);
});

test('policy reader accepts current policy and rejects unknown fields without exposing values', async t => {
  const f = await fixture(t);
  assert.deepEqual(await policy.readPolicy(f.file), f.value);
  f.value.config.network.tlsTerminate = { caKeyPath: '/private/SENSITIVE' };
  await fs.writeFile(f.file, JSON.stringify(f.value));
  await assert.rejects(policy.readPolicy(f.file), error => error.code === 'AURA_SANDBOX_POLICY_INVALID' && !error.message.includes('SENSITIVE'));
});

test('policy reader rejects oversized files before parsing and rejects malformed JSON', async t => {
  const f = await fixture(t);
  await fs.writeFile(f.file, ' '.repeat(policy.MAX_POLICY_BYTES + 1));
  await assert.rejects(policy.readPolicy(f.file), { code: 'AURA_SANDBOX_POLICY_INVALID' });
  await fs.writeFile(f.file, '{SENSITIVE');
  await assert.rejects(policy.readPolicy(f.file), error => !error.message.includes('SENSITIVE'));
});

test('policy reader refuses symlinks, directories and unreadable paths with a fixed message', async t => {
  const f = await fixture(t), link = path.join(f.directory, 'SENSITIVE-link');
  await fs.symlink(f.file, link);
  for (const file of [link, f.directory, path.join(f.directory, 'SENSITIVE-missing')]) {
    await assert.rejects(policy.readPolicy(file), error => error.code === 'AURA_SANDBOX_POLICY_INVALID' && !error.message.includes('SENSITIVE'));
  }
});

test('policy reader rejects a FIFO immediately instead of waiting for a writer', async t => {
  const f = await fixture(t), fifo = path.join(f.directory, 'policy-fifo');
  const { promisify } = require('node:util');
  await promisify(require('node:child_process').execFile)('/usr/bin/mkfifo', [fifo]);
  await assert.rejects(policy.readPolicy(fifo), { code: 'AURA_SANDBOX_POLICY_INVALID' });
});

nativeTest('external runner receives both new policy module and its protected-path dependency in packaged builds', () => {
  const { asarUnpack } = require('../electron-builder.cjs');
  for (const file of ['core/command-sandbox-runner.mjs', 'core/command-sandbox-policy.cjs', 'core/protected-paths.cjs']) assert.ok(asarUnpack.includes(file), file);
});

test('command payload preserves Unicode and multiline commands within the original limit', () => {
  const input = { command: "printf '%s\\n' 'æøå 日本'\necho done", cwd: roots.workspaceRoot };
  assert.deepEqual(policy.parseCommand(encode(input)), input);
  assert.equal(policy.parseCommand(encode({ ...input, command: 'x'.repeat(200000) })).command.length, 200000);
});

test('command payload rejects excess length, extra fields, invalid encoding and invalid cwd', () => {
  const input = { command: 'true', cwd: roots.workspaceRoot };
  for (const value of [
    encode({ ...input, command: 'x'.repeat(200001) }),
    encode({ ...input, extra: 'SENSITIVE' }),
    encode({ ...input, cwd: '../SENSITIVE' }),
    encode({ ...input, command: null }),
    '!',
    'x'.repeat(policy.MAX_COMMAND_ENCODED_BYTES + 1),
    Buffer.from('{SENSITIVE').toString('base64url')
  ]) assert.throws(() => policy.parseCommand(value), error => error.code === 'AURA_SANDBOX_COMMAND_INVALID' && !error.message.includes('SENSITIVE'));
});
