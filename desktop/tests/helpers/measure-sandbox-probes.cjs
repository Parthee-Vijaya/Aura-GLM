// Opt-in local measurement, matching command-support-baseline.json's sample order.
// This performs dependency checks only; it runs no project command or model call.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { performance } = require('node:perf_hooks');
const sandbox = require('../../core/command-sandbox.cjs');
const run = promisify(execFile), round = value => Number(value.toFixed(3));
async function measure(count, action) {
  const samples = [];
  for (let index = 0; index < count; index++) { const start = performance.now(); await action(); samples.push(performance.now() - start); }
  const ordered = [...samples].sort((a, b) => a - b), middle = Math.floor(count / 2);
  return { n: count, min: round(ordered[0]), median: round(count % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2), p95: round(ordered[Math.ceil(count * 0.95) - 1]), max: round(ordered.at(-1)), samples_ms: samples.map(round) };
}
async function main() {
  const output = process.argv[2]; if (!output) throw new Error('Provide a new local JSON report path.');
  const started = performance.now(), first = await sandbox.support();
  const report = { platform: process.platform, arch: process.arch, node: process.version, kind: 'read-only-local-dependency-checks', firstSupport: { available: first.available, ms: round(performance.now() - started), warnings: first.warnings }, allSubsequentAvailable: true };
  const node = await sandbox.nodePath();
  const desktop = path.resolve(__dirname, '../..'), runner = path.join(desktop, 'core/command-sandbox-runner.mjs');
  const packageRoot = path.join(desktop, 'node_modules/@anthropic-ai/sandbox-runtime');
  const metadataFiles = [node, runner, path.join(packageRoot, 'package.json'), path.join(packageRoot, 'dist/sandbox/sandbox-manager.js'), '/usr/bin/sandbox-exec'];
  const checked = async () => { const status = await sandbox.support(); if (!status.available) report.allSubsequentAvailable = false; };
  report.nodePath = await measure(20, () => sandbox.nodePath());
  report.support = await measure(20, checked);
  report.runnerOnly = await measure(20, async () => { const result = await run(node, [runner, '--check'], { timeout: 20000, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin', LANG: 'en_US.UTF-8' } }); if (JSON.parse(result.stdout).errors.length) report.allSubsequentAvailable = false; });
  report.identityMetadata = await measure(100, () => Promise.all(metadataFiles.map(file => fs.stat(file, { bigint: true }))));
  report.runnerDigest = await measure(100, async () => crypto.createHash('sha256').update(await fs.readFile(runner)).digest('hex'));
  report.duplicatePrepareChecks = await measure(10, async () => { await checked(); await checked(); await sandbox.nodePath(); });
  await fs.writeFile(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ output, firstSupport: report.firstSupport, available: report.allSubsequentAvailable, medians_ms: Object.fromEntries(Object.entries(report).filter(([, value]) => value?.n).map(([key, value]) => [key, value.median])) }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
