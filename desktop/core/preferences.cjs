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
  async get() { return this.available((await this.store.read()).startupDefaults); }
  async save(input) {
    const result = await this.available(input);
    await this.store.update(state => { state.startupDefaults = result.values; });
    return result;
  }
}
module.exports = { Preferences, normalize, defaults };
