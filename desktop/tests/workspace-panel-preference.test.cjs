const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../ui/workspace.js'), 'utf8');
function slice(start, end) {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}
function fixture(panelOpen) {
  const grid = { dataset: { surface: panelOpen ? 'on' : 'off' } };
  const nodes = new Map(), opens = [], files = [];
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { setAttribute() {}, classList: { toggle() {} }, replaceChildren() {}, focus() {} });
    return nodes.get(id);
  };
  const context = {
    tabs: ['preview', 'plan', 'changes', 'code', 'activity'], active: 'preview',
    document: { querySelector: () => grid }, tab: node, panel: node, $: node,
    surfaceOpen(open) { opens.push(open); grid.dataset.surface = open ? 'on' : 'off'; },
    changes: {}, code: { files: [], stale: false }, activity: {}, running: false,
    window: { versions: { reset() {} } }, badge() {}, applyMode() {}, browser() {},
    option() {}, renderReferences() {}, updateReferenceButton() {},
    updateActivityBadge() {}, updateActivityStatus() {}, checkCodeFile() {},
    loadCodeList: async () => {}, loadActivity: async () => {}, action: fn => fn(),
    openFile: async (file, options) => files.push({ file, options }),
  };
  vm.createContext(context);
  vm.runInContext([
    slice('function show(name,', 'for (const item of tabs) tab(item).addEventListener'),
    slice('async function onProject()', '// En anden samtale'),
    slice('async function onChat()', 'window.workspace ='),
  ].join('\n'), context);
  return { context, grid, opens, files };
}

for (const open of [false, true]) {
  test(`project initialization preserves ${open ? 'open' : 'closed'} panel without saving a new choice`, async () => {
    const f = fixture(open);
    await f.context.onProject();
    assert.equal(f.grid.dataset.surface, open ? 'on' : 'off');
    assert.deepEqual(f.opens, [], 'initialization must not enter the user save path');
  });
}

test('an explicit tab selection still reveals a closed panel', () => {
  const f = fixture(false);
  f.context.show('preview');
  assert.equal(f.grid.dataset.surface, 'on');
  assert.deepEqual(f.opens, [true]);
});

test('conversation refresh restores file content without revealing the panel or taking focus', async () => {
  const f = fixture(false);
  f.context.code.path = 'src/main.js';
  await f.context.onChat();
  assert.equal(f.grid.dataset.surface, 'off');
  assert.deepEqual(f.opens, []);
  assert.deepEqual(JSON.parse(JSON.stringify(f.files)), [
    { file: 'src/main.js', options: { focus: false, reveal: false } },
  ]);
});

test('opening trajectory in an empty chat survives subsequent phase refreshes', () => {
  const shell = fs.readFileSync(path.join(__dirname, '../ui/workspace-calm.js'), 'utf8');
  const f = fixture(false), log = {}, choices = new WeakMap([[log, { chosen: false }]]);
  const controls = { messages: log, 'chat-panel': { dataset: { phase: 'hero' } } };
  Object.assign(f.context, {
    grid: f.grid, emptyChats: choices, lastLog: log, body: {},
    el: id => controls[id], setClass() {}, panes() {}, showPane() {}, trajectoryButton: {},
  });
  f.context.window.workspace = {
    setSurfaceOpen: f.context.surfaceOpen,
    show: f.context.show,
  };
  const from = shell.indexOf('  function setSurface(open,'), to = shell.indexOf("  el('new-chat').addEventListener", from);
  const phaseFrom = shell.indexOf('  function syncPhase()'), phaseTo = shell.indexOf('  surfaceToggle.addEventListener', phaseFrom);
  const handler = shell.match(/trajectoryButton\.onclick=.*?;\};/)[0];
  vm.runInContext(shell.slice(from, to) + shell.slice(phaseFrom, phaseTo) + handler, f.context);
  f.context.trajectoryButton.onclick();
  f.context.syncPhase();
  f.context.syncPhase();
  assert.equal(f.context.active, 'activity');
  assert.equal(f.grid.dataset.surface, 'on');
  assert.equal(choices.get(log).chosen, true);
  assert.deepEqual(f.opens, [true], 'explicit opening saves the preference once');
});
