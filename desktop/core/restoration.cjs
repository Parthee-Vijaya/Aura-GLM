const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { run, content, protectedPath, secretContent } = require('./git.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');
const MAX = 2 * 1024 * 1024;
const EMPTY = { data: null, hash: 'deleted' };
const same = (a, b) => a.hash === b.hash && a.mode === b.mode && a.fileMode === b.fileMode;
function validFile(file) {
  if (typeof file !== 'string' || !file || path.isAbsolute(file) || /[\\\0]/.test(file) || file.split('/').some(p => !p || p === '.' || p === '..') || protectedPath(file)) throw new Error('Versionen berører en beskyttet eller ugyldig filsti. Brug dit Git-værktøj til denne gendannelse.');
}
function inspect(data, mode, fileMode = mode === '100755' ? 0o755 : 0o644) {
  if (data.length > MAX || secretContent(data.toString()) || data.toString().startsWith('version https://git-lfs.github.com/spec/')) throw new Error('En fil kræver manuel gennemgang på grund af størrelse, muligt nøgleindhold eller Git LFS.');
  return { data, hash: hash(data), mode, fileMode };
}
async function current(root, file) {
  validFile(file);
  const value = await content(root, file);
  if (value.blocked) throw new Error(value.blocked);
  if (value.hash === 'deleted') return { ...EMPTY };
  const data = await fs.readFile(path.join(root, file));
  if (hash(data) !== value.hash) throw new Error('Filen blev ændret under gennemgangen. Prøv igen.');
  return inspect(data, value.mode, (await fs.stat(path.join(root, file))).mode & 0o777);
}
async function tree(root, commit) {
  const entries = (await run(root, ['ls-tree', '-rz', commit])).toString().split('\0').filter(Boolean);
  if (entries.length > 200) throw new Error('Versionen indeholder mere end 200 filer. Brug dit Git-værktøj til gendannelsen.');
  return new Map(entries.map(line => { const [meta, ...name] = line.split('\t'); const [mode, type, object] = meta.split(' '); return [name.join('\t'), { mode, type, object }]; }));
}
async function atomic(file, data, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    const handle = await fs.open(temp, 'wx', mode);
    try { await handle.writeFile(data); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, file);
    if (process.platform !== 'win32') { const directory = await fs.open(path.dirname(file), 'r'); try { await directory.sync(); } finally { await directory.close(); } }
  }
  finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
// Kopier og journal ligger uden for projektet. HEAD, index og commits ændres aldrig.
class Restoration {
  constructor(git, store) { this.git = git; this.store = store; this.reviews = new Map(); }
  journal(root) { return path.join(this.store.root, 'restoration', this.store.projectKey(root), 'latest.json'); }
  async previous(root) {
    try { const value = JSON.parse(await fs.readFile(this.journal(root), 'utf8')); if (value.version !== 1 || value.root !== root || !/^[a-f0-9-]{36}$/.test(value.id) || !Array.isArray(value.files)) throw new Error(); return value; }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Kopien før sidste gendannelse kan ikke læses. Den er bevaret i appens lokale data.'); }
  }
  async status(root) { const value = await this.previous(root); return value ? { at: value.at, state: value.state, files: value.files.length } : null; }
  async repository(root) {
    const repo = await this.git.repository(root);
    if (!repo.head || repo.block) throw new Error(repo.block || 'Gem en første version, før du gendanner.');
    // Ikke en filsystemlås: andre programmer skal være færdige med at skrive.
    repo.indexHash = hash(await fs.readFile(path.join(repo.gitDir, 'index')));
    return repo;
  }
  async review(root, input) {
    this.reviews.clear();
    const repo = await this.repository(root), files = [];
    const previous = await this.previous(repo.root);
    if (!input?.undo && previous && ['prepared', 'applying', 'failed'].includes(previous.state)) throw new Error('Sidste gendannelse blev afbrudt. Gennemgå først kopien fra før gendannelsen.');
    if (input?.undo) {
      if (!previous) throw new Error('Der findes ingen tidligere gendannelse at fortryde.');
      for (const item of previous.files) {
        validFile(item.file);
        if (!/^[a-f0-9]{64}$|^deleted$/.test(item.hash) || !['100644', '100755', undefined].includes(item.mode) || !/^[0-9]+$/.test(item.copy) || (item.fileMode !== undefined && (!Number.isInteger(item.fileMode) || item.fileMode < 0 || item.fileMode > 0o777))) throw new Error('Kopien kan ikke valideres.');
        const data = item.hash === 'deleted' ? null : await fs.readFile(path.join(path.dirname(this.journal(root)), previous.id, item.copy));
        const target = data === null ? { ...EMPTY } : inspect(data, item.mode, item.fileMode);
        if (target.hash !== item.hash) throw new Error('Kopien blev ændret. Gendannelsen er afbrudt.');
        const before = await current(repo.root, item.file);
        if (!same(before, target)) files.push({ file: item.file, before, target });
      }
    } else {
      if (!/^[a-f0-9]{40,64}$/.test(input?.commit || '')) throw new Error('Vælg en version fra projektets historik.');
      await run(repo.root, ['merge-base', '--is-ancestor', input.commit, repo.head]);
      const [target, head] = await Promise.all([tree(repo.root, input.commit), tree(repo.root, repo.head)]);
      const untracked = new Set(repo.files.filter(f => f.status === '??').map(f => f.file));
      for (const file of new Set([...target.keys(), ...head.keys()])) {
        validFile(file);
        const entry = target.get(file), headEntry = head.get(file);
        if ([entry, headEntry].some(e => e && (e.type !== 'blob' || !['100644','100755'].includes(e.mode)))) throw new Error('Versionen indeholder symbolske links eller underprojekter. Brug dit Git-værktøj.');
        if (untracked.has(file)) throw new Error('En fil uden for historikken ligger i vejen. Gem eller flyt den før gendannelse: ' + file);
        const before = await current(repo.root, file);
        if (!headEntry && before.data !== null) throw new Error('En eksisterende fil uden for historikken ligger i vejen: ' + file);
        const after = entry ? inspect(await run(repo.root, ['cat-file', 'blob', entry.object]), entry.mode) : { ...EMPTY };
        if (after.data !== null && before.data !== null) after.fileMode = entry.mode === '100755' ? before.fileMode | 0o100 : before.fileMode & ~0o111;
        if (after.data?.includes(0) && !/\.(png|jpe?g|webp|gif|ico|woff2?)$/i.test(file)) throw new Error('Denne binære filtype kræver manuel gendannelse i dit Git-værktøj.');
        if (!same(before, after)) files.push({ file, before, target: after });
      }
    }
    if (files.length > 200 || files.reduce((n,f) => n + (f.before.data?.length || 0) + (f.target.data?.length || 0), 0) > 32 * MAX) throw new Error('Gendannelsen er for stor til appens gennemgang. Brug dit Git-værktøj.');
    const token = randomUUID(); this.reviews.set(token, { repo, files, undo: Boolean(input?.undo), previous: previous?.id });
    return { token, undo: Boolean(input?.undo), untracked: repo.files.filter(f => f.status === '??' && !files.some(item => item.file === f.file)).length, files: files.map(f => ({ file: f.file, action: f.target.data === null ? 'Slettes' : f.before.data === null ? 'Genskabes' : 'Ændres', before: f.before.data?.includes(0) ? null : f.before.data?.toString() ?? null, after: f.target.data?.includes(0) ? null : f.target.data?.toString() ?? null, binary: Boolean(f.before.data?.includes(0) || f.target.data?.includes(0)) })) };
  }
  async apply(root, token) {
    if (this.git.busy) throw new Error('Vent på den igangværende versionshandling.');
    this.git.busy = true;
    try {
      const review = this.reviews.get(token); this.reviews.delete(token);
      if (!review || review.repo.root !== await fs.realpath(root) || !review.files.length) throw new Error('Gennemgå gendannelsen igen.');
      const now = await this.repository(root);
      if (['head', 'branch', 'raw', 'indexHash'].some(key => now[key] !== review.repo[key]) || (await this.previous(now.root))?.id !== review.previous) throw new Error('Git-status eller kopien har ændret sig. Gennemgå gendannelsen igen.');
      for (const f of review.files) if (!same(await current(root, f.file), f.before)) throw new Error('Filerne har ændret sig. Gennemgå gendannelsen igen.');
      const id = randomUUID(), folder = path.join(path.dirname(this.journal(root)), id);
      const journal = { version: 1, root, id, at: new Date().toISOString(), state: 'prepared', files: [] };
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      for (const [i, f] of review.files.entries()) {
        if (f.before.data !== null) await atomic(path.join(folder, String(i)), f.before.data);
        journal.files.push({ file: f.file, hash: f.before.hash, mode: f.before.mode, fileMode: f.before.fileMode, copy: String(i) });
      }
      await atomic(this.journal(root), JSON.stringify(journal));
      try {
        journal.state = 'applying'; await atomic(this.journal(root), JSON.stringify(journal));
        for (const f of review.files) {
          if (!same(await current(root, f.file), f.before)) throw new Error('En fil blev ændret af et andet program.');
          const target = path.join(root, f.file);
          if (f.target.data === null) await fs.unlink(target);
          else await atomic(target, f.target.data, f.target.fileMode);
        }
        journal.state = 'applied'; await atomic(this.journal(root), JSON.stringify(journal));
      } catch {
        journal.state = 'failed'; await atomic(this.journal(root), JSON.stringify(journal)).catch(() => {});
        throw new Error('Gendannelsen blev afbrudt. Nogle filer kan være ændret. Vælg Kopien før sidste gendannelse i Versioner for at gennemgå og genskabe dem.');
      }
      return { files: review.files.length, at: journal.at };
    } finally { this.git.busy = false; }
  }
}
module.exports = { Restoration };
