// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Theme and help-level slice: main.cjs sets Electron's theme source from the
// profile before the window exists, workspace-calm.js reads the synchronous
// hint copy (aura.theme-hint.v1) and saves through the profile, settings.js
// applies theme and help class after each save, and the help-minimal CSS hides
// only the designated hints. Real source slices run in synthetic contexts.
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
  assert.equal(context.nativeTheme.themeSource, 'default', "'system' følger operativsystemet");
  context.applyProfileTheme(undefined);
  assert.equal(context.nativeTheme.themeSource, 'default', 'et ukendt tema giver aldrig et tvangstema');
});

test('main.cjs: profilen læses og temaet sættes, før vinduet skabes', async () => {
  const call = 'applyProfileTheme((await profileStore().get()).profile.appearance.theme)';
  const line = mainSlice(`try { ${call}`, '\n');
  const applied = [];
  const context = {
    applyProfileTheme: theme => applied.push(theme),
    profileStore: () => ({ get: async () => ({ profile: { appearance: { theme: 'dark' } } }) })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, context);
  assert.deepEqual(applied, ['dark'], 'profilens tema sættes ved opstart');
  const failing = {
    applyProfileTheme: theme => applied.push(theme),
    profileStore: () => ({ get: async () => { throw new Error('datamappen er låst'); } })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, failing);
  assert.deepEqual(applied, ['dark'], 'en ulæselig profil efterlader systemtemaet og stopper ikke opstarten');
  assert.ok(main.indexOf(call) < main.indexOf('createWindow();'), 'temaet håndhæves før createWindow()');
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
function runCalm({ store = {}, harness = null, systemDark = false } = {}) {
  const document = { activeElement: null, listeners: {} };
  document.addEventListener = (name, handler) => { (document.listeners[name] ||= []).push(handler); };
  const registry = new Map();
  document.getElementById = id => registry.get(id) || null;
  document.body = new El('body'); document.body._document = document;
  const make = (tag, id) => { const el = new El(tag); el._document = document; if (id) { el.id = id; registry.set(id, el); } return el; };
  const root = make('div', 'workspace'); root.hidden = false;
  const bar = new El('div'); bar.className = 'workspace-bar'; root.append(bar);
  for (const id of ['project-menu', 'sidebar-toggle', 'sidebar', 'chat-panel', 'work-surface', 'prompt']) make('div', id);
  const window = { harness, previewLayout: null, calmWorkspace: null };
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

test('workspace-calm: temaknappen skifter synkront, skriver hintet og gemmer appearance-enheden', async () => {
  const saves = [];
  const harness = {
    profileGet: async () => ({ ok: true, value: { profile: { appearance: { theme: 'dark', panelOpen: false } } } }),
    profileSave: async value => { saves.push(value); return { ok: true, value: { profile: {} } }; }
  };
  const run = runCalm({ store: {}, harness, systemDark: true });
  const button = run.themeButton();
  assert.equal(run.body.dataset.workspaceTheme, 'dark');
  button.click();
  // The visual change and the hint copy happen before any IPC answer lands.
  assert.equal(run.body.dataset.workspaceTheme, 'light');
  assert.equal(run.store['aura.theme-hint.v1'], 'light');
  assert.equal(run.store['harness-workspace-theme-v1'], undefined, 'den gamle nøgle skrives aldrig');
  assert.equal(saves.length, 0, 'profilgemningen er stadig i gang — det visuelle er synkront først');
  await flush(); await flush();
  assert.deepEqual(plain(saves), [{ appearance: { theme: 'light', panelOpen: false } }], 'appearance gemmes som én enhed med panelOpen fra profilen');
  assert.equal(button.getAttribute('aria-checked'), 'false');
  button.click();
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'knappen cykler tilbage');
  await flush(); await flush();
  assert.deepEqual(plain(saves[1]), { appearance: { theme: 'dark', panelOpen: false } });
});

test('workspace-calm: en fejlslagen profilhentning gemmer intet og crasjer ikke', async () => {
  const saves = [];
  const harness = {
    profileGet: async () => ({ ok: false, error: 'Datamappen er låst.' }),
    profileSave: async value => { saves.push(value); return { ok: true, value: {} }; }
  };
  const run = runCalm({ store: {}, harness, systemDark: false });
  run.themeButton().click();
  assert.equal(run.body.dataset.workspaceTheme, 'dark', 'det visuelle valg skifter straks alligevel');
  await flush(); await flush();
  assert.deepEqual(saves, [], 'profilen røres ikke, når den ikke kan læses');
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
  const context = {
    document,
    $: selector => registry.get(selector.replace(/^#/, '')),
    profileIconChoice: 'bird',
    call: async (method, value) => {
      if (method === 'profileGet') return { profile: { helpLevel: 'fuld', appearance: { theme: 'dark' } }, warnings: [] };
      saves.push([method, value]); return { profile: value, warnings: [] };
    },
    window: { calmWorkspace: { setTheme: theme => themes.push(theme) } }
  };
  vm.runInNewContext(`${appSlice('function profilePatch() {', 'async function prepareProfileStep')}\n${appSlice('async function saveProfileStep', '$(\'#profile-continue\').onclick')}`, context);
  await context.saveProfileStep();
  assert.deepEqual(plain(saves), [['profileSave', { name: 'Anna', icon: 'bird', helpLevel: 'fuld', appearance: { theme: 'dark', panelOpen: true } }]]);
  assert.deepEqual(themes, ['dark'], 'temaet gives videre straks efter gemningen');
  // After a restart the same slice re-applies the presentation from the profile.
  await context.applyProfilePresentation();
  assert.equal(context.document.body.classList.contains('help-minimal'), false, 'fuld hjælp efterlader klassen ude');
  assert.deepEqual(themes, ['dark', 'dark'], 'opstarten giver temaet videre til calmWorkspace');
  const failingThemes = [];
  const failing = { ...context, call: async () => { throw new Error('nøglecenter utilgængelig'); }, window: { calmWorkspace: { setTheme: theme => failingThemes.push(theme) } } };
  vm.runInNewContext(`${appSlice('function profilePatch() {', 'async function prepareProfileStep')}\n${appSlice('async function saveProfileStep', '$(\'#profile-continue\').onclick')}`, failing);
  await failing.saveProfileStep();
  assert.deepEqual(failingThemes, [], 'en mislykket gemning opdaterer ikke hintet');
  await assert.doesNotReject(() => failing.applyProfilePresentation(), 'en ulæselig profil stopper ikke opstarten');
  assert.deepEqual(failingThemes, [], 'ingen temaudbredelse uden profil');
});

// The hint key must be one key across both writers.
test('hint-nøglen aura.theme-hint.v1 er fælles for skriverne, og den gamle nøgle er borte', () => {
  const settingsSource = fs.readFileSync(path.join(ui, 'settings.js'), 'utf8');
  assert.ok(settingsSource.includes("'aura.theme-hint.v1'"), 'settings.js skriver hintnøglen');
  assert.ok(calm.includes("'aura.theme-hint.v1'"), 'workspace-calm.js læser og skriver hintnøglen');
  assert.ok(!calm.includes('harness-workspace-theme-v1'), 'workspace-calm.js bruger ikke længere den gamle temanøgle');
});

// Help level "minimal": only the designated hints are hidden — never privacy
// texts, warnings, approvals or "Før du sender" content.
test('settings.css: help-minimal skjuler udelukkende de tre udpegede hint', () => {
  const settingsCss = fs.readFileSync(path.join(ui, 'settings.css'), 'utf8');
  const selectors = [...settingsCss.matchAll(/body\.help-minimal[^\n{]*?(?=\s*[,{])/g)].map(match => match[0].trim());
  assert.deepEqual(selectors, [
    'body.help-minimal #composer-shortcut',
    'body.help-minimal #resume-notice .hint',
    'body.help-minimal #idea-options .hint'
  ], 'udelukkende genvejslinjen, resume-hintet og projektintroens forklaringer skjules');
  assert.match(settingsCss, /body\.help-minimal[^}]*\{\s*display:\s*none/, 'reglen skjuler med display: none');
  assert.match(settingsCss, /Help level "minimal"/, 'kommentaren forklarer udpegelsen');
  for (const file of fs.readdirSync(ui).filter(name => name.endsWith('.css'))) {
    if (file === 'settings.css') continue;
    const css = fs.readFileSync(path.join(ui, file), 'utf8');
    assert.ok(!css.includes('help-minimal'), `${file} har ingen help-minimal-regler`);
  }
  // The index markup keeps the designated targets; the rule set above is the
  // exhaustive list, so approvals and privacy content can never be hidden.
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.ok(index.includes('id="composer-shortcut"'), 'composer-genvejslinjen findes');
  assert.ok(index.includes('id="resume-notice"'), 'resume-bemærkningen findes');
  assert.ok(index.includes('id="idea-options"'), 'projektintroens ønsker findes');
});
