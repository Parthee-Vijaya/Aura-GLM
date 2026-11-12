// Local macOS release without CI. Run from desktop/ on the Mac that publishes:
//   node scripts/release-local.cjs build [--from <previous .app or .dmg>]
//   node scripts/release-local.cjs publish <candidate folder>
// build installs, tests, packages and qualifies one beta, and collects the files in a new
// candidate folder. It never uploads, tags or pushes. publish is a separate decision: it
// uploads the candidate as a draft, compares GitHub's bytes with the tested files and only
// then makes the prerelease public. Nothing local is deleted and no tag is ever moved.
'use strict';
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const semver = require('semver');
const distribution = require('../core/distribution.cjs');
const { assetURL, matchesAssetURL } = require('../../scripts/release-contract.cjs');

const desktop = path.join(__dirname, '..'), repositoryRoot = path.join(desktop, '..');
const TARGET = 'darwin-arm64';
const betaPattern = /^(\d+\.\d+\.\d+)-beta\.(\d+)$/;
const SIGNING = 'Ad hoc-signeret med hardened runtime og ikke Apple-notariseret';

function names(version) {
  const match = betaPattern.exec(version || '');
  if (!match) throw Error('Versionen skal have formen X.Y.Z-beta.N.');
  const base = `${distribution.artifactPrefix}-${version}-mac-arm64`;
  return { tag: 'v' + version, title: `${distribution.displayName} ${match[1]} beta ${match[2]}`, dmg: base + '.dmg', zip: base + '.zip',
    feed: 'beta-mac.yml', sums: 'SHA256SUMS.txt', notes: `docs/releases/aura-prime-${version}.md` };
}

// electron-builder writes a feed with both the ZIP and the DMG. The installed app accepts
// exactly one entry, the update ZIP under its relative name (core/updates.cjs), so the
// published feed is written here in the shape released with 0.6.0-beta.7.
function feed({ version, sha512, size, releaseDate }) {
  const { zip } = names(version);
  if (!/^[A-Za-z0-9+/]{86}==$/.test(sha512 || '')) throw Error('Opdateringsarkivets SHA-512 er ugyldig.');
  if (!Number.isSafeInteger(size) || size <= 0) throw Error('Opdateringsarkivets størrelse er ugyldig.');
  return { version, files: [{ url: zip, sha512, size }], path: zip, sha512, critical: false, message: '', releaseDate };
}

function checksums(files) {
  for (const file of files) if (!file.name || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw Error(`Ugyldig SHA-256 for ${file.name || 'en fil uden navn'}.`);
  return files.map(file => `${file.sha256}  ${file.name}`).join('\n') + '\n';
}

function problems({ platform, arch, node, version, dirty, tagExists, notesExist, onMain }) {
  const found = [], beta = betaPattern.test(version || '');
  if (platform !== 'darwin' || arch !== 'arm64') found.push(`Udgivelsen bygges på en Mac med Apple-chip. Denne maskine er ${platform}-${arch}.`);
  if (!semver.valid(node) || semver.lt(node, '22.12.0')) found.push(`Bygningen kræver Node 22.12 eller nyere. Denne terminal bruger ${node}.`);
  if (!beta) found.push('Versionen i desktop/package.json skal have formen X.Y.Z-beta.N.');
  if (dirty) found.push('Arbejdsmappen har ændringer, som ikke er committet. Pakken skal bygges fra en ren commit.');
  if (tagExists) found.push(`Tagget v${version} findes allerede. Et tag flyttes eller genbruges ikke; vælg næste version.`);
  if (beta && !notesExist) found.push(`Udgivelsesnoterne ${names(version).notes} mangler.`);
  if (!onMain) found.push('Den aktuelle commit ligger ikke på origin/main. Udgiv fra den gennemgåede main.');
  return found;
}

// Paths are relative to desktop/, where every step runs.
function buildPlan({ version, from, candidate }) {
  const n = names(version);
  if (!from) throw Error('Angiv den forrige udgivelse til opgraderingsprøven.');
  const app = path.join('release', 'mac-arm64', `${distribution.displayName}.app`);
  return [
    { id: 'install', title: 'Installerer afhængigheder fra låsefilen', command: 'npm', args: ['ci'] },
    { id: 'runtime', title: 'Klargør medfølgende Node, Git og OpenCode', command: 'npm', args: ['run', 'runtime:prepare', '--', TARGET] },
    { id: 'check', title: 'Kører den samlede lokale kontrol af kildekoden', command: 'node', args: [path.join('..', 'scripts', 'check.cjs')], capture: true },
    { id: 'package', title: 'Bygger og ad hoc-signerer app, DMG og ZIP', command: 'npm', args: ['run', 'package:mac', '--', '--arm64'], env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' } },
    { id: 'package-source', title: 'Sammenligner pakkens kode og profiler med kildekoden', command: 'node', args: ['scripts/verify-package-source.cjs', path.join(app, 'Contents', 'Resources'), TARGET] },
    { id: 'package-test', title: 'Afprøver den pakkede app i en separat profil', command: 'npm', args: ['run', 'test:package', '--', app] },
    { id: 'package-acceptance', title: 'Kører accepttrinene og opgraderingen fra forrige udgivelse', command: 'npm', args: ['run', 'test:package-acceptance', '--', '--app', app, '--from', from, '--out', path.join(candidate, 'acceptance.json')] },
    { id: 'mac-artifacts', title: 'Kontrollerer DMG og ZIP mod den afprøvede app', command: 'node', args: ['scripts/verify-mac-artifacts.cjs', app, path.join('release', n.dmg), path.join('release', n.zip), TARGET, path.join(candidate, 'mac-artifacts.json'), '--local-ad-hoc'] }
  ];
}

function testCounts(output) {
  const read = label => { const match = new RegExp(`^# ${label} (\\d+)$`, 'm').exec(output || ''); return match ? Number(match[1]) : null; };
  const pass = read('pass'), skip = read('skipped'), fail = read('fail');
  return [pass, skip, fail].includes(null) ? null : { pass, skip, fail };
}

function previousRelease(releases, version) {
  const candidates = [];
  for (const release of releases) {
    const found = /^v(.+)$/.exec(release.tag_name || '')?.[1];
    if (release.draft || !betaPattern.test(found || '') || !semver.lt(found, version)) continue;
    const asset = (release.assets || []).find(asset => asset.name === names(found).dmg && asset.state === 'uploaded' && /^sha256:[a-f0-9]{64}$/.test(asset.digest || ''));
    if (asset) candidates.push({ version: found, tag: release.tag_name, name: asset.name, sha256: asset.digest.slice(7) });
  }
  if (!candidates.length) return null;
  const { tag, name, sha256 } = candidates.sort((a, b) => semver.rcompare(a.version, b.version))[0];
  return { tag, name, sha256 };
}

function releaseBody(notes, { commit, fullChecks, acceptance, files }) {
  const lines = [`Bygget fra \`${commit}\` til macOS på Apple Silicon på udgiverens egen Mac, uden CI. ${SIGNING}.`, ''];
  if (fullChecks) lines.push(`- Samlet lokal kontrol: ${fullChecks.pass} bestået, ${fullChecks.skip} sprunget over, ${fullChecks.fail} fejl.`);
  if (acceptance) lines.push(`- Den færdige pakke: ${acceptance.passedSteps} accepttrin, opgradering fra ${acceptance.from}. Det er profilmigration med en lokal testmodel, ikke automatisk download og installation.`);
  lines.push('- DMG og ZIP er kontrolleret mod den afprøvede app. Kontrollen er lokal og ad hoc; den kvalificerer ikke notariseret distribution.');
  return `${notes.trimEnd()}\n\n## Bygning og kontrol\n\n${lines.join('\n')}\n\n## Kontrolsummer\n\n${files.map(file => `- \`${file.name}\`: SHA-256 \`${file.sha256}\``).join('\n')}\n`;
}

// GitHub must hold exactly the tested files. A draft has temporary download addresses;
// a public release must use the address the installed app builds from version and name.
function verifyUploaded(release, { version, files, draft = false }) {
  const { tag } = names(version);
  if (release?.tag_name !== tag || release.prerelease !== true || release.draft !== draft) throw Error(`Udgivelsen på GitHub er ikke ${draft ? 'kladden' : 'den offentlige beta'} for ${tag}.`);
  const assets = release.assets || [];
  if (assets.length !== files.length || new Set(assets.map(asset => asset.name)).size !== files.length) throw Error(`Udgivelsen skal indeholde præcis ${files.length} filer.`);
  for (const file of files) {
    const asset = assets.find(asset => asset.name === file.name);
    if (!asset || asset.state !== 'uploaded' || asset.size !== file.bytes || asset.digest !== 'sha256:' + file.sha256) throw Error(`${file.name} på GitHub matcher ikke den afprøvede fil.`);
    if (draft ? !matchesAssetURL(release, asset, { draft: true }) : asset.browser_download_url !== assetURL(tag, asset.name)) throw Error(`Downloadadressen for ${file.name} matcher ikke repository og version.`);
  }
  return files.length;
}

async function digest(file) {
  const sha256 = createHash('sha256'), sha512 = createHash('sha512');
  let bytes = 0;
  for await (const chunk of createReadStream(file)) { sha256.update(chunk); sha512.update(chunk); bytes += chunk.length; }
  return { bytes, sha256: sha256.digest('hex'), sha512: sha512.digest('base64') };
}
function run({ command, args, env = {}, capture = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: desktop, env: { ...process.env, ...env }, stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit' });
    let tail = '';
    if (capture) child.stdout.on('data', chunk => { process.stdout.write(chunk); tail = (tail + chunk).slice(-16384); });
    child.on('error', reject);
    child.on('close', (code, signal) => code === 0 ? resolve(tail) : reject(Error(`Stoppet: ${[command, ...args].join(' ')} sluttede med ${signal || 'kode ' + code}.`)));
  });
}
// Everything build and publish read from or start on the machine. The tests replace it.
const system = {
  desktop, platform: process.platform, arch: process.arch, node: process.versions.node, now: () => new Date(), run, pause: 2000,
  say: text => { process.stdout.write(text + '\n'); },
  git: (...args) => execFileSync('git', args, { cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
  gitSucceeds: (...args) => spawnSync('git', args, { cwd: repositoryRoot, stdio: 'ignore' }).status === 0,
  gh: (...args) => execFileSync('gh', args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] })
};
const releases = sys => JSON.parse(sys.gh('api', `repos/${distribution.repository}/releases?per_page=100`));
const remoteTagExists = (tag, sys) => sys.git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`) !== '';
function refuse(found) {
  if (found.length) throw Error(['Udgivelsen kan ikke bygges endnu:', ...found.map(problem => '- ' + problem)].join('\n'));
}
// Git state that can be read without the network. The remote is only asked when the
// machine and the checkout can build at all.
function localFacts(sys) {
  const version = require('../package.json').version, beta = betaPattern.test(version || '');
  return { platform: sys.platform, arch: sys.arch, node: sys.node, version,
    dirty: sys.git('status', '--porcelain') !== '',
    tagExists: beta && sys.gitSucceeds('rev-parse', '--verify', '--quiet', `refs/tags/v${version}`),
    notesExist: beta && sys.gitSucceeds('cat-file', '-e', `HEAD:${names(version).notes}`) };
}

async function previousPackage(version, from, sys) {
  if (from) return { path: path.resolve(from) };
  let listed;
  try { listed = releases(sys); } catch { throw Error('GitHub CLI kunne ikke hente udgivelserne. Kør gh auth login, eller angiv --from <forrige .app eller .dmg>.'); }
  const previous = previousRelease(listed, version);
  if (!previous) throw Error('Ingen tidligere udgivelse med en Mac-installationsfil blev fundet. Angiv --from <forrige .app eller .dmg>.');
  const folder = path.join(sys.desktop, 'release', 'previous'), file = path.join(folder, previous.name);
  await fs.mkdir(folder, { recursive: true });
  if (!await fs.stat(file).then(stat => stat.isFile(), () => false)) {
    sys.say(`\n== Henter ${previous.name} til opgraderingsprøven`);
    await sys.run({ command: 'gh', args: ['release', 'download', previous.tag, '--repo', distribution.repository, '--pattern', previous.name, '--dir', folder] });
  }
  if ((await digest(file)).sha256 !== previous.sha256) throw Error(`${file} matcher ikke GitHubs kontrolsum for ${previous.tag}. Flyt filen og kør igen.`);
  return { path: file, tag: previous.tag, sha256: previous.sha256 };
}

async function build({ from } = {}, sys = system) {
  const local = localFacts(sys);
  refuse(problems({ ...local, onMain: true }));
  sys.git('fetch', '--quiet', 'origin', 'main');
  refuse(problems({ ...local, tagExists: local.tagExists || remoteTagExists('v' + local.version, sys), onMain: sys.gitSucceeds('merge-base', '--is-ancestor', 'HEAD', 'origin/main') }));
  const version = local.version, n = names(version), commit = sys.git('rev-parse', 'HEAD');
  const stamp = sys.now().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-');
  const candidate = path.join(sys.desktop, 'release', `candidate-${version}-${stamp}`);
  const previous = await previousPackage(version, from, sys);
  await fs.mkdir(path.dirname(candidate), { recursive: true });
  await fs.mkdir(candidate); // A candidate folder is never reused or overwritten.
  const steps = []; let fullChecks = null;
  for (const step of buildPlan({ version, from: previous.path, candidate })) {
    sys.say(`\n== ${step.title}`);
    const started = Date.now(), output = await sys.run(step);
    if (step.id === 'check') fullChecks = testCounts(output);
    steps.push({ id: step.id, title: step.title, seconds: Math.round((Date.now() - started) / 1000) });
  }
  const acceptance = JSON.parse(await fs.readFile(path.join(candidate, 'acceptance.json'), 'utf8'));
  const artifacts = JSON.parse(await fs.readFile(path.join(candidate, 'mac-artifacts.json'), 'utf8'));
  if (acceptance.status !== 'passed' || artifacts.status !== 'bestået') throw Error('Pakkeprøvens rapporter viser ikke et bestået resultat.');
  sys.say('\n== Samler de afprøvede filer');
  const files = [];
  for (const name of [n.dmg, n.zip]) {
    await fs.copyFile(path.join(sys.desktop, 'release', name), path.join(candidate, name), fs.constants.COPYFILE_EXCL);
    files.push({ name, ...await digest(path.join(candidate, name)) });
  }
  if (files[0].sha256 !== artifacts.artifacts?.dmg?.sha256 || files[1].sha256 !== artifacts.artifacts?.zip?.sha256) throw Error('De samlede filer er ikke de filer, pakkekontrollen afprøvede.');
  const write = async (name, text) => { await fs.writeFile(path.join(candidate, name), text, { flag: 'wx' }); return { name, ...await digest(path.join(candidate, name)) }; };
  files.push(await write(n.feed, JSON.stringify(feed({ version, sha512: files[1].sha512, size: files[1].bytes, releaseDate: sys.now().toISOString() }), null, 2) + '\n'));
  files.push(await write(n.sums, checksums(files)));
  const qualification = { format: 1, version, tag: n.tag, sourceCommit: commit, builtAt: sys.now().toISOString(), ci: false,
    host: { platform: sys.platform, arch: sys.arch, node: sys.node }, signing: SIGNING,
    previous: { tag: previous.tag || null, file: path.basename(previous.path), sha256: previous.sha256 || null },
    fullChecks, acceptance: { passedSteps: acceptance.steps.filter(step => step.status === 'pass').length, from: acceptance.from?.version || null }, steps,
    files: files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })) };
  await fs.writeFile(path.join(candidate, 'qualification.json'), JSON.stringify(qualification, null, 2) + '\n', { flag: 'wx' });
  sys.say(`\nKandidaten er bygget og afprøvet fra ${commit}.\nMappe: ${candidate}`);
  for (const file of qualification.files) sys.say(`  ${file.sha256}  ${file.name}`);
  sys.say(`\nIntet er uploadet. Åbn appen i release/mac-arm64 og se den efter. Offentliggør derefter med:\n  node scripts/release-local.cjs publish "${candidate}"`);
  return candidate;
}

async function publish(folder, sys = system) {
  if (!folder) throw Error('Angiv kandidatmappen fra build.');
  const candidate = path.resolve(folder);
  const qualification = JSON.parse(await fs.readFile(path.join(candidate, 'qualification.json'), 'utf8').catch(() => { throw Error(`Kandidatmappen mangler qualification.json fra build: ${candidate}`); }));
  const { version, sourceCommit: commit, files } = qualification, n = names(version), repository = distribution.repository;
  if (!/^[a-f0-9]{40}$/.test(commit || '') || !Array.isArray(files) || files.map(file => file.name).join('|') !== [n.dmg, n.zip, n.feed, n.sums].join('|')) throw Error('Kandidatmappen har ikke en gyldig kvalifikation fra build.');
  sys.say('== Kontrollerer, at filerne er uændrede siden afprøvningen');
  for (const file of files) {
    const current = await digest(path.join(candidate, file.name));
    if (current.sha256 !== file.sha256 || current.bytes !== file.bytes) throw Error(`${file.name} er ændret siden afprøvningen. Byg en ny kandidat.`);
  }
  if (await fs.readFile(path.join(candidate, n.sums), 'utf8') !== checksums(files.slice(0, 3))) throw Error('SHA256SUMS.txt matcher ikke de afprøvede filer.');
  try { sys.gh('auth', 'status'); } catch { throw Error('GitHub CLI er ikke logget ind. Kør gh auth login og prøv igen.'); }
  sys.git('fetch', '--quiet', 'origin', 'main');
  if (!sys.gitSucceeds('merge-base', '--is-ancestor', commit, 'origin/main')) throw Error('Den afprøvede commit ligger ikke på origin/main.');
  const find = () => releases(sys).find(release => release.tag_name === n.tag);
  let release = find();
  if (release && !release.draft) throw Error(`${n.tag} er allerede udgivet. En udgivelse overskrives ikke.`);
  if (!release && remoteTagExists(n.tag, sys)) throw Error(`Tagget ${n.tag} findes allerede uden en kladde. Et tag flyttes eller genbruges ikke.`);
  if (!release) {
    const body = path.join(candidate, 'release-body.md');
    await fs.writeFile(body, releaseBody(sys.git('show', `${commit}:${n.notes}`), { commit, fullChecks: qualification.fullChecks, acceptance: qualification.acceptance?.from ? qualification.acceptance : null, files: files.slice(0, 3) }));
    sys.say(`\n== Uploader ${files.length} filer til en kladde for ${n.tag}`);
    await sys.run({ command: 'gh', args: ['release', 'create', n.tag, '--repo', repository, '--target', commit, '--draft', '--prerelease', '--title', n.title, '--notes-file', body, ...files.map(file => path.join(candidate, file.name))] });
    release = find();
    if (!release) throw Error('Kladden blev ikke fundet på GitHub efter upload.');
  } else sys.say(`\n== Fortsætter med den eksisterende kladde for ${n.tag}`);
  try { verifyUploaded(release, { version, files, draft: true }); }
  catch (error) { throw Error(`${error.message}\nKladden er ikke offentliggjort. Slet den på GitHub, og kør publish igen.`); }
  sys.say('== GitHubs filer matcher de afprøvede. Offentliggør betaen');
  const published = JSON.parse(sys.gh('api', '-X', 'PATCH', `repos/${repository}/releases/${release.id}`, '-F', 'draft=false', '-F', 'prerelease=true', '-f', 'make_latest=false'));
  // Read the public release back by its tag. GitHub creates the tag when the draft goes
  // public and may need a moment; an annotated tag is followed once.
  let failure;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, sys.pause));
    try {
      verifyUploaded(JSON.parse(sys.gh('api', `repos/${repository}/releases/tags/${n.tag}`)), { version, files });
      let tagged = JSON.parse(sys.gh('api', `repos/${repository}/git/ref/tags/${n.tag}`)).object;
      if (tagged?.type === 'tag') tagged = JSON.parse(sys.gh('api', `repos/${repository}/git/tags/${tagged.sha}`)).object;
      if (tagged?.type !== 'commit' || tagged.sha !== commit) throw Error(`Tagget ${n.tag} peger ikke på den afprøvede commit ${commit}.`);
      failure = null; break;
    } catch (error) { failure = error; }
  }
  if (failure) throw Error(`Betaen ER offentliggjort, men efterkontrollen fejlede: ${failure.message}\nKontrollér udgivelsen på GitHub: ${published.html_url}`);
  sys.say(`\n${n.title} er offentliggjort fra ${commit}:\n${published.html_url}\nInstallerede betaer finder den ved næste opdateringskontrol. README og teststatus opdateres i en særskilt commit.`);
  return published.html_url;
}

const USAGE = ['Brug, fra desktop/ på den Mac der udgiver:', '  node scripts/release-local.cjs build [--from <forrige .app eller .dmg>]', '  node scripts/release-local.cjs publish <kandidatmappe>',
  'build uploader, tagger og pusher intet. publish uploader en kladde, sammenligner GitHubs filer med de afprøvede og offentliggør først derefter.'].join('\n');
async function main([command, ...rest]) {
  if (command === 'build' && (rest.length === 0 || rest.length === 2 && rest[0] === '--from')) return build({ from: rest[1] });
  if (command === 'publish' && rest.length === 1) return publish(rest[0]);
  throw Error(USAGE);
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { names, feed, checksums, problems, buildPlan, testCounts, previousRelease, releaseBody, verifyUploaded, build, publish };
