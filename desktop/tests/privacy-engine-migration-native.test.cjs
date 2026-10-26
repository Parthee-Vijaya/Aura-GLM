// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Real historical database, real pinned V2 and inherited OS isolation. This
// fixture never reads a user profile or contacts an external model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const net = require('node:net');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash, randomUUID } = require('node:crypto');
const product = require('../scripts/native-test-product.cjs').nativeTestProduct();
const { createEngineIsolation } = product.require('./privacy/isolation/engine-isolation.cjs');
const { preserveLegacyEngine } = product.require('./core/privacy/hybrid-seatbelt-workspaces.cjs');
const { stable } = product.require('./core/privacy/policy.cjs');
const run = promisify(execFile), pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const enabled = process.platform === 'darwin' && process.arch === 'arm64' && process.env.AURA_PRIVACY_NATIVE === '1';
const legacyIntegrity = 'sha512-rZm4Phz7eu/kVz2lynergU/LzKS/L0ofErB2fRXfaoAH528b3EnVcISZ/13dwk78FPxVhop7hWXshowT88C8Yw==';
async function freePort() { const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function until(check, message) { const end = Date.now() + 30_000; while (Date.now() < end) { if (await check()) return; await pause(40); } throw new Error(message); }

test('native protected V1 partition resumes in V2 with the same session and only its own historical context', { skip: !enabled, timeout: 120_000 }, async t => {
  if(product.identity.packaged)t.diagnostic(JSON.stringify({qualification:product.identity}));
  const archive = process.env.AURA_OPENCODE_V1_ARCHIVE || path.resolve(__dirname, '../.cache/runtime/opencode-darwin-arm64-1.18.33.tgz');
  const archiveBytes = await fs.readFile(archive);
  assert.equal('sha512-' + createHash('sha512').update(archiveBytes).digest('base64'), legacyIntegrity, 'Historical fixture binary must match the original locked release.');
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-v1-migration-')));
  let modern, legacy, isolation, probe, modelServer;
  t.after(async () => { await modern?.close(); await isolation?.dispose(); await probe?.dispose(); if (modelServer) { modelServer.closeAllConnections(); await new Promise(resolve => modelServer.close(resolve)); } await fs.rm(parent, { recursive: true, force: true }); });
  const root = path.join(parent, 'workspace'), state = path.join(parent, 'engine'), legacyRuntime = path.join(parent, 'legacy-runtime');
  for (const directory of [root, state, legacyRuntime]) await fs.mkdir(directory, { mode: 0o700 });
  const binary = path.join(legacyRuntime, 'opencode');
  const extracted = await run('/usr/bin/tar', ['-xOzf', archive, 'package/bin/opencode'], { encoding: 'buffer', maxBuffer: 300_000_000 });
  await fs.writeFile(binary, extracted.stdout, { mode: 0o700, flag: 'wx' });
  assert.equal((await run(binary, ['--version'])).stdout.trim(), '1.18.33');
  await fs.writeFile(path.join(parent, 'other-partition.txt'), 'OTHER_PARTITION_MUST_NOT_ENTER_HISTORY');
  const wire = [], events = [], memory = 'PERSISTED_PRIVATE_PARTITION_V1_MEMORY', first = 'FIRST_PRIVATE_PARTITION_REQUEST';
  modelServer = http.createServer(async (request, response) => {
    const buffers = []; for await (const chunk of request) buffers.push(chunk);
    const body = JSON.parse(Buffer.concat(buffers).toString()); wire.push(body);
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    const emit = (delta, finish_reason = null) => response.write('data: ' + JSON.stringify({ id: 'chatcmpl-' + randomUUID(), object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] }) + '\n\n');
    emit({ role: 'assistant', content: wire.length === 1 ? memory : 'The exact private partition was resumed.' }); emit({}, 'stop'); response.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => modelServer.listen(0, '127.0.0.1', resolve));
  const gatewayURL = 'http://127.0.0.1:' + modelServer.address().port;
  const { OpenCodeEngine, pluginRuntimeFiles, VERSION } = product.require('./core/engine.cjs');
  const model = { id: 'private-migration', name: 'Private migration', limits: { context: 8192, output: 2048 } };
  const provider = { npm: '@ai-sdk/openai-compatible', name: 'Controlled migration model', options: { baseURL: gatewayURL + '/v1', apiKey: 'synthetic-loopback-token' }, models: { [model.id]: { id: model.id, name: model.name, tool_call: true, limit: { context: 8192, output: 2048 } } } };
  const permission = { '*': 'deny' };
  const config = { model: 'harness/' + model.id, small_model: 'harness/' + model.id, enabled_providers: ['harness'], provider: { harness: provider }, permission, agent: { plan: { permission } }, share: 'disabled', autoupdate: false, snapshot: false, plugin: [], mcp: {}, lsp: false, formatter: false };
  const password = randomUUID(), enginePort = await freePort(), auth = 'Basic ' + Buffer.from('harness:' + password).toString('base64');
  isolation = await createEngineIsolation({ workspaceRoot: root, stateRoot: state, runtimeRoot: legacyRuntime, gatewayURL, enginePort });
  const launch = await isolation.launchSpec(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(enginePort)], { env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: 'harness' }, stdio: ['ignore', 'pipe', 'pipe'] });
  legacy = spawn(launch.file, launch.args, launch.options); legacy.stdout.resume(); legacy.stderr.resume();
  await isolation.attest();
  async function request(route, method = 'GET', body) { const response = await fetch('http://127.0.0.1:' + enginePort + route, { method, headers: { authorization: auth, 'content-type': 'application/json', 'x-opencode-directory': encodeURIComponent(root) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(5000), redirect: 'error' }); assert.equal(response.ok, true, 'Historical engine API ' + response.status); return response.status === 204 ? null : response.json(); }
  await until(async () => { try { return (await request('/global/health')).version === '1.18.33'; } catch { return false; } }, 'The historical isolated engine did not become ready.');
  const session = await request('/session', 'POST', { title: 'Synthetic private migration partition' });
  await request('/session/' + session.id + '/prompt_async', 'POST', { model: { providerID: 'harness', modelID: model.id }, agent: 'plan', parts: [{ type: 'text', text: first }] });
  await until(async () => { const messages = await request('/session/' + session.id + '/message'); return messages.some(message => message.info?.role === 'assistant' && message.info.time?.completed && JSON.stringify(message).includes(memory)); }, 'The historical model reply was not persisted.');
  assert.equal((await isolation.dispose()).writersStopped, true, 'All historical engine writers retire before migration.');
  const owner = stable({ kind: 'local', destination: { id: 'local', model: model.id }, project: root, partition: randomUUID() });
  await fs.writeFile(path.join(parent, 'owner.json'), owner, { flag: 'wx', mode: 0o600 });
  const backupRequest = { partition: parent, directory: state, workspaceRoot: root, owner, sessionID: session.id };
  const manifest = await preserveLegacyEngine(backupRequest), backup = path.join(parent, 'engine-v1-preserved');
  assert.equal(manifest.sourceVersion, '1.18.33');
  const beforeFiles = await fs.readdir(state, { recursive: true });
  for (const name of beforeFiles) if ((await fs.lstat(path.join(state, name))).isFile()) assert.deepEqual(await fs.readFile(path.join(backup, 'payload', name)), await fs.readFile(path.join(state, name)), 'Every original history/config byte is retained: ' + name);
  const retainedManifest = await fs.readFile(path.join(backup, 'manifest.json'));
  const before = wire.length, modernRuntime = await fs.realpath(product.runtimeRoot);
  modern = new OpenCodeEngine({ root, directory: state, provider, model, mode: 'chat', resume: session.id, onEvent: event => events.push(event), privacyIsolation: async ({ port, guardian }) => {
    const lease = await createEngineIsolation({ workspaceRoot: root, stateRoot: state, runtimeRoot: modernRuntime, gatewayURL, enginePort: port, trustedReadRoots: await pluginRuntimeFiles(), trustedReadFiles: [guardian] });
    return lease;
  } });
  await modern.start();
  assert.equal(modern.resumed, true); assert.equal(modern.session.id, session.id, 'A different or empty engine session is not migration.');
  const imported = await modern.messages(); assert.match(JSON.stringify(imported), new RegExp(memory)); assert.match(JSON.stringify(imported), new RegExp(first));
  const eventCount = events.length; await modern.send('Continue the protected conversation after the engine upgrade.', 'Preserve this partition only.');
  await until(() => events.slice(eventCount).some(event => event.type === 'session.idle'), 'The resumed V2 turn did not finish.');
  const sent = JSON.stringify(wire.slice(before)); assert.match(sent, new RegExp(memory)); assert.match(sent, new RegExp(first)); assert.doesNotMatch(sent, /OTHER_PARTITION_MUST_NOT_ENTER_HISTORY/);
  await modern.close();
  assert.deepEqual(await preserveLegacyEngine(backupRequest), manifest, 'After migration, the previous V1 copy is verified rather than overwritten.');
  assert.deepEqual(await fs.readFile(path.join(backup, 'manifest.json')), retainedManifest);
  const probeState = path.join(parent, 'probe-state'); await fs.mkdir(probeState, { mode: 0o700 });
  probe = await createEngineIsolation({ workspaceRoot: root, stateRoot: probeState, runtimeRoot: modernRuntime, gatewayURL, enginePort: await freePort() });
  const denied = await probe.launchSpec(path.join(modernRuntime, 'node/bin/node'), ['-e', `try { require('node:fs').readFileSync(${JSON.stringify(path.join(backup, 'payload/data/opencode/opencode.db'))}); process.stdout.write('READ'); } catch(error) { process.stdout.write(error.code); }`]);
  const result = await run(denied.file, denied.args, { ...denied.options, timeout: 10000 });
  assert.match(result.stdout, /^(EPERM|EACCES)$/, 'The real OS boundary denies the agent its retained historical backup.');
  assert.match(VERSION, /^2\./); assert.equal(events.some(event => event.type === 'permission.asked'), false, 'No historical permission is replayed.');
});
