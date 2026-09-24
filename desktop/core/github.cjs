const { randomUUID } = require('node:crypto');
const name = value => { if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(value) || ['.', '..'].includes(value)) throw new Error('Ugyldigt konto- eller repositorynavn.'); return value; };
function repository(value) {
  if (typeof value !== 'string' || value.split('/').length !== 2) throw new Error('Angiv repository som ejer/navn.');
  return value.split('/').map(name).join('/');
}
class GitHub {
  constructor(store, { fetcher = (...args) => fetch(...args), clientID = process.env.HARNESS_GITHUB_CLIENT_ID || '', now = Date.now } = {}) {
    this.store = store; this.fetcher = fetcher; this.clientID = clientID; this.now = now; this.pending = null; this.generation = 0;
    this.id = 'github'; this.label = 'GitHub';
  }
  async request(url, { token, method = 'GET', body, missing = false } = {}) {
    let response;
    try { response = await this.fetcher(url, { method, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'AI-Harness', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); }
    catch { throw new Error(method === 'GET' ? 'GitHub kunne ikke kontaktes. Kontrollér netværket, og prøv igen.' : 'GitHub-handlingens resultat er ukendt. Kontrollér GitHub før et nyt forsøg; handlingen kan være gennemført.'); }
    if (response.status === 404 && missing) return null;
    if (!response.ok) throw new Error(response.status === 401 ? 'GitHub-adgangen er udløbet eller afvist. Forbind kontoen igen.' : response.status === 403 ? 'GitHub afviste handlingen. Kontrollér rettigheder, organisationsgodkendelse, SSO og kvote.' : response.status === 422 ? 'GitHub afviste oplysningerne. Navnet kan være optaget, eller organisationens regler kan blokere oprettelsen.' : `GitHub-handlingen mislykkedes (HTTP ${response.status}). Kontrollér resultatet på GitHub før et nyt forsøg.`);
    if (response.status === 204) return null;
    try { return await response.json(); } catch { throw new Error('GitHub returnerede et uventet svar.'); }
  }
  async credential() {
    const saved = (await this.store.read()).hosting?.github;
    if (!saved?.secret || (saved.expiresAt && saved.expiresAt <= this.now())) throw new Error('Forbind GitHub igen. Der er ingen gyldig gemt adgang.');
    return this.store.decrypt(saved);
  }
  async api(route, options = {}) { return this.request('https://api.github.com' + route, { ...options, token: await this.credential() }); }
  async state() {
    const saved = (await this.store.read()).hosting?.github;
    return { connected: Boolean(saved?.secret), login: saved?.login || '', expiresAt: saved?.expiresAt || null, expired: Boolean(saved?.expiresAt && saved.expiresAt <= this.now()), browserLogin: Boolean(this.clientID) };
  }
  async saveToken(token, expiresAt = null, generation = this.generation) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_\-]{10,500}$/.test(token)) throw new Error('Indtast et gyldigt GitHub-token i nøglefeltet.');
    const user = await this.request('https://api.github.com/user', { token }); name(user.login);
    const secret = this.store.encrypt(token);
    await this.store.update(state => { if (generation !== this.generation) throw new Error('Login blev annulleret.'); state.hosting = { ...state.hosting, github: { login: user.login, secret, expiresAt } }; });
    return this.state();
  }
  async connectToken(token) { this.cancel(); return this.saveToken(token); }
  cancel() { ++this.generation; this.pending = null; }
  async disconnect() { this.cancel(); await this.store.update(state => { if (state.hosting) delete state.hosting.github; }); return this.state(); }
  async startLogin() {
    this.cancel(); const generation = this.generation;
    if (!this.clientID) throw new Error('Browserlogin kræver HARNESS_GITHUB_CLIENT_ID fra projektets registrerede OAuth-app. Du kan bruge et GitHub-token i stedet.');
    const data = await this.request('https://github.com/login/device/code', { method: 'POST', body: { client_id: this.clientID, scope: 'repo read:org' } });
    if (generation !== this.generation) throw new Error('Login blev annulleret.');
    if (!data.device_code || !data.user_code || data.verification_uri !== 'https://github.com/login/device' || !(data.expires_in > 0)) throw new Error('GitHub kunne ikke starte Device Flow. Kontrollér appregistreringen.');
    const interval = Math.max(5, Number(data.interval) || 5) * 1000;
    this.pending = { id: randomUUID(), code: data.device_code, userCode: data.user_code, interval, next: this.now() + interval, expires: this.now() + Math.min(data.expires_in, 1800) * 1000, generation };
    return { id: this.pending.id, code: data.user_code, url: data.verification_uri, expiresAt: this.pending.expires, retryAfter: interval };
  }
  async poll(id) {
    const pending = this.pending;
    if (!pending || pending.id !== id) throw new Error('Start login igen.');
    if (pending.expires <= this.now()) { this.cancel(); throw new Error('Loginkoden er udløbet. Start login igen.'); }
    if (this.now() < pending.next) return { waiting: true, retryAfter: pending.next - this.now() };
    pending.next = this.now() + pending.interval;
    const data = await this.request('https://github.com/login/oauth/access_token', { method: 'POST', body: { client_id: this.clientID, device_code: pending.code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' } });
    if (pending !== this.pending) throw new Error('Login blev annulleret.');
    if (data.error === 'authorization_pending' || data.error === 'slow_down') { if (data.error === 'slow_down') pending.interval += 5000; pending.next = this.now() + pending.interval; return { waiting: true, retryAfter: pending.interval }; }
    if (!data.access_token) { this.cancel(); throw new Error('GitHub-login blev afvist eller udløb. Start login igen.'); }
    // Refresh-token bruges ikke; udløbet adgang kræver et nyt eksplicit login.
    const result = await this.saveToken(data.access_token, data.expires_in ? this.now() + data.expires_in * 1000 : null, pending.generation);
    this.pending = null; return { waiting: false, ...result };
  }
  async pages(route) {
    const result = [];
    for (let page = 1; page <= 50; page++) {
      const values = await this.api(`${route}${route.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
      if (!Array.isArray(values)) throw new Error('GitHub returnerede en ugyldig liste.');
      result.push(...values); if (values.length < 100) return result;
    }
    throw new Error('Listen er for stor. Angiv repository direkte som ejer/navn.');
  }
  async owners() {
    const user = await this.api('/user'); const orgs = await this.pages('/user/orgs');
    return [{ login: name(user.login), type: 'User' }, ...orgs.map(org => ({ login: name(org.login), type: 'Organization' }))];
  }
  async repositories() {
    return (await this.pages('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated')).filter(repo => repo.permissions?.push && !repo.archived && !repo.disabled).map(repo => this.metadata(repo));
  }
  metadata(repo) { if (!Number.isSafeInteger(repo.id) || typeof repo.private !== 'boolean') throw new Error('GitHub returnerede ufuldstændige repositoryoplysninger.'); const fullName = repository(repo.full_name); return { id: repo.id, fullName, url: `https://github.com/${fullName}`, gitURL: `https://github.com/${fullName}.git`, private: repo.private === true, writable: repo.permissions?.push === true, archived: repo.archived === true || repo.disabled === true }; }
  async get(fullName) { return this.metadata(await this.api('/repos/' + repository(fullName))); }
  async create({ owner, repo, visibility }) {
    name(owner); name(repo); if (!['private', 'public'].includes(visibility)) throw new Error('Vælg privat eller offentligt repository.');
    const owners = await this.owners(); const destination = owners.find(item => item.login === owner);
    if (!destination) throw new Error('Den valgte ejer er ikke tilgængelig for kontoen.');
    const result = await this.api(destination.type === 'User' ? '/user/repos' : `/orgs/${owner}/repos`, { method: 'POST', body: { name: repo, private: visibility === 'private', auto_init: false } });
    return this.metadata(result);
  }
}
module.exports = { GitHub, repository };
