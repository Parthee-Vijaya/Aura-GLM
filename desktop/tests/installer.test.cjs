const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { layoutFor, chooseSkillDirs } = require('../core/adapters.cjs');
const installer = require('../core/installer.cjs');

const skill = (name, extra = '') => ({ name, title: name, summary: `Arbejdsgang ${name}.`, files: [{ path: 'SKILL.md', content: `---\nname: ${name}\ndescription: Prøve.\n---\n# ${name}\nSe references/detaljer.md.${extra}\n` }, { path: 'references/detaljer.md', content: `Detaljer til ${name}.\n` }] });
function library(version = '0.2.0', extra = '') {
  return {
    version, checkedAt: '2026-09-29', controlWord: 'PRØVE-01', skillDirs: ['.agents/skills', '.claude/skills', '.opencode/skills'], neutralSkillDir: '.agents/skills',
    rules: `# Grundregler\n\nVersion: ${version}\n`, gitignore: '.env\n*.key\n', skills: [skill('harness-a', extra), skill('harness-b')],
    tools: [
      { id: 'claude-code', name: 'Claude Code', category: 'agent', rules: { file: 'CLAUDE.md', mode: 'blok', import: 'AGENTS.md' }, skills: { dirs: ['.claude/skills'] } },
      { id: 'codex', name: 'Codex', category: 'agent', rules: { file: 'AGENTS.md', mode: 'blok' }, skills: { dirs: ['.agents/skills'] } },
      { id: 'opencode', name: 'OpenCode', category: 'agent', rules: { file: 'AGENTS.md', mode: 'blok' }, skills: { dirs: ['.opencode/skills', '.claude/skills', '.agents/skills'], duplicates: 'Samme navn vises kun én gang.' } },
      { id: 'aider', name: 'Aider', category: 'agent', rules: { file: 'CONVENTIONS.md', mode: 'blok' }, skills: null },
      { id: 'continue', name: 'Continue', category: 'editor', rules: { file: '.continue/rules/ai-harness.md', mode: 'fil', header: '---\nname: AI Harness\n---\n\n' }, skills: null },
      { id: 'lovable', name: 'Lovable', category: 'web' }
    ]
  };
}
async function project(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-installer-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return fs.realpath(root); }
async function install(root, lib, tools, options, skills) {
  const layout = layoutFor(lib, tools, { skills });
  const settings = { version: lib.version, tools: layout.tools, skills: layout.skills };
  const plan = await installer.plan(root, layout.entries, settings);
  return { plan, layout, settings, apply: () => installer.apply(root, layout.entries, settings, plan.token, options) };
}
const read = (root, file) => fs.readFile(path.join(root, file), 'utf8');
const exists = (root, file) => fs.access(path.join(root, file)).then(() => true, () => false);

test('vælger få skillmapper og advarer om værktøjer, der ser samme skills to steder', () => {
  const lib = library();
  const tools = ['claude-code', 'codex', 'opencode'].map(id => lib.tools.find(tool => tool.id === id));
  assert.deepEqual(chooseSkillDirs(lib, tools), ['.agents/skills', '.claude/skills']);
  const layout = layoutFor(lib, ['claude-code', 'codex', 'opencode']);
  assert.match(layout.warnings.join('\n'), /OpenCode kan læse skills fra både \.agents\/skills og \.claude\/skills/);
  assert.deepEqual(chooseSkillDirs(lib, [lib.tools.find(tool => tool.id === 'opencode')]), ['.opencode/skills'], 'værktøjets egen foretrukne mappe vinder ved lige dækning');
  assert.deepEqual(chooseSkillDirs(lib, ['codex', 'opencode'].map(id => lib.tools.find(tool => tool.id === id))), ['.agents/skills'], 'én fælles mappe går forud for foretrukne mapper');
  assert.deepEqual(layoutFor(lib, ['aider']).dirs, ['.agents/skills']);
  assert.match(layoutFor(lib, ['aider']).warnings[0], /indlæser ikke skills selv/);
  assert.throws(() => layoutFor(lib, ['lovable']), /installeres ikke i en projektmappe/);
  assert.throws(() => layoutFor(lib, ['ukendt']), /Ukendt værktøj/);
  assert.throws(() => layoutFor(lib, []), /Vælg mindst ét værktøj/);
});

test('Claude Code får en import af AGENTS.md, og filbaserede regler får deres egen fil', () => {
  const layout = layoutFor(library(), ['claude-code', 'continue']);
  const byPath = Object.fromEntries(layout.entries.map(entry => [entry.path, entry]));
  assert.match(byPath['CLAUDE.md'].content, /^AI Harness' fælles grundregler[\s\S]*\n@AGENTS\.md$/);
  assert.match(byPath['AGENTS.md'].content, /# Grundregler[\s\S]*## Skills fra AI Harness[\s\S]*`harness-a`: Arbejdsgang harness-a\./);
  assert.equal(byPath['.continue/rules/ai-harness.md'].kind, 'fil');
  assert.match(byPath['.continue/rules/ai-harness.md'].content, /^---\nname: AI Harness\n---\n\nDette afsnit vedligeholdes af AI Harness/);
  assert.equal(byPath['.claude/skills/harness-a/references/detaljer.md'].group, '.claude/skills/harness-a');
  assert.ok(byPath['.gitignore'] && byPath['.harness/LAES-MIG.md']);
});

test('installerer i en tom mappe og gentager uden ændringer', async t => {
  const root = await project(t);
  const first = await install(root, library(), ['claude-code']);
  assert.ok(first.plan.operations.every(op => op.action === 'opret'));
  await first.apply();
  assert.match(await read(root, 'AGENTS.md'), /^<!-- ai-harness:start -->\n[\s\S]*<!-- ai-harness:slut -->\n$/);
  assert.match(await read(root, '.claude/skills/harness-b/SKILL.md'), /name: harness-b/);
  const manifest = JSON.parse(await read(root, installer.MANIFEST));
  assert.deepEqual(manifest.tools, ['claude-code']);
  assert.equal(manifest.timeSource, 'computerens ur');
  const again = await install(root, library(), ['claude-code']);
  assert.ok(again.plan.operations.every(op => op.action === 'uaendret'), JSON.stringify(again.plan.operations.map(op => op.action)));
  await again.apply();
  assert.equal(JSON.parse(await read(root, installer.MANIFEST)).installedAt, manifest.installedAt);
});

test('tilføjer et afsnit uden at røre brugerens egne regler og fjerner det igen præcist', async t => {
  const root = await project(t);
  const own = '# Vores regler\r\n\r\nBrug tabulatorer.\r\n';
  await fs.writeFile(path.join(root, 'AGENTS.md'), own);
  await fs.writeFile(path.join(root, '.gitignore'), 'dist/\n');
  const run = await install(root, library(), ['codex']);
  assert.equal(run.plan.operations.find(op => op.path === 'AGENTS.md').action, 'tilfoej');
  await run.apply();
  const text = await read(root, 'AGENTS.md');
  assert.ok(text.startsWith(own.trimEnd()));
  assert.match(text, /\r\n<!-- ai-harness:start -->\r\n/);
  assert.ok(!/[^\r]\n/.test(text), 'linjeskift skal følge filens eksisterende CRLF');
  const removal = await installer.planRemoval(root);
  assert.equal(removal.operations.find(op => op.path === 'AGENTS.md').action, 'fjern-afsnit');
  const result = await installer.remove(root, removal.token);
  assert.deepEqual(result.kept, []);
  assert.equal(await read(root, 'AGENTS.md'), own);
  assert.equal(await read(root, '.gitignore'), 'dist/\n');
  assert.equal(await exists(root, '.harness'), false);
  assert.equal(await exists(root, '.agents'), false);
});

test('ændrede filer og afsnit bliver konflikter og overskrives aldrig', async t => {
  const root = await project(t);
  await (await install(root, library(), ['codex'])).apply();
  await fs.appendFile(path.join(root, '.agents/skills/harness-a/SKILL.md'), '\nVores egen tilføjelse.\n');
  const agents = await read(root, 'AGENTS.md');
  await fs.writeFile(path.join(root, 'AGENTS.md'), agents.replace('# Grundregler', '# Grundregler (rettet)'));
  const update = await install(root, library('0.3.0', '\nNy linje.'), ['codex']);
  const action = file => update.plan.operations.find(op => op.path === file).action;
  assert.equal(action('.agents/skills/harness-a/SKILL.md'), 'konflikt');
  assert.equal(action('.agents/skills/harness-a/references/detaljer.md'), 'konflikt');
  assert.equal(action('AGENTS.md'), 'konflikt');
  assert.equal(action('.agents/skills/harness-b/SKILL.md'), 'uaendret');
  await assert.rejects(update.apply(), /konflikter/);
  await installer.apply(root, update.layout.entries, update.settings, update.plan.token, { skipConflicts: true });
  assert.match(await read(root, '.agents/skills/harness-a/SKILL.md'), /Vores egen tilføjelse/);
  assert.match(await read(root, 'AGENTS.md'), /# Grundregler \(rettet\)/);
  const manifest = JSON.parse(await read(root, installer.MANIFEST));
  assert.equal(manifest.version, '0.3.0');
  assert.ok(manifest.skipped.includes('AGENTS.md'));
  assert.equal(manifest.files['.agents/skills/harness-a/SKILL.md'], undefined);
  const removal = await installer.planRemoval(root);
  await installer.remove(root, removal.token);
  assert.match(await read(root, '.agents/skills/harness-a/SKILL.md'), /Vores egen tilføjelse/);
  assert.equal(await exists(root, '.agents/skills/harness-b'), false);
});

test('opdaterer uændrede filer ved ny version og fjerner filer fra fravalgte værktøjer', async t => {
  const root = await project(t);
  await (await install(root, library(), ['claude-code'])).apply();
  const update = await install(root, library('0.3.0', '\nNy linje.'), ['claude-code']);
  assert.equal(update.plan.operations.find(op => op.path === '.claude/skills/harness-a/SKILL.md').action, 'opdater');
  assert.equal(update.plan.operations.find(op => op.path === 'AGENTS.md').action, 'opdater');
  await update.apply();
  assert.match(await read(root, '.claude/skills/harness-a/SKILL.md'), /Ny linje/);
  const switched = await install(root, library('0.3.0', '\nNy linje.'), ['codex']);
  assert.equal(switched.plan.operations.find(op => op.path === '.claude/skills/harness-a/SKILL.md').action, 'fjern');
  assert.equal(switched.plan.operations.find(op => op.path === 'CLAUDE.md').action, 'fjern');
  await switched.apply();
  assert.equal(await exists(root, '.claude'), false);
  assert.equal(await exists(root, 'CLAUDE.md'), false);
  assert.match(await read(root, '.agents/skills/harness-a/SKILL.md'), /Ny linje/);
});

test('afviser forældede gennemgange, ødelagte markører og symbolske links', async t => {
  const root = await project(t);
  const stale = await install(root, library(), ['codex']);
  await fs.writeFile(path.join(root, 'AGENTS.md'), 'Skrevet efter gennemgangen.\n');
  await assert.rejects(stale.apply(), /ændret siden gennemgangen/);
  await fs.writeFile(path.join(root, 'AGENTS.md'), '<!-- ai-harness:start -->\nA\n<!-- ai-harness:start -->\n');
  assert.equal((await install(root, library(), ['codex'])).plan.operations.find(op => op.path === 'AGENTS.md').action, 'konflikt');
  await fs.rm(path.join(root, 'AGENTS.md'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-udenfor-'));
  t.after(() => fs.rm(outside, { recursive: true, force: true }));
  await fs.symlink(outside, path.join(root, '.agents'));
  const linked = await install(root, library(), ['codex']);
  assert.ok(linked.plan.operations.filter(op => op.path.startsWith('.agents/')).every(op => op.action === 'konflikt'));
  await installer.apply(root, linked.layout.entries, linked.settings, linked.plan.token, { skipConflicts: true });
  assert.deepEqual(await fs.readdir(outside), []);
});

test('filer med samme indhold overtages, og en anden skill med samme navn blandes ikke', async t => {
  const root = await project(t);
  const lib = library();
  await fs.mkdir(path.join(root, '.agents/skills/harness-b/references'), { recursive: true });
  await fs.writeFile(path.join(root, '.agents/skills/harness-b/SKILL.md'), 'Projektets egen skill med samme navn.\n');
  await fs.mkdir(path.join(root, '.agents/skills/harness-a'), { recursive: true });
  await fs.writeFile(path.join(root, '.agents/skills/harness-a/SKILL.md'), lib.skills[0].files[0].content);
  const run = await install(root, lib, ['codex']);
  const action = file => run.plan.operations.find(op => op.path === file).action;
  assert.equal(action('.agents/skills/harness-a/SKILL.md'), 'uaendret');
  assert.equal(action('.agents/skills/harness-b/references/detaljer.md'), 'konflikt');
  await installer.apply(root, run.layout.entries, run.settings, run.plan.token, { skipConflicts: true });
  assert.equal(await exists(root, '.agents/skills/harness-b/references/detaljer.md'), false);
  assert.ok(JSON.parse(await read(root, installer.MANIFEST)).files['.agents/skills/harness-a/SKILL.md']);
});

test('et udvalg af skills installeres, fravalgte fjernes ved næste installation, og oversigten følger udvalget', async t => {
  const root = await project(t);
  await (await install(root, library(), ['codex'], undefined, ['harness-a'])).apply();
  assert.equal(await exists(root, '.agents/skills/harness-b'), false);
  assert.match(await read(root, 'AGENTS.md'), /`harness-a`/);
  assert.doesNotMatch(await read(root, 'AGENTS.md'), /`harness-b`/);
  assert.deepEqual(JSON.parse(await read(root, installer.MANIFEST)).skills, ['harness-a']);
  assert.match(await read(root, '.harness/LAES-MIG.md'), /1 af 2 skills[\s\S]*Fravalgt: harness-b/);
  const more = await install(root, library(), ['codex'], undefined, ['harness-b']);
  assert.equal(more.plan.operations.find(op => op.path === '.agents/skills/harness-a/SKILL.md').action, 'fjern');
  assert.equal(more.plan.operations.find(op => op.path === '.agents/skills/harness-b/SKILL.md').action, 'opret');
  await more.apply();
  assert.equal(await exists(root, '.agents/skills/harness-a'), false);
  const none = await install(root, library(), ['codex'], undefined, []);
  await none.apply();
  assert.equal(await exists(root, '.agents'), false);
  assert.doesNotMatch(await read(root, 'AGENTS.md'), /## Skills fra AI Harness/);
  assert.match(await read(root, 'AGENTS.md'), /# Grundregler/);
  assert.throws(() => layoutFor(library(), ['codex'], { skills: ['harness-ukendt'] }), /Ukendt skill/);
});
