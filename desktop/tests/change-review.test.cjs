const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { taskSummary, sessionSummary, fileDetail, hash } = require('../core/change-review.cjs');
const { Activity, toolEntry, toolFiles, projectPath } = require('../core/activity.cjs');
const { capture, changes } = require('../core/changes.cjs');
const { Workbench } = require('../core/workbench.cjs');
const profiles = path.join(__dirname, '../../profiles');

const task = (files, extra = {}) => ({ id: 'opgave', label: 'Byg', mode: 'build', status: 'idle', startedAt: 1, endedAt: 2, files, aiFiles: new Set(), aiHashes: new Map(), commands: 0, ...extra });

test('en fil tilskrives kun AI’en, når AI’ens filværktøj skrev præcis det indhold, der ligger nu', () => {
  const files = [{ file: 'a.html', before: 'a\n', after: 'A\n' }, { file: 'b.html', before: 'b\n', after: 'B fra AI og dig\n' }, { file: 'c.html', before: null, after: 'ny\n' }];
  const ai = task(files, { aiFiles: new Set(['a.html', 'b.html']), aiHashes: new Map([['a.html', hash('A\n')], ['b.html', hash('B fra AI\n')]]) });
  const summary = taskSummary(ai);
  assert.deepEqual(summary.files.map(f => [f.file, f.by, f.change]), [['a.html', 'ai', 'ændret'], ['b.html', 'blandet', 'ændret'], ['c.html', 'anden', 'ny']]);
  assert.deepEqual(summary.totals, { files: 3, added: 3, removed: 2, ai: 1, mixed: 1, others: 1, user: 0 });
  // Kørte AI’en kommandoer, kan en ukendt ændring komme fra dem eller fra brugeren.
  assert.equal(taskSummary({ ...ai, commands: 1 }).files.find(f => f.file === 'c.html').by, 'kommando');
});

test('hele samtalen: brugerens rettelse mellem to opgaver gør filen blandet, og egne filer er aldrig AI’ens', () => {
  const baseline = { files: new Map([['side.html', 'v0\n'], ['egen.txt', 'x\n'], ['ren.html', 'r0\n']]), skipped: 0 };
  const first = task([{ file: 'side.html', before: 'v0\n', after: 'v1\n' }, { file: 'ren.html', before: 'r0\n', after: 'r1\n' }], { id: '1', aiFiles: new Set(['side.html', 'ren.html']), aiHashes: new Map([['side.html', hash('v1\n')], ['ren.html', hash('r1\n')]]) });
  // Brugeren retter side.html til v1-bruger mellem opgaverne; AI’en bygger videre på den.
  const second = task([{ file: 'side.html', before: 'v1-bruger\n', after: 'v2\n' }], { id: '2', aiFiles: new Set(['side.html']), aiHashes: new Map([['side.html', hash('v2\n')]]) });
  const current = { files: new Map([['side.html', 'v2\n'], ['egen.txt', 'y\n'], ['ren.html', 'r1\n']]), skipped: 0 };
  const view = sessionSummary(baseline, current, [first, second]);
  assert.deepEqual(view.files.map(f => [f.file, f.by]), [['ren.html', 'ai'], ['side.html', 'blandet'], ['egen.txt', 'anden']]);
  // En rettelse efter sidste opgave gør også filen blandet.
  current.files.set('ren.html', 'r1 og brugeren\n');
  assert.equal(sessionSummary(baseline, current, [first, second]).files.find(f => f.file === 'ren.html').by, 'blandet');
});

test('linjerne i en fil med mulig nøgle vises ikke', () => {
  const detail = fileDetail('config.js', 'const a = 1;\n', 'const api_key = "abcdefghijklmnop12345";\n', 'ai');
  assert.equal(detail.secret, true); assert.deepEqual(detail.hunks, []); assert.equal(detail.added, 1);
  const plain = fileDetail('a.txt', 'a\n', 'b\n', 'ai');
  assert.equal(plain.hunks[0].lines.length, 2); assert.equal(plain.invisible, false);
  assert.equal(fileDetail('a.txt', 'a', 'a\n', 'anden').invisible, true);
});

test('aktivitet viser faktiske værktøjer med stier i projektet og maskeret kommando-output', () => {
  const root = path.join(os.tmpdir(), 'projekt');
  const write = toolEntry({ id: 'p1', tool: 'write', state: { status: 'completed', input: { filePath: path.join(root, 'public/index.html') }, time: { start: 10, end: 30 } } }, root);
  assert.deepEqual(write, { id: 'tool-p1', kind: 'tool', tool: 'write', title: 'Skriv fil', target: 'public/index.html', status: 'completed', started: 10, ended: 30 });
  const bash = toolEntry({ id: 'p2', tool: 'bash', state: { status: 'completed', input: { command: 'npm test' }, output: 'ok\ntoken=sk-abcdefghijklmnopqrstuv\n', metadata: { exit: 1 } } }, root);
  assert.equal(bash.target, 'npm test'); assert.equal(bash.exit, 1); assert.doesNotMatch(bash.output, /sk-abcdefghij/); assert.match(bash.output, /skjult/);
  const failed = toolEntry({ id: 'p3', tool: 'read', state: { status: 'error', input: { filePath: '/etc/hosts' }, error: 'Afvist' } }, root);
  assert.equal(failed.target, '/etc/hosts'); assert.equal(failed.error, 'Afvist');
  assert.equal(projectPath(root, '/data/runtime/x/config/skills/harness-design/SKILL.md'), 'Skill harness-design › SKILL.md');
  const patch = { id: 'p4', tool: 'apply_patch', state: { status: 'completed', input: { patchText: '*** Begin Patch\n*** Update File: public/a.js\n@@\n*** Add File: public/b.js\n*** Delete File: ../udenfor.js\n*** End Patch' } } };
  assert.deepEqual(toolFiles(patch, root), ['public/a.js', 'public/b.js']);
  const events = [], log = new Activity(entry => events.push(entry), 3);
  log.put({ id: 'a', title: 'A', status: 'waiting' }); log.put({ id: 'a', status: 'allowed' });
  assert.equal(log.list().length, 1); assert.equal(log.get('a').status, 'allowed'); assert.equal(events.length, 2);
  for (const id of ['b', 'c', 'd']) log.put({ id, title: id });
  assert.deepEqual(log.list().map(entry => entry.id), ['b', 'c', 'd']);
});

test('arbejdsbænken husker opgavens ændringer og tilskriver dem efter AI’ens faktiske filværktøjer', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-opgave-')); t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'projekt'); await fs.mkdir(path.join(root, 'public'), { recursive: true });
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Før</h1>\n'); await fs.writeFile(path.join(root, 'noter.txt'), 'egne noter\n');
  const events = [];
  const bench = new Workbench({ directory: path.join(directory, 'data'), profiles, emit: event => events.push(event), safeStorage: {} });
  await bench.activate({ root, name: 'Prøve' }); const chat = bench.chat;
  const before = await capture(root);
  const session = bench.session(); session.baseline = before; session.startedAt = 1;
  chat.task = { id: 'opgave-1', root, label: 'Byg siden', mode: 'build', startedAt: 1, aiFiles: new Set(), aiHashes: new Map(), reads: [], completed: new Set(), commandParts: new Set(), commands: 0 };
  // AI’en skriver index.html med sit værktøj; brugeren retter samtidig sine noter i et andet program.
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Efter</h1>\n');
  chat.observeTool({ id: 'del-1', tool: 'write', state: { status: 'running', input: { filePath: path.join(root, 'public/index.html') } } });
  chat.observeTool({ id: 'del-1', tool: 'write', state: { status: 'completed', input: { filePath: path.join(root, 'public/index.html') } } });
  await fs.writeFile(path.join(root, 'noter.txt'), 'egne noter, rettet af brugeren\n');
  const finished = await chat.finishTask('idle', await changes(root, before));
  assert.equal(finished.id, 'opgave-1'); assert.equal(chat.task, null);
  const overview = await bench.changeOverview();
  assert.deepEqual(overview.tasks[0].files.map(f => [f.file, f.by]), [['public/index.html', 'ai'], ['noter.txt', 'anden']]);
  assert.deepEqual(overview.session.files.map(f => [f.file, f.by]), [['public/index.html', 'ai'], ['noter.txt', 'anden']]);
  const detail = bench.changeFile({ source: 'opgave-1', file: 'public/index.html' });
  assert.deepEqual(detail.hunks[0].lines.map(row => [row.type, row.text]), [['-', '<h1>Før</h1>'], ['+', '<h1>Efter</h1>']]);
  assert.throws(() => bench.changeFile({ source: 'opgave-1', file: '../noget' }), /findes ikke/);
  assert.deepEqual(Object.fromEntries(bench.changedFiles()), { 'public/index.html': 'ændret', 'noter.txt': 'ændret' });
  // Aktivitet: værktøjet står én gang med sin endelige status, og resultatet nævner filen, der ikke var AI’ens.
  const activity = bench.activityList();
  assert.deepEqual(activity.filter(entry => entry.kind === 'tool').map(entry => [entry.target, entry.status]), [['public/index.html', 'completed']]);
  assert.match(activity.find(entry => entry.kind === 'result').detail, /2 filer ændret · 1 af dem ikke af AI'ens filværktøjer · ingen kommandoer kørt/);
  assert.ok(events.some(event => event.type === 'changes.updated' && event.task === 'opgave-1'));
  // Brugeren retter AI’ens fil bagefter: samtalen viser den som blandet, men opgaven er stadig AI’ens.
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>Efter, rettet</h1>\n');
  const later = await bench.changeOverview();
  assert.equal(later.session.files.find(f => f.file === 'public/index.html').by, 'blandet');
  assert.equal(later.tasks[0].files.find(f => f.file === 'public/index.html').by, 'ai');
  assert.equal(later.tasks[0].changedSince, 1, 'opgavens resumé nævner, at filen er ændret igen bagefter');
});
