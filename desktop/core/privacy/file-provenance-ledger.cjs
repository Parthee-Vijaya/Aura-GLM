// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Main-only, encrypted and hash-bound derivation labels. No source contents,
// prompt, model assertion or renderer-controlled declassification is stored.
const fs = require('node:fs/promises'), { constants } = require('node:fs'), path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { relativePath } = require('./hybrid-paths.cjs');
const { inheritClassification, PrivacyGateError } = require('./policy.cjs');
const profileQueues = new Map();
const MAX = 2_000_000, sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => new PrivacyGateError('PRIVACY_PROVENANCE_MISSING', 'Filernes beskyttelse kunne ikke bekræftes. Ingen filændring eller ekstern deling er tilladt.');
const floor = sources => sources.reduce((value, source) => inheritClassification({ defaultClass: 'public' }, [value, source]), { classification: 'public', attributes: { personalData: false, secrets: false }, uninspectable: false });
function validatedFiles(files) {
  if (!Array.isArray(files) || files.length > 2000) throw fail();
  return files.map(file => { if (!file || Object.keys(file).some(key => !['path', 'sha256'].includes(key)) || !relativePath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw fail(); return { path: file.path, sha256: file.sha256 }; });
}
function validated(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 6000) throw fail();
  const seen = new Set();
  for (const entry of value.entries) {
    if (!entry || Object.keys(entry).some(key => !['path', 'sha256', 'provenance', 'parents'].includes(key)) || !relativePath(entry.path) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '') || !Array.isArray(entry.provenance) || entry.provenance.length !== 1 || seen.has(entry.path + '\0' + entry.sha256)) throw fail();
    if (entry.parents !== undefined && (!Array.isArray(entry.parents) || entry.parents.length > 1024 || entry.parents.some(value => !/^[a-f0-9]{64}$/.test(value) || value === entry.sha256))) throw fail();
    seen.add(entry.path + '\0' + entry.sha256); floor(entry.provenance);
  }
  return value;
}
function resolveSources(saved) {
  const index = new Map(), memo = new Map(); let nodes = 0;
  for (const entry of saved.entries) { const records = index.get(entry.sha256) || []; records.push(entry); index.set(entry.sha256, records); }
  const resolve = (hash, ancestors = new Set()) => {
    if (memo.has(hash)) return memo.get(hash);
    if (++nodes > 200000 || ancestors.size >= 32 || ancestors.has(hash)) throw fail();
    const next = new Set(ancestors); next.add(hash); const records = index.get(hash) || [], sources = records.flatMap(entry => entry.provenance);
    for (const parent of new Set(records.flatMap(entry => entry.parents || []))) sources.push(...resolve(parent, next));
    const value = sources.length ? [floor(sources)] : []; memo.set(hash, value); return value;
  }; return resolve;
}
class FileProvenanceLedger {
  #queue = Promise.resolve();
  constructor({ directory, encrypt, decrypt }) {
    if (!path.isAbsolute(directory || '') || path.resolve(directory) !== directory || [encrypt, decrypt].some(value => typeof value !== 'function')) throw fail();
    Object.assign(this, { directory, encrypt, decrypt });
  }
  file(scope) { if (!scope || !path.isAbsolute(scope.root || '') || typeof scope.rootIdentity !== 'string' || !scope.rootIdentity || !path.isAbsolute(scope.projectRoot || '')) throw fail(); return path.join(this.directory, sha(JSON.stringify(scope)) + '.labels.enc'); }
  async privateDirectory(create) {
    if (create) await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory); if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077 || await fs.realpath(this.directory) !== this.directory) throw fail(); return stat;
  }
  async requiredAnchor(scope, create = false) {
    const file = this.file(scope) + '.required', expected = Buffer.from(sha(JSON.stringify(scope))); let handle;
    try {
      if (create) {
        try { handle = await fs.open(file, 'wx', 0o600); await handle.writeFile(expected); await handle.sync(); await handle.close(); handle = null; const directory = await fs.open(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await directory.sync(); } finally { await directory.close(); } } catch (error) { if (error.code !== 'EEXIST') throw error; }
      }
      handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW); const before = await handle.stat();
      if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() || before.mode & 0o077 || before.size !== expected.length) throw fail();
      const bytes = Buffer.alloc(expected.length + 1); let size = 0; while (size < bytes.length) { const result = await handle.read(bytes, size, bytes.length - size, size); if (!result.bytesRead) break; size += result.bytesRead; }
      const after = await handle.stat(), named = await fs.lstat(file); if (size !== expected.length || !bytes.subarray(0, size).equals(expected) || after.size !== before.size || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs || named.isSymbolicLink() || named.ino !== before.ino || named.dev !== before.dev) throw fail();
      return true;
    } catch (error) { if (error.code === 'ENOENT' && !create) return false; throw fail(); } finally { await handle?.close(); }
  }
  async loadActual(scope, required) {
    let handle;
    try {
      await this.privateDirectory(false); required ||= await this.requiredAnchor(scope); const file = this.file(scope); handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const before = await handle.stat(); if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() || before.mode & 0o077 || before.size < 1 || before.size > MAX) throw fail();
      const buffer = Buffer.alloc(before.size + 1); let length = 0;
      while (length < buffer.length) { const part = await handle.read(buffer, length, buffer.length - length, length); if (!part.bytesRead) break; length += part.bytesRead; }
      const after = await handle.stat(), named = await fs.lstat(file);
      if (length !== before.size || named.isSymbolicLink() || named.ino !== before.ino || named.dev !== before.dev || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || after.mode !== before.mode) throw fail();
      const text = await this.decrypt(buffer.subarray(0, length)); if (typeof text !== 'string' || Buffer.byteLength(text) > MAX) throw fail();
      const value = JSON.parse(text); if (value.scope !== sha(JSON.stringify(scope))) throw fail(); return validated(value);
    } catch (error) { if (error.code === 'ENOENT' && !required) return { version: 1, scope: sha(JSON.stringify(scope)), entries: [] }; throw fail(); }
    finally { await handle?.close(); }
  }
  async load(scope, required = false) { scope = structuredClone(scope); const file = this.file(scope); await this.#queue; await profileQueues.get(file); return this.loadActual(scope, required); }
  record(scope, changes, { required = false, assertCurrent } = {}) {
    scope = structuredClone(scope); this.file(scope); const frozen = structuredClone(changes);
    const queueKey = this.file(scope);
    const operation = Promise.all([this.#queue.catch(() => {}), profileQueues.get(queueKey)?.catch(() => {})]).then(async () => {
      const current = () => { if (typeof assertCurrent !== 'function' || assertCurrent() !== true) throw fail(); };
      current(); const saved = await this.loadActual(scope, required); current();
      const entries = new Map(saved.entries.map(entry => [entry.path + '\0' + entry.sha256, entry]));
      for (const entry of frozen) { validated({ version: 1, entries: [entry] }); const key = entry.path + '\0' + entry.sha256, old = entries.get(key); entries.set(key, { ...entry, parents: [...new Set([...(old?.parents || []), ...(entry.parents || [])])], provenance: [floor([...(old?.provenance || []), ...entry.provenance])] }); }
      const next = validated({ ...saved, entries: [...entries.values()].sort((a, b) => (a.path + a.sha256).localeCompare(b.path + b.sha256)) });
      const plaintext = JSON.stringify(next); if (Buffer.byteLength(plaintext) > MAX) throw fail();
      await this.privateDirectory(true); current(); await this.requiredAnchor(scope, true); current(); const bytes = await this.encrypt(plaintext); current();
      if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > MAX) throw fail();
      const file = this.file(scope), temporary = file + '.' + randomUUID() + '.tmp'; let handle, own = false;
      try {
        handle = await fs.open(temporary, 'wx', 0o600); own = true; await handle.writeFile(bytes); await handle.sync(); await handle.close(); handle = null; current();
        try { const prior = await fs.lstat(file); if (!prior.isFile() || prior.isSymbolicLink() || prior.nlink !== 1 || prior.uid !== process.getuid?.() || prior.mode & 0o077) throw fail(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        current(); await fs.rename(temporary, file); own = false;
        const directory = await fs.open(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW); try { await directory.sync(); } finally { await directory.close(); }
        current(); return sha(bytes);
      } finally { await handle?.close(); if (own) await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    }); this.#queue = operation; profileQueues.set(queueKey, operation);
    void operation.finally(() => { if (profileQueues.get(queueKey) === operation) profileQueues.delete(queueKey); }).catch(() => {});
    return operation;
  }
  async inheritScope(sourceScope, targetScope, { assertCurrent } = {}) {
    if (typeof assertCurrent !== 'function' || assertCurrent() !== true) throw fail();
    const saved = await this.load(sourceScope), resolve = resolveSources(saved);
    if (assertCurrent() !== true) throw fail();
    // Keep historical path/content labels, including deleted or renamed bytes.
    // A later merge may combine different bytes; its known path still inherits
    // the strongest label. Flatten source ancestry before crossing ledgers.
    const entries = saved.entries.map(entry => ({ ...entry, provenance: [floor(resolve(entry.sha256))] }));
    if (entries.length) await this.record(targetScope, entries, { assertCurrent });
    if (assertCurrent() !== true) throw fail();
  }
  async provenance(scope, files, required = false) {
    const labels = await this.labels(scope, files, required), sources = labels.flatMap(entry => entry.provenance);
    return sources.length ? [floor(sources)] : [];
  }
  async labels(scope, files, required = false) {
    files = validatedFiles(files);
    const saved = await this.load(scope, required), labels = [], resolved = resolveSources(saved);
    for (const file of files) {
      if (!file || !relativePath(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw fail();
      const samePath = saved.entries.filter(entry => entry.path === file.path), exact = samePath.filter(entry => entry.sha256 === file.sha256);
      // A rename must not release an already classified blob. Exact-byte
      // labels follow content; changed bytes at a known path inherit its floor.
      const sameBytes = saved.entries.filter(entry => entry.sha256 === file.sha256);
      const sources = [...sameBytes, ...(exact.length ? [] : samePath)].flatMap(entry => resolved(entry.sha256));
      labels.push({ ...file, provenance: sources.length ? [floor(sources)] : [] });
    }
    return labels;
  }
  async sources(scope, required = false) {
    const saved = await this.load(scope, required), grouped = new Map(), resolved = resolveSources(saved);
    for (const entry of saved.entries) grouped.set(entry.path, [...(grouped.get(entry.path) || []), ...resolved(entry.sha256)]);
    return [...grouped].map(([name, sources]) => ({ path: name, ...floor(sources) }));
  }
}
module.exports = { FileProvenanceLedger, validatedFiles, validated, resolveSources };
