// SPDX-License-Identifier: EUPL-1.2
'use strict';

const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { PrivacyGateError, stable } = require('./policy.cjs');

const fail = () => new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Hybridopgavens beskyttede samtalehukommelse kunne ikke gendannes. Ingen ny eller ekstern reservesamtale er startet.');
const MAX_BYTES = 24_000_000;
const privateFile = stat => stat.isFile() && stat.nlink === 1 && !(stat.mode & 0o077) && (typeof process.getuid !== 'function' || stat.uid === process.getuid());
const sameFile = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;

// The entire local file is encrypted by REQUIRED host-owned callbacks. Inside
// the encrypted snapshot, local and cloud transcripts/materials remain separate
// structures; only the requested partition is ever given to an executor.
// There is no plaintext fallback or raw-content audit. The host owns the key
// service and must never accept a renderer/model-supplied decrypted snapshot.
class HybridSessionStore {
  #queue = Promise.resolve();
  constructor({ directory, encrypt, decrypt } = {}) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory
      || typeof encrypt !== 'function' || typeof decrypt !== 'function') throw new TypeError('Hybrid memory requires a canonical private directory and trusted encryption/decryption callbacks.');
    Object.assign(this, { directory, encrypt, decrypt });
  }
  key(scope) { return createHash('sha256').update(stable(scope)).digest('hex'); }
  async #directory(create) {
    if (create) await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(this.directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(this.directory) !== this.directory || (stat.mode & 0o077) || typeof process.getuid === 'function' && stat.uid !== process.getuid()) throw fail();
  }
  async load(scope) {
    // Capture scope before awaiting the previous writer. A caller cannot move a
    // queued operation to a different conversation by mutating its arguments.
    const key = this.key(scope);
    await this.#queue;
    try {
      await this.#directory(false);
      const file = path.join(this.directory, `${key}.hybrid.enc`);
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      let ciphertext;
      try {
        const stat = await handle.stat();
        if (!privateFile(stat) || stat.size < 1 || stat.size > MAX_BYTES) throw fail();
        ciphertext = await handle.readFile();
        const after = await handle.stat(), named = await fs.lstat(file);
        if (!privateFile(after) || !privateFile(named) || !sameFile(stat, after) || !sameFile(after, named) || ciphertext.length !== stat.size) throw fail();
      } finally { await handle.close(); }
      await this.#directory(false);
      const plaintext = await this.decrypt(ciphertext);
      if (typeof plaintext !== 'string' || Buffer.byteLength(plaintext) > MAX_BYTES) throw fail();
      const value = JSON.parse(plaintext);
      if (value?.version !== 1 || value.scopeKey !== key || !value.session || typeof value.session !== 'object') throw fail();
      return value.session;
    } catch (error) { if (error.code === 'ENOENT') return null; throw fail(); }
  }
  save(scope, session) {
    let key, plaintext;
    try {
      key = this.key(scope); plaintext = JSON.stringify({ version: 1, scopeKey: key, session });
      if (Buffer.byteLength(plaintext) > MAX_BYTES) throw fail();
    } catch { return Promise.reject(fail()); }
    const operation = this.#queue.catch(() => {}).then(async () => {
      let temporary;
      try {
        await this.#directory(true);
        const encrypted = await this.encrypt(plaintext);
        if (!(encrypted instanceof Uint8Array) || !encrypted.byteLength || encrypted.byteLength > MAX_BYTES) throw fail();
        const target = path.join(this.directory, `${key}.hybrid.enc`);
        await this.#directory(false);
        try { const prior = await fs.lstat(target); if (!privateFile(prior)) throw fail(); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        temporary = path.join(this.directory, `.${key}-${randomUUID()}.tmp`);
        const handle = await fs.open(temporary, 'wx', 0o600);
        try { await handle.writeFile(encrypted); await handle.sync(); }
        finally { await handle.close(); }
        await this.#directory(false);
        await fs.rename(temporary, target); temporary = null;
        // A synced temporary file is not enough: its renamed directory entry
        // must be durable before callers acknowledge a published writeback or
        // discard its recovery journal. A failed directory sync is a failed
        // save even if the new encrypted snapshot is currently readable.
        const directory = await fs.open(this.directory, constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const held = await directory.stat(), named = await fs.lstat(this.directory);
          if (!held.isDirectory() || named.isSymbolicLink() || held.dev !== named.dev || held.ino !== named.ino) throw fail();
          await this.#directory(false);
          await directory.sync();
        } finally { await directory.close(); }
      } catch { throw fail(); }
      finally { if (temporary) await fs.unlink(temporary).catch(() => {}); }
    });
    this.#queue = operation;
    return operation;
  }
}

module.exports = { HybridSessionStore };
