// SPDX-License-Identifier: EUPL-1.2
'use strict';

// S4 · GradientDeck-kataloget og sikker hentning — VÆRTENS eget modul.
//
// `/stil` (alias /style) viser GradientDecks stilbibliotek og henter stilfiler
// sikkert ned i appens PRIVATE cache (`<store.root>/cache/gradientdeck/v1/`).
// S4 skriver kun dér: ingen DESIGN.md i projektet (S5), ingen modelkald og
// ingen aktivering — stilen er data uden instruktionsautoritet.
//
// Sikkerhedsmodellen:
//   · Fast origin `https://ui.gradientdeck.com`; KUN to ruter overhovedet kan
//     bygges: `/library.json` og `/styles/<slug>/design.md`. Værten bygger
//     selv URL'en — rendereren sender aldrig URL, headere eller transport.
//   · GET uden query, fragment, credentials, cookies eller body; redirects
//     afvises ALTID (fetch redirect:'error'), timeout 15 s inkl. body, og
//     kontrollen gælder også med Privacy Gate slået fra (legacyPermit-vejen).
//   · Egress går gennem ExternalEgress med action 'integration' og
//     destinationen 'aura-gradientdeck'. Webfetch kræver præcis ÉT match på
//     origin blandt browser-http-poster (external-egress.cjs), så en ekstra
//     browser-http-post på samme origin ville bryde brugerens egne regler —
//     derfor integration-actionen (dokumenteret i s4-report).
//   · Hele svarteksten tørkøres gennem privacy/inspector.cjs med projektets
//     gældende policy, FØR status «hentet»; base64-heuristikken bevares, og en
//     blokeret stil markeres sendable:false med en ærlig tekst. Egress
//     kontrollerer kun selve requesten — svaret kontrolleres her.
//   · Stilbiblioteket pakkes ALDRIG med appen; cachen lever i brugerdata.
//
// Alle fejl er danske og ærlige: intet sendes "alligevel", ingen reservehost,
// ingen automatisk retry-løkke, og ugyldige svar erstatter aldrig gyldig cache.

const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { TextDecoder } = require('node:util');
const { ExternalEgress } = require('./privacy/external-egress.cjs');
const { PrivacyGateError, composePolicy, stable } = require('./privacy/policy.cjs');
const { inspectRequest } = require('./privacy/inspector.cjs');
const { DESIGN_MAX_BYTES, designDocumentText } = require('./build-design.cjs');
// Én delt grammatikkilde med afsendelsesvagterne (app.js kræver dette modul
// gennem core/slash-commands.cjs-mønsteret): styleMessage afgør, om en besked
// er en selvstændig /stil-kommando; styleCommand her tilføjer slug-formatet.
const { styleMessage } = require('../ui/slash-commands.js');

const ORIGIN = 'https://ui.gradientdeck.com';
const DESTINATION_ID = 'aura-gradientdeck';
const DESTINATION_ACTION = 'integration';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 64;
// Grammatik og længde i én snæver kontrol: alt andet afvises før netværk,
// uden dekodning eller rettelse.
const validSlug = value => typeof value === 'string' && value.length >= 1 && value.length <= SLUG_MAX && SLUG.test(value);
const CATALOG_PATH = '/library.json';
const STYLE_PATH = slug => `/styles/${slug}/design.md`;
// Revitionsbindingen for «Husk for projektet»: de to rutemønstre, metoden og
// destinationen — alt andet (policy, registry, projekt) kommer med gennem
// ExternalEgress.binding() i fingeraftrykket.
const ROUTE_BINDING = JSON.stringify({ method: 'GET', destination: DESTINATION_ID, routes: [CATALOG_PATH, '/styles/<slug>/design.md'] });
const CATALOG_URL = ORIGIN + CATALOG_PATH;
const CATALOG_TTL = 7 * 24 * 60 * 60 * 1000;
const STYLE_TTL = 30 * 24 * 60 * 60 * 1000;
const CATALOG_MAX_BYTES = 4_000_000;
const CATALOG_MAX_ENTRIES = 10_000;
const TIMEOUT_MS = 15_000;

const rejectContent = kind => Object.assign(new Error(`${kind} blev afvist: formatet eller størrelsen understøttes ikke.`), { code: 'GRADIENTDECK_REJECTED' });
const unreachable = () => Object.assign(new Error('GradientDeck kunne ikke nås. Prøv igen.'), { code: 'GRADIENTDECK_UNREACHABLE' });
const cancelled = () => Object.assign(new Error('Hentningen blev annulleret. Intet er sendt.'), { code: 'GRADIENTDECK_CANCEL' });
const stale = () => Object.assign(new Error('Datareglerne er ændret. Gennemgå hentningen igen.'), { code: 'GRADIENTDECK_STALE' });
const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
// Strømmen lukkes bedst-effort, hvis den ikke skal læses: ingen kast her må
// skygge for den egentlige fejl.
const drain = async response => { try { await response?.body?.cancel?.(); } catch { /* allerede væk */ } };

// ── Den rene kommando-grammatik: hvornår er en besked en /stil-kommando? ──
// Kun en SELVSTÆNDIG `/stil <slug>` (eller aliaset /style) er kommandoen: ét
// token, ét argument — grænsen (styleMessage) lever i ui/slash-commands.js og
// deles med afsendelsesvagterne i app.js, så vært og grænse aldrig divergerer.
// Blandt prosa er den inert tekst (S2-semantikken), en bar `/stil` efter Send
// er også inert, og et argument med ugyldigt format får den ærlige fejl —
// uden dekodning, rettelse eller netværk.
function styleCommand(text) {
  if (!styleMessage(text)) return null;
  const raw = text.trim().split(/\s+/)[1];
  if (!validSlug(raw)) return { invalid: true };
  return { slug: raw };
}

// ── Læsning med hårdt loft: strømmen afbrydes, når loftet er overskredet ──
async function readBounded(response, maxBytes) {
  const body = response?.body;
  if (body && (typeof body[Symbol.asyncIterator] === 'function' || typeof body.getReader === 'function')) {
    const chunks = [];
    let total = 0;
    if (typeof body[Symbol.asyncIterator] === 'function') {
      const iterator = body[Symbol.asyncIterator]();
      try {
        while (true) {
          const { done, value } = await iterator.next();
          if (done) break;
          const part = Buffer.from(value);
          total += part.length;
          if (total > maxBytes) {
            await iterator.return?.().catch(() => {});
            await drain(body);
            throw rejectContent('Filen');
          }
          chunks.push(part);
        }
      } catch (error) {
        await iterator.return?.().catch(() => {});
        throw error;
      }
      return Buffer.concat(chunks);
    }
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const part = Buffer.from(value);
        total += part.length;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw rejectContent('Filen');
        }
        chunks.push(part);
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks);
  }
  // Tilbagefald for svar uden strøm (synthetiske testsvar): tekstvejen.
  const text = typeof response?.text === 'function' ? await response.text() : '';
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > maxBytes) throw rejectContent('Filen');
  return bytes;
}

// ── Formkontrol ──

// Én katalogpost normaliseres: slug, navn, kategori (kildens `industry`) og
// tema. Medie-URL'er (cover, video, ikon) bruges IKKE i S4 — ingen thumbnails.
// Temaet er live-verificeret: kilden har light, dark OG «mixed» (127 af 1.276
// poster, 9.11.2026) — «mixed» er en ærlig tredje værdi og bevares, så
// virkelige stile ikke forsvinder stiltiende; andre/ukendte værdier bevares
// som 'unknown' (Claude-designet: «tema ∈ {light, dark}, ellers ukendt»).
// Ugyldige slug, navn eller kategori dropper derimod posten.
function normalizeCatalogEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const slug = typeof raw.slug === 'string' ? raw.slug : '';
  if (!validSlug(slug)) return null;
  const name = typeof raw.name === 'string' ? raw.name : '';
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) return null;
  const source = typeof raw.industry === 'string' ? raw.industry : typeof raw.category === 'string' ? raw.category : '';
  if (!source || source.length > 40 || /[\u0000-\u001f\u007f]/.test(source)) return null;
  const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'mixed' ? raw.theme : 'unknown';
  return { slug, name, category: source, theme };
}

function validateCatalogText(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw rejectContent('Kataloget'); }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > CATALOG_MAX_ENTRIES) throw rejectContent('Kataloget');
  const entries = [];
  const seen = new Set();
  let dropped = 0;
  for (const raw of parsed) {
    const entry = normalizeCatalogEntry(raw);
    if (!entry || seen.has(entry.slug)) { dropped++; continue; }
    seen.add(entry.slug);
    entries.push(entry);
  }
  if (!entries.length || dropped > parsed.length / 10) throw rejectContent('Kataloget');
  return entries;
}

const SECTION_PATTERNS = [
  /farver|colou?rs/i,
  /typografi|typography|skrift|fonts?/i,
  /spacing|layout|afstand|grid/i,
  /komponenter|components|elementer/i,
];

// En stilfil skal ligne en DESIGN.md: én `#`-titel i de første 20 linjer, mindst
// tre af sektionerne farver/typografi/spacing-eller-layout/komponenter, og
// ingen HTML-side eller script. Dansk OG engelsk overskrift erkendes, så
// upstream-filer ikke afvises på sproget alene.
function validateStyleText(text) {
  if (text.includes('\0') || /<html|<script/i.test(text)) throw rejectContent('Filen');
  const head = text.split('\n').slice(0, 20);
  if (!head.some(line => /^#\s+\S/.test(line))) throw rejectContent('Filen');
  const headings = text.match(/^#{1,6}[ \t]+\S.*$/gm) || [];
  const present = SECTION_PATTERNS.filter(pattern => headings.some(heading => pattern.test(heading)));
  if (present.length < 3) throw rejectContent('Filen');
  return text;
}

function decodeStrictUtf8(bytes, kind) {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw new Error();
    return text;
  } catch { throw rejectContent(kind); }
}

// ── Cache: <store.root>/cache/gradientdeck/v1 — privat, aldrig i pakken ──

const cacheDirectory = store => path.join(store.root, 'cache', 'gradientdeck', 'v1');

// Atomisk skrivning (tmp + rename). Midlertidige filer ryddes altid; rename
// erstatter et eventuelt symlink på stien i stedet for at følge det.
async function writeAtomic(file, bytes, mode = 0o600) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, bytes, { flag: 'wx', mode });
    await fs.rename(temporary, file);
  } finally {
    await fs.unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

// Læsning med symlink-afvisning: filen åbnes med O_NOFOLLOW, og et symlink er
// ikke en gyldig cache (behandlet som "ingen cache" → der hentes ærligt igen).
async function readCacheFile(file, maxBytes) {
  let handle;
  try {
    handle = await fs.open(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) return null;
    const bytes = await handle.readFile();
    return bytes;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ELOOP') return null;
    throw Object.assign(new Error('GradientDeck-cachen kunne ikke læses sikkert.'), { code: 'GRADIENTDECK_CACHE' });
  } finally {
    await handle?.close().catch(() => {});
  }
}

// ── Selve tjenesten ──

class GradientDeck {
  constructor({ store, getPrivacy, consent, quiet = () => true, fetch: transport, now = Date.now, version = '' } = {}) {
    if (!store || typeof getPrivacy !== 'function' || typeof consent !== 'function') throw new TypeError('GradientDeck kræver lager, privacy-tjeneste og samtykke-tilbagekald.');
    this.store = store;
    this.getPrivacy = getPrivacy;
    this.consent = consent;
    this.quiet = quiet;
    this.transport = typeof transport === 'function' ? transport : (...args) => fetch(...args);
    this.now = now;
    this.version = version;
  }

  egress() { return new ExternalEgress(this.getPrivacy); }

  cacheDirectory() { return cacheDirectory(this.store); }

  // Registry-posten 'aura-gradientdeck' skrives KUN én gang og kun uden aktiv
  // kørsel: ExternalEgress.binding() dækker registreringen, så en skrivning
  // midt i en handling ville give PRIVACY_STALE for den igangværende handling.
  // OG ALDRIG oven på et register, der ikke kunne læses: en eksisterende fil,
  // der er for stor, beskadiget eller et symlink, afvises ærligt — kun en
  // reelt ABSENTE fil (ENOENT) må oprettes. (S4-gennemgangens Fund 1: det
  // gamle 64 KiB-læseloft tolkede et stort, gyldigt register som manglende og
  // overskrev det lydløst med KUN gradientdeck-posten — brugerens egne
  // destinationer blev slettet.)
  async ensureDestination() {
    const service = this.getPrivacy();
    const directory = service?.directory;
    if (!directory) throw new Error('GradientDeck er ikke klar endnu. Åbn et projekt først.');
    const file = path.join(directory, 'external-destinations.json');
    const registry = await this.#readRegistry(file);
    if (registry.exists && registry.value[DESTINATION_ID] && typeof registry.value[DESTINATION_ID] === 'object' && !Array.isArray(registry.value[DESTINATION_ID])) return false;
    if (!this.quiet()) throw new Error('GradientDeck venter: En opgave er i gang. Prøv igen, når den er færdig.');
    const next = { ...(registry.exists ? registry.value : {}), [DESTINATION_ID]: { endpoint: ORIGIN, locality: 'cloud', revision: 'gradientdeck-v1', actions: [DESTINATION_ACTION] } };
    await writeAtomic(file, Buffer.from(JSON.stringify(next, null, 2) + '\n'));
    return true;
  }

  // Læsning af registreringen med samme loft som privacy-servicens readConfig
  // (2 MB — den fil kan legitimt være langt over 64 KiB). ENOENT er den ene
  // "ingen fil"-tilstand; alt andet — for stor, ugyldig JSON, ikke-objekt,
  // symlink (ELOOP) — er en EKSISTERENDE fil, der aldrig må overskrives med
  // en nyoprettet registrering: den ærlige fejl i stedet for datatab.
  async #readRegistry(file) {
    let handle;
    try {
      handle = await fs.open(file, fsSync.constants.O_RDONLY | fsSync.constants.O_NOFOLLOW);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 2_000_000) throw new Error('registry unreadable');
      const value = JSON.parse((await handle.readFile()).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('registry unreadable');
      return { exists: true, value };
    } catch (error) {
      if (error.code === 'ENOENT') return { exists: false, value: null };
      throw Object.assign(new Error('GradientDeck er ikke klar: destinationerne kunne ikke læses sikkert.'), { code: 'GRADIENTDECK_REGISTRY' });
    } finally {
      await handle?.close().catch(() => {});
    }
  }

  async #policyOn(root) { return this.egress().active(root); }

  async #localOnly(root) {
    const egress = this.egress();
    if (!(await egress.active(root))) return false;
    return composePolicy(await egress.policies(egress.scope(root))).workMode === 'local';
  }

  // «Husk for projektet»-regelens revision: ExternalEgress.binding() (registry
  // + gældende privacy-tilstand) + projektet + metode og URL-mønster + den
  // sammensatte politiks egen binding. Ændres noget af det, spørges der igen.
  async #fingerprint(root) {
    const egress = this.egress();
    const scope = egress.scope(root);
    const policy = composePolicy(await egress.policies(scope));
    return hashBytes(Buffer.from(stable([egress.binding(scope), scope.root, ROUTE_BINDING, policy.binding])));
  }

  async #remembered(root) {
    const state = await this.store.read();
    const record = state.projects?.[this.store.projectKey(root)]?.gradientdeck;
    if (!record || typeof record !== 'object' || Array.isArray(record) || record.version !== 1 || typeof record.fingerprint !== 'string' || record.fingerprint.length !== 64) return null;
    return record;
  }

  async #writeRemembered(root, fingerprint) {
    await this.store.update(state => {
      const project = (state.projects[this.store.projectKey(root)] ||= {});
      project.gradientdeck = { version: 1, grantedAt: new Date(this.now()).toISOString(), fingerprint };
    });
  }

  async #clearRemembered(root) {
    await this.store.update(state => {
      const project = state.projects[this.store.projectKey(root)];
      if (project) delete project.gradientdeck;
    });
  }

  // Samtykke pr. GET: husket regel, ellers dialog. «Tillad én gang» gælder
  // netop denne GET; «Husk for projektet» gemmes under projektets indstillinger
  // med revisionen ovenfor. Med Privacy Gate slået til kræver gate-vejen også
  // allowDestination (konfigurerede destinationer bevarer kun allerede
  // tilladte id'er) — tilføjelsen er idempotent og nævnt i rapporten.
  async #authorize({ root, kind, name, url }) {
    const before = await this.#fingerprint(root);
    const remembered = await this.#remembered(root);
    if (remembered && remembered.fingerprint === before) return;
    if (remembered) await this.#clearRemembered(root);   // beskriver ikke længere de gældende regler
    const choice = await this.consent({ kind, name, url });
    if (choice !== 'once' && choice !== 'project') throw cancelled();
    // Genkontrol umiddelbart efter dialogen: ændrede datareglerne sig i pausen,
    // var godkendelsen mod noget andet — intet sendes. Vores EGNE skrivninger
    // (allowDestination og selve recorden) kommer først efter dette tjek.
    if (await this.#fingerprint(root) !== before) throw stale();
    if (await this.#policyOn(root)) {
      const service = this.getPrivacy();
      await service.allowDestination({ scope: 'project', destinationId: DESTINATION_ID });
    }
    if (choice === 'project') {
      // To faser: oprettelsen af settings.json (en helt ny profil) ændrer i sig
      // selv bindingen — recordens egne nøgler gør det ikke. Først skabes
      // filen, derefter måles revisionen, derefter fæstnes den.
      await this.#writeRemembered(root, '');
      const fingerprint = await this.#fingerprint(root);
      await this.#writeRemembered(root, fingerprint);
    }
  }

  async #fetchBytes({ root, kind, name, url, accept, maxBytes }) {
    const policyOn = await this.#policyOn(root);
    if (policyOn) await this.ensureDestination();
    await this.#authorize({ root, kind, name, url });
    let response;
    try {
      response = await this.#dispatch({ root, url, accept, policyOn });
    } catch (error) {
      if (error instanceof PrivacyGateError) throw error;
      throw unreachable();
    }
    if (response.status !== 200) {
      await drain(response);
      if (response.status >= 300 && response.status < 400) throw Object.assign(new Error('Hentningen blev afvist, fordi adressen viderestiller.'), { code: 'GRADIENTDECK_REDIRECT' });
      throw Object.assign(new Error(`GradientDeck kunne ikke levere filen (HTTP ${response.status}).`), { code: 'GRADIENTDECK_STATUS' });
    }
    const type = String(response.headers?.get?.('content-type') || '');
    if (kind === 'catalog' ? !/^application\/json\b/i.test(type) : !/^text\/(?:markdown|plain)\b/i.test(type)) {
      await drain(response);
      throw rejectContent(kind === 'catalog' ? 'Kataloget' : 'Filen');
    }
    return readBounded(response, maxBytes);
  }

  async #dispatch({ root, url, accept, policyOn }) {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    if (policyOn) {
      // Dispatch er værtens egen transport (tests sætter den; produktion bruger
      // fetch) — request-bygningen, kontrollen og gennemgangen sker i egress.
      return this.egress().request({ root, action: DESTINATION_ACTION, destinationId: DESTINATION_ID, url, method: 'GET', headers: { Accept: accept }, signal, dispatch: (address, options) => this.transport(address, options) });
    }
    const permit = await this.egress().legacyPermit(root);
    permit();
    return this.transport(url, { method: 'GET', headers: { Accept: accept, 'User-Agent': `Aura-Prime/${this.version}` }, redirect: 'error', signal });
  }

  // ── Kataloget ──

  #catalogFile() { return path.join(this.cacheDirectory(), 'catalog.json'); }

  async #readCatalog() {
    const bytes = await readCacheFile(this.#catalogFile(), CATALOG_MAX_BYTES + 65536);
    if (bytes === null) return null;
    try {
      const value = JSON.parse(bytes.toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 1
        || value.source !== CATALOG_URL || !Array.isArray(value.entries) || !value.entries.length
        || value.entries.length > CATALOG_MAX_ENTRIES || value.count !== value.entries.length
        || !Number.isFinite(value.fetchedAt)) throw new Error();
      // Genvalidering ved læsning: hver post skal stadig bestå formkravene.
      const entries = value.entries.map(normalizeCatalogEntry);
      if (entries.some(entry => !entry)) throw new Error();
      return { fetchedAt: value.fetchedAt, sha256: typeof value.sha256 === 'string' ? value.sha256 : '', entries };
    } catch { return null; }   // en beskadiget cache er "ingen cache" — der hentes ærligt igen
  }

  async #writeCatalog(rawBytes, entries) {
    const document = { version: 1, source: CATALOG_URL, fetchedAt: this.now(), sha256: hashBytes(rawBytes), count: entries.length, entries };
    await writeAtomic(this.#catalogFile(), Buffer.from(JSON.stringify(document)));
  }

  // Katalogniveauet til popuppen. Opdatering sker KUN her (brugerens åbning)
  // eller ved eksplicit `refresh` — aldrig i baggrunden, aldrig ved appstart.
  async catalog({ root, refresh = false } = {}) {
    if (!root || typeof root !== 'string') return { status: 'error', message: 'Åbn et projekt først.' };
    try {
      const local = await this.#localOnly(root);
      const cached = await this.#readCatalog();
      const fresh = cached && this.now() - cached.fetchedAt <= CATALOG_TTL;
      if (cached && fresh && !refresh) return { status: 'ok', entries: cached.entries, fetchedAt: cached.fetchedAt, cached: true, stale: false, cachedStyles: await this.#cachedStyles() };
      if (!local) {
        try {
          const bytes = await this.#fetchBytes({ root, kind: 'catalog', name: null, url: CATALOG_URL, accept: 'application/json', maxBytes: CATALOG_MAX_BYTES });
          const entries = validateCatalogText(decodeStrictUtf8(bytes, 'Kataloget'));
          await this.#writeCatalog(bytes, entries);
          return { status: 'ok', entries, fetchedAt: this.now(), cached: false, stale: false, cachedStyles: await this.#cachedStyles() };
        } catch (error) {
          // Kun netværksfejl og afvist indhold falder tilbage på den gemte cache
          // («ugyldigt svar erstatter aldrig gyldig cache»). Annulleret samtykke
          // og gate-afvisninger er brugerens eller regelværkets svar: de vises.
          if (!cached || !(error.code === 'GRADIENTDECK_UNREACHABLE' || error.code === 'GRADIENTDECK_REJECTED')) throw error;
        }
      }
      if (cached) return { status: 'ok', entries: cached.entries, fetchedAt: cached.fetchedAt, cached: true, stale: true, cachedStyles: await this.#cachedStyles(), local };
      if (local) return { status: 'error', message: 'GradientDeck kan ikke hentes i Kun lokal. Ingen ekstern kommunikation er tilladt. Skift arbejdsform i Datakontrol for at hente.' };
      throw unreachable();
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'GradientDeck kunne ikke gennemføre hentningen. Prøv igen.' };
    }
  }

  async #cachedStyles() {
    const directory = path.join(this.cacheDirectory(), 'styles');
    let names;
    try { names = await fs.readdir(directory); } catch { return []; }
    const cached = [];
    for (const name of names) {
      const slug = name.endsWith('.md') ? name.slice(0, -3) : null;
      if (!validSlug(slug)) continue;
      if (await this.#readStyle(slug)) cached.push(slug);
    }
    return cached;
  }

  #styleFile(slug) { return path.join(this.cacheDirectory(), 'styles', `${slug}.md`); }

  // En genlæst cache genvalideres helt: sha256, kilde, alder og striks UTF-8.
  // Enhver afvigelse betyder "ingen cache" — der hentes ærligt igen i stedet
  // for at vise noget, der ikke længere kan bevises.
  async #readStyle(slug) {
    const file = this.#styleFile(slug);
    const bytes = await readCacheFile(file, DESIGN_MAX_BYTES);
    if (bytes === null) return null;
    const metaBytes = await readCacheFile(`${file.slice(0, -3)}.meta.json`, 4096);
    let meta;
    try { meta = metaBytes && JSON.parse(metaBytes.toString('utf8')); } catch { meta = null; }
    if (!meta || typeof meta !== 'object' || meta.source !== ORIGIN + STYLE_PATH(slug) || !Number.isFinite(meta.fetchedAt) || meta.sha256 !== hashBytes(bytes)) return null;
    let text;
    try { text = decodeStrictUtf8(bytes, 'Filen'); } catch { return null; }
    if (Buffer.byteLength(text) > DESIGN_MAX_BYTES) return null;
    return { text, fetchedAt: meta.fetchedAt, sha256: meta.sha256 };
  }

  async #writeStyle(slug, text) {
    const bytes = Buffer.from(text, 'utf8');
    await writeAtomic(this.#styleFile(slug), bytes);
    await writeAtomic(`${this.#styleFile(slug).slice(0, -3)}.meta.json`, Buffer.from(JSON.stringify({ source: ORIGIN + STYLE_PATH(slug), fetchedAt: this.now(), sha256: hashBytes(bytes) })));
  }

  // Tørkørslen: HELE svarteksten gennem inspector.cjs med projektets gældende
  // policy, bundet som data præcis som en fremtidig afsendelse ville se den.
  // Egress kontrollerer kun requesten — svaret kontrolleres her, før status
  // «hentet». Kun en AKTIV gate har en politik at kontrollere mod.
  async #sendable(root, slug, text) {
    const egress = this.egress();
    if (!(await egress.active(root))) return true;
    const policy = composePolicy(await egress.policies(egress.scope(root)));
    try {
      inspectRequest(designDocumentText({ source: `GradientDeck ${STYLE_PATH(slug)}`, content: text, hash: hashBytes(Buffer.from(text, 'utf8')) }), policy);
      return true;
    } catch (error) {
      if (error instanceof PrivacyGateError) return false;
      throw error;
    }
  }

  // ── Stilhentningen (efter Send af `/stil <slug>` — før agent:prepare) ──

  async fetchStyle({ root, slug } = {}) {
    if (!root || typeof root !== 'string') return { status: 'error', message: 'Åbn et projekt først.' };
    if (!validSlug(slug)) return { status: 'error', message: 'Stilnavnet har ugyldigt format.' };
    try {
      const catalog = await this.catalog({ root });
      if (catalog.status !== 'ok') return { status: 'error', message: catalog.message };
      const entry = catalog.entries.find(item => item.slug === slug);
      if (!entry) return { status: 'error', message: 'Stilen findes ikke i det gemte katalog. Søg igen eller opdatér kataloget.' };
      const url = ORIGIN + STYLE_PATH(slug);
      const local = await this.#localOnly(root);
      const cached = await this.#readStyle(slug);
      // Kun lokal: eksisterende cache må vises — der hentes aldrig netværk.
      if (cached && (this.now() - cached.fetchedAt <= STYLE_TTL || local)) {
        return this.#styleResult(slug, entry.name, await this.#sendable(root, slug, cached.text));
      }
      if (local) return { status: 'error', message: 'GradientDeck kan ikke hentes i Kun lokal. Ingen ekstern kommunikation er tilladt. Skift arbejdsform i Datakontrol for at hente.' };
      const bytes = await this.#fetchBytes({ root, kind: 'style', name: entry.name, url, accept: 'text/markdown, text/plain', maxBytes: DESIGN_MAX_BYTES });
      const text = validateStyleText(decodeStrictUtf8(bytes, 'Filen'));
      // Tørkørslen sker FØR cachen skrives: kun fuldt kontrolleret indhold gemmes.
      const sendable = await this.#sendable(root, slug, text);
      await this.#writeStyle(slug, text);
      return this.#styleResult(slug, entry.name, sendable);
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : 'GradientDeck kunne ikke gennemføre hentningen. Prøv igen.' };
    }
  }

  // Status «hentet» gives først, når HELE svarteksten er tørkørt gennem
  // inspector.cjs med projektets gældende policy (Codex-fundet: egress
  // kontrollerer kun requesten). Base64-heuristikken bevares; en blokeret stil
  // er hentet, men markeres sendable:false med den ærlige tekst.
  #styleResult(slug, name, sendable) {
    return sendable
      ? { status: 'ok', slug, name, sendable: true, message: `Stilen «${name}» er hentet. Den bruges ikke i projektet endnu.` }
      : { status: 'ok', slug, name, sendable: false, message: 'Hentet, men datakontrollen vil afvise den ved afsendelse (indholdet ligner kodet data).' };
  }
}

module.exports = {
  ORIGIN, DESTINATION_ID, DESTINATION_ACTION, SLUG, SLUG_MAX, validSlug,
  CATALOG_PATH, STYLE_PATH, ROUTE_BINDING, CATALOG_URL,
  CATALOG_TTL, STYLE_TTL, CATALOG_MAX_BYTES, CATALOG_MAX_ENTRIES, DESIGN_MAX_BYTES, TIMEOUT_MS,
  GradientDeck, styleCommand, validateCatalogText, validateStyleText, readBounded, cacheDirectory, writeAtomic, readCacheFile,
};
