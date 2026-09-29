const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadLibrary } = require('../core/library.cjs');
const { layoutFor } = require('../core/adapters.cjs');
const installer = require('../core/installer.cjs');
const profiles = path.join(__dirname, '..', '..', 'profiles');

async function temp(t, prefix) { const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix)); t.after(() => fs.rm(root, { recursive: true, force: true })); return fs.realpath(root); }
const skill = { name: 'harness-a', title: 'A', summary: 'Gør A.', faq: { hvad: 'a', hvornaar: 'b', resultat: 'c', ikke: 'd' }, sources: [] };
const tool = { id: 'codex', name: 'Codex', vendor: 'OpenAI', category: 'agent', status: 'dokumenteret', summary: 's', verification: 'v', caveat: 'c', sources: [{ title: 'Kilde', url: 'https://example.org' }], rules: { file: 'AGENTS.md', mode: 'blok' }, skills: { dirs: ['.agents/skills'] } };
async function fixture(t, change = {}) {
  const root = await temp(t, 'harness-bibliotek-');
  const catalog = { schemaVersion: 2, version: '0.2.0', checkedAt: '2026-09-29', controlWord: 'PRØVE-02', skillDirs: ['.agents/skills', '.claude/skills'], neutralSkillDir: '.agents/skills', questions: [{ q: 'Spørgsmål?', a: 'Svar.' }], skills: [skill], tools: [tool], ...change.catalog };
  await fs.writeFile(path.join(root, 'catalog.json'), JSON.stringify(catalog));
  await fs.writeFile(path.join(root, 'grundregler.md'), change.rules ?? 'Version: 0.2.0\nKontrolord: PRØVE-02\n');
  await fs.writeFile(path.join(root, 'gitignore.txt'), '.env\n');
  await fs.mkdir(path.join(root, 'skills', 'harness-a', 'references'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills', 'harness-a', 'SKILL.md'), change.skill ?? '---\nname: harness-a\ndescription: Gør A, når opgaven kræver det.\n---\n# A\nLæs references/detaljer.md ved behov.\n');
  await fs.writeFile(path.join(root, 'skills', 'harness-a', 'references', 'detaljer.md'), 'Detaljer.\n');
  for (const [file, content] of Object.entries(change.files || {})) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), content); }
  return root;
}

test('det rigtige bibliotek er gyldigt, og hvert værktøj kan installeres og fjernes igen', async t => {
  const library = await loadLibrary(profiles);
  assert.equal(library.skills.length, 12);
  assert.ok(library.tools.length >= 20, `${library.tools.length} værktøjer`);
  assert.ok(library.rules.includes(library.controlWord));
  for (const item of library.tools.filter(entry => entry.rules)) {
    const root = await temp(t, `harness-${item.id}-`);
    const layout = layoutFor(library, [item.id]);
    const settings = { version: library.version, tools: layout.tools };
    const plan = await installer.plan(root, layout.entries, settings);
    assert.ok(plan.operations.every(op => op.action === 'opret'), item.id);
    await installer.apply(root, layout.entries, settings, plan.token);
    for (const dir of layout.dirs) assert.ok((await fs.readFile(path.join(root, dir, 'harness-sikkerhedsgennemgang', 'SKILL.md'), 'utf8')).includes('name: harness-sikkerhedsgennemgang'), `${item.id} ${dir}`);
    const removal = await installer.planRemoval(root);
    await installer.remove(root, removal.token);
    assert.deepEqual(await fs.readdir(root), [], item.id);
  }
});

test('et samlet valg af alle værktøjer giver én installation uden modstridende filer', async t => {
  const library = await loadLibrary(profiles);
  const ids = library.tools.filter(item => item.rules).map(item => item.id);
  const layout = layoutFor(library, ids);
  const root = await temp(t, 'harness-alle-');
  const settings = { version: library.version, tools: layout.tools };
  const plan = await installer.plan(root, layout.entries, settings);
  await installer.apply(root, layout.entries, settings, plan.token);
  assert.ok(layout.dirs.includes('.agents/skills') && layout.dirs.includes('.claude/skills'));
  assert.equal(new Set(layout.entries.map(entry => entry.path)).size, layout.entries.length);
});

test('skillsene overholder Agent Skills-formatet og indeholder ingen scripts', async () => {
  const library = await loadLibrary(profiles);
  for (const item of library.skills) {
    assert.match(item.name, /^harness-[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(item.description.length <= 1024 && item.description.length >= 80, item.name);
    assert.ok(item.files.every(file => /^(SKILL\.md|references\/[a-z0-9-]+\.md)$/.test(file.path)), item.name);
    const body = item.files.find(file => file.path === 'SKILL.md').content;
    assert.ok(body.split('\n').length < 300, item.name);
    assert.doesNotMatch(body, /disable-model-invocation|allowed-tools/, item.name);
  }
});

test('afviser ugyldige skills, værktøjer og uoverensstemmelser', async t => {
  await loadLibrary(await fixture(t));
  const rejects = async (change, pattern) => assert.rejects(loadLibrary(await fixture(t, change)), pattern);
  await rejects({ skill: '---\nname: harness-b\ndescription: Forkert navn.\n---\n# B\nreferences/detaljer.md\n' }, /samme som mappens navn/);
  await rejects({ skill: '---\nname: harness-a\ndescription: Gør A.\ndisable-model-invocation: true\n---\n# A\nreferences/detaljer.md\n' }, /ikke tilladt i biblioteket/);
  await rejects({ skill: '---\nname: harness-a\ndescription: Bemærk: kolon giver ugyldig YAML.\n---\n# A\nreferences/detaljer.md\n' }, /YAML-tegn|": "/);
  await rejects({ skill: '---\nname: harness-a\ndescription: Gør A.\n---\n# A\nIngen henvisning.\n' }, /bruges ikke fra SKILL\.md/);
  await rejects({ files: { 'skills/harness-a/scripts/kør.sh': 'echo hej' } }, /ugyldig post|ikke tilladt/);
  await rejects({ files: { 'skills/harness-b/SKILL.md': '---\nname: harness-b\ndescription: B.\n---\n' } }, /står ikke i kataloget/);
  await rejects({ rules: 'Version: 0.1.0\nPRØVE-02\n' }, /samme version og kontrolord/);
  await rejects({ catalog: { skills: [{ ...skill, name: 'Harness-A' }] } }, /små bogstaver/);
  await rejects({ catalog: { tools: [{ ...tool, skills: { dirs: ['.ukendt/skills'] } }] } }, /kendte mapper/);
  await rejects({ catalog: { tools: [{ ...tool, rules: { file: '../AGENTS.md', mode: 'blok' } }] } }, /fil og form/);
  await rejects({ catalog: { tools: [{ ...tool, category: 'web', status: 'dokumenteret', rules: undefined, skills: null }] } }, /status manuel/);
  await rejects({ catalog: { tools: [tool, tool] } }, /flere gange/);
});
