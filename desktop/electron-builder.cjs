const path = require('node:path');
const { Arch } = require('builder-util');
const profileResources = [{ from: '../profiles', to: 'profiles', filter: ['grundregler.md','gitignore.txt','catalog.json','app/**/*','skills/**/*'] }];
module.exports = {
  appId: 'org.ai-alliancen.harness', productName: 'AI Harness',
  directories: { output: 'release', buildResources: 'packaging' },
  files: ['main.cjs', 'preload.cjs', 'core/**/*', 'ui/**/*', 'package.json'],
  asar: true, asarUnpack: ['core/dev-server-runner.cjs'], npmRebuild: false,
  extraResources: profileResources,
  artifactName: 'AI-Harness-${version}-${os}-${arch}.${ext}',
  mac: { target: ['dmg','zip'], category: 'public.app-category.developer-tools', icon: 'packaging/icon.png', identity: process.env.HARNESS_SIGN_IDENTITY || null, hardenedRuntime: true, entitlements: 'packaging/entitlements.mac.plist', entitlementsInherit: 'packaging/entitlements.mac.plist', notarize: false },
  dmg: { sign: false },
  win: { icon: 'packaging/icon.png', target: ['nsis'], signAndEditExecutable: true },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, deleteAppDataOnUninstall: false, language: '1030' },
  publish: null,
  beforePack: async context => {
    const target = `${context.electronPlatformName}-${Arch[context.arch]}`;
    const folder = path.join(__dirname, '.runtime', target);
    const manifest = require(path.join(folder, 'manifest.json'));
    if (manifest.target !== target) throw new Error('Forkert runtime til pakningen.');
    context.packager.config.extraResources = [...profileResources, { from: folder, to: 'runtime' }];
  }
};
