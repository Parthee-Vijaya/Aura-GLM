// Read activation at execution time, after OpenCode has received permission.
// A command prepared while waiting must not bypass a newly activated sandbox.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
(async () => {
  const [activationPath, token, policyPath, payload] = process.argv.slice(2);
  const state = JSON.parse(await fs.readFile(activationPath, 'utf8'));
  if (state.token !== token || typeof state.enabled !== 'boolean') throw Error('Kommandobeskyttelsen er ændret.');
  const input = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (typeof input.command !== 'string' || input.command.length > 200000) throw Error('Ugyldig kommando.');
  const executable = state.enabled ? process.execPath : '/bin/bash';
  const args = state.enabled ? [path.join(__dirname, 'command-sandbox-runner.mjs'), policyPath, payload] : ['-c', input.command];
  const child = spawn(executable, args, { cwd: input.cwd, stdio: 'inherit', detached: true });
  const stop = signal => { if (child.pid) try { process.kill(-child.pid, signal); } catch {} };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(signal));
  process.exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => resolve(code ?? 1)); });
  stop('SIGKILL');
})().catch(error => { process.stderr.write('Kommandoen blev afvist: ' + error.message + '\n'); process.exitCode = 1; });
