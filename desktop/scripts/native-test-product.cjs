// SPDX-License-Identifier: EUPL-1.2
// Optional native qualification of actual packaged core modules. This runs in
// the package's Electron-as-Node process; it does not start main or a renderer.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function nativeTestProduct({ packagePath = process.env.HARNESS_TEST_PACKAGE || '', desktopRoot = path.resolve(__dirname, '..') } = {}) {
  if (typeof packagePath !== 'string' || packagePath.includes('\0')) throw Error('Ugyldig native prøvepakke.');
  let root = desktopRoot, resources = null, bundle = null, identity = { packaged: false, moduleRoot: desktopRoot, qualification: 'source-core' };
  if (packagePath) {
    if (process.platform !== 'darwin' || !packagePath.endsWith('.app')) throw Error('Denne pakkede native prøve kræver en eksplicit macOS .app.');
    if (!process.versions.electron || process.env.ELECTRON_RUN_AS_NODE !== '1' || process.noAsar === true) throw Error('Kør prøven med pakkens Electron, ELECTRON_RUN_AS_NODE=1 og aktiv ASAR-understøttelse; almindelig Node er ikke en pakket prøve.');
    bundle = fs.realpathSync(path.resolve(packagePath));
    const executable = path.join(bundle, 'Contents', 'MacOS', path.basename(bundle, '.app'));
    if (fs.realpathSync(process.execPath) !== fs.realpathSync(executable)) throw Error('Den kørende Electron tilhører ikke den valgte installationspakke.');
    resources = path.join(bundle, 'Contents', 'Resources');
    root = path.join(resources, 'app.asar');
    // Only Electron's patched filesystem can read a file inside a real archive.
    // Never extract the archive into source or emulate ASAR with a directory.
    if (!require('original-fs').statSync(root).isFile() || !fs.statSync(path.join(root, 'package.json')).isFile()) throw Error('Pakken skal læses direkte gennem Electrons aktive ASAR-understøttelse.');
  }
  const fromProduct = createRequire(path.join(root, 'package.json'));
  if (resources) {
    const manifest = fromProduct('./package.json'), proof = JSON.parse(fs.readFileSync(path.join(resources, 'source-proof.json'), 'utf8'));
    if (!/^[a-f0-9]{40}$/.test(proof.sourceCommit || '')) throw Error('Pakkens kildeidentitet mangler.');
    const runtime = fromProduct('./core/runtime.cjs').configure(resources);
    identity = { packaged: true, qualification: 'packaged-core-electron-as-node', bundle, moduleRoot: root, version: manifest.version, sourceCommit: proof.sourceCommit,
      executablePath: process.execPath, electron: process.versions.electron, platform: process.platform, architecture: process.arch,
      runtime: { versions: runtime.versions, node: runtime.node, opencode: runtime.opencode, git: runtime.git },
      limitation: 'Actual packaged core and runtime; no main bootstrap, UI or Electron safeStorage in this process.' };
  }
  return {
    require(request) {
      if (typeof request !== 'string' || !/^\.\/(core|privacy)\/[a-zA-Z0-9_./-]+\.cjs$/.test(request) || request.split('/').includes('..')) throw Error('Prøven må kun importere core/privacy direkte fra det valgte produkt.');
      return fromProduct(request);
    },
    runtimeRoot: resources ? path.join(resources, 'runtime') : path.join(desktopRoot, '.runtime', `${process.platform}-${process.arch}`),
    profilesRoot: resources ? path.join(resources, 'profiles') : path.resolve(desktopRoot, '../profiles'),
    identity,
  };
}

module.exports = { nativeTestProduct };
