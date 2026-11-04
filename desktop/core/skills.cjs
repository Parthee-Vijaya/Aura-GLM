const { validateSkillFiles, validateSkillLinks } = require('./library.cjs');
// Appens AI bruger det fælles skillbibliotek. Funktionerne afgør, hvilke skills AI’en kan hente, og grundreglerne gælder altid.
// Teksten kan tilpasses pr. projekt; tilpasningen gemmes i appens datamappe og ændrer ikke biblioteket.
const RULES = 'faelles-grundregler';
// Tidligere versioner gemte grundreglerne med et YAML-felt øverst. Feltet hører ikke til reglerne.
const plainRules = text => text.replace(/^---\n[\s\S]*?\n---\n+/, '');

class Skills {
  constructor(library, store, features) { this.library = library; this.store = store; this.features = features; }
  async list(projectRoot) {
    const library = await this.library(), settings = projectRoot == null ? {} : await this.store.project(projectRoot), on = (await this.features.get(projectRoot)).effective;
    const entries = [{ id: RULES, title: 'Grundregler', summary: 'Gælder altid. De beskytter nøgler, data og din Git-historik.', original: library.rules, alwaysOn: true },
      ...library.skills.map(skill => {
        const feature = library.features.find(feature => feature.skills.includes(skill.name));
        return { id: skill.name, title: skill.title, summary: skill.summary, feature: feature.id, alwaysOn: feature.alwaysOn === true, original: skill.files.find(file => file.path === 'SKILL.md').content };
      })];
    return entries.map(entry => {
      const override = settings.skills?.[entry.id]?.content;
      const customized = typeof override === 'string';
      const content = !customized ? entry.original : entry.id === RULES ? plainRules(override) : override;
      return { ...entry, content, customized, enabled: entry.alwaysOn === true || on[entry.feature] === true };
    });
  }
  async save(projectRoot, input) {
    const entry = (await this.list(projectRoot)).find(skill => skill.id === input?.id);
    if (!entry || typeof input.content !== 'string' || input.content.length > 24000) throw new Error('Instruktionerne er ugyldige eller for lange.');
    if (!input.reset) {
      if (entry.id === RULES) { if (!input.content.trim()) throw new Error('Grundreglerne kan ikke være tomme.'); }
      else {
        const library = await this.library();
        const files = [{ path: 'SKILL.md', content: input.content }, ...library.skills.find(skill => skill.name === entry.id).files.filter(file => file.path !== 'SKILL.md')];
        validateSkillFiles(entry.id, files, 'Instruktionerne');
        validateSkillLinks([{ name: entry.id, files }], new Set(library.skills.map(skill => skill.name)));
      }
    }
    const settings = await this.store.project(projectRoot);
    const skills = { ...settings.skills };
    if (input.reset) delete skills[entry.id]; else skills[entry.id] = { content: input.content };
    await this.store.saveProject(projectRoot, { skills });
    return this.list(projectRoot);
  }
  // Null root is the pre-project global selection, never another open project's overrides.
  // The build skill's core is also preloaded by chat-session/idea-refinement.
  async context(projectRoot) {
    const library = await this.library(), list = await this.list(projectRoot), features = (await this.features.get(projectRoot)).effective;
    const enabled = list.filter(skill => skill.id !== RULES && skill.enabled);
    const skills = enabled.map(skill => ({ name: skill.id, ...(skill.alwaysOn && skill.customized ? { baseline: skill.original } : {}), files: [{ path: 'SKILL.md', content: skill.content }, ...library.skills.find(item => item.name === skill.id).files.filter(file => file.path !== 'SKILL.md')] }));
    for (const skill of skills) validateSkillFiles(skill.name, skill.files);
    validateSkillLinks(skills, new Set(library.skills.map(skill => skill.name)));
    const integrations = library.features.filter(feature => feature.group === 'integrationer' && features[feature.id]).map(feature => feature.title);
    return { rules: list.find(skill => skill.id === RULES).content, skills, titles: enabled.map(skill => skill.title), features, integrations };
  }
  // S2 slash-framework: the effective skill selection for ONE send — the
  // project's enabled skills plus the skills the message's `/name` tokens
  // activate. Activation lasts a single send; the project's feature choices
  // are never touched, ground rules and always-on skills are never removed,
  // and activation can only add. Unknown names are ignored; an already
  // enabled skill is not activated again (its token still shows in the
  // send review). `activated` lists the names that were added for this send.
  async effective(projectRoot, names = []) {
    const base = await this.context(projectRoot);
    if (!Array.isArray(names) || !names.length) return { ...base, activated: [] };
    const library = await this.library(), list = await this.list(projectRoot);
    const seen = new Set(base.skills.map(skill => skill.name));
    const activated = [], titles = [];
    for (const name of names) {
      if (typeof name !== 'string' || seen.has(name)) continue;
      const entry = list.find(skill => skill.id === name && skill.id !== RULES);
      if (!entry) continue;
      activated.push({ name: entry.id, files: [{ path: 'SKILL.md', content: entry.content }, ...library.skills.find(item => item.name === entry.id).files.filter(file => file.path !== 'SKILL.md')] });
      titles.push(entry.title);
      seen.add(entry.id);
    }
    const skills = [...base.skills, ...activated];
    for (const skill of activated) validateSkillFiles(skill.name, skill.files);
    validateSkillLinks(skills, new Set(library.skills.map(skill => skill.name)));
    return { ...base, skills, titles: [...base.titles, ...titles], activated: activated.map(skill => skill.name) };
  }
}
module.exports = { Skills, RULES };
