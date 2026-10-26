// SPDX-License-Identifier: EUPL-1.2
// Trusted application adapter. Renderers select a scope, never a filesystem root,
// organization policy, destination identity, payload, or approval fingerprint.
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { randomUUID, randomBytes, createHmac, createHash } = require('node:crypto');
const { PrivacyGate, PrivacyGateError, composePolicy, inheritClassification, inspectRequest, takeLocalChoice } = require('./privacy/index.cjs');
const { stable, validateDestination } = require('./privacy/policy.cjs');

// A profile has multiple workbenches, all of which share these files. A queue
// per PrivacyService would lose audit records and race monotonic floor writes.
const profileQueues = new Map();
const digest = value => createHash('sha256').update(value).digest('hex');
const controlFailed = () => new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Privacy Gate-grundlaget kunne ikke bekræftes. Ingen data er sendt.');
const unique = items => [...new Map(items.map(item => [stable(item), structuredClone(item)])).values()];
function queued(key, run) {
  const previous = profileQueues.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(run); profileQueues.set(key, task);
  void task.finally(() => { if (profileQueues.get(key) === task) profileQueues.delete(key); }).catch(() => {});
  return task;
}

const MODES = ['local', 'cloud-controlled', 'hybrid'];
const CLASSES = ['public', 'internal', 'confidential', 'strict'];
const METHODS = { privacyGet: 'privacy:get', privacyConfigure: 'privacy:configure', privacyReview: 'privacy:review', privacyDecide: 'privacy:decide' };
function configuredDestinationIds(state, scope, before, registered) {
  const previouslyAllowed = composePolicy(before).allowedDestinationIds || (scope.chat ? before.conversation?.allowedDestinationIds : before.project?.allowedDestinationIds) || before.project?.allowedDestinationIds || [];
  return [...new Set([...state.connections.map(item => item.id), ...previouslyAllowed.filter(id => Object.hasOwn(registered, id) && registered[id] && typeof registered[id] === 'object' && !Array.isArray(registered[id]))])];
}
class PrivacyService {
  constructor(workbench, { now = Date.now } = {}) {
    this.bench = workbench; this.now = now; this.pending = new Map(); this.auditQueue = Promise.resolve(); this.bindingKey = randomBytes(32);
    this.directory = path.join(workbench.store.root, 'privacy');
    this.gate = new PrivacyGate({ getPolicy: scope => this.policies(scope), resolveDestination: ref => this.destination(ref), requestApproval: (review, options) => this.requestApproval(review, options), audit: entry => this.audit(entry), now });
  }
  boundChat(id) {
    if (typeof id !== 'string' || !id) throw new Error('Åbn en samtale først.');
    const chat = typeof this.bench.chatFor === 'function' ? this.bench.chatFor(id) : this.bench.chats.get(id) || (this.bench.chat?.id === id ? this.bench.chat : null);
    if (!chat || chat.id !== id) throw new Error('Samtalen er ikke åben længere.');
    return chat;
  }
  scope(input = {}, trustedChatID) {
    const kind = input.scope || (this.bench.project ? 'project' : 'idea');
    if (!['project', 'conversation', 'idea'].includes(kind)) throw new Error('Vælg projektet, samtalen eller idéhjælpen.');
    if (kind !== 'idea' && !this.bench.project) throw new Error('Åbn et projekt først.');
    // The second argument is supplied only by the main-process IPC context.
    // Fields in the renderer's settings object cannot retarget this scope.
    const chat = kind === 'conversation' ? trustedChatID === undefined ? this.bench.chat : this.boundChat(trustedChatID) : null;
    if (kind === 'conversation' && !chat) throw new Error('Åbn en samtale først.');
    return Object.freeze({ kind, root: kind === 'idea' ? null : this.bench.project.root, chat: chat?.id || null });
  }
  privateDirectorySync(directory = this.directory, create = false) {
    const root = path.resolve(this.bench.store.root), relative = path.relative(root, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw controlFailed();
    if (process.platform === 'win32') {
      // POSIX ownership/mode bits do not attest Windows ACLs. Ordinary profiles
      // may continue only when no private storage or protection metadata exists.
      // Existing/unknown private material still requires qualified protection.
      const privateRelative = path.relative(this.directory, directory);
      if (create || relative && (privateRelative.startsWith('..') || path.isAbsolute(privateRelative))) throw controlFailed();
      const absent = this.unprotectedWindowsProfileSync();
      if (!relative) return absent.canonical;
      throw absent.missing;
    }
    const rootStat = fsSync.lstatSync(root);
    // Existing Electron profiles may be readable (0755); private descendants
    // must be 0700, and the profile root must never be writable by others.
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid?.() || rootStat.mode & 0o022) throw controlFailed();
    const canonical = fsSync.realpathSync(root); let current = root;
    for (const component of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, component);
      let stat;
      try { stat = fsSync.lstatSync(current); }
      catch (error) { if (error.code !== 'ENOENT' || !create) throw error; fsSync.mkdirSync(current, { mode: 0o700 }); stat = fsSync.lstatSync(current); }
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || stat.mode & 0o077 || fsSync.realpathSync(current) !== path.join(canonical, path.relative(root, current))) throw controlFailed();
    }
    return fsSync.realpathSync(directory);
  }
  unprotectedWindowsProfileSync() {
    if (process.platform !== 'win32') throw controlFailed();
    try {
      const root = path.resolve(this.bench.store.root), before = fsSync.lstatSync(root), canonical = fsSync.realpathSync(root);
      if (!before.isDirectory() || before.isSymbolicLink()) throw controlFailed();
      const absent = () => {
        try { fsSync.lstatSync(this.directory); }
        catch (error) { if (error.code === 'ENOENT') return error; throw error; }
        throw controlFailed();
      };
      absent();
      const file = path.join(root, 'settings.json'); let stat;
      try { stat = fsSync.lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (stat) {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2_000_000) throw controlFailed();
        const bytes = fsSync.readFileSync(file), after = fsSync.lstatSync(file), state = JSON.parse(bytes.toString('utf8'));
        if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1 || after.ino !== stat.ino || after.dev !== stat.dev || after.size !== stat.size || bytes.length !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) throw controlFailed();
        const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const absentMetadata = value => value === undefined || object(value) && Object.keys(value).length === 0;
        // Check the whole profile: a disabled policy or an unrelated retained
        // floor is not evidence that previously protected material is absent.
        if (!object(state) || state.version !== 1 || !Array.isArray(state.connections) || !object(state.projects) || !absentMetadata(state.privacyIdea) || !absentMetadata(state.privacyHistoryFloors) || Object.values(state.projects).some(project => !object(project) || !absentMetadata(project.privacy))) throw controlFailed();
      }
      const after = fsSync.lstatSync(root), missing = absent();
      if (!after.isDirectory() || after.isSymbolicLink() || after.ino !== before.ino || after.dev !== before.dev || fsSync.realpathSync(root) !== canonical) throw controlFailed();
      return { canonical, missing };
    } catch { throw controlFailed(); }
  }
  floorIdentity(scope) {
    if (!scope) throw controlFailed();
    const value = { kind: scope.kind, root: scope.root ?? null, chat: scope.chat ?? null };
    if (!['idea', 'project', 'conversation'].includes(value.kind) || value.kind === 'idea' && (value.root !== null || value.chat !== null) || value.kind !== 'idea' && !path.isAbsolute(value.root || '') || value.kind === 'conversation' && (typeof value.chat !== 'string' || !value.chat) || value.kind === 'project' && value.chat !== null) throw controlFailed();
    const group = digest(JSON.stringify(value.root === null ? ['idea'] : ['project', value.root]));
    return { scope: value, group, key: group + '.' + digest(stable(value)) };
  }
  floorEntries(scope, state) {
    const identity = this.floorIdentity(scope), index = state.privacyHistoryFloors || {};
    if (!index || typeof index !== 'object' || Array.isArray(index)) throw controlFailed();
    const projectKey = scope.kind === 'conversation' ? this.floorIdentity({ kind: 'project', root: scope.root, chat: null }).key : null;
    const relevant = key => key.startsWith(identity.group + '.') && (!projectKey || key === identity.key || key === projectKey);
    // A damaged settings index must not silently forget surviving history.
    // The opaque filenames carry no protected values or human project names.
    const directory = path.join(this.directory, 'history-floors');
    try {
      this.privateDirectorySync(directory);
      for (const name of fsSync.readdirSync(directory)) if (name.endsWith('.enc') && relevant(name.slice(0, -4)) && !Object.hasOwn(index, name.slice(0, -4))) throw controlFailed();
    } catch (error) { if (error.code !== 'ENOENT') throw controlFailed(); }
    const entries = Object.entries(index).filter(([key]) => relevant(key));
    if (entries.length > 2000 || entries.some(([key, value]) => !/^[a-f0-9]{64}\.[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(value))) throw controlFailed();
    return entries;
  }
  readFloorFileSync(key, expected) {
    const directory = path.join(this.directory, 'history-floors'); let fd;
    try {
      this.privateDirectorySync(directory);
      fd = fsSync.openSync(path.join(directory, key + '.enc'), fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
      const before = fsSync.fstatSync(fd);
      if (!before.isFile() || before.nlink !== 1 || before.uid !== process.getuid?.() || before.mode & 0o077 || before.size > 128000) throw controlFailed();
      const bytes = fsSync.readFileSync(fd), after = fsSync.fstatSync(fd), named = fsSync.lstatSync(path.join(directory, key + '.enc'));
      if (bytes.length !== before.size || digest(bytes) !== expected || after.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs || named.ino !== before.ino || named.dev !== before.dev || named.isSymbolicLink()) throw controlFailed();
      return bytes;
    } catch { throw controlFailed(); } finally { if (fd !== undefined) fsSync.closeSync(fd); }
  }
  async dataFloors(scope, state) {
    const floors = [];
    for (const [key, expected] of this.floorEntries(scope, state)) {
      let value;
      try { const bytes = this.readFloorFileSync(key, expected); value = JSON.parse(this.bench.store.decrypt({ secret: bytes.toString('base64') })); }
      catch { throw controlFailed(); }
      if (!value || value.version !== 1 || this.floorIdentity(value.scope).key !== key || !value.floor || typeof value.floor !== 'object' || !Array.isArray(value.protectedSources) || !Array.isArray(value.protectedValues)) throw controlFailed();
      inheritClassification({ defaultClass: 'public' }, [value.floor]);
      composePolicy({ project: { enabled: true, version: expected, protectedSources: value.protectedSources, protectedValues: value.protectedValues } });
      if (scope.kind !== 'conversation' || value.scope.kind === 'project' || value.scope.chat === scope.chat) floors.push(value);
    }
    return floors;
  }
  async ensureDataFloor(scope, provenance = [], { assertCurrent = () => true, inheritedValues = [] } = {}) {
    inheritedValues = structuredClone(inheritedValues);
    composePolicy({ project: { enabled: true, version: 'inherited-values', protectedValues: inheritedValues } });
    const identity = this.floorIdentity(scope);
    return queued(this.privateDirectorySync(this.bench.store.root) + ':privacy-floors', async () => {
      const check = () => { if (assertCurrent() !== true) throw new PrivacyGateError('PRIVACY_STALE', 'Datareglerne er ændret. Gennemgå delingen igen.'); };
      check(); const layers = await this.policies(scope), policy = composePolicy(layers); check();
      if (!policy.enabled) return false;
      // The caller supplies actual admitted/read material. A configured path
      // which an isolated cloud lane could never read does not taint that lane.
      // Generic unfiltered dispatch supplies every project source below.
      const inherited = inheritClassification(policy, provenance);
      const state = await this.bench.store.read(), floors = await this.dataFloors(scope, state); check();
      const own = floors.find(value => this.floorIdentity(value.scope).key === identity.key);
      const sourceLabels = provenance.filter(source => typeof source.path === 'string' && source.path !== '__aura_protected_history__').map(source => ({ path: source.path, ...inheritClassification({ defaultClass: 'public' }, [source]) }));
      const value = { version: 1, scope: identity.scope, floor: inheritClassification({ defaultClass: 'public' }, [...(own ? [own.floor] : []), inherited]), protectedSources: unique([...(own?.protectedSources || []), ...sourceLabels]), protectedValues: unique([...(own?.protectedValues || []), ...(policy.protectedValues || []), ...inheritedValues]) };
      if (own && stable(own) === stable(value)) return false;
      const plain = stable(value); if (Buffer.byteLength(plain) > 64000) throw controlFailed();
      let bytes; try { bytes = Buffer.from(this.bench.store.encrypt(plain), 'base64'); } catch { throw controlFailed(); }
      check(); const directory = path.join(this.directory, 'history-floors'); this.privateDirectorySync(directory, true);
      const file = path.join(directory, identity.key + '.enc'), temporary = file + '.' + randomUUID() + '.tmp';
      try {
        // Commit the required ciphertext hash before exposing bytes to a model.
        // A failed/torn write cannot silently become an unclassified history.
        await fs.writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 }); check();
        await this.bench.store.update(next => {
          check(); const index = next.privacyHistoryFloors ||= {};
          if ((index[identity.key] || null) !== (state.privacyHistoryFloors?.[identity.key] || null)) throw controlFailed();
          index[identity.key] = digest(bytes);
        });
        this.privateDirectorySync(directory); await fs.rename(temporary, file); check();
        return true;
      } finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    });
  }
  async getDataFloor(scope) {
    const floors = await this.dataFloors(scope, await this.bench.store.read());
    return floors.length ? inheritClassification({ defaultClass: 'public' }, floors.map(value => value.floor)) : null;
  }
  async prepareIdeaProjectInheritance() {
    const source = Object.freeze({ kind: 'idea', root: null, chat: null });
    const binding = this.snapshotBinding(source, '__idea_project_inheritance__');
    const current = () => {
      if (this.snapshotBinding(source, '__idea_project_inheritance__') !== binding) throw new PrivacyGateError('PRIVACY_STALE', 'Idéens dataregler er ændret. Opret projektet igen.');
      return true;
    };
    const layers = await this.policies(source), policy = composePolicy(layers); current();
    const history = await this.getDataFloor(source); current();
    const inherited = policy.enabled ? inheritClassification(policy, [...policy.protectedSources, ...(history ? [history] : [])]) : null;
    let used = false;
    return async root => {
      if (used) throw controlFailed(); used = true;
      // This capability is main-only and accepts only the newly reserved,
      // empty canonical directory. It cannot overwrite an existing project.
      if (!path.isAbsolute(root || '') || path.resolve(root) !== root || await fs.realpath(root) !== root) throw controlFailed();
      const stat = await fs.lstat(root);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform === 'win32' ? policy.enabled : stat.uid !== process.getuid?.() || stat.mode & 0o022) || (await fs.readdir(root)).length) throw controlFailed();
      current();
      if (!policy.enabled) return false;
      const privacy = { enabled: true, version: randomUUID(), workMode: policy.workMode, defaultClass: policy.defaultClass, maxClass: policy.maxClass,
        allowPersonalData: policy.allowPersonalData, allowSecrets: policy.allowSecrets, allowConfidentialRelease: policy.allowConfidentialRelease,
        requireApproval: policy.requireApproval, redact: policy.redact, approvalTtlMs: policy.approvalTtlMs,
        protectedSources: structuredClone(policy.protectedSources), ...(policy.allowedDestinationIds === null ? {} : { allowedDestinationIds: [...policy.allowedDestinationIds] }),
        ...((layers.project?.hybridPair || layers.organization?.hybridPair) ? { hybridPair: structuredClone(layers.project?.hybridPair || layers.organization?.hybridPair) } : {}) };
      await this.bench.store.update(state => {
        current(); const key = this.bench.store.projectKey(root);
        if (Object.hasOwn(state.projects, key)) throw controlFailed();
        state.projects[key] = { privacy };
      });
      current();
      // The project-wide encrypted floor covers all derived files, including
      // the starter HTML, manifest and README. Historical protected values
      // stay in ciphertext rather than being copied into settings.json.
      await this.ensureDataFloor({ kind: 'project', root, chat: null }, [...policy.protectedSources, { path: '__aura_idea_derivation__', ...inherited }], { assertCurrent: current, inheritedValues: policy.protectedValues });
      current(); return true;
    };
  }
  async privateConfig(name) {
    const file = path.join(this.directory, name);
    try {
      this.privateDirectorySync();
      const handle = await fs.open(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
      let value; try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > 65536) throw new Error(); value = JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      return value;
    } catch (error) { if (error.code === 'ENOENT') return {}; throw controlFailed(); }
  }
  async policies(scope) {
    const state = await this.bench.store.read(), organization = await this.privateConfig('organization-policy.json');
    const project = scope.root ? state.projects[this.bench.store.projectKey(scope.root)]?.privacy || {} : state.privacyIdea || {};
    const { conversations, ...base } = project;
    const floors = await this.dataFloors(scope, state);
    let inherited = base;
    if (floors.length) {
      const floor = inheritClassification({ defaultClass: base.defaultClass || 'public' }, floors.map(value => value.floor));
      // Data labels are provenance, not a global policy default: an attested
      // synthetic release in a separate cloud partition can still be public.
      // Generic dispatch/export always inherits this extra protected source.
      inherited = { ...base, enabled: true, version: digest(stable([base.version || '', floors])),
        protectedSources: unique([...(base.protectedSources || []), ...floors.flatMap(value => value.protectedSources), { path: '__aura_protected_history__', ...floor }]),
        protectedValues: unique([...(base.protectedValues || []), ...floors.flatMap(value => value.protectedValues)]) };
    }
    return { ...(Object.keys(organization).length ? { organization } : {}), ...(Object.keys(inherited).length ? { project: inherited } : {}), ...(scope.chat && conversations?.[scope.chat] ? { conversation: conversations[scope.chat] } : {}) };
  }
  async destination(ref) {
    const state = await this.bench.store.read(), connection = state.connections.find(item => item.id === ref.connectionID);
    if (!connection) throw new Error('AI-forbindelsen findes ikke længere.');
    const registry = await this.privateConfig('destinations.json'), registered = registry[connection.id];
    const endpoint = new URL(connection.kind === 'ollama' ? `${connection.baseURL}/v1` : connection.baseURL).href.replace(/\/$/, '');
    // Loopback alone does not prove local execution: it may be a forwarding proxy.
    const locality = registered && registered.endpoint === endpoint && ['device', 'organization', 'cloud'].includes(registered.locality) ? registered.locality : 'cloud';
    // Bind durable hybrid memory to the saved, already encrypted credential
    // identity. A process-random HMAC here would falsely change the recipient
    // on every normal restart and make a genuine session impossible to restore.
    // No decryption or raw credential enters this fingerprint or the audit.
    const account = createHash('sha256').update(JSON.stringify([connection.id, connection.secret || ''])).digest('hex');
    return { id: connection.id, label: connection.name || connection.kind, locality, endpoint, model: ref.modelID, account, route: ref.routeID || '', revision: JSON.stringify([connection.kind, registered?.revision || '', connection.baseURL]) };
  }
  async get(input, trustedChatID) {
    const scope = this.scope(input, trustedChatID), layers = await this.policies(scope), effective = composePolicy(layers);
    const state = await this.bench.store.read(), destinations = [];
    const stored = scope.root ? state.projects[this.bench.store.projectKey(scope.root)]?.privacy || {} : state.privacyIdea || {};
    // Host-owned history floors are enforcement metadata, never editable
    // synthetic paths inserted into the user's ordinary settings form.
    const current = (scope.kind === 'conversation' ? stored.conversations?.[scope.chat] : stored) || {};
    for (const connection of state.connections) {
      const destination = await this.destination({ connectionID: connection.id, modelID: '' });
      destinations.push({ id: connection.id, kind: connection.kind, label: connection.name || connection.kind, locality: destination.locality, models: (this.bench.catalogs?.get(connection.id) || []).map(model => ({ id: model.id, label: model.name || model.id, routes: (this.bench.routeCatalogs?.get(connection.id + '\0' + model.id) || []).map(route => ({ id: route.id, label: route.name || route.id })) })), allowed: !effective.enabled || effective.allowedDestinationIds?.includes(connection.id) === true });
    }
    const policyVersion = (effective.versions || []).map(item => `${item.layer}:${item.version}`).join(' / ');
    const safeEffective = { enabled: effective.enabled === true, workMode: effective.workMode, defaultClass: effective.defaultClass, maxClass: effective.maxClass, requireApproval: effective.requireApproval };
    const availability = await this.runtimeAvailability(scope), pair = current.hybridPair || layers.project?.hybridPair || layers.organization?.hybridPair;
    return { enabled: effective.enabled === true, settings: { enabled: current.enabled === true, workMode: current.workMode || 'cloud-controlled', defaultClass: current.defaultClass || 'internal', requireApproval: current.requireApproval === true, protectedSources: structuredClone(current.protectedSources || []), ...(pair ? { hybridPair: structuredClone(pair) } : {}) }, effective: safeEffective, scope: scope.kind, policyVersion, rulesLocked: layers.organization?.enabled === true, capabilities: { modelCallControl: true, local: true, controlledCloud: true, hybrid: availability.hybrid, isolation: availability.isolation }, rules: { classification: effective.defaultClass, protectedSources: (effective.protectedSources || []).map(source => ({ classification: source.classification, attributes: source.attributes })), approvedDestinations: effective.allowedDestinationIds || [] }, destinations, pending: [...this.pending.values()].filter(item => this.sameScope(item.scope, scope)).map(item => ({ id: item.id, expiresAt: item.review.expiresAt })) };
  }
  async runtimeAvailability(scope) {
    if (scope.kind === 'idea') return { hybrid: false, isolation: false };
    try { const value = await this.bench.privacyRuntimeProvider?.getAvailability?.(scope); return { hybrid: value?.hybrid === true && value?.isolation === true, isolation: value?.isolation === true }; }
    catch { return { hybrid: false, isolation: false }; }
  }
  sameScope(a, b) { return a?.root === b?.root && (!b?.chat || a.chat === b.chat); }
  async configure(input = {}, trustedChatID) {
    const scope = this.scope(input, trustedChatID), settings = structuredClone(input.settings);
    let hybrid = null, activationCurrent = () => true, gitActivationCurrent = () => true;
    const context = { project: this.bench.project, chat: scope.chat ? this.boundChat(scope.chat) : null }, beforeBinding = this.snapshotBinding(scope, '__privacy_settings__');
    const assertCurrent = () => { activationCurrent(); gitActivationCurrent(); let sameChat = true; try { if (scope.chat) sameChat = this.boundChat(scope.chat) === context.chat; } catch { sameChat = false; } if (this.bench.project !== context.project || !sameChat || this.bench.running || this.snapshotBinding(scope, '__privacy_settings__') !== beforeBinding || hybrid && hybrid.capability.isCurrent() !== true) throw new PrivacyGateError('PRIVACY_STALE', 'Projektet, samtalen eller datareglerne er ændret. Gennemgå indstillingerne igen.'); return true; };
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) || Object.keys(settings).some(key => !['enabled', 'workMode', 'defaultClass', 'requireApproval', 'protectedSources', 'hybridPair'].includes(key))) throw new Error('Ugyldige Privacy Gate-indstillinger.');
    if (typeof settings.enabled !== 'boolean' || !MODES.includes(settings.workMode) || !CLASSES.includes(settings.defaultClass || 'internal') || typeof settings.requireApproval !== 'boolean') throw new Error('Vælg gyldige Privacy Gate-indstillinger.');
    // Do not persist a policy and then fail while opening its unqualified
    // private storage. Windows compatibility here is strictly privacy-off.
    if (process.platform === 'win32') throw controlFailed();
    if (this.bench.running) throw new Error('Stop den aktive opgave, før du ændrer dataregler.');
    gitActivationCurrent = this.bench.privacyActivationGuard?.activation(scope.root, { enabled: settings.enabled }) || (() => true);
    if (settings.protectedSources !== undefined && (!Array.isArray(settings.protectedSources) || settings.protectedSources.length > 100 || settings.protectedSources.some(source => !source || typeof source !== 'object' || Object.keys(source).some(key => !['path', 'classification', 'attributes', 'uninspectable'].includes(key)) || typeof source.path !== 'string' || source.path.length > 512 || !source.path || path.isAbsolute(source.path) || source.path.split(/[\\/]/).some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(source.path) || !CLASSES.includes(source.classification) || source.uninspectable !== undefined && typeof source.uninspectable !== 'boolean' || source.attributes !== undefined && (!source.attributes || typeof source.attributes !== 'object' || Array.isArray(source.attributes) || Object.keys(source.attributes).some(key => !['personalData', 'secrets'].includes(key) || typeof source.attributes[key] !== 'boolean'))))) throw new Error('Vælg gyldige relative kildestier og dataklasser.');
    if (settings.hybridPair !== undefined) this.validatePair(settings.hybridPair);
    hybrid = settings.workMode === 'hybrid' ? await this.hybridSelection(scope, settings.hybridPair, undefined, { assertCurrent, configuration: true }) : null;
    assertCurrent();
    const before = await this.policies(scope), registeredExternal = await this.privateConfig('external-destinations.json');
    assertCurrent();
    if (before.organization?.enabled && !settings.enabled) throw new Error('Organisationens dataregler kan ikke slås fra i projektet.');
    const activation = await this.bench.privacyRuntimeProvider?.beforeConfigure?.(scope, {settings});
    if (typeof activation === 'function') activationCurrent = activation;
    assertCurrent();
    await this.bench.store.update(state => {
      assertCurrent();
      const key = scope.root ? this.bench.store.projectKey(scope.root) : null;
      const owner = key ? (state.projects[key] ||= {}) : state;
      const field = key ? 'privacy' : 'privacyIdea';
      const parent = owner[field] ||= {};
      const old = scope.chat ? (parent.conversations ||= {})[scope.chat] || {} : parent;
      const next = { ...old, ...settings, defaultClass: settings.defaultClass || 'internal', version: randomUUID(), allowedDestinationIds: configuredDestinationIds(state, scope, before, registeredExternal), maxClass: 'internal', allowConfidentialRelease: false, allowPersonalData: false, allowSecrets: false };
      if (scope.chat) parent.conversations[scope.chat] = next; else owner[field] = next;
      if (hybrid) owner.selection = { ...hybrid.pair.external, routeID: hybrid.pair.external.routeID || '', engineID: 'opencode' };
    }, { assertCurrent });
    this.cancelScope(scope);
    // A changed policy starts a fresh engine next time, without deleting local
    // conversation, plans, messages, approvals, or history.
    for (const chat of this.bench.chats.values()) if (scope.root === chat.project.root && (!scope.chat || scope.chat === chat.id)) { await chat.close(false); chat.prepared = null; }
    const result = await this.get({ scope: scope.kind }, scope.chat || undefined);
    if (hybrid) result.selection = { ...hybrid.pair.external, routeID: hybrid.pair.external.routeID || '', engineID: 'opencode' };
    return result;
  }
  validatePair(pair) {
    if (!pair || typeof pair !== 'object' || !['local','external'].every(key => pair[key] && typeof pair[key].connectionID === 'string' && typeof pair[key].modelID === 'string' && pair[key].connectionID && pair[key].modelID)) throw new Error('Vælg både en lokal model og en cloudmodel.');
  }
  async hybridSelection(scope, pair, input, { assertCurrent = () => true } = {}) {
    this.validatePair(pair); assertCurrent();
    const provider = this.bench.privacyRuntimeProvider;
    if (!provider?.prepareHybrid) throw new PrivacyGateError('PRIVACY_ISOLATION_UNAVAILABLE', 'Hybridarbejdet kræver et tilgængeligt isoleret arbejdsmiljø. Ingen cloudreserve er startet.');
    const capability = await provider.prepareHybrid(scope, pair); assertCurrent();
    if (capability?.isCurrent?.() !== true) throw new PrivacyGateError('PRIVACY_ISOLATION_UNAVAILABLE', 'Det isolerede arbejdsmiljø kunne ikke bekræftes.');
    return { pair: structuredClone(pair), capability };
  }
  async assertSelection(scope, input) {
    const policy = composePolicy(await this.policies(scope));
    if (!policy.enabled) return;
    const destination = await this.destination({ connectionID: input.connectionID, modelID: input.modelID || '', routeID: input.routeID || '' });
    if (policy.allowedDestinationIds === null || !policy.allowedDestinationIds.includes(destination.id)) throw new PrivacyGateError('PRIVACY_BLOCKED', 'Datareglerne tillader ikke denne modtager.');
    if (policy.workMode === 'local' && destination.locality !== 'device') throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Kun lokal kræver en dokumenteret model på denne computer. Organisationens server er en anden maskine.');
  }
  async resolveLocalChoice(cause,{scope,assertCurrent=()=>true,signal,...expected}={}) {
    const receipt=takeLocalChoice(cause,{scope,...expected});
    let resolved=false;
    const check=()=>{signal?.throwIfAborted();if(!resolved&&this.now()>=receipt.expiresAt||assertCurrent()!==true)throw new PrivacyGateError('PRIVACY_STALE','Opgaven blev ændret, før lokal behandling kunne starte.');return true;};
    check();const receiptAuthority=this.snapshotBinding(scope,receipt.destinationRef.connectionID);
    const layers=await this.policies(scope),policy=composePolicy(layers);check();
    if(!policy.enabled||policy.binding!==receipt.policyBinding||stable(await this.destination(receipt.destinationRef))!==stable(receipt.destination))throw new PrivacyGateError('PRIVACY_STALE','Den gennemgåede modtager eller dataregel blev ændret.');
    const pair=layers.conversation?.hybridPair||layers.project?.hybridPair||layers.organization?.hybridPair;
    const ref=pair?.local&&structuredClone(pair.local);
    if(!ref||typeof ref.connectionID!=='string'||!ref.connectionID||typeof ref.modelID!=='string'||!ref.modelID)throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED','Ingen godkendt lokal model er konfigureret. Vælg og kontrollér en model på denne computer. Intet er sendt til cloud.');
    check();const localBinding=this.snapshotBinding(scope,ref.connectionID),originBinding=this.snapshotBinding(scope,receipt.destinationRef.connectionID);
    const destination=validateDestination(await this.destination(ref));check();
    if(destination.locality!=='device'||!policy.allowedDestinationIds?.includes(destination.id))throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED','Den konfigurerede model skal være dokumenteret på denne computer og tilladt af datareglerne.');
    const connection=await this.bench.connection(ref.connectionID);check();
    const model=(this.bench.catalogs?.get(ref.connectionID)||[]).find(value=>value.id===ref.modelID);
    const route=ref.routeID?(this.bench.routeCatalogs?.get(ref.connectionID+'\0'+ref.modelID)||[]).find(value=>value.id===ref.routeID):undefined;
    if(!model||ref.routeID&&!route||connection.kind==='openrouter'&&!route)throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED','Kontrollér den lokale forbindelses modelkatalog, før arbejdet kan fortsætte lokalt.');
    const catalog=stable({model,route});
    if(this.snapshotBinding(scope,receipt.destinationRef.connectionID)!==receiptAuthority||composePolicy(await this.policies(scope)).binding!==receipt.policyBinding)throw new PrivacyGateError('PRIVACY_STALE','Datareglerne blev ændret under lokal overdragelse.');
    // Local dispatch may add a stricter history floor before sending originals.
    // The gate rechecks that floor; configuration/account/catalog authority
    // remains fixed, while monotonic local provenance may safely grow.
    const localConfig=this.snapshotBinding(scope,ref.connectionID,false),originConfig=this.snapshotBinding(scope,receipt.destinationRef.connectionID,false);
    if(this.snapshotBinding(scope,ref.connectionID)!==localBinding||this.snapshotBinding(scope,receipt.destinationRef.connectionID)!==originBinding)throw new PrivacyGateError('PRIVACY_STALE','Den lokale modtager blev ændret.');
    const isCurrent=()=>{check();const freshModel=(this.bench.catalogs?.get(ref.connectionID)||[]).find(value=>value.id===ref.modelID),freshRoute=ref.routeID?(this.bench.routeCatalogs?.get(ref.connectionID+'\0'+ref.modelID)||[]).find(value=>value.id===ref.routeID):undefined;
      if(this.snapshotBinding(scope,ref.connectionID,false)!==localConfig||this.snapshotBinding(scope,receipt.destinationRef.connectionID,false)!==originConfig||stable({model:freshModel,route:freshRoute})!==catalog)throw new PrivacyGateError('PRIVACY_STALE','Lokal model, konto eller dataregel blev ændret.');return true;};
    isCurrent();resolved=true;return Object.freeze({ref:Object.freeze(ref),destination:Object.freeze(destination),selection:{bench:this.bench,connection:structuredClone(connection),model:structuredClone(model),route:route?structuredClone(route):undefined},isCurrent});
  }
  async discoveryPermit(scope, connection, { kind = 'models', modelID = '' } = {}) {
    if (!['models', 'routes'].includes(kind) || typeof modelID !== 'string' || modelID.length > 200 || kind === 'routes' && (!modelID || modelID.split('/').some(part => !part || part === '.' || part === '..'))) throw controlFailed();
    const authority = this.snapshotBinding(scope, connection.id);
    const current = address => {
      if (this.snapshotBinding(scope, connection.id) !== authority) throw new PrivacyGateError('PRIVACY_STALE', 'Datareglerne eller forbindelsen er ændret. Hent kataloget igen.');
      if (address !== undefined && address !== target) throw new PrivacyGateError('PRIVACY_DESTINATION_INVALID', 'Katalogadressen svarer ikke til den valgte forbindelse.');
      return true;
    };
    const target = connection.baseURL + (kind === 'models' ? connection.kind === 'ollama' ? '/api/tags' : '/models' : '/models/' + modelID.split('/').map(encodeURIComponent).join('/') + '/endpoints');
    await this.assertSelection(scope, { connectionID: connection.id, modelID }); current();
    const saved = (await this.bench.store.read()).connections.find(item => item.id === connection.id);
    if (!saved || stable(saved) !== stable(connection)) throw new PrivacyGateError('PRIVACY_STALE', 'AI-forbindelsen er ændret. Ingen ny katalogforespørgsel er tilladt.');
    current(); return current;
  }
  async dispatch({ scope, connection, model, route, url, headers, body, signal, purpose, revision, contextPartition, provenance = [], assertCurrent = () => true }, transport = fetch) {
    const initial = this.snapshotBinding(scope, connection.id, false);
    const beforeFloor = () => { signal?.throwIfAborted(); return assertCurrent() === true && this.snapshotBinding(scope, connection.id, false) === initial; };
    const layersBefore = await this.policies(scope), policyBefore = composePolicy(layersBefore);
    let historyProvenance = [...provenance, ...(policyBefore.protectedSources || [])];
    if (policyBefore.enabled && (await this.destination({ connectionID: connection.id, modelID: model.id, routeID: route?.id || '' })).locality === 'device') {
      // A local model sees original data. Its later summary keeps detection
      // labels even if it no longer repeats the original private values.
      try { const inspected = inspectRequest(body, { ...policyBefore, allowPersonalData: true, allowSecrets: true }); historyProvenance.push({ classification: policyBefore.defaultClass, attributes: { personalData: !!inspected.hasPersonalData, secrets: !!inspected.hasSecrets } }, ...inspected.visibleSources); }
      catch { historyProvenance.push({ classification: policyBefore.defaultClass, uninspectable: true }); }
    }
    await this.ensureDataFloor(scope, historyProvenance, { assertCurrent: beforeFloor });
    const authority = this.snapshotBinding(scope, connection.id), outgoingHeaders = Object.freeze({ ...headers });
    const current = () => {
      signal?.throwIfAborted();
      if (assertCurrent() !== true || this.snapshotBinding(scope, connection.id) !== authority) throw new PrivacyGateError('PRIVACY_STALE', 'Datareglerne eller forbindelsen er ændret. Gennemgå delingen igen.');
      return true;
    };
    current();
    const saved = (await this.bench.store.read()).connections.find(item => item.id === connection.id);
    if (!saved || saved.baseURL !== connection.baseURL || saved.secret !== connection.secret || saved.kind !== connection.kind) throw new PrivacyGateError('PRIVACY_STALE', 'AI-forbindelsen er ændret. Ingen ny afsendelse er tilladt.');
    current();
    const destinationRef = Object.freeze({ connectionID: connection.id, modelID: model.id, routeID: route?.id || '' });
    const destination = await this.destination(destinationRef), target = new URL(url);
    if (!['/responses','/messages','/chat/completions'].some(suffix => target.href === destination.endpoint + suffix)) throw new PrivacyGateError('PRIVACY_DESTINATION_INVALID', 'Modeladressen svarer ikke til den valgte forbindelse.');
    const layers = await this.policies(scope);
    // Until a trusted isolated lane supplies source provenance, a complete
    // model request conservatively inherits every protected project source.
    const inherited = [...provenance, ...Object.values(layers).flatMap(layer => layer?.protectedSources || [])];
    const response = await this.gate.executeAction({ scope, destinationRef, purpose, revision, contextPartition, body, contentType: 'application/json', signal, provenance: inherited, assertCurrent: current,
      transport: checkedBody => { current(); return transport(url, { method:'POST', headers:outgoingHeaders, body:checkedBody, signal, redirect:'error' }); } });
    Object.defineProperty(response, 'privacyAssertCurrent', { value: current });
    return response;
  }
  snapshotBinding(scope, connectionID, includeFloors = true) {
    const state = this.bench.store.root && (() => { try { return JSON.parse(fsSync.readFileSync(path.join(this.bench.store.root, 'settings.json'), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return {}; throw controlFailed(); } })();
    const floors = includeFloors ? this.floorEntries(scope, state).map(([key, hash]) => [key, digest(this.readFloorFileSync(key, hash))]) : [];
    const entries = ['settings.json', 'privacy/organization-policy.json', 'privacy/destinations.json', 'privacy/hybrid-sources.json'].map(name => {
      const file = path.join(this.bench.store.root, name);
      try {
        if (name.startsWith('privacy/')) this.privateDirectorySync();
        const stat = fsSync.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error();
        const value = JSON.parse(fsSync.readFileSync(file, 'utf8'));
        if (name === 'settings.json') {
          if (value.version !== 1 || !Array.isArray(value.connections) || !value.projects || typeof value.projects !== 'object') throw new Error();
          const project = scope.root ? value.projects[this.bench.store.projectKey(scope.root)]?.privacy || {} : value.privacyIdea || {};
          const { conversations, ...base } = project;
          return [name, { features: value.features, projectSkills: scope.root ? value.projects[this.bench.store.projectKey(scope.root)]?.skills : undefined, projectFeatures: scope.root ? value.projects[this.bench.store.projectKey(scope.root)]?.features : undefined, project: base, conversation: scope.chat ? conversations?.[scope.chat] : undefined, connection: value.connections.find(item => item.id === connectionID) }];
        }
        return [name, name.endsWith('destinations.json') ? value[connectionID] : value];
      }
      catch (error) { if (error.code === 'ENOENT') return [name, null]; throw new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Privacy Gate-grundlaget kunne ikke genvalideres.'); }
    });
    return createHmac('sha256', this.bindingKey).update(JSON.stringify([entries, floors])).digest('hex');
  }
  requestApproval(review, { signal, scope } = {}) {
    signal?.throwIfAborted();
    const id = randomUUID();
    const expiresAt = Math.min(review.expiresAt || this.now() + 120000, this.now() + 120000);
    return new Promise((resolve, reject) => {
      const finish = decision => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); this.pending.delete(id); this.bench.emit({ type: 'privacy.resolved', id, decision }); resolve(decision); };
      const aborted = () => { clearTimeout(timer); this.pending.delete(id); this.bench.emit({ type: 'privacy.resolved', id, decision: 'cancel' }); reject(signal.reason || new Error('Delingen blev afbrudt.')); };
      const timer = setTimeout(() => finish('cancel'), Math.max(0, expiresAt - this.now()));
      const publicReview = { ...review, id, body: review.payload, recipient: review.destination?.label || review.destination?.id, model: review.destination?.model, policyVersion: (review.policyVersions || []).map(item => `${item.layer}:${item.version}`).join(' / '), expiresAt, allowedDecisions: ['approve', 'local', 'cancel'] };
      this.pending.set(id, { id, scope, review: publicReview, finish });
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      this.bench.emit({ type: 'privacy.review', ...publicReview });
    });
  }
  review(input = {}) {
    const item = this.pending.get(input.id);
    if (!item || item.review.expiresAt <= this.now()) throw new Error('Delingsgennemgangen er udløbet.');
    return item.review;
  }
  decide(input = {}) {
    if (!['approve', 'local', 'cancel'].includes(input.decision)) throw new Error('Vælg en gyldig delingsbeslutning.');
    const item = this.pending.get(input.id);
    if (!item || item.review.expiresAt <= this.now()) throw new Error('Delingsgennemgangen er ikke længere aktuel.');
    item.finish(input.decision); return { id: input.id, decision: input.decision };
  }
  cancelScope(scope) { for (const item of [...this.pending.values()]) if (!scope || this.sameScope(item.scope, scope)) item.finish('cancel'); }
  async audit(entry) {
    this.privateDirectorySync(this.directory, true);
    const task = queued(this.privateDirectorySync() + ':audit', async () => {
      this.privateDirectorySync();
      const file = path.join(this.directory, 'audit.jsonl');
      let lines = '';
      try { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2_000_000) throw new Error(); lines = await fs.readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw new Error('Det lokale revisionsspor kan ikke gemmes. Afsendelsen er stoppet.'); }
      const record = { at: new Date(this.now()).toISOString(), action: typeof entry.action === 'string' && /^[a-z-]{1,40}$/.test(entry.action) ? entry.action : 'model-call', decision: entry.decision, destinationId: entry.destinationId || null, locality: entry.locality, classification: entry.classification, attributes: entry.attributes, policyVersions: entry.policyVersions };
      const next = [...lines.split('\n').filter(Boolean), JSON.stringify(record)].slice(-1000).join('\n') + '\n';
      const temporary = path.join(this.directory, `audit-${randomUUID()}.tmp`);
      try { await fs.writeFile(temporary, next, { mode: 0o600, flag: 'wx' }); this.privateDirectorySync(); await fs.rename(temporary, file); }
      finally { await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
      this.bench.emit({ type: 'privacy.activity', ...record });
    });
    this.auditQueue = task.catch(() => {}); return task;
  }
}
function installPrivacyHandlers({ register, workbench }) {
  const service = workbench.privacy;
  register(METHODS.privacyGet, value => service.get(value), 'privacyGet');
  register(METHODS.privacyConfigure, value => service.configure(value), 'privacyConfigure');
  register(METHODS.privacyReview, value => service.review(value), 'privacyReview');
  register(METHODS.privacyDecide, value => service.decide(value), 'privacyDecide');
}
module.exports = { PrivacyService, installPrivacyHandlers, configuredDestinationIds, METHODS };
