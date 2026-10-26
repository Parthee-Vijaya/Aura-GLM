// SPDX-License-Identifier: EUPL-1.2
'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { PrivacyGateError } = require('./policy.cjs');
const fail = (code = 'PRIVACY_GIT_ISOLATION_REQUIRED') => new PrivacyGateError(code, 'Git-handlingen kunne ikke gennemføres i det beskyttede lokale arbejdsmiljø. Ingen ekstern reserve blev startet.');
const MAX = 16 * 1024 * 1024;

// This program is trusted host code, never a repository script. Waiting for
// stdin lets the host attest the scope before Git can read or change a file.
// Even a newly introduced Git filter cannot spawn a shell: the native lease
// permits only the pinned node and git executables, with no network access.
const WORKER = `
const {spawnSync}=require('node:child_process');
let pieces=[],size=0;
process.stdin.on('data',b=>{size+=b.length;if(size>33554432)process.exit(125);pieces.push(b)});
process.stdin.on('end',()=>{
 try {
  const p=JSON.parse(Buffer.concat(pieces).toString('utf8'));
  const env={...process.env,GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_LITERAL_PATHSPECS:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_ATTR_NOSYSTEM:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_EXEC_PATH:p.gitExec,GIT_TEMPLATE_DIR:p.templates,LC_ALL:'C'};
  const settings=[['core.fsmonitor','false'],['core.hooksPath',p.emptyHooks],['core.attributesFile','/dev/null'],['core.excludesFile','/dev/null'],['commit.gpgsign','false'],['tag.gpgsign','false'],['gpg.program','/dev/null'],['gpg.ssh.program','/dev/null'],['diff.external',''],['diff.trustExitCode','false'],['pager.branch','false'],['core.pager','cat'],['core.sshCommand','/dev/null'],['credential.helper',''],['protocol.allow','never'],['maintenance.auto','false'],['gc.auto','0'],...p.configuration];
  const base=settings.flatMap(([k,v])=>['-c',k+'='+v]);
  const config=spawnSync(p.git,[...base,'config','--null','--name-only','--get-regexp','^filter[.].*[.](clean|smudge|process|required)$'],{env,encoding:'utf8',maxBuffer:1048576,timeout:10000});
  if(config.error || (config.status!==0 && config.status!==1))process.exit(125);
  const drivers=[...new Set(config.stdout.split('\\0').filter(Boolean).map(k=>k.slice(0,k.lastIndexOf('.'))))];
  if(drivers.length>256)process.exit(125);
  for(const driver of drivers)for(const item of ['clean','smudge','process','required'])base.push('-c',driver+'.'+item+'='+(item==='required'?'false':''));
  const answer=spawnSync(p.git,[...base,...p.args],{env,input:Buffer.from(p.input,'base64'),maxBuffer:16777216,timeout:p.timeout,encoding:'buffer'});
  if(answer.stdout)process.stdout.write(answer.stdout);
  process.exitCode=answer.error?125:(answer.status??125);
 }catch{process.exitCode=125}
});`;

function runtimePaths() {
  const configured = require('../runtime.cjs').get();
  const root = configured?.node ? path.dirname(path.dirname(path.dirname(configured.node))) : path.resolve(__dirname, '../../.runtime', `${process.platform}-${process.arch}`);
  return { root, node: path.join(root, 'node/bin/node'), git: path.join(root, 'git/bin/git'), gitExec: path.join(root, 'git/libexec/git-core'), templates: path.join(root, 'git/share/git-core/templates') };
}
function current(assertCurrent) { if (typeof assertCurrent !== 'function' || assertCurrent() !== true) throw fail('PRIVACY_STALE'); }
async function runIsolatedGit(root, args, input, configuration = [], { assertCurrent, timeout = 30000 } = {}) {
  current(assertCurrent);
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0')) || !Array.isArray(configuration) || configuration.some(entry => !Array.isArray(entry) || entry.length !== 2 || entry.some(value => typeof value !== 'string' || value.includes('\0')))) throw fail();
  // Only the authenticated publishing adapter uses environment configuration;
  // network Git has no route in a protected host invocation. Do not admit a
  // caller override of hooks/filters/runtime/credentials into this boundary.
  if (configuration.length) throw fail();
  const payload = Buffer.from(input || ''); if (payload.length > MAX) throw fail();
  root = await fs.realpath(root);
  // Linked worktrees/submodules can point to an arbitrary external Git dir.
  // Their metadata must not silently enlarge the protected file boundary.
  try { const stat = await fs.lstat(path.join(root, '.git')); if (!stat.isDirectory() || stat.isSymbolicLink()) throw fail(); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const runtime = runtimePaths();
  for (const file of [runtime.node, runtime.git]) { const stat = await fs.lstat(file); if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111) || stat.mode & 0o022 || await fs.realpath(file) !== file) throw fail(); }
  const stateRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-private-git-')));
  let lease, child, settled = false, timer;
  try {
    lease = await require('../../privacy/isolation/engine-isolation.cjs').createOfflineProcessIsolation({ workspaceRoot: root, stateRoot, runtimeRoot: runtime.root, allowExistingWorkspaceMode: true, allowedExecutables: [runtime.node, runtime.git] });
    const spec = await lease.launchSpec(runtime.node, ['-e', WORKER], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    current(assertCurrent);
    child = spawn(spec.file, spec.args, spec.options);
    const completion = new Promise((resolve, reject) => {
      const chunks = []; let total = 0;
      child.stdout.on('data', chunk => { total += chunk.length; if (total > MAX) { child.kill('SIGKILL'); reject(fail()); } else chunks.push(chunk); });
      // Never include hook output, filenames, credentials or repository error
      // text in a thrown error. The complete process is retired in finally.
      child.stderr.resume(); child.stdin.on('error', () => {});
      child.once('error', () => { settled = true; reject(fail()); });
      child.once('close', code => { settled = true; if (code !== 0) reject(Object.assign(fail(), code === 125 || code === null ? {} : { gitExitCode: code })); else resolve(Buffer.concat(chunks)); });
    });
    completion.catch(() => {});
    timer = setTimeout(() => { child.kill('SIGKILL'); }, timeout + 15000); timer.unref?.();
    await lease.attest(); current(assertCurrent);
    child.stdin.end(JSON.stringify({ ...runtime, emptyHooks: path.join(stateRoot, 'disabled-hooks'), args, input: payload.toString('base64'), configuration, timeout }));
    const result = await completion; current(assertCurrent); return result;
  } finally {
    clearTimeout(timer);
    if (child && !settled) child.kill('SIGKILL');
    if (lease) await lease.dispose();
    await fs.rm(stateRoot, { recursive: true, force: true });
  }
}
module.exports = { runIsolatedGit, runtimePaths };
