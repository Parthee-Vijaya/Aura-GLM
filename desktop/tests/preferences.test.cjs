const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { Preferences, normalize } = require('../core/preferences.cjs');
test('præferencer genåbnes uden godkendelser og ændrer ikke eksisterende projekter', async t => {
 const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-preferences-')); t.after(() => fs.rm(root, {recursive:true,force:true}));
 const store = new Store(root, {}); const prefs = new Preferences(store);
 await store.update(s => { s.connections = [{id:'ai'}]; s.designs = [{id:'design'}]; });
 const values = { hosting:'vercel', connectionID:'ai', designID:'design', tests:'automatiske' };
 await prefs.save({...values, apiKey:'må-ikke-gemmes', approved:true, references:['private']});
 await store.saveProject('/testprojekt', {startup:values});
 assert.deepEqual((await new Preferences(new Store(root,{})).get()).values, values);
 await prefs.save({hosting:'azure'});
 assert.deepEqual((await store.project('/testprojekt')).startup, values);
 assert.equal(JSON.stringify(await store.read()).includes('må-ikke-gemmes'),false);
 await store.update(s => { s.startupDefaults = values; s.connections=[]; s.designs=[]; });
 const missing = await prefs.get(); assert.equal(missing.warnings.length,2); assert.equal(missing.values.connectionID,''); assert.equal(missing.values.designID,'');
});
test('ukendte valg afvises; beslut senere kræver ingen forbindelse', () => {
 assert.equal(normalize().tests,'senere'); assert.equal(normalize().connectionID,'');
 assert.throws(()=>normalize({hosting:'andet'})); assert.throws(()=>normalize({tests:'auto-godkend'}));
});
