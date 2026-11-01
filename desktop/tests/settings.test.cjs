// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Settings = require('../ui/settings.js');

// Settings dialog skeleton: settings.js owns the dialog and the section route;
// app.js owns the popover wiring and the four established dialogs' open functions.
// Behavior is exercised in a synthetic DOM the same way profile-step.test.cjs and
// connection-removal.test.cjs run renderer slices; index.html and app.js slices
// are pinned with structural assertions.
const ui = path.join(__dirname, '..', 'ui');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const { FILES } = require('../core/ui-assets.cjs');

class El {
  constructor(tag, document) {
    this.tagName = String(tag).toUpperCase(); this.document = document;
    this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = '';
    this.listeners = {}; this.onclick = null; this.onchange = null;
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
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); if (name.startsWith('data-')) delete this.dataset[dataKey(name.slice(5))]; }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) { child.parentElement = this; this.children.unshift(child); } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
  focus() { this.document.activeElement = this; }
  showModal() { this.open = true; }
  close() { if (!this.open) return; this.open = false; this.emit('close'); }
  click() { if (this.disabled) return; if (typeof this.onclick === 'function') this.onclick(); this.emit('click'); }
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
const POPOVER_BUTTON = { profile: 'settings-profile-button', appearance: 'settings-appearance-button', connections: 'connections-button', features: 'features-button', updates: 'updates-button', support: 'support-button' };
function makeDom() {
  const document = { activeElement: null };
  document.listeners = {};
  document.addEventListener = (name, handler) => { (document.listeners[name] ||= []).push(handler); };
  document.createElement = tag => new El(tag, document);
  document.body = new El('body', document);
  document.querySelectorAll = selector => selectWithin(document.body, selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  const registry = new Map();
  document.getElementById = id => registry.get(id) || null;
  const make = (tag, id) => { const el = new El(tag, document); if (id) { el.id = id; registry.set(id, el); } return el; };
  document.body.append(make('button', 'settings-toggle'));
  const menu = make('div', 'settings-menu');
  for (const section of Settings.SECTIONS) {
    const button = make('button', POPOVER_BUTTON[section.id]);
    button.textContent = section.label;
    menu.append(button);
  }
  document.body.append(menu);
  const dialog = make('dialog', 'settings-dialog');
  const heading = new El('div', document); heading.className = 'dialog-heading';
  const title = make('h2', 'settings-title'); title.textContent = 'Indstillinger';
  const close = new El('button', document); close.setAttribute('data-close', 'settings-dialog'); close.textContent = 'Luk';
  heading.append(title, close);
  const layout = new El('div', document); layout.className = 'settings-layout';
  const nav = new El('nav', document); nav.className = 'settings-nav';
  for (const section of Settings.SECTIONS) {
    const button = new El('button', document);
    button.setAttribute('data-settings-section', section.id);
    button.textContent = section.label;
    nav.append(button);
  }
  const content = make('div', 'settings-content');
  layout.append(nav, content);
  dialog.append(heading, layout);
  document.body.append(dialog);
  for (const id of ['connections-dialog', 'features-dialog', 'updates-dialog', 'support-dialog']) document.body.append(make('dialog', id));
  return { document, registry, dialog, content, nav };
}
const navButton = (dom, section) => dom.nav.querySelectorAll(`[data-settings-section="${section}"]`)[0];
const sectionOf = id => Settings.SECTIONS.find(section => section.id === id);

test('seks sektioner i fast rækkefølge med navne og ærlige beskrivelser', () => {
  assert.deepEqual(Settings.SECTIONS.map(section => section.id), ['profile', 'appearance', 'connections', 'features', 'updates', 'support']);
  for (const section of Settings.SECTIONS) {
    assert.ok(section.label.length >= 3, `${section.id} har et navn`);
    assert.ok(section.description.length >= 10, `${section.id} har en beskrivelse`);
  }
  for (const id of ['profile', 'appearance']) {
    const description = sectionOf(id).description;
    assert.ok(description.length >= 30, `${id} beskriver, hvad sektionen kommer til at indeholde`);
    assert.doesNotMatch(description, /snart|næste trin|placeholder|todo/i, `${id} er ikke en "kommer snart"-pladsholder`);
  }
});

test('open(profile) viser dialogen med sektionen aktiv og beskriver indholdet', () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  const profile = navButton(dom, 'profile');
  settings.open('profile');
  assert.equal(dom.dialog.open, true);
  assert.equal(profile.getAttribute('aria-current'), 'true');
  assert.equal(navButton(dom, 'appearance').getAttribute('aria-current'), null);
  assert.equal(dom.content.textContent, `Din profil${sectionOf('profile').description}`);
  assert.equal(dom.content.children[0].id, 'settings-section-title');
  assert.equal(dom.content.getAttribute('aria-labelledby'), 'settings-section-title');
  assert.equal(dom.document.activeElement, profile, 'fokus lægges på sektionens nav-knap');
});

test('sektionsskift flytter aria-current, indhold og fokus', async () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  await settings.open('profile');
  await settings.open('appearance');
  assert.equal(dom.dialog.open, true);
  assert.equal(navButton(dom, 'appearance').getAttribute('aria-current'), 'true');
  assert.equal(navButton(dom, 'profile').getAttribute('aria-current'), null);
  assert.equal(dom.content.textContent, `Udseende${sectionOf('appearance').description}`);
  navButton(dom, 'profile').click();
  assert.equal(navButton(dom, 'profile').getAttribute('aria-current'), 'true');
  assert.equal(dom.content.textContent.includes('Din profil'), true);
});

test('open(connections) lukker settings-dialogen først — aldrig dialog i dialog', async () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  const connections = dom.registry.get('connections-dialog');
  const order = [];
  settings.register({ connections: () => { order.push(dom.dialog.open); connections.showModal(); } });
  await settings.open('profile');
  await settings.open('connections');
  assert.deepEqual(order, [false], 'den etablerede åbner kører først, når settings-dialogen er lukket');
  assert.equal(dom.dialog.open, false);
  assert.equal(connections.open, true);
  // Fra popoveren er settings-dialogen lukket i forvejen; åbneren kaldes uændret.
  connections.close();
  await settings.open('connections');
  assert.equal(connections.open, true);
});

test('open(features) lukker settings-dialogen og åbner #features-dialog gennem app.js', async () => {
  const dom = makeDom();
  const settings = Settings.create({ document: dom.document });
  const context = {
    $: selector => {
      const found = dom.document.querySelector(selector);
      if (found || !/^#[A-Za-z0-9_-]+$/.test(selector)) return found;
      const el = new El('div', dom.document); el.id = selector.slice(1); dom.registry.set(el.id, el);
      return el;
    },
    action: fn => fn(),
    selectedOwner: () => null, navigationRequest: 7, call: async () => ({ exceptions: {} }),
    current: null, state: {}, featureScope: 'alle', featuresOwner: null, renderFeatures: () => {},
    window: { SettingsDialog: settings }
  };
  const start = app.indexOf('function openFeaturesSection');
  assert.ok(start >= 0, 'app.js har openFeaturesSection');
  vm.runInNewContext(app.slice(start, app.indexOf("for (const radio of document.querySelectorAll('[name=\"features-scope\"]'))", start)), context);
  settings.register({ features: context.openFeaturesSection });
  await settings.open('profile');
  await settings.open('features');
  assert.equal(dom.dialog.open, false, 'settings-dialogen er lukket');
  assert.equal(dom.registry.get('features-dialog').open, true, '#features-dialog[open] gælder');
});

test('ukendte sektioner og ugyldige registreringer åbner intet', async () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  settings.register({ unknown: () => { throw Error('skal aldrig kaldes'); }, connections: 'ikke en funktion' });
  assert.equal(await settings.open('nope'), false);
  assert.equal(await settings.open(''), false);
  assert.equal(dom.dialog.open, false);
  await settings.open('profile');
  assert.equal(await settings.open('nope'), false);
  assert.equal(dom.dialog.open, true, 'en ukendt sektion forstyrrer ikke den åbne dialog');
});

test('uden registreret åbner viser dialogen sektionens beskrivelse i stedet for ingenting', async () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  await settings.open('support');
  assert.equal(dom.dialog.open, true);
  assert.equal(navButton(dom, 'support').getAttribute('aria-current'), 'true');
  assert.equal(dom.content.textContent, `Hjælp og feedback${sectionOf('support').description}`);
});

test('Escape og Luk lukker dialogen, og fokus går tilbage til Indstillinger-knappen', () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  settings.open('profile');
  dom.dialog.close();
  assert.equal(dom.dialog.open, false);
  assert.equal(dom.document.activeElement, dom.registry.get('settings-toggle'));
});

test('fokus stjæles ikke fra en dialog, der er åbnet i stedet', () => {
  const dom = makeDom(), settings = Settings.create({ document: dom.document });
  const connections = dom.registry.get('connections-dialog');
  settings.register({ connections: () => connections.showModal() });
  settings.open('profile');
  connections.showModal();
  dom.dialog.close();
  assert.equal(dom.document.activeElement, navButton(dom, 'profile'), 'settings-dialogen rører ikke fokus, mens en anden dialog er åben');
});

test('app.js binder popoverens seks punkter til openSettings og registrerer de etablerede åbnerfunktioner', () => {
  const dom = makeDom();
  const opened = [], registered = [];
  const opener = { connections: () => {}, features: () => {}, support: () => {} };
  const updatesOpen = () => {};
  const context = {
    $: selector => dom.document.querySelector(selector), document: dom.document,
    window: { SettingsDialog: { open: section => opened.push(section), register: map => registered.push(map) } },
    openConnectionsSection: opener.connections, openFeaturesSection: opener.features, openSupportSection: opener.support
  };
  const start = app.indexOf('function openSettings(section)');
  assert.ok(start >= 0, 'app.js har openSettings');
  const end = app.indexOf('// Udgiv forbinder komplai Run', start);
  assert.ok(end > start, 'popover-blokken slutter før komplai-lytteren');
  vm.runInNewContext(app.slice(start, end), context);
  assert.deepEqual(Object.keys(registered[0]), ['connections', 'features', 'support']);
  assert.equal(registered[0].connections, opener.connections);
  assert.equal(registered[0].features, opener.features);
  assert.equal(registered[0].support, opener.support);
  // updates.js binder #updates-button efter app.js; DOMContentLoaded adopterer bindingen
  // som sektionens åbner og viderestiller knappen til openSettings — alt sker, før
  // brugeren kan klikke, ligesom i browseren.
  dom.registry.get('updates-button').onclick = updatesOpen;
  for (const handler of dom.document.listeners['DOMContentLoaded'] || []) handler();
  assert.equal(registered[1].updates, updatesOpen, 'updates.js' + ' åbningsfunktion genbruges som åbner');
  for (const section of Settings.SECTIONS) {
    dom.registry.get(POPOVER_BUTTON[section.id]).click();
  }
  assert.deepEqual(opened, Settings.SECTIONS.map(section => section.id));
});

test('app.js lukker settings-dialogen gennem det fælles data-close og giver fokus tilbage', () => {
  const dom = makeDom();
  Settings.create({ document: dom.document }).open('profile');
  const context = { document: dom.document };
  const start = app.indexOf("for (const button of document.querySelectorAll('[data-close]'))");
  assert.ok(start >= 0, 'data-close-bindingen findes stadig i app.js');
  vm.runInNewContext(app.slice(start, app.indexOf('// Kun ren information', start)), context);
  const close = dom.dialog.querySelectorAll('[data-close]')[0];
  close.click();
  assert.equal(dom.dialog.open, false);
  assert.equal(dom.document.activeElement, dom.registry.get('settings-toggle'));
});

test('app.js: .open-vagten for forbindelsesdialogen består uændret', () => {
  assert.ok(app.includes("$('#connections-dialog').open &&"), 'vagten, der binder asynkrone svar til den åbne dialog, er bevaret');
});

test('index.html: settings-dialogen har seks nav-punkter, ikoner, indholdspanel og Luk', () => {
  const start = index.indexOf('<dialog id="settings-dialog"');
  assert.ok(start >= 0, 'settings-dialogen findes');
  const markup = index.slice(start, index.indexOf('</dialog>', start));
  assert.match(markup, /aria-labelledby="settings-title"/);
  assert.ok(markup.includes('data-close="settings-dialog"'), 'Luk-knappen bruger det fælles data-close');
  assert.ok(!markup.slice(1).includes('<dialog'), 'ingen dialog ligger i settings-dialogen');
  assert.ok(markup.includes('id="settings-content"'));
  const buttons = [...markup.matchAll(/<button type="button" data-settings-section="([a-z]+)">([\s\S]*?)<\/button>/g)];
  assert.deepEqual(buttons.map(match => match[1]), Settings.SECTIONS.map(section => section.id));
  for (const [, id, inner] of buttons) {
    assert.ok(inner.includes('<svg'), `${id} har et ikon`);
    assert.equal(inner.replace(/<[^>]+>/g, '').trim(), sectionOf(id).label, `${id} har sektionens navn`);
  }
});

test('index.html: popoveren har seks punkter med de bevarede id\'er og ikoner', () => {
  const menuStart = index.indexOf('<div id="settings-menu"');
  assert.ok(menuStart >= 0);
  const menu = index.slice(menuStart, index.indexOf('</div>', menuStart));
  const buttons = [...menu.matchAll(/<button id="([a-z-]+)">([\s\S]*?)<\/button>/g)];
  assert.deepEqual(buttons.map(match => match[1]), Settings.SECTIONS.map(section => POPOVER_BUTTON[section.id]));
  for (const [, id, inner] of buttons) {
    assert.ok(inner.includes('<svg'), `${id} har et ikon i popoverens stil`);
    assert.equal(inner.replace(/<[^>]+>/g, '').trim(), sectionOf(Object.entries(POPOVER_BUTTON).find(([, button]) => button === id)[0]).label);
  }
});

test('index.html: de fire etablerede dialoger består uændrede med deres egne luk-knapper', () => {
  for (const [id, close] of [
    ['connections-dialog', 'data-close="connections-dialog"'],
    ['features-dialog', 'data-close="features-dialog"'],
    ['updates-dialog', 'id="updates-close"'],
    ['support-dialog', 'data-close="support-dialog"']
  ]) {
    assert.ok(index.includes(`<dialog id="${id}"`), `${id} består`);
    assert.ok(index.includes(close), `${id} har stadig sin egen luk-knap`);
  }
});

test('settings.js og settings.css er registreret og indlæst før app.js', () => {
  assert.ok(index.includes('<script src="settings.js" defer></script>'), 'settings.js indlæses');
  assert.ok(index.indexOf('src="settings.js"') < index.indexOf('src="app.js"'), 'settings.js kører før app.js, der registrerer åbnerfunktionerne');
  assert.ok(index.includes('href="settings.css"'), 'settings.css indlæses');
  assert.ok(FILES.includes('settings.js') && FILES.includes('settings.css'), 'manifestet kender begge nye filer');
});
