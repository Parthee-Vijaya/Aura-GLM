const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const local = require('../scripts/release-local.cjs');
const { validateInfo, normalizeInfo } = require('../core/updates.cjs');

// The files published with 0.6.0-beta.7, read from the release on 12 November 2026.
const beta7 = {
  version: '0.6.0-beta.7',
  dmg: { name: 'Aura-Prime-0.6.0-beta.7-mac-arm64.dmg', sha256: 'f0a3599d45d7506a5babdb4eb1f4b661833c5bcfdcfc2116e027e63c30263172' },
  zip: { name: 'Aura-Prime-0.6.0-beta.7-mac-arm64.zip', sha256: 'a90fd97ee76700b9bc047958caa0327782867713fc0a9230fc259a4637694d6e', bytes: 375963100,
    sha512: 'lgqQRh/OEl8X6KCCMeEZOWBFCSvjub69ZnVzA73HkUYFRt51aFmfK3F6ZdHmKma0ngl5pl5oHJyKBcGw3dGd6g==' },
  feed: { name: 'beta-mac.yml', sha256: 'ed4962b4a7feea901817f9e2b3c9cffe1764660becaccc04e566718ef7b50f98' },
  releaseDate: '2026-11-05T19:09:36.335372+00:00'
};
const sha512 = 'A'.repeat(86) + '==';
const next = '0.8.0-beta.1';

test('names follow the released pattern and only betas are accepted', () => {
  const names = local.names(next);
  assert.equal(names.tag, 'v0.8.0-beta.1');
  assert.equal(names.title, 'Aura Prime 0.8.0 beta 1');
  assert.equal(names.dmg, 'Aura-Prime-0.8.0-beta.1-mac-arm64.dmg');
  assert.equal(names.zip, 'Aura-Prime-0.8.0-beta.1-mac-arm64.zip');
  assert.equal(names.feed, 'beta-mac.yml');
  assert.equal(names.sums, 'SHA256SUMS.txt');
  assert.equal(names.notes, 'docs/releases/aura-prime-0.8.0-beta.1.md');
  assert.equal(local.names(beta7.version).title, 'Aura Prime 0.6.0 beta 7');
  for (const bad of ['0.8.0', '0.8.0-beta', 'v0.8.0-beta.1', '0.8.0-rc.1', '', undefined]) assert.throws(() => local.names(bad), /X\.Y\.Z-beta\.N/);
});

test('the update feed has the shape of the one published with beta 7', () => {
  assert.deepEqual(local.feed({ version: beta7.version, sha512: beta7.zip.sha512, size: beta7.zip.bytes, releaseDate: beta7.releaseDate }), {
    version: '0.6.0-beta.7',
    files: [{ url: beta7.zip.name, sha512: beta7.zip.sha512, size: 375963100 }],
    path: beta7.zip.name, sha512: beta7.zip.sha512, critical: false, message: '', releaseDate: beta7.releaseDate
  });
});

test('an installed beta 7 accepts the feed, and rejects the two-file feed the builder writes', () => {
  const client = { version: beta7.version, platform: 'darwin', arch: 'arm64' };
  const feed = local.feed({ version: next, sha512, size: 1234, releaseDate: '2026-11-12T08:00:00.000Z' });
  assert.deepEqual(validateInfo(normalizeInfo(feed, client), client), { version: next, bytes: 1234, critical: false, message: '' });
  const builder = { ...feed, files: [...feed.files, { url: local.names(next).dmg, sha512, size: 99 }] };
  assert.throws(() => validateInfo(normalizeInfo(builder, client), client), /matcher ikke/);
  assert.throws(() => local.feed({ version: next, sha512: 'abc', size: 1234, releaseDate: '2026-11-12T08:00:00.000Z' }), /SHA-512/);
  assert.throws(() => local.feed({ version: next, sha512, size: 0, releaseDate: '2026-11-12T08:00:00.000Z' }), /størrelse/);
});

test('the checksum file lists installer, update archive and feed as beta 7 did', () => {
  assert.equal(local.checksums([beta7.dmg, beta7.zip, beta7.feed]),
    'f0a3599d45d7506a5babdb4eb1f4b661833c5bcfdcfc2116e027e63c30263172  Aura-Prime-0.6.0-beta.7-mac-arm64.dmg\n' +
    'a90fd97ee76700b9bc047958caa0327782867713fc0a9230fc259a4637694d6e  Aura-Prime-0.6.0-beta.7-mac-arm64.zip\n' +
    'ed4962b4a7feea901817f9e2b3c9cffe1764660becaccc04e566718ef7b50f98  beta-mac.yml\n');
  assert.throws(() => local.checksums([{ name: 'x.dmg', sha256: 'nope' }]), /SHA-256/);
});

test('a build is refused for every fact that would make the package unqualified', () => {
  const ready = { platform: 'darwin', arch: 'arm64', node: '22.23.3', version: next, dirty: false, tagExists: false, notesExist: true, onMain: true };
  assert.deepEqual(local.problems(ready), []);
  const cases = [
    [{ platform: 'linux', arch: 'x64' }, /Mac med Apple-chip/], [{ arch: 'x64' }, /Mac med Apple-chip/], [{ node: '20.11.0' }, /Node 22\.12/],
    [{ version: '0.8.0' }, /X\.Y\.Z-beta\.N/], [{ dirty: true }, /ikke er committet/], [{ tagExists: true }, /findes allerede/],
    [{ notesExist: false }, /aura-prime-0\.8\.0-beta\.1\.md/], [{ onMain: false }, /origin\/main/]
  ];
  for (const [change, message] of cases) {
    const found = local.problems({ ...ready, ...change });
    assert.equal(found.length, 1, JSON.stringify(change));
    assert.match(found[0], message);
  }
  assert.equal(local.problems({ ...ready, platform: 'linux', dirty: true, tagExists: true }).length, 3, 'every problem is reported at once');
});

test('the build plan tests the source before packaging and the finished package before anything is collected', () => {
  const plan = local.buildPlan({ version: next, from: '/tmp/previous.dmg', candidate: '/tmp/candidate' });
  assert.deepEqual(plan.map(step => step.id), ['install', 'runtime', 'check', 'package', 'package-source', 'package-test', 'package-acceptance', 'mac-artifacts']);
  const line = id => { const step = plan.find(step => step.id === id); return [step.command, ...step.args].join(' '); };
  assert.equal(line('install'), 'npm ci');
  assert.equal(line('runtime'), 'npm run runtime:prepare -- darwin-arm64');
  assert.match(line('check'), /check\.cjs$/);
  assert.equal(line('package'), 'npm run package:mac -- --arm64');
  assert.deepEqual(plan.find(step => step.id === 'package').env, { CSC_IDENTITY_AUTO_DISCOVERY: 'false' });
  const app = path.join('release', 'mac-arm64', 'Aura Prime.app');
  assert.equal(line('package-source'), `node scripts/verify-package-source.cjs ${path.join(app, 'Contents', 'Resources')} darwin-arm64`);
  assert.equal(line('package-test'), `npm run test:package -- ${app}`);
  assert.equal(line('package-acceptance'), `npm run test:package-acceptance -- --app ${app} --from /tmp/previous.dmg --out ${path.join('/tmp/candidate', 'acceptance.json')}`);
  assert.equal(line('mac-artifacts'), `node scripts/verify-mac-artifacts.cjs ${app} ${path.join('release', local.names(next).dmg)} ${path.join('release', local.names(next).zip)} darwin-arm64 ${path.join('/tmp/candidate', 'mac-artifacts.json')} --local-ad-hoc`);
  assert.ok(plan.every(step => step.title && !['gh', 'git'].includes(step.command)), 'a build never uploads, tags or pushes');
  assert.throws(() => local.buildPlan({ version: next, candidate: '/tmp/candidate' }), /forrige/);
});

test('the totals of the full check are read from the end of its output', () => {
  const output = 'ok 2573 - last test\n1..2573\n# tests 2823\n# suites 0\n# pass 2748\n# fail 0\n# cancelled 0\n# skipped 75\n# todo 0\n# duration_ms 104856.5\n';
  assert.deepEqual(local.testCounts(output), { pass: 2748, skip: 75, fail: 0 });
  assert.equal(local.testCounts('no summary here'), null);
  assert.equal(local.testCounts('# pass 3\n# fail 0\n'), null, 'a partial summary is not reported as a result');
});

test('the upgrade test starts from the newest published release below this version', () => {
  const asset = (version, digest = 'sha256:' + 'a'.repeat(64)) => ({ name: `Aura-Prime-${version}-mac-arm64.dmg`, state: 'uploaded', size: 10, digest });
  const releases = [
    { tag_name: 'v0.9.0-beta.1', draft: false, assets: [asset('0.9.0-beta.1')] },
    { tag_name: 'v0.8.0-beta.1', draft: false, assets: [asset('0.8.0-beta.1')] },
    { tag_name: 'v0.7.0-beta.1', draft: true, assets: [asset('0.7.0-beta.1')] },
    { tag_name: 'v0.6.0-beta.6', draft: false, assets: [asset('0.6.0-beta.6')] },
    { tag_name: 'v0.6.0-beta.7', draft: false, assets: [asset('0.6.0-beta.7', 'sha256:' + beta7.dmg.sha256)] },
    { tag_name: 'v0.6.0-beta.8', draft: false, assets: [] },
    { tag_name: 'cli-v9.0.0', draft: false, assets: [] }
  ];
  assert.deepEqual(local.previousRelease(releases, next), { tag: 'v0.6.0-beta.7', name: beta7.dmg.name, sha256: beta7.dmg.sha256 });
  assert.equal(local.previousRelease(releases.slice(0, 3), next), null);
});

test('the release text carries the source commit, the machine results and the checksums', () => {
  const body = local.releaseBody('# Aura Prime 0.8.0 beta 1\n\nNoter.\n', {
    commit: 'a'.repeat(40), fullChecks: { pass: 2748, skip: 34, fail: 0 }, acceptance: { passedSteps: 22, from: '0.6.0-beta.7' },
    files: [{ name: 'Aura-Prime-0.8.0-beta.1-mac-arm64.dmg', sha256: 'b'.repeat(64) }, { name: 'beta-mac.yml', sha256: 'c'.repeat(64) }]
  });
  assert.ok(body.startsWith('# Aura Prime 0.8.0 beta 1\n\nNoter.\n\n## Bygning og kontrol\n'));
  assert.match(body, new RegExp('Bygget fra `' + 'a'.repeat(40) + '`'));
  assert.match(body, /ikke Apple-notariseret/);
  assert.match(body, /2748 bestået, 34 sprunget over, 0 fejl/);
  assert.match(body, /22 accepttrin, opgradering fra 0\.6\.0-beta\.7/);
  assert.match(body, new RegExp('- `Aura-Prime-0\\.8\\.0-beta\\.1-mac-arm64\\.dmg`: SHA-256 `' + 'b'.repeat(64) + '`'));
  assert.match(body, new RegExp('- `beta-mac\\.yml`: SHA-256 `' + 'c'.repeat(64) + '`'));
  assert.doesNotMatch(local.releaseBody('Noter.', { commit: 'a'.repeat(40), fullChecks: null, acceptance: null, files: [] }), /undefined|null|NaN/);
});

test('uploaded files must match the tested files byte for byte before the release goes public', () => {
  const files = ['Aura-Prime-0.8.0-beta.1-mac-arm64.dmg', 'Aura-Prime-0.8.0-beta.1-mac-arm64.zip', 'beta-mac.yml', 'SHA256SUMS.txt']
    .map((name, index) => ({ name, bytes: 100 + index, sha256: String(index).repeat(64) }));
  const url = (tag, name) => `https://github.com/Parthee-Vijaya/Aura-Prime/releases/download/${tag}/${name}`;
  const release = ({ draft = false, tag = 'v0.8.0-beta.1' } = {}) => ({ tag_name: 'v0.8.0-beta.1', draft, prerelease: true,
    assets: files.map(file => ({ name: file.name, state: 'uploaded', size: file.bytes, digest: 'sha256:' + file.sha256, browser_download_url: url(tag, file.name) })) });
  assert.equal(local.verifyUploaded(release(), { version: next, files }), 4);
  assert.equal(local.verifyUploaded(release({ draft: true, tag: 'untagged-0123abcd' }), { version: next, files, draft: true }), 4, 'a draft has temporary addresses');
  const mutations = [
    r => { r.assets[1].digest = 'sha256:' + 'f'.repeat(64); }, r => { r.assets[0].size += 1; }, r => { r.assets.pop(); },
    r => { r.assets.push({ ...r.assets[0], name: 'debug.log' }); }, r => { r.assets[2].state = 'starter'; }, r => { r.prerelease = false; },
    r => { r.tag_name = 'v0.8.0-beta.2'; }, r => { r.assets[0].browser_download_url = url('v0.6.0-beta.7', files[0].name); },
    r => { r.assets[3].browser_download_url = r.assets[3].browser_download_url.replace('Parthee-Vijaya', 'someone-else'); }, r => { r.draft = true; }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const bad = release(); mutate(bad);
    assert.throws(() => local.verifyUploaded(bad, { version: next, files }), Error, 'mutation ' + index);
  }
});

test('the command loads in a fresh clone, before any package is installed', () => {
  // build is what runs npm ci, so the script and everything it loads may only use Node itself and files in the repository.
  const seen = new Set(), outside = [];
  const visit = file => {
    if (seen.has(file)) return; seen.add(file);
    for (const [, specifier] of require('node:fs').readFileSync(file, 'utf8').matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      if (specifier.startsWith('node:')) continue;
      if (!specifier.startsWith('.')) { outside.push(`${path.basename(file)} requires ${specifier}`); continue; }
      const target = require.resolve(path.resolve(path.dirname(file), specifier));
      if (target.endsWith('.cjs')) visit(target);
    }
  };
  visit(path.join(__dirname, '..', 'scripts', 'release-local.cjs'));
  assert.deepEqual(outside, []);
  assert.ok(seen.size >= 3, 'the walk followed the script into the modules it loads');
});

test('versions are ordered as numbers, not as text', () => {
  const release = version => ({ tag_name: 'v' + version, draft: false, assets: [{ name: local.names(version).dmg, state: 'uploaded', digest: 'sha256:' + 'a'.repeat(64) }] });
  const pick = (versions, current) => local.previousRelease(versions.map(release), current)?.tag;
  assert.equal(pick(['0.6.0-beta.7', '0.6.0-beta.10', '0.6.0-beta.9'], '0.8.0-beta.1'), 'v0.6.0-beta.10');
  assert.equal(pick(['0.9.0-beta.1', '0.10.0-beta.1', '0.2.0-beta.30'], '0.10.0-beta.2'), 'v0.10.0-beta.1');
  assert.equal(pick(['0.8.0-beta.1', '0.8.0-beta.2', '1.0.0-beta.1'], '0.8.0-beta.1'), undefined, 'the same and later versions are never the previous one');
  const node = version => local.problems({ platform: 'darwin', arch: 'arm64', node: version, version: next, dirty: false, tagExists: false, notesExist: true, onMain: true }).length;
  assert.deepEqual(['22.12.0', '22.23.3', '24.22.1', '100.0.0'].map(node), [0, 0, 0, 0]);
  assert.deepEqual(['22.11.9', '20.19.0', '9.99.99', 'unknown', undefined].map(node), [1, 1, 1, 1, 1]);
});

// build and publish run here against a fake machine: every command the script would start is
// recorded and answered from memory, and its files go to a temporary folder. Nothing is
// installed, packaged, uploaded or fetched.
const fs = require('node:fs/promises'), os = require('node:os');
const { createHash } = require('node:crypto');
const commit = 'c'.repeat(40);
const sha256 = data => createHash('sha256').update(data).digest('hex');
async function machine({ artifactDigest = data => sha256(data), tagOnRemote = false } = {}) {
  const desktop = await fs.mkdtemp(path.join(os.tmpdir(), 'release-local-test-'));
  const n = local.names(next), calls = [], said = [], github = { releases: [], patched: false, uploadDigest: digest => digest, ref: { object: { type: 'commit', sha: commit } }, tags: {}, notReadableYet: 0 };
  const contents = { [n.dmg]: Buffer.from('synthetic installer, never executed'), [n.zip]: Buffer.from('synthetic update archive, never executed') };
  const system = {
    desktop, platform: 'darwin', arch: 'arm64', node: '22.23.3', now: () => new Date('2026-11-12T08:15:30.000Z'), pause: 0, say: line => { said.push(line); },
    git: (...args) => { calls.push(['git', ...args].join(' '));
      if (args[0] === 'rev-parse') return commit;
      if (args[0] === 'ls-remote') return tagOnRemote ? `${commit}\trefs/tags/${n.tag}` : '';
      if (args[0] === 'show') return '# Aura Prime 0.8.0 beta 1\n\nNoter fra den afprøvede commit.\n';
      return ''; },
    gitSucceeds: (...args) => args[0] !== 'rev-parse',
    gh: (...args) => { calls.push(['gh', ...args].join(' '));
      if (args[0] === 'auth') return '';
      if (args.includes('PATCH')) { github.patched = true; const release = github.releases[0]; release.draft = false;
        for (const asset of release.assets) asset.browser_download_url = `https://github.com/Parthee-Vijaya/Aura-Prime/releases/download/${n.tag}/${asset.name}`; return JSON.stringify(release); }
      if (args[1].endsWith('/releases?per_page=100')) return JSON.stringify(github.releases);
      if (args[1].endsWith(`/releases/tags/${n.tag}`)) { if (github.notReadableYet-- > 0) throw Error('gh: Not Found (HTTP 404)'); return JSON.stringify(github.releases[0]); }
      if (args[1].endsWith(`/git/ref/tags/${n.tag}`)) return JSON.stringify(github.ref);
      if (args[1].includes('/git/tags/')) return JSON.stringify(github.tags[args[1].split('/').pop()]);
      throw Error('unexpected gh call: ' + args.join(' ')); },
    run: async step => { calls.push([step.command, ...step.args].join(' '));
      const out = flag => step.args[step.args.indexOf(flag) + 1];
      if (step.id === 'check') return '# tests 12\n# pass 10\n# fail 0\n# skipped 2\n';
      if (step.id === 'package') { await fs.mkdir(path.join(desktop, 'release'), { recursive: true }); for (const [name, data] of Object.entries(contents)) await fs.writeFile(path.join(desktop, 'release', name), data); }
      if (step.id === 'package-acceptance') await fs.writeFile(out('--out'), JSON.stringify({ status: 'passed', from: { version: '0.6.0-beta.7' }, steps: Array.from({ length: 22 }, (_, i) => ({ id: 'step-' + i, status: 'pass' })) }));
      if (step.id === 'mac-artifacts') await fs.writeFile(step.args.at(-2), JSON.stringify({ status: 'bestået', artifacts: { dmg: { sha256: artifactDigest(contents[n.dmg]) }, zip: { sha256: sha256(contents[n.zip]) } } }));
      if (step.command === 'gh' && step.args[1] === 'download') await fs.writeFile(path.join(out('--dir'), out('--pattern')), github.previousBytes);
      if (step.command === 'gh' && step.args[1] === 'create') { const files = step.args.slice(step.args.indexOf('--notes-file') + 2); const assets = [];
        for (const file of files) { const data = await fs.readFile(file); assets.push({ name: path.basename(file), state: 'uploaded', size: data.length, digest: 'sha256:' + github.uploadDigest(sha256(data), path.basename(file)),
          browser_download_url: `https://github.com/Parthee-Vijaya/Aura-Prime/releases/download/untagged-0123abcd/${path.basename(file)}` }); }
        github.releases.unshift({ id: 42, tag_name: n.tag, draft: true, prerelease: true, html_url: `https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/${n.tag}`, assets }); }
      return ''; }
  };
  return { system, calls, said, github, desktop, n, contents };
}

test('build collects exactly the tested files, a one-entry feed and a qualification record, and uploads nothing', async () => {
  const { system, calls, desktop, n, contents } = await machine();
  const candidate = await local.build({ from: '/tmp/previous.dmg' }, system);
  assert.equal(candidate, path.join(desktop, 'release', 'candidate-0.8.0-beta.1-20261112-081530'));
  assert.deepEqual((await fs.readdir(candidate)).sort(), [n.dmg, n.zip, n.sums, 'acceptance.json', n.feed, 'mac-artifacts.json', 'qualification.json'].sort());
  const qualification = JSON.parse(await fs.readFile(path.join(candidate, 'qualification.json'), 'utf8'));
  assert.equal(qualification.sourceCommit, commit);
  assert.equal(qualification.ci, false);
  assert.deepEqual(qualification.fullChecks, { pass: 10, skip: 2, fail: 0 });
  assert.deepEqual(qualification.acceptance, { passedSteps: 22, from: '0.6.0-beta.7' });
  assert.deepEqual(qualification.steps.map(step => step.id), local.buildPlan({ version: next, from: 'x', candidate }).map(step => step.id));
  assert.deepEqual(qualification.files.map(file => file.name), [n.dmg, n.zip, n.feed, n.sums]);
  assert.equal(qualification.files[0].sha256, sha256(contents[n.dmg]));
  assert.equal(qualification.files[1].bytes, contents[n.zip].length);
  const feed = JSON.parse(await fs.readFile(path.join(candidate, n.feed), 'utf8')), client = { version: '0.6.0-beta.7', platform: 'darwin', arch: 'arm64' };
  assert.equal(feed.files[0].sha512, createHash('sha512').update(contents[n.zip]).digest('base64'));
  assert.equal(validateInfo(normalizeInfo(feed, client), client).bytes, contents[n.zip].length);
  assert.equal(await fs.readFile(path.join(candidate, n.sums), 'utf8'), local.checksums(qualification.files.slice(0, 3)));
  assert.ok(!calls.some(call => /^gh |^git (push|tag)/.test(call)), 'no upload, tag or push: ' + calls.filter(call => /^gh /.test(call)).join('; '));
});

test('build stops without a qualification record when the collected file is not the verified one', async () => {
  const { system, desktop } = await machine({ artifactDigest: () => 'd'.repeat(64) });
  await assert.rejects(local.build({ from: '/tmp/previous.dmg' }, system), /ikke de filer, pakkekontrollen afprøvede/);
  const [candidate] = (await fs.readdir(path.join(desktop, 'release'))).filter(name => name.startsWith('candidate-'));
  assert.ok(!(await fs.readdir(path.join(desktop, 'release', candidate))).includes('qualification.json'), 'publish has nothing to start from');
});

test('without --from the previous installer is fetched once and must match the checksum GitHub holds', async () => {
  const previous = Buffer.from('synthetic previous installer');
  const listed = digest => ({ tag_name: 'v0.6.0-beta.7', draft: false, assets: [{ name: beta7.dmg.name, state: 'uploaded', size: previous.length, digest: 'sha256:' + digest }] });
  const { system, calls, github, desktop } = await machine();
  github.previousBytes = previous; github.releases.push(listed(sha256(previous)));
  const file = path.join(desktop, 'release', 'previous', beta7.dmg.name);
  const first = await local.build({}, system);
  assert.ok(calls.some(call => call.includes(`--from ${file} --out`)), 'the upgrade test starts from the fetched installer');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(first, 'qualification.json'), 'utf8')).previous, { tag: 'v0.6.0-beta.7', file: beta7.dmg.name, sha256: sha256(previous) });
  system.now = () => new Date('2026-11-12T09:00:00.000Z');
  await local.build({}, system);
  assert.equal(calls.filter(call => call.startsWith('gh release download')).length, 1, 'a verified installer is not fetched again');
  const other = await machine();
  other.github.previousBytes = previous; other.github.releases.push(listed('b'.repeat(64)));
  await assert.rejects(local.build({}, other.system), /matcher ikke GitHubs kontrolsum/);
  assert.ok(!other.calls.some(call => call.startsWith('npm ')), 'nothing is built on an unverified installer');
  assert.deepEqual((await fs.readdir(path.join(other.desktop, 'release'))).filter(name => name.startsWith('candidate-')), [], 'no candidate folder is left behind');
  const offline = await machine(); offline.system.gh = () => { throw Error('gh: not logged in'); };
  await assert.rejects(local.build({}, offline.system), /gh auth login[\s\S]*--from/);
});

test('build refuses on a wrong machine, a dirty checkout or an existing tag before any step runs', async () => {
  for (const [change, message] of [[{ platform: 'linux', arch: 'x64' }, /Mac med Apple-chip/], [{ git: () => ' M desktop/main.cjs' }, /ikke er committet/], [{ tagOnRemote: true }, /findes allerede/]]) {
    const { system, calls } = await machine({ tagOnRemote: change.tagOnRemote });
    const base = system.git; if (change.git) system.git = (...args) => args[0] === 'status' ? change.git() : base(...args);
    Object.assign(system, change.platform ? change : {});
    await assert.rejects(local.build({ from: '/tmp/previous.dmg' }, system), message);
    assert.ok(!calls.some(call => call.startsWith('npm ')), 'nothing was installed or built');
  }
});

test('publish uploads a draft, verifies it against the tested files and only then makes it public', async () => {
  const { system, calls, said, github, n } = await machine();
  const candidate = await local.build({ from: '/tmp/previous.dmg' }, system);
  calls.length = 0;
  assert.equal(await local.publish(candidate, system), `https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/${n.tag}`);
  assert.ok(said.some(line => line.includes('er offentliggjort fra ' + commit)));
  const create = calls.find(call => call.startsWith('gh release create'));
  assert.match(create, new RegExp(`^gh release create ${n.tag.replaceAll('.', '\\.')} --repo Parthee-Vijaya/Aura-Prime --target ${commit} --draft --prerelease --title Aura Prime 0\\.8\\.0 beta 1 --notes-file `));
  for (const name of [n.dmg, n.zip, n.feed, n.sums]) assert.ok(create.includes(path.join(candidate, name)), name);
  assert.ok(!create.includes('acceptance.json') && !create.includes('qualification.json'), 'reports are not release files');
  assert.ok(calls.findIndex(call => call.includes('PATCH')) > calls.indexOf(create), 'made public after the upload');
  assert.equal(github.releases[0].draft, false);
  const body = await fs.readFile(path.join(candidate, 'release-body.md'), 'utf8');
  assert.match(body, /Noter fra den afprøvede commit\./);
  assert.match(body, new RegExp('Bygget fra `' + commit + '`'));
  assert.match(body, /10 bestået, 2 sprunget over, 0 fejl/);
  assert.ok(!calls.some(call => /^git (push|tag)/.test(call)), 'the tag is created by GitHub at the tested commit, never pushed or moved locally');
});

test('after publishing, the tag must point at the tested commit, directly or through an annotated tag', async () => {
  const annotated = await machine(), first = await local.build({ from: '/tmp/previous.dmg' }, annotated.system);
  annotated.github.ref = { object: { type: 'tag', sha: 'f'.repeat(40) } };
  annotated.github.tags['f'.repeat(40)] = { object: { type: 'commit', sha: commit } };
  await local.publish(first, annotated.system);
  const elsewhere = await machine(), second = await local.build({ from: '/tmp/previous.dmg' }, elsewhere.system);
  elsewhere.github.ref = { object: { type: 'commit', sha: '9'.repeat(40) } };
  await assert.rejects(local.publish(second, elsewhere.system), /ER offentliggjort[\s\S]*peger ikke på den afprøvede commit/);
  assert.equal(elsewhere.github.patched, true, 'the message says plainly that the release is already public');
});

test('the public release is read back by its tag, and read again if GitHub is not ready yet', async () => {
  const { system, calls, github, n } = await machine(), candidate = await local.build({ from: '/tmp/previous.dmg' }, system);
  github.notReadableYet = 2;
  await local.publish(candidate, system);
  const byTag = calls.filter(call => call.endsWith(`/releases/tags/${n.tag}`));
  assert.equal(byTag.length, 3, 'two failed reads, then the one that verified the release');
  assert.ok(calls.indexOf(byTag[0]) > calls.findIndex(call => call.includes('PATCH')));
  const never = await machine(), second = await local.build({ from: '/tmp/previous.dmg' }, never.system);
  never.github.notReadableYet = 99;
  await assert.rejects(local.publish(second, never.system), /ER offentliggjort[\s\S]*Not Found/);
});

test('publish leaves the release as a draft when GitHub holds other bytes than the tested files', async () => {
  const { system, github, n } = await machine();
  const candidate = await local.build({ from: '/tmp/previous.dmg' }, system);
  github.uploadDigest = (digest, name) => name === n.zip ? 'e'.repeat(64) : digest;
  await assert.rejects(local.publish(candidate, system), /matcher ikke den afprøvede fil[\s\S]*ikke offentliggjort/);
  assert.equal(github.patched, false);
  assert.equal(github.releases[0].draft, true);
});

test('publish refuses changed files, a published tag and a tag without a draft before uploading', async () => {
  const changed = await machine(), candidate = await local.build({ from: '/tmp/previous.dmg' }, changed.system);
  await fs.appendFile(path.join(candidate, changed.n.zip), 'x');
  await assert.rejects(local.publish(candidate, changed.system), /er ændret siden afprøvningen/);
  const published = await machine(), second = await local.build({ from: '/tmp/previous.dmg' }, published.system);
  published.github.releases.push({ id: 7, tag_name: published.n.tag, draft: false, prerelease: true, assets: [] });
  await assert.rejects(local.publish(second, published.system), /allerede udgivet/);
  const tagged = await machine(), third = await local.build({ from: '/tmp/previous.dmg' }, tagged.system);
  tagged.system.git = (...args) => args[0] === 'ls-remote' ? 'x\trefs/tags/' + tagged.n.tag : '';
  await assert.rejects(local.publish(third, tagged.system), /uden en kladde/);
  for (const m of [changed, published, tagged]) assert.ok(!m.calls.some(call => call.startsWith('gh release create')) && m.github.patched === false);
  await assert.rejects(local.publish(path.join(os.tmpdir(), 'no-such-candidate'), tagged.system), /ENOENT|kandidat/i);
});

test('on any other machine than an Apple-chip Mac the command stops before it runs anything', { skip: process.platform === 'darwin' && process.arch === 'arm64' }, () => {
  const script = path.join(__dirname, '..', 'scripts', 'release-local.cjs');
  const build = spawnSync(process.execPath, [script, 'build'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(build.status, 1);
  assert.match(build.stderr, /Mac med Apple-chip/);
  assert.doesNotMatch(build.stdout + build.stderr, /npm ci/);
  const usage = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 60000 });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /build/);
  assert.match(usage.stderr, /publish/);
});
