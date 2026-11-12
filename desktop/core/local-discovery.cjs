'use strict';
const { requestJSON, modelCatalogURL } = require('./connections.cjs');
const { composePolicy, PrivacyGateError } = require('./privacy/policy.cjs');
const OLLAMA_URL = 'http://127.0.0.1:11434';
const TIMEOUT_MS = 2500;
const SERVERS = Object.freeze([
  Object.freeze({ kind: 'ollama', title: 'Ollama', baseURL: OLLAMA_URL }),
  Object.freeze({ kind: 'lmstudio', title: 'LM Studio', baseURL: 'http://127.0.0.1:1234/v1' }),
  Object.freeze({ kind: 'vllm', title: 'vLLM', baseURL: 'http://127.0.0.1:8000/v1' }),
]);
const MODEL_ID = /^[a-zA-Z0-9_./:@+-]{1,200}$/;
const privacyFailure = error => typeof error?.code === 'string' && error.code.startsWith('PRIVACY_');

// Fixed, keyless GET probes only. Loopback is discovery evidence, never proof
// that a model executes locally; no result creates a connection or permission.
async function discoverLocalModels(read = requestJSON, { authorize = async () => () => true } = {}) {
  const finalGuards = [];
  const servers = await Promise.all(SERVERS.map(async server => {
    const result = { ...server, executionVerified: false, models: [] };
    const url = modelCatalogURL(server);
    let current;
    try { current = await authorize(server); }
    catch (error) {
      if (['PRIVACY_BLOCKED', 'PRIVACY_LOCAL_REQUIRED'].includes(error?.code)) return { ...result, status: 'blocked', reason: error.code === 'PRIVACY_LOCAL_REQUIRED' ? 'Kun lokal kræver en dokumenteret og godkendt model på denne computer.' : 'Projektets dataregler tillader ikke katalogsøgning hos denne server.' };
      throw error;
    }
    const assertCurrent = address => {
      if (address !== undefined && address !== url) throw new PrivacyGateError('PRIVACY_DESTINATION_INVALID', 'Søgningen må kun kontakte den faste loopback-katalogadresse.');
      if (current(url) !== true) throw new PrivacyGateError('PRIVACY_STALE', 'Datareglerne er ændret. Søg efter lokale modeller igen.');
      return true;
    };
    finalGuards.push(assertCurrent);
    try {
      assertCurrent(url);
      const data = await read(url, { signal: AbortSignal.timeout(TIMEOUT_MS), assertCurrent });
      assertCurrent(url);
      const entries = server.kind === 'ollama' ? data?.models : data?.data;
      if (!Array.isArray(entries)) return { ...result, status: 'invalid' };
      const models = entries.filter(model => typeof (server.kind === 'ollama' ? model?.name : model?.id) === 'string' && MODEL_ID.test(server.kind === 'ollama' ? model.name : model.id)).slice(0, 100).map(model => {
        const id = server.kind === 'ollama' ? model.name : model.id;
        return { id, name: id, remote: Boolean(model.remote_host || /:.*cloud/.test(id)) };
      });
      return { ...result, models, status: models.length ? 'found' : 'empty' };
    } catch (error) {
      // A changed policy invalidates the whole discovery, including earlier
      // successful probes. Never return stale model metadata after revocation.
      assertCurrent(url);
      if (privacyFailure(error)) throw error;
      return { ...result, status: 'unavailable' };
    }
  }));
  for (const current of finalGuards) current();
  // Existing callers retain Ollama's original shape and interpretation.
  const ollama = servers[0];
  return { status: ollama.status, baseURL: ollama.baseURL, models: ollama.models.map(({ name, remote }) => ({ name, remote })), ...(ollama.reason ? { reason: ollama.reason } : {}), servers };
}
async function discoverForWorkbench(bench, trustedChatID, read = requestJSON) {
  const scope = bench.discoveryScope(trustedChatID);
  await bench.store.queue;
  const state = await bench.store.read();
  const authorize = async server => {
    const saved = state.connections.find(connection => connection.kind === server.kind && connection.baseURL === server.baseURL);
    if (saved) return bench.privacy.discoveryPermit(scope, saved);
    const binding = bench.privacy.snapshotBinding(scope);
    const policy = composePolicy(await bench.privacy.policies(scope));
    const url = modelCatalogURL(server);
    const current = address => {
      if (address !== undefined && address !== url) throw new PrivacyGateError('PRIVACY_DESTINATION_INVALID', 'Katalogadressen svarer ikke til den faste lokale server.');
      if (bench.privacy.snapshotBinding(scope) !== binding) throw new PrivacyGateError('PRIVACY_STALE', 'Datareglerne er ændret. Søg efter lokale modeller igen.');
      return true;
    };
    current();
    if (policy.enabled) throw new PrivacyGateError('PRIVACY_BLOCKED', 'Serveren er ikke en gemt, godkendt modtager. Tilføj den gennem AI-forbindelser først.');
    return current;
  };
  return discoverLocalModels(read, { authorize });
}
module.exports = { discoverLocalModels, discoverForWorkbench, OLLAMA_URL, SERVERS, TIMEOUT_MS };
