const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { run } = require('../core/git.cjs');
const { snapshot, diffTrees, parseNumstat, release, LIMITS } = require('../core/git-snapshot.cjs');

// Rigtige Git-repositories i midlertidige mapper. Snapshottet må aldrig røre brugerens
// index, refs eller objekter, og kender sit tilbagefald uden Git eller ved clean-filtre.
async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-git-snapshot-')));
  const home = path.join(root, 'home'); await fs.mkdir(home); process.env.HOME = home; process.env.USERPROFILE = home; process.env.XDG_CONFIG_HOME = path.join(home, '.config');
  const project = path.join(root, 'projekt'); await fs.mkdir(project);
  await run(project, ['init']);
  await run(project, ['config', '--local', 'user.name', 'Testbruger']);
  await run(project, ['config', '--local', 'user.email', 'test@example.invalid']);
  await run(project, ['commit', '--allow-empty', '-m', 'Basis']);
  const private = path.join(root, 'private'); await fs.mkdir(private, { mode: 0o700 });
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return { root, project, private };
}
const indexPath = async project => path.join(path.resolve(project, (await run(project, ['rev-parse', '--git-dir'])).toString().trim()), 'index');

test('snapshot fanger arbejdsfilerne uden at røre brugerens index, og diffen finder ændringer og omdøbninger', async t => {
  const { project, private } = await fixture(t);
  await fs.writeFile(path.join(project, 'a.txt'), 'første version');
  await fs.writeFile(path.join(project, 'b.txt'), 'bliver omdøbt');
  const userIndexBefore = await indexPath(project);
  await fs.copyFile(userIndexBefore, path.join(project, '..', 'index-kopi')); // tom repo: index findes
  const before = await snapshot(project, { directory: private });
  assert.ok(before?.tree, 'snapshot af et repo giver et træ');
  const midIndex = await fs.readFile(path.join(project, '..', 'index-kopi'));
  assert.equal((await fs.readFile(userIndexBefore)).compare(midIndex), 0, 'brugerens index er uændret af snapshottet');

  await fs.writeFile(path.join(project, 'a.txt'), 'anden version med mere tekst');
  await fs.rename(path.join(project, 'b.txt'), path.join(project, 'omdoebt.txt'));
  const after = await snapshot(project, { directory: private });
  assert.ok(after?.tree && after.tree !== before.tree, 'et træ pr. øjebliksbillede');

  const { changed, identical } = await diffTrees(project, before, after);
  assert.equal(identical, false);
  const byPath = Object.fromEntries(changed.map(entry => [entry.path, entry]));
  assert.ok(byPath['a.txt'], 'ændringen findes'); assert.equal(byPath['a.txt'].added > 0, true);
  const rename = changed.find(entry => entry.path === 'omdoebt.txt');
  assert.ok(rename, 'omdøbningen findes med sin nye sti');
  assert.equal(rename.renamedFrom, 'b.txt', 'omdøbningen bærer den gamle sti');
  const lateIndex = await fs.readFile(path.join(project, '..', 'index-kopi'));
  assert.equal((await fs.readFile(userIndexBefore)).compare(lateIndex), 0, 'brugerens index er stadig uændret efter diffen');
  assert.equal(await fs.readFile(path.join(project, 'a.txt'), 'utf8'), 'anden version med mere tekst', 'arbejdsfilerne er urørte');
  assert.equal(await fs.readFile(path.join(project, 'omdoebt.txt'), 'utf8'), 'bliver omdøbt');
  await release(before); await release(after);
  const entries = await fs.readdir(private).catch(() => []);
  assert.equal(entries.length, 0, 'release fjerner det private materiale');
});

test('uden Git-repo, med clean-filtre eller Git-fejl falder snapshotket tilbage til null', async t => {
  const { project, private } = await fixture(t);
  const plain = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-uden-git-'));
  t.after(() => fs.rm(plain, { recursive: true, force: true }));
  assert.equal(await snapshot(plain, { directory: private }), null, 'uden repo: tilbagefald');

  await fs.writeFile(path.join(project, 'data.bin'), 'indhold');
  await fs.writeFile(path.join(project, '.gitattributes'), '*.bin filter=prand');
  await run(project, ['config', '--local', 'filter.prand.clean', 'cat']);
  assert.equal(await snapshot(project, { directory: private }), null, 'clean-filtre: tilbagefald');
});

test('parseNumstat læser linjetal og NUL-adskilte stier, omdøbninger og binære filer', () => {
  const NUL = '\u0000';
  const entries = parseNumstat('3\t1\tny.txt' + NUL);
  assert.deepEqual(entries, [{ added: 3, removed: 1, path: 'ny.txt' }]);
  const several = parseNumstat('0\t0\trov' + NUL + '12\t4\tkilde.js' + NUL);
  assert.equal(several.length, 2); assert.deepEqual(several[1], { added: 12, removed: 4, path: 'kilde.js' });
  const renamed = parseNumstat('0\t0\t' + NUL + 'gammel.js' + NUL + 'ny.js' + NUL);
  assert.deepEqual(renamed, [{ added: 0, removed: 0, path: 'ny.js', renamedFrom: 'gammel.js' }]);
  assert.deepEqual(parseNumstat('-\t-\tbillede.png' + NUL), [{ added: null, removed: null, path: 'billede.png' }]);
  assert.deepEqual(parseNumstat(''), []);
  assert.equal(LIMITS.files, 500);
});

test('beskyttet indhold i arbejdsområdet gør snapshottet utilgiveligt', async t => {
  const { project, private } = await fixture(t);
  await fs.writeFile(path.join(project, 'a.txt'), 'indhold');
  const before = await snapshot(project, { directory: private });
  assert.ok(before, 'uden beskyttede filer gives der et snapshot');
  await fs.writeFile(path.join(project, '.env'), 'SECRET=1');
  assert.equal(await snapshot(project, { directory: private }), null, 'trackbar .env: tilbagefald til fillæsning');
  await fs.unlink(path.join(project, '.env'));
  assert.ok(await snapshot(project, { directory: private }), 'uden .env igen: snapshottet virker');
});

test('beskyttede forældremapper gør også snapshottet utilgiveligt', async t => {
  const { project, private } = await fixture(t);
  const secrets = path.join(project, 'secrets'); await fs.mkdir(secrets);
  await fs.writeFile(path.join(secrets, 'data.json'), '{"hemmelighed": 1}');
  assert.equal(await snapshot(project, { directory: private }), null, 'secrets/data.json: tilbagefald til fillæsning');
  await fs.rm(secrets, { recursive: true });
  assert.ok(await snapshot(project, { directory: private }), 'uden secrets-mappen: snapshottet virker igen');
});
