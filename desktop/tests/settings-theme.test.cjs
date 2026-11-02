// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Theme and help-level slice: main.cjs sets Electron's theme source from the
// profile before the window exists, workspace-calm.js reads the synchronous
// hint copy (aura.theme-hint.v1) and saves through the profile, settings.js
// applies theme and help class after each save, and the help-delvis and
// help-ingen CSS hides only the designated hints — the essential surfaces
// (privacy, warnings, approvals, "Før du sender", consent) never hide.
// Real source slices run in synthetic contexts.
const ui = path.join(__dirname, '..', 'ui');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
const calm = fs.readFileSync(path.join(ui, 'workspace-calm.js'), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function mainSlice(marker, endMarker) {
  const start = main.indexOf(marker);
  assert.ok(start >= 0, `main.cjs mangler "${marker}"`);
  const end = main.indexOf(endMarker, start);
  assert.ok(end > start, `main.cjs mangler "${endMarker}" efter "${marker}"`);
  return main.slice(start, end);
}
function appSlice(from, to) {
  const start = app.indexOf(from);
  assert.ok(start >= 0, `app.js mangler "${from}"`);
  const end = app.indexOf(to, start);
  assert.ok(end > start, `app.js mangler "${to}" efter "${from}"`);
  return app.slice(start, end);
}

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.id = ''; this.type = '';
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
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) { child.parentElement = this; this.children.unshift(child); } }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
  focus() { if (this._document) this._document.activeElement = this; }
  click() { if (!this.disabled && typeof this.onclick === 'function') this.onclick(); this.emit('click'); }
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

// main.cjs — the real lines run against stubs.
test('main.cjs: applyProfileTheme oversætter profilens tema til Electron-temakilden', () => {
  const source = mainSlice('function applyProfileTheme', '\n');
  const context = { nativeTheme: {} };
  vm.runInNewContext(source, context);
  context.applyProfileTheme('dark');
  assert.equal(context.nativeTheme.themeSource, 'dark');
  context.applyProfileTheme('light');
  assert.equal(context.nativeTheme.themeSource, 'light');
  context.applyProfileTheme('system');
  // Electron-kontrakten er nativeTheme.themeSource ∈ {'dark','light','system'}:
  // 'default' er ikke en gyldig værdi — følg-system hedder 'system'.
  assert.equal(context.nativeTheme.themeSource, 'system', "'system' følger operativsystemet");
  context.applyProfileTheme(undefined);
  assert.equal(context.nativeTheme.themeSource, 'system', 'et ukendt tema giver aldrig et tvangstema');
});

test('main.cjs: profilen læses og temaet sættes, før vinduet skabes', async () => {
  const line = mainSlice('try { const appearance = (await profileStore().get()).profile.appearance', '\n');
  const applied = [], zooms = [];
  const context = {
    applyProfileTheme: theme => applied.push(theme),
    applyProfileFontSize: size => zooms.push(size),
    profileStore: () => ({ get: async () => ({ profile: { appearance: { theme: 'dark', fontSize: 16 } } }) })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, context);
  assert.deepEqual(applied, ['dark'], 'profilens tema sættes ved opstart');
  assert.deepEqual(zooms, [16], 'profilens skriftstørrelse afleveres til zoom-anvendelsen ved opstart');
  const failing = {
    applyProfileTheme: theme => applied.push(theme),
    applyProfileFontSize: size => zooms.push(size),
    profileStore: () => ({ get: async () => { throw new Error('datamappen er låst'); } })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, failing);
  assert.deepEqual(applied, ['dark'], 'en ulæselig profil efterlader systemtemaet og stopper ikke opstarten');
  assert.deepEqual(zooms, [16], 'en ulæselig profil efterlader også den neutrale zoom');
  assert.ok(main.indexOf('applyProfileTheme(appearance.theme);') < main.indexOf('createWindow();'), 'temaet håndhæves før createWindow()');
});

test('main.cjs: profile:save håndhæver temaet efter en gemning, der inkluderer tema', async () => {
  const source = mainSlice("handle('profile:save'", '\n');
  const applied = [];
  let action = null;
  const context = {
    handle: (channel, fn) => { if (channel === 'profile:save') action = fn; },
    exclusive: fn => fn(),
    profileStore: () => ({ save: async input => ({ profile: { appearance: { theme: input.appearance?.theme } } }) }),
    applyProfileTheme: theme => applied.push(theme)
  };
  vm.runInNewContext(source, context);
  assert.ok(action, 'profile:save-handleren er registreret');
  const result = await action({ appearance: { theme: 'dark', panelOpen: true } });
  assert.deepEqual(applied, ['dark'], 'temaet håndhæves efter gemning');
  assert.equal(result.profile.appearance.theme, 'dark', 'svarværdien består uændret');
  await action({ name: 'Anna' });
  assert.deepEqual(applied, ['dark'], 'en gemning uden tema rører ikke temakilden');
});

// workspace-calm.js — the whole presentation module over a synthetic workspace.
// The theme button saves through the shared queue (ui/profile-save.js), so the
// real module is injected and its behaviour is asserted directly.
const ProfileSave = require('../ui/profile-save.js');
function runCalm({ store = {}, harness = null, systemDark = false, profileSaveQueued = ProfileSave } = {}) {
  const document = { activeElement: null, listeners: {} };
  document.addEventListener = (name, handler) => { (document.listeners[name] ||= []).push(handler); };
  const registry = new Map();
  document.getElementById = id => registry.get(id) || null;
  document.body = new El('body'); document.body._document = document;
  const make = (tag, id) => { const el = new El(tag); el._document = document; if (id) { el.id = id; registry.set(id, el); } return el; };
  const root = make('div', 'workspace'); root.hidden = false;
  const bar = new El('div'); bar.className = 'workspace-bar'; root.append(bar);
  for (const id of ['project-menu', 'sidebar-toggle', 'sidebar', 'chat-panel', 'work-surface', 'prompt']) make('div', id);
  const window = { harness, previewLayout: null, calmWorkspace: null, profileSaveQueued };
  const context = {
    document, window, registry,
    localStorage: { getItem: key => (key in store ? store[key] : null), setItem: (key, value) => { store[key] = String(value); }, removeItem: key => { delete store[key]; } },
    matchMedia: query => ({ matches: query.includes('prefers-color-scheme') ? systemDark : false, addEventListener: () => {} }),
    MutationObserver: class { observe() {} },
    node: (tag, text, className) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
  };
  vm.runInNewContext(calm, context);
  return {
    document, registry, body: document.body, window: context.window, store,
    themeButton: () => registry.get('project-menu').children.find(child => child.id === 'workspace-theme')
  };
}

test('workspace-calm: start-hintet afgør temaet, og den gamle nøgle læses ikke', () => {
  const store = { 'harness-workspace-theme-v1': 'light', 'aura.theme-hint.v1': 'dark' };
  const run = runCalm({ store, systemDark: false });
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'hint-nøglen vinder ved start');
  assert.equal(run.themeButton().getAttribute('aria-checked'), 'true');
  const fresh = runCalm({ store: { 'harness-workspace-theme-v1': 'dark' }, systemDark: false });
  assert.equal(fresh.body.dataset.workspaceTheme, 'light', 'uden hint følges systemet — den gamle nøgle er ikke længere kilde');
});

test('workspace-calm: hintet "system" og et fraværende hint følger systemet', () => {
  assert.equal(runCalm({ store: { 'aura.theme-hint.v1': 'system' }, systemDark: true }).body.dataset.workspaceTheme, 'dark');
  assert.equal(runCalm({ store: { 'aura.theme-hint.v1': 'system' }, systemDark: false }).body.dataset.workspaceTheme, 'light');
  assert.equal(runCalm({ store: {}, systemDark: true }).body.dataset.workspaceTheme, 'dark');
  assert.equal(runCalm({ store: {}, systemDark: false }).body.dataset.workspaceTheme, 'light');
});

test('workspace-calm: temaknappen skifter synkront, skriver hintet og gemmer kun sit eget felt', async () => {
  const saves = [];
  const announced = [];
  const harness = {
    profileGet: async () => ({ ok: true, value: { profile: { appearance: { theme: 'dark', panelOpen: false } } } }),
    profileSave: async value => { saves.push(value); return { ok: true, value: { profile: { appearance: { ...value.appearance }, name: 'Gemt' } } }; }
  };
  const capture = { queued: ProfileSave.queued, saved: profile => announced.push(profile) };
  const run = runCalm({ store: {}, harness, systemDark: true, profileSaveQueued: capture });
  const button = run.themeButton();
  assert.equal(run.body.dataset.workspaceTheme, 'dark');
  button.click();
  // The visual change and the hint copy happen before any IPC answer lands.
  assert.equal(run.body.dataset.workspaceTheme, 'light');
  assert.equal(run.store['aura.theme-hint.v1'], 'light');
  assert.equal(run.store['harness-workspace-theme-v1'], undefined, 'den gamle nøgle skrives aldrig');
  assert.equal(saves.length, 0, 'profilgemningen er stadig i gang — det visuelle er synkront først');
  await flush(); await flush();
  // Appearance merges main-side: the button owns only the theme and never
  // fetches the profile first — a stale panelOpen can no longer race back.
  assert.deepEqual(plain(saves), [{ appearance: { theme: 'light' } }], 'kun temafeltet sendes gennem den delte kø');
  assert.deepEqual(plain(announced), [{ appearance: { theme: 'light' }, name: 'Gemt' }], 'den gemte profil annonceres som aura:profile-saved');
  assert.equal(button.getAttribute('aria-checked'), 'false');
  button.click();
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'knappen cykler tilbage');
  await flush(); await flush();
  assert.deepEqual(plain(saves[1]), { appearance: { theme: 'dark' } });
});

test('workspace-calm: et hurtigt dobbeltklik gemmer begge skrift i rækkefølge — ingen afvises', async () => {
  const saves = [];
  const order = [];
  const gate = new Promise(resolve => { order.release = resolve; });
  const harness = {
    profileSave: async value => { saves.push(value); if (saves.length === 1) await gate; return { ok: true, value: { profile: { appearance: { ...value.appearance } } } }; }
  };
  const run = runCalm({ store: {}, harness, systemDark: true });
  const button = run.themeButton();
  button.click();
  button.click();
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'skærmen viser det sidste klik');
  await flush(); await flush();
  assert.equal(saves.length, 1, 'den første gemning er alene i køen — exclusive() afviser ingen');
  order.release();
  await flush(); await flush();
  assert.deepEqual(plain(saves), [{ appearance: { theme: 'light' } }, { appearance: { theme: 'dark' } }], 'begge skrift når profilen i klikrækkefølgen');
  assert.deepEqual(run.store['aura.theme-hint.v1'], 'dark', 'hintet følger det sidste klik');
});

test('workspace-calm: en fejlslagen gemning crasjer ikke — hintet beholder sessens valg', async () => {
  const saves = [];
  const harness = {
    profileSave: async value => { saves.push(value); return { ok: false, error: 'Datamappen er låst.' }; }
  };
  const run = runCalm({ store: {}, harness, systemDark: false });
  run.themeButton().click();
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'det visuelle valg skifter straks alligevel');
  await flush(); await flush();
  assert.deepEqual(plain(saves), [{ appearance: { theme: 'dark' } }], 'gemningen er forsøgt gennem køen');
  assert.equal(run.store['aura.theme-hint.v1'], 'dark', 'hintet beholder sessens valg, mens profilen forbliver kilden');
});

test('workspace-calm: setTheme opdaterer hintet og arbejdsvisningen for profilens skrivere', () => {
  const run = runCalm({ store: {}, systemDark: true });
  assert.equal(typeof run.window.calmWorkspace.setTheme, 'function', 'setTheme er en del af calmWorkspace-fladen');
  run.window.calmWorkspace.setTheme('light');
  assert.equal(run.store['aura.theme-hint.v1'], 'light');
  assert.equal(run.body.dataset.workspaceTheme, 'light');
  run.window.calmWorkspace.setTheme('system');
  assert.equal(run.store['aura.theme-hint.v1'], 'system', 'hintet er en kopi af hele temavalget');
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'system følger prefers-color-scheme');
});

// app.js — the profile-step save gives the theme to calmWorkspace right after
// the profile save, so the hint copy can never go stale against the profile.
test('app.js: en profilgemning med tema opdaterer hintet gennem calmWorkspace', async () => {
  const document = { listeners: {} };
  document.addEventListener = (name, handler) => { (document.listeners[name] ||= []).push(handler); };
  document.querySelectorAll = () => [];
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el._document = document; if (id) { el.id = id; registry.set(id, el); } return el; };
  const theme = make('fieldset', 'profile-theme');
  for (const value of ['system', 'light', 'dark']) { const input = new El('input'); input.type = 'radio'; input.value = value; input.checked = value === 'dark'; theme.append(input); }
  const help = make('select', 'profile-help'); help.value = 'fuld';
  const name = make('input', 'profile-name'); name.value = 'Anna';
  document.querySelectorAll = selector => selector.includes('profile-theme') ? theme.querySelectorAll('input') : [];
  document.body = new El('body');
  const saves = [];
  const themes = [];
  const announced = [];
  const context = {
    document,
    $: selector => registry.get(selector.replace(/^#/, '')),
    profileState: null,
    profileIconChoice: 'aura-2', profileAvatarAvailable: false,
    call: async (method, value) => {
      if (method === 'profileGet') return { profile: { helpLevel: 'fuld', appearance: { theme: 'dark' } }, warnings: [] };
      saves.push([method, value]); return { profile: { ...value }, warnings: [] };
    },
    window: { calmWorkspace: { setTheme: theme => themes.push(theme) }, dispatchEvent: event => announced.push(event) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    applyChatChoiceRecommendation: () => {}
  };
  vm.runInNewContext(`${appSlice('function profilePatch() {', 'async function prepareProfileStep')}\n${appSlice('async function saveProfileStep', '$(\'#profile-continue\').onclick')}`, context);
  await context.saveProfileStep();
  assert.deepEqual(plain(saves), [['profileSave', { name: 'Anna', icon: 'aura-2', helpLevel: 'fuld', appearance: { theme: 'dark', panelOpen: true } }]]);
  assert.deepEqual(themes, ['dark'], 'temaet gives videre straks efter gemningen');
  assert.equal(context.profileState.name, 'Anna', 'cachen følger den gemte profil med det samme');
  assert.deepEqual(announced.map(event => event.type), ['aura:profile-saved'], 'den gemte profil annonceres');
  assert.equal(announced[0].detail.name, 'Anna');
  // The step save applies the chosen help level right away: fuld leaves both
  // classes out, and the presentation call re-reads the saved profile.
  assert.equal(context.document.body.classList.contains('help-delvis'), false, 'gemningen i profil-trinnet anvender hjælpeniveauet straks');
  assert.equal(context.document.body.classList.contains('help-ingen'), false);
  // After a restart the same slice re-applies the presentation from the profile.
  await context.applyProfilePresentation();
  assert.equal(context.document.body.classList.contains('help-delvis'), false, 'fuld hjælp efterlader klassen ude');
  assert.equal(context.document.body.classList.contains('help-ingen'), false, 'fuld hjælp efterlader ingen-klassen ude');
  assert.deepEqual(themes, ['dark', 'dark'], 'opstarten giver temaet videre til calmWorkspace');
  const failingThemes = [];
  const failingAnnounced = [];
  const failing = { ...context, profileState: null, call: async () => { throw new Error('nøglecenter utilgængelig'); }, window: { calmWorkspace: { setTheme: theme => failingThemes.push(theme) }, dispatchEvent: event => failingAnnounced.push(event) } };
  vm.runInNewContext(`${appSlice('function profilePatch() {', 'async function prepareProfileStep')}\n${appSlice('async function saveProfileStep', '$(\'#profile-continue\').onclick')}`, failing);
  await failing.saveProfileStep();
  assert.deepEqual(failingThemes, [], 'en mislykket gemning opdaterer ikke hintet');
  assert.deepEqual(failingAnnounced, [], 'en mislykket gemning annonceres aldrig');
  await assert.doesNotReject(() => failing.applyProfilePresentation(), 'en ulæselig profil stopper ikke opstarten');
  assert.deepEqual(failingThemes, [], 'ingen temaudbredelse uden profil');
});

// app.js — applyProfilePresentation maps all three help levels to their own
// body class: 'delvis' and 'ingen' each set one class, 'fuld' removes both.
test('app.js: applyProfilePresentation oversætter alle tre hjælpeniveauer til kropsklasser', async () => {
  const run = async level => {
    const document = { body: new El('body') };
    const context = {
      document,
      profileState: { helpLevel: level, appearance: { theme: 'system' } },
      window: { calmWorkspace: { setTheme: () => {} } }
    };
    vm.runInNewContext(appSlice('async function applyProfilePresentation', '// The profile is adopted'), context);
    await context.applyProfilePresentation();
    return document.body.classList;
  };
  assert.equal((await run('delvis')).contains('help-delvis'), true, 'delvis sætter sin klasse');
  assert.equal((await run('delvis')).contains('help-ingen'), false, 'delvis sætter ikke ingen-klassen');
  assert.equal((await run('ingen')).contains('help-ingen'), true, 'ingen sætter sin klasse');
  assert.equal((await run('ingen')).contains('help-delvis'), false, 'ingen sætter ikke delvis-klassen');
  assert.equal((await run('fuld')).contains('help-delvis'), false, 'fuld fjerner delvis-klassen');
  assert.equal((await run('fuld')).contains('help-ingen'), false, 'fuld fjerner ingen-klassen');
});

// app.js — the transcript detail level follows the same presentation pass:
// every level carries its own body class, and an unreadable value folds to
// the neutral 'standard' (help level and detail level stay independent).
test('app.js: applyProfilePresentation oversætter alle tre detaljeniveauer til kropsklasser', async () => {
  const run = async transcriptView => {
    const document = { body: new El('body') };
    const context = {
      document,
      profileState: { helpLevel: 'fuld', transcriptView, appearance: { theme: 'system' } },
      window: { calmWorkspace: { setTheme: () => {} } }
    };
    vm.runInNewContext(appSlice('async function applyProfilePresentation', '// The profile is adopted'), context);
    await context.applyProfilePresentation();
    return document.body.classList;
  };
  for (const view of ['compact', 'standard', 'detailed']) {
    const classes = await run(view);
    assert.equal(classes.contains(`transcript-${view}`), true, `${view} sætter sin egen klasse`);
    for (const other of ['compact', 'standard', 'detailed']) if (other !== view) assert.equal(classes.contains(`transcript-${other}`), false, `${view} lader ${other}s klasse være ude`);
    assert.equal(classes.contains('help-delvis'), false, 'detaljeniveauet rører ikke hjælpeniveaus klasser');
  }
  // An unreadable value folds to the neutral standard — the class set is the
  // same as a fresh profile's.
  for (const bad of [undefined, 'ultra', null]) {
    const classes = await run(bad);
    assert.equal(classes.contains('transcript-standard'), true, `${String(bad)} folder til standard-klassen`);
    assert.equal(classes.contains('transcript-compact'), false);
    assert.equal(classes.contains('transcript-detailed'), false);
  }
});

// Hint key has exactly one writer: workspace-calm.js. settings.js only
// calls calmWorkspace.setTheme — the double write is gone.
test('hintnøglen har én skriver, og den gamle nøgle er borte', () => {
  const settingsSource = fs.readFileSync(path.join(ui, 'settings.js'), 'utf8');
  assert.ok(!settingsSource.includes('setItem'), 'settings.js skriver ikke selv til den lokale lagring');
  assert.ok(!settingsSource.includes('workspaceTheme'), 'settings.js skriver ikke selv til body-datasættet');
  assert.ok(settingsSource.includes('themeHost()?.setTheme?.(choice)'), 'settings.js håndterer temaet gennem temamodulet');
  assert.ok(calm.includes("'aura.theme-hint.v1'"), 'workspace-calm.js læser og skriver hintnøglen som den eneste skriver');
  assert.ok(!calm.includes('harness-workspace-theme-v1'), 'workspace-calm.js bruger ikke længere den gamle temanøgle');
});

// Help levels "delvis" and "ingen": only the designated standing hints are
// hidden — never privacy texts, warnings, approvals or "Før du sender"
// content. The "?" button is the only extra affordance and only at 'delvis'.
// The resume notice's caveat is a data-sharing text and carries the essential
// marking, so the hiding selectors exempt essential-marked hints: the rule
// can never match it, at either level.
test('settings.css: delvis og ingen skjuler udelukkende de udpegede hint — aldrig essentielle', () => {
  const settingsCss = fs.readFileSync(path.join(ui, 'settings.css'), 'utf8');
  const designated = [
    '#composer-shortcut',
    '#resume-notice .hint:not([data-help="essential"])',
    '#idea-options .hint:not([data-help="essential"])'
  ];
  const selectors = [...settingsCss.matchAll(/body\.help-(?:delvis|ingen)[^\n{]*?(?=\s*[,{])/g)]
    .map(match => match[0].trim())
    .filter(selector => !selector.includes('#composer-help'));
  assert.deepEqual(selectors, [
    'body.help-delvis #composer-shortcut',
    'body.help-delvis #resume-notice .hint:not([data-help="essential"])',
    'body.help-delvis #idea-options .hint:not([data-help="essential"])',
    'body.help-ingen #composer-shortcut',
    'body.help-ingen #resume-notice .hint:not([data-help="essential"])',
    'body.help-ingen #idea-options .hint:not([data-help="essential"])'
  ], 'udelukkende genvejslinjen og projektintroens forklaringer skjules — resume-hintet er undtaget som essentielt, ved begge niveauer');
  // Every hiding selector is one of the designated hints: nothing else can
  // ever be caught by a help-level rule, at either level.
  for (const selector of selectors) {
    const bare = selector.replace(/^body\.help-(?:delvis|ingen)\s*/, '');
    assert.ok(designated.includes(bare), `${selector} er et udpeget hint — intet andet må skjules`);
  }
  assert.match(settingsCss, /body\.help-delvis[^}]*\{\s*display:\s*none/, 'reglen skjuler med display: none');
  assert.match(settingsCss, /Help levels "delvis" and "ingen"/, 'kommentaren forklarer udpegelsen');
  assert.ok(!settingsCss.includes('help-minimal'), 'det gamle to-trins-mønster er helt væk');
  // The "?" button: only 'delvis' shows it, and the hidden attribute wins over
  // the body class, so a surface without hints never offers an empty popover.
  assert.match(settingsCss, /body\.help-delvis #composer-help:not\(\[hidden\]\)\s*\{\s*display:\s*inline-flex/, '"?"-knappen står kun frem ved delvis');
  assert.ok(!/body\.help-ingen[^{]*#composer-help/.test(settingsCss), 'ingen hjælp skjuler også "?"-knappen');
  const showRules = [...settingsCss.matchAll(/([^{}]*#composer-help[^{}]*)\{[^}]*display:\s*inline-flex/g)].map(match => match[1].trim());
  assert.deepEqual(showRules, ['body.help-delvis #composer-help:not([hidden])'], 'den eneste fremvisningsregel kræver både delvis-klassen og et grundlag at vise');
  for (const file of fs.readdirSync(ui).filter(name => name.endsWith('.css'))) {
    if (file === 'settings.css') continue;
    const css = fs.readFileSync(path.join(ui, file), 'utf8');
    assert.ok(!css.includes('help-delvis') && !css.includes('help-ingen') && !css.includes('help-minimal'), `${file} har ingen hjælpeniveau-regler`);
  }
  // The index markup keeps the designated targets; the rule set above is the
  // exhaustive list, so approvals and privacy content can never be hidden.
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.ok(index.includes('id="composer-shortcut"'), 'composer-genvejslinjen findes');
  assert.ok(index.includes('id="resume-notice"'), 'resume-bemærkningen findes');
  assert.ok(index.includes('id="idea-options"'), 'projektintroens ønsker findes');
  // The resume caveat itself is marked essential: the hiding rule never
  // matches it, so the data-sharing text stands at every help level.
  const resume = index.slice(index.indexOf('id="resume-notice"'), index.indexOf('</details>', index.indexOf('id="resume-notice"')));
  assert.ok(/class="hint" data-help="essential"/.test(resume), 'resume-hintet er markeret data-help="essential" i teksten');
});

// The essential surfaces — privacy texts, warnings, approvals, "Før du sender"
// and consent, and the resume notice's data-sharing caveat — carry
// data-help="essential" in the markup. No help-level rule can ever match them
// (directly or as a subtree), so they stay displayed at every level — also at
// 'ingen', where nothing else survives.
test('settings.css og index.html: essential-fladerne vises altid — også ved ingen hjælp', () => {
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  const settingsCss = fs.readFileSync(path.join(ui, 'settings.css'), 'utf8');
  const essentialIds = ['connection-warning', 'approvals', 'data-dialog', 'startup-warning', 'hosting-consent'];
  for (const id of essentialIds) {
    assert.ok(new RegExp(`<[^>]*id="${id}"[^>]*data-help="essential"`).test(index), `${id} er markeret data-help="essential" i teksten`);
  }
  // The resume notice's caveat is a data-sharing text: it carries the marking
  // where it lives (inside #resume-notice), so the level rules exempt it.
  const resume = index.slice(index.indexOf('id="resume-notice"'), index.indexOf('</details>', index.indexOf('id="resume-notice"')));
  assert.ok(/class="hint" data-help="essential"/.test(resume), 'resume-hintet om tidligere delte referencer er markeret essential');
  // The privacy gate's dynamic elements carry the same annotation.
  const privacyGate = fs.readFileSync(path.join(ui, 'privacy-gate.js'), 'utf8');
  assert.ok((privacyGate.match(/setAttribute\('data-help', 'essential'\)/g) || []).length >= 3, 'privacy-fladerne fra privacy-gate bærer også markeringen');
  // #approvals is swapped per conversation view (mountView): the replacement
  // carries the annotation too, or the guarantee would die with the first chat.
  const appSource = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
  assert.match(appSource, /v\.approvals\.setAttribute\('data-help', 'essential'\)/, 'hver samtalevisnings godkendelsesflade er markeret essential fra fødslen');
  // No help-level selector names an essential element: 'ingen' can therefore
  // never hide a warning, an approval, the send review or a consent surface.
  for (const match of settingsCss.matchAll(/body\.help-(?:delvis|ingen)[^\n{]*?(?=\s*[,{])/g)) {
    for (const id of essentialIds) assert.ok(!match[0].includes(`#${id}`), `${match[0]} må ikke ramme ${id}`);
  }
  // No rule anywhere can match an element annotated as essential: a selector
  // may mention the marking only inside its :not([data-help="essential"])
  // exemption guard — anything else would be a hiding rule against an
  // essential surface. Comments are stripped first, so only real selectors
  // are scanned.
  const rules = settingsCss.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const rule of rules.matchAll(/([^{}]+)\{[^}]*display:\s*none/g)) {
    const bare = rule[1].replace(/:not\(\[data-help="essential"\]\)/g, '');
    assert.ok(!bare.includes('data-help='), `settings.css må aldrig kunne ramme en essential-flade: ${rule[1].trim()}`);
  }
});
