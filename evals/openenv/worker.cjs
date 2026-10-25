// Runs in Electron's main process: real safeStorage, Workbench, gateway and OpenCode.
// Only the adapter protocol goes to stdout. Keys never cross this process boundary.
const { app, safeStorage, BrowserWindow, session } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const readline = require('node:readline');
const { Workbench } = require('../../desktop/core/workbench.cjs');
const { Store } = require('../../desktop/core/store.cjs');
const { createProject } = require('../../desktop/core/projects.cjs');
const { reviewPermission, modelCallBudgetReached } = require('./policy.cjs');
const { createAppQualityInspector } = require('../../desktop/core/app-quality.cjs');
const { OpenCodeEngine } = require('../../desktop/core/engine.cjs');
const connections = require('../../desktop/core/connections.cjs');
const prefix = 'AURA_OPENENV ';
const out = data => process.stdout.write(prefix + JSON.stringify(data) + '\n');
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
let bench, config, target, trial, scenario, mode, audit = [], reviews = [], faults = [], stage, permissionQueue = Promise.resolve();
let started, turnTimer, stopped = false, planHashes = new Set(), skillCalls = new Set();
const qualityPasses = [], qualityActivity = [];
const enginePrompts = [];
app.setName('Aura');
app.setPath('userData', path.resolve(process.argv[4], 'electron-profile'));
app.on('window-all-closed', () => {});

// Settings are ephemeral; the original encrypted credential is read-only.
// Conversation history and generated code remain in the isolated trial folder.
class PilotStore extends Store {
  constructor(root, connection) { super(root, safeStorage); this.state = { version: 1, connections: [connection], projects: {} }; }
  async read() { return structuredClone(this.state); }
  update(change) {
    const task = this.queue.then(async () => { const next = await this.read(); const result = await change(next); this.state = next; return result; });
    this.queue = task.catch(() => {}); return task;
  }
}
async function fileManifest(root) {
  const files = [];
  async function visit(directory, prefix = '') {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = prefix + entry.name, absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute, relative + '/');
      else if (entry.isFile()) { const bytes = await fs.readFile(absolute); files.push({ path: relative, bytes: bytes.length, sha256: digest(bytes) }); }
      else throw Error('Non-file in initial project');
    }
  }
  await visit(root); return files;
}
function recordedEngine(options) {
  const engine = new OpenCodeEngine(options), send = engine.send.bind(engine);
  engine.send = async (text, system) => {
    const normalize = value => String(value).split(bench.project.root).join('<PROJECT_ROOT>').split(bench.chat.scratchRoot || '\u0000').join('<TASK_SCRATCH>').split(trial).join('<TRIAL_ROOT>');
    const record = { index: enginePrompts.length + 1, stage, at: new Date().toISOString(),
      text, system, textSHA256: digest(text), systemSHA256: digest(system), systemCharacters: system.length,
      normalizedSystemSHA256: digest(normalize(system)), normalizedTextSHA256: digest(normalize(text)),
      normalization: 'Only this trial, project and task scratch paths; model output and task content unchanged',
      modelLimits: options.provider.models[options.model.id].limit };
    enginePrompts.push(record);
    await fs.writeFile(path.join(trial, 'engine-prompts.json'), JSON.stringify(enginePrompts, null, 2), { mode: 0o600 });
    return send(text, system);
  };
  return engine;
}
async function snapshot(label) {
  const destination = path.join(trial, label, 'public');
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.cp(path.join(bench.project.root, 'public'), destination, { recursive: true, errorOnExist: true, force: false });
  return path.dirname(destination);
}
function createRecordedInspector() {
  const inspect = createAppQualityInspector({ BrowserWindow, session, directory: path.join(trial, 'quality') });
  return async ({ root, signal }) => {
    const pass = { index: qualityPasses.length + 1, stage, startedAt: Date.now() };
    qualityPasses.push(pass);
    const destination = path.join(trial, 'quality-snapshots', String(pass.index).padStart(3, '0'));
    await fs.mkdir(destination, { recursive: false });
    // Keep the exact generated first draft and every product-owned correction.
    // These copies are evidence only; neither the evaluator nor a second agent repairs files.
    try {
      await fs.cp(path.join(root, 'public'), path.join(destination, 'public'), { recursive: true, errorOnExist: true, force: false });
      pass.artifact = destination;
    } catch { pass.snapshotUnavailable = true; }
    const report = await inspect({ root, signal });
    Object.assign(pass, { endedAt: Date.now(), report });
    await fs.writeFile(path.join(destination, 'inspection.json'), JSON.stringify(pass, null, 2), { mode: 0o600 });
    await fs.writeFile(path.join(trial, 'quality-passes.json'), JSON.stringify(qualityPasses, null, 2), { mode: 0o600 });
    out({ event: 'quality', stage, pass: pass.index, status: report.status, findings: report.findings?.map(item => ({ id: item.id, severity: item.severity })) || [] });
    return report;
  };
}
function event(event) {
  if (event.type === 'permission.asked') {
    const p = event.properties;
    permissionQueue = permissionQueue.then(async () => {
      // Use Aura's validated canonical targets, not OpenCode's display paths.
      const record = bench.chat.approvals.get(p.id);
      const descriptor = record?.descriptor;
      const paths = descriptor?.match?.targets?.map(item => item.path) || [];
      const allow = await reviewPermission(bench.project.root, record, mode);
      audit.push({ stage, kind: 'tool', permission: p.permission, paths: paths.map(file => path.relative(bench.project.root, file)), allow, scope: 'once' });
      out({ event: 'approval', permission: p.permission, allow });
      await bench.reply({ id: p.id, allow, scope: 'once', message: allow ? undefined : 'Pilotens ramme tillader kun gennemgåede filændringer i public/ under Byg og read/grep med en konkret, sikker sti i public/. Ingen shell, Git, eksterne filer eller netværk.' });
    }).catch(() => { faults.push('permission_reply_failed'); });
  }
  if (event.type === 'question.asked') {
    const p = event.properties;
    permissionQueue = permissionQueue.then(async () => {
      audit.push({ stage, kind: 'question', count: p.questions.length });
      await bench.question({ id: p.id, answers: p.questions.map(() => [scenario.answers]) });
    }).catch(() => faults.push('question_reply_failed'));
  }
  const part = event.properties?.part;
  if (part?.type === 'tool' && part.tool === 'skill' && part.state?.input?.name) skillCalls.add(part.state.input.name);
  if (event.type === 'run.review') reviews.push(event);
  if (event.type === 'activity' && event.entry?.kind === 'session' && (String(event.entry.id || '').startsWith('quality-') || /lokale kontrol|Kontrollerer appen/.test(event.entry.title || ''))) {
    qualityActivity.push({ stage, at: Date.now(), entry: event.entry });
  }
  if (['engine.error', 'session.error'].includes(event.type)) faults.push(event.type);
  if (event.type === 'run.status') out({ event: 'status', status: event.status, stage });
  if (event.type === 'usage' && modelCallBudgetReached(event.usage?.calls, config.maxModelCalls) && !stopped) {
    stopped = true; faults.push('model_call_budget'); bench.stop().catch(() => {});
  }
}
async function initialize() {
  config = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
  target = config.targets.find(item => item.provider === process.argv[3]);
  if (!target || !['corti', 'mistral', 'openrouter'].includes(target.provider)) throw Error('Unknown pilot target');
  trial = path.resolve(process.argv[4]);
  scenario = JSON.parse(await fs.readFile(process.argv[5], 'utf8'));
  const settings = JSON.parse(await fs.readFile(target.settings, 'utf8'));
  const connection = settings.connections.find(item => item.id === target.connectionID && item.kind === target.provider);
  if (!connection?.secret) throw Error('Selected encrypted connection not found');
  const identityFile = path.join(path.dirname(target.settings), 'noeglering.json');
  const identity = JSON.parse(await fs.readFile(identityFile, 'utf8'));
  if (identity.navn !== 'Aura') throw Error('This pilot requires the Aura keychain identity');
  const profiles = path.resolve(__dirname, '../../profiles');
  const store = new PilotStore(path.join(trial, 'state'), connection);
  if (scenario.productQualityControl) await fs.mkdir(path.join(trial, 'quality-snapshots'), { recursive: false });
  const qualityInspector = scenario.productQualityControl ? createRecordedInspector() : undefined;
  bench = new Workbench({ directory: store.root, store, safeStorage, profiles, emit: event, qualityInspector, engineFactory: recordedEngine });
  // Optional lower, shared assay ceilings. Never raise a provider's documented limits.
  const nativeCatalogue = new Map();
  const originalModels = bench.models.bind(bench);
  bench.models = async id => {
    const found = await originalModels(id);
    return found.map(model => {
      nativeCatalogue.set(model.id, model);
      if (model.id !== target.model || !config.commonModelLimits) return model;
      const original = connections.modelLimits(connection, model), cap = config.commonModelLimits;
      if (!Number.isSafeInteger(cap.context) || !Number.isSafeInteger(cap.output) || cap.context < 32768 || cap.output < 4096 || cap.output > cap.context / 2) throw Error('Invalid shared assay model ceilings');
      return { ...model, limits: { context: Math.min(original.context, cap.context), output: Math.min(original.output, cap.output) } };
    });
  };
  if (scenario.productQualityControl && bench.qualityInspector !== qualityInspector) throw Error('Product quality inspector hook unavailable; no model calls started');
  out({ event: 'keychain', provider: target.provider });
  const models = await bench.models(connection.id);
  const selected = models.find(model => model.id === target.model);
  if (!selected) throw Error('Selected model absent from live catalogue');
  const routes = await bench.routes(connection.id, target.model);
  if (target.provider === 'openrouter' && !routes.some(route => route.id === target.routeID)) throw Error('Exact OpenRouter route missing; no fallback permitted');
  await fs.mkdir(path.join(trial, 'projects'), { recursive: true });
  const project = await createProject(path.join(trial, 'projects'), { name: scenario.name, purpose: scenario.brief, links: [], tests: 'manuel' }, [], profiles);
  const initialFiles = await fileManifest(project.root);
  await fs.writeFile(path.join(trial, 'initial-files.json'), JSON.stringify(initialFiles, null, 2));
  await bench.activate(project);
  const context = await bench.skills.context(project.root);
  const skills = context.skills.map(skill => ({ name: skill.name, sha256: digest(JSON.stringify(skill.files)), files: skill.files.map(file => ({ path: file.path, bytes: Buffer.byteLength(file.content), sha256: digest(file.content) })) }));
  if (!skills.some(skill => skill.name === 'harness-aura-design')) throw Error('Mandatory design skill missing');
  return { project: project.root, provider: target.provider, model: target.model, routeID: target.routeID || null, effort: target.effort || 'provider-default', endpoint: connection.baseURL, skills, initialFiles,
    nativeModelLimits: connections.modelLimits(connection, nativeCatalogue.get(target.model)), effectiveModelLimits: connections.modelLimits(connection, selected), commonModelLimits: config.commonModelLimits || null,
    engineVersion: require('../../desktop/core/engine.cjs').VERSION,
    limits: { maxModelCalls: config.maxModelCalls, turnTimeoutSeconds: config.turnTimeoutSeconds },
    productQualityControl: Boolean(qualityInspector),
    productSource: Object.fromEntries(await Promise.all(['app-quality.cjs', 'chat-session.cjs', 'workbench.cjs', 'build-design.cjs'].map(async file => [file, digest(await fs.readFile(path.join(__dirname, '../../desktop/core', file)))]))),
    pilotSource: Object.fromEntries(await Promise.all(['worker.cjs', 'policy.cjs', 'adapter.py', 'run.py', 'cases.json'].map(async file => [file, digest(await fs.readFile(path.join(__dirname, file)))]))) };
}
async function turn(input) {
  if (!['plan', 'plan-repair', 'build', 'revision-plan', 'revision-plan-repair', 'revision-build'].includes(input.stage)) throw Error('Invalid pilot stage');
  if (input.stage === stage) throw Error('A stage must never be replayed implicitly');
  stage = input.stage; mode = stage.endsWith('build') ? 'build' : 'plan';
  const plan = bench.chat.plan;
  if (mode === 'build' && (!plan || input.approvedPlanHash !== digest(plan.text))) throw Error('Explicit approval of the exact plan is required');
  if (mode === 'build') { planHashes.add(digest(plan.text)); audit.push({ stage, kind: 'plan', sha256: digest(plan.text), allow: true }); }
  const prepared = await bench.prepare({ mode, connectionID: target.connectionID, modelID: target.model, routeID: target.routeID, effort: target.effort, planID: mode === 'build' ? plan.id : undefined, text: input.text, references: [] });
  await fs.writeFile(path.join(trial, stage + '-prepared-context.json'), JSON.stringify({ stage, at: new Date().toISOString(),
    system: bench.chat.prepared.appContext.system, systemSHA256: digest(bench.chat.prepared.appContext.system),
    components: bench.chat.prepared.appContext.components, appContextSHA256: bench.chat.prepared.appContext.hash,
    rulesSHA256: digest(bench.chat.prepared.context.rules), features: bench.chat.prepared.context.features,
    effort: prepared.effort, modelSupport: prepared.modelSupport }, null, 2), { mode: 0o600 });
  if (input.preflight === true) return { preflight: true, stage, model: target.model, routeID: prepared.routeID || null,
    effort: prepared.effort, systemSHA256: digest(bench.chat.prepared.appContext.system), modelCalls: 0 };
  audit.push({ stage, kind: 'disclosure', endpoint: prepared.endpoint, model: target.model, fingerprint: prepared.fingerprint, allow: true });
  const reviewStart = reviews.length, faultStart = faults.length, qualityStart = qualityPasses.length, qualityActivityStart = qualityActivity.length;
  started = Date.now(); stopped = false;
  turnTimer = setTimeout(() => { stopped = true; faults.push('pilot_deadline'); bench.stop().catch(() => {}); }, config.turnTimeoutSeconds * 1000);
  try {
    await bench.send({ text: input.text, fingerprint: prepared.fingerprint, contextBinding: prepared.contextBinding });
    while (bench.running) await new Promise(resolve => setTimeout(resolve, 150));
    await permissionQueue;
  } finally { clearTimeout(turnTimer); }
  const currentPlan = bench.chat.plan;
  const messages = bench.chat.historySnapshot('idle').messages || [];
  const result = { stage, seconds: (Date.now() - started) / 1000, reviews: reviews.slice(reviewStart), faults: faults.slice(faultStart),
    response: messages.filter(message => message.role === 'assistant').at(-1)?.text || '',
    plan: currentPlan ? { text: currentPlan.text, sha256: digest(currentPlan.text) } : null,
    usage: bench.chat.currentUsage(), skillCalls: [...skillCalls], audit: [...audit],
    qualityPasses: qualityPasses.slice(qualityStart), qualityActivity: qualityActivity.slice(qualityActivityStart),
    sessionID: bench.chat.engine?.session?.id || null, conversationID: bench.chat.id };
  if (mode === 'build') result.artifact = await snapshot(stage);
  await fs.writeFile(path.join(trial, stage + '.json'), JSON.stringify(result, null, 2));
  return result;
}
async function shutdown() { clearTimeout(turnTimer); if (bench) await bench.close().catch(() => {}); app.exit(); }
app.whenReady().then(async () => {
  try { out({ ready: await initialize() }); }
  catch (error) { out({ startupError: error.message }); await shutdown(); return; }
  const lines = readline.createInterface({ input: process.stdin });
  for await (const line of lines) {
    try {
      const request = JSON.parse(line);
      if (request.stop) { await shutdown(); return; }
      out({ result: await turn(request) });
    } catch (error) { out({ error: error.message }); }
  }
  await shutdown();
});
process.on('SIGTERM', shutdown);
