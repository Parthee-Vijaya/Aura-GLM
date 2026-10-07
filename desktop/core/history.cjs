// Visuel historik: versionernes navne og typer, hvad en version ændrede, og billeder af forhåndsvisningen før og efter.
// Navnene og billederne gemmes i appens data på denne computer. Git-historikken ændres aldrig; et nyt navn er kun Auras.
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { run, secretContent, protectedPath } = require('./git.cjs');
const { lineStats } = require('./diff.cjs');

// Typen ud fra versionsbeskrivelsen, som Aura selv skriver. Andre beskrivelser er brugerens egne versioner.
const KINDS = [
  [/^Flettet ind: /, 'merge'], [/^Afbrudt AI-opgave: /, 'stopped'], [/^AI-opgave: /, 'ai'], [/^Gendannet til: /, 'restore'], [/^Gendannet version$/, 'restore'],
  [/^Fortrudt: /, 'undo'], [/^Fortrudt gendannelse$/, 'undo'], [/^Dine ændringer før (gendannelsen|fortrydelsen|indfletningen)$/, 'saved'], [/^Projekt oprettet$/, 'start']
];
const kindOf = message => (KINDS.find(([pattern]) => pattern.test(message)) || [null, 'manual'])[1];
const kindLabels = { merge: 'Flettet ind', ai: 'AI-opgave', stopped: 'Afbrudt AI-opgave', restore: 'Gendannet', undo: 'Fortrudt', saved: 'Dine ændringer', start: 'Start', manual: 'Din version' };
// Et kort navn: beskrivelsen uden Auras præfiks, til første punktum og højst 60 tegn ved et ordskifte. En gendannelse
// og en fortrydelse nævner den version, de handler om, så de ikke forveksles med den.
function defaultName(message) {
  const value = String(message || '').replace(/\s+/g, ' ').trim();
  const text = value.replace(/^(Flettet ind|Afbrudt AI-opgave|AI-opgave|Gendannet til|Fortrudt): /, '');
  if (text === 'Projekt oprettet') return 'Projektet blev oprettet';
  const sentence = (text.match(/^.+?[.!?](?=\s|$)/) || [text])[0].replace(/[.!?]$/, '');
  const short = sentence.length <= 60 ? sentence || 'Version' : sentence.slice(0, 60).replace(/[\s,.;:]+\S*$/, '') + ' …';
  if (/^Gendannet til: /.test(value)) return `Tilbage til »${short}«`;
  if (/^Fortrudt: /.test(value)) return `Fortrudt »${short}«`;
  return short;
}
function checkName(name) {
  if (typeof name !== 'string' || /[\r\n\0]/.test(name) || name.trim().length > 80) throw new Error('Skriv et navn på én linje og højst 80 tegn.');
  return name.trim();
}
const commitPattern = /^[a-f0-9]{40,64}$/;

class History {
  constructor(store) { this.store = store; }
  async names(root) { return (await this.store.project(root)).versionNames || {}; }
  // Tomt navn fjerner Auras navn, så versionen igen hedder det, Aura gav den.
  async rename(root, commit, name) {
    if (!commitPattern.test(commit || '')) throw new Error('Vælg en version fra projektets historik.');
    const value = checkName(name);
    const names = { ...await this.names(root) };
    delete names[commit];
    if (value) names[commit] = value;
    const entries = Object.entries(names).slice(-200);
    await this.store.saveProject(root, { versionNames: Object.fromEntries(entries) });
    return value;
  }
  // Versionerne i historikken med navn, type og om navnet er brugerens.
  async describe(root, history) {
    const names = await this.names(root);
    return history.map(item => ({ ...item, kind: kindOf(item.message), kindLabel: kindLabels[kindOf(item.message)], name: names[item.commit] || defaultName(item.message), renamed: Boolean(names[item.commit]) }));
  }
  // Hvad én version ændrede i forhold til versionen før. Binære, store og beskyttede filer og filer med mulige nøgler
  // står kun med navn.
  async version(root, commit) {
    if (!commitPattern.test(commit || '')) throw new Error('Vælg en version fra projektets historik.');
    const head = (await run(root, ['rev-parse', '--verify', 'HEAD'])).toString().trim();
    await run(root, ['merge-base', '--is-ancestor', commit, head]);
    const [meta, parents] = await Promise.all([run(root, ['log', '-1', '--format=%s%x00%cI', commit]), run(root, ['rev-list', '--parents', '-n', '1', commit])]);
    const [message, at] = meta.toString().trim().split('\0');
    const parent = parents.toString().trim().split(' ')[1] || null;
    const names = (await run(root, ['diff-tree', '-r', '-z', '--no-commit-id', '--name-status', '--no-renames', ...(parent ? [parent, commit] : ['--root', commit])])).toString().split('\0').filter(Boolean);
    const files = [];
    for (let i = 0; i + 1 < names.length && files.length < 200; i += 2) {
      const status = names[i], file = names[i + 1];
      const detail = await this.file(root, commit, file, parent).catch(() => ({ before: null, after: null, hidden: true }));
      const stats = detail.hidden ? { added: 0, removed: 0 } : lineStats(detail.before, detail.after);
      files.push({ file, change: status === 'A' ? 'ny' : status === 'D' ? 'slettet' : 'ændret', added: stats.added, removed: stats.removed, hidden: Boolean(detail.hidden) });
    }
    const kind = kindOf(message), customName = (await this.names(root))[commit];
    return { commit, parent, message, at, kind, kindLabel: kindLabels[kind], name: customName || defaultName(message), renamed: Boolean(customName), files };
  }
  // Én fils indhold før og efter en version. Teksten vises kun, når den kan vises sikkert.
  async file(root, commit, file, parent) {
    if (!commitPattern.test(commit || '') || typeof file !== 'string' || !file || file.includes('\0') || path.isAbsolute(file) || file.split('/').some(part => !part || part === '..')) throw new Error('Vælg en fil i versionen.');
    if (parent === undefined) parent = (await run(root, ['rev-list', '--parents', '-n', '1', commit])).toString().trim().split(' ')[1] || null;
    const read = async ref => {
      if (!ref) return null;
      const line = (await run(root, ['ls-tree', '-z', ref, '--', file])).toString().split('\0')[0];
      if (!line) return null;
      const [mode, type, object] = line.split('\t')[0].split(' ');
      if (type !== 'blob' || !['100644', '100755'].includes(mode)) return { hidden: true };
      const data = await run(root, ['cat-file', 'blob', object]);
      if (data.length > 1024 * 1024 || data.includes(0)) return { hidden: true };
      return { text: data.toString('utf8') };
    };
    const [before, after] = await Promise.all([read(parent), read(commit)]);
    const hidden = protectedPath(file) || before?.hidden || after?.hidden || [before?.text, after?.text].some(text => text && secretContent(text));
    return hidden ? { before: null, after: null, hidden: true } : { before: before?.text ?? null, after: after?.text ?? null, hidden: false };
  }
}

// Billeder af forhåndsvisningen. Et par består af et billede før og et efter af samme side i samme størrelse.
// Billederne hører til en opgave, en gendannelse eller en version og ryddes, når der er flere end LIMIT.
const LIMIT = 80;
class PreviewImages {
  constructor(store) { this.store = store; this.queue = Promise.resolve(); }
  folder(root) { return path.join(this.store.root, 'history', this.store.projectKey(root)); }
  async index(root) {
    try { const value = JSON.parse(await fs.readFile(path.join(this.folder(root), 'images.json'), 'utf8')); if (value.version === 1 && Array.isArray(value.images)) return value; } catch { /* Ny eller ulæselig indeks: begynd forfra; billederne er kun en hjælp. */ }
    return { version: 1, images: [] };
  }
  // Ændringer af indekset sker én ad gangen og skrives atomisk.
  change(root, update) {
    const next = this.queue.then(async () => {
      const folder = this.folder(root), index = await this.index(root);
      const result = await update(index, folder);
      while (index.images.length > LIMIT) { const old = index.images.shift(); await fs.rm(path.join(folder, `${old.id}.jpg`), { force: true }); }
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      const temp = path.join(folder, `images-${randomUUID()}.tmp`);
      await fs.writeFile(temp, JSON.stringify(index), { mode: 0o600 }); await fs.rename(temp, path.join(folder, 'images.json'));
      return result;
    });
    this.queue = next.catch(() => {});
    return next;
  }
  add(root, data, meta) {
    if (!Buffer.isBuffer(data) || !data.length) return Promise.resolve(null);
    return this.change(root, async (index, folder) => {
      await fs.mkdir(folder, { recursive: true, mode: 0o700 });
      const entry = { id: randomUUID(), at: Date.now(), role: meta.role === 'before' ? 'before' : 'after', pair: meta.pair || randomUUID(), view: { page: String(meta.view?.page || ''), width: meta.view?.width | 0, height: meta.view?.height | 0 }, task: meta.task || null, commit: meta.commit || null };
      await fs.writeFile(path.join(folder, `${entry.id}.jpg`), data, { mode: 0o600 });
      index.images.push(entry); return entry;
    });
  }
  // Et par bindes til den version, der blev gemt bagefter.
  bind(root, pair, commit) {
    if (!pair || !commitPattern.test(commit || '')) return Promise.resolve();
    return this.change(root, index => { for (const entry of index.images) if (entry.pair === pair) entry.commit = commit; });
  }
  // Parret for en version, en opgave eller et par. Uden et før-billede bruges det seneste billede af samme visning fra
  // før, hvis der findes et, så en version, du selv har gemt, også kan sammenlignes.
  async pairFor(root, { commit, task, pair }) {
    const { images } = await this.index(root);
    const after = [...images].reverse().find(entry => entry.role === 'after' && ((commit && entry.commit === commit) || (task && entry.task === task) || (pair && entry.pair === pair)));
    const any = after || [...images].reverse().find(entry => (commit && entry.commit === commit) || (task && entry.task === task) || (pair && entry.pair === pair));
    if (!any) return null;
    let before = images.find(entry => entry.role === 'before' && entry.pair === any.pair) || null;
    if (!before && after) before = [...images].reverse().find(entry => entry.role === 'after' && entry.at < after.at && sameView(entry.view, after.view)) || null;
    return { before: before && strip(before), after: after && strip(after), view: (after || any).view };
  }
  // Det seneste billede af den samme visning, fx før en version, du selv gemmer.
  async latest(root, view) {
    const { images } = await this.index(root);
    return [...images].reverse().find(entry => sameView(entry.view, view)) || null;
  }
  async read(root, id) {
    if (!/^[0-9a-f-]{36}$/.test(id || '')) throw new Error('Billedet findes ikke.');
    const { images } = await this.index(root);
    if (!images.some(entry => entry.id === id)) throw new Error('Billedet findes ikke.');
    return `data:image/jpeg;base64,${(await fs.readFile(path.join(this.folder(root), `${id}.jpg`))).toString('base64')}`;
  }
}
const sameView = (a, b) => Boolean(a && b) && a.page === b.page && a.width === b.width && a.height === b.height;
const strip = entry => ({ id: entry.id, at: entry.at, role: entry.role, view: entry.view });

module.exports = { History, PreviewImages, kindOf, defaultName, kindLabels, sameView };
