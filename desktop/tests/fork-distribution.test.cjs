const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const distribution = require('../core/distribution.cjs');
const { appIdentity, rememberKeychain, DISPLAY_NAME } = require('../core/app-identity.cjs');
const { Updates, validateInfo } = require('../core/updates.cjs');

test('fork branding preserves the existing packaged profile and keychain', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-fork-identity-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const existing = path.join(root, 'Aura');
  await fs.mkdir(path.join(existing, 'harness'), { recursive: true });
  await fs.writeFile(path.join(existing, 'harness/noeglering.json'), '{"navn":"Aura"}\n');
  const options = { appData: root, packaged: true, customUserData: false, userData: path.join(root, 'Aura 1'), sessionData: path.join(root, 'Aura 1') };
  const result = appIdentity(options);
  assert.equal(DISPLAY_NAME, 'Aura GLM');
  assert.equal(result.userData, existing);
  assert.equal(result.sessionData, existing);
  assert.equal(result.keychainName, 'Aura');
  assert.equal(rememberKeychain(result), true);
  assert.equal(appIdentity(options).keychainName, 'Aura');
  const custom = path.join(root, 'separate-test-profile');
  const isolated = appIdentity({ ...options, customUserData: true, userData: custom, sessionData: custom });
  assert.equal(isolated.userData, custom);
  assert.equal(isolated.sessionData, custom);
  assert.equal(isolated.keychainName, 'Aura');
  await assert.rejects(fs.access(path.join(root, 'Aura 1')), { code: 'ENOENT' });
});

test('fork updates accept only its own versioned artifact and require explicit download/install', async t => {
  const version = '1.0.0-beta.1', next = '1.0.0-beta.2';
  const info = { version: next, files: [{ url: `${distribution.releases}download/v${next}/Aura-1-${next}-mac-arm64.zip`, size: 4, sha512: createHash('sha512').update('test').digest('base64') }] };
  const options = { ...distribution, version, platform: 'darwin', arch: 'arm64' };
  assert.equal(validateInfo(info, options).version, next);
  for (const url of [info.files[0].url.replace('Parthee-Vijaya', 'ai-alliancen-org'), info.files[0].url.replace('Aura-1-', 'Aura-'), info.files[0].url.replace('arm64', 'x64')]) {
    assert.throws(() => validateInfo({ ...info, files: [{ ...info.files[0], url }] }, options));
  }
  const updater = new EventEmitter(); let feed, downloads = 0, installs = 0;
  updater.setFeedURL = value => { feed = value; };
  updater.checkForUpdates = async () => ({ updateInfo: info, isUpdateAvailable: true });
  updater.downloadUpdate = async () => { downloads++; };
  updater.quitAndInstall = () => { installs++; };
  const controller = new Updates({ ...options, updater, store: { read: async () => ({ updates: { automatic: false } }) } });
  t.after(() => controller.close());
  await controller.start();
  assert.equal(feed.provider, 'github'); assert.equal(feed.owner, 'Parthee-Vijaya'); assert.equal(feed.repo, 'Aura-GLM'); assert.equal(feed.channel, 'beta');
  assert.equal(updater.autoDownload, false);
  assert.equal(updater.autoInstallOnAppQuit, false);
  await controller.check();
  assert.equal(controller.snapshot().phase, 'available');
  assert.equal(downloads, 0); assert.equal(installs, 0);
  await controller.download(); assert.equal(downloads, 1); assert.equal(installs, 0);
  await controller.restart(); assert.equal(installs, 1);
});
