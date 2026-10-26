// SPDX-License-Identifier: EUPL-1.2
'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { PrivacyGateError, composePolicy, inheritClassification, validateDestination, snapshot, stable } = require('./policy.cjs');
const { inspectRequest, findSensitive } = require('./inspector.cjs');

const capabilities = new WeakMap();
const blocked = () => new PrivacyGateError('PRIVACY_BLOCKED', 'Ingen administrativ dataregel tillader dette syntetiske CSV-uddrag.');
const stale = () => new PrivacyGateError('PRIVACY_STALE', 'CSV-uddragets kilde, modtager eller dataregel er ændret eller udløbet.');
const sha = value => createHash('sha256').update(value).digest('hex');
function frozen(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) frozen(item); } return value; }
function active(signal) { if (signal?.aborted) throw new PrivacyGateError('PRIVACY_ABORTED', 'CSV-uddraget er annulleret.'); }
function assertSync(callback) {
  const value = callback();
  if (value && typeof value.then === 'function') { void value.catch?.(() => {}); throw stale(); }
  if (value !== true) throw stale();
}
function csvRows(text, maxColumns) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 1_000_000 || /\0/.test(text)) throw blocked();
  const rows = []; let row = [], field = '', quoted = false, afterQuote = false;
  const pushField = () => { row.push(field); field = ''; afterQuote = false; if (row.length > maxColumns) throw blocked(); };
  const pushRow = () => { pushField(); if (row.some(value => value !== '')) rows.push(row); row = []; if (rows.length > 10001) throw blocked(); };
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; ++index) {
    const char = text[index];
    if (quoted) {
      if (char === '"') { if (text[index + 1] === '"') { field += '"'; ++index; } else { quoted = false; afterQuote = true; } }
      else field += char;
    } else if (char === ',') pushField();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') ++index; pushRow(); }
    else if (char === '"' && !field && !afterQuote) quoted = true;
    else { if (afterQuote || char === '"') throw blocked(); field += char; }
  }
  if (quoted) throw blocked();
  if (field || row.length || afterQuote) pushRow();
  if (!rows.length || !rows[0].length || rows.some(value => value.length !== rows[0].length)) throw blocked();
  return rows;
}
function genericSchema(text, maxColumns) {
  const rows = csvRows(text, maxColumns), header = rows[0];
  // Secret-bearing sources cannot be released, even when their values have an
  // unfamiliar format which a generic API-key detector would not recognize.
  if (header.some(value => /(?:password|passwd|adgangskode|api[_ -]?key|access[_ -]?token|client[_ -]?secret|authorization|secret)/i.test(value))) throw blocked();
  const kinds = header.map((_value, index) => {
    const values = rows.slice(1).map(row => row[index].trim()).filter(Boolean);
    if (!values.length) return 'text';
    if (values.every(value => /^(?:true|false)$/i.test(value))) return 'boolean';
    if (values.every(value => /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) return 'number';
    if (values.every(value => /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(value))) return 'date';
    return 'text';
  });
  const examples = { text: ['Example A', 'Example B'], number: [100, 200], boolean: [true, false], date: ['2000-01-01', '2000-01-02'] };
  return JSON.stringify({ format: 'aura-synthetic-csv-v1', columns: kinds.map((type, index) => ({ name: `COLUMN_${index + 1}`, type })),
    rows: [0, 1].map(example => Object.fromEntries(kinds.map((type, index) => [`COLUMN_${index + 1}`, examples[type][example]]))) });
}
function ruleFor(raw, policy, scope, source, destination, purpose) {
  const rules = raw.organization?.hybridReleaseRules;
  if (!Array.isArray(rules) || rules.length > 64) throw blocked();
  for (const name of ['project', 'conversation']) if (raw[name]?.hybridReleaseRules !== undefined) throw blocked();
  const matches = rules.filter(rule => rule && rule.transform === 'csv-generic-schema-v1' && rule.projectRoot === scope.root
    && Array.isArray(rule.sourceIds) && rule.sourceIds.includes(source.id) && Array.isArray(rule.destinationIds) && rule.destinationIds.includes(destination.id) && Array.isArray(rule.purposes) && rule.purposes.includes(purpose));
  if (matches.length !== 1) throw blocked();
  const rule = matches[0];
  const keys = ['id', 'version', 'transform', 'projectRoot', 'sourceIds', 'destinationIds', 'purposes', 'sourceClasses', 'allowPersonalData', 'maxColumns', 'ttlMs'];
  if (Object.keys(rule).some(key => !keys.includes(key)) || !/^[a-z][a-z0-9_-]{0,59}$/.test(rule.id || '') || typeof rule.version !== 'string' || !rule.version || rule.version.length > 160
    || !Array.isArray(rule.sourceClasses) || !rule.sourceClasses.length || rule.sourceClasses.some(value => !['public', 'internal', 'confidential'].includes(value))
    || ['sourceIds', 'destinationIds', 'purposes'].some(key => !Array.isArray(rule[key]) || !rule[key].length || rule[key].length > 64 || rule[key].some(value => typeof value !== 'string' || !value || value.length > 300))
    || typeof rule.allowPersonalData !== 'boolean' || !Number.isSafeInteger(rule.maxColumns ?? 16) || (rule.maxColumns ?? 16) < 1 || (rule.maxColumns ?? 16) > 32
    || !Number.isSafeInteger(rule.ttlMs ?? 300_000) || (rule.ttlMs ?? 300_000) < 1 || (rule.ttlMs ?? 300_000) > 300_000) throw blocked();
  for (const name of ['project', 'conversation']) {
    const ids = raw[name]?.releaseRuleIds;
    if (ids !== undefined && (!Array.isArray(ids) || ids.some(value => typeof value !== 'string') || !ids.includes(rule.id))) throw blocked();
  }
  const inherited = inheritClassification(policy, [source]);
  if (inherited.classification === 'strict' || inherited.uninspectable || inherited.attributes.secrets || !rule.sourceClasses.includes(inherited.classification)
    || inherited.attributes.personalData && !rule.allowPersonalData) throw blocked();
  return rule;
}

class CsvReleaseAuthority {
  constructor({ getPolicy, resolveDestination, resolveSource, assertSourceCurrent, now = Date.now } = {}) {
    if ([getPolicy, resolveDestination, resolveSource, assertSourceCurrent, now].some(value => typeof value !== 'function')) throw new TypeError('CSV release requires trusted administrative policy, source and synchronous source-authority callbacks.');
    Object.assign(this, { getPolicy, resolveDestination, resolveSource, assertSourceCurrent, now });
  }
  async release({ scope, sourceRef, destinationRef, purpose, revision, signal } = {}) {
    active(signal);
    if (!scope || typeof scope !== 'object' || typeof scope.root !== 'string' || typeof purpose !== 'string' || !purpose || purpose.length > 300 || !['string', 'number'].includes(typeof revision)) throw blocked();
    const scopeSnapshot = frozen(snapshot(scope)), ref = frozen(snapshot(sourceRef));
    const raw = snapshot(await this.getPolicy(scopeSnapshot)), policy = composePolicy(raw);
    if (!policy.enabled || policy.workMode !== 'hybrid') throw blocked();
    const destination = validateDestination(await this.resolveDestination(snapshot(destinationRef)));
    if (destination.locality === 'device' || !policy.allowedDestinationIds?.includes(destination.id)) throw blocked();
    const original = await this.resolveSource(scopeSnapshot, ref);
    if (!original || typeof original.id !== 'string' || !original.id || original.id.length > 200 || typeof original.text !== 'string' || !['string', 'number'].includes(typeof original.revision)) throw blocked();
    const source = snapshot(original), findings = findSensitive(source.text.normalize('NFKC'), policy.protectedValues || []);
    source.attributes = { personalData: source.attributes?.personalData === true || findings.some(value => value.kind !== 'secret'), secrets: source.attributes?.secrets === true || findings.some(value => value.kind === 'secret') };
    // An opaque/encoded/binary source is not eligible for this text-only rule.
    try { inspectRequest(JSON.stringify({ messages: [{ content: source.text }] }), policy); } catch { throw blocked(); }
    const rule = ruleFor(raw, policy, scopeSnapshot, source, destination, purpose);
    const text = genericSchema(source.text, rule.maxColumns ?? 16);
    const checked = inspectRequest(JSON.stringify({ messages: [{ content: text }] }), policy);
    if (checked.changed || checked.hasPersonalData || checked.hasSecrets) throw blocked();
    const sourceBinding = frozen({ id: source.id, revision: source.revision, sha256: sha(source.text), classification: original.classification, attributes: snapshot(original.attributes || {}), uninspectable: original.uninspectable === true });
    assertSync(() => this.assertSourceCurrent(scopeSnapshot, ref, sourceBinding));
    active(signal);
    if (composePolicy(snapshot(await this.getPolicy(scopeSnapshot))).binding !== policy.binding
      || stable(validateDestination(await this.resolveDestination(snapshot(destinationRef)))) !== stable(destination)) throw stale();
    active(signal); assertSync(() => this.assertSourceCurrent(scopeSnapshot, ref, sourceBinding));
    const capability = Object.freeze({ id: randomUUID() }), expiresAt = this.now() + (rule.ttlMs ?? 300_000);
    capabilities.set(capability, { text, policyBinding: policy.binding, scope: stable(scopeSnapshot), destination: stable(destination), purpose, revision, expiresAt, owner: null,
      assertCurrent: () => { if (this.now() >= expiresAt) throw stale(); assertSync(() => this.assertSourceCurrent(scopeSnapshot, ref, sourceBinding)); } });
    return capability;
  }
}

function claimCsvRelease(capability, { scope, destination, purpose, revision, policyBinding, runID } = {}) {
  const record = capability && capabilities.get(capability);
  if (!record || stable(scope) !== record.scope || stable(destination) !== record.destination || purpose !== record.purpose || revision !== record.revision
    || policyBinding !== record.policyBinding || typeof runID !== 'string' || !runID || record.owner !== null && record.owner !== runID) throw stale();
  record.assertCurrent(); record.owner = runID;
  return Object.freeze({ text: record.text, provenance: frozen([{ classification: 'public', attributes: { personalData: false, secrets: false }, uninspectable: false }]),
    requiresApproval: true, purpose: record.purpose, assertCurrent: record.assertCurrent });
}

module.exports = { CsvReleaseAuthority, claimCsvRelease };
