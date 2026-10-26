// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');

// Exercise the real Workbench resolver and Git dispatch, with controlled host
// metadata, policy and process boundaries. This is not Windows/native evidence;
// PrivacyService policy/file integrity has its own platform regression suite.
async function fixture(t, { platform = 'win32', available = false, protectedGit = false } = {}) {
  const root = await fsp.realpath(await fsp.mkdtemp(path.join(os.tmpdir(), 'aura-git-platform-')));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'), profile = path.join(root, 'profile');
  await fsp.mkdir(project); await fsp.mkdir(profile);
  const state = { protectedGit, revision: 1, probes: 0, isolated: 0, processes: [], metadata: new Map() };
  const controlledFs = { ...fs, lstatSync(file, ...args) {
    const stat = fs.lstatSync(file, ...args), changes = state.metadata.get(file) || {};
    return Object.assign(Object.create(Object.getPrototypeOf(stat)), stat,
      platform === 'win32' && stat.isDirectory() ? { mode: 0o040666, uid: 0 } : {}, changes);
  } };
  const host = Object.create(process);
  Object.defineProperty(host, 'platform', { value: platform });
  if (platform === 'win32') Object.defineProperty(host, 'getuid', { value: undefined });
  const cache = new Map(), core = path.resolve(__dirname, '../core');
  const isolation = {
    runtimePaths: () => ({ root: path.join(root, 'unqualified-runtime') }),
    runIsolatedGit: async (_root, _args, _input, _configuration, permit) => {
      permit.assertCurrent(); state.isolated++;
      const error = new Error('Controlled native isolation is unavailable.'); error.code = 'PRIVACY_ISOLATION_UNAVAILABLE'; throw error;
    },
  };
  function load(name) {
    const file = path.join(core, name); if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const realRequire = createRequire(file);
    const localRequire = id => {
      if (id === 'node:fs') return controlledFs;
      if (id === './git.cjs') return load('git.cjs');
      if (id === './privacy-service.cjs') return { PrivacyService: class { constructor(bench) { this.bench = bench; } } };
      if (id === './privacy-runtime-provider.cjs') return { PrivacyRuntimeProvider: class {} };
      if (id === './privacy/external-egress.cjs') return { ExternalEgress: class {
        scope(value) { return { kind: 'project', root: value, chat: null }; }
        binding() { return String(state.revision); }
        activeSync() { return state.protectedGit; }
      } };
      if (id === './privacy/git-isolation.cjs') return isolation;
      if (id === '../privacy/isolation/engine-isolation.cjs') return { probeIsolationSupport: async () => { state.probes++; return { available }; } };
      if (id === './runtime.cjs') return { get: () => null, gitEnvironment: value => value };
      if (id === 'node:child_process') return { execFile: (file, args, options, callback) => {
        state.processes.push({ file, args, options });
        const child = new EventEmitter(); child.stdin = { on() {}, end() {} };
        queueMicrotask(() => callback(null, Buffer.from('controlled-git-result'))); return child;
      } };
      return realRequire(id);
    };
    const wrapper = vm.runInNewContext('(function(require,module,exports,__dirname,__filename){' + fs.readFileSync(file, 'utf8') + '\n})',
      { process: host, Buffer, WeakRef, structuredClone, URL, setTimeout, clearTimeout }, { filename: file });
    wrapper(localRequire, mod, mod.exports, path.dirname(file), file); return mod.exports;
  }
  const { Workbench } = load('workbench.cjs'), git = load('git.cjs');
  const bench = new Workbench({ store: { root: profile }, history: {}, emit() {}, library: async () => ({ skills: [], features: [] }) });
  bench.project = { root: project }; t.after(() => bench.releaseGitPrivacy());
  return { bench, git, state, root, project, profile };
}

test('ordinary Windows Git retains legacy dispatch and its privacy activation barrier', async t => {
  const f = await fixture(t);
  assert.equal((await f.git.run(f.project, ['status'])).toString(), 'controlled-git-result');
  assert.equal(f.state.processes.length, 1); assert.equal(f.state.isolated, 0);
  assert.throws(() => f.bench.privacyActivationGuard.activation(f.project), { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' });
});

test('unsupported Windows bootstrap never receives fresh-root isolation authority', async t => {
  const f = await fixture(t);
  const result = await f.bench.withGitPrivacyRoot(f.project, async () => {
    assert.equal(f.bench.gitPrivacyRoots.get(f.project).isolated, false);
    await f.git.run(f.project, ['status']);
    await fsp.mkdir(path.join(f.project, '.git'));
    return { started: true };
  });
  assert.equal(result.started, true); assert.equal(f.state.probes, 1);
  assert.equal(f.bench.gitSession.freshRoots.size, 0); assert.equal(f.bench.gitPrivacyRoots.size, 0);
  assert.equal(f.state.processes.length, 1); assert.equal(f.state.isolated, 0);
  assert.throws(() => f.bench.privacyActivationGuard.activation(f.project), { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' });
});

test('protected Windows Git still requires isolation without legacy fallback', async t => {
  const f = await fixture(t, { protectedGit: true });
  await assert.rejects(f.git.run(f.project, ['status']), { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
  assert.equal(f.state.isolated, 1); assert.equal(f.state.processes.length, 0);
  assert.equal(f.bench.gitSession.freshRoots.size, 0);
});

test('a changed policy still invalidates Windows Git before returning its result', async t => {
  const f = await fixture(t);
  const pending = f.git.run(f.project, ['status']); f.state.revision++;
  await assert.rejects(pending, { code: 'PRIVACY_STALE' });
  assert.equal(f.state.processes.length, 1);
});

for (const platform of ['darwin', 'linux']) {
  test(`${platform} rejects a writable-by-others project before bootstrap`, async t => {
    const f = await fixture(t, { platform });
    f.state.metadata.set(f.project, { mode: 0o040777 }); let called = false;
    await assert.rejects(f.bench.withGitPrivacyRoot(f.project, () => { called = true; }), { code: 'PRIVACY_GIT_ISOLATION_REQUIRED' });
    assert.equal(called, false); assert.equal(f.state.probes, 0);
  });
  test(`${platform} rejects a writable-by-others profile before Git`, async t => {
    const f = await fixture(t, { platform });
    f.state.metadata.set(f.profile, { mode: 0o040777 });
    assert.throws(() => f.git.run(f.project, ['status']), { code: 'PRIVACY_CONTROL_FAILED' });
    assert.equal(f.state.processes.length, 0);
  });
}

test('Windows profile symlink metadata remains rejected before any Git process', async t => {
  const f = await fixture(t);
  f.state.metadata.set(f.profile, { isSymbolicLink: () => true });
  assert.throws(() => f.git.run(f.project, ['status']), { code: 'PRIVACY_CONTROL_FAILED' });
  assert.equal(f.state.processes.length, 0); assert.equal(f.state.isolated, 0);
});

test('qualified POSIX bootstrap retains canonical repository identity checks', async t => {
  const f = await fixture(t, { platform: 'darwin', available: true });
  await f.bench.withGitPrivacyRoot(f.project, async () => {
    await fsp.mkdir(path.join(f.project, '.git')); return { started: true };
  });
  assert.equal(f.bench.gitSession.freshRoots.size, 1);
  await fsp.rename(path.join(f.project, '.git'), path.join(f.project, 'old-git'));
  await fsp.mkdir(path.join(f.project, '.git'));
  assert.throws(() => f.git.run(f.project, ['status']), { code: 'PRIVACY_GIT_ISOLATION_REQUIRED' });
  assert.equal(f.state.processes.length, 0); assert.equal(f.state.isolated, 0);
});
