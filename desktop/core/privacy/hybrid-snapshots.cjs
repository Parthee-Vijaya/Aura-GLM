// SPDX-License-Identifier: EUPL-1.2
'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { PrivacyGateError, stable } = require('./policy.cjs');
const { relativePath, assertUnambiguousPaths } = require('./hybrid-paths.cjs');
const fail = () => new PrivacyGateError('PRIVACY_STALE', 'De valgte skills eller referencer kunne ikke fastholdes. Gennemgå materialet igen.');
const sha = value => createHash('sha256').update(value).digest('hex');
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const item of Object.values(value)) freeze(item); } return value; }
async function referenceBytes(file, before) {
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.nlink !== 1 || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== before.size || opened.mtimeMs !== before.mtimeMs) throw fail();
    const buffer = Buffer.alloc(opened.size + 1); let length = 0;
    while (length < buffer.length) { const result = await handle.read(buffer, length, buffer.length - length, length); if (!result.bytesRead) break; length += result.bytesRead; }
    const after = await handle.stat(), named = await fs.lstat(file);
    if (length !== before.size || named.isSymbolicLink() || named.nlink !== 1 || named.dev !== before.dev || named.ino !== before.ino || after.size !== before.size || after.mtimeMs !== before.mtimeMs || named.size !== before.size || named.mtimeMs !== before.mtimeMs) throw fail();
    return buffer.subarray(0, length);
  } finally { await handle.close(); }
}
// Main-owned byte snapshots. No source path is granted to a cloud partition.
async function snapshotInputs(root, context, references = []) {
  if (await fs.realpath(root) !== root || !Array.isArray(context?.skills) || !Array.isArray(references)) throw fail();
  let size = 0;
  const skills = context.skills.map(skill => {
    if (!/^[a-z0-9-]{1,100}$/.test(skill?.name || '') || !Array.isArray(skill.files) || !skill.files.some(file => file.path === 'SKILL.md')) throw fail();
    const files = skill.files.map(file => {
      if (!/^(SKILL\.md|references\/[a-z0-9-]+\.md)$/.test(file?.path || '') || typeof file.content !== 'string' || (size += Buffer.byteLength(file.content)) > 8_000_000) throw fail();
      return { path: file.path, content: file.content, sha256: sha(file.content) };
    });
    return { name: skill.name, files, sha256: sha(stable(files)) };
  });
  const files = [];
  assertUnambiguousPaths(references, fail);
  for (const relative of references) {
    if (!relativePath(relative) || !relative.startsWith('references/') || relative.split('/').length !== 2) throw fail();
    const file = path.join(root, relative), directory = await fs.lstat(path.dirname(file)), before = await fs.lstat(file);
    if (!directory.isDirectory() || directory.isSymbolicLink() || !before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > 10 * 1024 * 1024 || await fs.realpath(file) !== file) throw fail();
    const bytes = await referenceBytes(file, before), after = await fs.lstat(file);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || (size += bytes.length) > 16_000_000) throw fail();
    files.push({ path: relative, base64: bytes.toString('base64'), sha256: sha(bytes), bytes: bytes.length });
  }
  return freeze({ version: 1, skills, references: files, sha256: sha(stable({ rules: context.rules, skills, references: files })) });
}
module.exports = { snapshotInputs };
