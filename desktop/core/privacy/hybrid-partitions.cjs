// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { randomUUID } = require('node:crypto');
const { PrivacyGateError, snapshot, stable } = require('./policy.cjs');

const invalid = () => new PrivacyGateError('PRIVACY_CONTROL_FAILED', 'Hybridsamtalens adskilte historik kunne ikke kontrolleres.');
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } return value; }

// Each executor is given only its own partition. Compaction reads and replaces
// that partition alone; no shared transcript or automatic local-to-cloud
// summary exists. Engine profiles/workspaces still require the host's separate
// D3 capability: these data structures do not claim OS isolation.
class HybridSessionPartitions {
  #records = new WeakMap();
  constructor(ledger) {
    if (!ledger || typeof ledger.derive !== 'function') throw invalid();
    this.ledger = ledger;
  }
  create({ kind, binding } = {}) {
    if (!['local', 'cloud'].includes(kind) || !binding || typeof binding !== 'object') throw invalid();
    const handle = freeze({ id: randomUUID(), kind });
    this.#records.set(handle, { binding: stable(snapshot(binding)), messages: [], handles: [], engineSessionID: null });
    return handle;
  }
  #record(handle) { const result = handle && this.#records.get(handle); if (!result) throw invalid(); return result; }
  append(handle, { role, material } = {}) {
    if (!['system', 'user', 'assistant', 'tool'].includes(role)) throw invalid();
    const record = this.#record(handle), value = this.ledger.read(material);
    if (record.messages.length >= 2048) throw invalid();
    record.messages.push(freeze({ role, content: value.text, materialID: value.id }));
    record.handles.push(material);
  }
  history(handle) { return freeze(snapshot(this.#record(handle).messages)); }
  handles(handle) { return [...this.#record(handle).handles]; }
  engineSession(handle) { return this.#record(handle).engineSessionID; }
  export(handle) {
    const record = this.#record(handle);
    return freeze({ id: handle.id, kind: handle.kind, binding: record.binding, engineSessionID: record.engineSessionID,
      messages: record.messages.map(({ role, materialID }) => ({ role, materialID })), materials: this.ledger.export(record.handles) });
  }
  restore(value, { kind, binding } = {}) {
    if (!value || value.kind !== kind || value.binding !== stable(snapshot(binding)) || !/^[a-f0-9-]{36}$/i.test(value.id || '')
      || !Array.isArray(value.messages) || value.messages.length > 2048) throw invalid();
    const materials = this.ledger.restore(value.materials), handle = freeze({ id: value.id, kind });
    const record = { binding: value.binding, messages: [], handles: [], engineSessionID: null };
    this.#records.set(handle, record);
    for (const message of value.messages) {
      if (!message || !materials.has(message.materialID)) throw invalid();
      this.append(handle, { role: message.role, material: materials.get(message.materialID) });
    }
    if (value.engineSessionID !== null) this.bindEngineSession(handle, value.engineSessionID);
    return handle;
  }
  bindEngineSession(handle, id) {
    if (typeof id !== 'string' || !id || id.length > 200 || /[\x00-\x1f]/.test(id)) throw invalid();
    const record = this.#record(handle);
    if (record.engineSessionID !== null && record.engineSessionID !== id) throw new PrivacyGateError('PRIVACY_STALE', 'Motorens samtaleidentitet ændrede sig under hybridopgaven.');
    record.engineSessionID = id;
  }
  compact(handle, summary) {
    const record = this.#record(handle);
    if (!record.handles.length) throw invalid();
    const material = this.ledger.derive({ text: summary, parents: record.handles });
    const value = this.ledger.read(material);
    record.messages = [freeze({ role: 'system', content: value.text, materialID: value.id })];
    record.handles = [material];
    return material;
  }
}

module.exports = { HybridSessionPartitions };
