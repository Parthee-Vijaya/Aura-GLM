// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { randomUUID } = require('node:crypto');
const { PrivacyGateError, inheritClassification, snapshot, stable } = require('./policy.cjs');
const { inspectRequest, findSensitive } = require('./inspector.cjs');

const MAX_TEXT_BYTES = 512_000, MAX_LEDGER_BYTES = 8_000_000, MAX_MATERIALS = 1024;
const invalid = () => new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Hybridmaterialet kunne ikke kontrolleres. Ingen data er sendt.');
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } return value; }
function text(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_TEXT_BYTES) throw invalid();
  return value;
}

// Material handles are process-owned object identities. A model's JSON cannot
// name an existing protected material, replace its provenance or declassify it.
// Content and mappings stay in the trusted local process; there is no automatic
// placeholder restoration and no serialization into a cloud history.
class HybridMaterialLedger {
  #records = new WeakMap();
  #identities = new Map();
  #bytes = 0;
  #count = 0;
  constructor(policy) {
    if (!policy?.enabled) throw invalid();
    this.policy = freeze(snapshot(policy));
  }
  #record(handle) { const value = handle && this.#records.get(handle); if (!value) throw invalid(); return value; }
  #inspect(value, provenance) {
    const findings = findSensitive(value.normalize('NFKC'), this.policy.protectedValues || []);
    let inherited = inheritClassification(this.policy, provenance), uninspectable = false;
    try {
      const inspected = inspectRequest(JSON.stringify({ messages: [{ role: 'user', content: value }] }), this.policy);
      inherited = inheritClassification(this.policy, [...provenance, ...inspected.visibleSources]);
    } catch (error) {
      if (!(error instanceof PrivacyGateError)) throw invalid();
      // An unavailable deterministic inspection never turns a local artifact
      // into an externally releasable artifact. The local executor can still
      // work on it; a subsequent external handoff fails closed.
      uninspectable = true;
    }
    return {
      // A configured protected project term is independent of personal-data
      // permission. An ordinary PII allow must not declassify its derived text.
      classification: findings.some(item => item.kind === 'protected') ? 'strict' : inherited.classification,
      attributes: {
        personalData: inherited.attributes.personalData || findings.some(item => item.kind !== 'secret'),
        secrets: inherited.attributes.secrets || findings.some(item => item.kind === 'secret'),
      },
      uninspectable: inherited.uninspectable || uninspectable,
    };
  }
  #put(value, provenance, ancestors, requiresApproval = false) {
    value = text(value);
    const bytes = Buffer.byteLength(value);
    if (this.#count >= MAX_MATERIALS || this.#bytes + bytes > MAX_LEDGER_BYTES) throw invalid();
    const inherited = this.#inspect(value, provenance);
    const handle = Object.freeze({ id: randomUUID() });
    this.#records.set(handle, freeze({ id: handle.id, text: value, provenance: [inherited], ancestors: [...new Set(ancestors)], requiresApproval }));
    this.#identities.set(handle.id, handle);
    this.#bytes += bytes; ++this.#count;
    return handle;
  }
  addSource({ text: value, provenance = [], requiresApproval = false } = {}) {
    // This method is for trusted source registration, never model output.
    if (typeof requiresApproval !== 'boolean') throw invalid();
    return this.#put(value, snapshot(provenance), [], requiresApproval);
  }
  derive({ text: value, parents, provenance = [] } = {}) {
    if (!Array.isArray(parents) || !parents.length || parents.length > MAX_MATERIALS) throw invalid();
    const records = parents.map(handle => this.#record(handle));
    return this.#put(value, [...records.flatMap(record => record.provenance), ...snapshot(provenance)], records.flatMap(record => [record.id, ...record.ancestors]), records.some(record => record.requiresApproval));
  }
  read(handle) { return freeze(snapshot(this.#record(handle))); }
  requiresApproval(handles) { return handles.some(handle => this.#record(handle).requiresApproval); }
  requestProvenance(body, provenance = []) {
    if (typeof body !== 'string' || Buffer.byteLength(body) > 4_000_000) throw invalid();
    // Inspect transient complete requests too: a local tool may have introduced
    // protected content that was absent from the first user message. Its stage
    // output still inherits that protection even when it returns a bland summary.
    // Use the same bounded decoded key/scalar inspection as the actual gate.
    // Running prose detectors over serialized JSON turns escaped whitespace
    // into apparent credential values which never existed in any leaf.
    const sources = snapshot(provenance);
    let checked, uninspectable = false;
    try { checked = inspectRequest(body, this.policy); sources.push(...checked.visibleSources); }
    catch (error) { if (!(error instanceof PrivacyGateError)) throw invalid(); uninspectable = true; }
    const inherited = inheritClassification(this.policy, sources);
    return freeze({ classification: checked?.findings.some(item => item.kind === 'protected') ? 'strict' : inherited.classification,
      attributes: { personalData: inherited.attributes.personalData || !!checked?.hasPersonalData,
        secrets: inherited.attributes.secrets || !!checked?.hasSecrets },
      uninspectable: inherited.uninspectable || uninspectable });
  }
  export(handles) { return [...new Set(handles)].map(handle => this.read(handle)); }
  restore(records) {
    if (!Array.isArray(records) || records.length > MAX_MATERIALS) throw invalid();
    const restored = new Map();
    for (const record of records) {
      if (!record || !/^[a-f0-9-]{36}$/i.test(record.id || '') || restored.has(record.id) || !Array.isArray(record.ancestors)
        || record.ancestors.some(id => typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id))) throw invalid();
      text(record.text);
      const inherited = this.#inspect(record.text, snapshot(record.provenance));
      if (record.requiresApproval !== undefined && typeof record.requiresApproval !== 'boolean') throw invalid();
      const normalized = freeze({ id: record.id, text: record.text, provenance: [inherited], ancestors: [...new Set(record.ancestors)], requiresApproval: record.requiresApproval === true });
      let handle = this.#identities.get(record.id);
      if (handle) { if (stable(this.#record(handle)) !== stable(normalized)) throw invalid(); }
      else {
        const bytes = Buffer.byteLength(record.text);
        if (this.#count >= MAX_MATERIALS || this.#bytes + bytes > MAX_LEDGER_BYTES) throw invalid();
        handle = freeze({ id: record.id }); this.#records.set(handle, normalized); this.#identities.set(record.id, handle); this.#bytes += bytes; ++this.#count;
      }
      restored.set(record.id, handle);
    }
    return restored;
  }
  provenance(handles) {
    if (!Array.isArray(handles) || !handles.length || handles.length > MAX_MATERIALS) throw invalid();
    return [freeze(inheritClassification(this.policy, handles.flatMap(handle => this.#record(handle).provenance)))];
  }
  assertExternal(handles, policy = this.policy) {
    const inherited = inheritClassification(policy, this.provenance(handles));
    const levels = ['public', 'internal', 'confidential', 'strict'];
    if (inherited.uninspectable || inherited.classification === 'strict'
      || levels.indexOf(inherited.classification) > levels.indexOf(policy.maxClass)
      || inherited.classification === 'confidential' && !policy.allowConfidentialRelease
      || inherited.attributes.personalData && !policy.allowPersonalData
      || inherited.attributes.secrets && !policy.allowSecrets) {
      throw new PrivacyGateError('PRIVACY_LOCAL_REQUIRED', 'Dette hybridmateriale skal blive i den lokale del af opgaven.');
    }
    return inherited;
  }
}

module.exports = { HybridMaterialLedger, MAX_TEXT_BYTES, MAX_LEDGER_BYTES, MAX_MATERIALS };
