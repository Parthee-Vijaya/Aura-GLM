const fs = require('node:fs/promises');
const path = require('node:path');
const IDS = ['faelles-grundregler', 'opgave-og-maal', 'git-og-versioner', 'noegler-og-data', 'tests-og-evidens', 'design-research'];
class Skills {
  constructor(root, store) { this.root = root; this.store = store; }
  async list(projectRoot) {
    const settings = await this.store.project(projectRoot);
    return Promise.all(IDS.map(async id => {
      const original = id === 'faelles-grundregler' ? '---\nname: faelles-grundregler\ndescription: Fælles arbejdsgrundlag for AI Harness-projekter.\ndisable-model-invocation: true\n---\n\n' + await fs.readFile(path.join(this.root, '..', 'grundregler.md'), 'utf8') : await fs.readFile(path.join(this.root, id, 'SKILL.md'), 'utf8');
      const override = settings.skills?.[id];
      return { id, original, content: override?.content ?? original, enabled: override?.enabled ?? true, customized: Boolean(override), source: 'AI Harness · fælles bibliotek' };
    }));
  }
  async save(projectRoot, input) {
    if (!IDS.includes(input.id) || typeof input.enabled !== 'boolean' || typeof input.content !== 'string' || input.content.length > 24000) throw new Error('Skill-indholdet er ugyldigt eller for langt.');
    if (!input.content.startsWith('---\n') || !input.content.includes(`name: ${input.id}\n`) || !/\ndescription: .+/.test(input.content)) throw new Error('Bevar skillens name og description i YAML-feltet øverst.');
    const settings = await this.store.project(projectRoot);
    const skills = { ...settings.skills };
    if (input.reset) delete skills[input.id]; else skills[input.id] = { content: input.content, enabled: input.enabled };
    await this.store.saveProject(projectRoot, { skills });
    return this.list(projectRoot);
  }
  async context(projectRoot) { return (await this.list(projectRoot)).filter(skill => skill.enabled).map(skill => skill.content).join('\n\n'); }
}
module.exports = { Skills, IDS };
