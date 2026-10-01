const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProject, openProject, folderSlug } = require('../core/projects.cjs');
const profiles = path.join(__dirname, '..', '..', 'profiles');
const input = { name: 'Fælleshaven', purpose: 'Del aktiviteter <script>alert(1)</script>', color: '#326556', links: ['https://example.com/design'], tests: 'manuel' };
async function temporary(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-test-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
test('opret og genåbn et rigtigt projekt med profiler og adskilte materialer', async t => {
  const parent = await temporary(t);
  const reference = path.join(parent, 'intern.txt'); await fs.writeFile(reference, 'Internt materiale');
  const project = await createProject(parent, input, [{ kind: 'reference', path: reference }], profiles);
  assert.equal((await openProject(project.root)).name, input.name);
  assert.equal(await fs.readFile(path.join(project.root, 'AGENTS.md'), 'utf8'), await fs.readFile(path.join(profiles, 'grundregler.md'), 'utf8'));
  assert.match(project.assets[0].file, /^references\//);
  const html = await fs.readFile(path.join(project.root, 'public/index.html'), 'utf8');
  assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/);
  assert.equal(path.basename(project.root), 'projekt-faelleshaven');
  // Samme navn igen giver en ny, nummereret mappe. Den første røres ikke.
  const second = await createProject(parent, input, [], profiles);
  assert.equal(path.basename(second.root), 'projekt-faelleshaven-2');
  assert.match(await fs.readFile(path.join(project.root, 'README.md'), 'utf8'), /Fælleshaven/);
  assert.equal(await fs.readFile(path.join(project.root, project.assets[0].file), 'utf8'), 'Internt materiale');
});
test('afvis forkert input før oprettelse, også aktive links og ugyldige farver', async t => {
  const parent = await temporary(t);
  await assert.rejects(createProject(parent, { ...input, links: ['javascript:alert(1)'] }, [], profiles));
  await assert.rejects(createProject(parent, { ...input, color: 'red;display:none' }, [], profiles));
  assert.deepEqual(await fs.readdir(parent), []);
});
test('åbn mappe uden preview, hvis public er erstattet af et symbolsk link', async t => {
  const parent = await temporary(t);
  const project = await createProject(parent, input, [], profiles);
  await fs.rename(path.join(project.root, 'public'), path.join(project.root, 'original'));
  await fs.symlink(path.join(project.root, 'original'), path.join(project.root, 'public'), 'junction');
  assert.equal((await openProject(project.root)).staticPreview, undefined);
});

test('åbn tomme og eksisterende mapper uden filændringer', async t => {
  const root = await temporary(t);
  assert.equal((await openProject(root)).root, await fs.realpath(root));
  assert.deepEqual(await fs.readdir(root), []);
  await fs.writeFile(path.join(root, 'harness.json'), '{ugyldig');
  assert.equal((await openProject(root)).warnings.length, 1);
  assert.equal(await fs.readFile(path.join(root, 'harness.json'), 'utf8'), '{ugyldig');
});

test('mappenavne bevarer danske ord i læsbar form', () => {
  assert.equal(folderSlug('Oversigt over tre fiktive mødelokaler'), 'oversigt-over-tre-fiktive-moedelokaler');
  assert.equal(folderSlug('Æblegården på Ålborgvej'), 'aeblegaarden-paa-aalborgvej');
  assert.equal(folderSlug('Café Noël'), 'cafe-noel');
  assert.equal(folderSlug('---'), 'projekt');
  assert.ok(folderSlug('a'.repeat(200)).length <= 60);
});

test('en ny projekts startside vises ikke, før den er ændret, men eksisterende projekter vises som før', async t => {
  const parent = await temporary(t);
  const project = await createProject(parent, input, [], profiles);
  // Fingeraftrykket i harness.json svarer til den startside, der blev skrevet.
  const manifest = JSON.parse(await fs.readFile(path.join(project.root, 'harness.json'), 'utf8'));
  assert.equal(manifest.starter, require('node:crypto').createHash('sha256').update(await fs.readFile(path.join(project.root, 'public/index.html'))).digest('hex'));
  const waiting = await openProject(project.root);
  assert.equal(waiting.staticPreview, false, 'den uændrede startside vises ikke');
  assert.equal(waiting.waitingForFirstVersion, true);
  // Når AI’en har bygget første version, vises siden.
  await fs.writeFile(path.join(project.root, 'public/index.html'), '<!doctype html><title>App</title><h1>Første version</h1>');
  const built = await openProject(project.root);
  assert.equal(built.staticPreview, true);
  assert.equal(built.waitingForFirstVersion, undefined);
  // Et projekt fra før fingeraftrykket fandtes viser startsiden som før.
  const older = await createProject(parent, { ...input, name: 'Ældre projekt' }, [], profiles);
  const olderManifest = JSON.parse(await fs.readFile(path.join(older.root, 'harness.json'), 'utf8'));
  delete olderManifest.starter; await fs.writeFile(path.join(older.root, 'harness.json'), JSON.stringify(olderManifest));
  assert.equal((await openProject(older.root)).staticPreview, true);
});
