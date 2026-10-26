// SPDX-License-Identifier: EUPL-1.2
'use strict';
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { OpenCodeEngine } = require('../engine.cjs');
const { HybridForkEngine } = require('./hybrid-fork-engine.cjs');
const { HybridEngineExecutor } = require('./hybrid-engine-executor.cjs');
const { HybridSessionStore } = require('./hybrid-session-store.cjs');
const { HybridMaterialLedger } = require('./hybrid-materials.cjs');
const { HybridSessionPartitions } = require('./hybrid-partitions.cjs');
const { PrivacyGate, PrivacyGateError, isLocalChoiceRequest } = require('./index.cjs');
const { composePolicy, validateDestination, stable, snapshot, inheritClassification } = require('./policy.cjs');
const fail = () => new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Det beskyttede modelarbejde kunne ikke kontrolleres. Ingen ukontrolleret reserve er startet.');
const stale = () => new PrivacyGateError('PRIVACY_STALE', 'Datareglerne, opgaven eller den valgte modtager er ændret.');
const missing = () => new PrivacyGateError('PRIVACY_SESSION_MISSING', 'Den beskyttede models tidligere samtale kunne ikke gendannes. Ingen tom reservesamtale er startet.');
const sha = value => createHash('sha256').update(value).digest('hex');

// One guarded model, one distinct history/workspace. Reuses exactly the host's
// permission/question/Stop bridge; it never constructs an ordinary host engine.
class IsolatedForkEngine extends HybridForkEngine {
  constructor(options) {
    const { locality, createRuntime } = options || {};
    if (!['device', 'organization', 'cloud'].includes(locality) || typeof createRuntime !== 'function') throw fail();
    let owner;
    super({ ...options, createRuntime: hooks => createRuntime({ ...hooks, planForRun: () => [{ id: 'local_assemble', kind: locality === 'device' ? 'local' : 'cloud', purpose: 'isolated-model-task', mode: owner.mode,
      inputs: ['original'], instruction: owner.system, skills: owner.snapshots.skills, references: owner.snapshots.references, images: owner.images,
      allowProjectInput: true, allowWriteback: true }] }) });
    owner = this;
  }
}
class IsolatedRuntime {
  #stages = new WeakSet(); #runs = new Map(); #closed = false; #closing; #memory;
  constructor({ directory, projectRoot, scope, destinationRef, getPolicy, getAuthoritySnapshot, getRequestProvenance, resolveDestination, resolveSelection, gate, resolveLocalChoice, getLocalSourceProvenance,
    planForRun, authorizeStage, assertCurrent, encrypt, decrypt, workspaceFactory, createEngine = options => new OpenCodeEngine(options), createGateway, requestPermission, answerQuestion, onEvent,
    beforeDispatch, remaining, cleanupTimeoutMs = 30000 } = {}) {
    if (!path.isAbsolute(directory || '') || !path.isAbsolute(projectRoot || '') || !scope
      || [getPolicy, getAuthoritySnapshot, resolveDestination, resolveSelection, planForRun, authorizeStage, assertCurrent, encrypt, decrypt, workspaceFactory].some(value => typeof value !== 'function')
      || !gate || typeof gate.executeAction !== 'function') throw fail();
    Object.assign(this, { scope: snapshot(scope), destinationRef: snapshot(destinationRef), getPolicy, getAuthoritySnapshot, getRequestProvenance, resolveDestination, planForRun, assertCurrent, gate });
    this.localOptions={directory,projectRoot,scope,getPolicy,getAuthoritySnapshot,getRequestProvenance,resolveDestination,resolveSelection,gate,authorizeStage,encrypt,decrypt,workspaceFactory,createEngine,createGateway,requestPermission,answerQuestion,onEvent,beforeDispatch,remaining,cleanupTimeoutMs};
    this.resolveLocalChoice=resolveLocalChoice;this.getLocalSourceProvenance=getLocalSourceProvenance;this.onEvent=onEvent;
    this.store = new HybridSessionStore({ directory: path.join(directory, 'single-sessions'), encrypt, decrypt });
    this.workspaces = workspaceFactory({ directory: path.join(directory, 'single-workers'), projectRoot, validateStage: stage => this.#stages.has(stage), assertCurrent, encrypt, decrypt });
    this.executor = new HybridEngineExecutor({ resolveSelection, closeAfterStage: true, cleanupTimeoutMs,
      authorizeStage: stage => !this.#closed && this.#stages.has(stage) && authorizeStage(stage),
      preparePartition: (stage, details) => { if (!this.#stages.has(stage)) throw fail(); return this.workspaces.preparePartition(stage, details); },
      validateLease: (lease, stage) => this.workspaces.validateLease(lease, stage), releaseLease: lease => this.workspaces.release(lease),
      completePartition: (lease, stage, result) => this.workspaces.complete(lease, stage, result), recordPermission: (lease, properties, answer) => this.workspaces.recordPermission?.(lease, properties, answer),
      createEngine: async (options, lease) => {
        const launch = await this.workspaces.engineOptions(lease, this.leaseStage);
        if (typeof createEngine !== 'function') throw fail();
        return createEngine({ ...options, ...launch }, lease);
      }, requestPermission, answerQuestion, onEvent, assertCurrent, beforeDispatch, remaining, ...(createGateway ? { createGateway } : {}) });
  }
  async run({ taskID, originalPrompt, sourceProvenance = [], revision, signal, requireExistingSession = false } = {}) {
    if (this.#closed || this.#runs.size || typeof taskID !== 'string' || !taskID || typeof originalPrompt !== 'string' || !Array.isArray(sourceProvenance)) throw fail();
    const authority = this.getAuthoritySnapshot(this.scope); if (!/^[a-f0-9]{64}$/.test(authority || '')) throw fail();
    const controller = new AbortController(), abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true }); if (signal?.aborted) controller.abort();
    this.#runs.set(taskID, controller);
    let interrupted;
    const stopped = new Promise((_resolve, reject) => { interrupted = () => reject(new PrivacyGateError('PRIVACY_ABORTED', 'Opgaven er stoppet.')); controller.signal.addEventListener('abort', interrupted, { once: true }); });
    void stopped.catch(() => {});
    const wait = promise => Promise.race([promise, stopped]);
    const check = () => { if (this.#closed || controller.signal.aborted || this.#runs.get(taskID) !== controller) throw new PrivacyGateError('PRIVACY_ABORTED', 'Opgaven er stoppet.'); if (this.assertCurrent() !== true || this.getAuthoritySnapshot(this.scope) !== authority) throw stale(); return true; };
    let operationActive = true, pending = null, acknowledgement = null, recovered = null, localRequest = null;
    try {
      check(); const layers = snapshot(await wait(this.getPolicy(this.scope))); check(); const policy = composePolicy(layers);
      if (!policy.enabled || !['local', 'cloud-controlled'].includes(policy.workMode)) throw fail();
      const destination = validateDestination(await wait(this.resolveDestination(this.destinationRef))); check();
      if (policy.workMode === 'local' && destination.locality !== 'device') throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Kun lokal kræver en dokumenteret model på denne computer.');
      const binding = sha(stable({ policy: policy.binding, destination })), kind = destination.locality === 'device' ? 'local' : 'cloud';
      const isCurrent = async () => { check(); if (composePolicy(await wait(this.getPolicy(this.scope))).binding !== policy.binding || stable(validateDestination(await wait(this.resolveDestination(this.destinationRef)))) !== stable(destination)) throw stale(); check(); return true; };
      const plans = await wait(this.planForRun(Object.freeze({ taskID, revision, signal: controller.signal }))); check();
      if (!Array.isArray(plans) || plans.length !== 1 || plans[0]?.kind !== kind || !['chat', 'plan', 'build', 'free'].includes(plans[0]?.mode) || typeof plans[0]?.instruction !== 'string') throw fail();
      const plan = snapshot(plans[0]);
      let memory = this.#memory;
      if (!memory) {
        const saved = await wait(this.store.load(this.scope)); check();
        if (requireExistingSession && !saved || saved && (saved.version !== 1 || saved.binding !== binding || !['complete', ...(this.workspaces.recoverStage ? ['checkpoint'] : [])].includes(saved.status))) throw missing();
        if (saved?.status === 'checkpoint') {
          if (!saved.pending || !saved.pending.before || !Array.isArray(saved.pending.parents)) throw missing();
          const outcome = await wait(this.workspaces.recoverStage(saved.pending, { allowPublication: saved.pending.originalPrompt === originalPrompt && stable(saved.pending.plan) === stable(plan) })); check();
          recovered = { pending: snapshot(saved.pending), outcome };
          if (!outcome || outcome.outcome === 'rolled-back') { saved.partition = saved.pending.before; saved.taint = saved.pending.taintBefore; }
        } else if (saved?.acknowledgement) await wait(this.workspaces.acknowledgeStage?.(saved.acknowledgement));
        const ledger = new HybridMaterialLedger(policy), partitions = new HybridSessionPartitions(ledger);
        const partition = saved ? partitions.restore(saved.partition, { kind, binding: { id: binding, destination } }) : partitions.create({ kind, binding: { id: binding, destination } });
        memory = this.#memory = { ledger, partitions, partition, binding, taint: saved?.taint || [], pendingContext: [...ledger.restore(saved?.pendingContext || []).values()] };
      }
      if (memory.binding !== binding) throw missing();
      const { ledger, partitions } = memory;let partition=memory.partition;
      const persist = async status => { check(); await wait(this.store.save(this.scope, { version: 1, binding, status, taint: snapshot(memory.taint), partition: partitions.export(partition), pendingContext: ledger.export(memory.pendingContext), ...(this.workspaces.recoverStage ? { pending, acknowledgement } : {}) })); check(); };
      if (recovered) {
        const p = recovered.pending, outcome = recovered.outcome;
        if (outcome?.outcome === 'completed') {
          const parents = ledger.restore(p.parents), output = ledger.derive({ text: outcome.result.text, parents: [...parents.values()], provenance: outcome.result.provenance });
          partitions.bindEngineSession(partition, outcome.result.sessionID); partitions.append(partition, { role: 'assistant', material: output }); memory.taint = outcome.result.provenance;
          memory.pendingContext = [];
          acknowledgement = p; await persist('complete'); await wait(this.workspaces.acknowledgeStage(p)); check();
          if (p.originalPrompt === originalPrompt && stable(p.plan) === stable(plan)) return { text: outcome.result.text, provenance: ledger.provenance([output]), stages: [{ id: plan.id, kind }], continuity: 'reconciled' };
        } else {
          // Keep interrupted context outside the engine transcript until an
          // explicit later Send succeeds. Persist it before retiring the
          // checkpoint, including across another Stop before model dispatch.
          if (p.originalPrompt !== originalPrompt) memory.pendingContext.push(ledger.derive({
            text: 'Previous interrupted request, context only; no unfinished action was applied: ' + p.originalPrompt,
            parents: [...ledger.restore(p.parents).values()], provenance: p.sourceProvenance,
          }));
          acknowledgement = outcome ? p : null; pending = null;
          await persist('complete'); if (outcome) await wait(this.workspaces.acknowledgeStage(p)); check();
        }
      }
      if (kind === 'cloud' && plan.images?.length) throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Billeder kræver understøttet lokal undersøgelse, før de må indgå i cloudarbejdet.');
      const before = partitions.export(partition), taintBefore = snapshot(memory.taint);
      const input = ledger.addSource({ text: originalPrompt, provenance: [...sourceProvenance, ...memory.taint] }), instructions = ledger.addSource({ text: plan.instruction, provenance: sourceProvenance });
      const parents = [...partitions.handles(partition), input, instructions, ...memory.pendingContext];
      if (kind === 'cloud') ledger.assertExternal(parents, policy);
      partitions.append(partition, { role: 'user', material: input });
      pending = { recoveryBinding: binding, partitionID: partition.id, stageID: plan.id, stageIndex: 0, kind, taskID, scope: this.scope, references: plan.references || [], before, parents: ledger.export(parents), originalPrompt, sourceProvenance, taintBefore, plan };
      await persist(this.workspaces.recoverStage ? 'checkpoint' : 'in-progress');
      const stage = { recoveryBinding: binding, runID: randomUUID(), taskID, stageID: plan.id, stageIndex: 0, kind, mode: plan.mode, purpose: plan.purpose,
        partitionID: partition.id, sessionKey: partition.id, engineSessionID: partitions.engineSession(partition), destinationRef: this.destinationRef, destination, instruction: plan.instruction,
        materials: [...memory.pendingContext.map(handle => ledger.read(handle)), ledger.read(input)], history: partitions.history(partition), skills: plan.skills || [], references: plan.references || [], images: plan.images || [],
        scope: this.scope, revision, signal: controller.signal, allowProjectInput: true, allowWriteback: true,
        getSourceProvenance: () => [inheritClassification(policy, [...ledger.provenance(parents), ...memory.taint])],
        dispatch: async ({ body, transport, signal: requestSignal }) => {
          if (!operationActive || typeof body !== 'string' || typeof transport !== 'function') throw fail(); await isCurrent();
          const labels = this.getRequestProvenance ? await wait(this.getRequestProvenance(this.scope, body)) : null;
          if (labels && (!Array.isArray(labels.provenance) || typeof labels.assertCurrent !== 'function')) throw fail();
          const current = () => { check(); if (!operationActive || labels && labels.assertCurrent() !== true) throw stale(); return true; };
          const provenance = [inheritClassification(policy, [...ledger.provenance(parents), ...memory.taint, ...(labels?.provenance || [])])];
          let sent = false;
          let result;try { result = await this.gate.executeAction({ scope: this.scope, destinationRef: this.destinationRef, purpose: plan.purpose, revision, contextPartition: partition.id,
            body, contentType: 'application/json', provenance, signal: requestSignal ? AbortSignal.any([controller.signal, requestSignal]) : controller.signal, assertCurrent: current,
            transport: approved => { current(); memory.taint = [ledger.requestProvenance(approved, provenance)]; current(); sent = true; return transport(approved); } }); } catch(error){if(isLocalChoiceRequest(error))localRequest={error,scope:this.scope,purpose:plan.purpose,revision,contextPartition:partition.id,requestHash:sha(body)};throw error;}
          if (!sent) throw fail(); this.dispatched = true; return result;
        } };
      this.#stages.add(stage); this.leaseStage = stage; this.dispatched = false;
      let result;
      try { result = await wait(this.executor.execute(stage)); }
      catch(error){
        // execute() rejects only after the exact worker/gateway are retired.
        // A typed dialog capability alone is insufficient: discard that lane's
        // uncommitted tools and history, and prove no host publication occurred.
        if(kind!=='cloud'||!isLocalChoiceRequest(error)||localRequest?.error!==error||typeof this.resolveLocalChoice!=='function'||typeof this.getLocalSourceProvenance!=='function'||!this.workspaces.recoverStage)throw error;
        await isCurrent();
        const retired=await wait(this.workspaces.recoverStage(pending,{allowPublication:false}));check();
        if(retired?.outcome!=='rolled-back')throw fail();
        const {error:_cause,...expected}=localRequest;
        const local=await wait(this.resolveLocalChoice(error,{...expected,signal:controller.signal}));check();local.isCurrent();
        if(local.destination?.locality!=='device'||typeof local.isCurrent!=='function')throw fail();
        partition=memory.partition=partitions.restore(before,{kind,binding:{id:binding,destination}});memory.taint=taintBefore;
        acknowledgement=pending;pending=null;await persist('complete');await wait(this.workspaces.acknowledgeStage(acknowledgement));check();local.isCurrent();
        const localSources=await wait(this.getLocalSourceProvenance());check();local.isCurrent();if(!Array.isArray(localSources))throw fail();
        const localDirectory=path.join(this.localOptions.directory,'local-handoff',sha(stable(local.destination)));
        const localPlan={...plan,kind:'local',purpose:'isolated-local-handoff'};
        const localRuntime=this.localRuntime=new IsolatedRuntime({...this.localOptions,directory:localDirectory,destinationRef:local.ref,
          assertCurrent:()=>{check();return local.isCurrent();},planForRun:()=>[localPlan]});
        this.onEvent?.({type:'privacy.local-processing',properties:{connectionID:local.ref.connectionID,model:local.selection?.model?.name||local.ref.modelID,locality:'device'}},{...stage,kind:'local',destinationRef:local.ref});
        try {return await wait(localRuntime.run({taskID,originalPrompt,sourceProvenance:localSources,revision,signal:controller.signal}));}
        finally {await localRuntime.close();if(this.localRuntime===localRuntime)this.localRuntime=null;}
      }
      await isCurrent();
      if (!this.dispatched || typeof result.text !== 'string' || !result.sessionID) throw fail();
      partitions.bindEngineSession(partition, result.sessionID);
      const output = ledger.derive({ text: result.text, parents, provenance: memory.taint }); partitions.append(partition, { role: 'assistant', material: output });
      acknowledgement = pending; pending = null; memory.pendingContext = [];
      await persist('complete'); if (this.workspaces.recoverStage) await wait(this.workspaces.acknowledgeStage(acknowledgement)); check(); return { text: result.text, provenance: ledger.provenance([output]), stages: [{ id: plan.id, kind }], continuity: true };
    } catch (error) { this.#memory = null; throw error instanceof PrivacyGateError ? error : fail(); }
    finally { operationActive = false; controller.signal.removeEventListener('abort', interrupted); signal?.removeEventListener('abort', abort); this.#runs.delete(taskID); }
  }
  stop(taskID) { this.#runs.get(taskID)?.abort(); }
  close() { if (this.#closing) return this.#closing; this.#closed = true; for (const controller of this.#runs.values()) controller.abort(); this.#closing = (async () => { try { await this.localRuntime?.close();await this.executor.dispose(); } finally { await this.workspaces.close(); } })(); return this.#closing; }
}
module.exports = { IsolatedForkEngine, IsolatedRuntime };
