// Valgfrie funktioner kan slås til og fra. Grundpakken (alwaysOn) gælder også ved ældre fravalg.
// Hver funktion har sine skills i det fælles bibliotek. Uden et valg gælder grundpakken: grundreglerne
// og de altid-aktive funktioner (fx designhjælpen) samt katalogets udtrykkelige anbefalinger
// ("default": true). Øvrige funktioner og skills tilvælges ad gangen under Indstillinger › Funktioner.
// "Hele pakken" (chosen 'alle') følger i stedet katalogets anbefaling: alle funktioner undtagen dem
// med "default": false, fx Udgivelse, som kun er anbefalet, når en komplai Run-adgang er forbundet —
// så kan Udgiv udgive uden ekstra værktøjer.
const CHOICES = ['alle', 'valgt'];

// En funktion, der bygger på en anden, er kun slået til sammen med den, fx Udgivelse med Versioner og fortryd.
function resolve(definitions, defaults = {}, exceptions = {}, fullPackage = false) {
  const on = Object.fromEntries(definitions.map(feature => [feature.id, feature.alwaysOn === true || (exceptions[feature.id] ?? defaults[feature.id] ?? (fullPackage ? feature.default !== false : feature.default === true))]));
  for (const feature of definitions) if ((feature.requires || []).some(id => !on[id])) on[feature.id] = false;
  return on;
}
// Et valg slår det til, funktionen bygger på, og et fravalg slår det fra, der bygger på funktionen.
function couple(definitions, values) {
  const result = { ...values };
  for (const [id, value] of Object.entries(values)) {
    if (value === true) for (const required of definitions.find(feature => feature.id === id).requires || []) result[required] = true;
    if (value === false) for (const feature of definitions) if ((feature.requires || []).includes(id)) result[feature.id] = false;
  }
  return result;
}

function recommended(definitions, state) {
  // Et login til udgivelse hos komplai eller Promte gør Udgiv til en anbefalet funktion.
  const publishing = Boolean(state.hosting?.komplai?.secret) || Object.values(state.hosting?.promte || {}).some(login => login?.secret);
  return publishing ? definitions.map(feature => feature.id === 'deling' ? { ...feature, default: true } : feature) : definitions;
}

// Standardpakken låses én gang pr. indstillingsfil (idempotent via featuresDefault): en
// installation i brug — gemte forbindelser eller projekter, udgivelses-logins, tidligere
// funktionsvalg eller de pensionerede opstartsvalg — beholder hele pakken som chosen 'alle';
// en helt ny indstillingsfil starter med grundpakken. pinDefault muterer state direkte og
// kaldes som del af profilmigreringens énye atomiske gemning (og af Features.save som sikringsnet).
function pinDefault(state) {
  if (state.featuresDefault !== undefined || CHOICES.includes(state.features?.chosen)) return;
  const established = Boolean((state.connections || []).length
    || Object.keys(state.projects || {}).length
    || state.hosting?.komplai?.secret || Object.values(state.hosting?.promte || {}).some(login => login?.secret)
    || Object.keys(state.features?.on || {}).length
    || state.startupDefaults && typeof state.startupDefaults === 'object' && !Array.isArray(state.startupDefaults));
  state.featuresDefault = established ? 'alle' : 'grundpakke';
  if (established) state.features = { ...(state.features || {}), chosen: 'alle' };
}
class Features {
  constructor(store, library) { this.store = store; this.library = library; }
  async definitions() { return (await this.library()).features; }
  // Standardpakken vurderes én gang pr. indstillingsfil — typisk som del af profilmigreringen
  // ved appstart. Før grundpakken blev standard, betød "intet valg" alle funktioner slået til,
  // så en installation, der allerede er i brug, låser hele pakken fast som chosen 'alle' — ingen
  // mister funktioner stille. En helt ny installation starter med grundpakken, og låsen
  // forhindrer senere brug i at udvide standarden på egen hånd. Læsning (get) skriver aldrig;
  // gemning (save) forsikrer sig mod at stå før migreringen.
  async migrate() { return this.store.update(pinDefault); }
  async get(root) {
    const state = await this.store.read();
    const library = await this.library();
    const definitions = recommended(library.features, state);
    const fullPackage = state.features?.chosen === 'alle' || state.featuresDefault === 'alle';
    const defaults = state.features?.on || {};
    const saved = root ? state.projects[this.store.projectKey(root)]?.features || {} : {};
    const exceptions = Object.fromEntries(Object.entries(saved).filter(([id, value]) => definitions.some(feature => feature.id === id && !feature.alwaysOn) && typeof value === 'boolean'));
    const skill = name => { const item = library.skills.find(entry => entry.name === name); return { name, title: item.title, summary: item.summary, ...(item.integration ? { integration: item.integration } : {}) }; };
    return {
      chosen: CHOICES.includes(state.features?.chosen) ? state.features.chosen : '',
      list: definitions.map(({ id, title, summary, requires = [], group = '', skills, alwaysOn = false }) => ({ id, title, summary, requires, group, alwaysOn, skills: skills.map(skill) })),
      defaults: resolve(definitions, defaults, {}, fullPackage),
      exceptions,
      effective: resolve(definitions, defaults, exceptions, fullPackage)
    };
  }
  // scope "alle" ændrer standarden for alle projekter. scope "projekt" gemmer undtagelser; null fjerner en undtagelse.
  async save(root, input) {
    const before = await this.store.read();
    if (before.featuresDefault === undefined && !CHOICES.includes(before.features?.chosen)) await this.migrate();
    const definitions = recommended(await this.definitions(), await this.store.read());
    if (!input || !['alle', 'projekt'].includes(input.scope) || !input.values || typeof input.values !== 'object' || Array.isArray(input.values)) throw new Error('Ugyldigt valg af funktioner.');
    const nullable = input.scope === 'projekt';
    for (const [id, value] of Object.entries(input.values)) {
      if (!definitions.some(feature => feature.id === id)) throw new Error('Ukendt funktion.');
      if (typeof value !== 'boolean' && !(nullable && value === null)) throw new Error('Ugyldigt valg af funktioner.');
    }
    if (input.chosen !== undefined && (input.scope !== 'alle' || !CHOICES.includes(input.chosen))) throw new Error('Ugyldigt valg af funktioner.');
    if (input.scope === 'projekt' && !root) throw new Error('Åbn et projekt først.');
    // Ignore obsolete opt-outs from older clients without changing other choices.
    const optional = ([id, value]) => value !== null && !definitions.find(feature => feature.id === id).alwaysOn;
    const values = couple(definitions, Object.fromEntries(Object.entries(input.values).filter(optional)));
    if (input.scope === 'alle') {
      await this.store.update(state => {
        // Hele pakken følger appens anbefaling i kataloget, også når den ændres i en senere version.
        const fullPackage = state.features?.chosen === 'alle' || state.featuresDefault === 'alle';
        const base = input.chosen === 'alle' ? {} : resolve(definitions, state.features?.on, {}, fullPackage), chosen = input.chosen || state.features?.chosen;
        state.features = { ...(chosen ? { chosen } : {}), on: Object.fromEntries(Object.entries({ ...base, ...values }).filter(optional)) };
      });
    } else {
      // En undtagelse gemmes kun, når den afviger fra standarden, så markeringen i panelet betyder noget.
      const current = await this.get(root);
      const next = { ...current.exceptions, ...values };
      for (const [id, value] of Object.entries(input.values)) if (value === null) delete next[id];
      for (const [id, value] of Object.entries(next)) if (value === current.defaults[id]) delete next[id];
      await this.store.saveProject(root, { features: next });
    }
    return this.get(root);
  }
}
module.exports = { Features, resolve, couple, recommended, pinDefault };
