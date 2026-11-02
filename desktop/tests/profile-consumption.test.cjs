const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { blank } = require('../core/profile.cjs');

// Forbruget af profilens standarder: app.js er et renderer-script, så de
// præcise udsnit køres i et syntetisk DOM — samme måde som profile-step og
// plan-restoration tester renderer-koden. Udsnittene er fastgjort med
// markører, så en flyttet funktion fejler testen.
const ui = path.join(__dirname, '..', 'ui');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const workspaceSource = fs.readFileSync(path.join(ui, 'workspace.js'), 'utf8');
const calmSource = fs.readFileSync(path.join(ui, 'workspace-calm.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const settingsSource = fs.readFileSync(path.join(ui, 'settings.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');

function sliceOf(source, from, to) {
  const start = source.indexOf(from);
  assert.ok(start >= 0, `kilden mangler "${from}"`);
  const end = source.indexOf(to, start);
  assert.ok(end > start, `kilden mangler "${to}" efter "${from}"`);
  return source.slice(start, end);
}
// Profilens tilstand og startgennemløbet: ét fælles udsnit for alle armaturer.
const profileSlices = () => [
  sliceOf(app, 'let profileState = null;', 'function setupControls()'),
  sliceOf(app, 'async function applyProfilePresentation', "$('#profile-continue').onclick")
].join('\n');
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); };
// Objekter fra vm-konteksten tilhører et andet rige; en JSON-rundtur gør
// deepEqual til en sammenligning af værdier.
const plain = value => JSON.parse(JSON.stringify(value));

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.value = ''; this.checked = false;
    this.type = ''; this.id = ''; this.listeners = {}; this.onclick = null; this.onchange = null;
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
  get selectedOptions() { return this.value ? [{ textContent: this.value }] : []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  append(...children) { for (const child of children) { if (child instanceof El) child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) if (child instanceof El) child.parentElement = this; this.children.unshift(...children); }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  after(...items) { const parent = this.parentElement; if (!parent) return; const at = parent.children.indexOf(this); for (const item of items) item.parentElement = parent; parent.children.splice(at + 1, 0, ...items); }
  remove() { const parent = this.parentElement; if (parent) parent.children.splice(parent.children.indexOf(this), 1); }
  focus() {}
  close() {}
  click() { if (typeof this.onclick === 'function') return this.onclick(); }
  closest() { return null; }
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
const option = (value, label) => { const el = new El('option'); el.value = value; el.textContent = label; return el; };
const node = (tag, text, className) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
function makeDocument(body) {
  const document = { body, querySelector: selector => selectWithin(body, selector)[0] || null, querySelectorAll: selector => selectWithin(body, selector), createElement: tag => new El(tag) };
  const $ = selector => { const found = document.querySelector(selector); assert.ok(found, `testens DOM mangler ${selector}`); return found; };
  return { document, $ };
}
function makeBody() { return new El('body'); }

// ---------- Armatur: opstartens profilgennemløb ----------
function makeSetupDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el.id = id; registry.set(id, el); body.append(el); return el; };
  make('select', 'setup-connection'); make('p', 'setup-use-saved'); make('p', 'setup-saved-hint'); make('button', 'setup-remove-all'); make('p', 'setup-ai');
  return { ...makeDocument(body), registry };
}
function runStartup({ storage = {}, profile, connections = [], migrateError = null } = {}) {
  const dom = makeSetupDom();
  const store = { ...storage }, removed = [], migrateCalls = [], getCalls = [], dispatched = [], themes = [];
  const harness = {
    profileMigrate: async value => { migrateCalls.push(value); if (migrateError) throw migrateError; return { profile: null, warnings: [] }; },
    profileGet: async () => { getCalls.push('profileGet'); return { profile: plain(profile), warnings: [] }; }
  };
  const context = {
    $: dom.$, document: dom.document,
    localStorage: { getItem: key => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { removed.push(key); delete store[key]; } },
    window: { dispatchEvent: event => dispatched.push(event), calmWorkspace: { setTheme: value => themes.push(value) } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    applyChatChoiceRecommendation: () => {}, option, node,
    state: { connections }, verifiedConnection: '', setupControls: () => {}, profileAvatarAvailable: false
  };
  vm.runInNewContext(`${profileSlices()}\n${sliceOf(app, 'function renderSetup()', 'async function setupGit')}`, context);
  return { context, dom, store, removed, migrateCalls, getCalls, dispatched, themes };
}
const legacyStorage = { 'harness.preferredConnection': 'c1', 'harness-workspace-theme-v1': 'dark', 'aura-surface-open': 'false', 'aura.theme-hint.v1': 'light' };

test('opstart: profileMigrate kaldes én gang med de tre gamle værdier, og nøglerne pensioneres bagefter', async () => {
  const f = runStartup({ storage: { ...legacyStorage }, profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: '' }, appearance: { theme: 'dark', panelOpen: false } }, connections: [{ id: 'c1', name: 'Egen server' }] });
  await f.context.startupProfile();
  assert.equal(f.migrateCalls.length, 1, 'migrationen er ét kald pr. start');
  assert.deepEqual(plain(f.migrateCalls[0]), { preferredConnection: 'c1', workspaceTheme: 'dark', surfaceOpen: 'false' });
  assert.deepEqual(f.removed, ['harness.preferredConnection', 'harness-workspace-theme-v1', 'aura-surface-open'], 'de tre gamle nøgler slettes efter bekræftet migration');
  assert.ok(f.store['aura.theme-hint.v1'] === 'light', 'hint-nøglen består — den er stadig i brug');
  assert.ok(!('harness.preferredConnection' in f.store) && !('aura-surface-open' in f.store));
  assert.equal(f.getCalls.length, 1, 'profilen læses én gang; præsentationen bruger cachen');
});

test("opstart: aura:profile udsendes med profilen, og standard-AI'ets forbindelse foder renderSetup", async () => {
  const profile = { ...blank(), standardAI: { connectionID: 'c1', modelID: '' }, appearance: { theme: 'dark', panelOpen: false } };
  const f = runStartup({ storage: { ...legacyStorage }, profile, connections: [{ id: 'c1', name: 'Egen server' }, { id: 'c2', name: 'Anden' }] });
  await f.context.startupProfile();
  assert.equal(f.dispatched.length, 1);
  assert.equal(f.dispatched[0].type, 'aura:profile');
  assert.deepEqual(plain(f.dispatched[0].detail), plain(profile), 'hændelsen bærer den indlæste profil');
  assert.deepEqual(f.themes, ['dark'], 'profilens tema vinder ved præsentationen');
  f.context.renderSetup();
  assert.equal(f.dom.registry.get('setup-connection').value, 'c1', 'preferredConnection foder fra profile.standardAI.connectionID');
});

test('opstart: uden bekræftet migration består de gamle nøgler til næste start', async () => {
  const f = runStartup({ storage: { ...legacyStorage }, profile: blank(), migrateError: new Error('nøglecenter utilgængelig') });
  await f.context.startupProfile();
  assert.deepEqual(f.removed, [], 'nøglerne slettes kun efter en bekræftet gemning');
  assert.equal(f.dispatched.length, 1, 'gennemløbet fortsætter alligevel');
  assert.ok(f.store['harness.preferredConnection'] === 'c1');
});

test('opstart: uden gamle nøgler migreres en tom mængde', async () => {
  const f = runStartup({ storage: {}, profile: blank() });
  await f.context.startupProfile();
  assert.deepEqual(plain(f.migrateCalls[0]), {}, 'ingen nøgler betyder et tomt migreringskald');
  assert.deepEqual(Object.keys(f.store), [], 'intet er gemt i den lokale lagring');
});

// ---------- Armatur: arbejdsmåden og chat-choice ----------
function makeChatDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id, className) => { const el = new El(tag); el.id = id; if (className) el.className = className; if (id) registry.set(id, el); body.append(el); return el; };
  make('p', 'project-intro'); make('button', 'start-idea');
  const choice = make('section', 'chat-choice');
  const cards = new El('div'); cards.className = 'chat-choice-cards'; choice.append(cards);
  for (const [id, title, text] of [['choice-plan', 'Lad os lave en plan', 'AI’en stiller afklarende spørgsmål.'], ['choice-chat', 'Beskriv og byg', 'Beskriv, hvad du vil have.']]) {
    const card = make('button', id, 'chat-choice-card'); card.type = 'button';
    const glyph = new El('span'); glyph.className = 'chat-choice-icon'; glyph.textContent = '≡';
    const content = new El('span');
    const strong = new El('strong'); strong.textContent = title;
    const small = new El('small'); small.textContent = text;
    content.append(strong, small); card.append(glyph, content); cards.append(card);
  }
  const resume = make('details', 'resume-notice');
  const summary = new El('summary'); resume.append(summary);
  make('p', 'resume-text'); make('input', 'include-history'); make('select', 'work-mode'); make('textarea', 'prompt');
  make('section', 'plan-card'); make('p', 'draft-status');
  return { ...makeDocument(body), registry };
}
const freshView = () => ({ id: 'chat-1', log: { children: [] }, historyLoaded: false, draft: null });
function runChat({ profile = null, storage = {}, view = freshView() } = {}) {
  const dom = makeChatDom();
  const store = { ...storage };
  const listeners = {};
  const harness = { profileGet: async () => ({ profile: plain(profile), warnings: [] }), profileSave: async value => ({ profile: { ...plain(profile), ...(value.workMode ? { workMode: value.workMode } : {}) }, warnings: [] }) };
  const context = {
    $: dom.$, document: dom.document, view,
    localStorage: { getItem: key => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null, setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; } },
    window: { HistoryPages: { takePrevious: messages => ({ older: [], recent: messages }) }, planning: { onProject: () => {} }, dispatchEvent: () => {}, calmWorkspace: { setTheme: () => {} }, addEventListener: (name, handler) => { (listeners[name] ||= []).push(handler); } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    current: { root: '/projekt' }, activePlan: null,
    appendMessage: () => { const element = new El('div'); view.log.children.push(element); return element; },
    renderHistoryControls: () => {}, updatePlanOffer: () => {}, defaultMode: () => 'chat',
    setRunning: () => {}, renderStatus: () => {}, renderUsage: () => {},
    updateWorkMode: () => {}, updateStartIdea: () => {}, applyRunning: () => {}, node
  };
  vm.runInNewContext([
    profileSlices(),
    sliceOf(app, 'function applyChatChoiceRecommendation()', 'async function showChat'),
    // Indstillinger gemmer profilen uden for app.js; lytterudsnittet binder
    // hændelsen, der holder cachen opdateret.
    sliceOf(app, "window.addEventListener('aura:profile-saved'", "action(async () => { syncCreateAvailability(); try { state = await call('connectionState');")
  ].join('\n'), context);
  return { context, dom, view, listeners, adopt: async value => context.adoptProfile(plain(value)) };
}

test('en helt ny samtale uden kladde og historik starter i profilens arbejdsmåde', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'plan' } });
  await f.adopt({ ...blank(), workMode: 'plan' });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'plan', 'profilens arbejdsmåde gælder den helt nye samtale');
  assert.equal(f.dom.registry.get('chat-choice').hidden, false, 'chat-choice vises til den nye samtale');
});
test('en gemt kladde vinder over profilens arbejdsmåde', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'plan' }, storage: { 'harness.chatDraft./projekt.chat-1': JSON.stringify({ text: 'Min kladde', mode: 'chat' }) } });
  await f.adopt({ ...blank(), workMode: 'plan' });
  f.context.fillChat({ workspace: { messages: [], mode: 'plan' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'chat', 'kladden beholder sin egen arbejdsmåde');
  assert.equal(f.dom.registry.get('prompt').value, 'Min kladde');
});
test('en samtale med historik vinder over profilens arbejdsmåde', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'plan' } });
  await f.adopt({ ...blank(), workMode: 'plan' });
  f.context.fillChat({ workspace: { messages: [{ id: 'm1', role: 'assistant', text: 'Svar' }], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'chat', 'den eksisterende samtale beholder sin tilstand');
});
test('første projektopgave bygger frit, uanset profilen', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'plan' }, view: { ...freshView(), firstProjectTask: true } });
  await f.adopt({ ...blank(), workMode: 'plan' });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'free', 'firstProjectTask består som før');
});
test('uden profil er samtale standardarbejdsmåden', async () => {
  const f = runChat({ profile: null });
  f.context.fillChat({ workspace: { messages: [], mode: 'plan' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'chat', 'profilens fravær giver samtale som før');
});
test('chat-choice-kortet for profilens arbejdsmåde mærkes Anbefalet — begge valg består', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'plan' } });
  await f.adopt({ ...blank(), workMode: 'plan' });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  const plan = f.dom.registry.get('choice-plan'), chat = f.dom.registry.get('choice-chat');
  assert.ok(plan.classList.contains('is-recommended'), 'plan-kortet mærkes');
  assert.equal(plan.querySelector('.recommended')?.textContent, 'Anbefalet');
  assert.equal(plan.disabled, false, 'begge kort forbliver aktive');
  assert.equal(chat.classList.contains('is-recommended'), false, 'det andet kort mærkes ikke');
  assert.equal(chat.querySelector('.recommended'), null);
});
test('profilens standard samtale mærkes som anbefalet, når arbejdsmåden er chat', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'chat' } });
  await f.adopt({ ...blank(), workMode: 'chat' });
  f.context.fillChat({ workspace: { messages: [], mode: 'plan' } }, true);
  assert.ok(f.dom.registry.get('choice-chat').classList.contains('is-recommended'), 'chat-kortet anbefales');
  assert.equal(f.dom.registry.get('choice-plan').querySelector('.recommended'), null);
});
test('anbefalingen flytter sig, når profilen ændres', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'chat' } });
  await f.adopt({ ...blank(), workMode: 'chat' });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  await f.adopt({ ...blank(), workMode: 'plan' });
  assert.ok(f.dom.registry.get('choice-plan').classList.contains('is-recommended'), 'anbefalingen følger profilen');
  assert.equal(f.dom.registry.get('choice-plan').querySelector('.recommended')?.textContent, 'Anbefalet');
  assert.equal(f.dom.registry.get('choice-chat').querySelector('.recommended'), null, 'det gamle mærke fjernes');
});
test('uden en indlæst profil vises ingen anbefaling — intet mærkat uden grundlag', async () => {
  const f = runChat({ profile: null });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('choice-plan').classList.contains('is-recommended'), false);
  assert.equal(f.dom.registry.get('choice-chat').classList.contains('is-recommended'), false, 'chat-kortet mærkes ikke uden profilgrundlag');
  assert.equal(f.dom.registry.get('choice-chat').querySelector('.recommended'), null);
  await f.adopt({ ...blank(), workMode: 'plan' });
  assert.ok(f.dom.registry.get('choice-plan').classList.contains('is-recommended'), 'mærkatet kommer først med en indlæst profil');
});
test('Indstillinger gemmer profilen: aura:profile-saved opdaterer cachen, og den nye samtale bruger arbejdsmåden', async () => {
  const f = runChat({ profile: { ...blank(), workMode: 'chat' } });
  await f.adopt({ ...blank(), workMode: 'chat' });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'chat');
  assert.ok(f.listeners['aura:profile-saved']?.length >= 1, 'app.js lytter efter gemte profiler');
  // Indstillinger gemmer en ny arbejds måde; hændelsen bærer den gemte profil.
  for (const handler of f.listeners['aura:profile-saved']) handler({ detail: { ...blank(), workMode: 'plan' } });
  f.context.fillChat({ workspace: { messages: [], mode: 'chat' } }, true);
  assert.equal(f.dom.registry.get('work-mode').value, 'plan', 'den gemte arbejdsmåde gælder den næste nye samtale uden genstart');
  assert.ok(f.dom.registry.get('choice-plan').classList.contains('is-recommended'), 'anbefalingen følger også med');
});

// ---------- Armatur: profilgemninger synkroniserer den viste projektopstart ----------
function makeSyncDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el.id = id; registry.set(id, el); body.append(el); return el; };
  make('select', 'startup-hosting'); make('select', 'startup-connection'); make('select', 'tests');
  make('select', 'design-select'); make('p', 'startup-warning');
  make('details', 'project-options'); make('details', 'design-options'); make('textarea', 'links');
  const onboarding = make('main', 'onboarding'); onboarding.hidden = false;
  return { ...makeDocument(body), registry };
}
function runStartupSync({ profile = null, connections = [{ id: 'c1', name: 'Egen' }, { id: 'c2', name: 'Anden' }] } = {}) {
  const dom = makeSyncDom();
  const designsApplied = [];
  const windowListeners = {};
  const summaries = [];
  const harness = {
    profileGet: async () => ({ profile: plain(profile), warnings: [] }),
    applyDesign: async id => { designsApplied.push(id); return { color: '#123456', links: ['https://design.example/'], assets: [] }; },
    profileMigrate: async () => ({ profile: null, warnings: [] })
  };
  const context = {
    $: dom.$, document: dom.document,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { addEventListener: (name, handler) => { (windowListeners[name] ||= []).push(handler); }, dispatchEvent: () => {}, calmWorkspace: { setTheme: () => {} } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    applyChatChoiceRecommendation: () => {}, option, node,
    navigationRequest: 0, selectedOwner: () => null, startupLoads: 0, syncCreateAvailability: () => {},
    state: { connections }, current: null, action: async fn => fn(),
    renderStartupConnections: () => {}, setProjectColor: () => {}, showAssets: () => {},
    clearStartupDesign: async () => {}, updateStartupSummary: () => { summaries.push('summary'); }
  };
  vm.runInNewContext([
    profileSlices(),
    sliceOf(app, 'function renderStartupConnections()', 'function updateStartupSummary'),
    sliceOf(app, 'async function applyStartupDefaults(', 'async function loadStartup()'),
    sliceOf(app, 'async function loadStartup()', "for (const selector of ['#startup-hosting'"),
    sliceOf(app, "for (const selector of ['#startup-hosting'", "$('#model-load').onclick"),
    sliceOf(app, "window.addEventListener('aura:profile-saved'", "action(async () => { syncCreateAvailability();")
  ].join('\n'), context);
  return { context, dom, windowListeners, designsApplied, summaries };
}
test('profilgemning synkroniserer de urørte projektopstartsfelter; rørte felter vinder', async () => {
  const f = runStartupSync({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: '' }, projectDefaults: { hosting: 'vercel', designID: '', tests: 'senere' } } });
  await f.context.loadStartup();
  assert.equal(f.dom.registry.get('startup-hosting').value, 'vercel');
  assert.equal(f.dom.registry.get('startup-connection').value, 'c1');
  assert.equal(f.dom.registry.get('tests').value, 'senere');
  // Brugeren vælger selv tests — det er projektets eget valg.
  f.dom.registry.get('tests').value = 'manuel';
  for (const handler of f.dom.registry.get('tests').listeners.change || []) handler();
  // Standard-AI'et og standarderne ændres i Indstillinger, mens skærmen står åben.
  const saved = { ...blank(), standardAI: { connectionID: 'c2', modelID: '' }, projectDefaults: { hosting: 'own', designID: 'd1', tests: 'automatiske' } };
  for (const handler of f.windowListeners['aura:profile-saved']) handler({ detail: saved });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dom.registry.get('startup-hosting').value, 'own', 'uprobert hosting følger profilen');
  assert.equal(f.dom.registry.get('startup-connection').value, 'c2', 'uprobert forbindelse følger profilen');
  assert.equal(f.dom.registry.get('design-select').value, 'd1', 'uprobert design følger profilen');
  assert.deepEqual(f.designsApplied, ['d1'], 'den nye designpakke anvendes med det samme');
  assert.equal(f.dom.registry.get('tests').value, 'manuel', 'det rørte felt vinder over profilen');
  assert.ok(f.summaries.length >= 2, 'resuméet genberegnes efter synkroniseringen');
});
test('uden rørte felter følger alle fire felter en profilgemning', async () => {
  const f = runStartupSync({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: '' }, projectDefaults: { hosting: 'vercel', designID: '', tests: 'senere' } } });
  await f.context.loadStartup();
  const saved = { ...blank(), standardAI: { connectionID: 'c2', modelID: '' }, projectDefaults: { hosting: 'azure', designID: '', tests: 'automatiske' } };
  for (const handler of f.windowListeners['aura:profile-saved']) handler({ detail: saved });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dom.registry.get('startup-hosting').value, 'azure');
  assert.equal(f.dom.registry.get('startup-connection').value, 'c2');
  assert.equal(f.dom.registry.get('tests').value, 'automatiske');
  assert.deepEqual(f.designsApplied, [], 'intet design betyder ingen anvendelse');
});
test('et rørt design vælges ikke om af profilen', async () => {
  const f = runStartupSync({ profile: { ...blank(), projectDefaults: { hosting: '', designID: 'd1', tests: 'senere' } } });
  await f.context.loadStartup();
  assert.deepEqual(f.designsApplied, ['d1'], 'profilens design er anvendt ved opstart');
  f.dom.registry.get('design-select').value = 'd2';
  for (const handler of f.dom.registry.get('design-select').listeners.change || []) handler();
  for (const handler of f.windowListeners['aura:profile-saved']) handler({ detail: { ...blank(), projectDefaults: { hosting: '', designID: 'd3', tests: 'senere' } } });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.designsApplied, ['d1'], 'det rørte design genanvendes ikke fra profilen');
  assert.equal(f.dom.registry.get('design-select').value, 'd2', 'brugerens valg står ved magt');
});
test('med et åbent projekt rører synkroniseringen ikke opstartsfelterne', async () => {
  const f = runStartupSync({ profile: { ...blank(), projectDefaults: { hosting: 'vercel', designID: '', tests: 'senere' } } });
  await f.context.loadStartup();
  f.context.current = { root: '/projekt' };
  for (const handler of f.windowListeners['aura:profile-saved']) handler({ detail: { ...blank(), projectDefaults: { hosting: 'own', designID: '', tests: 'automatiske' } } });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.dom.registry.get('startup-hosting').value, 'vercel', 'opstartsskærmen er ikke synke med et åbent projekt');
  assert.equal(f.dom.registry.get('tests').value, 'senere');
});

// ---------- Armatur: Flere valg præudfyldes fra profilen ----------
function makeDefaultsDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el.id = id; registry.set(id, el); body.append(el); return el; };
  make('select', 'startup-hosting'); make('select', 'startup-connection'); make('select', 'tests');
  make('select', 'design-select'); make('p', 'startup-warning'); make('button', 'forget-startup');
  make('details', 'project-options'); make('details', 'design-options'); make('textarea', 'links');
  return { ...makeDocument(body), registry };
}
function runDefaults({ profile, warnings = [], connections = [] } = {}) {
  const dom = makeDefaultsDom();
  const designsApplied = [];
  const harness = {
    profileGet: async () => ({ profile: plain(profile), warnings: [...warnings] }),
    profileMigrate: async () => ({ profile: null, warnings: [] }),
    applyDesign: async id => { designsApplied.push(id); return { color: '#123456', links: ['https://design.gentofte.dk/'], assets: [] }; },
    preferencesGet: async () => ({ values: { hosting: '', connectionID: '', designID: '', tests: 'senere' }, warnings: [] }),
    preferencesSave: async () => ({ values: {}, warnings: [] })
  };
  const context = {
    $: dom.$, document: dom.document,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { dispatchEvent: () => {} }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    applyChatChoiceRecommendation: () => {}, option, node,
    navigationRequest: 0, selectedOwner: () => null, startupLoads: 0, syncCreateAvailability: () => {},
    state: { connections }, renderStartupConnections: () => {}, action: async fn => fn(),
    setProjectColor: () => {}, showAssets: () => {}, clearStartupDesign: async () => {}, updateStartupSummary: () => {},
    startupTouched: new Set()
  };
  vm.runInNewContext(`${profileSlices()}\n${sliceOf(app, 'async function applyStartupDefaults(', 'async function loadStartup()')}\n${sliceOf(app, 'async function loadStartup()', "for (const selector of ['#startup-hosting'")}`, context);
  return { context, dom, designsApplied };
}

test('Flere valg præudfyldes fra profilens projektstandarder og standard-AI', async () => {
  const f = runDefaults({
    profile: { ...blank(), projectDefaults: { hosting: 'vercel', designID: 'd1', tests: 'automatiske' }, standardAI: { connectionID: 'c1', modelID: 'm1' } },
    connections: [{ id: 'c1', name: 'Egen server' }, { id: 'c2', name: 'Anden' }]
  });
  await f.context.loadStartup();
  assert.equal(f.dom.registry.get('startup-hosting').value, 'vercel');
  assert.equal(f.dom.registry.get('tests').value, 'automatiske');
  assert.equal(f.dom.registry.get('design-select').value, 'd1');
  assert.deepEqual(f.designsApplied, ['d1'], 'designpakken anvendes som før');
  assert.equal(f.dom.registry.get('startup-connection').value, 'c1', "standard-AI'ets forbindelse forvælges");
  assert.equal(f.dom.registry.get('startup-warning').textContent, '');
});
test('en fjernet standardforbindelse giver en tom forudvalgtelse og en advarsel', async () => {
  const warning = 'Din standard-AI findes ikke længere. Vælg en ny, eller beslut senere.';
  const f = runDefaults({
    profile: { ...blank(), standardAI: { connectionID: 'død', modelID: 'm1' } },
    warnings: [warning],
    connections: [{ id: 'c2', name: 'Anden' }]
  });
  await f.context.loadStartup();
  assert.equal(f.dom.registry.get('startup-connection').value, '', 'en borte forbindelse forvælges aldrig');
  assert.equal(f.dom.registry.get('startup-warning').textContent, warning, 'advarslen vises på skærmen');
});
test('uden standard-AI står forbindelsen på Beslut senere', async () => {
  const f = runDefaults({ profile: blank(), connections: [{ id: 'c2', name: 'Anden' }] });
  await f.context.loadStartup();
  assert.equal(f.dom.registry.get('startup-connection').value, '');
  assert.equal(f.dom.registry.get('startup-warning').textContent, '');
});

// ---------- Armatur: modelvælgeren ----------
function makeModelsDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el.id = id; registry.set(id, el); body.append(el); return el; };
  make('select', 'connection-select'); make('select', 'model-select'); make('div', 'model-shortlist');
  make('p', 'model-evidence'); make('div', 'route-row'); make('input', 'model-search');
  make('p', 'connection-warning'); make('p', 'connection-status');
  make('details', 'model-options'); make('dialog', 'task-dialog'); make('textarea', 'prompt');
  make('button', 'model-standard'); make('button', 'model-done');
  return { ...makeDocument(body), registry };
}
function runModels({ profile = null, connections = [{ id: 'c1', kind: 'corti' }], models = [{ id: 'm1', name: 'Model ét' }, { id: 'm2', name: 'Model to' }], defaultModel = 'udbyder-standard' } = {}) {
  const dom = makeModelsDom();
  const saves = [], messages = [];
  const harness = {
    profileGet: async () => ({ profile: plain(profile), warnings: [] }),
    profileSave: async value => { saves.push(value); return { profile: { ...plain(profile), ...(value.standardAI ? { standardAI: value.standardAI } : {}) }, warnings: [] }; },
    profileMigrate: async () => ({ profile: null, warnings: [] })
  };
  const context = {
    $: dom.$, document: dom.document,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    window: { ModelAdvice: { suggest: () => ({ curated: false, defaultID: defaultModel, picks: [] }) }, dispatchEvent: () => {} },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    applyChatChoiceRecommendation: () => {}, option, node,
    modelRequest: 0, acceptedFingerprint: null, modelCatalog: [],
    renderShortlist: () => {}, checkedModels: async () => models, loadRoutes: async () => {},
    markChosenModel: () => {}, updateModelSummary: () => {}, refreshEffortLevels: () => {},
    connectionFailed: () => {}, pentModelNavn: (id, name) => name || id,
    featuredProviders: [{ kind: 'anthropic' }, { kind: 'mistral' }, { kind: 'corti' }, { kind: 'alexandra' }],
    state: { connections }, action: async fn => fn(), message: (text, error) => { messages.push([text, error]); }
  };
  vm.runInNewContext([
    profileSlices(),
    sliceOf(app, 'async function loadModels(', 'async function loadRoutes('),
    sliceOf(app, 'function preselectRecommended(', 'function markChosenModel('),
    sliceOf(app, "$('#model-standard').onclick", '// Funktioner: brugeren slår dem til og fra under Indstillinger')
  ].join('\n'), context);
  return { context, dom, saves, messages };
}

test("modelvælgeren forvælger standard-AI'ets model, når forbindelsen er standarden", async () => {
  const f = runModels({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: 'm2' } } });
  await f.context.adoptProfile({ ...blank(), standardAI: { connectionID: 'c1', modelID: 'm2' } });
  f.dom.registry.get('connection-select').value = 'c1';
  await f.context.loadModels({});
  assert.equal(f.dom.registry.get('model-select').value, 'm2', 'profilens model vinder over udbyderens eget udgangspunkt');
});
test('profilens model gælder kun standardforbindelsen — ellers udbyderens udgangspunkt', async () => {
  const f = runModels({ profile: { ...blank(), standardAI: { connectionID: 'c2', modelID: 'm2' } } });
  await f.context.adoptProfile({ ...blank(), standardAI: { connectionID: 'c2', modelID: 'm2' } });
  f.dom.registry.get('connection-select').value = 'c1';
  await f.context.loadModels({});
  assert.equal(f.dom.registry.get('model-select').value, 'udbyder-standard', 'en anden forbindelse bruger udbyderens udgangspunkt');
});
test('uden standardmodel bruges udbyderens eget udgangspunkt', async () => {
  const f = runModels({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: '' } } });
  await f.context.adoptProfile({ ...blank(), standardAI: { connectionID: 'c1', modelID: '' } });
  f.dom.registry.get('connection-select').value = 'c1';
  await f.context.loadModels({});
  assert.equal(f.dom.registry.get('model-select').value, 'udbyder-standard');
});
test('projektets egen modelvælger vinder over profilens standard', async () => {
  const f = runModels({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: 'm2' } } });
  await f.context.adoptProfile({ ...blank(), standardAI: { connectionID: 'c1', modelID: 'm2' } });
  f.dom.registry.get('connection-select').value = 'c1';
  await f.context.loadModels({ modelID: 'm1' });
  assert.equal(f.dom.registry.get('model-select').value, 'm1', 'det aktuelle projekts valg overskrives aldrig af profilen');
});
test('en standardmodel uden for kataloget falder tilbage til udbyderens udgangspunkt', async () => {
  const f = runModels({ profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: 'borte' } } });
  await f.context.adoptProfile({ ...blank(), standardAI: { connectionID: 'c1', modelID: 'borte' } });
  f.dom.registry.get('connection-select').value = 'c1';
  await f.context.loadModels({});
  assert.equal(f.dom.registry.get('model-select').value, 'udbyder-standard');
});
test('Brug som standard gemmer standardAI som én enhed og opdaterer cachen', async () => {
  const f = runModels({ profile: blank() });
  f.dom.registry.get('connection-select').value = 'c1';
  f.dom.registry.get('model-select').value = 'm2';
  await f.dom.registry.get('model-standard').onclick();
  assert.deepEqual(plain(f.saves), [{ standardAI: { connectionID: 'c1', modelID: 'm2' } }], 'gemningen er standardAI alene');
  assert.equal(f.messages.at(-1)[1] !== true, true, 'beskeden er ikke en fejl');
  await f.context.loadModels({});
  assert.equal(f.dom.registry.get('model-select').value, 'm2', 'cachen fører standarden videre til næste kataloghentning');
});
test('Brug som standard kræver både forbindelse og model', async () => {
  const f = runModels({ profile: blank() });
  f.dom.registry.get('connection-select').value = 'c1';
  f.dom.registry.get('model-select').value = '';
  await f.dom.registry.get('model-standard').onclick();
  assert.deepEqual(f.saves, [], 'intet gemmes uden en model');
  assert.equal(f.messages.at(-1)[1], true, 'beskeden er en fejl, der leder brugeren videre');
});

// ---------- Arbejdsfladen: panelstart fra profilen ----------
// Helper-modulet (ui/profile-save.js) er den delte gemkø: panelet sender kun
// sit eget felt, og den gemte profil annonceres.
const ProfileSave = require('../ui/profile-save.js');
function runPanelSurface({ profile = { appearance: { theme: 'dark' } }, panelSaveQueued = ProfileSave } = {}) {
  const grid = { dataset: {} };
  const toggle = { attributes: new Map(), textContent: '', listeners: {}, setAttribute(name, value) { this.attributes.set(name, String(value)); }, addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); } };
  const windowListeners = {};
  const storage = [], saves = [], announced = [];
  const capture = { queued: ProfileSave.queued, saved: value => announced.push(JSON.parse(JSON.stringify(value))) };
  const context = {
    document: { querySelector: selector => selector === '.work-grid' ? grid : null, getElementById: id => id === 'surface-toggle' ? toggle : null },
    window: {
      addEventListener: (name, handler) => { (windowListeners[name] ||= []).push(handler); },
      profileSaveQueued: panelSaveQueued === ProfileSave ? capture : panelSaveQueued,
      harness: {
        // Harness-methoderne svarer med { ok, value } som preloads indpakning.
        profileGet: async () => ({ ok: true, value: { profile, warnings: [] } }),
        profileSave: async value => { saves.push(JSON.parse(JSON.stringify(value))); return { ok: true, value: { profile: { ...profile, appearance: { ...value.appearance } }, warnings: [] } }; }
      }
    },
    localStorage: { getItem: key => { storage.push(['getItem', key]); return null; }, setItem: (key, value) => { storage.push(['setItem', key]); }, removeItem: key => { storage.push(['removeItem', key]); } },
    show: () => {}
  };
  vm.runInNewContext(sliceOf(workspaceSource, '// ── DSH-stil: arbejdsfladen er et valgfrit højrepanel ──', 'function show(name, { focus = false } = {}) {'), context);
  return { context, grid, toggle, windowListeners, saves, storage, announced };
}
test('arbejdsfladen: starttilstanden kommer fra aura:profile, og skift gemmes i profilen — ikke localStorage', async () => {
  const f = runPanelSurface({ profile: { appearance: { theme: 'dark' } } });
  assert.equal(f.grid.dataset.surface, undefined, 'indtil profilen lander, står panelet åbent som skærmens udgangspunkt');
  for (const handler of f.windowListeners['aura:profile'] || []) handler({ detail: { appearance: { panelOpen: false } } });
  assert.equal(f.grid.dataset.surface, 'off', 'profilens panelOpen: false lukker panelet');
  assert.equal(f.toggle.attributes.get('aria-pressed'), 'false');
  await flush();
  assert.deepEqual(f.saves, [], 'starttilstanden skrives ikke tilbage');
  for (const handler of f.toggle.listeners.click) handler();
  assert.equal(f.grid.dataset.surface, 'on', 'brugerens klik åbner panelet');
  await flush();
  assert.deepEqual(f.saves, [{ appearance: { panelOpen: true } }], 'panelet sender kun sit eget felt — main fletter søsterfelterne');
  assert.deepEqual(f.announced.map(profile => profile.appearance.panelOpen), [true], 'den gemte profil annonceres som aura:profile-saved');
  assert.deepEqual(f.storage, [], 'den gamle localStorage-nøgle er pensioneret — ingen læsninger eller skrivninger');
});
test('arbejdsfladen: hurtige skift gemmer i rækkefølge gennem den delte kø, så det sidste klik vinder', async () => {
  const f = runPanelSurface({ profile: { appearance: { theme: 'system' } } });
  for (const handler of f.windowListeners['aura:profile'] || []) handler({ detail: { appearance: { panelOpen: false } } });
  for (const handler of f.toggle.listeners.click) handler();
  for (const handler of f.toggle.listeners.click) handler();
  await flush();
  assert.deepEqual(f.saves, [{ appearance: { panelOpen: true } }, { appearance: { panelOpen: false } }], 'den sidste skrivning matcher det sidste klik — ingen gemning afvises');
  assert.deepEqual(f.announced.map(profile => profile.appearance.panelOpen), [true, false], 'hver gemning annonceres');
});

// ---------- Projektsåbning: standardmodellen uden et tidligere klik (fund 11) ----------
function makeProjectChoiceDom() {
  const body = makeBody();
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el.id = id; registry.set(id, el); body.append(el); return el; };
  make('select', 'connection-select'); make('select', 'model-select'); make('div', 'route-row');
  make('select', 'route-select'); make('details', 'model-options'); make('button', 'start-idea');
  make('p', 'project-startup');
  return { ...makeDocument(body), registry };
}
function runProjectChoice({ saved = null, startup = null, autoConnect = false, connections = [{ id: 'c1' }], standardAI = { connectionID: '', modelID: '' } } = {}) {
  const dom = makeProjectChoiceDom();
  const modelLoads = [];
  const project = { root: '/projekt' };
  const context = {
    $: dom.$, document: dom.document,
    state: { connections, retiredConnections: [], projectSettings: { selection: saved, startup } },
    autoConnect, preferredConnection: 'c2',
    profileState: { standardAI: plain(standardAI) },
    project, current: project, request: 1, projectDisplayRequest: 1,
    loadModels: async (kept = {}) => { modelLoads.push([dom.registry.get('connection-select').value, plain(kept)]); },
    option, updateModelSummary: () => {}, updateStartIdea: () => {},
    hostingLabel: () => 'Vercel', testLabel: () => 'Beslut senere',
    pentModelNavn: (id, name) => name || id,
  };
  const run = vm.runInNewContext(`(async () => {\n${sliceOf(app, 'const saved = state.projectSettings.selection;', '\n  fillChat(state')}\n})()`, context);
  return { dom, modelLoads, run };
}
test('et nyt projekts opstartsforbindelse og profilens standardmodel forvælges uden autoConnect og uden kataloghentning', async () => {
  const f = runProjectChoice({ startup: { connectionID: 'c1', hosting: '', designID: '', tests: 'senere' }, standardAI: { connectionID: 'c1', modelID: 'm1' } });
  await f.run;
  assert.equal(f.dom.registry.get('connection-select').value, 'c1', 'opstartsforbindelsen er valgt');
  assert.deepEqual(f.dom.registry.get('model-select').children.map(child => child.value), ['m1'], 'profilens standardmodel forvælges direkte fra sit id');
  assert.deepEqual(f.modelLoads, [], 'intet katalog hentes — projektoprettelsen forbliver uden netværkskald');
});
test('profilens model tilhører en anden forbindelse — kun forbindelsen forvælges', async () => {
  const f = runProjectChoice({ startup: { connectionID: 'c1' }, standardAI: { connectionID: 'anden', modelID: 'm1' } });
  await f.run;
  assert.equal(f.dom.registry.get('connection-select').value, 'c1', 'opstartsforbindelsen er valgt');
  assert.deepEqual(f.dom.registry.get('model-select').children, [], 'profilens model forvælges ikke på en fremmed forbindelse');
  assert.deepEqual(f.modelLoads, [], 'kataloget hentes først, når modelvælgeren åbnes');
});
test('uden profilens standardmodel forvælges kun forbindelsen', async () => {
  const f = runProjectChoice({ startup: { connectionID: 'c1' }, standardAI: { connectionID: 'c1', modelID: '' } });
  await f.run;
  assert.equal(f.dom.registry.get('connection-select').value, 'c1');
  assert.deepEqual(f.dom.registry.get('model-select').children, [], 'uden standardmodel overtager modelvælgeren ved åbning');
  assert.deepEqual(f.modelLoads, []);
});
test('projektets egen gemte model vises uden en kataloghentning', async () => {
  const f = runProjectChoice({ saved: { connectionID: 'c1', modelID: 'm1', routeID: '' }, startup: { connectionID: 'c1' } });
  await f.run;
  assert.equal(f.modelLoads.length, 0, 'det gemte valg behøver ikke kataloget');
  assert.deepEqual(f.dom.registry.get('model-select').children.map(child => child.value), ['m1'], 'den gemte model står i vælgeren');
  assert.equal(f.dom.registry.get('model-options').open, false);
});
test('autoConnect indlæster stadig som før — også for det gemte valg', async () => {
  const f = runProjectChoice({ saved: { connectionID: 'c1', modelID: 'm1' }, startup: { connectionID: 'c1' }, autoConnect: true });
  await f.run;
  assert.deepEqual(f.modelLoads, [['c1', { connectionID: 'c1', modelID: 'm1' }]], 'sessionsvalget indlæser kataloget med det gemte valg');
});
test('en utilgængelig opstartsforbindelse vælger og indlæser intet', async () => {
  const f = runProjectChoice({ startup: { connectionID: 'borte' } });
  await f.run;
  assert.equal(f.dom.registry.get('connection-select').value, '');
  assert.deepEqual(f.modelLoads, [], 'ingen forbindelse vælges, og intet katalog hentes');
});

// ---------- Projektoprettelse: eksplicitte tomme valg overlever (main.cjs) ----------
test('project:create: eksplicit "Beslut senere" og "Intet design" gemmes — kun manglende felter falder tilbage på profilen', async () => {
  let create = null;
  const savedProjects = [];
  const context = {
    handle: (channel, fn) => { if (channel === 'project:create') create = fn; },
    exclusive: fn => fn(),
    profileStore: () => ({ get: async () => ({ profile: { projectDefaults: { hosting: 'vercel', designID: 'design-1', tests: 'automatiske' } } }) }),
    Preferences: class { constructor() {} async available(input) { return { values: { hosting: input.hosting, connectionID: input.connectionID ?? '', designID: input.designID, tests: input.tests }, warnings: [] }; } },
    workbench: {
      store: { saveProject: async (root, value) => { savedProjects.push([root, value]); } },
      features: { get: async () => ({ effective: { design: true, deling: true, versioner: false } }) },
      privacy: { prepareIdeaProjectInheritance: async () => null },
    },
    chosenParent: '/tmp/aura-projekter',
    defaultProjectParent: () => '/tmp/aura-projekter',
    fs: { mkdir: async () => {} },
    path: require('node:path'),
    createProject: async parent => ({ root: path.join(parent, 'projekt') }),
    openProject: async root => ({ root, warnings: [] }),
    activate: async opened => ({ opened: true }),
    profileRoot: '/tmp/aura-profiler', assets: [],
  };
  vm.runInNewContext(sliceOf(mainSource, "handle('project:create'", "handle('project:open'"), context);
  assert.ok(create, 'project:create-handleren er registreret');
  // Brugeren vælger eksplicit "Beslut senere" og "Intet design": de tomme
  // strenge er valg og skal gemmes som projektets egne opstartsvalg.
  await create({ name: 'Projekt', purpose: 'Byg noget.', color: null, links: [], tests: 'senere', startup: { hosting: '', connectionID: '', designID: '', tests: 'senere' } });
  assert.deepEqual(plain(savedProjects[0][1].startup), { hosting: '', connectionID: '', designID: '', tests: 'senere' }, 'de eksplicitte tomme valg overlever — profilens standarder blander sig ikke');
  // Uden startup-valg falder hvert felt tilbage på profilens standarder.
  await create({ name: 'Projekt to', purpose: 'Byg noget andet.', color: null, links: [] });
  assert.deepEqual(plain(savedProjects[1][1].startup), { hosting: 'vercel', connectionID: '', designID: 'design-1', tests: 'automatiske' }, 'manglende felter arver profilens standarder');
});

// ---------- Pensionering: kilder og copy ----------
test('de tre gamle localStorage-nøgler nævnes kun i migreringen, og der skrives ikke til dem', () => {
  assert.equal((app.match(/harness-workspace-theme-v1/g) || []).length, 1, 'temanøglen står kun i migreringslisten');
  assert.equal((app.match(/aura-surface-open/g) || []).length, 1, 'panelnøglen står kun i migreringslisten');
  assert.equal((app.match(/'harness\.preferredConnection'/g) || []).length, 2, 'forbindelsesnøglen står kun i læsningen og migreringslisten');
  assert.ok(!app.includes("localStorage.setItem('harness.preferredConnection'"), 'der skrives ikke længere til forbindelsesnøglen');
  assert.ok(!workspaceSource.includes('aura-surface-open'), 'workspace.js bruger ikke panelnøglen');
  assert.ok(!calmSource.includes('harness-workspace-theme-v1'), 'workspace-calm.js bruger ikke temanøglen');
  assert.ok(calmSource.includes('aura.theme-hint.v1'), 'hint-nøglen er den eneste temanøgle');
  assert.ok(!app.includes('remember-info'), 'app.js omtaler ikke længere de huskede valg');
});
test('onboarding-linjen om huskede valg er væk, Glem dem findes kun i Indstillinger, og modelvælgeren har Brug som standard', () => {
  assert.ok(!indexSource.includes('Valgene huskes til næste projekt'), 'tilbage-skrivningslinjen er fjernet');
  assert.ok(!indexSource.includes('id="forget-startup"'), 'Glem dem er ikke længere i projektopstarten');
  assert.ok(!indexSource.includes('id="remember-info"'));
  assert.ok(indexSource.includes('id="model-standard"'), 'modelvælgeren har en Brug som standard-handling');
  assert.ok(settingsSource.includes('Glem projektstandarder'), 'Indstillinger har stadig nulstillingen');
  assert.ok(workspaceSource.includes("window.addEventListener('aura:profile'"), 'workspace.js lytter efter profilen');
  assert.ok(workspaceSource.includes('profileSave'), 'panelvalget gemmes i profilen');
});
