// Runtime regression: detached/reparented writers must stop for every owner exit.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const sandbox = require('../core/command-sandbox.cjs');
const run = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
async function until(check, message) {
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) { if (await check()) return; await pause(30); }
  assert.fail(message);
}
async function fixture(t) {
  const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-retirement-test-')));
  const root = path.join(base, 'project'), scratch = path.join(base, 'scratch');
  await fs.mkdir(root); await fs.mkdir(scratch);
  const configured = await sandbox.prepare({ workspaceRoot: root, scratchRoot: scratch, directory: path.join(base, 'policy') });
  const pids = new Set(), commands = [];
  t.after(async () => {
    for (const command of commands) { if (command.child.exitCode === null) command.child.kill('SIGKILL'); await command.closed; }
    // Only exact synthetic PIDs from this fixture; protect the host on a failed assertion.
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch {} }
    await fs.rm(base, { recursive: true, force: true });
  });
  await fs.writeFile(path.join(root, 'writer.cjs'), `const fs=require('node:fs');process.on('SIGTERM',()=>{});process.on('SIGINT',()=>{});fs.writeFileSync(process.argv[2]+'.pid',String(process.pid));fs.appendFileSync(process.argv[2],'.');setInterval(()=>fs.appendFileSync(process.argv[2],'.'),25);`);
  await fs.writeFile(path.join(root, 'parent.cjs'), `const cp=require('node:child_process');const c=cp.spawn(process.execPath,['writer.cjs',process.argv[2]],{detached:true,stdio:'ignore'});c.unref();const fs=require('node:fs');const timer=setInterval(()=>{if(fs.existsSync(process.argv[2]+'.pid')){clearInterval(timer);if(process.argv[3]==='hold')setInterval(()=>{},1000);else process.exit(Number(process.argv[3]));}},10);`);
  function start(name, exit = 'hold', approved = false) {
    const file = path.join(root, name);
    const payload = Buffer.from(JSON.stringify({ command: quote(configured.node) + ' parent.cjs ' + quote(file) + ' ' + exit, cwd: root })).toString('base64url');
    const child = spawn(configured.node, [configured.runner, ...(approved ? ['--approved'] : []), configured.policyPath, payload], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = ''; child.stderr.on('data', data => { stderr += data; }); child.stdout.resume();
    const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal, stderr })));
    commands.push({ child, closed });
    return { child, closed, file, async ready() { await until(async () => { if (child.exitCode !== null || child.signalCode) assert.fail(JSON.stringify(await closed)); return fs.stat(file).then(s => s.size > 1, () => false); }, 'writer did not start: ' + stderr); pids.add(Number(await fs.readFile(file + '.pid', 'utf8'))); } };
  }
  async function stopped(command) {
    const pid = Number(await fs.readFile(command.file + '.pid', 'utf8')); pids.add(pid);
    await until(async () => { try { const { stdout } = await run('/bin/ps', ['-o', 'stat=', '-p', String(pid)]); return !stdout.trim() || stdout.trim().startsWith('Z'); } catch { return true; } }, 'detached writer survived');
    const before = (await fs.stat(command.file)).size; await pause(150);
    assert.equal((await fs.stat(command.file)).size, before, 'writer still changes project after retirement');
    pids.delete(pid);
  }
  return { start, stopped, configured, root };
}
for (const signal of ['SIGTERM', 'SIGINT', 'SIGKILL']) test('per-command scope retires detached writer after runner ' + signal + ', preserving concurrent command', { skip: process.platform !== 'darwin', timeout: 45000 }, async t => {
  const f = await fixture(t), survivor = f.start('survivor'), target = f.start('target');
  await Promise.all([survivor.ready(), target.ready()]);
  target.child.kill(signal); await target.closed; await f.stopped(target);
  const before = (await fs.stat(survivor.file)).size; await pause(150);
  assert.ok((await fs.stat(survivor.file)).size > before, 'another command was killed');
  survivor.child.kill('SIGTERM'); await survivor.closed; await f.stopped(survivor);
});
for (const code of [0, 7]) test('normal command completion ' + code + ' retires orphaned detached writer before returning', { skip: process.platform !== 'darwin', timeout: 30000 }, async t => {
  const f = await fixture(t), target = f.start('finished', String(code));
  const result = await target.closed;
  assert.equal(result.code, code, result.stderr); await f.stopped(target);
});
test('execFile timeout retires detached descendants even when runner is forcibly killed', { skip: process.platform !== 'darwin', timeout: 30000 }, async t => {
  const f = await fixture(t), target = f.start('timed-out'); await target.ready();
  // Match child_process timeout behavior: signal only the runner, not its descendants.
  const timeout = setTimeout(() => target.child.kill('SIGKILL'), 50);
  await target.closed; clearTimeout(timeout); await f.stopped(target);
});
test('automatic command isolation fails closed on unqualified platforms', async () => {
  for (const platform of ['linux', 'win32']) assert.equal((await sandbox.support({ platform })).available, false);
});

test('an explicitly approved command also retires detached writers on Stop', { skip: process.platform !== 'darwin', timeout: 30000 }, async t => {
  const f = await fixture(t), target = f.start('approved', 'hold', true);
  await target.ready(); target.child.kill('SIGTERM'); await target.closed; await f.stopped(target);
});
