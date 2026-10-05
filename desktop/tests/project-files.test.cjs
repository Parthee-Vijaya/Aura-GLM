const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { readFile, listFiles, checkReference, referenceLabel } = require('../core/project-files.cjs');

async function project(t) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-kode-')));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'projekt');
  const files = {
    'public/index.html': '<h1>Hej</h1>\n<script>document.title = "kørt"</script>\n',
    'src/app.js': 'export const svar = 42;\n',
    '.github/workflows/test.yml': 'name: test\n',
    '.env': 'API_KEY=hemmelig\n', '.env.example': 'API_KEY=\n', 'config/produktion.env': 'X=1\n',
    'references/noter.md': 'privat\n', 'secrets/noegle.txt': 'privat\n', '.secrets/a': 'privat\n',
    'node_modules/pakke/index.js': 'module.exports = 1;\n', '.git/config': '[core]\n', 'dist/bundle.js': 'bygget\n',
    'keys/server.pem': '-----BEGIN PRIVATE KEY-----\n', 'credentials.json': '{}\n', '.npmrc': '//registry:_authToken=x\n',
    'config.js': 'const api_key = "abcdefghijklmnop12345";\n', '.DS_Store': 'x'
  };
  for (const [file, text] of Object.entries(files)) { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), text); }
  await fs.writeFile(path.join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2]));
  await fs.writeFile(path.join(root, 'data.bin'), Buffer.from([1, 0, 2]));
  await fs.writeFile(path.join(root, 'stor.txt'), 'x'.repeat(1024 * 1024 + 1));
  await fs.writeFile(path.join(parent, 'udenfor.txt'), 'må ikke læses\n');
  await fs.symlink(path.join(parent, 'udenfor.txt'), path.join(root, 'link.txt'));
  await fs.symlink(parent, path.join(root, 'linkmappe'));
  return root;
}

test('filvalget viser projektets egne filer og udelader beskyttede, genererede og symbolske links', async t => {
  const root = await project(t);
  const { files, truncated } = await listFiles(root);
  const names = files.map(file => file.path);
  assert.equal(truncated, false);
  for (const visible of ['public/index.html', 'src/app.js', '.github/workflows/test.yml', 'logo.png', 'data.bin', 'stor.txt', 'config.js']) assert.ok(names.includes(visible), visible);
  for (const hidden of ['.env', '.env.example', 'config/produktion.env', 'references/noter.md', 'secrets/noegle.txt', '.secrets/a', 'node_modules/pakke/index.js', '.git/config', 'dist/bundle.js', 'keys/server.pem', 'credentials.json', '.npmrc', '.DS_Store', 'link.txt']) assert.ok(!names.includes(hidden), hidden);
  assert.ok(!names.some(name => name.startsWith('linkmappe')));
  assert.equal(files.find(file => file.path === 'logo.png').image, true);
});

test('koden vises som tekst, og billeder som data-adresse', async t => {
  const root = await project(t);
  const html = await readFile(root, 'public/index.html');
  const text = '<h1>Hej</h1>\n<script>document.title = "kørt"</script>\n';
  assert.deepEqual(html, { path: 'public/index.html', kind: 'text', size: Buffer.byteLength(text), text });
  const logo = await readFile(root, 'logo.png');
  assert.equal(logo.kind, 'image'); assert.match(logo.dataURL, /^data:image\/png;base64,/);
});

test('beskyttede filer og stier uden for projektet afvises med en forklaring', async t => {
  const root = await project(t);
  const cases = {
    '.env': /beskyttet/, '.env.example': /beskyttet/, 'config/produktion.env': /beskyttet/, 'references/noter.md': /beskyttet/, 'secrets/noegle.txt': /beskyttet/,
    'node_modules/pakke/index.js': /beskyttet/, '.git/config': /beskyttet/, 'keys/server.pem': /beskyttet/, 'credentials.json': /beskyttet/, '.npmrc': /beskyttet/,
    '../udenfor.txt': /ligger ikke i projektet/, 'public/../.env': /ligger ikke i projektet/, '/etc/passwd': /ligger ikke i projektet/, 'public\\index.html': /ligger ikke i projektet/,
    'C:/Windows/win.ini': /ligger ikke i projektet/, '': /ligger ikke i projektet/, 'public//index.html': /ligger ikke i projektet/, './src/app.js': /ligger ikke i projektet/,
    'link.txt': /Symbolske links/, 'linkmappe/udenfor.txt': /Symbolske links/, 'data.bin': /ikke tekst/, 'stor.txt': /for stor/, 'config.js': /nøgle/,
    'mangler.txt': /findes ikke/, 'public': /ikke en fil/
  };
  for (const [file, expected] of Object.entries(cases)) await assert.rejects(readFile(root, file), expected, file);
  for (const value of [null, 42, { path: 'x' }, 'a\0b', 'x'.repeat(1001)]) await assert.rejects(readFile(root, value), /ligger ikke i projektet/);
});

test('filhenvisninger kræver en tekstfil og linjer, der findes', async t => {
  const root = await project(t);
  assert.deepEqual(await checkReference(root, { path: 'src/app.js' }), { path: 'src/app.js', from: null, to: null });
  assert.deepEqual(await checkReference(root, { path: 'public/index.html', from: 1, to: 2 }), { path: 'public/index.html', from: 1, to: 2 });
  assert.equal(referenceLabel({ path: 'public/index.html', from: 2, to: 2 }), 'public/index.html (linje 2)');
  assert.equal(referenceLabel({ path: 'public/index.html', from: 1, to: 3 }), 'public/index.html (linje 1–3)');
  await assert.rejects(checkReference(root, { path: 'public/index.html', from: 0, to: 1 }), /Linjerne/);
  await assert.rejects(checkReference(root, { path: 'public/index.html', from: 3, to: 2 }), /Linjerne/);
  await assert.rejects(checkReference(root, { path: 'public/index.html', from: 2, to: 99 }), /Linjerne/);
  await assert.rejects(checkReference(root, { path: 'logo.png' }), /tekstfiler/);
  await assert.rejects(checkReference(root, { path: '.env' }), /beskyttet/);
  await assert.rejects(checkReference(root, { path: '../udenfor.txt' }), /ligger ikke/);
});
