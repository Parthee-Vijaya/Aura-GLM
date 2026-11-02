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
  assert.deepEqual(await new Profile(store).get(), { profile: standardProfile(), warnings: [], hasAvatar: false });
});

test('save() erstatter kun de angivne felter; appearance flettes felt for felt', async t => {
  const store = await fixture(t), profile = new Profile(store);
  await profile.save({ name: 'Parthee', icon: 'aura-1', helpLevel: 'delvis', workMode: 'plan', appearance: { theme: 'dark', panelOpen: false } });
  const second = await profile.save({ name: 'Anna' });
  assert.equal(second.profile.name, 'Anna');
  assert.equal(second.profile.icon, 'aura-1');
  assert.equal(second.profile.helpLevel, 'delvis');
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
  const invalid = [{ icon: 7 }, { icon: null }, { helpLevel: 'megen' }, { helpLevel: 'minimal' }, { appearance: { theme: 'blå' } }, { appearance: { theme: 'dark', panelOpen: 'ja' } }, { appearance: { theme: null } }, { workMode: 'byg' }, { name: 'x'.repeat(61) }, { name: 'navn\tmed fane' }, { standardAI: { connectionID: 'x'.repeat(101) } }, { standardAI: 'ai' }, { projectDefaults: { hosting: 'andet' } }];
  for (const values of invalid) await assert.rejects(() => profile.save(values));
  assert.deepEqual((await profile.get()).profile, { ...standardProfile(), name: 'Parthee' }, 'afviste kald ændrer intet');
  assert.deepEqual(Profile.ICON_IDS, ['aura-1', 'aura-2', 'aura-3']);
});

// ---------- Ikon-semantik: initialer, tre Aura-varianter, upload ----------
test('udgåede Lucide-id\'er folder til initialer i en gemning — ingen fejl', async t => {
  const store = await fixture(t), profile = new Profile(store);
  const folded = await profile.save({ icon: 'star' });
  assert.equal(folded.profile.icon, '', 'et gammelt Lucide-id gemmes som initialer');
  assert.deepEqual(folded.warnings, [], 'foldningen er stille — ingen advarsel');
  assert.equal((await profile.save({ icon: 'moon' })).profile.icon, '', 'alle gamle id\'er folder');
  assert.equal((await profile.save({ icon: 'aura-2' })).profile.icon, 'aura-2', 'de tre Aura-varianter er gyldige valg');
  assert.equal((await profile.save({ icon: 'aura-1' })).profile.icon, 'aura-1');
  assert.equal((await profile.save({ icon: 'aura-3' })).profile.icon, 'aura-3');
});

test('upload uden gemt billede gemmes som initialer — med billede som ikonvalget', async t => {
  const store = await fixture(t), profile = new Profile(store);
  const withoutFile = await profile.save({ icon: 'upload' });
  assert.equal(withoutFile.profile.icon, '', 'uden avatar-fil er upload ikke et gyldigt valg');
  const withAvatar = new Profile(store, { hasAvatar: () => true });
  const saved = await withAvatar.save({ icon: 'upload' });
  assert.equal(saved.profile.icon, 'upload', 'med filen på plads er upload det valgte ikon');
  assert.equal(saved.hasAvatar, true, 'svaret bærer, at billedet findes');
  const read = await withAvatar.get();
  assert.equal(read.profile.icon, 'upload', 'get() læser upload som det valgte ikon');
  assert.equal(read.hasAvatar, true);
  // Filen forsvinder: faldet tilbage til initialer sker stille, uden advarsel.
  const gone = new Profile(store, { hasAvatar: () => false });
  const fallen = await gone.get();
  assert.equal(fallen.profile.icon, '', 'en forsvunden avatar-fil rydder ikonvalget');
  assert.deepEqual(fallen.warnings, [], 'tilbagefaldet er stille — chippen viser bare initialer');
  assert.equal(fallen.hasAvatar, false);
});

test('get() bærer hasAvatar for hver eneste læsning', async t => {
  const store = await fixture(t);
  assert.equal((await new Profile(store).get()).hasAvatar, false, 'uden fil er der intet billede');
  const withAvatar = new Profile(store, { hasAvatar: () => true });
  assert.equal((await withAvatar.get()).hasAvatar, true);
  const saved = await withAvatar.save({ name: 'Anna' });
  assert.equal(saved.hasAvatar, true, 'svaret fra save() bærer det samme grundlag');
});

// ---------- Hjælpeniveau: tre trin med blid læsemigration ----------
test('hjælpeniveauet har tre trin; gemningen er streng, læsningen migrerer', async t => {
  const store = await fixture(t), profile = new Profile(store);
  // Saving is strict on the three values — all three round-trip.
  for (const level of ['fuld', 'delvis', 'ingen']) assert.equal((await profile.save({ helpLevel: level })).profile.helpLevel, level);
  // The retired two-step value 'minimal' is no longer a saveable choice.
  await assert.rejects(() => profile.save({ helpLevel: 'minimal' }), /Ukendt hjælpeniveau/);
  assert.equal((await store.read()).profile.helpLevel, 'ingen', 'en afvist gemning ændrer intet');
  // Reading migrates: a stored 'minimal' wanted less help, and 'delvis' is the
  // honest successor — silently, because the choice was read, not reset.
  await store.update(state => { state.profile = { helpLevel: 'minimal' }; });
  const migrated = await profile.get();
  assert.equal(migrated.profile.helpLevel, 'delvis', 'minimal bliver delvis');
  assert.deepEqual(migrated.warnings, [], 'den kendte gamle værdi migreres uden advarsel');
  // An unknown value from a newer beta falls back to 'fuld' with the warning.
  await store.update(state => { state.profile.helpLevel = 'maximal'; });
  const unknown = await profile.get();
  assert.equal(unknown.profile.helpLevel, 'fuld');
  assert.deepEqual(unknown.warnings, ['Dit hjælpeniveau kunne ikke læses og er nulstillet.']);
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
  // Skills ad gangen: samme migration vurderer standardpakken — en installation i brug
  // låser hele pakken fast, så ingen funktion går tabt ved det nye grundpakke-standard.
  const state = await store.read();
  assert.equal(state.featuresDefault, 'alle', 'installationen med en forbindelse er eksisterende');
  assert.equal(state.features.chosen, 'alle', 'hele pakken gemmes som det gamle udgangspunkt');
  // En gentagen migration er stadig en no-op, også for pakken.
  await profile.migrate({});
  assert.deepEqual(await store.read(), state);
});

test('migrate() vurderer grundpakken for en helt ny indstillingsfil', async t => {
  const store = await fixture(t);
  await new Profile(store).migrate({});
  const state = await store.read();
  assert.equal(state.featuresDefault, 'grundpakke', 'en ny installation starter med grundpakken');
  assert.equal(state.features, undefined, 'intet pakkevalg gemmes for en ny bruger');
});

test('migrate() låser hele pakken for eksisterende profiler, også når profilen allerede er migreret', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai', name: 'Egen model', kind: 'ollama', baseURL: 'http://127.0.0.1:11434' }];
    s.profile = { ...standardProfile(), migrated: 1 };
  });
  await new Profile(store).migrate({});
  const state = await store.read();
  assert.equal(state.featuresDefault, 'alle', 'vurderingen står før markøren for allerede migrerede profiler');
  assert.equal(state.features.chosen, 'alle');
  assert.equal(state.profile.migrated, 1, 'profilmarkøren røres ikke');
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
  assert.equal(profile.helpLevel, 'delvis', 'det gamle minimal-mønster migreres til delvis undervejs');
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
