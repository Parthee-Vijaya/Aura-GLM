// Læsende kontrol. Opretter ingen tags, commits, releases eller modelkald.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { validateRelease, repository } = require('./release-contract.cjs');
async function check(directory, release, metadata, version, fetcher = fetch) {
  if (metadata.full_name !== repository || metadata.private !== false || metadata.visibility !== 'public') throw new Error('Repositoryet skal være offentligt.');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'release.json'), 'utf8'));
  const checksums = await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
  const result = validateRelease(release, manifest, checksums, version);
  for (const file of manifest.files) {
    const filename = path.join(directory, file.name), stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.size !== file.bytes) throw new Error(`Forkert filstørrelse eller filtype: ${file.name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(filename)) hash.update(chunk);
    if (hash.digest('hex') !== file.sha256) throw new Error(`Downloadens SHA-256 stemmer ikke: ${file.name}`);
  }
  await checkKomplaiConfig(fetcher);
  return result;
}
async function checkKomplaiConfig(fetcher = fetch) {
  // En konfigurationskontrol erstatter ikke vedligeholderens rigtige login- og modelprøve.
  const response = await fetcher('https://api.komplai.dk/v1/aura/config', { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Komplai-login er ikke klar: HTTP ${response.status}.`);
  const config = await response.json();
  if (config.issuer !== 'https://auth.komplai.dk' || !/^[a-zA-Z0-9@._-]{1,200}$/.test(config.clientId || '') || config.authorizationEndpoint !== 'https://auth.komplai.dk/oauth/v2/authorize' || config.tokenEndpoint !== 'https://auth.komplai.dk/oauth/v2/token' || !Array.isArray(config.scopes) || !config.scopes.includes('openid') || !config.scopes.some(s => /^urn:zitadel:iam:org:project:id:\d+:aud$/.test(s))) throw new Error('Komplais offentlige loginopsætning er ufuldstændig.');
}
if (require.main === module) (async () => {
  const [directory, releaseFile, repositoryFile] = process.argv.slice(2);
  if (!directory || !releaseFile || !repositoryFile) throw new Error('Angiv downloadmappe, release-JSON og repository-JSON.');
  const result = await check(path.resolve(directory), JSON.parse(await fs.readFile(releaseFile, 'utf8')), JSON.parse(await fs.readFile(repositoryFile, 'utf8')), require('../desktop/package.json').version);
  console.log(`Version ${result.version}: tre faktiske filer, SHA-256, Mac-kvitteringer og offentlig Komplai-loginopsætning er kontrolleret. Ingen udgivelse foretaget.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { check, checkKomplaiConfig };
