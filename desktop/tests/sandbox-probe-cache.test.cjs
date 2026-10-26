const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { createPositiveProbe, createSingleFlight, candidateIdentity } = require('../core/sandbox-probe-cache.cjs');

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-probe-cache-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const write = async (name, text = 'synthetic executable') => { const file = path.join(root, name); await fs.writeFile(file, text, { mode: 0o700 }); return file; };
  return { root, write };
}

test('a positive probe revalidates identity on every lookup but probes only once', async () => {
  let probes = 0, identities = 0;
  const get = createPositiveProbe({ identify: async () => { identities++; return 'runtime-a'; }, probe: async () => { probes++; return '/trusted/node'; } });
  assert.equal(await get(), '/trusted/node'); assert.equal(await get(), '/trusted/node');
  assert.equal(probes, 1); assert.equal(identities, 3);
});
test('same-identity concurrent callers share a version probe', async () => {
  const gate = deferred(); let probes = 0;
  const get = createPositiveProbe({ identify: async () => 'a', probe: async () => { probes++; await gate.promise; return 'node'; } });
  const values = Promise.all([get(), get(), get()]); gate.resolve();
  assert.deepEqual(await values, ['node', 'node', 'node']); assert.equal(probes, 1);
});
test('failures and negative results are not cached', async () => {
  let probes = 0;
  const get = createPositiveProbe({ identify: async () => 'a', probe: async () => { probes++; if (probes === 1) throw new Error('missing'); return probes === 2 ? null : 'node'; } });
  await assert.rejects(get(), /missing/); assert.equal(await get(), null); assert.equal(await get(), 'node'); assert.equal(await get(), 'node'); assert.equal(probes, 3);
});
test('changed identity during a probe rejects the result and retries freshly next time', async () => {
  let identity = 'a', probes = 0;
  const get = createPositiveProbe({ identify: async () => identity, probe: async () => { probes++; identity = 'b'; return 'node'; } });
  await assert.rejects(get(), /changed/); assert.equal(await get(), 'node'); assert.equal(probes, 2);
});
test('an older concurrent probe cannot overwrite a newer successful identity', async () => {
  let identity = 'a', probes = 0; const started = deferred(), gate = deferred();
  const get = createPositiveProbe({ identify: async () => identity, probe: async () => { probes++; if (probes === 1) { started.resolve(); await gate.promise; return 'old'; } return 'new'; } });
  const first = get(); await started.promise; identity = 'b';
  assert.equal(await get(), 'new'); gate.resolve(); await assert.rejects(first, /changed/);
  assert.equal(await get(), 'new'); assert.equal(probes, 2);
});
test('identity IO failures do not reuse a previous successful result', async () => {
  let failed = false, probes = 0;
  const get = createPositiveProbe({ identify: async () => { if (failed) throw new Error('EIO'); return 'a'; }, probe: async () => { probes++; return 'node'; } });
  await get(); failed = true; await assert.rejects(get(), /EIO/); assert.equal(probes, 1);
});
test('singleflight retains neither successful nor negative dependency checks', async () => {
  const flight = createSingleFlight(), gate = deferred(); let probes = 0;
  const probe = async () => { probes++; await gate.promise; return { available: probes === 1 }; };
  const one = flight('same', probe), two = flight('same', probe); gate.resolve();
  assert.equal((await one).available, true); assert.equal((await two).available, true); assert.equal(probes, 1);
  assert.equal((await flight('same', probe)).available, false); await flight('same', probe); assert.equal(probes, 3);
});
test('singleflight does not share different runtime identities and retries rejected probes', async () => {
  const flight = createSingleFlight(); let probes = 0;
  const probe = async () => { probes++; throw new Error('failure'); };
  await Promise.all([assert.rejects(flight('a', probe)), assert.rejects(flight('b', probe))]);
  await assert.rejects(flight('a', probe)); assert.equal(probes, 3);
});

test('candidate identity includes priority, missing candidates and a newly installed preferred runtime', async t => {
  const f = await fixture(t), fallback = await f.write('fallback'), preferred = path.join(f.root, 'preferred');
  const before = await candidateIdentity([preferred, fallback]);
  assert.notEqual(before, await candidateIdentity([fallback, preferred]));
  await f.write('preferred'); assert.notEqual(before, await candidateIdentity([preferred, fallback]));
});
test('same-length changes with restored mtime still invalidate through ctime', async t => {
  const f = await fixture(t), file = await f.write('node', 'first'); const stat = await fs.stat(file);
  const before = await candidateIdentity([file]);
  await fs.writeFile(file, 'other'); await fs.utimes(file, stat.atime, stat.mtime);
  assert.notEqual(before, await candidateIdentity([file]));
});
test('replacement and removal invalidate a candidate', async t => {
  const f = await fixture(t), file = await f.write('node');
  const before = await candidateIdentity([file]);
  await fs.rename(file, file + '.old'); await f.write('node');
  const replaced = await candidateIdentity([file]); assert.notEqual(before, replaced);
  await fs.unlink(file); assert.notEqual(replaced, await candidateIdentity([file]));
});
test('POSIX executable permission changes invalidate a candidate', async t => {
  if (process.platform === 'win32') return t.skip('Windows does not model executable permission through chmod.');
  const f = await fixture(t), file = await f.write('node'), before = await candidateIdentity([file]);
  await fs.chmod(file, 0o600); assert.notEqual(before, await candidateIdentity([file]));
});
test('retargeting a runtime symlink invalidates its identity', async t => {
  const f = await fixture(t), one = await f.write('one'), two = await f.write('two'), link = path.join(f.root, 'node');
  try { await fs.symlink(one, link); } catch (error) { if (process.platform === 'win32' && ['EPERM', 'EACCES'].includes(error.code)) return t.skip('Windows symlink creation requires developer mode or an elevated test account.'); throw error; }
  const before = await candidateIdentity([link]);
  await fs.unlink(link); await fs.symlink(two, link); assert.notEqual(before, await candidateIdentity([link]));
});
test('a readable non-executable runner has a changing identity rather than an EACCES sentinel', async t => {
  const f = await fixture(t), runner = await f.write('runner.mjs'); await fs.chmod(runner, 0o600);
  const before = await candidateIdentity([runner], { executable: false });
  await fs.appendFile(runner, '\nchanged'); assert.notEqual(before, await candidateIdentity([runner], { executable: false }));
});
test('unexpected filesystem errors are not represented as an absent candidate', async t => {
  const f = await fixture(t), file = await f.write('node');
  t.mock.method(fs, 'access', async () => { throw Object.assign(new Error('IO failure'), { code: 'EIO' }); });
  await assert.rejects(candidateIdentity([file]), { code: 'EIO' });
});

// Exercise the production integration with synthetic executable files and a
// controlled child-process boundary. No real model, credentials or UI is used.
async function controlledSandbox(t, options = {}) {
  const f = await fixture(t), node = await f.write('node'), runner = await f.write('command-sandbox-runner.mjs');
  const file = path.resolve(__dirname, '../core/command-sandbox.cjs'), localRequire = createRequire(file);
  const runtime = { node }, calls = [];
  const context = { module: { exports: {} }, __dirname: f.root, Buffer, structuredClone, process,
    require(name) {
      if (name === './runtime.cjs') return { get: () => runtime };
      if (name === './sandbox-probe-cache.cjs' && options.onFlightEnter) return { ...localRequire(name), createSingleFlight: () => { const flight = createSingleFlight(); return (...args) => { options.onFlightEnter(); return flight(...args); }; } };
      if (name === 'node:util') return { promisify: value => value };
      if (name === 'node:child_process') return { execFile: async (executable, args) => {
        calls.push(args.includes('--check') ? 'support' : 'version');
        await fs.access(executable, fs.constants.X_OK);
        return { stdout: options.probe ? await options.probe(executable, args) : args.includes('--check') ? '{"errors":[],"warnings":[]}' : '22.23.3' };
      } };
      return localRequire(name);
    }
  };
  vm.runInNewContext(await fs.readFile(file, 'utf8'), context, { filename: file });
  return { ...f, node, runner, runtime, calls, sandbox: context.module.exports };
}
test('integration reuses the verified Node path but rechecks all dependencies on every later support call', async t => {
  const f = await controlledSandbox(t);
  for (const platform of ['darwin', 'darwin', 'linux', 'linux']) assert.equal((await f.sandbox.support({ platform })).available, true);
  assert.deepEqual(f.calls, ['version', 'support', 'support', 'support', 'support']);
});
test('integration repeats dependency checks after a missing or changed package/tool result', async t => {
  let ready = true;
  const f = await controlledSandbox(t, { probe: async (_, args) => args.includes('--check') ? JSON.stringify({ errors: ready ? [] : ['missing dependency'], warnings: [] }) : '22.23.3' });
  assert.equal((await f.sandbox.support()).available, true); ready = false;
  assert.equal((await f.sandbox.support()).available, false); ready = true;
  assert.equal((await f.sandbox.support()).available, true);
  assert.equal(f.calls.filter(value => value === 'support').length, 3);
});
test('integration fails closed after cached runtime removal instead of using an unconfigured fallback', async t => {
  const f = await controlledSandbox(t); assert.equal((await f.sandbox.support()).available, true);
  await fs.unlink(f.node); assert.equal((await f.sandbox.support()).available, false);
  await assert.rejects(f.sandbox.nodePath(), /mangler/);
  assert.equal(f.calls.filter(value => value === 'support').length, 1);
});
test('integration invalidates when runtime configuration changes', async t => {
  const f = await controlledSandbox(t); assert.equal(await f.sandbox.nodePath(), await fs.realpath(f.node));
  const other = await f.write('other-node'); f.runtime.node = other;
  assert.equal(await f.sandbox.nodePath(), await fs.realpath(other)); assert.equal(f.calls.length, 2);
});
test('integration rejects a runtime changed during its version check', async t => {
  let once = true;
  const f = await controlledSandbox(t, { probe: async (file, args) => { if (!args.includes('--check') && once) { once = false; await fs.appendFile(file, 'changed'); } return '22.23.3'; } });
  await assert.rejects(f.sandbox.nodePath(), /changed/); assert.equal(await f.sandbox.nodePath(), await fs.realpath(f.node)); assert.equal(f.calls.length, 2);
});
test('integration rejects a runner changed during its dependency check', async t => {
  let once = true;
  const f = await controlledSandbox(t, { probe: async (_, args) => {
    if (!args.includes('--check')) return '22.23.3';
    if (once) { once = false; await fs.appendFile(args[0], 'changed'); }
    return '{"errors":[],"warnings":[]}';
  } });
  assert.equal((await f.sandbox.support()).available, false); assert.equal((await f.sandbox.support()).available, true);
  assert.equal(f.calls.filter(value => value === 'support').length, 2);
});
test('malformed dependency output fails closed and is never retained', async t => {
  let good = false;
  const f = await controlledSandbox(t, { probe: async (_, args) => !args.includes('--check') ? '22.23.3' : good ? '{"errors":[],"warnings":[]}' : '{}' });
  assert.equal((await f.sandbox.support()).available, false); good = true; assert.equal((await f.sandbox.support()).available, true);
});
test('callers cannot mutate another support result through shared warnings', async t => {
  const f = await controlledSandbox(t); const [one, two] = await Promise.all([f.sandbox.support(), f.sandbox.support()]);
  one.warnings.push('changed'); assert.equal(two.warnings.length, 0);
});
test('concurrent integration checks share only their in-flight dependency probe', async t => {
  const gate = deferred(), started = deferred(), joined = deferred(); let entries = 0;
  const f = await controlledSandbox(t, { onFlightEnter: () => { if (++entries === 2) joined.resolve(); }, probe: async (_, args) => { if (!args.includes('--check')) return '22.23.3'; started.resolve(); await gate.promise; return '{"errors":[],"warnings":[]}'; } });
  const first = f.sandbox.support(); await started.promise;
  const second = f.sandbox.support();
  await joined.promise; gate.resolve();
  assert.equal((await first).available, true); assert.equal((await second).available, true);
  assert.equal(f.calls.filter(value => value === 'support').length, 1);
  await f.sandbox.support(); assert.equal(f.calls.filter(value => value === 'support').length, 2);
});
