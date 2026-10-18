const zlib = require('node:zlib');
const { json } = require('./komplai.cjs');

// komplai Publish: organisationens apps på {app}.komplai.run.
// Aura uploader en gemt Git-version med den udgivelsesadgang, der blev givet ved login.
const HUB = 'https://hub.komplai.dk';
const SUFFIX = '.komplai.run';
const LABEL = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const RESERVED = new Set(['acme', 'admin', 'api', 'app', 'apps', 'auth', 'cdn', 'control', 'dns', 'docs', 'help', 'hub', 'komplai', 'login', 'logout', 'mail', 'ns1', 'ns2', 'publish', 'root', 'security', 'smtp', 'status', 'support', 'system', 'www']);
// Samme filtyper som komplais appmiljø modtager.
const EXTENSIONS = new Set(['html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'csv', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'otf', 'pdf', 'mp3', 'mp4', 'webm', 'ogg', 'wav', 'wasm']);
const messages = {
  invalid_slug: 'Adressen kan ikke bruges. Brug 3 til 40 små bogstaver, tal og bindestreger. Ord som admin og www er reserveret.',
  slug_taken: 'Adressen er allerede i brug. Vælg en anden.',
  publishing_inactive: 'Organisationens komplai Publish er ikke åben lige nu. Kontakt jeres administrator.',
  unauthorised: 'Udgivelsesadgangen er udløbet eller tilbagekaldt. Log ind med komplai igen.',
  forbidden: 'Du kan kun udgive til apps, du selv har oprettet. Vælg en anden app, eller opret en ny.',
  not_found: 'Appen findes ikke længere hos komplai. Vælg en anden app, eller opret en ny.',
  upload_limit: 'Udgivelsen er for stor til komplai Publish (højst 10 MB pakket).',
  invalid_archive: 'komplai kunne ikke læse pakken. Kontrollér filerne, og prøv igen.',
  missing_index: 'Mappen skal have en index.html.',
  storage_limit: 'Organisationens plads til apps er brugt. Slet gamle versioner eller apps i komplai.',
  storage_headroom: 'Organisationens plads til apps er brugt. Slet gamle versioner eller apps i komplai.',
  metadata_capacity: 'Organisationen har nået grænsen for antal apps. Slet en app i komplai, eller udgiv til en eksisterende.',
  publication_uncertain: 'komplai bekræftede ikke udgivelsen. Kontrollér appen i komplai, før du prøver igen.',
  visibility_changed: 'Appens adgang er ændret. Gennemgå udgivelsen igen. Adgang til en eksisterende app ændres i komplai.',
};

function suggestLabel(name) {
  let label = String(name || '').toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (label.length > 40) { const cut = label.slice(0, 41), boundary = cut.lastIndexOf('-'); label = (boundary >= 3 ? cut.slice(0, boundary) : cut.slice(0, 40)).replace(/-+$/, ''); }
  return validLabel(label) ? label : '';
}
function validLabel(value) { return typeof value === 'string' && LABEL.test(value) && !value.includes('--') && !RESERVED.has(value) && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value); }

/** Filer, komplai ikke modtager, efter samme regler som appmiljøet: navne med a-z, tal, _ . - og /,
 * ingen skjulte stier eller kildekort, kendte filtyper og intet under _komplai. */
function refusedFiles(files) {
  return files.map(f => f.file).filter(name => {
    const parts = name.split('/'), extension = parts.at(-1).includes('.') ? parts.at(-1).split('.').pop().toLowerCase() : '';
    return name.length > 240 || !/^[A-Za-z0-9_][A-Za-z0-9_. /-]*$/.test(name) || name.includes('//') || parts.some(p => !p || p.startsWith('.')) || parts[0] === '_komplai' || name.endsWith('.map') || !EXTENSIONS.has(extension);
  });
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let c = 0xffffffff; for (const byte of buffer) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
/** En almindelig ZIP i hukommelsen: UTF-8-navne, deflate når det fylder mindre, ingen ekstra felter. */
function zip(files) {
  const locals = [], central = []; let offset = 0;
  for (const { file, data } of files) {
    const name = Buffer.from(file, 'utf8'), packed = zlib.deflateRawSync(data, { level: 9 }), deflate = packed.length < data.length, body = deflate ? packed : data, crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(deflate ? 8 : 0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0x21, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0800, 8); entry.writeUInt16LE(deflate ? 8 : 0, 10); entry.writeUInt16LE(0, 12); entry.writeUInt16LE(0x21, 14); entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(body.length, 20); entry.writeUInt32LE(data.length, 24); entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(offset, 42);
    locals.push(local, name, body); central.push(entry, name); offset += 30 + name.length + body.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function appURL(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.endsWith(SUFFIX) || u.pathname !== '/' || u.search || u.hash) throw Error('komplai returnerede en ukendt adresse.');
  return u.origin;
}

class KomplaiDeployment {
  constructor(store, { hub = HUB, fetcher = (...args) => fetch(...args), now = () => Date.now() } = {}) { this.store = store; this.hub = hub; this.fetcher = fetcher; this.now = now; this.id = 'komplai'; }
  async account() {
    const saved = (await this.store.read()).hosting?.komplai;
    if (!saved?.secret) throw Error('Log ind med komplai for at udgive til komplai Publish.');
    if (Date.parse(saved.expiresAt) <= this.now()) throw Error('Udgivelsesadgangen er udløbet. Log ind med komplai igen.');
    return { ...saved, key: this.store.decrypt(saved) };
  }
  async call(route, options = {}) {
    const { key } = await this.account();
    try { return await json(this.hub + route, { ...options, key, fetcher: this.fetcher }); }
    catch (error) { throw Error(messages[error.code] || error.message); }
  }
  /** Organisationens adresse og dine apps. Bruges også af Del-dialogen. */
  async overview() {
    const account = await this.account(), d = await this.call('/api/publish/native');
    if (!d || d.address !== account.address || !Array.isArray(d.apps)) throw Error('komplais svar matcher ikke din udgivelsesadgang. Log ind igen.');
    return { organisationName: account.organisationName, address: d.address, slugs: d.slugs === true, apps: d.apps.map(a => ({ id: a.id, name: a.name, slug: a.slug, url: appURL(a.url), visibility: a.visibility, activeRelease: a.activeRelease, releases: a.releases?.length || 0 })) };
  }
  async address(slug, appId) {
    if (!validLabel(slug)) return { available: false, reason: 'invalid_slug', message: messages.invalid_slug };
    const q = new URLSearchParams({ slug, ...(appId ? { appId } : {}) });
    const r = await this.call('/api/publish/native/address?' + q);
    return { ...r, message: r.available ? '' : messages[r.reason] || messages.invalid_slug };
  }
  async inspect(config) {
    const d = await this.overview(), portal = `${this.hub}/publish`;
    const access = config.visibility === 'public' ? 'Alle med linket kan åbne appen. Undlad fortrolige oplysninger.' : 'Kun nuværende medlemmer af organisationen kan åbne appen efter login med komplai.';
    const base = { owner: d.organisationName, address: d.address, visibility: config.visibility, access, region: 'komplais appmiljø hos Hetzner i Tyskland (EU). Appen kører i den besøgendes browser.', settings: {}, environmentKeys: [], environmentNote: 'Appen får ingen hemmelige værdier. Serverkode køres ikke.' };
    if (config.appId) {
      const app = d.apps.find(a => a.id === config.appId);
      if (!app) throw Error(messages.not_found);
      if (app.visibility !== config.visibility) throw Error(messages.visibility_changed);
      return { ...base, id: app.id, name: app.name, host: new URL(app.url).hostname, url: app.url, created: false, currentVisibility: app.visibility, portal: `${portal}?app=${app.id}` };
    }
    if (d.slugs && config.slug) { const free = await this.address(config.slug); if (!free.available) throw Error(free.message); }
    const host = d.slugs ? (config.slug ? `${config.slug}.${d.address}` : 'en tilfældig adresse under ' + d.address) : 'en ny adresse under ' + d.address;
    return { ...base, id: null, name: config.name, host, url: null, created: true, portal };
  }
  async deploy(config, artifact, target, { onCreated = async () => {}, onUploaded = async () => {} } = {}) {
    // Hub har ingen atomisk kobling mellem release og ændret adgang. Aura ændrer
    // derfor aldrig en eksisterende apps adgang som led i uploaden.
    if (target.id && target.currentVisibility !== config.visibility) throw Error(messages.visibility_changed);
    const refused = refusedFiles(artifact.files);
    if (refused.length) throw Error(`komplai Publish kan ikke modtage ${refused.length === 1 ? 'denne fil' : 'disse filer'}: ${refused.slice(0, 5).join(', ')}${refused.length > 5 ? ' …' : ''}. Filnavne må kun have a-z, tal, bindestreg og punktum, og filtypen skal være en webside, et billede, en skrifttype eller lignende.`);
    const single = artifact.files.length === 1 && artifact.files[0].file === 'index.html';
    const body = single ? artifact.files[0].data : zip(artifact.files);
    if (body.length > 10 * 1024 * 1024) throw Error(messages.upload_limit);
    let appId = target.id;
    if (!appId) {
      const created = await this.call('/api/publish/native/apps', { body: { name: config.name, visibility: config.visibility, ...(config.slug !== undefined ? { slug: config.slug } : {}) } });
      appId = created.id; await onCreated(appId);
    }
    const app = await this.upload(appId, body, single ? 'text/html' : 'application/zip');
    if (!app.activeRelease) throw Error(messages.publication_uncertain);
    // Bevar bekræftet upload, selv hvis en efterfølgende oversigt ikke kan hentes.
    await onUploaded({ id: app.activeRelease, appId, state: 'UPLOADED', url: target.url || null });
    // Uploadsvaret er appens metadata; adressen læses fra oversigten, som komplai selv beregner.
    const listed = (await this.overview()).apps.find(a => a.id === appId);
    return { id: app.activeRelease, state: listed?.activeRelease === app.activeRelease ? 'READY' : 'UPLOADED', url: listed?.url ?? null, appId };
  }
  async upload(appId, body, type) {
    const { key } = await this.account();
    let response;
    // Hovedprocessen sender ingen Origin; komplai afviser uploads fra websider.
    try { response = await this.fetcher(`${this.hub}/api/publish/${appId}/releases`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(120000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': type, Accept: 'application/json' }, body }); }
    catch { throw Error(messages.publication_uncertain); }
    let data = {}; try { data = await response.json(); } catch {}
    if (!response.ok) throw Error(messages[data.error] || messages.publication_uncertain);
    return data;
  }
  async status(config, receipt) {
    const d = await this.overview(), app = d.apps.find(a => a.id === (receipt.appId || config.appId));
    if (!app) return { state: 'REMOVED', url: null };
    return { state: app.activeRelease === receipt.id ? 'READY' : app.activeRelease ? 'REPLACED' : 'UNPUBLISHED', url: app.url, visibility: app.visibility };
  }
}
module.exports = { KomplaiDeployment, zip, crc32, refusedFiles, suggestLabel, validLabel, appURL, HUB };
