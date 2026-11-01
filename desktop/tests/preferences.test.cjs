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
    s.profile = { name: 'Parthee', icon: 'star', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: 'ai', modelID: '' }, workMode: 'chat', projectDefaults: { hosting: 'vercel', designID: 'design', tests: 'automatiske' }, migrated: 1 };
  });
  const prefs = new Preferences(store);
  const values = { hosting: 'own', connectionID: 'ai', designID: 'design', tests: 'manuel' };
  assert.deepEqual((await prefs.get()).values, { hosting: 'vercel', connectionID: '', designID: 'design', tests: 'automatiske' }, 'projektstandarder læses fra profilen');
  await prefs.save({ ...values, apiKey: 'må-ikke-gemmes', approved: true, references: ['private'] });
  await store.saveProject('/testprojekt', { startup: values });
  assert.deepEqual((await new Preferences(new Store(store.root, {})).get()).values, values);
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

test('save uden profil opretter profilen med standardform', async t => {
  const store = await fixture(t, s => { s.connections = [{ id: 'ai' }]; });
  await new Preferences(store).save({ hosting: 'vercel', connectionID: 'ai', designID: '', tests: 'senere' });
  assert.deepEqual((await store.read()).profile, {
    name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat',
    projectDefaults: { hosting: 'vercel', connectionID: 'ai', designID: '', tests: 'senere' }, migrated: 0,
  });
});

test('ukendte valg afvises; beslut senere kræver ingen forbindelse', () => {
  assert.equal(normalize().tests, 'senere'); assert.equal(normalize().connectionID, '');
  assert.throws(() => normalize({ hosting: 'andet' })); assert.throws(() => normalize({ tests: 'auto-godkend' }));
});
