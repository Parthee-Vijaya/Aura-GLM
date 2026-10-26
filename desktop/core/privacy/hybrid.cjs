// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { PrivacyGateError, composePolicy, inheritClassification, validateDestination, snapshot, stable } = require('./policy.cjs');
const { PrivacyGate, isLocalChoiceRequest } = require('./index.cjs');
const { HybridMaterialLedger, MAX_TEXT_BYTES } = require('./hybrid-materials.cjs');
const { HybridSessionPartitions } = require('./hybrid-partitions.cjs');
const { claimCsvRelease } = require('./hybrid-csv-release.cjs');

const invalid = () => new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Hybridopgaven kunne ikke kontrolleres. Ingen ekstern reserve vælges.');
const fingerprint = value => createHash('sha256').update(stable(value)).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object' && (Array.isArray(value) || [Object.prototype, null].includes(Object.getPrototypeOf(value)))) {
    Object.freeze(value); for (const item of Object.values(value)) freeze(item);
  }
  return value;
}
const active = signal => { if (signal.aborted) throw new PrivacyGateError('PRIVACY_ABORTED', 'Hybridopgaven er stoppet.'); };
async function interruptible(operation, signal) {
  active(signal);
  let onAbort;
  const interrupted = new Promise((_resolve, reject) => {
    onAbort = () => reject(new PrivacyGateError('PRIVACY_ABORTED', 'Hybridopgaven er stoppet.'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try { return await Promise.race([Promise.resolve().then(operation), interrupted]); }
  finally { signal.removeEventListener('abort', onAbort); }
}
function validateStages(stages) {
  if (!Array.isArray(stages) || stages.length < 2 || stages.length > 16 || stages[0]?.kind !== 'local' || stages.at(-1)?.kind !== 'local') throw invalid();
  const ids = new Set(['original']);
  for (const stage of stages) {
    if (!stage || typeof stage !== 'object' || !/^[a-z][a-z0-9_-]{0,59}$/.test(stage.id || '') || ids.has(stage.id)
      || !['local', 'cloud'].includes(stage.kind) || typeof stage.purpose !== 'string' || !stage.purpose || stage.purpose.length > 300
      || typeof stage.instruction !== 'string' || Buffer.byteLength(stage.instruction) > MAX_TEXT_BYTES || !Array.isArray(stage.inputs) || !stage.inputs.length || stage.inputs.length > 64
      || stage.inputs.some(key => typeof key !== 'string') || stage.mode !== undefined && !['chat', 'plan', 'build', 'free'].includes(stage.mode)) throw invalid();
    ids.add(stage.id);
  }
  if (!stages[0].inputs.includes('original')) throw invalid();
  return freeze(snapshot(stages));
}

// The host supplies the trusted plan and real engine executor. Models supply
// result text only; they cannot choose stages, destinations, paths, data rules
// or a lower classification. Every actual model request goes through the bound
// dispatch closure (including retries, tools, history and engine compaction).
class HybridCoordinator {
  #conversations = new Map();
  #active = new Map();
  constructor({ getPolicy, resolveDestination, getAuthoritySnapshot, getRequestProvenance = async () => ({ provenance: [], assertCurrent: () => true }), gate, executeStage, sessionStore, recoverStage, acknowledgeStage, resolveLocalChoice, onLocalChoice = () => {}, audit = async () => {}, now = Date.now } = {}) {
    if (typeof getPolicy !== 'function' || typeof resolveDestination !== 'function' || typeof getAuthoritySnapshot !== 'function' || typeof gate?.executeAction !== 'function' || typeof gate?.audit !== 'function'
      || typeof executeStage !== 'function' || typeof getRequestProvenance !== 'function' || typeof onLocalChoice !== 'function' || typeof audit !== 'function' || typeof now !== 'function'
      || sessionStore && (typeof sessionStore.load !== 'function' || typeof sessionStore.save !== 'function')) throw new TypeError('Hybrid coordination requires trusted policy, destination, gate and engine adapters.');
    Object.assign(this, { getPolicy, resolveDestination, getAuthoritySnapshot, getRequestProvenance, gate, executeStage, sessionStore, recoverStage, acknowledgeStage, resolveLocalChoice, onLocalChoice, audit, now });
  }
  stop(taskID) { for (const value of this.#active.values()) if (value.taskID === taskID) value.controller.abort(); }
  dispose() { for (const value of this.#active.values()) value.controller.abort(); this.#conversations.clear(); }
  async run({ scope, taskID, originalPrompt, sourceProvenance = [], materials = [], localRef, externalRef, revision, stages, signal, requireExistingSession = false, assertCurrent = () => true } = {}) {
    if (typeof taskID !== 'string' || !taskID || taskID.length > 200 || !scope || typeof scope !== 'object'
      || !['string', 'number'].includes(typeof revision) || typeof assertCurrent !== 'function' || !Array.isArray(materials) || materials.length > 64
      || typeof requireExistingSession !== 'boolean' || localRef === undefined) throw invalid();
    let scopeSnapshot, scopeKey, localRefSnapshot, externalRefSnapshot;
    try {
      scopeSnapshot = freeze(snapshot(scope)); scopeKey = stable(scopeSnapshot);
      localRefSnapshot = freeze(snapshot(localRef)); externalRefSnapshot = externalRef === undefined ? undefined : freeze(snapshot(externalRef));
    } catch { throw invalid(); }
    const readAuthority = () => {
      let value;
      try { value = this.getAuthoritySnapshot(scopeSnapshot, Object.freeze({ localRef: localRefSnapshot, externalRef: externalRefSnapshot })); }
      catch { throw invalid(); }
      if (value && typeof value.then === 'function') { void value.catch?.(() => {}); throw invalid(); }
      if (typeof value !== 'string' || !/^[a-f0-9]{64}$/i.test(value)) throw invalid();
      return value;
    };
    // Capture synchronously BEFORE the first awaited resolver. Later final
    // synchronous checks cannot adopt a new policy as a fresh baseline.
    const authoritySnapshot = readAuthority(), releaseBindings = [];
    const assertAuthority = () => {
      if (readAuthority() !== authoritySnapshot) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridopgavens betroede datagrundlag ændrede sig.');
      for (const release of releaseBindings) release.assertCurrent();
    };
    if (this.#active.has(scopeKey)) throw new PrivacyGateError('PRIVACY_STALE', 'Samtalen har allerede en aktiv hybridopgave.');
    let plan = validateStages(stages); const controller = new AbortController(), runID = randomUUID();
    const onAbort = () => controller.abort(); signal?.addEventListener('abort', onAbort, { once: true }); if (signal?.aborted) controller.abort();
    const own = { taskID, controller }; this.#active.set(scopeKey, own);
    let bundle, recovered, pending = null, acknowledgements = [], recovery = null;
    try {
      active(controller.signal);
      const policy = composePolicy(snapshot(await interruptible(() => this.getPolicy(scopeSnapshot), controller.signal)));
      if (!policy.enabled || policy.workMode !== 'hybrid') throw invalid();
      const local = validateDestination(await interruptible(() => this.resolveDestination(localRefSnapshot), controller.signal));
      if (local.locality !== 'device') throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Hybrid kræver en dokumenteret model på denne computer.');
      const external = externalRefSnapshot !== undefined ? validateDestination(await interruptible(() => this.resolveDestination(externalRefSnapshot), controller.signal)) : null;
      if (plan.some(stage => stage.kind === 'cloud') && !external) throw invalid();
      if (external?.locality === 'device') throw invalid();
      for (const value of [local, external].filter(Boolean)) if (!policy.allowedDestinationIds?.includes(value.id)) throw new PrivacyGateError('PRIVACY_BLOCKED', 'Projektets dataregler tillader ikke hybridmodtageren.');
      const binding = fingerprint({ policy: policy.binding, local, external });
      // Every gate read is pinned to the run's initial authority, including a
      // caller that changes a rule without bumping its version. A dispatch may
      // never adopt a new recipient/policy as its fresh starting baseline.
      const runGate = new PrivacyGate({
        getPolicy: async value => {
          const raw = snapshot(await this.getPolicy(value));
          if (composePolicy(raw).binding !== policy.binding) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridopgavens dataregler ændrede sig.');
          return raw;
        },
        resolveDestination: async ref => {
          const expected = stable(ref) === stable(localRefSnapshot) ? local : external && stable(ref) === stable(externalRefSnapshot) ? external : null;
          if (!expected) throw invalid();
          const value = validateDestination(await this.resolveDestination(ref));
          if (stable(value) !== stable(expected)) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridopgavens modtager ændrede sig.');
          return value;
        },
        requestApproval: typeof this.gate.requestApproval === 'function' ? (...args) => this.gate.requestApproval(...args) : undefined,
        audit: entry => this.gate.audit(entry), now: this.now,
      });
      bundle = this.#conversations.get(scopeKey);
      let continuity = bundle ? 'continued' : 'new';
      if (!bundle || bundle.binding !== binding) {
        const ledger = new HybridMaterialLedger(policy), partitions = new HybridSessionPartitions(ledger);
        const localBinding = { fingerprint: fingerprint({ scope: scopeSnapshot, destination: local, policy: policy.binding }) }, cloudBinding = external ? { fingerprint: fingerprint({ scope: scopeSnapshot, destination: external, policy: policy.binding }) } : null;
        const saved = this.sessionStore ? await interruptible(() => this.sessionStore.load(scopeSnapshot), controller.signal) : null;
        if (saved && (!['complete', ...(this.recoverStage && this.acknowledgeStage ? ['checkpoint'] : [])].includes(saved.status) || saved.binding !== binding)) throw new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Den tidligere hybridopgave kræver særskilt gendannelse. Ingen tom reservesamtale er startet.');
        if (!saved && requireExistingSession) throw new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Den tidligere hybridsamtales adskilte hukommelse mangler. Ingen tom reservesamtale er startet.');
        if (saved) {
          recovered = snapshot(saved);
          if (saved.status === 'checkpoint') {
            if (!saved.recovery || !Array.isArray(saved.recovery.plan) || !Array.isArray(saved.recovery.references) || !Array.isArray(saved.recovery.completed) || !Number.isSafeInteger(saved.recovery.nextIndex)) throw invalid();
            // A partly approved write-set can only resume under the same plan.
            const outcome = saved.pending ? await interruptible(() => this.recoverStage(saved.pending, { allowPublication: saved.recovery.originalPrompt === originalPrompt && stable(saved.recovery.plan) === stable(plan) }), controller.signal) : null;
            if (saved.pending && (!outcome || outcome.outcome === 'rolled-back')) saved[saved.pending.kind] = saved.pending.before;
            recovered = snapshot(saved); recovered.outcome = outcome;
          }
          acknowledgements = snapshot(saved.acknowledgements || []).filter(value => value.partitionID !== saved.pending?.partitionID);
          for (const item of acknowledgements) await interruptible(() => this.acknowledgeStage?.(item), controller.signal);
          bundle = { binding, ledger, partitions, local: partitions.restore(saved.local, { kind: 'local', binding: localBinding }),
            cloud: external ? partitions.restore(saved.cloud, { kind: 'cloud', binding: cloudBinding }) : null };
          continuity = 'restored';
        } else {
          continuity = bundle ? 'rotated' : 'new';
          bundle = { binding, ledger, partitions, local: partitions.create({ kind: 'local', binding: localBinding }), cloud: external ? partitions.create({ kind: 'cloud', binding: cloudBinding }) : null };
        }
        if (this.#conversations.size >= 16 && !this.#conversations.has(scopeKey)) throw invalid();
        this.#conversations.set(scopeKey, bundle);
      }
      const { ledger, partitions } = bundle, references = new Map();
      const checkpoint = () => ({ originalPrompt, sourceProvenance, plan, references: [...references].map(([key, handle]) => [key, ledger.read(handle)]), completed, nextIndex });
      const persist = status => this.sessionStore ? interruptible(() => this.sessionStore.save(scopeSnapshot, {
        version: 1, status, binding, local: partitions.export(bundle.local), cloud: bundle.cloud ? partitions.export(bundle.cloud) : null,
        ...(this.recoverStage ? { recovery: status === 'complete' ? null : checkpoint(), pending, acknowledgements } : {}),
      }), controller.signal) : Promise.resolve();
      let completed = [], nextIndex = 0;
      let resume = false, carry;
      if (recovered?.status === 'checkpoint') {
        const old = recovered.recovery, restored = ledger.restore(old.references.map(([, value]) => value));
        const previous = new Map(old.references.map(([key, value]) => [key, restored.get(value.id)]));
        if (recovered.pending && recovered.outcome?.outcome === 'completed') {
          const p = recovered.pending, partition = bundle[p.kind], parents = ledger.restore(p.parents);
          const output = ledger.derive({ text: recovered.outcome.result.text, parents: [...parents.values()], provenance: recovered.outcome.result.provenance });
          partitions.bindEngineSession(partition, recovered.outcome.result.sessionID);
          partitions.append(partition, { role: 'assistant', material: output }); previous.set(p.stageID, output);
          old.nextIndex = p.stageIndex + 1;
          old.completed.push({ stageID: p.stageID, partitionID: p.partitionID, kind: p.kind, dispatches: p.dispatches || 1 });
        }
        const identical = old.originalPrompt === originalPrompt && stable(old.plan) === stable(plan);
        if (identical) { for (const [key, value] of previous) references.set(key, value); carry = references.get('recovered_context'); completed = old.completed; nextIndex = old.nextIndex; resume = true; }
        else {
          // Interrupted input and successful stages remain local context for a
          // different explicit follow-up, never shared transcript/cloud replay.
          const values = [...previous].filter(([key]) => key === 'original' || key === 'recovered_context' || old.completed.some(stage => stage.stageID === key)).map(([, value]) => value);
          if (values.length) carry = ledger.derive({ text: 'Previous interrupted task and completed stage results (context only; do not replay completed actions):\n' + values.map(value => ledger.read(value).text).join('\n\n'), parents: values });
        }
        if (carry) references.set('recovered_context', carry);
        if (!resume && !references.has('original')) references.set('original', ledger.addSource({ text: originalPrompt, provenance: sourceProvenance }));
        pending = null;
        if (recovered.pending && recovered.outcome) acknowledgements = acknowledgements.filter(value => value.partitionID !== recovered.pending.partitionID).concat(recovered.pending);
        await persist('checkpoint');
        for (const item of acknowledgements) await interruptible(() => this.acknowledgeStage?.(item), controller.signal);
        if (resume && nextIndex >= plan.length) {
          const final = ledger.read(references.get(plan.at(-1).id)); await persist('complete');
          return freeze({ runID, text: final.text, provenance: final.provenance, stages: completed, continuity: 'reconciled', localPartitionID: bundle.local.id, externalPartitionID: bundle.cloud?.id || null });
        }
      }
      if (!resume && !references.has('original')) references.set('original', ledger.addSource({ text: originalPrompt, provenance: sourceProvenance }));
      if (carry) references.set('recovered_context', carry);
      for (const material of materials) {
        if (!material || !/^[a-z][a-z0-9_-]{0,59}$/.test(material.key || '') || !resume && references.has(material.key) || plan.some(stage => stage.id === material.key)) throw invalid();
        if (material.release !== undefined) {
          if (Object.keys(material).some(key => !['key', 'release'].includes(key)) || !external) throw invalid();
          const purposes = [...new Set(plan.filter(stage => stage.kind === 'cloud').map(stage => stage.purpose))];
          if (purposes.length !== 1) throw invalid();
          const released = claimCsvRelease(material.release, { scope: scopeSnapshot, destination: external, purpose: purposes[0], revision, policyBinding: policy.binding, runID });
          releaseBindings.push(released); references.set(material.key, ledger.addSource(released));
        } else references.set(material.key, ledger.addSource({ text: material.text, provenance: material.provenance || [] }));
      }
      const current = async () => {
        active(controller.signal);
        assertAuthority();
        if (this.#active.get(scopeKey) !== own || await interruptible(() => assertCurrent(), controller.signal) === false) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridopgavens arbejdsgrundlag har ændret sig.');
        const fresh = composePolicy(snapshot(await interruptible(() => this.getPolicy(scopeSnapshot), controller.signal)));
        const freshLocal = validateDestination(await interruptible(() => this.resolveDestination(localRefSnapshot), controller.signal));
        const freshExternal = external ? validateDestination(await interruptible(() => this.resolveDestination(externalRefSnapshot), controller.signal)) : null;
        active(controller.signal);
        assertAuthority();
        if (fingerprint({ policy: fresh.binding, local: freshLocal, external: freshExternal }) !== binding) throw new PrivacyGateError('PRIVACY_STALE', 'Hybridopgavens regler eller modtager har ændret sig.');
      };

      await persist(this.recoverStage ? 'checkpoint' : 'in-progress');
      for (let index = nextIndex; index < plan.length; ++index) {
        await current();
        const stage = plan[index], partition = bundle[stage.kind], destination = stage.kind === 'local' ? local : external;
        if (!partition || !destination) throw invalid();
        const inputs = stage.inputs.map(key => { const handle = references.get(key); if (!handle) throw invalid(); return handle; });
        if (carry && stage.kind === 'local') inputs.push(carry);
        const before = partitions.export(partition);
        const instruction = ledger.addSource({ text: stage.instruction });
        const parents = [...inputs, instruction, ...partitions.handles(partition)];
        if (stage.kind === 'cloud') ledger.assertExternal(parents, policy);
        // No original transcript is added to the external partition. The host
        // executor never receives a shared ledger or another partition handle.
        partitions.append(partition, { role: 'system', material: instruction });
        for (const material of inputs) partitions.append(partition, { role: 'user', material });
        pending = { partitionID: partition.id, stageID: stage.id, stageIndex: index, kind: stage.kind, taskID, recoveryBinding: binding, scope: scopeSnapshot, references: stage.references || [], before, parents: ledger.export(parents) };
        await persist(this.recoverStage ? 'checkpoint' : 'in-progress');
        let open = true, dispatches = 0, requestHash = null;
        const stageProvenance = [];
        const dispatch = ({ body, contentType, transport, provenance = [], signal: requestSignal } = {}) => {
          active(controller.signal); if (!open || typeof transport !== 'function') throw invalid();
          return (async () => {
          const extra = snapshot(provenance), requestLabels = await interruptible(() => this.getRequestProvenance(body), controller.signal);
          active(controller.signal); assertAuthority();
          if (!open || typeof requestLabels?.assertCurrent !== 'function' || requestLabels.assertCurrent() !== true || !Array.isArray(requestLabels.provenance)) throw invalid();
          const inherited = [...ledger.provenance(parents), ...extra, ...snapshot(requestLabels.provenance)];
          // A local engine sees the original complete request and must retain
          // newly introduced private tool data even after a bland summary.
          if (stage.kind === 'local') stageProvenance.push(ledger.requestProvenance(body, inherited));
          const dispatchSignal = requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal;
          requestHash = createHash('sha256').update(body).digest('hex');
          return runGate.executeAction({ scope: scopeSnapshot, destinationRef: stage.kind === 'local' ? localRefSnapshot : externalRefSnapshot,
            purpose: stage.purpose, contextPartition: partition.id, revision, body, contentType, provenance: inherited, signal: dispatchSignal, forceApproval: ledger.requiresApproval(parents),
            assertCurrent: details => {
              active(controller.signal); if (!open || this.#active.get(scopeKey) !== own || requestLabels.assertCurrent() !== true) return false;
              assertAuthority();
              const value = assertCurrent(details);
              if (value && typeof value.then === 'function') return Promise.resolve(value).then(current => { assertAuthority(); return current; });
              assertAuthority(); return value;
            }, transport: approvedBody => {
              active(controller.signal); assertAuthority(); if (!open || requestLabels.assertCurrent() !== true) throw invalid();
              // External output derives from the exact inspected/approved
              // bytes actually sent. Declared parent provenance remains sticky
              // in `inherited`; this cannot declassify a protected source.
              if (stage.kind === 'cloud') stageProvenance.push(ledger.requestProvenance(approvedBody, inherited));
              ++dispatches; return transport(approvedBody);
            } });
          })();
        };
        const inherited = ledger.provenance(parents)[0];
        await this.audit(freeze({ timestamp: new Date(this.now()).toISOString(), action: 'hybrid-stage', runID, stageIndex: index, partitionID: partition.id, destinationId: destination.id, policyVersions: policy.versions, locality: destination.locality,
          classification: inherited.classification, attributes: inherited.attributes, decision: 'started' }));
        let result;
        try {
          await current();
          result = await interruptible(() => this.executeStage(freeze({ runID, taskID, stageIndex: index, stageID: stage.id, kind: stage.kind, purpose: stage.purpose,
            partitionID: partition.id, sessionKey: partition.id, mode: stage.mode || 'chat', skills: snapshot(stage.skills || []), references: snapshot(stage.references || []), images: snapshot(stage.kind === 'local' ? stage.images || [] : []), engineSessionID: partitions.engineSession(partition), destinationRef: snapshot(stage.kind === 'local' ? localRefSnapshot : externalRefSnapshot),
            destination: snapshot(destination), instruction: stage.instruction, materials: inputs.map(handle => ledger.read(handle)), history: partitions.history(partition),
            revision, recoveryBinding: binding, scope: scopeSnapshot, signal: controller.signal, dispatch,
            getSourceProvenance: () => [inheritClassification(policy, [...ledger.provenance(parents), ...stageProvenance])] })), controller.signal);
          await current();
          if (!dispatches || !result || typeof result.text !== 'string') throw invalid();
          partitions.bindEngineSession(partition, result.sessionID);
          // Classification-like fields in a model result are intentionally
          // ignored. Only trusted inputs, full own history and local detection
          // determine the output's protection.
          const output = ledger.derive({ text: result.text, parents, provenance: stageProvenance }); references.set(stage.id, output);
          partitions.append(partition, { role: 'assistant', material: output });
          completed.push(freeze({ stageID: stage.id, partitionID: partition.id, kind: stage.kind, dispatches }));
          await this.audit(freeze({ timestamp: new Date(this.now()).toISOString(), action: 'hybrid-stage', runID, stageIndex: index, partitionID: partition.id, destinationId: destination.id, policyVersions: policy.versions, locality: destination.locality,
            classification: ledger.read(output).provenance[0].classification, attributes: ledger.read(output).provenance[0].attributes, decision: 'completed' }));
          const finished = pending; pending = null; nextIndex = index + 1;
          acknowledgements = acknowledgements.filter(value => value.partitionID !== partition.id).concat(finished);
          if (this.recoverStage) { await persist('checkpoint'); await this.acknowledgeStage(finished); }
        } catch (error) {
          if (stage.kind !== 'cloud' || !isLocalChoiceRequest(error) || !this.resolveLocalChoice || !this.recoverStage) throw error;
          // executeStage has awaited the exact engine's zero-writer retirement.
          // The user's one-use gate receipt, not a model/error-code string,
          // authorizes skipping this sharing and continuing the known local lane.
          const chosen = await this.resolveLocalChoice(error, { scope: scopeSnapshot, revision, contextPartition: partition.id, requestHash, purpose: stage.purpose, signal: controller.signal });
          await current();
          if (stable(chosen.ref) !== stable(localRefSnapshot) || chosen.isCurrent() !== true) throw invalid();
          const rolledBack = await this.recoverStage(pending, { allowPublication: false });
          if (!rolledBack || rolledBack.outcome !== 'rolled-back') throw invalid();
          const cloudBinding = { fingerprint: fingerprint({ scope: scopeSnapshot, destination: external, policy: policy.binding }) };
          bundle.cloud = partitions.restore(before, { kind: 'cloud', binding: cloudBinding });
          const omitted = ledger.addSource({ text: 'The user chose local processing instead of this cloud sharing. Complete the task with the original local sources; no cloud result is available for this stage.', provenance: sourceProvenance });
          references.set(stage.id, omitted);
          completed.push(freeze({ stageID: stage.id, partitionID: partition.id, kind: 'local-choice', dispatches }));
          const finished = pending; pending = null; nextIndex = index + 1;
          acknowledgements = acknowledgements.filter(value => value.partitionID !== partition.id).concat(finished);
          await persist('checkpoint'); await this.acknowledgeStage(finished);
          await this.onLocalChoice(chosen);
          await this.audit(freeze({ timestamp: new Date(this.now()).toISOString(), action: 'hybrid-stage', stageIndex: index, locality: 'device', decision: 'local-choice', policyVersions: policy.versions }));
        } finally { open = false; }
      }
      const final = ledger.read(references.get(plan.at(-1).id));
      await persist('complete');
      return freeze({ runID, text: final.text, provenance: final.provenance, stages: completed, continuity, localPartitionID: bundle.local.id, externalPartitionID: bundle.cloud?.id || null });
    } catch (error) {
      controller.abort();
      // A failed/aborted partial engine must not be silently resumed with a
      // different task, recipient or stale history. The host retains visible
      // original conversation/plans independently; only internal partitions go.
      if (bundle && this.#conversations.get(scopeKey) === bundle) this.#conversations.delete(scopeKey);
      if (error instanceof PrivacyGateError) throw error;
      throw invalid();
    } finally {
      if (this.#active.get(scopeKey) === own) this.#active.delete(scopeKey);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

module.exports = { HybridCoordinator };
