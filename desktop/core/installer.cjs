const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeRelative } = require('./library.cjs');

// Installationen skriver kun filer, som den selv har oprettet, eller afgrænsede afsnit mellem faste markører.
// Alt andet i projektet er brugerens. En ændret fil eller et ændret afsnit bliver en konflikt, aldrig en overskrivning.
const MANIFEST = '.harness/installation.json';
const MAX_BYTES = 2 * 1024 * 1024;
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
// Markørerne hed ai-harness før navneskiftet til Aura Harness. De gamle genkendes ved opdatering og fjernelse og skiftes ud.
const NAMES = ['aura-harness', 'ai-harness'];
const markers = (file, name = NAMES[0]) => path.posix.basename(file) === '.gitignore'
  ? { start: `# ${name}:start`, end: `# ${name}:slut` }
  : { start: `<!-- ${name}:start -->`, end: `<!-- ${name}:slut -->` };

function findBlock(text, file) {
  const lines = text.split(/\r?\n/);
  const found = NAMES.map(name => {
    const { start, end } = markers(file, name);
    return { name, starts: lines.flatMap((line, index) => line.trim() === start ? [index] : []), ends: lines.flatMap((line, index) => line.trim() === end ? [index] : []) };
  }).filter(item => item.starts.length || item.ends.length);
  if (!found.length) return null;
  // Nye og gamle markører i samme fil er lige så uklart som gentagne markører.
  if (found.length > 1) return { malformed: true };
  const [{ name, starts, ends }] = found;
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) return { malformed: true };
  return { from: starts[0], to: ends[0], body: lines.slice(starts[0] + 1, ends[0]).join('\n'), legacy: name !== NAMES[0] };
}

function withBlock(text, file, body) {
  const { start, end } = markers(file);
  const eol = /\r\n/.test(text || '') ? '\r\n' : '\n';
  const block = [start, ...body.replace(/\s+$/, '').split('\n'), end];
  if (!text) return block.join(eol) + eol;
  const lines = text.split(/\r?\n/);
  const found = findBlock(text, file);
  if (found) lines.splice(found.from, found.to - found.from + 1, ...block);
  else {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', ...block, '');
    return lines.join(eol);
  }
  return lines.join(eol);
}

function withoutBlock(text, file) {
  const found = findBlock(text, file);
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  lines.splice(found.from, found.to - found.from + 1);
  if (found.from > 0 && lines[found.from - 1] === '' && (lines[found.from] === '' || found.from === lines.length)) lines.splice(found.from - 1, 1);
  return lines.join(eol);
}

async function inside(root, relative) {
  if (!safeRelative(relative)) throw new Error(`Ugyldig filsti: ${relative}`);
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!stat) break;
    if (stat.isSymbolicLink()) return { target: path.join(root, relative), problem: 'Stien går gennem et symbolsk link. Aura Harness skriver ikke gennem links.' };
  }
  return { target: path.join(root, relative) };
}

async function readText(target) {
  const stat = await fs.lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!stat) return { exists: false };
  if (!stat.isFile()) return { exists: true, problem: 'Stien findes allerede, men er ikke en almindelig fil.' };
  if (stat.size > MAX_BYTES) return { exists: true, problem: 'Filen er større end 2 MB og gennemgås ikke automatisk.' };
  return { exists: true, text: await fs.readFile(target, 'utf8') };
}

async function readManifest(root) {
  const { target, problem } = await inside(root, MANIFEST);
  if (problem) throw new Error(`${MANIFEST}: ${problem}`);
  const current = await readText(target);
  if (!current.exists) return null;
  if (current.problem) throw new Error(`${MANIFEST}: ${current.problem}`);
  let manifest;
  try { manifest = JSON.parse(current.text); } catch { throw new Error(`${MANIFEST} kan ikke læses. Ret eller fjern filen manuelt, før Aura Harness ændrer projektet.`); }
  if (manifest?.schemaVersion !== 1 || typeof manifest.files !== 'object' || typeof manifest.blocks !== 'object' || !Array.isArray(manifest.tools)) throw new Error(`${MANIFEST} har et ukendt format.`);
  for (const file of [...Object.keys(manifest.files), ...Object.keys(manifest.blocks)]) if (!safeRelative(file)) throw new Error(`${MANIFEST} indeholder en ugyldig sti.`);
  return manifest;
}

async function projectRoot(directory) {
  const root = await fs.realpath(directory);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Vælg en projektmappe.');
  return root;
}

function token(root, operations) {
  return sha(JSON.stringify([root, operations.map(op => [op.path, op.kind, op.action, op.before ?? null, op.after ?? null])]));
}

// Beregner de præcise ændringer uden at skrive noget. layout er listen fra adapters.cjs.
async function plan(directory, layout, { version, tools }) {
  const root = await projectRoot(directory);
  const manifest = await readManifest(root);
  const operations = [];
  const wanted = new Set();
  for (const entry of layout) {
    if (wanted.has(entry.path)) throw new Error(`Filen ${entry.path} står flere gange i installationen.`);
    wanted.add(entry.path);
    const { target, problem } = await inside(root, entry.path);
    const current = problem ? { exists: true, problem } : await readText(target);
    const op = { path: entry.path, kind: entry.kind };
    if (current.problem) Object.assign(op, { action: 'konflikt', reason: current.problem });
    else if (entry.kind === 'fil') {
      op.after = sha(entry.content); op.content = entry.content;
      if (!current.exists) op.action = 'opret';
      else if (current.text === entry.content) Object.assign(op, { action: 'uaendret', before: op.after });
      else if (manifest?.files[entry.path] === sha(current.text)) Object.assign(op, { action: 'opdater', before: sha(current.text) });
      else Object.assign(op, { action: 'konflikt', before: sha(current.text), reason: manifest?.files[entry.path] ? 'Filen er ændret efter installationen.' : 'Der findes allerede en fil med andet indhold.' });
    } else {
      op.after = sha(entry.content); op.content = entry.content;
      const found = current.exists ? findBlock(current.text, entry.path) : null;
      if (!current.exists) Object.assign(op, { action: 'opret', result: withBlock('', entry.path, entry.content) });
      else if (found?.malformed) Object.assign(op, { action: 'konflikt', before: sha(current.text), reason: 'Filen har ufuldstændige eller gentagne Aura Harness-markører.' });
      else if (!found) Object.assign(op, { action: 'tilfoej', before: sha(current.text), result: withBlock(current.text, entry.path, entry.content) });
      else if (found.body === entry.content.replace(/\s+$/, '') && !found.legacy) Object.assign(op, { action: 'uaendret', before: sha(current.text) });
      // Et uændret afsnit med de gamle markører opdateres, så markørerne skiftes ud.
      else if (found.body === entry.content.replace(/\s+$/, '') || manifest?.blocks[entry.path]?.hash === sha(found.body)) Object.assign(op, { action: 'opdater', before: sha(current.text), result: withBlock(current.text, entry.path, entry.content) });
      else Object.assign(op, { action: 'konflikt', before: sha(current.text), reason: 'Afsnittet mellem Aura Harness-markørerne er ændret efter installationen.' });
    }
    if (entry.group) op.group = entry.group;
    operations.push(op);
  }
  // En skill installeres helt eller slet ikke, så Aura Harness-filer aldrig blandes med en anden skill af samme navn.
  const blocked = new Set(operations.filter(op => op.group && op.action === 'konflikt').map(op => op.group));
  for (const op of operations) if (blocked.has(op.group) && ['opret', 'opdater', 'uaendret'].includes(op.action)) Object.assign(op, { action: 'konflikt', reason: 'En anden fil i samme skill er i konflikt, så hele skillen springes over.' });
  for (const [file, hash] of Object.entries(manifest?.files || {})) if (!wanted.has(file)) operations.push(await removal(root, file, 'fil', hash));
  for (const [file, block] of Object.entries(manifest?.blocks || {})) if (!wanted.has(file)) operations.push(await removal(root, file, 'blok', block.hash, block.created));
  const result = { root, version, tools, operations, conflicts: operations.filter(op => op.action === 'konflikt'), manifest: manifest ? { version: manifest.version, tools: manifest.tools, skills: manifest.skills } : null };
  result.token = token(root, operations);
  return result;
}

async function removal(root, file, kind, hash, created = false) {
  const { target, problem } = await inside(root, file);
  const current = problem ? { exists: true, problem } : await readText(target);
  const op = { path: file, kind };
  if (!current.exists) return Object.assign(op, { action: 'uaendret', reason: 'Findes ikke længere.' });
  if (current.problem) return Object.assign(op, { action: 'konflikt', reason: current.problem });
  op.before = sha(current.text);
  if (kind === 'fil') return Object.assign(op, sha(current.text) === hash ? { action: 'fjern' } : { action: 'bevar', reason: 'Filen er ændret efter installationen og bevares.' });
  const found = findBlock(current.text, file);
  if (!found) return Object.assign(op, { action: 'uaendret', reason: 'Afsnittet findes ikke længere.' });
  if (found.malformed || sha(found.body) !== hash) return Object.assign(op, { action: 'bevar', reason: 'Afsnittet er ændret efter installationen og bevares.' });
  const rest = withoutBlock(current.text, file);
  return Object.assign(op, created && !rest.trim() ? { action: 'fjern' } : { action: 'fjern-afsnit', result: rest });
}

async function writeAtomic(target, text) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.harness-${crypto.randomUUID()}`);
  await fs.writeFile(temporary, text, { flag: 'wx' });
  try { await fs.rename(temporary, target); } catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}

async function removeEmptyParents(root, file) {
  let dir = path.dirname(path.join(root, file));
  while (dir !== root && dir.startsWith(root + path.sep)) {
    try { await fs.rmdir(dir); } catch { return; }
    dir = path.dirname(dir);
  }
}

// Udfører en gennemgået plan. Planen beregnes igen, og alt afbrydes, hvis projektet er ændret siden gennemgangen.
async function apply(directory, layout, options, reviewed, { skipConflicts = false } = {}) {
  const fresh = await plan(directory, layout, options);
  if (fresh.token !== reviewed) throw new Error('Projektet er ændret siden gennemgangen. Gennemgå ændringerne igen.');
  if (fresh.conflicts.length && !skipConflicts) throw new Error('Gennemgangen har konflikter. Vælg at springe dem over, eller løs dem først.');
  const root = fresh.root;
  const previous = await readManifest(root);
  const files = {};
  const blocks = {};
  for (const op of fresh.operations) {
    const target = path.join(root, op.path);
    if (op.action === 'opret' && op.kind === 'fil') await writeAtomic(target, op.content);
    else if (op.action === 'opdater' && op.kind === 'fil') await writeAtomic(target, op.content);
    else if (['opret', 'tilfoej', 'opdater'].includes(op.action)) await writeAtomic(target, op.result);
    else if (op.action === 'fjern') { await fs.rm(target); await removeEmptyParents(root, op.path); }
    else if (op.action === 'fjern-afsnit') await writeAtomic(target, op.result);
    if (op.action === 'konflikt' || !op.after) continue;
    if (op.kind === 'fil') files[op.path] = op.after;
    else blocks[op.path] = { hash: sha(op.content.replace(/\s+$/, '')), created: op.action === 'opret' || Boolean(previous?.blocks[op.path]?.created) };
  }
  const skipped = fresh.conflicts.map(op => op.path);
  const same = previous && JSON.stringify([previous.version, previous.tools, previous.skills, previous.files, previous.blocks, previous.skipped]) === JSON.stringify([options.version, options.tools, options.skills, files, blocks, skipped]);
  const manifest = same ? previous : { schemaVersion: 1, version: options.version, tools: options.tools, skills: options.skills, installedAt: new Date().toISOString(), timeSource: 'computerens ur', files, blocks, skipped };
  if (!same) await writeAtomic(path.join(root, MANIFEST), JSON.stringify(manifest, null, 2) + '\n');
  return { root, manifest, operations: fresh.operations.map(({ content, result, ...op }) => op) };
}

// Fjerner kun uændrede filer og afsnit. Ændret indhold bevares og nævnes i resultatet.
async function planRemoval(directory) {
  const root = await projectRoot(directory);
  const manifest = await readManifest(root);
  if (!manifest) throw new Error('Projektet har ingen Aura Harness-installation.');
  const operations = [];
  for (const [file, hash] of Object.entries(manifest.files)) operations.push(await removal(root, file, 'fil', hash));
  for (const [file, block] of Object.entries(manifest.blocks)) operations.push(await removal(root, file, 'blok', block.hash, block.created));
  const result = { root, version: manifest.version, tools: manifest.tools, operations, conflicts: operations.filter(op => op.action === 'konflikt') };
  result.token = token(root, operations);
  return result;
}

async function remove(directory, reviewed) {
  const fresh = await planRemoval(directory);
  if (fresh.token !== reviewed) throw new Error('Projektet er ændret siden gennemgangen. Gennemgå ændringerne igen.');
  const root = fresh.root;
  for (const op of fresh.operations) {
    const target = path.join(root, op.path);
    if (op.action === 'fjern') { await fs.rm(target); await removeEmptyParents(root, op.path); }
    else if (op.action === 'fjern-afsnit') await writeAtomic(target, op.result);
  }
  const kept = fresh.operations.filter(op => ['bevar', 'konflikt'].includes(op.action)).map(op => op.path);
  await fs.rm(path.join(root, MANIFEST));
  await removeEmptyParents(root, MANIFEST);
  return { root, kept, operations: fresh.operations.map(({ result, ...op }) => op) };
}

async function status(directory) {
  const root = await projectRoot(directory);
  return { root, manifest: await readManifest(root) };
}

module.exports = { plan, apply, planRemoval, remove, status, findBlock, withBlock, MANIFEST };
