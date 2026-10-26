// SPDX-License-Identifier: EUPL-1.2
'use strict';

const path = require('node:path');
const { OpenCodeEngine } = require('../engine.cjs');
const { HybridCoordinator } = require('./hybrid.cjs');
const { HybridEngineExecutor } = require('./hybrid-engine-executor.cjs');
const { HybridSessionStore } = require('./hybrid-session-store.cjs');
const { PrivacyGateError, snapshot } = require('./policy.cjs');

// Main-only composition of the real motor, exact-body gateway, separately
// persisted histories and OS worker launcher. This is NOT the product-wide D3
// capability: native IDE/preview/export routes must be integrated and qualified
// separately before PrivacyService may advertise hybrid/full isolation.
class HybridRuntime {
  #stages = new WeakSet();
  #leaseStages = new WeakMap();
  #runs = new Map();
  #closed = false;
  #closing = null;
  constructor({ directory, projectRoot, node, opencode, guardian, isolation, scope, localRef, externalRef,
    getPolicy, getAuthoritySnapshot, getRequestProvenance, resolveDestination, resolveSelection, gate, planForRun, authorizeStage, assertCurrent, resolveLocalChoice,
    encrypt, decrypt, workspaceFactory, createEngine = options => new OpenCodeEngine(options), createGateway, closeAfterStage = false, cleanupTimeoutMs = 5000, requestPermission, answerQuestion, onEvent, audit, beforeDispatch, remaining, now = Date.now } = {}) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory) || typeof planForRun !== 'function' || typeof authorizeStage !== 'function'
      || typeof assertCurrent !== 'function' || typeof workspaceFactory !== 'function' || typeof createEngine !== 'function' || !scope || typeof scope.root !== 'string') throw new TypeError('Hybrid runtime requires a trusted scope, execution plan and approval authority.');
    this.scope = Object.freeze(snapshot(scope)); this.localRef = Object.freeze(snapshot(localRef)); this.externalRef = externalRef === undefined ? undefined : Object.freeze(snapshot(externalRef));
    Object.assign(this, { planForRun, assertCurrent });
    const makeWorkspace = workspaceFactory;
    this.workspaces = makeWorkspace({ directory: path.join(directory, 'workers'), projectRoot, node, opencode, guardian, isolation,
      validateStage: stage => this.#stages.has(stage), assertCurrent, encrypt, decrypt });
    this.sessionStore = new HybridSessionStore({ directory: path.join(directory, 'sessions'), encrypt, decrypt });
    this.executor = new HybridEngineExecutor({ resolveSelection, closeAfterStage, cleanupTimeoutMs,
      authorizeStage: async stage => !this.#closed && this.#stages.has(stage) && await authorizeStage(stage) === true,
      preparePartition: async (stage, details) => {
        if (!this.#stages.has(stage)) throw new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Hybridtrinnet mangler en betroet arbejdsplan.');
        const lease = await this.workspaces.preparePartition(stage, details); this.#leaseStages.set(lease, stage); return lease;
      },
      validateLease: (lease, stage) => this.workspaces.validateLease(lease, stage),
      releaseLease: lease => this.workspaces.release(lease),
      completePartition: (lease, stage, result) => this.workspaces.complete?.(lease, stage, result),
      recordPermission: (lease, properties, answer) => this.workspaces.recordPermission?.(lease, properties, answer),
      createEngine: async (options, lease) => {
        const stage = this.#leaseStages.get(lease);
        const launch = await this.workspaces.engineOptions(lease, stage);
        return createEngine({ ...options, ...launch }, lease);
      }, requestPermission, answerQuestion, onEvent, assertCurrent, beforeDispatch, remaining, ...(createGateway ? { createGateway } : {}) });
    this.coordinator = new HybridCoordinator({ getPolicy, getAuthoritySnapshot, getRequestProvenance, resolveDestination, gate, sessionStore: this.sessionStore, now, audit, resolveLocalChoice,
      onLocalChoice: chosen => onEvent?.({ type: 'privacy.local-processing', properties: { connectionID: chosen.ref.connectionID, model: chosen.selection?.model?.name || chosen.ref.modelID, locality: 'device' } }, { kind: 'local', destinationRef: chosen.ref }),
      ...(typeof this.workspaces.recoverStage === 'function' ? { recoverStage: (stage, options) => this.workspaces.recoverStage(stage, options), acknowledgeStage: stage => this.workspaces.acknowledgeStage(stage) } : {}),
      executeStage: async stage => { this.#stages.add(stage); return this.executor.execute(stage); } });
  }
  async run({ taskID, originalPrompt, sourceProvenance = [], materials = [], revision, signal, requireExistingSession = false } = {}) {
    if (this.#closed) throw new PrivacyGateError('PRIVACY_ABORTED', 'Hybridarbejdet er lukket.');
    if (typeof taskID !== 'string' || !taskID || taskID.length > 200 || this.#runs.size) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridarbejdet har allerede en aktiv opgave.');
    // Own cancellation before the first planner await. Stop cannot rely solely
    // on the coordinator, which does not yet know a task being prepared here.
    const controller = new AbortController(), own = { controller };
    const aborted = () => controller.abort();
    signal?.addEventListener('abort', aborted, { once: true }); if (signal?.aborted) controller.abort();
    this.#runs.set(taskID, own);
    const check = () => { if (this.#closed || controller.signal.aborted || this.#runs.get(taskID) !== own) throw new PrivacyGateError('PRIVACY_ABORTED', 'Hybridopgaven er stoppet.'); };
    let interrupted;
    const stopped = new Promise((_resolve, reject) => { interrupted = () => reject(new PrivacyGateError('PRIVACY_ABORTED', 'Hybridopgaven er stoppet.')); controller.signal.addEventListener('abort', interrupted, { once: true }); });
    void stopped.catch(() => {});
    // The planner is trusted application code, not an LLM's routing suggestion
    // or renderer-supplied list of commands/paths/privilege levels.
    try {
      check();
      const stages = await Promise.race([this.planForRun(Object.freeze({ taskID, revision, signal: controller.signal })), stopped]);
      check();
      return await this.coordinator.run({ scope: this.scope, taskID, originalPrompt, sourceProvenance, materials,
        localRef: this.localRef, externalRef: this.externalRef, revision, stages, signal: controller.signal, requireExistingSession,
        assertCurrent: details => { check(); return this.assertCurrent(details); } });
    } finally {
      signal?.removeEventListener('abort', aborted); controller.signal.removeEventListener('abort', interrupted);
      if (this.#runs.get(taskID) === own) this.#runs.delete(taskID);
    }
  }
  stop(taskID) { this.#runs.get(taskID)?.controller.abort(); this.coordinator.stop(taskID); }
  async close() {
    if (this.#closing) return this.#closing;
    this.#closed = true; for (const own of this.#runs.values()) own.controller.abort(); this.coordinator.dispose();
    this.#closing = (async () => { try { await this.executor.dispose(); } finally { await this.workspaces.close(); } })();
    return this.#closing;
  }
}

module.exports = { HybridRuntime };
