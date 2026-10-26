// SPDX-License-Identifier: EUPL-1.2
// Native synthetic qualification. No model, credentials, package downloads,
// external destination, production app, or existing project is used.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { DevServer } = require('../core/dev-server.cjs');
const { createOfflineProcessIsolation } = require('../privacy/isolation/engine-isolation.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { const value = check(); if (value) return value; await pause(25); } throw Error('Native preview boundary probe timed out.'); }
async function main() {
  const reportRoot = process.argv[2];
  if (!reportRoot || !path.isAbsolute(reportRoot)) throw Error('Provide a dedicated absolute report directory.');
  await fs.mkdir(reportRoot, { recursive: true, mode: 0o700 });
  const native = process.platform === 'darwin' && process.arch === 'arm64';
  if (!native) {
    const report = { passed: false, qualified: false, platform: process.platform, arch: process.arch, reason: 'This native comparison requires the prepared macOS arm64 runtime; no unsandboxed fallback is permitted.' };
    await fs.writeFile(path.join(reportRoot, 'native-boundary.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify(report) + '\n'); return;
  }
  const runtimeRoot = await fs.realpath(path.resolve(__dirname, '../.runtime/darwin-arm64'));
  const node = path.join(runtimeRoot, 'node/bin/node');
  const source = await fs.readFile(path.join(__dirname, 'fixtures/preview-boundary-probe.cjs'));
  const runRoot = await fs.realpath(await fs.mkdtemp(path.join(reportRoot, 'synthetic-run-')));
  const ordinaryRoot = path.join(runRoot, 'ordinary'), offlineRoot = path.join(runRoot, 'offline'), stateRoot = path.join(runRoot, 'state');
  for (const root of [ordinaryRoot, offlineRoot, stateRoot]) await fs.mkdir(root, { mode: 0o700 });
  const outsideRead = path.join(runRoot, 'synthetic-outside.txt'); await fs.writeFile(outsideRead, 'synthetic-private-canary');
  const seen = [], sink = http.createServer((request, response) => { seen.push(request.url); response.end('synthetic-local-receiver'); });
  await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
  const ordinary = new DevServer(); let isolation, offlineChild;
  const checks = [];
  const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push({ name, passed: true }); };
  try {
    for (const root of [ordinaryRoot, offlineRoot]) { await fs.writeFile(path.join(root, 'inside.txt'), 'synthetic-public-fixture'); await fs.writeFile(path.join(root, 'probe.cjs'), source); }
    const endpoint = 'http://127.0.0.1:' + sink.address().port;
    const ordinaryConfig = { outsideRead, outsideWrite: path.join(runRoot, 'ordinary-outside-write.txt'), endpoint: endpoint + '/ordinary' };
    await fs.writeFile(path.join(ordinaryRoot, 'probe.json'), JSON.stringify(ordinaryConfig));
    await fs.writeFile(path.join(ordinaryRoot, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '0.0.0-synthetic' } }));
    const fakeVite = path.join(ordinaryRoot, 'node_modules/vite'); await fs.mkdir(fakeVite, { recursive: true });
    await fs.writeFile(path.join(fakeVite, 'package.json'), JSON.stringify({ name: 'vite', version: '0.0.0-synthetic', main: 'index.cjs' }));
    await fs.writeFile(path.join(fakeVite, 'index.cjs'), `const http=require('node:http'),fs=require('node:fs'),path=require('node:path');exports.createServer=async function(options){const result=await require('../../probe.cjs').probe(JSON.parse(fs.readFileSync(path.join(options.root,'probe.json'),'utf8')));console.log('PREVIEW_BOUNDARY_RESULT='+JSON.stringify(result));const httpServer=http.createServer((_q,r)=>r.end('synthetic preview'));return {httpServer,config:{base:'/'},listen:()=>new Promise(r=>httpServer.listen(options.server.port,'127.0.0.1',r)),close:()=>new Promise(r=>httpServer.close(r))};};`);
    const oldPath = process.env.PATH;
    process.env.PATH = path.dirname(node) + path.delimiter + (oldPath || '');
    try { await ordinary.activate(ordinaryRoot); const review = await ordinary.prepare('start'); await ordinary.execute(review.token); }
    finally { process.env.PATH = oldPath; }
    await until(() => ordinary.state === 'running' || ordinary.state === 'error');
    check('ordinary preview server starts through the existing reviewed DevServer route', ordinary.state, 'running');
    const match = ordinary.output.match(/PREVIEW_BOUNDARY_RESULT=(\{[^\n]+\})/);
    assert.ok(match, 'ordinary process result must exist'); const ordinaryResult = JSON.parse(match[1]);
    check('ordinary preview can read the synthetic file outside its project', ordinaryResult.outsideRead, true);
    check('ordinary preview can write outside its project', ordinaryResult.outsideWrite, true);
    check('ordinary preview can call a different local service', ordinaryResult.network, true);
    check('ordinary descendant can read outside its project', ordinaryResult.descendant.outsideRead, true);
    await ordinary.stop(); check('ordinary preview stops after the probe', ordinary.state, 'stopped');

    const offlineConfig = { outsideRead, outsideWrite: path.join(runRoot, 'offline-outside-write.txt'), endpoint: endpoint + '/offline' };
    isolation = await createOfflineProcessIsolation({ workspaceRoot: offlineRoot, stateRoot, runtimeRoot });
    check('offline restriction declares no network', (await isolation.verify()).network, 'none');
    let output = '';
    offlineChild = await isolation.spawnChild(node, [path.join(offlineRoot, 'probe.cjs'), '--main', JSON.stringify(offlineConfig)], { stdio: ['ignore', 'pipe', 'pipe'] });
    offlineChild.stdout.on('data', chunk => { output += chunk; });
    offlineChild.stderr.on('data', () => {});
    const resultLine = await until(() => output.match(/PREVIEW_BOUNDARY_RESULT=(\{[^\n]+\})/));
    const offlineResult = JSON.parse(resultLine[1]);
    check('offline worker can read its staged fixture', offlineResult.insideRead, true);
    check('offline worker cannot read an outside source', offlineResult.outsideRead, false);
    check('offline worker cannot write outside its partition', offlineResult.outsideWrite, false);
    check('offline worker cannot call the controlled loopback service', offlineResult.network, false);
    check('offline worker cannot bind a local preview port', offlineResult.localBind, false);
    check('offline descendant inherits file denial', offlineResult.descendant.outsideRead, false);
    check('offline descendant inherits write denial', offlineResult.descendant.outsideWrite, false);
    check('the generic offline worker still writes inside its partition; it is not a read-only preview launcher', offlineResult.insideWrite, true);
    const retirement = await isolation.dispose(); isolation = null;
    check('native scope retirement stops every writer', retirement.writersStopped, true); check('native scope retirement leaves zero matching processes', retirement.matchingProcesses, 0);
    check('controlled receiver only saw the ordinary preview request', seen, ['/ordinary']);
    check('synthetic private source is unchanged', await fs.readFile(outsideRead, 'utf8'), 'synthetic-private-canary');
    const report = { passed: true, qualification: 'native macOS arm64 comparison using synthetic files/framework and a controlled loopback receiver', platform: process.platform, arch: process.arch, node: process.versions.node, checks,
      ordinary: ordinaryResult, offline: offlineResult, retirement, requests: seen, runRoot,
      limitations: ['No external network or model was contacted.', 'The Vite fixture is synthetic; this tests the real Aura launcher boundary, not Vite compatibility.', 'No Windows/Linux native proof.', 'No live isolated preview launcher is implemented or enabled by this probe.', 'Generic offline process isolation is writable inside its partition and denies preview port binding.'] };
    await fs.writeFile(path.join(reportRoot, 'native-boundary.json'), JSON.stringify(report, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ passed: true, checks: checks.length, report: path.join(reportRoot, 'native-boundary.json') }) + '\n');
  } finally {
    await ordinary.stop(); if (isolation) await isolation.dispose();
    sink.closeAllConnections(); await new Promise(resolve => sink.close(resolve));
    // Preserve these generated source fixtures and the report for reproduction.
  }
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
