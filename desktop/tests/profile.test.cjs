const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { Profile } = require('../core/profile.cjs');
const { Preferences } = require('../core/preferences.cjs');
const { Workbench } = require('../core/workbench.cjs');

// Standardprofilen fra designdokumentet; get() på en tom settings.json svarer præcis denne form.
const standardProfile = () => ({ name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat', projectDefaults: { hosting: '', designID: '', tests: 'senere' }, migrated: 0 });

async function fixture(t, setup) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-profil-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  if (setup) await store.update(setup);
  return store;
}

test('get() på tom settings.json returnerer standardprofilen uden advarsler', async t => {
  const store = await fixture(t);
  assert.deepEqual(await new Profile(store).get(), { profile: standardProfile(), warnings: [] });
});

test('save() erstatter kun de angivne felter; appearance flettes felt for felt', async t => {
  const store = await fixture(t), profile = new Profile(store);
  await profile.save({ name: 'Parthee', icon: 'star', helpLevel: 'minimal', workMode: 'plan', appearance: { theme: 'dark', panelOpen: false } });
  const second = await profile.save({ name: 'Anna' });
  assert.equal(second.profile.name, 'Anna');
  assert.equal(second.profile.icon, 'star');
  assert.equal(second.profile.helpLevel, 'minimal');
  assert.equal(second.profile.workMode, 'plan');
  assert.deepEqual(second.profile.appearance, { theme: 'dark', panelOpen: false });
  // Appearance merges per field: a writer that owns only the theme can never
  // drag the panel's saved state back over a newer write (or vice versa).
  const third = await profile.save({ appearance: { theme: 'light' } });
  assert.deepEqual(third.profile.appearance, { theme: 'light', panelOpen: false }, 'theme skifter og panelOpen bevares fra profilen');
  const fourth = await profile.save({ appearance: { panelOpen: true } });
  assert.deepEqual(fourth.profile.appearance, { theme: 'light', panelOpen: true }, 'panelet skifter og temaet bevares fra profilen');
  assert.deepEqual((await store.read()).profile, fourth.profile);
});

test('save() afviser ugyldige værdier uden at gemme noget', async t => {
  const store = await fixture(t), profile = new Profile(store);
  await profile.save({ name: 'Parthee' });
  const invalid = [{ icon: 'drage' }, { icon: 7 }, { helpLevel: 'megen' }, { appearance: { theme: 'blå' } }, { appearance: { theme: 'dark', panelOpen: 'ja' } }, { appearance: { theme: null } }, { workMode: 'byg' }, { name: 'x'.repeat(61) }, { name: 'navn\tmed fane' }, { standardAI: { connectionID: 'x'.repeat(101) } }, { standardAI: 'ai' }, { projectDefaults: { hosting: 'andet' } }];
  for (const values of invalid) await assert.rejects(() => profile.save(values));
  assert.deepEqual((await profile.get()).profile, { ...standardProfile(), name: 'Parthee' }, 'afviste kald ændrer intet');
  assert.deepEqual(Profile.ICON_IDS, ['star', 'bolt', 'leaf', 'moon', 'box', 'bird', 'wave', 'compass', 'flame', 'heart', 'cube', 'spark']);
});

// ---------- Læsning er eftergivende: en ukendt værdi låser aldrig appen ----------
test('get() læser en profil fra en nyere version felt for felt med fallback og advarsler', async t => {
  const store = await fixture(t, s => {
    s.designs = [{ id: 'd1' }];
    s.profile = { name: 'Parthee', icon: 'drage', helpLevel: 'megen', appearance: { theme: 'blå', panelOpen: 'ja' }, standardAI: { connectionID: 7, modelID: 'm1' }, workMode: 'byg', projectDefaults: { hosting: 'udgået', designID: 'd1', tests: 'auto-godkend' }, migrated: 0 };
  });
  const read = await new Profile(store).get();
  assert.deepEqual(read.profile, {
    ...standardProfile(), name: 'Parthee',
    standardAI: { connectionID: '', modelID: 'm1' },
    projectDefaults: { hosting: '', designID: 'd1', tests: 'senere' },
  }, 'hvert ukendt felt falder tilbage alene — de læsbare søsterfelter overlever');
  assert.deepEqual(read.warnings, [
    'Dit profilikon kunne ikke læses og er nulstillet.',
    'Dit hjælpeniveau kunne ikke læses og er nulstillet.',
    'Dit udseende kunne ikke læses og er nulstillet.',
    'Din standard-AI kunne ikke læses og er nulstillet.',
    'Din arbejdsmåde kunne ikke læses og er nulstillet.',
    'Dine projektstandarder kunne ikke læses og er nulstillet.',
  ], 'hvert nulstillet felt advarses på dansk');
  assert.equal((await store.read()).profile.icon, 'drage', 'get() er læsevej og ændrer ikke filen');
  // En senere gemning reparerer filen: patch'et er stadig strengt valideret.
  const saved = await new Profile(store).save({ name: 'Anna' });
  assert.equal(saved.profile.icon, '', 'den ulæselige værdi er nu gemt som standarden');
  assert.equal((await store.read()).profile.icon, '');
  assert.equal((await new Profile(store).get()).warnings.length, 0, 'den reparerede profil læses uden advarsler');
});

test('get() håndterer en profil, der slet ikke er et objekt', async t => {
  const store = await fixture(t, s => { s.profile = 'ævl'; });
  const read = await new Profile(store).get();
  assert.deepEqual(read.profile, standardProfile());
  assert.deepEqual(read.warnings, ['Din profil kunne ikke læses og er nulstillet.']);
  assert.equal((await store.read()).profile, 'ævl', 'filen røres ikke af læsningen');
  await new Profile(store).save({ name: 'Anna' });
  assert.deepEqual((await new Profile(store).get()).profile, { ...standardProfile(), name: 'Anna' }, 'gemningen genopretter en læsbar profil');
});

test('migrate() tåler startupDefaults med udgåede værdier og folder kun de læsbare', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.startupDefaults = { hosting: 'udgået-hosting', connectionID: 'ai', designID: 'd1', tests: 'auto-godkend' };
  });
  const profile = new Profile(store);
  const { profile: migrated } = await profile.migrate({});
  assert.equal(migrated.migrated, 1, 'migrationen gennemføres trods de udgåede værdier');
  assert.equal(migrated.standardAI.connectionID, 'ai', 'den læsbare forbindelse folder ind');
  assert.equal(migrated.projectDefaults.designID, 'd1', 'den læsbare designpakke folder ind');
  assert.deepEqual(migrated.projectDefaults, { hosting: '', designID: 'd1', tests: 'senere' }, 'de udgåede værdier bliver til standarden — ikke til en fejl');
});

test('migrate() læser en korrupt profil eftergivende og sætter markøren alligevel', async t => {
  const store = await fixture(t, s => {
    s.startupDefaults = { hosting: 'vercel', designID: '', tests: 'manuel' };
    s.profile = { name: 'Parthee', icon: 'drage', helpLevel: 'megen', appearance: { theme: 'blå' }, standardAI: 'ai', workMode: 7, projectDefaults: 'ævl', migrated: 0 };
  });
  const { profile: migrated } = await new Profile(store).migrate({ workspaceTheme: 'dark' });
  assert.equal(migrated.migrated, 1);
  assert.equal(migrated.name, 'Parthee', 'de læsbare felter bevares');
  assert.equal(migrated.icon, '', 'det ulæselige ikon er nulstillet');
  assert.equal(migrated.appearance.theme, 'dark', 'rendererens temavalg folder ind i det nulstillede felt');
  assert.deepEqual(migrated.projectDefaults, { hosting: 'vercel', designID: '', tests: 'manuel' }, 'startupDefaults folder ind i de tomme standarder');
  assert.deepEqual((await store.read()).profile, migrated, 'migrationen gemmer den læselige profil');
});

test('migrate() folder gemte opstartsvalg og gamle renderer-nøgler ind i tomme felter', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.startupDefaults = { hosting: 'vercel', connectionID: 'ai', designID: 'd1', tests: 'automatiske' };
  });
  const { profile } = await new Profile(store).migrate({ preferredConnection: 'nyere', workspaceTheme: 'dark', surfaceOpen: 'false' });
  assert.equal(profile.migrated, 1);
  assert.equal(profile.standardAI.connectionID, 'ai', 'opstartsvalgene folder først og vinder over rendererens gamle nøgle');
  assert.deepEqual(profile.projectDefaults, { hosting: 'vercel', designID: 'd1', tests: 'automatiske' });
  assert.equal(profile.appearance.theme, 'dark');
  assert.equal(profile.appearance.panelOpen, false);
  assert.deepEqual((await store.read()).profile, profile);
});

test('den anden migrate() er en no-op, selv med nye værdier', async t => {
  const store = await fixture(t, s => { s.startupDefaults = { hosting: 'vercel', connectionID: 'ai', designID: 'd1', tests: 'automatiske' }; });
  const profile = new Profile(store);
  const first = await profile.migrate({ workspaceTheme: 'dark' });
  const second = await profile.migrate({ preferredConnection: 'anden', workspaceTheme: 'light', surfaceOpen: 'true' });
  assert.deepEqual(second.profile, first.profile);
  assert.deepEqual((await store.read()).profile, first.profile);
  const saved = await profile.save({ name: 'Parthee', migrated: 0 });
  assert.equal(saved.profile.migrated, 1, 'markøren kan ikke nulstilles fra rendereren');
});

test('migrate() lader udfyldte profilfelter vinde over gamle værdier', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.startupDefaults = { hosting: 'vercel', connectionID: 'ai', designID: 'd1', tests: 'automatiske' };
    s.profile = { name: 'Parthee', icon: 'star', helpLevel: 'minimal', appearance: { theme: 'light', panelOpen: false }, standardAI: { connectionID: 'egen', modelID: 'm1' }, workMode: 'plan', projectDefaults: { hosting: 'own', designID: '', tests: 'manuel' }, migrated: 0 };
  });
  const { profile } = await new Profile(store).migrate({ preferredConnection: 'ai', workspaceTheme: 'dark', surfaceOpen: 'true' });
  assert.equal(profile.standardAI.connectionID, 'egen');
  assert.equal(profile.standardAI.modelID, 'm1');
  assert.equal(profile.appearance.theme, 'light');
  assert.equal(profile.appearance.panelOpen, false);
  assert.equal(profile.projectDefaults.hosting, 'own');
  assert.equal(profile.projectDefaults.tests, 'manuel');
  assert.equal(profile.projectDefaults.designID, 'd1', 'tomme felter udfyldes stadig');
  assert.equal(profile.migrated, 1);
});

test('fjernelse af standardforbindelsen rydder profilens standard-AI', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-profil-fjern-'));
  const bench = new Workbench({ directory, safeStorage: {}, profiles: path.join(__dirname, '../../profiles'), emit() {} });
  t.after(async () => { await bench.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const store = new Store(directory, {});
  await store.update(s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.profile = { ...standardProfile(), name: 'Parthee', standardAI: { connectionID: 'ai', modelID: 'm1' }, migrated: 1 };
  });
  await bench.removeConnection('ai');
  const { profile } = await new Profile(store).get();
  assert.deepEqual(profile.standardAI, { connectionID: '', modelID: '' });
  assert.equal(profile.name, 'Parthee', 'resten af profilen bevares');
});

test('manglende standardforbindelse og -design ryddes med danske advarsler', async t => {
  const store = await fixture(t, s => {
    s.profile = { ...standardProfile(), standardAI: { connectionID: 'borte', modelID: 'm1' }, projectDefaults: { hosting: '', designID: 'design', tests: 'senere' }, migrated: 1 };
  });
  const read = await new Profile(store).get();
  assert.deepEqual(read.warnings, ['Din standard-AI findes ikke længere. Vælg en ny, eller beslut senere.', 'Din standarddesignpakke findes ikke længere.']);
  assert.deepEqual(read.profile.standardAI, { connectionID: '', modelID: '' });
  assert.equal(read.profile.projectDefaults.designID, '');
  assert.equal((await store.read()).profile.standardAI.connectionID, 'borte', 'get() er læsevej og ændrer ikke filen');
  const written = await new Profile(store).save({ name: 'Parthee' });
  assert.deepEqual(written.warnings, read.warnings);
  assert.deepEqual((await store.read()).profile.standardAI, { connectionID: '', modelID: '' }, 'save() gemmer den ryddede profil');
});

test('præferencer læser og skriver profilens projektstandarder', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.designs = [{ id: 'design' }];
    s.profile = { ...standardProfile(), projectDefaults: { hosting: 'vercel', designID: 'design', tests: 'automatiske' }, migrated: 1 };
    s.startupDefaults = { hosting: 'own', connectionID: 'ai', designID: '', tests: 'manuel' };
  });
  const prefs = new Preferences(store);
  assert.deepEqual((await prefs.get()).values, { hosting: 'vercel', connectionID: '', designID: 'design', tests: 'automatiske' }, 'profilen svarer, ikke de gamle opstartsvalg');
  await prefs.save({ hosting: 'azure', connectionID: 'ai', designID: '', tests: 'senere' });
  const state = await store.read();
  assert.deepEqual(state.profile.projectDefaults, { hosting: 'azure', designID: '', tests: 'senere' }, 'save skriver tilbage til profilens projektstandarder');
  assert.ok(!('connectionID' in state.profile.projectDefaults), 'connectionID hører til standardAI og gemmes aldrig i projectDefaults');
  assert.equal(state.startupDefaults.hosting, 'own', 'de gamle opstartsvalg røres ikke');
});
