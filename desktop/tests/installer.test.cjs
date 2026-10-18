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
    license: 'Syntetisk licenstekst til installationsprøven.\n',
    version, checkedAt: '2026-09-29', controlWord: 'PRØVE-01', skillDirs: ['.agents/skills', '.claude/skills', '.opencode/skills'], neutralSkillDir: '.agents/skills',
    rules: `# Grundregler\n\nVersion: ${version}\n`, gitignore: '.env\n*.key\n', skills: [skill('harness-a', extra), skill('harness-b')],
    tools: [
      { id: 'claude-code', name: 'Claude Code', category: 'agent', rules: { file: 'CLAUDE.md', mode: 'blok', import: 'AGENTS.md' }, skills: { dirs: ['.claude/skills'] } },
      { id: 'codex', name: 'Codex', category: 'agent', rules: { file: 'AGENTS.md', mode: 'blok' }, skills: { dirs: ['.agents/skills'] } },
      { id: 'opencode', name: 'OpenCode', category: 'agent', rules: { file: 'AGENTS.md', mode: 'blok' }, skills: { dirs: ['.opencode/skills', '.claude/skills', '.agents/skills'], duplicates: 'Samme navn vises kun én gang.' } },
      { id: 'aider', name: 'Aider', category: 'agent', rules: { file: 'CONVENTIONS.md', mode: 'blok' }, skills: null },
      { id: 'continue', name: 'Continue', category: 'editor', rules: { file: '.continue/rules/aura-harness.md', mode: 'fil', header: '---\nname: Aura Harness\n---\n\n' }, skills: null },
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
  assert.match(byPath['CLAUDE.md'].content, /^Aura Harness' fælles grundregler[\s\S]*\n@AGENTS\.md$/);
  assert.match(byPath['AGENTS.md'].content, /# Grundregler[\s\S]*## Skills fra Aura Harness[\s\S]*`harness-a`: Arbejdsgang harness-a\./);
  assert.equal(byPath['.continue/rules/aura-harness.md'].kind, 'fil');
  assert.match(byPath['.continue/rules/aura-harness.md'].content, /^---\nname: Aura Harness\n---\n\nDette afsnit vedligeholdes af Aura Harness/);
  assert.equal(byPath['.claude/skills/harness-a/references/detaljer.md'].group, '.claude/skills/harness-a');
  assert.ok(byPath['.gitignore'] && byPath['.harness/LAES-MIG.md']);
});

test('installerer i en tom mappe og gentager uden ændringer', async t => {
  const root = await project(t);
  const first = await install(root, library(), ['claude-code']);
  assert.ok(first.plan.operations.every(op => op.action === 'opret'));
  await first.apply();
  assert.match(await read(root, 'AGENTS.md'), /^<!-- aura-harness:start -->\n[\s\S]*<!-- aura-harness:slut -->\n$/);
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
  assert.match(text, /\r\n<!-- aura-harness:start -->\r\n/);
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
  assert.doesNotMatch(await read(root, 'AGENTS.md'), /## Skills fra Aura Harness/);
  assert.match(await read(root, 'AGENTS.md'), /# Grundregler/);
  assert.throws(() => layoutFor(library(), ['codex'], { skills: ['harness-ukendt'] }), /Ukendt skill/);
});

test('integrationer står som valgfrie og ikke som fravalgte, og kommandolinjen bevarer et udvalg fra appen', async t => {
  const integration = { ...skill('harness-integration-x'), title: 'Register X', integration: { system: 'X', owner: 'Styrelsen', maintainer: 'Aura Harness', access: 'Åben', data: 'Åbne data', dataFlow: 'Fra appen', cost: 'Gratis', itRoute: false, sensitive: false, checkedAt: '2026-09-30' } };
  const lib = { ...library(), skills: [...library().skills, integration] };
  const root = await project(t);
  await (await install(root, lib, ['codex'])).apply();
  assert.equal(await exists(root, '.agents/skills/harness-integration-x'), false, 'integrationer følger ikke med uden et valg');
  let readme = await read(root, '.harness/LAES-MIG.md');
  assert.match(readme, /2 af 2 skills til arbejdet fra idé til drift\./);
  assert.match(readme, /Integrationer, der kan vælges til i Aura-appen: Register X\./);
  assert.doesNotMatch(readme, /Fravalgt/);
  await (await install(root, lib, ['codex'], undefined, ['harness-a', 'harness-integration-x'])).apply();
  readme = await read(root, '.harness/LAES-MIG.md');
  assert.match(readme, /1 af 2 skills til arbejdet fra idé til drift samt integrationen Register X\./);
  assert.match(readme, /Fravalgt: harness-b\./);
  assert.doesNotMatch(readme, /kan vælges til/);

  // Kommandolinjen bruger det rigtige bibliotek og bevarer udvalget fra manifestet, også en valgt integration.
  const cli = path.join(__dirname, '..', '..', 'scripts', 'harness.cjs');
  const run = target => new Promise((resolve, reject) => require('node:child_process').execFile(process.execPath, [cli, 'install', '--tools', 'codex', '--project', target, '--yes'], (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout)));
  const fresh = await project(t);
  await run(fresh);
  const real = await require('../core/library.cjs').loadLibrary(path.join(__dirname, '..', '..', 'profiles'));
  const base = real.skills.filter(item => !item.integration).map(item => item.name);
  assert.deepEqual(JSON.parse(await read(fresh, installer.MANIFEST)).skills, base, 'en ny installation får alle skills undtagen integrationer');
  const chosen = await project(t);
  await (await install(chosen, real, ['codex'], undefined, [base[0], 'harness-integration-adresser'])).apply();
  await run(chosen);
  assert.deepEqual(JSON.parse(await read(chosen, installer.MANIFEST)).skills, [base[0], 'harness-integration-adresser']);
  assert.equal(await exists(chosen, '.agents/skills/harness-integration-adresser/SKILL.md'), true);
  assert.equal(await exists(chosen, `.agents/skills/${base[1]}`), false);
});

test('afsnit med de gamle ai-harness-markører opdateres til aura-harness og kan fjernes', async t => {
  const root = await project(t);
  const lib = library();
  const first = await install(root, lib, ['codex']);
  await first.apply();
  // Som en installation fra før navneskiftet: samme indhold mellem de gamle markører.
  const agents = await read(root, 'AGENTS.md');
  await fs.writeFile(path.join(root, 'AGENTS.md'), '# Projektets egne regler\n\n' + agents.replace('<!-- aura-harness:start -->', '<!-- ai-harness:start -->').replace('<!-- aura-harness:slut -->', '<!-- ai-harness:slut -->'));
  const ignore = await read(root, '.gitignore');
  await fs.writeFile(path.join(root, '.gitignore'), ignore.replace('# aura-harness:start', '# ai-harness:start').replace('# aura-harness:slut', '# ai-harness:slut'));
  const again = await install(root, lib, ['codex']);
  assert.equal(again.plan.operations.find(op => op.path === 'AGENTS.md').action, 'opdater', 'de gamle markører skiftes ud, selv om indholdet er uændret');
  assert.equal(again.plan.operations.find(op => op.path === '.gitignore').action, 'opdater');
  await again.apply();
  const updated = await read(root, 'AGENTS.md');
  assert.match(updated, /^# Projektets egne regler\n\n<!-- aura-harness:start -->/);
  assert.doesNotMatch(updated, /ai-harness/);
  assert.match(await read(root, '.gitignore'), /# aura-harness:start/);
  // Fjernelse finder også afsnit med de gamle markører.
  await fs.writeFile(path.join(root, 'AGENTS.md'), updated.replace('<!-- aura-harness:start -->', '<!-- ai-harness:start -->').replace('<!-- aura-harness:slut -->', '<!-- ai-harness:slut -->'));
  const removal = await installer.planRemoval(root);
  await installer.remove(root, removal.token);
  assert.equal(await read(root, 'AGENTS.md'), '# Projektets egne regler\n');
  // Nye og gamle markører i samme fil er en konflikt, ikke et gæt.
  assert.deepEqual(installer.findBlock('<!-- aura-harness:start -->\nA\n<!-- aura-harness:slut -->\n<!-- ai-harness:start -->\nB\n<!-- ai-harness:slut -->\n', 'AGENTS.md'), { malformed: true });
});
