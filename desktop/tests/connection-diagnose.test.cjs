const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { Workbench } = require('../core/workbench.cjs');
const { diagnoseConnection, modelCatalogURL } = require('../core/connections.cjs');
const key = 'synthetic-diagnosis-not-a-real-key';
const statuses = value => Object.fromEntries(value.steps.map(step => [step.id, step.status]));
async function serverFixture(t, respond) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body });
    respond(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { requests, connection: { id: 'synthetic-connection', name: 'Synthetic', kind: 'compatible', baseURL: `http://127.0.0.1:${server.address().port}/v1` } };
}
const list = res => res.end(JSON.stringify({ data: [{ id: 'synthetic-model' }] }));
async function workbenchFixture(t, connection) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-diagnose-'));
  const bench = new Workbench({ directory: root, profiles: path.resolve(__dirname, '../../profiles'), safeStorage: {}, emit() {} });
  await bench.store.update(state => { state.connections = [connection]; });
  t.after(async () => { await bench.close(); await fs.rm(root, { recursive: true, force: true }); });
  return bench;
}

test('diagnosis distinguishes reachable server, accepted key and real models without any model call', async t => {
  const f = await serverFixture(t, (req, res) => { if (!req.headers.authorization) { res.writeHead(401); res.end(key); } else list(res); });
  const result = await diagnoseConnection(f.connection, key);
  assert.deepEqual(statuses(result), { reach: 'ok', key: 'ok', models: 'ok', text: 'skipped', tools: 'skipped' });
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
  assert.equal(f.requests.length, 2); assert.equal(f.requests[0].headers.authorization, undefined);
  assert.equal(f.requests[1].headers.authorization, `Bearer ${key}`);
  for (const request of f.requests) { assert.equal(request.method, 'GET'); assert.equal(request.url, '/v1/models'); assert.equal(request.body, ''); }
  assert.equal(JSON.stringify(result).includes(key), false);
});

for (const status of [401, 403]) test(`HTTP ${status} fails key access without returning raw provider data`, async t => {
  const f = await serverFixture(t, (_req, res) => { res.writeHead(status); res.end(key + ' https://secret.example.invalid/?key=' + key); });
  const result = await diagnoseConnection(f.connection, key);
  assert.deepEqual(statuses(result), { reach: 'ok', key: 'failed', models: 'failed', text: 'skipped', tools: 'skipped' });
  assert.doesNotMatch(JSON.stringify(result), /synthetic-diagnosis-not-a-real-key|secret\.example/);
});

test('a public model catalog does not prove key acceptance; keyless servers skip key validation', async t => {
  const f = await serverFixture(t, (_req, res) => list(res));
  assert.equal(statuses(await diagnoseConnection(f.connection, key)).key, 'unknown');
  assert.deepEqual(statuses(await diagnoseConnection(f.connection)), { reach: 'ok', key: 'skipped', models: 'ok', text: 'skipped', tools: 'skipped' });
});

test('a missing required key does not send an authenticated request', async t => {
  const f = await serverFixture(t, (_req, res) => { res.writeHead(401); res.end(); });
  const result = await diagnoseConnection({ ...f.connection, kind: 'groq' });
  assert.deepEqual(statuses(result), { reach: 'ok', key: 'failed', models: 'skipped', text: 'skipped', tools: 'skipped' });
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].headers.authorization, undefined);
});

test('documented recommendations stay unknown rather than becoming a verified catalog or key', async t => {
  const f = await serverFixture(t, (_req, res) => { res.writeHead(404); res.end(key); });
  const result = await diagnoseConnection({ ...f.connection, kind: 'fireworks' }, key);
  assert.deepEqual(statuses(result), { reach: 'ok', key: 'unknown', models: 'unknown', text: 'skipped', tools: 'skipped' });
  assert.equal(result.steps.find(step => step.id === 'models').detail, 'Modelliste fra dokumentation, ikke fra udbyderen');
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('server failure, malformed JSON and empty catalogs never report successful models', async t => {
  let reply = res => { res.writeHead(500); res.end(key); };
  const f = await serverFixture(t, (_req, res) => reply(res));
  assert.equal(statuses(await diagnoseConnection(f.connection, key)).models, 'failed');
  reply = res => res.end(key);
  assert.equal(statuses(await diagnoseConnection(f.connection, key)).models, 'failed');
  reply = res => res.end('{"data":[]}');
  assert.equal(statuses(await diagnoseConnection(f.connection, key)).models, 'unknown');
});

test('an unavailable server fails reach and does not expose transport exceptions', async t => {
  const f = await serverFixture(t, (_req, res) => list(res));
  t.mock.method(global, 'fetch', async () => { throw new Error(key); });
  const result = await diagnoseConnection(f.connection, key);
  assert.deepEqual(statuses(result), { reach: 'failed', key: 'unknown', models: 'skipped', text: 'skipped', tools: 'skipped' });
  assert.equal(JSON.stringify(result).includes(key), false);
});

test('Anthropic-compatible diagnosis uses its exact catalog route and provider header', async t => {
  const f = await serverFixture(t, (req, res) => { if (!req.headers['x-api-key']) { res.writeHead(401); res.end(); } else list(res); });
  const result = await diagnoseConnection({ ...f.connection, protocol: 'anthropic' }, key);
  assert.equal(statuses(result).key, 'ok');
  assert.equal(f.requests[1].headers['x-api-key'], key);
  assert.equal(f.requests[1].headers['anthropic-version'], '2023-06-01');
  assert.equal(f.requests[1].headers.authorization, undefined);
});

test('saved-connection diagnosis uses the real discovery permit and rejects renderer destinations', async t => {
  const f = await serverFixture(t, (_req, res) => list(res)), bench = await workbenchFixture(t, f.connection);
  let scopes = [];
  const permit = bench.privacy.discoveryPermit.bind(bench.privacy);
  bench.privacy.discoveryPermit = (scope, connection) => { scopes.push(scope.kind); return permit(scope, connection); };
  assert.equal(statuses(await bench.diagnoseConnection({ id: f.connection.id })).models, 'ok');
  assert.deepEqual(scopes, ['idea']);
  const before = f.requests.length;
  for (const input of [{ id: f.connection.id, baseURL: 'https://other.example.invalid' }, { id: f.connection.id, apiKey: key }, { id: f.connection.id, chat: 'other' }, { id: 'missing' }, null, { id: 12 }]) await assert.rejects(bench.diagnoseConnection(input));
  assert.equal(f.requests.length, before);
});

test('local-only privacy prevents cloud diagnosis before network bytes', async t => {
  const connection = { id: 'synthetic-cloud', kind: 'groq', name: 'Synthetic cloud', baseURL: 'https://api.groq.com/openai/v1' };
  const bench = await workbenchFixture(t, connection);
  await bench.store.update(state => { state.privacyIdea = { enabled: true, version: 'local-policy', workMode: 'local', allowedDestinationIds: [connection.id] }; });
  let calls = 0; t.mock.method(global, 'fetch', async () => { calls++; throw new Error('Unexpected request'); });
  await assert.rejects(bench.diagnoseConnection({ id: connection.id }), { code: 'PRIVACY_LOCAL_REQUIRED' });
  assert.equal(calls, 0);
});

test('policy changes during key access invalidate diagnosis before its first request', async t => {
  const f = await serverFixture(t, (_req, res) => list(res)), bench = await workbenchFixture(t, f.connection);
  bench.store.decrypt = () => {
    const file = path.join(bench.store.root, 'settings.json');
    const state = JSON.parse(require('node:fs').readFileSync(file, 'utf8'));
    state.connections[0].revision = 'changed';
    require('node:fs').writeFileSync(file, JSON.stringify(state));
    return key;
  };
  await assert.rejects(bench.diagnoseConnection({ id: f.connection.id }), { code: 'PRIVACY_STALE' });
  assert.equal(f.requests.length, 0);
});

test('policy changes during the unauthenticated reach probe stop all subsequent requests', async t => {
  const f = await serverFixture(t, (_req, res) => list(res)), bench = await workbenchFixture(t, f.connection);
  let calls = 0;
  t.mock.method(global, 'fetch', async () => {
    calls++;
    await bench.store.update(state => { state.connections[0].revision = 'changed-in-flight'; });
    return new Response('{}', { status: 401 });
  });
  await assert.rejects(bench.diagnoseConnection({ id: f.connection.id }), { code: 'PRIVACY_STALE' });
  assert.equal(calls, 1);
});

test('redirects cannot move a reach probe or API key to another catalog destination', async t => {
  const f = await serverFixture(t, (req, res) => {
    if (req.url === '/v1/models') res.writeHead(302, { location: '/different' });
    list(res);
  });
  assert.equal(statuses(await diagnoseConnection(f.connection, key)).reach, 'failed');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, '/v1/models');
  assert.equal(f.requests[0].headers.authorization, undefined);
});

test('Cloudflare diagnosis keeps the exact account catalog URL for both unauthenticated and keyed requests', async t => {
  const connection = { id: 'synthetic-cf', name: 'Synthetic', kind: 'cloudflare', baseURL: 'https://api.cloudflare.com/client/v4/accounts/' + 'a'.repeat(32) + '/ai/v1' };
  const bench = await workbenchFixture(t, connection);
  bench.store.decrypt = () => key;
  let calls = 0;
  t.mock.method(global, 'fetch', async (url, options) => {
    calls++; assert.equal(url, modelCatalogURL(connection)); assert.equal(options.method, 'GET');
    return options.headers.Authorization ? new Response('{"result":[{"name":"@cf/synthetic"}]}') : new Response(key, { status: 401 });
  });
  assert.equal(statuses(await bench.diagnoseConnection({ id: connection.id })).key, 'ok');
  assert.equal(calls, 2);
});

test('live diagnosis requires a separate confirmation and always skips without decrypting or sending', async t => {
  const f = await serverFixture(t, (_req, res) => list(res)), bench = await workbenchFixture(t, f.connection);
  bench.store.decrypt = () => { throw new Error('Live diagnosis must not open the keychain'); };
  for (const input of [{ id: f.connection.id, modelID: 'synthetic' }, { id: f.connection.id, modelID: 'synthetic', confirm: false }, { id: 'missing', modelID: 'synthetic', confirm: true }, { id: f.connection.id, modelID: 'synthetic', confirm: true, prompt: 'ignored?' }]) await assert.rejects(bench.diagnoseConnectionLive(input));
  const result = await bench.diagnoseConnectionLive({ id: f.connection.id, modelID: 'synthetic', confirm: true });
  assert.deepEqual(statuses(result), { text: 'skipped', tools: 'skipped' });
  assert.equal(f.requests.length, 0);
});

test('main and preload expose the bounded diagnosis operations with trusted scope', () => {
  const main = require('node:fs').readFileSync(path.join(__dirname, '../main.cjs'), 'utf8');
  assert.match(main, /handle\('connections:diagnose', value => workbench\.diagnoseConnection\(value, requests\.getStore\(\)\?\.chat\)\)/);
  assert.match(main, /handle\('connections:diagnose-live', value => workbench\.diagnoseConnectionLive\(value\)\)/);
  const calls = [], context = {};
  require('node:vm').runInNewContext(require('node:fs').readFileSync(path.join(__dirname, '../preload.cjs'), 'utf8'), { require: id => {
    assert.equal(id, 'electron'); return { contextBridge: { exposeInMainWorld: (_name, api) => { context.api = api; } }, ipcRenderer: { invoke: (...args) => calls.push(args) } };
  } });
  context.api.connectionDiagnose({ id: 'saved' });
  context.api.connectionDiagnoseLive({ id: 'saved', modelID: 'synthetic', confirm: true });
  assert.equal(calls[0][0], 'connections:diagnose'); assert.equal(calls[1][0], 'connections:diagnose-live');
});
