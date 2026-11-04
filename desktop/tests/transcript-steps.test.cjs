// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// D4b — trinrækkerne (§6.3), live-indikatoren (§6.4), topbjælken (§6.1) og
// brugerboblerne (§6.2). Selve live-work.js køres i en mini-DOM (som
// conversation-hero.test.cjs gør for app.js): de rene hjælpere eksporteres
// også direkte (StepRows). R6 bevises med en kanariefugl i stream-progress:
// fasen og tegnantallet må vises, resonnementets tekst må aldrig nå DOM'en.
// R7 bevises for alle ni kombinationer af hjælpeniveau × detaljeniveau med en
// afventende godkendelse: godkendelser, planflader, fejl og spørgsmål er
// altid synlige og foldes aldrig ind i rækkerne.
const ui = path.join(__dirname, '..', 'ui');
const read = name => fs.readFileSync(path.join(ui, name), 'utf8');
const liveWorkSource = read('live-work.js');
const componentsCss = read('components.css');
const indexHtml = read('index.html');
const appSource = read('app.js');
const StepRows = require('../ui/live-work.js');

// ---------- Mini-DOM ----------
class El {
  constructor(tag, id, cls) {
    this.tagName = String(tag || '').toUpperCase(); this.id = id || '';
    this.children = []; this.parentElement = null; this.hidden = false; this.disabled = false;
    this.dataset = {}; this.style = {}; this.listeners = {}; this._text = ''; this.open = false; this.type = '';
    const classes = new Set(String(cls || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      toggle: (name, force) => { const on = force === undefined ? !classes.has(name) : Boolean(force); if (on) classes.add(name); else classes.delete(name); return on; },
      contains: name => classes.has(name)
    };
    Object.defineProperty(this, 'className', { get: () => [...classes].join(' '), set: value => { classes.clear(); String(value).split(/\s+/).filter(Boolean).forEach(name => classes.add(name)); } });
  }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get childNodes() { return this.children; }
  get parentNode() { return this.parentElement; }
  setAttribute(name, value) { this[name === 'aria-label' ? 'ariaLabel' : name] = String(value); }
  getAttribute(name) { const value = this[name === 'aria-label' ? 'ariaLabel' : name]; return value === undefined ? null : String(value); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  dispatch(name) { for (const handler of [...(this.listeners[name] || [])]) handler({ type: name }); }
  adopt(node) { if (node.parentElement) node.parentElement.children.splice(node.parentElement.children.indexOf(node), 1); node.parentElement = this; }
  append(...nodes) { for (const node of nodes) { this.adopt(node); this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  insertBefore(node, reference) { const index = this.children.indexOf(reference); this.adopt(node); if (index < 0) this.children.push(node); else this.children.splice(index, 0, node); }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  focus() {}
  scrollIntoView() {}
  closest(selector) { const parts = selector.split(',').map(part => part.trim()); let el = this; while (el) { if (parts.some(part => El.matches(el, part))) return el; el = el.parentElement; } return null; }
  static matches(el, selector) {
    const match = /^([a-z]+)?((?:\.[A-Za-z0-9_-]+)*)$/.exec(selector);
    if (!match) return false;
    if (match[1] && el.tagName !== match[1].toUpperCase()) return false;
    return match[2].split('.').filter(Boolean).every(name => el.classList.contains(name));
  }
  static chain(el, selector) {
    const steps = selector.split(/\s+/);
    if (!El.matches(el, steps[steps.length - 1])) return false;
    let ancestor = el.parentElement;
    for (let index = steps.length - 2; index >= 0; index--) {
      while (ancestor && !El.matches(ancestor, steps[index])) ancestor = ancestor.parentElement;
      if (!ancestor) return false;
      ancestor = ancestor.parentElement;
    }
    return true;
  }
  querySelectorAll(selector) {
    const found = [];
    const parts = selector.split(',').map(part => part.trim());
    const walk = el => { for (const child of el.children) { if (parts.some(part => El.chain(child, part))) found.push(child); walk(child); } };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function makeWorld(bodyClasses = []) {
  const byId = new Map();
  const make = (tag, id, cls, parent) => { const el = new El(tag, id, cls); if (id) byId.set(id, el); if (parent) parent.append(el); return el; };
  const body = make('body', 'body');
  for (const name of bodyClasses) body.classList.add(name);
  const document = { body, getElementById: id => byId.get(id) || null, createElement: tag => new El(tag) };
  const panel = make('section', 'panel-activity', '', body);
  make('div', 'activity-scroll', '', panel);
  make('div', 'preview-empty', '', body);
  make('button', 'agent-follow', '', body);
  const log = make('div', 'messages');
  const approval = make('section', 'approval-surface');
  approval.hidden = false;
  const view = { id: 'chat-1', running: true, runStartedAt: 1000, lastSignalAt: 1000, waitingFor: [], receivedChars: 0, statusDetail: '', runLabel: 'Arbejder', modelProgress: null, todos: [], log, approvals: approval };
  const $ = selector => { const id = selector.replace(/^#/, ''); if (!byId.has(id)) byId.set(id, new El('div', id)); return byId.get(id); };
  const handlers = [];
  const window = { harness: { onEvent: fn => handlers.push(fn) }, ChatDisplay: require('../ui/chat-display.js'), workspace: { show() {} }, liveWork: null, StepRows: null };
  const context = {
    $, document, window, view, viewFor: () => view,
    node: (tag, text, cls) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; },
    queueMicrotask: fn => Promise.resolve().then(fn),
    Date: class extends Date { static now() { return world.now; } },
    module: undefined
  };
  context.window.document = document;
  const world = { now: 11000, view, log, body, approval, $, document, handlers, context, byId, make };
  vm.createContext(context);
  vm.runInContext(liveWorkSource, context);
  world.liveWork = window.liveWork;
  world.stepRows = window.StepRows;
  return world;
}
const settle = () => new Promise(resolve => setImmediate(resolve));
async function emit(world, entry) { for (const handler of world.handlers) handler({ chat: 'chat-1', type: 'activity', entry }); await settle(); }
async function render(world) { world.liveWork.render(); await settle(); }
const setLevel = (world, level) => { for (const name of ['transcript-compact', 'transcript-standard', 'transcript-detailed']) world.body.classList.toggle(name, name === `transcript-${level}`); };
const rows = world => [...world.log.querySelectorAll('.turn-steps')].flatMap(root => [...root.children]);

// ---------- 1. Detaljeniveauets udgangstilstand (§6.5) ----------
test('detailed: alle trinrækker vises og opdateres live med verb, glyf og udfald', async () => {
  const world = makeWorld(['transcript-detailed']);
  await emit(world, { id: 't1', kind: 'tool', tool: 'read', title: 'Undersøger en fil', target: 'src/ui/composer.js', status: 'completed', started: 1000, ended: 3100, at: 1000 });
  await emit(world, { id: 't2', kind: 'tool', tool: 'bash', title: 'Kører et arbejdstrin', target: 'npm test -- composer', status: 'running', started: 3200, at: 3200 });
  const list = rows(world);
  assert.equal(list.length, 2, 'én række pr. værktøjshændelse');
  const [read, run] = list;
  assert.match(read.className, /disclosure step status-completed/);
  assert.equal(read.querySelector('.step-verb').textContent, 'Læser');
  assert.equal(read.querySelector('.step-glyph-char').textContent, '▤');
  assert.equal(read.querySelector('.step-detail').textContent, 'src/ui/composer.js');
  assert.equal(read.querySelector('.step-mark').textContent, '✓');
  assert.equal(read.querySelector('.step-time').textContent, '2 s');
  assert.match(run.className, /status-running/);
  assert.equal(run.querySelector('.step-verb').textContent, 'Kører');
  assert.equal(run.querySelector('.step-glyph-char').textContent, '▶');
  assert.equal(run.querySelector('.step-mark').textContent, '', 'en kørende række har intet udfald endnu');
  assert.equal(run.querySelector('.step-running-note').textContent, '· kører', 'reduceret bevægelse har »· kører« som tekstmarkør');
  assert.equal(run.querySelector('.step-content .step-target').textContent, 'npm test -- composer', 'O2: det fulde mål står læsbart i den foldede række');
});

test('compact og standard: én live-linje — P1: rækken bærer det aktuelle trin, ordet "Arbejder" står kun i live-indikatoren', async () => {
  const compact = makeWorld(['transcript-compact']);
  compact.view.modelProgress = { phase: 'reasoning', reasoningChars: 5432 };
  await render(compact);
  let line = rows(compact);
  assert.equal(line.length, 1, 'compact viser én live-linje');
  assert.match(line[0].className, /step-live/);
  assert.equal(line[0].querySelector('.step-verb').textContent, 'Forbereder svaret', 'compact viser den offentlige fase — ikke et andet Arbejder (P1)');
  assert.equal(line[0].querySelectorAll('.step-detail').length, 0);

  const standard = makeWorld(['transcript-standard']);
  await emit(standard, { id: 't1', kind: 'tool', tool: 'bash', title: 'Kører et arbejdstrin', target: 'npm test -- composer', status: 'running', started: 3200, at: 3200 });
  line = rows(standard);
  assert.equal(line.length, 1, 'standard viser én live-linje');
  assert.equal(line[0].querySelector('.step-verb').textContent, 'Kører', 'P1: verbet er trinets eget (Arbejder står i §6.4-båndet)');
  assert.equal(line[0].querySelector('.step-detail').textContent, 'npm test -- composer', 'standard viser det aktuelle trins mål');

  const standardPhase = makeWorld(['transcript-standard']);
  standardPhase.view.modelProgress = { phase: 'reasoning', reasoningChars: 1234 };
  await render(standardPhase);
  const phase = rows(standardPhase)[0];
  assert.equal(phase.querySelector('.step-verb').textContent, 'Forbereder svaret');
  assert.equal(phase.querySelector('.step-detail').textContent, '1.234 tegn');
});

test('færdig tur folder til én grupperække på alle tre niveauer', async () => {
  for (const level of ['compact', 'standard', 'detailed']) {
    const world = makeWorld([`transcript-${level}`]);
    await emit(world, { id: 't1', kind: 'tool', tool: 'read', title: 'Undersøger en fil', target: 'a.js', status: 'completed', started: 1000, ended: 2000, at: 1000 });
    await emit(world, { id: 't2', kind: 'tool', tool: 'read', title: 'Undersøger en fil', target: 'b.js', status: 'completed', started: 2000, ended: 3000, at: 2000 });
    await emit(world, { id: 't3', kind: 'tool', tool: 'edit', title: 'Opdaterer en fil', target: 'c.css', status: 'completed', started: 3000, ended: 4000, at: 3000 });
    world.view.running = false; world.now = 15000;
    await render(world);
    const list = rows(world);
    assert.equal(list.length, 1, `${level}: én grupperække`);
    const group = list[0];
    assert.match(group.className, /step-group/);
    assert.equal(group.open, false, `${level}: gruppen starter foldet`);
    const text = group.querySelector('.step-text').textContent;
    assert.match(text, /^3 trin · 2 filer læst · 1 rettet · 14 s$/, `${level}: gruppens opsummering`);
    assert.equal(group.querySelector('.step-glyph-char').textContent, '▸');
    assert.ok(group.querySelector('.step-group-rows'), `${level}: trinene ligger foldet i gruppen`);
    assert.equal(group.querySelector('.step-group-rows').children.length, 4, 'tre rækker + Se hele aktiviteten');
  }
});

// ---------- 2. R7: brugerens foldvalg vinder ----------
test('R7: brugerens manuelle foldning vinder over niveauskift og senere hændelser', async () => {
  const world = makeWorld(['transcript-standard']);
  await emit(world, { id: 't1', kind: 'tool', tool: 'read', title: 'Undersøger en fil', target: 'a.js', status: 'completed', started: 1000, ended: 2000, at: 1000 });
  world.view.running = false; world.now = 14000;
  await render(world);
  const group = rows(world)[0];
  group.open = true; group.dispatch('toggle'); // brugerens valg
  // En senere statusgengivelse (fx en besvaret godkendelse) må ikke folde gruppen.
  await emit(world, { id: 't2', kind: 'tool', tool: 'grep', title: 'Søger i projektets indhold', target: 'brug', status: 'completed', started: 2000, ended: 2500, at: 2000 });
  assert.equal(rows(world).length, 1, 'gentagne hændelser beholder grupperækken');
  assert.equal(rows(world)[0].open, true, 'brugerens åbne gruppe overlever en ny hændelse — også gennem en genbygning');
  assert.match(rows(world)[0].querySelector('.step-text').textContent, /2 trin · 1 fil læst/, 'genbygningen medtager den nye hændelse');
  // Niveauskift ændrer ikke en manuelt åbnet tur (kun næste gengivelse af nye).
  setLevel(world, 'detailed');
  await render(world);
  assert.equal(rows(world)[0].open, true, 'niveauskift lukker ikke en manuelt åbnet gruppe');
  // En ny tur får det nye niveaus udgangspunkt — den gamle gruppe røres ikke.
  world.view.running = true; world.view.runStartedAt = 20000; world.view.modelProgress = null;
  world.now = 21000;
  await render(world);
  assert.equal(rows(world)[0].open, true, 'den gamle gruppe forbliver åben');
  assert.equal(rows(world).length, 2, 'den nye tur får sine egne rækker');
  assert.match(rows(world)[1].className, /status-running/, 'detailed: den nye tur viser live-rækker');
});

test('R7: en foldet ud række holder sin fold — fintopdatering genbygger aldrig urets tik', async () => {
  const world = makeWorld(['transcript-detailed']);
  await emit(world, { id: 't1', kind: 'tool', tool: 'bash', title: 'Kører et arbejdstrin', target: 'npm test', status: 'running', started: 1000, at: 1000, output: 'ok' });
  const row = rows(world)[0];
  row.open = true; row.dispatch('toggle');
  // En signalkiftende hændelse genbygger rækken — folden følger med (run.open).
  await emit(world, { id: 't1', kind: 'tool', tool: 'bash', title: 'Kører et arbejdstrin', target: 'npm test', status: 'running', started: 1000, at: 1000, output: 'ok\nmere output' });
  assert.notEqual(rows(world)[0], row, 'indholdsændringen genbygger rækken');
  assert.equal(rows(world)[0].open, true, 'brugerens fold følger med over i den nye række');
  // Uret tikker uden indholdsændring: samme element, ingen genopbygning.
  const before = rows(world)[0];
  world.now = 14000;
  await render(world);
  assert.equal(rows(world)[0], before, 'et tik uden ny hændelse genbygger intet');
  assert.equal(rows(world)[0].open, true, 'folden overlever tikkene');
});

// ---------- 3. R6: ingen private tænkeuddrag ----------
test('R6: Forbereder svaret viser kun fase og tegnantal — aldrig resonnementets tekst', async () => {
  const world = makeWorld(['transcript-detailed']);
  world.view.modelProgress = { phase: 'reasoning', reasoningChars: 9876, reasoning: 'HEMMELIGE INTERNE NOTER, DER ALDRIG MÅ VISES', text: 'heller ikke svarets tekst her' };
  await render(world);
  const text = world.log.textContent;
  assert.match(text, /Forbereder svaret/, 'rækkens verb er R6-formuleringen');
  assert.match(text, /9\.876 tegn/, 'fasens offentlige tegnantal vises');
  assert.ok(!text.includes('HEMMELIGE'), 'resonnementets tekst når aldrig DOM’en');
  assert.ok(!text.includes('heller ikke'), 'svarteksten streames ikke i rækken');
  // Standardens live-linje holder samme grænse.
  const standard = makeWorld(['transcript-standard']);
  standard.view.modelProgress = { phase: 'reasoning', reasoningChars: 500, reasoning: 'HEMMELIGE INTERNE NOTER' };
  await render(standard);
  assert.ok(!standard.log.textContent.includes('HEMMELIGE'));
  assert.match(standard.log.textContent, /Forbereder svaret/);
});

// ---------- 4. R7: ni kombinationer med afventende godkendelse ----------
test('ni kombinationer (3 hjælp × 3 detaljer): afventende godkendelse er altid synlig og foldes aldrig ind', async () => {
  const protectedSurfaces = ['#approvals', '#plan-offer', '#plan-card', '#run-review', '#connection-warning', '#data-dialog'];
  // (a) Ingen hjælpe- eller detaljeregel kan ramme de beskyttede flader: hver
  // selektor i settings.css/components.css matches mod listen.
  for (const sheet of [read('settings.css'), componentsCss]) {
    const selectors = [...sheet.matchAll(/(?:^|\n)\s*((?:body\.help-(?:fuld|delvis|ingen)|body\.transcript-(?:compact|standard|detailed))[^{},\n]*)/g)].map(match => match[1].trim());
    for (const selector of selectors) {
      for (const surface of protectedSurfaces) {
        assert.ok(!selector.includes(surface), `${selector} må ikke røre den altid-synlige flade ${surface}`);
      }
      assert.ok(!selector.includes('.approval'), `${selector} må ikke røre godkendelseskortene`);
      assert.ok(!selector.includes('.question-card'), `${selector} må ikke røre spørgsmål til brugeren`);
    }
  }
  // (b) Rendererens ni kombinationer: ventende række + intakt godkendelsesflade.
  for (const help of [null, 'help-delvis', 'help-ingen']) {
    for (const level of ['compact', 'standard', 'detailed']) {
      const classes = [`transcript-${level}`]; if (help) classes.push(help);
      const world = makeWorld(classes);
      const approval = world.approval;
      world.view.waitingFor = [{ id: 'p1', title: 'Godkend filændringen', element: approval }];
      await emit(world, { id: 't1', kind: 'tool', tool: 'edit', title: 'Opdaterer en fil', target: 'index.html', status: 'completed', started: 1000, ended: 2000, at: 1000 });
      await render(world);
      const text = world.log.textContent;
      assert.match(text, /Venter på dit valg/, `${help || 'fuld'} × ${level}: ventetilstanden står i rækken`);
      assert.ok(!text.includes('Godkend filændringen: Tillad'), 'godkendelsens handlinger vises kun på kortet selv');
      assert.equal(approval.hidden, false, `${help || 'fuld'} × ${level}: godkendelsen er ikke skjult`);
      assert.equal(approval.children.length, 0, 'rendererens rækker lægges aldrig ind i godkendelsesfladen');
      world.view.running = false; world.now = 14000;
      await render(world);
      assert.equal(approval.hidden, false, `${help || 'fuld'} × ${level}: godkendelsen forbliver synlig efter turens slut`);
    }
  }
  // (c) Delingsadvarslen i resume-bemærkningen er essential og overlever 'ingen hjælp'.
  const resume = indexHtml.slice(indexHtml.indexOf('id="resume-notice"'), indexHtml.indexOf('</details>', indexHtml.indexOf('id="resume-notice"')));
  assert.match(resume, /class="hint" data-help="essential"/, 'delingsadvarslen er markeret essential (reglen fra 2e79ed0)');
  assert.match(read('settings.css'), /body\.help-ingen\s+#resume-notice \.hint:not\(\[data-help="essential"\]\)/, 'hjælp-skjulningen undtager den essential-delte advarsel');
});

// ---------- 5. Uret tikker uden at folde rækker (O2 + §6.4) ----------
test('uret tikker fint hver statusgengivelse uden at røre brugerens folder', async () => {
  const world = makeWorld(['transcript-standard']);
  await emit(world, { id: 't1', kind: 'tool', tool: 'bash', title: 'Kører et arbejdstrin', target: 'npm test', status: 'running', started: 1000, at: 1000 });
  const line = rows(world)[0];
  assert.equal(line.querySelector('.step-time').textContent, '10 s');
  world.now = 14000;
  await render(world);
  assert.equal(line.querySelector('.step-time').textContent, '13 s', 'uret følger med uden genopbygning');
  assert.equal(rows(world)[0], line, 'samme element — ingen fold kan gå tabt');
});

// ---------- 6. Rene hjælpere: gruppetekst og niveau ----------
test('StepRows: gruppetekst, niveaulæsning og varighed følger §6.3/§6.5', () => {
  const tools = [
    { kind: 'tool', tool: 'read', status: 'completed' },
    { kind: 'tool', tool: 'read', status: 'completed' },
    { kind: 'tool', tool: 'read', status: 'completed' },
    { kind: 'tool', tool: 'edit', status: 'completed' },
    { kind: 'tool', tool: 'bash', status: 'error' }
  ];
  assert.equal(StepRows.groupSummary(tools, 14000), '5 trin · 3 filer læst · 1 rettet · 1 mislykkedes · 14 s');
  assert.equal(StepRows.groupSummary([{ kind: 'tool', tool: 'edit', status: 'completed' }], 500), '1 trin · 1 rettet · under 1 s');
  assert.equal(StepRows.duration(65000), '1 min 5 s');
  const body = { classList: { contains: name => name === 'transcript-detailed' } };
  assert.equal(StepRows.level({ body }), 'detailed');
  assert.equal(StepRows.level({ body: { classList: { contains: () => false } } }), 'standard', 'ukendt/ingen klasse folder til standard');
});

// ---------- 7. Topbjælken (§6.1) og arbejdsmåde-menuen (B3) ----------
test('topbar: chippen åbner den delte menu — fire interne værdier og Byg den valgte plan er urørt', () => {
  assert.ok(indexHtml.includes('id="topbar-mode"'), 'topbjælken har arbejdsmåde-chippen');
  assert.match(indexHtml.slice(indexHtml.indexOf('id="topbar-mode"'), indexHtml.indexOf('id="topbar-mode"') + 220), /aria-controls="composer-mode-menu"/, 'chippen åbner den eksisterende delte menu');
  const feedback = read('feedback-layout.js');
  assert.match(feedback, /open\(from = toggle\)/, 'menuen åbnes fra en given chip — topbjælken og composeren deler åbneren');
  assert.match(feedback, /invoker = from === toggle \|\| from === topbarToggle \? from : toggle/, 'fokus og forankring følger den chip, der åbnede');
  // R1: de fire interne værdier og planbeskyttelsen er uændrede.
  assert.match(feedback, /select\.value = button\.dataset\.workMode === 'free' && activePlan \? 'build' : button\.dataset\.workMode/, 'Byg den valgte plan forbliver plan-byg — aldrig fri bygning');
  for (const mode of ['chat', 'plan', 'free']) assert.ok(indexHtml.includes(`data-work-mode="${mode}"`), `menuværdien ${mode} består`);
  assert.ok(indexHtml.includes('<option value="build" hidden>Byg den valgte plan'), 'den skjulte fjerde værdi build består som plan-byg — aldrig fri bygning');
  assert.ok(indexHtml.includes('id="build-plan"'), 'Byg den valgte plan-knappen består');
  // app.js: chippen følger updateWorkMode + samme disabled-forløb.
  assert.match(appSource, /\$\('#topbar-mode'\)\.textContent = label/, 'chippen viser samme etiket som composer-chippen');
  assert.match(appSource, /for \(const selector of \['#composer-mode', '#topbar-mode',/, 'chippen deaktiveres præcis som composer-chippen under arbejde');
  // #run-status forbliver role=status for skærmlæsere (§6.1).
  const runStatus = /<span id="run-status"[^>]*>/.exec(indexHtml);
  assert.ok(runStatus, '#run-status består');
  assert.match(runStatus[0], /role="status"/, '#run-status bevarer role=status');
  assert.match(runStatus[0], /visually-hidden/, '#run-status er visuelt skjult — status står i live-indikatoren');
});

test('topbar: titlen og brødkrummen synkroniseres med samtalen og projektet', () => {
  assert.match(appSource, /function syncTopbar\(\)/, 'topbjælkens titel har én synkronisering');
  assert.match(appSource, /window\.topbarSync = syncTopbar/, 'sidepanelets opdatering (omdøb) skubber titlen op');
  assert.match(read('chats.js'), /window\.topbarSync\?\.\(\)/, 'chats.js kalder synkroniseringen efter en opdatering');
  assert.match(componentsCss, /\.workspace-calm \.workspace-bar \{[^}]*min-height: var\(--aura-workspace-bar\)/, 'topbjælken er mindst 52 px (§6.1) — D1: højden bor i --aura-workspace-bar, så overlay-skuffen og skillelinjen følger med');
  assert.match(read('aura-tokens.css'), /--aura-workspace-bar:\s*44px/, 'native titelbar-tokenet er44px');
  const h1 = /\.workspace-calm \.workspace-bar h1 \{([^}]*)\}/.exec(componentsCss);
  assert.ok(h1, 'titelreglen findes');
  assert.match(h1[1], /font-size: 15px/, 'samtaletitlen står i 15 px');
  assert.match(h1[1], /line-height: 22px/, 'linjehøjde 22');
  assert.match(h1[1], /font-weight: var\(--aura-font-weight-medium\)/, 'vægt 500');
  assert.match(componentsCss, /\.workspace-crumb \{[^}]*color: var\(--aura-ink-muted\)/, 'projektnavnet er tertiær brødkrumme');  assert.match(read('workspace.js'), /toggle\.textContent = open \? '◧' : '◨'/, 'panelknappen er ren glyf');
});

// ---------- 8. Brugerbobler (§6.2) ----------
function runAppendMessage(context) {
  const slice = appSource.slice(appSource.indexOf('function appendMessage('), appSource.indexOf("const chatContent = $('#chat-content')"));
  vm.runInContext(slice, context);
}
test('bobler: appendMessage bygger boble, handlingsrække med tid og kopi, og seneste-rækken flyttes', async () => {
  const byId = new Map();
  const $ = selector => { const id = selector.replace(/^#/, ''); if (!byId.has(id)) byId.set(id, new El('div', id)); return byId.get(id); };
  const view = { id: 'c1', log: new El('div'), followChat: false };
  const context = { $, view, node: (tag, text, cls) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el; }, applyChatPhase() {}, markdownInto() {}, navigator: { clipboard: { writeText: async () => {} } }, setTimeout: () => {}, Date, document: { getElementById: () => null } };
  vm.createContext(context);
  runAppendMessage(context);
  const at = new Date(2026, 10, 3, 14, 7, 0).getTime();
  const first = context.appendMessage('Første besked', 'user', view, at);
  assert.match(first.className, /chat-message user/);
  assert.equal(first.querySelector('.user-bubble').textContent, 'Første besked');
  const actions = first.querySelector('.chat-message-actions');
  assert.ok(actions, 'handlingsrækken findes');
  const time = actions.querySelector('.chat-message-time');
  assert.equal(time.textContent, '14.07', 'tiden står i danske tabelcifre');
  assert.equal(time.hidden, false);
  assert.equal(actions.querySelector('.chat-message-copy').getAttribute('aria-label'), 'Kopiér beskeden');
  assert.ok(first.classList.contains('message-latest'), 'den seneste besked har rækken altid synlig (CSS)');
  // Uden kendt tidspunkt opfindes intet: feltet skjules.
  const second = context.appendMessage('Anden besked', 'user', view);
  assert.equal(second.querySelector('.chat-message-time').hidden, true, 'et ukendt tidspunkt vises aldrig');
  assert.ok(second.classList.contains('message-latest'));
  assert.ok(!first.classList.contains('message-latest'), 'kun den seneste besked markeres');
  // Kopi-knappen skriver brugerens egen tekst til udklipsholderen.
  let copied = null;
  context.navigator.clipboard.writeText = async value => { copied = value; };
  await actions.querySelector('.chat-message-copy').onclick();
  assert.equal(copied, 'Første besked');
});

test('bobler: ét breddevalg (70 %) og synlighedstilstandene i CSS', () => {
  const rule = /\.workspace-calm \.chat-message\.user \{([^}]*)\}/.exec(componentsCss);
  assert.ok(rule, 'reglen findes');
  assert.match(rule[1], /max-width: 70%/);
  assert.ok(!rule[1].includes('82%'), 'Codex-nit: min(70 %, 82 %) er altid 70 % — ét tal');
  assert.match(rule[1], /border-radius: var\(--aura-radius-xl\)/, 'radius 20 (§6.2)');
  assert.match(componentsCss, /\.chat-message\.user\.message-latest \.chat-message-actions \{[^}]*opacity: 1/, 'den seneste beskeds række er altid synlig');
  assert.match(componentsCss, /\.chat-message\.user:hover \.chat-message-actions, \.workspace-calm \.chat-message\.user:focus-within \.chat-message-actions/, 'hover OG fokus viser rækken (O2-paritet)');
  assert.match(componentsCss, /@media \(hover: none\) \{ \.workspace-calm \.chat-message\.user \.chat-message-actions \{ opacity: 1; \} \}/, 'uden hover-enhed står rækken altid (touch-paritet)');
  assert.match(componentsCss, /transition: opacity 80ms/, '80 ms fade');
});

// ---------- 9. Live-indikatoren (§6.4) — kildetestykker ----------
test('live-indikatoren: Arbejder · sekunder, Venter på dig-link og skillelinje fra renderStatus', () => {
  const status = appSource.slice(appSource.indexOf('function renderStatus()'), appSource.indexOf("$('#agent-activity-jump').onclick"));
  assert.match(status, /Arbejder · \$\{elapsedText\(Date\.now\(\) - v\.runStartedAt\)\}/, '§6.4: Arbejder · 12 s med tabelcifre');
  assert.match(status, /Venter på dig · \$\{v\.waitingFor\[0\]\.title\}/, 'ventetilstanden nævner godkendelsen');
  assert.match(status, /\$\('#agent-activity-jump'\)\.hidden = !waiting/, 'linket til godkendelsen består');
  assert.match(status, /dataset\.sep = v\.log\.childElementCount > 0 \? 'on' : 'off'/, 'skillelinjen kun ved indhold ovenfor');
  assert.ok(appSource.includes("$('#agent-follow').onclick") || read('live-work.js').includes("$('#agent-follow').onclick"), 'Følg arbejdet består');
  assert.match(componentsCss, /\.workspace-calm #agent-activity-text \{[^}]*color: var\(--aura-accent-ink\)/, 'accentblanding (R4-målt)');
  assert.match(componentsCss, /#agent-activity\.is-waiting #agent-activity-text \{[^}]*color: var\(--aura-warning-ink\)/, 'ventetilstanden bærer den målte advarselsfarve');
  assert.match(componentsCss, /#agent-activity\[data-sep="on"\] \{[^}]*border-top: 0\.5px/, '0,5 px skillelinje');
  assert.match(componentsCss, /\.activity-spinner::before \{ content: '≋'; \}/, 'bølge-glyffen erstatter spinneren');
  assert.match(componentsCss, /is-waiting \.activity-spinner::before \{ content: '●'; \}/, 'venteglyffen');
  // Genbrugte knaptekster består som små tekstknapper.
  for (const text of ['Følg arbejdet', 'Seneste svar']) assert.ok(indexHtml.includes(text), `${text} består`);
});

// ---------- 10. Trinrækkens kontrakt i CSS (O2 + reduced motion) ----------
test('rækker: 24 px enlinje, glyf-krydsfade, fade-maske kun på output — aldrig på fejl (O2)', () => {
  assert.match(componentsCss, /details\.disclosure\.step > summary \{[^}]*min-height: 24px/, '24 px rækker');
  assert.match(componentsCss, /\.turn-steps \{[^}]*gap: 4px/, '4 px mellem rækker');
  const turn = /\.turn-steps \{([^}]*)\}/.exec(componentsCss);
  assert.match(turn[1], /margin: 8px 0 14px/, '12–16 px før svarteksten');
  assert.match(componentsCss, /\.step-glyph::after \{[^}]*transition: opacity var\(--aura-transition-duration-fast\)/, '100 ms krydsfade til chevron');
  assert.match(componentsCss, /summary:hover \.step-glyph::after, details\.disclosure\.step > summary:focus-visible \.step-glyph::after/, 'hover OG fokus viser chevronen');
  const output = /\.step-output \{([^}]*)\}/.exec(componentsCss);
  assert.match(output[1], /max-height: min\(400px, 50vh\)/, 'indholdet får maks. højde min(400px, 50vh)');
  assert.match(output[1], /mask-image: linear-gradient\(180deg, #000 0, #000 calc\(100% - 24px\), transparent 100%\)/, '24 px fade-maske');
  const error = /\.step-error \{([^}]*)\}/.exec(componentsCss);
  assert.ok(!/mask/.test(error[1]), 'fejlteksten er aldrig maskeret (O2)');
  const target = /\.step-target \{([^}]*)\}/.exec(componentsCss);
  assert.ok(!/mask/.test(target[1]), 'målet står umaskeret — lange stier kan læses helt');
  assert.match(componentsCss, /\.step\.status-running \.step-text \{[^}]*animation: none/, 'running work uses stable readable text');
  assert.match(componentsCss, /\.step-running-note \{ display: inline;/, 'the running state remains explicit without animation');
  assert.match(componentsCss, /\.step-meta \{[^}]*font-variant-numeric: tabular-nums/, 'tabelcifre til højre');
  assert.match(componentsCss, /\.activity-output pre \{[^}]*max-height: min\(400px, 50vh\)/, 'aktivitetspanelets tekniske folds følger samme behandling');
});

// ---------- 11. Godkendelser og spørgsmål lægges aldrig i rækkerne ----------
test('renderer: kun værktøjshændelser bliver rækker — godkendelser og spørgsmål røres ikke', async () => {
  const world = makeWorld(['transcript-detailed']);
  await emit(world, { id: 'a1', kind: 'approval', title: 'Godkendelse: edit', target: 'index.html', status: 'waiting', at: 1000 });
  await emit(world, { id: 'q1', kind: 'question', title: 'Spørgsmål', status: 'waiting', at: 1000 });
  world.view.running = false; world.now = 12000;
  await render(world);
  assert.equal(rows(world).length, 0, 'hverken godkendelser eller spørgsmål bliver trinrækker');
  // En tur uden værktøj (rent samtale-svar) efterlader ingen tom grupperække.
  assert.equal(world.log.textContent, '');
});
