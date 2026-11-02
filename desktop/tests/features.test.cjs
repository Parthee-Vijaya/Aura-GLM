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
const { Skills } = require('../core/skills.cjs');
const profiles = path.join(__dirname, '../../profiles');
async function temp(t) { const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'harness-funktioner-'))); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
const definitions = [{ id: 'versioner' }, { id: 'design', alwaysOn: true }, { id: 'deling', requires: ['versioner'], default: false }];
// Katalogets "hele pakke": alt undtagen Udgivelse og integrationer, som er fravalgt uden et login.
const full = { versioner: true, planlaegning: true, design: true, sikkerhed: true, kvalitet: true, deling: false, 'integration-adresser': false, 'integration-cvr': false, 'integration-promte': false, 'integration-komplai-run': false };
// Grundpakken: designhjælpen (altid aktiv) — resten tilvælges ad gangen.
const base = { ...full, versioner: false, planlaegning: false, sikkerhed: false, kvalitet: false };

test('uden valg gælder grundpakken; hele pakken følger katalogets anbefaling', () => {
  assert.deepEqual(resolve(definitions), { versioner: false, design: true, deling: false }, 'grundpakken: kun altid-aktive og udtrykkeligt anbefalede funktioner');
  assert.deepEqual(resolve(definitions, { versioner: true, deling: true }), { versioner: true, design: true, deling: true }, 'et eget valg vinder over grundpakken');
  assert.deepEqual(resolve(definitions, { versioner: false }), { versioner: false, design: true, deling: false });
  assert.deepEqual(resolve(definitions, { deling: true }), { versioner: false, design: true, deling: false }, 'Udgivelse bygger på versioner og følger den med i fravalg');
  assert.deepEqual(resolve(definitions, { design: false }, { design: false }), { versioner: false, design: true, deling: false }, 'grundpakken gælder også ved gamle fravalg');
  assert.deepEqual(resolve(definitions, {}, {}, true), { versioner: true, design: true, deling: false }, 'hele pakken er alt undtagen katalogets egne fravalg');
  assert.deepEqual(couple(definitions, { deling: true }), { deling: true, versioner: true });
  assert.deepEqual(couple(definitions, { versioner: false }), { versioner: false, deling: false });
});

test('standarden gælder alle projekter; undtagelser gemmes kun, når de afviger', async t => {
  const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
  const first = await features.get();
  assert.equal(first.chosen, ''); assert.equal(first.list.filter(feature => !feature.group).length, 6);
  assert.deepEqual(first.list.filter(feature => feature.group === 'integrationer').map(feature => feature.id), ['integration-adresser', 'integration-cvr', 'integration-promte', 'integration-komplai-run']);
  assert.equal(first.list.find(feature => feature.id === 'integration-cvr').skills[0].integration.owner, 'Erhvervsstyrelsen');
  assert.deepEqual(first.defaults, base, 'uden valg gælder grundpakken: kun designhjælpen er slået til');
  assert.deepEqual(Object.keys(first.effective).filter(id => first.effective[id]), ['design'], 'en ny bruger starter med grundpakken');
  assert.equal(first.list.find(feature => feature.id === 'kvalitet').skills[0].title, 'Kodestil og vedligeholdelse');
  // Et gammelt "Vælg selv"-valg fra onboarding respekteres fortsat som ethvert andet valg.
  const picked = await features.save(null, { scope: 'alle', chosen: 'valgt', values: { versioner: true, planlaegning: false, design: false, sikkerhed: false, kvalitet: false, deling: false } });
  assert.equal(picked.chosen, 'valgt');
  assert.deepEqual(picked.defaults, { ...base, versioner: true });
  // Et projekt får kodekvalitet som undtagelse. Deling slår også versionerne til, som allerede er standard, så kun deling gemmes.
  const project = await features.save('/projekt', { scope: 'projekt', values: { kvalitet: true } });
  assert.deepEqual(project.exceptions, { kvalitet: true });
  assert.deepEqual((await features.save('/projekt', { scope: 'projekt', values: { deling: true } })).exceptions, { kvalitet: true, deling: true });
  assert.equal((await features.get('/andet')).effective.kvalitet, false, 'andre projekter følger standarden');
  // Slås versioner fra i projektet, følger deling med, og Brug standarden fjerner undtagelsen igen.
  const off = await features.save('/projekt', { scope: 'projekt', values: { versioner: false } });
  assert.deepEqual(off.exceptions, { kvalitet: true, versioner: false }); assert.equal(off.effective.deling, false);
  assert.deepEqual((await features.save('/projekt', { scope: 'projekt', values: { versioner: null } })).exceptions, { kvalitet: true });
  // Når standarden ændres til det samme som undtagelsen, betyder undtagelsen ikke noget, men den bevares til den ændres.
  const all = await features.save('/projekt', { scope: 'alle', values: { kvalitet: true } });
  assert.equal(all.chosen, 'valgt', 'valget ved første start bevares'); assert.equal(all.defaults.kvalitet, true);
  // Hele pakken følger igen katalogets anbefaling, også efter Vælg selv.
  const recommended = await features.save(null, { scope: 'alle', chosen: 'alle', values: {} });
  assert.equal(recommended.chosen, 'alle'); assert.deepEqual(recommended.defaults, full, 'hele pakken er alt undtagen katalogets fravalg');
  assert.deepEqual((await store.read()).features.on, {}, 'intet valg gemmes, så en ny anbefaling slår igennem');
  for (const input of [null, { scope: 'alle', values: { ukendt: true } }, { scope: 'alle', values: { design: 'ja' } }, { scope: 'alle', values: { design: null } }, { scope: 'projekt', values: {}, chosen: 'alle' }, { scope: 'alle', values: {}, chosen: 'nogle' }])
    await assert.rejects(features.save('/projekt', input), /Ugyldigt valg|Ukendt funktion/);
  await assert.rejects(features.save(null, { scope: 'projekt', values: { kvalitet: true } }), /Åbn et projekt/);
});

// Før grundpakken var standard, betød "intet valg" alle funktioner slået til. Migreringen
// vurderer standarden én gang: en eksisterende installation låser hele pakken fast som
// chosen 'alle', så ingen mister funktioner stille, mens en helt ny installation starter
// med grundpakken — uanset hvor meget den bruges bagefter.
test('migreringen låser hele pakken fast for eksisterende installationer — én gang', async t => {
  const signs = [
    ['en gemt forbindelse', state => { state.connections.push({ id: 'c1', kind: 'corti', name: 'Forbindelse' }); }],
    ['et gemt projekt', state => { state.projects['rod'] = {}; }],
    ['en udgivelses-login', state => { state.hosting = { komplai: { secret: 'krypteret' } }; }],
    ['et tidligere funktionsvalg', state => { state.features = { on: { kvalitet: true } }; }],
    ['de gamle opstartsvalg', state => { state.startupDefaults = { hosting: '' }; }]
  ];
  for (const [name, sign] of signs) {
    const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
    await store.update(sign);
    // Profilmigreringen ved appstart vurderer standardpakken, før noget læses.
    await features.migrate();
    const read = await features.get();
    assert.equal(read.chosen, 'alle', `${name}: hele pakken låses fast`);
    assert.equal(read.defaults.versioner, true, `${name}: versioner forbliver slået til`);
    assert.equal(read.defaults.kvalitet, true, `${name}: kodekvalitet forbliver slået til`);
    assert.equal(read.defaults.design, true, `${name}: designhjælpen er altid med`);
    const saved = await store.read();
    assert.equal(saved.features.chosen, 'alle', `${name}: valget gemmes`);
    assert.equal(saved.featuresDefault, 'alle', `${name}: migreringen er vurderet`);
    if (name === 'et tidligere funktionsvalg') assert.equal(read.defaults.deling, false, 'det gamle eget valg bevares');
  }
  // Migreringen sker kun én gang: forsvinder tegnet igen, holder låsen stadig.
  const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
  await store.update(state => { state.connections.push({ id: 'c1', kind: 'corti', name: 'Forbindelse' }); });
  await features.migrate();
  await store.update(state => { state.connections = []; });
  const again = await features.get();
  assert.equal(again.chosen, 'alle', 'låsen overlever, at installationens tegn fjernes');
  assert.equal(again.effective.kvalitet, true);
  // En læsning alene skriver aldrig: uden migreringen forbliver filen urørt.
  const untouched = new Store(await temp(t)), reader = new Features(untouched, () => loadLibrary(profiles));
  await untouched.update(state => { state.connections.push({ id: 'c1', kind: 'corti', name: 'Forbindelse' }); });
  const before = await untouched.read();
  await reader.get();
  assert.deepEqual(await untouched.read(), before, 'get er en ren læsning');
});

test('en ny installation starter med grundpakken — senere brug ændrer den ikke', async t => {
  const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
  await features.migrate();
  const first = await features.get();
  assert.equal(first.chosen, '', 'en ny bruger har ikke valgt en pakke');
  assert.deepEqual(Object.keys(first.effective).filter(id => first.effective[id]), ['design'], 'grundpakken gælder fra første læsning');
  assert.equal((await store.read()).featuresDefault, 'grundpakke', 'migreringen er vurderet én gang');
  // Appen tages i brug: forbindelser og projekter dukker op, men standarden er låst.
  await store.update(state => { state.connections.push({ id: 'c1', kind: 'corti', name: 'Forbindelse' }); state.projects['rod'] = {}; });
  const second = await features.get();
  assert.equal(second.chosen, '', 'senere brug låser ikke hele pakken fast');
  assert.equal(second.effective.versioner, false, 'versioner tilvælges stadig ad gangen');
});

test('et save uden en forudgående læsning migrerer også standarden', async t => {
  const store = new Store(await temp(t)), features = new Features(store, () => loadLibrary(profiles));
  await store.update(state => { state.projects['rod'] = {}; });
  const saved = await features.save(null, { scope: 'alle', values: { versioner: true } });
  assert.equal(saved.chosen, 'alle', 'et eksisterende projekt låser hele pakken fast');
  assert.equal((await store.read()).featuresDefault, 'alle');
});

// Repo-reglen: designhjælpen er altid aktiv. Kataloget markerer den alwaysOn, resolve
// tvinger den til, og hverken standardvalg eller projektundtagelser kan fjerne den.
test('designhjælpen er altid aktiv i kataloget og kan ikke slås fra', async t => {
  const library = await loadLibrary(profiles);
  assert.equal(library.features.find(feature => feature.id === 'design').alwaysOn, true, 'kataloget markerer designhjælpen altid-aktiv');
  const store = new Store(await temp(t)), features = new Features(store, async () => library);
  await store.update(state => { state.features = { chosen: 'valgt', on: { design: false, versioner: false, planlaegning: false, sikkerhed: false, kvalitet: false, deling: false } }; });
  await store.saveProject('/projekt', { features: { design: false } });
  // Et gammelt globalt fravalg og en projektundtagelse ignoreres: grundpakken kan ikke fjernes.
  await features.save(null, { scope: 'alle', values: { design: false } });
  const read = await features.get('/projekt');
  assert.equal(read.defaults.design, true, 'standarden holder designhjælpen slået til');
  assert.equal(read.effective.design, true, 'designhjælpen kan ikke slås fra');
  assert.deepEqual(read.exceptions, {}, 'altid-aktive funktioner har aldrig undtagelser');
  assert.equal(read.list.find(feature => feature.id === 'design').alwaysOn, true, 'panelet viser designhjælpen som altid-aktiv');
});

test('Komplai Run når kun motoren efter tilvalg og fjernes igen ved fravalg', async t => {
  const root = await temp(t), project = path.join(root, 'projekt'), runtime = path.join(root, 'runtime');
  const library = await loadLibrary(profiles), store = new Store(path.join(root, 'appdata'));
  const features = new Features(store, async () => library), skills = new Skills(async () => library, store, features);
  const name = 'harness-integration-komplai-run', id = 'integration-komplai-run';
  assert.ok(!(await skills.context(project)).skills.some(skill => skill.name === name));
  await features.save(project, { scope: 'projekt', values: { [id]: true } });
  const context = await skills.context(project);
  assert.deepEqual(context.integrations, ['Komplai Run']);
  assert.equal(context.features.deling, false, 'en vejledning giver ikke i sig selv adgang til at udgive');
  assert.ok(!(await skills.context(path.join(root, 'andet'))).skills.some(skill => skill.name === name));
  await writeSkills(runtime, context.skills);
  const actual = library.skills.find(skill => skill.name === name);
  const directory = path.join(runtime, 'config/skills', name);
  const entrypoint = await fs.readFile(path.join(directory, 'SKILL.md'), 'utf8');
  assert.ok(entrypoint.startsWith(actual.files.find(file => file.path === 'SKILL.md').content));
  assert.ok(entrypoint.includes(JSON.stringify(path.join(directory, 'references/run.md'))), 'motoren viser den præcise vej til referencen');
  assert.equal(await fs.readFile(path.join(directory, 'references/run.md'), 'utf8'), actual.files.find(file => file.path === 'references/run.md').content);
  await features.save(project, { scope: 'projekt', values: { [id]: false } });
  await writeSkills(runtime, (await skills.context(project)).skills);
  await assert.rejects(fs.access(path.join(runtime, 'config/skills', name)), { code: 'ENOENT' });
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
  assert.match(full, /gemmer selv en version efter hver AI-opgave/); assert.match(full, /Udgiv-knap/); assert.match(full, /designlinks/); assert.match(full, /skill-værktøjet: harness-kodestil/);
  assert.doesNotMatch(full, /planlægning før bygning fra/);
  const none = appRules({ ...all, versioner: false, deling: false, planlaegning: false, design: false }, { links: ['https://design.example'], mode: 'free' });
  assert.match(none, /slået versioner fra/); assert.match(none, /Udgivelse er slået fra/); assert.match(none, /Byg direkte/); assert.match(none, /ikke slået skills fra Aura Harness til/);
  assert.doesNotMatch(none, /designlinks/);
  assert.match(appRules(all, { autoCheckpoint: false }), /Brugeren gemmer versioner i appen/);
  for (const text of [full, none]) assert.match(text, /Bed aldrig om API-nøgler/);
  assert.doesNotMatch(full, /integrationer til/);
  assert.match(appRules(all, { integrations: ['Adresser', 'CVR'] }), /slået disse integrationer til: Adresser, CVR\. .*\.env/);
});

// Et Promte-login gør Udgivelse anbefalet: i hele pakken straks, i grundpakken først med versioner.
test('et Promte-login anbefaler Udgivelse — hele pakken straks, grundpakken med versioner', async t => {
  const library = await loadLibrary(profiles);
  const promte = store => store.update(state => { state.hosting = { ...state.hosting, promte: { 'https://kodning.promte.dk': { secret: 'krypteret', email: 'test@example.invalid', expiresAt: '2099-01-01T00:00:00.000Z' } } }; });
  // Eksisterende installation: loginet findes, før migreringen vurderer → 'alle' og anbefalingen gælder.
  let root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-promte-deling-'));
  let store = new Store(path.join(root, 'appdata')), features = new Features(store, async () => library);
  await promte(store);
  await features.migrate();
  const established = await features.get(null);
  assert.equal(established.chosen, 'alle', 'en installation med et login er eksisterende');
  assert.equal(established.effective.deling, true); assert.equal(established.effective.versioner, true, 'Udgiv kræver versioner');
  await features.save(null, { scope: 'alle', chosen: 'valgt', values: { versioner: true, deling: false } });
  assert.equal((await features.get(null)).effective.deling, false, 'brugerens eget fravalg gælder');
  await fs.rm(root, { recursive: true, force: true });
  // Ny installation: migreringen vurderer, før loginet findes; anbefalingen venter på versioner.
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-promte-deling-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  store = new Store(path.join(root, 'appdata')); features = new Features(store, async () => library);
  await features.migrate();
  assert.equal((await features.get(null)).effective.deling, false, 'uden login er Udgivelse fra');
  await promte(store);
  const lean = await features.get(null);
  assert.equal(lean.chosen, '', 'grundpakken gælder stadig efter loginet');
  assert.equal(lean.effective.versioner, false, 'versioner er fortsat et tilvalg');
  assert.equal(lean.defaults.deling, false, 'anbefalingen trækkes fra, når dens versioner mangler');
});
