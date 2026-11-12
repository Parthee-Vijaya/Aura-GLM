// Betroet, separat proces pr. kommando: SRTs globale indstillinger deles aldrig mellem projekter.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import isolation from '../privacy/isolation/engine-isolation.cjs';
import { SandboxManager } from '@anthropic-ai/sandbox-runtime';
import policyBoundary from './command-sandbox-policy.cjs';
const contains = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
let child, controlRoot, stopping = false, retirement;
// macOS Unix sockets have a short path limit. SRT's host proxy needs a
// private, short directory; user commands still receive policy.env.TMPDIR.
const hostTemporaryRoot = '/private/tmp';
const reaper = path.join(path.dirname(path.dirname(path.dirname(process.execPath))), 'privacy', 'aura-scope-reaper');
const run = (file, args) => new Promise((resolve, reject) => {
  const process = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; process.stdout.on('data', data => { output += data; });
  process.stderr.resume(); process.once('error', reject);
  // exit may precede the final stdout chunk on a loaded CI host. close is
  // the barrier for both process completion and a fully drained JSON reply.
  process.once('close', code => {
    try { if (code !== 0) throw Error('Procesafslutningen kunne ikke bekræftes.'); resolve(JSON.parse(output)); }
    catch { reject(Error('Procesafslutningen kunne ikke bekræftes.')); }
  });
});
async function retire() {
  if (retirement) return retirement;
  stopping = true;
  retirement = (async () => {
    if (!controlRoot) return;
    const result = await run(reaper, ['--stop', path.join(controlRoot, 'scope'), path.join(controlRoot, 'control')]);
    if (result.writersStopped !== true || result.matchingProcesses !== 0) throw Error('Kommandoens underprocesser kunne ikke stoppes sikkert.');
    await fs.rm(controlRoot, { recursive: true, force: true });
  })();
  return retirement;
}
// The detached host guardian survives a killed runner. Its private IPC pipe
// closes on SIGKILL/timeout/owner exit, including during asynchronous startup.
for (const event of ['disconnect', 'SIGTERM', 'SIGINT']) process.on(event, () => { stopping = true; if (child) retire().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; }); });

try {
  if (process.platform !== 'darwin') throw new Error('Teknisk isolation af kommandoer understøttes ikke på denne platform.');
  if (process.argv[2] === '--check') {
    await isolation.verifyHostHelper(reaper);
    const result = await SandboxManager.checkDependenciesAsync();
    if (process.platform === 'darwin') await fs.access('/usr/bin/sandbox-exec');
    process.stdout.write(JSON.stringify(result));
  } else {
    if (!process.connected) throw Error('Kommandoen mangler sin overvågede ejer.');
    await isolation.verifyHostHelper(reaper);
    const approved = process.argv[2] === '--approved';
    const offset = approved ? 1 : 0;
    const policy = await policyBoundary.readPolicy(process.argv[2 + offset]);
    const input = policyBoundary.parseCommand(process.argv[3 + offset]);
    const cwd = await fs.realpath(input.cwd);
    if (!approved && ![policy.workspaceRoot, policy.scratchRoot].some(root => contains(root, cwd))) throw new Error('Arbejdsområdet er ændret. Kommandoen blev afvist.');
    // Ingen modelnøgler, motorindstillinger, proxyadgang eller brugerens shellopsætning arves.
    if (!approved) {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, policy.env);
    }
    process.chdir(cwd);
    policyBoundary.validatePolicy(policy);
    const approvedEnvironment = { ...process.env };
    controlRoot = await fs.realpath(await fs.mkdtemp(path.join(hostTemporaryRoot, 'aura-command-scope-')));
    process.env.TMPDIR = controlRoot;
    const scope = path.join(controlRoot, 'scope'), control = path.join(controlRoot, 'control');
    await fs.writeFile(scope, 'Aura command scope\n', { mode: 0o400 });
    await fs.writeFile(control, 'Aura command control\n', { mode: 0o400 });
    // Only this command can read scope and cannot read control. Both decisions
    // are inherited across setsid, double forks and reparenting.
    const config = structuredClone(policy.config);
    config.filesystem.allowRead.push({ path: scope, literal: true });
    config.filesystem.denyRead.push(control);
    config.filesystem.denyWrite.push(controlRoot);
    if (!approved) await SandboxManager.initialize(config, undefined, false);
    if (!approved && !SandboxManager.isSandboxingEnabled()) throw new Error('Kommandobeskyttelsen er ikke aktiv.');
    // SRT sætter normalt en fælles TMPDIR. Den overskrives inden brugerens kommando og er ikke skrivbar i vores profil.
    const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
    // Node/npm må ikke behøve DNS-opslag af localhost for at nå den lokale proxy. Selve værtsnavnene
    // udenfor isolationen opløses fortsat af SRT, efter den præcise domæneliste er kontrolleret.
    const proxies = 'for aura_proxy_name in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do aura_proxy_value="${!aura_proxy_name}"; case "$aura_proxy_value" in *localhost:*) aura_proxy_value="${aura_proxy_value%localhost:*}127.0.0.1:${aura_proxy_value##*:}";; esac; export "$aura_proxy_name=$aura_proxy_value"; done; unset aura_proxy_name aura_proxy_value; ';
    const command = `IFS= read -r aura_gate <&3 || exit 125; exec 3<&-; unset aura_gate; export TMPDIR=${quote(policy.env.TMPDIR)} TMP=${quote(policy.env.TMP)} TEMP=${quote(policy.env.TEMP)}; ${proxies}${input.command}`;
    // An explicitly approved ordinary command retains its existing filesystem
    // and environment authority. Only the host-owned lifetime markers are sealed.
    const approvedProfile = '(version 1)(allow default)(deny file-read-data (literal ' + JSON.stringify(control) + '))(deny file-write* (subpath ' + JSON.stringify(controlRoot) + '))';
    const wrapped = approved
      ? { argv: ['/usr/bin/sandbox-exec', '-p', approvedProfile, '/bin/bash', '-c', 'IFS= read -r aura_gate <&3 || exit 125; exec 3<&-; unset aura_gate; ' + input.command], env: approvedEnvironment }
      : await SandboxManager.wrapWithSandboxArgv(command, '/bin/bash', undefined, undefined, cwd);
    if (stopping || !process.connected) throw Error('Kommandoen blev stoppet før start.');
    // Hold the trusted gate on a private pipe before user code. Attest the actual inherited
    // scope, then release it. No command starts in an unverified scope.
    child = spawn(wrapped.argv[0], wrapped.argv.slice(1), { cwd, env: wrapped.env, stdio: ['inherit', 'inherit', 'inherit', 'pipe'], detached: true });
    const finished = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
    finished.catch(() => {});
    child.stdio[3].on('error', () => { stopping = true; retire().catch(() => { process.exitCode = 1; }); });
    let attested = false;
    for (let attempt = 0; attempt < 50 && !stopping; attempt++) {
      const count = await run(reaper, ['--count', scope, control]);
      if (count.matchingProcesses > 0) { attested = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    if (!attested || stopping || !process.connected) throw Error('Kommandoens procesafgrænsning kunne ikke bekræftes.');
    child.stdio[3].end('\n');
    process.exitCode = await finished;
    await retire();
    if (process.exitCode && !approved) process.stderr.write('\nKommandoen fejlede under teknisk isolation. Adgang er afgrænset til projektet, opgavens midlertidige mappe og de aftalte pakkeregistre.\n');
  }
} catch (error) { process.stderr.write('Kommandoen blev ikke kørt uden beskyttelse: ' + error.message + '\n'); process.exitCode = 1; }
finally { await retire().catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; }); await SandboxManager.reset(); if (process.connected) process.disconnect(); }
