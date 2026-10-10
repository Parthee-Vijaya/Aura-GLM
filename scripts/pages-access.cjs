const fs = require('node:fs/promises');
const repository = 'ai-alliancen-org/ai-harness';

// Begge svar skal være hentet fra GitHub umiddelbart før den handling, de beskytter.
function assertPublicPages(metadata, pages) {
  if (metadata?.full_name !== repository || metadata.private !== false || metadata.visibility !== 'public') {
    throw new Error('Udgivelse stoppet: Aura Harness-repositoryet skal være offentligt. Workflowet ændrer ikke synligheden.');
  }
  if (pages?.public !== true || pages.build_type !== 'workflow') {
    throw new Error('Udgivelse stoppet: Pages skal være offentlig og bruge GitHub Actions som byggekilde. Ukendt adgang eller automatisk branch-bygning accepteres ikke.');
  }
}

if (require.main === module) {
  Promise.all(process.argv.slice(2, 4).map(file => fs.readFile(file, 'utf8').then(JSON.parse)))
    .then(([metadata, pages]) => { assertPublicPages(metadata, pages); console.log('Offentligt repository og offentlig Pages med Actions som byggekilde er kontrolleret.'); })
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { assertPublicPages };
