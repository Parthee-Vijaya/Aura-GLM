// A private IPC lease ties the command guardian to this runner. The guardian
// is detached so timeout/Stop/SIGKILL of the runner cannot strand descendants.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const guardian = fileURLToPath(new URL('./command-sandbox-guardian.mjs', import.meta.url));
const checking = process.argv[2] === '--check';
const child = spawn(process.execPath, [guardian, ...process.argv.slice(2)], {
  env: process.env, detached: !checking, stdio: checking ? 'inherit' : ['inherit', 'inherit', 'inherit', 'ipc']
});
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  if (child.connected) child.disconnect();
});
child.once('error', () => { process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
