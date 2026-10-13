const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { gzipSync } = require('node:zlib');
const { names, sha256, unpack, releaseFiles, validateRelease } = require('../../scripts/cli-release-contract.cjs');
const { assetURL } = require('../../scripts/release-contract.cjs');
const { render, renderCLI, cliGuides, build } = require('../../scripts/build-pages.cjs');
const version = '0.2.0-beta.6', tag = `cli-v${version}`;
const meta = { full_name: 'ai-alliancen-org/ai-harness', private: false };
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
  for (const e of [{ name: 'package/.env' }, { name: 'package/profiles/../secret.md' }, { name: 'package/cli/aura.cjs', type: 50 }, { name: 'package/cli/aura.cjs' }, { name: '../package.json' }]) assert.throws(() => unpack(archive([e])));
  assert.throws(() => unpack(Buffer.from('ikke gzip')));
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
test('Den faktiske Pages-bygning viser CLI-guides og bevarer appens tomme tilstand', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-cli-pages-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const { release } = fixture(); release.draft = false;
  await build([release], meta, dir);
  const html = await fs.readFile(path.join(dir, 'terminal.html'), 'utf8');
  assert.match(html, /Hent terminalpakken/); assert.match(html, /LINUX.md/); assert.match(html, /MACOS.md/); assert.doesNotMatch(html, /<!-- cli-/);
  assert.equal((html.match(/class="platform"/g) || []).length, 3);
  assert.match(await fs.readFile(path.join(dir, 'desktop.html'), 'utf8'), /endnu ingen offentliggjort/);
  await build([], meta, dir);
  assert.doesNotMatch(await fs.readFile(path.join(dir, 'terminal.html'), 'utf8'), /Hent terminalpakken/);
});
