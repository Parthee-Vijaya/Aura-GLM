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
  slice('async function leaveSetup', "$('#setup-remove-all').onclick"),
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
  const backline = new El('div'); backline.className = 'setup-backline'; setup.append(backline);
  backline.append(make('button', 'setup-back'), make('p', 'setup-step-state'));
  const heading = new El('div'); setup.append(heading);
  heading.append(make('h1', 'setup-title'), make('p', 'setup-subtitle'));
  setup.append(make('p', 'setup-reason'));
  const quick = new El('div'); quick.className = 'setup-quick-actions'; setup.append(quick);
  quick.append(make('button', 'setup-local'), make('button', 'setup-advanced'), make('button', 'setup-remove-all'));
  const content = new El('div'); content.className = 'setup-simple'; setup.append(content);
  const sections = { 'setup-profile': 'profile', 'setup-detail': 'detail', 'setup-choice': 'choice', 'setup-provider': 'provider', 'setup-local-step': 'local', 'setup-saved': 'saved', 'setup-tools': 'tools' };
  for (const [id, step] of Object.entries(sections)) { const section = make('section', id); section.dataset.setupStep = step; section.hidden = id !== 'setup-choice'; content.append(section); }
  const profile = registry.get('setup-profile');
  profile.append(make('input', 'profile-name'));
  const grid = make('div', 'profile-icon-row'); grid.className = 'profile-icon-row'; profile.append(grid);
  profile.append(make('button', 'profile-avatar-remove'));
  const theme = make('fieldset', 'profile-theme'); profile.append(theme);
  const themeCards = new El('div'); themeCards.className = 'theme-cards'; theme.append(themeCards);
  for (const value of ['system', 'light', 'dark']) { const label = new El('label'); label.className = 'theme-card'; const input = make('input'); input.type = 'radio'; input.value = value; input.checked = value === 'system'; label.append(input); themeCards.append(label); }
  const helpLabel = make('p', 'profile-help-label'); profile.append(helpLabel);
  const helpCards = new El('div'); helpCards.className = 'help-cards'; profile.append(helpCards);
  for (const value of ['fuld', 'delvis', 'ingen']) { const label = new El('label'); label.className = 'help-card'; const input = make('input'); input.type = 'radio'; input.value = value; input.checked = value === 'fuld'; label.append(input); helpCards.append(label); }
  profile.append(make('select', 'profile-help'));
  profile.append(make('button', 'profile-continue'));
  const detail = registry.get('setup-detail');
  const detailCards = new El('div'); detailCards.className = 'detail-cards'; detail.append(detailCards);
  for (const value of ['compact', 'standard', 'detailed']) { const label = new El('label'); label.className = 'detail-card'; const input = make('input'); input.type = 'radio'; input.value = value; input.checked = value === 'standard'; label.append(input); detailCards.append(label); }
  detail.append(make('button', 'detail-continue'), make('button', 'detail-skip'));
  return { document, registry };
}
function runSetup({ profile = blank(), suggestion = 'Parthee', repeat = null, avatar = false, uploadFails = null, uploadCanceled = false } = {}) {
  const dom = makeDom();
  const saves = [], calls = [], visuals = [], store = {}, announced = [], adoptCalls = [], messages = [];
  let avatarAvailable = avatar;
  const current = () => typeof profile === 'function' ? profile() : { ...profile };
  const harness = {
    profileGet: async () => { calls.push('profileGet'); return { profile: current(), warnings: [], hasAvatar: avatarAvailable }; },
    profileSave: async value => { calls.push('profileSave'); saves.push(value); return { profile: { ...value }, warnings: [], hasAvatar: avatarAvailable }; },
    profileSuggest: async () => { calls.push('profileSuggest'); return suggestion; },
    profileUploadAvatar: async () => {
      calls.push('profileUploadAvatar');
      if (uploadCanceled) return { canceled: true };
      if (uploadFails) throw new Error(uploadFails);
      avatarAvailable = true;
      return { canceled: false, profile: { ...current(), icon: 'upload' }, warnings: [], hasAvatar: true, avatarRevision: 1690000000001 };
    },
    profileRemoveAvatar: async () => {
      calls.push('profileRemoveAvatar');
      avatarAvailable = false;
      return { profile: { ...current(), icon: '' }, warnings: [], hasAvatar: false };
    }
  };
  const $ = selector => {
    const found = dom.document.querySelector(selector);
    if (found || !/^#[A-Za-z0-9_-]+$/.test(selector)) return found;
    if (!dom.registry.has(selector.slice(1))) { const el = new El('div'); el.id = selector.slice(1); dom.registry.set(selector.slice(1), el); }
    return dom.registry.get(selector.slice(1));
  };
  const context = {
    $, document: dom.document,
    window: { OnboardingB: { render: (element, state) => visuals.push(state.phase) }, ProfileIcons, scrollTo: () => {}, dispatchEvent: event => { if (event.type === 'aura:profile-saved') announced.push(event.detail); } },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    node: (tag, text, className) => { const el = new El(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; },
    state: { connections: [] },
    current: null, projectLoading: false, setupActive: false, setupStep: 'choice', guidedSetup: false,
    repeatSetup: repeat, verifiedConnection: '', setupGeneration: 0, localDiscoveryGeneration: 0,
    connectionChecks: { get: () => undefined }, acceptedFingerprint: null, pendingSend: null, connectionReceipt: null,
    applyChatChoiceRecommendation: () => { adoptCalls.push('adopt'); },
    localStorage: { getItem: key => store[key] ?? null, setItem: (key, value) => { store[key] = String(value); } },
    call: async (method, value) => { if (!harness[method]) throw new Error(`Uventet kald: ${method}`); return harness[method](value); },
    action: async fn => fn(),
    message: (text, isError) => { messages.push({ text, isError: Boolean(isError) }); },
    renderSetup: () => {}, discoverLocal: async () => {}, completeIntroduction: () => {}, clearConnectionReceipt: () => {},
    loadModels: async () => {}, applyFeatures: () => {}, providerPicker: () => {}, syncCreateAvailability: () => {},
    showIntroduction: () => { context.introductions = (context.introductions || 0) + 1; }
  };
  vm.runInNewContext(setupCode, context);
  return { context, $, document: dom.document, registry: dom.registry, harness, saves, calls, visuals, announced, adoptCalls, messages };
}
// Objects created inside the vm context belong to another realm; a JSON round
// trip brings them into this realm so deepEqual compares values, not prototypes.
const plain = value => JSON.parse(JSON.stringify(value));

test('profile-icons matcher kernerprofilens ikonliste og tegner Aura-stregglyffer', () => {
  assert.deepEqual(ProfileIcons.IDS, ICON_IDS);
  assert.equal(ProfileIcons.IDS.length, 3);
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
  // The upload slot's picture glyph names the action; it is not a profile choice.
  assert.ok(ProfileIcons.svg('upload').includes('<svg'), 'upload-knappen tegner et stregikon');
  for (const unknown of ['', 'star', 'bird', 'unknown', '__proto__', 'constructor', null, undefined, {}]) assert.equal(ProfileIcons.svg(unknown), '', `${String(unknown)} tegner intet — gamle Lucide-id'er er gledet ud`);
  // The stored avatar renders from the fixed protocol name — never a path or data URL.
  assert.ok(ProfileIcons.avatarImage().includes('<img src="avatar.png"'), 'avataren tegnes som et billede fra det faste navn');
  assert.ok(!ProfileIcons.avatarImage().includes('data:'), 'ingen base64 i visningen');
  assert.equal(ProfileIcons.initials('Parthee'), 'PA');
  assert.equal(ProfileIcons.initials('parthee vijaya'), 'PV');
  assert.equal(ProfileIcons.initials('Anna Klit'), 'AK');
  assert.equal(ProfileIcons.initials('Åse'), 'ÅS');
  assert.equal(ProfileIcons.initials(''), '');
  assert.equal(ProfileIcons.initials('   '), '');
  assert.equal(ProfileIcons.initials(null), '');
});

test('index.html har profil- og detaljetrinnet med den enkle opsætningsstruktur', () => {
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.ok(index.includes('<script src="profile-icons.js" defer></script>'), 'profil-ikonmodulet indlæses');
  assert.ok(index.indexOf('profile-icons.js') < index.indexOf('src="app.js"'), 'ikonmodulet indlæses før app.js');
  const setupStart = index.indexOf('<main id="setup"');
  const choiceStart = index.indexOf('<section id="setup-choice"');
  const detailStart = index.indexOf('<section id="setup-detail"');
  assert.ok(setupStart >= 0 && detailStart > setupStart && detailStart < choiceStart, 'detaljetrinnet ligger mellem profilen og valget');
  assert.match(index.slice(setupStart, detailStart), /data-setup-step="profile"/);
  const detail = index.slice(detailStart, choiceStart);
  assert.match(detail, /data-setup-step="detail"/);
  assert.ok(detail.includes('Hvor meget vil du se af AI’ens arbejde?') === false, 'overskriften kommer fra app.js — ikke fra markup');
  for (const word of ['Kun resultater', 'Nøgletrin', 'Alle detaljer']) assert.ok(detail.includes(word), `${word} findes som valgkort`);
  assert.deepEqual([...detail.matchAll(/name="detail-view" value="([a-z]+)"/g)].map(match => match[1]), ['compact', 'standard', 'detailed'], 'de tre detaljeniveauer følger profilkontrakten');
  assert.match(detail, /id="detail-continue"/);
  assert.match(detail, /id="detail-skip"/);
  assert.ok(detail.includes('Vælg senere'), 'spring over-knappen hedder Vælg senere som resten af opsætningen');
  const section = index.slice(index.indexOf('<section id="setup-profile"'), detailStart);
  assert.match(section, /for="profile-name"/);
  assert.ok(section.includes('Hvad skal Aura kalde dig?'));
  assert.match(section, /id="profile-icon-row"/);
  assert.match(section, /class="profile-icon-row"/, 'ikonvalget er en kompakt række — ikke et gitter');
  assert.match(section, /role="radiogroup"/);
  assert.match(section, /id="profile-avatar-remove"/, 'fjern-knappen til et eget billede findes');
  assert.ok(section.includes('Fjern billedet'));
  assert.ok(section.includes('Uden valgt ikon bruger appen dine initialer, fx AK for Anna Klit.'));
  assert.ok(section.includes('Et eget billede gemmes kun i appen på din computer og sendes aldrig til AI’en.'), 'upload-hintet lover det samme som navnet: intet billede når AI’en');
  assert.match(section, /id="profile-theme"/);
  assert.ok(section.includes('value="system"') && section.includes('value="light"') && section.includes('value="dark"'), 'temavalgene er system, lyst og mørkt');
  assert.ok(section.includes('Temaet følger dit system, medmindre du vælger selv.'));
  assert.ok(section.includes('class="theme-card"'), 'temavalget er tre små kort på én række');
  assert.match(section, /id="profile-help"/);
  assert.ok(section.includes('value="fuld"') && section.includes('value="delvis"') && section.includes('value="ingen"'), 'hjælpeniveauet har de tre trin: fuld, delvis og ingen');
  assert.ok(section.includes('Fuld hjælp') && section.includes('Hjælp ved behov') && section.includes('Ingen hjælp'), 'trinene har deres danske navne');
  assert.ok(section.includes('class="help-card"'), 'hjælpeniveauet er tre lodrette valgkort');
  assert.match(section, /id="profile-continue"/);
  // The old onboarding chrome is gone from both restyled surfaces.
  const setup = index.slice(setupStart, index.indexOf('</main>', setupStart));
  for (const gone of ['setup-topbar', 'setup-eyebrow', 'onboarding-b-progress', 'setup-visual', 'idea-visual', 'aura-brand']) assert.ok(!setup.includes(gone), `${gone} er fjernet fra opsætningen`);
  assert.match(setup, /id="setup-step-state"/, 'trintælleren står under Tilbage');
  assert.ok(setup.includes('← Tilbage'));
  assert.match(setup, /class="onboarding-simple"/, 'opsætningsfladen har den nye klasse');
  assert.ok(index.includes('<main id="onboarding" class="onboarding-simple">'), 'idéfladen har den nye klasse');
  assert.ok(index.includes('id="task-dialog" data-size="complex" class="onboarding-b"'), '#task-dialog beholder onboarding-b — modeldialogen røres ikke');
  assert.ok(index.includes('id="model-visual"'), '#model-visual består i dialogen');
  // Skills ad gangen: intet funktionstrin står tilbage i opsætningen.
  for (const gone of ['setup-features', 'setup-features-pick', 'features-all', 'features-pick', 'features-continue', 'Hele pakken']) assert.ok(!index.includes(gone), `${gone} er fjernet fra onboarding`);
});

test('profil-trinnet er det første trin, når den guidede opsætning starter med en tom profil', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'profile');
  assert.equal(f.registry.get('setup-profile').hidden, false, 'profil-trinnet vises');
  assert.equal(f.registry.get('setup-choice').hidden, true);
  assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 1 af 4', 'trintælleren står under Tilbage');
  assert.equal(f.registry.get('setup-title').textContent, 'Din profil');
  assert.equal(f.registry.get('setup-subtitle').textContent, 'Udfyld din profil — du kan altid ændre den under Indstillinger.');
  assert.equal(f.registry.get('profile-name').value, 'Parthee', 'navnefeltet præudfyldes med forslaget');
  assert.equal(f.registry.get('setup-back').hidden || f.registry.get('setup-back').disabled, false, 'tilbage-knappen virker');
  assert.equal(f.registry.get('profile-continue').disabled, false, 'Fortsæt er altid aktivt');
  assert.equal(f.registry.get('setup-detail').hidden, true, 'detaljetrinnet venter');
});

test('repeat-opsætning springer profil-trinnet over, når profilen er udfyldt', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'aura-1' }, repeat: { autoConnect: false } });
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'choice');
  assert.equal(f.registry.get('setup-profile').hidden, true, 'et udfyldt profil-trin vises aldrig igen');
  assert.equal(f.registry.get('setup-detail').hidden, true, 'detaljetrinnet springes over sammen med profilen');
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
  const buttons = f.document.querySelectorAll('#profile-icon-row button');
  assert.equal(buttons.length, 5, 'kompakt række: initialer, tre Aura-varianter og upload-pladsen');
  const radios = buttons.filter(button => button.getAttribute('role') === 'radio');
  assert.deepEqual(radios.map(button => button.dataset.icon), ['', 'aura-1', 'aura-2', 'aura-3'], 'initialerne er det første valg — derefter de tre varianter');
  assert.equal(radios.find(radio => radio.dataset.icon === '').getAttribute('aria-checked'), 'true', 'initialerne er forvalgt — de er standardvalget');
  assert.ok(radios.filter(radio => radio.dataset.icon).every(radio => radio.getAttribute('aria-checked') === 'false'), 'ingen variant er forvalgt uden et gemt valg');
  assert.equal(radios.find(radio => radio.dataset.icon === 'aura-1').getAttribute('aria-label'), 'Aura · ring');
  assert.equal(radios.find(radio => radio.dataset.icon === 'aura-2').getAttribute('aria-label'), 'Aura · bølge');
  assert.equal(radios.find(radio => radio.dataset.icon === 'aura-3').getAttribute('aria-label'), 'Aura · kredsløb');
  assert.equal(radios.find(radio => radio.dataset.icon === '').textContent, 'PA', 'initialer-knappen viser forslaget fra navnefeltet');
  assert.ok(radios.filter(radio => radio.dataset.icon).every(radio => radio.innerHTML.includes('<svg')), 'hver variant bærer sin glyf');
  const upload = buttons.find(button => button.getAttribute('aria-label') === 'Upload eget billede');
  assert.ok(upload, 'upload-pladsen er en handlingsknap uden et gemt billede');
  assert.equal(upload.getAttribute('role'), null, 'upload er ikke et ikonvalg endnu');
  assert.ok(upload.innerHTML.includes('<svg'), 'upload-knappen bærer sit billede-stregikon');
  await f.context.prepareProfileStep({ name: 'Anna', icon: 'aura-1', helpLevel: 'delvis', appearance: { theme: 'dark', panelOpen: true } });
  const row = f.document.querySelectorAll('#profile-icon-row button');
  assert.equal(f.registry.get('profile-name').value, 'Anna', 'et gemt navn vises');
  assert.equal(row.find(button => button.dataset.icon === 'aura-1').getAttribute('aria-checked'), 'true', 'det gemte ikon er forvalgt');
  assert.equal(f.document.querySelectorAll('#profile-theme input').find(input => input.checked).value, 'dark', 'det gemte tema er forvalgt');
  assert.equal(f.registry.get('profile-help').value, 'delvis', 'det gemte hjælpeniveau er forvalgt');
  assert.equal(f.document.querySelectorAll('#setup-profile .help-cards input').find(input => input.checked).value, 'delvis', 'valgkortene følger det gemte hjælpeniveau');
  assert.equal(f.calls.filter(call => call === 'profileSuggest').length, 1, 'forslaget overskriver aldrig et gemt navn');
});

test('upload-knappen beder hovedprocessen om filvælgeren — og billedet bliver det valgte ikon', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(f.registry.get('profile-avatar-remove').hidden, true, 'uden billede er der intet at fjerne');
  const slot = f.document.querySelectorAll('#profile-icon-row button').find(button => button.getAttribute('aria-label') === 'Upload eget billede');
  await slot.onclick();
  assert.equal(f.calls.includes('profileUploadAvatar'), true, 'filvælgeren åbnes i hovedprocessen');
  const row = f.document.querySelectorAll('#profile-icon-row button');
  const avatar = row.find(button => button.dataset.icon === 'upload');
  assert.ok(avatar, 'efter gemningen er avatar-pladsen et valg');
  assert.ok(avatar.innerHTML.includes('<img src="avatar.png?v=1690000000001"'), 'billedet vises som forhåndsvisning fra det faste navn — med uploadens revision som cache-buster');
  assert.equal(avatar.getAttribute('role'), 'radio', 'billedet er nu med i valget');
  assert.equal(avatar.getAttribute('aria-checked'), 'true', 'upload er det valgte ikon');
  assert.equal(avatar.getAttribute('aria-label'), 'Eget billede');
  assert.equal(f.registry.get('profile-avatar-remove').hidden, false, 'fjern-knappen står frem');
  await f.registry.get('profile-continue').onclick();
  assert.equal(plain(f.saves[0]).icon, 'upload', 'Fortsæt gemmer avatar-valget');
});

test('Fjern billedet rydder tilbage til initialerne', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  const slot = f.document.querySelectorAll('#profile-icon-row button').find(button => button.getAttribute('aria-label') === 'Upload eget billede');
  await slot.onclick();
  const avatar = f.document.querySelectorAll('#profile-icon-row button').find(button => button.dataset.icon === 'upload');
  assert.ok(avatar, 'efter upload er billedet et valg');
  assert.equal(avatar.getAttribute('aria-checked'), 'true');
  assert.equal(f.registry.get('profile-avatar-remove').hidden, false, 'fjern-knappen står frem');
  await f.registry.get('profile-avatar-remove').onclick();
  assert.equal(f.calls.includes('profileRemoveAvatar'), true, 'fjernelsen sker i hovedprocessen');
  const cleared = f.document.querySelectorAll('#profile-icon-row button');
  assert.ok(!cleared.some(button => button.dataset.icon === 'upload'), 'avatar-valget er væk');
  assert.ok(cleared.find(button => button.getAttribute('aria-label') === 'Upload eget billede'), 'upload-pladsen er en handlingsknap igen');
  assert.equal(cleared.find(button => button.dataset.icon === '').getAttribute('aria-checked'), 'true', 'initialerne er valgt igen');
  assert.equal(f.registry.get('profile-avatar-remove').hidden, true, 'fjern-knappen gemmes igen');
  await f.registry.get('profile-continue').onclick();
  assert.equal(plain(f.saves[0]).icon, '', 'Fortsæt gemmer initialerne');
});

test('en annulleret billedvælger giver en stille dansk besked og lader rækken stå', async () => {
  const f = runSetup({ uploadCanceled: true });
  await f.context.showSetup('', true);
  const slot = f.document.querySelectorAll('#profile-icon-row button').find(button => button.getAttribute('aria-label') === 'Upload eget billede');
  await slot.onclick();
  assert.deepEqual(f.messages, [{ text: 'Billedvalget blev afbrudt.', isError: false }], 'afbrudt vælger er en statusbesked — ikke en fejl');
  const row = f.document.querySelectorAll('#profile-icon-row button');
  assert.equal(row.find(button => button.dataset.icon === 'upload'), undefined, 'intet billede er kommet til');
  assert.ok(row.find(button => button.getAttribute('aria-label') === 'Upload eget billede'), 'upload-knappen står uændret');
  assert.equal(f.registry.get('profile-avatar-remove').hidden, true, 'fjern-knappen forbliver skjult');
  assert.equal(f.saves.length, 0, 'profilen røres ikke');
});

test('en upload der afvises, viser den danske fejl og lader rækken stå', async () => {
  const f = runSetup({ uploadFails: 'Billedet er for stort. Vælg et jpg- eller png-billede på højst 1 MB.' });
  await f.context.showSetup('', true);
  const before = f.document.querySelectorAll('#profile-icon-row button');
  await assert.rejects(() => f.document.querySelectorAll('#profile-icon-row button').find(button => button.getAttribute('aria-label') === 'Upload eget billede').onclick(), /for stort/);
  const after = f.document.querySelectorAll('#profile-icon-row button');
  assert.equal(after.find(button => button.dataset.icon === 'upload'), undefined, 'intet billede er kommet til');
  assert.equal(after.find(button => button.getAttribute('aria-label') === 'Upload eget billede') !== undefined, true, 'upload-knappen står uændret');
  assert.equal(before.length, after.length);
});

test('Fortsæt gemmer alle fire feltgrupper og går videre til detaljetrinnet', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna Klit';
  f.document.querySelectorAll('#profile-icon-row button').find(button => button.dataset.icon === 'aura-2').onclick();
  for (const input of f.document.querySelectorAll('#profile-theme input')) input.checked = input.value === 'dark';
  f.registry.get('profile-help').value = 'ingen';
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.context.setupStep, 'detail', 'Fortsæt fører til detaljetrinnet — ikke direkte til valget');
  assert.equal(f.registry.get('setup-profile').hidden, true);
  assert.equal(f.registry.get('setup-detail').hidden, false);
  assert.deepEqual(plain(f.saves[0]), { name: 'Anna Klit', icon: 'aura-2', helpLevel: 'ingen', appearance: { theme: 'dark', panelOpen: true } });
  assert.equal(f.document.body.classList.contains('help-ingen'), true, 'det valgte hjælpeniveau gælder straks — ikke først efter genstart');
  assert.equal(f.document.body.classList.contains('help-delvis'), false);
});

test('detaljetrinnet viser de tre niveauer og Fortsæt gemmer kun transcriptView', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 2 af 4', 'detaljetrinnet er trin 2');
  assert.equal(f.registry.get('setup-title').textContent, 'Hvor meget vil du se af AI’ens arbejde?');
  assert.equal(f.registry.get('setup-subtitle').textContent, 'Det ændrer kun, hvordan arbejdet vises — ikke hvad Aura kan.');
  const cards = f.document.querySelectorAll('#setup-detail .detail-card input');
  assert.deepEqual(cards.map(card => card.value), ['compact', 'standard', 'detailed'], 'de tre niveauer følger profilkontrakten');
  assert.equal(cards.find(card => card.checked).value, 'standard', 'Nøgletrin er forvalgt for en ny bruger');
  assert.equal(f.registry.get('setup-detail').hidden, false);
  // "Vælg senere" springer trinnet over uden en gemning.
  await f.registry.get('detail-skip').onclick();
  assert.equal(f.context.setupStep, 'choice', 'Vælg senere fører til valget af adgang');
  assert.equal(f.saves.length, 1, 'spring over gemmer intet — den gemte værdi består (R7)');
  // Tilbage fra valget vender til detaljetrinnet; Fortsæt gemmer niveauet.
  f.registry.get('setup-back').onclick();
  assert.equal(f.context.setupStep, 'detail');
  for (const card of f.document.querySelectorAll('#setup-detail .detail-card input')) card.checked = card.value === 'detailed';
  await f.registry.get('detail-continue').onclick();
  assert.equal(f.context.setupStep, 'choice');
  assert.deepEqual(plain(f.saves.at(-1)), { transcriptView: 'detailed' }, 'Fortsæt gemmer kun detaljeniveauet gennem profilkøen');
  assert.equal(f.document.body.classList.contains('transcript-detailed'), true, 'kropsklassen følger gemningen straks');
});

test('detaljetrinnet forvælger et gemt niveau — Spring over bevarer det (R7)', async () => {
  const f = runSetup({ profile: { ...blank(), name: '', icon: '', transcriptView: 'compact' } });
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.document.querySelectorAll('#setup-detail .detail-card input').find(card => card.checked).value, 'compact', 'det gemte niveau er forvalgt');
  await f.registry.get('detail-skip').onclick();
  await f.context.leaveSetup(false);
  assert.ok(f.saves.every(save => save.transcriptView === undefined), 'spring over gemmer aldrig over det gemte niveau');
});

test('en annulleret detaljegemning blokerer aldrig opsætningen', async () => {
  const f = runSetup();
  f.harness.profileSave = async value => { f.calls.push('profileSave'); throw new Error('Datamappen er låst.'); };
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.document.querySelectorAll('#setup-detail .detail-card input').find(card => card.value === 'compact').checked = true;
  await f.registry.get('detail-continue').onclick();
  assert.equal(f.context.setupStep, 'choice', 'en fejlslagen gemning fører stadig videre');
});

test('Fortsæt adopterer den gemte profil og annoncerer den som aura:profile-saved', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna Klit';
  f.document.querySelectorAll('#profile-icon-row button').find(button => button.dataset.icon === 'aura-2').onclick();
  await f.registry.get('profile-continue').onclick();
  // Cachen følger den gemte profil med det samme — adoptProfile genberegner
  // anbefalingen, og chippen og anbefalingerne arbejder aldrig på et forældet
  // grundlag.
  assert.equal(f.adoptCalls.length >= 1, true, 'den gemte profil adopteres straks');
  assert.deepEqual(plain(f.announced), [{ name: 'Anna Klit', icon: 'aura-2', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true } }], 'den gemte profil annonceres til vinduet');
});

test('Fortsæt virker uden udfyldte felter — tomme værdier er gyldige profilværdier', async () => {
  const f = runSetup({ suggestion: '' });
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.context.setupStep, 'detail');
  await f.registry.get('detail-continue').onclick();
  assert.equal(f.context.setupStep, 'choice');
  assert.deepEqual(plain(f.saves), [{ name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true } }, { transcriptView: 'standard' }], 'et uudfyldt trin gemmer Nøgletrin som standard');
});
test('profil-trinnet bevarer panelets gemte starttilstand — appearance er én enhed', async () => {
  const f = runSetup({ profile: { ...blank(), appearance: { theme: 'light', panelOpen: false } } });
  await f.context.showSetup('', true);
  for (const input of f.document.querySelectorAll('#profile-theme input')) input.checked = input.value === 'dark';
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.context.setupStep, 'detail');
  assert.deepEqual(plain(f.saves[0]).appearance, { theme: 'dark', panelOpen: false }, 'et gemt panelOpen: false nulstilles aldrig af trinnet');
});

test('gennemført opsætning gemmer profilfelterne og udfylder standard-AI med den kontrollerede forbindelse', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  f.registry.get('profile-name').value = 'Anna';
  f.document.querySelectorAll('#profile-icon-row button').find(button => button.dataset.icon === 'aura-1').onclick();
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.equal(f.registry.get('setup').hidden, true, 'opsætningen er gennemført');
  const completion = plain(f.saves[f.saves.length - 1]);
  assert.deepEqual(completion, {
    name: 'Anna', icon: 'aura-1', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true },
    standardAI: { connectionID: 'forbindelse-1', modelID: '' }
  }, 'gennemførelsen er én samlet profilgemning');
  assert.equal(f.calls.filter(call => call === 'profileSave').length, 2, 'Fortsæt og gennemførelse gemmer hver sin gang');
});

test('en eksisterende standard-AI overskrives ikke af gennemførelsen', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'aura-1', standardAI: { connectionID: 'gammel', modelID: 'm1' } } });
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.equal(f.saves.some(save => save.standardAI), false, 'standard-AI røres ikke, når den allerede er valgt');
});

test('gennemført opsætning spørger ikke om funktioner — grundpakken gælder fra starten', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.equal(f.registry.get('setup').hidden, true, 'opsætningen gennemføres uden et funktionstrin');
  assert.ok(!f.calls.includes('featuresSave'), 'onboarding gemmer intet funktionsvalg');
});

test('standard-AI udfyldes også, når profil-trinnet ikke blev vist', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'aura-1' }, repeat: { autoConnect: false } });
  await f.context.showSetup('', true);
  assert.equal(f.context.setupStep, 'choice');
  f.registry.get('setup-connection').value = 'forbindelse-1';
  f.context.verifiedConnection = 'forbindelse-1';
  await f.context.leaveSetup(true);
  assert.deepEqual(plain(f.saves), [{ standardAI: { connectionID: 'forbindelse-1', modelID: '' } }], 'uden profil-trin gemmes kun standard-AI');
});

test('trintælleren viser de fire trin: profil, detaljer, forbindelse og idé', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 1 af 4', 'profil-trinnet er nummer 1');
  await f.registry.get('profile-continue').onclick();
  assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 2 af 4', 'detaljetrinnet er nummer 2');
  await f.registry.get('detail-continue').onclick();
  assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 3 af 4', 'forbindelsesvalget er nummer 3');
  for (const step of ['provider', 'local', 'saved', 'tools']) {
    f.context.setupPage(step);
    assert.equal(f.registry.get('setup-step-state').textContent, 'Trin 3 af 4', `${step} er en del af forbindelsestrinnet`);
  }
  f.context.setupPage('choice');
});

test('trinrækkefølgen er låst: profil → detaljer → forbindelse → idé', async () => {
  const appSource = fs.readFileSync(path.join(ui, 'app.js'), 'utf8');
  const profileHeading = appSource.indexOf("profile: ['Din profil'");
  const detailHeading = appSource.indexOf("detail: ['Hvor meget vil du se af AI’ens arbejde?'");
  const choiceHeading = appSource.indexOf("choice: ['Hvordan vil du forbinde din AI?'");
  assert.ok(profileHeading >= 0 && detailHeading > profileHeading && choiceHeading > detailHeading, 'overskrifterne står i den godkendte rækkefølge');
  assert.ok(appSource.includes("await saveProfileStep(); setupPage('detail');"), 'Fortsæt fra profilen fører til detaljetrinnet');
  assert.ok(appSource.includes("if (setupStep === 'detail') setupPage('profile');"), 'Tilbage fra detaljetrinnet vender til profilen');
  // Senere-valg virker på begge slags trin: detaljetrinnet springes over,
  // forbindelsestrinnet forlades uden AI.
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  await f.registry.get('detail-skip').onclick();
  assert.equal(f.context.setupStep, 'choice', 'Vælg senere springer detaljetrinnet over');
  await f.registry.get('setup-local').onclick();
  assert.equal(f.registry.get('setup').hidden, true, 'Vælg senere forlader forbindelsestrinnet');
  assert.equal(f.$('#onboarding').hidden, false, 'idéfladen er trin 4 og tager imod');
});

test('Tilbage følger trinrækkefølgen: valget → detaljer → profil → ud af opsætningen', async () => {
  const f = runSetup();
  await f.context.showSetup('', true);
  await f.registry.get('profile-continue').onclick();
  await f.registry.get('detail-continue').onclick();
  f.registry.get('setup-back').onclick();
  assert.equal(f.context.setupStep, 'detail', 'tilbage fra valget vender til detaljetrinnet');
  assert.equal(f.registry.get('setup-detail').hidden, false);
  f.registry.get('setup-back').onclick();
  assert.equal(f.context.setupStep, 'profile', 'tilbage fra detaljetrinnet vender til profilen');
  assert.equal(f.registry.get('setup-profile').hidden, false);
  f.registry.get('setup-back').onclick();
  assert.ok(f.context.introductions >= 1, 'tilbage fra profil-trinnet forlader opsætningen baglæns');
  assert.equal(f.registry.get('setup').hidden, false, 'introduktionen tager imod tilbage-navigationen');
});

test('Tilbage fra valget forlader opsætningen, når profil-trinnet ikke blev vist', async () => {
  const f = runSetup({ profile: { ...blank(), name: 'Anna', icon: 'aura-1' }, repeat: { autoConnect: false } });
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
  f.document.querySelectorAll('#profile-icon-row button').find(button => button.dataset.icon === 'aura-2').onclick();
  for (const input of f.document.querySelectorAll('#profile-theme input')) input.checked = input.value === 'dark';
  await f.registry.get('profile-continue').onclick();
  assert.deepEqual(themes, ['dark'], 'Fortsæt giver temaet videre med det samme efter gemningen');
  await f.context.leaveSetup(false);
  assert.deepEqual(themes, ['dark', 'dark'], 'gennemførelsen giver temaet videre igen fra den gemte flet');
});
