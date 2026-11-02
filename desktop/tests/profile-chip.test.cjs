// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ProfileIcons = require('../ui/profile-icons.js');

// Profil-chippen i sidepanelets bund (fund 14): ikon ELLER initialer-cirkel +
// navn, opdateret fra aura:profile og aura:profile-saved, og et klik åbner
// Indstillinger › Din profil. Modulet køres i et vm-rige med en falsk rod.
const ui = path.join(__dirname, '..', 'ui');
const source = fs.readFileSync(path.join(ui, 'profile-chip.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const stylesSource = fs.readFileSync(path.join(ui, 'styles.css'), 'utf8');

class El {
  constructor(id) { this.id = id; this.attributes = new Map(); this.children = []; this.listeners = {}; this.hidden = false; this._text = ''; this._html = ''; this.value = ''; }
  set innerHTML(value) { this._html = String(value); this.children = []; }
  get innerHTML() { return this._html; }
  set textContent(value) { this._text = String(value); this._html = ''; this.children = []; }
  get textContent() { return this._text; }
  get title() { return this.attributes.get('title') || ''; }
  set title(value) { this.attributes.set('title', String(value)); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, event = {}) { for (const handler of this.listeners[name] || []) handler(event); }
}
function makeModule({ profile = null } = {}) {
  const registry = new Map();
  for (const id of ['profile-chip', 'profile-chip-mark', 'profile-chip-name']) registry.set(id, new El(id));
  const document = { getElementById: id => registry.get(id) || null };
  const listeners = {};
  const opened = [];
  const root = {
    document,
    ProfileIcons,
    SettingsDialog: { open: section => opened.push(section) },
    addEventListener: (name, handler) => { (listeners[name] ||= []).push(handler); },
  };
  vm.runInNewContext(source, { window: root, module: undefined, exports: undefined });
  return { root, registry, listeners, opened, api: root.profileChip };
}
const plain = value => JSON.parse(JSON.stringify(value));

test('chippen viser profilens ikon og navn og er skjult uden begge', () => {
  const f = makeModule();
  for (const handler of f.listeners['aura:profile']) handler({ detail: { name: 'Anna Klit', icon: 'moon' } });
  const chip = f.registry.get('profile-chip');
  assert.equal(chip.hidden, false, 'chippen vises med navn og ikon');
  assert.equal(chip.getAttribute('aria-label'), 'Din profil: Anna Klit');
  assert.ok(f.registry.get('profile-chip-mark').innerHTML.includes('<svg'), 'ikonets glyf tegnes');
  assert.equal(f.registry.get('profile-chip-name').textContent, 'Anna Klit');
  for (const handler of f.listeners['aura:profile-saved']) handler({ detail: { name: '', icon: '' } });
  assert.equal(chip.hidden, true, 'uden navn og ikon er der intet ærligt at vise');
});

test('uden ikon viser chippen initialerne fra ProfileIcons', () => {
  const f = makeModule();
  for (const handler of f.listeners['aura:profile']) handler({ detail: { name: 'Anna Klit', icon: '' } });
  const chip = f.registry.get('profile-chip');
  assert.equal(chip.hidden, false);
  assert.equal(f.registry.get('profile-chip-mark').textContent, 'AK', 'initialerne beregnes af ProfileIcons');
  assert.equal(f.registry.get('profile-chip-name').textContent, 'Anna Klit');
  assert.equal(chip.getAttribute('aria-label'), 'Din profil: Anna Klit');
});

test('kun et ikon er også et gyldigt grundlag — mærket nævner ikonet', () => {
  const f = makeModule();
  for (const handler of f.listeners['aura:profile-saved']) handler({ detail: { name: '', icon: 'star' } });
  const chip = f.registry.get('profile-chip');
  assert.equal(chip.hidden, false);
  assert.equal(chip.getAttribute('aria-label'), 'Din profil: Stjerne');
  assert.ok(f.registry.get('profile-chip-mark').innerHTML.includes('<svg'));
});

test('et ukendt ikon falder tilbage til initialerne', () => {
  const f = makeModule();
  for (const handler of f.listeners['aura:profile']) handler({ detail: { name: 'Bo Larsen', icon: 'drage' } });
  assert.equal(f.registry.get('profile-chip-mark').textContent, 'BL', 'ukendte ikon-id\'er tegner intet og bruger initialerne');
  assert.equal(f.registry.get('profile-chip').hidden, false);
});

test('klik åbner Indstillinger › Din profil, og begge hændelser opdaterer', () => {
  const f = makeModule();
  const chip = f.registry.get('profile-chip');
  chip.emit('click');
  assert.deepEqual(f.opened, ['profile'], 'chippen er en ærlig vej til profilsektionen');
  for (const handler of f.listeners['aura:profile']) handler({ detail: { name: 'Første', icon: '' } });
  assert.equal(f.registry.get('profile-chip-name').textContent, 'Første', 'opstartens læsning opdaterer chippen');
  for (const handler of f.listeners['aura:profile-saved']) handler({ detail: { name: 'Efter', icon: '' } });
  assert.equal(f.registry.get('profile-chip-name').textContent, 'Efter', 'hver gemning opdaterer chippen');
});

test('modulet er inert uden chip i dokumentet — og index/styles/manifest er i tråd', async () => {
  const inert = (() => {
    const root = { document: { getElementById: () => null }, ProfileIcons };
    vm.runInNewContext(source, { window: root, module: undefined, exports: undefined });
    assert.equal(root.profileChip.render({ name: 'Anna' }), undefined, 'uden chip gør render intet');
  })();
  assert.equal(inert, undefined);
  // Chippen står i sidepanelets bund, modulet indlæses før app.js, og stilen
  // bruger DSH-tokens med en eksplisit [hidden]-regel (display:flex ville
  // ellers overskrive hidden-attributten).
  assert.ok(indexSource.includes('id="profile-chip"'), 'chippen findes i index.html');
  assert.ok(indexSource.indexOf('sidebar-bottom') < indexSource.indexOf('id="profile-chip"'), 'chippen ligger i sidepanelets bund');
  assert.ok(indexSource.includes('<script src="profile-chip.js" defer></script>'), 'chip-modulet indlæses');
  assert.ok(indexSource.indexOf('src="profile-chip.js"') < indexSource.indexOf('src="app.js"'), 'modulet er klar, før app.js udsender hændelserne');
  assert.match(stylesSource, /\.profile-chip\[hidden\]\s*\{\s*display:\s*none/, 'skjult chip er skjult også med display:flex');
  for (const token of ['--line', '--surface', '--ink', '--accent', '--tint']) assert.ok(stylesSource.includes(token), `stilen bruger DSH-tokenet ${token}`);
  const { FILES } = require('../core/ui-assets.cjs');
  assert.ok(FILES.includes('profile-chip.js'), 'manifestet kender chip-modulet');
  assert.ok(FILES.includes('profile-save.js'), 'manifestet kender den delte gemkø');
});
