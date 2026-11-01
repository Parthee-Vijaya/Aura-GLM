// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Git-snapshot pr. opgavetur: en privat kopi af brugerens index i et privat objektlager gør
// det muligt at sammenligne filerne ved opgavens start og slut præcist — med omdøbninger og
// linjetal — uden at røre brugerens index, refs eller objekter. Uden et Git-repo, ved Git-
// clean-filtre eller i et beskyttet Git-scope bruges den almindelige fillæsning i stedet;
// snapshot() returnerer da null, og forbrugeren falder tilbage.
const fs = require('node:fs/promises');
const path = require('node:path');
const git = require('./git.cjs');

const LIMITS = Object.freeze({ files: 500 });

async function snapshotEnvironment(root, directory, gitDir) {
  return { GIT_INDEX_FILE: path.join(directory, 'index'), GIT_OBJECT_DIRECTORY: path.join(directory, 'objects'), GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(gitDir, 'objects') };
}

// Ren clean-filtertest over trackede og uregistrerede filer, som Gem version bruger.
async function filterBlock(root) {
  const files = (await git.run(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).toString().split('\0').filter(Boolean);
  if (!files.length) return false;
  const answer = (await git.run(root, ['check-attr', '-z', '--stdin', 'filter'], Buffer.from(files.join('\0') + '\0'))).toString().split('\0');
  for (let index = 2; index < answer.length; index += 3) if (answer[index] && !['unspecified', 'unset'].includes(answer[index])) return true;
  return false;
}

// Et øjebliksbillede af arbejdsfilerne. Kaldet med en privat 0700-mappe (fx under appens
// datamappe); temp-materialet fjernes med release() efter diffen er beregnet.
async function snapshot(root, { directory }) {
  if (!root || typeof root !== 'string' || !directory || typeof directory !== 'string') throw new Error('Snapshot kræver projekt og privat mappe.');
  try {
    if (git.isProtected(root)) return null;
    const gitDir = path.resolve(root, (await git.run(root, ['rev-parse', '--git-dir'])).toString().trim());
    if (await filterBlock(root)) return null;
    const snapshotDir = await fs.mkdtemp(path.join(directory, 'turn-'));
    await fs.mkdir(path.join(snapshotDir, 'objects'), { recursive: true, mode: 0o700 });
    const environment = await snapshotEnvironment(root, snapshotDir, gitDir);
    // Brugerens index kopieres som udgangspunkt, så uændrede filer ikke skal læses igen.
    try { await fs.copyFile(path.join(gitDir, 'index'), environment.GIT_INDEX_FILE); } catch { /* Uden et index startes fra tomt. */ }
    // GIT_LITERAL_PATHSPECS er sat globalt i git.cjs; derfor ingen pathspec her — 'add --all'
    // fra projektroden stadser hele arbejdsområdet.
    await git.run(root, ['add', '--all'], null, [], environment);
    const tree = (await git.run(root, ['write-tree'], null, [], environment)).toString().trim();
    if (!/^[0-9a-f]{40,64}$/.test(tree)) throw new Error('Snapshottræet kunne ikke læses.');
    return { tree, directory: snapshotDir, environment };
  } catch {
    return null; // Enhver Git-afvisning betyder tilbagefald til fillæsning; intet fejlbilled opfindes.
  }
}

// Omdøbninger og linjetal mellem to snapshots. Udgangen afkortes ved LIMITS.files.
async function diffTrees(root, before, after) {
  if (!before || !after || before.tree === after.tree) return { changed: [], identical: before && after ? true : null };
  const gitDir = path.resolve(root, (await git.run(root, ['rev-parse', '--git-dir'])).toString().trim());
  const environment = {
    GIT_OBJECT_DIRECTORY: path.join(after.directory, 'objects'),
    GIT_ALTERNATE_OBJECT_DIRECTORIES: [path.join(before.directory, 'objects'), path.join(gitDir, 'objects')].join(path.delimiter)
  };
  const output = (await git.run(root, ['diff-tree', '-r', '-M', '-z', '--numstat', '--no-color', before.tree, after.tree], null, [], environment)).toString();
  return { changed: parseNumstat(output).slice(0, LIMITS.files), identical: false };
}

// Git afslutter -z-poster med NUL. En omdøbning har en tom sti i numstat-linjen efterfulgt af
// postens gamle og nye sti som to NUL-dele; linjetallene gælder hele flytningen.
function parseNumstat(output) {
  const chunks = output.split('\0');
  const count = value => /^\d+$/.test(value) ? Number(value) : null;
  const entries = [];
  for (let index = 0; index < chunks.length; index++) {
    const record = chunks[index];
    if (!record) continue;
    const [added, removed, name] = record.split('\t');
    if (name) { entries.push({ added: count(added), removed: count(removed), path: name }); continue; }
    const oldPath = chunks[index + 1], newPath = chunks[index + 2];
    if (oldPath && newPath) { entries.push({ added: count(added), removed: count(removed), path: newPath, renamedFrom: oldPath }); index += 2; }
  }
  return entries;
}

async function release(snapshotState) {
  if (!snapshotState?.directory) return;
  await fs.rm(snapshotState.directory, { recursive: true, force: true }).catch(() => {});
}

module.exports = { snapshot, diffTrees, parseNumstat, release, LIMITS };
