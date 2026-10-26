// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Trusted non-model egress primitive. This does not implement Git packing, upload
// decoding, a browser, or OS isolation. A registered application adapter MUST
// decode the COMPLETE snapshotted wire artifact (including metadata/history),
// enforce its format/size limits, and dispatch only packet.body. No adapter or
// decoder is supplied by a renderer/model. A partial manifest is not proof of
// the unreported bytes of a Git pack, CLI invocation, or upload.
//
// execute({ action, destinationRef, artifactRef, signal }) accepts opaque refs.
// Trusted constructor callbacks:
//   getContext({action,destinationRef}) -> synchronous {scope,contextPartition,
//     epoch,revision}; epoch MUST cover current policy + destination registry.
//   getPolicy(scope, context), resolveDestination(ref, context)
//   adapters[action] = { id, maxBytes, prepare(ref, context), inspect(body),
//     dispatch(packet,controls) }; inspect returns {material,provenance?} from body bytes.
// packet.body is frozen {encoding:'base64',data,byteLength,sha256,contentType}.
// The dispatcher may decode data to send it, never re-open artifactRef/source
// paths or rebuild an unreviewed pack. Dispatcher uses controls.signal for
// cancellation and controls.assertCurrent() directly before a delayed first
// byte. No generic wrapper can constrain a dishonest trusted transport. All
// manifest rewriting fails closed;
// adapters that produce a new sanitized artifact must execute a fresh review.
// Outside opt-in protection keep legacy behavior outside this primitive: an
// absent/disabled policy deliberately does NOT grant an external-action permit.

const { createHash, createHmac, randomBytes } = require('node:crypto');
const { PrivacyGate, PrivacyGateError, composePolicy } = require('./index.cjs');
const { validateDestination, stable } = require('./policy.cjs');

const ACTIONS = Object.freeze(['git-push', 'upload', 'integration', 'browser-http', 'browser-open']);
const MAX_ARTIFACT_BYTES = 4_000_000;
const INVALID = 'PRIVACY_CONTROL_FAILED';
const SAFE_ERROR_CODES = new Set([INVALID, 'PRIVACY_ABORTED', 'PRIVACY_STALE', 'PRIVACY_APPROVAL_REQUIRED', 'PRIVACY_BLOCKED', 'PRIVACY_LOCAL_REQUIRED', 'PRIVACY_POLICY_INVALID', 'PRIVACY_DESTINATION_INVALID', 'PRIVACY_EXTERNAL_POLICY_REQUIRED', 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED', 'PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED']);
function fail(code = INVALID) {
  const messages = {
    PRIVACY_ABORTED: 'Handlingen er annulleret. Ingen ny ekstern handling er sendt.',
    PRIVACY_STALE: 'Handlingen, modtageren eller datareglerne er ændret. Gennemgå handlingen igen.',
    PRIVACY_APPROVAL_REQUIRED: 'Handlingen kræver en konkret delingsgodkendelse.',
    PRIVACY_BLOCKED: 'Datareglerne tillader ikke denne eksterne handling.',
    PRIVACY_LOCAL_REQUIRED: 'Materialet skal behandles lokalt. Ingen ekstern reserve vælges.',
    PRIVACY_POLICY_INVALID: 'Datareglerne kunne ikke kontrolleres. Ingen ekstern handling er sendt.',
    PRIVACY_DESTINATION_INVALID: 'Modtageren kunne ikke kontrolleres. Ingen ekstern handling er sendt.',
    PRIVACY_EXTERNAL_POLICY_REQUIRED: 'En aktiv datakontrol kræves til denne eksterne handling.',
    PRIVACY_EXTERNAL_ADAPTER_REQUIRED: 'Handlingen mangler en betroet, komplet eksportadapter. Ingen data er sendt.',
    PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED: 'Artefaktet kræver ændringer. Opret og gennemgå et nyt artefakt før afsendelse.',
    [INVALID]: 'Den eksterne handling kunne ikke kontrolleres sikkert. Ingen reservehandling er startet.',
  };
  return new PrivacyGateError(code, messages[code] || messages[INVALID]);
}
function active(signal) { if (signal?.aborted) throw fail('PRIVACY_ABORTED'); }
function plain(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value'))) throw fail();
  return value;
}
function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
function jsonCopy(value) {
  let nodes = 0, bytes = 0;
  const count = value => { bytes += Buffer.byteLength(value); if (bytes > MAX_ARTIFACT_BYTES) throw fail(); };
  const copy = (item, depth) => {
    if (++nodes > 100_000 || depth > 64) throw fail();
    if (typeof item === 'string') { count(item); return item; }
    if (item === null || typeof item === 'boolean') return item;
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (!item || typeof item !== 'object') throw fail();
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || Reflect.ownKeys(item).some(key => key !== 'length' && (typeof key !== 'string' || !/^\d+$/.test(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(item, key), 'value')))) throw fail();
      const result = []; for (let at = 0; at < item.length; at++) { if (!Object.hasOwn(item, at)) throw fail(); result.push(copy(item[at], depth + 1)); } return result;
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(item))) throw fail();
    const result = Object.create(null);
    for (const key of Reflect.ownKeys(item)) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value')) throw fail();
      count(key);
      result[key] = copy(descriptor.value, depth + 1);
    }
    return result;
  };
  return freeze(copy(value, 0));
}
function opaqueRef(value) { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(value)) throw fail(); return value; }
function contextSnapshot(value) {
  plain(value, ['scope', 'contextPartition', 'epoch', 'revision']);
  if (!value.scope || typeof value.scope !== 'object' || Array.isArray(value.scope) || typeof value.contextPartition !== 'string' || !value.contextPartition || value.contextPartition.length > 300 || !['string', 'number'].includes(typeof value.epoch) || !['string', 'number'].includes(typeof value.revision)) throw fail();
  const result = jsonCopy(value);
  if (stable(result).length > 32_768 || String(result.epoch).length === 0 || String(result.epoch).length > 300 || String(result.revision).length > 300) throw fail();
  return result;
}
async function step(operation, signal) {
  active(signal);
  if (!signal) return operation();
  let aborted;
  const stopped = new Promise((_resolve, reject) => { aborted = () => reject(fail('PRIVACY_ABORTED')); signal.addEventListener('abort', aborted, { once: true }); });
  try { const result = await Promise.race([Promise.resolve().then(operation), stopped]); active(signal); return result; }
  finally { signal.removeEventListener('abort', aborted); }
}
function bodySnapshot(prepared, maxBytes) {
  plain(prepared, ['body', 'contentType', 'metadata']);
  const raw = prepared.body;
  if (!(typeof raw === 'string' || Buffer.isBuffer(raw) || raw instanceof Uint8Array)) throw fail();
  if (typeof raw === 'string' ? Buffer.byteLength(raw) > maxBytes : raw.byteLength > maxBytes) throw fail();
  if (typeof prepared.contentType !== 'string' || prepared.contentType.length > 160 || !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(prepared.contentType)) throw fail();
  const bytes = Buffer.from(raw);
  return freeze({ encoding: 'base64', data: bytes.toString('base64'), byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), contentType: prepared.contentType });
}

class ExternalActions {
  #context; #policy; #destination; #adapters = new Map(); #approval; #audit; #now; #bindingKey = randomBytes(32);
  constructor({ getContext, getPolicy, resolveDestination, adapters = {}, requestApproval, audit = async () => {}, now = Date.now } = {}) {
    if ([getContext, getPolicy, resolveDestination, audit, now].some(value => typeof value !== 'function') || requestApproval !== undefined && typeof requestApproval !== 'function') throw new TypeError('External actions require trusted context, policy, destination and artifact adapters.');
    plain(adapters, ACTIONS);
    for (const [action, supplied] of Object.entries(adapters)) {
      plain(supplied, ['id', 'maxBytes', 'prepare', 'inspect', 'dispatch']);
      if (typeof supplied.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(supplied.id) || !Number.isSafeInteger(supplied.maxBytes) || supplied.maxBytes < 1 || supplied.maxBytes > MAX_ARTIFACT_BYTES || ['prepare', 'inspect', 'dispatch'].some(key => typeof supplied[key] !== 'function')) throw new TypeError('An external action adapter needs a bounded complete decoder and fixed dispatcher.');
      this.#adapters.set(action, Object.freeze({ ...supplied }));
    }
    this.#context = getContext; this.#policy = getPolicy; this.#destination = resolveDestination; this.#approval = requestApproval; this.#audit = audit; this.#now = now;
  }
  async execute(input) {
    try { return await this.#execute(input); }
    // Even trusted decoders/transports can wrap a sensitive parse failure in a
    // PrivacyGateError. Preserve only known decision codes, never their raw text,
    // cause, paths or details.
    catch (cause) { throw fail(cause instanceof PrivacyGateError && SAFE_ERROR_CODES.has(cause.code) ? cause.code : INVALID); }
  }
  async #execute(input) {
    plain(input, ['action', 'destinationRef', 'artifactRef', 'signal']);
    const { action, signal } = input;
    if (!ACTIONS.includes(action) || signal !== undefined && !(signal instanceof AbortSignal)) throw fail();
    const destinationRef = opaqueRef(input.destinationRef), artifactRef = opaqueRef(input.artifactRef), adapter = this.#adapters.get(action);
    if (!adapter) throw fail('PRIVACY_EXTERNAL_ADAPTER_REQUIRED');
    active(signal);
    const contextRef = Object.freeze({ action, destinationRef });
    // Synchronous snapshot BEFORE the first await. Host epoch must include the
    // policy AND destination registry; synchronous final comparison closes the
    // gap after the gate's asynchronous policy/destination reads.
    const context = contextSnapshot(this.#context(contextRef)), binding = stable(context);
    const current = () => { active(signal); if (stable(contextSnapshot(this.#context(contextRef))) !== binding) throw fail('PRIVACY_STALE'); return true; };
    const destination = await step(() => this.#destination(destinationRef, context), signal);
    current();
    const target = freeze(validateDestination({ ...jsonCopy(destination), model: `external:${action}` }));
    opaqueRef(target.id);
    const targetBinding = stable(target);
    const prepared = await step(() => adapter.prepare(artifactRef, context), signal);
    current();
    const body = bodySnapshot(prepared, adapter.maxBytes), metadata = jsonCopy(prepared.metadata ?? {});
    const decoded = await step(() => adapter.inspect(body), signal);
    current();
    plain(decoded, ['material', 'provenance']);
    if (!Object.hasOwn(decoded, 'material')) throw fail();
    const material = jsonCopy(decoded.material), provenance = jsonCopy(decoded.provenance ?? []);
    if (!Array.isArray(provenance)) throw fail();
    const purpose = `external-action:${action}`;
    const scopeBinding = createHmac('sha256', this.#bindingKey).update(stable(context.scope)).digest('hex');
    const manifest = JSON.stringify({ version: 1, action, purpose, context: { scopeBinding, partition: context.contextPartition, epoch: context.epoch, revision: context.revision }, destination: target, artifact: { decoder: adapter.id, sha256: body.sha256, byteLength: body.byteLength, contentType: body.contentType }, material, metadata });
    if (Buffer.byteLength(manifest) > MAX_ARTIFACT_BYTES) throw fail();
    const packet = freeze({ action, purpose, context: { scopeBinding, partition: context.contextPartition, epoch: context.epoch, revision: context.revision }, destination: target, body, material, metadata });
    const gate = new PrivacyGate({
      getPolicy: async scope => {
        current(); const layers = jsonCopy(await step(() => this.#policy(scope, context), signal)); current();
        if (!composePolicy(layers).enabled) throw fail('PRIVACY_EXTERNAL_POLICY_REQUIRED');
        return layers;
      },
      resolveDestination: async () => {
        current(); const fresh = await step(() => this.#destination(destinationRef, context), signal); current();
        const resolved = validateDestination({ ...jsonCopy(fresh), model: `external:${action}` });
        if (stable(resolved) !== targetBinding) throw fail('PRIVACY_STALE');
        return resolved;
      },
      requestApproval: this.#approval ? (review, controls) => {
        // A masked manifest is not a sanitized wire artifact. Do not ask the
        // user to approve a description that this fixed dispatcher cannot send.
        if (review.payload !== manifest) throw fail('PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED');
        return this.#approval(review, controls);
      } : undefined,
      audit: record => this.#audit(freeze({ timestamp: record.timestamp, requestId: record.requestId, action, destinationId: record.destinationId, locality: record.locality, classification: record.classification, attributes: jsonCopy(record.attributes), decision: record.decision,
        // Versions are trusted authority but may still have an unsafe human
        // label. Keep opaque version ids, never log a path/name-bearing label.
        policyVersions: record.policyVersions.map(item => Object.freeze({ layer: item.layer, version: /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(item.version) ? item.version : `binding-${createHmac('sha256', this.#bindingKey).update(item.version).digest('hex')}` })),
      })),
      now: this.#now,
    });
    return gate.executeAction({ scope: context.scope, destinationRef, purpose, contextPartition: context.contextPartition, revision: context.revision, body: manifest, provenance, signal, assertCurrent: current,
      transport: checked => {
        // Never inspect a masked description then send the original pack/upload.
        // No JSON reconstruction, await, file reopen or caller callback occurs
        // between the final synchronous binding check and fixed dispatch.
        if (checked !== manifest) throw fail('PRIVACY_EXTERNAL_REWRITE_UNSUPPORTED');
        current();
        const operation = Promise.resolve(adapter.dispatch(packet, Object.freeze({ signal, assertCurrent: current })));
        // The dispatcher is fixed trusted code, not a renderer-supplied callback.
        // It must honor cancellation too; racing completion never retracts bytes
        // already sent and is never permission for an automatic retry.
        void operation.catch(() => {});
        return step(() => operation, signal);
      },
    });
  }
}

module.exports = { ExternalActions, ACTIONS, MAX_ARTIFACT_BYTES };
