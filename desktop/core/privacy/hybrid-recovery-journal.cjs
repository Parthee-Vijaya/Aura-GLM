// SPDX-License-Identifier: EUPL-1.2
'use strict';
const path = require('node:path');
const protectedPaths = require('../protected-paths.cjs');
const { createHash } = require('node:crypto');
const { HybridSessionStore } = require('./hybrid-session-store.cjs');
const { PrivacyGateError, stable, snapshot } = require('./policy.cjs');
const { relativePath, assertUnambiguousPaths } = require('./hybrid-paths.cjs');
const queues = new Map();
const hash = value => createHash('sha256').update(value).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const partition = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value);
const fail = () => new PrivacyGateError('PRIVACY_RECOVERY_REQUIRED', 'Den beskyttede opgaves genoprettelse kunne ikke bekræftes. Ingen handling er gentaget.');
const text = (value, maximum = 200) => typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\p{Cc}]/u.test(value);
const mode = value => Number.isSafeInteger(value) && value >= 0 && value <= 0o777;
function keys(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) throw fail();
}
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const child of Object.values(value)) freeze(child); } return value; }
function names(entries) {
  const seen = new Set();
  for (const value of entries) { if (!relativePath(value)) throw fail(); const canonical = value.normalize('NFC').toLocaleLowerCase('en-US'); if (seen.has(canonical)) throw fail(); seen.add(canonical); }
  assertUnambiguousPaths(entries, fail);
}
function descriptor(value) {
  keys(value, ['identity', 'fingerprint', 'files', 'directories']);
  if (!/^\d+:\d+$/.test(value.identity || '') || !sha(value.fingerprint) || !Array.isArray(value.files) || !Array.isArray(value.directories) || value.files.length + value.directories.length > 1000) throw fail();
  for (const file of value.files) { keys(file, ['path', 'sha256', 'mode']); if (!relativePath(file.path) || !sha(file.sha256) || !mode(file.mode)) throw fail(); }
  for (const directory of value.directories) { keys(directory, ['path', 'mode']); if (!relativePath(directory.path) || !mode(directory.mode)) throw fail(); }
  names([...value.files, ...value.directories].map(item => item.path));
  const files = new Set(value.files.map(file => file.path));
  for (const item of [...value.files, ...value.directories]) {
    const parts = item.path.split('/');
    for (let i = 1; i < parts.length; ++i) if (files.has(parts.slice(0, i).join('/'))) throw fail();
  }
  if (hash(stable({ identity: value.identity, files: value.files.map(file => [file.path, file.sha256, file.mode]), directories: value.directories.map(directory => [directory.path, directory.mode]) })) !== value.fingerprint) throw fail();
  return value;
}
function result(value) {
  keys(value, ['text', 'sessionID', 'provenance']);
  if (typeof value.text !== 'string' || Buffer.byteLength(value.text) > 512000 || !text(value.sessionID, 500) || !Array.isArray(value.provenance) || value.provenance.length > 1024) throw fail();
  for (const label of value.provenance) {
    keys(label, ['classification', 'attributes', 'uninspectable']); keys(label.attributes, ['personalData', 'secrets']);
    if (!['public', 'internal', 'confidential', 'strict'].includes(label.classification) || typeof label.uninspectable !== 'boolean' || typeof label.attributes.personalData !== 'boolean' || typeof label.attributes.secrets !== 'boolean') throw fail();
  }
  return value;
}
function publication(value, before) {
  keys(value, ['basis', 'changes']); descriptor(value.basis);
  if (stable(value.basis) !== stable(before) || !Array.isArray(value.changes) || value.changes.length > 1000) throw fail();
  names(value.changes.map(change => change?.name));
  const original = new Map(before.files.map(file => [file.path, file])); let total = 0;
  const excluded = name => protectedPaths.isProtected(name) || protectedPaths.isGenerated(name, 'privacy');
  for (const change of value.changes) {
    keys(change, ['kind', 'name', 'before', 'beforeMode', 'after', 'mode', 'base64']);
    if (!['file', 'directory'].includes(change.kind) || !relativePath(change.name) || excluded(change.name) || !mode(change.mode)) throw fail();
    const prior = original.get(change.name);
    if (change.before !== (prior?.sha256 ?? null) || prior && change.beforeMode !== prior.mode || !prior && change.beforeMode !== null && !mode(change.beforeMode)) throw fail();
    if (change.kind === 'directory') {
      if (prior || before.directories.some(item => item.path === change.name) || change.beforeMode !== null || change.after !== hash('') || change.base64 !== '') throw fail();
    } else if (change.after === null) { if (!prior || change.base64 !== null) throw fail(); }
    else {
      if (!sha(change.after) || typeof change.base64 !== 'string' || change.base64.length > 2666668) throw fail();
      const bytes = Buffer.from(change.base64, 'base64');
      if (bytes.length > 2000000 || bytes.toString('base64') !== change.base64 || hash(bytes) !== change.after || (total += bytes.length) > 16000000) throw fail();
    }
  }
  return value;
}
function afterMatches(state) {
  descriptor(state.hostAfter);
  if (state.hostAfter.identity !== state.hostBasis.identity) throw fail();
  if (!state.publication || state.outcome === 'rolled-back') { if (stable(state.hostAfter) !== stable(state.hostBasis)) throw fail(); return; }
  const expected = new Map(state.hostBasis.files.map(file => [file.path, file]));
  const directories = new Map(state.hostBasis.directories.map(directory => [directory.path, directory.mode]));
  const createdParents = new Set();
  for (const change of state.publication.changes) {
    if (change.kind === 'file') { if (change.after === null) expected.delete(change.name); else expected.set(change.name, { path: change.name, sha256: change.after, mode: change.mode }); }
    else directories.set(change.name, change.mode);
    const parts = change.name.split('/'); for (let i = 1; i < parts.length; ++i) createdParents.add(parts.slice(0, i).join('/'));
  }
  if (expected.size !== state.hostAfter.files.length || state.hostAfter.files.some(file => stable(expected.get(file.path)) !== stable(file))) throw fail();
  const actualDirectories = new Map(state.hostAfter.directories.map(directory => [directory.path, directory.mode]));
  for (const [name, permissions] of directories) if (actualDirectories.get(name) !== permissions) throw fail();
  for (const [name, permissions] of actualDirectories) if (!directories.has(name) && (!createdParents.has(name) || permissions !== 0o700)) throw fail();
}
function validate(state, id) {
  keys(state, ['version', 'partitionID', 'status', 'transactionID', 'stageID', 'taskID', 'binding', 'engineBefore', 'engineFingerprint', 'stageKind', 'stageMode', 'hostBasis', 'result', 'publication', 'outcome', 'hostAfter']);
  if (state.version !== 1 || state.partitionID !== id || !partition(id) || !['started', 'result', 'retired', 'publication', 'finished', 'acknowledged'].includes(state.status)
    || !text(state.transactionID) || !text(state.stageID) || !text(state.taskID) || !sha(state.binding) || typeof state.engineBefore !== 'boolean'
    || (state.engineBefore ? !sha(state.engineFingerprint) : state.engineFingerprint !== null) || !['local', 'cloud'].includes(state.stageKind) || !['chat', 'plan', 'build', 'free'].includes(state.stageMode)) throw fail();
  descriptor(state.hostBasis);
  if (state.result !== null) result(state.result);
  if (state.publication !== null) { if (!state.result) throw fail(); publication(state.publication, state.hostBasis); }
  if (state.status === 'started' && state.result !== null || ['started', 'result', 'retired'].includes(state.status) && state.publication !== null || state.status === 'result' && state.result === null || state.status === 'publication' && state.publication === null) throw fail();
  if (['finished', 'acknowledged'].includes(state.status)) {
    if (!['rolled-back', 'completed'].includes(state.outcome) || state.outcome === 'rolled-back' && state.publication !== null || state.outcome === 'completed' && state.result === null) throw fail();
    afterMatches(state);
  } else if (state.outcome !== null || state.hostAfter !== null) throw fail();
  return state;
}

// Host-owned, encrypted write-ahead protocol. No generic update method permits
// skipping the native retirement or publication states. Invocation of retired
// is the caller's attested zero-writer boundary, never model/renderer input.
class HybridRecoveryJournal {
  constructor({ directory, encrypt, decrypt } = {}) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) !== directory) throw fail();
    this.directory = directory; this.store = new HybridSessionStore({ directory, encrypt, decrypt });
  }
  #serialized(operation) {
    const previous = queues.get(this.directory) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation); queues.set(this.directory, current);
    void current.finally(() => { if (queues.get(this.directory) === current) queues.delete(this.directory); }).catch(() => {});
    return current;
  }
  async #save(partitionID, state) {
    // Save includes file and directory fsync. Publication and acknowledgement
    // may only proceed once the encrypted journal has become durable.
    await this.store.save({ partitionID }, state);
  }
  read(partitionID) {
    if (!partition(partitionID)) return Promise.reject(fail());
    return this.#serialized(async () => { const state = await this.store.load({ partitionID }); return state === null ? null : freeze(validate(state, partitionID)); });
  }
  begin(partitionID, input) {
    let state;
    try { keys(input, ['transactionID', 'stageID', 'taskID', 'binding', 'engineBefore', 'engineFingerprint', 'stageKind', 'stageMode', 'hostBasis']); state = validate(snapshot({ version: 1, partitionID, status: 'started', ...input, result: null, publication: null, outcome: null, hostAfter: null }), partitionID); }
    catch { return Promise.reject(fail()); }
    return this.#serialized(async () => {
      const prior = await this.store.load({ partitionID });
      if (prior !== null && (validate(prior, partitionID).status !== 'acknowledged' || prior.transactionID === state.transactionID)) throw fail();
      await this.#save(partitionID, state); return freeze(state);
    });
  }
  #transition(partitionID, transactionID, action) {
    if (!partition(partitionID) || !text(transactionID)) return Promise.reject(fail());
    return this.#serialized(async () => {
      const state = await this.store.load({ partitionID });
      if (!state || validate(state, partitionID).transactionID !== transactionID) throw fail();
      action(state); validate(state, partitionID); await this.#save(partitionID, state); return freeze(state);
    });
  }
  result(partitionID, transactionID, input) {
    let captured; try { captured = result(snapshot(input)); } catch { return Promise.reject(fail()); }
    return this.#transition(partitionID, transactionID, state => { if (state.status !== 'started') throw fail(); state.result = captured; state.status = 'result'; });
  }
  retired(partitionID, transactionID) {
    return this.#transition(partitionID, transactionID, state => { if (!['started', 'result'].includes(state.status)) throw fail(); state.status = 'retired'; });
  }
  publication(partitionID, transactionID, input) {
    let captured; try { captured = snapshot(input); } catch { return Promise.reject(fail()); }
    return this.#transition(partitionID, transactionID, state => { if (state.status !== 'retired' || !state.result) throw fail(); state.publication = publication(captured, state.hostBasis); state.status = 'publication'; });
  }
  finish(partitionID, transactionID, input) {
    let captured; try { keys(input, ['outcome', 'hostAfter']); captured = snapshot(input); } catch { return Promise.reject(fail()); }
    return this.#transition(partitionID, transactionID, state => { if (!['retired', 'publication'].includes(state.status)) throw fail(); state.outcome = captured.outcome; state.hostAfter = captured.hostAfter; state.status = 'finished'; });
  }
  acknowledge(partitionID, transactionID) {
    return this.#transition(partitionID, transactionID, state => { if (state.status !== 'finished') throw fail(); state.status = 'acknowledged'; });
  }
}
module.exports = { HybridRecoveryJournal };
