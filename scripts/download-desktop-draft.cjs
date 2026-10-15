const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const { pipeline } = require('node:stream/promises');
const { createWriteStream } = require('node:fs');
const run = promisify(execFile);
const { repository, expectedFiles, releaseBinaries, matchesAssetURL } = require('./release-contract.cjs');
function selectDraft(releases, tag) {
  if (!tag.startsWith('v')) throw new Error('Ugyldigt desktoptag.');
  expectedFiles(tag.slice(1));
  const found = releases.filter(r => r.tag_name === tag);
  if (found.length !== 1 || found[0].draft !== true || !Number.isSafeInteger(found[0].id) || found[0].id <= 0) throw new Error('Der skal findes præcis én desktopkladde ved tagget.');
  return found[0];
}
function validateAssetIDs(release) {
  selectDraft([release], release.tag_name);
  const names = [...releaseBinaries(release.tag_name.slice(1)), 'release.json', 'SHA256SUMS.txt'];
  const files = release.assets;
  if (!Array.isArray(files) || files.length !== names.length || new Set(files.map(a => a.name)).size !== names.length || new Set(files.map(a => a.id)).size !== names.length) throw new Error('Desktopkladden skal indeholde alle de krævede filer med forskellige fil-IDer.');
  for (const asset of files) {
    if (!names.includes(asset.name) || asset.state !== 'uploaded' || !Number.isSafeInteger(asset.size) || asset.size <= 0 || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') || !Number.isSafeInteger(asset.id) || asset.id <= 0 || asset.url !== `https://api.github.com/repos/${repository}/releases/assets/${asset.id}` || !matchesAssetURL(release, asset, { draft: true })) throw new Error('Kladdefilens oplysninger matcher ikke repository, version og fil-ID.');
  }
  return files;
}
async function download(tag, directory, metadataPath) {
  const { stdout } = await run('gh', ['api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`], { maxBuffer: 16 * 1024 * 1024 });
  const selected = selectDraft(JSON.parse(stdout).flat(), tag);
  const response = await run('gh', ['api', `repos/${repository}/releases/${selected.id}`], { maxBuffer: 16 * 1024 * 1024 });
  const release = JSON.parse(response.stdout);
  if (selectDraft([release], tag).id !== selected.id) throw new Error('Kladde-ID ændret under opslag.');
  const files = validateAssetIDs(release);
  await fs.mkdir(directory);
  for (const asset of files) {
    // Installerfiler streames til en ny fil; tidligere downloads overskrives aldrig.
    const child = spawn('gh', ['api', `repos/${repository}/releases/assets/${asset.id}`, '-H', 'Accept: application/octet-stream'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => code === 0 ? resolve() : reject(new Error('Download af installationsfil fejlede.'))); });
    try { await Promise.all([completed, pipeline(child.stdout, createWriteStream(path.join(directory, asset.name), { flags: 'wx' }))]); }
    catch (error) { child.kill(); throw error; }
  }
  await fs.writeFile(metadataPath, JSON.stringify(release, null, 2) + '\n', { flag: 'wx' });
  console.log(`Kladde ${release.id}: ${files.length} filer hentet via deres ID'er. Ingen udgivelse udført.`);
}
if (require.main === module) download(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { selectDraft, validateAssetIDs, download };
