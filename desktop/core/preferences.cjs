const defaults = Object.freeze({ hosting: '', connectionID: '', designID: '', tests: 'senere' });
function normalize(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldige opstartsvalg.');
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) if (input[key] !== undefined) result[key] = input[key];
  if (!['', 'azure', 'vercel', 'own'].includes(result.hosting) || !['manuel', 'automatiske', 'senere'].includes(result.tests)) throw new Error('Ukendt hosting- eller testvalg.');
  for (const key of ['connectionID', 'designID']) if (typeof result[key] !== 'string' || result[key].length > 100 || /[\x00-\x1f]/.test(result[key])) throw new Error('Ugyldigt forbindelses- eller designvalg.');
  return result;
}
class Preferences {
  constructor(store) { this.store = store; }
  async available(input) {
    const values = normalize(input), state = await this.store.read(), warnings = [];
    if (values.connectionID && !state.connections.some(c => c.id === values.connectionID)) { values.connectionID = ''; warnings.push('Den tidligere AI-forbindelse findes ikke længere. Vælg en ny, eller beslut senere.'); }
    if (values.designID && !(state.designs || []).some(d => d.id === values.designID)) { values.designID = ''; warnings.push('Den tidligere designpakke findes ikke længere.'); }
    return { values, warnings };
  }
  async get() {
    const state = await this.store.read();
    // Project standards live in the profile; until it exists, the legacy
    // startup defaults still answer so nothing is lost before migration.
    const standards = state.profile && typeof state.profile === 'object' && !Array.isArray(state.profile) ? state.profile.projectDefaults : state.startupDefaults;
    return this.available(standards);
  }
  async save(input) {
    const result = await this.available(input);
    // profile.cjs requires this module for the project-defaults rules; the
    // require stays inside the method so the modules never load each other.
    const { blank } = require('./profile.cjs');
    await this.store.update(state => {
      if (!state.profile || typeof state.profile !== 'object' || Array.isArray(state.profile)) state.profile = blank();
      state.profile.projectDefaults = result.values;
    });
    return result;
  }
}
module.exports = { Preferences, normalize, defaults };
