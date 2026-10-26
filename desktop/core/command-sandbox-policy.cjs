// Keep SRT on Aura's narrow direct-API path. Optional proxy, TLS and credential
// features are deliberately not part of this contract. Unknown fields fail closed.
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const protectedPaths = require('./protected-paths.cjs');

const PACKAGE_HOSTS = Object.freeze(['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org']);
const MAX_POLICY_BYTES = 256 * 1024;
const MAX_POLICY_NODES = 4096;
const MAX_POLICY_DEPTH = 12;
const MAX_COMMAND_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_ENCODED_BYTES = Math.ceil(MAX_COMMAND_BYTES / 3) * 4;
const policyError = () => Object.assign(new Error('Kommandobeskyttelsens indstillinger er ugyldige eller for store.'), { code: 'AURA_SANDBOX_POLICY_INVALID' });
const commandError = () => Object.assign(new Error('Den isolerede kommando er ugyldig eller for stor.'), { code: 'AURA_SANDBOX_COMMAND_INVALID' });

function absolutePath(value) {
  return typeof value === 'string' && value.length <= 8192 && path.isAbsolute(value) && !/[\0\r\n]/.test(value) && path.normalize(value) === value;
}
function assertBoundedJSON(value) {
  const pending = [{ value, depth: 0 }], seen = new Set();
  let nodes = 0, bytes = 0;
  while (pending.length) {
    const item = pending.pop();
    if (++nodes > MAX_POLICY_NODES || item.depth > MAX_POLICY_DEPTH) throw policyError();
    if (item.value === null || typeof item.value === 'boolean') continue;
    if (typeof item.value === 'number') { if (!Number.isFinite(item.value)) throw policyError(); continue; }
    if (typeof item.value === 'string') {
      bytes += Buffer.byteLength(item.value);
      if (bytes > MAX_POLICY_BYTES) throw policyError();
      continue;
    }
    if (typeof item.value !== 'object' || seen.has(item.value)) throw policyError();
    seen.add(item.value);
    const array = Array.isArray(item.value);
    if (Object.getPrototypeOf(item.value) !== (array ? Array.prototype : Object.prototype)) throw policyError();
    const keys = Reflect.ownKeys(item.value);
    if (keys.length + pending.length + nodes > MAX_POLICY_NODES) throw policyError();
    for (const key of keys) {
      if (typeof key !== 'string') throw policyError();
      const descriptor = Object.getOwnPropertyDescriptor(item.value, key);
      if (!Object.hasOwn(descriptor, 'value')) throw policyError();
      if (array && key === 'length') continue;
      if (!descriptor.enumerable) throw policyError();
      bytes += Buffer.byteLength(key);
      if (bytes > MAX_POLICY_BYTES) throw policyError();
      pending.push({ value: descriptor.value, depth: item.depth + 1 });
    }
  }
}

function buildPolicy({ workspaceRoot: root, scratchRoot: scratch, node, platform }) {
  if (!['darwin', 'linux'].includes(platform) || ![root, scratch, node].every(absolutePath)) throw policyError();
  const home = path.join(scratch, 'home'), temp = path.join(scratch, 'tmp');
  const literal = value => ({ path: value, literal: true });
  const systemRead = platform === 'darwin'
    ? ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/share', '/System/Library', '/Library/Apple', '/private/etc/ssl', '/private/etc/resolv.conf', '/private/etc/hosts', '/private/etc/localtime']
    : ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64', '/lib', '/lib64', '/usr/share', '/etc/ssl', '/etc/resolv.conf', '/etc/hosts', '/etc/localtime'];
  const runtimeRoot = path.dirname(path.dirname(node));
  const sensitive = protectedPaths.toSandboxGlobs();
  return { version: 1, workspaceRoot: root, scratchRoot: scratch, node, env: { PATH: [path.dirname(node), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'), HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp, LANG: 'en_US.UTF-8', npm_config_cache: path.join(home, '.npm'), PIP_CACHE_DIR: path.join(home, '.cache', 'pip') }, config: {
    network: { allowedDomains: [...PACKAGE_HOSTS], deniedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowUnixSockets: [], allowAllUnixSockets: false },
    filesystem: { denyRead: ['/', ...[root, scratch].flatMap(folder => sensitive.map(pattern => path.join(folder, pattern)))], allowRead: [root, scratch, runtimeRoot, ...systemRead, '/dev/null', '/dev/urandom', '/dev/random', '/dev/fd'].map(literal), allowWrite: [root, scratch].map(literal), denyWrite: ['/tmp/claude', '/private/tmp/claude', ...[root, scratch].flatMap(folder => sensitive.map(pattern => path.join(folder, pattern)))] },
    allowPty: false, enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false
  } };
}

function validatePolicy(value, { platform = process.platform } = {}) {
  try {
    assertBoundedJSON(value);
    if (!value || typeof value !== 'object') throw policyError();
    const expected = buildPolicy({ workspaceRoot: value.workspaceRoot, scratchRoot: value.scratchRoot, node: value.node, platform });
    if (!isDeepStrictEqual(value, expected) || Buffer.byteLength(JSON.stringify(value)) > MAX_POLICY_BYTES) throw policyError();
    return value;
  } catch { throw policyError(); }
}

function createPolicy({ workspaceRoot, scratchRoot, node, platform = process.platform }) {
  return validatePolicy(buildPolicy({ workspaceRoot, scratchRoot, node, platform }), { platform });
}

async function readPolicy(file, options) {
  let handle;
  try {
    // O_NONBLOCK avoids waiting on a substituted FIFO; O_NOFOLLOW refuses a
    // symlink. The descriptor pins the file while both size and identity checks run.
    handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_POLICY_BYTES) throw policyError();
    const buffer = Buffer.alloc(MAX_POLICY_BYTES + 1);
    let total = 0;
    while (total < buffer.length) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, total);
      if (!bytesRead) break;
      total += bytesRead;
    }
    const after = await handle.stat();
    if (total > MAX_POLICY_BYTES || total !== before.size || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs || before.ino !== after.ino || before.dev !== after.dev) throw policyError();
    return validatePolicy(JSON.parse(buffer.subarray(0, total).toString('utf8')), options);
  } catch { throw policyError(); }
  finally { if (handle) await handle.close().catch(() => {}); }
}

function parseCommand(encoded) {
  try {
    if (typeof encoded !== 'string' || encoded.length > MAX_COMMAND_ENCODED_BYTES || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw commandError();
    const raw = Buffer.from(encoded, 'base64url');
    if (raw.length > MAX_COMMAND_BYTES || raw.toString('base64url') !== encoded) throw commandError();
    const input = JSON.parse(raw.toString('utf8'));
    if (!input || typeof input !== 'object' || Array.isArray(input) || !isDeepStrictEqual(Object.keys(input).sort(), ['command', 'cwd']) || typeof input.command !== 'string' || input.command.length > 200000 || !absolutePath(input.cwd)) throw commandError();
    return input;
  } catch { throw commandError(); }
}

module.exports = { PACKAGE_HOSTS, MAX_POLICY_BYTES, MAX_POLICY_NODES, MAX_COMMAND_ENCODED_BYTES, createPolicy, validatePolicy, readPolicy, parseCommand };
