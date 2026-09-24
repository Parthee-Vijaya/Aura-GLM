const path = require('node:path');
const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const { run } = require('./git.cjs');

async function hooksBlock(repo) {
  const hooks = (await run(repo.root, ['rev-parse', '--git-path', 'hooks'])).toString().trim();
  const directory = path.resolve(repo.root, hooks);
  try { if ((await fs.readdir(directory)).some(name => !name.endsWith('.sample'))) return 'Git-hooks kræver gennemgang i dit Git-værktøj for denne handling.'; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return '';
}
async function automaticBlock(repo) {
  if (repo.block) return repo.block;
  if (!repo.head) return 'Gem først projektets første version manuelt.';
  const hook = await hooksBlock(repo); if (hook) return hook;
  try { if ((await run(repo.root, ['config', '--get-regexp', '^filter\\.'])).length) return 'Git-filtre kræver manuel versionsgemning.'; }
  catch (error) { if (error.code !== 1) throw error; }
  return '';
}
class Checkpoints {
  constructor(git, emit) { this.git = git; this.emit = emit; this.active = null; }
  async begin(root, enabled) {
    this.active = null;
    if (!enabled) return;
    const task = { root, changed: new Map(), pending: Promise.resolve(), seen: new Set(), reason: '', canceled: false };
    this.active = task;
    try {
      const repo = await this.git.repository(root);
      task.root = repo.root; task.head = repo.head; task.branch = repo.branch;
      task.reason = await automaticBlock(repo);
      if (!task.reason && repo.files.length) task.reason = 'Der var ugemte ændringer ved opgavens start.';
    } catch (error) { task.reason = error.message; }
  }
  cancel(reason = 'Opgaven blev stoppet eller mislykkedes.') {
    if (this.active) { this.active.canceled = true; this.active.reason = reason; }
  }
  observe(event) {
    const task = this.active;
    if (!task || task.reason) return;
    const part = event.properties?.part;
    if (event.type === 'message.updated' && event.properties?.info?.error) return this.cancel('Modellen afsluttede med en fejl.');
    if (event.type !== 'message.part.updated' || part?.type !== 'tool') return;
    if (part.state?.status === 'error') return this.cancel('Et værktøj fejlede eller blev afvist.');
    if (part.state?.status !== 'completed' || task.seen.has(part.id)) return;
    task.seen.add(part.id);
    if (['bash', 'apply_patch'].includes(part.tool)) return this.cancel('Kommandoer eller patchværktøjer kræver manuel gennemgang af versionsindholdet.');
    if (!['write', 'edit'].includes(part.tool)) return;
    const file = part.state.input?.filePath;
    if (typeof file !== 'string') return this.cancel('Agentens ændrede fil kunne ikke identificeres.');
    task.pending = task.pending.then(async () => {
      const absolute = await fs.realpath(path.resolve(task.root, file));
      const relative = path.relative(task.root, absolute).split(path.sep).join('/');
      if (relative.startsWith('../') || path.isAbsolute(relative)) throw new Error();
      const stat = await fs.stat(absolute);
      if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error();
      task.changed.set(relative, createHash('sha256').update(await fs.readFile(absolute)).digest('hex'));
    }).catch(() => { task.reason = 'En agentændring kunne ikke afgrænses sikkert til projektet.'; });
  }
  async finish() {
    const task = this.active; this.active = null;
    if (!task) return;
    try {
      await task.pending;
      if (task.reason || task.canceled) throw new Error(task.reason || 'Opgaven blev stoppet.');
      const repo = await this.git.repository(task.root);
      const block = await automaticBlock(repo);
      if (block) throw new Error(block);
      if (repo.head !== task.head || repo.branch !== task.branch) throw new Error('Git-historikken blev ændret under opgaven.');
      if (!repo.files.length) { this.emit({ type: 'git.checkpoint', status: 'unchanged', message: 'Ingen filændringer at gemme.' }); return; }
      const review = await this.git.review(task.root);
      if (!review.files.length || review.files.some(f => f.blocked || !task.changed.has(f.file) || f.text === null || createHash('sha256').update(f.text).digest('hex') !== task.changed.get(f.file))) throw new Error('Ændringerne kan ikke entydigt knyttes til agentens afsluttede filværktøjer. Gennemgå dem manuelt.');
      const result = await this.git.commit(task.root, { token: review.token, files: review.files.map(f => f.file), message: 'checkpoint: gem ændringer efter afsluttet opgave' });
      this.emit({ type: 'git.checkpoint', status: 'saved', message: `Lokalt checkpoint gemt: ${result.head.slice(0, 8)}. Det er ikke en testgodkendelse.`, head: result.head });
    } catch (error) { this.emit({ type: 'git.checkpoint', status: 'skipped', message: `Automatisk checkpoint sprunget over: ${error.message}` }); }
  }
}
module.exports = { Checkpoints, automaticBlock, hooksBlock };
