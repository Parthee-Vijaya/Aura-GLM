// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const worker = path.join(__dirname, 'fixtures/http-runtime-worker.cjs');

test('desktop and published CLI both declare the audited HTTP runtime as a production dependency', () => {
  const { VERSION } = require('../core/http-runtime.cjs');
  const desktop = require('../package.json');
  const cli = require('../../package.json');
  assert.equal(desktop.dependencies.undici, VERSION);
  assert.equal(cli.dependencies.undici, VERSION);
  assert.ok(cli.files.includes('desktop/core/*.cjs'), 'CLI archive must include its HTTP bootstrap module');
});

test('audited fetch survives excessive encodings and retains streaming, abort, redirect and multipart semantics', { timeout: 20000 }, async () => {
  const result = await run(process.execPath, [worker], { timeout: 15000, env: { ...process.env, NODE_OPTIONS: '', ELECTRON_RUN_AS_NODE: '1' } });
  const proof = JSON.parse(result.stdout.trim());
  assert.equal(proof.activeUndici, '7.30.1');
  assert.equal(proof.survived, true);
  assert.deepEqual(proof.requests, ['/health', '/stream', '/redirect', '/form', '/slow']);
});

const nativeEnabled = process.env.AURA_ENGINE_NATIVE === '1';
test('actual Electron main survives the encoding attack and serves patched Response through its protocol handler', { skip: nativeEnabled ? false : 'Kræver AURA_ENGINE_NATIVE=1 og Electron med adgang til native skrivebord.', timeout: 30000 }, async t => {
  const profile = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-http-runtime-')));
  t.after(() => fs.rm(profile, { recursive: true, force: true }));
  const result = await run(require('electron'), [worker, '--electron', '--profile=' + profile], { timeout: 25000, env: { ...process.env, NODE_OPTIONS: '', ELECTRON_RUN_AS_NODE: '' } });
  const proof = JSON.parse(result.stdout.trim());
  assert.ok(proof.electron); assert.equal(proof.native, true); assert.equal(proof.protocol, true); assert.equal(proof.activeUndici, '7.30.1');
  t.diagnostic(JSON.stringify(proof));
});
