const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const { repository, releaseFiles } = require('./release-contract.cjs');
const cli = require('./cli-release-contract.cjs');
// Publish only the reviewed README artwork, never the complete docs directory.
const pageImages = ['aura-icon.png', 'aura-arbejdsomraade.png', 'aura-funktioner.png', 'aura-eksempel.png'];
function render(releases, metadata) {
  if (!Array.isArray(releases) || metadata.full_name !== repository || typeof metadata.private !== 'boolean') throw new Error('Ugyldige repository- eller releasedata.');
  const available = releases.filter(r => !r.draft && Number.isFinite(Date.parse(r.published_at)) && Array.isArray(r.assets))
    .sort((a,b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .map(release => ({ release, files: releaseFiles(release) }));
  const { release, files } = available.find(r => r.files.length) || {};
  const access = metadata.private ? '<p><strong>Adgang for inviterede testere.</strong> Downloads kræver login på GitHub og adgang til det private repository.</p>' : '';
  if (!release) return access + '<p>Der er endnu ingen offentliggjort testversion. Downloadknapper vises, når installationsfilerne er udgivet.</p>';
  const prefix = `https://github.com/${repository}/releases/download/${encodeURIComponent(release.tag_name)}/`;
  const links = files.map(a => {
    const expected = prefix + encodeURIComponent(a.name);
    if (a.browser_download_url !== expected) throw new Error('Downloadadressen matcher ikke repository og version.');
    const mac = a.name.includes('-mac-');
    const label = mac ? (a.name.includes('-arm64.') ? 'Mac · Apple-chip' : 'Mac · Intel') : (a.name.includes('-arm64.') ? 'Windows · ARM64' : 'Windows · x64');
    return `<article class="artifact"><a class="button" href="${escape(expected)}">Hent ${label}</a><small>${Math.ceil(a.size / 1024 / 1024)} MB · Testversion</small><details><summary>Se detaljer</summary><small>${escape(a.name)}<br>Signering og ${mac?'notarisation':'Windows-afprøvning'}: se udgivelsesnoterne.<br>SHA-256: ${a.digest.slice(7)}</small></details></article>`;
  }).join('');
  return access + `<p>Senest udgivet: <strong>${escape(release.tag_name)}</strong>${release.prerelease ? ' · testversion' : ''}.</p>` + (links || '<p>Versionen har endnu ingen installationsfiler.</p>') + `<p><a href="https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}">Læs udgivelsesnoter og installationsstatus ↗</a></p>`;
}
function renderCLI(releases, metadata) {
  if (!Array.isArray(releases) || metadata.full_name !== repository || typeof metadata.private !== 'boolean') throw new Error('Ugyldige CLI-releasedata.');
  const available = releases.filter(r => !r.draft && Number.isFinite(Date.parse(r.published_at)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))
    .map(release => ({ release, files: cli.releaseFiles(release) }));
  const entry = available.find(r => r.files.length);
  if (!entry) return '<p>Terminalpakken er endnu ikke offentliggjort. Du kan læse vejledningerne nedenfor eller <a href="https://github.com/' + repository + '/blob/main/cli/README.md">starte fra kildekoden</a>.</p>';
  const { release, files } = entry, file = files[0];
  const access = metadata.private ? '<p>Download kræver GitHub-login og adgang til repositoryet.</p>' : '';
  return access + `<p>Version <strong>${escape(release.tag_name.slice(5))}</strong> · terminalbeta</p>
    <a class="button" href="${escape(file.browser_download_url)}">Hent terminalpakken</a>
    <p class="boundary">${Math.ceil(file.size / 1024)} KB · samme fil til Windows, Linux og macOS. npm henter OpenCode ved installation.</p>
    <details><summary>Kontrolsum og udgivelsesnoter</summary>
    <p class="checksum">SHA-256: <code>${file.digest.slice(7)}</code></p>
    <p><a href="${escape(files.find(f => f.name === 'SHA256SUMS.txt').browser_download_url)}">Hent kontrolsummer</a> · <a href="${escape(files.find(f => f.name === 'CLI-RELEASE.json').browser_download_url)}">Se kildeversion og filoversigt</a></p>
    <p><a href="https://github.com/${repository}/releases/tag/${encodeURIComponent(release.tag_name)}">Læs udgivelsesnoterne på GitHub ↗</a></p></details>`;
}
function cliGuides(releases) {
  const latest = releases.filter(r => !r.draft && Number.isFinite(Date.parse(r.published_at)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)).find(r => cli.releaseFiles(r).length);
  const platforms = [{ name: 'Windows', guide: 'WINDOWS.md', description: 'PowerShell og CMD. Endnu ikke afprøvet på Windows.' },
    { name: 'Linux', guide: 'LINUX.md', description: 'Terminal med eller uden skrivebord. Endnu ikke afprøvet på Linux.' },
    { name: 'macOS', guide: 'MACOS.md', description: 'Afprøvet på Apple Silicon med lokal testmodel. Intel-Mac mangler.' }];
  return platforms.map(p => `<article class="platform"><h3>${p.name}</h3><p>${p.description}</p><a href="https://github.com/${repository}/blob/${latest ? encodeURIComponent(latest.tag_name) : 'main'}/cli/${p.guide}">Åbn vejledning til ${p.name} →</a></article>`).join('\n');
}
async function build(releases, metadata, output = path.join(root, '.cache/pages')) {
  const fragment = render(releases, metadata);
  await fs.mkdir(output, {recursive:true});
  await fs.cp(path.join(root, 'site/dist'), output, {recursive:true});
  await fs.mkdir(path.join(output, 'images'), {recursive:true});
  for (const name of pageImages) {
    await fs.copyFile(path.join(root, 'docs/images', name), path.join(output, 'images', name));
  }
  await fs.copyFile(path.join(root, 'site/dist/index.html'), path.join(output, 'pakker.html'));
  let html = await fs.readFile(path.join(root, 'site/dist/overview.html'), 'utf8');
  html = html.replace(/<!-- artifacts -->[\s\S]*?<!-- \/artifacts -->/, fragment);
  await fs.writeFile(path.join(output, 'index.html'), html);
  const desktop = (await fs.readFile(path.join(root, 'site/dist/desktop.html'), 'utf8')).replace(/<!-- artifacts -->[\s\S]*?<!-- \/artifacts -->/, fragment);
  await fs.writeFile(path.join(output, 'desktop.html'), desktop);
  const terminal = (await fs.readFile(path.join(root, 'site/dist/terminal.html'), 'utf8'))
    .replace(/<!-- cli-artifacts -->[\s\S]*?<!-- \/cli-artifacts -->/, renderCLI(releases, metadata))
    .replace(/<!-- cli-guides -->[\s\S]*?<!-- \/cli-guides -->/, cliGuides(releases));
  await fs.writeFile(path.join(output, 'terminal.html'), terminal);
  await fs.writeFile(path.join(output, '.nojekyll'), '');
  return output;
}
if (require.main === module) Promise.all(process.argv.slice(2,4).map(f => fs.readFile(f,'utf8').then(JSON.parse)))
  .then(([releases,metadata]) => build(releases,metadata))
  .then(p => console.log(`Pages-side bygget i ${p}. Ingen installationsfiler eller adgangstokens kopieret.`))
  .catch(e => {console.error(e.message);process.exitCode=1;});
module.exports = {render,renderCLI,cliGuides,build};
