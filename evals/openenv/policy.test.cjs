const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { ApprovalsPolicy } = require('../../desktop/core/approvals-policy.cjs');
const policy = require('./policy.cjs');
const { reviewWrite, reviewPermission, modelCallBudgetReached } = policy;

test('pilot approves only explicit public writes in build mode, with no links or broad grants', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pilot-policy-'));
  t.after(() => fs.rm(root, { recursive: true, force: true })); // This test owns only its synthetic fixture.
  await fs.mkdir(path.join(root, 'public'));
  await fs.symlink(os.tmpdir(), path.join(root, 'public', 'escape'));
  const request = patterns => ({ permission: 'edit', patterns });
  assert.equal(await reviewWrite(root, request(['public/index.html']), 'build'), true);
  assert.equal(await reviewWrite(root, request([path.join(root, 'public/styles.css')]), 'build'), true);
  for (const file of ['../private.js', '/tmp/private.js', 'public/../secret.js', 'public/.env', 'public/*', 'public/escape/index.html', 'AGENTS.md', 'public/app.cjs']) {
    assert.equal(await reviewWrite(root, request([file]), 'build'), false, file);
  }
  assert.equal(await reviewWrite(root, request(['public/index.html', '../private.js']), 'build'), false);
  assert.equal(await reviewWrite(root, request(['public/index.html']), 'plan'), false);
  assert.equal(await reviewWrite(root, { permission: 'bash', patterns: ['echo ok'] }, 'build'), false);
  assert.equal(await reviewWrite(root, request([]), 'build'), false);
});

async function fixture(t) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-pilot-read-')));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'public', 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'public', 'styles.css'), 'body { color: #222; }');
  await fs.writeFile(path.join(root, 'public', 'app.js'), 'console.log("demo");');
  await fs.writeFile(path.join(root, 'public', 'assets', 'logo.svg'), '<svg/>');
  await fs.writeFile(path.join(root, 'private.js'), 'private');
  const product = new ApprovalsPolicy(null);
  const record = async (p, mode = 'build') => ({ p, descriptor: await product.describe({ projectRoot: root, workspaceRoot: root, mode }, p) });
  const read = filePath => ({ id: 'read', permission: 'read', patterns: [filePath], toolInput: { tool: 'read', filePath }, metadata: { filepath: filePath } });
  const grep = target => ({ id: 'grep', permission: 'grep', patterns: ['color|demo'], toolInput: { tool: 'grep', path: target, pattern: 'color|demo' } });
  return { root, record, read, grep };
}

test('validated read and grep requests can inspect their own public files and safe subtrees once, including during planning', async t => {
  const { root, record, read, grep } = await fixture(t);
  for (const mode of ['plan', 'build']) for (const p of [read(path.join(root, 'public/styles.css')), grep(path.join(root, 'public/styles.css')), grep(path.join(root, 'public')), grep(path.join(root, 'public/assets'))]) {
    const approval = await record(p, mode);
    assert.equal(approval.descriptor.projectFile, false, 'read approval is not the product-wide write grant');
    assert.equal(await reviewPermission(root, approval, mode), true, `${mode}: ${JSON.stringify(p.toolInput)}`);
  }
  const relative = read('public/styles.css'); relative.metadata.filepath = path.join(root, 'public/styles.css');
  assert.equal(await reviewPermission(root, await record(relative), 'build'), true, 'product-bound relative file input');
});

test('read and grep fail closed for outside, traversal, unknown, missing and broad targets', async t => {
  const { root, record, read, grep } = await fixture(t);
  for (const target of [root, path.join(root, 'private.js'), '/etc/hosts', root + '/public/../private.js', root + '/public/../public/app.js', path.join(root, 'public/*'), path.join(root, 'public/missing.js'), path.join(root, 'public/.env'), path.join(root, 'public/key.pem')]) {
    for (const request of [read(target), grep(target)]) assert.equal(await reviewPermission(root, await record(request), 'build'), false, target);
  }
  const safe = await record(grep(path.join(root, 'public')));
  for (const changed of [null, { p: safe.p }, { descriptor: safe.descriptor }, { ...safe, descriptor: { ...safe.descriptor, match: undefined } }, { ...safe, descriptor: { ...safe.descriptor, fingerprint: '' } }, { ...safe, descriptor: { ...safe.descriptor, blockedMode: true } }, { ...safe, p: { ...safe.p, toolInput: undefined } }, { ...safe, p: { ...safe.p, toolInput: { ...safe.p.toolInput, tool: 'bash' } } }, { ...safe, p: { ...safe.p, toolInput: { tool: 'grep', pattern: 'color' } } }, { ...safe, descriptor: { ...safe.descriptor, match: { kind: 'grep', targets: [{ path: path.join(root, 'public'), subtree: true }] } } }]) {
    assert.equal(await reviewPermission(root, changed, 'build'), false);
  }
  assert.equal(await reviewPermission(root, safe, 'unknown'), false);
  for (const permission of ['bash', 'webfetch', 'glob', 'list', 'external_directory', 'unknown']) assert.equal(await reviewPermission(root, await record({ permission, patterns: [path.join(root, 'public')] }), 'build'), false, permission);
  const mismatched = await record(grep(path.join(root, 'public/styles.css')));
  mismatched.p.toolInput.path = path.join(root, 'public/app.js');
  assert.equal(await reviewPermission(root, mismatched, 'build'), false, 'changed concrete input cannot reuse descriptor');
});

test('reads reject links even when the product canonical descriptor resolves inside public', async t => {
  const { root, record, read, grep } = await fixture(t);
  const publicRoot = path.join(root, 'public');
  await fs.symlink(path.join(publicRoot, 'styles.css'), path.join(publicRoot, 'alias.css'));
  await fs.symlink(path.join(root, 'private.js'), path.join(publicRoot, 'outside.js'));
  await fs.symlink(path.join(publicRoot, 'missing.js'), path.join(publicRoot, 'dangling.js'));
  await fs.symlink(publicRoot, path.join(publicRoot, 'cycle'));
  for (const name of ['alias.css', 'outside.js', 'dangling.js', 'cycle/styles.css']) for (const p of [read(path.join(publicRoot, name)), grep(path.join(publicRoot, name))]) {
    assert.equal(await reviewPermission(root, await record(p), 'build'), false, name);
  }
  assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), false, 'recursive search rejects nested links');
  assert.equal(await reviewPermission(root, await record(read(path.join(publicRoot, 'styles.css'))), 'build'), true, 'an exact unrelated safe file stays readable');
  const before = await record(read(path.join(publicRoot, 'app.js')));
  await fs.unlink(path.join(publicRoot, 'app.js'));
  await fs.symlink(path.join(root, 'private.js'), path.join(publicRoot, 'app.js'));
  assert.equal(await reviewPermission(root, before, 'build'), false, 'filesystem change after descriptor is not accepted');
});

test('directory search rejects protected or unsupported descendants rather than approving the whole tree', async t => {
  const { root, record, read, grep } = await fixture(t);
  const publicRoot = path.join(root, 'public');
  for (const relative of ['.env', '.GIT/config', 'secrets/data.json', 'REFERENCES/data.json', 'keys/key.pem', 'assets/photo.png', 'code/app.cjs']) {
    const target = path.join(publicRoot, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, 'synthetic');
    assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), false, relative);
    assert.equal(await reviewPermission(root, await record(read(target)), 'build'), false, relative);
    await fs.rm(target);
    const parent = path.dirname(target);
    if (parent !== publicRoot && parent !== path.join(publicRoot, 'assets')) await fs.rmdir(parent);
  }
  assert.equal(await reviewPermission(root, await record(grep(publicRoot)), 'build'), true);
});

test('descriptor routing preserves public-only reviewed writes and never grants writes during planning', async t => {
  const { root, record } = await fixture(t);
  for (const mode of ['plan', 'build']) for (const file of ['public/index.html', 'public/styles.css', 'public/app.js', 'public/data.json', 'public/assets/icon.svg', 'private.js', 'public/.env', 'public/command.sh']) {
    const target = path.join(root, file);
    const p = { id: 'edit', permission: 'edit', patterns: [file], metadata: { filepath: target }, toolInput: { tool: 'write', filePath: target } };
    assert.equal(await reviewPermission(root, await record(p, mode), mode), mode === 'build' && /^public\/.*\.(html|css|js|json|svg)$/.test(file), `${mode}: ${file}`);
  }
});

test('model-call budget stops on the limit, not the next call, and invalid limits fail closed', () => {
  for (const count of [0, 1, 63]) assert.equal(modelCallBudgetReached(count, 64), false);
  for (const count of [64, 65, 100]) assert.equal(modelCallBudgetReached(count, 64), true);
  for (const limit of [0, -1, undefined, '64', Infinity]) assert.equal(modelCallBudgetReached(1, limit), true);
  for (const count of [undefined, NaN, -1, 1.5]) assert.equal(modelCallBudgetReached(count, 64), true);
});

for (const worker of ['worker.cjs', 'codex_comparison_worker.cjs']) test(`${worker} routes actual events through shared once-only policy and stops at exactly 64`, async t => {
  const { root, record, grep } = await fixture(t);
  const source = await fs.readFile(path.join(__dirname, worker), 'utf8');
  const replies = [], stops = [], imports = [];
  const approval = await record(grep(path.join(root, 'public')));
  const bench = { project: { root }, chat: { approvals: new Map([['grep', approval]]) }, reply: async input => replies.push(input), stop: async () => stops.push(true) };
  const context = vm.createContext({ benchFixture: bench, console, setTimeout, clearTimeout, structuredClone, Buffer,
    process: { argv: ['', '', '', '', root], stdout: { write() {} }, on() {} },
    require(name) {
      imports.push(name);
      if (name === './policy.cjs') return policy;
      if (name.startsWith('node:')) return require(name);
      if (name === 'electron') return { app: { setName() {}, setPath() {}, on() {}, whenReady() { return { then() {} }; } } };
      if (name.endsWith('/store.cjs')) return { Store: class {} };
      return {};
    },
  });
  vm.runInContext(source + '\nbench = benchFixture; config = { maxModelCalls: 64 }; mode = "build"; stage = "build";', context, { filename: worker });
  vm.runInContext('event({ type: "permission.asked", properties: { id: "grep", permission: "grep" } });', context);
  await vm.runInContext('permissionQueue', context);
  assert.equal(imports.filter(name => name === './policy.cjs').length, 1);
  assert.equal(replies.length, 1);
  assert.equal(replies[0].allow, true);
  assert.equal(replies[0].scope, 'once');
  assert.equal(vm.runInContext('audit[0].allow', context), true);
  bench.chat.approvals.set('outside', await record(grep(path.join(root, 'private.js'))));
  vm.runInContext('event({ type: "permission.asked", properties: { id: "outside", permission: "grep" } }); event({ type: "permission.asked", properties: { id: "missing", permission: "read" } });', context);
  await vm.runInContext('permissionQueue', context);
  assert.equal(replies.length, 3);
  assert.equal(replies[1].allow, false, 'worker does not expand the safe scope');
  assert.equal(replies[2].allow, false, 'missing validated approval record fails closed');
  assert.ok(replies.every(reply => reply.scope === 'once'));
  vm.runInContext('event({ type: "usage", usage: { calls: 63 } });', context);
  assert.equal(stops.length, 0);
  vm.runInContext('event({ type: "usage", usage: { calls: 64 } }); event({ type: "usage", usage: { calls: 65 } });', context);
  assert.equal(stops.length, 1);
  assert.deepEqual(Array.from(vm.runInContext('faults', context)), ['model_call_budget']);
});
