const { spawn, execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const run = promisify(execFile);
// Skal svare til runtime-lock.json, som ikke kommer med i den pakkede app. En unit-test holder de to ens.
const VERSION = '1.18.33';

// Første opstart kan være langsom, fordi macOS eller et antivirusprogram kontrollerer motoren, før den må køre.
const VERSION_CHECK_MS = 120000;
let verified = null;
async function findExecutable({ bundled = require('./runtime.cjs').get(), timeout = VERSION_CHECK_MS } = {}) {
  const binary = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  // Under udvikling bruges den version, `npm run runtime:prepare` har hentet og kontrolleret, før en eventuel egen installation.
  const prepared = path.join(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`, 'opencode', 'bin', binary);
  const candidates = bundled ? [bundled.opencode] : [process.env.HARNESS_OPENCODE_PATH, prepared, path.join(os.homedir(), '.opencode', 'bin', binary), 'opencode'].filter(Boolean);
  let slow = false;
  for (const file of candidates) {
    if (file === verified) return file;
    try { const result = await run(file, ['--version'], { timeout, windowsHide: true }); if (result.stdout.trim() === VERSION) return (verified = file); }
    catch (error) { if (error.killed) slow = true; /* Prøv næste eksplicitte installationsplacering. */ }
  }
  // Den pakkede app har sin egen motor. Brugeren skal have en forklaring, de kan handle på, ikke en udviklerkommando.
  if (bundled) throw new Error(slow
    ? 'Aura kunne ikke starte sin AI-motor i tide. Computeren kan være travl, eller et antivirusprogram kan være ved at kontrollere programmet. Vent lidt, og prøv igen.'
    : 'Aura kan ikke starte sin AI-motor. Installer appen igen fra det link, du fik.');
  throw new Error(`OpenCode ${VERSION} blev ikke fundet. Kør npm run runtime:prepare, eller angiv HARNESS_OPENCODE_PATH ved start. Din eksisterende installation ændres ikke.`);
}
const SKILL_NAME = /^harness-[a-z0-9]+(-[a-z0-9]+)*$/;
const SKILL_FILE = /^(SKILL\.md|references\/[a-z0-9-]+\.md)$/;
// OpenCode sammenligner fil- og læsetilladelser med stien i forhold til projektets Git-rod, eller til computerens rod uden Git.
// En mappe spærres derfor både som "mappe/…" og "…/mappe/…"; en fuld sti ville aldrig blive ramt. Sidste regel, der passer, gælder.
const everywhere = dir => [`${dir}/*`, `*/${dir}/*`];
// Aktive skills ligger i motorens egen konfigurationsmappe uden for projektet. Mappens navn er projektets nøgle, så mønsteret kun rammer den.
const skillPattern = directory => `*/${path.basename(directory)}/config/skills/*`;
function permissions(root, references, mode = 'free', skills = null) {
  const read = { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '*.key': 'deny', '*.pem': 'deny' };
  for (const dir of ['.git', 'secrets', 'references']) for (const pattern of everywhere(dir)) read[pattern] = 'deny';
  // Udvalgte referencer har et unikt filnavn fra appen, så mønsteret kun rammer den valgte fil.
  for (const file of references) for (const pattern of [file, `*/${file}`]) read[pattern] = 'allow';
  const external = { '*': 'ask' };
  let skill = 'deny';
  if (skills?.names.length) {
    const pattern = skillPattern(skills.directory);
    read[pattern] = 'allow'; external[pattern] = 'allow';
    // Kun de skills, brugerens funktioner har slået til, kan hentes. OpenCodes egne skills er skjult.
    skill = { '*': 'deny', ...Object.fromEntries(skills.names.map(name => [name, 'allow'])) };
  }
  if (mode === 'plan') return { '*': 'deny', read, glob: 'allow', list: 'allow', grep: 'ask', webfetch: 'ask', external_directory: external, skill, question: 'allow' };
  const edit = { '*': 'ask', '*.env*': 'deny', '*.key': 'deny', '*.pem': 'deny' };
  for (const pattern of everywhere('.git')) edit[pattern] = 'deny';
  if (skills?.names.length) edit[skillPattern(skills.directory)] = 'deny';
  return { '*': 'ask', read, glob: 'allow', grep: 'ask', list: 'allow', edit, bash: 'ask', external_directory: external, webfetch: 'ask', websearch: 'deny', task: 'deny', skill, lsp: 'deny', question: 'allow', todowrite: 'allow', todoread: 'allow' };
}
// Motorens skillmappe skrives forfra ved hver start, så en fravalgt skill eller en gammel tilpasning ikke bliver liggende.
async function writeSkills(directory, skills) {
  const root = path.join(directory, 'config', 'skills');
  await fs.rm(root, { recursive: true, force: true });
  for (const skill of skills) {
    if (!SKILL_NAME.test(skill.name) || !skill.files.some(file => file.path === 'SKILL.md')) throw new Error(`Skillen ${skill.name} er ugyldig.`);
    for (const file of skill.files) {
      if (!SKILL_FILE.test(file.path) || typeof file.content !== 'string') throw new Error(`Skillen ${skill.name} indeholder en ugyldig fil.`);
      const target = path.join(root, skill.name, file.path);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, file.content, { mode: 0o600 });
    }
  }
}
function engineConfig(provider, model, permission) {
  return { $schema: 'https://opencode.ai/config.json', model: `harness/${model.id}`, small_model: `harness/${model.id}`, enabled_providers: ['harness'], provider: { harness: provider }, permission, agent: { plan: { permission } }, share: 'disabled', autoupdate: false, snapshot: false, plugin: [], mcp: {}, lsp: false, formatter: false };
}
function isolatedEnv(directory, config, password) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) if (process.env[key]) env[key] = process.env[key];
  for (const [key, sub] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state' })) env[key] = path.join(directory, sub);
  Object.assign(env, { OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_CONFIG_DIR: path.join(directory, 'config'), OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: 'harness', OPENCODE_CLIENT: 'harness' });
  for (const flag of ['DISABLE_PROJECT_CONFIG', 'DISABLE_DEFAULT_PLUGINS', 'DISABLE_EXTERNAL_SKILLS', 'DISABLE_CLAUDE_CODE', 'DISABLE_AUTOUPDATE', 'DISABLE_MODELS_FETCH', 'DISABLE_LSP_DOWNLOAD', 'DISABLE_SHARE', 'DISABLE_EMBEDDED_WEB_UI']) env[`OPENCODE_${flag}`] = 'true';
  return require('./runtime.cjs').gitEnvironment(env);
}
class OpenCodeEngine {
  constructor({ root, directory, provider, model, references = [], mode = 'free', skills = [], onEvent = () => {} }) { Object.assign(this, { root, directory, provider, model, references, mode, skills, onEvent }); this.pending = new Map(); this.active = false; }
  async request(url, method = 'GET', body, signal) {
    const response = await fetch(`${this.url}${url}`, { method, headers: { authorization: this.auth, 'content-type': 'application/json', 'x-opencode-directory': encodeURIComponent(this.root) }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Agentmotoren afviste handlingen (HTTP ${response.status}).`);
    if (response.status === 204) return null;
    return response.json();
  }
  async start() {
    const executable = await findExecutable();
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    await writeSkills(this.directory, this.skills);
    const password = randomBytes(32).toString('hex');
    this.auth = `Basic ${Buffer.from(`harness:${password}`).toString('base64')}`;
    const permission = permissions(this.root, this.references, this.mode, { directory: this.directory, names: this.skills.map(skill => skill.name) });
    this.config = engineConfig(this.provider, this.model, permission);
    if (/\{(?:env|file):/.test(JSON.stringify(this.config))) throw new Error('Konfigurationen indeholder en ikke tilladt variabelhenvisning.');
    this.child = spawn(executable, ['serve', '--hostname', '127.0.0.1', '--port', '0'], { cwd: this.root, env: isolatedEnv(this.directory, this.config, password), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    // Ingen rå proceslogs sendes til UI; de kan indeholde projektindhold.
    this.child.stderr.resume();
    this.child.on('exit', () => { if (this.active) { this.active = false; this.onEvent({ type: 'engine.error', message: 'Agentmotoren stoppede. Start opgaven igen for at oprette en ny session.' }); } });
    try {
      this.url = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.')), 30000);
        let output = '';
        const done = callback => value => { clearTimeout(timer); callback(value); };
        this.child.once('error', done(() => reject(new Error('Agentmotoren kunne ikke startes.'))));
        this.child.once('exit', done(() => reject(new Error('Agentmotoren afsluttede under opstart.'))));
        this.child.stdout.on('data', chunk => { output = (output + chunk.toString()).slice(-8000); const found = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (found) done(resolve)(found[0]); });
      });
      const health = await this.request('/global/health');
      if (health.version !== VERSION) throw new Error('Agentmotorens version matcher ikke den afprøvede version.');
      const effective = await this.request('/config');
      if (effective.small_model !== this.config.small_model || !isDeepStrictEqual(effective.enabled_providers, ['harness']) || effective.provider?.harness?.npm !== this.provider.npm || effective.provider?.harness?.options?.baseURL !== this.provider.options.baseURL || effective.provider?.harness?.options?.apiKey !== this.provider.options.apiKey || effective.model !== this.config.model || effective.share !== 'disabled' || effective.snapshot !== false || !isDeepStrictEqual(effective.permission, permission) || !isDeepStrictEqual(effective.agent?.plan?.permission, permission) || Object.keys(effective.mcp || {}).length || (effective.plugin || []).length) throw new Error('Agentens effektive indstillinger afviger. En lokal eller administreret konfiguration kan være årsagen.');
      this.session = await this.request('/session', 'POST', { title: 'Aura' });
      this.active = true;
      this.listen();
      return this.session.id;
    } catch (error) { await this.close(); throw error; }
  }
  async listen() {
    this.eventsAbort = new AbortController();
    try {
      const response = await fetch(`${this.url}/event`, { headers: { authorization: this.auth, 'x-opencode-directory': encodeURIComponent(this.root) }, signal: this.eventsAbort.signal });
      if (!response.ok) throw new Error();
      const decoder = new TextDecoder(); let buffer = '';
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n'); buffer = blocks.pop();
        for (const block of blocks) {
          const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n');
          if (!data) continue;
          let event; try { event = JSON.parse(data); } catch { continue; }
          const props = event.properties || {};
          const sessionID = props.sessionID || props.part?.sessionID || props.info?.sessionID;
          if (sessionID && sessionID !== this.session.id) continue;
          if (event.type === 'permission.asked') this.pending.set(props.id, props);
          if (event.type === 'permission.replied') this.pending.delete(props.requestID);
          this.onEvent(event);
        }
      }
    } catch {
      if (!this.eventsAbort.signal.aborted && this.active) { this.onEvent({ type: 'engine.error', message: 'Forbindelsen til agentens hændelser blev afbrudt. Opgaven stoppes.' }); await this.abort().catch(() => {}); }
    }
  }
  async send(text, system) {
    if (!this.active) throw new Error('Agenten er ikke startet.');
    return this.request(`/session/${this.session.id}/prompt_async`, 'POST', { model: { providerID: 'harness', modelID: this.model.id }, agent: this.mode === 'plan' ? 'plan' : 'build', system, parts: [{ type: 'text', text }] });
  }
  async abort() { if (this.session && this.url) await this.request(`/session/${this.session.id}/abort`, 'POST'); this.pending.clear(); }
  async reply(id, allow) { if (!this.pending.has(id)) throw new Error('Godkendelsen findes ikke længere.'); await this.request(`/permission/${encodeURIComponent(id)}/reply`, 'POST', { reply: allow ? 'once' : 'reject' }); this.pending.delete(id); }
  async messages() { return this.request(`/session/${this.session.id}/message`); }
  async diff() { return this.request(`/session/${this.session.id}/diff`); }
  async close() { this.active = false; this.eventsAbort?.abort(); this.pending.clear(); if (this.child && this.child.exitCode === null) { this.child.kill(); await new Promise(resolve => { const timer = setTimeout(() => { this.child.kill('SIGKILL'); resolve(); }, 3000); this.child.once('exit', () => { clearTimeout(timer); resolve(); }); }); } }
}
module.exports = { OpenCodeEngine, findExecutable, isolatedEnv, permissions, engineConfig, writeSkills, VERSION };
