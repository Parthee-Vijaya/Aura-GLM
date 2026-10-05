const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lineDiff, lineStats, splitLines } = require('../core/diff.cjs');

const lines = (n, prefix = 'linje') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join('\n') + '\n';
// Uden afgrænsning skal rækkerne kunne genskabe både den gamle og den nye fil.
function rebuild(before, after) {
  const diff = lineDiff(before, after, { context: Infinity, maxLines: Infinity });
  const rows = diff.hunks.flatMap(hunk => hunk.lines);
  return { diff, old: rows.filter(row => row.type !== '+').map(row => row.text), new: rows.filter(row => row.type !== '-').map(row => row.text) };
}

test('én ændret linje giver én hunk med tre linjers kontekst og rigtige linjenumre', () => {
  const before = lines(20), after = before.replace('linje 10\n', 'linje ti\n');
  const diff = lineDiff(before, after);
  assert.equal(diff.added, 1); assert.equal(diff.removed, 1); assert.equal(diff.hunks.length, 1);
  const [hunk] = diff.hunks;
  assert.equal(hunk.oldStart, 7); assert.equal(hunk.newStart, 7); assert.equal(hunk.skippedBefore, 6); assert.equal(diff.skippedAfter, 7);
  assert.deepEqual(hunk.lines.map(row => row.type).join(''), '   -+   ');
  assert.deepEqual(hunk.lines.find(row => row.type === '-'), { type: '-', old: 10, new: null, text: 'linje 10' });
  assert.deepEqual(hunk.lines.find(row => row.type === '+'), { type: '+', old: null, new: 10, text: 'linje ti' });
});

test('ny og slettet fil vises som tilføjede eller fjernede linjer', () => {
  const created = lineDiff(null, 'a\nb\n');
  assert.equal(created.added, 2); assert.equal(created.removed, 0);
  assert.deepEqual(created.hunks[0].lines.map(row => [row.type, row.new]), [['+', 1], ['+', 2]]);
  const deleted = lineDiff('a\nb\nc', null);
  assert.equal(deleted.removed, 3); assert.equal(deleted.added, 0);
});

test('ændringer langt fra hinanden giver to hunks; tætte ændringer slås sammen', () => {
  const before = lines(40);
  const far = lineDiff(before, before.replace('linje 5\n', 'x\n').replace('linje 35\n', 'y\n'));
  assert.equal(far.hunks.length, 2); assert.equal(far.hunks[1].skippedBefore, 23);
  const near = lineDiff(before, before.replace('linje 5\n', 'x\n').replace('linje 10\n', 'y\n'));
  assert.equal(near.hunks.length, 1);
});

test('CRLF og et manglende linjeskift til sidst', () => {
  assert.deepEqual(splitLines('a\r\nb\r\n'), ['a', 'b']);
  const diff = lineDiff('a\nb', 'a\nb\n');
  assert.equal(diff.hunks.length, 0, 'kun linjeskiftet i slutningen er forskelligt');
});

test('tilfældige rettelser kan altid genskabes fra rækkerne', () => {
  let seed = 7; const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 200; round++) {
    const base = Array.from({ length: 1 + Math.floor(random() * 30) }, () => String.fromCharCode(97 + Math.floor(random() * 5)));
    const next = [...base];
    for (let edits = Math.floor(random() * 6); edits > 0; edits--) {
      const at = Math.floor(random() * (next.length + 1)), kind = random();
      if (kind < 0.33 && next.length) next.splice(at, 1); else if (kind < 0.66) next.splice(at, 0, String.fromCharCode(97 + Math.floor(random() * 5))); else if (next.length) next[Math.min(at, next.length - 1)] = 'z';
    }
    const { diff, old, new: updated } = rebuild(base.join('\n'), next.join('\n'));
    if (!diff.hunks.length) { assert.deepEqual(next, base); continue; }
    assert.deepEqual(old, base); assert.deepEqual(updated, next);
    assert.equal(diff.added - diff.removed, next.length - base.length);
  }
});

test('en fuld omskrivning af en stor fil bliver vist som fjernet og tilføjet uden at gå i stå', () => {
  const before = lines(3000, 'gammel'), after = lines(3000, 'ny');
  const started = Date.now();
  const { diff, old, new: updated } = rebuild(before, after);
  assert.ok(Date.now() - started < 5000);
  assert.equal(diff.approximate, true); assert.equal(diff.removed, 3000); assert.equal(diff.added, 3000);
  assert.equal(old.length, 3000); assert.equal(updated.length, 3000);
  assert.deepEqual(lineStats(before, before + 'ekstra\n'), { added: 1, removed: 0, approximate: false });
});

test('lange diffs afkortes og siger det', () => {
  const diff = lineDiff(null, lines(5000), { maxLines: 100 });
  assert.equal(diff.truncated, true); assert.equal(diff.hunks.reduce((n, h) => n + h.lines.length, 0), 100); assert.equal(diff.added, 5000);
});
