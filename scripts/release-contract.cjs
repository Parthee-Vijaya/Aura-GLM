// Fælles fil- og versionskontrol for lokale pakker, Releases og Pages.
const repository = 'ai-alliancen-org/ai-harness';
const versionPattern = /^\d+\.\d+\.\d+(?:-beta\.\d+)?$/;
const submissionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function installer(name) {
  const match = /^(Aura|AI-Harness)-(\d+\.\d+\.\d+(?:-beta\.\d+)?)-(mac|win)-(arm64|x64)\.(dmg|zip|exe)$/.exec(name || '');
  if (!match || (match[3] === 'mac' ? !['dmg', 'zip'].includes(match[5]) : match[5] !== 'exe')) return null;
  return { version: match[2], os: match[3], arch: match[4], extension: match[5], target: `${match[3]}-${match[4]}` };
}
function expectedFiles(version) {
  if (!versionPattern.test(version)) throw new Error('Ugyldigt versionsnummer.');
  return [`Aura-${version}-mac-arm64.dmg`, `Aura-${version}-mac-x64.dmg`, `Aura-${version}-win-x64.exe`];
}
function assetURL(tag, name) {
  return `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
}
function releaseFiles(release) {
  const version = release?.tag_name?.replace(/^v/, '');
  if (!versionPattern.test(version || '') || !Array.isArray(release.assets)) return [];
  const files = [], targets = new Set();
  for (const asset of release.assets) {
    const parsed = installer(asset.name);
    // ZIP-apps og filer fra en anden version må ikke forveksles med installationsprogrammet.
    if (!parsed || parsed.version !== version || parsed.extension === 'zip' || asset.state !== 'uploaded') continue;
    if (asset.browser_download_url !== assetURL(release.tag_name, asset.name)) throw new Error('Downloadadressen matcher ikke repository og version.');
    if (!Number.isSafeInteger(asset.size) || asset.size <= 0 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '')) continue;
    if (targets.has(parsed.target)) throw new Error('Flere installationsfiler til samme platform.');
    targets.add(parsed.target); files.push({ ...asset, ...parsed });
  }
  return files.sort((a, b) => a.target.localeCompare(b.target));
}
function validateRelease(release, manifest, checksums, version) {
  const names = expectedFiles(version);
  if (release?.draft !== true || release.tag_name !== `v${version}`) throw new Error('Udgivelsen skal være en kladde med det aftalte versionstag.');
  if (!release.prerelease || !release.body?.trim()) throw new Error('Kladdeudgivelsen mangler betamarkering eller udgivelsesnoter.');
  if (manifest?.version !== version || !Array.isArray(manifest.files) || manifest.files.length !== names.length) throw new Error('Filoversigten skal indeholde præcis de tre installationsfiler fra denne version.');
  const assets = releaseFiles(release);
  const allowed = new Set([...names, 'release.json', 'SHA256SUMS.txt']);
  if (release.assets.length !== allowed.size || new Set(release.assets.map(a => a.name)).size !== allowed.size || release.assets.some(a => !allowed.has(a.name) || a.state !== 'uploaded' || a.browser_download_url !== assetURL(release.tag_name, a.name))) throw new Error('Release må kun indeholde de tre installationsfiler, release.json og SHA256SUMS.txt.');
  for (const name of names) {
    const entries = manifest.files.filter(f => f.name === name), asset = assets.find(a => a.name === name);
    const file = entries[0];
    if (entries.length !== 1 || !asset || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || file.bytes !== asset.size || `sha256:${file.sha256}` !== asset.digest) throw new Error(`Fil, størrelse eller SHA-256 stemmer ikke: ${name}`);
    if (asset.os === 'mac' && (file.notarized !== true || !submissionIdPattern.test(file.notarization?.id || '') || !Number.isFinite(Date.parse(file.notarization?.checkedAt)))) throw new Error(`Mac-pakken mangler en kvittering for den konkrete fil: ${name}`);
  }
  const expected = manifest.files.map(f => `${f.sha256}  ${f.name}`).sort();
  if (JSON.stringify(checksums.trim().split(/\r?\n/).sort()) !== JSON.stringify(expected)) throw new Error('SHA256SUMS.txt stemmer ikke med filoversigten.');
  return { version, files: names };
}
function releaseSnapshot(release) {
  // Downloadtælleren ændres af vores egen kontrol. Sammenlign kun udgivelsens indhold.
  return JSON.stringify({ id: release.id, tag: release.tag_name, target: release.target_commitish, draft: release.draft, prerelease: release.prerelease, name: release.name, body: release.body, assets: release.assets.map(a => ({ id: a.id, name: a.name, state: a.state, size: a.size, digest: a.digest, url: a.browser_download_url })).sort((a, b) => a.name.localeCompare(b.name)) });
}
module.exports = { repository, installer, expectedFiles, assetURL, releaseFiles, validateRelease, releaseSnapshot, submissionIdPattern };
