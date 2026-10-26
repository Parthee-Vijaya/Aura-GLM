// Afprøver de faktiske UI-funktioner med en lille DOM, uden Electron, modelkald
// eller appdata. Filgendannelse er en kontrolleret IPC-grænse i disse prøver.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class Element {
  constructor(tag = 'div', text = '', className = '') { this.tagName = tag; this.value = ''; this.children = []; this.listeners = {}; this.className = className; this.hidden = false; this.text = text || ''; this.dataset = {}; this.attributes = {}; this.classList = { add: name => { this.className += ' ' + name; }, contains: name => this.className.split(' ').includes(name), toggle: (name, on) => { this.className = this.className.split(' ').filter(n => n !== name).concat(on ? [name] : []).join(' '); } }; }
  get textContent() { return this.text + this.children.map(item => typeof item === 'string' ? item : item.textContent).join(''); }
  set textContent(value) { this.text = value; this.replaceChildren(); }
  get parentElement() { return this.parentNode; }
  get lastChild() { return this.children.at(-1); }
  append(...items) { for (const item of items) { if (typeof item !== 'string') item.parentNode = this; this.children.push(item); } }
  replaceChildren(...items) { for (const item of this.children) if (typeof item !== 'string') item.parentNode = null; this.children = []; this.append(...items); }
  remove() { if (this.parentNode) { this.parentNode.children = this.parentNode.children.filter(item => item !== this); this.parentNode = null; } }
  before(item) { if (this.parentNode) { item.parentNode = this.parentNode; this.parentNode.children.splice(this.parentNode.children.indexOf(this), 0, item); } }
  querySelectorAll(selector) { return this.children.filter(item => typeof item !== 'string').flatMap(item => [...(selector.startsWith('.') ? item.className.split(' ').includes(selector.slice(1)) : item.tagName === selector) ? [item] : [], ...item.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  showModal() { this.open = true; }
  close() { this.open = false; for (const fn of this.listeners.close || []) fn(); }
  focus() { this.focused = true; }
  scrollIntoView() {}
}
function environment(call) {
  const elements = new Map(), dialog = new Element('dialog'); elements.set('#restore-dialog', dialog);
  const $ = selector => {
    if (!elements.has(selector)) { const item = new Element(); elements.set(selector, item); if (selector.startsWith('#restore-')) dialog.append(item); }
    return elements.get(selector);
  };
  const inputs = new Map();
  const document = { querySelector(selector) { if (!inputs.has(selector)) { const input = new Element('input'); input.value = 'ours'; const parent = new Element('label'); parent.append(input, new Element('span')); inputs.set(selector, input); } return inputs.get(selector); }, createTextNode: text => text };
  const view = { id: 'chat', root: '/projekt', review: new Element('section'), log: new Element(), lastSentText: 'Byg siden', followChat: false };
  const context = { $, document, node: (tag, text, classes) => new Element(tag, text, classes), view, current: { root: '/projekt', previewURL: 'aura-preview://test/index.html' }, running: false, call, selectedOwner: () => ({ root: '/projekt', chat: 'chat' }), action: fn => fn(), versionTime: () => '', shortLabel: value => value, featureOn: () => true, info: () => new Element(), requestAnimationFrame: fn => fn(), message: () => {}, displayProject: async () => {}, showChat: async () => {}, refreshRecent: async () => {} };
  context.viewFor = () => view;
  context.window = { harness: { onEvent() {} }, workspace: { showChange: async () => {}, show() {} }, previewViewSize: () => null, ApprovalView: require('../ui/approval-view.js') };
  vm.createContext(context); return { context, $, view, dialog };
}
const historySource = fs.readFileSync(path.join(__dirname, '../ui/history.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../ui/app.js'), 'utf8');
function resultUI(context) {
  vm.runInContext(appSource.slice(appSource.indexOf('function updatePlanOffer('), appSource.indexOf('let localDiscoveryGeneration')), context);
}

test('afvist gennemgang afslutter Henter, bevarer Annuller og kan forsøges igen', async () => {
  let calls = 0;
  const { context, $, dialog } = environment(async () => { calls++; throw Error('Vent på opgaven i projektet.'); });
  vm.runInContext(historySource, context);
  await context.window.reviewRestoration({ task: 'opgave' }, { title: 'Fortryd opgaven' });
  assert.equal(dialog.open, true); assert.equal(dialog.getAttribute('aria-busy'), 'false');
  assert.equal($('#restore-confirm').disabled, true);
  assert.equal($('#restore-summary').textContent, 'Gennemgangen kunne ikke hentes. Ingen filer er ændret.');
  assert.equal($('#restore-feedback').textContent, 'Vent på opgaven i projektet.');
  await dialog.querySelector('.restore-retry').onclick(); assert.equal(calls, 2);
  dialog.close(); assert.equal(dialog.open, false);
});

test('et sent svar efter Annuller åbner ikke dialogen eller aktiverer gendannelse', async () => {
  let resolve;
  const { context, $, dialog } = environment(() => new Promise(done => { resolve = done; }));
  vm.runInContext(historySource, context);
  const request = context.window.reviewRestoration({ task: 'opgave' });
  dialog.close(); resolve({ files: [{ file: 'a.txt' }] }); await request;
  assert.equal(dialog.open, false); assert.equal($('#restore-confirm').disabled, true);
  assert.equal(dialog.getAttribute('aria-busy'), 'false');
});

test('resultatet prioriterer afprøvning; kun et særskilt klik markerer gennemgået', async () => {
  const { context, view } = environment(); resultUI(context);
  const shown = [];
  context.window.workspace.show = name => shown.push(name);
  view.lastCheckpoint = { status: 'saved', head: 'version' };
  context.renderRunReview({ task: 'opgave', mode: 'build', status: 'idle', files: ['a', 'b'], tools: [{ tool: 'bash', title: 'node logic-test.js', output: 'TEKNISK OUTPUT', status: 'completed' }] }, view);
  assert.match(view.review.textContent, /Prøv resultatet/);
  assert.doesNotMatch(view.review.textContent, /2 filer ændret|Kontroller|logic-test|TEKNISK OUTPUT|bestået/);
  assert.match(view.review.textContent, /Ikke gennemgået af dig/);
  const buttons = view.review.querySelectorAll('button');
  await buttons.find(button => button.textContent === 'Afprøv resultatet').onclick();
  assert.deepEqual(shown, ['preview']); assert.equal(view.reviewedTask, undefined);
  await buttons.find(button => button.textContent === 'Ændringer').onclick();
  assert.equal(view.reviewedTask, undefined); assert.equal(view.review.classList.contains('is-reviewed'), false);
  await buttons.find(button => button.textContent === 'Marker som gennemgået').onclick();
  assert.equal(view.reviewedTask, 'opgave'); assert.equal(view.review.classList.contains('is-reviewed'), true);
  assert.match(view.review.textContent, /Du har markeret resultatet som gennemgået/);
  assert.ok(buttons.find(button => button.textContent === 'Fortryd opgaven'));
});

test('afprøvning starter ingen server, og gamle knapper ændrer ikke en anden samtale', async () => {
  const { context, view } = environment(); resultUI(context);
  let shown = 0; context.window.workspace.show = () => { shown++; };
  context.current.previewURL = null;
  context.renderRunReview({ task: 'opgave', status: 'idle', files: ['a'] }, view);
  const tryResult = view.review.querySelectorAll('button').find(b => b.textContent === 'Afprøv resultatet');
  assert.equal(tryResult.disabled, true); await tryResult.onclick(); assert.equal(shown, 0);
  context.current.previewURL = 'aura-preview://test/index.html'; context.syncResultPreview(); assert.equal(tryResult.disabled, false);
  context.view = { id: 'other' };
  await tryResult.onclick();
  await view.review.querySelectorAll('button').find(b => b.textContent === 'Marker som gennemgået').onclick();
  assert.equal(shown, 0); assert.equal(view.reviewedTask, undefined);
});

test('Stop, afvisning og kvalitetsfejl kan aldrig vises som færdigt udkast', async () => {
  const { context, view } = environment(); context.state = { connections: [] }; resultUI(context);
  const rows = [
    [{ status: 'stopped' }, /Du stoppede opgaven/],
    [{ status: 'error', failure: { kind: 'quality', message: 'Lokalt fund' } }, /Den lokale kontrol fandt fejl/],
    [{ status: 'idle', unavailable: true }, /Ændringerne kunne ikke læses/]
  ];
  for (const [input, title] of rows) {
    context.renderRunReview({ task: 'opgave', files: ['a'], ...input }, view);
    assert.match(view.review.textContent, title); assert.doesNotMatch(view.review.textContent, /Prøv resultatet|Marker som gennemgået/);
  }
  view.rejectedThisRun = true; context.renderRunReview({ task: 'opgave', files: ['a'], status: 'idle' }, view);
  assert.match(view.review.textContent, /Du afviste en handling/); assert.doesNotMatch(view.review.textContent, /Prøv resultatet/);
});

test('knapper fra et erstattet resultat kan ikke markere den næste opgave', async () => {
  const { context, view } = environment(); resultUI(context);
  let shown = 0; context.window.workspace.show = () => { shown++; };
  context.renderRunReview({ task: 'previous', status: 'idle', files: ['a'] }, view);
  const old = view.review.querySelectorAll('button');
  context.renderRunReview({ task: 'next', status: 'idle', files: ['b'] }, view);
  await old.find(button => button.textContent === 'Marker som gennemgået').onclick();
  await old.find(button => button.textContent === 'Afprøv resultatet').onclick();
  assert.equal(view.reviewedTask, undefined); assert.equal(shown, 0);
  assert.match(view.review.textContent, /Ikke gennemgået af dig/);
});

test('fortrydelse kvitterer én gang og fjerner opgavens mulighed for at blive fortrudt igen', async () => {
  const { context, $, view, dialog } = environment(async method => method === 'restoreReview' ? { token: 'token', kind: 'task', files: [{ file: 'a', action: 'Ændres', before: 'efter', after: 'før' }] } : { restored: { files: 1 }, saved: true });
  vm.runInContext(historySource, context); resultUI(context);
  await context.window.reviewRestoration({ task: 'opgave' }, { taskUndo: true, taskID: 'opgave' });
  assert.equal($('#restore-confirm').disabled, false);
  await $('#restore-confirm').onclick();
  assert.equal(dialog.open, false); assert.match(view.review.textContent, /^Opgaven er fortrudt/); assert.equal(view.review.querySelectorAll('button').length, 0);
  assert.equal(view.undoneTasks.has('opgave'), true);
  context.renderRunReview({ task: 'opgave', mode: 'build', status: 'idle', files: ['a'] }, view);
  assert.match(view.review.textContent, /^Opgaven er fortrudt/);
  assert.doesNotMatch(view.review.textContent, /Fortryd opgaven|Prøv resultatet|Marker som gennemgået/);
});

test('kun et udtrykkeligt byggeforslag giver Byg videre; almindelig samtale og ventende spørgsmål gør ikke', () => {
  const { context, $, view } = environment(); resultUI(context);
  for (const mode of ['plan', 'chat']) {
    view.planOffer = true;
    context.renderRunReview({ mode, status: 'idle', answered: true, buildOffer: true }, view);
    assert.equal(view.review.hidden, false); assert.match(view.review.textContent, /Næste skridtByg videre/);
    assert.equal(view.plan, undefined); assert.equal($('#plan-offer').hidden, true);
  }
  for (const result of [{ mode: 'plan', status: 'idle', answered: true, buildOffer: false }, { mode: 'chat', status: 'idle', answered: true }, { mode: 'chat', status: 'idle', answered: true, buildOffer: false }]) {
    context.renderRunReview(result, view); assert.equal(view.review.hidden, true);
  }
  view.waitingFor = [{ id: 'spørgsmål' }];
  context.renderRunReview({ mode: 'plan', status: 'idle', answered: true, buildOffer: true }, view); assert.equal(view.review.hidden, true);
});

test('en konkret plan har forrang frem for en gammel eller sen plananbefaling', () => {
  const { context, $, view } = environment(); resultUI(context);
  view.plan = { id: 'konkret-plan' }; view.planOffer = true;
  context.updatePlanOffer();
  assert.equal(view.planOffer, false); assert.equal($('#plan-offer').hidden, true);
  context.renderRunReview({ mode: 'chat', status: 'idle', answered: true, buildOffer: true }, view);
  assert.equal(view.review.hidden, true); assert.equal(view.buildOffer, false);
  const background = { plan: { id: 'anden-plan' }, planOffer: true };
  view.plan = null; view.planOffer = true; context.updatePlanOffer();
  context.updatePlanOffer(background);
  assert.equal(background.planOffer, false); assert.equal($('#plan-offer').hidden, false, 'Baggrundsplanen ændrer ikke den åbne samtale.');
});

test('en sen fortrydelse kvitterer i sin egen samtale uden at overtage et andet projekt', async () => {
  let resolve, navigations = 0;
  const { context, $, view, dialog } = environment(async method => method === 'restoreReview' ? { token: 'token', kind: 'task', files: [{ file: 'a', action: 'Ændres' }] } : new Promise(done => { resolve = done; }));
  context.displayProject = async () => { navigations++; };
  vm.runInContext(historySource, context);
  await context.window.reviewRestoration({ task: 'opgave' }, { taskUndo: true, taskID: 'opgave' });
  const pending = $('#restore-confirm').onclick();
  dialog.close();
  const nextView = { id: 'anden', root: '/andet', review: new Element('section') };
  context.current = { root: '/andet' }; context.view = nextView;
  resolve({ project: { root: '/projekt' }, restored: { files: 1 }, saved: true }); await pending;
  assert.equal(navigations, 0); assert.equal(context.view, nextView);
  assert.match(view.review.textContent, /^Opgaven er fortrudt/); assert.equal(view.undoneTasks.has('opgave'), true);
  assert.equal(nextView.review.textContent, ''); assert.equal(view.review.focused, undefined);
});

function previewUI(context, initialText = 'Godkendt version') {
  const frame = context.$('#preview');
  let disk = initialText, rendered = initialText, navigations = 0, poll;
  frame.setAttribute('src', context.current.previewURL);
  Object.defineProperty(frame, 'src', { get: () => frame.getAttribute('src'), set(value) { frame.setAttribute('src', value); rendered = disk; navigations++; } });
  context.current.workspaceRoot = context.current.root;
  context.revision = null; context.polling = false;
  context.syncResultPreview = () => {};
  context.setInterval = (callback, ms) => { assert.equal(ms, 1500); poll = callback; };
  // Den rigtige visning og revisionskontrol: ingen tidligere revision ved opstart.
  const show = appSource.slice(appSource.indexOf('function showPreview('), appSource.indexOf('async function displayProject('));
  const interval = appSource.split('\n').find(line => line.startsWith('setInterval(async () => { if (!current || polling)'));
  assert.ok(interval); vm.runInContext(show + '\n' + interval, context);
  context.showChat = async next => context.showPreview(next.preview.previewURL, next.preview.previewExternal);
  return { write: text => { disk = text; }, poll: () => poll(), rendered: () => rendered, navigations: () => navigations, frame };
}

test('fortrydelse før første revisionskontrol genindlæser den eksisterende statiske forhåndsvisning', async () => {
  const calls = []; let preview;
  const { context, $, dialog } = environment(async method => {
    calls.push(method);
    if (method === 'restoreReview') return { token: 'token', kind: 'undo', files: [{ file: 'public/index.html', action: 'Ændres' }] };
    if (method === 'restoreVersion') {
      preview.write('Ugemt forsøg');
      return { restored: { files: 1 }, state: { preview: { previewURL: context.current.previewURL, previewExternal: false } } };
    }
    if (method === 'revision') return 'after-undo';
    throw Error('Uventet handling: ' + method);
  });
  vm.runInContext(historySource, context); preview = previewUI(context);
  await context.window.reviewRestoration({ undo: true });
  assert.equal(context.revision, null); assert.equal(preview.rendered(), 'Godkendt version');
  await $('#restore-confirm').onclick();
  assert.equal(dialog.open, false); assert.equal(preview.rendered(), 'Ugemt forsøg');
  assert.equal(preview.navigations(), 1);
  for (let index = 0; index < 20; index++) await preview.poll();
  assert.equal(preview.rendered(), 'Ugemt forsøg'); assert.equal(preview.navigations(), 1);
  assert.deepEqual(calls.slice(0, 2), ['restoreReview', 'restoreVersion']);
  assert.ok(calls.every(method => ['restoreReview', 'restoreVersion', 'revision'].includes(method)), 'Ingen serverstart, tilslutning eller ny godkendelse.');
});

for (const scenario of ['unchanged', 'blocked', 'external', 'stopped', 'wrong-owner', 'closed-dialog', 'changed-during-show']) test('gendannelse genindlæser ikke en uvedkommende eller ikke-aktiv forhåndsvisning: ' + scenario, async () => {
  let resolve, preview;
  const { context, $, dialog } = environment(async method => {
    if (method === 'restoreReview') return { token: 'token', kind: 'undo', files: [{ file: 'public/index.html', action: 'Ændres' }] };
    assert.equal(method, 'restoreVersion'); return new Promise(done => { resolve = done; });
  });
  vm.runInContext(historySource, context); preview = previewUI(context);
  if (scenario === 'changed-during-show') {
    const show = context.showChat;
    context.showChat = async next => { await show(next); context.current = { root: '/andet', previewURL: 'aura-preview://other/' }; context.view = { id: 'other' }; };
  }
  await context.window.reviewRestoration({ undo: true });
  const pending = $('#restore-confirm').onclick();
  if (scenario === 'wrong-owner') { context.current = { root: '/andet', previewURL: 'aura-preview://other/' }; context.view = { id: 'other' }; }
  if (scenario === 'closed-dialog') dialog.close();
  const url = ['blocked', 'stopped'].includes(scenario) ? null : scenario === 'external' ? 'http://127.0.0.1:4567/' : 'aura-preview://test/index.html';
  if (scenario === 'external') preview.frame.setAttribute('src', url);
  resolve({ restored: { files: scenario === 'unchanged' ? 0 : 1 }, state: { preview: { previewURL: url, previewExternal: scenario === 'external' } } });
  await pending;
  assert.equal(preview.navigations(), 0);
});
