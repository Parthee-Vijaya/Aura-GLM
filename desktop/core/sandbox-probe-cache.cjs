const fs = require('node:fs/promises');

// This cache proves only which executable passed a version probe. It contains
// no workspace, command, policy, permission or sandbox activation state.
function createPositiveProbe({ identify, probe, isPositive = value => Boolean(value) }) {
  let cached = null, pending = null, generation = 0;
  return async () => {
    const identity = await identify();
    if (cached?.identity === identity) return cached.value;
    cached = null;
    if (pending?.identity === identity) return pending.promise;
    const ticket = { identity, generation: ++generation };
    ticket.promise = (async () => {
      const value = await probe();
      if (await identify() !== identity) throw new Error('Runtime changed during its capability check.');
      if (isPositive(value) && ticket.generation === generation) cached = { identity, value };
      return value;
    })();
    pending = ticket;
    try { return await ticket.promise; }
    finally { if (pending === ticket) pending = null; }
  };
}

// Concurrent callers may share a fresh dependency check. Completed results,
// including failures, are never retained (on either macOS or Linux).
function createSingleFlight() {
  let pending = null;
  return async (identity, probe) => {
    if (pending?.identity === identity) return pending.promise;
    const ticket = { identity, promise: Promise.resolve().then(probe) };
    pending = ticket;
    try { return await ticket.promise; }
    finally { if (pending === ticket) pending = null; }
  };
}

const stamp = value => ['dev', 'ino', 'mode', 'uid', 'gid', 'size', 'mtimeNs', 'ctimeNs'].map(key => String(value[key]));
async function fileIdentity(candidate, executable) {
  try {
    const link = await fs.lstat(candidate, { bigint: true });
    const real = await fs.realpath(candidate);
    const target = await fs.stat(real, { bigint: true });
    await fs.access(candidate, executable ? fs.constants.X_OK : fs.constants.R_OK);
    return [candidate, real, stamp(link), stamp(target)];
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return [candidate, error.code];
    throw error;
  }
}
async function candidateIdentity(candidates, { executable = true } = {}) {
  return JSON.stringify(await Promise.all(candidates.map(candidate => fileIdentity(candidate, executable))));
}

module.exports = { createPositiveProbe, createSingleFlight, candidateIdentity };
