// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Host-only review basis, not execution or permission authority. In particular,
// neither a loopback URL nor a familiar npm script proves process isolation.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
// Resolve lazily so DevServer can use this host-only guard without a circular
// initialization dependency. Inspection still never executes project code.
const inspect = (...args) => require('./dev-server.cjs').inspect(...args);
const { stable } = require('./privacy/policy.cjs');
const stale = () => Object.assign(new Error('Forhåndsvisningens grundlag er ændret. Gennemgå handlingen igen.'), { code: 'PREVIEW_REVIEW_STALE' });
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const ACTIONS = Object.freeze(['show-static', 'start-server', 'install-dependencies']);

async function rootIdentity(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || /[\0-\x1f\x7f]/.test(root)) throw stale();
  const stat = await fs.lstat(root), canonical = await fs.realpath(root);
  // An ancestor may be a normal OS alias (macOS /var -> /private/var). Bind its
  // resolved identity; a direct symlink project root remains disallowed.
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw stale();
  return `${canonical}:${stat.dev}:${stat.ino}`;
}

function classify({ action, project, protectedData, platform }) {
  if (protectedData) return { decision: 'protected-route-required', reason: 'Projektets dataregler kræver den særskilte beskyttede forhåndsvisning.', requiresProcessExecution: false, skipTechnicalReview: false };
  if (action === 'show-static') {
    if (project.kind !== 'static') return { decision: 'different-preview-required', reason: 'Projektet kræver en anden forhåndsvisning.', requiresProcessExecution: false, skipTechnicalReview: false };
    return { decision: 'built-in-static-candidate', reason: 'Auras indbyggede visning kan vise projektets statiske public-filer uden at starte projektkommandoer.', requiresProcessExecution: false, skipTechnicalReview: true };
  }
  if (!project.supported) return { decision: 'unsupported', reason: 'Projektets opstart kræver en særskilt opsætning.', requiresProcessExecution: false, skipTechnicalReview: false };
  if (action === 'start-server' && !project.installed) return { decision: 'dependencies-required', reason: 'Projektets afhængigheder skal gennemgås og installeres først.', requiresProcessExecution: false, skipTechnicalReview: false };
  return {
    decision: 'explicit-review-required',
    reason: platform === 'win32' ? 'En isoleret projektserver er endnu ikke kvalificeret på Windows.' : 'Projektets server og pakker kan udføre kode. Den almindelige serveropstart er ikke procesisoleret.',
    requiresProcessExecution: true, skipTechnicalReview: false
  };
}

class PreviewStartupReview {
  #records = new Map();
  #generation = 0;
  constructor({ getPolicy, getRuntimeConfig = async () => ({}), inspectProject = inspect, platform = process.platform, now = Date.now, ttlMs = 120_000 } = {}) {
    if (typeof getPolicy !== 'function' || typeof getRuntimeConfig !== 'function' || typeof inspectProject !== 'function' || typeof now !== 'function' || !Number.isSafeInteger(ttlMs) || ttlMs < 1 || ttlMs > 300_000) throw new TypeError('A trusted preview policy reader is required.');
    Object.assign(this, { getPolicy, getRuntimeConfig, inspectProject, platform, now, ttlMs });
  }
  async basis(root, action) {
    if (!ACTIONS.includes(action)) throw new TypeError('Unknown preview action.');
    const identity = await rootIdentity(root);
    const policy = await this.getPolicy(root);
    if (!policy || typeof policy.active !== 'boolean' || typeof policy.revision !== 'string' || !policy.revision || policy.revision.length > 256) throw stale();
    const policySnapshot = stable(policy), config = await this.getRuntimeConfig(root), configSnapshot = stable(config);
    const project = await this.inspectProject(root, config);
    if (typeof project?.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(project.fingerprint)) throw stale();
    const latestPolicy = await this.getPolicy(root);
    if (await rootIdentity(root) !== identity || stable(latestPolicy) !== policySnapshot || stable(await this.getRuntimeConfig(root)) !== configSnapshot) throw stale();
    // Bind only trusted policy/configuration and the inspector's control-file
    // digest. This is not a digest of every dependency or generated app byte.
    return { projectFingerprint: project.fingerprint, fingerprint: hash({ identity, action, policy: policySnapshot, config: configSnapshot, project: { fingerprint: project.fingerprint, kind: project.kind, supported: project.supported, installed: project.installed }, platform: this.platform }),
      classification: classify({ action, project, protectedData: policy.active, platform: this.platform }) };
  }
  async prepare(root, action) {
    const generation = this.#generation;
    const basis = await this.basis(root, action), id = randomUUID(), expiresAt = this.now() + this.ttlMs;
    if (generation !== this.#generation) throw stale();
    for (const [key, item] of this.#records) if (item.expiresAt <= this.now()) this.#records.delete(key);
    // Bound host memory even if a buggy renderer repeatedly requests reviews.
    if (this.#records.size >= 32) throw Object.assign(new Error('Afslut den aktuelle gennemgang først.'), { code: 'PREVIEW_REVIEW_LIMIT' });
    this.#records.set(id, { root, action, fingerprint: basis.fingerprint, expiresAt });
    return Object.freeze({ id, action, fingerprint: basis.fingerprint, projectFingerprint: basis.projectFingerprint, expiresAt, ...basis.classification, authorizesExecution: false });
  }
  async consume(id) {
    const generation = this.#generation;
    const saved = this.#records.get(id); this.#records.delete(id);
    if (!saved || saved.expiresAt <= this.now()) throw stale();
    const current = await this.basis(saved.root, saved.action);
    if (generation !== this.#generation || saved.expiresAt <= this.now() || saved.fingerprint !== current.fingerprint) throw stale();
    // Callers must still use the appropriate existing approval/egress route.
    // This result deliberately carries no shell command, spawn, or bypass.
    return Object.freeze({ action: saved.action, fingerprint: current.fingerprint, ...current.classification, authorizesExecution: false });
  }
  invalidate() { ++this.#generation; this.#records.clear(); }
}

module.exports = { PreviewStartupReview, ACTIONS };
