const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { KomplaiLogin } = require('../core/komplai.cjs');
const { Store } = require('../core/store.cjs');
const { startGateway } = require('../core/gateway.cjs');
const connections = require('../core/connections.cjs');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');

test('Komplai: PKCE, forkert state, organisationsvalg og beskyttet nøgle', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-komplai-test-'));
  const store = new Store(directory, { isEncryptionAvailable: () => true, encryptString: value => Buffer.from('krypteret:' + Buffer.from(value).toString('base64')), decryptString: buffer => Buffer.from(buffer.toString().slice(10), 'base64').toString() });
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let authURL, requests = [];
  const organisation = { id: 'organisation-1', name: 'Prøvekommune', contract: 'vilkaar1' };
  const key = 'kp_live_' + 'a'.repeat(43);
  const login = new KomplaiLogin({ fetcher: async (url, options) => {
    requests.push({ url, options });
    if (url.endsWith('/config')) return Response.json({ issuer: 'https://auth.komplai.dk', clientId: 'test-client', scopes: ['openid'], authorizationEndpoint: 'https://auth.komplai.dk/oauth/v2/authorize', tokenEndpoint: 'https://auth.komplai.dk/oauth/v2/token' });
    if (url.endsWith('/token')) { const values = options.body; assert.equal(values.get('client_secret'), null); assert.equal(createHash('sha256').update(values.get('code_verifier')).digest('base64url'), authURL.searchParams.get('code_challenge')); return Response.json({ access_token: 'hemmeligt-login', token_type: 'Bearer' }); }
    if (url.endsWith('/organisations')) { assert.equal(options.headers.Authorization, 'Bearer hemmeligt-login'); return Response.json({ organisations: [organisation] }); }
    assert.equal(url.endsWith('/connect'), true); assert.deepEqual(JSON.parse(options.body), { organisationId: organisation.id, contract: 'vilkaar1', acceptSharedCredits: true });
    return Response.json({ id: 'key-id', secret: key, expiresAt: new Date(Date.now() + 60000).toISOString() });
  } });
  t.after(() => login.cancel());
  const result = await login.start(async address => {
    authURL = new URL(address); const callback = new URL(authURL.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', 'forkert'); callback.searchParams.set('code', 'testcode');
    assert.equal((await fetch(callback)).status, 400);
    callback.searchParams.set('state', authURL.searchParams.get('state'));
    assert.equal((await fetch(callback)).status, 200);
  });
  assert.deepEqual(result, { organisations: [organisation] });
  await assert.rejects(login.connect('anden-organisation', store), /vælg din organisation/);
  const publicData = await login.connect(organisation.id, store);
  assert.equal(publicData.account.organisationId, organisation.id);
  assert.equal(publicData.secret, undefined); assert.equal(login.pending, null);
  const raw = await fs.readFile(path.join(directory, 'settings.json'), 'utf8');
  assert.equal(raw.includes(key), false); assert.equal(raw.includes('hemmeligt-login'), false);
  assert.equal(store.decrypt((await store.read()).connections[0]), key);
});

test('Komplai: ingen browser eller nøgle hvis opsætning mangler; login kan afbrydes', async t => {
  const login = new KomplaiLogin({ fetcher: async () => Response.json({ error: 'aura_not_configured' }, { status: 503 }) });
  await assert.rejects(login.start(() => assert.fail('Browseren må ikke åbnes')), /ikke åbnet/);
  assert.equal(login.pending, null);
  login.fetcher = async () => Response.json({ issuer: 'https://auth.komplai.dk', clientId: 'c', scopes: ['openid'], authorizationEndpoint: 'https://auth.komplai.dk/oauth/v2/authorize', tokenEndpoint: 'https://auth.komplai.dk/oauth/v2/token' });
  await assert.rejects(login.start(async () => login.cancel()), /afbrudt/);
  assert.equal(login.pending, null);
});

test('Komplai: egen loginserver, org-bundet katalog, DKK og ændrede vilkår', async () => {
  const login = new KomplaiLogin({ fetcher: async () => Response.json({ issuer: 'https://angriber.invalid', clientId: 'c', scopes: ['openid'] }) });
  await assert.rejects(login.start(() => assert.fail()), /ikke bekræftes/);
  const connection = { kind: 'komplai', name: 'Komplai', baseURL: connections.definitions.komplai.baseURL, account: { organisationId: 'a' } };
  const model = { id: 'kode', price: { prompt: '0.000002', completion: '0.000005', currency: 'DKK' }, komplai: { id: 'a', name: 'Kommune', contract: '1', data: { recipients: 'Komplai → Scaleway', region: 'Komplais API: Hetzner, Tyskland. Model: Scaleway, Frankrig.', retention: 'Vilkår', training: 'Ingen', source: 'https://example.org', checkedAt: '2026-10-13', version: '1', accounting: 'Fælleskreditter', platformStorage: 'Metadata' } } };
  assert.equal(connections.priceFor(connection, model).currency, 'DKK');
  const first = connections.disclosure(connection, model); assert.match(first.price, /DKK/);
  assert.equal(first.provider, 'komplai');
  assert.match(first.regionShort, /komplai.*alle oplysninger/);
  assert.doesNotMatch(first.regionShort, /Scaleway|Hetzner/);
  assert.equal(first.recipients, model.komplai.data.recipients);
  assert.equal(first.region, model.komplai.data.region);
  model.komplai.data.region = 'Ukendt behandlingssted';
  const changedRegion = connections.disclosure(connection, model);
  assert.equal(changedRegion.regionShort, first.regionShort);
  assert.equal(changedRegion.region, 'Ukendt behandlingssted');
  assert.notEqual(changedRegion.fingerprint, first.fingerprint, 'Ny godkendelse kræves, selv om det korte resumé er uændret');
  model.komplai.contract = '2'; assert.notEqual(connections.disclosure(connection, model).fingerprint, changedRegion.fingerprint);
  model.komplai.id = 'anden'; assert.throws(() => connections.disclosure(connection, model), /Hent organisationens modeller/);
});

test('Komplai: rigtig loopback-gateway videresender valgt kontrakt og selvstændige kald-id’er', async t => {
  const sent = [];
  const server = http.createServer(async (req, res) => { let raw = ''; for await (const part of req) raw += part; sent.push({ headers: req.headers, body: JSON.parse(raw) }); res.setHeader('content-type', 'text/event-stream'); res.end('data: [DONE]\n\n'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const gateway = await startGateway({ kind: 'komplai', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, { id: 'kode', komplai: { contract: 'vilkaar-1' } }, 'adgang', null);
  t.after(() => gateway.close());
  for (let i = 0; i < 2; i++) { const response = await fetch(gateway.url + '/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${gateway.token}` }, body: JSON.stringify({ model: 'kode', stream: true }) }); assert.equal(response.status, 200); await response.text(); }
  assert.equal(sent[0].headers['x-komplai-contract'], 'vilkaar-1'); assert.equal(sent[0].headers.authorization, 'Bearer adgang');
  assert.notEqual(sent[0].headers['x-request-id'], sent[1].headers['x-request-id']);
  assert.deepEqual(sent[0].body.stream_options, { include_usage: true });
});

test('Komplai: opbrugte fælleskreditter giver en konkret besked og ingen automatiske genforsøg', async t => {
  let calls = 0; const failures = [];
  const server = http.createServer((req, res) => { calls++; req.resume(); res.writeHead(429, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'ai_credit_exhausted', detail: 'må ikke vises' })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const gateway = await startGateway({ kind: 'komplai', baseURL: `http://127.0.0.1:${server.address().port}/v1` }, { id: 'kode', komplai: { contract: '1' } }, 'syntetisk', null, (message, reason) => failures.push({ message, reason }));
  t.after(async () => { await gateway.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const send = () => fetch(gateway.url + '/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${gateway.token}` }, body: JSON.stringify({ model: 'kode' }) });
  const first = await send(); assert.equal(first.status, 429); assert.match(await first.text(), /Organisationens AI-kreditter/);
  const retry = await send(); assert.equal(retry.status, 409); await retry.text(); assert.equal(calls, 1);
  assert.equal(failures[0].reason.kind, 'quota'); assert.doesNotMatch(failures[0].message, /må ikke vises/);
});

test('Komplai: dansk kreditforbrug blandes ikke med USD efter modelskift eller genåbning', async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-komplai-pris-'));
  const bench = new Workbench({ directory: path.join(root, 'state'), profiles: path.join(__dirname, '../../profiles'), emit: () => {}, safeStorage: {} });
  t.after(async () => { await bench.close(); await fs.rm(root, { recursive: true, force: true }); });
  const project = path.join(root, 'project'); await fs.mkdir(project); await bench.activate({ root: project, name: 'Prøve' });
  const chat = bench.chat; chat.usageBase = { ...chat.usageBase, calls: 1, cost: 0.02 };
  chat.runPrice = { currency: 'DKK', input: 2, output: 5, cacheRead: 0.5, cacheWrite: 2 };
  chat.runSteps.set('1', { input: 60, output: 40, reasoning: 10, cache: { read: 40 } });
  const first = chat.currentUsage(); assert.equal(first.cost, 0.02); assert.equal(first.otherCosts.DKK, 0.00039);
  assert.deepEqual(chat.currentUsage(), first, 'visning må ikke tælle samme kald flere gange');
  chat.runUser = { id: 'u', role: 'user', text: 'Prøve' }; chat.running = true; await chat.saveHistory('idle'); chat.running = false;
  await bench.activate({ root: project, name: 'Prøve' });
  assert.equal(bench.chat.currentUsage().cost, 0.02); assert.equal(bench.chat.currentUsage().otherCosts.DKK, 0.00039);
});

test('Komplai: loginrespons har en øvre grænse og tilbagekaldelse skjuler ikke netværksfejl', async () => {
  const { readBounded, disconnect } = require('../core/komplai.cjs');
  await assert.rejects(readBounded(new Response('x'.repeat(64001)), 64000), /for stort/);
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('hemmelig intern fejl'); };
    await assert.rejects(disconnect({ baseURL: 'https://api.komplai.dk/v1/aura/v1' }, 'syntetisk'), /komplai kunne ikke kontaktes/);
  } finally { globalThis.fetch = original; }
});
