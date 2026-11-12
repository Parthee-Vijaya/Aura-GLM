// Read activation at execution time, after OpenCode has received permission.
// A command prepared while waiting must not bypass a newly activated sandbox.
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const [activationPath, token, policyPath, payload] = process.argv.slice(2);
  const state = JSON.parse(await fs.readFile(activationPath, 'utf8'));
  if (state.token !== token || typeof state.enabled !== 'boolean') throw Error('Kommandobeskyttelsen er ændret.');
  const input = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (typeof input.command !== 'string' || input.command.length > 200000) throw Error('Ugyldig kommando.');
  const executable = process.execPath;
  const args = [path.join(__dirname, 'command-sandbox-runner.mjs'), ...(state.enabled ? [] : ['--approved']), policyPath, payload];
  // Replace the dispatcher, keeping the shell-owned PID. A Stop/timeout or
  // SIGKILL cannot leave a detached runner behind between two owner processes.
  if (typeof process.execve !== 'function') throw Error('Kommandokørsel kræver den medfølgende Node-runtime.');
  process.execve(executable, [executable, ...args], process.env);
})().catch(error => { process.stderr.write('Kommandoen blev afvist: ' + error.message + '\n'); process.exitCode = 1; });
