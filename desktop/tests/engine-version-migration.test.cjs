const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { Workbench } = require('../core/workbench.cjs');
const engineModule = require('../core/engine.cjs');

const plan = '## Det bygger vi\nEn lokal side.\n## Sådan skal det se ud\nEn tydelig overskrift.\n## Teknik og data\nHTML uden netværk.\n## Det skal du prøve\nLæs overskriften.';

async function fixture(t) {
  const version = engineModule.VERSION;
  engineModule.VERSION = '1.18.33';
  t.after(() => { engineModule.VERSION = version; });
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-engine-migration-'));
  const root = path.join(directory, 'project');
  await fs.mkdir(root); await fs.writeFile(path.join(root, 'keep.txt'), 'Keep this source.');
  const server = http.createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const engines = [], events = [];
  const bench = new Workbench({ directory: path.join(directory, 'state'), profiles: path.resolve(__dirname, '../../profiles'), safeStorage: {}, emit: event => events.push(event), engineFactory: options => {
    const engine = { options, active: false, resumed: Boolean(options.resume), pending: new Map(), sent: [], session: { id: options.resume || `migration-session-${engines.length + 1}` },
      async start() { this.active = true; }, async send(text, system) { this.sent.push({ text, system }); }, async abort() {}, async close() { this.active = false; } };
    engines.push(engine); return engine;
  } });
  t.after(async () => { await bench.close(); await new Promise(resolve => server.close(resolve)); await fs.rm(directory, { recursive: true, force: true }); });
  const project = { root, name: 'Migration fixture', purpose: 'Synthetic engine migration' };
  await bench.activate(project);
  const connection = (await bench.saveConnection({ kind: 'compatible', name: 'Synthetic', baseURL: `http://127.0.0.1:${server.address().port}/v1` })).connections[0];
  const prepare = extra => bench.prepare({ connectionID: connection.id, modelID: 'model-a', mode: 'chat', ...extra });
  async function send(extra = {}, text = 'New synthetic request') {
    const disclosure = await prepare(extra);
    await bench.send({ text, fingerprint: disclosure.fingerprint, contextBinding: disclosure.contextBinding });
    return disclosure;
  }
  let answers = 0;
  async function finish(text = 'Synthetic answer') {
    const id = `migration-answer-${++answers}`, chat = bench.chat;
    chat.runRoles.set(id, 'assistant'); chat.runText.set(id, { id, messageID: id, text });
    chat.event({ type: 'session.idle' }); await chat.finishing;
  }
  return { bench, root, project, connection, engines, events, prepare, send, finish, upgrade: () => { engineModule.VERSION = '2.1.4'; } };
}

test('V1 engine upgrade carries all saved visible context, preserves plan and original session, and never replays tools', async t => {
  const f = await fixture(t);
  await f.send({ mode: 'plan' }); await f.finish(plan);
  const oldSession = f.engines[0].session.id, planID = f.bench.chat.plan.id;
  await f.bench.chat.close(false);
  const legacyRuntime = path.join(f.bench.store.root, 'runtime', f.bench.store.projectKey(f.root));
  const legacyDatabase = path.join(legacyRuntime, 'data', 'opencode', 'opencode.db');
  await fs.mkdir(path.dirname(legacyDatabase), { recursive: true });
  await fs.writeFile(legacyDatabase, 'Synthetic legacy DB sentinel: never rewrite or migrate in place.');
  const messages = Array.from({ length: 22 }, (_, i) => ({ id: `historical-${i}`, role: i % 2 ? 'assistant' : 'user', text: `Historical choice ${i}` }));
  f.bench.chat.data = await f.bench.history.updateChat(f.root, f.bench.chat.id, data => {
    data.messages = messages;
    data.messages.push({ id: 'old-tool', role: 'tool', text: 'DO NOT REPLAY OLD COMMAND' });
    data.opencode.conversation = 'Earlier approved handoff: orchid.';
    delete data.opencode.engineVersion; // Real V1 records had only the version-bound fingerprint.
  });
  const oldFingerprint = f.bench.chat.data.opencode.sessionFingerprint;
  f.upgrade();
  const disclosure = await f.send({ mode: 'plan', includeHistory: false }, 'Refine the plan only');
  const current = f.engines.at(-1);
  assert.equal(current.options.directory, path.join(f.bench.store.root, 'runtime-v2', f.bench.store.projectKey(f.root)));
  assert.equal(await fs.readFile(legacyDatabase, 'utf8'), 'Synthetic legacy DB sentinel: never rewrite or migrate in place.');
  assert.equal(current.options.resume, null);
  assert.equal(current.sent.length, 1);
  assert.equal(current.sent[0].text, 'Refine the plan only');
  for (const index of [0, 21]) assert.match(current.sent[0].system, new RegExp(`Historical choice ${index}`));
  assert.match(current.sent[0].system, /Earlier approved handoff: orchid/);
  assert.doesNotMatch(current.sent[0].system, /DO NOT REPLAY OLD COMMAND/);
  assert.equal(disclosure.historyIncluded, true);
  assert.notEqual(disclosure.sessionFingerprint, oldFingerprint);
  assert.equal(f.bench.chat.lastPlan.id, planID);
  assert.equal(f.bench.chat.allowProjectEdits, false);
  assert.equal(f.bench.chat.taskRules.size, 0);
  assert.equal(f.bench.chat.conversationPermission.active, false);
  const saved = await f.bench.history.readChat(f.root, f.bench.chat.id);
  assert.equal(saved.opencode.engineVersion, '2.1.4');
  assert.equal(saved.opencode.previousSessions[0].session, oldSession);
  assert.equal(saved.opencode.previousSessions[0].sessionFingerprint, oldFingerprint);
  assert.equal(saved.messages.some(message => message.text === 'Historical choice 0'), true);
  assert.equal(await fs.readFile(path.join(f.root, 'keep.txt'), 'utf8'), 'Keep this source.');
  await f.finish(plan);
  await f.bench.close(); await f.bench.activate(f.project);
  await f.send({ mode: 'plan' });
  assert.equal(f.engines.at(-1).options.resume, current.session.id);
  assert.equal((await f.bench.history.readChat(f.root, f.bench.chat.id)).opencode.previousSessions.length, 1);
  await f.finish(plan);
});

for (const change of ['model', 'connection', 'connection revision', 'route', 'rules', 'instructions']) test(`upgrade does not auto-transfer old context across changed ${change}`, async t => {
  const f = await fixture(t);
  await f.send(); await f.finish('PRIVATE OLD CONTEXT');
  await f.bench.chat.close(false);
  const extra = { includeHistory: false };
  if (change === 'model') extra.modelID = 'model-b';
  if (change === 'connection') extra.connectionID = (await f.bench.saveConnection({ kind: 'compatible', name: 'Other', baseURL: f.connection.baseURL })).connections.find(item => item.id !== f.connection.id).id;
  if (change === 'connection revision') await f.bench.saveConnection({ id: f.connection.id, kind: 'compatible', name: f.connection.name, baseURL: f.connection.baseURL });
  if (change === 'route') { f.bench.routes = async () => [{ id: 'changed-route', name: 'Changed route' }]; extra.routeID = 'changed-route'; }
  if (change === 'rules') await f.bench.skills.save(f.root, { id: 'faelles-grundregler', content: 'Different synthetic rules.' });
  if (change === 'instructions') await fs.writeFile(path.join(f.root, 'AGENTS.md'), 'Changed synthetic project instructions.');
  f.upgrade();
  const disclosure = await f.send(extra);
  assert.equal(disclosure.historyIncluded, false);
  assert.equal(f.bench.chat.prepared.engineMigration, null);
  assert.doesNotMatch(f.engines.at(-1).sent[0].system, /PRIVATE OLD CONTEXT/);
  assert.equal(f.engines.at(-1).options.resume, null);
  await f.finish();
});
