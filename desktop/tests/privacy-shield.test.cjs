// S1 · DATAKONTROL-SKJOLD: tilstanden flyttes fra knapteksten til et skjold,
// hvor farve OG form bærer tilstanden (WCAG 1.4.1). De gamle titler lever
// videre i aria-label og tooltip; dialogåbningen og annonceringen gennem
// #privacy-gate-status er uændret. Electron-flowet ligger i
// scripts/verify-privacy-ui.cjs; her prøves de rene funktioner og renderStatus.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ui = path.join(__dirname, '..', 'ui');
const source = fs.readFileSync(path.join(ui, 'privacy-gate.js'), 'utf8');
const css = fs.readFileSync(path.join(ui, 'privacy-gate.css'), 'utf8');
const html = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
const { shieldState } = require(path.join(ui, 'privacy-gate.js'));

// ---------- rene funktioner ----------

test('shieldState: pending uden snapshot, on når datakontrol er aktiveret, off når den er af', () => {
  assert.equal(shieldState(null), 'pending');
  assert.equal(shieldState(undefined), 'pending');
  assert.equal(shieldState({}), 'off');
  assert.equal(shieldState({ enabled: false, settings: { enabled: false } }), 'off');
  assert.equal(shieldState({ settings: {} }), 'off');
  for (const workMode of ['local', 'hybrid', 'cloud-controlled']) {
    assert.equal(shieldState({ enabled: true, effective: { workMode } }), 'on', workMode);
    assert.equal(shieldState({ settings: { enabled: true, workMode } }), 'on', workMode);
  }
});

// ---------- renderStatus i en falsk DOM (vm-skiver af den rigtige kilde) ----------

function makeElement(id) {
  const classes = new Set();
  const value = {
    id, title: '', hidden: false, dataset: {}, attributes: {},
    _html: '', textContent: '',
    set innerHTML(markup) { value._html = markup; value.textContent = String(markup).replace(/<[^>]*>/g, ''); },
    get innerHTML() { return value._html; },
    classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }, contains: name => classes.has(name) },
    setAttribute(name, text) { value.attributes[name] = String(text); },
    getAttribute(name) { return name in value.attributes ? value.attributes[name] : null; }
  };
  return value;
}

function fixture(language = 'da') {
  const elements = new Map(['privacy-gate-button', 'privacy-model-button', 'privacy-settings-button'].map(id => [id, makeElement(id)]));
  const statusLine = makeElement('privacy-gate-status');
  const context = {
    snapshot: null, statusLine, reviewing: null, announcedState: null,
    document: { documentElement: { lang: language }, getElementById: id => elements.get(id) || null, createElement: () => makeElement('created') }
  };
  vm.createContext(context);
  // Skiverne skyer for modulniveauets egne let-erklæringer (api, snapshot,
  // statusLine, …): fixturens kontekstegenskaber leverer dem i stedet.
  const helpers = source.slice(source.indexOf('const make ='), source.indexOf('let api = null'));
  const pure = source.slice(source.indexOf('function shieldState('), source.indexOf("if (typeof module !== 'undefined'"));
  const render = source.slice(source.indexOf('const SHIELD_PATH'), source.indexOf('function destinationRows()'));
  assert.ok(helpers.includes('const t =') && pure.includes('function shieldState(') && render.includes('function renderStatus()'), 'skiverne findes i privacy-gate.js');
  vm.runInContext(helpers + '\n' + pure + '\n' + render, context);
  return { context, statusLine, elements, button: () => elements.get('privacy-gate-button'), render: () => context.renderStatus() };
}

const TITLES = [
  [null, 'pending', 'Datakontrol · hent status', 'Data control · load status'],
  [{ enabled: true, effective: { workMode: 'local' } }, 'on', 'Kun lokal · modelkald', 'Local only · model calls'],
  [{ enabled: true, effective: { workMode: 'hybrid' } }, 'on', 'Hybrid · datakontrol', 'Hybrid · data control'],
  [{ enabled: true, effective: { workMode: 'cloud-controlled' } }, 'on', 'Cloud med datakontrol', 'Cloud with data control'],
  [{ enabled: false }, 'off', 'Datakontrol · ikke aktiveret', 'Data control · not enabled'],
];

test('aria-label og tooltip bærer de gamle titler på dansk og engelsk — plus åbningshandlingen', () => {
  for (const [snapshot, state, danish, english] of TITLES) {
    const da = fixture('da'); da.context.snapshot = snapshot; da.render();
    const en = fixture('en'); en.context.snapshot = snapshot; en.render();
    for (const id of ['privacy-gate-button', 'privacy-model-button', 'privacy-settings-button']) {
      const daButton = da.elements.get(id), enButton = en.elements.get(id);
      assert.equal(daButton.dataset.privacyState, state, `${id} da tilstand`);
      assert.equal(enButton.dataset.privacyState, state, `${id} en tilstand`);
      assert.ok(daButton.attributes['aria-label'].includes(danish), `${id} da-titel i aria-label`);
      assert.ok(daButton.attributes['aria-label'].endsWith('Åbn dataregler'), `${id} da handling`);
      assert.ok(enButton.attributes['aria-label'].includes(english), `${id} en-titel i aria-label`);
      assert.ok(enButton.attributes['aria-label'].endsWith('Open data rules'), `${id} en handling`);
      assert.ok(daButton.title.startsWith(danish), `${id} da-titel i tooltip`);
      assert.ok(daButton.title.includes('Arbejdsform og dataregler'), `${id} da-omfang i tooltip`);
      assert.ok(enButton.title.startsWith(english), `${id} en-titel i tooltip`);
      assert.ok(enButton.title.includes('Work mode and data rules'), `${id} en-omfang i tooltip`);
    }
  }
});

test('statusteksten er væk fra knappen: ordet Datakontrol står alene i textContent', () => {
  for (const language of ['da', 'en']) {
    const f = fixture(language);
    f.context.snapshot = { enabled: true, effective: { workMode: 'hybrid' }, capabilities: { isolation: true } };
    f.render();
    for (const id of ['privacy-gate-button', 'privacy-model-button', 'privacy-settings-button']) {
      const button = f.elements.get(id);
      assert.equal(button.textContent, language === 'da' ? 'Datakontrol' : 'Data control', `${id} ${language}`);
      assert.ok(!button.textContent.includes('Hybrid'), `${id} ${language} statustekst er væk`);
    }
  }
  assert.doesNotMatch(source, /value\.textContent = title/, 'renderStatus sætter ikke længere statustekst som tekstindhold');
});

test('skjoldet genbruger .permission-shield-stien som inline-SVG med aria-hidden', () => {
  const pillPath = /<svg class="permission-shield"[^>]*><path d="([^"]+)"/.exec(html);
  assert.ok(pillPath, 'tilladelses-pillens skjoldsti findes i index.html');
  const states = { pending: null, on: { enabled: true, effective: { workMode: 'cloud-controlled' } }, off: { enabled: false } };
  for (const [state, snapshot] of Object.entries(states)) {
    const f = fixture('da'); f.context.snapshot = snapshot; f.render();
    const markup = f.button().innerHTML;
    assert.match(markup, /<svg[^>]*aria-hidden="true"/, `${state}: SVG er skjult for skærmlæseren`);
    assert.ok(markup.includes(pillPath[1]), `${state}: genbruger .permission-shield-stien`);
    assert.match(markup, /class="privacy-shield"/, `${state}: skjoldklassen sættes`);
    if (state === 'pending') assert.doesNotMatch(markup, /privacy-shield-mark/, 'pending: intet tegn i skjoldet');
    else assert.match(markup, /privacy-shield-mark/, `${state}: tegnet ✓/✕ sættes`);
  }
});

test('dialogåbningen er uændret: de tre id-er beholdes med aria-haspopup og open-handler', () => {
  assert.match(source, /\[get\('connections-button'\), 'privacy-settings-button', 'after'\], \[get\('advanced-model-context'\), 'privacy-model-button', 'before'\], \[get\('context-status'\), 'privacy-gate-button', 'before'\]/, 'P1: skjoldet er første segment i statusrækken; de to andre ankre er uændrede');
  assert.match(source, /const entry = button\(t\('Datakontrol og arbejdsform', 'Data control and work mode'\), open, 'text-button privacy-entry'\)/, 'open-handleren er stadig knappen handler');
  assert.match(source, /entry\.setAttribute\('aria-haspopup', 'dialog'\)/, 'aria-haspopup består');
  assert.match(source, /function open\(\) \{ sync\(\); void refresh\(\{ show: true \}\); \}/, 'open() åbner fortsat dialogen efter sync');
});

// ---------- annoncering kun ved reelle tilstandsskift ----------

test('annonceringen kommer først efter første indlæsning — og kun ved reelt on/off-skift', () => {
  const f = fixture('da');
  f.render();
  assert.equal(f.statusLine.hidden, true, 'pending ved start: intet besked');
  f.context.snapshot = { enabled: false }; f.render();
  assert.equal(f.statusLine.hidden, true, 'først kendte tilstand er grundlag, ikke en besked');
  assert.equal(f.statusLine.textContent, '');
  f.render();
  assert.equal(f.statusLine.hidden, true, 'uændret tilstand giver ingen besked');
  f.context.snapshot = { enabled: true, effective: { workMode: 'hybrid' } }; f.render();
  assert.equal(f.statusLine.hidden, false, 'off → on annonceres');
  assert.equal(f.statusLine.textContent, 'Datakontrol er slået til.');
  f.render();
  assert.equal(f.statusLine.hidden, true, 'samme tilstand annonceres ikke igen');
  f.context.snapshot = null; f.render();
  assert.equal(f.statusLine.hidden, true, 'pending er ikke en besked');
  f.context.snapshot = { enabled: false }; f.render();
  assert.equal(f.statusLine.hidden, false, 'on → off annonceres');
  assert.equal(f.statusLine.textContent, 'Datakontrol er slået fra.');
});

test('annonceringen findes også på engelsk og rører aldrig en igangværende gennemgang', () => {
  const en = fixture('en');
  en.context.snapshot = { enabled: false }; en.render();
  en.context.snapshot = { enabled: true }; en.render();
  assert.equal(en.statusLine.textContent, 'Data control is now on.');
  const review = fixture('da');
  review.context.announcedState = 'off'; review.context.reviewing = { id: 'review-1' };
  review.statusLine.textContent = 'Deling afventer din godkendelse.'; review.statusLine.hidden = false;
  review.context.snapshot = { enabled: true }; review.render();
  assert.equal(review.statusLine.textContent, 'Deling afventer din godkendelse.', 'gennemgangens besked clobberes ikke');
});

// ---------- CSS: tre tilstande med Aura-tokens ----------

test('CSS: skjoldtilstandene farves af --aura-success/--aura-error/--aura-ink-muted', () => {
  const strip = css.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(strip, /\.privacy-shield\{width:20px;height:20px/, 'skjoldet er 20 px SVG');
  assert.match(strip, /\.privacy-entry\{[^}]*display:inline-flex[^}]*min-height:32px/, 'knappfeltet er mindst 32 px');
  assert.match(strip, /@media\(pointer:coarse\)\{\.privacy-entry\{min-height:44px\}\}/, 'touchmålet hæves til 44 px');
  const onRule = strip.match(/\.privacy-entry\[data-privacy-state="on"\][^{]*\.privacy-shield-shape\{[^}]*\}/)[0];
  assert.match(onRule, /fill:var\(--aura-success\)/, 'on er fyldt grøn');
  const offRule = strip.match(/\.privacy-entry\[data-privacy-state="off"\][^{]*\.privacy-shield-shape\{[^}]*\}/)[0];
  assert.match(offRule, /stroke:var\(--aura-error\)/, 'off er rødt omrids');
  const pendingRule = strip.match(/\.privacy-entry\[data-privacy-state="pending"\][^{]*\.privacy-shield-shape\{[^}]*\}/)[0];
  assert.match(pendingRule, /stroke:var\(--aura-ink-muted\)/, 'pending er gråt omrids');
  assert.doesNotMatch(pendingRule, /--aura-error/, 'pending må aldrig antyde rød status');
});
