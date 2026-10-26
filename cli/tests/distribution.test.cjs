const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { names, sha256, unpack, releaseFiles, validateRelease } = require('../../scripts/cli-release-contract.cjs');
const { assetURL } = require('../../scripts/release-contract.cjs');
const { render, renderCLI, cliGuides, build } = require('../../scripts/build-pages.cjs');
const { selectDraft, validateAssetIDs } = require('../../scripts/download-cli-draft.cjs');
const distribution = require('../../desktop/core/distribution.cjs');
const version = '0.2.0-beta.6', tag = `cli-v${version}`;
const meta = { full_name: distribution.repository, private: false };
function fixture() {
  const files = new Map(names(version).map(n => [n, Buffer.from('Syntetisk prøve: ' + n)]));
  const release = { tag_name: tag, draft: true, prerelease: true, body: 'Terminalbeta', published_at: '2026-10-13T10:00:00Z',
    assets: [...files].map(([name, bytes]) => ({ name, size: bytes.length, digest: `sha256:${sha256(bytes)}`, state: 'uploaded', browser_download_url: assetURL(tag, name) })) };
  return { files, release };
}
function archive(extra = []) {
  const entries = [{ name: 'package/package.json', bytes: '{}' }, { name: 'package/cli/aura.cjs', bytes: 'test' }, ...extra];
  return gzipSync(Buffer.concat([...entries.flatMap(e => {
    const h = Buffer.alloc(512), content = Buffer.from(e.bytes || 'test'); h.write(e.name);
    h.write('0000644\0', 100); h.write(content.length.toString(8).padStart(11, '0') + '\0', 124);
    h[156] = e.type ?? 48; h.fill(32, 148, 156);
    const sum = [...h].reduce((a, b) => a + b, 0); h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return [h, content, Buffer.alloc((512 - content.length % 512) % 512)];
  }), Buffer.alloc(1024)]));
}
test('CLI-arkivet afviser private filer, traversal, symlinks, dubletter og ødelagte arkiver', () => {
  assert.equal(unpack(archive()).get('cli/aura.cjs').toString(), 'test');
  for (const e of [{ name: 'package/.env' }, { name: 'package/docs/komplai-api-token.md' }, { name: 'package/profiles/../secret.md' }, { name: 'package/cli/aura.cjs', type: 50 }, { name: 'package/cli/aura.cjs' }, { name: '../package.json' }]) assert.throws(() => unpack(archive([e])));
  assert.throws(() => unpack(Buffer.from('ikke gzip')));
});
test('CLI-arkivet omfatter Privacy Gate-moduler og native kilde uden interne probes eller runtimefiler', async () => {
  const sources = ['desktop/core/privacy/index.cjs', 'desktop/core/privacy/hybrid-seatbelt-workspaces.cjs', 'desktop/privacy/isolation/engine-isolation.cjs', 'desktop/privacy/isolation/prepare-helper.cjs', 'desktop/privacy/isolation/scope-reaper.c'];
  const packed = unpack(archive(sources.map(name => ({ name: 'package/' + name }))));
  for (const name of sources) assert(packed.has(name));
  for (const name of ['desktop/privacy/isolation/notes/scope-probe.c', 'desktop/privacy/isolation/.runtime/helper', 'desktop/privacy/organization-policy.json', 'desktop/core/privacy/credentials.json']) assert.throws(() => unpack(archive([{ name: 'package/' + name }])));
  const pkg = JSON.parse(await fs.readFile(path.resolve(__dirname, '../../package.json'), 'utf8'));
  for (const pattern of ['desktop/core/privacy/*.cjs', 'desktop/privacy/isolation/*.cjs', 'desktop/privacy/isolation/*.c']) assert(pkg.files.includes(pattern));
});
test('CLI-udgivelsen kræver alle seks filer, betakladde, samme version, størrelse og faktiske hash', () => {
  const f = fixture(); assert.doesNotThrow(() => validateRelease(f.release, f.files, version));
  for (const change of [f => f.release.draft = false, f => f.release.prerelease = false, f => f.release.body = '', f => f.release.tag_name = 'v' + version,
    f => f.release.assets.pop(), f => f.release.assets.push(f.release.assets[0]), f => f.release.assets[0].digest = null,
    f => f.release.assets[0].size++, f => f.files.set(names(version)[0], Buffer.from('ændret fil')), f => f.release.assets[0].browser_download_url = 'https://example.org/file']) {
    const bad = fixture(); change(bad); assert.throws(() => validateRelease(bad.release, bad.files, version));
  }
  assert.throws(() => names('../forkert'));
});
test('Pages holder CLI og desktop adskilt og vælger kun komplette offentliggjorte terminalpakker', () => {
  const { release } = fixture();
  assert.doesNotMatch(renderCLI([release], meta), /Hent terminalpakken/);
  release.draft = false;
  assert.match(renderCLI([release], meta), /Hent terminalpakken/);
  assert.doesNotMatch(render([release], meta), /Hent Mac|Hent Windows/);
  assert.match(cliGuides([release]), /blob\/cli-v0\.2\.0-beta\.6\/cli\/WINDOWS.md/);
  assert.match(renderCLI([release], { ...meta, private: true }), /kræver GitHub-login/);
  const incomplete = { ...release, tag_name: 'cli-v0.2.0-beta.7', published_at: '2026-10-14T10:00:00Z', assets: [] };
  assert.match(renderCLI([incomplete, release], meta), /0\.2\.0-beta\.6/);
  for (const mutate of [r => r.assets.pop(), r => r.assets[0].state = 'new', r => r.assets[0].digest = null]) {
    const r = structuredClone(release); mutate(r); assert.equal(releaseFiles(r).length, 0); assert.doesNotMatch(renderCLI([r], meta), /Hent terminalpakken/);
  }
  assert.throws(() => renderCLI([release], { ...meta, full_name: 'wrong/repo' }));
});
test('GitHub-kladder findes via release-ID og tillader kun deres egne midlertidige filadresser', () => {
  const { release, files } = fixture(); release.id = 411802543;
  release.assets.forEach((a, i) => { a.id = 637367468 + i; a.url = `https://api.github.com/repos/${meta.full_name}/releases/assets/${a.id}`; a.browser_download_url = assetURL('untagged-9eb271ba7508f6aaf1fd', a.name); });
  assert.equal(selectDraft([release], tag).id, release.id);
  assert.equal(validateAssetIDs(release).length, 6);
  assert.doesNotThrow(() => validateRelease(release, files, version));
  assert.doesNotMatch(renderCLI([release], meta), /Hent terminalpakken/);
  assert.throws(() => releaseFiles({ ...release, draft: false }, { draft: true }), /matcher ikke/);
  for (const list of [[], [release, release], [{ ...release, draft: false }], [{ ...release, id: '../andet' }]]) assert.throws(() => selectDraft(list, tag));
  for (const mutate of [r => r.assets[0].url = 'https://example.org/fil', r => r.assets[0].id = r.assets[1].id,
    r => r.assets[0].browser_download_url = assetURL('untagged-abcdef', r.assets[0].name),
    r => r.assets[0].browser_download_url = r.assets[0].browser_download_url.replace(meta.full_name, 'other/repo')]) {
    const bad = structuredClone(release); mutate(bad); assert.throws(() => validateAssetIDs(bad));
  }
});
test('Den faktiske Pages-bygning viser CLI-guides og bevarer appens tomme tilstand', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-cli-pages-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { release } = fixture(); release.draft = false;
  await build([release], meta, dir);
  const html = await fs.readFile(path.join(dir, 'desktop.html'), 'utf8');
  assert.match(html, /Hent terminalpakken/); assert.match(html, /LINUX.md/); assert.match(html, /MACOS.md/); assert.doesNotMatch(html, /<!-- cli-/);
  assert.equal((html.match(/class="platform"/g) || []).length, 3);
  assert.match(html, /Installationsfilerne klargøres/);
  assert.match(await fs.readFile(path.join(dir, 'terminal.html'), 'utf8'), /desktop\.html#terminal/);
  await build([], meta, dir);
  assert.doesNotMatch(await fs.readFile(path.join(dir, 'desktop.html'), 'utf8'), /href="[^"]+\.tgz"/);
});
test('Downloadsiden samler app og terminal uden at blande filtyper eller vise kladder', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-downloads-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { release } = fixture(); release.draft = false;
  const desktop = { ...release, tag_name: 'v' + version, assets: ['mac-arm64.dmg', 'mac-x64.dmg', 'win-x64.exe'].map(target => {
    const name = `${distribution.artifactPrefix}-${version}-${target}`;
    return { name, state: 'uploaded', size: 1234, digest: 'sha256:' + 'c'.repeat(64), browser_download_url: assetURL('v' + version, name) };
  }) };
  await build([release, desktop], meta, dir);
  const html = await fs.readFile(path.join(dir, 'desktop.html'), 'utf8');
  assert.equal((html.match(/class="artifact"/g) || []).length, 3);
  assert.match(html, /href="[^"]+\.tgz"/);
  assert.doesNotMatch(html, /<!-- (cli-|artifacts)|Endnu ikke afprøvet|Intel-Mac mangler/);
  await fs.access(path.join(dir, 'downloads.js'));
  await build([release, { ...desktop, draft: true }], meta, dir);
  const draft = await fs.readFile(path.join(dir, 'desktop.html'), 'utf8');
  assert.doesNotMatch(draft, /class="artifact"/);
  assert.match(draft, /href="[^"]+\.tgz"/);
});
