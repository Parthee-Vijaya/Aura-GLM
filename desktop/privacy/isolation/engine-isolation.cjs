// SPDX-License-Identifier: EUPL-1.2
// Whole-process macOS boundary. Model credentials stay in the host gateway.
// This module never falls back to an unsandboxed spawn.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { createHash } = require('node:crypto');
const { defaultHelperPath, sourcePath } = require('./prepare-helper.cjs');
const { executableDigest } = require('./helper-integrity.cjs');
const run = promisify(execFile);
const SANDBOX_EXEC = '/usr/bin/sandbox-exec';
const SYSTEM_READ = ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/share', '/System/Library', '/System/Volumes/Preboot/Cryptexes/OS', '/Library/Apple/System/Library'];
const DEVICE_READ = ['/dev/null', '/dev/zero', '/dev/random', '/dev/urandom', '/dev/fd'];
const contains = (root, file) => file === root || file.startsWith(root + path.sep);
const fail = message => Object.assign(new Error(message), { code: 'PRIVACY_ISOLATION_UNAVAILABLE' });
const quote = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
function cleanPath(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0-\x1f\x7f]/.test(value) || value.length > 4096) throw fail('Privacy Gate kræver en gyldig absolut sti.');
  return path.resolve(value);
}
function port(value) {
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw fail('Privacy Gate kræver en fast, uprivilegeret port.');
  return value;
}
function gatewayAddress(value) {
  let url; try { url = new URL(value); } catch { throw fail('Privacy Gate mangler sin lokale gateway.'); }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.hash || url.search || !url.port) throw fail('Privacy Gate tillader kun den konkrete lokale gateway.');
  return { origin: url.origin, port: port(Number(url.port)), url: url.href };
}
async function canonicalDirectory(value, { privateDirectory = false } = {}) {
  const supplied = cleanPath(value), resolved = await fs.realpath(supplied), stat = await fs.lstat(supplied);
  if (!stat.isDirectory() || stat.isSymbolicLink() || resolved !== supplied || (stat.mode & 0o022) || (stat.uid !== process.getuid() && (privateDirectory || stat.uid !== 0))) throw fail('Privacy Gate kan ikke stole på arbejds- eller runtime-mappen.');
  if (privateDirectory && (stat.mode & 0o077)) throw fail('Privacy Gates arbejdsmapper skal være private for denne bruger.');
  if (['/', '/Users', os.homedir(), os.tmpdir(), '/private/tmp', '/tmp'].includes(resolved)) throw fail('Privacy Gate kræver særskilte arbejdsmapper.');
  return resolved;
}
function ancestors(file) {
  const result = []; let current = path.dirname(file);
  while (current !== '/') { result.push(current); current = path.dirname(current); }
  return result;
}
function makeProfile({ workspaceRoot, stateRoot, runtimeRoot, trustedReadRoots, trustedReadFiles, gatewayPort, enginePort, kind = 'engine', bundleId = 'com.github.Electron', allowedExecutables = null }) {
  const readRoots = [...new Set([...SYSTEM_READ, workspaceRoot, stateRoot, runtimeRoot, ...trustedReadRoots])];
  const readFiles = [...new Set([...DEVICE_READ, '/private/etc/localtime', '/private/etc/hosts', '/private/etc/ssl/cert.pem', ...trustedReadFiles])];
  const metadata = [...new Set([...readRoots, ...readFiles].flatMap(ancestors))];
  return [
    '(version 1)', '(deny default)', '(allow file-read* (literal "/"))',
    allowedExecutables ? `(allow process-exec ${allowedExecutables.map(file => `(literal ${quote(file)})`).join(' ')})` : '(allow process-exec)', '(allow process-fork)',
    '(allow process-info* (target same-sandbox))', '(allow signal (target same-sandbox))',
    '(allow sysctl-read)', '(allow sysctl-write (sysctl-name "kern.tcsm_enable"))',
    // No keychain, Apple Events, launchservices, browser, or general Mach access.
    '(allow mach-lookup (global-name "com.apple.system.opendirectoryd.libinfo") (global-name "com.apple.system.opendirectoryd.membership"))',
    ...readRoots.map(root => `(allow file-read* (subpath ${quote(root)}))`),
    ...readFiles.map(file => `(allow file-read* (literal ${quote(file)}))`),
    ...metadata.map(file => `(allow file-read-metadata (literal ${quote(file)}))`),
    ...(kind === 'renderer' ? [stateRoot] : [workspaceRoot, stateRoot]).map(root => `(allow file-write* (subpath ${quote(root)}))`),
    '(allow file-read* file-write-data file-ioctl (literal "/dev/null"))',
    // Seatbelt accepts localhost, not a numeric host, in its IP endpoint filter.
    // Each rule names one port. No DNS, Unix sockets, external routes, or wildcard port.
    ...(kind === 'engine' ? [`(allow network-outbound (remote ip "localhost:${gatewayPort}"))`,
    `(allow network-bind (local ip "localhost:${enginePort}"))`,
    `(allow network-inbound (local ip "localhost:${enginePort}"))`,
    // The engine may query its own authenticated HTTP API, never another local service.
    `(allow network-outbound (remote ip "localhost:${enginePort}"))`] : kind === 'renderer' ? [
      // The separate offscreen Electron child needs these GUI services. This
      // grants no arbitrary Mach lookup, Keychain, Apple Events or network.
      '(allow mach-lookup (global-name "com.apple.coreservices.launchservicesd") (global-name "com.apple.windowserver.active"))',
      `(allow mach-lookup (global-name (string-append ${quote(bundleId + '.MachPortRendezvousServer.')} (param "PROCESS_PID"))))`,
      `(allow mach-register (global-name (string-append ${quote(bundleId + '.MachPortRendezvousServer.')} (param "PROCESS_PID"))))`,
      '(allow iokit-open-user-client (iokit-user-client-class "RootDomainUserClient" "IOSurfaceRootUserClient"))',
    ] : []),
  ].join('\n') + '\n';
}
async function verifyHostHelper(reaperPath = defaultHelperPath()) {
  const stat = await fs.lstat(reaperPath), manifestStat = await fs.lstat(reaperPath + '.json');
  if (!stat.isFile() || stat.isSymbolicLink() || ![0, process.getuid()].includes(stat.uid) || stat.mode & 0o022 || !manifestStat.isFile() || manifestStat.isSymbolicLink() || ![0, process.getuid()].includes(manifestStat.uid) || manifestStat.mode & 0o022) throw fail('Procesbeskyttelsens hjælpeprogram kunne ikke verificeres.');
  const [binary, source, manifest] = await Promise.all([fs.readFile(reaperPath), fs.readFile(sourcePath), fs.readFile(reaperPath + '.json', 'utf8').then(JSON.parse)]);
  if (manifest.version !== 2 || manifest.platform !== process.platform || manifest.arch !== process.arch || executableDigest(binary) !== manifest.executableSha256 || createHash('sha256').update(source).digest('hex') !== manifest.sourceSha256) throw fail('Procesbeskyttelsens hjælpeprogram matcher ikke den kvalificerede kilde.');
  await run('/usr/bin/codesign', ['--verify', '--strict', reaperPath], { timeout: 5000 });
  const result = JSON.parse((await run(reaperPath, ['--self-test'], { timeout: 5000 })).stdout);
  if (result.available !== true || result.implementation !== 'macos-seatbelt-scope-v1') throw fail('macOS kan ikke bekræfte procesbeskyttelsen.');
  }

async function createScopedIsolation({ workspaceRoot, runtimeRoot, stateRoot, gatewayURL, enginePort, trustedReadRoots = [], trustedReadFiles = [], reaperPath = defaultHelperPath(), kind = 'engine', bundleId = 'com.github.Electron', allowExistingWorkspaceMode = false, allowedExecutables = null }) {
  if (process.platform !== 'darwin') throw fail('Privacy Gates procesisolation er endnu kun kvalificeret på macOS.');
  if (!['engine', 'renderer', 'offline'].includes(kind) || !/^[A-Za-z0-9.-]+$/.test(bundleId)) throw fail('Isolationsprofilen er ugyldig.');
  const gateway = kind === 'engine' ? gatewayAddress(gatewayURL) : { port: null, url: null, origin: null };
  enginePort = kind === 'engine' ? port(enginePort) : null;
  if (kind === 'engine' && enginePort === gateway.port) throw fail('Motor og gateway skal have adskilte porte.');
  if (!Array.isArray(trustedReadRoots) || !Array.isArray(trustedReadFiles) || trustedReadRoots.length > 100 || trustedReadFiles.length > 100) throw fail('Runtime-adgangen er ugyldig.');
  if (allowExistingWorkspaceMode && kind !== 'offline') throw fail('Eksisterende mappetilstand er kun tilladt for afgrænsede offline-handlinger.');
  workspaceRoot = await canonicalDirectory(workspaceRoot, { privateDirectory: !allowExistingWorkspaceMode });
  stateRoot = await canonicalDirectory(stateRoot, { privateDirectory: true });
  runtimeRoot = await canonicalDirectory(runtimeRoot);
  if (contains(workspaceRoot, stateRoot) || contains(stateRoot, workspaceRoot) || contains(runtimeRoot, workspaceRoot) || contains(runtimeRoot, stateRoot) || contains(workspaceRoot, runtimeRoot) || contains(stateRoot, runtimeRoot)) throw fail('Arbejdsområde, motortilstand og runtime skal være adskilt.');
  trustedReadRoots = await Promise.all(trustedReadRoots.map(value => canonicalDirectory(value)));
  trustedReadFiles = await Promise.all(trustedReadFiles.map(async value => {
    value = cleanPath(value); const stat = await fs.lstat(value);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o022) || ![0, process.getuid()].includes(stat.uid) || await fs.realpath(value) !== value) throw fail('En betroet runtime-fil kunne ikke verificeres.');
    return value;
  }));
  for (const root of trustedReadRoots) if (contains(root, workspaceRoot) || contains(root, stateRoot) || contains(workspaceRoot, root) || contains(stateRoot, root)) throw fail('Runtime-adgang må ikke omfatte arbejdsområderne.');
  if (allowedExecutables !== null) {
    if (kind !== 'offline' || !Array.isArray(allowedExecutables) || !allowedExecutables.length || allowedExecutables.length > 8) throw fail('Eksekveringslisten er ugyldig.');
    allowedExecutables = await Promise.all(allowedExecutables.map(async value => {
      value = cleanPath(value); const stat = await fs.lstat(value);
      if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111) || stat.mode & 0o022 || ![0, process.getuid()].includes(stat.uid) || await fs.realpath(value) !== value) throw fail('Et tilladt program kunne ikke verificeres.');
      return value;
    }));
  }
  // The reaper is a prepared host component, never compiled by a model or on
  // automatic startup. A missing/changed helper blocks protected execution.
  reaperPath = cleanPath(reaperPath);
  const verifyHelper = () => verifyHostHelper(reaperPath);
  await verifyHelper();
  // Neither marker can be replaced, renamed or written by the sandbox. Only
  // the first is readable there; the host can read both. No IPC is granted.
  const controlRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aura-privacy-scope-')));
  const scopeMarker = path.join(controlRoot, 'scope'), controlMarker = path.join(controlRoot, 'control');
  await fs.writeFile(scopeMarker, 'Aura Privacy Gate scope v1\n', { mode: 0o400 });
  await fs.writeFile(controlMarker, 'Aura Privacy Gate control v1\n', { mode: 0o400 });
  trustedReadFiles = [...trustedReadFiles, scopeMarker];
  const roots = [workspaceRoot, stateRoot, runtimeRoot, ...trustedReadRoots];
  const identities = await Promise.all([...roots, ...trustedReadFiles].map(async file => {
    const stat = await fs.stat(file); return { file, dev: stat.dev, ino: stat.ino };
  }));
  const home = path.join(stateRoot, 'home'), temp = path.join(stateRoot, 'tmp');
  for (const folder of [home, temp, 'config', 'data', 'cache', 'state'].map(folder => path.isAbsolute(folder) ? folder : path.join(stateRoot, folder))) {
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    if (await fs.realpath(folder) !== folder) throw fail('Motortilstanden indeholder et uventet link.');
  }
  const profile = makeProfile({ workspaceRoot, stateRoot, runtimeRoot, trustedReadRoots, trustedReadFiles, gatewayPort: gateway.port, enginePort, kind, bundleId, allowedExecutables });
  const identity = createHash('sha256').update(profile).digest('hex');
  let disposed = false, launched = false, retirement;
  async function scopeCall(mode) {
    await verifyHelper();
    try { return JSON.parse((await run(reaperPath, [mode, scopeMarker, controlMarker], { timeout: 10000, maxBuffer: 16384 })).stdout); }
    catch { throw fail('Privacy Gate kunne ikke bekræfte, at alle arbejdsprocesser er stoppet.'); }
  }
  async function attest() {
    if (disposed || !launched) throw fail('Arbejdsprocessen er ikke aktiv.');
    for (let attempt = 0; attempt < 40; attempt++) {
      const result = await scopeCall('--count');
      if (disposed) throw fail('Privacy Gates procesisolation er lukket.');
      if (Number.isInteger(result.matchingProcesses) && result.matchingProcesses > 0) return Object.freeze({ scoped: true, matchingProcesses: result.matchingProcesses });
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw fail('Den kørende motor kunne ikke bekræftes som isoleret.');
  }
  async function dispose() {
    if (retirement) return retirement;
    disposed = true;
    retirement = (async () => {
      const result = await scopeCall('--stop');
      if (result.writersStopped !== true || result.matchingProcesses !== 0 || result.processTreeBoundary !== 'inherited-seatbelt-scope') throw fail('Arbejdsprocesserne kunne ikke stoppes sikkert.');
      await fs.rm(controlRoot, { recursive: true, force: true });
      return Object.freeze(result);
    })();
    return retirement;
  }
  async function verify() {
    if (disposed) throw fail('Privacy Gates procesisolation er lukket.');
    const sandbox = await fs.stat(SANDBOX_EXEC);
    if (!sandbox.isFile() || sandbox.uid !== 0 || sandbox.mode & 0o022) throw fail('macOS-isolationen kunne ikke verificeres.');
    for (const expected of identities) {
      const stat = await fs.lstat(expected.file);
      if (stat.isSymbolicLink() || stat.dev !== expected.dev || stat.ino !== expected.ino || await fs.realpath(expected.file) !== expected.file || stat.mode & 0o022) throw fail('En isolationsmappe eller runtime-fil er ændret.');
    }
    if (disposed) throw fail('Privacy Gates procesisolation er lukket.');
    return Object.freeze({ available: true, implementation: kind === 'renderer' ? 'macos-seatbelt-offline-renderer' : kind === 'offline' ? 'macos-seatbelt-offline-process' : 'macos-seatbelt-whole-engine', identity, gatewayOrigin: gateway.origin, enginePort, network: kind === 'engine' ? 'fixed-loopback-ports-only' : 'none', filesystem: 'private-workspace-and-state', inheritedBySubprocesses: true });
  }
  function environment(input = {}) {
    const output = { PATH: [path.join(runtimeRoot, 'node', 'bin'), path.join(runtimeRoot, 'git', 'bin'), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'), HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', SHELL: '/bin/bash' };
    for (const [name, relative] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state' })) output[name] = path.join(stateRoot, relative);
    // These are supplied by the trusted engine host, never merged from process.env.
    for (const key of ['OPENCODE_CONFIG_CONTENT', 'OPENCODE_SERVER_PASSWORD', 'OPENCODE_SERVER_USERNAME', 'OPENCODE_CLIENT', 'OPENCODE_ENABLE_QUESTION_TOOL', 'OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX', 'ELECTRON_RUN_AS_NODE']) if (typeof input[key] === 'string') output[key] = input[key];
    output.OPENCODE_CONFIG_DIR = path.join(stateRoot, 'config');
    // V2 discovers ~/.agents independently of the external-skills switch.
    // Its home override is host-owned, never copied from the caller's env.
    output.OPENCODE_TEST_HOME = home;
    for (const flag of ['DISABLE_PROJECT_CONFIG', 'DISABLE_DEFAULT_PLUGINS', 'DISABLE_EXTERNAL_SKILLS', 'DISABLE_CLAUDE_CODE', 'DISABLE_AUTOUPDATE', 'DISABLE_MODELS_FETCH', 'DISABLE_LSP_DOWNLOAD', 'DISABLE_SHARE', 'DISABLE_EMBEDDED_WEB_UI']) output['OPENCODE_' + flag] = 'true';
    output.npm_config_cache = path.join(stateRoot, 'cache', 'npm'); output.PIP_CACHE_DIR = path.join(stateRoot, 'cache', 'pip');
    return output;
  }
  async function launchSpec(file, args = [], options = {}) {
    await verify();
    if (launched) throw fail('En isoleret motor må kun startes én gang pr. arbejdsmiljø.');
    file = cleanPath(file);
    if (await fs.realpath(file) !== file || !contains(runtimeRoot, file) || !(await fs.stat(file)).isFile()) throw fail('Motoren skal startes fra den verificerede runtime.');
    if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0')) || options.shell) throw fail('En isoleret motor kræver eksplicitte argumenter uden shell.');
    const cwd = options.cwd ? await fs.realpath(cleanPath(options.cwd)) : workspaceRoot;
    if (!contains(workspaceRoot, cwd) && !contains(stateRoot, cwd)) throw fail('Motorens arbejdsmappe ligger uden for isolationens arbejdsområde.');
    // Verification yields to the host. Revocation or another launch may win
    // while paths are checked; commit the capability only while still current.
    if (disposed) throw fail('Privacy Gates procesisolation er lukket.');
    if (launched) throw fail('En isoleret motor må kun startes én gang pr. arbejdsmiljø.');
    launched = true;
    const cleanOptions = { ...options, cwd, env: environment(options.env), shell: false };
    if (kind === 'renderer') {
      // Positional arguments are never interpolated as shell code. exec retains
      // the wrapper PID, so Chromium can reach only its own rendezvous server.
      return Object.freeze({ file: '/bin/sh', args: ['-c', 'exec /usr/bin/sandbox-exec -D "PROCESS_PID=$$" -p "$1" "$2" "${@:3}"', 'aura-offline-renderer', profile, file, ...args], options: cleanOptions });
    }
    return Object.freeze({ file: SANDBOX_EXEC, args: ['-p', profile, file, ...args], options: cleanOptions });
  }
  async function spawnChild(file, args, options) {
    const spec = await launchSpec(file, args, options); const child = spawn(spec.file, spec.args, spec.options);
    try { await attest(); return child; } catch (error) { await dispose(); throw error; }
  }
  return Object.freeze({ workspaceRoot, stateRoot, runtimeRoot, enginePort, gatewayURL: gateway.url, identity, verify, launchSpec, spawnChild, attest, dispose,
    retirementGuarantee: 'inherited-seatbelt-scope-zero-live-processes' });
}
const createEngineIsolation = options => createScopedIsolation({ ...options, kind: 'engine' });
const createOfflineProcessIsolation = options => createScopedIsolation({ ...options, kind: 'offline' });
const createOfflineRendererIsolation = options => createScopedIsolation({ ...options, kind: 'renderer' });
const availabilityCache = new Map();
async function probeIsolationSupport({ runtimeRoot, reaperPath = defaultHelperPath() } = {}) {
  const key = [process.platform, process.arch, runtimeRoot, reaperPath].join('\0');
  if (availabilityCache.has(key)) return availabilityCache.get(key);
  const promise = (async () => {
    try {
      if (process.platform !== 'darwin') throw fail('Procesisolation er endnu kun kvalificeret på macOS.');
      runtimeRoot = await canonicalDirectory(runtimeRoot);
      const sandbox = await fs.lstat(SANDBOX_EXEC);
      if (!sandbox.isFile() || sandbox.isSymbolicLink() || sandbox.uid !== 0 || sandbox.mode & 0o022) throw fail('macOS-isolationen kunne ikke verificeres.');
      await verifyHostHelper(reaperPath);
      for (const file of ['node/bin/node', 'opencode/bin/opencode']) {
        const target = path.join(runtimeRoot, file), stat = await fs.lstat(target);
        if (!stat.isFile() || stat.isSymbolicLink() || !(stat.mode & 0o111) || stat.mode & 0o022 || await fs.realpath(target) !== target) throw fail('Den beskyttede runtime mangler eller er ændret.');
      }
      return Object.freeze({ available: true, implementation: 'macos-seatbelt-whole-engine', processRetirement: 'inherited-seatbelt-scope', runtimeRoot, platform: process.platform, arch: process.arch, perLaunchAttestationRequired: true });
    } catch { return Object.freeze({ available: false, platform: process.platform, arch: process.arch, reason: 'Privacy Gates procesbeskyttelse eller den låste runtime er ikke klargjort. Beskyttet arbejde er stoppet.' }); }
  })();
  availabilityCache.set(key, promise);
  return promise;
}
module.exports = { createEngineIsolation, probeIsolationSupport, makeProfile, gatewayAddress, createOfflineRendererIsolation, createOfflineProcessIsolation };
