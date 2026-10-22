const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { randomUUID, createHash } = require('node:crypto');
const { stripVTControlCharacters } = require('node:util');
const runtime = require('./runtime.cjs');
const run = promisify(execFile);
const active = state => ['installing', 'starting', 'running', 'stopping'].includes(state);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Kun operativsystemets nødvendige variable. Ingen modelnøgler, NODE_OPTIONS eller npm-tokens.
function environment(source = process.env) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) {
    const actual = Object.keys(source).find(item => item.toUpperCase() === key.toUpperCase());
    if (actual) env[key] = source[actual];
  }
  return { ...env, NO_COLOR: '1', FORCE_COLOR: '0', ASTRO_TELEMETRY_DISABLED: '1', npm_config_update_notifier: 'false' };
}
function cleanOutput(value) {
  return stripVTControlCharacters(value).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{10,}|github_pat_[\w]+)\b/g, '[skjult nøgle]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[skjult]@')
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[:=]\s*)[^\s,;]+/gi, '$1[skjult]');
}
async function regular(root, name, max = 5_000_000) {
  try {
    const file = path.join(root, name), stat = await fs.lstat(file);
    if (!stat.isFile() || stat.size > max) throw new Error(`${name} skal være en almindelig fil på højst ${max / 1_000_000} MB.`);
    return await fs.readFile(file, 'utf8');
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function inspect(root) {
  const manifest = await regular(root, 'package.json', 200_000);
  if (!manifest) return { kind: 'static', supported: false, reason: 'Projektet har ingen package.json.' };
  let pkg;
  try { pkg = JSON.parse(manifest); } catch { return { kind: 'unknown', supported: false, reason: 'package.json kan ikke læses. Bed AI’en rette filen, og prøv igen.' }; }
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  try { if ((await fs.lstat(path.join(root, 'node_modules'))).isSymbolicLink()) throw new Error('node_modules peger på en anden mappe. Brug en almindelig lokal installation.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const script = typeof pkg.scripts?.dev === 'string' ? pkg.scripts.dev.trim() : '';
  const kind = dependencies.astro ? 'astro' : dependencies.vite ? 'vite' : 'unknown';
  const files = { 'package.json': manifest };
  for (const name of ['package-lock.json', 'npm-shrinkwrap.json', '.npmrc', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb', ...['vite.config', 'astro.config'].flatMap(base => ['js','mjs','cjs','ts','mts','cts'].map(ext => `${base}.${ext}`))]) files[name] = await regular(root, name);
  const fingerprint = createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const npm = !pkg.packageManager || /^npm@/.test(pkg.packageManager);
  const otherLock = ['pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb'].some(name => files[name] !== null);
  const simple = kind === 'vite' ? /^(vite|vite dev|vite serve)$/.test(script) : kind === 'astro' && script === 'astro dev';
  let installed = false;
  try {
    const modules = await fs.lstat(path.join(root, 'node_modules'));
    const localPackage = await regular(path.join(root, 'node_modules', kind), 'package.json');
    installed = modules.isDirectory() && Boolean(localPackage);
  } catch { /* Installation tilbydes, men køres aldrig som følge af inspektionen. */ }
  const supported = npm && !otherLock && Boolean(simple) && !pkg.workspaces;
  const reason = !npm || otherLock ? 'Projektet bruger en anden pakkehåndtering end npm. Tilslut en server, der allerede kører.' : pkg.workspaces ? 'Projektet har flere arbejdsområder. Åbn appens egen mappe, eller tilslut dens server.' : !simple ? 'Automatisk opstart kræver et dev-script med vite eller astro dev. Andre kommandoer kan køres separat og tilsluttes her.' : '';
  return { kind, label: kind === 'astro' ? 'Astro' : dependencies.react && kind === 'vite' ? 'React med Vite' : kind === 'vite' ? 'Vite' : 'Andet projekt', supported, installed, fingerprint, reason, install: files['package-lock.json'] || files['npm-shrinkwrap.json'] ? 'ci' : 'install', dependencies: Object.keys(dependencies).sort().slice(0, 100), script };
}
async function nodeRuntime() {
  const candidates = runtime.get() ? [runtime.get().node] : (process.env.PATH || '').split(path.delimiter).filter(p => path.isAbsolute(p)).map(p => path.join(p, process.platform === 'win32' ? 'node.exe' : 'node'));
  for (const candidate of candidates) {
    try {
      const node = await fs.realpath(candidate);
      const { stdout } = await run(node, ['--version'], { env: environment(), timeout: 5000, windowsHide: true });
      const [major, minor] = stdout.trim().replace(/^v/, '').split('.').map(Number);
      if (major < 22 || major === 22 && minor < 12) continue;
      const candidatesNpm = [process.platform === 'win32' ? path.join(path.dirname(node), 'node_modules/npm/bin/npm-cli.js') : path.resolve(path.dirname(node), '../lib/node_modules/npm/bin/npm-cli.js')];
      if (!runtime.get()) for (const bin of (process.env.PATH || '').split(path.delimiter).filter(p => path.isAbsolute(p))) {
        try { const file = await fs.realpath(path.join(bin, 'npm')); if (path.basename(file) === 'npm-cli.js') candidatesNpm.push(file); } catch {}
      }
      for (const npm of candidatesNpm) { try { await fs.access(npm); return { node, npm }; } catch {} }
    } catch { /* Næste eksisterende installation. */ }
  }
  throw new Error('Node.js 22.12 eller nyere med npm blev ikke fundet. Brug installationspakken med de medfølgende værktøjer, eller få hjælp til at installere Node.js.');
}
async function terminate(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }).catch(() => {});
  } else {
    const signal = name => { try { process.kill(-child.pid, name); return true; } catch { return false; } };
    if (!signal('SIGTERM')) return;
    for (let n = 0; n < 20 && signal(0); n++) await delay(50);
    if (signal(0)) signal('SIGKILL');
  }
}
class DevServer {
  constructor({ emit = () => {}, runner = path.join(__dirname, 'dev-server-runner.cjs'), komplaiScript = async () => null } = {}) { this.emit = emit; this.runner = runner; this.komplaiScript = komplaiScript; this.root = null; this.state = 'idle'; this.output = ''; this.generation = 0; }
  snapshot() { return { root: this.root, state: this.state, url: this.url || null, output: this.output, message: this.message || '', kind: this.kind }; }
  update(state, message = '') { this.state = state; this.message = message; this.emit(this.snapshot()); }
  async activate(root) { await this.stop(); this.review = null; this.root = root; this.url = null; this.output = ''; this.kind = null; this.update('idle'); }
  async status() { return { ...this.snapshot(), project: this.root ? await inspect(this.root).catch(error => ({ kind: 'unknown', supported: false, reason: error.message })) : null }; }
  async prepare(action, scripts = false) {
    if (!this.root || active(this.state)) throw new Error('Stop den aktuelle server eller installation først.');
    if (!['install', 'start'].includes(action)) throw new Error('Ukendt handling.');
    const project = await inspect(this.root);
    if (!project.supported) throw new Error(project.reason);
    if (action === 'start' && !project.installed) throw new Error('Installér projektets pakker først.');
    const executables = await nodeRuntime();
    const review = { token: randomUUID(), root: this.root, action, scripts: scripts === true, project, executables };
    this.review = review;
    const command = action === 'install' ? `npm ${project.install} --no-audit --no-fund --include=dev${scripts === true ? ' --ignore-scripts=false' : ' --ignore-scripts'}` : `${project.kind === 'vite' ? 'Vite' : 'Astro'} dev · 127.0.0.1 · ledig port`;
    return { token: review.token, root: this.root, action, scripts: review.scripts, project, command };
  }
  async execute(token) {
    const review = this.review; this.review = null;
    if (!review || token !== review.token || review.root !== this.root || active(this.state)) throw new Error('Gennemgå handlingen igen før godkendelse.');
    const project = await inspect(this.root);
    if (!project.supported || project.fingerprint !== review.project.fingerprint) throw new Error('Projektets opsætning er ændret. Gennemgå handlingen igen.');
    const generation = ++this.generation;
    this.output = ''; this.url = null; this.kind = project.kind;
    const installing = review.action === 'install';
    const args = installing ? [review.executables.npm, project.install, '--no-audit', '--no-fund', '--include=dev', `--ignore-scripts=${!review.scripts}`] : [this.runner, this.root, project.kind];
    this.update(installing ? 'installing' : 'starting');
    const env = environment(); env.PATH = [path.dirname(review.executables.node), env.PATH || ''].join(path.delimiter);
    const child = spawn(review.executables.node, args, { cwd: this.root, env, shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', ...(installing ? [] : ['ipc'])] });
    this.child = child;
    let timer;
    const failure = async message => {
      if (generation !== this.generation) return;
      clearTimeout(timer); const failedGeneration = ++this.generation; this.url = null;
      this.update('stopping', message); await terminate(child);
      if (this.generation !== failedGeneration) return;
      this.child = null; this.update('error', message);
    };
    const output = chunk => {
      if (generation !== this.generation) return;
      // Bevar en afgrænset, maskeret proceslog i hukommelsen. Send aldrig til modellen automatisk.
      this.output = cleanOutput(this.output + chunk.toString()).slice(-16000); this.emit(this.snapshot());
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.once('error', () => void failure('Programmet kunne ikke startes. Kontrollér adgang til projektet og Node.js.'));
    child.once('exit', async (code, signal) => {
      clearTimeout(timer);
      if (generation !== this.generation) return;
      if (installing && code === 0) {
        try {
          if (!(await inspect(this.root)).installed) return void failure('npm afsluttede, men frameworkets pakke mangler. Gennemgå pakkeadresserne og installér igen.');
          await terminate(child);
          if (generation !== this.generation) return;
          this.child = null; this.update('installed', 'Pakkerne er installeret. Du kan nu starte forhåndsvisningen.');
        } catch { void failure('Installationen kunne ikke kontrolleres. Gennemgå projektets package.json og pakker.'); }
      }
      else void failure(installing ? 'Installationen blev ikke gennemført. Se detaljerne, kontrollér netværk og pakker, og prøv igen.' : `Serveren stoppede${code !== null ? ` med kode ${code}` : signal ? ` (${signal})` : ''}. Se detaljerne, og ret projektet før næste forsøg.`);
    });
    if (!installing) {
      timer = setTimeout(() => void failure('Serveren blev ikke klar. Se detaljerne, og kontrollér projektets opsætning.'), 45000);
      this.timer = timer;
      // Runneren beder om komplai Run-appens SDK, når forhåndsvisningen henter /_komplai/run/.
      child.on('message', async message => {
        if (message?.type !== 'komplai-sdk' || !Number.isSafeInteger(message.id) || typeof message.route !== 'string') return;
        const script = await this.komplaiScript(message.route).catch(() => null);
        if (generation === this.generation && child.connected) child.send({ type: 'komplai-sdk', id: message.id, script: typeof script === 'string' ? script : null });
      });
      child.on('message', async message => {
        if (generation !== this.generation || this.state !== 'starting' || message?.type !== 'ready') return;
        let url;
        try {
          url = new URL(message.url);
          if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash) throw new Error();
          const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10000) }); await response.body?.cancel();
          if (!response.ok) throw new Error();
        } catch { return void failure('Serveren startede, men siden kunne ikke vises. Se detaljerne, og kontrollér startsiden.'); }
        if (generation !== this.generation || this.state !== 'starting') return;
        clearTimeout(timer); this.url = url.href; this.update('running', 'Forhåndsvisningen kører.');
      });
    }
    return this.snapshot();
  }
  async stop() {
    if (this.stopping) return this.stopping;
    clearTimeout(this.timer);
    this.review = null; ++this.generation; this.url = null;
    const child = this.child; this.child = null;
    if (!child) { if (this.root) this.update('stopped', 'Forhåndsvisningen er stoppet.'); return; }
    this.update('stopping');
    this.stopping = terminate(child).then(() => this.update('stopped', 'Handlingen er stoppet. Filer og eventuelt delvist installerede pakker er bevaret.')).finally(() => { this.stopping = null; });
    return this.stopping;
  }
}
module.exports = { DevServer, inspect, environment, cleanOutput, nodeRuntime, terminate };
