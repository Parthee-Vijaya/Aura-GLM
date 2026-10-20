const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const LIMIT = 256 * 1024;
const conflict = () => Error('Opsætningen er ændret siden gennemgangen. Gennemgå den igen.');
const identity = (a, b) => !!a && !!b && a.dev === b.dev && a.ino === b.ino;
const unchanged = (a, b) => identity(a, b) && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
const validPath = value => typeof value === 'string' && /^(?:\.aura\/publishing\/[a-z-]+\.json|\.github\/workflows\/aura-[a-z-]+\.yml)$/.test(value);

// Filerne skrives kun efter gennemgang. Et åbent filhåndtag følger ikke et link,
// som erstatter filnavnet undervejs. Mapper og indhold kontrolleres igen før skrivning.
class DeploymentConfiguration {
  constructor(io = fs) { this.fs = io; this.reviews = new Map(); this.applying = new Set(); }
  async stat(file) {
    try { return await this.fs.lstat(file); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async open(file, flags, mode) {
    try { return await this.fs.open(file, flags, mode); }
    catch (error) { if (['EEXIST', 'ELOOP', 'ENOENT', 'ENOTDIR'].includes(error.code)) throw conflict(); throw error; }
  }
  file(stat) {
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > LIMIT)) throw Error('Den eksisterende opsætning kan ikke ændres sikkert.');
  }
  async location(root, relative, create = false) {
    if (!validPath(relative)) throw Error('Opsætningen har en ukendt filsti.');
    const parents = [];
    let current = root;
    for (const part of ['', ...relative.split('/').slice(0, -1)]) {
      if (part) current = path.join(current, part);
      let stat = await this.stat(current);
      if (!stat && create) {
        await this.parents(parents);
        try { await this.fs.mkdir(current); }
        catch (error) { if (error.code !== 'EEXIST') throw error; }
        stat = await this.stat(current);
      }
      if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw Error('Opsætningsmappen er et link eller en fil. Vælg en almindelig projektmappe.');
      parents.push({ path: current, stat });
    }
    const target = path.join(root, relative), stat = await this.stat(target);
    this.file(stat);
    return { target, stat, parents };
  }
  async parents(parents) {
    for (const item of parents) {
      const current = await this.stat(item.path);
      if (item.stat ? !identity(item.stat, current) || !current.isDirectory() || current.isSymbolicLink() : current !== null) throw conflict();
    }
  }
  async content(handle) {
    const buffer = Buffer.alloc(LIMIT + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    if (total > LIMIT) throw Error('Opsætningsfilen er for stor til at blive ændret her.');
    return buffer.subarray(0, total).toString('utf8');
  }
  async snapshot(root, relative) {
    const found = await this.location(root, relative);
    if (!found.stat) { await this.parents(found.parents); return { ...found, content: null }; }
    const handle = await this.open(found.target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const stat = await handle.stat(); this.file(stat);
      if (!unchanged(stat, found.stat)) throw conflict();
      const content = await this.content(handle);
      await this.parents(found.parents);
      if (!unchanged(stat, await handle.stat()) || !unchanged(stat, await this.stat(found.target))) throw conflict();
      return { ...found, stat, content };
    } finally { await handle.close(); }
  }
  async read(root, relative) { return (await this.snapshot(await this.fs.realpath(root), relative)).content; }
  async review(root, config, extraFiles = []) {
    root = await this.fs.realpath(root);
    if (!config || !/^[a-z-]+$/.test(config.provider)) throw Error('Vælg en udbyder.');
    const proposed = [{ path: `.aura/publishing/${config.provider}.json`, content: JSON.stringify({ ...config, version: 1 }, null, 2) + '\n' }, ...extraFiles];
    if (proposed.length > 4 || new Set(proposed.map(file => file.path)).size !== proposed.length) throw Error('Gennemgangen indeholder dublerede eller for mange opsætningsfiler.');
    const files = [];
    for (const file of proposed) {
      if (!validPath(file.path) || typeof file.content !== 'string' || Buffer.byteLength(file.content) > LIMIT) throw Error('Opsætningsfilen kan ikke gennemgås.');
      const snapshot = await this.snapshot(root, file.path);
      files.push({ path: file.path, content: file.content, before: snapshot.content, changed: snapshot.content !== file.content, snapshot });
    }
    const token = randomUUID();
    this.reviews.clear();
    this.reviews.set(token, { root, files, expires: Date.now() + 300000 });
    return { token, files: files.map(({ snapshot, ...file }) => file), unchanged: files.every(file => !file.changed) };
  }
  async apply(root, token) {
    const review = this.reviews.get(token); this.reviews.delete(token);
    root = await this.fs.realpath(root);
    if (!review || review.root !== root || review.expires < Date.now()) throw Error('Gennemgå opsætningen igen.');
    if (this.applying.has(root)) throw Error('Opsætningen bliver allerede gemt.');
    this.applying.add(root);
    const opened = [], written = [];
    try {
      for (const file of review.files) {
        await this.parents(file.snapshot.parents);
        const now = await this.snapshot(root, file.path);
        if (now.content !== file.before || file.snapshot.stat && !unchanged(file.snapshot.stat, now.stat)) throw conflict();
      }
      for (const file of review.files.filter(file => file.changed)) {
        const found = await this.location(root, file.path, true);
        if (file.before === null ? found.stat !== null : !unchanged(file.snapshot.stat, found.stat)) throw conflict();
        const flags = constants.O_RDWR | (constants.O_NOFOLLOW || 0) | (file.before === null ? constants.O_CREAT | constants.O_EXCL : 0);
        const handle = await this.open(found.target, flags, 0o644);
        const entry = { ...file, ...found, handle, openedStat: await handle.stat(), complete: false };
        opened.push(entry); this.file(entry.openedStat);
        if (file.before !== null && !unchanged(file.snapshot.stat, entry.openedStat)) throw conflict();
      }
      // Kontroller hele sættet efter åbning, før nogen eksisterende fil ændres.
      for (const entry of opened) await this.checkOpen(entry);
      for (const entry of opened) {
        await this.checkOpen(entry);
        const buffer = Buffer.from(entry.content);
        let offset = 0;
        while (offset < buffer.length) {
          const { bytesWritten } = await entry.handle.write(buffer, offset, buffer.length - offset, offset);
          if (!bytesWritten) throw Error('Opsætningsfilen kunne ikke skrives færdig.');
          offset += bytesWritten;
        }
        await entry.handle.truncate(buffer.length);
        await entry.handle.sync();
        await this.parents(entry.parents);
        if (!identity(entry.openedStat, await this.stat(entry.target))) throw conflict();
        entry.complete = true; written.push(entry.path);
      }
      return { written, message: written.length ? 'Opsætningen er skrevet. Gennemgå og gem ændringerne som en version, før du udgiver.' : 'Opsætningen var allerede gemt.' };
    } finally {
      for (const entry of opened) {
        await entry.handle.close().catch(() => {});
        // Fjern kun vores egen nye, tomme fil ved en konflikt før skrivning.
        if (entry.before === null && !entry.complete) {
          const stat = await this.stat(entry.target).catch(() => null);
          if (identity(stat, entry.openedStat) && stat.size === 0) {
            try { await this.parents(entry.parents); await this.fs.unlink(entry.target); } catch {}
          }
        }
      }
      this.applying.delete(root);
    }
  }
  async checkOpen(entry) {
    await this.parents(entry.parents);
    const stat = await entry.handle.stat(); this.file(stat);
    if (!unchanged(entry.openedStat, stat) || !unchanged(stat, await this.stat(entry.target))) throw conflict();
    if (await this.content(entry.handle) !== (entry.before ?? '')) throw conflict();
    if (!unchanged(stat, await entry.handle.stat())) throw conflict();
    await this.parents(entry.parents);
  }
}
module.exports = { DeploymentConfiguration };
