const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { repository, names, releaseFiles } = require('./cli-release-contract.cjs');
async function api(endpoint, binary = false) {
  const { stdout } = await run('gh', ['api', endpoint, ...(binary ? ['-H', 'Accept: application/octet-stream'] : [])],
    { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return binary ? stdout : JSON.parse(stdout);
}
function selectDraft(releases, tag) {
  if (!/^cli-v/.test(tag)) throw new Error('Ugyldigt CLI-tag.');
  names(tag.slice(5));
  const found = releases.filter(r => r.tag_name === tag);
  if (found.length !== 1 || found[0].draft !== true || !Number.isSafeInteger(found[0].id) || found[0].id <= 0) throw new Error('Der skal findes præcis én CLI-kladde ved tagget.');
  return found[0];
}
function validateAssetIDs(release) {
  const files = releaseFiles(release, { draft: true });
  if (files.length !== 6 || new Set(files.map(a => a.id)).size !== files.length) throw new Error('Kladdefilerne er ufuldstændige eller gentager et fil-ID.');
  for (const a of files) {
    if (!Number.isSafeInteger(a.id) || a.id <= 0 || a.url !== `https://api.github.com/repos/${repository}/releases/assets/${a.id}`) throw new Error('Kladdefilens API-adresse matcher ikke repository og fil-ID.');
  }
  return files;
}
async function download(tag, directory, metadataPath) {
  const { stdout } = await run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { maxBuffer: 16 * 1024 * 1024 });
  const selected = selectDraft(JSON.parse(stdout).flat(), tag);
  const release = await api(`repos/${repository}/releases/${selected.id}`);
  if (selectDraft([release], tag).id !== selected.id) throw new Error('Kladde-ID ændret under opslag.');
  const files = validateAssetIDs(release);
  await fs.mkdir(directory); // En tidligere kontrolmappe må ikke overskrives.
  for (const asset of files) await fs.writeFile(path.join(directory, asset.name), await api(`repos/${repository}/releases/assets/${asset.id}`, true), { flag: 'wx' });
  await fs.writeFile(metadataPath, JSON.stringify(release, null, 2) + '\n', { flag: 'wx' });
  console.log(`Kladde ${release.id}: seks filer hentet via deres ID'er. Ingen udgivelse udført.`);
}
if (require.main === module) download(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectDraft, validateAssetIDs, download };
