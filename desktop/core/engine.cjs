const { spawn, execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const run = promisify(execFile);
// Skal svare til runtime-lock.json, som ikke kommer med i den pakkede app. En unit-test holder de to ens.
const VERSION = '1.18.33';

async function findExecutable() {
  const binary = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  // Under udvikling bruges den version, `npm run runtime:prepare` har hentet og kontrolleret, før en eventuel egen installation.
  const prepared = path.join(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`, 'opencode', 'bin', binary);
  const candidates = require('./runtime.cjs').get() ? [require('./runtime.cjs').get().opencode] : [process.env.HARNESS_OPENCODE_PATH, prepared, path.join(os.homedir(), '.opencode', 'bin', binary), 'opencode'].filter(Boolean);
  for (const file of candidates) {
    try { const result = await run(file, ['--version'], { timeout: 15000, windowsHide: true }); if (result.stdout.trim() === VERSION) return file; }
    catch { /* Prøv næste eksplicitte installationsplacering. */ }
  }
  throw new Error(`OpenCode ${VERSION} blev ikke fundet. Kør npm run runtime:prepare, eller angiv HARNESS_OPENCODE_PATH ved start. Din eksisterende installation ændres ikke.`);
}
function permissions(root, references, mode = 'free') {
  const read = { '*': 'allow', '*.env': 'deny', '*.env.*': 'deny', '*.key': 'deny', '*.pem': 'deny', '**/.git/**': 'deny', '**/secrets/**': 'deny', '**/references/**': 'deny' };
  for (const file of references) read[path.join(root, file)] = 'allow';
  if (mode === 'plan') return { '*': 'deny', read, glob: 'allow', list: 'allow', grep: 'ask', webfetch: 'ask', external_directory: 'ask', question: 'allow' };
  return { '*': 'ask', read, glob: 'allow', grep: 'ask', list: 'allow', edit: { '*': 'ask', '*.env*': 'deny', '*.key': 'deny', '*.pem': 'deny', '**/.git/**': 'deny' }, bash: 'ask', external_directory: 'ask', webfetch: 'ask', websearch: 'deny', task: 'deny', skill: 'deny', lsp: 'deny', question: 'allow', todowrite: 'allow', todoread: 'allow' };
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
  constructor({ root, directory, provider, model, references = [], mode = 'free', onEvent = () => {} }) { Object.assign(this, { root, directory, provider, model, references, mode, onEvent }); this.pending = new Map(); this.active = false; }
  async request(url, method = 'GET', body, signal) {
    const response = await fetch(`${this.url}${url}`, { method, headers: { authorization: this.auth, 'content-type': 'application/json', 'x-opencode-directory': encodeURIComponent(this.root) }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(15000), redirect: 'error' });
    if (!response.ok) throw new Error(`Agentmotoren afviste handlingen (HTTP ${response.status}).`);
    if (response.status === 204) return null;
    return response.json();
  }
  async start() {
    const executable = await findExecutable();
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    const password = randomBytes(32).toString('hex');
    this.auth = `Basic ${Buffer.from(`harness:${password}`).toString('base64')}`;
    const permission = permissions(this.root, this.references, this.mode);
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
      this.session = await this.request('/session', 'POST', { title: 'AI Harness' });
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
module.exports = { OpenCodeEngine, findExecutable, isolatedEnv, permissions, engineConfig, VERSION };
