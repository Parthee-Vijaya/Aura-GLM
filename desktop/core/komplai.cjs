const http = require('node:http');
const { randomBytes, createHash, randomUUID, timingSafeEqual } = require('node:crypto');

const API = 'https://api.komplai.dk/v1/aura';
const ISSUER = 'https://auth.komplai.dk';
const messages = {
  aura_not_configured: 'Komplai-login er ikke åbnet endnu. Kontakt Komplai, eller vælg en anden forbindelse.',
  coding_not_enabled: 'Din organisation har ikke åbnet for kodeværktøjer. Bed jeres administrator kontakte Komplai.',
  insufficient_scope: 'Denne konto har ikke adgang til kodeværktøjer.',
  invalid_token: 'Adgangen blev afvist. Log ind med Komplai igen, eller kontrollér dit API-token.',
  invalid_api_key: 'Adgangen er udløbet eller tilbagekaldt. Log ind med Komplai igen, eller indsæt et nyt API-token.',
  api_key_required: 'Brug et Komplai API-token til kodeværktøjer.',
  terms_changed: 'Organisationens priser eller datavilkår har ændret sig. Hent modellerne igen og gennemgå oplysningerne.',
  ai_credit_exhausted: 'Organisationens AI-kreditter er brugt. Kontakt jeres administrator.',
};
async function json(url, { key, body, method = body ? 'POST' : 'GET', signal, fetcher = fetch } = {}) {
  let response;
  try { response = await fetcher(url, { method, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000), headers: { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
  catch { throw new Error(signal?.aborted ? 'Login blev afbrudt.' : 'Komplai kunne ikke kontaktes. Prøv igen, når forbindelsen virker.'); }
  const bodyText = await readBounded(response, 2_000_000);
  let data; try { data = JSON.parse(bodyText); } catch { throw new Error('Svaret fra Komplai kunne ikke læses.'); }
  if (!response.ok) { const error = new Error(messages[data.error] || (response.status === 401 ? messages.invalid_token : response.status === 403 ? messages.insufficient_scope : 'Komplai kunne ikke gennemføre handlingen. Prøv igen.')); error.status = response.status; throw error; }
  return data;
}
async function readBounded(response, maxBytes) {
  const reader = response.body?.getReader(); let size = 0, parts = [];
  if (!reader) throw new Error('Komplai svarede ikke.');
  try { while (true) { const item = await reader.read(); if (item.done) break; size += item.value.length; if (size > maxBytes) throw new Error('Svaret fra Komplai er for stort.'); parts.push(Buffer.from(item.value)); } } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
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
      if (config.issuer !== this.issuer || typeof config.clientId !== 'string' || !config.clientId || !Array.isArray(config.scopes) || config.scopes.some(s => typeof s !== 'string' || /\s/.test(s))) throw new Error('Komplais loginopsætning kunne ikke bekræftes.');
      for (const endpoint of [config.authorizationEndpoint, config.tokenEndpoint]) { if (typeof endpoint !== 'string' || new URL(endpoint).origin !== this.issuer || new URL(endpoint).username || new URL(endpoint).password || new URL(endpoint).hash) throw new Error('Komplais loginadresse kunne ikke bekræftes.'); }
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
      if (!response.ok) { await response.body?.cancel(); throw new Error('Komplai kunne ikke bekræfte login. Prøv igen.'); }
      const body = await readBounded(response, 64000);
      let tokens; try { tokens = JSON.parse(body); } catch { throw new Error('Ugyldigt svar fra login.'); }
      if (typeof tokens.access_token !== 'string' || !tokens.access_token || tokens.access_token.length > 16000 || tokens.token_type?.toLowerCase() !== 'bearer') throw new Error('Ugyldigt svar fra login.');
      if (this.pending !== current) throw new Error('Login blev afbrudt.');
      current.token = tokens.access_token;
      const result = await json(`${this.baseURL}/organisations`, { key: current.token, fetcher: this.fetcher, signal: current.controller.signal });
      if (!Array.isArray(result.organisations)) throw new Error('Komplais organisationer kunne ikke læses.');
      current.organisations = result.organisations;
      return { organisations: result.organisations };
    } catch (error) { if (this.pending === current) this.cancel(); throw error; }
  }
  async connect(organisationID, store) {
    const current = this.pending, organisation = current?.organisations.find(o => o.id === organisationID);
    if (!current?.token || !organisation) throw new Error('Log ind igen, og vælg din organisation.');
    // Kontroller nøglelageret før udstedelse, så en låst nøglering ikke skaber glemte adgange.
    store.encrypt('kontrol');
    const result = await json(`${this.baseURL}/connect`, { key: current.token, fetcher: this.fetcher, signal: current.controller.signal, body: { organisationId: organisation.id, contract: organisation.contract, acceptSharedCredits: true } });
    if (typeof result.secret !== 'string' || !/^kp_live_[a-zA-Z0-9_-]{43}$/.test(result.secret) || typeof result.id !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('Komplai returnerede ikke en gyldig adgang.');
    try {
      const connection = { id: randomUUID(), kind: 'komplai', name: `Komplai · ${organisation.name}`.slice(0, 100), baseURL: `${this.baseURL}/v1`, secret: store.encrypt(result.secret), account: { organisationId: organisation.id, organisationName: organisation.name, keyId: result.id, expiresAt: result.expiresAt } };
      await store.update(state => { state.connections.push(connection); });
      this.cancel(); return store.publicConnection(connection);
    } catch (error) { await json(`${this.baseURL}/session`, { key: result.secret, method: 'DELETE', fetcher: this.fetcher }).catch(() => {}); throw error; }
  }
}
async function disconnect(connection, key) {
  return json(`${connection.baseURL.replace(/\/v1$/, '')}/session`, { method: 'DELETE', key });
}
async function account(connection, key) { return json(`${connection.baseURL.replace(/\/v1$/, '')}/account`, { key }); }
module.exports = { API, ISSUER, KomplaiLogin, json, readBounded, disconnect, account };
