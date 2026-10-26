// SPDX-License-Identifier: EUPL-1.2
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { DevServer } = require('../core/dev-server.cjs');

async function fixture(t, options = {}) {
  const directory = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-preview-review-integration-')));
  const root = path.join(directory, 'project');
  await fs.mkdir(path.join(root, 'node_modules/vite'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' }, devDependencies: { vite: '1.0.0' } }));
  await fs.writeFile(path.join(root, 'node_modules/vite/package.json'), '{"name":"vite","version":"1.0.0"}');
  const runner = path.join(directory, 'synthetic-runner.cjs');
  await fs.writeFile(runner, `const fs=require('node:fs');fs.appendFileSync('launches.txt','started\\n');const server=require('node:http').createServer((req,res)=>res.end('Synthetic preview')).listen(0,'127.0.0.1',()=>process.send({type:'ready',url:'http://127.0.0.1:'+server.address().port+'/'}));`);
  const manager = new DevServer({ runner, ...options });
  await manager.activate(root);
  t.after(async () => { await manager.stop(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, root, manager };
}

function pauseRuntime(manager) {
  let entered, release, first = true;
  const ready = new Promise(resolve => { entered = resolve; });
  const wait = new Promise(resolve => { release = resolve; });
  manager.getRuntimeConfig = async () => { if (first) { first = false; entered(); await wait; } return manager.config; };
  return { ready, release };
}

test('Stop during execute inspection prevents a later real process launch', async t => {
  const { manager } = await fixture(t), review = await manager.prepare('start'), gate = pauseRuntime(manager);
  const pending = manager.execute(review.token), rejected = assert.rejects(pending, /Gennemgå|gennemgå|stoppet/);
  await gate.ready; await manager.stop(); gate.release(); await rejected;
  assert.equal(manager.child, null); assert.equal(manager.state, 'stopped');
});

test('Stop during preparation cannot recreate a discarded review', async t => {
  const { manager } = await fixture(t), gate = pauseRuntime(manager);
  const pending = manager.prepare('start'), rejected = assert.rejects(pending, /Gennemgå|gennemgå|stoppet/);
  await gate.ready; await manager.stop(); gate.release(); await rejected;
  assert.equal(manager.review, null); assert.equal(manager.child, null);
});

test('project switch during execute cannot start either the old or new project', async t => {
  const { directory, manager } = await fixture(t), review = await manager.prepare('start'), gate = pauseRuntime(manager);
  const other = path.join(directory, 'other'); await fs.mkdir(other);
  const pending = manager.execute(review.token), rejected = assert.rejects(pending, /Gennemgå|gennemgå|stoppet/);
  await gate.ready; await manager.activate(other); gate.release(); await rejected;
  assert.equal(manager.root, other); assert.equal(manager.child, null); assert.equal(manager.state, 'idle');
});

test('changed configuration invalidates an execute already awaiting inspection', async t => {
  const { manager } = await fixture(t), review = await manager.prepare('start'), gate = pauseRuntime(manager);
  const pending = manager.execute(review.token), rejected = assert.rejects(pending, /Gennemgå|gennemgå|opsætning/);
  await gate.ready; manager.configure({ network: { images: ['https://example.invalid'] } }); gate.release(); await rejected;
  assert.equal(manager.child, null);
});

test('an explicit reconfiguration also revokes pending execution when its values are unchanged', async t => {
  const { manager } = await fixture(t), review = await manager.prepare('start'), gate = pauseRuntime(manager);
  const pending = manager.execute(review.token), rejected = assert.rejects(pending, /Gennemgå|gennemgå/);
  await gate.ready; manager.configure({}); gate.release(); await rejected;
  assert.equal(manager.child, null);
});

test('parallel preparations cannot let a slower obsolete request replace the current review', async t => {
  const { manager } = await fixture(t), gate = pauseRuntime(manager);
  const pending = manager.prepare('start'), rejected = assert.rejects(pending, /Gennemgå|gennemgå/);
  await gate.ready;
  const latest = await manager.prepare('start'); gate.release(); await rejected;
  assert.equal(manager.review.token, latest.token); assert.equal(manager.child, null);
});

test('parallel execution of one token cannot launch two processes', async t => {
  const { root, manager } = await fixture(t), review = await manager.prepare('start');
  const results = await Promise.allSettled([manager.execute(review.token), manager.execute(review.token)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  for (let n = 0; n < 200 && manager.state === 'starting'; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(manager.state, 'running');
  assert.equal(await fs.readFile(path.join(root, 'launches.txt'), 'utf8'), 'started\n');
});

test('Stop in the starting event is checked immediately before process creation', async t => {
  const { manager } = await fixture(t), review = await manager.prepare('start');
  manager.emit = snapshot => { if (snapshot.state === 'starting') void manager.stop(); };
  await assert.rejects(manager.execute(review.token), /Gennemgå|gennemgå/);
  assert.equal(manager.child, null); assert.equal(manager.state, 'stopped');
});

test('manual reviews expire and a rejected or consumed token cannot be reused', async t => {
  let time = 1;
  const { manager } = await fixture(t, { now: () => time, reviewTtlMs: 1000 });
  const review = await manager.prepare('start'); time = 1001;
  await assert.rejects(manager.execute(review.token), /Gennemgå|gennemgå/);
  await assert.rejects(manager.execute(review.token), /Gennemgå|gennemgå/);
  assert.equal(manager.child, null);
});

test('replacing a project directory with identical control files requires a fresh review', async t => {
  const { root, manager } = await fixture(t), review = await manager.prepare('start');
  await fs.rename(root, root + '-old'); await fs.cp(root + '-old', root, { recursive: true });
  await assert.rejects(manager.execute(review.token), /Gennemgå|gennemgå/);
  assert.equal(manager.child, null);
});

test('a changed inactive policy revision cannot reuse a prior manual review', async t => {
  const { manager } = await fixture(t); let revision = 'first';
  manager.egress.binding = () => revision;
  const review = await manager.prepare('start'); revision = 'second';
  await assert.rejects(manager.execute(review.token), /Gennemgå|gennemgå|ændret/);
  assert.equal(manager.child, null);
});

test('an ordinary explicitly reviewed synthetic server still starts exactly once and stops', async t => {
  const { root, manager } = await fixture(t), review = await manager.prepare('start');
  assert.equal(manager.child, null);
  await manager.execute(review.token);
  for (let n = 0; n < 200 && manager.state === 'starting'; n++) await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(manager.state, 'running', manager.message);
  assert.equal(await (await fetch(manager.url)).text(), 'Synthetic preview');
  assert.equal(await fs.readFile(path.join(root, 'launches.txt'), 'utf8'), 'started\n');
  await assert.rejects(manager.execute(review.token), /Gennemgå/);
  await manager.stop(); assert.equal(manager.child, null); assert.equal(manager.state, 'stopped');
});

test('installation verification cannot publish installed after Stop or a project switch', { timeout: 10_000 }, async t => {
  for (const intervention of ['stop', 'switch']) {
    const { root, directory, manager } = await fixture(t);
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'synthetic-review-test', scripts: { dev: 'node web.cjs' } }));
    await fs.writeFile(path.join(root, '.npmrc'), `cache=${path.join(directory, 'npm-cache')}\n`);
    await fs.writeFile(path.join(root, 'web.cjs'), '// This fixture is never started.');
    const states = []; manager.emit = snapshot => states.push(snapshot.state);
    const review = await manager.prepare('install'); assert.equal(review.project.kind, 'services');
    await manager.execute(review.token);
    const gate = pauseRuntime(manager); t.after(gate.release);
    await gate.ready;
    if (intervention === 'stop') await manager.stop();
    else { const other = path.join(directory, 'other'); await fs.mkdir(other); await manager.activate(other); }
    const state = manager.state; gate.release();
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(manager.state, state); assert.ok(!states.includes('installed'));
    assert.equal(manager.children.length, 0);
  }
});
