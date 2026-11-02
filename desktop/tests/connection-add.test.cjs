// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ConnectionOverview = require('../ui/connection-overview.js');

// Det lette "Tilføj forbindelse"-flow lever i app.js' rendererdel og køres her som
// ægte udsnit i et syntetisk DOM, ligesom profile-step.test.cjs gør for
// opsætningstrinnene. Fixturet spejler #connections-dialog-træet fra index.html:
// listen, tilføj-flowet og redigeringsvisningen med den delte forbindelsesformular.
const ui = path.join(__dirname, '..', 'ui');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const calmCss = fs.readFileSync(path.join(ui, 'workspace-calm.css'), 'utf8');
function slice(from, to) {
  const start = app.indexOf(from);
  assert.ok(start >= 0, `app.js mangler "${from}"`);
  const end = app.indexOf(to, start);
  assert.ok(end > start, `app.js mangler "${to}" efter "${from}"`);
  return app.slice(start, end);
}
const flowCode = [
  slice('function moveConnectionForm', 'function setupPage'),
  slice('const providerCards = [', 'function setupProvider'),
  slice('// Forbindelser bliver gemt hver for sig', "$('#connection-use').onclick"),
  slice('const keyGuides = {', 'async function loadModels'),
  slice('function connectionInput', "$('#credential-open').onclick"),
  slice("$('#connection-form').onsubmit", "$('#connection-select').onchange"),
  slice('async function removeSavedConnection', '// Trin for trin til en nøgle'),
  slice("$('#connections-dialog').addEventListener('close'", 'setInterval(async')
].join('\n');

class El {
  constructor(tag, document) {
    this.tagName = String(tag).toUpperCase(); this.document = document;
    this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = '';
    this.value = ''; this.checked = false; this.type = ''; this.name = '';
    this.required = false; this.readOnly = false; this.title = ''; this.src = '';
    this.width = 0; this.height = 0; this.alt = ''; this.draggable = false;
    this.listeners = {}; this.onclick = null; this.onchange = null; this.oninput = null; this.onsubmit = null;
  }
  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  get classList() {
    const el = this;
    return {
      add: (...names) => names.forEach(name => el._classes.add(name)),
      remove: (...names) => names.forEach(name => el._classes.delete(name)),
      toggle: (name, force) => { const on = force === undefined ? !el._classes.has(name) : Boolean(force); if (on) el._classes.add(name); else el._classes.delete(name); return on; },
      contains: name => el._classes.has(name)
    };
  }
  get textContent() { return this._text + this.children.map(child => typeof child === 'string' ? child : child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name.slice(5))]; }
  append(...children) { for (const child of children) { if (child instanceof El) child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) if (child instanceof El) child.parentElement = this; this.children.unshift(...children); }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  async emit(name, fields = {}) { const event = { target: this, preventDefault() { this.prevented = true; }, ...fields }; for (const handler of this.listeners[name] || []) await handler(event); return event; }
  focus() { this.document.activeElement = this; }
  click() { if (this.disabled) return; if (typeof this.onclick === 'function') this.onclick(); }
  // En formularreset rydder felterne, så ingen uudfyldt kladde lægger i setup senere.
  reset() { for (const el of [this, ...descendants(this)]) if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) { if (el.type === 'checkbox' || el.type === 'radio') el.checked = false; else el.value = ''; } }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; void this.emit('close'); }
  get previousElementSibling() { if (!this.parentElement) return null; const i = this.parentElement.children.indexOf(this); return i > 0 ? this.parentElement.children[i - 1] : null; }
  get nextElementSibling() { if (!this.parentElement) return null; const c = this.parentElement.children, i = c.indexOf(this); return i >= 0 && i + 1 < c.length ? c[i + 1] : null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) { return selectWithin(this, selector); }
}
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
function matches(el, selector) {
  const tag = /^[a-z][a-z0-9-]*/i.exec(selector)?.[0] ?? '';
  if (tag && el.tagName.toLowerCase() !== tag.toLowerCase()) return false;
  const id = /#([A-Za-z0-9_-]+)/.exec(selector)?.[1];
  if (id && el.id !== id) return false;
  for (const match of selector.matchAll(/\.([A-Za-z0-9_-]+)/g)) if (!el._classes.has(match[1])) return false;
  for (const [, name, value] of selector.matchAll(/\[([a-z-]+)(?:="([^"]*)")?\]/gi)) {
    const actual = name.startsWith('data-') ? el.dataset[dataKey(name.slice(5))] : el.getAttribute(name);
    if (value === undefined) { if (actual === undefined || actual === null) return false; }
    else if (String(actual) !== value) return false;
  }
  return true;
}
function descendants(el) { return el.children.flatMap(child => typeof child === 'string' ? [] : [child, ...descendants(child)]); }
function selectWithin(root, selector) {
  const parts = selector.trim().split(/\s+/);
  return descendants(root).filter(el => {
    if (!matches(el, parts[parts.length - 1])) return false;
    let node = el;
    for (let part = parts.length - 2; part >= 0; part--) {
      do { node = node.parentElement; } while (node && node !== root && !matches(node, parts[part]));
      if (!node || !matches(node, parts[part])) return false;
    }
    return true;
  });
}

const definitions = {
  corti: { name: 'Corti S1 · EU', provider: 'Corti', baseURL: 'https://app.corti.io/v1' },
  anthropic: { name: 'Anthropic API', provider: 'Anthropic', baseURL: 'https://api.anthropic.com' },
  ollama: { name: 'Ollama', provider: 'Ollama', baseURL: 'http://localhost:11434' },
  compatible: { name: 'Egen server', provider: 'Egen', baseURL: 'http://127.0.0.1:8000/v1' }
};
// Fixture spejler #connections-dialog-træet: listen, tilføj-flowet og redigeringsvisningen.
function makeDom() {
  const document = { activeElement: null };
  document.createElement = tag => new El(tag, document);
  document.body = new El('body', document);
  document.querySelectorAll = selector => selectWithin(document.body, selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag, document); if (id) { el.id = id; registry.set(id, el); } return el; };
  const setup = make('main', 'setup'); setup.hidden = true; document.body.append(setup);
  const dialog = make('dialog', 'connections-dialog');
  const heading = new El('div', document); heading.className = 'dialog-heading';
  const title = make('h2', 'connections-title');
  const headingText = make('span', 'connections-heading'); headingText.textContent = 'AI-forbindelser';
  title.append(headingText); heading.append(title, new El('button', document));
  dialog.append(heading);
  const list = make('section', 'connections-list');
  list.append(make('p', 'retired-connections-notice'), make('input', 'connections-search'), make('div', 'saved-connections'));
  const pages = make('nav', 'connections-pages'); pages.className = 'connection-pages';
  pages.append(make('button', 'connections-prev'), make('span', 'connections-page'), make('button', 'connections-next'));
  const listActions = new El('div', document); listActions.className = 'dialog-actions';
  listActions.append(make('button', 'connections-check'), make('button', 'connection-add'));
  list.append(pages, make('p', 'connections-feedback'), listActions, make('button', 'connections-setup'));
  dialog.append(list);
  const flow = make('section', 'connection-add-flow'); flow.hidden = true;
  flow.append(make('h3', 'connection-add-lead'));
  const grid = make('div', 'add-provider-cards'); grid.className = 'provider-cards';
  const flowHome = make('div', 'add-connection-home'); flowHome.hidden = true;
  const flowActions = new El('div', document); flowActions.className = 'dialog-actions';
  flowActions.append(new El('span', document), make('button', 'connection-add-cancel'));
  flow.append(grid, flowHome, flowActions);
  dialog.append(flow);
  const edit = make('section', 'connection-edit'); edit.hidden = true;
  edit.append(make('button', 'connection-back'));
  const home = make('div', 'connection-form-home');
  const form = make('form', 'connection-form');
  form.append(make('input', 'connection-id'));
  const kind = make('select', 'provider-kind'); kind.value = 'corti'; form.append(kind);
  const azure = make('section', 'azure-fields'); azure.hidden = true;
  azure.append(make('input', 'azure-endpoint'), make('input', 'azure-deployment'), make('select', 'azure-protocol'));
  form.append(azure);
  const guide = new El('details', document); guide.className = 'key-guide';
  guide.append(make('summary', 'key-guide-summary'), make('ol', 'key-steps'), make('button', 'provider-account'));
  form.append(guide);
  const advanced = make('details', 'connection-advanced');
  advanced.append(make('input', 'connection-name'), make('input', 'base-url'), make('span', 'base-url-help'), new El('p', document));
  form.append(advanced);
  form.append(make('button', 'credential-open'), make('p', 'credential-status'));
  const clearRow = make('label', 'clear-key-row'); const clearKey = make('input', 'clear-key'); clearKey.type = 'checkbox';
  clearRow.append(clearKey); form.append(clearRow, make('p', 'connection-cost'), make('button', 'cost-info'));
  const formActions = new El('div', document); formActions.className = 'dialog-actions';
  formActions.append(new El('span', document), make('button', 'save-connection'));
  form.append(formActions);
  home.append(form, make('p', 'connection-feedback'));
  edit.append(home);
  const manage = new El('div', document); manage.className = 'dialog-actions connection-manage';
  manage.append(make('button', 'connection-use'), make('button', 'connection-test'), make('button', 'connection-remove'));
  edit.append(manage);
  dialog.append(edit);
  document.body.append(dialog);
  return { document, registry, dialog };
}
// En harness med de rigtige svarkontrakter: saveConnection returnerer hele
// forbindelsestilstanden, models kaster ved fejl, og gate kan holde kontrollen tilbage.
function makeHarness({ definitions: defs = definitions, connections = [], models = [], modelsError = null, gate = null, saveGate = null } = {}) {
  const store = { connections: connections.map(c => ({ ...c })), definitions: defs };
  const saves = [], modelCalls = [], removals = [];
  const snapshot = () => ({ connections: store.connections.map(c => ({ ...c })), retiredConnections: [], definitions: defs });
  const api = {
    saveConnection: async input => {
      if (saveGate) await saveGate;
      saves.push(input);
      const id = input.id || `forbindelse-${store.connections.length + 1}`;
      const connection = { id, kind: input.kind, name: input.name, baseURL: input.baseURL, deployment: input.deployment, protocol: input.protocol };
      const existing = store.connections.findIndex(c => c.id === id);
      if (existing >= 0) store.connections[existing] = connection; else store.connections.push(connection);
      return snapshot();
    },
    models: async id => { modelCalls.push(id); if (gate) await gate; if (modelsError) throw Error(modelsError); return models; },
    credentialCancel: async () => ({}),
    removeConnection: async id => { removals.push(id); store.connections = store.connections.filter(c => c.id !== id); return snapshot(); }
  };
  return { api, saves, modelCalls, removals, get connections() { return store.connections; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
function runFlow(options = {}) {
  const dom = makeDom();
  const harness = makeHarness(options);
  const saved = { showSetup: 0, setupPages: [], failures: [], actions: [] };
  const $ = selector => {
    const found = dom.document.querySelector(selector);
    if (found || !/^#[A-Za-z0-9_-]+$/.test(selector)) return found;
    if (!dom.registry.has(selector.slice(1))) { const el = new El('div', dom.document); el.id = selector.slice(1); dom.registry.set(selector.slice(1), el); }
    return dom.registry.get(selector.slice(1));
  };
  const context = {
    $, document: dom.document,
    window: { ConnectionRemoval: { request: async ({ stillCurrent, remove }) => { if (!stillCurrent(remove && 'x')) { throw Error('Forbindelsen eller dit valg er ændret. Gennemgå fjernelsen igen.'); } return remove('one'); } } },
    node: (tag, text, className) => { const el = new El(tag, dom.document); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; },
    option: (value, label) => { const el = new El('option', dom.document); el.textContent = label; el.value = value; return el; },
    info: label => { const el = new El('button', dom.document); el.setAttribute('aria-label', `Mere om ${label}`); return el; },
    state: { connections: options.connections?.map(c => ({ ...c })) || [], retiredConnections: [], definitions: options.definitions || definitions },
    ConnectionOverview,
    current: null, projectLoading: false, setupActive: false, setupStep: 'choice', guidedSetup: false,
    setupGeneration: 0, verifiedConnection: '', acceptedFingerprint: null, pendingSend: null,
    connectionReceipt: null, connectionTicket: 0, onboardingPreviewKind: '', autoConnect: false, navigationRequest: 0,
    call: async (method, value) => { if (!harness.api[method]) throw new Error(`Uventet kald: ${method}`); return harness.api[method](value); },
    // action()-optagelsen gør det muligt at afvente den asynkrone gemning: selve
    // onsubmit-returnerer intet, når browseren kalder den.
    action: fn => { const promise = fn(); saved.actions.push(promise); return promise; },
    setupControls: () => {}, setupPage: step => saved.setupPages.push(step), testSetupConnection: async () => {},
    renderSetup: () => {}, renderStartupConnections: () => {}, syncOnboardingVisuals: () => {},
    connectionFailed: reason => saved.failures.push(reason), showSetup: () => { saved.showSetup++; }
  };
  vm.runInNewContext(flowCode, context);
  return { context, document: dom.document, registry: dom.registry, dialog: dom.dialog, harness, saved, $ };
}
const openFlow = f => { f.dialog.showModal(); f.registry.get('connection-add').onclick(); };
const chooseProvider = (f, kind) => f.document.querySelectorAll('#add-provider-cards button').find(card => card.dataset.kind === kind).onclick();
const submitConnection = f => { f.registry.get('connection-form').onsubmit({ preventDefault: () => {} }); return f.saved.actions.at(-1); };
const rowStatus = f => f.document.querySelectorAll('#saved-connections [data-connection-status]')[0];

test('Tilføj forbindelse viser udbydergitteret i dialogen — opsætningsskærmen forbliver skjult', () => {
  const f = runFlow();
  openFlow(f);
  assert.equal(f.saved.showSetup, 0, 'setup-skærmen genåbnes ikke');
  assert.equal(f.registry.get('setup').hidden, true, 'setup-skærmen forbliver skjult');
  assert.equal(f.dialog.open, true, 'dialogen forbliver åben');
  assert.equal(f.registry.get('connection-add-flow').hidden, false, 'flowet vises inde i dialogen');
  assert.equal(f.registry.get('connections-list').hidden, true);
  assert.equal(f.registry.get('connection-edit').hidden, true);
  assert.equal(f.registry.get('connections-heading').textContent, 'Tilføj forbindelse');
  assert.equal(f.registry.get('connection-add-lead').textContent, 'Vælg den udbyder eller server, du har adgang til');
  assert.equal(f.registry.get('add-connection-home').hidden, true, 'formularen kommer først efter valget');
  assert.equal(f.registry.get('connection-form').parentElement.id, 'connection-form-home');
  const cards = f.document.querySelectorAll('#add-provider-cards button');
  assert.equal(cards.length, 10, 'hele udbyderlisten fra opsætningen genbruges');
  const corti = cards.find(card => card.dataset.kind === 'corti');
  assert.ok(corti, 'corti-kortet findes');
  assert.equal(corti.querySelector('img').src, 'provider-corti.svg', 'SVG-logoerne genbruges fra opsætningen');
  assert.equal(corti.querySelector('strong').textContent, 'Corti');
  assert.ok(cards.every(card => card.querySelector('small')?.dataset.providerStatus === card.dataset.kind), 'hvert kort bærer sin statuslinje');
  assert.equal(f.document.activeElement, cards[0], 'fokus lægges på det første udbyderkort');
});

test('valg af udbyder flytter formularen ind i flowet med Gem og kontrollér', () => {
  const f = runFlow();
  openFlow(f);
  chooseProvider(f, 'corti');
  assert.equal(f.registry.get('connection-form').parentElement.id, 'add-connection-home', 'formularen flytter ind i dialogen');
  assert.equal(f.registry.get('connection-feedback').parentElement.id, 'add-connection-home', 'feedbacklinjen følger med');
  assert.equal(f.registry.get('add-provider-cards').hidden, true, 'gitteret viger for formularen');
  assert.equal(f.registry.get('add-connection-home').hidden, false);
  assert.equal(f.registry.get('provider-kind').value, 'corti');
  assert.equal(f.registry.get('base-url').value, definitions.corti.baseURL, 'serveradressen præudfyldes fra udbyderen');
  assert.equal(f.registry.get('connection-name').value, 'Corti S1 · EU', 'navnet præudfyldes');
  assert.equal(f.registry.get('save-connection').textContent, 'Gem og kontrollér');
  assert.equal(f.registry.get('clear-key-row').hidden, true, 'en ny forbindelse har ingen gemt nøgle at fjerne');
  assert.equal(f.registry.get('connection-add-lead').textContent, 'Forbind Corti');
  assert.equal(f.document.activeElement, f.registry.get('credential-open'), 'fokus lægges på nøgleindtastningen');
  assert.equal(f.registry.get('connection-add-flow').hidden, false);
});

test('gem gemmer forbindelsen, kontrollerer den og vender tilbage til listen', async () => {
  const f = runFlow({ models: [{ id: 'corti-s1', name: 'Corti S1' }] });
  openFlow(f);
  chooseProvider(f, 'corti');
  await submitConnection(f);
  assert.equal(f.harness.saves.length, 1);
  assert.equal(f.harness.saves[0].kind, 'corti');
  assert.equal(f.harness.saves[0].id, undefined, 'en ny forbindelse oprettes');
  assert.equal(f.harness.saves[0].baseURL, definitions.corti.baseURL);
  assert.deepEqual(f.harness.modelCalls, ['forbindelse-1'], 'kontrollen bruger den gemte id — ikke en kladdet');
  assert.equal(f.registry.get('connection-add-flow').hidden, true, 'succes vender tilbage til listen');
  assert.equal(f.registry.get('connections-list').hidden, false);
  const feedback = f.registry.get('connections-feedback').textContent;
  assert.ok(feedback.includes('er gemt.'), feedback);
  assert.ok(feedback.includes('1 model i kataloget'), 'kontrolresultatet vises');
  assert.equal(f.document.querySelectorAll('#saved-connections .saved-connection').length, 1, 'forbindelsen står i listen');
  assert.equal(rowStatus(f).dataset.state, 'connected', 'rækken viser forbundet');
  assert.equal(f.registry.get('connection-id').value, '', 'formularen er renset');
  assert.equal(f.registry.get('connection-name').value, '', 'ingen kladde lægger tilbage');
  assert.equal(f.registry.get('save-connection').textContent, 'Gem forbindelse', 'redigeringsteksten er tilbage');
  assert.equal(f.registry.get('connection-form').parentElement.id, 'connection-form-home');
  assert.equal(f.document.activeElement, f.registry.get('connection-add'));
});

test('kontrolfejl lader forbindelsen være gemt med fejltekst og redigering fra listen', async () => {
  const f = runFlow({ modelsError: 'Adgang afvist' });
  openFlow(f);
  chooseProvider(f, 'corti');
  await submitConnection(f);
  assert.equal(f.registry.get('connection-add-flow').hidden, false, 'flowet bliver synligt med fejlen');
  assert.equal(f.registry.get('connections-list').hidden, true);
  const feedback = f.registry.get('connection-feedback').textContent;
  assert.ok(feedback.includes('Adgang afvist'), feedback);
  assert.ok(feedback.includes('Forbindelsen er gemt'), 'fejlteksten forklarer, at forbindelsen findes');
  assert.equal(f.registry.get('connection-id').value, 'forbindelse-1', 'en ny gemning retter den gemte forbindelse i stedet for at oprette en til');
  assert.equal(f.context.state.connections.length, 1, 'forbindelsen forbliver gemt');
  f.registry.get('connection-add-cancel').onclick();
  assert.equal(f.registry.get('connections-list').hidden, false);
  const rows = f.document.querySelectorAll('#saved-connections .saved-connection');
  assert.equal(rows.length, 1);
  assert.equal(rowStatus(f).dataset.state, 'error', 'rækken viser, at adgangen ikke virker');
  assert.ok(rows[0].querySelectorAll('button').some(button => button.textContent === 'Åbn'), 'forbindelsen kan redigeres fra listen');
});

test('et svar uden modeller bliver heller ikke en succes', async () => {
  const f = runFlow({ models: [] });
  openFlow(f);
  chooseProvider(f, 'corti');
  await submitConnection(f);
  assert.equal(f.registry.get('connection-add-flow').hidden, false, 'brugeren får lov at rette oplysningerne');
  assert.ok(f.registry.get('connection-feedback').textContent.includes('svarer uden modeller'));
  assert.equal(f.context.state.connections.length, 1, 'forbindelsen er stadig gemt');
});

test('en fejl under selve gemningen vises i flowet uden at rydde formularen', async () => {
  const f = runFlow();
  f.harness.api.saveConnection = async () => { throw Error('Navnet bruges allerede.'); };
  openFlow(f);
  chooseProvider(f, 'corti');
  await submitConnection(f);
  assert.ok(f.registry.get('connection-feedback').textContent.includes('Navnet bruges allerede.'));
  assert.equal(f.registry.get('connection-add-flow').hidden, false);
  assert.equal(f.registry.get('connection-name').value, 'Corti S1 · EU', 'indtastningen bevares til rettelse');
});

test('Annullér returnerer formularen renset til listen uden at gemme', () => {
  const f = runFlow();
  openFlow(f);
  chooseProvider(f, 'corti');
  f.registry.get('connection-name').value = 'Min egen forbindelse';
  f.registry.get('connection-add-cancel').onclick();
  assert.equal(f.harness.saves.length, 0, 'intet gemmes');
  assert.equal(f.registry.get('connections-list').hidden, false);
  assert.equal(f.registry.get('connection-add-flow').hidden, true);
  assert.equal(f.registry.get('connection-name').value, '', 'udfyldte værdier lægger ikke i kladden');
  assert.equal(f.registry.get('connection-id').value, '');
  assert.equal(f.registry.get('save-connection').textContent, 'Gem forbindelse');
  assert.equal(f.registry.get('connection-form').parentElement.id, 'connection-form-home', 'formularen er tilbage i redigeringshjemmet');
  assert.equal(f.registry.get('connections-heading').textContent, 'AI-forbindelser');
  assert.equal(f.document.activeElement, f.registry.get('connection-add'));
});

test('Escape virker som Annullér — både i gitteret og i formularen', async () => {
  const f = runFlow();
  openFlow(f);
  const gridEvent = await f.dialog.emit('cancel');
  assert.equal(gridEvent.prevented, true, 'dialogen lukker ikke, mens flowet er åbent');
  assert.equal(f.dialog.open, true);
  assert.equal(f.registry.get('connections-list').hidden, false);
  assert.equal(f.registry.get('connection-add-flow').hidden, true);
  openFlow(f);
  chooseProvider(f, 'anthropic');
  const formEvent = await f.dialog.emit('cancel');
  assert.equal(formEvent.prevented, true);
  assert.equal(f.dialog.open, true);
  assert.equal(f.registry.get('connections-list').hidden, false);
  assert.equal(f.registry.get('connection-name').value, '', 'formularen er renset');
  assert.equal(f.harness.saves.length, 0);
});

test('lukning under en kørende kontrol skriver ikke resultat ind i det lukkede flow', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = runFlow({ models: [{ id: 'corti-s1', name: 'Corti S1' }], gate });
  openFlow(f);
  chooseProvider(f, 'corti');
  const submitting = submitConnection(f);
  await flush();
  assert.ok(f.registry.get('connection-feedback').textContent.includes('Kontrollerer'), 'kontrollen står som ventende');
  f.dialog.close();
  assert.equal(f.registry.get('connection-add-flow').hidden, true, 'luk-eventet rydder flowet');
  assert.equal(f.registry.get('connection-feedback').textContent, '', 'formularen er renset ved lukning');
  release();
  await submitting;
  assert.equal(f.registry.get('connection-feedback').textContent, '', 'det lukkede flow får ikke resultatet skrevet ind');
  assert.equal(f.registry.get('connections-feedback').textContent, '', 'listens status er uændret');
  assert.equal(f.context.state.connections.length, 1, 'forbindelsen forblev gemt');
  assert.equal(f.registry.get('connection-add-flow').hidden, true, 'flowet vender ikke tilbage af sig selv');
});

test('Annullér under en kørende kontrol viser resultatet i listen — flowet vender ikke tilbage', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = runFlow({ models: [{ id: 'corti-s1', name: 'Corti S1' }], gate });
  openFlow(f);
  chooseProvider(f, 'corti');
  const submitting = submitConnection(f);
  await flush();
  await f.dialog.emit('cancel');
  assert.equal(f.dialog.open, true);
  assert.equal(f.registry.get('connections-list').hidden, false);
  release();
  await submitting;
  assert.equal(f.registry.get('connections-list').hidden, false, 'flowet vender ikke tilbage af sig selv');
  assert.equal(rowStatus(f).dataset.state, 'connected', 'kontrollens resultat nåede listen');
  assert.equal(f.registry.get('connections-feedback').textContent, '', 'succeslinjen tilhører kun det åbne flow');
});

test('genåbning af flowet afslutter en gammel, hængende kontrol', async () => {
  let release; const gate = new Promise(resolve => { release = resolve; });
  const f = runFlow({ models: [{ id: 'corti-s1', name: 'Corti S1' }], gate });
  openFlow(f);
  chooseProvider(f, 'corti');
  const submitting = submitConnection(f);
  await flush();
  assert.ok(f.registry.get('connection-feedback').textContent.includes('Kontrollerer'));
  await f.dialog.emit('cancel');        // annullér, mens kontrollen hænger
  openFlow(f);                          // genåbn og udfyld et nyt flow
  chooseProvider(f, 'anthropic');
  f.registry.get('connection-name').value = 'Ny forbindelse';
  release();
  await submitting;
  assert.equal(f.registry.get('connection-add-flow').hidden, false, 'det nye flow består');
  assert.equal(f.registry.get('add-connection-home').hidden, false, 'formularen ligger stadig i flowet');
  assert.equal(f.registry.get('connection-name').value, 'Ny forbindelse', 'formularen er uændret');
  assert.equal(f.registry.get('connection-feedback').textContent, '', 'den gamle verifikation skriver hverken fejl- eller ventetekst ind');
  assert.equal(f.registry.get('connections-list').hidden, true, 'brugeren smides ikke ud af det halvudfyldte flow');
  assert.equal(f.registry.get('connections-feedback').textContent, '', 'den gamle runde efterlader ingen succeslinje');
});

test('genåbning af flowet afslutter en gammel, hængende gemning', async () => {
  let release; const saveGate = new Promise(resolve => { release = resolve; });
  const f = runFlow({ saveGate });
  openFlow(f);
  chooseProvider(f, 'corti');
  const submitting = submitConnection(f);
  await flush();
  await f.dialog.emit('cancel');        // annullér, mens gemningen hænger
  openFlow(f);                          // genåbn og udfyld et nyt flow
  chooseProvider(f, 'anthropic');
  f.registry.get('connection-name').value = 'Ny forbindelse';
  release();
  await submitting;
  assert.equal(f.harness.saves.length, 1, 'den gamle gemning gik igennem');
  assert.equal(f.context.state.connections.length, 1, 'forbindelsen er gemt');
  assert.equal(f.registry.get('connection-add-flow').hidden, false, 'det nye flow består');
  assert.equal(f.registry.get('add-connection-home').hidden, false, 'formularen ligger stadig i flowet');
  assert.equal(f.registry.get('connection-name').value, 'Ny forbindelse', 'formularen røres ikke af den gamle gemning');
  assert.equal(f.registry.get('connections-list').hidden, true, 'ingen tilbagesmidth til listen');
  assert.equal(f.registry.get('connections-feedback').textContent, 'Forbindelsen er gemt.', 'gemningen kvitteres i listens statuslinje');
});

test('flowet holder listen skjult, så en igangværende fjernelse fra listen afvises', async () => {
  const f = runFlow({ connections: [{ id: 'one', kind: 'corti', name: 'Gammel forbindelse' }] });
  openFlow(f);
  await assert.rejects(f.context.removeSavedConnection('one', { fromList: true }), /ændret/, 'fjernelsen kræver en synlig liste');
  assert.equal(f.harness.removals.length, 0, 'ingen fjernelse gennemføres under flowet');
});

test('index.html har flowet som sektion mellem listen og redigeringsvisningen', () => {
  const dialogStart = index.indexOf('<dialog id="connections-dialog"');
  const dialog = index.slice(dialogStart, index.indexOf('</dialog>', dialogStart));
  const listAt = dialog.indexOf('<section id="connections-list"');
  const flowAt = dialog.indexOf('<section id="connection-add-flow"');
  const editAt = dialog.indexOf('<section id="connection-edit"');
  assert.ok(listAt >= 0 && flowAt > listAt && editAt > flowAt, 'flowet ligger inde i AI-forbindelsesdialogen');
  const flow = dialog.slice(flowAt, editAt);
  assert.match(flow, /aria-labelledby="connection-add-lead"/);
  assert.match(flow, /id="connection-add-lead"/);
  assert.match(flow, /id="add-provider-cards"/);
  assert.match(flow, /class="provider-cards"/);
  assert.match(flow, /id="add-connection-home"/);
  assert.match(flow, /id="connection-add-cancel"/);
  assert.ok(flow.includes('Annullér'));
  assert.match(flow, /hidden/);
});

test('app.js knytter Tilføj forbindelse til flowet — ikke til opsætningsskærmen', () => {
  assert.ok(app.includes("$('#connection-add').onclick = () => openAddConnection()"), 'indgangen er det inline flow');
  assert.ok(!app.includes("$('#connection-add').onclick = () => { $('#connections-dialog').close(); showSetup(); }"), 'opsætningsskærmen genåbnes ikke fra Tilføj forbindelse');
  assert.ok(app.includes('renderProviderCards($(\'#add-provider-cards\'), chooseAddProvider, false)'), 'udbydergitteret genbruger opsættelsens gengivelse');
  assert.ok(app.includes('function moveConnectionForm(guided, addFlow = false)'), 'moveConnectionForm har flowet som tredje hjem');
  assert.ok(app.includes("'Gem og kontrollér'"), 'flowets gemknap kontrollerer også');
});

test('flowets stilarter bor i workspace-calm.css med aura-tokens', () => {
  assert.ok(calmCss.includes('#connection-add-flow'), 'flowet styles i workspace-calm.css');
  assert.ok(/--aura-radius/.test(calmCss), 'radius og kanter kommer fra aura-tokens');
});
