const { test } = require('node:test');
const assert = require('node:assert/strict');
const { rows, renameLabel } = require('../ui/diff-review.js');

// Små stubs svarende til app.js' node/visuallyHidden/plural.
const node = (tag, text, className) => ({ tag, text, className, children: [], setAttribute(name, value) { this[name] = value; }, append(...more) { this.children.push(...more); } });
const visuallyHidden = text => ({ hidden: true, text });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

test('omdøbninger viser gammel og ny sti; uden omdøbning bare stien', () => {
  assert.equal(renameLabel({ file: 'lib/util.js', renamedFrom: 'old/util.js' }), 'old/util.js → lib/util.js');
  assert.equal(renameLabel({ file: 'a.js' }), 'a.js');
  assert.equal(renameLabel(undefined), '');
});

test('diff-rækkerne bygger gap, tegn og linjenumre uden at bruge innerHTML', () => {
  const detail = { hunks: [{ skippedBefore: 2, lines: [
    { type: ' ', text: 'uændret', old: 1, new: 1 },
    { type: '-', text: 'gammel', old: 2 },
    { type: '+', text: 'ny', new: 2 }
  ] }], skippedAfter: 3 };
  const rendered = rows(detail, { node, visuallyHidden, plural });
  assert.equal(rendered.length, 5);
  assert.equal(rendered[0].text, '⋯ 2 uændrede linjer');
  assert.equal(rendered[0].className, 'diff-gap');
  assert.equal(rendered[1].className, 'diff-row same');
  assert.equal(rendered[2].className, 'diff-row del');
  assert.equal(rendered[2].children[2].text, '−');
  assert.equal(rendered[2].children[3].children[0].text, 'Fjernet: ');
  assert.equal(rendered[3].children[3].children[1], 'ny');
  assert.equal(rendered[4].text, '⋯ 3 uændrede linjer');
  assert.deepEqual(rows({ hunks: [] }, { node, visuallyHidden, plural }), [], 'en tom diff giver ingen rækker');
  assert.deepEqual(rows({}, { node, visuallyHidden, plural }), [], 'manglende hunks er en tom diff, ikke en fejl');
});
