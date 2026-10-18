const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { build } = require('../../scripts/build-packages.cjs');
const { unzip } = require('../../scripts/zip.cjs');
const { loadLibrary } = require('../core/library.cjs');
const { layoutFor } = require('../core/adapters.cjs');
const { withBlock, MANIFEST } = require('../core/installer.cjs');

// Kontrollér de faktiske filer, som brugeren henter, frem for kun generatoren.
const root = path.join(__dirname, '..', '..');
const site = path.join(root, 'site', 'dist');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const publicCatalog = async () => JSON.parse(await fs.readFile(path.join(site, 'catalog.json'), 'utf8'));

test('hver pakke indeholder præcis det, installationen ville skrive, med gyldigt manifest', async () => {
  const library = await loadLibrary(path.join(root, 'profiles'));
  const catalog = await publicCatalog();
  assert.equal(catalog.version, library.version);
  for (const tool of catalog.tools.filter(item => item.installable)) {
    const files = unzip(await fs.readFile(path.join(site, tool.archive)));
    const layout = layoutFor(library, [tool.id]);
    const expected = new Map(layout.entries.map(entry => [`projekt/${entry.path}`, entry.kind === 'blok' ? withBlock('', entry.path, entry.content) : entry.content]));
    assert.deepEqual([...files.keys()].sort(), ['LAES-MIG.md', `projekt/${MANIFEST}`, ...expected.keys()].sort(), tool.id);
    for (const [name, content] of expected) assert.equal(files.get(name), content, `${tool.id}: ${name}`);
    assert.equal(files.get('projekt/.harness/LICENSE'), library.license, `${tool.id}: fuld licenstekst`);
    assert.match(files.get('projekt/.harness/NOTICE.md'), /AI Alliancen[\s\S]*EUPL-1.2[\s\S]*github.com\/ai-alliancen-org\/ai-harness/);
    const manifest = JSON.parse(files.get(`projekt/${MANIFEST}`));
    assert.equal(manifest.version, library.version);
    assert.deepEqual(manifest.tools, [tool.id]);
    for (const [file, hash] of Object.entries(manifest.files)) assert.equal(sha(files.get(`projekt/${file}`)), hash, `${tool.id}: ${file}`);
    assert.ok(Object.keys(manifest.blocks).length >= 2, tool.id);
    assert.ok(![...files.keys()].some(name => /\.(sh|js|cjs|py|ps1|exe)$/.test(name)), `${tool.id} må ikke indeholde scripts`);
    const guide = files.get('LAES-MIG.md');
    // Tallet i vejledningen er det antal skills, pakken faktisk indeholder. Integrationer vælges til i appen.
    assert.ok(guide.includes(`grundregler og ${layout.skills.length} skills`), `${tool.id}: antal skills`);
    assert.ok(!layout.skills.some(name => library.skills.find(item => item.name === name).integration), `${tool.id}: ingen integrationer i pakken`);
    const optional = library.skills.filter(item => item.integration).map(item => item.title);
    if (optional.length) assert.ok(guide.includes(`(${optional.slice(0, -1).join(', ')}${optional.length > 1 ? ' og ' : ''}${optional.at(-1)}) er ikke med i pakken. Dem vælger du til i appen.`), `${tool.id}: integrationerne nævnes som valgfri`);
    for (const required of ['overskriv den ikke', 'Mac', 'Windows', library.controlWord, 'ikke', 'Til kodeagenten', 'Lav ingen commit', ...tool.sources.map(source => source.url)]) assert.ok(guide.includes(required), `${tool.id}: ${required}`);
    const ignore = files.get('projekt/.gitignore');
    assert.match(ignore, /\n\.env\n/);
    assert.match(ignore, /!\.env\.example/);
    const patterns = ignore.split('\n').filter(line => line && !line.startsWith('#') && !line.startsWith('<!--'));
    assert.ok(!patterns.some(line => /AGENTS\.md|CLAUDE\.md|\.harness|skills|\.claude|\.agents/.test(line)), `${tool.id}: .gitignore må ikke udelade instruktioner eller skills`);
  }
});

test('webguidens script bruger kun felter, som kataloget har, med den rigtige form', async () => {
  // Kataloget havde to felter ved navn categories, og det sidste overskrev skillkategorierne, så webguiden fejlede.
  const catalog = await publicCatalog();
  const app = await fs.readFile(path.join(site, 'app.js'), 'utf8');
  const keys = [...app.matchAll(/(?<!['"\w])catalog\.([a-zA-Z]+)/g)].map(match => match[1]);
  assert.ok(keys.includes('skillCategories') && keys.includes('categories'), 'kontrollen finder felterne i app.js');
  for (const key of keys) assert.ok(key in catalog, `app.js bruger catalog.${key}, som ikke findes`);
  assert.ok(Array.isArray(catalog.skillCategories) && catalog.skillCategories.every(category => Array.isArray(category.skills)), 'skillkategorierne er en liste');
  assert.deepEqual(Object.keys(catalog.categories), ['agent', 'editor', 'web'], 'værktøjskategorierne er et opslag');
  assert.deepEqual(catalog.skillCategories.flatMap(category => category.skills).sort(), catalog.skills.map(skill => skill.name).sort());
});

test('webplatforme uden projektfiler får tekst inden for platformens grænse', async () => {
  const catalog = await publicCatalog();
  const manual = catalog.tools.filter(item => !item.installable);
  assert.ok(manual.some(item => item.id === 'lovable'));
  for (const tool of manual) {
    assert.ok(tool.knowledge.length <= 10000, `${tool.id}: ${tool.knowledge.length} tegn`);
    assert.match(tool.knowledge, /FÆLLES-GRUNDLAG-\d\d/);
    for (const skill of catalog.skills.filter(item => item.integration)) assert.ok(!tool.knowledge.includes(`- ${skill.title}: `), `${tool.id}: ${skill.title} er valgfri og står ikke i den korte tekst`);
    assert.equal(tool.archive, undefined);
  }
});

test('siden, kataloget og pakkerne er bygget fra den aktuelle kilde og er reproducerbare', async t => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-pakker-'));
  t.after(() => fs.rm(output, { recursive: true, force: true }));
  await fs.cp(site, output, { recursive: true });
  const markdown = path.join(output, 'SKILLS.md');
  await build({ output, markdown });
  for (const file of ['catalog.json', 'skills.html', 'vaerktoejer.html', 'index.html']) assert.equal(await fs.readFile(path.join(output, file), 'utf8'), await fs.readFile(path.join(site, file), 'utf8'), `${file} er ikke bygget igen. Kør node scripts/build-packages.cjs.`);
  assert.equal(await fs.readFile(markdown, 'utf8'), await fs.readFile(path.join(root, 'profiles', 'SKILLS.md'), 'utf8'), 'profiles/SKILLS.md er ikke bygget igen.');
  const built = (await fs.readdir(path.join(output, 'downloads'))).sort();
  assert.deepEqual(built, (await fs.readdir(path.join(site, 'downloads'))).sort());
  for (const file of built) assert.ok((await fs.readFile(path.join(output, 'downloads', file))).equals(await fs.readFile(path.join(site, 'downloads', file))), `${file} er ikke reproducerbar`);
});

test('webguidens og FAQ-sidens lokale links findes i den samlede side, og alle skills og spørgsmål er med', async t => {
  const catalog = await publicCatalog();
  // Den samlede Pages-bygning giver forsiden som index.html og webguiden som pakker.html.
  const pages = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-links-'));
  t.after(() => fs.rm(pages, { recursive: true, force: true }));
  await require('../../scripts/build-pages.cjs').build([], { full_name: 'ai-alliancen-org/ai-harness', private: true }, pages);
  for (const page of (await fs.readdir(pages)).filter(file => file.endsWith('.html'))) {
    const html = await fs.readFile(path.join(pages, page), 'utf8');
    assert.match(html, /lang="da"/);
    for (const url of html.match(/(?:href|src)="([^"]+)"/g).map(match => match.slice(match.indexOf('"') + 1, -1))) {
      if (/^(https?:|data:|#|mailto:)/.test(url)) continue;
      await fs.access(path.join(pages, url.split('#')[0].split('?')[0] || 'index.html')).catch(() => assert.fail(`${page} linker til ${url}, som ikke findes`));
    }
  }
  const index = await fs.readFile(path.join(site, 'index.html'), 'utf8');
  for (const tool of catalog.tools.filter(item => item.installable)) assert.ok(index.includes(tool.archive), tool.id);
  const faq = await fs.readFile(path.join(site, 'skills.html'), 'utf8');
  for (const skill of catalog.skills) {
    assert.ok(faq.includes(`id="${skill.name}"`), skill.name);
    for (const answer of Object.values(skill.faq)) assert.ok(faq.includes(answer.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')), `${skill.name}: ${answer.slice(0, 30)}`);
  }
  for (const question of catalog.questions) assert.ok(faq.includes(question.q.replace(/"/g, '&quot;')), question.q);
  // Integrationer viser ejer, adgang og dataflow, og siden siger, at de ikke følger med pakkerne.
  const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  for (const skill of catalog.skills.filter(item => item.integration)) for (const field of ['owner', 'access', 'dataFlow', 'cost']) assert.ok(faq.includes(escapeHtml(skill.integration[field])), `${skill.name}: ${field}`);
  assert.match(faq, /Integrationerne følger ikke med pakkerne/);
  assert.ok(faq.includes(`indeholder fælles grundregler og ${catalog.skills.filter(item => !item.integration).length} skills samt `), 'tallet på siden er de skills, pakkerne indeholder');
});
