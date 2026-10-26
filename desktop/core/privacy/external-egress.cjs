// SPDX-License-Identifier: EUPL-1.2
'use strict';

// Host-only adapter for application egress. Do not expose request/dispatch,
// decoders, roots or destination registration through renderer IPC or a model.
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { ExternalActions, ACTIONS, MAX_ARTIFACT_BYTES } = require('./external-actions.cjs');
const { composePolicy, PrivacyGateError } = require('./index.cjs');
const { stable } = require('./policy.cjs');
const { parseInspectedJSON } = require('./inspector.cjs');

const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code = 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED') => new PrivacyGateError(code, 'Handlingen mangler en godkendt, fuldt kontrolleret ekstern rute. Ingen data er sendt.');
function readConfig(file) {
  let fd;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 2_000_000) throw fail('PRIVACY_CONTROL_FAILED');
    return JSON.parse(fs.readFileSync(fd, 'utf8'));
  } catch (error) { if (error.code === 'ENOENT') return {}; throw fail('PRIVACY_CONTROL_FAILED'); }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function text(bytes) {
  try { const result = new TextDecoder('utf-8', { fatal: true }).decode(bytes); if (result.includes('\0')) throw fail(); return result; }
  catch { throw fail('PRIVACY_LOCAL_REQUIRED'); }
}
function inspectText(body, contentType) {
  const value = text(body);
  if (/^application\/(?:[a-z0-9.+-]*\+)?json$/i.test(contentType)) {
    try { const numericLexemes = []; return { json: parseInspectedJSON(value, { numbers: numericLexemes }), numericLexemes }; }
    catch { throw fail('PRIVACY_LOCAL_REQUIRED'); }
  }
  if (/^(?:text\/[a-z0-9.+-]+|application\/(?:javascript|xml|x-www-form-urlencoded))$/i.test(contentType)) return { text: value };
  throw fail('PRIVACY_LOCAL_REQUIRED');
}
function destinationURL(value) {
  let url; try { url = new URL(value); } catch { throw fail('PRIVACY_DESTINATION_INVALID'); }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash) throw fail('PRIVACY_DESTINATION_INVALID');
  // A server may decode separators before routing while WHATWG URL leaves
  // them encoded. Such a request could pass /approved yet reach /admin. Check
  // every decoding layer before all destination-prefix comparisons. Ordinary
  // UTF-8 names and escaped spaces remain valid; routing ambiguity does not.
  let pathname = url.pathname;
  for (let depth = 0; /%[0-9a-f]{2}/i.test(pathname); depth++) {
    if (depth >= 8 || /%(?:2f|5c)/i.test(pathname)) throw fail('PRIVACY_DESTINATION_INVALID');
    try { pathname = decodeURIComponent(pathname); } catch { throw fail('PRIVACY_DESTINATION_INVALID'); }
    const normalized = pathname.normalize('NFKC');
    if (/[\\\u0000-\u001f\u007f]/.test(normalized) || normalized.split('/').some(part => part === '.' || part === '..') || normalized.split('/').length !== pathname.split('/').length) throw fail('PRIVACY_DESTINATION_INVALID');
  }
  return url;
}
function restrictConversations(layers, conversations) {
  if (!conversations || typeof conversations !== 'object' || Array.isArray(conversations)) throw fail('PRIVACY_CONTROL_FAILED');
  const asLayer = (effective, version = hash(stable(effective))) => {
    const { allowedDestinationIds, ...base } = effective;
    return { ...base, ...(allowedDestinationIds === null || allowedDestinationIds === undefined ? {} : { allowedDestinationIds }), version };
  };
  let effective = composePolicy(layers), remaining = Object.values(conversations);
  // If a conversation first enables protection, compose it with the original
  // raw project/organization layers before normalizing. Their disabled flags
  // must not discard an existing ceiling or approved-destination restriction.
  if (!effective.enabled) {
    const first = remaining.findIndex(layer => layer?.enabled === true);
    if (first !== -1) { effective = composePolicy({ ...layers, conversation: remaining[first] }); remaining = remaining.filter((_layer, index) => index !== first); }
  }
  for (const layer of remaining) effective = composePolicy({ ...(effective.enabled ? { organization: asLayer(effective) } : layers), conversation: layer });
  if (!effective.enabled) return layers;
  return { project: asLayer(effective, hash(stable([layers, conversations]))) };
}

class ExternalEgress {
  constructor(getPrivacy) { this.getPrivacy = getPrivacy; }
  service() { return typeof this.getPrivacy === 'function' ? this.getPrivacy() : null; }
  scope(root) {
    const service = this.service();
    const requested = root || service?.bench.project?.root || null;
    if (!requested) return Object.freeze({ kind: 'idea', root: null, chat: null });
    if (typeof requested !== 'string') throw fail('PRIVACY_CONTROL_FAILED');
    const canonical = value => { try { return fs.realpathSync(value); } catch (error) { if (error.code === 'ENOENT') return path.resolve(value); throw fail('PRIVACY_CONTROL_FAILED'); } };
    const actual = canonical(requested), matches = new Set();
    // Store.projectKey hashes the host's saved spelling. Canonicalizing that
    // spelling here (e.g. /tmp -> /private/tmp on macOS) can select an empty,
    // unprotected record. Use realpath only to match a trusted project; keep
    // its original identity for policy lookup and reject ambiguous identities.
    if (typeof service?.bench.project?.root === 'string' && canonical(service.bench.project.root) === actual) matches.add(service.bench.project.root);
    for (const chat of service?.bench.chats?.values?.() || []) {
      // The host owns this association. A model, copy marker or arbitrary
      // copied harness.json is never authority for a weaker source project.
      if (typeof chat?.project?.root === 'string' && (canonical(chat.project.root) === actual || typeof chat?.root === 'string' && canonical(chat.root) === actual)) matches.add(chat.project.root);
    }
    if (matches.size > 1) throw fail('PRIVACY_CONTROL_FAILED');
    return Object.freeze({ kind: 'project', root: matches.size ? [...matches][0] : path.resolve(requested), chat: null });
  }
  binding(scope) {
    const service = this.service(); if (!service) return 'legacy-no-privacy-service';
    const registry = readConfig(path.join(service.directory, 'external-destinations.json'));
    const settings = readConfig(path.join(service.bench.store.root, 'settings.json'));
    // Bind every stored conversation restriction as well as encrypted account
    // identity. A chat switch must never weaken project exports. Raw credentials
    // are neither decrypted nor included in the approval or audit.
    const state = scope.root ? settings.projects?.[service.bench.store.projectKey(scope.root)]?.privacy : settings.privacyIdea;
    const provenanceRevision = scope.root ? settings.projects?.[service.bench.store.projectKey(scope.root)]?.privacyFileProvenanceRevision || null : null;
    return hash(stable([service.snapshotBinding(scope, '__external__'), registry, state || {}, settings.hosting || {}, provenanceRevision]));
  }
  async policies(scope) {
    const service = this.service(); if (!service) return {};
    const layers = await service.policies(scope);
    const state = await service.bench.store.read();
    const conversations = scope.root ? state.projects?.[service.bench.store.projectKey(scope.root)]?.privacy?.conversations ?? {} : {};
    // The effective restriction is a trusted synthetic layer, not user/model
    // input. Its version changes with every original project/conversation layer.
    return restrictConversations(layers, conversations);
  }
  async active(root) { return composePolicy(await this.policies(this.scope(root))).enabled === true; }
  activeSync(root) {
    const service = this.service(); if (!service) return false;
    const scope = this.scope(root), settingsPath = path.join(service.bench.store.root, 'settings.json'), settings = readConfig(settingsPath);
    if (fs.existsSync(settingsPath) && (settings.version !== 1 || !settings.projects || typeof settings.projects !== 'object' || Array.isArray(settings.projects) || !Array.isArray(settings.connections))) throw fail('PRIVACY_CONTROL_FAILED');
    const organization = readConfig(path.join(service.directory, 'organization-policy.json'));
    const project = scope.root ? settings.projects?.[service.bench.store.projectKey(scope.root)]?.privacy || {} : settings.privacyIdea || {};
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw fail('PRIVACY_CONTROL_FAILED');
    const { conversations = {}, ...base } = project;
    if (!conversations || typeof conversations !== 'object' || Array.isArray(conversations)) throw fail('PRIVACY_CONTROL_FAILED');
    const layers = { ...(Object.keys(organization).length ? { organization } : {}), ...(Object.keys(base).length ? { project: base } : {}) };
    const configured = composePolicy(restrictConversations(layers, conversations)).enabled === true;
    // Synchronous preview/resource guards must retain the same history floor
    // as policies(). A disabled settings checkbox cannot release prior data.
    // Validate every relevant ciphertext before trusting the opaque index;
    // no synchronous keychain decryption is needed to know protection is on.
    const floors = service.floorEntries(scope, settings);
    for (const [key, expected] of floors) service.readFloorFileSync(key, expected);
    return configured || floors.length > 0;
  }
  async assertLegacyAllowed(root) {
    if (await this.active(root)) throw fail();
  }
  async legacyPermit(root) {
    const scope = this.scope(root), initial = this.binding(scope);
    if (composePolicy(await this.policies(scope)).enabled) throw fail();
    const current = () => { if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE'); return true; };
    current(); return current;
  }
  async webfetch({ root, url, signal, dispatch = fetch }) {
    const scope = this.scope(root), initial = this.binding(scope);
    const target = destinationURL(url);
    let destinationId;
    if (await this.active(root)) {
      const registry = readConfig(path.join(this.service().directory, 'external-destinations.json'));
      const matches = Object.entries(registry).filter(([, item]) => {
        if (!Array.isArray(item.actions) || !item.actions.includes('browser-http')) return false;
        const endpoint = destinationURL(item.endpoint), prefix = endpoint.pathname.replace(/\/$/, '');
        return endpoint.origin === target.origin && !endpoint.search && (target.pathname === prefix || target.pathname.startsWith(prefix + '/') || !prefix);
      });
      if (matches.length !== 1) throw fail('PRIVACY_DESTINATION_INVALID');
      destinationId = matches[0][0];
    }
    if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE');
    return this.request({ root, action: 'browser-http', destinationId, url: target.href, signal, dispatch: (address, options) => { if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE'); return dispatch(address, options); } });
  }
  async openExternal({ root, url, launch }) {
    if (typeof launch !== 'function') throw fail();
    const scope = this.scope(root), initial = this.binding(scope);
    const enabled = await this.active(root);
    if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE');
    if (!enabled) return launch(url);
    const target = destinationURL(url), registry = readConfig(path.join(this.service().directory, 'external-destinations.json'));
    const matches = Object.entries(registry).filter(([, item]) => {
      if (!Array.isArray(item.actions) || !item.actions.includes('browser-open')) return false;
      const endpoint = destinationURL(item.endpoint), prefix = endpoint.pathname.replace(/\/$/, '');
      return endpoint.origin === target.origin && !endpoint.search && (target.pathname === prefix || target.pathname.startsWith(prefix + '/') || !prefix);
    });
    if (matches.length !== 1) throw fail('PRIVACY_DESTINATION_INVALID');
    // Dispatch hands this already reviewed URL to the user's external browser.
    // It does not claim to contain that browser's cookies, redirects or scripts.
    return this.request({ root, action: 'browser-open', destinationId: matches[0][0], url: target.href, dispatch: address => { if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE'); return launch(address); } });
  }
  async request({ root, action = 'integration', destinationId, url, method = 'GET', body, contentType = 'application/json', headers = {}, inspect = inspectText, provenance = [], signal, dispatch = fetch }) {
    const scope = this.scope(root), initial = this.binding(scope);
    const current = () => { signal?.throwIfAborted(); if (this.binding(scope) !== initial) throw fail('PRIVACY_STALE'); return true; };
    const layers = await this.policies(scope), policy = composePolicy(layers); current();
    if (!policy.enabled) { current(); return dispatch(url, { method, ...(body === undefined ? {} : { body }), headers, signal, redirect: 'error' }); }
    // Generic host actions have no proof that a summary or artifact is
    // independent of protected project sources. Keep their source floor even
    // if the caller omitted a filename or the content looks innocuous. A
    // separately attested release must use its own typed capability.
    if (!Array.isArray(provenance)) throw fail('PRIVACY_CONTROL_FAILED');
    const inherited = [...provenance, ...(policy.protectedSources || [])];
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/.test(destinationId || '') || !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw fail();
    const service = this.service(), registry = readConfig(path.join(service.directory, 'external-destinations.json'));
    const registered = registry[destinationId];
    if (!registered || registered.id !== undefined && registered.id !== destinationId) throw fail('PRIVACY_DESTINATION_INVALID');
    const destination = Object.freeze({ ...registered, id: destinationId });
    if (!Array.isArray(destination.actions) || !destination.actions.includes(action) || destination.actions.some(value => !ACTIONS.includes(value))) throw fail('PRIVACY_DESTINATION_INVALID');
    const endpoint = destinationURL(destination.endpoint), request = destinationURL(url);
    const prefix = endpoint.pathname.replace(/\/$/, '');
    if (endpoint.search || request.origin !== endpoint.origin || !(request.pathname === prefix || request.pathname.startsWith(prefix + '/') || prefix === '')) throw fail('PRIVACY_DESTINATION_INVALID');
    // Only the broker may supply authorization. No ambient cookies, arbitrary
    // sensitive headers, redirects or renderer-supplied transport are inherited.
    const brokerHeaders = {}, reviewedHeaders = {};
    for (const [key, value] of Object.entries(headers)) {
      if (typeof value !== 'string' || /[\r\n\0]/.test(value)) throw fail();
      if (/^authorization$/i.test(key)) brokerHeaders[key] = value;
      else if (/^(?:accept|content-type|user-agent|git-protocol)$/i.test(key)) reviewedHeaders[key] = value;
      else throw fail();
    }
    const payload = body === undefined ? null : Buffer.from(body);
    if (payload !== null && !Object.keys(reviewedHeaders).some(key => key.toLowerCase() === 'content-type')) reviewedHeaders['Content-Type'] = contentType;
    if (Object.entries(reviewedHeaders).some(([key, value]) => key.toLowerCase() === 'content-type' && value !== contentType)) throw fail();
    if (payload && payload.length > MAX_ARTIFACT_BYTES / 2) throw fail('PRIVACY_LOCAL_REQUIRED');
    const wire = Buffer.from(JSON.stringify({ version: 1, method, address: request.href, headers: reviewedHeaders, contentType, payload: payload === null ? null : payload.toString('base64') }));
    const ref = randomUUID();
    const actions = new ExternalActions({
      getContext: () => { current(); return { scope, contextPartition: `external:${action}`, epoch: initial, revision: initial }; },
      getPolicy: () => this.policies(scope),
      resolveDestination: () => {
        current(); const fresh = readConfig(path.join(service.directory, 'external-destinations.json'))[destinationId];
        if (stable(fresh) !== stable(registered)) throw fail('PRIVACY_STALE');
        return destination;
      },
      requestApproval: (review, controls) => service.requestApproval(review, { ...controls, scope }),
      audit: entry => service.audit(entry),
      adapters: { [action]: {
        id: `aura-host-${action}-v1`, maxBytes: MAX_ARTIFACT_BYTES,
        prepare: artifact => { if (artifact !== ref) throw fail(); current(); return { body: wire, contentType: 'application/json', metadata: {} }; },
        inspect: snapshot => {
          const decoded = JSON.parse(Buffer.from(snapshot.data, 'base64').toString('utf8'));
          const bytes = decoded.payload === null ? null : Buffer.from(decoded.payload, 'base64');
          if (JSON.stringify(decoded) !== wire.toString('utf8') || bytes && bytes.toString('base64') !== decoded.payload) throw fail();
          // Inspect exactly the bytes the dispatcher will decode, including the
          // complete request address and every non-credential header.
          return { material: { method: decoded.method, requestAddress: decoded.address, headers: decoded.headers, contentType: decoded.contentType, content: bytes === null ? null : inspect(bytes, decoded.contentType) }, provenance: inherited };
        },
        dispatch: (packet, controls) => {
          const decoded = JSON.parse(Buffer.from(packet.body.data, 'base64').toString('utf8'));
          controls.assertCurrent();
          return dispatch(decoded.address, { method: decoded.method, ...(decoded.payload === null ? {} : { body: Buffer.from(decoded.payload, 'base64') }), headers: { ...decoded.headers, ...brokerHeaders }, signal: controls.signal, redirect: 'error' });
        },
      } },
    });
    return actions.execute({ action, destinationRef: destinationId, artifactRef: ref, signal });
  }
}

module.exports = { ExternalEgress, inspectText, text };
