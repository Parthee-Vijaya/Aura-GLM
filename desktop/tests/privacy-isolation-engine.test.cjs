// SPDX-License-Identifier: EUPL-1.2
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const { createEngineIsolation, gatewayAddress, makeProfile } = require('../privacy/isolation/engine-isolation.cjs');
const runtime = path.resolve(__dirname, '../.runtime/darwin-arm64');
const native = process.platform === 'darwin' && process.arch === 'arm64';
async function fixture(t) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-seatbelt-')));
  const workspaceRoot = path.join(parent, 'workspace'), stateRoot = path.join(parent, 'state');
  await fs.mkdir(workspaceRoot, { mode: 0o700 }); await fs.mkdir(stateRoot, { mode: 0o700 });
  const seen = [];
  const gateway = http.createServer((request, response) => { seen.push(request.url); response.end('controlled-gateway'); });
  await new Promise(resolve => gateway.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { gateway.closeAllConnections(); gateway.close(resolve); }));
  const reserve = net.createServer(); await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const enginePort = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const options = { workspaceRoot, stateRoot, runtimeRoot: await fs.realpath(runtime), gatewayURL: `http://127.0.0.1:${gateway.address().port}`, enginePort };
  const isolation = await createEngineIsolation(options);
  t.after(async () => { await isolation.dispose(); await fs.rm(parent, { recursive: true, force: true }); });
  async function execute(source, options = {}) {
    const spec = await isolation.launchSpec(path.join(runtime, 'node/bin/node'), ['-e', source], options);
    const result = await run(spec.file, spec.args, { ...spec.options, timeout: 15000, maxBuffer: 1024 * 1024 });
    return JSON.parse(result.stdout.trim());
  }
  return { ...options, parent, gateway, seen, isolation, execute };
}
test('gateway authority rejects external, ambiguous, default and authenticated endpoints', () => {
  for (const value of ['https://example.org', 'http://localhost:3000', 'http://127.0.0.2:3000', 'http://127.0.0.1', 'http://user:secret@127.0.0.1:3000', 'http://127.0.0.1:3000/?next=https://example.org', 'http://127.0.0.1:80']) assert.throws(() => gatewayAddress(value));
  assert.equal(gatewayAddress('http://127.0.0.1:34567/v1').port, 34567);
});
test('profile contains precise ports, private write roots and no broad network, IPC or keychain authority', () => {
  const profile = makeProfile({ workspaceRoot: '/private/aura/work', stateRoot: '/private/aura/state', runtimeRoot: '/private/runtime', trustedReadRoots: [], trustedReadFiles: [], gatewayPort: 3001, enginePort: 3002 });
  assert.match(profile, /\(deny default\)/);
  assert.match(profile, /remote ip "localhost:3001"/);
  assert.doesNotMatch(profile, /allow network\*|localhost:\*|ip "\*|unix-socket|securityd|SecurityServer|appleevents|launchservices/);
  assert.equal((profile.match(/allow file-write\*/g) || []).length, 2);
});
test('native: environment, workspace boundaries, symlinks and descendant reads are enforced', { skip: !native }, async t => {
  const f = await fixture(t), outside = path.join(f.parent, 'protected-original.txt');
  await fs.writeFile(outside, 'synthetic-secret-outside-workspace');
  await fs.symlink(outside, path.join(f.workspaceRoot, 'redirect.txt'));
  const result = await f.execute(`
    const fs=require('node:fs'),{spawnSync}=require('node:child_process');
    const canRead=p=>{try{fs.readFileSync(p);return true}catch{return false}};
    fs.writeFileSync('inside.txt','synthetic-result');
    const child=spawnSync(process.execPath,['-e',${JSON.stringify(`try{require('node:fs').readFileSync(${JSON.stringify(outside)});process.exit(9)}catch{process.stdout.write('blocked')}`)}],{encoding:'utf8'});
    console.log(JSON.stringify({inside:canRead('inside.txt'),outside:canRead(${JSON.stringify(outside)}),link:canRead('redirect.txt'),parentList:(()=>{try{fs.readdirSync(${JSON.stringify(f.parent)});return true}catch{return false}})(),child:child.stdout,childStatus:child.status,leaked:['AWS_SECRET_ACCESS_KEY','OPENAI_API_KEY','NODE_OPTIONS','DYLD_INSERT_LIBRARIES','HTTP_PROXY'].some(k=>k in process.env),home:process.env.HOME,discoveryHome:process.env.OPENCODE_TEST_HOME,tmp:process.env.TMPDIR}));
  `, { env: { AWS_SECRET_ACCESS_KEY: 'synthetic', OPENAI_API_KEY: 'synthetic', NODE_OPTIONS: '--inspect', DYLD_INSERT_LIBRARIES: '/tmp/no', HTTP_PROXY: 'http://127.0.0.1:9999', OPENCODE_TEST_HOME: f.parent } });
  assert.deepEqual(result, { inside: true, outside: false, link: false, parentList: false, child: 'blocked', childStatus: 0, leaked: false, home: path.join(f.stateRoot, 'home'), discoveryHome: path.join(f.stateRoot, 'home'), tmp: path.join(f.stateRoot, 'tmp') });
  assert.equal(await fs.readFile(outside, 'utf8'), 'synthetic-secret-outside-workspace');
});
test('native: exact gateway works; other localhost, external IPv4/IPv6, DNS and Unix socket traffic are denied', { skip: !native }, async t => {
  const f = await fixture(t); let bypassHits = 0;
  const trap = net.createServer(socket => { bypassHits++; socket.end('unexpected'); });
  await new Promise(resolve => trap.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => trap.close(resolve)));
  const unixPath = path.join(f.workspaceRoot, 'host-service.sock');
  const unix = net.createServer(socket => { bypassHits++; socket.end('unexpected'); });
  await new Promise(resolve => unix.listen(unixPath, resolve)); t.after(() => new Promise(resolve => unix.close(resolve)));
  const result = await f.execute(`
    const net=require('node:net'),dns=require('node:dns').promises;
    const connect=opts=>new Promise(resolve=>{const s=net.connect(opts),done=ok=>{s.destroy();resolve(ok)};s.once('connect',()=>done(true));s.once('error',()=>done(false));s.setTimeout(500,()=>done(false));});
    (async()=>{const gateway=await fetch(${JSON.stringify(f.gatewayURL)}+'/allowed').then(r=>r.text()); const other=await connect({host:'127.0.0.1',port:${trap.address().port}}),ipv4=await connect({host:'198.51.100.7',port:443}),ipv6=await connect({host:'2001:db8::7',port:443}),unix=await connect({path:${JSON.stringify(unixPath)}}); const dnsResult=await Promise.race([dns.resolve4('registry.npmjs.org').then(()=>true,()=>false),new Promise(r=>setTimeout(()=>r(false),700))]); console.log(JSON.stringify({gateway,other,ipv4,ipv6,unix,dns:dnsResult}));process.exit(0);})();
  `);
  assert.deepEqual(result, { gateway: 'controlled-gateway', other: false, ipv4: false, ipv6: false, unix: false, dns: false });
  assert.deepEqual(f.seen, ['/allowed']); assert.equal(bypassHits, 0);
});
test('native: changed scope and launch after disposal fail closed', { skip: !native }, async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.isolation.launchSpec('/usr/bin/true', []), /runtime/);
  await assert.rejects(() => f.isolation.launchSpec(path.join(runtime, 'node/bin/node'), [], { cwd: f.parent }), /arbejdsmappe/);
  await assert.rejects(() => f.isolation.launchSpec(path.join(runtime, 'node/bin/node'), [], { shell: true }), /shell/);
  await fs.rename(f.workspaceRoot, f.workspaceRoot + '-replaced'); await fs.mkdir(f.workspaceRoot, { mode: 0o700 });
  await assert.rejects(() => f.isolation.verify(), /ændret/);
  await f.isolation.dispose(); await assert.rejects(() => f.isolation.verify(), /lukket/);
});
test('native: pinned OpenCode starts behind the whole-engine boundary with no model request', { skip: !native, timeout: 45000 }, async t => {
  const f = await fixture(t), { engineConfig, isolatedEnv, VERSION } = require('../core/engine.cjs');
  const { nativeConfig } = require('../core/engine-opencode2.cjs');
  const model = { id: 'synthetic-no-call', name: 'Synthetic no-call', limit: { context: 4096, output: 1024 } };
  const provider = { npm: '@ai-sdk/openai-compatible', options: { baseURL: f.gatewayURL + '/v1', apiKey: 'synthetic-gateway-token' }, models: { [model.id]: model } };
  const config = nativeConfig(engineConfig(provider, model, { '*': 'deny' })), password = 'synthetic-local-engine-password';
  const spec = await f.isolation.launchSpec(path.join(runtime, 'opencode/bin/opencode'), ['serve', '--hostname', '127.0.0.1', '--port', String(f.enginePort)], { env: isolatedEnv(f.stateRoot, config, password), stdio: ['ignore', 'pipe', 'pipe'] });
  const child = spawn(spec.file, spec.args, spec.options); let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill('SIGKILL'); await exited; } });
  await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Engine startup timeout: ' + stderr.slice(-2000))), 30000); child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', code => { clearTimeout(timer); reject(new Error('Engine exited ' + code + ': ' + stderr.slice(-2000))); }); child.stdout.on('data', chunk => { if (chunk.toString().includes('http://127.0.0.1:')) { clearTimeout(timer); resolve(); } }); });
  const response = await fetch(`http://127.0.0.1:${f.enginePort}/api/info`, { headers: { authorization: 'Basic ' + Buffer.from('opencode:' + password).toString('base64') } });
  assert.equal(response.status, 200); assert.equal((await response.json()).version, VERSION); assert.deepEqual(f.seen, []);
});

test('native: Stop revokes detached writers by inherited scope without stopping another scope', { skip: !native, timeout: 20000 }, async t => {
  const f = await fixture(t), other = await fixture(t);
  const writer = path.join(f.workspaceRoot, 'writer.txt');
  const descendant = `const fs=require('node:fs');const write=()=>fs.appendFileSync(${JSON.stringify(writer)},'.');write();setInterval(write,5);setTimeout(()=>process.exit(),15000);`;
  const source = `const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{detached:true,stdio:'ignore'});child.unref();console.log('ready');setInterval(()=>{},1000);`;
  const launch = await f.isolation.launchSpec(path.join(runtime, 'node/bin/node'), ['-e', source]);
  const child = spawn(launch.file, launch.args, { ...launch.options, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { child.once('error', reject); child.stdout.once('data', resolve); });
  assert.equal((await f.isolation.attest()).scoped, true);
  const otherLaunch = await other.isolation.launchSpec(path.join(runtime, 'node/bin/node'), ['-e', 'console.log("ready");setInterval(()=>{},1000);']);
  const unaffected = spawn(otherLaunch.file, otherLaunch.args, { ...otherLaunch.options, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise((resolve, reject) => { unaffected.once('error', reject); unaffected.stdout.once('data', resolve); });
  assert.equal((await other.isolation.attest()).scoped, true);
  await new Promise(resolve => setTimeout(resolve, 75));
  // Deliberately kill the owner first; the detached writer is reparented and
  // cannot be found by walking the original process group or parent chain.
  child.kill('SIGKILL'); await new Promise(resolve => child.once('exit', resolve));
  const stop = await f.isolation.dispose();
  assert.equal(stop.writersStopped, true); assert.equal(stop.matchingProcesses, 0);
  assert.equal(stop.processTreeBoundary, 'inherited-seatbelt-scope');
  const captured = await fs.readFile(writer, 'utf8'); assert.ok(captured.length > 0);
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(await fs.readFile(writer, 'utf8'), captured);
  assert.equal(unaffected.exitCode, null); assert.equal((await other.isolation.attest()).scoped, true);
  await assert.rejects(() => f.isolation.launchSpec(path.join(runtime, 'node/bin/node'), []), /lukket/);
  const otherStop = await other.isolation.dispose(); assert.equal(otherStop.writersStopped, true);
});
test('native: existing OpenCodeEngine retains its read guard and session inside the protected boundary', { skip: !native, timeout: 45000 }, async t => {
  const f = await fixture(t), { OpenCodeEngine, pluginRuntimeFiles } = require('../core/engine.cjs');
  const model = { id: 'synthetic-no-call', name: 'Synthetic no-call', limit: { context: 4096, output: 1024 } };
  const provider = { npm: '@ai-sdk/openai-compatible', options: { baseURL: f.gatewayURL + '/v1', apiKey: 'synthetic-gateway-token' }, models: { [model.id]: model } };
  let lease;
  const engine = new OpenCodeEngine({ root: f.workspaceRoot, directory: f.stateRoot, provider, model, mode: 'plan', privacyIsolation: async ({ root, directory, port, guardian }) => {
    lease = await createEngineIsolation({ workspaceRoot: root, stateRoot: directory, runtimeRoot: f.runtimeRoot, gatewayURL: f.gatewayURL, enginePort: port, trustedReadRoots: await pluginRuntimeFiles(), trustedReadFiles: [guardian] });
    return lease;
  } });
  t.after(async () => { await engine.close(); });
  const session = await engine.start();
  assert.match(session, /^ses_/); assert.equal(engine.active, true);
  assert.equal((await lease.attest()).scoped, true);
  assert.ok(await fs.readFile(path.join(f.stateRoot, 'read-guard-ready.json'), 'utf8'));
  assert.deepEqual(f.seen, []);
  await engine.close(); assert.equal((await lease.dispose()).writersStopped, true);
});
test('native: signing changes are accepted but changes to executable code are rejected', { skip: !native }, async t => {
  const { prepareHelper } = require('../privacy/isolation/prepare-helper.cjs');
  const { executableDigest } = require('../privacy/isolation/helper-integrity.cjs');
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-helper-proof-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const helper = await prepareHelper(path.join(root, 'reaper'));
  const expected = executableDigest(await fs.readFile(helper));
  await fs.chmod(helper, 0o700);
  await run('/usr/bin/codesign', ['--force', '--sign', '-', '--options', 'runtime', helper]);
  assert.equal(executableDigest(await fs.readFile(helper)), expected);
  const changed = await fs.readFile(helper); changed[1200] ^= 1;
  assert.notEqual(executableDigest(changed), expected);
  assert.throws(() => executableDigest(Buffer.from('not a Mach-O executable')));
});
test('native: a descendant cannot replace its sandbox profile or mutate the scope witness', { skip: !native }, async t => {
  const f = await fixture(t);
  const spec = await f.isolation.launchSpec(path.join(runtime, 'node/bin/node'), ['-e', '']);
  const markerText = spec.args[1].match(/\(literal ("[^\n]+\/scope")\)/)[1], marker = JSON.parse(markerText);
  spec.args[spec.args.length - 1] = `
    const fs=require('node:fs'),{spawnSync}=require('node:child_process');
    const attempt=fn=>{try{fn();return true}catch{return false}};
    const nested=spawnSync('/usr/bin/sandbox-exec',['-p','(version 1)(allow default)','/bin/echo','escaped'],{encoding:'utf8'});
    console.log(JSON.stringify({read:attempt(()=>fs.readFileSync(${JSON.stringify(marker)})),write:attempt(()=>fs.writeFileSync(${JSON.stringify(marker)},'changed')),chmod:attempt(()=>fs.chmodSync(${JSON.stringify(marker)},0o600)),unlink:attempt(()=>fs.unlinkSync(${JSON.stringify(marker)})),nestedStatus:nested.status,nestedOutput:nested.stdout}));
  `;
  const result = JSON.parse((await run(spec.file, spec.args, spec.options)).stdout);
  assert.deepEqual(result, { read: true, write: false, chmod: false, unlink: false, nestedStatus: 71, nestedOutput: '' });
  assert.equal((await f.isolation.dispose()).writersStopped, true);
});
