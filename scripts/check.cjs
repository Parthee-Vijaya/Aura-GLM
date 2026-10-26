// One local entry point, with explicit paths rather than shell globs on Windows.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const groups = ['desktop/tests', 'cli/tests', 'evals/openenv'];
try {
  const files = groups.flatMap(directory => {
    const names = fs.readdirSync(path.join(root, directory), { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.test.cjs'))
      .map(entry => path.join(root, directory, entry.name)).sort();
    if (!names.length) throw new Error(`Ingen tests fundet i ${directory}.`);
    return names;
  });
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? (result.signal === 'SIGINT' ? 130 : 1);
} catch (error) {
  console.error(`Lokal kontrol kunne ikke gennemføres: ${error.message}`);
  process.exitCode = 1;
}
