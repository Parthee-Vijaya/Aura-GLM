const { randomUUID, createHash } = require('node:crypto');
const { API, json } = require('./komplai.cjs');

const text = (value, max = 6000) => typeof value === 'string' && value.trim() && value.length <= max;
function checkedAccount(value) {
  const credential = value?.credential;
  if (!credential || !text(credential.id, 200) || !Array.isArray(credential.scopes) || !credential.scopes.every(scope => text(scope, 100)) || !text(credential.expiresAt, 100) || !Number.isFinite(Date.parse(credential.expiresAt)))
    throw new Error('Komplai mangler oplysninger om tokenets rettigheder eller udløb. API-token kan tilsluttes, når API-opdateringen er klar.');
  if (!['coding:read', 'coding:complete'].every(scope => credential.scopes.includes(scope)))
    throw new Error('Tokenet skal have både coding:read og coding:complete. Opret et token til kodeværktøjer i Komplai.');
  if (Date.parse(credential.expiresAt) <= Date.now()) throw new Error('Tokenet er udløbet. Opret et nyt i Komplai.');
  if (!text(value.id, 200) || !text(value.name, 200) || !text(value.contract, 200) || !Number.isSafeInteger(value.balance?.availableMicros) || value.balance.availableMicros < 0)
    throw new Error('Komplais organisationsoplysninger kunne ikke bekræftes. Tokenet er ikke gemt.');
  const data = {};
  for (const field of ['recipients', 'region', 'training', 'retention', 'source', 'checkedAt', 'version', 'mode', 'accounting', 'platformStorage']) {
    if (!text(value.data?.[field])) throw new Error('Komplais datavilkår kunne ikke læses. Tokenet er ikke gemt.');
    data[field] = value.data[field];
  }
  return { id: value.id, name: value.name, contract: value.contract, balance: { availableMicros: value.balance.availableMicros }, data,
    credential: { id: credential.id, scopes: [...new Set(credential.scopes)].sort(), expiresAt: credential.expiresAt } };
}
function fingerprint(account) {
  const { balance, ...terms } = account;
  return createHash('sha256').update(JSON.stringify(terms)).digest('hex');
}

// Tokenet findes kun i hovedprocessen indtil bekræftelsen. Der sendes ingen modelopgave under kontrollen.
class KomplaiToken {
  constructor({ baseURL = API, fetcher = (...args) => fetch(...args) } = {}) { this.baseURL = baseURL; this.fetcher = fetcher; this.pending = null; }
  cancel() { const current = this.pending; this.pending = null; if (current) { clearTimeout(current.timer); current.controller.abort(); current.key = ''; } }
  current(pending) { if (this.pending !== pending || pending.controller.signal.aborted) throw new Error('Tokenopsætningen blev afbrudt. Indtast tokenet igen.'); }
  async check(input) {
    this.cancel();
    if (typeof input !== 'string' || !/^kp_live_[A-Za-z0-9_-]{43}$/.test(input.trim())) throw new Error('Indsæt et Komplai API-token, der begynder med kp_live_.');
    const pending = { key: input.trim(), id: randomUUID(), controller: new AbortController() };
    this.pending = pending;
    pending.timer = setTimeout(() => this.pending === pending && this.cancel(), 300000); pending.timer.unref();
    try {
      const account = checkedAccount(await json(`${this.baseURL}/account`, { key: pending.key, fetcher: this.fetcher, signal: pending.controller.signal }));
      this.current(pending); pending.account = account;
      return { reviewID: pending.id, account };
    } catch (error) { if (this.pending === pending) this.cancel(); throw error; }
  }
  async connect(reviewID, store) {
    const pending = this.pending;
    if (!pending?.account || reviewID !== pending.id) throw new Error('Kontrollér tokenet igen, før du tilslutter det.');
    this.current(pending);
    store.encrypt('kontrol');
    const account = checkedAccount(await json(`${this.baseURL}/account`, { key: pending.key, fetcher: this.fetcher, signal: pending.controller.signal }));
    this.current(pending);
    if (fingerprint(account) !== fingerprint(pending.account)) {
      this.cancel(); throw new Error('Organisationen, tokenet eller datavilkårene er ændret. Kontrollér tokenet igen, og gennemgå de nye oplysninger.');
    }
    const connection = { id: randomUUID(), kind: 'komplai', name: `Komplai · ${account.name}`.slice(0, 100), baseURL: `${this.baseURL}/v1`, secret: store.encrypt(pending.key),
      account: { organisationId: account.id, organisationName: account.name, keyId: account.credential.id, expiresAt: account.credential.expiresAt, authMethod: 'token' } };
    await store.update(state => { this.current(pending); state.connections.push(connection); });
    this.cancel(); return store.publicConnection(connection);
  }
}
module.exports = { KomplaiToken, checkedAccount };
