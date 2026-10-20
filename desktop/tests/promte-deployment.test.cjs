const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { PromteDeployment, PromteSetup, promteConfiguration, preparePromteArtifact, validatePromteArtifact, promteHost, publicAddress } = require('../core/provider-promte.cjs');
const HOST = 'https://organisation.promte.dk';
const config = { provider: 'promte', mode: 'source', host: HOST, workspaceId: 'workspace-123', directory: '.' };
const lookup = async () => [{ address: '93.184.215.14', family: 4 }];
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
function artifact(entries = { 'package.json': '{"private":true,"scripts":{"build":"vite build"},"devDependencies":{"react":"19.2.8"}}', 'src/main.jsx': 'document.body.textContent = "Afprøvning i Promte";' }) {
  return { head: 'a'.repeat(40), files: Object.entries(entries).map(([file, data]) => ({ file, data: Buffer.from(data), sha256: createHash('sha256').update(data).digest('hex') })) };
}
function adapter(handler, extra = {}) {
  const calls = [], reads = [];
  const provider = new PromteDeployment({ lookup, readCredentials: async host => { reads.push(host); return { token: 'secret-for-selected-host' }; }, fetcher: async (url, options) => { calls.push({ url, options }); return handler(url, options); }, ...extra });
  return { provider, calls, reads };
}
test('Promte kræver gyldig HTTPS-installation og kildekode fra gennemgåede filer', () => {
  assert.equal(promteHost(HOST + '/'), HOST);
  for (const host of ['http://organisation.promte.dk', 'https://localhost', 'https://127.0.0.1', 'https://10.1.2.3', 'https://[::1]', 'https://secret@organisation.promte.dk', HOST + '/api', HOST + '?secret=x', 'https://organisation.local', HOST + ':8443']) assert.throws(() => promteHost(host));
  for (const ip of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.31.0.1', '192.168.0.1', '198.18.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('93.184.215.14'), true);
  assert.equal(publicAddress('2606:4700:4700::1111'), true);
  assert.throws(() => promteConfiguration({ ...config, workspaceId: '../workspace' }));
  assert.throws(() => promteConfiguration({ ...config, directory: '../source' }));
  assert.equal(promteConfiguration(config).mode, 'source');
  validatePromteArtifact(artifact());
  for (const file of ['.env', 'src/.env.local', '.git/config', 'dist/index.html', 'vite.config.js', 'postcss.config.cjs', 'node_modules/a.js', '../other', '/absolute', 'secrets.json']) assert.throws(() => validatePromteArtifact(artifact({ 'package.json': '{}', 'src/main.jsx': 'test', [file]: 'private' })), file);
  assert.throws(() => validatePromteArtifact(artifact({ 'package.json': '{"dependencies":{"react":"19.2.8"}}', 'src/main.jsx': 'test' })), /devDependencies/);
  assert.throws(() => validatePromteArtifact(artifact({ 'package.json': '{"dependencies":{"library":"1.0.0"}}', 'src/main.jsx': 'test' })), /package-lock/);
  assert.throws(() => validatePromteArtifact(artifact({ 'package.json': '{"scripts":{"postinstall":"run something"}}', 'src/main.jsx': 'test' })), /installationsscripts/);
});
test('Promte afviser private DNS-svar før login læses eller netværket kontaktes', async () => {
  const { provider, calls, reads } = adapter(() => { throw Error('Må ikke kaldes'); }, { lookup: async () => [{ address: '10.0.0.8', family: 4 }] });
  await assert.rejects(provider.inspect(config), /privat netværk/);
  assert.equal(calls.length, 0); assert.equal(reads.length, 0);
});
test('Promtes CLI-filregler anvendes før gennemgang med hash af de faktiske uploadfiler', () => {
  const original = artifact({ 'package.json': '{"devDependencies":{"react":"19.2.8"}}', 'src/main.jsx': 'test', 'vite.config.js': 'local config', 'package-lock.json': '{"lockfileVersion":3}', 'dist/index.html': 'local build' });
  const prepared = preparePromteArtifact(original);
  assert.deepEqual(prepared.files.map(f => f.file), ['package.json', 'src/main.jsx']);
  assert.deepEqual(prepared.excludedFiles, ['vite.config.js', 'package-lock.json', 'dist/index.html']);
  assert.equal(original.files.length, 5);
  validatePromteArtifact(prepared);
  const changedOnlyLocally = preparePromteArtifact(artifact({ ...Object.fromEntries(original.files.map(f => [f.file, f.data.toString()])), 'vite.config.js': 'different local config' }));
  assert.equal(prepared.hash, changedOnlyLocally.hash);
  assert.notEqual(prepared.hash, preparePromteArtifact(artifact({ 'package.json': '{}', 'src/main.jsx': 'changed source' })).hash);
  const runtime = preparePromteArtifact(artifact({ 'package.json': '{"optionalDependencies":{"example":"1.0.0"}}', 'src/main.jsx': 'test', 'package-lock.json': '{}' }));
  assert.ok(runtime.files.some(f => f.file === 'package-lock.json'));
  validatePromteArtifact(runtime);
});
test('Promte-guiden bruger installeret CLI og isolerer login for den præcise vært', async () => {
  let signedIn = false; const commands = [], hosts = [];
  const setup = new PromteSetup({ lookup, readCredentials: async host => { hosts.push(host); return signedIn ? { token: 'never-in-ui' } : null; }, run: async (program, args, options) => {
    commands.push({ program, args, options });
    if (args[0] === '--help') return 'promte-app-upload login\npromte-app-upload status';
    signedIn = args[0] === 'login'; return '';
  } });
  assert.equal((await setup.state({ host: HOST })).connected, false);
  const state = await setup.login({ host: HOST });
  assert.equal(state.connected, true); assert.equal(state.accountRequired, 'Kræver konto og betalt aftale');
  assert.ok(!JSON.stringify(state).includes('never-in-ui'));
  assert.deepEqual(commands.find(c => c.args[0] === 'login').args, ['login', '--host', HOST]);
  assert.ok(commands.every(c => c.program.endsWith('promte-app-upload')));
  assert.ok(hosts.every(host => host === HOST));
  assert.equal((await setup.logout({ host: HOST })).connected, false);
  const missing = new PromteSetup({ lookup, run: async () => { throw Error('ENOENT'); }, readCredentials: async () => null });
  await assert.rejects(missing.login({ host: HOST }), /Installér/);
});
test('Promte kræver dokumenteret source-capability og adgang uden at udlevere token', async () => {
  const { provider, reads, calls } = adapter(() => response({ available: true, uploadMode: 'source' }));
  const target = await provider.inspect(config);
  assert.equal(target.id, config.workspaceId);
  assert.deepEqual(target.uploadDestinations, [HOST, 'https://app.promte.dk']);
  assert.deepEqual(reads, [HOST]);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer secret-for-selected-host');
  assert.ok(!JSON.stringify(target).includes('secret-for-selected-host'));
  for (const value of [{ available: true, uploadMode: 'built' }, { available: false, uploadMode: 'source' }, { available: true }]) await assert.rejects(adapter(() => response(value)).provider.inspect(config), /kildekodeupload/);
  await assert.rejects(adapter(() => response({ error: 'secret details' }, 403)).provider.inspect(config), /administrator/);
});
test('Promte sender præcis godkendt ZIP, isolerer uploadtoken og gemmer version før upload', async () => {
  const checkpoints = [], original = artifact();
  let uploaded;
  const { provider, calls, reads } = adapter((url, options) => {
    if (url.includes('/capabilities?')) return response({ available: true, uploadMode: 'source' });
    if (url.endsWith('/prepare')) return response({ version: 7, uploadToken: 'single-upload-token', uploadHost: 'https://app.promte.dk' });
    if (url.includes('/api/upload-app?')) {
      assert.deepEqual(checkpoints.map(r => r.state), ['PREPARED']);
      assert.equal(options.headers.Authorization, 'Bearer single-upload-token');
      uploaded = options.body;
      return response({ status: 'reviewing' });
    }
    if (url.endsWith('/finalize')) {
      assert.deepEqual(JSON.parse(options.body), { workspaceId: config.workspaceId, version: 7, zipName: 'source.zip', zipSize: require('../core/komplai-publish.cjs').zip(original.files).length });
      assert.equal(options.headers.Authorization, 'Bearer secret-for-selected-host');
      return response({ releaseId: 'release-7', status: 'reviewing' });
    }
    throw Error('Ukendt API-rute');
  });
  const target = await provider.inspect(config);
  const result = await provider.deploy(config, original, target, { onUploaded: async receipt => checkpoints.push(receipt) });
  assert.deepEqual(checkpoints.map(r => r.state), ['PREPARED', 'UPLOADED', 'REVIEWING']);
  assert.equal(checkpoints[0].id, 'version:7');
  assert.equal(result.id, 'release-7'); assert.equal(result.state, 'REVIEWING'); assert.equal(result.url, null);
  const approvedZip = require('../core/komplai-publish.cjs').zip(original.files);
  assert.ok(uploaded.includes(approvedZip)); assert.equal(uploaded.indexOf(approvedZip), uploaded.lastIndexOf(approvedZip));
  assert.ok(reads.every(host => host === HOST));
  assert.equal(calls.filter(c => c.url.startsWith('https://app.promte.dk')).length, 1);
});
test('Promte blokerer udokumenteret uploadvært og efterlader en kontrollerbar version', async () => {
  const checkpoints = [];
  const { provider, calls } = adapter(url => url.includes('/capabilities?') ? response({ available: true, uploadMode: 'source' }) : response({ version: 9, uploadToken: 'upload-token', uploadHost: 'https://other-provider.example' }));
  const target = await provider.inspect(config);
  await assert.rejects(provider.deploy(config, artifact(), target, { onUploaded: async value => checkpoints.push(value) }), /ikke var med i gennemgangen/);
  assert.deepEqual(checkpoints, [{ id: 'version:9', promteVersion: 9, state: 'PREPARED', url: null }]);
  assert.equal(calls.length, 2);
});
test('Promte bevarer bekræftet upload selv om finalize fejler', async () => {
  const checkpoints = [];
  const { provider } = adapter(url => {
    if (url.includes('/capabilities?')) return response({ available: true, uploadMode: 'source' });
    if (url.endsWith('/prepare')) return response({ version: 8, uploadToken: 'once', uploadHost: 'same-server' });
    if (url.includes('/api/upload-app?')) return response({ status: 'reviewing' });
    throw Error('Forbindelsen blev afbrudt');
  });
  await assert.rejects(provider.deploy(config, artifact(), await provider.inspect(config), { onUploaded: async value => checkpoints.push(value) }), /før et nyt forsøg/);
  assert.deepEqual(checkpoints.map(c => c.state), ['PREPARED', 'UPLOADED']);
});
test('Promte kontrollerer præcis release og forveksler ikke gennemgang med udgivelse', async () => {
  const receipt = { id: 'release-7', promteVersion: 7, target: { id: config.workspaceId, host: new URL(config.host).hostname } };
  for (const [status, expected] of [['reviewing', 'REVIEWING'], ['published', 'READY'], ['blocked', 'BLOCKED'], ['rejected', 'REJECTED'], ['building', 'BUILDING'], ['unexpected', 'UNKNOWN'], ['__proto__', 'UNKNOWN'], ['constructor', 'UNKNOWN']]) {
    const { provider, calls } = adapter(() => response({ release: { id: 'release-7', version: 7, status, workspaceId: config.workspaceId } }));
    const result = await provider.status(config, receipt);
    assert.equal(result.state, expected);
    assert.equal(result.url, null);
    assert.ok(calls[0].url.includes('/releases/release-7?'));
  }
  const recover = adapter(() => response({ releases: [{ id: 'newer', version: 8, status: 'published' }, { id: 'release-7', version: 7, status: 'reviewing' }] })).provider;
  const recovered = await recover.status(config, { ...receipt, id: 'version:7' });
  assert.equal(recovered.id, 'release-7'); assert.equal(recovered.state, 'REVIEWING');
  assert.equal((await adapter(() => response({ releases: [{ id: 'newer', version: 8, status: 'published' }] })).provider.status(config, { ...receipt, id: 'version:7' })).state, 'AWAITING_UPDATE');
  await assert.rejects(adapter(() => response({ release: { id: 'release-7', version: 8, status: 'published' } })).provider.status(config, receipt), /anden version/);
  const wrongHost = adapter(() => { throw Error('Må ikke kaldes'); });
  await assert.rejects(wrongHost.provider.status({ ...config, host: 'https://another.promte.dk' }, receipt), /matcher ikke destinationen/);
  assert.equal(wrongHost.calls.length, 0);
});
