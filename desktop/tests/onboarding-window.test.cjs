const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../core/store.cjs');
const { OnboardingWindow } = require('../core/onboarding-window.cjs');

test('fresh native welcome is small across unfinished restarts, then expands once without changing profile', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-welcome-window-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {}), first = new OnboardingWindow(store);
  await first.initialize();
  assert.equal(first.compact, true);
  assert.deepEqual(first.options(), { width: 600, height: 700, minWidth: 520, minHeight: 620, resizable: false, maximizable: false, fullscreenable: false });
  // Renderer migration may happen while Welcome is open; it must not finish Welcome.
  await store.update(state => { state.profile = { migrated: 1, name: '', appearance: { theme: 'dark', panelOpen: false } }; });
  const restart = new OnboardingWindow(new Store(root, {}));
  await restart.initialize();
  assert.equal(restart.compact, true);
  const calls = [];
  const window = { isDestroyed: () => false };
  for (const method of ['setResizable', 'setMaximizable', 'setFullScreenable', 'setMinimumSize', 'setSize', 'center', 'maximize']) window[method] = (...args) => calls.push([method, ...args]);
  await restart.finish(window);
  assert.equal((await store.read()).desktopWelcomeComplete, true);
  assert.deepEqual((await store.read()).profile, { migrated: 1, name: '', appearance: { theme: 'dark', panelOpen: false } });
  assert.ok(calls.some(c => c[0] === 'setMinimumSize' && c[1] === 980 && c[2] === 720));
  assert.ok(calls.some(c => c[0] === 'setSize' && c[1] === 1440 && c[2] === 940));
  const returning = new OnboardingWindow(new Store(root, {}));
  await returning.initialize();
  assert.deepEqual(returning.options(), {});
  const count = calls.length;
  await returning.finish(window);
  assert.equal(calls.length, count, 'reopening the introduction must not resize an established workspace');
});

test('an existing installation retains its regular window without adding identity', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-welcome-upgrade-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new Store(root, {});
  await store.update(state => { state.profile = { migrated: 1, name: '', icon: '' }; });
  const window = new OnboardingWindow(store);
  await window.initialize();
  assert.equal(window.compact, false);
  assert.equal((await store.read()).profile.name, '');
});
