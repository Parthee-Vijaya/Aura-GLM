// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Retain actual UTF-8 spelling, including macOS decomposed names. Never let
// distinct guest names resolve to one canonically equivalent host component.
function relativePath(value) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 2000 || !value.isWellFormed() || /[\\\p{Cc}]/u.test(value)) return false;
  const parts = value.split('/');
  return parts.length <= 30 && parts.every(part => part && part !== '.' && part !== '..' && Buffer.byteLength(part) <= 255);
}
function assertUnambiguousPaths(names, fail = () => new Error('Ambiguous or invalid relative path.')) {
  const seen = new Map();
  for (const name of names) {
    if (!relativePath(name)) throw fail();
    const parts = name.split('/');
    for (let index = 1; index <= parts.length; index++) {
      const raw = parts.slice(0, index).join('/'), normalized = raw.normalize('NFC');
      if (seen.has(normalized) && seen.get(normalized) !== raw) throw fail();
      seen.set(normalized, raw);
    }
  }
}
module.exports = { relativePath, assertUnambiguousPaths };
