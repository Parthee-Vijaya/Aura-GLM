// Læsende kontrol. Opretter ingen tags, commits, releases eller modelkald.
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { validateRelease, repository } = require('./release-contract.cjs');
async function check(directory, release, metadata, version) {
  if (metadata.full_name !== repository || metadata.private !== false || metadata.visibility !== 'public') throw new Error('Repositoryet skal være offentligt.');
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'release.json'), 'utf8'));
  const checksums = await fs.readFile(path.join(directory, 'SHA256SUMS.txt'), 'utf8');
  const result = validateRelease(release, manifest, checksums, version);
  for (const file of manifest.files) {
    const filename = path.join(directory, file.name), stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.size !== file.bytes) throw new Error(`Forkert filstørrelse eller filtype: ${file.name}`);
    const hash = createHash('sha256'), hash512 = createHash('sha512');
    for await (const chunk of createReadStream(filename)) { hash.update(chunk); hash512.update(chunk); }
    if (hash.digest('hex') !== file.sha256) throw new Error(`Downloadens SHA-256 stemmer ikke: ${file.name}`);
    if (file.sha512 && hash512.digest('base64') !== file.sha512) throw new Error(`Downloadens SHA-512 stemmer ikke: ${file.name}`);
  }
  return result;
}
if (require.main === module) (async () => {
  const [directory, releaseFile, repositoryFile] = process.argv.slice(2);
  if (!directory || !releaseFile || !repositoryFile) throw new Error('Angiv downloadmappe, release-JSON og repository-JSON.');
  const result = await check(path.resolve(directory), JSON.parse(await fs.readFile(releaseFile, 'utf8')), JSON.parse(await fs.readFile(repositoryFile, 'utf8')), require('../desktop/package.json').version);
  console.log(`Version ${result.version}: ${result.files.length} faktiske filer, kontrolsummer og Mac-kvitteringer er kontrolleret. Ingen udgivelse foretaget.`);
})().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { check };
