// SPDX-License-Identifier: EUPL-1.2
'use strict';
// S4 · GradientDeck-kataloget + sikker hentning (tests skrevet før implementeringen).
//
// S4 skriver KUN privat cache: katalog og stilfiler hentes med snæver,
// host-ejet GET mod fast origin, samtykke pr. projekt og indholdskontrol.
// Ingen DESIGN.md i projektet, ingen modelkald, ingen aktivering — det er S5.
// Alle netværkstests bruger en mock-transport; det rigtige netværk røres kun
// af den manuelle probe (scripts/probe-s4-uiux-live.cjs).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { ExternalEgress } = require('../core/privacy/external-egress.cjs');
const { DESIGN_MAX_BYTES } = require('../core/build-design.cjs');
const {
  ORIGIN, DESTINATION_ID, DESTINATION_ACTION, SLUG, validSlug, GradientDeck, styleCommand, STYLE_TTL,
} = require('../core/gradientdeck.cjs');

const DAY = 24 * 60 * 60 * 1000;

// ── Fixtures ────────────────────────────────────────────────────────────────

const catalogEntry = (slug, name, industry = 'Web', theme = 'dark') => ({
  slug, name, nickname: name, industry, theme, host: 'GradientDeck',
  cover_asset: { url: `https://ui.gradientdeck.com/covers/${slug}.png`, alt: slug, width: 1200, height: 630 },
  video: null, icon: null, colors: ['#333333'], fonts: ['Inter'], tone: 'rolig',
});

const catalogText = entries => JSON.stringify(entries);

const styleText = (name = 'Cloudflare') => `# ${name}

En rolig stil med varme accenter.

## Farver
- Primær: #f6821f
- Baggrund: #ffffff

## Typografi
- Inter 14/22, skiltefelt 12 px

## Spacing
- 8 px-grundgrid, kort afstand 12 px

## Komponenter
- Kort med radius 12, knapper 34 px runde
`;

// En mock-respons med rigtig strøm-semantik: async-iterable body, der kan
// afbrydes ved loftet (det er netop dét, readBounded skal bevise).
function mockResponse(body, { status = 200, type = 'text/markdown; charset=utf-8', chunks = null } = {}) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const pieces = chunks || [bytes];
  let index = 0;
  const bodyIterable = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          if (index >= pieces.length) return { done: true, value: undefined };
          const value = pieces[index++];
          if (value === 'FAIL') throw new TypeError('fetch failed');
          return { done: false, value };
        },
        async return() { return { done: true, value: undefined }; },
      };
    },
    cancel: undefined,
  };
  return {
    status,
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? type : null },
    body: bodyIterable,
    async text() { return bytes.toString('utf8'); },
  };
}

// Transporten nedtæller kald og bytes: hvert kald viser præcis URL og options.
function mockTransport(responder) {
  const calls = [];
  const transport = async (url, options = {}) => {
    calls.push({ url, options, consumed: 0 });
    const target = calls[calls.length - 1];
    // Lav en respons hvis body tæller forbruget (til loft-afbrydelsestesten).
    const response = await responder(url, options, calls.length);
    if (response?.body) {
      const original = response.body[Symbol.asyncIterator]();
      response.body = {
        [Symbol.asyncIterator]() {
          return {
            async next() { const result = await original.next(); if (!result.done) target.consumed += result.value.length; return result; },
            async return() { return original.return?.() || { done: true, value: undefined }; },
          };
        },
      };
    }
    return response;
  };
  return { transport, calls };
}

async function fixture(t, { privacy = null, respond } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-gradientdeck-'));
  const root = path.join(directory, 'project');
  await fs.mkdir(root);
  const store = new Store(path.join(directory, 'profile'), { isEncryptionAvailable: () => false });
  const bench = { store, project: { root }, chats: new Map(), emit() {}, running: false };
  const service = bench.privacy = new PrivacyService(bench);
  if (privacy) await store.saveProject(root, { privacy });
  const reviews = [];
  service.requestApproval = async review => { reviews.push(review); return 'approve'; };
  const responder = respond || (url => mockResponse(url.endsWith('/library.json') ? catalogText([catalogEntry('cloudflare', 'Cloudflare'), catalogEntry('blond', 'Blond', 'Mode', 'light')]) : styleText('Cloudflare'), { type: url.endsWith('/library.json') ? 'application/json' : 'text/markdown; charset=utf-8' }));
  const network = mockTransport(responder);
  const consents = [];
  let choice = 'once';
  let nowMs = Date.parse('2026-11-04T10:00:00Z');
  let quiet = true;
  const deck = new GradientDeck({
    store,
    getPrivacy: () => service,
    consent: async request => { consents.push(request); return choice; },
    quiet: () => quiet,
    fetch: network.transport,
    now: () => nowMs,
    version: '0.5.7-test',
  });
  t.after(async () => { service.cancelScope(); await service.auditQueue.catch(() => {}); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, root, store, bench, service, deck, network, consents, reviews, get choice() { return choice; }, set choice(value) { choice = value; }, get now() { return nowMs; }, set now(value) { nowMs = value; }, get quiet() { return quiet; }, set quiet(value) { quiet = value; } };
}

const blocked = error => Boolean(error?.code?.startsWith('PRIVACY_'));
const cacheDirectory = store => path.join(store.root, 'cache', 'gradientdeck', 'v1');

// ── Gennemgang Fund 2: stilruttens negative tests skal ramme STILRUTEN.
// Responderen serverer altid et gyldigt katalog på /library.json og kun
// FIXTUREN på /styles/<slug>/design.md, så fetchStyle når forbi
// kataloghentningen — og hver test hævder, at stil-URL'en reelt blev kaldt.
const VALID_CATALOG = () => mockResponse(catalogText([catalogEntry('cloudflare', 'Cloudflare')]), { type: 'application/json' });
const styleRoute = body => (url => url.endsWith('/library.json') ? VALID_CATALOG() : mockResponse(body));
const styleRouteTyped = (body, options) => (url => url.endsWith('/library.json') ? VALID_CATALOG() : mockResponse(body, options));
const styleUrlHit = f => f.network.calls.filter(call => call.url === `${ORIGIN}/styles/cloudflare/design.md`).length;

// ── 1 · Ren kommando-grammatik: hvad er en selvstændig /stil-besked? ─────────

test('styleCommand: kun en selvstændig /stil|/style <slug> er kommandoen', () => {
  assert.deepEqual(styleCommand('/stil cloudflare'), { slug: 'cloudflare' });
  assert.deepEqual(styleCommand('/style cloudflare'), { slug: 'cloudflare' }, 'aliaset regnes med');
  assert.deepEqual(styleCommand('  /stil cloudflare  '), { slug: 'cloudflare' }, 'yderste whitespace trimmes');
  assert.deepEqual(styleCommand('/STIL cloudflare'), { slug: 'cloudflare' }, 'kommandonavnet er versaluafhængigt');
  assert.equal(styleCommand('/stil'), null, 'en bar /stil er inert tekst — den åbner kun popuppen i feltet');
  assert.equal(styleCommand('/stil '), null, 'tom parameter efter Send er inert');
  assert.equal(styleCommand('Byg noget med /stil cloudflare'), null, 'blandet prosa er ikke kommandoen — ingen import');
  assert.equal(styleCommand('/stil cloudflare og byg'), null, 'prosa efter argumentet gør det til en almindelig besked');
  assert.equal(styleCommand('```\n/stil cloudflare\n```'), null, 'kodeblokke er ikke kommandoen');
  assert.equal(styleCommand('se https://x.dk/stil'), null, 'URL-fragmenter er ikke kommandoen');
});

test('styleCommand: ugyldigt slug-format i en selvstændig kommando afvises uden netværk', () => {
  for (const text of ['/stil ..', '/stil %2f', '/stil cloud/flare', '/STIL Cloudflare', `/stil ${'a'.repeat(65)}`, '/stil søgemåske']) {
    const command = styleCommand(text);
    assert.ok(command && command.invalid === true, `${JSON.stringify(text)} markeres som ugyldigt`);
  }
});

test('SLUG-grammatikken: små bogstaver, tal og enkelte bindestreger — intet andet', () => {
  assert.equal(SLUG.test('cloudflare'), true);
  assert.equal(SLUG.test('a-b-c'), true);
  assert.equal(SLUG.test('a'), true);
  assert.equal(SLUG.test('-a'), false, 'ingen indledende bindestreg');
  assert.equal(SLUG.test('a-'), false, 'ingen afsluttende bindestreg');
  assert.equal(SLUG.test('a--b'), false, 'ingen dobbelte bindestreger');
  assert.equal(SLUG.test('AB'), false);
  assert.equal(SLUG.test('a.b'), false);
  assert.equal(SLUG.test('a b'), false);
  assert.equal(SLUG.test('a/b'), false);
  assert.equal(SLUG.test('%2f'), false);
  assert.equal(validSlug('a'.repeat(64)), true, '64 tegn er grænsen');
  assert.equal(validSlug('a'.repeat(65)), false, '65 tegn afvises');
});

// ── 2 · Slug-fuzz og sti-allowlist: intet netværk før validering ─────────────

test('fetchStyle: fuzzede slugs afvises uden et eneste netværkskald', async t => {
  const f = await fixture(t);
  for (const slug of ['..', '%2f', '%2F', 'AB', 'a'.repeat(65), 'søgemåske', ' slug', 'slug/x', 'slug?x=1', 'slug#frag', 'a--b', '-a', 'a-', '']) {
    const result = await f.deck.fetchStyle({ root: f.root, slug });
    assert.equal(result.status, 'error', `${JSON.stringify(slug)} afvises`);
    assert.match(result.message, /ugyldigt format|findes ikke/, `${JSON.stringify(slug)}: ${result.message}`);
  }
  assert.equal(f.network.calls.length, 0, 'ingen dispatch overhovedet');
  assert.equal(f.consents.length, 0, 'ingen samtykkedialog');
});

test('fetchStyle: ukendt slug i kataloget afvises uden netværk', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  assert.equal((await f.deck.catalog({ root: f.root })).status, 'ok');
  assert.equal((await f.deck.fetchStyle({ root: f.root, slug: 'findes-ikke' })).status, 'error');
  assert.match((await f.deck.fetchStyle({ root: f.root, slug: 'findes-ikke' })).message, /Stilen findes ikke i det gemte katalog/);
  assert.equal(f.network.calls.filter(call => call.url.includes('/styles/')).length, 0, 'kun kataloghentningen har været på netværket');
});

test('værtens URLer: præcis to ruter, ingen query, fragment eller credentials', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.deepEqual(f.network.calls.map(call => call.url), [`${ORIGIN}/library.json`, `${ORIGIN}/styles/cloudflare/design.md`]);
  for (const call of f.network.calls) {
    assert.equal(call.options.method, 'GET', 'kun GET');
    assert.equal(call.options.redirect, 'error', 'redirects afvises altid — også med Privacy Gate slået fra');
    assert.ok(!call.url.includes('?') && !call.url.includes('#'), 'ingen query eller fragment');
    assert.equal(call.options.credentials, undefined, 'ingen cookies eller credentials');
    assert.ok(call.options.signal instanceof AbortSignal, 'timeout-signalet følger med (15 s inkl. body)');
    assert.deepEqual(Object.keys(call.options.headers), ['Accept', 'User-Agent'], 'kun gennemgåede headere');
    assert.match(call.options.headers['User-Agent'], /^Aura-Prime\//, 'fast User-Agent uden e-mail');
  }
});

test('catalog og fetchStyle bygger ALDRIG andre stier — slug kan ikke smugle sti', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  for (const call of f.network.calls) {
    assert.ok(call.url === `${ORIGIN}/library.json` || new RegExp(`^${ORIGIN}/styles/[a-z0-9]+(?:-[a-z0-9]+)*/design\\.md$`).test(call.url), `${call.url} er en af de to tilladte ruter`);
  }
});

// ── 3 · Responskontrol: status, MIME, loft, redirect ── STILRUTEN (Fund 2) ──

test('3xx på STILRUTEN afvises altid med den ærlige viderestillingsbesked', async t => {
  const f = await fixture(t, { respond: styleRouteTyped('flyttet', { status: 302 }) });
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(styleUrlHit(f), 1, 'kataloget bestod — stil-URL\'en blev reelt kaldt');
  assert.equal(result.status, 'error');
  assert.match(result.message, /viderestiller/);
  assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'intet gemmes');
});

test('ikke-200 på STILRUTEN giver HTTP-koden ærligt tilbage — 404 er ingen hemmelighed', async t => {
  const f = await fixture(t, { respond: styleRouteTyped('borte', { status: 404 }) });
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(styleUrlHit(f), 1, 'stil-URL\'en blev reelt kaldt');
  assert.equal(result.status, 'error');
  assert.match(result.message, /HTTP 404/);
  assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'intet gemmes');
});

test('forkert MIME-type på STILRUTEN afvises: kun text/markdown og text/plain', async t => {
  for (const type of ['text/html; charset=utf-8', 'application/octet-stream', 'application/json']) {
    const f = await fixture(t, { respond: styleRouteTyped(styleText(), { type }) });
    const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
    assert.equal(styleUrlHit(f), 1, `${type}: stil-URL'en blev reelt kaldt`);
    assert.equal(result.status, 'error', `${type} afvises`);
    assert.match(result.message, /afvist/);
    assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'afvist indhold gemmes aldrig');
  }
});

test('loft-afbrydelse på STILRUTEN: 32 KiB + 1 afbryder strømmen — ikke bare efter læsning', async t => {
  const chunk = Buffer.alloc(16 * 1024, 0x61); // 'a' — fem bidder = 80 KiB, langt over loftet
  const f = await fixture(t, { respond: styleRouteTyped(chunk, { chunks: [chunk, chunk, chunk, chunk, chunk] }) });
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(styleUrlHit(f), 1, 'kataloget bestod — loftprøven rammer stilruten');
  const call = f.network.calls.at(-1);
  assert.equal(call.url, `${ORIGIN}/styles/cloudflare/design.md`, 'det sidste kald er stilfilen');
  assert.equal(result.status, 'error', '32 KiB-loftet fra DESIGN_MAX_BYTES håndhæves');
  assert.match(result.message, /afvist/);
  assert.equal(DESIGN_MAX_BYTES, 32768, 'loftet GENBRUGES fra build-design.cjs');
  assert.ok(call.consumed > 2 * chunk.length, `strømmen blev påbegyndt og afbrudt MIDT I den (forbrugte ${call.consumed} af 81.920 bytes — aldrig hele strømmen)`);
  assert.ok(call.consumed < 5 * chunk.length, `strømmen blev afbrudt, før den var læst færdig (forbrugte ${call.consumed} af 81.920 bytes)`);
  assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'intet gemmes');
});

test('katalogloftet: 4 MB dekomprimeret og 10.000 poster', async t => {
  const tooMany = catalogText(Array.from({ length: 10001 }, (_unused, index) => catalogEntry(`style-${index}`, `Stil ${index}`)));
  const f = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse(tooMany, { type: 'application/json' }) : mockResponse(styleText()) });
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'error', 'over 10.000 poster afvises');
  assert.match(result.message, /afvist|for stor/i);
  const huge = catalogText(Array.from({ length: 100 }, (_unused, index) => catalogEntry(`style-${index}`, `Stil ${index} ${'x'.repeat(50000)}`)));
  const g = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse(huge, { type: 'application/json' }) : mockResponse(styleText()) });
  assert.equal((await g.deck.catalog({ root: g.root })).status, 'error', 'over 4 MB dekomprimeret afvises');
});

// ── 4 · Formkontrol: positive og negative fixtures ───────────────────────────

test('formkontrol: en gyldig stil gemmes og kvitterer ærligt', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'ok');
  assert.equal(result.name, 'Cloudflare');
  assert.equal(result.sendable, true, 'base64-fri stil kan kontrolleres');
  // S5 opdaterer pin: kvitteringen peger nu på anvendelsen — i S4 hed den
  // «Den bruges ikke i projektet endnu», hvilket S5 netop ændrer: stilkortet
  // fører til DESIGN.md-skrivningen i projektet.
  assert.match(result.message, /Stilen «Cloudflare» er hentet\. Anvend den i projektet fra stilkortet\./);
  assert.equal(result.category, 'Web', 'S5: kortets kategori følger med');
  assert.equal(result.theme, 'dark', 'S5: kortets tema følger med');
  assert.equal(result.sourceUrl, `${ORIGIN}/styles/cloudflare/design.md`, 'S5: kortets kilde-URL følger med');
  assert.ok(Number.isFinite(result.fetchedAt), 'S5: hentet-tidspunktet følger med');
  const cached = await fs.readFile(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md'), 'utf8');
  assert.equal(cached, styleText('Cloudflare'), 'den validerede tekst ligger i cachen ordret');
});

test('formkontrol: negative fixtures afvises uden at noget gemmes', async t => {
  const noTitle = 'Ingen titel her\n\n## Farver\n- #fff\n## Typografi\n- Inter\n## Spacing\n- 8px\n## Komponenter\n- Kort\n';
  const htmlPage = '<html><body># Titel ## Farver ## Typografi ## Spacing ## Komponenter</body></html>';
  const script = '# Titel\n<script>alert(1)</script>\n## Farver\n## Typografi\n## Spacing\n## Komponenter\n';
  const tooFewSections = '# Titel\n\n## Farver\n- #fff\n';
  for (const [label, text] of [['mangler # titel', noTitle], ['html-side', htmlPage], ['script', script], ['for få sektioner', tooFewSections]]) {
    const f = await fixture(t, { respond: styleRoute(text) });
    const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
    assert.equal(styleUrlHit(f), 1, `${label}: kataloget bestod — stil-URL'en blev reelt kaldt`);
    assert.equal(result.status, 'error', `${label} afvises`);
    assert.match(result.message, /afvist/);
    assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, `${label}: intet gemmes`);
  }
});

test('formkontrol: strikt UTF-8 og NUL på STILRUTEN afvises', async t => {
  const invalid = Buffer.concat([Buffer.from('# Titel\n\n## Farver\n## Typografi\n## Spacing\n## Komponenter\n', 'utf8'), Buffer.from([0xff, 0xfe, 0xfd])]);
  const f = await fixture(t, { respond: styleRoute(invalid) });
  const utf8 = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(styleUrlHit(f), 1, 'ugyldig UTF-8: stil-URL\'en blev reelt kaldt');
  assert.equal(utf8.status, 'error', 'ugyldig UTF-8 afvises');
  assert.equal(await fs.stat(path.join(cacheDirectory(f.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'ugyldig UTF-8: intet gemmes');
  const nul = Buffer.concat([Buffer.from('# Titel\n## Farver\n## Typografi\n## Spacing\n## Komponenter\n', 'utf8'), Buffer.from([0x00])]);
  const g = await fixture(t, { respond: styleRoute(nul) });
  const nulResult = await g.deck.fetchStyle({ root: g.root, slug: 'cloudflare' });
  assert.equal(styleUrlHit(g), 1, 'NUL: stil-URL\'en blev reelt kaldt');
  assert.equal(nulResult.status, 'error', 'NUL-bytes afvises');
  assert.equal(await fs.stat(path.join(cacheDirectory(g.store), 'styles', 'cloudflare.md')).then(() => true, () => false), false, 'NUL: intet gemmes');
});

test('katalogvalidering: industry normaliseres til category, ugyldige poster droppes, over 10 % forkastes', async t => {
  const entries = Array.from({ length: 20 }, (_unused, index) => catalogEntry(`stil-${index}`, `Stil ${index}`, index % 2 ? 'Kommune' : 'Web', index % 2 ? 'light' : 'dark'));
  entries[19] = { ...entries[19], slug: 'ULOVLIGT SLUG' };   // én af 20 = 5 % — under loftet
  const f = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse(catalogText(entries), { type: 'application/json' }) : mockResponse(styleText()) });
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'ok', 'én ugyldig post af 20 er under 10 % — kataloget består');
  assert.equal(result.entries.length, 19, 'den ugyldige post er droppet');
  assert.deepEqual([result.entries[0].slug, result.entries[0].category, result.entries[0].theme], ['stil-0', 'Web', 'dark'], 'industry → category, tema bevares');
  assert.equal(result.entries[1].category, 'Kommune');
  const hostile = [catalogEntry('a', 'A'), catalogEntry('b', 'B'), catalogEntry('c', 'C'), ...Array.from({ length: 5 }, (_unused, index) => ({ slug: `bad-${index}`, name: 'x'.repeat(200), industry: 'Web', theme: 'neon' }))];
  const g = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse(catalogText(hostile), { type: 'application/json' }) : mockResponse(styleText()) });
  assert.equal((await g.deck.catalog({ root: g.root })).status, 'error', 'flere end 10 % ugyldige poster forkaster HELE kataloget');
});

test('katalogvalidering: live-verificeret «mixed»-tema bevares — virkelige stile forsvinder ikke', async t => {
  // Kilden har 127 «mixed»-poster (9.11.2026) — med et hårdt light|dark-krav
  // lå faldet på 9,95 %, en hårbreddes fra 10 %-loftet, der ville forkaste
  // HELE kataloget. «mixed» er en ærlig tredje værdi og bevares; andre
  // ukendte værdier bevares som 'unknown' (Claude: «ellers ukendt»).
  const entries = [catalogEntry('skygge', 'Skygge', 'Web', 'mixed'), catalogEntry('mystik', 'Mystik', 'Web', 'udefineret-tema')];
  const f = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse(catalogText(entries), { type: 'application/json' }) : mockResponse(styleText()) });
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'ok', 'ingen af posterne droppes — faldraten er 0 %');
  assert.deepEqual(result.entries.map(entry => entry.theme), ['mixed', 'unknown'], 'mixed bevares, andre ukendte værdier mærkes unknown');
});

// ── 5 · Cache: TTL, offline, atomisk skrivning, symlink ──────────────────────

test('TTL: kataloget holdes 7 dage, stile 30 dage — derefter hentes der igen', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  const afterFirst = f.network.calls.length;
  f.now += 6 * DAY;
  await f.deck.catalog({ root: f.root });
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(f.network.calls.length, afterFirst, 'inden for TTL cachelæses der — intet nyt netværk');
  assert.equal(f.consents.length, 1, 'samtykket genkendes uden ny dialog');
  f.now += 2 * DAY; // kataloget er nu 8 dage, stilen 8 dage
  await f.deck.catalog({ root: f.root });
  assert.equal(f.network.calls.length, afterFirst + 1, 'det stagne katalog hentes igen');
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(f.network.calls.length, afterFirst + 1, 'stilen er stadig frisk (30 dage)');
  f.now += 23 * DAY; // kataloget 23 dage (stannet), stilen 31 dage (stannet)
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(f.network.calls.length, afterFirst + 3, 'både kataloget og den stagne stil hentes igen — begge over deres TTL');
  assert.equal(f.consents.length, 1, 'den huskede regel dækker alle genhentninger');
});

test('offline: fejlet hentning serverer sidste gyldige katalog som «Gemt katalog»', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  const fresh = await f.deck.catalog({ root: f.root });
  assert.equal(fresh.status, 'ok');
  assert.equal(fresh.cached, false, 'første hentning er ikke fra cache');
  assert.equal((await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' })).status, 'ok', 'stilen hentes, mens netværket virker');
  f.now += 8 * DAY;
  const failing = mockTransport(async () => { throw new TypeError('fetch failed'); });
  f.deck = new GradientDeck({ store: f.store, getPrivacy: () => f.service, consent: async () => { throw new Error('må ikke spørge'); }, quiet: () => true, fetch: failing.transport, now: () => f.now, version: '0.5.7-test' });
  const offline = await f.deck.catalog({ root: f.root });
  assert.equal(offline.status, 'ok', 'ugyldigt svar erstatter aldrig gyldig cache');
  assert.equal(offline.cached, true);
  assert.equal(offline.stale, true, 'markeringen bærer alderen');
  assert.ok(offline.fetchedAt, 'datoen for «Sidst hentet» følger med');
  assert.equal((await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' })).status, 'ok', 'den cachelagrede stil virker stadig offline');
  const noCache = await f.deck.fetchStyle({ root: f.root, slug: 'blond' });
  assert.equal(noCache.status, 'error', 'enstil uden cache kan ikke hentes offline');
  assert.match(noCache.message, /GradientDeck kunne ikke nås/);
});

test('offline uden cache: den ærlige fejl — ingen automatisk reservehost', async t => {
  const failing = mockTransport(async () => { throw new TypeError('fetch failed'); });
  const f = await fixture(t, { respond: () => { throw new TypeError('fetch failed'); } });
  f.deck = new GradientDeck({ store: f.store, getPrivacy: () => f.service, consent: async () => 'once', quiet: () => true, fetch: failing.transport, now: () => Date.now(), version: '0.5.7-test' });
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'error');
  assert.match(result.message, /GradientDeck kunne ikke nås/);
});

test('atomisk skrivning: en afvist hentning efterlader den gamle cache og ingen tmp-rester', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  const before = await fs.readFile(path.join(cacheDirectory(f.store), 'catalog.json'), 'utf8');
  f.now += 8 * DAY;
  const broken = await fixture(t, { respond: url => url.endsWith('/library.json') ? mockResponse('not json', { type: 'application/json' }) : mockResponse(styleText()) });
  f.deck = new GradientDeck({ store: f.store, getPrivacy: () => f.service, consent: async () => 'once', quiet: () => true, fetch: broken.network.transport, now: () => f.now, version: '0.5.7-test' });
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'ok', 'ugyldigt svar erstatter aldrig gyldig cache — den gamle serveres');
  assert.equal(result.cached, true);
  assert.equal(result.stale, true);
  const after = await fs.readFile(path.join(cacheDirectory(f.store), 'catalog.json'), 'utf8');
  assert.equal(after, before, 'den gyldige cache består byte-identisk');
  const leftovers = (await fs.readdir(cacheDirectory(f.store))).filter(name => name.includes('.tmp'));
  assert.deepEqual(leftovers, [], 'ingen tmp-filer efterlades');
});

test('symlinks afvises i cachen — cache læses med O_NOFOLLOW-semantik og erstattes aldrig af et link', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  const catalogFile = path.join(cacheDirectory(f.store), 'catalog.json');
  const evil = path.join(f.directory, 'evil.json');
  await fs.writeFile(evil, catalogText([catalogEntry('onringet', 'Ønsket nej')]));
  await fs.rm(catalogFile);
  await fs.symlink(evil, catalogFile);
  const result = await f.deck.catalog({ root: f.root });
  assert.equal(result.status, 'ok', 'et symlink er ikke en gyldig cache — der hentes ærligt igen');
  assert.ok(f.network.calls.length >= 1, 'der hentes ærligt igen');
  const written = await fs.lstat(catalogFile);
  assert.equal(written.isSymbolicLink(), false, 'skrivningen erstatter linket — aldrig målet bagved');
  assert.equal((await fs.readFile(catalogFile, 'utf8')).includes('cloudflare'), true, 'indholdet er den hentede cache');
});

// ── 6 · Egress-valget: integration + aura-gradientdeck, aldrig browser-http ──

test('egress-action: integration-destinationen aura-gradientdeck — webfetch-regler røres ikke', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['min-webfetch', 'bruger-gd'], requireApproval: true } });
  // Brugerens EGEN webfetch-regel på en anden origin består upåvirket.
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(f.service.directory, 'external-destinations.json'), JSON.stringify({ 'min-webfetch': { endpoint: 'https://eksempel.dk', locality: 'cloud', revision: 'v1', actions: ['browser-http'] } }), { mode: 0o600 });
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  assert.equal(DESTINATION_ACTION, 'integration', 'GradientDeck bruger integration-action — ikke browser-http');
  assert.equal(DESTINATION_ID, 'aura-gradientdeck');
  const stub = () => mockResponse('ok');
  const egress = new ExternalEgress(() => f.service);
  const response = await egress.webfetch({ root: f.root, url: 'https://eksempel.dk/side', dispatch: stub });
  await response.text();
  const registry = JSON.parse(await fs.readFile(path.join(f.service.directory, 'external-destinations.json'), 'utf8'));
  assert.deepEqual(registry['aura-gradientdeck'].actions, ['integration'], 'posten er integration-only: webfetch kan aldrig ramme den');
  assert.ok(registry['min-webfetch'], 'brugerens egen post består');
  // Har brugeren allerede en browser-http-regel på GradientDecks origin, kræver
  // webfetch stadig præcis ét match — integration-posten tæller ikke med.
  await fs.writeFile(path.join(f.service.directory, 'external-destinations.json'), JSON.stringify({ ...registry, 'bruger-gd': { endpoint: ORIGIN, locality: 'cloud', revision: 'v1', actions: ['browser-http'] } }), { mode: 0o600 });
  const again = new ExternalEgress(() => f.service);
  const second = await again.webfetch({ root: f.root, url: `${ORIGIN}/library.json`, dispatch: stub });
  await second.text();
});

test('egress-action: GradientDeck-kaldet bærer integration-action og destinationen i gennemgangen', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  f.choice = 'project';
  const catalog = await f.deck.catalog({ root: f.root });
  assert.equal(catalog.status, 'ok');
  assert.ok(f.reviews.length >= 1, 'den per-GET gennemgang («Før du sender») er kørt som normalt');
  assert.equal(f.reviews[0].destination.id, 'aura-gradientdeck', 'gennemgangen viser GradientDeck-destinationen');
  assert.match(f.reviews[0].payload, /"action":"integration"/, 'manifestet bærer integration-action');
  assert.doesNotMatch(f.reviews[0].payload, /"action":"browser-http"/, 'aldrig browser-http');
});

// ── 7 · Samtykkemodellen ─────────────────────────────────────────────────────

test('samtykke: Annullér stopper hentningen uden et eneste netværkskald', async t => {
  const f = await fixture(t);
  f.choice = 'once';
  await f.deck.catalog({ root: f.root });   // kataloget er klar — nu prøves stilen
  f.consents.length = 0;
  f.network.calls.length = 0;
  f.choice = 'cancel';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /annulleret/);
  assert.equal(f.network.calls.length, 0);
  assert.equal(f.consents.length, 1, 'samtykkedialogen viste præcis kilde-URL');
  assert.equal(f.consents[0].url, `${ORIGIN}/styles/cloudflare/design.md`);
  assert.equal(f.consents[0].kind, 'style');
  assert.equal(f.consents[0].name, 'Cloudflare', 'dialogen «Hent stilen «Navn»?» bærer navnet');
});

test('samtykke: «Tillad én gang» gælder netop DEN GET — næste hentning spørger igen', async t => {
  const f = await fixture(t);
  f.choice = 'once';
  await f.deck.catalog({ root: f.root });
  await f.deck.catalog({ root: f.root }); // frisk fra cache: ingen ny dialog
  assert.equal(f.consents.length, 1, 'cachen udløser ingen ny samtykkedialog');
  f.now += 8 * DAY;
  await f.deck.catalog({ root: f.root });
  assert.equal(f.consents.length, 2, 'en ny GET spørger igen — én gang var kun dén GET');
});

test('samtykke: «Husk for projektet» overlever genstart og gælder kun projektet', async t => {
  const f = await fixture(t);
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(f.consents.length, 1, 'én dialog dækker begge rutemønstre');
  // «Genstart»: en ny instans på samme lager.
  const restarted = new GradientDeck({ store: f.store, getPrivacy: () => f.service, consent: async () => { throw new Error('må ikke spørge'); }, quiet: () => true, fetch: f.network.transport, now: () => f.now, version: '0.5.7-test' });
  f.now += 8 * DAY;
  const again = await restarted.catalog({ root: f.root });
  assert.equal(again.status, 'ok', 'den huskede regel genkendes efter genstart');
  const otherRoot = path.join(f.directory, 'andet-projekt');
  await fs.mkdir(otherRoot);
  const other = await restarted.fetchStyle({ root: otherRoot, slug: 'blond' });
  assert.equal(other.status, 'error', 'reglen gælder kun projektet: en NETVÆRKShentning i et andet projekt kræver sin egen samtykke');
});

test('samtykke: ændres datareglerne, spørges der igen — og den gamle record ryddes', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } });
  f.choice = 'project';
  await f.deck.catalog({ root: f.root });
  const key = f.store.projectKey(f.root);
  const record = (await f.store.read()).projects[key].gradientdeck;
  assert.ok(record && record.grantedAt, 'recorden står under projektets indstillinger');
  await f.store.saveProject(f.root, { privacy: { enabled: true, version: 'synthetic-v2', defaultClass: 'internal', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } });
  f.now += 8 * DAY;
  f.choice = 'cancel';
  const asksAgain = await f.deck.catalog({ root: f.root });
  assert.equal(asksAgain.status, 'error', 'samtykket blev aldrig givet igen — annuleret stub');
  assert.match(asksAgain.message, /annulleret/);
  assert.equal(f.consents.length, 2, 'politikændringen gjorde, at der spørges igen');
  const after = (await f.store.read()).projects[key].gradientdeck;
  assert.equal(after, undefined, 'den forældede record slettes — den beskriver ikke længere de gældende regler');
});

test('samtykke: genkontrol umiddelbart før dispatch — en regelændring under dialogen afviser', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } });
  let asked = 0;
  const deck = new GradientDeck({ store: f.store, getPrivacy: () => f.service, consent: async () => { if (++asked === 1) { await f.store.saveProject(f.root, { privacy: { enabled: true, version: 'synthetic-v2', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } }); return 'once'; } return 'cancel'; }, quiet: () => true, fetch: f.network.transport, now: () => f.now, version: '0.5.7-test' });
  const result = await deck.catalog({ root: f.root });
  assert.equal(result.status, 'error', 'reglen ændrede sig i dialogens pause — intet sendes');
  assert.equal(f.network.calls.length, 0, 'ingen dispatch efter en forældet genkontrol');
});

test('uden projekt: «Åbn et projekt først» — ingen dialog, intet netværk', async t => {
  const f = await fixture(t);
  const result = await f.deck.fetchStyle({ root: null, slug: 'cloudflare' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /Åbn et projekt først/);
  assert.equal(f.consents.length, 0);
  assert.equal(f.network.calls.length, 0);
});

// ── 8 · Privacy-regressioner ─────────────────────────────────────────────────

test('Kun lokal: ingen dialog og intet netværk — men gemt katalog må vises', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', workMode: 'local', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  f.choice = 'once';
  const blocked = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(blocked.status, 'error');
  assert.match(blocked.message, /Kun lokal/);
  assert.equal(f.network.calls.length, 0, 'Kun lokal: nul requests');
  assert.equal(f.consents.length, 0, 'Kun lokal: nul dialoger');
  // En eksisterende cache må vises, men den må aldrig hentes igen.
  const g = await fixture(t, { privacy: null });
  g.choice = 'project';
  await g.deck.catalog({ root: g.root });
  await g.store.saveProject(g.root, { privacy: { enabled: true, version: 'synthetic-v1', workMode: 'local', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  g.now += 40 * DAY;
  const cached = await g.deck.catalog({ root: g.root });
  assert.equal(cached.status, 'ok', 'eksisterende cache vises i Kun lokal');
  assert.equal(cached.cached, true);
  assert.equal(cached.stale, true, 'markeringen «Gemt katalog» bæres med');
  assert.equal(g.network.calls.length, 1, 'kun den allerførste hentning har været på netværket');
});

test('PRIVACY_BLOCKED: organisationens loft ophæver aldrig den permanente projektregel', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(f.service.directory, 'external-destinations.json'), JSON.stringify({ 'aura-gradientdeck': { endpoint: ORIGIN, locality: 'cloud', revision: 'gradientdeck-v1', actions: ['integration'] } }), { mode: 0o600 });
  await fs.writeFile(path.join(f.service.directory, 'organization-policy.json'), JSON.stringify({ enabled: true, version: 'org-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['model-x'], requireApproval: true }), { mode: 0o600 });
  f.choice = 'project';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /tillader ikke denne eksterne handling/, 'gate-meddelelsen videresendes uændret');
  assert.equal(f.network.calls.length, 0, 'ingen dispatch');
});

test('allowDestination afvises under en kørsel — PRIVACY_STALE-risikoen er reel', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(f.service.directory, 'external-destinations.json'), JSON.stringify({ 'aura-gradientdeck': { endpoint: ORIGIN, locality: 'cloud', revision: 'gradientdeck-v1', actions: ['integration'] } }), { mode: 0o600 });
  f.bench.running = true;
  await assert.rejects(f.service.allowDestination({ scope: 'project', destinationId: 'aura-gradientdeck' }), /Stop den aktive opgave/);
  f.bench.running = false;
  await f.service.allowDestination({ scope: 'project', destinationId: 'aura-gradientdeck' });
  const stored = (await f.store.read()).projects[f.store.projectKey(f.root)].privacy.allowedDestinationIds;
  assert.deepEqual(stored, ['aura-gradientdeck'], 'tilføjelsen er idempotent og registret');
});

test('registry-posten skrives KUN én gang og kun uden aktiv kørsel', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  const registryFile = path.join(f.service.directory, 'external-destinations.json');
  f.quiet = false;
  await assert.rejects(f.deck.ensureDestination(), /vent/i, 'med en kørsel i gang skrives der ikke');
  assert.equal(await fs.stat(registryFile).then(() => true, () => false), false, 'ingen fil er opstået alligevel');
  f.quiet = true;
  assert.equal(await f.deck.ensureDestination(), true, 'første stille øjeblik skriver posten');
  const first = await fs.readFile(registryFile, 'utf8');
  assert.equal(await f.deck.ensureDestination(), false, 'andet kald skriver ikke igen');
  assert.equal(await fs.readFile(registryFile, 'utf8'), first, 'indholdet er urørt');
  f.quiet = false;
  assert.equal(await f.deck.ensureDestination(), false, 'posten findes — kørslen ændrer intet');
});

// ── Gennemgang Fund 1: registreringen må ALDRIG behandles som manglende, når
// den findes. Det gamle 64 KiB-læseloft overskrev et stort, gyldigt register
// lydløst med KUN gradientdeck-posten (live-reproduceret: 700 poster → 1).

test('Fund 1: et stort, gyldigt register (>64 KiB) består urørt — posten tilføjes ved siden af, aldrig i stedet for', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  // 700 brugerdestinationer ≈ 81 KiB — reelt over det gamle loft; privacy-
  // servicens egen readConfig accepterer 2 MB til netop denne fil.
  const users = Object.fromEntries(Array.from({ length: 700 }, (_unused, index) => [`min-webfetch-${index}`, { endpoint: `https://eksempel-${index}.dk`, locality: 'cloud', revision: `v${index}`, actions: ['browser-http'] }]));
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  const registryFile = path.join(f.service.directory, 'external-destinations.json');
  const original = JSON.stringify(users, null, 2);
  await fs.writeFile(registryFile, original, { mode: 0o600 });
  assert.ok(Buffer.byteLength(original) > 65536, 'fixturen er reelt over det gamle 64 KiB-loft');
  assert.equal(await f.deck.ensureDestination(), true, 'posten tilføjes uden at røre brugerens egne');
  const after = JSON.parse(await fs.readFile(registryFile, 'utf8'));
  for (let index = 0; index < 700; index++) assert.deepEqual(after[`min-webfetch-${index}`], users[`min-webfetch-${index}`], `min-webfetch-${index} består urørt`);
  assert.ok(after['aura-gradientdeck'], 'gradientdeck-posten står ved siden af brugerens egne');
  assert.equal(Object.keys(after).length, 701, 'præcis én post er kommet til');
});

test('Fund 1: et eksisterende, beskadiget register afvises ærligt og overskrives ALDRIG', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  const registryFile = path.join(f.service.directory, 'external-destinations.json');
  const original = '{"min-webfetch": {"endpoint": "https://eksempel.dk"';  // afbrudt JSON
  await fs.writeFile(registryFile, original, { mode: 0o600 });
  await assert.rejects(f.deck.ensureDestination(), /kunne ikke læses/, 'en eksisterende, ulæselig fil er en fejl — aldrig «mangler»');
  assert.equal(await fs.readFile(registryFile, 'utf8'), original, 'filen er byte-identisk — ingen nyoprettet registrering er skrevet hen over den');
});

test('Fund 1: et register over privacy-servicens eget loft (2 MB) afvises ærligt — intet skrives', async t => {
  const f = await fixture(t);
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  const registryFile = path.join(f.service.directory, 'external-destinations.json');
  const users = Object.fromEntries(Array.from({ length: 21000 }, (_unused, index) => [`regel-${index}`, { endpoint: `https://eksempel-${index}.dk`, locality: 'cloud', revision: 'v', actions: ['browser-http'] }]));
  const original = JSON.stringify(users);
  assert.ok(Buffer.byteLength(original) > 2_000_000, 'fixturen er reelt over 2 MB-loftet');
  await fs.writeFile(registryFile, original, { mode: 0o600 });
  await assert.rejects(f.deck.ensureDestination(), /kunne ikke læses/, 'et for stort register er en ærlig fejl — ikke et blankt register');
  assert.equal(await fs.readFile(registryFile, 'utf8'), original, 'filen er byte-identisk');
});

test('med Privacy Gate slået fra: legacyPermit-vejen — kontrol af rute og redirect består', async t => {
  const f = await fixture(t, { privacy: { enabled: false, version: 'off-v1', defaultClass: 'public' } });
  f.choice = 'once';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'ok', 'uden aktiv gate bruges legacy-tilladelsen');
  assert.equal(f.network.calls[0].options.redirect, 'error', 'redirect-afvisning gælder også uden gate');
  assert.equal(await fs.stat(path.join(f.service.directory, 'external-destinations.json')).then(() => true, () => false), false, 'registry-posten skrives ikke unødigt uden gate');
});

test('en slået-til gate kræver registry-posten: manglende post giver en ærlig fejl', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: [], requireApproval: true } });
  f.quiet = false;
  f.choice = 'once';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /vent|kørsel/i);
  assert.equal(f.network.calls.length, 0);
});

// ── 9 · Tørkørsel: hele svarteksten gennem inspector.cjs før «hentet» ────────

test('tørkørsel: base64-tung stil markeres sendable:false med den ærlige tekst', async t => {
  const f = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } });
  await fs.mkdir(f.service.directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(f.service.directory, 'external-destinations.json'), JSON.stringify({ 'aura-gradientdeck': { endpoint: ORIGIN, locality: 'cloud', revision: 'gradientdeck-v1', actions: ['integration'] } }), { mode: 0o600 });
  const base64ish = `# Kodet\n\n## Farver\n- #fff\n## Typografi\n- Inter\n## Spacing\n- 8px\n## Komponenter\n- Kort\n\n\`\`\`json\n${'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eg'.repeat(2)}\n\`\`\`\n`;
  const g = await fixture(t, { privacy: { enabled: true, version: 'synthetic-v1', defaultClass: 'public', maxClass: 'internal', allowedDestinationIds: ['aura-gradientdeck'], requireApproval: true } });
  await fs.mkdir(g.service.directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(g.service.directory, 'external-destinations.json'), JSON.stringify({ 'aura-gradientdeck': { endpoint: ORIGIN, locality: 'cloud', revision: 'gradientdeck-v1', actions: ['integration'] } }), { mode: 0o600 });
  const coded = new GradientDeck({
    store: g.store, getPrivacy: () => g.service, consent: async () => 'once', quiet: () => true,
    fetch: mockTransport(url => url.endsWith('/library.json') ? mockResponse(catalogText([catalogEntry('cloudflare', 'Cloudflare')]), { type: 'application/json' }) : mockResponse(base64ish)).transport,
    now: () => Date.now(), version: '0.5.7-test',
  });
  const result = await coded.fetchStyle({ root: g.root, slug: 'cloudflare' });
  assert.equal(result.status, 'ok', 'filen er hentet — det er afsendelsen, den nuværende politik vil afvise');
  assert.equal(result.sendable, false);
  assert.match(result.message, /Hentet, men datakontrollen vil afvise den ved afsendelse/);
  void f;
});

test('tørkørsel: uden aktiv gate er der intet at kontrollere — sendable er true', async t => {
  const f = await fixture(t, { privacy: { enabled: false, version: 'off-v1', defaultClass: 'public' } });
  f.choice = 'once';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.sendable, true, ' Privacy Gate slået fra: ingen tørkørsel mod en politik');
  void blocked;
});

// ── 10 · Bundtest: stilbiblioteket pakkes ALDRIG med appen ───────────────────

test('bundtest: intet gradientdeck-bibliotek i pakken', async () => {
  const builder = await fs.readFile(path.join(__dirname, '..', 'electron-builder.cjs'), 'utf8');
  assert.ok(!/gradientdeck/i.test(builder.replace(/core\/\*\*\/\*/g, '').replace(/ui\/\*\*\/\*/g, '')), 'ingen gradientdeck-sti i pakkekonfigurationen');
  const profiles = path.join(__dirname, '..', '..', 'profiles');
  const walk = async directory => {
    const out = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) out.push(...await walk(file));
      else out.push(file);
    }
    return out;
  };
  const files = await walk(profiles);
  for (const file of files) {
    assert.ok(!file.toLowerCase().includes('gradientdeck'), `${file} er ikke GradientDeck-biblioteksdata`);
    assert.ok(!/library\.json$/i.test(path.basename(file)), `${file} er ikke GradientDeck-kataloget`);
    assert.ok(!/styles\/[a-z0-9-]+\/design\.md$/i.test(file), `${file} er ikke en GradientDeck-stilfil`);
  }
  const uiAssets = await fs.readFile(path.join(__dirname, '..', 'core', 'ui-assets.cjs'), 'utf8');
  assert.ok(!/gradientdeck/i.test(uiAssets), 'ui-aktiverne indeholder ingen gradientdeck-data');
  const source = await fs.readFile(path.join(__dirname, '..', 'core', 'gradientdeck.cjs'), 'utf8');
  assert.match(source, /path\.join\([^)]*store\.root[^)]*,\s*'cache'/, 'cachen ligger under lagerets rod (brugerdata) — aldrig i appens mappe');
  assert.ok(!source.includes('__dirname'), 'modulet skriver aldrig relativt til sin egen mappe');
});

// ── 11 · UI-pins fra S3-liveanalysen ─────────────────────────────────────────

const read = name => fsSync.readFileSync(path.join(__dirname, '..', 'ui', name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

test('S4-UI: brugerboblen har igen en baggrund i MØRKT tema — forskelligt fra panelet', () => {
  const tokens = read('aura-tokens.css');
  const dark = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?:root:not\(\[data-workspace-theme="light"\]\)\s*\{([^}]*)\}/.exec(strip(tokens))[1];
  const bubble = /--aura-bg-bubble:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(dark);
  const raised = /--aura-bg-raised:\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(dark);
  assert.ok(bubble && raised, 'begge tokens findes i mørkt tema');
  assert.notDeepEqual([bubble[1], bubble[2], bubble[3]], [raised[1], raised[2], raised[3]], 'boblen er ikke længere fladtbundet med chattens panel');
  const light = /:root\s*\{([^}]*)\}/.exec(strip(tokens))[1];
  assert.match(light, /--aura-bg-bubble:\s*rgb\(237,\s*243,\s*254\)/, 'det lyse tema er uændret');
  const styles = strip(read('styles.css'));
  assert.match(styles, /\.chat-message\.user \.user-bubble\s*\{[^}]*background:\s*none/, 'P1s invariante består: den indre boble er stadig ren tekstbærer');
});

test('S4-UI: statuslinjen er ÉN nowrap-række; målingerne viger først ved pladsmangel', () => {
  const styles = strip(read('styles.css'));
  const rowRule = /\.composer-status\s*\{[^}]*\}/.exec(styles)[0];
  assert.match(rowRule, /flex-wrap:\s*nowrap/, 'rækken ombrydes aldrig');
  const lineRule = /\.status-line\s*\{[^}]*\}/.exec(styles)[0];
  assert.match(lineRule, /flex-wrap:\s*nowrap/, 'felterne står på én linje');
  assert.match(strip(read('styles.css')), /\.composer-status\.draft-crowded\s*>\s*#context-status\s*\{[^}]*display:\s*none/, 'ved pladsmangel viger målingerne — aldrig Datakontrol-knappen');
  const app = read('app.js');
  assert.match(app, /draft-crowded/, 'app.js måler pladsen og sætter crowding-tilstanden');
  const draftRule = /\.composer-status #draft-status\s*\{[^}]*\}/.exec(strip(read('styles.css')))[0];
  assert.match(draftRule, /white-space:\s*nowrap/, 'kladdestatussegmentet bryder aldrig linjen');
});

// ── 12 · S5: konsenttilstand og tilbagekaldelse (Datakontrol-linjen) ─────────
// Kendelse 3-betingelsen fra S4-gennemgangen: tilbagekaldelses-linjen i
// Datakontrol SKAL vise/fjerne 'aura-gradientdeck'-id'et. Tilbagekaldelsen
// stopper FREMTIDIGE hentninger straks; en allerede igangværende GET afbrydes
// ikke (den er genomgået og påtænges intet nyt) — dokumenteret i s5-report.

const PRIVACY_ON = () => ({ enabled: true, version: 's5-v1', workMode: 'cloud-controlled', defaultClass: 'internal', requireApproval: true, allowedDestinationIds: [] });

test('S5: consentState viser kun noget, når der er noget at tilbagekalde — husket samtykke OG id', async t => {
  const f = await fixture(t, { privacy: PRIVACY_ON() });
  assert.equal(await f.deck.consentState({ root: f.root }), null, 'før nogen hentning findes linjen ikke');
  f.choice = 'once';
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  const once = await f.deck.consentState({ root: f.root });
  assert.equal(once.destinationId, DESTINATION_ID, 'linjen viser destination-id’et additivt (kendelse 3)');
  assert.equal(once.remembered, false, '«én gang» huskes ikke');
  assert.equal(once.allowed, true, 'id’et er tilføjet additivt af allowDestination');
  // «Husk for projektet» — uret flyttes forbi TTL, så stilen hentes igen.
  f.choice = 'project';
  f.now = f.now + STYLE_TTL + DAY;
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  const remembered = await f.deck.consentState({ root: f.root });
  assert.equal(remembered.remembered, true, 'det huskede samtykke står i linjen');
  assert.equal(remembered.allowed, true);
  assert.match(remembered.grantedAt, /^\d{4}-\d{2}-\d{2}T/, 'tidspunktet medfølger');
});

test('S5: tilbagekaldelse rydder husket samtykke OG id — fremtidige hentninger spørger igen straks', async t => {
  const f = await fixture(t, { privacy: PRIVACY_ON() });
  f.choice = 'project';
  await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  const before = await f.deck.consentState({ root: f.root });
  assert.equal(before.remembered, true, 'samtykket er husket');
  assert.equal(before.allowed, true, 'id’et er tilføjet');
  const revoked = await f.deck.revoke({ root: f.root });
  assert.equal(revoked.status, 'ok');
  assert.equal(await f.deck.consentState({ root: f.root }), null, 'linjen er væk — der er intet at tilbagekalde');
  const state = await f.store.read();
  const project = state.projects[f.store.projectKey(f.root)];
  assert.equal(project.gradientdeck, undefined, 'samtykke-recorden er ryddet');
  assert.equal((project.privacy?.allowedDestinationIds || []).includes(DESTINATION_ID), false, 'id’et er fjernet fra projektets tilladelser (kendelse 3)');
  // Fremtidige hentninger spørger igen straks: intet hentes uden samtykke.
  f.now = f.now + STYLE_TTL + DAY;
  f.choice = 'cancel';
  const asked = f.consents.length;
  const calls = f.network.calls.length;
  const after = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(after.status, 'error', 'en annulleret hentning sender intet');
  assert.ok(f.consents.length > asked, 'samtykke blev spurgt igen — tilbagekaldelsen virker straks');
  assert.equal(f.network.calls.length, calls, 'intet nyt på netværket uden samtykke');
});

test('S5: tilbagekaldelse uden projekt afvises — og under en kørende opgave venter den ærligt', async t => {
  const f = await fixture(t);
  assert.equal((await f.deck.revoke({ root: null })).status, 'error', 'uden projekt intet at tilbagekalde');
  f.quiet = false;
  const busy = await f.deck.revoke({ root: f.root });
  assert.equal(busy.status, 'error');
  assert.match(busy.message, /Opgave er i gang|opgave er i gang/i, 'den ærlige fejl forklarer, hvorfor den venter');
  f.quiet = true;
  const ok = await f.deck.revoke({ root: f.root });
  assert.equal(ok.status, 'ok', 'uden husket samtykke er tilbagekaldelsen en idempotent ingen-handling');
});

test('S5: hentningen bærer kortets data med — kategori, tema og kilde-URL til stilkortet', async t => {
  const f = await fixture(t);
  f.choice = 'once';
  const result = await f.deck.fetchStyle({ root: f.root, slug: 'cloudflare' });
  assert.equal(result.status, 'ok');
  assert.equal(result.name, 'Cloudflare');
  assert.equal(result.category, 'Web', 'kortet viser kategorien');
  assert.equal(result.theme, 'dark', 'kortet viser temaet i tilgængelig form');
  assert.equal(result.sourceUrl, `${ORIGIN}/styles/cloudflare/design.md`, 'kortet viser den præcise kilde');
  assert.ok(Number.isFinite(result.fetchedAt), 'kortet kan vise «hentet»-dato');
});
