// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Settings = require('../ui/settings.js');
const ProfileSave = require('../ui/profile-save.js');
const ProfileIcons = require('../ui/profile-icons.js');
const { blank } = require('../core/profile.cjs');

// Settings dialog: settings.js owns the dialog, the section route and (task 4)
// the real profile/appearance content — fill(profile) renders the current
// values, every control saves its own field group through harness.profileSave,
// and appearance is always saved as one unit { theme, panelOpen }.
// app.js owns the popover wiring and the four established dialogs' open
// functions. Behavior is exercised in a synthetic DOM the same way
// profile-step.test.cjs and connection-removal.test.cjs run renderer slices;
// index.html and app.js slices are pinned with structural assertions.
const ui = path.join(__dirname, '..', 'ui');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const updates = fs.readFileSync(path.join(ui, 'updates.js'), 'utf8');
const { FILES } = require('../core/ui-assets.cjs');

class El {
  constructor(tag, document) {
    this.tagName = String(tag).toUpperCase(); this.document = document;
    this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = ''; this._html = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = '';
    this.value = ''; this.checked = false; this.type = ''; this.name = '';
    this.maxLength = 0; this.autocomplete = ''; this.placeholder = '';
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
  set innerHTML(value) { this._html = String(value); }
  get innerHTML() { return this._html; }
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
  hidePopover() { this.attributes.set('popover-open', 'false'); }
  checkVisibility() { return true; }
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
  // Minimal EventTarget: a dispatched event reaches the registered listeners.
  document.dispatchEvent = event => { for (const handler of document.listeners[event.type] || []) handler(event); return true; };
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
  return { document, registry, dialog, content, nav, body: document.body };
}
const navButton = (dom, section) => dom.nav.querySelectorAll(`[data-settings-section="${section}"]`)[0];
const sectionOf = id => Settings.SECTIONS.find(section => section.id === id);
const flush = () => new Promise(resolve => setImmediate(resolve));
// A profile store fake with the real IPC response shape: { ok, value } and
// profile.cjs's merge semantics (patch keys replace whole nested units).
function mergeProfile(profile, patch) {
  const next = { ...profile };
  for (const [key, value] of Object.entries(patch || {})) next[key] = value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : value;
  return next;
}
function makeHarness({ profile = blank(), connections = [], designs = [], warnings = [], saveError = null, avatar = false, uploadCancel = false } = {}) {
  let current = profile;
  let avatarAvailable = avatar;
  let revision = 0;
  const saves = [], preferencesSaves = [], calls = [];
  const copy = value => JSON.parse(JSON.stringify(value));
  const api = {
    profileGet: async () => { calls.push('profileGet'); return { ok: true, value: { profile: copy(current), warnings: [...warnings], hasAvatar: avatarAvailable, avatarRevision: revision } }; },
    profileSave: async value => {
      calls.push('profileSave'); saves.push(value);
      if (saveError) return { ok: false, error: saveError };
      current = mergeProfile(current, value);
      return { ok: true, value: { profile: copy(current), warnings: [], hasAvatar: avatarAvailable, avatarRevision: revision } };
    },
    profileUploadAvatar: async () => {
      calls.push('profileUploadAvatar');
      if (uploadCancel) return { ok: true, value: { canceled: true } };
      avatarAvailable = true; revision = 1690000000000; current = { ...current, icon: 'upload' };
      return { ok: true, value: { canceled: false, profile: copy(current), warnings: [], hasAvatar: true, avatarRevision: revision } };
    },
    profileRemoveAvatar: async () => {
      calls.push('profileRemoveAvatar');
      avatarAvailable = false; revision = 0; current = { ...current, icon: '' };
      return { ok: true, value: { profile: copy(current), warnings: [], hasAvatar: false, avatarRevision: 0 } };
    },
    preferencesSave: async value => {
      calls.push('preferencesSave'); preferencesSaves.push(value);
      if (saveError) return { ok: false, error: saveError };
      current = { ...current, projectDefaults: { hosting: '', designID: '', tests: 'senere', ...value } };
      return { ok: true, value: { values: { hosting: '', connectionID: '', designID: '', tests: 'senere' }, warnings: [] } };
    },
    connectionState: async () => { calls.push('connectionState'); return { ok: true, value: { connections } }; },
    listDesigns: async () => { calls.push('listDesigns'); return { ok: true, value: designs }; }
  };
  return { api, saves, preferencesSaves, calls, get profile() { return current; } };
}
// The theme host records the choice settings.js hands over: workspace-calm.js
// is the one writer of hint, dataset and button state, so the tests assert the
// hand-over instead of a duplicated write.
function makeThemeHost(dom, themes = []) {
  return () => ({
    setTheme: choice => {
      themes.push(choice);
      dom.body.dataset.workspaceTheme = choice;
    }
  });
}
function makeSettings(dom, harness, { themes = [] } = {}) {
  return Settings.create({
    document: dom.document, harness: harness?.api, icons: ProfileIcons,
    themeHost: makeThemeHost(dom, themes), saveQueue: ProfileSave
  });
}
const openSection = async (settings, section) => { await settings.open(section); await flush(); };

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
  assert.ok(sectionOf('appearance').description.includes('AI’ens arbejde'), 'Udseende nævner arbejdsdetaljerne — D4a flytter niveauet hertil');
});

test('open(profile) viser dialogen med sektionen aktiv og felter udfyldt fra profilen', async () => {
  const dom = makeDom();
  const themes = [];
  const harness = makeHarness({
    profile: { ...blank(), name: 'Anna Klit', icon: 'aura-1', helpLevel: 'delvis', workMode: 'plan', appearance: { theme: 'dark', panelOpen: false }, standardAI: { connectionID: 'c2', modelID: 'gpt-mini' }, projectDefaults: { hosting: 'vercel', designID: 'd1', tests: 'automatiske' } },
    connections: [{ id: 'c1', name: 'Corti' }, { id: 'c2', name: 'Ollama hjem' }],
    designs: [{ id: 'd1', name: 'Gentofte design', files: 3 }]
  });
  const settings = makeSettings(dom, harness, { themes });
  const profileButton = navButton(dom, 'profile');
  await openSection(settings, 'profile');
  assert.equal(dom.dialog.open, true);
  assert.equal(profileButton.getAttribute('aria-current'), 'true');
  assert.equal(navButton(dom, 'appearance').getAttribute('aria-current'), null);
  assert.equal(dom.content.children[0].id, 'settings-section-title');
  assert.equal(dom.content.getAttribute('aria-labelledby'), 'settings-section-title');
  assert.ok(dom.content.textContent.startsWith('Din profil'));
  assert.ok(dom.content.textContent.includes(sectionOf('profile').description));
  assert.equal(dom.document.activeElement, profileButton, 'fokus lægges på sektionens nav-knap');
  const q = selector => dom.content.querySelector(selector);
  assert.equal(q('#settings-name').value, 'Anna Klit');
  const grid = dom.content.querySelectorAll('#settings-icons button');
  assert.equal(grid.length, 5, 'kompakt række: initialer, tre varianter og upload-pladsen');
  assert.deepEqual(grid.filter(button => button.getAttribute('aria-checked') === 'true').map(button => button.dataset.icon), ['aura-1']);
  assert.ok(grid.filter(button => button.dataset.icon).every(button => button.innerHTML.includes('<svg')), 'hver variant bærer sin glyf');
  assert.equal(grid.find(button => button.dataset.icon === 'aura-1').getAttribute('aria-label'), 'Aura · ring');
  assert.equal(grid.find(button => button.dataset.icon === 'aura-2').getAttribute('aria-label'), 'Aura · bølge');
  assert.equal(grid.find(button => button.dataset.icon === 'aura-3').getAttribute('aria-label'), 'Aura · kredsløb');
  assert.equal(grid.find(button => button.dataset.icon === '').textContent, 'AK', 'initialer-knappen viser profilens initialer');
  assert.equal(q('#settings-work-mode').value, 'plan');
  assert.deepEqual(q('#settings-help').children.map(option => option.value), ['fuld', 'delvis', 'ingen'], 'hjælpeniveauet har de tre trin');
  assert.ok(q('#settings-help').children.every(option => option.textContent.length > 3), 'hvert trin har en ærlig beskrivelse');
  assert.equal(q('#settings-help').value, 'delvis');
  const connection = q('#settings-standard-connection');
  assert.equal(connection.value, 'c2');
  assert.deepEqual(connection.children.map(option => option.value), ['', 'c1', 'c2']);
  assert.equal(q('#settings-standard-model').hidden, false);
  assert.equal(q('#settings-standard-model').textContent, 'Standardmodel: gpt-mini');
  assert.equal(q('#settings-hosting').value, 'vercel');
  const design = q('#settings-design');
  assert.equal(design.value, 'd1');
  assert.deepEqual(design.children.map(option => option.textContent), ['Intet design', 'Gentofte design · 3 filer']);
  assert.equal(q('#settings-tests').value, 'automatiske');
  assert.ok(q('#settings-forget-standards'), 'Glem projektstandarder-knappen findes');
  assert.equal(dom.body.classList.contains('help-delvis'), true, 'delvis hjælp sætter klassen straks');
  assert.equal(dom.body.classList.contains('help-ingen'), false, 'ingen-klassen følger kun sit eget trin');
  assert.deepEqual(themes, ['dark'], 'profilens tema håndteres gennem temamodulet — den eneste skriver af hint og datasæt');
  assert.equal(dom.body.dataset.workspaceTheme, 'dark', 'temaværten har anvendt temaet');
});

test('open(appearance) udfylder tema og panelstart fra profilen', async () => {
  const dom = makeDom();
  const themes = [];
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'light', panelOpen: false } } });
  const settings = makeSettings(dom, harness, { themes });
  await openSection(settings, 'appearance');
  const q = selector => dom.content.querySelector(selector);
  const radios = dom.content.querySelectorAll('#settings-theme input');
  assert.deepEqual(radios.map(radio => radio.value), ['system', 'light', 'dark']);
  assert.deepEqual(radios.map(radio => radio.checked), [false, true, false]);
  assert.equal(q('#settings-panel-open').checked, false);
  assert.deepEqual(themes, ['light'], 'temavalget gives videre til temamodulet');
  assert.equal(dom.body.dataset.workspaceTheme, 'light');
});

test('navneændring gemmer kun navnet og bevarer ikonet', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna', icon: 'aura-1' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const name = dom.content.querySelector('#settings-name');
  name.value = 'Bo Larsen';
  name.emit('change');
  await flush();
  assert.deepEqual(harness.saves, [{ name: 'Bo Larsen' }], 'gemningen indeholder kun navnet');
  assert.equal(dom.content.querySelector('#settings-name').value, 'Bo Larsen', 'feltet viser den gemte værdi');
  const grid = dom.content.querySelectorAll('#settings-icons button');
  assert.deepEqual(grid.filter(button => button.getAttribute('aria-checked') === 'true').map(button => button.dataset.icon), ['aura-1'], 'ikonet bevares uden at blive sendt');
});

test('ikonvalg gemmer ikonet, og et nyt klik på det valgte fjerner det igen', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), icon: 'aura-1' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const bird = dom.content.querySelectorAll('#settings-icons button').find(button => button.dataset.icon === 'aura-2');
  bird.click();
  await flush();
  assert.deepEqual(harness.saves, [{ icon: 'aura-2' }]);
  bird.click();
  await flush();
  assert.deepEqual(harness.saves[1], { icon: '' }, 'initialerne er et gyldigt valg');
});

test('upload i Indstillinger beder hovedprocessen og gør billedet til det valgte ikon', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna Klit' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const upload = dom.content.querySelector('#settings-avatar-slot');
  assert.ok(upload, 'upload-pladsen findes uden et gemt billede');
  assert.equal(upload.getAttribute('aria-label'), 'Upload eget billede');
  assert.equal(dom.content.querySelector('#settings-avatar-remove'), null, 'uden billede er der ingen fjern-knap');
  const saved = [];
  dom.document.addEventListener('aura:profile-saved', event => saved.push(event.detail));
  upload.click();
  await flush();
  assert.equal(harness.calls.includes('profileUploadAvatar'), true, 'filvælgeren håndteres af hovedprocessen');
  const avatar = dom.content.querySelector('#settings-icons button[data-icon="upload"]');
  assert.ok(avatar, 'efter gemningen er billedet et valg');
  assert.ok(avatar.innerHTML.includes('<img src="avatar.png?v=1690000000000"'), 'forhåndsvisningen kommer fra det faste navn — med uploadens revision som cache-buster');
  assert.equal(avatar.getAttribute('aria-checked'), 'true', 'billedet er valgt straks efter gemningen');
  assert.equal(avatar.getAttribute('aria-label'), 'Eget billede');
  assert.ok(dom.content.querySelector('#settings-avatar-remove'), 'fjern-knappen står frem');
  assert.equal(harness.profile.icon, 'upload');
  assert.equal(saved.length >= 1, true, 'chippen og cachen følger med straks — upload annonceres som enhver anden profilgemning');
});

test('en annulleret billedvælger giver en stille dansk status — ikke en fejl', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna Klit' }, uploadCancel: true });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  dom.content.querySelector('#settings-avatar-slot').click();
  await flush();
  assert.equal(harness.calls.includes('profileUploadAvatar'), true);
  const feedback = dom.content.querySelector('#settings-feedback');
  assert.equal(feedback.textContent, 'Billedvalget blev afbrudt.');
  assert.equal(feedback.classList.contains('error'), false, 'en afbrudt vælger er ikke en fejl');
  assert.equal(dom.content.querySelector('#settings-icons button[data-icon="upload"]'), null, 'intet billede er kommet til');
  assert.equal(dom.content.querySelector('#settings-avatar-remove'), null, 'fjern-knappen forbliver væk');
  assert.equal(harness.profile.icon, '', 'profilen røres ikke');
});

test('Fjern billedet rydder ikonvalget og gør upload-knappen tilbage', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna Klit', icon: 'upload' }, avatar: true });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const avatar = dom.content.querySelector('#settings-icons button[data-icon="upload"]');
  assert.ok(avatar, 'det gemte billede står som valg, når sektionen åbnes');
  assert.equal(avatar.getAttribute('aria-checked'), 'true');
  assert.ok(avatar.innerHTML.includes('<img src="avatar.png"'));
  dom.content.querySelector('#settings-avatar-remove').click();
  await flush();
  assert.equal(harness.calls.includes('profileRemoveAvatar'), true);
  assert.equal(harness.profile.icon, '', 'fjernelsen rydder ikonvalget');
  assert.equal(dom.content.querySelector('#settings-icons button[data-icon="upload"]'), null, 'billedet er ud af rækken');
  assert.ok(dom.content.querySelector('#settings-avatar-slot'), 'upload-knappen er tilbage');
  assert.equal(dom.content.querySelector('#settings-icons button[data-icon=""]').getAttribute('aria-checked'), 'true', 'initialerne er valgt igen');
});

test('avatar-valget skifter som ethvert andet ikon — og tilbage igen', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna Klit', icon: 'aura-1' }, avatar: true });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const avatar = dom.content.querySelector('#settings-icons button[data-icon="upload"]');
  assert.equal(avatar.getAttribute('aria-checked'), 'false', 'billedet findes, men er ikke valgt');
  avatar.click();
  await flush();
  assert.deepEqual(harness.saves, [{ icon: 'upload' }]);
  avatar.click();
  await flush();
  assert.deepEqual(harness.saves[1], { icon: '' }, 'et nyt klik rydder til initialerne');
});

// A5: en ny upload i samme session skal kunne ses med det samme — Chromium
// kan genbruge det gamle billede fra cachen trods no-store, så svarets
// revision bliver URL'ens cache-buster (?v=), og fjernelsen nulstiller den.
test('en ny upload giver avatar-kilden en frisk cache-buster', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna Klit', icon: 'aura-1' }, avatar: false });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  dom.content.querySelector('#settings-avatar-slot').click();
  await flush();
  const avatar = dom.content.querySelector('#settings-icons button[data-icon="upload"]');
  assert.ok(avatar.innerHTML.includes('<img src="avatar.png?v=1690000000000"'), 'uploadens revision bliver cache-busteren — det gamle billede kan ikke genbruges');
  dom.content.querySelector('#settings-avatar-remove').click();
  await flush();
  assert.equal(dom.content.querySelector('#settings-icons button[data-icon="upload"]'), null, 'fjernelsen rydder pladsen');
  assert.ok(!ProfileIcons.avatarImage().includes('?v='), 'efter fjernelsen er der ingen forespørgsel på kilden');
});

test('arbejdsmåde og hjælpeniveau gemmer deres eget felt; alle tre trin slår igennem', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), workMode: 'chat', helpLevel: 'fuld' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  assert.equal(dom.body.classList.contains('help-delvis'), false);
  assert.equal(dom.body.classList.contains('help-ingen'), false);
  const mode = dom.content.querySelector('#settings-work-mode');
  mode.value = 'plan'; mode.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { workMode: 'plan' });
  const help = dom.content.querySelector('#settings-help');
  help.value = 'delvis'; help.emit('change');
  await flush();
  assert.deepEqual(harness.saves[1], { helpLevel: 'delvis' }, 'hjælpeniveauet er et egentligt topnøglefelt i patchen');
  assert.equal(dom.body.classList.contains('help-delvis'), true, 'klassen sættes straks efter gemning');
  help.value = 'ingen'; help.emit('change');
  await flush();
  assert.deepEqual(harness.saves[2], { helpLevel: 'ingen' });
  assert.equal(dom.body.classList.contains('help-ingen'), true, 'ingen-klassen sættes straks');
  assert.equal(dom.body.classList.contains('help-delvis'), false, 'delvis-klassen fjernes igen');
  help.value = 'fuld'; help.emit('change');
  await flush();
  assert.equal(dom.body.classList.contains('help-delvis'), false, 'klassen fjernes igen ved fuld hjælp');
  assert.equal(dom.body.classList.contains('help-ingen'), false, 'fuld hjælp fjerner begge klasser');
});

test('temavalg gemmer hele udseende-enheden og giver temaet til temamodulet', async () => {
  const dom = makeDom();
  const themes = [];
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'system', panelOpen: true } } });
  const settings = makeSettings(dom, harness, { themes });
  await openSection(settings, 'appearance');
  const dark = dom.content.querySelectorAll('#settings-theme input').find(radio => radio.value === 'dark');
  dark.checked = true; dark.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { appearance: { theme: 'dark', panelOpen: true } }, 'både tema og paneltilstand sendes — appearance er én enhed');
  assert.deepEqual(themes.at(-1), 'dark', 'temavalget gives videre straks gennem setTheme');
  assert.equal(dom.body.dataset.workspaceTheme, 'dark', 'temamodulet ejer hint og datasæt — Indstillinger skriver ikke selv');
  const panel = dom.content.querySelector('#settings-panel-open');
  panel.checked = false; panel.emit('change');
  await flush();
  assert.deepEqual(harness.saves[1], { appearance: { theme: 'dark', panelOpen: false } }, 'panelvalget bevarer temaet');
});

test('temaændring bevarer en gemt lukket starttilstand for panelet', async () => {
  const dom = makeDom();
  const themes = [];
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'system', panelOpen: false } } });
  const settings = makeSettings(dom, harness, { themes });
  await openSection(settings, 'appearance');
  const light = dom.content.querySelectorAll('#settings-theme input').find(radio => radio.value === 'light');
  light.checked = true; light.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { appearance: { theme: 'light', panelOpen: false } }, 'panelOpen bevares i den sendte enhed');
  assert.deepEqual(themes.at(-1), 'light', 'lys tema gives videre gennem temamodulet');
});

// Arbejdsdetaljer (D4a): Udseende-sektionen viser tre valgkort fra profilen,
// og hvert valg gemmer kun sit eget felt — hjælpeniveauet og detaljeniveauet
// er uafhængige (R7: alle 3×3 kombinationer forbliver skrivbare).
test('open(appearance) viser arbejdsdetaljerne som tre valgkort fra profilen', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), transcriptView: 'compact', appearance: { theme: 'light', panelOpen: true } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  const radios = dom.content.querySelectorAll('#settings-transcript input');
  assert.deepEqual(radios.map(radio => radio.value), ['compact', 'standard', 'detailed'], 'de tre trin er Kun resultater, Nøgletrin og Alle detaljer');
  assert.deepEqual(radios.map(radio => radio.checked), [true, false, false], 'det gemte niveau er forvalgt');
  assert.ok(dom.content.textContent.includes('Arbejdsdetaljer'), 'sektionen har sit danske navn');
  for (const word of ['Kun resultater', 'Nøgletrin', 'Alle detaljer']) assert.ok(dom.content.textContent.includes(word), `${word} har sin danske titel`);
  for (const card of dom.content.querySelectorAll('#settings-transcript label')) assert.ok(card.textContent.trim().length > 15, 'hvert kort har en ærlig kort forklaring');
  assert.equal(dom.body.classList.contains('transcript-compact'), true, 'det gemte niveau sætter sin kropsklasse straks');
  assert.equal(dom.body.classList.contains('transcript-standard'), false);
  assert.equal(dom.body.classList.contains('transcript-detailed'), false);
});

test('et detaljeniveauvalg gemmer kun transcriptView og skifter kropsklassen straks', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), helpLevel: 'delvis', transcriptView: 'standard', appearance: { theme: 'system', panelOpen: true } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  const detailed = dom.content.querySelectorAll('#settings-transcript input').find(radio => radio.value === 'detailed');
  detailed.checked = true; detailed.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { transcriptView: 'detailed' }, 'gemningen bærer kun detaljeniveauet');
  assert.equal(dom.body.classList.contains('transcript-detailed'), true, 'Alle detaljer sætter sin kropsklasse');
  assert.equal(dom.body.classList.contains('transcript-standard'), false);
  assert.equal(dom.body.classList.contains('help-delvis'), true, 'hjælpeniveauet består uændret — niveauerne er uafhængige');
  const compact = dom.content.querySelectorAll('#settings-transcript input').find(radio => radio.value === 'compact');
  compact.checked = true; compact.emit('change');
  await flush();
  assert.deepEqual(harness.saves[1], { transcriptView: 'compact' });
  assert.equal(dom.body.classList.contains('transcript-compact'), true);
  assert.equal(dom.body.classList.contains('transcript-detailed'), false);
  // A neighboring field write in the same section (appearance is one unit)
  // never drags the detail level along: the merge keeps only the sent keys.
  const light = dom.content.querySelectorAll('#settings-theme input').find(radio => radio.value === 'light');
  light.checked = true; light.emit('change');
  await flush();
  assert.equal(harness.profile.transcriptView, 'compact', 'detaljeniveauet overlever en udseende-gemning i samme sektion');
  assert.equal(dom.body.classList.contains('transcript-compact'), true, 'kropsklassen består efter naboens gemning');
});

// Skriftstørrelse-stepperen (4K-skalering): feltet viser profilens størrelse
// med ærlige grænser, hvert trin gemmer kun sit eget felt gennem den delte
// kø, og en fejlslagen gemning ruller visningen tilbage.
test('open(appearance) viser skriftstørrelsen med ærlige grænser', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'system', panelOpen: true, fontSize: 13 } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  const q = selector => dom.content.querySelector(selector);
  assert.equal(q('#settings-font-size-value').textContent, '13 px', 'profilens størrelse vises med enhed');
  assert.equal(q('#settings-font-down').disabled, false, 'fra 13 kan der trinsættes ned');
  assert.equal(q('#settings-font-up').disabled, false, 'fra 13 kan der trinsættes op');
  assert.ok(q('#settings-font-down').getAttribute('aria-label').length > 3, 'ned-knappen har sit danske navn');
  assert.ok(q('#settings-font-up').getAttribute('aria-label').length > 3, 'op-knappen har sit danske navn');
  const topDom = makeDom();
  const top = makeSettings(topDom, makeHarness({ profile: { ...blank(), appearance: { fontSize: 16 } } }));
  await openSection(top, 'appearance');
  assert.equal(topDom.content.querySelector('#settings-font-size-value').textContent, '16 px', 'en gemt 16 vises');
  assert.equal(topDom.content.querySelector('#settings-font-up').disabled, true, 'op-knappen står disabled ved øvre grænse');
  assert.equal(topDom.content.querySelector('#settings-font-down').disabled, false, 'ned er stadig mulig');
  const bottomDom = makeDom();
  const bottom = makeSettings(bottomDom, makeHarness({ profile: { ...blank(), appearance: { fontSize: 10 } } }));
  await openSection(bottom, 'appearance');
  assert.equal(bottomDom.content.querySelector('#settings-font-down').disabled, true, 'ned-knappen står disabled ved nedre grænse');
});

test('et trin i skriftstørrelsen gemmer kun font-feltet gennem den delte kø', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'dark', panelOpen: false, fontSize: 13 } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  dom.content.querySelector('#settings-font-up').click();
  await flush();
  assert.deepEqual(harness.saves, [{ appearance: { fontSize: 14 } }], 'kun font-feltet sendes — tema og panel flettes main-side (profiltestene) og bevares');
  assert.equal(dom.content.querySelector('#settings-font-size-value').textContent, '14 px', 'den gemte profil bekræfter visningen');
  dom.content.querySelector('#settings-font-down').click();
  await flush();
  assert.deepEqual(harness.saves[1], { appearance: { fontSize: 13 } }, 'et trin ned går tilbage til det neutrale 13');
});

// Two quick '+' clicks: the step is computed inside the serialized save from
// the store's fresh answer, so the clicks walk 14 then 15 — the second never
// computes from the cached pre-step value.
test('to hurtige "+"-klik går 14 og derefter 15 — aldrig [14, 14]', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'system', panelOpen: true, fontSize: 13 } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  dom.content.querySelector('#settings-font-up').click();
  dom.content.querySelector('#settings-font-up').click();
  await flush();
  await flush();
  assert.deepEqual(harness.saves.map(step => step.appearance.fontSize), [14, 15], 'det andet klik læser det første klicks skrivning');
  assert.equal(dom.content.querySelector('#settings-font-size-value').textContent, '15 px', 'visningen står på det sidste trin');
});

// A profile saved outside the dialog — fx the View menu's zoom step in the
// main process — arrives on the shared aura:profile-saved event. The cache
// and the open controls follow it, so the stepper never stands on a stale
// size after a menu zoom.
test('en gemning uden for dialogen (menu-zoom) opdaterer cachen og stepperen', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'system', panelOpen: true, fontSize: 13 } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  const stepped = { ...blank(), appearance: { theme: 'system', panelOpen: true, fontSize: 16 } };
  dom.document.dispatchEvent({ type: 'aura:profile-saved', detail: stepped });
  assert.equal(dom.content.querySelector('#settings-font-size-value').textContent, '16 px', 'stepperen følger menuens trin uden genåbning');
  assert.equal(dom.content.querySelector('#settings-font-up').disabled, true, 'grænsen er ærlig efter den eksterne gemning');
  assert.equal(harness.saves.length, 0, 'opdateringen skriver intet selv');
});

test('en fejlslagen skriftstørrelsesgemning ruller visningen tilbage', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), appearance: { fontSize: 13 } }, saveError: 'Datamappen er låst.' });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'appearance');
  dom.content.querySelector('#settings-font-up').click();
  await flush();
  assert.equal(dom.content.querySelector('#settings-font-size-value').textContent, '13 px', 'den sidste kendte profil ruller visningen tilbage');
  assert.match(dom.content.querySelector('#settings-feedback').textContent, /Datamappen er låst/, 'fejlen annonceres på dansk');
  assert.equal(harness.saves.length, 1, 'gemningen blev forsøgt præcis én gang');
});

test('valg af standard-AI gemmer hele standardAI-enheden', async () => {
  const dom = makeDom();
  const harness = makeHarness({
    profile: { ...blank(), standardAI: { connectionID: 'c1', modelID: 'm1' } },
    connections: [{ id: 'c1', name: 'Corti' }, { id: 'c2', name: 'Ollama hjem' }]
  });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const connection = dom.content.querySelector('#settings-standard-connection');
  connection.value = 'c2'; connection.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { standardAI: { connectionID: 'c2', modelID: '' } }, 'modellen ryddes med forbindelsen — enheden sendes hel');
  assert.equal(dom.content.querySelector('#settings-standard-model').hidden, true, 'modellinjen skjules uden model');
  connection.value = ''; connection.emit('change');
  await flush();
  assert.deepEqual(harness.saves[1], { standardAI: { connectionID: '', modelID: '' } }, 'Beslut senere er et gyldigt valg');
});
test('en vellykket profilgemning udsender aura:profile-saved med den gemte profil', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), workMode: 'chat' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const saved = [];
  dom.document.addEventListener('aura:profile-saved', event => saved.push(event.detail));
  const mode = dom.content.querySelector('#settings-work-mode');
  mode.value = 'plan'; mode.emit('change');
  await flush();
  assert.equal(saved.length, 1, 'hændelsen udsendes én gang pr. vellykket gemning');
  assert.equal(saved[0].workMode, 'plan', 'hændelsen bærer den returnerede profil');
  assert.equal(saved[0].name, '', 'profilen er hel — ikke kun det gemte felt');
  // En afvist gemning udsender intet: cachen følger kun bekræftede gemninger.
  const failingDom = makeDom();
  const failing = makeHarness({ profile: blank(), saveError: 'Profilen kunne ikke gemmes.' });
  await openSection(makeSettings(failingDom, failing), 'profile');
  const failed = [];
  failingDom.document.addEventListener('aura:profile-saved', event => failed.push(event.detail));
  const failingMode = failingDom.content.querySelector('#settings-work-mode');
  failingMode.value = 'plan'; failingMode.emit('change');
  await flush();
  assert.match(failingDom.content.querySelector('#settings-feedback').textContent, /kunne ikke gemmes/, 'fejlen annonceres i dialogen');
  assert.deepEqual(failed, [], 'en afvist gemning udsender intet');
});

test('projektstandarder gemmes som én enhed med alle tre felter', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: blank(), designs: [{ id: 'd1', name: 'Gentofte design', files: 3 }] });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const hosting = dom.content.querySelector('#settings-hosting');
  hosting.value = 'vercel'; hosting.emit('change');
  await flush();
  assert.deepEqual(harness.saves[0], { projectDefaults: { hosting: 'vercel', designID: '', tests: 'senere' } });
  const design = dom.content.querySelector('#settings-design');
  design.value = 'd1'; design.emit('change');
  await flush();
  assert.deepEqual(harness.saves[1], { projectDefaults: { hosting: 'vercel', designID: 'd1', tests: 'senere' } });
  const tests = dom.content.querySelector('#settings-tests');
  tests.value = 'automatiske'; tests.emit('change');
  await flush();
  assert.deepEqual(harness.saves[2], { projectDefaults: { hosting: 'vercel', designID: 'd1', tests: 'automatiske' } });
});

test('Glem projektstandarder nulstiller gennem preferencesSave og annoncerer den nye profil', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), projectDefaults: { hosting: 'vercel', designID: 'd1', tests: 'automatiske' } } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const saved = [];
  dom.document.addEventListener('aura:profile-saved', event => saved.push(event.detail));
  dom.content.querySelector('#settings-forget-standards').click();
  await flush();
  assert.deepEqual(harness.preferencesSaves, [{ hosting: '', designID: '', tests: 'senere' }], 'preferencesSave kaldes med de tomme standardværdier');
  assert.equal(harness.saves.length, 0, 'profileSave røres ikke af nulstillingen');
  assert.equal(dom.content.querySelector('#settings-hosting').value, '');
  assert.equal(dom.content.querySelector('#settings-design').value, '');
  assert.equal(dom.content.querySelector('#settings-tests').value, 'senere');
  const feedback = dom.content.querySelector('#settings-feedback');
  assert.match(feedback.textContent, /nulstillet/i);
  assert.equal(feedback.classList.contains('error'), false);
  assert.equal(saved.length, 1, 'den opdaterede profil annonceres — cachen og projektopstarten følger med');
  assert.equal(saved[0].projectDefaults.hosting, '');
});

test('en afvist gemning viser fejlen og gendanner de sidste kendte værdier', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna', icon: 'aura-1' }, saveError: 'Ugyldigt profilnavn.' });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const name = dom.content.querySelector('#settings-name');
  name.value = 'noget ugyldigt';
  name.emit('change');
  await flush();
  const feedback = dom.content.querySelector('#settings-feedback');
  assert.equal(feedback.textContent, 'Ugyldigt profilnavn.');
  assert.equal(feedback.classList.contains('error'), true);
  assert.equal(name.value, 'Anna', 'feltet gendanner den sidst kendte profilværdi');
  assert.deepEqual(dom.content.querySelectorAll('#settings-icons button').filter(button => button.getAttribute('aria-checked') === 'true').map(button => button.dataset.icon), ['aura-1']);
});

test('advarsler fra profilen vises i sektionen som status', async () => {
  const dom = makeDom();
  const harness = makeHarness({ warnings: ['Din standard-AI findes ikke længere. Vælg en ny, eller beslut senere.'] });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const feedback = dom.content.querySelector('#settings-feedback');
  assert.match(feedback.textContent, /standard-AI findes ikke længere/);
  assert.equal(feedback.classList.contains('error'), false);
  assert.equal(feedback.getAttribute('role'), 'status');
});

test('hurtige ændringer i træk køres efter hinanden — ingen gemning afvises', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), workMode: 'chat' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  const mode = dom.content.querySelector('#settings-work-mode');
  mode.value = 'plan';
  mode.emit('change');
  mode.value = 'chat';
  mode.emit('change');
  // The handler queues both saves; flushing lets the queue drain in order.
  await flush(); await flush(); await flush();
  assert.equal(harness.saves.length, 2, 'begge gemninger når main-processen');
  assert.deepEqual(harness.saves, [{ workMode: 'plan' }, { workMode: 'chat' }]);
  const feedback = dom.content.querySelector('#settings-feedback');
  assert.equal(feedback.classList.contains('error'), false, 'ingen gemning er blevet afvist undervejs');
  assert.equal(dom.content.querySelector('#settings-work-mode').value, 'chat', 'feltet viser den sidste gemte værdi');
});

// Fund 3: et læsesvar, der er ældre end den seneste gemning, må aldrig udfylde
// felterne igen — ellers vender et gammelt tema UI-tilstanden tilbage efter en
// nyere gemning.
test('et læsesvar, der er ældre end den seneste gemning, udfylder ikke felterne igen', async () => {
  const dom = makeDom();
  const themes = [];
  let releaseStale = null;
  const harness = makeHarness({ profile: { ...blank(), appearance: { theme: 'dark', panelOpen: false } } });
  // Åbningens læsning hænger: svaret bærer det GAMLE mørke tema og lander først
  // efter en nyere gemning har vist lyst tema.
  harness.api.profileGet = async () => {
    await new Promise(resolve => { releaseStale = resolve; });
    return { ok: true, value: { profile: { ...blank(), appearance: { theme: 'dark', panelOpen: true } }, warnings: [] } };
  };
  const settings = makeSettings(dom, harness, { themes });
  await settings.open('appearance');
  const light = dom.content.querySelectorAll('#settings-theme input').find(radio => radio.value === 'light');
  light.checked = true; light.emit('change');
  await flush(); await flush();
  assert.deepEqual(themes.at(-1), 'light', 'den nye gemning har vist lyst tema');
  assert.equal(dom.content.querySelector('#settings-panel-open').checked, false, 'gemningen har udfyldt paneltilstanden');
  releaseStale();
  await flush(); await flush();
  assert.deepEqual(themes, ['light'], 'det forældede svar vender ikke mørkt tema tilbage');
  assert.equal(dom.content.querySelectorAll('#settings-theme input').find(radio => radio.checked)?.value, 'light', 'radio-knapperne viser fortsat den gemte værdi');
  assert.equal(dom.content.querySelector('#settings-panel-open').checked, false, 'det forældede svar ændrer ikke paneltilstanden');
});

test('sektionsskift flytter aria-current, indhold og fokus', async () => {
  const dom = makeDom();
  const harness = makeHarness({ profile: { ...blank(), name: 'Anna' } });
  const settings = makeSettings(dom, harness);
  await openSection(settings, 'profile');
  await openSection(settings, 'appearance');
  assert.equal(dom.dialog.open, true);
  assert.equal(navButton(dom, 'appearance').getAttribute('aria-current'), 'true');
  assert.equal(navButton(dom, 'profile').getAttribute('aria-current'), null);
  assert.ok(dom.content.textContent.startsWith('Udseende'));
  assert.ok(dom.content.querySelector('#settings-theme'), 'udseendefelterne er rendering');
  assert.equal(dom.content.querySelector('#settings-name'), null, 'profilfelterne er væk efter skiftet');
  navButton(dom, 'profile').click();
  await flush();
  assert.equal(navButton(dom, 'profile').getAttribute('aria-current'), 'true');
  assert.equal(dom.content.querySelector('#settings-name').value, 'Anna', 'profilsektionen udfyldes fra cachen før hentningen');
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

// Skills ad gangen (poleringsbølgen): onboarding spørger ikke længere om funktioner, så
// Indstillinger › Funktioner er det eneste sted, de vælges. Panelet kører som et vm-snit
// af app.js over det syntetiske DOM — med den rigtige kerne (Features og kataloget), så
// panelet viser grundpakken for en ny bruger og hele pakken for en migreret bruger.
test('Funktioner-panelet viser grundpakken for en ny bruger og hele pakken for en migreret', async t => {
  const os = require('node:os');
  const { Store } = require('../core/store.cjs');
  const { Features } = require('../core/features.cjs');
  const { loadLibrary } = require('../core/library.cjs');
  const library = await loadLibrary(path.join(__dirname, '..', '..', 'profiles'));
  const start = app.indexOf('function featureRow');
  assert.ok(start >= 0, 'app.js har featureRow');
  const code = [app.slice(start, app.indexOf('async function saveFeatures', start)),
    ...['function node(tag, text, className) {', 'function info(label, text) {'].map(marker => app.split('\n').find(line => line.startsWith(marker)))].join('\n');
  const dialog = async sign => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-funktioner-dialog-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const store = new Store(path.join(root, 'appdata')), features = new Features(store, async () => library);
    if (sign) await store.update(sign);
    // Profilmigreringen ved appstart vurderer standardpakken, før panelet tegnes.
    await features.migrate();
    const dom = makeDom();
    const context = {
      $: selector => {
        const found = dom.document.querySelector(selector);
        if (found || !/^#[A-Za-z0-9_-]+$/.test(selector)) return found;
        const el = new El('div', dom.document); el.id = selector.slice(1); dom.registry.set(el.id, el); dom.body.append(el);
        return el;
      },
      document: dom.document, state: { features: await features.get(null) }, current: null,
      projectLoading: false, crypto: { randomUUID: () => 'fast' }, action: fn => fn(), saveFeatures: async () => {}
    };
    vm.runInNewContext(code, context);
    context.renderFeatures();
    return { dom, state: context.state, toggles: id => dom.document.querySelectorAll(`#features-list input[data-feature="${id}"]`)[0] };
  };
  // En ny bruger: grundpakken — alle valgfrie kontakter står slået fra, design er ikke en kontakt.
  const fresh = await dialog(null);
  assert.equal(fresh.state.features.chosen, '', 'en ny bruger har ikke valgt en pakke');
  const freshInputs = fresh.dom.document.querySelectorAll('#features-list input[data-feature]');
  assert.equal(freshInputs.length, 9, 'fem funktioner og fire integrationer');
  assert.ok(freshInputs.every(input => input.checked === false), 'grundpakken har ingen tilvalg');
  assert.equal(fresh.toggles('versioner')?.checked, false, 'versioner er fra indtil tilvalgt');
  assert.equal(fresh.dom.document.querySelectorAll('#features-list .feature-row[data-feature="design"]').length, 0, 'designhjælpen er altid aktiv og ikke en kontakt');
  assert.equal(fresh.dom.document.querySelectorAll('#features-list .features-group').length, 1, 'integrationerne står for sig');
  // En migreret bruger uden valg: hele pakken låses fast — kontakterne viser den gamle standard.
  const migrated = await dialog(state => { state.connections.push({ id: 'c1', kind: 'corti', name: 'Forbindelse' }); });
  assert.equal(migrated.state.features.chosen, 'alle', 'migreringen har låst hele pakken fast');
  assert.equal(migrated.toggles('versioner').checked, true, 'versioner forbliver slået til');
  assert.equal(migrated.toggles('kvalitet').checked, true, 'kodekvalitet forbliver slået til');
  assert.equal(migrated.toggles('deling').checked, false, 'udgivelse er fortsat et bevidst tilvalg');
});


// Carried finding 2 from task 3's review: the updates route's end link — the
// adopted opener is updates.js's own open, and it must open #updates-dialog.
// updates.js runs unmodified in a vm slice over the shared synthetic DOM.
test('updates-rutens slutled: den adopterede åbner åbner #updates-dialog', async () => {
  const dom = makeDom();
  const state = { current: '1.0.0', channel: 'stable', phase: 'idle', error: '', warning: null, automatic: false, percent: 0, available: null, checkedAt: null };
  // updates.js binds its own $ against the global document, so the elements it
  // touches must exist in the shared DOM. makeDom already provides
  // #updates-dialog, the popover #updates-button and #settings-menu.
  const ensure = id => { const el = new El('p', dom.document); el.id = id; dom.registry.set(id, el); dom.body.append(el); return el; };
  for (const id of ['updates-version', 'updates-status', 'updates-error', 'updates-warning', 'updates-automatic', 'updates-progress', 'updates-action', 'updates-notes', 'updates-restart-note', 'updates-settings', 'updates-last-check', 'updates-notice', 'updates-notice-text', 'updates-notice-open', 'updates-close']) ensure(id);
  const updatesDialog = dom.document.querySelector('#updates-dialog');
  const context = {
    document: dom.document,
    window: { harness: { updatesState: async () => ({ ok: true, value: state }), onEvent: () => () => {} } },
    saveChatDraft: () => {}, saveIdeaDraft: () => {}
  };
  vm.runInNewContext(updates, context);
  assert.equal(updatesDialog.open, false);
  const settings = Settings.create({ document: dom.document });
  // updates.js binds the popover button's onclick to its own open — the exact
  // binding app.js adopts as the section's opener after DOMContentLoaded.
  const updatesButton = dom.document.querySelector('#updates-button');
  assert.equal(typeof updatesButton.onclick, 'function', 'updates.js har bundet sin egen åbner');
  settings.register({ updates: updatesButton.onclick });
  await settings.open('profile');
  await settings.open('updates');
  assert.equal(dom.dialog.open, false, 'settings-dialogen er lukket først');
  assert.equal(updatesDialog.open, true, '#updates-dialog[open] gælder, når åbneren er kaldt');
  assert.equal(dom.document.querySelector('#updates-version').textContent, 'Aura Prime 1.0.0', 'versionslinjen er tegnet af updates.js selv');
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
