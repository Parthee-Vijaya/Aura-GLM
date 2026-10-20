const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const dns = require('node:dns/promises');
const { isIP } = require('node:net');
const { randomUUID, createHash } = require('node:crypto');
const { command } = require('./deployment-providers.cjs');
const { zip } = require('./komplai-publish.cjs');

// Kontrakten følger den publicerede @promte/app-upload 0.2.0.
// Login tilhører Promtes CLI. Aura læser kun adgang til den valgte HTTPS-vært.
const DEFAULT_HOST = 'https://app.promte.dk';
const ACCOUNT_REQUIRED = 'Kræver konto og betalt aftale';
const SKIP_DIRS = new Set(['node_modules', 'bower_components', '.git', '.hg', '.svn', '.promte-source', '.cache', '.yarn', '.npm', '.pnpm-store', '.turbo', '.vite', '.parcel-cache', '.next', '.nuxt', '.output', 'dist', 'build', 'out', 'coverage', '__pycache__', '.pytest_cache', '.mypy_cache', '.venv', 'venv', '.ssh', '.aws', '.azure', '.gcloud', '.kube', '.docker', '__macosx', '.claude', '.agents', '.codex', '.cursor', '.idea', '.vscode']);
const SKIP_FILE = /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.ds_store|\.yarnrc(?:\.yml)?|\.secrets?|credentials(?:\.[^.]+)?|secrets?\.(?:json|ya?ml|toml)|id_(?:rsa|dsa|ecdsa|ed25519)(?:\.pub)?|promte-app-upload\.config\.json|yarn\.lock|pnpm-lock\.yaml|vite\.config\.[cm]?[jt]s)$|\.(?:pem|key|p12|pfx|keystore|jks|zip|tar|tgz|gz|7z|rar|map|tsbuildinfo|log|pyc|o|so|dll|exe|class)$/i;
const UNSUPPORTED_BUILD_FILE = /^(?:(?:postcss|tailwind|babel|webpack|rollup)\.config\..+|\.babelrc(?:\..*)?|\.postcssrc(?:\..*)?)$/i;
const ignoredSource = file => file.split('/').some(p => SKIP_DIRS.has(p.toLowerCase())) || SKIP_FILE.test(path.posix.basename(file));
const runtimeDependencies = pkg => ({ ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies });
function preparePromteArtifact(artifact) {
  let pkg;
  try { pkg = JSON.parse(artifact.files.find(f => f.file === 'package.json')?.data); } catch {}
  const noDependencies = pkg && typeof pkg === 'object' && !Object.keys(runtimeDependencies(pkg)).length;
  const excluded = artifact.files.filter(f => ignoredSource(f.file) || (noDependencies && f.file === 'package-lock.json'));
  const files = artifact.files.filter(f => !excluded.includes(f)).map(f => ({ ...f, sha256: createHash('sha256').update(f.data).digest('hex') }));
  return { ...artifact, files, bytes: files.reduce((sum, f) => sum + f.data.length, 0), hash: createHash('sha256').update(JSON.stringify(files.map(f => [f.file, f.sha256]))).digest('hex'), excludedFiles: [...new Set([...(artifact.excludedFiles || []), ...excluded.map(f => f.file)])] };
}
function publicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 198 && [18, 19].includes(b)));
  }
  if (isIP(address) === 6) return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0):/i.test(address);
  return false;
}
function promteHost(value = DEFAULT_HOST) {
  let u; try { u = new URL(value); } catch { throw Error('Angiv Promte-installationens HTTPS-adresse.'); }
  const hostname = u.hostname.toLowerCase();
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash || !hostname.includes('.') || isIP(hostname.replace(/^\[|\]$/g, '')) || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(hostname)) throw Error('Brug en offentlig HTTPS-adresse til Promte uden sti, port eller loginoplysninger.');
  return u.origin;
}
function identifier(value, label = 'arbejdsområdets ID') {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) throw Error(`Angiv ${label} fra Promte.`);
  return value;
}
function promteConfiguration(input) {
  const directory = input.directory || '.';
  if (typeof directory !== 'string' || directory.includes('\\') || directory.includes(':') || directory.includes('\0') || directory.startsWith('/') || directory.split('/').includes('..') || path.posix.normalize(directory) !== directory) throw Error('Vælg en relativ projektmappe uden ..');
  return { provider: 'promte', mode: 'source', host: promteHost(input.host), workspaceId: identifier(input.workspaceId), directory, frontend: '.', api: '' };
}
function validatePromteArtifact(artifact) {
  if (!Array.isArray(artifact.files) || !artifact.files.length || artifact.files.length > 2000) throw Error('Promte kræver 1 til 2.000 kildefiler.');
  let bytes = 0;
  const seen = new Set();
  for (const { file, data } of artifact.files) {
    if (typeof file !== 'string' || !Buffer.isBuffer(data) || /[\x00-\x1f\\:]/.test(file) || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p)) || seen.has(file)) throw Error('Kildepakken indeholder en ugyldig eller gentaget filsti.');
    seen.add(file); bytes += data.length;
    if (ignoredSource(file) || UNSUPPORTED_BUILD_FILE.test(path.posix.basename(file))) throw Error(`Promte modtager ikke ${file}. Vælg en kildekodemappe uden byggeoutput, nøgler eller særskilt byggekonfiguration.`);
  }
  if (bytes > 50 * 1024 * 1024) throw Error('Promte-kildekoden må højst fylde 50 MB udpakket.');
  const manifest = artifact.files.find(f => f.file === 'package.json');
  let pkg; try { pkg = JSON.parse(manifest?.data); } catch { throw Error('Promte-kildekoden mangler en gyldig package.json.'); }
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw Error('package.json skal beskrive et Promte-projekt.');
  const dependencies = runtimeDependencies(pkg);
  if (['react', 'react-dom', '@promte/app-library'].some(p => Object.hasOwn(dependencies, p))) throw Error('Flyt react, react-dom og @promte/app-library til devDependencies. Promte leverer dem ved byggeriet.');
  if (Object.keys(dependencies).length && !seen.has('package-lock.json')) throw Error('Gem package-lock.json sammen med projektets afhængigheder.');
  if (Object.keys(dependencies).length > 20) throw Error('Promte understøtter højst 20 afhængigheder.');
  for (const [name, script] of Object.entries(pkg.scripts || {})) {
    if (/^(?:preinstall|install|postinstall|prepare|prebuild|postbuild)$/.test(name) || (name === 'build' && !['vite build', 'tsc && vite build'].includes(script))) throw Error('Promte kræver sin faste byggeopsætning. Fjern installationsscripts og brug vite build som build-script.');
  }
  if (!seen.has('index.html') && ![...seen].some(f => /^(?:src\/)?main\.(?:jsx|tsx|js|ts)$/.test(f))) throw Error('Promte-kildekoden mangler index.html eller main.jsx/tsx/js/ts i roden eller src.');
}
async function readCredentials(host) {
  const location = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'promte', 'credentials.json');
  try {
    const stat = await fs.stat(location);
    if (!stat.isFile() || stat.size > 1024 * 1024) return null;
    const saved = JSON.parse(await fs.readFile(location, 'utf8'))[host];
    return saved && typeof saved.token === 'string' && saved.token.length > 0 && !/[\r\n]/.test(saved.token) ? saved : null;
  } catch { return null; }
}
async function addressFor(host, lookup) {
  let addresses; try { addresses = await lookup(new URL(host).hostname, { all: true }); } catch { throw Error('Promte-adressen kunne ikke findes. Kontrollér adressen og forbindelsen.'); }
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw Error('Promte-adressen må ikke pege på et lokalt eller privat netværk.');
  return addresses[0];
}
// Fasthold den kontrollerede DNS-adresse under selve TLS-forbindelsen.
function pinnedRequest(url, options, address) {
  return new Promise((resolve, reject) => {
    let timer;
    const request = https.request(url, { method: options.method || 'GET', headers: options.headers, lookup: (_host, lookupOptions, done) => lookupOptions?.all ? done(null, [address]) : done(null, address.address, address.family) }, response => {
      const chunks = []; let bytes = 0;
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) response.destroy(Error('For stort Promte-svar.')); else chunks.push(chunk); });
      response.on('error', error => { clearTimeout(timer); reject(error); });
      response.on('end', () => { clearTimeout(timer); resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, text: async () => Buffer.concat(chunks).toString('utf8') }); });
    });
    timer = setTimeout(() => request.destroy(Error('Promte svarede ikke.')), options.timeout || 30000);
    request.on('error', error => { clearTimeout(timer); reject(error); }); request.end(options.body);
  });
}
class PromteSetup {
  constructor({ run = command, readCredentials: reader = readCredentials, lookup = dns.lookup } = {}) { this.run = run; this.reader = reader; this.lookup = lookup; }
  async state({ host = DEFAULT_HOST } = {}) {
    host = promteHost(host);
    let installed = false;
    try { const help = await this.run(process.env.HARNESS_PROMTE_PATH || 'promte-app-upload', ['--help']); installed = help.includes('promte-app-upload login') && help.includes('promte-app-upload status'); } catch {}
    return { host, installed, connected: Boolean((await this.reader(host))?.token), accountRequired: ACCOUNT_REQUIRED, loginURL: host, signupURL: 'https://promte.com/kontakt' };
  }
  async login({ host = DEFAULT_HOST } = {}) {
    host = promteHost(host); await addressFor(host, this.lookup);
    if (!(await this.state({ host })).installed) throw Error('Installér Promtes officielle app-upload-værktøj, og prøv igen. Se opsætningsvejledningen.');
    await this.run(process.env.HARNESS_PROMTE_PATH || 'promte-app-upload', ['login', '--host', host], { timeout: 660000, extra: process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {} });
    const state = await this.state({ host });
    if (!state.connected) throw Error('Login blev ikke gemt af Promte. Prøv at logge ind igen.');
    return state;
  }
  async logout({ host = DEFAULT_HOST } = {}) {
    host = promteHost(host);
    await this.run(process.env.HARNESS_PROMTE_PATH || 'promte-app-upload', ['logout', '--host', host], { extra: process.env.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME } : {} });
    return this.state({ host });
  }
}
class PromteDeployment {
  constructor({ fetcher, readCredentials: reader = readCredentials, lookup = dns.lookup } = {}) { this.id = 'promte'; this.fetcher = fetcher; this.reader = reader; this.lookup = lookup; }
  async call(host, route, { body, token, upload = false, contentType } = {}) {
    host = promteHost(host);
    const address = await addressFor(host, this.lookup);
    if (!token) token = (await this.reader(host))?.token;
    if (!token) throw Error('Log ind med Promte til den valgte installation.');
    const options = { method: body === undefined ? 'GET' : 'POST', redirect: 'error', credentials: 'omit', timeout: upload ? 120000 : 30000, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': contentType || 'application/json' } : {}) }, body: body === undefined ? undefined : Buffer.isBuffer(body) ? body : JSON.stringify(body) };
    let response, value;
    try { response = await (this.fetcher ? this.fetcher(host + route, { ...options, signal: AbortSignal.timeout(options.timeout) }) : pinnedRequest(host + route, options, address)); const text = await response.text(); if (Buffer.byteLength(text) > 2 * 1024 * 1024) throw Error(); value = JSON.parse(text); } catch { throw Error('Promte-svaret kunne ikke kontrolleres. Se udgivelserne i Promte før et nyt forsøg.'); }
    if (response.status === 401) throw Error('Promte-login er udløbet eller afvist. Log ind igen.');
    if (response.status === 403) throw Error('Du skal være administrator i Promte-arbejdsområdet for at udgive.');
    if (!response.ok || !value || typeof value !== 'object') throw Error('Promte kunne ikke gennemføre handlingen. Kontrollér arbejdsområde og udgivelser i Promte.');
    return value;
  }
  async inspect(input) {
    const c = promteConfiguration(input);
    const capabilities = await this.call(c.host, '/api/app-upload/capabilities?workspaceId=' + encodeURIComponent(c.workspaceId));
    if (capabilities.available !== true || capabilities.uploadMode !== 'source') throw Error('Denne Promte-installation skal understøtte kildekodeupload. Kontakt administratoren om appbygning og din adgang.');
    return { id: c.workspaceId, name: c.workspaceId, owner: new URL(c.host).hostname, host: new URL(c.host).hostname, portal: c.host, region: 'Afhænger af jeres Promte-installation og dens tjenester.', settings: { uploadMode: 'source' }, environmentKeys: [], access: 'Adgang styres i Promte-arbejdsområdet. Kontrollér den med den tilsigtede bruger.', accountRequired: ACCOUNT_REQUIRED, uploadDestinations: [...new Set([c.host, DEFAULT_HOST])], materialNote: 'Kildekoden sendes til den valgte Promte-installation eller Promtes fælles uploadtjeneste på app.promte.dk. Promte bygger og gennemgår versionen.' };
  }
  async deploy(input, artifact, target, { onUploaded = async () => {} } = {}) {
    const c = promteConfiguration(input); validatePromteArtifact(artifact);
    if (target.id !== c.workspaceId || target.host !== new URL(c.host).hostname || target.settings?.uploadMode !== 'source') throw Error('Promte-destinationen har ændret sig. Gennemgå udgivelsen igen.');
    const archive = zip(artifact.files);
    if (archive.length > 20 * 1024 * 1024) throw Error('Promte-kildepakken må højst fylde 20 MB.');
    const prepared = await this.call(c.host, '/api/app-upload/prepare', { body: { workspaceId: c.workspaceId } });
    const version = Number(prepared.version);
    if (!Number.isSafeInteger(version) || version < 1) throw Error('Promte gav ikke et gyldigt versionsnummer. Kontrollér udgivelserne før et nyt forsøg.');
    const pending = { id: `version:${version}`, promteVersion: version, state: 'PREPARED', url: null };
    await onUploaded(pending);
    const uploadHost = prepared.uploadHost === 'same-server' ? c.host : promteHost(prepared.uploadHost || DEFAULT_HOST);
    if (![c.host, DEFAULT_HOST].includes(uploadHost) || typeof prepared.uploadToken !== 'string' || !prepared.uploadToken || /[\r\n]/.test(prepared.uploadToken)) throw Error('Promte gav en uploadadresse eller adgang, som ikke var med i gennemgangen. Kontrollér versionen i Promte.');
    const boundary = 'aura-' + randomUUID();
    const multipart = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="source"; filename="source.zip"\r\nContent-Type: application/zip\r\n\r\n`), archive, Buffer.from(`\r\n--${boundary}--\r\n`)]);
    await this.call(uploadHost, '/api/upload-app?' + new URLSearchParams({ workspaceId: c.workspaceId, version: String(version) }), { body: multipart, token: prepared.uploadToken, upload: true, contentType: 'multipart/form-data; boundary=' + boundary });
    await onUploaded({ ...pending, state: 'UPLOADED' });
    const finalized = await this.call(c.host, '/api/app-upload/finalize', { body: { workspaceId: c.workspaceId, version, zipName: 'source.zip', zipSize: archive.length } });
    const result = { ...pending, state: releaseState(finalized.status), ...(typeof finalized.releaseId === 'string' ? { id: identifier(finalized.releaseId, 'versionens ID') } : {}) };
    await onUploaded(result);
    return result;
  }
  async status(input, receipt) {
    const c = promteConfiguration(input);
    if (!Number.isSafeInteger(receipt.promteVersion) || receipt.promteVersion < 1 || receipt.target?.id !== c.workspaceId || receipt.target?.host !== new URL(c.host).hostname) throw Error('Promte-versionen matcher ikke destinationen.');
    const byVersion = receipt.id === `version:${receipt.promteVersion}`;
    const response = await this.call(c.host, '/api/app-upload/releases' + (byVersion ? '' : '/' + encodeURIComponent(identifier(receipt.id, 'versionens ID'))) + '?workspaceId=' + encodeURIComponent(c.workspaceId));
    const release = byVersion ? (Array.isArray(response.releases) ? response.releases : []).find(r => Number(r.version) === receipt.promteVersion) : response.release;
    if (!release) return { state: 'AWAITING_UPDATE', url: null };
    if (Number(release.version) !== receipt.promteVersion || (release.workspaceId && release.workspaceId !== c.workspaceId) || (!byVersion && release.id && release.id !== receipt.id)) throw Error('Promtes status gælder en anden version eller et andet arbejdsområde.');
    // CLI-kontrakten lover ingen bestemt URL i release-svaret. Portal åbnes fra target.
    return { id: typeof release.id === 'string' ? identifier(release.id, 'versionens ID') : receipt.id, state: releaseState(release.status), url: null, promteVersion: receipt.promteVersion };
  }
}
const RELEASE_STATES = new Map(Object.entries({ published: 'READY', reviewing: 'REVIEWING', pending: 'REVIEWING', building: 'BUILDING', blocked: 'BLOCKED', rejected: 'REJECTED', failed: 'ERROR' }));
function releaseState(status) { return RELEASE_STATES.get(status) || 'UNKNOWN'; }
module.exports = { PromteDeployment, PromteSetup, promteConfiguration, preparePromteArtifact, validatePromteArtifact, promteHost, publicAddress, releaseState, DEFAULT_HOST };
