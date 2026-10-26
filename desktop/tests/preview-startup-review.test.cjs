// SPDX-License-Identifier: EUPL-1.2
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PreviewStartupReview } = require('../core/preview-startup-review.cjs');

async function fixture(t, { kind = 'static', installed = true, platform = 'darwin' } = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-preview-review-')));
  const root = path.join(parent, 'project'); await fs.mkdir(root);
  let policy = { active: false, revision: 'policy-one' }, config = kind === 'static' ? { mode: 'static' } : {}, time = 1;
  if (kind === 'static') { await fs.mkdir(path.join(root, 'public')); await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Eksempel</h1>'); }
  else {
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '1.0.0' } }));
    if (installed) { await fs.mkdir(path.join(root, 'node_modules/vite'), { recursive: true }); await fs.writeFile(path.join(root, 'node_modules/vite/package.json'), '{"name":"vite","version":"1.0.0"}'); }
  }
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  const review = new PreviewStartupReview({ getPolicy: async () => policy, getRuntimeConfig: async () => config, now: () => time, platform, ttlMs: 1000 });
  return { root, parent, review, policy: value => { policy = value; }, config: value => { config = value; }, time: value => { time = value; } };
}

test('static candidate needs no project command but never grants execution authority', async t => {
  const f = await fixture(t), item = await f.review.prepare(f.root, 'show-static');
  assert.equal(item.decision, 'built-in-static-candidate'); assert.equal(item.requiresProcessExecution, false); assert.equal(item.skipTechnicalReview, true); assert.equal(item.authorizesExecution, false);
  const result = await f.review.consume(item.id); assert.equal(result.decision, item.decision); assert.equal(result.authorizesExecution, false);
  assert.ok(Object.isFrozen(item)); assert.ok(!('root' in item)); assert.ok(!('command' in result));
  await assert.rejects(f.review.consume(item.id), { code: 'PREVIEW_REVIEW_STALE' });
});
test('recognizing an installed Vite package does not execute its config or authorize a server', async t => {
  const f = await fixture(t, { kind: 'vite' });
  await fs.writeFile(path.join(f.root, 'vite.config.js'), 'throw new Error("DO NOT EXECUTE")');
  const item = await f.review.prepare(f.root, 'start-server');
  assert.equal(item.decision, 'explicit-review-required'); assert.equal(item.skipTechnicalReview, false); assert.equal(item.authorizesExecution, false);
  assert.equal((await f.review.consume(item.id)).decision, 'explicit-review-required');
});
test('installations remain separately reviewed even for a familiar framework', async t => {
  const f = await fixture(t, { kind: 'vite', installed: false });
  assert.equal((await f.review.prepare(f.root, 'start-server')).decision, 'dependencies-required');
  assert.equal((await f.review.prepare(f.root, 'install-dependencies')).decision, 'explicit-review-required');
});
test('active data protection requires a protected route for static files and project processes', async t => {
  for (const kind of ['static', 'vite']) {
    const f = await fixture(t, { kind }); f.policy({ active: true, revision: 'private-one' });
    for (const action of ['show-static', 'start-server', 'install-dependencies']) {
      const item = await f.review.prepare(f.root, action);
      assert.equal(item.decision, 'protected-route-required'); assert.equal(item.skipTechnicalReview, false); assert.equal(item.authorizesExecution, false);
    }
  }
});
test('Windows and unknown platforms cannot infer a sandbox from localhost or framework recognition', async t => {
  for (const platform of ['win32', 'linux', 'darwin', 'unknown']) {
    const f = await fixture(t, { kind: 'vite', platform }), item = await f.review.prepare(f.root, 'start-server');
    assert.equal(item.decision, 'explicit-review-required'); assert.equal(item.skipTechnicalReview, false);
  }
});
test('changed runtime control files invalidate the exact prepared basis', async t => {
  for (const name of ['package.json', 'vite.config.js', '.npmrc']) {
    const f = await fixture(t, { kind: 'vite' }), item = await f.review.prepare(f.root, 'start-server');
    await fs.writeFile(path.join(f.root, name), name === 'package.json' ? '{"scripts":{"dev":"node other.cjs"}}' : '// changed synthetic config');
    await assert.rejects(f.review.consume(item.id), { code: 'PREVIEW_REVIEW_STALE' });
  }
});
test('policy, configured runtime and dependency availability changes require a new review', async t => {
  for (const change of ['policy', 'config', 'dependencies']) {
    const f = await fixture(t, { kind: 'vite' }), item = await f.review.prepare(f.root, 'start-server');
    if (change === 'policy') f.policy({ active: true, revision: 'policy-two' });
    if (change === 'config') f.config({ mode: 'static' });
    if (change === 'dependencies') await fs.rename(path.join(f.root, 'node_modules'), path.join(f.root, 'modules-disabled'));
    await assert.rejects(f.review.consume(item.id), { code: 'PREVIEW_REVIEW_STALE' });
  }
});
test('root replacement and symlink roots are rejected', async t => {
  const f = await fixture(t), item = await f.review.prepare(f.root, 'show-static');
  await fs.rename(f.root, f.root + '-old'); await fs.mkdir(f.root);
  await assert.rejects(f.review.consume(item.id), { code: 'PREVIEW_REVIEW_STALE' });
  await fs.symlink(f.root + '-old', path.join(f.parent, 'link'));
  await assert.rejects(f.review.prepare(path.join(f.parent, 'link'), 'show-static'), { code: 'PREVIEW_REVIEW_STALE' });
});
test('expired, revoked, invented and reused reviews never become permission', async t => {
  const f = await fixture(t), expired = await f.review.prepare(f.root, 'show-static'); f.time(1001);
  await assert.rejects(f.review.consume(expired.id), { code: 'PREVIEW_REVIEW_STALE' });
  const revoked = await f.review.prepare(f.root, 'show-static'); f.review.invalidate();
  await assert.rejects(f.review.consume(revoked.id), { code: 'PREVIEW_REVIEW_STALE' });
  await assert.rejects(f.review.consume('model-supplied-id'), { code: 'PREVIEW_REVIEW_STALE' });
});
test('untrusted or missing policy metadata and arbitrary action names fail closed', async t => {
  const f = await fixture(t);
  await assert.rejects(f.review.prepare(f.root, 'npm run whatever'), /Unknown/);
  f.policy({ active: false }); await assert.rejects(f.review.prepare(f.root, 'show-static'), { code: 'PREVIEW_REVIEW_STALE' });
  assert.throws(() => new PreviewStartupReview(), /trusted/);
});
test('pending review count is bounded and invalidation releases it', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 32; i++) await f.review.prepare(f.root, 'show-static');
  await assert.rejects(f.review.prepare(f.root, 'show-static'), { code: 'PREVIEW_REVIEW_LIMIT' });
  f.review.invalidate(); assert.equal((await f.review.prepare(f.root, 'show-static')).decision, 'built-in-static-candidate');
});
test('a policy or runtime mutation during inspection cannot produce a stale review', async t => {
  const f = await fixture(t);
  for (const changed of ['policy', 'config']) {
    const policy = { active: false, revision: 'one' }, config = { mode: 'static' };
    const review = new PreviewStartupReview({ getPolicy: async () => policy, getRuntimeConfig: async () => config, inspectProject: async () => {
      if (changed === 'policy') policy.revision = 'two'; else config.mode = 'auto';
      return { fingerprint: 'a'.repeat(64), kind: 'static', supported: false, installed: true };
    } });
    await assert.rejects(review.prepare(f.root, 'show-static'), { code: 'PREVIEW_REVIEW_STALE' });
  }
});
test('concurrent consumption gives exactly one fresh result', async t => {
  const f = await fixture(t), item = await f.review.prepare(f.root, 'show-static');
  const results = await Promise.allSettled([f.review.consume(item.id), f.review.consume(item.id)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
});

test('invalidation during asynchronous preparation or consumption cannot resurrect a review', async t => {
  for (const operation of ['prepare', 'consume']) {
    const f = await fixture(t);
    let blocked = false, entered, release;
    const ready = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
    const review = new PreviewStartupReview({ getPolicy: async () => ({ active: false, revision: 'same' }), inspectProject: async () => {
      if (blocked) { entered(); await pending; }
      return { fingerprint: 'a'.repeat(64), kind: 'static', installed: true };
    } });
    const saved = operation === 'consume' ? await review.prepare(f.root, 'show-static') : null;
    blocked = true;
    const running = operation === 'consume' ? review.consume(saved.id) : review.prepare(f.root, 'show-static');
    const rejected = assert.rejects(running, { code: 'PREVIEW_REVIEW_STALE' });
    await ready; review.invalidate(); release(); await rejected;
  }
});

test('ordinary ancestor aliases bind to the real project without accepting direct symlink roots', async t => {
  const f = await fixture(t), alias = path.join(f.parent, 'parent-alias');
  const actual = path.join(f.parent, 'container'); await fs.mkdir(actual);
  await fs.rename(f.root, path.join(actual, 'project')); await fs.symlink(actual, alias, 'junction');
  const item = await f.review.prepare(path.join(alias, 'project'), 'show-static');
  assert.equal((await f.review.consume(item.id)).decision, 'built-in-static-candidate');
  const changed = await f.review.prepare(path.join(alias, 'project'), 'show-static');
  await fs.rename(path.join(actual, 'project'), path.join(actual, 'previous')); await fs.cp(path.join(actual, 'previous'), path.join(actual, 'project'), { recursive: true });
  await assert.rejects(f.review.consume(changed.id), { code: 'PREVIEW_REVIEW_STALE' });
});
