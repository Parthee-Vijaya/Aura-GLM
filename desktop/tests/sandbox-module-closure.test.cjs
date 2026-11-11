// SPDX-License-Identifier: EUPL-1.2
// The protected quality check runs in an OS sandbox that may read only a
// short list of core modules (privacy/isolation/offline-renderer.cjs). If one
// of them starts loading another module at the top level, the sandboxed
// process can no longer start. macOS CI caught exactly that; this guard makes
// the rule visible on every platform.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const desktop = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(desktop, file), 'utf8');

test('modules the sandboxed renderer may read load only each other at the top level', () => {
  const list = /\.\.\.\[([^\]]+)\]\.map\(file => path\.resolve\(__dirname, '\.\.\/\.\.\/core', file\)\)/.exec(read('privacy/isolation/offline-renderer.cjs'));
  assert.ok(list, 'the trusted core list is found in offline-renderer.cjs');
  const trusted = [...list[1].matchAll(/'([a-z0-9-]+\.cjs)'/g)].map(match => match[1]);
  assert.ok(trusted.includes('project-files.cjs') && trusted.includes('app-quality.cjs'));
  const offenders = [];
  for (const file of trusted) {
    for (const line of read('core/' + file).split('\n')) {
      // Top-level declarations start in column 0; requires inside functions are loaded on demand.
      if (!/^(const|let|var) /.test(line)) continue;
      for (const match of line.matchAll(/require\('\.\/([a-z0-9-]+\.cjs)'\)/g)) if (!trusted.includes(match[1])) offenders.push(`${file} → ${match[1]}`);
    }
  }
  assert.deepEqual(offenders, [], 'load other modules inside the function that needs them');
});
