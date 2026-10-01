const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { findExecutable, VERSION } = require('../core/engine.cjs');

// Små falske motorer som shell-scripts: en langsom, en med forkert version og en rigtig, der tæller sine kald.
const unix = { skip: process.platform === 'win32' };
async function engine(t, body) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'harness-motor-')); t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'opencode'); await fs.writeFile(file, `#!/bin/sh\n${body}\n`, { mode: 0o755 }); return { dir, file };
}

test('en langsom motor i den pakkede app giver en forklaring om ventetid, ikke en udviklerkommando', unix, async t => {
  const { file } = await engine(t, 'sleep 5');
  await assert.rejects(findExecutable({ bundled: { opencode: file }, timeout: 300 }), error => /kunne ikke starte sin AI-motor i tide/.test(error.message) && !/npm run/.test(error.message));
});

test('en manglende eller forkert motor i den pakkede app beder om en ny installation', unix, async t => {
  const { file } = await engine(t, 'echo 0.0.1');
  await assert.rejects(findExecutable({ bundled: { opencode: file }, timeout: 5000 }), /Installer appen igen/);
  await assert.rejects(findExecutable({ bundled: { opencode: path.join(os.tmpdir(), 'findes-ikke', 'opencode') }, timeout: 5000 }), /Installer appen igen/);
});

test('en kontrolleret motor kontrolleres kun én gang pr. kørsel', unix, async t => {
  const { dir, file } = await engine(t, `echo x >> "$(dirname "$0")/kald"\necho ${VERSION}`);
  assert.equal(await findExecutable({ bundled: { opencode: file }, timeout: 5000 }), file);
  assert.equal(await findExecutable({ bundled: { opencode: file }, timeout: 5000 }), file);
  assert.equal((await fs.readFile(path.join(dir, 'kald'), 'utf8')).trim().split('\n').length, 1);
});
