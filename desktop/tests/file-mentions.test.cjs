// SPDX-License-Identifier: EUPL-1.2
// "@" in the composer suggests project files and adds the chosen one as a file
// reference (plan: desktop/docs/materialesystem-plan.md, phase 2). The mention
// is only a faster way into the existing reference chips: nothing is read or
// sent by typing, and the reviewed send path is unchanged.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = path.join(__dirname, '..', 'ui');
const mentions = require('../ui/file-mentions.js');

test('a mention starts at "@" after whitespace or at the start of the text', () => {
  assert.deepEqual(mentions.mentionAt('@ind', 4), { start: 0, end: 4, query: 'ind' });
  assert.deepEqual(mentions.mentionAt('se @src/ar', 10), { start: 3, end: 10, query: 'src/ar' });
  assert.deepEqual(mentions.mentionAt('se @', 4), { start: 3, end: 4, query: '' });
  assert.deepEqual(mentions.mentionAt('linje et\n@test', 14), { start: 9, end: 14, query: 'test' });
});

test('e-mail addresses and finished words are not mentions', () => {
  assert.equal(mentions.mentionAt('skriv til anna@fjordby.dk', 25), null);
  assert.equal(mentions.mentionAt('se @index.html nu', 17), null, 'the caret has left the token');
  assert.equal(mentions.mentionAt('ingen snabel-a', 14), null);
  assert.equal(mentions.mentionAt(null, 0), null);
});

test('a caret inside the token covers the whole token', () => {
  assert.deepEqual(mentions.mentionAt('se @index.html nu', 6), { start: 3, end: 14, query: 'index.html' });
});

test('ranking prefers file-name matches, then shallow paths, and caps the list', () => {
  const files = [{ path: 'docs/arrangementer.md' }, { path: 'src/arrangementer.js' }, { path: 'src/filter.js' }, { path: 'arkiv/gammel/arrangementer-2024.csv' }, { path: 'test/kalender.test.js' }, { path: 'README.md' }];
  assert.deepEqual(mentions.rank(files, 'arr'), ['src/arrangementer.js', 'docs/arrangementer.md', 'arkiv/gammel/arrangementer-2024.csv'], 'same depth: the shorter path first');
  assert.deepEqual(mentions.rank(files, 'SRC/'), ['src/filter.js', 'src/arrangementer.js'], 'a path query matches case-insensitively');
  assert.deepEqual(mentions.rank(files, 'findes-ikke'), []);
  assert.equal(mentions.rank(files, '')[0], 'README.md', 'an empty query lists the shallowest files first');
  const many = Array.from({ length: 30 }, (_, index) => ({ path: `src/fil-${index}.js` }));
  assert.equal(mentions.rank(many, 'fil').length, mentions.MAX_ROWS);
  assert.deepEqual(mentions.rank([{ path: '' }, null, { path: 42 }, 'a.txt'], ''), ['a.txt'], 'malformed entries are skipped');
});

test('choosing a file removes the typed token and leaves tidy spacing', () => {
  assert.deepEqual(mentions.strip('se @ind og ret', { start: 3, end: 7, query: 'ind' }), { text: 'se og ret', caret: 3 });
  assert.deepEqual(mentions.strip('@ind', { start: 0, end: 4, query: 'ind' }), { text: '', caret: 0 });
  assert.deepEqual(mentions.strip('@ind resten', { start: 0, end: 4, query: 'ind' }), { text: 'resten', caret: 0 });
  assert.deepEqual(mentions.strip('ret @ind', { start: 4, end: 8, query: 'ind' }), { text: 'ret ', caret: 4 });
});

test('the mention module is served, loaded and wired to the existing reference chips', () => {
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.match(index, /<script src="file-mentions\.js" defer><\/script>/);
  assert.ok(require('../core/ui-assets.cjs').FILES.includes('file-mentions.js'));
  const workspace = fs.readFileSync(path.join(ui, 'workspace.js'), 'utf8');
  assert.match(workspace, /function addReference\(ref\)/);
  assert.match(workspace, /window\.workspace = \{[^}]*addReference/, 'the mention uses the same entry point as the Kode tab');
  assert.match(workspace, /references\.length >= 10/, 'the ten-reference limit still applies');
  const source = fs.readFileSync(path.join(ui, 'file-mentions.js'), 'utf8');
  assert.match(source, /workspace\?\.addReference/);
  assert.doesNotMatch(source, /codeRead|harness\.send|\.send\(/, 'typing a mention reads no file content and sends nothing');
});
