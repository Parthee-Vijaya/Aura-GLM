const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');

// S2 · Det generiske /-kommando-framework. Tre lag testes her:
// 1. Den rene token-grammatik i ui/slash-commands.js (delt med værten gennem
//    core/slash-commands.cjs, så popuppen aldrig kan tilbyde noget, værten
//    afviser — og håndskrevne tokens følger de samme regler).
// 2. Popup-mekanikken i en syntetisk DOM (vm) som composer-help-testene.
// 3. Aktiveringen gennem den rigtige prepare/chat-session-linje med en ægte
//    Workbench: indsættelse, fingerprint-regnskab, Før du sender-dækning,
//    motorens pr.-skill-tilladelser og grundreglerne, der gælder altid.
const ui = path.join(__dirname, '..', 'ui');
// Objects from the vm context belong to another realm; a JSON round trip makes deepEqual a comparison of values.
const plain = value => JSON.parse(JSON.stringify(value));
const appSource = fsSync.readFileSync(path.join(ui, 'app.js'), 'utf8');
const indexSource = fsSync.readFileSync(path.join(ui, 'index.html'), 'utf8');
const stylesSource = fsSync.readFileSync(path.join(ui, 'styles.css'), 'utf8');
const slashSource = fsSync.readFileSync(path.join(ui, 'slash-commands.js'), 'utf8');
const shared = require('../ui/slash-commands.js');
const core = require('../core/slash-commands.cjs');

// ─── 1 · Ren grammatik ───────────────────────────────────────────────────────

test('parseTokens: /navn gælder kun ved ordstart — aldrig midt i et ord', () => {
  assert.deepEqual(shared.parseTokens('/design'), [{ name: 'design', start: 0, end: 7 }], 'begyndelsen af teksten er ordstart');
  assert.deepEqual(shared.parseTokens('Se /harness-kodestil nu'), [{ name: 'harness-kodestil', start: 3, end: 20 }], 'efter mellemrum');
  assert.deepEqual(shared.parseTokens('hej\n/design'), [{ name: 'design', start: 4, end: 11 }], 'efter linjeskift');
  assert.deepEqual(shared.parseTokens('ord/design'), [], 'midt i et ord er ikke ordstart');
  assert.deepEqual(shared.parseTokens('se(/design)'), [], 'en parentes foran er heller ikke whitespace');
});

test('parseTokens: URL’er, stier og filendelser udløser aldrig kommandoer', () => {
  assert.deepEqual(shared.parseTokens('https://example.com/design'), [], 'skråstregerne i en URL står midt i ordet');
  assert.deepEqual(shared.parseTokens('se https://x.dk'), []);
  assert.deepEqual(shared.parseTokens('/foo.baz /foo/bar /foo:baz'), [], 'et ord med :, . eller / er ikke et rent token');
  assert.deepEqual(shared.parseTokens('Læs /design.'), [], 'tegnsætning hænger fast i ordet');
  assert.deepEqual(shared.parseTokens('[se /design]'), [], 'tegn omkring ordet gør det ikke selvstændigt');
});

test('parseTokens: kodeblokke, dubletter og versaler', () => {
  assert.deepEqual(shared.parseTokens('```\n/design\n```'), [], 'inde i en kodeblok');
  assert.deepEqual(shared.parseTokens('~~~\n/design\n~~~'), [], 'tilde-gitre gælder også');
  assert.deepEqual(shared.parseTokens('```js\nx\n```\n/design'), [{ name: 'design', start: 12, end: 19 }], 'efter blokkens slutning');
  assert.deepEqual(shared.parseTokens('/a /a'), [{ name: 'a', start: 0, end: 2 }], 'samme navn tælles én gang');
  assert.deepEqual(shared.parseTokens('/DESIGN'), [{ name: 'design', start: 0, end: 7 }], 'versaler matches som små bogstaver');
});

test('tokenAt: skrivepositionens token — det ufuldstændige ord, popuppen filtrerer efter', () => {
  assert.deepEqual(shared.tokenAt('/', 1), { start: 0, end: 1, query: '' }, 'kun skråstregen er et gyldigt tomt token');
  assert.deepEqual(shared.tokenAt('Se /harn', 8), { start: 3, end: 8, query: 'harn' });
  assert.deepEqual(shared.tokenAt('x /design', 5), { start: 2, end: 9, query: 'de' }, 'markøren midt i ordet filtrerer på det tastede');
  assert.equal(shared.tokenAt('https://example.com/x', 21), null, 'URL’er udløser ikke');
  assert.equal(shared.tokenAt('```\n/des\n```', 6), null, 'kodeblokke udløser ikke');
  assert.equal(shared.tokenAt('hej ', 4), null, 'markøren lige efter mellemrum har intet token');
  assert.equal(shared.tokenAt('', 0), null);
});

test('core/slash-commands: resolve holder parsing, reserverede navne og kataloget sammen', () => {
  const list = [
    { id: 'faelles-grundregler', title: 'Grundregler' },
    { id: 'harness-kodestil', title: 'Kodestil og læsbarhed' },
    { id: 'harness-aura-design', title: 'Aura-design' }
  ];
  const result = core.resolve('Brug /harness-kodestil og /design her', list);
  assert.deepEqual(result.skills, ['harness-kodestil'], 'kendte skills aktiveres, reserverede gør ikke');
  assert.deepEqual(result.reserved, ['design'], '/design er reserveret til S4-S5 — S2 registrerer den ikke');
  assert.deepEqual(result.invocations, [{ token: '/harness-kodestil', name: 'harness-kodestil', title: 'Kodestil og læsbarhed' }]);
  assert.deepEqual(core.resolve('/faelles-grundregler', list).skills, [], 'grundreglerne er ikke en kommando — de gælder altid');
  assert.deepEqual(core.resolve('/findes-ikke', list).unknown, ['findes-ikke'], 'ukendte navne er inerte');
  assert.deepEqual(core.resolve('/HARNESS-Kodestil', list).skills, ['harness-kodestil'], 'versaler matches');
  assert.deepEqual(core.resolve('/harness-kodestil /harness-kodestil', list).skills, ['harness-kodestil'], 'dubletter aktiveres én gang');
});

test('RESERVED er frossen, og de tre navne fra beslutningen er med — én kilde for core og ui', () => {
  assert.ok(Object.isFrozen(shared.RESERVED));
  assert.deepEqual([...shared.RESERVED].sort(), ['design', 'stil', 'style']);
  assert.equal(core.RESERVED, shared.RESERVED, 'core genbruger ui-modullets tabel');
});

// ─── 2 · Registrerings-API'et ───────────────────────────────────────────────

test('registerCommand: gyldige navne tages imod; reserverede, dubletter og ulovlige navne afvises', () => {
  const api = freshModule();
  assert.equal(api.registerCommand({ name: 'byg-om', description: 'Testkommando' }), true);
  assert.equal(api.registerCommand({ name: 'design', description: 'reserveret' }), false, '/design tilhører S4-S5');
  assert.equal(api.registerCommand({ name: 'stil', description: 'reserveret' }), false, '/stil tilhører S4-S5');
  assert.equal(api.registerCommand({ name: 'style', description: 'reserveret' }), false, 'aliaset er også reserveret');
  assert.equal(api.registerCommand({ name: 'byg-om', description: 'dublet' }), false, 'samme navn igen afvises');
  assert.equal(api.registerCommand({ name: 'Ulovligt Navn' }), false, 'navne er små bogstaver, tal og bindestreger');
  assert.equal(api.registerCommand(null), false);
  assert.deepEqual(plain(api.commands().map(command => command.name)), ['byg-om']);
});

test('en registreret kommando står først i popuppen og aktiverer sin handler ved valg', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  const activated = [];
  assert.equal(api.registerCommand({ name: 'byg-om', description: 'Test', activate: invocation => activated.push(invocation.name) }), true);
  runModule(dom, api, { skills: async () => [] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true, 'popuppen åbner på kommandoen alene');
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['byg-om'], 'S2 registrerer ingen andre kommandoer end testsens egen');
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/byg-om ', 'indsættelsen sætter kommandotokenet med efterfølgende mellemrum');
  assert.deepEqual(activated, ['byg-om'], 'kommandoens aktiveringshook kaldes med navnet');
  assert.deepEqual(plain(api.inserted()), ['byg-om'], 'indsættelsen registreres til selection()');
});

// ─── 3 · Popup-mekanikken i syntetisk DOM ────────────────────────────────────

test('`/` åbner popuppen med skills fra skills:list — højst 8 rækker, uden grundregler', async () => {
  const dom = makeDom();
  const skills = [];
  for (let index = 0; index < 12; index++) skills.push({ id: `harness-skill-${index}`, title: `Skill ${index}`, summary: 'Kort beskrivelse', enabled: true });
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [...skills, { id: 'faelles-grundregler', title: 'Grundregler', summary: 's', enabled: true }] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  assert.equal(dom.layer.open, true, 'laget står åbent');
  assert.equal(api.rows().length, 8, 'højst 8 rækker ad gangen');
  assert.ok(api.rows().every(row => row.id !== 'faelles-grundregler'), 'grundreglerne er ikke en række');
  assert.equal(dom.layer.getAttribute('role'), 'listbox');
  const options = dom.layer.children;
  assert.equal(options.length, 8);
  assert.equal(options[0].getAttribute('role'), 'option');
  assert.match(options[0].textContent, /\/harness-skill-0/);
  assert.match(options[0].textContent, /Skill 0/, 'navn og kort beskrivelse pr. række');
  assert.equal(dom.prompt.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.prompt.getAttribute('aria-controls'), 'slash-menu');
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), options[0].id, 'den aktive række bæres af aria-activedescendant');
  assert.equal(options[0].getAttribute('aria-selected'), 'true');
});

test('filtrering: teksten efter / indsnævrer rækkerne; ingen træffer lukker popuppen', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [
    { id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true },
    { id: 'harness-aura-design', title: 'Aura-design', summary: 's', enabled: true },
    { id: 'harness-git-og-samarbejde', title: 'Git', summary: 's', enabled: false }
  ] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.rows().length, 3);
  dom.prompt.value = '/kod'; dom.prompt.selectionStart = 4; dom.prompt.emit('input');
  await settle();
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['harness-kodestil'], 'bindestregsegmenter matcher også');
  dom.prompt.value = '/findes-ikke'; dom.prompt.selectionStart = 12; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'ingen træffer — popuppen lukker');
});

test('tastaturnavigation: pile flytter markeringen; Enter og Tab indsætter; Escape lukker', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [
    { id: 'harness-aura-design', title: 'Aura-design', summary: 's', enabled: true },
    { id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }
  ] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const option = index => dom.layer.children[index];
  dom.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), option(1).id);
  assert.equal(option(1).getAttribute('aria-selected'), 'true');
  assert.equal(option(0).getAttribute('aria-selected'), 'false');
  dom.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), option(1).id, 'markeringen stopper ved sidste række');
  dom.prompt.emit('keydown', { key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), option(0).id);
  dom.prompt.emit('keydown', { key: 'Tab', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/harness-aura-design ', 'Tab indsætter den markerede række');
  assert.equal(api.open(), false);
  assert.equal(dom.prompt.getAttribute('aria-expanded'), null, 'aria ryddes op efter lukning');
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  dom.prompt.emit('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  assert.equal(api.open(), false, 'Escape lukker popuppen');
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), null);
});

test('Enter i en åben popup indsætter og stopper udbredelsen — den sender ALDRIG beskeden', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [{ id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  let prevented = false, stopped = false;
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() { prevented = true; }, stopPropagation() { stopped = true; } });
  assert.equal(prevented, true, 'Enter får aldrig browserens standardhandling');
  assert.equal(stopped, true, 'app.js’ Enter-lytter når aldrig frem');
  assert.equal(dom.prompt.value, '/harness-kodestil ', 'indsættelsen skete');
  assert.equal(api.open(), false, 'popuppen lukkede');
});

test('app.js’ egen Enter-lytter sender ikke, når popuppen står åben', () => {
  // Find app.js’ Enter-lytter og kør den direkte: med en åben popup skal
  // requestSubmit aldrig kaldes — også når udbredelsen var sluppet forbi.
  const slice = appSource.slice(appSource.indexOf("$('#prompt').addEventListener('keydown'"), appSource.indexOf("$('#send').setAttribute('aria-keyshortcuts'"));
  assert.ok(slice.includes('requestSubmit'), 'udsnittet indeholder afsendelsen');
  // SlashCommands-stubben har begge led: open() bestemmer afsendelsen, og
  // init() kaldes med en stub (layer null), fordi udsnittet også indeholder
  // selve tilkoblingen — uden modul kortslutter den valgfri kæde og rører
  // intet.
  const run = window => {
    const elements = new Map();
    const $ = selector => { if (!elements.has(selector)) elements.set(selector, { value: 'Besked', disabled: false, listeners: {}, setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn; } }); return elements.get(selector); };
    let submitted = 0;
    $('#chat-form').requestSubmit = () => { submitted++; };
    const context = { $, view: {}, pendingSend: null, window, document: { getElementById: () => null } };
    vm.createContext(context); vm.runInContext(slice, context);
    $('#prompt').listeners.keydown({ key: 'Enter', preventDefault() {} });
    return submitted;
  };
  assert.equal(run({ SlashCommands: { open: () => true, init: () => false } }), 0, 'åben popup: ingen afsendelse');
  assert.equal(run({ SlashCommands: { open: () => false, init: () => false } }), 1, 'lukket popup: afsendelsen består');
  assert.equal(run({}), 1, 'uden modul sender Enter som før — nedgradering er uskadelig');
});

test('IME-indtastning udløser ikke: compositionstart lukker, og input under sammensætning genåbner ikke', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [{ id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  dom.prompt.emit('compositionstart');
  assert.equal(api.open(), false, 'sammensætningen lukker popuppen');
  dom.prompt.value = '/です'; dom.prompt.selectionStart = 3; dom.prompt.emit('input');
  assert.equal(api.open(), false, 'input under sammensætning genåbner ikke');
  dom.prompt.value = '/kod'; dom.prompt.selectionStart = 4;
  dom.prompt.emit('compositionend');
  await settle();
  assert.equal(api.open(), true, 'efter sammensætningen gælder de sædvanlige regler');
});

test('URL’er og kodeblokke i skrivefeltet åbner ikke popuppen; tømning og blur lukker', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [{ id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }] });
  dom.prompt.value = 'https://'; dom.prompt.selectionStart = 8; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'URL’er udløser ikke');
  dom.prompt.value = '```\n/'; dom.prompt.selectionStart = 5; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'kodeblokke udløser ikke');
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  dom.prompt.emit('focusout', { relatedTarget: null });
  assert.equal(api.open(), false, 'blur lukker popuppen');
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  dom.prompt.value = 'hej'; dom.prompt.selectionStart = 3; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'tømning af tokenet lukker popuppen');
});

test('museklik virker også: række-klik indsætter uden at fokus forlader feltet', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [{ id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const row = dom.layer.children[0];
  let prevented = false;
  row.emit('mousedown', { preventDefault() { prevented = true; }, button: 0 });
  assert.equal(prevented, true, 'mousedown forhindrer fokusflugt fra skrivefeltet');
  row.emit('click', {});
  assert.equal(dom.prompt.value, '/harness-kodestil ');
  assert.equal(api.open(), false);
});

test('fravalgte skills kan vælges til for én besked og står markeret som sådan', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [
    { id: 'harness-kodestil', title: 'Kodestil', summary: 'Kort om kodestil', enabled: false },
    { id: 'harness-aura-design', title: 'Aura-design', summary: 'Kort om design', enabled: true }
  ] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const rows = api.rows();
  assert.deepEqual(plain(rows.map(row => row.enabled)), [true, false], 'tilslåede skills står bagest');
  assert.match(rows.find(row => !row.enabled).description, /slået fra i projektet/, 'rækken siger, at aktiveringen kun gælder denne besked');
  dom.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/harness-kodestil ');
  assert.deepEqual(plain(api.inserted()), ['harness-kodestil']);
});

// ─── 3b · Review-finding 1: hentningen følger projektet og gemmer aldrig et tomt svar ──

test('samtaleskift: hver åbning genhenter skills — to projekter viser hver sin liste', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let calls = 0;
  const projectA = [{ id: 'harness-a', title: 'Projekt A-skill', summary: 's', enabled: true }];
  const projectB = [{ id: 'harness-b', title: 'Projekt B-skill', summary: 's', enabled: false }];
  runModule(dom, api, { skills: async () => (calls++ === 0 ? projectA : projectB) });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['harness-a'], 'første åbning viser det første projekts liste');
  // Filtrering under den åbne popup genbruger listen — én hentning pr. åben session.
  dom.prompt.value = '/harness'; dom.prompt.selectionStart = 8; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 1, 'ingen ny hentning, mens popuppen står åben');
  // Projekt-/samtaleskift: luk og åbn igen — skills:list genlæses for det nuværende projekt.
  dom.prompt.emit('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 2, 'den nye åbning henter igen (per åbning, som Skills-dialogen)');
  assert.equal(api.open(), true);
  const rows = api.rows();
  assert.deepEqual(plain(rows.map(row => row.id)), ['harness-b'], 'andet projekt viser sin egen liste');
  assert.equal(rows[0].enabled, false, 'enabled-markeringen følger det åbne projekt');
  assert.match(rows[0].description, /slået fra i projektet/, 'markeringen lyver ikke om det nye projekt');
});

test('en fejet første hentning ("Åbn et projekt først.") cachelagres aldrig — popuppen kommer til live', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let fail = true, calls = 0;
  runModule(dom, api, { skills: async () => { calls++; if (fail) throw new Error('Åbn et projekt først.'); return [{ id: 'harness-a', title: 'Projekt A-skill', summary: 's', enabled: true }]; } });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'den fejet hentning åbner ikke popuppen');
  assert.equal(calls, 1);
  fail = false;
  // Brugeren skriver videre — intet tomt svar er gemt, så næste evaluering henter igen.
  dom.prompt.value = '/h'; dom.prompt.selectionStart = 2; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 2, 'det fejlede svar var ikke memoiseret');
  assert.equal(api.open(), true, 'popuppen er ikke permanent død efter den første fejl');
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['harness-a']);
});

test('en tom første hentning cachelagres heller ikke — genåbning efter tom katalogåbning virker', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let calls = 0;
  runModule(dom, api, { skills: async () => (calls++ === 0 ? [] : [{ id: 'harness-b', title: 'Projekt B-skill', summary: 's', enabled: true }]) });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), false, 'et tomt første svar åbner ikke popuppen');
  dom.prompt.value = '/ha'; dom.prompt.selectionStart = 3; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 2, 'det tomme svar var ikke memoiseret');
  assert.equal(api.open(), true, 'anden evaluering henter igen og popuppen åbner');
});

// Review Minor-2 (kladder): indsættelsen skal udløse input på skrivefeltet,
// netop fordi kladde-gemningen lytter på den — ingen fremtidig refactor må
// stille afskære kladden fra popuppen.
test('indsættelsen udløser en input-hændelse på #prompt, så kladde-gemningen reagerer', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [{ id: 'harness-kodestil', title: 'Kodestil', summary: 's', enabled: true }] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true);
  const inputs = [];
  dom.prompt.addEventListener('input', event => inputs.push(event.type));
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/harness-kodestil ');
  assert.deepEqual(inputs, ['input'], 'indsættelsen dispatcher input — kladde-gemningens vej');
});

// ─── 4 · Før du sender og selection() i app.js ───────────────────────────────

test('app.js fører de indsatte tokens videre og viser aktiverede kommandoer i Før du sender', () => {
  assert.ok(appSource.includes('invokedSkills: window.SlashCommands?.inserted()'), 'selection() sender invokedSkills med til prepare');
  assert.ok(appSource.includes('window.SlashCommands?.init('), 'app.js kobler popuppen til skrivefeltet');
  assert.ok(appSource.includes("commandInvocations: 'Kommandoer aktiveret i beskeden'"), 'Før du sender har en række for aktiverede kommandoer');
  const skip = appSource.slice(appSource.indexOf('for (const [key, label] of Object.entries(detailLabels))'), appSource.indexOf('window.ChatMaterials.disclose'));
  assert.ok(skip.includes("'commandInvocations'"), 'rækken vises kun, når der faktisk er aktiverede kommandoer');
});

test('index.html og styles.css: popuppen er et ankeret popover-lag i Auras tokens', () => {
  assert.ok(indexSource.includes('<div id="slash-menu" popover class="menu-material" role="listbox"'), 'P1: popuppen er et popover-element med listbox-rolle på menu-materialet');
  assert.ok(/<script src="slash-commands\.js" defer><\/script>/.test(indexSource), 'modulet indlæses med defer');
  assert.ok(indexSource.indexOf('slash-commands.js') < indexSource.indexOf('app.js'), 'modulet indlæses før app.js');
  const block = stylesSource.slice(stylesSource.indexOf('#slash-menu'), stylesSource.indexOf('#slash-menu button strong'));
  assert.ok(/max-width:\s*420px/.test(block), 'bredden er højst 420 px');
  assert.ok(/max-height:\s*320px/.test(block), 'højden er cirka 320 px');
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(block), 'ingen rå hexfarver — kun Auras tokens');
  // P1: samme popover-grammatik som resten af appen — DSH-menu-materiale,
  // neutral hover/aktiv-række (ingen accent-fyldte rækker).
  assert.ok(!stylesSource.includes('#slash-menu button:hover, #slash-menu button[aria-selected="true"] { background: var(--aura-accent-faint); }'), 'P1: ingen blå aktiv-række i slash-popuppen');
  assert.match(stylesSource, /#slash-menu button:hover, #slash-menu button\[aria-selected="true"\] \{ background: var\(--aura-bg-hover\); \}/, 'P1: hover og aktiv-række er det neutrale alpha-fyld');
  assert.match(stylesSource, /#slash-menu\.menu-material:popover-open \{ display: grid; gap: 2px; \}/, 'P1: rækkerne forbliver et gitter oven på menu-materialet');
});

test('P1: popuppen følger COMPOSEREN og holder sig under topbjælken', () => {
  // Bredden læses fra det kort, feltet står i — aldrig fra vinduet, der også
  // rækker ind over topbjælken og arbejdsfladen (audit §2.6).
  const show = slashSource.slice(slashSource.indexOf('function showLayer()'), slashSource.indexOf('function close()'));
  assert.ok(!show.includes('innerWidth'), 'P1: vinduets bredde styrer ikke længere popuppen');
  assert.match(show, /closest\?\.\('\.composer'\)/, 'P1: bredden følger composer-kortet');
  assert.match(show, /width:\s*\(\) => \{ const rect = card\?\.getBoundingClientRect\?\.\(\); return Math\.min\(420, Math\.max\(220, rect\?\.width \|\| 320\)\); \}/, 'P1: bredden er composerens bredde, loftet 420, gulvet 220');
  assert.match(show, /topLimit:/, 'P1: topgrænsen med i åbningen');
  assert.match(show, /querySelector\?\.\('\.workspace-bar'\)/, 'P1: grænsen er topbjælkens bund — titelen dækkes aldrig');
  const place = fsSync.readFileSync(path.join(ui, 'popover-layer.js'), 'utf8');
  assert.match(place, /options\.topLimit/, 'popover-laget kender topLimit-optionen');
});

// ─── 5 · Aktiveringen gennem prepare/chat-session ────────────────────────────

const { Workbench } = require('../core/workbench.cjs');
const engineModule = require('../core/engine.cjs');

async function workbenchFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-slash-test-'));
  let bench = null;
  t.after(async () => { await bench?.close().catch(() => {}); await fs.rm(directory, { recursive: true, force: true }); });
  const project = path.join(directory, 'project');
  await fs.mkdir(project);
  const engines = [];
  bench = new Workbench({ directory: path.join(directory, 'data'), profiles: path.resolve(__dirname, '../../profiles'), safeStorage: {}, emit() {}, engineFactory: options => {
    engines.push(options);
    const engine = { active: true, session: { id: 'slash-' + engines.length }, resumed: false, start: async () => { engine.active = true; }, send: async () => {}, messages: async () => [{}], summarize: async () => {}, abort: async () => {}, close: async () => { engine.active = false; } };
    return engine;
  } });
  await bench.activate({ root: project, name: 'Slash-aktivering' });
  bench.selection = async () => ({ connection: { id: 'fixture', kind: 'compatible', name: 'Syntetisk', baseURL: 'http://127.0.0.1:1/v1' }, model: { id: 'fixture' } });
  const prepare = extra => bench.prepare({ mode: 'chat', connectionID: 'fixture', modelID: 'fixture', ...extra });
  return { bench, project, engines, prepare };
}

test('aktivering gennem prepare: tokenet aktiverer en fravalgt skill for DENNE afsendelse', async t => {
  const f = await workbenchFixture(t);
  const list = await f.bench.skills.list(f.project);
  const kodestil = list.find(skill => skill.id === 'harness-kodestil');
  assert.ok(kodestil, 'kataloget har kodestil-skillen');
  assert.equal(kodestil.enabled, false, 'i grundpakken er kvalitet ikke slået til i projektet');
  const plain = await f.prepare({ text: 'Byg noget læsbart' });
  assert.equal(plain.commandInvocations, undefined, 'uden token er der ingen aktiverede kommandoer — konsollen er uændret');
  const activated = await f.prepare({ text: 'Ret koden med /harness-kodestil' });
  assert.deepEqual(activated.commandInvocations, [`/harness-kodestil · ${kodestil.title}`], 'Før du sender viser den aktiverede kommando');
  assert.ok(activated.skills.includes(kodestil.title), 'oversigten over skills omfatter den aktiverede');
  assert.notEqual(activated.fingerprint, plain.fingerprint, 'fingeraftrykket regner aktiveringen med');
  assert.notEqual(activated.sessionFingerprint, plain.sessionFingerprint, 'modelsessionen binder sig til det effektive skillvalg');
  const context = f.bench.chat.prepared.context;
  assert.ok(context.skills.some(skill => skill.name === 'harness-kodestil'), 'den effektive kontekst omfatter den aktiverede skill');
  assert.ok(!context.skills.some(skill => skill.name === 'harness-git-og-samarbejde'), 'andre fravalgte skills aktiveres ikke');
  await f.bench.send({ text: 'Ret koden med /harness-kodestil', fingerprint: activated.fingerprint, contextBinding: activated.contextBinding });
  assert.ok(f.engines.at(-1).skills.some(skill => skill.name === 'harness-kodestil'), 'motoren får den aktiverede skill med i denne kørsel');
  const permission = engineModule.permissions('/root', [], 'chat', { directory: '/engine', names: f.engines.at(-1).skills.map(skill => skill.name) });
  assert.equal(permission.skill['harness-kodestil'], 'allow', 'den aktiverede skill er tilladt i denne kørsel');
  assert.notEqual(permission.skill['harness-git-og-samarbejde'], 'allow', 'andre fravalgte skills nægtes stadig');
  assert.equal(permission.skill['*'], 'deny', 'resten af kataloget er som før');
});

test('fjernes tokenet, fjernes aktiveringen — værten genvaliderer fra selve teksten', async t => {
  const f = await workbenchFixture(t);
  await f.prepare({ text: 'Brug /harness-kodestil' });
  assert.ok(f.bench.chat.prepared.context.skills.some(skill => skill.name === 'harness-kodestil'));
  const without = await f.prepare({ text: 'Brug kodestil-skillen' });
  assert.equal(without.commandInvocations, undefined);
  assert.ok(!f.bench.chat.prepared.context.skills.some(skill => skill.name === 'harness-kodestil'), 'aktiveringen følger tokenet, ikke et tidligere valg');
  await assert.rejects(f.prepare({ text: 'Hej', invokedSkills: 'ikke-en-liste' }), /Ugyldige kommandoer/, 'rendererens invokedSkills valideres som form');
});

test('grundregler og altid-aktive skills kan ikke slås fra gennem kommandoen', async t => {
  const f = await workbenchFixture(t);
  const rules = await f.prepare({ text: '/faelles-grundregler og /design i samme besked' });
  assert.equal(rules.commandInvocations, undefined, 'grundreglerne er ikke en kommando, og /design er reserveret');
  assert.ok(!f.bench.chat.prepared.context.skills.some(skill => skill.name === 'design'), 'reserverede navne aktiverer intet i S2');
  const context = f.bench.chat.prepared.context;
  assert.ok(context.skills.some(skill => skill.name === 'harness-aura-design'), 'den altid-aktive designhjælper består');
  assert.ok(context.rules && context.rules.length > 0, 'grundreglerne sender altid med');
  await f.prepare({ text: 'Byg uden kommandoer', invokedSkills: ['harness-kodestil'] });
  assert.ok(!f.bench.chat.prepared.context.skills.some(skill => skill.name === 'harness-kodestil'), 'rendererens liste er ikke aktivering — teksten er');
});

test('skills.effective: projektets valg plus aktiveringer — og intet uden navne', async t => {
  const f = await workbenchFixture(t);
  const base = await f.bench.skills.effective(f.project, []);
  assert.equal(base.activated.length, 0, 'ingen aktiveringer uden tokens');
  assert.ok(base.skills.every(skill => skill.name !== 'harness-kodestil'), 'grundpakken uden aktivering');
  const effective = await f.bench.skills.effective(f.project, ['harness-kodestil', 'findes-ikke', 'harness-aura-design']);
  assert.deepEqual(effective.activated, ['harness-kodestil'], 'ukendte navne ignoreres, altid-aktive tilføjes ikke igen');
  const skill = effective.skills.find(item => item.name === 'harness-kodestil');
  assert.ok(skill && skill.files.some(file => file.path === 'SKILL.md'), 'den aktiverede skill har sine filer med');
  const list = await f.bench.skills.list(f.project);
  assert.ok(effective.titles.includes(list.find(item => item.id === 'harness-kodestil').title), 'titlen følger med til Før du sender');
});

// ─── Fælles hjælpere ────────────────────────────────────────────────────────

class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.children = []; this.parentElement = null;
    this.attributes = new Map(); this.dataset = {}; this._classes = new Set(); this._text = '';
    this.hidden = false; this.disabled = false; this.open = false; this.id = ''; this.type = '';
    this.value = ''; this.selectionStart = 0; this.selectionEnd = 0; this.listeners = {}; this.onclick = null; this._document = null;
  }
  set className(value) { this._classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classes].join(' '); }
  get classList() { const el = this; return { add: (...names) => names.forEach(name => el._classes.add(name)), remove: (...names) => names.forEach(name => el._classes.delete(name)), toggle: (name, force) => { const on = force === undefined ? !el._classes.has(name) : Boolean(force); if (on) el._classes.add(name); else el._classes.delete(name); return on; }, contains: name => el._classes.has(name) }; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = String(value); this.children = []; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name.startsWith('data-')) this.dataset[dataKey(name.slice(5))] = String(value); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  removeAttribute(name) { this.attributes.delete(name); }
  append(...children) { for (const child of children) { if (typeof child === 'string') this._text += child; else { child.parentElement = this; this.children.push(child); } } }
  replaceChildren(...children) { this._text = ''; this.children = []; this.append(...children); }
  addEventListener(name, handler) { (this.listeners[name] ||= []).push(handler); }
  emit(name, fields = {}) { const event = { target: this, ...fields }; for (const handler of this.listeners[name] || []) handler(event); return event; }
  dispatchEvent(event) { return this.emit(event.type, event); }
  focus() { if (this._document) this._document.activeElement = this; }
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  showPopover() { this.open = true; }
  hidePopover() { this.open = false; }
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
  scrollIntoView() {}
}
const dataKey = name => name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

// Et friskt modul pr. test: registrerede kommandoer og DOM-tilstand må ikke
// lække mellem testene, så modulet køres i sin egen vm med egen eksport. En
// syntetisk DOM (eller ingen) gives med, for modulet tegner rækkerne selv.
function freshModule(dom) {
  const source = fsSync.readFileSync(path.join(ui, 'slash-commands.js'), 'utf8');
  const sandbox = { window: dom ? { document: dom.document } : {}, globalThis: {}, module: { exports: {} } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

function makeDom() {
  const document = { activeElement: null, createElement: tag => { const el = new El(tag); el._document = document; return el; } };
  const registry = new Map();
  const make = (tag, id) => { const el = new El(tag); el._document = document; el.id = id || ''; if (id) registry.set(id, el); return el; };
  document.getElementById = id => registry.get(id) || null;
  const prompt = make('textarea', 'prompt');
  const layer = make('div', 'slash-menu');
  layer.setAttribute('role', 'listbox');
  const form = make('form', 'chat-form');
  form.append(prompt);
  const body = make('body');
  body.append(form, layer);
  return { document, registry, prompt, layer, form };
}

function runModule(dom, api, options) {
  const popoverLayer = { open: ({ layer }) => { layer.showPopover(); return true; }, close: ({ layer } = {}) => { (layer || dom.layer).hidePopover(); }, position() {} };
  api.init({ prompt: dom.prompt, layer: dom.layer, skills: options.skills, popoverLayer });
}

const settle = () => new Promise(resolve => setImmediate(resolve));
