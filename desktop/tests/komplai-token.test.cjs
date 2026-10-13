const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os');
const { KomplaiToken } = require('../core/komplai-token.cjs');
const { Store } = require('../core/store.cjs');
const { Vault, privateDirectory } = require('../../cli/storage.cjs');
const { Workbench } = require('../core/workbench.cjs');

const key = 'kp_live_' + 'a'.repeat(43);
function account() { return { id: 'org-test', name: 'Prøvekommune', contract: 'kontrakt-1', balance: { availableMicros: 10000000 },
  credential: { id: 'token-test', scopes: ['coding:read', 'coding:complete'], expiresAt: new Date(Date.now() + 86400000).toISOString() },
  data: { recipients: 'Komplai', region: 'EU', training: 'Ingen', retention: 'Prøvevilkår', source: 'https://app.komplai.dk', checkedAt: '2026-10-13', version: '1', mode: 'syntetisk', accounting: 'Organisationens kreditter', platformStorage: 'Forbrugsmetadata' } }; }
async function fixture(t) {
  const directory = await privateDirectory(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-token-'))), vault = new Vault(directory);
  const password = 'syntetisk adgangssætning';
  await vault.unlock({ line() {}, protect() {}, ask: async () => password });
  const store = new Store(directory, vault);
  t.after(async () => { vault.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, vault, store };
}
test('tokenkontrol bekræfter organisation og rettigheder uden modelkald; gemning krypteres først efter ja', async t => {
  const { store, directory } = await fixture(t), value = account(), calls = [];
  const flow = new KomplaiToken({ fetcher: async (url, options) => {
    calls.push(url); assert.equal(url, 'https://api.komplai.dk/v1/aura/account'); assert.equal(options.headers.Authorization, `Bearer ${key}`); assert.equal(options.redirect, 'error');
    return Response.json({ ...value, secret: key });
  } }); t.after(() => flow.cancel());
  const review = await flow.check(key);
  assert.equal((await store.read()).connections.length, 0); assert.equal(JSON.stringify(review).includes(key), false);
  await assert.rejects(flow.connect('forkert', store), /Kontrollér tokenet/);
  const saved = await flow.connect(review.reviewID, store);
  assert.equal(saved.account.authMethod, 'token'); assert.equal(saved.account.organisationId, value.id); assert.equal(saved.secret, undefined);
  assert.equal(store.decrypt((await store.read()).connections[0]), key);
  assert.equal((await fs.readFile(path.join(directory, 'settings.json'), 'utf8')).includes(key), false);
  assert.equal(calls.length, 2); assert.equal(flow.pending, null);
});
test('ukendt metadata, manglende skrivetilladelse, udløb og HTTP 401 bliver afvist', async t => {
  const { store } = await fixture(t);
  for (const mutate of [a => delete a.credential, a => a.credential.scopes.pop(), a => a.credential.expiresAt = '2020-01-01', a => delete a.data.region]) {
    const value = account(); mutate(value); const flow = new KomplaiToken({ fetcher: async () => Response.json(value) });
    await assert.rejects(flow.check(key)); assert.equal(flow.pending, null);
  }
  const flow = new KomplaiToken({ fetcher: async () => Response.json({ error: 'invalid_api_key', detail: key }, { status: 401 }) });
  await assert.rejects(flow.check(key), error => /API-token/.test(error.message) && !error.message.includes(key));
  assert.equal((await store.read()).connections.length, 0);
});
test('annullering og forkert tokenformat giver ingen gemt forbindelse eller tilbagekaldelse', async t => {
  const { store } = await fixture(t); let release, calls = 0;
  const flow = new KomplaiToken({ fetcher: () => { calls++; return new Promise(resolve => release = resolve); } });
  await assert.rejects(flow.check('ingen-nøgle'), /kp_live_/); assert.equal(calls, 0);
  const pending = flow.check(key); flow.cancel(); release(Response.json(account()));
  await assert.rejects(pending, /afbrudt/); assert.equal((await store.read()).connections.length, 0);
});
test('ændret organisation, kontrakt eller token kan ikke gemmes med gammel godkendelse', async t => {
  const { store } = await fixture(t);
  for (const mutate of [a => a.id = 'anden', a => a.contract = 'anden', a => a.data.region = 'Andet sted', a => a.credential.id = 'anden', a => a.credential.scopes.push('anden:adgang')]) {
    const value = account(), flow = new KomplaiToken({ fetcher: async () => Response.json(value) });
    const review = await flow.check(key); mutate(value);
    await assert.rejects(flow.connect(review.reviewID, store), /ændret/); assert.equal(flow.pending, null);
  }
  assert.equal((await store.read()).connections.length, 0);
});
test('forbrug fra andre brugere kræver ikke nyt samtykke; låst lager bevarer tokenet hos Komplai', async t => {
  const { store, vault } = await fixture(t), value = account(); let calls = 0;
  const flow = new KomplaiToken({ fetcher: async () => { calls++; return Response.json(value); } }); t.after(() => flow.cancel());
  const review = await flow.check(key); value.balance.availableMicros -= 1;
  vault.close(); await assert.rejects(flow.connect(review.reviewID, store), /ikke tilgængelig/); assert.equal(calls, 1);
  await vault.unlock({ ask: async () => 'syntetisk adgangssætning', protect() {} });
  await flow.connect(review.reviewID, store); assert.equal(calls, 2);
});
test('fjernelse af et indsat token er lokal; browserlogin tilbagekaldes stadig på serveren', async t => {
  const { store, directory, vault } = await fixture(t);
  await store.update(state => { state.connections.push({ id: 'test', kind: 'komplai', secret: store.encrypt(key), baseURL: 'https://api.komplai.dk/v1/aura/v1', account: { authMethod: 'token' } }); });
  const bench = new Workbench({ directory, safeStorage: vault, profiles: path.join(__dirname, '../../profiles'), emit() {} });
  const fetcher = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ revoked: true }); };
  try {
    await bench.removeConnection('test'); assert.equal(calls, 0);
    await store.update(state => { state.connections.push({ id: 'browser', kind: 'komplai', secret: store.encrypt(key), baseURL: 'https://api.komplai.dk/v1/aura/v1', account: {} }); });
    await bench.removeConnection('browser'); assert.equal(calls, 1);
  } finally { globalThis.fetch = fetcher; await bench.close(); }
});
