const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ICON_IDS, blank } = require('../core/profile.cjs');
const ProfileIcons = require('../ui/profile-icons.js');

// app.js is a renderer script, so the profile step is exercised by running the exact
// setup slices in a synthetic DOM, the same way history-navigation.test.cjs runs the
// transcript code. The fixture mirrors the #setup tree from index.html.
const ui = path.join(__dirname, '..', 'ui');
const app = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
function slice(from, to) {
  const start = app.indexOf(from);
  assert.ok(start >= 0, `app.js mangler "${from}"`);
  const end = app.indexOf(to, start);
  assert.ok(end > start, `app.js mangler "${to}" efter "${from}"`);
  return app.slice(start, end);
}
const setupCode = [
  slice("let onboardingPreviewKind = '';", 'function providerPicker'),
  slice('async function showSetup', 'function connectionFailed'),
  slice('async function leaveSetup', "$('#setup-local').onclick"),
  slice("$('#setup-back').onclick", 'function demoPreview')
].join('\n');

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = ''; this._html = '';
    this.hidden = false; this.disabled = false; this.value = ''; this.checked = false; this.type = ''; this.id = '';
    this.style = {}; this.onclick = null; this.onchange = null;
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
  set innerHTML(value) { this._html = String(value); }
  get innerhtml() { return this._html; }
  get innerHTML() { return this._html; }
  get selectedOptions() { return this.value ? [{ textContent: this.value }] : []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { if (child instanceof El) child.parentElement = this; this.children.push(child); } }
  prepend(...children) { for (const child of children) if (child instanceof El) child.parentElement = this; this.children.unshift(...children); }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  focus() { this.focused = true; }
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
function makeDom() {
  const body = new El('body');
  const document = { body, createElement: tag => new El(tag), querySelector: selector => document.querySelectorAll(selector)[0] || null, querySelectorAll: selector => selectWithin(body, selector) };
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); if (id) { el.id = id; registry.set(id, el); } return el; };
  const setup = make('main', 'setup'); body.append(setup);
  const topbar = new El('div'); setup.append(topbar); topbar.append(make('button', 'setup-back'));
  const heading = new El('div'); setup.append(heading);
  heading.append(make('p', 'setup-eyebrow'), make('h1', 'setup-title'), make('p', 'setup-subtitle'));
  const quick = new El('div'); quick.className = 'setup-quick-actions'; setup.append(quick);
  quick.append(make('button', 'setup-local'), make('button', 'setup-advanced'), make('button', 'setup-remove-all'));
  const progress = new El('ol'); progress.className = 'onboarding-b-progress'; setup.append(progress);
  const labels = { profile: 'Din profil', connection: 'Forbindelse', features: 'Funktioner', idea: 'Din idé' };
  for (const phase of ['profile', 'connection', 'features', 'idea']) {
    const item = new El('li'); item.dataset.phase = phase;
    const number = new El('span'); number.textContent = String(['profile', 'connection', 'features', 'idea'].indexOf(phase) + 1);
    item.append(number, labels[phase]); progress.append(item);
  }
  setup.append(make('p', 'setup-reason'));
  const layout = new El('div'); setup.append(layout);
  const content = new El('div'); content.className = 'onboarding-b-content'; layout.append(content);
  const sections = { 'setup-profile': 'profile', 'setup-choice': 'choice', 'setup-provider': 'provider', 'setup-local-step': 'local', 'setup-saved': 'saved', 'setup-tools': 'tools', 'setup-features': 'features', 'setup-features-pick': 'features-pick' };
  for (const [id, step] of Object.entries(sections)) { const section = make('section', id); section.dataset.setupStep = step; section.hidden = id !== 'setup-choice'; content.append(section); }
  const profile = registry.get('setup-profile');
  profile.append(make('input', 'profile-name'));
  const grid = make('div', 'profile-icon-grid'); grid.className = 'profile-icon-grid'; profile.append(grid);
  const theme = make('fieldset', 'profile-theme'); profile.append(theme);
  for (const value of ['system', 'light', 'dark']) { const label = new El('label'); const input = make('input'); input.type = 'radio'; input.value = value; input.checked = value === 'system'; label.append(input); theme.append(label); }
  profile.append(make('select', 'profile-help'));
  profile.append(make('button', 'profile-continue'));
  layout.append(make('aside', 'setup-visual'));
  return { document, registry, progress };
}
function runSetup({ profile = blank(), suggestion = 'Parthee', repeat = null } = {}) {
  const dom = makeDom();
  const saves = [], calls = [], visuals = [], store = {};
  const harness = {
    profileGet: async () => { calls.push('profileGet'); return { profile: typeof profile === 'function' ? profile() : { ...profile }, warnings: [] }; },
    profileSave: async value => { calls.push('profileSave'); saves.push(value); return { profile: value, warnings: [] }; },
    profileSuggest: async () => { calls.push('profileSuggest'); return suggestion; }
  };
  const $ = selector => {
    const found = dom.document.querySelector(selector);
    if (found || !/^#[A-Za-z0-9_-]+$/.test(selector)) return found;
    if (!dom.registry.has(selector.slice(1))) { const el = new El('div'); el.id = selector.slice(1); dom.registry.set(selector.slice(1), el); }
    return dom.registry.get(selector.slice(1));
  };
  const context = {
    $, document: dom.document,
    window: { OnboardingB: { render: (element, state) => visuals.push(state.phase) }, ProfileIcons, scrollTo: () => {} },
    node: (tag, text, className) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; },
    state: { connections: [], features: { chosen: true } },
    current: null, projectLoading: false, setupActive: false, setupStep: 'choice', guidedSetup: false,
    repeatSetup: repeat, pendingAI: false, verifiedConnection: '', setupGeneration: 0, localDiscoveryGeneration: 0,
    connectionChecks: { get: () => undefined }, acceptedFingerprint: null, pendingSend: null, connectionReceipt: null,
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    action: async fn => fn(),
    renderSetup: () => {}, discoverLocal: async () => {}, completeIntroduction: () => {}, clearConnectionReceipt: () => {},
    loadModels: async () => {}, applyFeatures: () => {}, providerPicker: () => {}, syncCreateAvailability: () => {},
    showIntroduction: () => { context.introductions = (context.introductions || 0) + 1; }
  };
  vm.runInNewContext(setupCode, context);
  return { context, $, document: dom.document, registry: dom.registry, progress: dom.progress, harness, saves, calls, visuals };
}
const progressItem = (fixture, phase) => fixture.progress.children.find(item => item.dataset.phase === phase);
// Objects created inside the vm context belong to another realm; a JSON round
// trip brings them into this realm so deepEqual compares values, not prototypes.
const plain = value => JSON.parse(JSON.stringify(value));

test('profile-icons matcher kernerprofilens ikonliste og tegner DSH-stregglyffer', () => {
  assert.deepEqual(ProfileIcons.IDS, ICON_IDS);
  assert.equal(ProfileIcons.IDS.length, 12);
  for (const id of ProfileIcons.IDS) {
    const glyph = ProfileIcons.svg(id);
    assert.match(glyph, /^<svg /, `${id} starter med et svg-element`);
    assert.match(glyph, /viewBox="0 0 24 24"/, `${id} bruger 24x24-vinduet`);
    assert.match(glyph, /stroke="currentColor"/, `${id} følger tekstfarven`);
    assert.match(glyph, /stroke-width="1\.5"/, `${id} tegnes med 1,5 pixel streger`);
    assert.match(glyph, /fill="none"/, `${id} er et stregikon`);
    assert.ok(glyph.includes('<path'), `${id} indeholder stregdata`);
    assert.match(glyph, /aria-hidden="true"/);
  }
  for (const unknown of ['', 'unknown', '__proto__', 'constructor', null, undefined, {}]) assert.equal(ProfileIcons.svg(unknown), '', `${String(unknown)} tegner intet`);
  assert.equal(ProfileIcons.initials('Parthee'), 'PA');
  assert.equal(ProfileIcons.initials('parthee vijaya'), 'PV');
  assert.equal(ProfileIcons.initials('Anna Klit'), 'AK');
  assert.equal(ProfileIcons.initials('Åse'), 'ÅS');
  assert.equal(ProfileIcons.initials(''), '');
  assert.equal(ProfileIcons.initials('   '), '');
  assert.equal(ProfileIcons.initials(null), '');
});

test('index.html har profil-trinnet med felter og fire nummererede fremgangspunkter', () => {
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.ok(index.includes('<script src="profile-icons.js" defer></script>'), 'profil-ikonmodulet indlæses');
  assert.ok(index.indexOf('profile-icons.js') < index.indexOf('src="app.js"'), 'ikonmodulet indlæses før app.js');
  const sectionStart = index.indexOf('<section id="setup-profile"');
  const choiceStart = index.indexOf('<section id="setup-choice"');
  assert.ok(sectionStart >= 0 && sectionStart < choiceStart, 'profil-trinnet ligger som det første trin');
  const section = index.slice(sectionStart, choiceStart);
  assert.match(section, /data-setup-step="profile"/);
  assert.match(section, /hidden/);
  assert.match(section, /for="profile-name"/);
  assert.ok(section.includes('Hvad skal Aura kalde dig?'));
  assert.match(section, /id="profile-icon-grid"/);
  assert.match(section, /id="profile-theme"/);
  assert.ok(section.includes('value="system"') && section.includes('value="light"') && section.includes('value="dark"'), 'temavalgene er system, lyst og mørkt');
  assert.ok(section.includes('Temaet følger dit system, medmindre du vælger selv.'));
  assert.match(section, /id="profile-help"/);
  assert.ok(section.includes('value="fuld"') && section.includes('value="minimal"'), 'hjælpeniveauet er fuld eller minimal');
  assert.match(section, /id="profile-continue"/);
  const progressStart = index.indexOf('<ol class="onboarding-b-progress"');
  const progress = index.slice(progressStart, index.indexOf('</ol>', progressStart));
  const phases = [...progress.matchAll(/data-phase="([a-z]+)"/g)].map(match => match[1]);
  assert.deepEqual(phases, ['profile', 'connection', 'features', 'idea']);
  assert.ok(!progress.includes('data-phase="provider"'), 'udbyderpunktet er forenet med forbindelsen');
  const numbers = [...progress.matchAll(/<span>(\d)<\/span>/g)].map(match => match[1]);
  assert.deepEqual(numbers, ['1', '2', '3', '4']);
  assert.ok(progress.includes('Din profil') && progress.includes('Forbindelse') && progress.includes('Funktioner') && progress.includes('Din idé'));
});

test('profil-trinnet er det første trin, når den guidede opsætning starter med en tom profil', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'profile');
  assert.equal(f.registry.get('setup-profile').hidden, false, 'profil-trinnet vises');
  assert.equal(f.registry.get('setup-choice').hidden, true);
  assert.equal(f.registry.get('setup-eyebrow').textContent, 'DIN PROFIL');
  assert.equal(f.registry.get('setup-title').textContent, 'Din profil');
  assert.equal(f.registry.get('setup-subtitle').textContent, 'Udfyld din profil — du kan altid ændre den under Indstillinger.');
  assert.equal(f.registry.get('profile-name').value, 'Parthee', 'navnefeltet præudfyldes med forslaget');
  assert.equal(f.registry.get('setup-back').hidden || f.registry.get('setup-back').disabled, false, 'tilbage-knappen virker');
  assert.equal(f.registry.get('profile-continue').disabled, false, 'Fortsæt er altid aktivt');
});

test('repeat-opsætning springer profil-trinnet over, når profilen er udfyldt', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'star' }, repeat: { autoConnect: false } });
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'choice');
  assert.equal(f.registry.get('setup-profile').hidden, true, 'et udfyldt profil-trin vises aldrig igen');
  assert.equal(f.registry.get('profile-name').value, '', 'intet forslag skriver i et trin, der ikke vises');
  assert.ok(!f.calls.includes('profileSuggest'));
});

test('repeat-opsætning med tom profil starter på profil-trinnet — andre indgange går til valget', async () => {
  const repeat = runSetup({ repeat: { autoConnect: false } });
  await repeat.context.showSetup('', true);
  assert.equal(repeat.context.setupStep, 'profile', 'kant-tilfælde: tom profil viser trinnet også ved repeat');
  const add = runSetup();
  await add.context.showSetup();
  assert.equal(add.context.setupStep, 'choice', 'tilføj forbindelse og reparation går direkte til valget');
  assert.equal(add.registry.get('setup-profile').hidden, true);
});

test('profil-trinnet står på skærmen, før navneforslaget lander', async () => {
  const f = runSetup();
  let release; const gate = new Promise(resolve => { release = resolve; });
  f.harness.profileSuggest = async () => { f.calls.push('profileSuggest'); await gate; return 'Parthee'; };
  const entering = f.context.showSetup('', true);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.context.setupStep, 'profile', 'profil-trinnet er valgt, så snart skærmen vises');
  assert.equal(f.registry.get('setup-profile').hidden, false, 'valgskærmen når aldrig at vignette først');
  assert.equal(f.registry.get('profile-name').value, '', 'navnefeltet udfyldes progressivt, når forslaget lander');
  release();
  await entering;
  assert.equal(f.registry.get('profile-name').value, 'Parthee');
});

test('en gemt profil vises i trinnet, og forslaget bruges kun, når navnet er tomt', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'profile');
  assert.equal(f.calls.filter(call => call === 'profileSuggest').length, 1, 'en tom profil forslår et navn');
  const buttons = f.document.querySelectorAll('#profile-icon-grid button');
  assert.equal(buttons.length, 12, 'ikonvælgeren viser alle tolv glyffer');
  assert.ok(buttons.every(button => button.getAttribute('aria-checked') === 'false'), 'intet ikon er forvalgt uden et gemt valg');
  assert.ok(buttons.every(button => button.innerHTML.includes('<svg')), 'hver ikonknap bærer sin glyf');
  assert.equal(buttons.find(button => button.dataset.icon === 'bird').getAttribute('aria-label'), 'Fugl');
  await f.context.prepareProfileStep({ name: 'Anna', icon: 'moon', helpLevel: 'minimal', appearance: { theme: 'dark', panelOpen: true } });
  const grid = f.document.querySelectorAll('#profile-icon-grid button');
  assert.equal(f.registry.get('profile-name').value, 'Anna', 'et gemt navn vises');
  assert.equal(grid.find(button => button.dataset.icon === 'moon').getAttribute('aria-checked'), 'true', 'det gemte ikon er forvalgt');
  assert.equal(f.document.querySelectorAll('#profile-theme input').find(input => input.checked).value, 'dark', 'det gemte tema er forvalgt');
  assert.equal(f.registry.get('profile-help').value, 'minimal', 'det gemte hjælpeniveau er forvalgt');
  assert.equal(f.calls.filter(call => call === 'profileSuggest').length, 1, 'forslaget overskriver aldrig et gemt navn');
});

test('Fortsæt gemmer alle fire feltgrupper og går videre til forbindelsesvalget', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna Klit';
  f.document.querySelectorAll('#profile-icon-grid button').find(button => button.dataset.icon === 'bird').onclick();
  for (const input of f.document.querySelectorAll('#profile-theme input')) input.checked = input.value === 'dark';
  f.registry.get('profile-help').value = 'minimal';
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.context.setupStep, 'choice');
  assert.equal(f.registry.get('setup-profile').hidden, true);
  assert.deepEqual(plain(f.saves[0]), { name: 'Anna Klit', icon: 'bird', helpLevel: 'minimal', appearance: { theme: 'dark', panelOpen: true } });
  assert.equal(progressItem(f, 'profile').dataset.complete, 'true', 'profilpunktet mærkes gennemført');
  assert.equal(progressItem(f, 'profile').querySelector('span').textContent, '✓');
});

test('Fortsæt virker uden udfyldte felter — tomme værdier er gyldige profilværdier', async () => {
  const f = runSetup({ suggestion: '' });
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.context.setupStep, 'choice');
  assert.deepEqual(plain(f.saves[0]), { name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true } });
});

test('gennemført opsætning gemmer profilfelterne og udfylder standard-AI med den kontrollerede forbindelse', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna';
  f.document.querySelectorAll('#profile-icon-grid button').find(button => button.dataset.icon === 'star').onclick();
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.equal(f.registry.get('setup').hidden, true, 'opsætningen er gennemført');
  const completion = plain(f.saves[f.saves.length - 1]);
  assert.deepEqual(completion, {
    name: 'Anna', icon: 'star', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true },
    standardAI: { connectionID: 'forbindelse-1', modelID: '' }
  }, 'gennemførelsen er én samlet profilgemning');
  assert.equal(f.calls.filter(call => call === 'profileSave').length, 2, 'Fortsæt og gennemførelse gemmer hver sin gang');
});

test('en eksisterende standard-AI overskrives ikke af gennemførelsen', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'star', standardAI: { connectionID: 'gammel', modelID: 'm1' } } });
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.equal(f.saves.some(save => save.standardAI), false, 'standard-AI røres ikke, når den allerede er valgt');
});

test('standard-AI udfyldes også, når profil-trinnet ikke blev vist', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'star' }, repeat: { autoConnect: false } });
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'choice');
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.deepEqual(plain(f.saves), [{ standardAI: { connectionID: 'forbindelse-1', modelID: '' } }], 'uden profil-trin gemmes kun standard-AI');
});

test('fremgangslinjen mærker profil og forbindelse separat med numrene 1-4', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(progressItem(f, 'profile').getAttribute('aria-current'), 'step');
  assert.equal(progressItem(f, 'connection').getAttribute('aria-current'), null);
  await f.registry.get('profile-continue').onclick();
  assert.equal(progressItem(f, 'connection').getAttribute('aria-current'), 'step', 'forbindelsesvalget mærker punkt 2');
  f.context.setupPage('provider');
  assert.equal(progressItem(f, 'connection').getAttribute('aria-current'), 'step', 'udbydertrinnet mærker også punkt 2');
  f.context.setupPage('features');
  assert.equal(progressItem(f, 'features').getAttribute('aria-current'), 'step');
  assert.equal(progressItem(f, 'connection').querySelector('span').textContent, '2');
  assert.equal(progressItem(f, 'features').querySelector('span').textContent, '3');
  assert.equal(progressItem(f, 'idea').querySelector('span').textContent, '4');
});

test('forbindelsespunktet får først ✓, når forbindelsen er kontrolleret', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.context.state = { connections: [{ id: 'forbindelse-1', kind: 'corti', name: 'Testforbindelse' }], features: { chosen: true } };
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.setupStep = 'saved';
  f.context.syncOnboardingVisuals();
  assert.equal(progressItem(f, 'connection').dataset.complete, 'false', 'en valgt forbindelse uden kontrol giver ikke ✓');
  assert.equal(progressItem(f, 'connection').querySelector('span').textContent, '2');
  f.context.verifiedConnection = 'forbindelse-1';
  f.context.connectionChecks = { get: () => ({ status: 'ok', count: 3 }) };
  f.context.syncOnboardingVisuals();
  assert.equal(progressItem(f, 'connection').dataset.complete, 'true', 'den kontrollerede forbindelse fuldfører punkt 2');
  assert.equal(progressItem(f, 'connection').querySelector('span').textContent, '✓');
});

test('Tilbage fra forbindelsesvalget vender til profil-trinnet, når det blev vist', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-back').onclick();
  assert.equal(f.context.setupStep, 'profile', 'tilbage fra valget vender til profil-trinnet');
  assert.equal(f.registry.get('setup-profile').hidden, false);
  f.registry.get('setup-back').onclick();
  assert.ok(f.context.introductions >= 1, 'tilbage fra profil-trinnet forlader opsætningen baglæns');
  assert.equal(f.registry.get('setup').hidden, false, 'introduktionen tager imod tilbage-navigationen');
});

test('Tilbage fra valget forlader opsætningen, når profil-trinnet ikke blev vist', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'star' }, repeat: { autoConnect: false } });
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'choice');
  f.registry.get('setup-back').onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.context.setupStep, 'choice');
  assert.equal(f.registry.get('setup').hidden, true, 'repeat-opsætning lukkes som i dag');
});

test('en profilgemning med tema opdaterer tema-hintet straks gennem calmWorkspace', async () => {
  const f = runSetup();
  const themes = [];
  // settings.js and workspace-calm.js expose setTheme on window.calmWorkspace;
  // every profile save that includes a theme hands it over right away.
  f.context.window.calmWorkspace = { setTheme: theme => themes.push(theme) };
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna Klit';
  f.document.querySelectorAll('#profile-icon-grid button').find(button => button.dataset.icon === 'bird').onclick();
  for (const input of f.document.querySelectorAll('#profile-theme input')) input.checked = input.value === 'dark';
  await f.registry.get('profile-continue').onclick();
  assert.deepEqual(themes, ['dark'], 'Fortsæt giver temaet videre med det samme efter gemningen');
  await f.context.leaveSetup(false);
  assert.deepEqual(themes, ['dark', 'dark'], 'gennemførelsen giver temaet videre igen fra den gemte flet');
});
