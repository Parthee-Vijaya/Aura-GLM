// Trevejsfletning af tekstfiler til Fortryd. Fortryd fjerner en ændring (fra base til efter) og bevarer det, der er
// ændret siden: base er filen lige efter ændringen, ours er filen nu, og theirs er filen før ændringen. Ændringer, der
// ikke rører de samme linjer, flettes. Rører de samme linjer, er det en konflikt, som brugeren afgør; Aura gætter ikke.
// Linjerne beholder deres linjeskift, så resultatet er byte for byte det samme som kilderne, hvor intet er ændret.
const { editScript } = require('./diff.cjs');

const lines = text => text ? text.match(/[^\n]*\n|[^\n]+$/g) || [] : [];
// Ændringer fra base til en anden tekst som afsnit: base-linjerne [start, end) erstattes af lines.
function hunks(base, other) {
  const { steps } = editScript(base, other);
  const out = []; let current = null, position = 0;
  for (const step of steps) {
    if (step[0] === '=') { if (current) { out.push(current); current = null; } position = step[1] + 1; continue; }
    if (!current) current = { start: position, end: position, lines: [] };
    if (step[0] === '-') { current.end = step[1] + 1; position = step[1] + 1; }
    else current.lines.push(other[step[1]]);
  }
  if (current) out.push(current);
  return out;
}
const same = (a, b) => a.length === b.length && a.every((line, i) => line === b[i]);
// Afsnittene i et område anvendt på base-linjerne i området.
function apply(base, list, start, end) {
  const out = []; let at = start;
  for (const hunk of list) { out.push(...base.slice(at, hunk.start), ...hunk.lines); at = hunk.end; }
  out.push(...base.slice(at, end));
  return out;
}
function merge3(baseText, oursText, theirsText) {
  const base = lines(baseText), ours = lines(oursText), theirs = lines(theirsText);
  const all = [...hunks(base, ours).map(h => ({ ...h, side: 'ours' })), ...hunks(base, theirs).map(h => ({ ...h, side: 'theirs' }))]
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const segments = []; let at = 0, i = 0;
  // Overlap: områderne deler en linje, eller begge indsætter på samme sted.
  const touches = (region, hunk) => hunk.start < region.end || (hunk.start === region.start && hunk.start === hunk.end && region.start === region.end) || (hunk.start === region.end && hunk.start === hunk.end && region.empty);
  while (i < all.length) {
    const region = { start: all[i].start, end: all[i].end, empty: all[i].start === all[i].end, list: [all[i]] }; i++;
    while (i < all.length && touches(region, all[i])) { region.end = Math.max(region.end, all[i].end); region.empty = region.empty && all[i].start === all[i].end; region.list.push(all[i]); i++; }
    if (region.start > at) segments.push({ type: 'same', lines: base.slice(at, region.start) });
    const mine = region.list.filter(h => h.side === 'ours'), old = region.list.filter(h => h.side === 'theirs');
    const oursLines = apply(base, mine, region.start, region.end), theirsLines = apply(base, old, region.start, region.end);
    if (!mine.length) segments.push({ type: 'theirs', lines: theirsLines });
    else if (!old.length || same(oursLines, theirsLines)) segments.push({ type: 'ours', lines: oursLines });
    else segments.push({ type: 'conflict', base: base.slice(region.start, region.end), ours: oursLines, theirs: theirsLines, line: region.start + 1 });
    at = region.end;
  }
  if (at < base.length) segments.push({ type: 'same', lines: base.slice(at) });
  const conflicts = segments.filter(s => s.type === 'conflict');
  return { segments, conflicts: conflicts.length, clean: !conflicts.length };
}
// Den flettede tekst. Ved konflikter vælger brugeren for hele filen: 'ours' (dine linjer) eller 'theirs' (før ændringen).
function resolve(merge, choice = 'ours') {
  return merge.segments.map(s => s.type === 'conflict' ? (choice === 'theirs' ? s.theirs : s.ours) : s.lines).flat().join('');
}
module.exports = { merge3, resolve, lines };
