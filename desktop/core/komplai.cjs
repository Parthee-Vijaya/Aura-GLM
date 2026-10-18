const http = require('node:http');
const { randomBytes, createHash, randomUUID, timingSafeEqual } = require('node:crypto');

const API = 'https://api.komplai.dk/v1/aura';
const ISSUER = 'https://auth.komplai.dk';
const messages = {
  aura_not_configured: 'komplai-login er ikke åbnet endnu. Kontakt komplai, eller vælg en anden forbindelse.',
  coding_not_enabled: 'Din organisation har ikke åbnet for kodeværktøjer. Bed jeres administrator kontakte komplai.',
  insufficient_scope: 'Denne konto har ikke adgang til kodeværktøjer.',
  invalid_token: 'Adgangen blev afvist. Log ind med komplai igen, eller kontrollér dit API-token.',
  invalid_api_key: 'Adgangen er udløbet eller tilbagekaldt. Log ind med komplai igen, eller indsæt et nyt API-token.',
  api_key_required: 'Brug et komplai API-token til kodeværktøjer.',
  terms_changed: 'Organisationens priser eller datavilkår har ændret sig. Hent modellerne igen og gennemgå oplysningerne.',
  ai_credit_exhausted: 'Organisationens loft for AI-forbrug er nået for denne måned. Kontakt jeres administrator.',
  publishing_not_enabled: 'Din organisation har ikke komplai Publish. Bed jeres administrator kontakte komplai.',
  key_limit: 'Du har for mange aktive udgivelsesadgange. Log ud på en anden computer, eller vent til en adgang udløber.',
};
const PUBLISH_GRANT = /^komp_publish_grant_[a-f0-9]{64}$/;
// Nyere API'er oplyser, hvad hver organisation giver adgang til. Ældre svar er kun AI.
function organisation(entry) {
  if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string') throw new Error('komplais organisationer kunne ikke læses.');
  if (!Object.hasOwn(entry, 'coding')) return { ...entry, coding: true, publishing: null };
  const publishing = entry.publishing && typeof entry.publishing.address === 'string' && /^[a-z0-9.-]{3,253}$/.test(entry.publishing.address) ? { address: entry.publishing.address, tier: String(entry.publishing.tier || '') } : null;
  return { ...(entry.coding || {}), id: entry.id, name: entry.name, coding: Boolean(entry.coding), publishing };
}
async function json(url, { key, body, method = body ? 'POST' : 'GET', signal, fetcher = fetch } = {}) {
  let response;
  try { response = await fetcher(url, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error(signal?.aborted ? 'Login blev afbrudt.' : 'komplai kunne ikke kontaktes. Prøv igen, når forbindelsen virker.'); }
  const bodyText = await readBounded(response, 2_000_000);
  let data; try { data = JSON.parse(bodyText); } catch { throw new Error('Svaret fra komplai kunne ikke læses.'); }
  if (!response.ok) { const error = new Error(messages[data.error] || (response.status === 401 ? messages.invalid_token : response.status === 403 ? messages.insufficient_scope : 'komplai kunne ikke gennemføre handlingen. Prøv igen.')); error.status = response.status; if (typeof data.error === 'string' && /^[a-z_]{1,50}$/.test(data.error)) error.code = data.error; throw error; }
  return data;
}
async function readBounded(response, maxBytes) {
  const reader = response.body?.getReader(); let size = 0, parts = [];
  if (!reader) throw new Error('komplai svarede ikke.');
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > maxBytes) throw new Error('Svaret fra komplai er for stort.'); parts.push(Buffer.from(item.value)); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(parts).toString();
}
const same = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Login foregår i systembrowseren. OAuth-tokenet findes kun i hukommelsen indtil organisationsvalget. */
class KomplaiLogin {
  constructor({ baseURL = API, issuer = ISSUER, fetcher = (...args) => fetch(...args) } = {}) { this.baseURL = baseURL; this.issuer = issuer; this.fetcher = fetcher; this.pending = null; }
  cancel() { const current = this.pending; this.pending = null; if (current) { clearTimeout(current.timer); current.controller.abort(); current.server?.close(); current.reject?.(new Error('Login blev afbrudt.')); current.token = ''; } }
  async start(openBrowser) {
    this.cancel();
    const current = { controller: new AbortController(), token: '', organisations: [] };
    this.pending = current;
    current.timer = setTimeout(() => { if (this.pending === current) this.cancel(); }, 300000); current.timer.unref();
    try {
      const config = await json(`${this.baseURL}/config`, { fetcher: this.fetcher, signal: current.controller.signal });
      if (config.issuer !== this.issuer || typeof config.clientId !== 'string' || !config.clientId || !Array.isArray(config.scopes) || config.scopes.some(s => typeof s !== 'string' || /\s/.test(s))) throw new Error('komplais loginopsætning kunne ikke bekræftes.');
      for (const endpoint of [config.authorizationEndpoint, config.tokenEndpoint]) { if (typeof endpoint !== 'string' || new URL(endpoint).origin !== this.issuer || new URL(endpoint).username || new URL(endpoint).password || new URL(endpoint).hash) throw new Error('komplais loginadresse kunne ikke bekræftes.'); }
      const state = randomBytes(32).toString('base64url'), verifier = randomBytes(48).toString('base64url');
      const code = new Promise((resolve, reject) => {
        current.reject = reject;
        current.server = http.createServer((req, res) => {
          res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'"); res.setHeader('Referrer-Policy', 'no-referrer');
          const expectedHost = `127.0.0.1:${current.server.address()?.port}`;
          if (req.method !== 'GET' || req.headers.host !== expectedHost || req.url.length > 8192) { res.writeHead(400).end(); return; }
          const url = new URL(req.url, `http://${expectedHost}`);
          if (url.pathname !== '/komplai/callback' || url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), state)) { res.writeHead(400).end('Login kunne ikke bekræftes.'); return; }
          const value = url.searchParams.get('code');
          if (current.received) { res.writeHead(409).end(); return; }
          current.received = true;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          if (url.searchParams.has('error') || url.searchParams.getAll('code').length !== 1 || !value || value.length > 4096) { res.writeHead(400).end('Login blev ikke gennemført. Gå tilbage til Aura.'); reject(new Error('Login blev ikke gennemført.')); }
          else { res.end('Du er logget ind. Gå tilbage til Aura og vælg organisation.'); resolve(value); }
          current.server.close();
        });
        current.server.on('error', () => reject(new Error('Aura kunne ikke åbne den lokale loginforbindelse.')));
      });
      // Fejl ved åbning af browseren må ikke efterlade et ubehandlet Promise.
      code.catch(() => {});
      await new Promise((resolve, reject) => { current.server.once('error', reject); current.server.listen(0, '127.0.0.1', resolve); });
      const redirect = `http://127.0.0.1:${current.server.address().port}/komplai/callback`;
      const url = new URL(config.authorizationEndpoint);
      for (const [key, value] of Object.entries({ response_type: 'code', client_id: config.clientId, redirect_uri: redirect, scope: config.scopes.join(' '), state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' })) url.searchParams.set(key, value);
      await openBrowser(url.href);
      const authorizationCode = await code;
      const response = await this.fetcher(config.tokenEndpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.any([current.controller.signal, AbortSignal.timeout(15000)]), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: config.clientId, code: authorizationCode, redirect_uri: redirect, code_verifier: verifier }) });
      // Tokenresponsen føres aldrig videre til brugerfladen eller til fejlbeskeder.
      if (!response.ok) { await response.body?.cancel(); throw new Error('komplai kunne ikke bekræfte login. Prøv igen.'); }
      const body = await readBounded(response, 64000);
      let tokens; try { tokens = JSON.parse(body); } catch { throw new Error('Ugyldigt svar fra login.'); }
      if (typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.access_token.length > 16000 || tokens.token_type?.toLowerCase() !== 'bearer') throw new Error('Ugyldigt svar fra login.');
      if (this.pending !== current) throw new Error('Login blev afbrudt.');
      current.token = tokens.access_token;
      const result = await json(`${this.baseURL}/organisations?include=publishing`, { key: current.token, fetcher: this.fetcher, signal: current.controller.signal });
      if (!Array.isArray(result.organisations)) throw new Error('komplais organisationer kunne ikke læses.');
      current.organisations = result.organisations.map(organisation);
      return { organisations: current.organisations };
    } catch (error) { if (this.pending === current) this.cancel(); throw error; }
  }
  /** komplai Publish for samme login: en særskilt adgang, der kun kan oprette og opdatere personens egne apps. */
  async connectPublishing(organisationID, store) {
    const current = this.pending, organisation = current?.organisations.find(o => o.id === organisationID);
    if (!current?.token || !organisation) throw new Error('Log ind igen, og vælg din organisation.');
    if (!organisation.publishing) throw new Error(messages.publishing_not_enabled);
    store.encrypt('kontrol');
    const result = await json(`${this.baseURL}/publishing/connect`, { key: current.token, fetcher: this.fetcher, signal: current.controller.signal, body: { organisationId: organisation.id, acceptPublishing: true } });
    if (typeof result.secret !== 'string' || !PUBLISH_GRANT.test(result.secret) || typeof result.id !== 'string' || !Number.isFinite(Date.parse(result.expiresAt)) || result.address !== organisation.publishing.address) throw new Error('komplai returnerede ikke en gyldig udgivelsesadgang.');
    try {
      const previous = (await store.read()).hosting?.komplai;
      await store.update(state => { state.hosting = { ...state.hosting, komplai: { secret: store.encrypt(result.secret), grantId: result.id, organisationId: organisation.id, organisationName: organisation.name, address: result.address, expiresAt: result.expiresAt } }; });
      // En erstattet adgang tilbagekaldes, så den ikke ligger tilbage på serveren.
      if (previous?.secret) await revokePublishing(store.decrypt(previous), this.baseURL, this.fetcher).catch(() => {});
    } catch (error) { await revokePublishing(result.secret, this.baseURL, this.fetcher).catch(() => {}); throw error; }
    return publishingState(store);
  }
  async connect(organisationID, store) {
    const current = this.pending, organisation = current?.organisations.find(o => o.id === organisationID);
    if (!current?.token || !organisation) throw new Error('Log ind igen, og vælg din organisation.');
    if (!organisation.coding) throw new Error(messages.coding_not_enabled);
    // Kontroller nøglelageret før udstedelse, så en låst nøglering ikke skaber glemte adgange.
    store.encrypt('kontrol');
    const result = await json(`${this.baseURL}/connect`, { key: current.token, fetcher: this.fetcher, signal: current.controller.signal, body: { organisationId: organisation.id, contract: organisation.contract, acceptSharedCredits: true } });
    if (typeof result.secret !== 'string' || !/^kp_live_[a-zA-Z0-9_-]{43}$/.test(result.secret) || typeof result.id !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('komplai returnerede ikke en gyldig adgang.');
    try {
      const connection = { id: randomUUID(), kind: 'komplai', name: `komplai · ${organisation.name}`.slice(0, 100), baseURL: `${this.baseURL}/v1`, secret: store.encrypt(result.secret), account: { organisationId: organisation.id, organisationName: organisation.name, keyId: result.id, expiresAt: result.expiresAt } };
      await store.update(state => { state.connections.push(connection); });
      this.cancel(); return store.publicConnection(connection);
    } catch (error) { await json(`${this.baseURL}/session`, { key: result.secret, method: 'DELETE', fetcher: this.fetcher }).catch(() => {}); throw error; }
  }
}
async function revokePublishing(secret, baseURL = API, fetcher = fetch) {
  return json(`${baseURL}/publishing/session`, { method: 'DELETE', key: secret, fetcher });
}
async function publishingState(store, now = Date.now()) {
  const saved = (await store.read()).hosting?.komplai;
  if (!saved?.secret) return { connected: false };
  return { connected: true, organisationId: saved.organisationId, organisationName: saved.organisationName, address: saved.address, expiresAt: saved.expiresAt, expired: Date.parse(saved.expiresAt) <= now };
}
/** Log ud tilbagekalder på serveren før den lokale sletning. Ved netværksfejl bevares adgangen, så det kan prøves igen. */
async function disconnectPublishing(store, baseURL = API, fetcher = fetch) {
  const saved = (await store.read()).hosting?.komplai;
  if (saved?.secret) await revokePublishing(store.decrypt(saved), baseURL, fetcher);
  await store.update(state => { if (state.hosting) delete state.hosting.komplai; });
  return publishingState(store);
}
async function disconnect(connection, key) {
  return json(`${connection.baseURL.replace(/\/v1$/, '')}/session`, { method: 'DELETE', key });
}
async function account(connection, key) { return json(`${connection.baseURL.replace(/\/v1$/, '')}/account`, { key }); }
module.exports = { API, ISSUER, KomplaiLogin, json, readBounded, disconnect, account, organisation, publishingState, disconnectPublishing, revokePublishing };
