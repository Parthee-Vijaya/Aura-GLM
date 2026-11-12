const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { discoverLocalModels, discoverForWorkbench, SERVERS, TIMEOUT_MS } = require('../core/local-discovery.cjs');
const { requestJSON, modelCatalogURL } = require('../core/connections.cjs');
const { Store } = require('../core/store.cjs');
const { PrivacyService } = require('../core/privacy-service.cjs');
const { Workbench } = require('../core/workbench.cjs');

async function serverFixture(t, respond) {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    requests.push({ url: request.url, method: request.method, authorization: request.headers.authorization, apiKey: request.headers['x-api-key'] });
    try { await respond(request, response); } catch { response.writeHead(500).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const read = (url, options) => {
    const spec = SERVERS.find(server => modelCatalogURL(server) === url);
    assert.ok(spec, 'Only the fixed production loopback targets may be requested.');
    const target = `${base}/${spec.kind}${new URL(url).pathname}`;
    return requestJSON(target, { ...options, assertCurrent: address => { assert.equal(address, target); return options.assertCurrent(url); } });
  };
  return { read, requests };
}
async function benchFixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-local-discovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  await store.update(() => {});
  store.decrypt = () => { throw Error('Discovery must never open the keychain.'); };
  const bench = { store, project: null, chat: null, chats: new Map(), emit() {} };
  bench.privacy = new PrivacyService(bench);
  bench.discoveryScope = Workbench.prototype.discoveryScope.bind(bench);
  return bench;
}
const payload = kind => kind === 'ollama' ? { models: [{ name: 'qwen3:8b' }, { name: 'model:cloud' }, { name: 'remote', remote_host: 'synthetic.example.invalid' }, { name: '<script>' }, null] } : { data: [{ id: kind + '/synthetic-model' }, { id: '<script>' }, { id: 123 }, null] };

test('three fixed loopback probes are keyless and preserve the legacy Ollama result', async () => {
  const calls = [];
  const result = await discoverLocalModels(async (url, options) => {
    const server = SERVERS.find(server => modelCatalogURL(server) === url);
    assert.ok(server); calls.push(url);
    assert.ok(options.signal); assert.equal(options.key, undefined); assert.equal(options.body, undefined); assert.equal(options.assertCurrent(url), true);
    assert.throws(() => options.assertCurrent(url + '/different'), { code: 'PRIVACY_DESTINATION_INVALID' });
    return payload(server.kind);
  });
  assert.deepEqual(calls, ['http://127.0.0.1:11434/api/tags', 'http://127.0.0.1:1234/v1/models', 'http://127.0.0.1:8000/v1/models']);
  assert.equal(result.status, 'found');
  assert.deepEqual(result.models.map(model => model.remote), [false, true, true]);
  assert.deepEqual(result.servers.map(server => server.kind), ['ollama', 'lmstudio', 'vllm']);
  assert.deepEqual(result.servers.map(server => server.models.length), [3, 1, 1]);
  for (const server of result.servers) { assert.equal(server.status, 'found'); assert.equal(server.executionVerified, false); assert.equal(server.models[0].id, server.models[0].name); }
});

test('unavailable, empty and invalid responses are independent per server', async () => {
  const result = await discoverLocalModels(async url => {
    if (url.includes(':11434')) throw Error('synthetic-private-error');
    if (url.includes(':1234')) return { data: [] };
    return { data: {} };
  });
  assert.equal(result.status, 'unavailable'); assert.deepEqual(result.models, []);
  assert.deepEqual(result.servers.map(server => server.status), ['unavailable', 'empty', 'invalid']);
  assert.equal(JSON.stringify(result).includes('synthetic-private-error'), false);
  const lmOnly = await discoverLocalModels(async url => { if (url.includes(':1234')) return payload('lmstudio'); throw Error(); });
  assert.equal(lmOnly.status, 'unavailable', 'Legacy Ollama callers must not turn a found LM Studio server into an Ollama connection.');
  assert.equal(lmOnly.servers[1].status, 'found');
});

test('actual local HTTP catalogs use only GET without credentials and redirects are not followed', async t => {
  let redirect = false;
  const f = await serverFixture(t, (request, response) => {
    if (redirect) return response.writeHead(302, { location: '/must-not-be-followed' }).end();
    response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(payload(request.url.split('/')[1])));
  });
  const result = await discoverLocalModels(f.read);
  assert.ok(result.servers.every(server => server.status === 'found'));
  redirect = true;
  assert.ok((await discoverLocalModels(f.read)).servers.every(server => server.status === 'unavailable'));
  assert.equal(f.requests.length, 6);
  for (const request of f.requests) { assert.equal(request.method, 'GET'); assert.equal(request.authorization, undefined); assert.equal(request.apiKey, undefined); assert.ok(!request.url.includes('must-not')); }
});

test('each hanging probe has a short timeout and the probes run concurrently', { timeout: 10000 }, async t => {
  // Real pending HTTP requests keep the loop alive. AbortSignal.timeout uses an
  // unref'ed timer, so a promise-only double can exit before its abort fires.
  const f = await serverFixture(t, () => {});
  const started = Date.now(); let active = 0, peak = 0;
  const result = await discoverLocalModels(async (url, options) => {
    peak = Math.max(peak, ++active);
    try { return await f.read(url, options); } finally { active--; }
  });
  assert.equal(TIMEOUT_MS, 2500); assert.equal(peak, 3); assert.equal(active, 0);
  assert.equal(f.requests.length, 3);
  assert.ok(result.servers.every(server => server.status === 'unavailable'));
  assert.ok(Date.now() - started < 6000);
});

test('host discovery never saves or decrypts a connection; renderer input cannot select a destination', async t => {
  const bench = await benchFixture(t), before = await bench.store.read();
  const f = await serverFixture(t, (request, response) => response.end(JSON.stringify(payload(request.url.split('/')[1]))));
  const result = await discoverForWorkbench(bench, undefined, f.read);
  assert.ok(result.servers.every(server => server.status === 'found'));
  assert.deepEqual(await bench.store.read(), before);
  const main = await fs.readFile(path.join(__dirname, '../main.cjs'), 'utf8');
  assert.match(main, /handle\('connections:discover', \(\) => require\('\.\/core\/local-discovery.cjs'\)\.discoverForWorkbench\(currentWorkbench\(\), requests\.getStore\(\)\?\.chat\)\)/);
});

test('active Privacy Gate blocks unknown servers before any request, including local-only mode', async t => {
  const bench = await benchFixture(t);
  await bench.store.update(state => { state.privacyIdea = { enabled: true, version: 'local-test', workMode: 'local', allowedDestinationIds: [] }; });
  let calls = 0;
  const result = await discoverForWorkbench(bench, undefined, async () => { calls++; throw Error(); });
  assert.equal(calls, 0); assert.ok(result.servers.every(server => server.status === 'blocked' && server.reason));
});

test('saved approved local server uses the existing discoveryPermit while unknown servers stay blocked', async t => {
  const bench = await benchFixture(t), connection = { id: 'saved-local', kind: 'lmstudio', name: 'Synthetic local', baseURL: SERVERS[1].baseURL };
  await bench.store.update(state => { state.connections = [connection]; state.privacyIdea = { enabled: true, version: 'local-test', workMode: 'local', allowedDestinationIds: [connection.id] }; });
  await fs.mkdir(bench.privacy.directory, { mode: 0o700 });
  await fs.writeFile(path.join(bench.privacy.directory, 'destinations.json'), JSON.stringify({ [connection.id]: { endpoint: connection.baseURL, locality: 'device', revision: 'synthetic' } }), { mode: 0o600 });
  const permit = bench.privacy.discoveryPermit.bind(bench.privacy), scopes = [];
  bench.privacy.discoveryPermit = (scope, saved) => { scopes.push({ kind: scope.kind, id: saved.id }); return permit(scope, saved); };
  const f = await serverFixture(t, (request, response) => response.end(JSON.stringify(payload(request.url.split('/')[1]))));
  const result = await discoverForWorkbench(bench, undefined, f.read);
  assert.deepEqual(scopes, [{ kind: 'idea', id: connection.id }]);
  assert.deepEqual(result.servers.map(server => server.status), ['blocked', 'found', 'blocked']);
  assert.equal(f.requests.length, 1);
});

test('background conversation privacy is honored instead of the currently selected unprotected conversation', async t => {
  const bench = await benchFixture(t), root = path.join(bench.store.root, 'project'); await fs.mkdir(root);
  bench.project = { root }; bench.chat = { id: 'selected' }; bench.chats = new Map([['selected', bench.chat], ['background', { id: 'background' }]]);
  const saved = { id: 'saved-local', kind: 'vllm', name: 'Synthetic loopback proxy', baseURL: SERVERS[2].baseURL };
  await bench.store.update(state => { state.connections = [saved]; state.projects[bench.store.projectKey(root)] = { privacy: { conversations: { background: { enabled: true, version: 'background-only', workMode: 'local', allowedDestinationIds: [saved.id] } } } }; });
  let calls = 0;
  const read = async url => { calls++; return payload(SERVERS.find(server => modelCatalogURL(server) === url).kind); };
  assert.ok((await discoverForWorkbench(bench, 'background', read)).servers.every(server => server.status === 'blocked'));
  assert.equal(calls, 0);
  assert.ok((await discoverForWorkbench(bench, 'selected', read)).servers.every(server => server.status === 'found'));
  assert.equal(calls, 3);
});

test('policy changes in flight invalidate the whole result without leaking server errors or metadata', async t => {
  const bench = await benchFixture(t);
  const f = await serverFixture(t, async (request, response) => {
    if (request.url.startsWith('/ollama/')) await bench.store.update(state => { state.privacyIdea = { enabled: true, version: 'changed', workMode: 'local' }; });
    response.end(JSON.stringify(payload(request.url.split('/')[1])));
  });
  await assert.rejects(discoverForWorkbench(bench, undefined, f.read), { code: 'PRIVACY_STALE' });
});

test('a completed server result is revalidated before slower parallel probes can publish the combined result', async () => {
  let revoked = false;
  await assert.rejects(discoverLocalModels(async url => {
    const server = SERVERS.find(server => modelCatalogURL(server) === url);
    if (server.kind !== 'ollama') await new Promise(resolve => setImmediate(resolve));
    if (server.kind === 'vllm') revoked = true;
    return payload(server.kind);
  }, { authorize: async server => () => {
    if (server.kind === 'ollama' && revoked) throw Object.assign(Error('Synthetic revision changed'), { code: 'PRIVACY_STALE' });
    return true;
  } }), { code: 'PRIVACY_STALE' });
});

test('corrupt privacy policy fails closed rather than silently falling back to unrestricted discovery', async t => {
  const bench = await benchFixture(t);
  await bench.store.update(state => { state.privacyIdea = { enabled: 'invalid' }; });
  let calls = 0;
  await assert.rejects(discoverForWorkbench(bench, undefined, async () => { calls++; return {}; }), { code: 'PRIVACY_POLICY_INVALID' });
  assert.equal(calls, 0);
});
