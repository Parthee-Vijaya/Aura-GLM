const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const escapeHTML = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
function validate(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80) throw new Error('Skriv et projektnavn på højst 80 tegn.');
  if (typeof input.purpose !== 'string' || !input.purpose.trim() || input.purpose.length > 3000) throw new Error('Beskriv idéen med højst 3.000 tegn.');
  if (!/^#[a-f0-9]{6}$/i.test(input.color)) throw new Error('Vælg en gyldig brandfarve.');
  if (!Array.isArray(input.links) || input.links.length > 10) throw new Error('Tilføj højst ti referencelinks.');
  for (const link of input.links) {
    let url;
    try { url = new URL(link); } catch { throw new Error('Et referencelink er ugyldigt. Brug en fuld http- eller https-adresse.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Referencelinks skal være almindelige http- eller https-adresser uden loginoplysninger.');
  }
  if (!['manuel', 'automatiske'].includes(input.tests)) throw new Error('Vælg en teststrategi.');
  return { name: input.name.trim(), purpose: input.purpose.trim(), color: input.color, links: input.links, tests: input.tests };
}

async function createProject(parent, input, assets = [], profileRoot) {
  const values = validate(input);
  const slug = values.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projekt';
  const folderName = `projekt-${slug}`;
  const root = path.join(await fs.realpath(parent), folderName);
  await fs.mkdir(root); // Eksisterende mapper må aldrig genbruges eller overskrives.
  try {
    await fs.mkdir(path.join(root, 'public', 'assets'), { recursive: true });
    await fs.mkdir(path.join(root, 'references'));
    const copied = [];
    for (const asset of assets) {
      const stat = await fs.lstat(asset.path);
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Hver materialefil skal være en almindelig fil på højst 10 MB.');
      const ext = path.extname(asset.path).toLowerCase();
      if (!['reference', 'logo'].includes(asset.kind)) throw new Error('Ukendt materialetype.');
      if (asset.kind === 'logo' && !['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) throw new Error('Logoer skal være PNG, JPG eller WebP.');
      const relative = `${asset.kind === 'logo' ? 'public/assets' : 'references'}/${crypto.randomUUID()}${ext}`;
      await fs.copyFile(asset.path, path.join(root, relative), require('node:fs').constants.COPYFILE_EXCL);
      copied.push({ kind: asset.kind, name: path.basename(asset.path), file: relative });
    }
    const project = { schemaVersion: 1, ...values, template: 'statisk-web', assets: copied };
    await fs.writeFile(path.join(root, 'harness.json'), JSON.stringify(project, null, 2) + '\n', { flag: 'wx' });
    const rules = await fs.readFile(path.join(profileRoot, 'grundregler.md'), 'utf8');
    for (const file of ['AGENTS.md', 'CLAUDE.md']) await fs.writeFile(path.join(root, file), rules, { flag: 'wx' });
    await fs.writeFile(path.join(root, '.gitignore'), (await fs.readFile(path.join(profileRoot, 'gitignore.txt'), 'utf8')) + '\n# Lokalt inspirationsmateriale\n/references/\n', { flag: 'wx' });
    const logo = copied.find(asset => asset.kind === 'logo');
    await fs.writeFile(path.join(root, 'public', 'index.html'), `<!doctype html>
<html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(values.name)}</title><link rel="stylesheet" href="styles.css"></head>
<body><main>${logo ? `<img class="logo" src="${logo.file.slice(7)}" alt="Projektets logo">` : ''}<p class="label">HER BEGYNDER DIN IDÉ</p><h1>${escapeHTML(values.name)}</h1><p class="intro">${escapeHTML(values.purpose)}</p><div class="card"><h2>Plads til det, du vil skabe.</h2><p>Dette er din lokale startside. Den er oprettet fra dine valg og er endnu ikke bygget af en AI.</p></div></main></body></html>`, { flag: 'wx' });
    await fs.writeFile(path.join(root, 'public', 'styles.css'), `:root{--brand:${values.color}}*{box-sizing:border-box}body{margin:0;background:#f8f7f3;color:#172c2b;font:17px/1.6 system-ui}main{max-width:900px;margin:auto;padding:70px 36px}.logo{max-width:180px;max-height:90px;object-fit:contain}.label{font-size:11px;font-weight:700;letter-spacing:.2em;color:var(--brand)}h1{font:clamp(38px,7vw,72px)/1.1 Georgia,serif;overflow-wrap:anywhere}.intro{max-width:600px;white-space:pre-wrap}.card{margin-top:45px;padding:30px;border:1px solid #d9dfd7;border-top:4px solid var(--brand);border-radius:16px;background:white}h2{font-size:22px}`, { flag: 'wx' });
    await fs.writeFile(path.join(root, 'README.md'), `# ${values.name}\n\n${values.purpose}\n\nÅbn projektmappen i AI Harness for lokal forhåndsvisning. Kun public/ vises.\n\nProjektvalg ligger i harness.json. Referencer ligger i references/ og er ikke offentlige. Logoer i public/assets/ er offentligt indhold ved udgivelse.\n\nTeststrategi: ${values.tests}. Der er endnu ikke oprettet tests eller Git-repository. Der er ingen AI-forbindelse eller hosting i denne milepæl.\n`, { flag: 'wx' });
    return { root, ...project };
  } catch (error) {
    throw new Error(`Projektoprettelsen blev afbrudt. Eventuelle filer er bevaret i ${root}. ${error.message}`);
  }
}

async function openProject(folder) {
  const root = await fs.realpath(folder);
  const manifest = path.join(root, 'harness.json');
  const info = await fs.lstat(manifest);
  if (!info.isFile() || info.size > 100_000) throw new Error('Projektfilen er ugyldig.');
  let project;
  try { project = JSON.parse(await fs.readFile(manifest, 'utf8')); }
  catch { throw new Error('Projektfilen harness.json kan ikke læses som et gyldigt projekt.'); }
  validate(project);
  if (project.schemaVersion !== 1 || project.template !== 'statisk-web') throw new Error('Denne projekttype understøttes endnu ikke.');
  if (!(await fs.lstat(path.join(root, 'public'))).isDirectory()) throw new Error('Projektets public-mappe mangler eller er et symbolsk link.');
  return { ...project, root };
}
module.exports = { createProject, openProject, validate };
