const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { Preferences, normalize } = require('../core/preferences.cjs');

async function fixture(t, setup) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-preferences-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  if (setup) await store.update(setup);
  return store;
}

test('præferencer genåbnes uden godkendelser og ændrer ikke eksisterende projekter', async t => {
  const store = await fixture(t, s => {
    s.connections = [{ id: 'ai' }]; s.designs = [{ id: 'design' }];
    s.profile = { name: 'Parthee', icon: 'aura-1', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: 'ai', modelID: '' }, workMode: 'chat', projectDefaults: { hosting: 'vercel', designID: 'design', tests: 'automatiske' }, migrated: 1 };
  });
  const prefs = new Preferences(store);
  const values = { hosting: 'own', connectionID: 'ai', designID: 'design', tests: 'manuel' };
  assert.deepEqual((await prefs.get()).values, { hosting: 'vercel', connectionID: '', designID: 'design', tests: 'automatiske' }, 'projektstandarder læses fra profilen');
  await prefs.save({ ...values, apiKey: 'må-ikke-gemmes', approved: true, references: ['private'] });
  // connectionID hører til standardAI og gemmes ikke i projectDefaults: get()
  // svarer de kanoniske tre felter og altid en tom forbindelse.
  assert.deepEqual((await prefs.get()).values, { hosting: 'own', connectionID: '', designID: 'design', tests: 'manuel' }, 'svaret bærer profilens egne tre felter');
  const onDisk = (await store.read()).profile.projectDefaults;
  assert.deepEqual(onDisk, { hosting: 'own', designID: 'design', tests: 'manuel' }, 'disken bærer kun projektstandarderne — ingen connectionID');
  assert.ok(!('connectionID' in onDisk));
  await store.saveProject('/testprojekt', { startup: values });
  assert.deepEqual((await new Preferences(new Store(store.root, {})).get()).values, { hosting: 'own', connectionID: '', designID: 'design', tests: 'manuel' });
  await prefs.save({ hosting: 'azure' });
  assert.deepEqual((await store.project('/testprojekt')).startup, values, 'projektets egne valg ændres ikke');
  const state = await store.read();
  assert.equal(state.profile.projectDefaults.hosting, 'azure');
  assert.equal(JSON.stringify(state).includes('må-ikke-gemmes'), false);
});

test('manglende forbindelse og design ryddes med advarsel fra profilens standarder', async t => {
  const store = await fixture(t, s => {
    s.profile = { name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat', projectDefaults: { hosting: '', connectionID: 'borte', designID: 'væk', tests: 'senere' }, migrated: 1 };
  });
  const missing = await new Preferences(store).get();
  assert.equal(missing.warnings.length, 2);
  assert.equal(missing.values.connectionID, '');
  assert.equal(missing.values.designID, '');
});

test('uden profil læses de gamle opstartsvalg i overgangsperioden', async t => {
  const store = await fixture(t, s => { s.connections = [{ id: 'ai' }]; s.designs = [{ id: 'design' }]; s.startupDefaults = { hosting: 'vercel', connectionID: 'ai', designID: 'design', tests: 'manuel' }; });
  assert.deepEqual((await new Preferences(store).get()).values, { hosting: 'vercel', connectionID: 'ai', designID: 'design', tests: 'manuel' });
});

test('save uden profil opretter profilen med standardform og markerer den migreret', async t => {
  const store = await fixture(t, s => { s.connections = [{ id: 'ai' }]; });
  await new Preferences(store).save({ hosting: 'vercel', connectionID: 'ai', designID: '', tests: 'senere' });
  assert.deepEqual((await store.read()).profile, {
    name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat',
    projectDefaults: { hosting: 'vercel', designID: '', tests: 'senere' }, migrated: 1,
  }, 'brugeren har truffet et eksplicit valg — profilen tæller som migreret, og connectionID gemmes ikke');
});

test('en senere migrate genopliver ikke lige-glemte projektstandarder', async t => {
  const store = await fixture(t, s => { s.startupDefaults = { hosting: 'vercel', connectionID: 'ai', designID: 'd1', tests: 'automatiske' }; });
  const prefs = new Preferences(store);
  // Brugeren nulstiller standarderne, før nogen migration er kørt.
  await prefs.save({ hosting: '', connectionID: '', designID: '', tests: 'senere' });
  const { Profile } = require('../core/profile.cjs');
  const { profile } = await new Profile(store).migrate({});
  assert.equal(profile.migrated, 1, 'markøren er allerede sat af det eksplicitte valg');
  assert.deepEqual(profile.projectDefaults, { hosting: '', designID: '', tests: 'senere' }, 'de gamle opstartsvalg foldes ikke ind over nulstillingen');
  assert.equal(profile.standardAI.connectionID, '', 'standard-AI' + 'et foldes heller ikke: markøren gør migrationen til en no-op');
});

test('ukendte valg afvises; beslut senere kræver ingen forbindelse', () => {
  assert.equal(normalize().tests, 'senere'); assert.equal(normalize().connectionID, '');
  assert.throws(() => normalize({ hosting: 'andet' })); assert.throws(() => normalize({ tests: 'auto-godkend' }));
});
