// Fanen Ændringer: hvad der er ændret, i forhold til hvad, og hvem der ændrede det.
// En fil tilskrives kun AI'en, når AI'ens eget filværktøj skrev den, og indholdet ikke er ændret af andre bagefter.
// Ændringer under en opgave uden AI'ens filværktøjer kan komme fra en kommando, brugeren eller et andet program.
const { createHash } = require('node:crypto');
const { lineDiff, lineStats } = require('./diff.cjs');
const { secretContent } = require('./git.cjs');

const hash = text => text === null || text === undefined ? null : createHash('sha256').update(text).digest('hex');
const value = text => text === undefined ? null : text;
const change = (before, after) => before === null ? 'ny' : after === null ? 'slettet' : 'ændret';
const secret = (before, after) => Boolean((before && secretContent(before)) || (after && secretContent(after)));

// ai: AI'ens filværktøj skrev filen. blandet: AI'en skrev den, men indholdet er ændret af andre bagefter.
// kommando: ændret under en opgave, hvor AI'en kørte kommandoer. anden: ikke AI'en.
function taskAttribution(task, file) {
  const entry = task.files.find(item => item.file === file);
  if (!entry) return null;
  if (task.aiFiles?.has(file)) {
    if (task.aiHashes?.has(file) && task.aiHashes.get(file) !== hash(value(entry.after))) return 'blandet';
    return 'ai';
  }
  return task.commands > 0 ? 'kommando' : 'anden';
}
// Hele samtalen: filen er kun AI'ens, hvis hver opgave, der ændrede den, startede fra det indhold, den forrige
// efterlod, AI'en skrev den hver gang, og ingen har ændret den siden.
function sessionAttribution(file, baseline, current, tasks) {
  const touching = tasks.filter(task => task.files.some(item => item.file === file));
  if (!touching.length) return 'anden';
  let expected = value(baseline), pure = true, ai = false, command = false;
  for (const task of touching) {
    const entry = task.files.find(item => item.file === file);
    const by = taskAttribution(task, file);
    if (value(entry.before) !== expected) pure = false;
    if (by === 'ai' || by === 'blandet') ai = true;
    if (by !== 'ai') pure = false;
    if (by === 'kommando') command = true;
    expected = value(entry.after);
  }
  if (expected !== value(current)) pure = false;
  return pure ? 'ai' : ai ? 'blandet' : command ? 'kommando' : 'anden';
}
function fileSummary(file, before, after, by) {
  const stats = lineStats(before, after);
  return { file, change: change(before, after), added: stats.added, removed: stats.removed, by, secret: secret(before, after) };
}
const order = { ai: 0, blandet: 1, kommando: 2, anden: 3 };
const sorted = files => files.sort((a, b) => order[a.by] - order[b.by] || a.file.localeCompare(b.file, 'da'));
function totals(files) {
  return { files: files.length, added: files.reduce((n, f) => n + f.added, 0), removed: files.reduce((n, f) => n + f.removed, 0), ai: files.filter(f => f.by === 'ai').length, mixed: files.filter(f => f.by === 'blandet').length, others: files.filter(f => ['kommando', 'anden'].includes(f.by)).length };
}

function taskSummary(task) {
  const files = sorted((task.files || []).map(entry => fileSummary(entry.file, value(entry.before), value(entry.after), taskAttribution(task, entry.file))));
  return { id: task.id, label: task.label, mode: task.mode, status: task.status, startedAt: task.startedAt, endedAt: task.endedAt, commands: task.commands || 0, skipped: task.skipped || 0, unavailable: Boolean(task.unavailable), checkpoint: task.checkpoint ? { status: task.checkpoint.status, message: task.checkpoint.message } : null, files, totals: totals(files) };
}
// baseline og current er øjebliksbilleder fra changes.capture: { files: Map(sti → tekst), skipped }.
function sessionSummary(baseline, current, tasks) {
  const names = new Set([...baseline.files.keys(), ...current.files.keys()]);
  const files = [];
  for (const file of names) {
    const before = value(baseline.files.get(file)), after = value(current.files.get(file));
    if (before === after) continue;
    files.push(fileSummary(file, before, after, sessionAttribution(file, before, after, tasks)));
  }
  sorted(files);
  return { files, totals: totals(files), skipped: Math.max(baseline.skipped || 0, current.skipped || 0) };
}
// Linjerne for én fil. En fil med mulig nøgle viser kun antallet af linjer, ikke indholdet.
function fileDetail(file, before, after, by) {
  const diff = lineDiff(value(before), value(after));
  const hidden = secret(value(before), value(after));
  return { file, change: change(value(before), value(after)), by, secret: hidden, added: diff.added, removed: diff.removed, approximate: diff.approximate, truncated: diff.truncated, skippedAfter: diff.skippedAfter, invisible: !hidden && !diff.hunks.length && value(before) !== value(after), hunks: hidden ? [] : diff.hunks };
}

module.exports = { taskSummary, sessionSummary, fileDetail, taskAttribution, sessionAttribution, hash };
