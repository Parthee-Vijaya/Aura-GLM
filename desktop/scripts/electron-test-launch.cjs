// SPDX-License-Identifier: EUPL-1.2
// Test-only launch boundary: an explicit package never falls back to source.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function launchSpec({ profile, packagePath, desktopRoot = path.resolve(__dirname, '..'), environment = process.env, platform = process.platform, electronExecutable } = {}) {
  const paths = platform === 'win32' ? path.win32 : path;
  if (typeof profile !== 'string' || !paths.isAbsolute(profile) || profile.includes('\0')) throw Error('Prøven kræver en eksplicit absolut sti til sin separate profil.');
  const selected = packagePath === undefined ? environment.HARNESS_TEST_PACKAGE || '' : packagePath;
  if (typeof selected !== 'string' || selected.includes('\0')) throw Error('Ugyldig installationspakke til prøven.');
  const requestedPackage = selected ? paths.resolve(selected) : null;
  if (requestedPackage?.endsWith('.app') && platform !== 'darwin') throw Error('En .app-prøve skal køre på macOS.');
  const executablePath = requestedPackage ? requestedPackage.endsWith('.app') ? paths.join(requestedPackage, 'Contents', 'MacOS', paths.basename(requestedPackage, '.app')) : requestedPackage : electronExecutable || require('electron');
  let bundle = requestedPackage, resourcesPath = null;
  if (requestedPackage && platform === 'darwin') {
    if (!requestedPackage.endsWith('.app')) {
      const macOS = paths.dirname(executablePath), contents = paths.dirname(macOS);
      bundle = paths.dirname(contents);
      if (paths.basename(macOS) !== 'MacOS' || paths.basename(contents) !== 'Contents' || !bundle.endsWith('.app')) throw Error('Den valgte eksekverbare fil skal ligge i en .app/Contents/MacOS-mappe.');
    }
    resourcesPath = paths.join(bundle, 'Contents', 'Resources');
  } else if (requestedPackage) resourcesPath = paths.join(paths.dirname(executablePath), 'resources');
  const env = { ...environment, ELECTRON_RUN_AS_NODE: undefined };
  if (bundle) {
    // The package must prove it carries its runtime, without developer PATH or
    // Node injection masking missing binaries. Do not include env in reports.
    for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
    env.PATH = platform === 'win32' ? paths.join(environment.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin:/bin:/usr/sbin:/sbin';
    env.HARNESS_OPENCODE_PATH = '';
    env.NODE_OPTIONS = undefined;
    env.NODE_PATH = undefined;
  }
  return {
    options: { executablePath, args: [...(bundle ? [] : [desktopRoot]), '--user-data-dir=' + profile], env },
    expected: { packaged: Boolean(bundle), requestedPackage, bundle, resourcesPath, appPath: resourcesPath && paths.join(resourcesPath, 'app.asar'), executablePath, profile, sourceRoot: desktopRoot, platform },
  };
}

function canonical(file, platform) {
  if (platform === process.platform) { try { return fs.realpathSync(file); } catch {} }
  return (platform === 'win32' ? path.win32 : path).resolve(file);
}

function packagedCanonical(file) {
  assert.equal(typeof file, 'string', 'Pakkens sti mangler.');
  assert.ok(path.isAbsolute(file) && !file.includes('\0'), 'Pakkens sti skal være absolut.');
  // A missing path cannot prove package identity. In particular, do not turn a
  // dangling symlink into an apparently contained lexical path.
  return fs.realpathSync(file);
}

function assertContained(root, file, message) {
  const relative = path.relative(root, file);
  assert.ok(relative && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), message);
}

function assertPackagedIdentity(identity, expected) {
  assert.equal(identity.platform, process.platform, 'En pakkekvalifikation skal køre på pakkens platform.');
  assert.equal(packagedCanonical(identity.appPath), packagedCanonical(expected.appPath), 'Prøven åbnede en anden pakket app-kilde.');
  const resources = packagedCanonical(expected.resourcesPath);
  const runtimeRoot = packagedCanonical(path.join(expected.resourcesPath, 'runtime'));
  assert.equal(runtimeRoot, path.join(resources, 'runtime'), 'Pakkens runtime-mappe forlader sin forventede placering.');
  assert.ok(identity.runtime?.versions && identity.runtime.node && identity.runtime.opencode && identity.runtime.git, 'Pakken mangler sin aktive medfølgende runtime.');
  for (const name of ['node', 'opencode', 'git']) {
    const binary = packagedCanonical(identity.runtime[name]);
    assertContained(runtimeRoot, binary, 'Pakkens ' + name + '-runtime ligger uden for pakkens runtime-mappe.');
    assert.ok(fs.statSync(binary).isFile(), 'Pakkens ' + name + '-runtime er ikke en fil.');
  }
}

async function launchTestApp({ electron, ...settings }) {
  const spec = launchSpec(settings);
  let app;
  try {
    app = await electron.launch(spec.options);
    const identity = await app.evaluate(({ app }) => {
      const require = process.getBuiltinModule('module').createRequire(app.getAppPath() + '/package.json');
      const runtime = require('./core/runtime.cjs').get();
      return { packaged: app.isPackaged, version: app.getVersion(), appPath: app.getAppPath(), executablePath: process.execPath,
        profile: app.getPath('userData'), electron: process.versions.electron, platform: process.platform, architecture: process.arch,
        runtime: runtime ? { versions: runtime.versions, node: runtime.node, opencode: runtime.opencode, git: runtime.git } : null };
    });
    assert.equal(identity.platform, spec.expected.platform, 'Prøven startede på en anden platform.');
    assert.equal(identity.packaged, spec.expected.packaged, 'Prøven startede ikke den valgte pakkede/kildebaserede app.');
    assert.equal(canonical(identity.profile, identity.platform), canonical(spec.expected.profile, identity.platform), 'Appen bruger ikke prøvens separate profil.');
    assert.equal(canonical(identity.executablePath, identity.platform), canonical(spec.expected.executablePath, identity.platform), 'Prøven startede en anden eksekverbar fil.');
    if (identity.packaged) assertPackagedIdentity(identity, spec.expected);
    else assert.equal(canonical(identity.appPath, identity.platform), canonical(spec.expected.sourceRoot, identity.platform), 'Prøven åbnede en anden kildeudgave.');
    return { app, evidence: { ...identity, requestedPackage: spec.expected.requestedPackage, restrictedPath: spec.expected.packaged } };
  } catch (error) {
    await app?.close().catch(() => {});
    // Paths and target type diagnose launch mistakes without exposing inherited
    // environment variables, arguments from a model, or credentials.
    error.testLaunch = { packaged: spec.expected.packaged, executablePath: spec.expected.executablePath, profile: spec.expected.profile };
    throw error;
  }
}

module.exports = { launchSpec, launchTestApp };
