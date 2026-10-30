const { validateSkillFiles, validateSkillLinks, validateSkillText } = require('./library.cjs');
const { PRIMARY_BUILD_SKILL } = require('./build-design.cjs');
// Appens AI bruger det fælles skillbibliotek. Funktionerne afgør, hvilke skills AI’en kan hente, og grundreglerne gælder altid.
// Teksten kan tilpasses pr. projekt; tilpasningen gemmes i appens datamappe og ændrer ikke biblioteket.
const RULES = 'faelles-grundregler';
// Tidligere versioner gemte grundreglerne med et YAML-felt øverst. Feltet hører ikke til reglerne.
const plainRules = text => text.replace(/^---\n[\s\S]*?\n---\n+/, '');

function effectiveSkillFiles(entry, librarySkill, content, where) {
  const references = librarySkill.files.filter(file => file.path !== 'SKILL.md');
  const main = { path: 'SKILL.md', content }, files = [main, ...references];
  if (entry.id === PRIMARY_BUILD_SKILL && entry.alwaysOn && content !== entry.original) {
    // The mandatory, current library baseline already declares every shipped
    // reference and is included alongside the saved customization. An older
    // customization need not know reference names added by a later release.
    // Validate both sources independently; never rewrite the user's text or
    // accept an unknown reference. Optional skills keep their strict contract.
    validateSkillFiles(entry.id, [{ path: 'SKILL.md', content: entry.original }, ...references], where);
    const { body } = validateSkillText(entry.id, content, where);
    validateSkillFiles(entry.id, [main, ...references.filter(file => body.includes(file.path))], where);
  } else validateSkillFiles(entry.id, files, where);
  return files;
}

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
        const files = effectiveSkillFiles(entry, library.skills.find(skill => skill.name === entry.id), input.content, 'Instruktionerne');
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
    const skills = enabled.map(skill => ({ name: skill.id, ...(skill.alwaysOn && skill.customized ? { baseline: skill.original } : {}), files: effectiveSkillFiles(skill, library.skills.find(item => item.name === skill.id), skill.content) }));
    validateSkillLinks(skills, new Set(library.skills.map(skill => skill.name)));
    const integrations = library.features.filter(feature => feature.group === 'integrationer' && features[feature.id]).map(feature => feature.title);
    return { rules: list.find(skill => skill.id === RULES).content, skills, titles: enabled.map(skill => skill.title), features, integrations };
  }
}
module.exports = { Skills, RULES };
