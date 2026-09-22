const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { startPreview } = require('../core/preview.cjs');
function request(url, options = {}) { return new Promise((resolve, reject) => { const req = http.request(url, options, res => { let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text })); }); req.on('error', reject); req.end(); }); }
test('serveren viser aktuelle filer og afviser private filer, links, traversering og forkert vært', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-preview-'));
  await fs.mkdir(path.join(root, 'public')); await fs.mkdir(path.join(root, 'references'));
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Før</h1>');
  await fs.writeFile(path.join(root, 'references/privat.txt'), 'PRIVATE_REFERENCE');
  await fs.writeFile(path.join(root, 'public/.env'), 'PRIVATE_KEY');
  await fs.symlink(path.join(root, 'references'), path.join(root, 'public/leak'), 'junction');
  const server = await startPreview(root);
  t.after(async () => { await server.close(); await fs.rm(root, { recursive: true, force: true }); });
  assert.equal((await request(server.url)).text, '<h1>Før</h1>');
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Efter</h1>');
  assert.equal((await request(server.url)).text, '<h1>Efter</h1>');
  for (const relative of ['.env', 'leak/privat.txt', '%2e%2e%2freferences/privat.txt', '%2e%2e%5creferences%5cprivat.txt', 'references/privat.txt', '%00', '%']) {
    const result = await request(server.url + relative);
    assert.equal(result.status, 404, relative); assert.ok(!result.text.includes('PRIVATE'));
  }
  assert.equal((await request(new URL(server.url).origin)).status, 404);
  assert.equal((await request(server.url, { headers: { Host: 'evil.example' } })).status, 404);
  assert.equal((await request(server.url, { method: 'POST' })).status, 404);
  assert.match((await request(server.url)).headers['content-security-policy'], /sandbox allow-scripts/);
});
