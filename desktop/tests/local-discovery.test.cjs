const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { discoverLocalModels } = require('../core/local-discovery.cjs');
const { requestJSON } = require('../core/connections.cjs');
test('Søgningen bruger kun loopback og markerer mulige cloudmodeller', async () => {
  const result = await discoverLocalModels(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.ok(options.signal); assert.equal(options.key, undefined);
    return { models: [{ name: 'qwen3:8b' }, { name: 'model:cloud' }, { name: 'remote', remote_host: 'example.org' }, { name: '<script>' }, null] };
  });
  assert.equal(result.status, 'found');
  assert.deepEqual(result.models.map(m => m.remote), [false, true, true]);
});
test('Manglende, tom og ugyldig server er forskellige tilstande', async () => {
  assert.equal((await discoverLocalModels(async () => { throw Error(); })).status, 'unavailable');
  assert.equal((await discoverLocalModels(async () => ({ models: [] }))).status, 'empty');
  assert.equal((await discoverLocalModels(async () => ({}))).status, 'invalid');
});
test('Katalog læses over HTTP; redirects følges ikke', async t => {
  let redirect = false, count = 0;
  const server = http.createServer((req, res) => {
    count++; assert.equal(req.method, 'GET'); assert.equal(req.headers.authorization, undefined);
    if (redirect) { res.writeHead(302, { location: '/other' }); res.end(); }
    else { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ models: [{ name: 'qwen3:8b' }] })); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const read = (_, options) => requestJSON(`http://127.0.0.1:${server.address().port}/api/tags`, options);
  assert.equal((await discoverLocalModels(read)).status, 'found');
  redirect = true;
  assert.equal((await discoverLocalModels(read)).status, 'unavailable');
  assert.equal(count, 2);
});
