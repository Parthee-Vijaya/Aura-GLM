// SPDX-License-Identifier: EUPL-1.2
// Sidebar entries added for parity with the reference app. "Skills og
// udvidelser" opens the existing Funktioner section through its own button, so
// the busy/disabled rules of that button keep applying.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ui = path.join(__dirname, '..', 'ui');
const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8').replace(/\n/g, ' ');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');

test('"Skills og udvidelser" is a navigation row with icon and text', () => {
  const row = /<nav>[\s\S]*?(<button type="button" id="extensions-open"[^>]*>[\s\S]*?<\/button>)[\s\S]*?<\/nav>/.exec(index);
  assert.ok(row, 'the row stands in the sidebar nav');
  assert.match(row[1], /title="Skills og udvidelser"/);
  assert.match(row[1], /<span aria-hidden="true"><svg/);
  assert.match(row[1], /<span class="nav-text">Skills og udvidelser<\/span>/);
});

test('the row opens the existing Funktioner section through its button', () => {
  assert.match(app, /\$\('#extensions-open'\)\.onclick = \(\) => \$\('#features-button'\)\.click\(\);/);
});
