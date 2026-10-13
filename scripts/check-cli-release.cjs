const fs = require('node:fs/promises');
const { check } = require('./build-cli-release.cjs');
const { validateRelease } = require('./cli-release-contract.cjs');
async function main(directory, releasePath) {
  const { files, manifest } = await check(directory, { commit: process.env.GITHUB_SHA });
  validateRelease(JSON.parse(await fs.readFile(releasePath)), files, manifest.version);
  console.log('Den uploadede CLI-pakke matcher kildekode, kontrolsummer og releasefiler. Ingen udgivelse udført.');
}
if (require.main === module) main(...process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
