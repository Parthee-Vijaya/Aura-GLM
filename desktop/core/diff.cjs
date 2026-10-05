// Linje-diff til fanen Ændringer. Myers' algoritme efter fælles start og slutning er skåret fra, så en lille
// rettelse i en stor fil er billig. Bliver forskellen meget stor, vises filen som fjernet og tilføjet i sin helhed;
// det er stadig korrekt, blot ikke den korteste beskrivelse.
const MAX_EDITS = 2000;

function splitLines(text) {
  if (text === null || text === undefined) return [];
  const lines = String(text).split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines.map(line => line.endsWith('\r') ? line.slice(0, -1) : line);
}

// Returnerer redigeringstrin som ['=', i, j], ['-', i] eller ['+', j] i rækkefølge, eller null over grænsen.
function myers(a, b, limit = MAX_EDITS) {
  const n = a.length, m = b.length, max = n + m;
  if (!max) return [];
  const offset = max + 1, v = new Int32Array(2 * max + 3), trace = [];
  let found = -1;
  for (let d = 0; d <= max && d <= limit; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v[offset + k] = x;
      if (x >= n && y >= m) { found = d; break; }
    }
    if (found >= 0) break;
  }
  if (found < 0) return null;
  const steps = [];
  let x = n, y = m;
  for (let d = found; d >= 0; d--) {
    const window = trace[d], at = k => window[k + d + 1];
    const k = x - y;
    const previous = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const px = at(previous), py = px - previous;
    while (x > px && y > py) { steps.push(['=', x - 1, y - 1]); x--; y--; }
    if (d > 0) { if (x === px) steps.push(['+', y - 1]); else steps.push(['-', x - 1]); }
    x = px; y = py;
  }
  return steps.reverse();
}

function editScript(a, b) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length, endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB--; }
  const middle = myers(a.slice(start, endA), b.slice(start, endB));
  const steps = [];
  for (let i = 0; i < start; i++) steps.push(['=', i, i]);
  let approximate = false;
  if (middle) for (const [type, i, j] of middle) steps.push(type === '=' ? ['=', i + start, j + start] : type === '-' ? ['-', i + start] : ['+', i + start]);
  else {
    approximate = true;
    for (let i = start; i < endA; i++) steps.push(['-', i]);
    for (let j = start; j < endB; j++) steps.push(['+', j]);
  }
  for (let i = endA, j = endB; i < a.length; i++, j++) steps.push(['=', i, j]);
  return { steps, approximate };
}

// Samlet linje-diff med uændrede linjer omkring hver ændring. Linjenumre starter ved 1.
function lineDiff(before, after, { context = 3, maxLines = 3000 } = {}) {
  const a = splitLines(before), b = splitLines(after);
  const { steps, approximate } = editScript(a, b);
  let added = 0, removed = 0;
  for (const [type] of steps) { if (type === '+') added++; else if (type === '-') removed++; }
  const rows = [];
  let oldLine = 0, newLine = 0;
  for (const step of steps) {
    if (step[0] === '=') { oldLine = step[1] + 1; newLine = step[2] + 1; rows.push({ type: ' ', old: oldLine, new: newLine, text: a[step[1]] }); }
    else if (step[0] === '-') { oldLine = step[1] + 1; rows.push({ type: '-', old: oldLine, new: null, text: a[step[1]] }); }
    else { newLine = step[1] + 1; rows.push({ type: '+', old: null, new: newLine, text: b[step[1]] }); }
  }
  // Hunks: ændrede rækker med op til `context` uændrede linjer på hver side. Tætte ændringer slås sammen.
  const hunks = [];
  let current = null, lines = 0, truncated = false;
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].type === ' ') continue;
    const from = Math.max(0, index - context);
    let to = index;
    while (to + 1 < rows.length) {
      let next = to + 1;
      while (next < rows.length && rows[next].type === ' ') next++;
      if (next < rows.length && next - to - 1 <= context * 2) to = next; else break;
    }
    const end = Math.min(rows.length - 1, to + context);
    if (current && from <= current.end + 1) current.end = end;
    else { current = { start: from, end }; hunks.push(current); }
    index = to;
  }
  const result = hunks.map(hunk => {
    const slice = rows.slice(hunk.start, hunk.end + 1);
    const first = slice.find(row => row.old !== null), firstNew = slice.find(row => row.new !== null);
    return { oldStart: first?.old ?? 0, newStart: firstNew?.new ?? 0, skippedBefore: 0, lines: slice };
  });
  // Antallet af uændrede linjer mellem hunks, så visningen kan sige "12 uændrede linjer".
  let previousEnd = -1;
  for (const [index, hunk] of hunks.entries()) { result[index].skippedBefore = hunk.start - previousEnd - 1; previousEnd = hunk.end; }
  const skippedAfter = hunks.length ? rows.length - hunks.at(-1).end - 1 : 0;
  for (const hunk of result) {
    if (lines + hunk.lines.length > maxLines) { hunk.lines = hunk.lines.slice(0, Math.max(0, maxLines - lines)); truncated = true; }
    lines += hunk.lines.length;
  }
  return { added, removed, hunks: result.filter(hunk => hunk.lines.length), skippedAfter, truncated, approximate, oldLines: a.length, newLines: b.length };
}

// Kun tællingen, uden rækker. Bruges i resuméet for alle filer på én gang.
function lineStats(before, after) {
  const { steps, approximate } = editScript(splitLines(before), splitLines(after));
  let added = 0, removed = 0;
  for (const [type] of steps) { if (type === '+') added++; else if (type === '-') removed++; }
  return { added, removed, approximate };
}

module.exports = { lineDiff, lineStats, splitLines, myers };
