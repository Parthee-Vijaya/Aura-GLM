const fs = require('node:fs/promises');
const path = require('node:path');
const OMIT = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'references', '.venv', '.secrets']);
async function capture(root) {
  const files = new Map(); let bytes = 0, skipped = 0;
  async function visit(dir, depth) {
    if (depth > 12) { skipped++; return; }
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (OMIT.has(entry.name) || /(^\.env($|\.)|\.(pem|key|p12|pfx)$|credentials|secrets)/i.test(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(file, depth + 1);
      else if (entry.isFile()) {
        const size = (await fs.stat(file)).size;
        if (size > 500000 || files.size >= 1000 || bytes + size > 10_000_000) { skipped++; continue; }
        const data = await fs.readFile(file);
        if (data.includes(0)) { skipped++; continue; }
        files.set(path.relative(root, file), data.toString('utf8')); bytes += size;
      }
    }
  }
  await visit(root, 0); return { files, skipped };
}
async function changes(root, before) {
  if (!before) return { files: [], skipped: 0 };
  const after = await capture(root);
  return { skipped: before.skipped + after.skipped, files: [...new Set([...before.files.keys(), ...after.files.keys()])].filter(file => before.files.get(file) !== after.files.get(file)).map(file => ({ file, before: before.files.get(file) ?? null, after: after.files.get(file) ?? null })) };
}
module.exports = { capture, changes };
