// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchSpec, launchTestApp } = require('../scripts/electron-test-launch.cjs');

const source = { profile: '/synthetic/profile', desktopRoot: '/synthetic/source/desktop', electronExecutable: '/synthetic/electron', platform: 'darwin' };
const packagePath = '/synthetic/Build with spaces/Aura 1.app';
const environment = { PATH: '/developer/bin', HARNESS_OPENCODE_PATH: '/developer/opencode', NODE_OPTIONS: '--require=/developer/inject.cjs', NODE_PATH: '/developer/modules', ELECTRON_RUN_AS_NODE: '1', SYNTHETIC_SECRET: 'not-a-real-key' };

test('source qualification keeps its explicit source and profile without changing the parent environment', () => {
  const before = { ...environment };
  const spec = launchSpec({ ...source, environment });
  assert.equal(spec.expected.packaged, false);
  assert.equal(spec.options.executablePath, source.electronExecutable);
  assert.deepEqual(spec.options.args, [source.desktopRoot, '--user-data-dir=' + source.profile]);
  assert.equal(spec.options.env.PATH, environment.PATH);
  assert.equal(spec.options.env.HARNESS_OPENCODE_PATH, environment.HARNESS_OPENCODE_PATH);
  assert.equal(spec.options.env.ELECTRON_RUN_AS_NODE, undefined);
  assert.deepEqual(environment, before);
});

test('a requested macOS package uses its own executable, no source argument and no developer runtime injection', () => {
  const spec = launchSpec({ ...source, environment: { ...environment, HARNESS_TEST_PACKAGE: packagePath } });
  assert.equal(spec.expected.packaged, true);
  assert.equal(spec.options.executablePath, packagePath + '/Contents/MacOS/Aura 1');
  assert.equal(spec.expected.appPath, packagePath + '/Contents/Resources/app.asar');
  assert.deepEqual(spec.options.args, ['--user-data-dir=' + source.profile]);
  assert.equal(spec.options.env.PATH, '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.equal(spec.options.env.HARNESS_OPENCODE_PATH, '');
  assert.equal(spec.options.env.NODE_OPTIONS, undefined);
  assert.equal(spec.options.env.NODE_PATH, undefined);
  assert.equal(JSON.stringify(spec.expected).includes(environment.SYNTHETIC_SECRET), false);
});

test('Windows package qualification accepts an executable and removes case-aliased developer PATH', () => {
  const spec = launchSpec({ profile: 'C:\\Synthetic\\Profile', desktopRoot: 'C:\\Source\\desktop', packagePath: 'C:\\Build\\Aura 1.exe', platform: 'win32', environment: { Path: 'C:\\Developer', PATH: 'C:\\Other', SystemRoot: 'C:\\Windows' } });
  assert.equal(spec.options.executablePath, 'C:\\Build\\Aura 1.exe');
  assert.equal(spec.expected.appPath, 'C:\\Build\\resources\\app.asar');
  assert.deepEqual(spec.options.args, ['--user-data-dir=C:\\Synthetic\\Profile']);
  assert.equal(spec.options.env.PATH, 'C:\\Windows\\System32');
  assert.equal(Object.hasOwn(spec.options.env, 'Path'), false);
});

test('qualification refuses an implicit profile or a macOS bundle on another platform', () => {
  for (const profile of [undefined, '', 'relative/profile', '/bad\0profile']) assert.throws(() => launchSpec({ ...source, profile, environment: {} }), /separate profil/);
  assert.throws(() => launchSpec({ ...source, packagePath, platform: 'linux', environment: {} }), /macOS/);
});

test('an explicit macOS executable derives its bundle and archive; an executable outside a bundle is rejected', () => {
  const executable = packagePath + '/Contents/MacOS/Aura 1';
  const spec = launchSpec({ ...source, packagePath: executable, environment: {} });
  assert.equal(spec.expected.bundle, packagePath);
  assert.equal(spec.expected.requestedPackage, executable);
  assert.equal(spec.expected.resourcesPath, packagePath + '/Contents/Resources');
  assert.equal(spec.expected.appPath, packagePath + '/Contents/Resources/app.asar');
  for (const invalid of ['/external/Aura 1', packagePath + '/MacOS/Aura 1', packagePath + '/Contents/Aura 1']) {
    assert.throws(() => launchSpec({ ...source, packagePath: invalid, environment: {} }), /Contents\/MacOS/);
  }
});

function fixture(t, overrides = {}, packaged = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-package-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const bundle = path.join(root, 'Aura 1.app');
  const executablePath = process.platform === 'darwin' ? path.join(bundle, 'Contents', 'MacOS', 'Aura 1') : path.join(root, process.platform === 'win32' ? 'Aura 1.exe' : 'aura');
  const resources = process.platform === 'darwin' ? path.join(bundle, 'Contents', 'Resources') : path.join(root, 'resources');
  const profile = path.join(root, 'profile'), desktopRoot = path.join(root, 'source');
  const appPath = path.join(resources, 'app.asar'), runtimeRoot = path.join(resources, 'runtime');
  const runtime = { versions: { opencode: '2.1.4' } };
  const write = file => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'synthetic package fixture'); return file; };
  write(executablePath); write(appPath);
  for (const name of ['node', 'git', 'opencode']) runtime[name] = write(path.join(runtimeRoot, 'host', 'bin', name));
  fs.mkdirSync(profile); fs.mkdirSync(desktopRoot);
  const selected = process.platform === 'darwin' ? bundle : executablePath;
  const identity = { packaged, version: '0.5.0-beta.1', profile, executablePath,
    appPath: packaged ? appPath : desktopRoot, electron: '44.9.3', platform: process.platform, architecture: process.arch,
    runtime: packaged ? runtime : null, ...overrides };
  let closes = 0, launches = 0;
  const app = { evaluate: async () => identity, close: async () => { closes++; } };
  const electron = { launch: async () => { launches++; return app; } };
  return { app, electron, identity, root, resources, runtimeRoot, write,
    settings: { profile, desktopRoot, electronExecutable: executablePath, platform: process.platform, packagePath: packaged ? selected : '', environment },
    counts: () => ({ closes, launches }) };
}

test('launch evidence identifies the actual app, isolated profile and active bundled runtime without environment values', async t => {
  for (const packaged of [true, false]) {
    const f = fixture(t, {}, packaged), result = await launchTestApp({ electron: f.electron, ...f.settings });
    assert.equal(result.app, f.app);
    assert.equal(result.evidence.packaged, packaged);
    assert.equal(result.evidence.restrictedPath, packaged);
    assert.equal(result.evidence.requestedPackage, packaged ? f.settings.packagePath : null);
    assert.equal(JSON.stringify(result.evidence).includes(environment.SYNTHETIC_SECRET), false);
    assert.deepEqual(f.counts(), { launches: 1, closes: 0 });
  }
});

test('wrong app, profile or missing package runtime closes the test process without trying another executable', async t => {
  for (const changed of [{ packaged: false }, { profile: '/real/user/profile' }, { executablePath: '/different/app' }, { runtime: null }, { platform: 'invalid-platform' }]) {
    const f = fixture(t, changed);
    await assert.rejects(launchTestApp({ electron: f.electron, ...f.settings }), error => {
      assert.equal(error.testLaunch.packaged, true);
      assert.equal(error.testLaunch.executablePath, launchSpec(f.settings).expected.executablePath);
      assert.equal(JSON.stringify(error.testLaunch).includes(environment.SYNTHETIC_SECRET), false);
      return true;
    });
    assert.deepEqual(f.counts(), { launches: 1, closes: 1 });
  }
});

test('an unavailable explicit package produces diagnostic target paths and never falls back to installed Electron', async () => {
  let launches = 0;
  await assert.rejects(launchTestApp({ ...source, packagePath, environment, electron: { launch: async () => { launches++; throw Error('Synthetic executable missing'); } } }), error => {
    assert.match(error.message, /Synthetic executable missing/);
    assert.equal(error.testLaunch.executablePath, packagePath + '/Contents/MacOS/Aura 1');
    return true;
  });
  assert.equal(launches, 1);
});

test('source launch also rejects a different source checkout', async t => {
  const f = fixture(t, { appPath: '/different/source' }, false);
  await assert.rejects(launchTestApp({ electron: f.electron, ...f.settings }), /anden kildeudgave/);
  assert.deepEqual(f.counts(), { launches: 1, closes: 1 });
});

test('the selected executable cannot qualify a different existing app archive', async t => {
  const f = fixture(t);
  f.identity.appPath = f.write(path.join(f.root, 'other', 'app.asar'));
  await assert.rejects(launchTestApp({ electron: f.electron, ...f.settings }), /anden pakket app-kilde/);
  assert.deepEqual(f.counts(), { launches: 1, closes: 1 });
});

test('each runtime binary must exist inside this package runtime, not an external or prefix-sibling directory', async t => {
  for (const name of ['node', 'opencode', 'git']) for (const location of ['external', 'runtime-sibling', 'missing']) {
    const f = fixture(t);
    f.identity.runtime[name] = location === 'external' ? f.write(path.join(f.root, 'external', 'runtime', name))
      : location === 'runtime-sibling' ? f.write(path.join(f.resources, 'runtime-sibling', name)) : path.join(f.runtimeRoot, 'missing', name);
    await assert.rejects(launchTestApp({ electron: f.electron, ...f.settings }));
    assert.deepEqual(f.counts(), { launches: 1, closes: 1 });
  }
});

test('runtime symlinks escaping the package are rejected, including a redirected runtime root', { skip: process.platform === 'win32' ? 'Symlink creation requires Windows privileges; containment is covered with real files.' : false }, async t => {
  for (const rootEscape of [false, true]) {
    const f = fixture(t), external = path.join(f.root, 'external');
    f.write(path.join(external, 'node'));
    if (rootEscape) {
      fs.renameSync(f.runtimeRoot, external + '-runtime');
      fs.symlinkSync(external + '-runtime', f.runtimeRoot);
    } else {
      fs.unlinkSync(f.identity.runtime.node);
      fs.symlinkSync(path.join(external, 'node'), f.identity.runtime.node);
    }
    await assert.rejects(launchTestApp({ electron: f.electron, ...f.settings }), /forlader|uden for/);
    assert.deepEqual(f.counts(), { launches: 1, closes: 1 });
  }
});

test('executable input still verifies the same packaged archive and bundled runtime', async t => {
  const f = fixture(t);
  f.settings.packagePath = f.identity.executablePath;
  const result = await launchTestApp({ electron: f.electron, ...f.settings });
  assert.equal(result.evidence.requestedPackage, f.identity.executablePath);
  assert.deepEqual(f.counts(), { launches: 1, closes: 0 });
});
