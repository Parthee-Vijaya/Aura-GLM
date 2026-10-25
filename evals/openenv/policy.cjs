const path = require('node:path');
const fs = require('node:fs/promises');

const PUBLIC_FILE = /^public\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:html|css|js|json|svg)$/;
const PUBLIC_DIRECTORY = /^public(?:\/[a-zA-Z0-9_-]+)*$/;
const protectedName = name => ['secrets', 'references'].includes(name.toLowerCase());

// The pilot acts as a test user. Each write is still approved through Aura.
// No persistent/project/YOLO grants, shell, network, Git or external paths.
async function reviewWrite(root, request, mode) {
  if (mode !== 'build' || request.permission !== 'edit' || !Array.isArray(request.patterns) || !request.patterns.length) return false;
  const canonical = await fs.realpath(root);
  for (const name of request.patterns) {
    if (typeof name !== 'string' || /[*?\x00]/.test(name)) return false;
    const target = path.isAbsolute(name)
      ? name.startsWith(root + path.sep) ? path.join(canonical, name.slice(root.length + 1)) : path.resolve(name)
      : path.resolve(canonical, name);
    const relative = path.relative(canonical, target);
    if (!PUBLIC_FILE.test(relative)) return false;
    let current = canonical;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      try { if ((await fs.lstat(current)).isSymbolicLink()) return false; }
      catch (error) { if (error.code !== 'ENOENT') return false; }
    }
  }
  return true;
}

// This is an evaluator's one-time decision, not a product permission grant.
// The record must come from ChatSession.approvals after ApprovalsPolicy has
// bound the real tool input to its canonical targets. Display patterns alone
// (grep patterns are search expressions) never authorize a read.
async function reviewPermission(root, record, mode) {
  try {
    const request = record?.p, descriptor = record?.descriptor;
    const kind = request?.permission, targets = descriptor?.match?.targets;
    if (!['plan', 'build'].includes(mode) || !['edit', 'read', 'grep'].includes(kind)
      || descriptor?.kind !== kind || descriptor?.match?.kind !== kind || descriptor.blockedMode
      || !/^[a-f0-9]{64}$/.test(descriptor.fingerprint || '')
      || !Array.isArray(targets) || !targets.length || targets.length > 100) return false;
    if (kind === 'edit') {
      if (descriptor.projectFile !== true || targets.some(target => target.subtree !== false)) return false;
      return await reviewWrite(root, { permission: kind, patterns: targets.map(target => target.path) }, mode);
    }
    const input = request.toolInput;
    if (input?.tool !== kind || targets.length !== 1 || targets[0]?.subtree !== false) return false;
    const requested = kind === 'read' ? input.filePath : input.path;
    if (typeof requested !== 'string' || !requested || requested.length > 4096
      || /[\0\r\n?*\[\]{}\\]/.test(requested) || requested.split('/').includes('..')) return false;
    const canonical = await fs.realpath(root), lexicalRoot = path.resolve(root);
    const absolute = path.resolve(lexicalRoot, requested), relative = path.relative(lexicalRoot, absolute);
    if (!PUBLIC_FILE.test(relative) && !PUBLIC_DIRECTORY.test(relative)) return false;
    const target = path.join(canonical, relative);
    if (targets[0].path !== target) return false;
    let cursor = canonical;
    for (const part of relative.split('/')) {
      if (protectedName(part)) return false;
      cursor = path.join(cursor, part);
      if ((await fs.lstat(cursor)).isSymbolicLink()) return false;
    }
    if (await fs.realpath(target) !== target) return false;

    // A directory grep can traverse more than the displayed target. Refuse the
    // whole request if any descendant is protected, unsupported or a link.
    // The isolated pilot admits no shell or symlink-creating write operation.
    let inspected = 0;
    async function inspect(candidate) {
      if (++inspected > 2000) return false;
      const name = path.relative(canonical, candidate), stat = await fs.lstat(candidate);
      if (stat.isSymbolicLink() || name.split('/').some(protectedName)) return false;
      if (stat.isFile()) return PUBLIC_FILE.test(name);
      if (!stat.isDirectory() || !PUBLIC_DIRECTORY.test(name)) return false;
      for (const child of await fs.readdir(candidate)) if (!await inspect(path.join(candidate, child))) return false;
      return true;
    }
    return await inspect(target);
  } catch { return false; }
}

function modelCallBudgetReached(calls, limit) {
  return !Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(calls) || calls < 0 || calls >= limit;
}

module.exports = { reviewWrite, reviewPermission, modelCallBudgetReached };
