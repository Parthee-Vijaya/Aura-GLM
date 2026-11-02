const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// The on-demand help at level 'delvis': a quiet "?" button by the composer
// opens the current surface's standing hints in a popover. The module is a
// renderer script, so it runs in a synthetic DOM the same way profile-chip and
// workspace-calm behaviour is exercised. The hints have one source — the live
// index.html elements — so the popover can never drift from the real copy.
const ui = path.join(__dirname, '..', 'ui');
const source = fs.readFileSync(path.join(ui, 'composer-help.js'), 'utf8');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = ''; this.type = '';
    this.listeners = {}; this.onclick = null; this._document = null;
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
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get firstElementChild() { return this.children[0] || null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) { child.parentElement = this; this.children.unshift(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  remove() { const parent = this.parentElement; if (parent) parent.children.splice(parent.children.indexOf(this), 1); }
  cloneNode() {
    const copy = new El(this.tagName);
    copy.id = this.id; copy.hidden = this.hidden; copy.open = this.open; copy.className = this.className;
    copy._text = this._text;
    for (const child of this.children) copy.append(child.cloneNode());
    return copy;
  }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
  focus() { if (this._document) this._document.activeElement = this; }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
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
  return true;
}
function descendants(el) { return el.children.flatMap(child => [child, ...descendants(child)]); }
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

const SHORTCUT = 'Enter sender · Shift+Enter giver en ny linje';
const RESUME_HINT = 'Kan indeholde tidligere delte referencer. Indholdet vises før afsendelse.';
const IDEA_HINT = 'Valgene kommer i projektbriefen under Plan. Du kan rette dem der.';
const TECH_HINT = 'Ønsker til planen, ikke installationer.';
// Objects from the vm context belong to another realm; a JSON round trip
// makes deepEqual a comparison of values.
const plain = value => JSON.parse(JSON.stringify(value));

// The composer surface from index.html: the shortcut line, the resume notice
// with its hint, and the project intro's idea options with two designated
// hints (one inside a nested, closed details). The essential surfaces can be
// attached for the 'ingen' pass.
function makeDom({ hints = true, essential = false } = {}) {
  const document = { activeElement: null };
  document.createElement = tag => { const el = new El(tag); el._document = document; return el; };
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el._document = document; el.id = id || ''; if (id) registry.set(id, el); return el; };
  document.getElementById = id => registry.get(id) || null;
  const body = make('body');
  document.body = body;
  const form = make('form', 'chat-form'); body.append(form);
  if (hints) {
    const shortcut = make('p', 'composer-shortcut'); shortcut.textContent = SHORTCUT; form.append(shortcut);
    // The resume notice starts closed (app.js), but at 'delvis' the popover is
    // the hint's only home, so the open state does not gate membership.
    const resume = make('details', 'resume-notice'); resume.open = false;
    const resumeHint = make('p'); resumeHint.className = 'hint'; resumeHint.textContent = RESUME_HINT;
    resume.append(resumeHint); form.append(resume);
    const intro = make('div', 'project-intro');
    const options = make('details', 'idea-options'); options.open = true;
    const optionsHint = make('p'); optionsHint.className = 'hint'; optionsHint.textContent = IDEA_HINT;
    const tech = make('details'); tech.open = false;
    const techHint = make('p'); techHint.className = 'hint'; techHint.textContent = TECH_HINT;
    const info = make('button'); info.className = 'info'; info.textContent = 'i';
    techHint.append(info); tech.append(techHint); options.append(optionsHint, tech); intro.append(options); form.append(intro);
  }
  const wrap = make('div'); wrap.className = 'composer-help-wrap';
  const button = make('button', 'composer-help'); button.hidden = true; button.textContent = '?';
  button.setAttribute('aria-label', 'Vis hjælp'); button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'composer-help-popover');
  const popover = make('div', 'composer-help-popover'); popover.setAttribute('tabindex', '-1');
  const title = make('p'); title.className = 'composer-help-title'; title.textContent = 'Hjælp i samtalen';
  const list = make('ul', 'composer-help-list');
  popover.append(title, list); wrap.append(button, popover); form.append(wrap);
  const essentials = [];
  if (essential) for (const id of ['connection-warning', 'approvals', 'data-dialog', 'startup-warning', 'hosting-consent']) {
    const el = make('div', id); el.setAttribute('data-help', 'essential'); body.append(el); essentials.push(el);
  }
  return { document, registry, body, form, button, popover, list, essentials };
}

// The module runs with window as its scope, like the browser loads it.
function runModule(dom) {
  const window = { document: dom.document };
  window.addEventListener = (name, handler) => { (window.listeners ||= {}); (window.listeners[name] ||= []).push(handler); };
  const context = { window, document: dom.document, module: undefined };
  vm.runInNewContext(source, context);
  return { api: window.composerHelp, window };
}

test('hints() samler fladens udpegede hinttekster fra de levende elementer', () => {
  const dom = makeDom();
  const { api } = runModule(dom);
  assert.deepEqual(plain(api.hints()), [SHORTCUT, RESUME_HINT, IDEA_HINT, TECH_HINT], 'alle fire udpegede hinttekster på samtalefladen — uden den lille "i"-knap');
  // En skjult resume-bemærkning er ikke på fladen — dens hint følger ikke med.
  dom.registry.get('resume-notice').hidden = true;
  assert.deepEqual(plain(api.hints()), [SHORTCUT, IDEA_HINT, TECH_HINT], 'det skjulte resume-hint er væk fra popovern');
  dom.registry.get('resume-notice').hidden = false;
  assert.deepEqual(plain(api.hints()), [SHORTCUT, RESUME_HINT, IDEA_HINT, TECH_HINT]);
});

test('en flade uden hint skjuler knappen ærligt — hidden, ikke disabled', () => {
  const empty = makeDom({ hints: false });
  const { api, window } = runModule(empty);
  assert.deepEqual(plain(api.hints()), [], 'uden mål er listen tom');
  assert.equal(empty.button.hidden, true, 'knappen er helt væk fra fladen');
  assert.equal(empty.button.disabled, false, 'knappen er ikke disabled — der er intet at klikke på');
  // Profilen genberegner: Når hintene kommer tilbage, står knappen frem igen.
  const shortcut = new El('p'); shortcut.id = 'composer-shortcut'; shortcut.textContent = SHORTCUT;
  shortcut._document = empty.document; empty.registry.set('composer-shortcut', shortcut); empty.form.prepend(shortcut);
  for (const handler of window.listeners['aura:profile']) handler({ detail: { helpLevel: 'delvis' } });
  assert.equal(empty.button.hidden, false, 'aura:profile genberegner knappens grundlag');
  assert.equal(empty.button.getAttribute('aria-hidden'), null, 'hidden-attributtet er den ærlige mekanisme — ikke aria-hidden oven på en synlig knap');
});

test('åbning: klikket viser popoverens tekster, sætter aria-expanded og flytter fokus ind', () => {
  const dom = makeDom();
  const { api } = runModule(dom);
  dom.button.emit('click');
  assert.equal(dom.popover.open, true, 'popoveren er åben');
  assert.equal(dom.button.getAttribute('aria-expanded'), 'true');
  assert.deepEqual(dom.list.children.map(item => item.textContent), [SHORTCUT, RESUME_HINT, IDEA_HINT, TECH_HINT], 'popoverens liste er fladens hint');
  assert.equal(dom.document.activeElement, dom.popover, 'fokus flyttes ind i popoveren');
  // En flade uden hint åbner aldrig en tom popover.
  const empty = makeDom({ hints: false });
  const emptyModule = runModule(empty);
  assert.equal(emptyModule.api.open(), false, 'åbningen afvises uden grundlag');
  assert.equal(empty.popover.open, false);
});

test('Escape lukker popoveren og returnerer fokus til knappen', () => {
  const dom = makeDom();
  const { api } = runModule(dom);
  api.open();
  dom.popover.emit('keydown', { key: 'Escape', preventDefault() {} });
  assert.equal(dom.popover.open, false, 'popoveren er lukket');
  assert.equal(dom.button.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.document.activeElement, dom.button, 'fokus er tilbage på "?"-knappen');
});

test('et nyt klik på knappen lukker popoveren igen', () => {
  const dom = makeDom();
  const { api } = runModule(dom);
  dom.button.emit('click');
  assert.equal(dom.popover.open, true);
  dom.button.emit('click');
  assert.equal(dom.popover.open, false, 'knappen skifter ærligt');
  assert.equal(dom.button.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.document.activeElement, dom.button);
});

test('lysafbrydning holder aria-expanded ærlig', () => {
  const dom = makeDom();
  const { api } = runModule(dom);
  api.open();
  // Native light dismiss (a click outside) closes the popover itself: the
  // browser hides it, and the toggle event synchronizes aria-expanded, so the
  // button never lies about the state.
  dom.popover.hidePopover();
  dom.popover.emit('toggle', { newState: 'closed' });
  assert.equal(dom.button.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.popover.open, false);
});

test('ved ingen hjælp sættes help-ingen — og essential-fladerne røres ikke', async () => {
  const dom = makeDom({ hints: true, essential: true });
  const { api } = runModule(dom);
  const context = { document: dom.document, profileState: { helpLevel: 'ingen', appearance: { theme: 'system' } }, window: { calmWorkspace: { setTheme: () => {} } } };
  const start = app.indexOf('async function applyProfilePresentation');
  const end = app.indexOf('// The profile is adopted', start);
  assert.ok(start >= 0 && end > start, 'app.js har applyProfilePresentation');
  vm.runInNewContext(app.slice(start, end), context);
  await context.applyProfilePresentation();
  assert.equal(dom.body.classList.contains('help-ingen'), true, 'ingen-klassen sættes fra profilen');
  assert.equal(dom.body.classList.contains('help-delvis'), false);
  // De essential-flader — advarsler, godkendelser, "Før du sender", samtykke —
  // hverken skjules eller mister deres markering ved noget niveau.
  for (const el of dom.essentials) {
    assert.equal(el.hidden, false, `${el.id} står uændret på skærmen`);
    assert.equal(el.getAttribute('data-help'), 'essential', `${el.id} bevarer sin essential-markering`);
    assert.ok(!api.hints().some(text => text.includes(el.id)), `${el.id} er ikke blandt hintmålene`);
  }
  // Knappens hidden handler kun den tomme flade; niveauerne er CSS sag.
  assert.equal(dom.button.hidden, false, 'knappen har stadig sit grundlag — help-ingen skjuler den i CSS');
});

test('index.html: knappen og popoveren står ved skrivefeltet med ærlig aria', () => {
  assert.match(index, /id="composer-help"/);
  assert.match(index, /aria-label="Vis hjælp"/, 'knappens navn er det danske "Vis hjælp"');
  assert.match(index, /id="composer-help"[^>]*aria-expanded="false"/, 'aria-expanded starter lukket');
  assert.match(index, /aria-controls="composer-help-popover"/);
  assert.match(index, /id="composer-help-popover"[^>]*popover/, 'popoveren er en ægte popover');
  assert.match(index, /id="composer-help-popover"[^>]*tabindex="-1"/, 'fokus kan flyttes ind i popoveren');
  assert.match(index, /id="composer-help-list"/);
  assert.ok(index.includes('Hjælp i samtalen'), 'popoverens titel er dansk');
  assert.match(index, /src="composer-help\.js"/, 'modulet læses ind af siden');
  assert.ok(index.includes('id="composer-shortcut"') && index.includes('id="resume-notice"') && index.includes('id="idea-options"'), 'hintmålene består i teksten');
});
