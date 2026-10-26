const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const distribution = require('../core/distribution.cjs');
const contract = require('../../scripts/release-contract.cjs');
const { validateInfo } = require('../core/updates.cjs');

const version = '0.4.0-beta.2';
const binaries = [
  `Aura-1-${version}-mac-arm64.dmg`, `Aura-1-${version}-mac-x64.dmg`, `Aura-1-${version}-win-x64.exe`,
  `Aura-1-${version}-mac-arm64.zip`, `Aura-1-${version}-mac-x64.zip`
];
const url = name => `https://github.com/Parthee-Vijaya/ai-harness/releases/download/v${version}/${name}`;
function fixture() {
  const content = Buffer.from('Synthetic release bytes, never executed.');
  const files = binaries.map(name => ({ name, bytes: content.length,
    sha256: createHash('sha256').update(content).digest('hex'), sha512: createHash('sha512').update(content).digest('base64'),
    ...(name.includes('-mac-') ? { notarized: true, notarization: { id: '12345678-1234-1234-1234-123456789abc', checkedAt: '2026-10-26T08:00:00Z' } } : {}) }));
  const manifest = { version, files, update: { critical: false, message: '' } };
  const release = { draft: true, prerelease: true, tag_name: `v${version}`, body: 'Synthetic release notes.',
    assets: [...files.map(file => ({ name: file.name, size: file.bytes, digest: `sha256:${file.sha256}` })), { name: 'release.json' }, { name: 'SHA256SUMS.txt' }]
      .map(asset => ({ ...asset, state: 'uploaded', browser_download_url: url(asset.name) })) };
  const checksums = files.map(file => `${file.sha256}  ${file.name}`).join('\n');
  return { manifest, release, checksums };
}

test('release identity and artifact names match the running fork distribution', () => {
  assert.equal(contract.repository, distribution.repository);
  assert.equal(contract.repository, 'Parthee-Vijaya/ai-harness');
  assert.deepEqual(contract.expectedFiles(version), binaries.slice(0, 3));
  assert.deepEqual(contract.releaseBinaries(version), binaries);
  assert.deepEqual(contract.installer(binaries[0]), { version, os: 'mac', arch: 'arm64', extension: 'dmg', target: 'mac-arm64' });
  assert.equal(contract.assetURL(`v${version}`, binaries[0]), url(binaries[0]));
  assert.equal(contract.installer(`Other-${version}-mac-arm64.dmg`), null);
});

test('fork release validates exact files and rejects another repository, prefix or mutated bytes', () => {
  const f = fixture();
  assert.deepEqual(contract.validateRelease(f.release, f.manifest, f.checksums, version).files, binaries);
  for (const mutate of [
    f => { f.release.assets[0].browser_download_url = f.release.assets[0].browser_download_url.replace('Parthee-Vijaya', 'ai-alliancen-org'); },
    f => { f.release.assets[0].browser_download_url += '?download=1'; },
    f => { f.release.assets[0].browser_download_url = f.release.assets[0].browser_download_url.replace('/v0.4.0-beta.2/', '/v0.4.0-beta.1/'); },
    f => { f.release.assets[0].digest = 'sha256:' + '0'.repeat(64); },
    f => { f.manifest.files[0].notarized = false; },
    f => { f.release.assets.pop(); },
    f => { f.release.draft = false; }
  ]) {
    const bad = fixture(); mutate(bad);
    assert.throws(() => contract.validateRelease(bad.release, bad.manifest, bad.checksums, version));
  }
  for (const prefix of ['Aura', 'AI-Harness', 'Other']) {
    const bad = fixture();
    for (const file of bad.manifest.files) file.name = file.name.replace('Aura-1-', prefix + '-');
    for (const asset of bad.release.assets) { asset.name = asset.name.replace('Aura-1-', prefix + '-'); asset.browser_download_url = url(asset.name); }
    bad.checksums = bad.manifest.files.map(file => `${file.sha256}  ${file.name}`).join('\n');
    assert.throws(() => contract.validateRelease(bad.release, bad.manifest, bad.checksums, version), prefix);
  }
});

test('generated fork update feeds are accepted by the actual app update validator', () => {
  const { manifest } = fixture();
  const feeds = contract.updateFeeds(manifest);
  assert.equal(feeds.length, 3);
  for (const feed of feeds) {
    const target = feed.path.split('/')[2], [platform, arch] = target.split('-');
    assert.equal(validateInfo(feed.info, { ...distribution, version: '0.4.0-beta.1', platform, arch }).version, version);
    assert.ok(feed.info.files[0].url.startsWith(distribution.releases + `download/v${version}/Aura-1-`));
  }
});
