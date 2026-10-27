const { spawn, execFile } = require('node:child_process');
const { promisify, isDeepStrictEqual } = require('node:util');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomBytes } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const run = promisify(execFile);
const { EngineEvents } = require('./engine-events.cjs');
const { setTimeout: delay } = require('node:timers/promises');
// Skal svare til runtime-lock.json, som ikke kommer med i den pakkede app. En unit-test holder de to ens.
const VERSION = '2.1.4';
const v2 = require('./engine-opencode2.cjs');
const taskTools = require('./engine-opencode2-todos.cjs');
const protectedPaths = require('./protected-paths.cjs');
const { localMetrics, RunMeasurement } = require('./run-metrics.cjs');
const { createStartupRecord } = require('./engine-startup.cjs');
const parseOpenCodeVersion = value => /^(?:opencode v)?(\d+\.\d+\.\d+)\s*$/.exec(String(value).trim())?.[1] || null;

// Første opstart kan være langsom, fordi macOS eller et antivirusprogram kontrollerer motoren, før den må køre.
const VERSION_CHECK_MS = 120000;
const SUMMARIZE_TIMEOUT_MS = 20 * 60 * 1000;
let verified = null;
async function findExecutable({ bundled = require('./runtime.cjs').get(), timeout = VERSION_CHECK_MS } = {}) {
  const binary = process.platform === 'win32' ? 'opencode.exe' : 'opencode';
  // Under udvikling bruges den version, `npm run runtime:prepare` har hentet og kontrolleret, før en eventuel egen installation.
  const prepared = path.join(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`, 'opencode', 'bin', binary);
  const candidates = bundled ? [bundled.opencode] : [process.env.HARNESS_OPENCODE_PATH, prepared, path.join(os.homedir(), '.opencode', 'bin', binary), 'opencode'].filter(Boolean);
  let slow = false;
  for (const file of candidates) {
    if (file === verified) return file;
    try { const result = await run(file, ['--version'], { timeout, windowsHide: true }); if (parseOpenCodeVersion(result.stdout) === VERSION) return (verified = file); }
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
// Aktive skills ligger i motorens egen konfigurationsmappe uden for projektet. Mappens navn er projektets nøgle, så mønsteret kun rammer den.
const skillPattern = directory => `*/${path.basename(directory)}/config/skills/*`;
function permissions(root, references, mode = 'free', skills = null) {
  const read = { '*': 'allow', ...Object.fromEntries(protectedPaths.toOpenCodeGlobs().map(pattern => [pattern, 'deny'])) };
  // Udvalgte referencer har et unikt filnavn fra appen, så mønsteret kun rammer den valgte fil.
  for (const file of references) if (!protectedPaths.isProtected(file, { references: false })) for (const pattern of [file, `*/${file}`]) read[pattern] = 'allow';
  const external = { '*': 'ask' };
  let skill = 'deny';
  if (skills?.names.length) {
    const pattern = skillPattern(skills.directory);
    read[pattern] = 'allow'; external[pattern] = 'allow';
    // Kun de skills, brugerens funktioner har slået til, kan hentes. OpenCodes egne skills er skjult.
    skill = { '*': 'deny', ...Object.fromEntries(skills.names.map(name => [name, 'allow'])) };
  }
  if (['chat', 'plan'].includes(mode)) return { '*': 'deny', read, glob: 'allow', list: 'allow', grep: 'ask', webfetch: 'ask', external_directory: external, skill, question: 'allow' };
  const edit = { '*': 'ask', ...Object.fromEntries(protectedPaths.toOpenCodeGlobs().map(pattern => [pattern, 'deny'])) };
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
      const references = skill.files.filter(item => item.path.startsWith('references/'));
      const content = file.path === 'SKILL.md' && references.length
        ? file.content + '\n\n## Referencefiler i denne kørsel\n\nLæs referencer med read-værktøjet og disse præcise filstier. De er en del af denne skill, ikke projektets private references-mappe.\n' + references.map(item => `- ${JSON.stringify(path.join(root, skill.name, item.path))}`).join('\n') + '\n'
        : file.content;
      await fs.writeFile(target, content, { mode: 0o600 });
    }
  }
}
function engineConfig(provider, model, permission) {
  return { $schema: 'https://opencode.ai/config.json', model: `harness/${model.id}`, small_model: `harness/${model.id}`, enabled_providers: ['harness'], provider: { harness: provider }, permission, agent: { plan: { permission } }, share: 'disabled', autoupdate: false, snapshot: false, plugin: [], mcp: {}, lsp: false, formatter: false };
}
function isolatedEnv(directory, config, password, { commandIsolation = false } = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'USERPROFILE', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG']) if (process.env[key]) env[key] = process.env[key];
  for (const [key, sub] of Object.entries({ XDG_CONFIG_HOME: 'config', XDG_DATA_HOME: 'data', XDG_CACHE_HOME: 'cache', XDG_STATE_HOME: 'state' })) env[key] = path.join(directory, sub);
  // OpenCode søger altid også i HOME/.opencode, selv med projektkonfiguration slået fra.
  // Motorens plugins, pakker og hjælpeprocesser må kun bruge Auras egne mapper.
  env.HOME = path.join(directory, 'home'); env.USERPROFILE = env.HOME;
  Object.assign(env, { OPENCODE_CONFIG_CONTENT: JSON.stringify(config), OPENCODE_CONFIG_DIR: path.join(directory, 'config'), OPENCODE_SERVER_PASSWORD: password, OPENCODE_SERVER_USERNAME: 'opencode', OPENCODE_TEST_HOME: env.HOME, OPENCODE_CLIENT: 'harness' });
  if (process.platform !== 'win32' && commandIsolation) env.SHELL = '/bin/bash';
  for (const flag of ['DISABLE_PROJECT_CONFIG', 'DISABLE_DEFAULT_PLUGINS', 'DISABLE_EXTERNAL_SKILLS', 'DISABLE_CLAUDE_CODE', 'DISABLE_AUTOUPDATE', 'DISABLE_MODELS_FETCH', 'DISABLE_LSP_DOWNLOAD', 'DISABLE_SHARE', 'DISABLE_EMBEDDED_WEB_UI']) env[`OPENCODE_${flag}`] = 'true';
  // OpenCode tilbyder kun spørgeværktøjet til sine egne klienter. Aura viser spørgsmålene selv, ét ad gangen med klikbare svar.
  env.OPENCODE_ENABLE_QUESTION_TOOL = 'true';
  // OpenCode 1.x sender højst 32.000 tokens pr. svar, uanset modellen. En tænkende model kunne bruge hele loftet på at
  // tænke og stoppe uden svar. Loftet hæves til Auras højeste, så modellens egen grænse i opsætningen bestemmer.
  env.OPENCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = String(require('./connections.cjs').OUTPUT_CEILING);
  return require('./runtime.cjs').gitEnvironment(env);
}
// V2 loads its pinned built-in runtime; Aura's local plugins never install SDKs.
async function pluginRuntimeFiles() { return []; }
async function pluginRuntimePatterns() { return []; }
async function writePluginRuntime(directory) {
  directory = await fs.realpath(directory);
  // Only retire the exact artifacts generated by Aura 1.x. Preserve unknown
  // user material and reject discovery authority before starting the process.
  for (const folder of [path.join(directory, 'config'), path.join(directory, 'config', 'opencode')]) {
    const manifestPath = path.join(folder, 'package.json');
    const manifest = await fs.readFile(manifestPath, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!manifest) continue;
    const version = manifest.dependencies?.['@opencode-ai/plugin'];
    const expected = { name: 'aura-agent-plugins', private: true, dependencies: { '@opencode-ai/plugin': version } };
    if (!/^1\.\d+\.\d+$/.test(version || '') || !isDeepStrictEqual(manifest, expected)) throw new Error('Ukendt lokal motorkonfiguration er bevaret. Aura kan ikke migrere den automatisk.');
    const lockPath = path.join(folder, 'package-lock.json');
    const lock = await fs.readFile(lockPath, 'utf8').then(JSON.parse);
    if (!isDeepStrictEqual(lock, { name: 'aura-agent-plugins', lockfileVersion: 3, packages: { '': { dependencies: expected.dependencies }, 'node_modules/@opencode-ai/plugin': { version } } })) throw new Error('Ukendt lokal plugin-lås er bevaret.');
    const linkPath = path.join(folder, 'node_modules');
    const link = await fs.lstat(linkPath).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (link && !link.isSymbolicLink()) throw new Error('Ukendte lokale plugin-filer er bevaret.');
    if (link) {
      const target = await fs.readlink(linkPath);
      if (!/[/\\]desktop[/\\]node_modules$/.test(target)) throw new Error('Ukendt lokal plugin-reference er bevaret.');
      await fs.unlink(linkPath);
    }
    await fs.unlink(manifestPath); await fs.unlink(lockPath);
  }
  await v2.validatePrivateConfigDirectory(directory);
}
// Embedded in a trusted plugin before file tools run, including diff preparation.
// Keep the existing exported name/API; the guard now also protects mutation paths.
function createReadGuard({ fs, path, root, references = [], selectedFiles = [], classify = protectedPaths.classify }) {
  const selected = new Set([...references.map(file => path.resolve(root, file)), ...selectedFiles]);
  const protectedFile = file => { const result = classify(file); return result.invalid || result.credentials || result.metadata || result.references; };
  const denied = (file, reading) => { const result = classify(file); return result.invalid || result.credentials || result.metadata || result.references && (!reading || !selected.has(file)); };
  const canonical = async (file, allowMissing) => {
    try { return await fs.realpath(file); }
    catch (error) {
      if (!allowMissing || error.code !== 'ENOENT') throw error;
      // A dangling symlink is not a new ordinary file. Never follow its target
      // after review. Resolve the nearest existing parent for new descendants.
      const entry = await fs.lstat(file).catch(failure => { if (failure.code === 'ENOENT') return null; throw failure; });
      if (entry) throw new Error('Aura beskytter denne fil: målet kan ikke kontrolleres sikkert.');
      const parent = path.dirname(file);
      if (parent === file) throw error;
      return path.join(await canonical(parent, true), path.basename(file));
    }
  };
  const checked = async (file, reading, unlinkSource = false) => {
    if (typeof file !== 'string' || !file || /[\0\r\n]/.test(file)) throw new Error('Aura beskytter denne fil: stien kan ikke kontrolleres sikkert.');
    const requested = path.resolve(root, file);
    if (denied(requested, reading)) throw new Error('Aura beskytter denne fil.');
    const actual = await canonical(requested, !reading);
    if (denied(actual, reading) || reading && (protectedFile(requested) || protectedFile(actual)) && !selected.has(actual)) throw new Error('Aura beskytter denne fil.');
    // Canonicalizing an unlink source would remove the target instead of its
    // symlink. Keeping the link would reintroduce a target-change race before
    // native patch reads it. Refuse only this ambiguous final-link operation.
    if (unlinkSource && (await fs.lstat(requested).catch(error => { if (error.code === 'ENOENT') return null; throw error; }))?.isSymbolicLink()) throw new Error('Aura beskytter denne fil: sletning eller flytning gennem et symbolsk link kan ikke kontrolleres sikkert.');
    return actual;
  };
  return async (input, output) => {
    if (['read', 'write', 'edit'].includes(input.tool)) {
      // OpenCode's own file/external-directory approval sees the actual target.
      output.args.filePath = await checked(output.args?.filePath, input.tool === 'read');
    } else if (input.tool === 'patch') {
      const text = output.args?.patchText;
      if (typeof text !== 'string' || text.includes('\0')) throw new Error('Aura beskytter denne fil: ændringsformatet kunne ikke kontrolleres.');
      // These wrappers/optional metadata are supported by the pinned native
      // parser. Unwrap once and emit canonical boundaries, never execute a shell.
      const trimmed = text.trim();
      const body = trimmed.match(/^(?:cat\s+)?<<(['"]?)(\w+)\1\s*\n([\s\S]*?)\n\2\s*$/)?.[3] ?? trimmed;
      const lines = body.split(/\r?\n/);
      if (lines[0]?.trim() !== '*** Begin Patch' || lines.at(-1)?.trim() !== '*** End Patch') throw new Error('Aura beskytter denne fil: ændringsformatet kunne ikke kontrolleres.');
      lines[0] = '*** Begin Patch'; lines[lines.length - 1] = '*** End Patch';
      let targets = 0;
      for (let index = 1; index < lines.length - 1; index++) {
        if (index === 1 && lines[index].trim().startsWith('*** Environment ID:') && lines[index].trim().slice(19).trim()) { lines[index] = lines[index].trim(); continue; }
        // The native parser accepts whitespace around control lines. Refuse
        // ambiguous spellings instead of letting an unreviewed second target
        // hide as diff context. Ordinary +, - and other context remain data.
        if (lines[index].trim().startsWith('*** ') && lines[index].trim() !== lines[index]) throw new Error('Aura beskytter denne fil: ændringsformatet kunne ikke kontrolleres.');
        const match = /^(\*\*\* (?:(?:Add|Update|Delete) File|Move to): )(.*)$/.exec(lines[index]);
        if (match) {
          let nextHeader = index + 1;
          while (lines[nextHeader] === '*** End of File') nextHeader++;
          const unlinkSource = match[1] === '*** Delete File: ' || match[1] === '*** Update File: ' && lines[nextHeader]?.startsWith('*** Move to: ');
          lines[index] = match[1] + await checked(match[2], false, unlinkSource); targets++;
        }
        else if (lines[index].startsWith('*** ') && lines[index] !== '*** End of File') throw new Error('Aura beskytter denne fil: ændringsformatet kunne ikke kontrolleres.');
      }
      if (!targets) throw new Error('Aura beskytter denne fil: ændringsformatet kunne ikke kontrolleres.');
      // Check every source AND destination before returning any rewritten input.
      output.args.patchText = lines.join('\n');
    }
  };
}
async function writeReadGuard(directory, root, references, skills = []) {
  root = await fs.realpath(root);
  const pluginDirectory = path.join(directory, 'read-protection'), pluginPath = path.join(pluginDirectory, 'index.mjs'), readyPath = path.join(directory, 'read-guard-ready.json'), token = randomBytes(32).toString('hex');
  const selectedFiles = skills.flatMap(skill => skill.files.map(file => path.join(directory, 'config', 'skills', skill.name, file.path)));
  await fs.rm(readyPath, { force: true });
  const source = `import fs from 'node:fs/promises';\nimport path from 'node:path';\nconst guard = (${createReadGuard.toString()})({ fs, path, root: ${JSON.stringify(root)}, references: ${JSON.stringify(references)}, selectedFiles: ${JSON.stringify(selectedFiles)}, classify: (${protectedPaths.createPathClassifier.toString()})(${JSON.stringify(protectedPaths.RULES)}) });\nexport default { id: 'aura.read-protection', async setup(ctx) {\n await ctx.tool.hook('execute.before', async event => { if (!['read', 'write', 'edit', 'patch'].includes(event.tool)) return; const output = { args: { filePath: event.input?.path, patchText: event.input?.patchText } }; await guard(event, output); if (event.tool === 'patch') event.input.patchText = output.args.patchText; else event.input.path = output.args.filePath; });\n await fs.writeFile(${JSON.stringify(readyPath)}, ${JSON.stringify(JSON.stringify({ token }))}, { mode: 0o600 });\n} };\n`;
  await v2.writeTrustedPlugin(pluginDirectory, source);
  return { pluginURL: pluginDirectory, readyPath, token };

}
class OpenCodeEngine {
  // resume: en tidligere OpenCode-session for samme samtale. Findes den ikke længere, oprettes en ny.
  constructor({ root, directory, provider, model, references = [], mode = 'free', skills = [], resume = null, sandbox = null, privacyIsolation = null, detached = false, recovery = {}, measurement = null, onEvent = () => {} }) { Object.assign(this, { root, directory, provider, model, references, mode, skills, resume, sandbox, privacyIsolation, detached, recovery, onEvent }); this.promptEpoch = 0; this.lifecycle = new AbortController(); this.closed = false; this.closedPermissions = new Set(); this.closedQuestions = new Set(); this.pendingQuestions = new Map(); this.pending = new Map(); this.active = false; this.resumed = false; this.adapter = new v2.EventAdapter(root); this.startup = createStartupRecord({ mode, privacyIsolation: Boolean(privacyIsolation), sandbox: Boolean(sandbox), detached }); this.setRunMeasurement(measurement); }
  setRunMeasurement(measurement) { this.pendingMeasurement = measurement instanceof RunMeasurement ? measurement : null; }
  async wire(url, method = 'GET', body, signal) {
    this.lifecycle.signal.throwIfAborted();
    const response = await fetch(`${this.url}${url}`, { method, headers: { authorization: this.auth, 'content-type': 'application/json', 'x-opencode-directory': encodeURIComponent(this.root) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.any([this.lifecycle.signal, signal || AbortSignal.timeout(15000)]), redirect: 'error' });
    if (!response.ok) throw Object.assign(new Error(`Agentmotoren afviste handlingen (HTTP ${response.status}).`), { status: response.status });
    if (response.status === 204) return null;
    return response.json();
  }
  // Keep the host approval/session contract stable while translating the wire API.
  async request(url, method = 'GET', body, signal) {
    if (url.startsWith('/api/')) return this.wire(url, method, body, signal);
    const id = encodeURIComponent(this.session?.id || '');
    const endpoint = `/api/session/${id}`;
    if (url === '/global/health') return this.wire('/api/info', method, body, signal);
    if (url === '/session' && method === 'POST') return (await this.wire('/api/session', method, { ...body, agent: ['chat','plan'].includes(this.mode) ? 'plan' : 'build', model: { providerID:'harness', id:this.model.id }, location:{ directory:this.root } }, signal))?.data;
    if (url === '/session/status') {
      const result = await this.wire('/api/session/active', method, body, signal);
      if (!result?.data || typeof result.data !== 'object') throw new Error('Ugyldig sessionsstatus.');
      return Object.fromEntries(Object.entries(result.data).map(([key,value]) => [key, { ...value, type: value.type === 'running' ? 'busy' : value.type }]));
    }
    if (url === '/permission' || url === '/question') {
      if (!this.session) return [];
      const kind = url === '/permission' ? 'permission' : 'form';
      const result = await this.wire(`${endpoint}/${kind}`, method, body, signal);
      if (!Array.isArray(result?.data)) throw new Error('Ugyldige ventende handlinger.');
      return result.data.flatMap(item => this.adapter.normalize(kind === 'permission' ? { type:'permission.asked', data:item } : { type:'form.created', data:{ form:item } }).filter(event => event.type.endsWith('.asked')).map(event => event.properties));
    }
    let match;
    if ((match = /^\/permission\/([^/]+)\/reply$/.exec(url))) return this.wire(`${endpoint}/permission/${match[1]}/reply`, method, { decision:body.reply, ...(body.message ? { message:body.message } : {}) }, signal);
    if ((match = /^\/question\/([^/]+)\/reply$/.exec(url))) return this.answerQuestion(decodeURIComponent(match[1]), body.answers, signal);
    if ((match = /^\/session\/([^/]+)(.*)$/.exec(url))) {
      const base = `/api/session/${match[1]}`, suffix = match[2];
      if (!suffix) return (await this.wire(base, method, body, signal))?.data;
      if (suffix === '/message') return this.nativeMessages(signal);
      if (suffix.startsWith('/message/')) {
        const result = (await this.wire(base + suffix, method, body, signal))?.data;
        return this.adapter.message(result, this.session.id);
      }
      if (suffix === '/abort') { this.adapter.expectUserInterrupt(this.session.id); return this.wire(base + '/interrupt?resume=false', method, undefined, signal); }
      if (suffix === '/diff') return (await this.wire(base + suffix, method, body, signal))?.data || [];
      if (suffix === '/summarize') {
        const session = (await this.wire(base, 'GET', undefined, signal))?.data;
        if (!session || session.id !== this.session.id) throw new Error('Sammenfatningens session kunne ikke kontrolleres.');
        if (this.compaction) this.compaction.baseline = { idle:JSON.stringify(session.time?.idle ?? null) };
        const result = await this.wire(base + '/compact', method, {}, signal);
        if (this.compaction) this.compaction.inputID = result?.data?.id;
        return result;
      }
      if (suffix === '/prompt_async') {
        const epoch = this.promptEpoch;
        const measurement = this.activeMeasurement;
        const current = () => { if (epoch !== this.promptEpoch || !this.active || this.eventsAbort?.signal.aborted) throw new Error('Opgaven blev stoppet.'); };
        current(); await this.wire(base + '/agent', 'POST', { agent:body.agent }, signal);
        current(); await this.wire(base + '/model', 'POST', { model:{ providerID:body.model.providerID, id:body.model.modelID } }, signal);
        current(); await this.wire(`/api/experimental/session/${match[1]}/instructions/entries/aura-task`, 'PUT', { value:String(body.system || '') }, signal);
        current(); await this.captureBaseline(signal); current();
        this.adapter.cancelExpectedInterrupt(this.session.id);
        measurement?.dispatched();
        const result = await this.wire(base + '/prompt', 'POST', { id:body.messageID, text:body.parts.map(part => part.text || '').join('\n'), resume:true }, signal);
        measurement?.acknowledged('http');
        return result;
      }
    }
    throw new Error('Ukendt motorhandling.');
  }
  async nativeMessages(signal) {
    const result = [], seen = new Set(); let cursor, bytes = 0, parent;
    do {
      const page = await this.wire(`/api/session/${encodeURIComponent(this.session.id)}/message?limit=100&${cursor ? `cursor=${encodeURIComponent(cursor)}` : 'order=asc'}`, 'GET', undefined, signal);
      if (!Array.isArray(page?.data)) throw new Error('Agentmotorens samtale kunne ikke læses.');
      bytes += Buffer.byteLength(JSON.stringify(page.data));
      if (bytes > 32 * 1024 * 1024 || result.length + page.data.length > 10000) throw new Error('Samtalen er for stor til sikker genoptagelse.');
      for (const native of page.data) {
        const message = this.adapter.message(native, this.session.id);
        if (message.info.role === 'user') parent = native.id;
        else message.info.parentID = parent;
        result.push(message);
      }
      cursor = page.data.length ? page.cursor?.next : null;
      if (cursor && seen.has(cursor)) throw new Error('Ugyldig samtalepaginering.');
      if (cursor) seen.add(cursor);
    } while (cursor);
    return result;
  }
  async captureBaseline(signal) {
    const previous = this.turnBaseline; this.turnBaseline = null;
    try {
      const [messages, session, statuses] = await Promise.all([this.nativeMessages(signal), this.wire(`/api/session/${encodeURIComponent(this.session.id)}`, 'GET', undefined, signal), this.request('/session/status', 'GET', undefined, signal)]);
      if (statuses[this.session.id]?.type === 'busy' || session?.data?.id !== this.session.id) throw new Error('Agenten arbejder allerede.');
      this.turnBaseline = { ids:new Set(messages.map(message => message.info.id)), idle:JSON.stringify(session.data.time?.idle ?? null), suspended:JSON.stringify(session.data.time?.suspended ?? null) };
    } catch (error) { this.turnBaseline = previous; throw error; }
  }
  async answerQuestion(id, answers, signal) {
    const form = this.adapter.forms.get(id);
    if (!form || !Array.isArray(answers) || answers.length !== form.fields.length) throw new Error('Spørgsmålet er ikke længere aktuelt.');
    const answer = Object.fromEntries(form.fields.map((field,index) => [field.key, field.type === 'multiselect' ? answers[index] : answers[index]?.[0] || '']));
    return this.wire(`/api/session/${encodeURIComponent(this.session.id)}/form/${encodeURIComponent(id)}/reply`, 'POST', { answer }, signal);
  }
  decodeEvent(event) {
    if (!event.data) return [event]; // Host fixtures and already adapted events.
    if ((event.data.sessionID || event.data.form?.sessionID) !== this.session?.id) return [];
    const id = event.data.assistantMessageID;
    if (id && this.turnBaseline?.ids.has(id)) return [];
    return this.adapter.normalize(event).map(item => {
      if (['session.execution.succeeded','session.execution.failed','session.execution.interrupted'].includes(event.type)) item.nativeTerminal = true;
      if (event.type === 'session.execution.failed') this.nativeExecutionError = item.properties?.error;
      if (item.type === 'message.updated' && item.properties.info.role === 'assistant') item.properties.info.parentID = this.promptID;
      return item;
    });
  }
  // Fortsætter samtalens tidligere OpenCode-session, hvis motoren stadig kender den; ellers oprettes en ny.
  async openSession() {
    this.resumed = false;
    if (typeof this.resume === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(this.resume)) {
      try { const session = await this.request(`/session/${this.resume}`); if (session?.id === this.resume) { if (session.location?.directory && path.resolve(session.location.directory) !== path.resolve(this.root)) throw new Error('Den gemte session tilhører et andet arbejdsområde.'); this.session = session; this.resumed = true; } } catch (error) { if (error.status !== 404) throw error; }
    }
    if (!this.resumed) this.session = await this.request('/session', 'POST', { title: 'Aura' });
    return this.session;
  }
  start() {
    if (this.closed) return Promise.reject(new Error('Agentmotoren er lukket.'));
    if (this.startPromise) return this.startPromise;
    const measurement = this.pendingMeasurement ||= localMetrics.create({ mode: this.mode });
    measurement.engineStarting();
    this.startPromise = (async () => {
      try { const result = await this.startActual(); this.assertStarting(); measurement.engineReady(); return result; }
      catch (error) { this.startup.fail(error); this.startup.finalize(); measurement.finish('error'); this.stopLifecycle(); await this.retireOwnedResources(); throw error; }
    })();
    return this.startPromise;
  }
  assertStarting() {
    if (this.closed) throw new Error('Agentmotorens opstart blev stoppet.');
    if (this.childStartFailed || this.child && (this.child.exitCode !== null || this.child.signalCode != null)) throw new Error('Agentmotoren afsluttede under opstart.');
  }
  ownChild(child) {
    this.child = child;
    this.startup.child(child);
    // An error can arrive while isolation attestation is awaited, before the
    // startup URL listener exists. Keep it handled and check before proceeding.
    child.on('error', error => { this.childStartFailed = true; if (error) this.startup.fail(error); });
    return child;
  }
  async startActual() {
    const startup = this.startup;
    startup.phase('find-executable');
    const executable = await findExecutable();
    this.assertStarting();
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.directory = await fs.realpath(this.directory);
    await fs.mkdir(path.join(this.directory, 'home'), { recursive: true, mode: 0o700 });
    await writePluginRuntime(this.directory);
    startup.phase('prepare-dirs');
    await writeSkills(this.directory, this.skills);
    startup.phase('skills');
    const readGuard = await writeReadGuard(this.directory, this.root, this.references, this.skills);
    startup.phase('read-guard');
    const password = randomBytes(32).toString('hex');
    this.auth = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`;
    const permission = permissions(this.root, this.references, this.mode, { directory: this.directory, names: this.skills.map(skill => skill.name) });
    if (this.sandbox) {
      const trustedPattern = `*/${path.basename(path.dirname(this.sandbox.policyPath))}/*`;
      permission.read[trustedPattern] = 'deny';
      if (typeof permission.edit === 'object') permission.edit[trustedPattern] = 'deny';
      permission.external_directory[trustedPattern] = 'deny';
    }
    const taskPlugin = path.join(this.directory, 'task-tools');
    await taskTools.writeTrustedAsset(taskPlugin);
    startup.phase('command-isolation');
    const plugins = [readGuard.pluginURL, taskPlugin, ...(this.sandbox ? [this.sandbox.pluginURL] : [])];
    this.config = v2.nativeConfig(engineConfig(this.provider, this.model, permission), plugins);
    if (/\{(?:env|file):/.test(JSON.stringify(this.config))) throw new Error('Konfigurationen indeholder en ikke tilladt variabelhenvisning.');
    // Terminalklienten styrer Stop via API'et; dens Ctrl+C må ikke også ramme motorens procesgruppe.
    let privacyPort = 0;
    if (this.privacyIsolation) {
      const probe = require('node:net').createServer();
      await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(0, '127.0.0.1', resolve); });
      privacyPort = probe.address().port; await new Promise(resolve => probe.close(resolve));
    }
    this.assertStarting();
    const args = ['serve', '--hostname', '127.0.0.1', '--port', String(privacyPort)];
    const environment = isolatedEnv(this.directory, this.config, password, { commandIsolation: Boolean(this.sandbox) });
    if (this.privacyIsolation && process.platform !== 'darwin') throw new Error('Det beskyttede arbejdsmiljø er ikke tilgængeligt på denne platform. Ingen hostreserve er startet.');
    if (process.platform === 'win32') {
      // Windows has no POSIX process groups. Preserve its existing direct-owner
      // shutdown until a tested Job Object implementation is available.
      this.ownChild(spawn(executable, args, { cwd:this.root, env:environment, detached:this.detached, windowsHide:true, stdio:['ignore','pipe','pipe'] }));
      startup.phase('spawn');
    } else {
      const guardianNode = require('./runtime.cjs').get()?.node || (this.privacyIsolation ? path.join(__dirname, '..', '.runtime', `${process.platform}-${process.arch}`, 'node', 'bin', 'node') : process.execPath);
      const guardian = path.join(__dirname, 'engine-guardian.cjs').replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
      environment.ELECTRON_RUN_AS_NODE = '1';
      const launchArgs = [guardian, executable === 'opencode' ? executable : path.resolve(executable), ...args];
      const launchOptions = { cwd:this.root, env:environment, detached:this.detached, windowsHide:true, stdio:['ignore','pipe','pipe','ipc'] };
      if (this.privacyIsolation) {
        const lease = this.privacyLease = await this.privacyIsolation({ executable, root:this.root, directory:this.directory, port:privacyPort, guardianNode, guardian, args, environment });
        this.assertStarting();
        if (!lease || typeof lease.launchSpec !== 'function' || typeof lease.attest !== 'function' || (await lease.verify()).available !== true) throw new Error('Det beskyttede arbejdsmiljø kunne ikke bekræftes.');
        this.assertStarting();
        const launch = await lease.launchSpec(guardianNode, launchArgs, launchOptions);
        this.assertStarting();
        const child = this.ownChild(spawn(launch.file, launch.args, launch.options));
        await new Promise((resolve, reject) => {
          const done = error => { child.removeListener('spawn', spawned); child.removeListener('error', failed); child.removeListener('exit', stopped); this.lifecycle.signal.removeEventListener('abort', stopped); error ? reject(error) : resolve(); };
          const spawned = () => done(), failed = () => done(new Error('Agentmotoren kunne ikke startes.')), stopped = () => done(new Error('Agentmotorens opstart blev stoppet.'));
          child.once('spawn', spawned); child.once('error', failed); child.once('exit', stopped); this.lifecycle.signal.addEventListener('abort', stopped, { once: true });
        });
        this.assertStarting();
        startup.phase('spawn');
        await lease.attest();
        startup.phase('privacy-attestation');
        this.assertStarting();
      } else { this.ownChild(spawn(guardianNode, launchArgs, launchOptions)); startup.phase('spawn'); }
    }
    // Ingen rå proceslogs sendes til UI; de kan indeholde projektindhold.
    this.child.stderr.resume();
    let startupStdoutBytes = 0, startupStderrBytes = 0;
    this.child.stdout.on('data', chunk => { startupStdoutBytes += chunk.length; });
    this.child.stderr.on('data', chunk => { startupStderrBytes += chunk.length; });
    this.child.on('exit', () => { startup.child({ pid: this.child.pid, exitCode: this.child.exitCode, signal: this.child.signalCode }); if (this.active) { this.active = false; this.handleEvent({ type: 'engine.error', message: 'Agentmotoren stoppede. Start opgaven igen for at oprette en ny session.', failure: { kind: 'engine' } }); } });
    try {
      this.url = await new Promise((resolve, reject) => {
        const child = this.child, signal = this.lifecycle.signal;
        const timer = setTimeout(() => { startup.urlProgress({ timedOut: true, stdoutBytes: startupStdoutBytes, stderrBytes: startupStderrBytes }); done(new Error('Agentmotoren kunne ikke starte. Kontrollér installationen.')); }, 30000);
        let output = '';
        const done = (error, url) => { clearTimeout(timer); child.removeListener('error', failed); child.removeListener('exit', stopped); child.stdout.removeListener('data', received); signal.removeEventListener('abort', stopped); error ? reject(error) : resolve(url); };
        const failed = () => done(new Error('Agentmotoren kunne ikke startes.')), stopped = () => done(new Error('Agentmotoren afsluttede under opstart.'));
        const received = chunk => { output = (output + chunk.toString()).slice(-8000); const found = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (found) { startup.urlProgress({ found: true, stdoutBytes: startupStdoutBytes, stderrBytes: startupStderrBytes }); done(null, found[0]); } };
        child.once('error', failed); child.once('exit', stopped); child.stdout.on('data', received); signal.addEventListener('abort', stopped, { once: true });
        if (signal.aborted) stopped();
      });
      startup.phase('url');
      startup.urlProgress({ stdoutBytes: startupStdoutBytes, stderrBytes: startupStderrBytes });
      this.assertStarting();
      const health = await this.request('/global/health');
      if (health.version !== VERSION) throw new Error('Agentmotorens version matcher ikke den afprøvede version.');
      startup.phase('health');
      const effective = await this.wire(`/api/config?location[directory]=${encodeURIComponent(this.root)}`);
      if (!v2.validateConfigEntries(effective, this.config, this.directory)) throw new Error('Agentens effektive indstillinger afviger. En lokal eller administreret konfiguration kan være årsagen.');
      startup.phase('config');
      await this.openSession();
      startup.phase('session');
      const expectedPlugins = new Map([['aura.read-protection', readGuard.pluginURL], ['aura.task-list.compatibility', taskPlugin], ...(this.sandbox ? [['aura.command-isolation', this.sandbox.pluginURL]] : [])]);
      const deadline = Date.now() + 10000;
      while (true) {
        const installed = await this.wire(`/api/plugin?location[directory]=${encodeURIComponent(this.root)}`);
        if (!Array.isArray(installed?.data)) throw new Error('Filbeskyttelsen kunne ikke bekræftes.');
        const external = installed.data.filter(item => item.source?.type !== 'builtin');
        if (external.some(item => !expectedPlugins.has(item.id) || item.source?.type !== 'local' || item.source.path !== path.join(expectedPlugins.get(item.id), 'index.mjs') || item.state?.status === 'failed')) throw new Error('Agentens plugins afviger fra Auras beskyttelse.');
        if (external.length === expectedPlugins.size && external.every(item => item.state.status === 'active')) break;
        if (Date.now() > deadline) throw new Error('Filbeskyttelsen blev ikke indlæst.');
        await delay(50);
      }
      const readReady = await fs.readFile(readGuard.readyPath, 'utf8').then(JSON.parse).catch(() => null);
      if (readReady?.token !== readGuard.token) throw new Error('Filbeskyttelsen blev ikke indlæst. Opgaven blev ikke startet.');
      if (this.sandbox) {
        const ready = await fs.readFile(this.sandbox.readyPath, 'utf8').then(JSON.parse).catch(() => null);
        if (ready?.token !== this.sandbox.readyToken || ready?.identity !== this.sandbox.identity) throw new Error('Kommandobeskyttelsen blev ikke indlæst. Opgaven blev ikke startet.');
      }
      startup.phase('plugins');
      this.assertStarting();
      this.active = true;
      this.listen();
      await this.eventStream.ready;
      this.assertStarting();
      startup.phase('ready');
      startup.ready();
      startup.finalize();
      return this.session.id;
    } catch (error) { startup.fail(error); startup.finalize(); this.pendingMeasurement?.finish('error'); throw error; }
  }
  async listen() {
    this.eventStream?.close();
    this.eventStream = new EngineEvents(this, this.recovery);
    this.eventsAbort = this.eventStream.controller;
    return this.eventStream.run();
  }
  handleEvent(event) {
    if (this.closed) return;
    const props = event.properties || {}, sessionID = props.sessionID || props.part?.sessionID || props.info?.sessionID;
    if (sessionID && sessionID !== this.session?.id) return;
    if (!this.compaction && event.type === 'session.status' && props.status?.type === 'idle') return this.handleEvent({ type: 'session.idle', properties: props });
    // A delayed snapshot/idle from the completed turn must not terminate the
    // next ChatSession while it is preparing its new prompt. Only messages owned
    // by this prompt can open/complete the turn, even in the same server session.
    if (this.promptID && !this.compaction) {
      const terminal = event.type === 'session.idle' || event.type === 'session.status' && props.status?.type === 'idle';
      const turnEvent = terminal || event.type.startsWith('message.') || event.type.startsWith('permission.') || event.type.startsWith('question.');
      if (turnEvent && this.completedPromptID === this.promptID) return;
      if (event.type === 'message.updated') {
        const info = props.info;
        if (info?.id !== this.promptID && info?.parentID !== this.promptID) return;
        this.currentMessageIDs ||= new Set(); this.currentMessageIDs.add(info.id);
        if (info.role === 'assistant') this.currentReplySeen = true;
      }
      const messageID = props.part?.messageID || props.messageID;
      if (event.type.startsWith('message.part.') && messageID && !this.currentMessageIDs?.has(messageID)) return;
      if (terminal) {
        if (!this.currentReplySeen) return;
        this.completedPromptID = this.promptID;
      }
    }
    // OpenCode udsender både status-idle og session.idle. Status er også en autoritativ afslutning;
    // ChatSession deduplikerer dem med sin igangværende finalisering.
    if (event.type === 'permission.asked') {
      // Preserve the exact object bound to an in-flight approval. Reconnection
      // must neither duplicate its dialog nor re-use an already answered request.
      if (this.pending.has(props.id) || this.closedPermissions.has(props.id)) return;
      this.pending.set(props.id, props);
    }
    if (event.type === 'question.asked') { if (this.pendingQuestions.has(props.id) || this.closedQuestions.has(props.id)) return; this.pendingQuestions.set(props.id, props); }
    if (['question.replied', 'question.rejected'].includes(event.type)) { this.pendingQuestions.delete(props.requestID || props.id); this.closedQuestions.add(props.requestID || props.id); }
    if (event.type === 'permission.replied') {
      if (props.reply === 'reject' && this.permissionRejection?.requestID === props.requestID && this.permissionRejection.sessionID === sessionID && this.permissionRejection.promptID === this.promptID && this.permissionRejection.epoch === this.promptEpoch) this.permissionRejection.accepted = true;
      this.pending.delete(props.requestID); this.closedPermissions.add(props.requestID);
    }
    const compaction = this.compaction;
    if (!compaction && event.type === 'message.updated' && props.info?.role === 'assistant') {
      if (props.info.time?.completed && props.info.finish && props.info.finish !== 'tool-calls') this.watchCompletion(props.info.id);
      else this.cancelCompletionCheck();
    }
    if (['session.idle', 'session.error', 'engine.error'].includes(event.type)) this.cancelCompletionCheck();
    // Observe only events accepted by the existing turn/permission filters.
    if (!compaction) this.activeMeasurement?.observe(event);
    this.onEvent(compaction ? { ...event, compacting: true } : event);
    if (compaction && event.type === 'session.idle') compaction.resolve();
    if (compaction && ['session.error', 'engine.error'].includes(event.type)) compaction.reject(new Error(event.message || props.error?.data?.message || 'Samtalen kunne ikke sammenfattes.'));
  }
  async send(text, system) {
    if (!this.active) throw new Error('Agenten er ikke startet.');
    const measurement = this.pendingMeasurement || localMetrics.create({ mode: this.mode });
    this.pendingMeasurement = null; this.activeMeasurement = measurement;
    measurement.sending(text, system);
    this.cancelCompletionCheck(); ++this.promptEpoch; this.adapter.cancelExpectedInterrupt(this.session.id); this.nativeExecutionError = null; this.permissionRejection = null;
    // OpenCode's IDs sort by their timestamp prefix. Supply an explicit ID so a
    // lost HTTP acknowledgement can be checked without posting the prompt twice.
    const time = ((BigInt(Date.now()) * 4096n) & ((1n << 48n) - 1n)).toString(16).padStart(12, '0');
    const messageID = this.promptID = 'msg_' + time + randomBytes(7).toString('hex');
    this.currentReplySeen = false; this.currentMessageIDs = new Set([messageID]);
    const epoch = this.promptEpoch, signal = this.eventsAbort?.signal;
    try {
      return await this.request(`/session/${this.session.id}/prompt_async`, 'POST', { messageID, model: { providerID: 'harness', modelID: this.model.id }, agent: ['chat', 'plan'].includes(this.mode) ? 'plan' : 'build', system, parts: [{ type: 'text', text }] });
    } catch (error) {
      if (error.status && error.status < 500 || signal?.aborted) { measurement.finish(signal?.aborted ? 'stopped' : 'error'); throw error; }
      for (const wait of this.recovery.delays || [500, 1500, 3000]) {
        if (epoch !== this.promptEpoch || !this.active || signal?.aborted) { measurement.finish('stopped'); throw error; }
        this.handleEvent({ type: 'engine.recovery', recovery: { phase: 'checking' } });
        await delay(wait, undefined, { signal });
        try {
          const messages = await this.messages(), statuses = await this.request('/session/status');
          if (epoch !== this.promptEpoch || signal?.aborted) throw error;
          if (messages.some(m => m.info?.id === messageID && m.info.role === 'user') &&
              (statuses?.[this.session.id]?.type === 'busy' || messages.some(m => m.info?.parentID === messageID && m.info?.time?.completed))) {
            if (this.eventStream) { this.eventStream.snapshotMode = true; await this.eventStream.reconcile(); }
            measurement.acknowledged('reconciled');
            this.handleEvent({ type: 'engine.recovery', recovery: { phase: 'recovered' } }); return;
          }
        } catch { /* A failed read is not permission to repeat the POST. */ }
      }
      measurement.finish('error');
      throw new Error('Det kunne ikke bekræftes, om agenten modtog beskeden. Aura sender den ikke igen automatisk, så handlinger ikke gentages.');
    }
  }
  async abort() {
    this.activeMeasurement?.finish('stopped');
    this.pendingMeasurement?.finish('stopped');
    ++this.promptEpoch; this.permissionRejection = null; this.eventStream?.close(); this.cancelCompletionCheck(); this.cancelCompaction();
    if (this.session && this.url) {
      this.adapter.expectUserInterrupt(this.session.id);
      try { await this.request(`/session/${this.session.id}/abort`, 'POST'); }
      catch (error) { this.adapter.cancelExpectedInterrupt(this.session.id); throw error; }
    }
    this.pending.clear(); this.pendingQuestions.clear();
  }

  cancelCompletionCheck() { clearTimeout(this.completionTimer); this.completionTimer = null; this.completionCheck = null; }
  watchCompletion(message) {
    this.cancelCompletionCheck();
    const check = this.completionCheck = { message, errors: 0 };
    const poll = async () => {
      if (!this.active || this.compaction || this.completionCheck !== check) return;
      try { if (await this.verifyCompletion(check)) return; check.errors = 0; }
      catch {
        if (this.completionCheck !== check) return;
        if (++check.errors >= 3) { this.handleEvent({ type: 'engine.error', message: 'Svaret er modtaget, men agentens afslutning kunne ikke bekræftes. Opgaven er standset; gennemgå resultatet.', failure: { kind: 'engine' } }); await this.abort().catch(() => {}); return; }
      }
      if (this.completionCheck === check) this.completionTimer = setTimeout(poll, 1500);
    };
    this.completionTimer = setTimeout(poll, 1000);
  }
  async verifyCompletion(check) {
    if (this.turnBaseline && this.eventStream) { await this.eventStream.settle(); return this.completedPromptID === this.promptID; }
    const statuses = await this.request('/session/status');
    if (!this.active || this.compaction || this.completionCheck !== check || this.pending.size || this.pendingQuestions.size) return false;
    if (!statuses || typeof statuses !== 'object' || Array.isArray(statuses)) throw new Error('Ugyldig sessionsstatus.');
    // OpenCode udelader idle-sessioner fra statusoversigten. Kontrollen starter kun efter en faktisk
    // afsluttet assistant-message med finish-kode, aldrig på baggrund af tekst som "Færdig".
    const status = statuses[this.session.id];
    if (!status || status.type === 'idle') { this.handleEvent({ type: 'session.idle', recovered: true, properties: { sessionID: this.session.id } }); return true; }
    return false;
  }
  // En afvisning med en besked stopper ikke opgaven: AI'en får beskeden som rettelse og fortsætter.
  async reply(id, allow, message) {
    const pending = this.pending.get(id);
    if (!pending || pending.sessionID && pending.sessionID !== this.session?.id) throw new Error('Godkendelsen findes ikke længere.');
    // Only an explicit, ordinary rejection of this exact pending permission can
    // classify a later interruption as user denial. Feedback continues the task.
    const rejection = !allow && !message && this.promptID ? { requestID:id, sessionID:this.session.id, promptID:this.promptID, epoch:this.promptEpoch, accepted:false } : null;
    if (rejection) this.permissionRejection = rejection;
    try {
      await this.request(`/permission/${encodeURIComponent(id)}/reply`, 'POST', { reply: allow ? 'once' : 'reject', ...(!allow && message ? { message } : {}) });
      if (rejection) rejection.accepted = true;
    } catch (error) {
      if (rejection && !rejection.accepted && this.permissionRejection === rejection) this.permissionRejection = null;
      throw error;
    }
    this.pending.delete(id); this.closedPermissions.add(id);
  }
  async messages() { return this.request(`/session/${this.session.id}/message`); }
  // OpenCode sammenfatter samtalen med samme model og fortsætter fra sammenfatningen. Planen og filerne røres ikke.
  async summarize({ timeout = SUMMARIZE_TIMEOUT_MS } = {}) {
    if (!this.active) throw new Error('Agenten er ikke startet.');
    if (this.compaction) throw new Error('Samtalen er allerede ved at blive sammenfattet.');
    const controller = new AbortController(), operation = { controller };
    const idle = new Promise((resolve, reject) => { operation.resolve = resolve; operation.reject = reject; });
    this.compaction = operation;
    const poll = setInterval(() => { if (operation.httpCompleted && operation.baseline) this.eventStream?.settle().catch(error => operation.reject(error)); }, 500);
    const timer = setTimeout(() => this.cancelCompaction(new Error('Sammenfatningen tog for lang tid. Prøv igen.')), timeout);
    try {
      // summarize er et modelkald, ikke en almindelig 15-sekunders kontrol. Begge kanaler skal være afsluttet,
      // før næste prompt starter; et sent idle fra sammenfatningen må ikke afslutte brugerens nye opgave.
      const request = this.request(`/session/${this.session.id}/summarize`, 'POST', { providerID: 'harness', modelID: this.model.id, auto: false }, controller.signal).then(async result => {
        operation.httpCompleted = true;
        if (this.eventStream?.snapshotMode) await this.eventStream.settle();
        return result;
      });
      const [result] = await Promise.all([request, idle]);
      return result;
    } finally { clearTimeout(timer); clearInterval(poll); controller.abort(); if (this.compaction === operation) this.compaction = null; }
  }
  cancelCompaction(error = new Error('Sammenfatningen blev stoppet.')) { if (this.compaction) { this.compaction.controller.abort(error); this.compaction.reject(error); } }
  async diff() { return this.request(`/session/${this.session.id}/diff`); }
  stopLifecycle() {
    if (this.closed) return;
    this.closed = true; ++this.promptEpoch; this.lifecycle.abort(); this.eventStream?.close(); this.pendingQuestions.clear();
    this.cancelCompletionCheck(); this.cancelCompaction(); this.active = false; this.eventsAbort?.abort(); this.pending.clear();
  }
  async retireOwnedResources() {
    const child = this.child, lease = this.privacyLease;
    try {
      if (child && !this.childRetirement) this.childRetirement = new Promise(resolve => {
        if (child.exitCode !== null || child.signalCode != null) return resolve();
        const done = () => { clearTimeout(timer); child.removeListener('exit', done); resolve(); };
        const timer = setTimeout(() => { child.kill('SIGKILL'); done(); }, 3000);
        child.once('exit', done); child.kill();
      });
      await this.childRetirement;
    } finally {
      if (lease) {
        this.leaseRetirement ||= Promise.resolve().then(() => lease.dispose());
        await this.leaseRetirement;
        if (this.privacyLease === lease) this.privacyLease = null;
      }
    }
  }
  close() {
    if (this.closePromise) return this.closePromise;
    this.activeMeasurement?.finish('closed'); this.pendingMeasurement?.finish('closed'); this.stopLifecycle();
    this.closePromise = (async () => {
      try { await this.retireOwnedResources(); }
      finally {
        // Startup may own a lease that had not resolved when close began. Join
        // it, then retire any late resource before acknowledging closed.
        await this.startPromise?.catch(() => {});
        await this.retireOwnedResources();
      }
    })();
    return this.closePromise;
  }
}
module.exports = { OpenCodeEngine, findExecutable, isolatedEnv, permissions, engineConfig, writeSkills, writePluginRuntime, pluginRuntimeFiles, pluginRuntimePatterns, createReadGuard, writeReadGuard, VERSION, SUMMARIZE_TIMEOUT_MS, parseOpenCodeVersion };
