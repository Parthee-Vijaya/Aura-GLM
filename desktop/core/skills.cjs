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
      ...library.skills.map(skill => ({ id: skill.name, title: skill.title, summary: skill.summary, feature: library.features.find(feature => feature.skills.includes(skill.name)).id, original: skill.files.find(file => file.path === 'SKILL.md').content }))];
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
    const skills = enabled.map(skill => ({ name: skill.id, files: [{ path: 'SKILL.md', content: skill.content }, ...library.skills.find(item => item.name === skill.id).files.filter(file => file.path !== 'SKILL.md')] }));
    for (const skill of skills) validateSkillFiles(skill.name, skill.files);
    validateSkillLinks(skills, new Set(library.skills.map(skill => skill.name)));
    const integrations = library.features.filter(feature => feature.group === 'integrationer' && features[feature.id]).map(feature => feature.title);
    return { rules: list.find(skill => skill.id === RULES).content, skills, titles: enabled.map(skill => skill.title), features, integrations };
  }
}
module.exports = { Skills, RULES };
