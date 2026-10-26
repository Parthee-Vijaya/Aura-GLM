// Isolationen gælder agentens kommandoer. Auras særskilt godkendte preview/installationsforløb bruger ikke denne motor.
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const crypto = require('node:crypto');
const protectedPaths = require('./protected-paths.cjs');
const { createPositiveProbe, createSingleFlight, candidateIdentity } = require('./sandbox-probe-cache.cjs');
const run = promisify(execFile);
const PACKAGE_HOSTS = ['registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org'];
const unpacked = file => file.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
const runnerPath = () => unpacked(path.join(__dirname, 'command-sandbox-runner.mjs'));
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const contains = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
function nodeCandidates() {
  const bundled = require('./runtime.cjs').get();
  const prepared = path.join(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`, 'node', 'bin', 'node');
  return bundled ? [bundled.node] : [prepared, process.execPath];
}
const nodePath = createPositiveProbe({
  identify: () => candidateIdentity(nodeCandidates()),
  probe: async () => {
    for (const candidate of nodeCandidates()) {
      try { const { stdout } = await run(candidate, ['-p', 'process.versions.electron ? "electron" : process.versions.node'], { timeout: 10000 }); if (/^(2[2-9]|[3-9]\d)\./.test(stdout.trim())) return await fs.realpath(candidate); } catch { /* Næste betroede runtime. */ }
    }
    throw new Error('Aura mangler sin Node-runtime til isolerede kommandoer. Installer appen igen.');
  }
});
const supportFlight = createSingleFlight();
async function support({ platform = process.platform } = {}) {
  if (!['darwin', 'linux'].includes(platform)) return { available: false, platform, reason: 'Automatisk kommandokørsel med teknisk isolation er endnu ikke understøttet på Windows.' };
  try {
    const node = await nodePath();
    // This key coalesces only overlapping probes; every later call checks the
    // real runner and its installed dependencies again in a new process.
    const identify = async () => JSON.stringify([platform, process.cwd(), await candidateIdentity([node]), await candidateIdentity([runnerPath()], { executable: false })]);
    const identity = await identify();
    const checked = await supportFlight(identity, async () => {
      const { stdout } = await run(node, [runnerPath(), '--check'], { timeout: 20000, env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin', LANG: 'en_US.UTF-8' } });
      const result = JSON.parse(stdout.trim());
      if (await identify() !== identity) throw new Error('Sandbox runtime changed during its dependency check.');
      return { available: result.errors.length === 0, platform, reason: result.errors.length ? 'Kommandobeskyttelsen kan ikke starte: ' + result.errors.join('; ') : '', warnings: result.warnings };
    });
    return structuredClone(checked);
  } catch { return { available: false, platform, reason: 'Kommandobeskyttelsen kan ikke starte på denne computer. Automatisk kommandokørsel er slået fra.' }; }
}
async function prepare({ workspaceRoot, scratchRoot, directory, standby = false }) {
  const status = await support();
  if (!status.available) throw new Error(status.reason);
  const root = await fs.realpath(workspaceRoot), scratch = await fs.realpath(scratchRoot), node = await nodePath();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const trusted = await fs.realpath(directory);
  if (contains(root, trusted) || contains(scratch, trusted)) throw new Error('Kommandobeskyttelsens indstillinger skal ligge uden for arbejdsområdet.');
  const home = path.join(scratch, 'home'), temp = path.join(scratch, 'tmp');
  await fs.mkdir(home, { recursive: true, mode: 0o700 }); await fs.mkdir(temp, { recursive: true, mode: 0o700 });
  const literal = value => ({ path: value, literal: true });
  const systemRead = process.platform === 'darwin'
    ? ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/share', '/System/Library', '/Library/Apple', '/private/etc/ssl', '/private/etc/resolv.conf', '/private/etc/hosts', '/private/etc/localtime']
    : ['/bin', '/sbin', '/usr/bin', '/usr/sbin', '/usr/lib', '/usr/lib64', '/lib', '/lib64', '/usr/share', '/etc/ssl', '/etc/resolv.conf', '/etc/hosts', '/etc/localtime'];
  // Runtimefilerne er læsbare, men brugerens hjem, appdata og øvrige projekter er ikke.
  const runtimeRoot = path.dirname(path.dirname(node));
  const sensitive = protectedPaths.toSandboxGlobs();
  const policy = { version: 1, workspaceRoot: root, scratchRoot: scratch, node, env: { PATH: [path.dirname(node), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':'), HOME: home, TMPDIR: temp, TMP: temp, TEMP: temp, LANG: 'en_US.UTF-8', npm_config_cache: path.join(home, '.npm'), PIP_CACHE_DIR: path.join(home, '.cache', 'pip') }, config: {
    network: { allowedDomains: PACKAGE_HOSTS, deniedDomains: [], strictAllowlist: true, allowLocalBinding: false, allowUnixSockets: [], allowAllUnixSockets: false },
    filesystem: { denyRead: ['/', ...[root, scratch].flatMap(folder => sensitive.map(pattern => path.join(folder, pattern)))], allowRead: [root, scratch, runtimeRoot, ...systemRead, '/dev/null', '/dev/urandom', '/dev/random', '/dev/fd'].map(literal), allowWrite: [root, scratch].map(literal), denyWrite: ['/tmp/claude', '/private/tmp/claude', ...[root, scratch].flatMap(folder => sensitive.map(pattern => path.join(folder, pattern)))] },
    allowPty: false, enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false
  } };
  const identity = crypto.createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  const policyPath = path.join(trusted, 'policy.json'), pluginDirectory = path.join(trusted, 'command-plugin'), pluginPath = path.join(pluginDirectory, 'index.mjs'), readyPath = path.join(trusted, 'ready.json'), readyToken = crypto.randomBytes(32).toString('hex');
  await fs.rm(readyPath, { force: true });
  await fs.writeFile(policyPath, JSON.stringify(policy), { mode: 0o600 });
  const isolatedPrefix = ['exec', '/usr/bin/env', '-i', ...Object.entries(policy.env).map(([key, value]) => key + '=' + quote(value)), quote(node), quote(runnerPath()), quote(policyPath)].join(' ');
  const activationPath = path.join(trusted, 'activation.json');
  const activation = { token: readyToken, enabled: standby !== true };
  await fs.writeFile(activationPath, JSON.stringify(activation), { mode: 0o600 });
  const prefix = standby ? ['exec', quote(node), quote(unpacked(path.join(__dirname, 'command-dispatch.cjs'))), quote(activationPath), quote(readyToken), quote(policyPath)].join(' ') : isolatedPrefix;
  const activationSource = `const active = async () => { const state = JSON.parse(await fs.readFile(${JSON.stringify(activationPath)}, 'utf8')); if (state.token !== ${JSON.stringify(readyToken)} || typeof state.enabled !== 'boolean') throw new Error('Kommandobeskyttelsen er ændret.'); return state.enabled; };`;
  const source = `import fs from 'node:fs/promises';\nimport path from 'node:path';\nexport default { id: 'aura.command-isolation', async setup(ctx) {\n ${activationSource}\n await ctx.shell.hook('create.before', async event => {\n  if (!await active()) return;\n  event.env = { ...Object.fromEntries(Object.keys(process.env).map(key => [key, ''])), ...${JSON.stringify(policy.env)}, SHELL: '/bin/bash' };\n });\n await ctx.tool.hook('execute.before', async event => {\n  if (event.tool !== 'shell') return;\n  const args = event.input;\n  if (args?.background === true) throw new Error('Baggrundskommandoer er ikke tilladt.');\n  const enabled = await active();\n  const roots = ${JSON.stringify([root, scratch])};\n  const cwd = await fs.realpath(args?.workdir || roots[0]);\n  if (enabled && !roots.some(root => { const rel = path.relative(root, cwd); return rel === '' || (!rel.startsWith('..' + path.sep) && rel !== '..' && !path.isAbsolute(rel)); })) throw new Error('Kommandoens arbejdsmappe ligger uden for projektet og opgavens midlertidige mappe.');\n  if (typeof args?.command !== 'string') throw new Error('Kommandoen mangler.');\n  const payload = Buffer.from(JSON.stringify({ command: args.command, cwd })).toString('base64url');\n  args.command = ${JSON.stringify(prefix)} + " '" + payload + "'";\n  args.workdir = cwd;\n });\n await fs.writeFile(${JSON.stringify(readyPath)}, ${JSON.stringify(JSON.stringify({ token: readyToken, identity }))}, { mode: 0o600 });\n} };\n`;
  await require('./engine-opencode2.cjs').writeTrustedPlugin(pluginDirectory, source);
  return { activationPath, enforced: !standby, pluginURL: pluginDirectory, policyPath, identity, readyPath, readyToken, node, runner: runnerPath(), workspaceRoot: root, scratchRoot: scratch };
}
async function activate(sandbox) {
  const state = JSON.parse(await fs.readFile(sandbox.activationPath, 'utf8'));
  if (state.token !== sandbox.readyToken || typeof state.enabled !== 'boolean') throw new Error('Kommandobeskyttelsen er ændret.');
  const policy = await fs.readFile(sandbox.policyPath, 'utf8');
  if (crypto.createHash('sha256').update(policy).digest('hex') !== sandbox.identity) throw new Error('Kommandobeskyttelsens regler er ændret.');
  const temporary = sandbox.activationPath + '.' + crypto.randomUUID();
  await fs.writeFile(temporary, JSON.stringify({ token: sandbox.readyToken, enabled: true }), { mode: 0o600 });
  await fs.rename(temporary, sandbox.activationPath);
  sandbox.enforced = true;
}
module.exports = { activate, support, prepare, PACKAGE_HOSTS, contains, nodePath };
