const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { run, content, protectedPath, secretContent } = require('./git.cjs');
const { merge3, resolve } = require('./merge.cjs');
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
const fromText = (value, mode) => value === null || value === undefined ? { ...EMPTY } : inspect(Buffer.isBuffer(value) ? value : Buffer.from(value), mode || '100644');
// Fortryd én ændring: base er filen lige efter ændringen, theirs er filen før. Filen, som den er nu, flettes, så det,
// der er ændret siden, bevares. Rører brugeren og ændringen de samme linjer, afgør brugeren det for hele filen.
async function revertFiles(root, items) {
  const files = [];
  for (const item of items) {
    validFile(item.file);
    const before = await current(root, item.file), base = fromText(item.base, item.mode), theirs = fromText(item.theirs, item.mode);
    if (before.hash === theirs.hash) continue;
    const keepMode = target => target.data === null ? target : { ...target, fileMode: before.data !== null ? before.fileMode : theirs.mode === '100755' ? 0o755 : 0o644, mode: before.data !== null ? before.mode : theirs.mode };
    if (before.hash === base.hash) { files.push({ file: item.file, before, target: keepMode(theirs), outcome: 'restore' }); continue; }
    const text = [before, base, theirs].every(v => v.data === null || !v.data.includes(0));
    if (!text || before.data === null || base.data === null || theirs.data === null) { files.push({ file: item.file, before, choice: { ours: before, theirs: keepMode(theirs) }, outcome: 'conflict', whole: true }); continue; }
    const merge = merge3(base.data.toString(), before.data.toString(), theirs.data.toString());
    if (merge.clean) { const merged = keepMode(inspect(Buffer.from(resolve(merge)), before.mode)); if (merged.hash !== before.hash) files.push({ file: item.file, before, target: merged, outcome: 'kept' }); continue; }
    files.push({ file: item.file, before, merge, choice: { ours: keepMode(inspect(Buffer.from(resolve(merge, 'ours')), before.mode)), theirs: keepMode(inspect(Buffer.from(resolve(merge, 'theirs')), before.mode)) }, outcome: 'conflict' });
  }
  return files;
}
// Konflikten, som den vises: de linjer, brugeren og ændringen begge har rørt.
const conflictView = f => f.whole ? { whole: true, ours: f.before.data === null ? null : f.before.data.includes(0) ? '(binær fil)' : f.before.data.toString(), theirs: f.choice.theirs.data === null ? null : f.choice.theirs.data.includes(0) ? '(binær fil)' : f.choice.theirs.data.toString() }
  : { whole: false, parts: f.merge.segments.filter(x => x.type === 'conflict').slice(0, 5).map(x => ({ line: x.line, ours: x.ours.join(''), theirs: x.theirs.join('') })), count: f.merge.conflicts };
// Kopier og journal ligger uden for projektet. HEAD, index og commits ændres aldrig.
class Restoration {
  constructor(git, store) { this.git = git; this.store = store; this.reviews = new Map(); }
  journal(root) { return path.join(this.store.root, 'restoration', this.store.projectKey(root), 'latest.json'); }
  async previous(root) {
    try { const value = JSON.parse(await fs.readFile(this.journal(root), 'utf8')); if (value.version !== 1 || value.root !== root || !/^[a-f0-9-]{36}$/.test(value.id) || !Array.isArray(value.files)) throw new Error(); return value; }
    catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Kopien før sidste gendannelse kan ikke læses. Den er bevaret i appens lokale data.'); }
  }
  async status(root) { const value = await this.previous(root); return value ? { at: value.at, state: value.state, files: value.files.length } : null; }
  // Fortryd af en opgave og af en gendannelse kan bruges uden Git. Så kontrolleres kun filerne.
  async repository(root, optional = false) {
    let repo;
    try { repo = await this.git.repository(root); } catch (error) { if (optional) return null; throw error; }
    if (optional && (!repo.initialized || repo.wrongRoot || !repo.head || repo.block)) return null;
    if (!repo.head || repo.block) throw new Error(repo.block || 'Gem en første version, før du gendanner.');
    // Ikke en filsystemlås: andre programmer skal være færdige med at skrive.
    repo.indexHash = hash(await fs.readFile(path.join(repo.gitDir, 'index')));
    return repo;
  }
  async review(root, input) {
    this.reviews.clear();
    const optional = Boolean(input?.undo || input?.task);
    const repo = await this.repository(root, optional), files = [];
    root = repo?.root || await fs.realpath(root);
    const previous = await this.previous(root);
    if (!input?.undo && previous && ['prepared', 'applying', 'failed'].includes(previous.state)) throw new Error('Sidste gendannelse blev afbrudt. Gennemgå først kopien fra før gendannelsen.');
    if (input?.undo) {
      if (!previous) throw new Error('Der findes ingen tidligere gendannelse at fortryde.');
      for (const item of previous.files) {
        validFile(item.file);
        if (!/^[a-f0-9]{64}$|^deleted$/.test(item.hash) || !['100644', '100755', undefined].includes(item.mode) || !/^[0-9]+$/.test(item.copy) || (item.fileMode !== undefined && (!Number.isInteger(item.fileMode) || item.fileMode < 0 || item.fileMode > 0o777))) throw new Error('Kopien kan ikke valideres.');
        const data = item.hash === 'deleted' ? null : await fs.readFile(path.join(path.dirname(this.journal(root)), previous.id, item.copy));
        const target = data === null ? { ...EMPTY } : inspect(data, item.mode, item.fileMode);
        if (target.hash !== item.hash) throw new Error('Kopien blev ændret. Gendannelsen er afbrudt.');
        const before = await current(root, item.file);
        if (!same(before, target)) files.push({ file: item.file, before, target });
      }
    } else if (input?.task) {
      // En opgave i denne samtale: filerne før og efter kommer fra Auras øjebliksbilleder.
      if (!Array.isArray(input.task.files) || input.task.files.length > 200) throw new Error('Opgaven kan ikke fortrydes her.');
      files.push(...await revertFiles(root, input.task.files.map(entry => ({ file: entry.file, base: entry.after, theirs: entry.before }))));
    } else if (input?.revert) {
      // En gemt version: kun dens egne ændringer fjernes, også når senere versioner har ændret andet.
      if (!/^[a-f0-9]{40,64}$/.test(input.revert)) throw new Error('Vælg en version fra projektets historik.');
      await run(repo.root, ['merge-base', '--is-ancestor', input.revert, repo.head]);
      const parent = (await run(repo.root, ['rev-list', '--parents', '-n', '1', input.revert])).toString().trim().split(' ')[1];
      if (!parent) throw new Error('Den første version kan ikke fortrydes. Vælg Gå tilbage hertil på en senere version.');
      const changed = (await run(repo.root, ['diff-tree', '-r', '-z', '--no-commit-id', '--name-only', '--no-renames', parent, input.revert])).toString().split('\0').filter(Boolean);
      if (changed.length > 200) throw new Error('Versionen ændrede mere end 200 filer. Brug dit Git-værktøj.');
      const entry = async (commit, file) => { const line = (await run(repo.root, ['ls-tree', '-z', commit, '--', file])).toString().split('\0')[0]; if (!line) return null; const [meta] = line.split('\t'); const [mode, type, object] = meta.split(' '); if (type !== 'blob' || !['100644', '100755'].includes(mode)) throw new Error('Versionen indeholder symbolske links eller underprojekter. Brug dit Git-værktøj.'); return { mode, data: await run(repo.root, ['cat-file', 'blob', object]) }; };
      const items = [];
      for (const file of changed) { validFile(file); const [after, before] = await Promise.all([entry(input.revert, file), entry(parent, file)]); items.push({ file, base: after?.data ?? null, theirs: before?.data ?? null, mode: before?.mode || after?.mode }); }
      files.push(...await revertFiles(repo.root, items));
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
    if (files.length > 200 || files.reduce((n,f) => n + (f.before.data?.length || 0) + (f.target?.data?.length || f.choice?.theirs?.data?.length || 0), 0) > 32 * MAX) throw new Error('Gendannelsen er for stor til appens gennemgang. Brug dit Git-værktøj.');
    const token = randomUUID(); this.reviews.set(token, { root, repo, files, undo: Boolean(input?.undo), previous: previous?.id });
    const text = value => value?.data?.includes(0) ? null : value?.data?.toString() ?? null;
    const action = (before, target) => target.data === null ? 'Slettes' : before.data === null ? 'Genskabes' : 'Ændres';
    return { token, undo: Boolean(input?.undo), kind: input?.undo ? 'undo' : input?.task ? 'task' : input?.revert ? 'revert' : 'restore', untracked: repo ? repo.files.filter(f => f.status === '??' && !files.some(item => item.file === f.file)).length : 0, git: Boolean(repo),
      conflicts: files.filter(f => f.outcome === 'conflict').length,
      files: files.map(f => f.outcome === 'conflict' ? { file: f.file, outcome: 'conflict', action: 'Du vælger', conflict: conflictView(f) }
        : { file: f.file, outcome: f.outcome || 'restore', action: action(f.before, f.target), before: text(f.before), after: text(f.target), binary: Boolean(f.before.data?.includes(0) || f.target.data?.includes(0)) }) };
  }
  // Konflikter afgøres pr. fil med choices: { fil: 'ours' | 'theirs' }. Uden et valg beholdes brugerens linjer.
  async apply(root, token, choices = {}) {
    if (this.git.busy) throw new Error('Vent på den igangværende versionshandling.');
    this.git.busy = true;
    try {
      const review = this.reviews.get(token); this.reviews.delete(token);
      if (!review || review.root !== await fs.realpath(root) || !review.files.length) throw new Error('Gennemgå gendannelsen igen.');
      if (review.repo) {
        const now = await this.repository(root);
        if (['head', 'branch', 'raw', 'indexHash'].some(key => now[key] !== review.repo[key])) throw new Error('Git-status eller kopien har ændret sig. Gennemgå gendannelsen igen.');
      }
      if ((await this.previous(review.root))?.id !== review.previous) throw new Error('Git-status eller kopien har ændret sig. Gennemgå gendannelsen igen.');
      for (const f of review.files) if (!same(await current(root, f.file), f.before)) throw new Error('Filerne har ændret sig. Gennemgå gendannelsen igen.');
      for (const f of review.files) if (f.outcome === 'conflict') f.target = choices?.[f.file] === 'theirs' ? f.choice.theirs : f.choice.ours;
      review.files = review.files.filter(f => !same(f.target, f.before));
      if (!review.files.length) return { files: 0, paths: [], at: new Date().toISOString(), changes: [] };
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
      const text = value => value.data === null ? null : value.data.includes(0) ? undefined : value.data.toString();
      return { files: review.files.length, paths: review.files.map(f => f.file), at: journal.at, id, changes: review.files.map(f => ({ file: f.file, before: text(f.before), after: text(f.target) })) };
    } finally { this.git.busy = false; }
  }
}
module.exports = { Restoration };
