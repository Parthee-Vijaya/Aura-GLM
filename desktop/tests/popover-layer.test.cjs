const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The one anchored popover layer (D2+D3 Commit A): every menu that needs to
// hang off an invoker — model picker, work-mode menu, the ⓘ info bubble, the
// help popover and the new hero menus — goes through this module. Anchoring
// reads the invoker's live getBoundingClientRect in CSS pixels, so an app-zoom
// step (profile font size => webContents zoomFactor) needs no compensation:
// the rects and the viewport live in the same space and Chromium fires
// `resize` when the factor changes (the Task-12 finding; settings-fontsize
// pins the same contract for viewport.js).
const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'popover-layer.js'), 'utf8');

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.id = ''; this.hidden = false; this.disabled = false; this.open = false;
    this.style = {}; this.listeners = {}; this.onclick = null; this._rect = null; this._document = null;
    this.offsetWidth = 0; this.offsetHeight = 0; this.textContent = '';
  }
  setAttribute(name, value) { this.style[`attr:${name}`] = String(value); }
  getAttribute(name) { const value = this.style[`attr:${name}`]; return value === undefined ? null : value; }
  removeAttribute(name) { delete this.style[`attr:${name}`]; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  focus() { if (this._document) this._document.activeElement = this; }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
  getBoundingClientRect() { return this._rect ? { ...this._rect } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
}

function harness({ viewport = { width: 1280, height: 800 } } = {}) {
  const document = { activeElement: null };
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el._document = document; el.id = id || ''; if (id) registry.set(id, el); return el; };
  document.createElement = tag => make(tag, '');
  document.body = make('body', 'body'); document.body.parentElement = null;
  // document-lyttere bærer capture-flaget som den rigtige DOM: en fjernelse
  // matcher KUN ved samme capture-værdi (pin for Fund 3's scroll-lækage).
  document.listeners = {};
  document.addEventListener = (name, handler, options) => { (document.listeners[name] ||= []).push({ handler, capture: Boolean(options && options.capture) }); };
  document.removeEventListener = (name, handler, options) => {
    const capture = Boolean(options && options.capture);
    document.listeners[name] = (document.listeners[name] || []).filter(listener => !(listener.handler === handler && listener.capture === capture));
  };
  const window = { document, innerWidth: viewport.width, innerHeight: viewport.height, listeners: {} };
  window.addEventListener = (name, handler) => { (window.listeners[name] ||= []).push(handler); };
  window.removeEventListener = (name, handler) => { window.listeners[name] = (window.listeners[name] || []).filter(item => item !== handler); };
  const context = { window, document, module: undefined };
  vm.runInNewContext(source, context);
  return { window, document, registry, layer: window.PopoverLayer, make };
}

const setRect = (el, left, top, width, height) => { el._rect = { left, top, right: left + width, bottom: top + height, width, height }; };

test('open() ankerer over invokeren venstrestillet med gap og margin-clamp', () => {
  const f = harness();
  const invoker = f.make('button', 'chip'); setRect(invoker, 300, 500, 120, 28);
  const layer = f.make('div', 'menu'); layer.offsetWidth = 340; layer.offsetHeight = 200;
  assert.equal(f.layer.open({ layer, invoker }), true);
  assert.equal(layer.open, true, 'laget vises gennem showPopover');
  assert.equal(layer.style.width, '340px');
  assert.equal(layer.style.left, '300px', 'venstrestillet ved invokerens venstre kant');
  assert.equal(layer.style.top, `${500 - 200 - 8}px`, 'over invokeren med 8 px gap');
});

test('højrestilling (model-picker) holder lagets højre kant ved chippen — ingen divideroverlap i nogen bredde', () => {
  const f = harness();
  // Chatpanelet kan være alt fra 420 px og opefter; divideren står til højre for
  // panelet. Align 'end' betyder: lagets højre kant == invokerens højre kant,
  // så laget rykker MED panelet og rører aldrig divideren.
  for (const chatRight of [420, 555, 720, 960, 1040]) {
    const invoker = f.make('button', `chip-${chatRight}`); setRect(invoker, chatRight - 140, 600, 120, 28);
    const layer = f.make('div', `menu-${chatRight}`); layer.offsetWidth = 340; layer.offsetHeight = 300;
    f.layer.open({ layer, invoker, align: 'end', width: 340 });
    const left = Number(layer.style.left.replace('px', ''));
    assert.ok(Math.abs(left + 340 - invoker.getBoundingClientRect().right) <= 1, `højre kant følger chippen ved ${chatRight}px`);
    assert.ok(left + 340 <= invoker.getBoundingClientRect().right + 1, `laget overskrider aldrig chippen — divideren er fri ved ${chatRight}px`);
  }
});

test('mellemstilling og nedenunder-præference (ⓘ-boblen) med flip opad', () => {
  const f = harness();
  const invoker = f.make('button', 'info'); setRect(invoker, 640, 600, 24, 24);
  const layer = f.make('div', 'bubble'); layer.offsetWidth = 320; layer.offsetHeight = 120;
  f.layer.open({ layer, invoker, align: 'center', place: 'below', gap: 8, margin: 16, width: 320 });
  const left = Number(layer.style.left.replace('px', ''));
  assert.ok(Math.abs(left + 160 - (640 + 12)) <= 1, 'centreret om invokeren');
  assert.equal(layer.style.top, `${600 + 24 + 8}px`, 'foretrækker nedenunder');
  // Ingen plads nedenunder: flip op over invokeren.
  setRect(invoker, 640, 760, 24, 24);
  const layer2 = f.make('div', 'bubble2'); layer2.offsetWidth = 320; layer2.offsetHeight = 120;
  f.layer.open({ layer: layer2, invoker, align: 'center', place: 'below', gap: 8, margin: 16, width: 320 });
  assert.equal(layer2.style.top, `${760 - 120 - 8}px`, 'flipper op når der ikke er plads nedenunder');
});

test('P1 · topLimit: laget over composeren dækker aldrig topbjælkens titel', () => {
  // Først den rene clamp: hverken over (topbjælken) eller under (viewPorten)
  // har plads — laget holdes på grænsen i stedet for at dække bjælken.
  const tight = harness({ viewport: { width: 1280, height: 280 } });
  const invokerTight = tight.make('textarea', 'prompt-tight'); setRect(invokerTight, 200, 100, 400, 36);
  const layerTight = tight.make('div', 'slash-tight'); layerTight.offsetWidth = 400; layerTight.offsetHeight = 140;
  tight.layer.open({ layer: layerTight, invoker: invokerTight, gap: 8, width: 400, topLimit: () => 56 });
  assert.equal(layerTight.style.top, '56px', 'laget står PÅ grænsen — aldrig over topbjælkens bund');

  const f = harness({ viewport: { width: 1280, height: 800 } });
  // Er der plads over feltet UDEN at røre bjælken, bruges rummet der.
  const invoker = f.make('textarea', 'prompt'); setRect(invoker, 200, 420, 400, 36);
  const layer2 = f.make('div', 'slash2'); layer2.offsetWidth = 400; layer2.offsetHeight = 140;
  f.layer.open({ layer: layer2, invoker, gap: 8, width: 400, topLimit: () => 56 });
  assert.equal(layer2.style.top, `${420 - 140 - 8}px`, 'rummet over feltet bruges, når bjælken er fri');
  // Uden topLimit gælder fortsat den gamle flip-logik (uændret grundadfærd):
  // ingen plads over feltet → laget folder ned i stedet.
  const layer3 = f.make('div', 'slash3'); layer3.offsetWidth = 400; layer3.offsetHeight = 140;
  setRect(invoker, 200, 120, 400, 36);
  f.layer.open({ layer: layer3, invoker, gap: 8, width: 400 });
  assert.equal(layer3.style.top, `${120 + 36 + 8}px`, 'uden topLimit folder laget ned som før');
});

test('ingen plads over: læggen falder nedenunder, og begge kanter clamper ind i visningsfladen', () => {
  const f = harness();
  const invoker = f.make('button', 'mode'); setRect(invoker, 4, 80, 120, 28);
  const layer = f.make('div', 'mode-menu'); layer.offsetWidth = 360; layer.offsetHeight = 420;
  f.layer.open({ layer, invoker, width: () => 360 });
  assert.equal(layer.style.top, `${80 + 28 + 8}px`, 'ingen plads over 80px: menuen lægges nedenunder');
  assert.equal(layer.style.left, '8px', 'venstre clamp holder laget inde ved marginen');
  // Højre side: invokeren tæt på kanten clamper laget ind fra højre.
  setRect(invoker, 1260, 500, 120, 28);
  f.layer.position();
  assert.equal(Number(layer.style.left.replace('px', '')) + 360, 1272, 'højre clamp: lagets højre kant ligger 8px fra kanten');
});

test('reposition ved resize/scroll/profilhændelser læser det LEVENDE rektangel (zoom-kontrakten)', () => {
  const f = harness();
  const invoker = f.make('button', 'chip'); setRect(invoker, 400, 600, 120, 28);
  const layer = f.make('div', 'menu'); layer.offsetWidth = 340; layer.offsetHeight = 200;
  f.layer.open({ layer, invoker, align: 'end', width: 340 });
  assert.equal(layer.style.left, `${520 - 340}px`);
  // Et zoomtrin (16/13) eller en vinduesændring ændrer invokerens rektangel;
  // Chromium fyrer resize, og laget genberegner fra det nye rektangel — ingen
  // cachede koordinater, ingen zoomfaktor-kompensation (CSS-pixel-rummet).
  setRect(invoker, 260, 380, 120, 28);
  f.window.innerWidth = 980;
  for (const handler of f.window.listeners['resize']) handler();
  assert.equal(layer.style.left, `${380 - 340}px`, 'resize genankorer fra det nye rektangel');
  assert.equal(layer.style.top, `${380 - 200 - 8}px`);
  // Scroll i en indre beholder (chat-indholdet) fanges i capture-fasen.
  setRect(invoker, 300, 420, 120, 28);
  for (const listener of f.document.listeners['scroll']) listener.handler({ target: f.registry.get('body') });
  assert.equal(layer.style.left, `${420 - 340}px`, 'scroll genankorer gennem capture-lytteren');
  // Profilhændelserne er sikkerhednet for zoomtrin, der ræser resize.
  setRect(invoker, 240, 360, 120, 28);
  for (const type of ['aura:profile', 'aura:profile-saved']) for (const handler of f.window.listeners[type] || []) handler({ detail: {} });
  assert.equal(layer.style.left, `${360 - 340}px`, 'profilhændelsen genankorer uden at lukke');
  assert.equal(layer.open, true);
});

test('Escape lukker og returnerer fokus til invokeren; lysafbrydning stjæler ikke fokus', () => {
  const f = harness();
  const invoker = f.make('button', 'help'); setRect(invoker, 100, 400, 28, 28);
  const layer = f.make('div', 'pop'); layer.offsetWidth = 300; layer.offsetHeight = 150;
  f.layer.open({ layer, invoker });
  // Fokus står inde i laget; Escape lukker og giver fokus tilbage.
  f.document.activeElement = layer;
  layer.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(layer.open, false, 'Escape lukker laget');
  assert.equal(f.document.activeElement, invoker, 'fokus vender tilbage til invokeren');
  // Genåbning virker efter lukning.
  f.layer.open({ layer, invoker });
  assert.equal(layer.open, true);
  // Lysafbrydning (klik udenfor): browseren skjuler, toggle rydder op uden at
  // stjæle fokus fra det element, brugeren nu står i.
  const elsewhere = f.make('textarea', 'prompt');
  f.document.activeElement = elsewhere;
  layer.hidePopover(); layer.emit('toggle', { newState: 'closed' });
  assert.equal(f.document.activeElement, elsewhere, 'fokus bliver, hvor brugeren er');
  // Efter oprydning fyre nye resize ikke længere på det lukkede lag.
  setRect(invoker, 500, 500, 28, 28); const before = layer.style.left;
  for (const handler of f.window.listeners['resize']) handler();
  assert.equal(layer.style.left, before, 'lytterne er væk efter lukning');
  assert.equal(f.window.listeners['resize'].length, 0, 'resize-lytteren er reel fjernet fra vinduet');
});

test('genåbning af samme lag udskifter lyttersættet uden lækage', () => {
  const f = harness();
  const invoker = f.make('button', 'info'); setRect(invoker, 300, 400, 24, 24);
  const layer = f.make('div', 'bubble'); layer.offsetWidth = 300; layer.offsetHeight = 100;
  f.layer.open({ layer, invoker, align: 'center', place: 'below' });
  f.layer.open({ layer, invoker, align: 'center', place: 'below' });
  assert.equal(layer.open, true);
  assert.equal(f.window.listeners['resize'].length, 1, 'én resize-lytter — ikke én pr. genåbning');
});

test('scroll-lytteren fjernes REELT ved lukning — capture-flaget skal matche (Fund 3)', () => {
  const f = harness();
  const invoker = f.make('button', 'chip'); setRect(invoker, 100, 400, 28, 28);
  const layer = f.make('div', 'menu'); layer.offsetWidth = 300; layer.offsetHeight = 140;
  f.layer.open({ layer, invoker });
  // Laget tilføjede scroll med capture:true — fjernelsen skal matche flaget.
  assert.equal(f.document.listeners['scroll'].length, 1, 'én scroll-lytter mens laget står åbent');
  assert.equal(f.document.listeners['scroll'][0].capture, true, 'scroll-lytteren er tilføjet i capture-fasen');
  f.layer.close();
  assert.equal(f.document.listeners['scroll'].length, 0, 'scroll-lytteren er reel fjernet fra document — ingen lækage pr. åbn/luk-cyklus');
  // Flere cykler akkumulerer intet, og genåbning opfører sig uændret.
  for (let cycle = 0; cycle < 3; cycle++) {
    f.layer.open({ layer, invoker });
    assert.equal(f.document.listeners['scroll'].length, 1, `cyklus ${cycle}: én lytter`);
    f.layer.close();
    assert.equal(f.document.listeners['scroll'].length, 0, `cyklus ${cycle}: ryddet igen`);
  }
  assert.equal(f.layer.open({ layer, invoker }), true, 'dobbelte åbninger er uændrede efter oprydningen');
  assert.equal(layer.open, true);
});

test('ét ankeret lag ad gangen: en ny åbning lukker den forrige', () => {
  const f = harness();
  const a = f.make('button', 'a'); setRect(a, 100, 300, 28, 28);
  const b = f.make('button', 'b'); setRect(b, 400, 300, 28, 28);
  const first = f.make('div', 'first'); first.offsetWidth = 300; first.offsetHeight = 120;
  const second = f.make('div', 'second'); second.offsetWidth = 300; second.offsetHeight = 120;
  f.layer.open({ layer: first, invoker: a });
  f.layer.open({ layer: second, invoker: b });
  assert.equal(first.open, false, 'den forrige lukkes');
  assert.equal(second.open, true, 'den nye står');
  assert.equal(second.style.left, '400px');
});

test('et lag uden rektangelunderstøttelse åbner ærligt med afvisning', () => {
  const f = harness();
  const layer = f.make('div', 'menu');
  assert.equal(f.layer.open({ layer, invoker: null }), false);
  assert.equal(layer.open, false, 'intet lag uden invoker');
  const invoker = f.make('button', 'chip'); setRect(invoker, 10, 10, 20, 20);
  assert.equal(f.layer.open({ layer: null, invoker }), false);
  // Close uden åbning er en no-op.
  f.layer.close();
  assert.equal(f.document.activeElement, null);
});

// S3-fix (UX 8a): når laget folder NED, ankre det ved options.belowOf's bund —
// composerkortets kant — i stedet for feltets bund, så popuppen aldrig ligger
// hen over kortets handlingsrække. Fundet live ved 700 px vindueshøjde:
// popuppen lagde sig fra y=330 ind i kortet (279–370).
test('S3-fix · belowOf: nedenunder-folden respekterer composerkortets bund', () => {
  const f = harness({ viewport: { width: 1440, height: 800 } });
  const prompt = f.make('textarea', 'prompt'); setRect(prompt, 240, 286, 387, 36);
  const card = f.make('div', 'composer'); setRect(card, 232, 279, 403, 91);
  const layer = f.make('div', 'slash-menu'); layer.offsetWidth = 387; layer.offsetHeight = 320;
  // Uden belowOf: feltets bund + gap (den gamle, overlappende adfærd er dokumenteret).
  f.layer.open({ layer, invoker: prompt, gap: 8, width: () => 387, topLimit: () => 58 });
  assert.equal(layer.style.top, `${286 + 36 + 8}px`, 'uden belowOf anker nedenunder-folden ved feltets bund');
  f.layer.close();
  // Med belowOf: kortets bund + gap — composerens handlingsrække forbliver fri.
  const layer2 = f.make('div', 'slash-menu2'); layer2.offsetWidth = 387; layer2.offsetHeight = 320;
  f.layer.open({ layer: layer2, invoker: prompt, gap: 8, width: () => 387, topLimit: () => 58, belowOf: () => card });
  assert.equal(layer2.style.top, `${279 + 91 + 8}px`, 'nedenunder-folden ryger under composerkortet');
  assert.ok(Number(layer2.style.top.replace('px', '')) >= card.getBoundingClientRect().bottom, 'kortets bund er aldrig dækket');
  // Er der plads OVER feltet, bruges rummet der som før — belowOf rører kun folden nedad.
  setRect(prompt, 240, 500, 387, 36);
  f.layer.position();
  assert.equal(layer2.style.top, `${500 - 320 - 8}px`, 'oven-ankeringen er uændret');
});

test('S3-fix · belowOf: passer laget ikke nedenunder, begrænses højden i stedet for at dække composeren', () => {
  // Den målte 700 px-sag: 315 px lag, 222 px over feltet, 314 px under kortet —
  // klampen giver laget præcis pladsen under kortet i stedet for fallbacken
  // hen over arbejdsfladen og composeren.
  const f = harness({ viewport: { width: 1440, height: 700 } });
  const prompt = f.make('textarea', 'prompt'); setRect(prompt, 240, 286, 387, 36);
  const card = f.make('div', 'composer'); setRect(card, 232, 279, 403, 91);
  const layer = f.make('div', 'slash-menu'); layer.offsetWidth = 387; layer.offsetHeight = 315;
  f.layer.open({ layer, invoker: prompt, gap: 8, width: () => 387, topLimit: () => 56, belowOf: () => card });
  assert.equal(layer.style.top, `${279 + 91 + 8}px`, 'laget folder ned under kortet');
  assert.equal(layer.style.maxHeight, `${700 - 8 - (279 + 91 + 8)}px`, 'højden er klammet til pladsen under kortet');
  assert.ok(Number(layer.style.top.replace('px', '')) + 315 > 700 - 8, 'uden klamp ville laget have raget ud over vinduets margin');
  // Større vindue: klampen ryger igen, og laget får sin fulde højde.
  f.window.innerHeight = 800;
  f.layer.position();
  assert.equal(layer.style.maxHeight, '', 'klampen nulstilles, når der er plads');
  assert.equal(layer.style.top, `${279 + 91 + 8}px`, 'nedenunder-ankeringen består');
});

// ── S4: /stil-kataloget i popuppen gennem det ENE popover-lag ──
// Katalogniveauet er en ny flade i den eksisterende S2-popup, så den følger den
// samme ankerede grammatik: popover-laget rydder ALTID sin egen inline
// maxHeight (place() linje 1), og stilrækkerne bor derfor i en indre beholder,
// hvis højde kommer fra CSS-klassen — aldrig fra inline-stile. Otte faste
// rækker består altså gennem rydningen, og overflow-rækken er ikke valgbar.

const slashSource = fs.readFileSync(path.join(__dirname, '..', 'ui', 'slash-commands.js'), 'utf8');
const stylesCss = fs.readFileSync(path.join(__dirname, '..', 'ui', 'styles.css'), 'utf8');

class SlashEl {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = ''; this.type = '';
    this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.listeners = {}; this.onclick = null;
    this._document = null; this._rect = null; this.offsetWidth = 0; this.offsetHeight = 0; this.style = {};
  }
  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  get classList() { const el = this; return { add: (...names) => names.forEach(name => el._classes.add(name)), remove: (...names) => names.forEach(name => el._classes.delete(name)), toggle: (name, force) => { const on = force === undefined ? !el._classes.has(name) : Boolean(force); if (on) el._classes.add(name); else el._classes.delete(name); return on; }, contains: name => el._classes.has(name) }; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[name.slice(5)] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { if (typeof child === 'string') this._text += child; else { child.parentElement = this; this.children.push(child); } } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
  dispatchEvent(event) { return this.emit(event.type, event); }
  focus() { if (this._document) this._document.activeElement = this; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  closest() { return null; }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  scrollIntoView() {}
  getBoundingClientRect() { return this._rect ? { ...this._rect } : { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

function slashHarness({ viewport = { width: 1280, height: 800 } } = {}) {
  const document = { activeElement: null };
  const registry = new Map();
  document.createElement = tag => { const el = new SlashEl(tag); el._document = document; return el; };
  document.getElementById = id => registry.get(id) || null;
  document.body = new SlashEl('body');
  document.listeners = {};
  document.addEventListener = (name, handler, options) => { (document.listeners[name] ||= []).push({ handler, capture: Boolean(options && options.capture) }); };
  document.removeEventListener = (name, handler, options) => {
    const capture = Boolean(options && options.capture);
    document.listeners[name] = (document.listeners[name] || []).filter(listener => !(listener.handler === handler && listener.capture === capture));
  };
  document.querySelector = () => null;
  const window = { document, innerWidth: viewport.width, innerHeight: viewport.height, listeners: {} };
  window.addEventListener = (name, handler) => { (window.listeners[name] ||= []).push(handler); };
  window.removeEventListener = (name, handler) => { window.listeners[name] = (window.listeners[name] || []).filter(item => item !== handler); };
  const context = { window, document, module: undefined };
  vm.createContext(context);
  vm.runInContext(source, context);        // popover-layer.js først: den sætter window.PopoverLayer
  vm.runInContext(slashSource, context);    // slash-commands.js ser det ENE lag i vinduet
  const make = (tag, id) => { const el = new SlashEl(tag); el._document = document; el.id = id || ''; if (id) registry.set(id, el); return el; };
  const prompt = make('textarea', 'prompt');
  const layer = make('div', 'slash-menu');
  layer.setAttribute('role', 'listbox');
  const many = Array.from({ length: 20 }, (_unused, index) => ({ slug: `stil-${index}`, name: `Stil ${index}`, category: 'Kategori', theme: index % 2 ? 'light' : 'dark' }));
  context.window.SlashCommands.init({ prompt, layer, skills: async () => [], styles: async () => ({ status: 'ok', cached: false, stale: false, entries: many }) });
  return { window, document, registry, make, prompt, layer, api: context.window.SlashCommands, popover: context.window.PopoverLayer };
}

test('S4: katalogniveauet holder 8 faste rækker gennem popover-lagets maxHeight-rydning', async () => {
  const f = slashHarness({ viewport: { width: 1280, height: 460 } });
  const setRect = (el, left, top, width, height) => { el._rect = { left, top, right: left + width, bottom: top + height, width, height }; };
  setRect(f.prompt, 200, 300, 400, 36);
  f.prompt.value = '/stil '; f.prompt.selectionStart = 6; f.prompt.emit('input');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.api.open(), true, 'popuppen står åben gennem det ene popover-lag');
  assert.equal(f.layer.open, true);
  // Beholderen med stilrækkerne er en indre div drevet af CSS — ingen inline-højde.
  const container = f.layer.children.find(el => el.classList.contains('slash-styles'));
  assert.ok(container, 'stilrækkerne bor i den indre .slash-styles-beholder');
  assert.equal(container.children.length, 8, 'præcis 8 rækker i listen');
  assert.deepEqual(Object.keys(container.style), [], 'beholderen har ingen inline-stile — højden kommer fra CSS-klassen');
  // Fold laget ned med klamp (place() sætter lagets EGEN maxHeight) og ryd den igen:
  // de 8 rækker består, fordi beholderens højde aldrig var inline.
  f.layer.offsetHeight = 320;
  setRect(f.prompt, 200, 80, 400, 36);
  f.window.innerHeight = 400;
  for (const handler of f.window.listeners['resize']) handler();
  assert.match(f.layer.style.maxHeight, /^\d+px$/, 'klampen sætter lagets egen maxHeight ved folden ned');
  assert.equal(f.layer.children.find(el => el.classList.contains('slash-styles')).children.length, 8, 'de otte rækker består under klampen');
  f.window.innerHeight = 800;
  for (const handler of f.window.listeners['resize']) handler();
  assert.equal(f.layer.style.maxHeight, '', 'place() rydder lagets maxHeight igen');
  assert.equal(f.layer.children.find(el => el.classList.contains('slash-styles')).children.length, 8, 'de otte rækker består gennem rydningen');
  // CSS-pinnen: højdelen bor i styles.css, ikke i JavaScript.
  assert.match(stylesCss.replace(/\/\*[\s\S]*?\*\//g, ''), /\.slash-styles\s*\{[^}]*max-block-size:\s*calc\(8\s*\*\s*var\(--slash-style-row-height,\s*36px\)\)/, 'højden til 8 rækker er CSS-ejet');
  assert.match(stylesCss.replace(/\/\*[\s\S]*?\*\//g, ''), /--slash-style-row-height:\s*36px/, 'den faste rækkehøjde matcher S2-rækkerne');
});

test('S4: overflow-rækken «… N flere» står uden for listen og kan ikke vælges', async () => {
  const f = slashHarness();
  const setRect = (el, left, top, width, height) => { el._rect = { left, top, right: left + width, bottom: top + height, width, height }; };
  setRect(f.prompt, 200, 500, 400, 36);
  f.prompt.value = '/stil '; f.prompt.selectionStart = 6; f.prompt.emit('input');
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  const container = f.layer.children.find(el => el.classList.contains('slash-styles'));
  const overflow = f.layer.children.find(el => el.classList.contains('slash-more'));
  assert.ok(overflow, 'overflow-rækken står som sin egen række efter listen');
  assert.equal(overflow.getAttribute('role'), 'presentation', 'den er ikke en valgbar option');
  assert.match(overflow.textContent, /12 flere\. Skriv for at filtrere\./, '20 stiler − 8 rækker tælles ærligt op');
  assert.equal(container.children.includes(overflow), false, 'den står uden for den rullende liste');
  // Pil-navigation går aldrig ned i overflow-rækken: markeringen stopper ved de 8 stiler.
  for (let step = 0; step < 10; step++) f.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
  const marked = container.children.filter(button => button.getAttribute('aria-selected') === 'true');
  assert.equal(marked.length, 1, 'markeringen står på en stilrække');
  assert.ok(container.children.includes(marked[0]), 'markeringen er inden for de 8 rækker — aldrig overflow-rækken');
  assert.equal(overflow.getAttribute('aria-selected'), null, 'overflow-rækken kan ikke være markeret');
  // Enter vælger en stil — aldrig overflow-rækken.
  f.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.match(f.prompt.value, /^\/stil stil-\d+ $/, 'Enter indsætter en slug — overflow-rækken er ikke valgbar');
});
