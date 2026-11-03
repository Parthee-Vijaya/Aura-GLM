const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('vm');

// D2+D3 Commit B — samtalerodens faser (§4): hero (tom samtale, composeren i
// den centrerede stak), active (beskeder, composeren dokket i bunden) og
// settling (genindlæsning — de flytbare dele er visibility:hidden, så det
// forkerte layout aldrig blinker frem). Composeren, resume-banneret, YOLO-baren
// og arbejdsmåde-chippen er de SAMME noder, der flyttes — kladder overlever.
const app = fs.readFileSync(path.join(__dirname, '..', 'ui', 'app.js'), 'utf8');

class El {
  constructor(tag, id) {
    this.tagName = String(tag).toUpperCase(); this.id = id || ''; this.children = []; this.parentElement = null;
    this.hidden = false; this.disabled = false; this.value = ''; this.dataset = {}; this.listeners = {};
    this.style = {}; this._text = '';
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  setAttribute(name, value) { if (name === 'aria-checked') this.ariaChecked = String(value); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  append(...nodes) { for (const node of nodes) { this.adopt(node); this.children.push(node); } }
  adopt(node) { node.remove?.(); node.parentElement = this; }
  prepend(...nodes) { for (const node of [...nodes].reverse()) { this.adopt(node); this.children.unshift(node); } }
  before(node) { const parent = this.parentElement; if (!parent) return; parent.adopt(node); parent.children.splice(parent.children.indexOf(this), 0, node); }
  remove() { const parent = this.parentElement; if (parent) parent.children.splice(parent.children.indexOf(this), 1); this.parentElement = null; }
  focus() {}
}
function makeDom() {
  const byId = new Map();
  const make = (tag, id, parent) => { const el = new El(tag, id); if (id) byId.set(id, el); if (parent) parent.append(el); return el; };
  const panel = make('section', 'chat-panel');
  panel.dataset.phase = 'settling';
  const chatContent = make('div', 'chat-content', panel);
  const resume = make('details', 'resume-notice', chatContent);
  const hero = make('div', 'conversation-hero', chatContent); hero.hidden = true;
  make('img', '', hero);
  make('h3', 'hero-heading', hero);
  const heroChips = make('div', 'hero-chips', hero);
  make('div', 'project-chip-wrap', heroChips);
  const slot = make('div', 'hero-composer-slot', hero);
  const intro = make('div', 'project-intro', hero);
  make('p', 'project-purpose', intro);
  const activity = make('div', 'agent-activity', panel);
  const form = make('form', 'chat-form', panel);
  const prompt = make('textarea', 'prompt', form); prompt.value = '';
  make('p', 'composer-shortcut', form);
  const toolbar = make('div', 'composer-toolbar', form);
  make('div', 'material-menu-wrap', toolbar);
  const pill = make('button', 'permission-pill', toolbar);
  const mode = make('button', 'composer-mode', toolbar);
  const modelChip = make('button', 'model-chip', toolbar);
  make('button', 'stop', toolbar); make('button', 'send', toolbar);
  make('select', 'work-mode', toolbar);
  const contextStatus = make('div', 'context-status', panel);
  const bar = make('div', 'conversation-permission-status', panel);
  form.before(bar);
  return { byId, panel, chatContent, hero, heroChips, slot, form, prompt, mode, modelChip, resume, bar, contextStatus, toolbar, pill };
}
function runSlices(dom, context = {}) {
  const $ = selector => {
    const id = selector.replace(/^#/, '');
    if (!dom.byId.has(id)) dom.byId.set(id, new El('div', id));
    return dom.byId.get(id);
  };
  const base = {
    $, document: { getElementById: id => dom.byId.get(id) || null }, node: (tag, text) => { const el = new El(tag); el.textContent = text; return el; },
    view: { log: { children: [] }, composerMode: 'chat' }, current: { root: '/projekt' }, projectLoading: false,
    updateWorkMode() {}, updateStartIdea() {},
    window: { ConversationPermission: { sync() {} }, ComposerWorkMode: { sync() {} }, workspace: {} },
  };
  const context2 = { ...base, ...context };
  vm.createContext(context2);
  const phase = app.slice(app.indexOf('function applyChatPhase()'), app.indexOf('function v_logHasMessages()'));
  vm.runInContext(phase, context2);
  return context2;
}
const logChild = () => { const el = new El('div'); el.className = 'chat-message user'; return el; };

test('hero: en tom samtale centrerer stakken — chip, banner, bar og composeren dokker i heltens plads', () => {
  const dom = makeDom();
  const c = runSlices(dom);
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'hero', 'tom log uden indlæsning giver hero');
  assert.equal(dom.hero.hidden, false, 'helten står frem');
  assert.equal(dom.mode.parentElement, dom.heroChips, 'arbejdsmåde-chippen sidder i chiprækken over composeren');
  assert.equal(dom.resume.parentElement, dom.slot, 'resume-banneret står i stakken over composeren');
  assert.equal(dom.bar.parentElement, dom.slot, 'YOLO-baren følger med composeren');
  assert.equal(dom.form.parentElement, dom.slot, 'composeren dokker i heltens plads');
  assert.deepEqual([...dom.slot.children].map(el => el.id), ['resume-notice', 'conversation-permission-status', 'chat-form'], 'banneret og baren står over composeren');
});

test('active: første besked dokker composeren i bunden — samme noder, samme rækkefølge som før', () => {
  const dom = makeDom();
  const c = runSlices(dom);
  c.applyChatPhase();            // hero
  dom.prompt.value = 'Min kladde til første besked';
  c.view.log.children.push(logChild());
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'active');
  assert.equal(dom.hero.hidden, true, 'helten er væk');
  assert.equal(dom.form.parentElement, dom.panel, 'composeren er dokket i panelet igen');
  assert.equal(dom.panel.children[dom.panel.children.indexOf(dom.form) + 1], dom.contextStatus, 'composeren står før kontekst-linjen som før');
  assert.equal(dom.mode.parentElement, dom.toolbar, 'arbejdsmåde-chippen er tilbage i bundrækken');
  assert.equal(dom.toolbar.children[dom.toolbar.children.indexOf(dom.mode) + 1], dom.modelChip, 'chippen står før model-chippen som før');
  assert.equal(dom.resume.parentElement, dom.chatContent, 'resume-banneret er tilbage øverst i samtalen');
  assert.equal(dom.chatContent.children[0], dom.resume, 'banneret er første barn af samtaleindholdet');
  assert.equal(dom.bar.parentElement, dom.panel, 'YOLO-baren står ved composeren');
  assert.equal(dom.prompt.value, 'Min kladde til første besked', 'kladden overlever flytningen');
});

test('settling: en genindlæsning skjuler de flytbare dele — det forkerte layout blinker aldrig frem', () => {
  const dom = makeDom();
  const c = runSlices(dom);
  c.applyChatPhase();            // hero
  c.projectLoading = true;       // en gemt samtale genindlæses (displayProject)
  c.view.log.children.push(logChild());
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'settling');
  assert.equal(dom.form.parentElement, dom.panel, 'composeren er dokket i bunden (active-pladsen) — men skjult');
  // Indlæsningen afsluttes: applyRunning slår projectLoading fra og genberegner.
  c.projectLoading = false; c.view.log.children.length = 0;
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'hero', 'den tomme genindlæste samtale ender i hero');
  assert.equal(dom.form.parentElement, dom.slot);
});

test('genindlæsning af en samtale med beskender ender i active og aldrig i hero', () => {
  const dom = makeDom();
  const c = runSlices(dom);
  c.projectLoading = true;
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'settling');
  c.projectLoading = false;
  c.view.log.children.push(logChild(), logChild());
  c.applyChatPhase();
  assert.equal(dom.panel.dataset.phase, 'active');
  assert.equal(dom.hero.hidden, true);
});

test('updateStartIdea sætter heroQuiet — dekorationerne trækker sig ved en kladde', () => {
  const dom = makeDom();
  const c = runSlices(dom, { updateWorkMode() {}, profileState: null });
  const slice = app.slice(app.indexOf('function updateStartIdea()'), app.indexOf('function applyChatPhase()'));
  vm.runInContext(slice, c);
  dom.prompt.value = '';
  c.updateStartIdea();
  assert.equal(dom.panel.dataset.heroQuiet, 'false', 'tomt felt: dekorationerne står');
  dom.prompt.value = 'Der står en kladde';
  c.updateStartIdea();
  assert.equal(dom.panel.dataset.heroQuiet, 'true', 'kladde i feltet: dekorationerne trækker sig');
  assert.equal(dom.byId.get('project-intro').hidden, true, 'intro-chips skjules ved kladde — som før');
});

test('idé-chips: projektskift nulstiller select’erne — chip-etiketterne følger med (Fund 2)', () => {
  // wireHeroComposer kører med rigtige select’er (med options) og eksponerer
  // synkroniseringen; displayProject nulstiller select’erne og må kalde den —
  // ellers står det gamle valg på chippen, mens payloadkilden er ryddet.
  const byId = new Map();
  const make = (tag, id, options) => {
    const el = new El(tag, id);
    if (options) { el.options = options.map(([value, text]) => ({ value, textContent: text })); el.value = ''; }
    if (id) byId.set(id, el);
    return el;
  };
  const platform = make('select', 'idea-platform', [['', 'Lad AI’en foreslå det'], ['Browser', 'Browser']]);
  const data = make('select', 'idea-data', [['', 'Afklar ud fra min idé'], ['Ja, flere brugere med fælles data', 'Ja, flere brugere med fælles data']]);
  const ui = make('select', 'idea-ui', [['', 'Anbefal en løsning'], ['React og TypeScript', 'React og TypeScript']]);
  const design = make('select', 'idea-design', [['', 'Anbefal ud fra design og platform']]);
  const backend = make('select', 'idea-backend', [['', 'Anbefal ud fra behovet for data']]);
  for (const id of ['idea-chip-platform', 'idea-chip-platform-menu', 'idea-chip-platform-label', 'idea-chip-data', 'idea-chip-data-menu', 'idea-chip-data-label', 'idea-chip-technique', 'idea-chip-technique-panel', 'idea-chip-technique-label', 'idea-technique-groups', 'idea-options', 'project-chip', 'project-chip-list', 'project-chip-menu', 'project-chip-open']) make(id.includes('menu') || id.includes('groups') || id === 'idea-options' || id === 'project-chip-list' ? 'div' : 'button', id);
  const window = { PopoverLayer: { open: () => true, close: () => {} }, HeroComposer: null };
  const $ = selector => byId.get(selector.replace(/^#/, ''));
  const context = { $, document: { querySelectorAll: () => [] }, window, current: { root: '/projekt' }, action: fn => fn(), node: (tag, text, cls) => { const el = new El(tag); el.textContent = text; el.className = cls || ''; return el; } };
  vm.createContext(context);
  const start = app.indexOf('function wireHeroComposer()');
  const end = app.indexOf('wireHeroComposer();', start) + 'wireHeroComposer();'.length;
  vm.runInContext(app.slice(start, end), context);
  assert.ok(window.HeroComposer && typeof window.HeroComposer.syncIdeaChips === 'function', 'synkroniseringen er eksponeret som window.HeroComposer.syncIdeaChips');
  // Brugeren vælger gennem chip-menuerne (eller select’erne — samme kilde).
  platform.value = 'Browser'; data.value = 'Ja, flere brugere med fælles data'; ui.value = 'React og TypeScript';
  window.HeroComposer.syncIdeaChips();
  assert.equal(byId.get('idea-chip-platform-label').textContent, 'Platform · Browser');
  assert.equal(byId.get('idea-chip-data-label').textContent, 'Data · Ja, flere brugere med fælles data');
  assert.equal(byId.get('idea-chip-technique-label').textContent, 'Teknik · React og TypeScript');
  // displayProject nulstiller select’erne ved projektskift (app.js) —
  // chip-etiketterne SKAL følge med, ellers lyver chippen om payloadkilden.
  for (const el of [platform, data, ui, design, backend]) el.value = '';
  window.HeroComposer.syncIdeaChips();
  assert.equal(byId.get('idea-chip-platform-label').textContent, 'Platform', 'etiketten følger nulstillingen');
  assert.equal(byId.get('idea-chip-data-label').textContent, 'Data');
  assert.equal(byId.get('idea-chip-technique-label').textContent, 'Tekniske ønsker');
  // Kilde-pin: displayProject kalder synkroniseringen umiddelbart efter nulstillingen.
  assert.match(app, /\$\('#idea-options'\)\.open = false; for \(const el of document\.querySelectorAll\('#idea-options select'\)\) el\.value = '';\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*window\.HeroComposer\?\.syncIdeaChips\(\);/, 'displayProject re-synkroniserer chip-etiketterne ved nulstillingen');
});

test('helteoverskrift og pladsholder følger arbejdsmåde og fase (§4/§5.1 — uden »/«-løfter)', () => {
  const dom = makeDom();
  const c = runSlices(dom, {
    updateWorkMode() {}, profileState: null,
    window: { ConversationPermission: { sync() {} }, ComposerWorkMode: { sync() {} }, workspace: { target: () => null } },
  });
  const slice = app.slice(app.indexOf('function updateWorkMode()'), app.indexOf("$('#work-mode').onchange"));
  vm.runInContext(slice, c);
  const panel = dom.byId.get('chat-panel');
  const heading = dom.byId.get('hero-heading');
  const placeholder = dom.byId.get('prompt');
  for (const [mode, title] of [['chat', 'Hvad vil du tale om?'], ['plan', 'Hvad skal vi planlægge?'], ['build', 'Hvad skal vi bygge?'], ['free', 'Hvad skal vi bygge?']]) {
    dom.byId.get('work-mode').value = mode;
    panel.dataset.phase = 'hero';
    c.updateWorkMode();
    assert.equal(heading.textContent, title, `overskriften for ${mode}`);
    assert.ok(!/\/ for kommandoer|@ for filer/.test(placeholder.placeholder ?? ''), 'pladsholderen lover ingen »/« eller »@« (R5)');
    assert.equal(dom.byId.get('composer-mode').dataset.mode, mode, 'chip-glyffen følger datamarkøren');
  }
  dom.byId.get('work-mode').value = 'chat';
  panel.dataset.phase = 'active';
  c.updateWorkMode();
  assert.equal(placeholder.placeholder, 'Skriv en besked …', 'aktiv pladsholder i Samtale');
  panel.dataset.phase = 'hero';
  c.updateWorkMode();
  assert.equal(placeholder.placeholder, 'Stil et spørgsmål, eller beskriv din idé …', 'helt-pladsholderen i Samtale');
});
