const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createReadGuard } = require('../core/engine.cjs');
const { protectedPath } = require('../core/git.cjs');
const projectFiles = require('../core/project-files.cjs');
const { capture } = require('../core/changes.cjs');
const { projectSnapshot, excluded } = require('../core/privacy/hybrid-seatbelt-workspaces.cjs');
const { ApprovalsPolicy } = require('../core/approvals-policy.cjs');
const { Store } = require('../core/store.cjs');
const common = require('../core/protected-paths.cjs');

const basePaths = ['.env', '.env.local', '.envrc', 'production.env', 'production.env.local', 'service.key', 'service.pem', 'certificate.p12', 'certificate.pfx', '.ssh/id_rsa', '.aws/config', '.gnupg/private/key', '.kube/config', '.azure/token.json', '.npmrc', '.pypirc', 'secrets/value.txt', '.secrets/value.txt', 'credentials.json', '.git/config', '.aura-private/state.json'];
const protectedNames = [...basePaths, ...basePaths.map(name => 'nested/' + name.toUpperCase())];
const aliases = ['service.KEY::$DATA', 'certificate.p12:stream', 'service.pem.', 'certificate.PFX ', '.KUBE./config', '.SSH /id_rsa', 'references./private.txt', '.kube.. /config', 'ordinary-name. ', 'ordinary-name. :stream'];
const colonNames = ['public:credentials.json', 'notes:private.key', 'public:secrets.txt'];
const ordinaryNames = ['index.html', 'src/main.js', 'public/app.css', 'public/data.json', 'docs/environment.md', 'public/keynote.txt', 'references.md', 'certificate.p12.backup', '.git.notes'];

async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-path-contract-')));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'project'); await fs.mkdir(root);
  const put = async name => { const file = path.join(root, name); await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'SYNTHETIC PATH TEST'); };
  return { base, root, put };
}

test('sensitive path names agree across read, automatic approval, Git, file view and private snapshot', async t => {
  const { base, root } = await fixture(t);
  const read = createReadGuard({ fs, path, root });
  const policy = new ApprovalsPolicy(new Store(path.join(base, 'state'), {}));
  const context = { projectRoot: root, workspaceRoot: root, mode: 'build', conversationPermission: { active: true } };
  for (const name of protectedNames) await t.test(name, async () => {
    assert.equal(protectedPath(name), true, 'Git');
    assert.equal(projectFiles.isProtected(name), true, 'file view');
    assert.equal(excluded(name), true, 'private snapshot');
    await assert.rejects(read({ tool: 'read' }, { args: { filePath: name } }), /Aura beskytter/, 'read guard before file access');
    const result = await policy.allowed(context, { id: 'synthetic', permission: 'edit', patterns: [], metadata: { filepath: path.join(root, name) } });
    assert.equal(result.allowed, false, 'conversation grant');
    assert.equal(result.descriptor.persistable, false, 'remembered grant');
  });
});

test('NTFS streams and trailing dot/space aliases do not weaken name protection', async t => {
  const { root } = await fixture(t), read = createReadGuard({ fs, path, root });
  for (const name of aliases) {
    assert.equal(protectedPath(name), true, name);
    assert.equal(projectFiles.isProtected(name), true, name);
    await assert.rejects(read({ tool: 'read' }, { args: { filePath: name } }), /Aura beskytter/, name);
  }
});

test('actual snapshots omit protected names while ordinary project files remain available', async t => {
  const { root, put } = await fixture(t);
  for (const name of [...protectedNames, ...ordinaryNames, ...(process.platform === 'win32' ? [] : colonNames)]) await put(name);
  assert.deepEqual([...((await capture(root)).files.keys())].sort(), [...ordinaryNames].sort());
  assert.deepEqual([...((await projectSnapshot(root)).files.keys())].sort(), [...ordinaryNames].sort());
  const files = (await projectFiles.listFiles(root)).files.map(file => file.path);
  assert.deepEqual(files.sort(), [...ordinaryNames].sort());
  for (const name of ordinaryNames) assert.equal(protectedPath(name), false, name);
});

test('selected references remain a separate explicit boundary and cannot release credentials', async t => {
  const { root, put } = await fixture(t);
  for (const name of ['references/selected.txt', 'references/private.txt', 'references/token.pem', 'nested/REFERENCES/private.txt', 'normal.txt']) await put(name);
  const selected = new Set(['references/selected.txt', 'references/token.pem']);
  const snapshot = await projectSnapshot(root, selected);
  assert.deepEqual([...snapshot.files.keys()].sort(), ['normal.txt', 'references/selected.txt']);
  const read = createReadGuard({ fs, path, root, references: [...selected] });
  await read({ tool: 'read' }, { args: { filePath: 'references/selected.txt' } });
  await assert.rejects(read({ tool: 'read' }, { args: { filePath: 'references/private.txt' } }), /Aura beskytter/);
  await assert.rejects(read({ tool: 'read' }, { args: { filePath: 'references/token.pem' } }), /Aura beskytter/);
  if (process.platform !== 'win32') {
    await fs.unlink(path.join(root, 'references/selected.txt'));
    await fs.symlink(path.join(root, 'normal.txt'), path.join(root, 'references/selected.txt'));
    await assert.rejects(read({ tool: 'read' }, { args: { filePath: 'references/selected.txt' } }), /Aura beskytter/);
  }
});

test('the shared regex and actual SRT glob parser cover the same sensitive names and aliases', async () => {
  const { denyGlobRegex } = await import('../node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/glob-pattern.js');
  const sandboxRules = common.toSandboxGlobs().map(pattern => new RegExp(denyGlobRegex(pattern)));
  const expression = common.toRegex();
  for (const name of [...protectedNames, ...aliases, ...colonNames]) {
    assert.equal(common.isProtected(name), true, name);
    assert.equal(expression.test(name), true, 'regex: ' + name);
    assert.equal(sandboxRules.some(rule => rule.test('project/' + name)), true, 'SRT: ' + name);
  }
  for (const name of ordinaryNames) {
    assert.equal(expression.test(name), false, name);
    assert.equal(sandboxRules.some(rule => rule.test('project/' + name)), false, name);
  }
  assert.equal(common.isProtected('nested\\.KUBE.\\config'), true);
  assert.equal(common.isProtected('references/selected.txt', { references: false }), false);
  assert.equal(common.isProtected('references/credentials.json', { references: false }), true);
  assert.equal(common.isGenerated('dist/app.js', 'privacy'), false, 'built apps may remain protected workflow outputs');
  assert.equal(common.isGenerated('dist/app.js', 'snapshot'), true, 'existing snapshot omission is retained');
});

test('OpenCode read and edit denials are generated from the shared policy', () => {
  const { permissions } = require('../core/engine.cjs');
  const rules = permissions('/synthetic/project', ['references/selected.txt', 'references/token.pem']);
  for (const pattern of common.toOpenCodeGlobs()) {
    assert.equal(rules.read[pattern], 'deny', pattern);
    assert.equal(rules.edit[pattern], 'deny', pattern);
  }
  assert.equal(rules.read['references/selected.txt'], 'allow');
  assert.equal(rules.read['references/token.pem'], undefined, 'no exact allow overrides the credential deny');
  assert.equal(rules.bash, 'ask');
  assert.equal(rules.external_directory['*'], 'ask');
});

test('deployment source filtering retains the shared protection and ordinary files', () => {
  const { preparePromteArtifact } = require('../core/provider-promte.cjs');
  const names = [...protectedNames, ...aliases, ...colonNames, 'references/private.txt', ...ordinaryNames];
  const result = preparePromteArtifact({ files: names.map(file => ({ file, data: Buffer.from('Synthetic source.') })) });
  assert.deepEqual(result.files.map(file => file.file).sort(), [...ordinaryNames].sort());
});

test('native command isolation blocks shared private names for reads, writes and descendants', async t => {
  const { sandboxPrerequisiteReason } = require('./helpers/sandbox-prerequisites.cjs');
  const reason = await sandboxPrerequisiteReason(); if (reason) return t.skip(reason);
  const { base, root, put } = await fixture(t);
  const paths = [...protectedNames, ...aliases, ...colonNames, 'references/private.txt'];
  for (const name of paths) await put(name);
  const scratch = path.join(base, 'scratch'); await fs.mkdir(scratch);
  const config = await require('../core/command-sandbox.cjs').prepare({ workspaceRoot: root, scratchRoot: scratch, directory: path.join(base, 'policy') });
  const code = `const fs=require('node:fs'); const cp=require('node:child_process'); const names=${JSON.stringify(paths)}; const bad=[]; for(const name of names){ try{fs.readFileSync(name);bad.push('read:'+name);}catch{} try{fs.appendFileSync(name,'wrong');bad.push('write:'+name);}catch{} } const child=cp.spawnSync(process.execPath,['-e',"require('node:fs').readFileSync('.kube/config')"],{stdio:'ignore'});if(child.status===0)bad.push('child');fs.writeFileSync('result.json',JSON.stringify(bad));`;
  await fs.writeFile(path.join(root, 'check.cjs'), code);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  const payload = Buffer.from(JSON.stringify({ command: quote(config.node) + ' check.cjs', cwd: root })).toString('base64url');
  const run = require('node:util').promisify(require('node:child_process').execFile);
  await run(config.node, [config.runner, config.policyPath, payload], { cwd: root, timeout: 30000 });
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(root, 'result.json'))), []);
  for (const name of paths) assert.equal(await fs.readFile(path.join(root, name), 'utf8'), 'SYNTHETIC PATH TEST', name);
});
