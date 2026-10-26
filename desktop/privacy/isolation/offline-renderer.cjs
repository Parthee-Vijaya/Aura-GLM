// SPDX-License-Identifier: EUPL-1.2
// Protected static inspection: immutable private snapshot -> separate native
// Electron sandbox -> verified zero-live-process barrier -> bounded report.
// No generated JavaScript runs in Aura's main process or shared preview session.
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { constants } = require('node:fs');
const { createOfflineRendererIsolation } = require('./engine-isolation.cjs');
const run = promisify(execFile);
const inside = (root, file) => file.startsWith(root + path.sep);
const unavailable = reason => ({ status: 'unavailable', reason, findings: [], scope: 'static-os-isolated-smoke' });

async function readBounded(file, maxBytes) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const stat = await handle.stat(); if (!stat.isFile() || stat.size > maxBytes || stat.nlink !== 1) throw Error('unsafe-output'); return await handle.readFile(); }
  finally { await handle.close(); }
}
async function electronRuntime(executable) {
  executable ||= process.versions.electron ? process.execPath : require('electron');
  executable = await fs.realpath(executable);
  const runtimeRoot = path.dirname(path.dirname(path.dirname(executable)));
  if (!runtimeRoot.endsWith('.app')) throw Error('electron-runtime-unavailable');
  const bundleId = (await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(runtimeRoot, 'Contents/Info.plist')], { timeout: 3000 })).stdout.trim();
  if (!/^[A-Za-z0-9.-]+$/.test(bundleId)) throw Error('invalid-electron-bundle');
  const worker = path.join(__dirname, 'offline-renderer-worker.cjs');
  const packaged = __dirname.includes('app.asar/');
  const trustedReadFiles = packaged ? [] : [worker, path.resolve(__dirname, '../../../package.json'), path.resolve(__dirname, '../../package.json'), ...['app-quality.cjs', 'project-files.cjs', 'git.cjs', 'protected-paths.cjs'].map(file => path.resolve(__dirname, '../../core', file))];
  return { executable, runtimeRoot, bundleId, trustedReadFiles, args: packaged ? ['--no-sandbox', '--aura-privacy-offline-renderer'] : ['--no-sandbox', worker] };
}

async function inspectProtectedApp({ root, signal, directory, electronExecutable, reaperPath }) {
  if (process.platform !== 'darwin') return unavailable('protected-renderer-platform-unavailable');
  if (signal?.aborted) return { ...unavailable('stopped'), status: 'cancelled' };
  let lease, child, stopTimer, runRoot, result, retired = false;
  let rejectStopped;
  const interrupted = new Promise((_resolve, reject) => { rejectStopped = reject; }); interrupted.catch(() => {});
  const abort = () => { rejectStopped(Error('stopped')); child?.stdin.destroy(); lease?.dispose().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const { snapshotApp, LIMITS } = require('../../core/app-quality.cjs');
    const snapshot = await snapshotApp(root, { signal });
    if (!snapshot) return { status: 'unsupported', reason: 'static-public-required', findings: [] };
    const runtime = await electronRuntime(electronExecutable);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    directory = await fs.realpath(directory);
    runRoot = await fs.mkdtemp(path.join(directory, 'protected-'));
    const snapshotRoot = path.join(runRoot, 'snapshot'), stateRoot = path.join(runRoot, 'state');
    for (const folder of [snapshotRoot, stateRoot]) await fs.mkdir(folder, { mode: 0o700 });
    for (const [name, asset] of snapshot.assets) {
      const target = path.join(snapshotRoot, 'public', name);
      if (!inside(path.join(snapshotRoot, 'public'), target)) throw Error('invalid-snapshot-name');
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, asset.data, { mode: 0o400, flag: 'wx' });
    }
    lease = await createOfflineRendererIsolation({ workspaceRoot: snapshotRoot, stateRoot, runtimeRoot: runtime.runtimeRoot, trustedReadFiles: runtime.trustedReadFiles, bundleId: runtime.bundleId, ...(reaperPath ? { reaperPath } : {}) });
    if (signal?.aborted) throw Error('stopped');
    const spec = await lease.launchSpec(runtime.executable, runtime.args, { stdio: ['pipe', 'ignore', 'ignore'] });
    child = spawn(spec.file, spec.args, spec.options);
    child.stdin.on('error', () => {});
    const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => code === 0 ? resolve() : reject(Error('renderer-failed'))); });
    completed.catch(() => {});
    stopTimer = setTimeout(abort, LIMITS.milliseconds + 15000);
    await lease.attest();
    if (signal?.aborted) throw Error('stopped');
    child.stdin.end(JSON.stringify({ action: 'inspect-attested', root: snapshotRoot, state: stateRoot }) + '\n');
    await Promise.race([completed, interrupted]);
    const stopped = await lease.dispose();
    if (!stopped.writersStopped || stopped.matchingProcesses !== 0) throw Error('renderer-not-retired');
    retired = true;
    if (signal?.aborted) throw Error('stopped');
    const report = JSON.parse((await readBounded(path.join(stateRoot, 'result.json'), 1024 * 1024)).toString('utf8'));
    if (!['checked', 'unsupported', 'unavailable', 'cancelled'].includes(report.status) || !Array.isArray(report.findings) || report.findings.length > 30 || (report.fingerprint && report.fingerprint !== snapshot.fingerprint)) throw Error('invalid-renderer-report');
    // Only fixed screenshot names leave the retired child workspace. Original
    // source/state paths and any untrusted page prose are never a model result.
    const screenshots = [];
    for (const source of report.screenshots || []) {
      if (typeof source !== 'string' || !inside(path.join(stateRoot, 'reports'), source) || !['desktop.png', 'mobile.png'].includes(path.basename(source)) || await fs.realpath(source) !== source) throw Error('invalid-renderer-image');
      const data = await readBounded(source, 16 * 1024 * 1024);
      if (!data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error('invalid-renderer-image');
      const target = path.join(runRoot, path.basename(source)); await fs.writeFile(target, data, { mode: 0o600, flag: 'wx' }); screenshots.push(target);
    }
    result = { ...report, screenshots, scope: 'static-os-isolated-smoke', isolation: { network: 'none', source: 'private-readonly-snapshot', writersStopped: true, matchingProcesses: 0 } };
    await fs.writeFile(path.join(runRoot, 'report.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    // This copy contains only generated, run-owned inspection inputs. Keep the
    // local report/screenshots; never touch the source project or user data.
    await fs.rm(snapshotRoot, { recursive: true, force: true }); await fs.rm(stateRoot, { recursive: true, force: true });
    return result;
  } catch { return signal?.aborted ? { ...unavailable('protected-inspection-stopped'), status: 'cancelled' } : unavailable('protected-inspection-unavailable'); }
  finally {
    clearTimeout(stopTimer); signal?.removeEventListener('abort', abort);
    // Failure to retire retains the private evidence directory and never
    // publishes a successful result or reuses its unique workspace.
    if (lease && !retired) { const ack = await lease.dispose().catch(() => null); retired = ack?.writersStopped === true && ack.matchingProcesses === 0; }
    if (runRoot && !result && (!lease || retired)) await fs.rm(runRoot, { recursive: true, force: true }).catch(() => {});
  }
}
module.exports = { inspectProtectedApp, electronRuntime, readBounded };
