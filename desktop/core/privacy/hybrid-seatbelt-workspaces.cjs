// SPDX-License-Identifier: EUPL-1.2
'use strict';
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { PrivacyGateError, stable, snapshot } = require('./policy.cjs');
const { relativePath, assertUnambiguousPaths } = require('./hybrid-paths.cjs');
const { HybridRecoveryJournal } = require('./hybrid-recovery-journal.cjs');
const { createEngineIsolation } = require('../../privacy/isolation/engine-isolation.cjs');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = () => new PrivacyGateError('PRIVACY_ISOLATION_UNAVAILABLE', 'Det isolerede arbejdsområde kunne ikke kontrolleres. Dine projektfiler er bevaret.');
const unretired = () => new PrivacyGateError('PRIVACY_UNRETIRED_PARTITION', 'En tidligere isoleret kørsel er ikke bekræftet stoppet. Arbejdsområdet genbruges ikke, og projektfilerne er bevaret.');
const stale = () => new PrivacyGateError('PRIVACY_STALE', 'Projektet er ændret, mens den isolerede opgave arbejdede. Gennemgå resultatet igen.');
const protectedPaths = require('../protected-paths.cjs');
// References remain governed by the exact selected-reference set below. They
// cannot release credentials, even if explicitly selected as source material.
const excluded = name => protectedPaths.isProtected(name, { references: false }) || protectedPaths.isGenerated(name, 'privacy');
const contains = (root, file) => file === root || file.startsWith(root + path.sep);
const same = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
async function privateDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.uid !== process.getuid?.() || await fs.realpath(directory) !== directory) throw fail();
  return stat;
}
async function stableFile(file) {
  const handle = await fs.open(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.nlink !== 1 || before.size > 2_000_000) throw fail();
    const bytes = Buffer.alloc(before.size + 1); let size = 0;
    while (size < bytes.length) { const read = await handle.read(bytes, size, bytes.length - size, size); if (!read.bytesRead) break; size += read.bytesRead; }
    const after = await handle.stat(), named = await fs.lstat(file);
    if (!same(before, after) || !same(after, named) || named.isSymbolicLink() || named.nlink !== 1 || size !== before.size) throw fail();
    return { bytes: bytes.subarray(0, size), mode: before.mode & 0o777 };
  } finally { await handle.close(); }
}
// No glob, archive extraction or model-provided absolute path is trusted. This
// finite snapshot includes empty directories, selected references and exact bytes.
async function projectSnapshot(root, selectedReferences = new Set(), { output = false } = {}) {
  const files = new Map(), directories = new Map(), names = []; let total = 0;
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || await fs.realpath(root) !== root) throw fail();
  async function walk(directory, prefix = '') {
    const before = await fs.lstat(directory);
    if (!before.isDirectory() || before.isSymbolicLink() || await fs.realpath(directory) !== directory) throw fail();
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const name = prefix + item.name;
      if (excluded(name)) { if (output) throw fail(); continue; }
      if (protectedPaths.classify(name).references && !selectedReferences.has(name) && ![...selectedReferences].some(ref => ref.startsWith(name + '/'))) continue;
      if (!relativePath(name) || names.length >= 1000) throw fail();
      names.push(name); assertUnambiguousPaths(names, fail);
      const file = path.join(root, name), stat = await fs.lstat(file);
      if (stat.isSymbolicLink()) throw fail();
      if (stat.isDirectory()) { directories.set(name, stat.mode & 0o777); await walk(file, name + '/'); }
      else {
        const value = await stableFile(file);
        if ((total += value.bytes.length) > 48_000_000) throw fail();
        files.set(name, { ...value, sha256: sha(value.bytes) });
      }
    }
    const after = await fs.lstat(directory);
    if (!same(before, after) || await fs.realpath(directory) !== directory) throw fail();
  }
  await walk(root);
  return { files, directories, identity: `${rootStat.dev}:${rootStat.ino}`, fingerprint: sha(stable({ identity: `${rootStat.dev}:${rootStat.ino}`, files: [...files].map(([name, value]) => [name, value.sha256, value.mode]), directories: [...directories] })) };
}
function descriptor(value) {
  return { identity: value.identity, fingerprint: value.fingerprint,
    files: [...value.files].map(([path, file]) => ({ path, sha256: file.sha256, mode: file.mode })),
    directories: [...value.directories].map(([path, mode]) => ({ path, mode })) };
}
async function engineSnapshot(root, { skipSDKLinks = true } = {}) {
  const files = [], directories = []; let total = 0;
  await privateDirectory(root);
  async function walk(directory, prefix = '') {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const name = prefix + item.name, file = path.join(root, name), stat = await fs.lstat(file);
      // These two SDK links are reconstructed and verified by OpenCodeEngine
      // before every launch. They contain no conversation state.
      if (skipSDKLinks && ['config/node_modules', 'config/opencode/node_modules'].includes(name)) continue;
      if (!relativePath(name) || stat.isSymbolicLink() || files.length + directories.length >= 10000) throw fail();
      if (stat.isDirectory()) { directories.push(name); await walk(file, name + '/'); }
      else {
        const handle = await fs.open(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
        try {
          const before = await handle.stat();
          if (!before.isFile() || before.nlink !== 1 || before.size > 128000000 || (total += before.size) > 256000000) throw fail();
          const bytes = await handle.readFile(), after = await handle.stat(), named = await fs.lstat(file);
          if (!same(before, after) || !same(after, named) || bytes.length !== before.size) throw fail();
          files.push({ name, bytes, sha256: sha(bytes), mode: before.mode & 0o777 });
        } finally { await handle.close(); }
      }
    }
  }
  await walk(root);
  return { files, directories, fingerprint: sha(stable({ directories, files: files.map(file => [file.name, file.sha256, file.mode]) })) };
}
function syncDirectorySync(directory) { const handle = fsSync.openSync(directory, fsSync.constants.O_RDONLY); try { fsSync.fsyncSync(handle); } finally { fsSync.closeSync(handle); } }
function syncFileSync(file) { const handle = fsSync.openSync(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW); try { fsSync.fsyncSync(handle); } finally { fsSync.closeSync(handle); } }
async function replaceEngine(directory, state) {
  const parent = path.dirname(directory), staging = path.join(parent, 'engine-restore-' + randomUUID());
  await privateDirectory(staging);
  for (const name of state.directories) await fs.mkdir(path.join(staging, name), { recursive: true, mode: 0o700 });
  for (const file of state.files) { await fs.writeFile(path.join(staging, file.name), file.bytes, { flag: 'wx', mode: file.mode }); syncFileSync(path.join(staging, file.name)); }
  for (const name of [...state.directories].reverse()) syncDirectorySync(path.join(staging, name));
  syncDirectorySync(staging);
  if ((await engineSnapshot(staging)).fingerprint !== state.fingerprint) throw fail();
  const retired = path.join(parent, 'engine-retired-' + randomUUID());
  await fs.rename(directory, retired);
  try { await fs.rename(staging, directory); } catch (error) { await fs.rename(retired, directory); throw error; }
  syncDirectorySync(parent);
  await fs.rm(retired, { recursive: true });
  syncDirectorySync(parent);
}
// Preserve the complete, retired 1.x lane before V2's automatic SQLite import.
// This directory is a sibling of the engine/workspace, never an agent read root.
// Unlike engine-before, it is permanent and is not rotated at the next turn.
async function preserveLegacyEngine({ partition, directory, workspaceRoot, owner, sessionID }) {
  const backup = path.join(partition, 'engine-v1-preserved');
  const ownerFile = await stableFile(path.join(partition, 'owner.json'));
  if (ownerFile.bytes.toString() !== owner || ownerFile.mode & 0o077) throw fail();
  const binding = sha(owner);
  const existing = await fs.lstat(backup).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (existing) {
    await privateDirectory(backup);
    const manifestFile = await stableFile(path.join(backup, 'manifest.json'));
    let manifest; try { manifest = JSON.parse(manifestFile.bytes); } catch { throw fail(); }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || manifestFile.mode !== 0o600 || stable(Object.keys(manifest).sort()) !== stable(['fingerprint', 'owner', 'sessionID', 'sourceVersion', 'version'].sort())
      || manifest.version !== 1 || manifest.owner !== binding || manifest.sourceVersion !== '1.18.33'
      || typeof manifest.sessionID !== 'string' || !/^ses_[a-zA-Z0-9]+$/.test(manifest.sessionID)
      || sessionID && manifest.sessionID !== sessionID || !/^[a-f0-9]{64}$/.test(manifest.fingerprint || '')) throw fail();
    if ((await engineSnapshot(path.join(backup, 'payload'), { skipSDKLinks: false })).fingerprint !== manifest.fingerprint) throw fail();
    return Object.freeze(manifest);
  }
  const before = await engineSnapshot(directory), database = 'data/opencode/opencode.db';
  if (!before.files.some(file => file.name === database)) return null;
  const staging = path.join(partition, 'engine-v1-prepare-' + randomUUID());
  await privateDirectory(staging);
  let published = false;
  try {
    // Query a second disposable copy: SQLite may update its shared-memory file
    // even for a read-only connection. Original and retained bytes stay exact.
    const inspect = path.join(staging, 'inspect'); await privateDirectory(inspect); await replaceEngine(inspect, before);
    let db, legacy;
    try {
      db = new (require('node:sqlite').DatabaseSync)(path.join(inspect, database), { readOnly: true });
      const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
      if (tables.has('session_v2')) return null;
      if (!['session', 'message', 'part', 'project'].every(name => tables.has(name)) || !sessionID) throw fail();
      legacy = db.prepare('SELECT id, directory, version FROM session WHERE id = ?').get(sessionID);
      if (!legacy || legacy.directory !== workspaceRoot || legacy.version !== '1.18.33'
        || db.prepare('SELECT COUNT(*) AS count FROM session WHERE directory != ?').get(workspaceRoot).count !== 0) throw fail();
    } catch { throw fail(); } finally { db?.close(); }
    await fs.rm(inspect, { recursive: true });
    const payload = path.join(staging, 'payload'); await privateDirectory(payload); await replaceEngine(payload, before);
    const manifest = { version: 1, sourceVersion: legacy.version, sessionID: legacy.id, owner: binding, fingerprint: before.fingerprint };
    const manifestPath = path.join(staging, 'manifest.json'); await fs.writeFile(manifestPath, stable(manifest), { flag: 'wx', mode: 0o600 }); syncFileSync(manifestPath); syncDirectorySync(staging);
    if ((await engineSnapshot(directory)).fingerprint !== before.fingerprint || (await stableFile(path.join(partition, 'owner.json'))).bytes.toString() !== owner) throw fail();
    // The exclusive active-run marker is already held by the host. A present
    // destination (including an incomplete prior copy) is never overwritten.
    if (await fs.lstat(backup).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; })) throw fail();
    await fs.rename(staging, backup); published = true; syncDirectorySync(partition);
    return Object.freeze(manifest);
  } finally { if (!published) await fs.rm(staging, { recursive: true, force: true }); }
}
class HybridSeatbeltWorkspaces {
  #leases = new WeakMap(); #active = new Set(); #pending = new Set(); #closed = false; #closing;
  constructor({ directory, projectRoot, runtimeRoot, validateStage, assertCurrent, getAuthoritySnapshot, isolationFactory = createEngineIsolation,
    encrypt, decrypt, checkCloudFile, requestWritebackApproval, onWritebackEvent = () => {}, recordProvenance, onApplied = () => {}, trustedReadFiles = [], trustedReadRoots = [] } = {}) {
    if (![directory, projectRoot, runtimeRoot].every(value => typeof value === 'string' && path.isAbsolute(value) && path.resolve(value) === value)
      || [validateStage, assertCurrent, getAuthoritySnapshot, isolationFactory, onWritebackEvent, onApplied].some(value => typeof value !== 'function')
      || contains(projectRoot, directory) || contains(directory, projectRoot)) throw fail();
    if (encrypt && decrypt) this.journal = new HybridRecoveryJournal({ directory: path.join(directory, 'recovery'), encrypt, decrypt });
    Object.assign(this, { directory, projectRoot, runtimeRoot, validateStage, assertCurrent, getAuthoritySnapshot, isolationFactory, checkCloudFile, requestWritebackApproval, onWritebackEvent, recordProvenance, onApplied, trustedReadFiles, trustedReadRoots });
  }
  check(stage) {
    if (this.#closed || stage.signal?.aborted || this.validateStage(stage) !== true || this.assertCurrent(stage) !== true) throw stale();
  }
  current(record) {
    this.check(record.stage);
    if (this.getAuthoritySnapshot(record.stage.scope) !== record.authority) throw stale();
    return true;
  }
  preparePartition(stage, details) {
    const operation = this.prepare(stage, details); this.#pending.add(operation);
    return operation.finally(() => this.#pending.delete(operation));
  }
  async prepare(stage, { gateway } = {}) {
    this.check(stage);
    if (!/^[a-f0-9-]{36}$/.test(stage.partitionID || '') || !['local', 'cloud'].includes(stage.kind) || !['chat', 'plan', 'build', 'free'].includes(stage.mode)) throw fail();
    const url = new URL(gateway?.url);
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password) throw fail();
    await privateDirectory(this.directory);
    const authority = this.getAuthoritySnapshot(stage.scope); if (!/^[a-f0-9]{64}$/.test(authority || '')) throw fail();
    if ([...this.#active].some(lease => this.#leases.get(lease)?.stage.partitionID === stage.partitionID)) throw stale();
    const partition = path.join(this.directory, stage.partitionID); await privateDirectory(partition);
    // This host-only exclusive marker outlives an app crash. The engine can
    // write workspace/engine, never their partition parent. A leftover marker
    // blocks rotation and history reuse even if an old detached writer survived.
    const markerFile = path.join(partition, 'active-run.json');
    const transactionID = randomUUID();
    const markerBytes = Buffer.from(stable({ version: 1, run: transactionID, partition: stage.partitionID }));
    let markerHandle;
    try { markerHandle = await fs.open(markerFile, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw unretired(); throw error; }
    try { await markerHandle.writeFile(markerBytes); await markerHandle.sync(); }
    finally { await markerHandle.close(); }
    const partitionHandle = await fs.open(partition, fsSync.constants.O_RDONLY);
    try { await partitionHandle.sync(); } finally { await partitionHandle.close(); }
    let record;
    try {
    const directory = path.join(partition, 'engine'), ownerFile = path.join(partition, 'owner.json');
    const expected = stable({ kind: stage.kind, destination: stage.destination, project: this.projectRoot, partition: stage.partitionID });
    try { const found = await stableFile(ownerFile); if (found.bytes.toString() !== expected || found.mode & 0o077) throw fail(); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      if (stage.engineSessionID) throw new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Den isolerede motors tidligere samtale mangler. Ingen tom reservesamtale er startet.');
      await fs.writeFile(ownerFile, expected, { flag: 'wx', mode: 0o600 });
    }
    if (stage.engineSessionID) { const stat = await fs.lstat(directory).catch(() => null); if (!stat?.isDirectory()) throw new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Den isolerede motors tidligere samtale mangler.'); }
    await privateDirectory(directory);
    const root = path.join(partition, 'workspace'), staging = path.join(partition, 'prepare-' + randomUUID()); await privateDirectory(staging);
    const projectInput = stage.kind === 'local' || stage.allowProjectInput === true;
    const refs = projectInput ? snapshot(stage.references || []) : [], selected = new Set(refs.map(file => file.path));
    record = { stage, authority, transactionID, root, directory, markerFile, markerBytes, gateway: gateway.url, selected, active: true, success: false, started: false, approved: new Set(), approvedHashes: new Map(), approvedCommand: false, isolation: null, basis: null };
    let skills = projectInput ? snapshot(stage.skills || []) : [];
    if (stage.kind === 'cloud' && projectInput) {
      if (typeof this.checkCloudFile !== 'function') throw fail();
      for (const skill of skills) for (const file of skill.files || []) if (await this.checkCloudFile({ path: '.aura-skills/' + skill.name + '/' + file.path, bytes: Buffer.from(file.content), mode: 0o400 }, stage) !== true) throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'En valgt skill kræver lokal behandling efter projektets dataregler.');
    }
    const lease = Object.freeze({ root, directory, mode: stage.mode, isolationIdentity: randomUUID(), references: Object.freeze([...selected]), skills: Object.freeze(skills) });
    this.#leases.set(lease, record); this.#active.add(lease);
    try {
      this.current(record);
      record.hostBasis = await projectSnapshot(this.projectRoot, selected);
      if (this.journal) {
        const previous = await this.journal.read(stage.partitionID);
        if (previous && previous.status !== 'acknowledged') throw unretired();
        const before = await engineSnapshot(directory), backup = path.join(partition, 'engine-before');
        await privateDirectory(backup); await replaceEngine(backup, before);
        await this.journal.begin(stage.partitionID, { transactionID, stageID: stage.stageID, taskID: stage.taskID, binding: stage.recoveryBinding || authority, engineBefore: true, engineFingerprint: before.fingerprint, stageKind: stage.kind, stageMode: stage.mode, hostBasis: descriptor(record.hostBasis) });
        record.journaled = true;
      }
      await preserveLegacyEngine({ partition, directory, workspaceRoot: root, owner: expected, sessionID: stage.engineSessionID });
      this.current(record);
      if (projectInput) {
        record.hostBasis = await projectSnapshot(this.projectRoot, selected);
        record.basis = record.hostBasis;
        if (stage.kind === 'cloud') {
          const files = new Map(), directories = new Map();
          for (const [name, file] of record.hostBasis.files) {
            this.current(record);
            const allowed = await this.checkCloudFile({ path: name, bytes: Buffer.from(file.bytes), mode: file.mode }, stage);
            this.current(record);
            if (allowed !== true) { if (selected.has(name)) throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'En valgt reference kræver lokal behandling efter projektets dataregler.'); continue; }
            files.set(name, file); const components = name.split('/');
            for (let i = 1; i < components.length; i++) { const directory = components.slice(0, i).join('/'); directories.set(directory, record.hostBasis.directories.get(directory)); }
          }
          record.basis = { ...record.hostBasis, files, directories };
        }
        for (const ref of refs) {
          const source = record.basis.files.get(ref.path), bytes = Buffer.from(ref.base64 || '', 'base64');
          if (!relativePath(ref.path) || !ref.path.startsWith('references/') || !source || sha(bytes) !== ref.sha256 || source.sha256 !== ref.sha256) throw stale();
        }
        for (const name of record.basis.directories.keys()) await fs.mkdir(path.join(staging, name), { recursive: true, mode: 0o700 });
        for (const [name, file] of record.basis.files) await fs.writeFile(path.join(staging, name), file.bytes, { flag: 'wx', mode: selected.has(name) ? 0o400 : file.mode });
        if ((await projectSnapshot(this.projectRoot, selected)).fingerprint !== record.hostBasis.fingerprint) throw stale();
      }
      // Keep one stable absolute path per partition so the exact saved engine
      // session never sees its old paths referring to a different workspace.
      let prior; try { prior = await fs.lstat(root); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (prior && (!prior.isDirectory() || prior.isSymbolicLink() || prior.mode & 0o077 || await fs.realpath(root) !== root)) throw fail();
      const retired = path.join(partition, 'retired-' + randomUUID());
      if (prior) await fs.rename(root, retired);
      try { await fs.rename(staging, root); } catch (error) { if (prior) await fs.rename(retired, root); throw error; }
      // Only this host-owned disposable snapshot is removed; source files and
      // the partition's persistent engine history are outside that path.
      if (prior) await fs.rm(retired, { recursive: true, force: false });
      // Cloud receives only material strings in its guarded engine prompt. It
      // never receives project files, instructions, skills or reference paths.
      this.current(record); return lease;
    } catch (error) { record.active = false; this.#active.delete(lease); throw error; }
    } catch (error) {
      // prepare() has not returned a launch capability, so no child can exist.
      if (!record?.started && record?.journaled) {
        await this.journal.retired(stage.partitionID, transactionID);
        await this.journal.finish(stage.partitionID, transactionID, { outcome: 'rolled-back', hostAfter: descriptor(record.hostBasis) });
      }
      if (!record?.started) await this.clearRunMarker({ markerFile, markerBytes });
      throw error;
    }
  }
  async clearRunMarker(record) {
    const found = await stableFile(record.markerFile);
    if (!found.bytes.equals(record.markerBytes) || found.mode & 0o077) throw unretired();
    await fs.unlink(record.markerFile);
    const parent = await fs.open(path.dirname(record.markerFile), fsSync.constants.O_RDONLY);
    try { await parent.sync(); } finally { await parent.close(); }
  }
  async validateLease(lease, stage) {
    const record = this.#leases.get(lease);
    if (!record?.active || record.retiring || record.stage !== stage) throw fail();
    this.current(record);
    for (const directory of [record.root, record.directory]) { const stat = await fs.lstat(directory); if (!stat.isDirectory() || stat.isSymbolicLink() || stat.mode & 0o077 || await fs.realpath(directory) !== directory) throw fail(); }
    if (record.isolation) await record.isolation.verify();
    return true;
  }
  async engineOptions(lease, stage) {
    await this.validateLease(lease, stage); const record = this.#leases.get(lease);
    return { root: lease.root, directory: lease.directory, privacyIsolation: async details => {
      await this.validateLease(lease, stage);
      if (record.started || details.root !== lease.root || details.directory !== lease.directory) throw fail();
      record.started = true;
      record.launchPreparing = Promise.resolve().then(() => this.isolationFactory({ workspaceRoot: lease.root, stateRoot: lease.directory, runtimeRoot: this.runtimeRoot,
        gatewayURL: record.gateway, enginePort: details.port, trustedReadFiles: [...this.trustedReadFiles, ...(details.guardian ? [details.guardian] : [])], trustedReadRoots: this.trustedReadRoots })).then(isolation => (record.isolation = isolation));
      const isolation = await record.launchPreparing; await this.validateLease(lease, stage); return isolation;
    } };
  }
  async recordPermission(lease, properties, answer) {
    const record = this.#leases.get(lease); if (!record?.active || answer?.allow !== true) return;
    this.current(record);
    if ((record.stage.kind !== 'local' && record.stage.allowWriteback !== true) || !['build', 'free'].includes(record.stage.mode)) {
      if (['edit', 'bash'].includes(properties.permission)) throw fail(); return;
    }
    if (properties.permission === 'bash') { record.approvedCommand = true; return; }
    if (properties.permission !== 'edit') return;
    const values = properties.metadata?.files?.length ? properties.metadata.files.flatMap(file => [file?.filePath ?? file?.file, ...(file?.movePath !== undefined ? [file.movePath] : [])]) : [properties.metadata?.filepath];
    const names = values.map(value => {
      const name = typeof value === 'string' && value.startsWith(lease.root + path.sep) ? value.slice(lease.root.length + 1) : value;
      if (!relativePath(name) || excluded(name) || record.stage.kind === 'cloud' && record.hostBasis.files.has(name) && !record.basis.files.has(name) || name === 'references' || name.startsWith('references/') || /[*?{}[\]]/.test(name)) throw fail(); return name;
    });
    if (!names.length || names.length > 1000) throw fail(); assertUnambiguousPaths(names, fail);
    for (const name of names) record.approved.add(name);
    const tool = properties.proposedTool, input = tool?.state?.input || {}, name = names[0], file = path.join(lease.root, name);
    if (names.length === 1 && (input.path || input.filePath) === file) {
      if (tool?.tool === 'write' && typeof input.content === 'string') record.approvedHashes.set(name, sha(Buffer.from(input.content)));
      if (tool?.tool === 'edit' && typeof input.oldString === 'string' && input.oldString && typeof input.newString === 'string') {
        const before = (await stableFile(file)).bytes.toString('utf8'), old = input.oldString;
        if (before.includes(old) && (input.replaceAll || before.indexOf(old) === before.lastIndexOf(old))) record.approvedHashes.set(name, sha(Buffer.from(input.replaceAll ? before.split(old).join(input.newString) : before.replace(old, () => input.newString))));
      }
    }
  }
  async complete(lease, stage, result) {
    // Executor calls this only after engine and gateway close acknowledged.
    // The isolation object's launch authority may already be disposed then.
    const record = this.#leases.get(lease); if (!record?.active || record.stage !== stage) throw fail();
    this.current(record);
    if (this.journal) await this.journal.result(stage.partitionID, record.transactionID, { text: result.text, sessionID: result.sessionID, provenance: stage.getSourceProvenance?.() || [] });
    this.current(record); record.success = true;
  }
  async approveChange(record, change) {
    const expected = change.bytes === null ? 'absent' : sha(change.bytes);
    if (change.kind === 'file' && record.approvedHashes.get(change.name) === expected && change.mode === change.beforeMode) return true;
    if (typeof this.requestWritebackApproval !== 'function') return false;
    const id = randomUUID(), callID = randomUUID(), file = path.join(record.root, change.name);
    const input = change.kind === 'directory' ? { command: 'mkdir -- ' + JSON.stringify(file) } : change.bytes === null ? { patchText: `*** Begin Patch\n*** Delete File: ${file}\n*** End Patch` } : { filePath: file, ...(!change.bytes.includes(0) ? { content: change.bytes.toString('utf8') } : {}) };
    const part = { id: randomUUID(), messageID: randomUUID(), type: 'tool', callID, tool: change.kind === 'directory' ? 'bash' : change.bytes === null ? 'apply_patch' : 'write', state: { status: 'pending', input } };
    this.onWritebackEvent({ type: 'message.part.updated', properties: { part } }, { ...record.stage, root: record.root });
    const answer = await this.requestWritebackApproval({ id, permission: 'edit', patterns: [change.name], metadata: { filepath: file, sha256: expected, sourceSHA256: change.before || 'absent', mode: change.mode, operation: change.kind === 'directory' ? 'mkdir' : change.bytes === null ? 'delete' : 'write' }, tool: { callID } }, { ...record.stage, root: record.root });
    this.current(record);
    if (answer?.allow !== true) return false;
    change.part = part; return true;
  }
  async publish(record) {
    if (!record.success || !record.started || (record.stage.kind !== 'local' && record.stage.allowWriteback !== true) || !['build', 'free'].includes(record.stage.mode)) return;
    this.current(record);
    const output = await projectSnapshot(record.root, record.selected, { output: true }), changes = [];
    for (const name of new Set([...record.basis.files.keys(), ...output.files.keys()])) {
      if (name.startsWith('references/')) continue;
      if (record.stage.kind === 'cloud' && record.hostBasis.files.has(name) && !record.basis.files.has(name)) throw fail();
      const before = record.basis.files.get(name), after = output.files.get(name);
      if (before?.sha256 === after?.sha256 && before?.mode === after?.mode) continue;
      if (!record.approvedCommand && !record.approved.has(name)) throw new PrivacyGateError('PRIVACY_APPROVAL_REQUIRED', 'Et isoleret filresultat mangler sin konkrete værktøjsgodkendelse.');
      changes.push({ kind: 'file', name, bytes: after?.bytes || null, mode: after?.mode ?? before.mode, before: before?.sha256 || null, beforeMode: before?.mode ?? (0o666 & ~process.umask()) });
    }
    for (const [name, mode] of output.directories) if (!record.basis.directories.has(name) && ![...output.files.keys()].some(file => file.startsWith(name + '/')) && ![...output.directories.keys()].some(child => child.startsWith(name + '/'))) {
      if (!record.approvedCommand) throw new PrivacyGateError('PRIVACY_APPROVAL_REQUIRED', 'En isoleret mappeoprettelse mangler sin konkrete godkendelse.');
      changes.push({ kind: 'directory', name, bytes: Buffer.from(''), mode, before: null, beforeMode: null });
    }
    if (!changes.length) return;
    const checkSource = async () => { this.current(record); if ((await projectSnapshot(this.projectRoot, record.selected)).fingerprint !== record.hostBasis.fingerprint) throw stale(); this.current(record); };
    await checkSource();
    for (const change of changes) { if (await this.approveChange(record, change) !== true) throw new PrivacyGateError('PRIVACY_APPROVAL_REQUIRED', 'De isolerede ændringer blev ikke godkendt. Projektfilerne er bevaret.'); await checkSource(); }
    if (typeof this.recordProvenance !== 'function') throw new PrivacyGateError('PRIVACY_PROVENANCE_MISSING', 'Filernes afledte beskyttelse kunne ikke gemmes. Ingen projektfil er ændret.');
    await this.recordProvenance(changes.map(change => ({ path: change.name, sha256: change.bytes === null ? null : sha(change.bytes), provenance: record.stage.getSourceProvenance?.() || [], parents: [...new Set([...record.basis.files.values()].map(file => file.sha256))].filter(hash => change.bytes === null || hash !== sha(change.bytes)) })), record.stage);
    await checkSource();
    if (this.journal) await this.journal.publication(record.stage.partitionID, record.transactionID, { basis: descriptor(record.hostBasis), changes: changes.map(change => ({ kind: change.kind, name: change.name, before: change.before, beforeMode: change.beforeMode, after: change.bytes === null ? null : sha(change.bytes), mode: change.mode, base64: change.bytes === null ? null : change.bytes.toString('base64') })) });
    // Finite frozen bytes are the approved output. A changed guest file after
    // review cannot alter these bytes. This is not an atomic multi-file commit;
    // each write rechecks its source and policy immediately before replacement.
    for (const change of changes) {
      this.current(record);
      const file = path.join(this.projectRoot, change.name); let parent = this.projectRoot;
      const root = fsSync.lstatSync(parent);
      if (`${root.dev}:${root.ino}` !== record.basis.identity || root.isSymbolicLink()) throw stale();
      for (const component of change.name.split('/').slice(0, -1)) {
        parent = path.join(parent, component);
        if (!fsSync.existsSync(parent)) fsSync.mkdirSync(parent, { mode: 0o700 });
        const stat = fsSync.lstatSync(parent); if (!stat.isDirectory() || stat.isSymbolicLink() || fsSync.realpathSync(parent) !== parent) throw stale();
      }
      let present; try { present = fsSync.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (present?.isSymbolicLink() || present && (change.before === null || !present.isFile() || present.nlink !== 1 || sha(fsSync.readFileSync(file)) !== change.before || (present.mode & 0o777) !== change.beforeMode) || !present && change.before !== null) throw stale();
      this.current(record);
      if (change.kind === 'directory') fsSync.mkdirSync(file, { mode: change.mode });
      else if (change.bytes === null) fsSync.unlinkSync(file);
      else {
        const temporary = path.join(parent, '.aura-privacy-' + randomUUID() + '.tmp');
        try { fsSync.writeFileSync(temporary, change.bytes, { flag: 'wx', mode: change.mode }); syncFileSync(temporary); this.current(record); fsSync.renameSync(temporary, file); }
        finally { try { fsSync.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
      }
      for (let directory = parent; contains(this.projectRoot, directory); directory = path.dirname(directory)) { syncDirectorySync(directory); if (directory === this.projectRoot) break; }
      this.onApplied(change.name, change.bytes, record.stage);
      if (change.part) this.onWritebackEvent({ type: 'message.part.updated', properties: { part: { ...change.part, state: { ...change.part.state, status: 'completed', output: 'Den godkendte ændring er anvendt lokalt.' } } } }, { ...record.stage, root: record.root });
    }
  }
  async recoverStage(pending, { allowPublication = true } = {}) {
    if (!this.journal || !pending || !/^[a-f0-9-]{36}$/.test(pending.partitionID || '')) throw unretired();
    if (this.#active.size || this.#pending.size || this.#closed || this.assertCurrent() !== true) throw stale();
    const partition = path.join(this.directory, pending.partitionID), markerFile = path.join(partition, 'active-run.json');
    const state = await this.journal.read(pending.partitionID);
    let marker; try { marker = await stableFile(markerFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!state || state.status === 'acknowledged') {
      if (marker) throw unretired();
      return null;
    }
    if (state.stageID !== pending.stageID || state.taskID !== pending.taskID || state.binding !== (pending.recoveryBinding || this.getAuthoritySnapshot(pending.scope))) throw stale();
    // Only a durable host attestation written after native zero-writer ACK can
    // recover a crash between revocation and removing the exclusive marker.
    if (['started', 'result'].includes(state.status)) throw unretired();
    if (marker) {
      let value; try { value = JSON.parse(marker.bytes); } catch { throw unretired(); }
      if (value.run !== state.transactionID || value.partition !== pending.partitionID) throw unretired();
      await this.clearRunMarker({ markerFile, markerBytes: marker.bytes });
    }
    const selected = new Set((pending.references || []).map(file => file.path));
    const check = () => { if (this.#closed || this.assertCurrent() !== true || state.binding !== (pending.recoveryBinding || this.getAuthoritySnapshot(pending.scope))) throw stale(); };
    check();
    if (state.status === 'retired') {
      if ((await projectSnapshot(this.projectRoot, selected)).fingerprint !== state.hostBasis.fingerprint) throw stale();
      const before = await engineSnapshot(path.join(partition, 'engine-before'));
      if (before.fingerprint !== state.engineFingerprint) throw unretired();
      check(); await replaceEngine(path.join(partition, 'engine'), before);
      await this.journal.finish(pending.partitionID, state.transactionID, { outcome: 'rolled-back', hostAfter: state.hostBasis });
    } else if (state.status === 'publication') {
      if (!allowPublication) throw stale();
      // The whole approved write-set was frozen before its first write. A
      // crash can leave each entry only at its exact before or after value.
      // Never rerun an engine/tool or overwrite a third-party modification.
      const actual = await projectSnapshot(this.projectRoot, selected), expected = new Map(state.hostBasis.files.map(file => [file.path, file]));
      const directories = new Map(state.hostBasis.directories.map(directory => [directory.path, directory.mode])), remaining = [];
      for (const change of state.publication.changes) {
        check();
        const current = actual.files.get(change.name), dir = actual.directories.get(change.name);
        if (change.kind === 'directory') {
          if (current || dir !== undefined && dir !== change.mode) throw stale();
          if (dir === undefined) remaining.push(change); else directories.set(change.name, change.mode);
        } else {
          const before = (current?.sha256 ?? null) === change.before && (!current || current.mode === change.beforeMode);
          const after = (current?.sha256 ?? null) === change.after && (!current || current.mode === change.mode);
          if (dir !== undefined || !before && !after) throw stale();
          if (after) { if (current) expected.set(change.name, { path: change.name, sha256: current.sha256, mode: current.mode }); else expected.delete(change.name); }
          else remaining.push(change);
        }
      }
      if (actual.identity !== state.hostBasis.identity || actual.files.size !== expected.size || [...actual.files].some(([name, file]) => expected.get(name)?.sha256 !== file.sha256 || expected.get(name)?.mode !== file.mode)) throw stale();
      const parents = new Set(state.publication.changes.flatMap(change => change.name.split('/').slice(0, -1).map((_, i) => change.name.split('/').slice(0, i + 1).join('/'))));
      for (const [name, mode] of directories) if (actual.directories.get(name) !== mode) throw stale();
      for (const [name, mode] of actual.directories) if (!directories.has(name) && (!parents.has(name) || mode !== 0o700)) throw stale();
      for (const change of remaining) {
        check(); const file = path.join(this.projectRoot, change.name); let parent = this.projectRoot;
        for (const component of change.name.split('/').slice(0, -1)) {
          parent = path.join(parent, component);
          if (!fsSync.existsSync(parent)) fsSync.mkdirSync(parent, { mode: 0o700 });
          const stat = fsSync.lstatSync(parent); if (!stat.isDirectory() || stat.isSymbolicLink() || fsSync.realpathSync(parent) !== parent) throw stale();
        }
        const latest = await projectSnapshot(this.projectRoot, selected); check();
        const current = latest.files.get(change.name);
        if ((current?.sha256 ?? null) !== change.before || current && current.mode !== change.beforeMode) throw stale();
        if (change.kind === 'directory') fsSync.mkdirSync(file, { mode: change.mode });
        else if (change.after === null) fsSync.unlinkSync(file);
        else {
          const temporary = path.join(parent, '.aura-privacy-' + randomUUID() + '.tmp');
          try { fsSync.writeFileSync(temporary, Buffer.from(change.base64, 'base64'), { flag: 'wx', mode: change.mode }); syncFileSync(temporary); check(); fsSync.renameSync(temporary, file); }
          finally { try { fsSync.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
        }
        for (let directory = parent; contains(this.projectRoot, directory); directory = path.dirname(directory)) { syncDirectorySync(directory); if (directory === this.projectRoot) break; }
        this.onApplied(change.name, change.after === null ? null : Buffer.from(change.base64, 'base64'), pending);
      }
      check(); await this.journal.finish(pending.partitionID, state.transactionID, { outcome: 'completed', hostAfter: descriptor(await projectSnapshot(this.projectRoot, selected)) });
    }
    const finished = await this.journal.read(pending.partitionID); check();
    if (finished.status !== 'finished' || (await projectSnapshot(this.projectRoot, selected)).fingerprint !== finished.hostAfter.fingerprint) throw stale();
    return finished;
  }
  async acknowledgeStage(stage) {
    if (!this.journal) return;
    const state = await this.journal.read(stage.partitionID);
    if (state?.status === 'acknowledged') return;
    if (!state || state.stageID !== stage.stageID || state.taskID !== stage.taskID || state.status !== 'finished') throw unretired();
    await this.journal.acknowledge(stage.partitionID, state.transactionID);
  }
  release(lease) {
    const record = this.#leases.get(lease); if (!record) return Promise.reject(fail());
    if (record.cleanup) return record.cleanup;
    record.retiring = true;
    record.cleanup = (async () => {
      let writersStopped = !record.started;
      try {
        if (record.started) {
          await record.launchPreparing;
          const retired = await record.isolation?.dispose();
          if (retired?.writersStopped !== true || retired.matchingProcesses !== 0) throw fail();
          writersStopped = true;
        }
        if (this.journal && record.journaled) await this.journal.retired(record.stage.partitionID, record.transactionID);
        if (!record.stage.signal?.aborted && !this.#closed) await this.publish(record);
        if (this.journal && record.journaled) {
          const state = await this.journal.read(record.stage.partitionID);
          const completed = !!state.publication || record.success && !record.stage.signal?.aborted && !this.#closed;
          if (!completed) {
            const before = await engineSnapshot(path.join(path.dirname(record.directory), 'engine-before'));
            if (before.fingerprint !== state.engineFingerprint) throw fail();
            await replaceEngine(record.directory, before);
          }
          await this.journal.finish(record.stage.partitionID, record.transactionID, { outcome: completed ? 'completed' : 'rolled-back', hostAfter: descriptor(await projectSnapshot(this.projectRoot, record.selected)) });
        }
      } finally {
        try { if (writersStopped) await this.clearRunMarker(record); }
        finally { record.active = false; this.#active.delete(lease); }
      }
    })(); return record.cleanup;
  }
  close() {
    if (this.#closing) return this.#closing; this.#closed = true;
    this.#closing = (async () => { await Promise.allSettled([...this.#pending]); const results = await Promise.allSettled([...this.#active].map(lease => this.release(lease))); if (results.some(result => result.status === 'rejected')) throw fail(); })();
    return this.#closing;
  }
}
module.exports = { HybridSeatbeltWorkspaces, projectSnapshot, excluded, descriptor, preserveLegacyEngine };
