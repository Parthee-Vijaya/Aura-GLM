const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Store } = require('../core/store.cjs');
const { Features, resolve, couple } = require('../core/features.cjs');
const { loadLibrary } = require('../core/library.cjs');
const { permissions, writeSkills } = require('../core/engine.cjs');
const { appRules } = require('../core/project-guidance.cjs');
const profiles = path.join(__dirname, '../../profiles');
async function temp(t) { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-funktioner-'))); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
const definitions = [{ id: 'versioner' }, { id: 'design' }, { id: 'deling', requires: ['versioner'] }];

test('uden valg er alle funktioner slået til, og en funktion følger den, den bygger på', () => {
  assert.deepEqual(resolve(definitions), { versioner: true, design: true, deling: true });
  assert.deepEqual(resolve(definitions, { versioner: false }), { versioner: false, design: true, deling: false });
  assert.deepEqual(resolve(definitions, { design: false }, { design: true }), { versioner: true, design: true, deling: true }, 'en undtagelse går forud for standarden');
  assert.deepEqual(couple(definitions, { deling: true }), { deling: true, versioner: true });
  assert.deepEqual(couple(definitions, { versioner: false }), { versioner: false, deling: false });
});

test('standarden gælder alle projekter; undtagelser gemmes kun, når de afviger', async t => {
  const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
  const first = await features.get();
  assert.equal(first.chosen, ''); assert.equal(first.list.length, 6);
  assert.ok(Object.values(first.effective).every(Boolean), 'uden et valg er hele pakken slået til');
  assert.equal(first.list.find(feature => feature.id === 'kvalitet').skills[0].title, 'Kodestil og vedligeholdelse');
  // Vælg selv ved første start: kun versioner.
  const picked = await features.save(null, { scope: 'alle', chosen: 'valgt', values: { versioner: true, planlaegning: false, design: false, sikkerhed: false, kvalitet: false, deling: false } });
  assert.equal(picked.chosen, 'valgt');
  assert.deepEqual(picked.defaults, { versioner: true, planlaegning: false, design: false, sikkerhed: false, kvalitet: false, deling: false });
  // Et projekt får design som undtagelse. Deling slår også versionerne til, som allerede er standard, så kun deling gemmes.
  const project = await features.save('/projekt', { scope: 'projekt', values: { design: true } });
  assert.deepEqual(project.exceptions, { design: true });
  assert.deepEqual((await features.save('/projekt', { scope: 'projekt', values: { deling: true } })).exceptions, { design: true, deling: true });
  assert.equal((await features.get('/andet')).effective.design, false, 'andre projekter følger standarden');
  // Slås versioner fra i projektet, følger deling med, og Brug standarden fjerner undtagelsen igen.
  const off = await features.save('/projekt', { scope: 'projekt', values: { versioner: false } });
  assert.deepEqual(off.exceptions, { design: true, versioner: false }); assert.equal(off.effective.deling, false);
  assert.deepEqual((await features.save('/projekt', { scope: 'projekt', values: { versioner: null } })).exceptions, { design: true });
  // Når standarden ændres til det samme som undtagelsen, betyder undtagelsen ikke noget, men den bevares til den ændres.
  const all = await features.save('/projekt', { scope: 'alle', values: { design: true } });
  assert.equal(all.chosen, 'valgt', 'valget ved første start bevares'); assert.equal(all.defaults.design, true);
  for (const input of [null, { scope: 'alle', values: { ukendt: true } }, { scope: 'alle', values: { design: 'ja' } }, { scope: 'alle', values: { design: null } }, { scope: 'projekt', values: {}, chosen: 'alle' }, { scope: 'alle', values: {}, chosen: 'nogle' }])
    await assert.rejects(features.save('/projekt', input), /Ugyldigt valg|Ukendt funktion/);
  await assert.rejects(features.save(null, { scope: 'projekt', values: { design: true } }), /Åbn et projekt/);
});

// Samme regler som OpenCodes tilladelser: * rammer alt, også skråstreger, og den sidste regel, der passer, gælder.
// Mønstrene er afprøvet mod den rigtige OpenCode 1.18.33 med scripts/verify-app-skills.cjs.
const match = (text, pattern) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 's').test(text);
function decide(rules, text) { let result = 'ask'; for (const [pattern, action] of Object.entries(typeof rules === 'string' ? { '*': rules } : rules)) if (match(text, pattern)) result = action; return result; }

test('læseregler virker med stier i forhold til Git-roden og uden Git', () => {
  const key = 'a'.repeat(64), engine = `/Users/test/Library/Application Support/AI Harness/harness/runtime/${key}`;
  const policy = permissions('/Users/test/Documents/AI Harness/projekt', ['references/valgt.pdf'], 'free', { directory: engine, names: ['harness-kodestil'] });
  const git = { privat: 'references/andet.pdf', valgt: 'references/valgt.pdf', gitConfig: '.git/config', skill: `../../Library/Application Support/AI Harness/harness/runtime/${key}/config/skills/harness-kodestil/SKILL.md` };
  const plain = { privat: 'Users/test/Documents/AI Harness/projekt/references/andet.pdf', valgt: 'Users/test/Documents/AI Harness/projekt/references/valgt.pdf', gitConfig: 'Users/test/Documents/AI Harness/projekt/.git/config', skill: `Users/test/Library/Application Support/AI Harness/harness/runtime/${key}/config/skills/harness-kodestil/references/detaljer.md` };
  for (const paths of [git, plain]) {
    assert.equal(decide(policy.read, paths.privat), 'deny', `private referencer: ${paths.privat}`);
    assert.equal(decide(policy.read, paths.valgt), 'allow', `valgt reference: ${paths.valgt}`);
    assert.equal(decide(policy.read, paths.gitConfig), 'deny', `Git-mappen: ${paths.gitConfig}`);
    assert.equal(decide(policy.read, paths.skill), 'allow', `skillens filer: ${paths.skill}`);
  }
  for (const file of ['.env', 'src/.env.local', 'noegle.pem', 'secrets/token.txt', 'app/secrets/a.json']) assert.equal(decide(policy.read, file), 'deny', file);
  assert.equal(decide(policy.read, 'public/index.html'), 'allow');
  assert.equal(decide(policy.read, 'referencer/ok.md'), 'allow', 'kun mappen references er privat');
  // Mappen uden for projektet: kun skillmappen er åben. Filer der kan ikke ændres.
  assert.equal(decide(policy.external_directory, `${engine}/config/skills/harness-kodestil/references/*`), 'allow');
  assert.equal(decide(policy.external_directory, `${engine}/data/*`), 'ask');
  assert.equal(decide(policy.external_directory, '/Users/test/Documents/andet/*'), 'ask');
  assert.equal(decide(policy.edit, git.skill), 'deny');
  assert.equal(decide(policy.edit, '.git/hooks/pre-commit'), 'deny');
  assert.equal(decide(policy.edit, 'public/index.html'), 'ask');
  // Kun aktive skills kan hentes; OpenCodes egne skills er skjult. Det gælder også under planlægning.
  for (const mode of ['free', 'plan']) {
    const rules = permissions('/p', [], mode, { directory: engine, names: ['harness-kodestil'] }).skill;
    assert.equal(decide(rules, 'harness-kodestil'), 'allow'); assert.equal(decide(rules, 'customize-opencode'), 'deny'); assert.equal(decide(rules, 'harness-sikkerhedsgennemgang'), 'deny');
  }
  assert.equal(permissions('/p', [], 'free', { directory: engine, names: [] }).skill, 'deny', 'uden aktive skills er værktøjet lukket');
});

test('motorens skillmappe skrives forfra og tager kun gyldige skills', async t => {
  const directory = await temp(t), skill = name => ({ name, files: [{ path: 'SKILL.md', content: `---\nname: ${name}\ndescription: Prøve.\n---\n` }, { path: 'references/detaljer.md', content: 'Detaljer.' }] });
  await writeSkills(directory, [skill('harness-a'), skill('harness-b')]);
  assert.deepEqual((await fs.readdir(path.join(directory, 'config/skills'))).sort(), ['harness-a', 'harness-b']);
  assert.equal(await fs.readFile(path.join(directory, 'config/skills/harness-a/references/detaljer.md'), 'utf8'), 'Detaljer.');
  await writeSkills(directory, [skill('harness-b')]);
  assert.deepEqual(await fs.readdir(path.join(directory, 'config/skills')), ['harness-b'], 'en fravalgt skill bliver ikke liggende');
  await assert.rejects(writeSkills(directory, [skill('customize-opencode')]), /ugyldig/);
  await assert.rejects(writeSkills(directory, [{ name: 'harness-c', files: [{ path: 'SKILL.md', content: 'x' }, { path: '../../udenfor.md', content: 'x' }] }]), /ugyldig fil/);
  await assert.rejects(writeSkills(directory, [{ name: 'harness-c', files: [{ path: 'references/detaljer.md', content: 'x' }] }]), /ugyldig/);
});

test('appens regler følger funktionerne', () => {
  const all = { versioner: true, planlaegning: true, design: true, sikkerhed: true, kvalitet: true, deling: true };
  const full = appRules(all, { skills: ['harness-kodestil'], links: ['https://design.example'], autoCheckpoint: true });
  assert.match(full, /gemmer selv en version efter hver AI-opgave/); assert.match(full, /Del-knap/); assert.match(full, /designlinks/); assert.match(full, /skill-værktøjet: harness-kodestil/);
  assert.doesNotMatch(full, /planlægning før bygning fra/);
  const none = appRules({ ...all, versioner: false, deling: false, planlaegning: false, design: false }, { links: ['https://design.example'], mode: 'free' });
  assert.match(none, /slået versioner fra/); assert.match(none, /slået deling og udgivelse fra/); assert.match(none, /Byg direkte/); assert.match(none, /ikke slået skills fra AI Harness til/);
  assert.doesNotMatch(none, /designlinks/);
  assert.match(appRules(all, { autoCheckpoint: false }), /Brugeren gemmer versioner i appen/);
  for (const text of [full, none]) assert.match(text, /Bed aldrig om API-nøgler/);
});
