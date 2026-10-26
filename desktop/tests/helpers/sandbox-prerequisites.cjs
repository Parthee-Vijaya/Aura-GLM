const fs = require('node:fs/promises');
const path = require('node:path');
const { constants } = require('node:fs');

// Match the trusted PATH used by command-sandbox.support(). Missing OS tools can
// skip a native test; an installed but broken sandbox must still fail the test.
const directories = ['/usr/bin', '/bin', '/usr/sbin', '/sbin', '/opt/homebrew/bin'];
async function executable(file) {
  try { await fs.access(file, constants.X_OK); return (await fs.stat(file)).isFile(); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return false;
    throw error;
  }
}
async function sandboxPrerequisiteReason({ platform = process.platform, canExecute = executable } = {}) {
  if (!['darwin', 'linux'].includes(platform)) return `OS-isolation er ikke understøttet på ${platform}.`;
  const programs = platform === 'darwin' ? ['/usr/bin/sandbox-exec'] : ['bwrap', 'socat'];
  const missing = [];
  for (const program of programs) {
    const candidates = path.isAbsolute(program) ? [program] : directories.map(directory => path.join(directory, program));
    const found = (await Promise.all(candidates.map(file => canExecute(file)))).some(Boolean);
    if (!found) missing.push(program);
  }
  return missing.length ? `Native isolationsprøve kræver installerede systemværktøjer: ${missing.join(', ')}.` : null;
}
module.exports = { sandboxPrerequisiteReason };
