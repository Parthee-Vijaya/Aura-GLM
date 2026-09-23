const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createProject, openProject } = require('../core/projects.cjs');
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
  await assert.rejects(createProject(parent, input, [], profiles), { code: 'EEXIST' });
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
