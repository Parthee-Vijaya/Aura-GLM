const fs = require('node:fs/promises');
const path = require('node:path');
const { loadLibrary } = require('./library.cjs');
const { layoutFor, knowledgeFor } = require('./adapters.cjs');
const installer = require('./installer.cjs');
const { run } = require('./git.cjs');

// Brugsvejen "Brug Harness i mit kodeværktøj". Mappen vælges i hovedprocessen og gemmes her;
// brugerfladen sender kun værktøjsvalg og bekræftelser, aldrig stier.
class OwnTools {
  constructor({ profiles, git }) { this.profiles = profiles; this.git = git; this.cache = null; this.target = null; this.review = null; }

  async library() { return this.cache ??= await loadLibrary(this.profiles); }

  async catalog() {
    const library = await this.library();
    return {
      version: library.version, checkedAt: library.checkedAt, controlWord: library.controlWord, questions: library.questions,
      skills: library.skills.map(({ name, title, summary, faq, sources }) => ({ name, title, summary, faq, sources })),
      tools: library.tools.map(({ id, name, vendor, category, status, testedWith, summary, verification, caveat, sources, rules }) => ({ id, name, vendor, category, status, testedWith, summary, verification, caveat, sources, installable: Boolean(rules) })),
      knowledge: knowledgeFor(library)
    };
  }

  async choose(folder) {
    const root = await fs.realpath(folder);
    if (!(await fs.stat(root)).isDirectory()) throw new Error('Vælg en mappe.');
    this.target = root; this.review = null;
    return this.describe();
  }

  requireTarget() { if (!this.target) throw new Error('Vælg først projektmappen.'); return this.target; }

  async describe() {
    const root = this.requireTarget();
    const { manifest } = await installer.status(root);
    return { name: path.basename(root), path: root, manifest: manifest && { version: manifest.version, tools: manifest.tools, installedAt: manifest.installedAt, timeSource: manifest.timeSource }, git: await this.gitState(root) };
  }

  async gitState(root) {
    try {
      const repo = await this.git.repository(root);
      if (!repo.initialized) return { initialized: false };
      return { initialized: true, branch: repo.branch || '', changes: repo.files?.length || 0, wrongRoot: Boolean(repo.wrongRoot) };
    } catch { return { unavailable: true }; }
  }

  // Filer, som projektets .gitignore ville udelade, kommer ikke med til andre, der henter projektet.
  // check-ignore afviser appens GIT_LITERAL_PATHSPECS; stierne er Harness' egne og kommer ikke fra brugeren.
  // Exitkode 1 betyder, at intet er udeladt. Andre fejl giver null, så brugerfladen kan sige, at kontrollen mangler.
  async ignored(root, files) {
    const state = await this.gitState(root);
    if (!state.initialized || !files.length) return [];
    try { return (await run(root, ['--no-literal-pathspecs', 'check-ignore', '--stdin', '-z'], Buffer.from(files.join('\0') + '\0'))).toString('utf8').split('\0').filter(Boolean); }
    catch (error) { return error.code === 1 ? [] : null; }
  }

  async plan(toolIds) {
    const root = this.requireTarget();
    const library = await this.library();
    const layout = layoutFor(library, toolIds);
    const settings = { version: library.version, tools: layout.tools };
    const plan = await installer.plan(root, layout.entries, settings);
    this.review = { kind: 'installer', root, tools: layout.tools, token: plan.token };
    const written = plan.operations.filter(op => ['opret', 'tilfoej', 'opdater', 'uaendret'].includes(op.action)).map(op => op.path);
    return {
      folder: path.basename(root), version: library.version, tools: layout.tools, dirs: layout.dirs, warnings: layout.warnings, manifest: plan.manifest,
      operations: plan.operations.map(({ path: file, kind, action, reason, content }) => ({ path: file, kind, action, reason: reason || null, preview: ['opret', 'tilfoej', 'opdater'].includes(action) ? content : null })),
      conflicts: plan.conflicts.length, git: await this.gitState(root), ignored: await this.ignored(root, [...written, installer.MANIFEST])
    };
  }

  async install({ skipConflicts = false } = {}) {
    const root = this.requireTarget();
    if (this.review?.kind !== 'installer' || this.review.root !== root) throw new Error('Gennemgå ændringerne først.');
    const library = await this.library();
    const layout = layoutFor(library, this.review.tools);
    const { token } = this.review;
    this.review = null;
    const result = await installer.apply(root, layout.entries, { version: library.version, tools: layout.tools }, token, { skipConflicts: skipConflicts === true });
    return { folder: path.basename(root), version: result.manifest.version, tools: result.manifest.tools, skipped: result.manifest.skipped, operations: result.operations.map(({ path: file, action, reason }) => ({ path: file, action, reason: reason || null })) };
  }

  async planRemoval() {
    const root = this.requireTarget();
    const plan = await installer.planRemoval(root);
    this.review = { kind: 'fjern', root, token: plan.token };
    return { folder: path.basename(root), version: plan.version, tools: plan.tools, operations: plan.operations.map(({ path: file, action, reason }) => ({ path: file, action, reason: reason || null })) };
  }

  async remove() {
    const root = this.requireTarget();
    if (this.review?.kind !== 'fjern' || this.review.root !== root) throw new Error('Gennemgå fjernelsen først.');
    const { token } = this.review;
    this.review = null;
    const result = await installer.remove(root, token);
    return { folder: path.basename(root), kept: result.kept };
  }
}

module.exports = { OwnTools };
