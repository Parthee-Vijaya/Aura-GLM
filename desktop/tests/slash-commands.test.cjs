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
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['byg-om', 'stil'], 'S2 registrerer ingen andre KOMMANDOER; S4s fastgjorte /stil-række står efter dem');
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
  // S4: den fastgjorte /stil-række står først; skills fylder resten.
  assert.match(options[0].textContent, /\/stil/);
  assert.match(options[1].textContent, /\/harness-skill-0/);
  // S5-UI-fix (a) opdaterer pin: rækken viser tokenet (navnet) + det,
  // skillen GØR (resuméet) — titlen foran resuméet var en selvgentagelse
  // og er fjernet fra beskrivelsen i hele popuppen.
  assert.match(options[1].textContent, /Kort beskrivelse/, 'rækken viser det, skillen gør');
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
  assert.equal(api.rows().length, 4, 'S4s /stil-række plus de tre skills');
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
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), option(2).id, 'markeringen stopper ved sidste række');
  dom.prompt.emit('keydown', { key: 'ArrowUp', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.getAttribute('aria-activedescendant'), option(1).id);
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
  assert.equal(dom.prompt.value, '/stil ', 'indsættelsen skete — markeringen står på S4s fastgjorte række');
  assert.equal(api.open(), true, 'indsættelsen af `/stil ` åbner katalogniveauet (uden henter: status «Kataloget kunne ikke hentes»)');
  assert.equal(api.level(), 'styles', 'popuppen er på katalogniveauet');
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
  const row = dom.layer.children[1];
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
  const rows = api.rows().filter(row => row.kind === 'skill');
  assert.deepEqual(plain(rows.map(row => row.enabled)), [true, false], 'tilslåede skills står bagest');
  assert.match(rows.find(row => !row.enabled).description, /slået fra · kun for denne besked/, 'rækken siger, at aktiveringen kun gælder denne besked');
  dom.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
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
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil', 'harness-a'], 'første åbning viser S4s /stil-række og det første projekts liste');
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
  assert.deepEqual(plain(rows.map(row => row.id)), ['stil', 'harness-b'], 'andet projekt viser sin egen liste');
  const skill = rows.find(row => row.kind === 'skill');
  assert.equal(skill.enabled, false, 'enabled-markeringen følger det åbne projekt');
  assert.match(skill.description, /slået fra · kun for denne besked/, 'markeringen lyver ikke om det nye projekt');
});

test('en fejet første hentning ("Åbn et projekt først.") cachelagres aldrig — popuppen kommer til live', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let fail = true, calls = 0;
  runModule(dom, api, { skills: async () => { calls++; if (fail) throw new Error('Åbn et projekt først.'); return [{ id: 'harness-a', title: 'Projekt A-skill', summary: 's', enabled: true }]; } });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true, 'den fejet hentning lader S4s fastgjorte /stil-række stå — men intet svar er gemt');
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil']);
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
  assert.equal(api.open(), true, 'et tomt første svar lader /stil-rækken stå — den er lokal');
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil']);
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
  dom.prompt.emit('keydown', { key: 'ArrowDown', preventDefault() {}, stopPropagation() {} });
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
  // S3-fix (UX 7): ingen vandret scroll — sporet er låst til lagets bredde, og
  // både navn og beskrivelse afkortes med ellipsis (målt før: menuen scrollede
  // 1199 px ved 371 px klientbredde, og rækkerne var ~930 px brede).
  assert.match(block, /overflow-x:\s*hidden/, 'popuppen har ingen vandret scrollbar');
  assert.match(block, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, 'sporet kan ikke vokse med indholdet');
  const nameBlock = stylesSource.slice(stylesSource.indexOf('#slash-menu button strong'), stylesSource.indexOf('#slash-menu button small'));
  assert.match(nameBlock, /text-overflow:\s*ellipsis/, 'lange navne afkortes med ellipsis');
  assert.match(nameBlock, /overflow:\s*hidden/, 'navnet klipper ikke midt i et ord uden ellipsis');
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
  const design = (await f.bench.skills.list(f.project)).find(skill => skill.id === 'harness-design');
  const rules = await f.prepare({ text: '/faelles-grundregler og /design i samme besked' });
  // S3: /design er ikke længere inert — aliaset aktiverer GradientDeck-skilllet
  // (harness-design). Grundreglerne er stadig ikke en kommando.
  assert.deepEqual(rules.commandInvocations, [`/design · ${design.title}`], 'grundreglerne aktiverer intet; /design aktiverer GradientDeck');
  const context = f.bench.chat.prepared.context;
  assert.ok(context.skills.some(skill => skill.name === 'harness-design'), '/design aktiverer harness-design for denne afsendelse');
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
  api.init({ prompt: dom.prompt, layer: dom.layer, skills: options.skills, styles: options.styles, popoverLayer });
}

const settle = () => new Promise(resolve => setImmediate(resolve));

// ─── 6 · S3: /design aktiverer GradientDeck-skilllet (harness-design) ────────
// Det reserverede navn hævdes af den fuldportede skill: harness-design er
// SKILL-navnet, /design er kaldenavnet. Én aliaskilde deles af popup og vært.

test('S3: /design er skillaliaset — registerCommand afviser stadig navnet', () => {
  assert.ok(Object.isFrozen(shared.SKILL_TOKENS), 'aliastabellen er frossen');
  assert.deepEqual(shared.SKILL_TOKENS, { 'harness-design': 'design' }, 'harness-design aktiveres som /design');
  assert.equal(shared.skillToken('harness-design'), 'design');
  assert.equal(shared.skillToken('harness-kodestil'), 'harness-kodestil', 'uden alias er tokenet id\'et');
  assert.equal(shared.tokenSkill('design'), 'harness-design');
  assert.equal(shared.tokenSkill('harness-kodestil'), null, 'almindelige navne er ikke alias');
  const api = freshModule();
  assert.equal(api.registerCommand({ name: 'design', description: 'x' }), false, 'navnet tilhører skillaliaset — aldrig en registreret kommando');
  assert.equal(api.registerCommand({ name: 'stil', description: 'x' }), false, '/stil forbliver reserveret til S4-S5');
});

test('S3: resolve aktiverer harness-design fra /design; uden skillen er navnet igen inert', () => {
  const list = [
    { id: 'faelles-grundregler', title: 'Grundregler' },
    { id: 'harness-design', title: 'GradientDeck-design' },
    { id: 'harness-kodestil', title: 'Kodestil og vedligeholdelse' }
  ];
  const claimed = core.resolve('Brug /design nu', list);
  assert.deepEqual(claimed.skills, ['harness-design'], 'aliastokenet aktiverer skillen');
  assert.deepEqual(claimed.invocations, [{ token: '/design', name: 'harness-design', title: 'GradientDeck-design' }]);
  assert.deepEqual(claimed.reserved, [], '/design er hævet — ikke længere inert');
  assert.deepEqual(claimed.unknown, []);
  const byId = core.resolve('/harness-design', list);
  assert.deepEqual(byId.skills, ['harness-design'], 'det fulde navn virker også');
  assert.equal(byId.invocations[0].token, '/harness-design', 'gennemgangen viser tokenet, som det står');
  const both = core.resolve('/design /harness-design', list);
  assert.deepEqual(both.skills, ['harness-design'], 'dubletter aktiveres én gang');
  const denied = core.resolve('/design /stil', list.filter(entry => entry.id !== 'harness-design'));
  assert.deepEqual(denied.skills, [], 'uden skillen i kataloget aktiverer /design intet');
  assert.deepEqual(denied.reserved, ['design', 'stil'], 'og rapporteres igen som reserveret');
  assert.deepEqual(core.resolve('/faelles-grundregler', list).skills, [], 'grundreglerne er stadig ikke en kommando');
  // S3-fix (Minor 5): reserverede navne holder foran kataloget — også hvis et
  // fremtidigt skill-ID skulle hedde stil/style, forbliver /stil og /style
  // inert (S2-invarianten, som S4 bygger /stil oven på).
  const hostile = [{ id: 'stil', title: 'Fremtidig stil' }, { id: 'style', title: 'Alias' }];
  const guard = core.resolve('/stil /style', hostile);
  assert.deepEqual(guard.skills, [], 'et fremtidigt skill med reserveret navn aktiverer ikke via tokenet');
  assert.deepEqual(guard.reserved, ['stil', 'style'], 'navnene rapporteres som reserverede');
});

test('S3: popuppen tilbyder /design-rækken og indsætter /design-tokenet', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [
    { id: 'harness-aura-design', title: 'Aura-design', summary: 's', enabled: true },
    { id: 'harness-design', title: 'GradientDeck-design', summary: 'Retninger og kvalitet', enabled: false }
  ] });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const row = api.rows().find(item => item.id === 'design');
  assert.ok(row, 'skillens række bærer alias-tokenet');
  assert.equal(row.kind, 'skill');
  // S5-UI-fix (a): beskrivelsen starter med det, skillen gør — titlen står
  // ikke længere to gange («GradientDeck-design · GradientDecks …»-fejlen fra
  // S3-liveanalysen). Navnet i rækken er tokenet; beskrivelsen er handlingen.
  assert.ok(row.description.startsWith('Retninger og kvalitet'), 'beskrivelsen starter med det, skillen gør');
  assert.ok(!row.description.startsWith('GradientDeck-design'), 'intet selvgentagende navn i starten');
  assert.match(row.description, /slået fra · kun for denne besked/, 'den fravalgte funktion aktiveres kun for denne besked');
  dom.prompt.value = '/desi'; dom.prompt.selectionStart = 5; dom.prompt.emit('input');
  await settle();
  assert.deepEqual(plain(api.rows().map(item => item.id)), ['design', 'harness-aura-design'], 'filtrering rammer aliaset — fastlåst først, aura-designsegmentet derefter som i S2');
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/design ', 'indsættelsen sætter alias-tokenet med mellemrum');
  assert.deepEqual(plain(api.inserted()), ['design'], 'rendererens regnskab bærer tokenet');
});

// S3-fix (UX 6): /design er popuppens hovedindgang — aliasrækken er FASTLÅST
// øverst (efter kommandoer, før de almindelige skills), så den altid er
// synlig ved bare `/`, uanset hvor mange slåede-til skills der sorterer først.
test('S3-fix: /design-rækken er altid synlig ved bare `/`, også over otte slåede-til skills', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  const many = [{ id: 'harness-design', title: 'GradientDeck-design', summary: 'Retninger', enabled: false }];
  for (let index = 0; index < 12; index++) many.push({ id: `harness-slaaet-til-${index}`, title: `Slået til ${index}`, summary: 's', enabled: true });
  runModule(dom, api, { skills: async () => many });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const rows = api.rows();
  assert.equal(rows.length, 8, 'højst 8 rækker stadig');
  assert.equal(rows[0].id, 'design', 'aliasrækken står først — før de slåede-til skills');
  assert.equal(rows[0].kind, 'skill', 'den er en skillrække, ikke en kommando');
  // Sorteringen af de øvrige følger titlerne med dansk alfabetisering ("10" og "11" mellem "1" og "2").
  assert.deepEqual(plain(rows.slice(2).map(row => row.id)), ['harness-slaaet-til-0', 'harness-slaaet-til-1', 'harness-slaaet-til-10', 'harness-slaaet-til-11', 'harness-slaaet-til-2', 'harness-slaaet-til-3'], 'resten af rækkerne følger den sædvanlige orden — S4s /stil står som nr. 2');
});

test('S3: /design aktiverer harness-design for afsendelsen gennem prepare', async t => {
  const f = await workbenchFixture(t);
  const list = await f.bench.skills.list(f.project);
  const design = list.find(skill => skill.id === 'harness-design');
  assert.ok(design, 'den portede GradientDeck-skill er i kataloget');
  assert.equal(design.enabled, false, 'funktionen er fravalgt som standard — /design aktiverer pr. besked');
  const plainMessage = await f.prepare({ text: 'Byg en landingpage' });
  assert.equal(plainMessage.commandInvocations, undefined, 'uden token er konsollen uændret');
  const activated = await f.prepare({ text: 'Byg en landingpage /design' });
  assert.deepEqual(activated.commandInvocations, [`/design · ${design.title}`], 'Før du sender viser aktiveringen');
  assert.ok(activated.skills.includes(design.title), 'oversigten over skills omfatter den aktiverede');
  assert.notEqual(activated.fingerprint, plainMessage.fingerprint, 'fingeraftrykket regner /design med');
  const context = f.bench.chat.prepared.context;
  assert.ok(context.skills.some(skill => skill.name === 'harness-design'), 'den effektive kontekst omfatter GradientDeck');
  assert.ok(context.skills.some(skill => skill.name === 'harness-aura-design'), 'den altid-aktive designhjælp består');
  // Fjernes tokenet, fjernes aktiveringen — det dækker 'fjernes tokenet'-testen ovenfor.
  await f.bench.send({ text: 'Byg en landingpage /design', fingerprint: activated.fingerprint, contextBinding: activated.contextBinding });
  const engineSkills = f.engines.at(-1).skills;
  const skill = engineSkills.find(item => item.name === 'harness-design');
  assert.ok(skill, 'motoren får skillens filer med i denne kørsel');
  for (const file of ['worlds/worlds.json', 'photos/photos.json', 'scripts/roll.mjs', 'LICENSE']) {
    assert.ok(skill.files.some(item => item.path === file), `${file} følger med som fuldgyldig skill`);
  }
  const permission = engineModule.permissions('/root', [], 'free', { directory: '/engine', names: engineSkills.map(item => item.name) });
  assert.equal(permission.skill['harness-design'], 'allow', 'den aktiverede skill er tilladt i kørslen');
  assert.equal(permission.bash, 'ask', 'roll-scriptet kræver fortsat kommandogodkendelse — aktiveringen giver ingen kommandotilladelse');
});

test('S3: writeSkills kopierer datafilerne og skriver kommandogodkendelses-bilaget', async t => {
  const f = await workbenchFixture(t);
  await f.prepare({ text: '/design' });
  const skill = f.bench.chat.prepared.context.skills.find(item => item.name === 'harness-design');
  assert.ok(skill, 'aktiveringen bringer skillens filer med');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-s3-engine-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  await engineModule.writeSkills(directory, [skill]);
  const root = path.join(directory, 'config', 'skills', 'harness-design');
  for (const file of ['SKILL.md', 'worlds/worlds.json', 'photos/photos.json', 'scripts/roll.mjs', 'LICENSE']) {
    assert.ok((await fs.stat(path.join(root, file))).isFile(), `${file} er kopieret til motorens konfigmappe`);
  }
  const text = await fs.readFile(path.join(root, 'SKILL.md'), 'utf8');
  for (const file of ['worlds/worlds.json', 'photos/photos.json', 'scripts/roll.mjs']) {
    assert.ok(text.includes(JSON.stringify(path.join(root, file))), `${file} står med præcis absolut sti i bilaget`);
  }
  assert.match(text, /kommandogodkendelse/, 'bilaget kræver kommandogodkendelse af rollen');
  assert.match(text, /almindelig tekst/, 'bilaget beskriver faldetbagever til worlds.json som tekst');
  const other = await fs.mkdtemp(path.join(os.tmpdir(), 'aura-s3-afvis-'));
  t.after(() => fs.rm(other, { recursive: true, force: true }));
  await assert.rejects(engineModule.writeSkills(other, [{ name: 'harness-design', files: [
    { path: 'SKILL.md', content: '---\nname: harness-design\ndescription: x\n---\n' },
    { path: 'scripts/evil.sh', content: 'rm -rf' }
  ] }]), /ugyldig fil/, 'vilkårlige scripts accepteres aldrig i motoren');
});

// ─── 7 · S4: /stil — katalogniveauet i popuppen (hentes sikkert i S4-fladen) ──
// /stil (alias /style) er stadig RESERVED: registerCommand afviser navnet, og
// resolve aktiverer intet. Popuppen viser en fastgjort række (som /design) og
// åbner katalogniveauet efter `/stil ` — hentet gennem host-ejet IPC, aldrig
// med en URL fra rendereren. Valg indsætter `/stil <slug> ` og sender aldrig.

const STYLES_CATALOG = {
  status: 'ok', cached: false, stale: false, fetchedAt: '2026-11-04T10:00:00.000Z',
  entries: [
    { slug: 'cloudflare', name: 'Cloudflare', category: 'Web', theme: 'dark' },
    { slug: 'blond', name: 'Blond', category: 'Mode', theme: 'light' },
    { slug: 'nordvang', name: 'Nordvang', category: 'Kommune', theme: 'dark' },
    { slug: 'violet-hill', name: 'Violet Hill', category: 'Musik', theme: 'light' },
    { slug: 'skagen', name: 'Skagen', category: 'Turisme', theme: 'light' },
    { slug: 'havnen', name: 'Havnen', category: 'Kommune', theme: 'dark' },
    { slug: 'groenlandsvej', name: 'Grønlandsvej', category: 'Bolig', theme: 'dark' },
    { slug: 'plaene', name: 'Plænen', category: 'Kultur', theme: 'dark' },
    { slug: 'stenvej', name: 'Stenvej', category: 'Bolig', theme: 'light' },
    { slug: 'vindmolle', name: 'Vindmølle', category: 'Energi', theme: 'dark' },
    { slug: 'fjord', name: 'Fjord', category: 'Turisme', theme: 'light' }
  ]
};

test('S4: argumentAt — `/stil ` med markøren i argumentet åbner katalogniveauet', () => {  assert.deepEqual(shared.argumentAt('/stil ', 6), { start: 0, end: 6, query: '' }, 'tomt argument er katalogniveauet');
  assert.deepEqual(shared.argumentAt('/stil cl', 8), { start: 0, end: 8, query: 'cl' }, 'det tastede argument er forespørgslen');
  assert.deepEqual(shared.argumentAt('Se /style bl', 12), { start: 3, end: 12, query: 'bl' }, 'aliaset gælder også efter whitespace');
  assert.deepEqual(shared.argumentAt('/stil cloudflare', 16), { start: 0, end: 16, query: 'cloudflare' }, 'fuldt slug er stadig katalogniveauet');
  assert.equal(shared.argumentAt('/stil', 5), null, 'uden mellemrum er det stadig kommandoniveauet');
  assert.equal(shared.argumentAt('https://x.dk/stil x', 19), null, 'URL-ord starter ikke argumentet');
  assert.equal(shared.argumentAt('```\n/stil cl\n```', 12), null, 'kodeblokke åbner ikke kataloget');
  assert.equal(shared.argumentAt('/design cl', 11), null, 'andre kommandoer har intet katalogniveau');
  assert.equal(shared.argumentAt('/stil ', 2), null, 'markøren i kommandoordet er ikke argumentet');
});

test('S4: /stil er RESERVED med fastgjort række — aldrig en registreret kommando', () => {
  const api = freshModule();
  assert.equal(api.registerCommand({ name: 'stil', description: 'x' }), false, 'registerCommand afviser stadig reserverede navn');
  assert.equal(api.registerCommand({ name: 'style', description: 'x' }), false, 'aliaset afvises også');
  assert.deepEqual([...shared.RESERVED].sort(), ['design', 'stil', 'style'], 'RESERVED består uændret');
});

test('S4: den fastgjorte /stil-række står med /design før kataloget — RESERVED-før-katalog består', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  const many = [
    { id: 'harness-design', title: 'GradientDeck-design', summary: 's', enabled: false },
    { id: 'harness-aura-design', title: 'Aura-design', summary: 's', enabled: true },
    ...Array.from({ length: 12 }, (_unused, index) => ({ id: `harness-slaaet-til-${index}`, title: `Slået til ${index}`, summary: 's', enabled: true }))
  ];
  runModule(dom, api, { skills: async () => many, styles: async () => STYLES_CATALOG });
  dom.prompt.value = '/'; dom.prompt.selectionStart = 1; dom.prompt.emit('input');
  await settle();
  const rows = api.rows();
  assert.equal(rows.length, 8, 'højst 8 rækker');
  assert.deepEqual(plain(rows.slice(0, 2).map(row => row.id)), ['design', 'stil'], '/design og /stil er fastgjorte — før skills-kataloget');
  assert.equal(rows[1].kind, 'builtin', '/stil er en betroet indbygget kommando, ikke en skill');
  // S5-UI-fix (a): rækken starter med handlingen («vælg en designstil») —
  // ikke med navnet på tjenesten; kilden nævnes én gang, som en del af hvad
  // rækken gør. I S5 gælder anvendelsen også projektet.
  assert.match(rows[1].description, /^Vælg en designstil/, 'beskrivelsen starter med, hvad /stil gør');
  assert.match(rows[1].description, /GradientDeck/, 'kilden står i rækken');
  assert.match(rows[1].description, /anvendes i projektet/, 'rækken siger, at stilen kan anvendes');
  dom.prompt.value = '/sti'; dom.prompt.selectionStart = 4; dom.prompt.emit('input');
  await settle();
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil'], 'filtrering rammer den fastgjorte række');
  dom.prompt.value = '/sty'; dom.prompt.selectionStart = 4; dom.prompt.emit('input');
  await settle();
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil'], 'præfikset /sty rammer også');
  dom.prompt.value = '/style'; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  assert.deepEqual(plain(api.rows().map(row => row.id)), ['stil'], 'aliaset /style viser samme række');
});

test('S4: valg af /stil-rækken indsætter `/stil ` og åbner katalogniveauet', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  const styleFetches = [];
  runModule(dom, api, { skills: async () => [], styles: async () => { styleFetches.push(Date.now()); return STYLES_CATALOG; } });
  dom.prompt.value = '/sti'; dom.prompt.selectionStart = 4; dom.prompt.emit('input');
  await settle();
  assert.equal(styleFetches.length, 0, 'kataloget hentes ALDRIG ved almindelig /-åbning');
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, '/stil ', 'indsættelsen sætter kommandoen med mellemrum');
  await settle();
  assert.equal(styleFetches.length, 1, 'katalogåbningen henter ved første `/stil `-åbning');
  assert.equal(api.open(), true, 'popuppen står åben på katalogniveauet');
  assert.equal(api.level(), 'styles', 'modulet er på katalogniveauet');
});

test('S4: katalogniveauet — rækker, filtrering, tema i tilgængelig tekst og hentet-markering', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [], styles: async () => ({ ...STYLES_CATALOG, cachedStyles: ['cloudflare'] }) });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  let rows = api.rows();
  assert.equal(rows.length, 8, 'højst 8 stiler vises');
  assert.equal(rows[0].kind, 'style');
  assert.equal(rows[0].id, 'blond', 'tom forespørgsel: alfabetisk med da');
  assert.equal(rows[1].id, 'cloudflare', 'alfabetisk rækkefølge — ikke katalogrækkefølge');
  const cloudflare = rows[1];
  assert.equal(cloudflare.name, 'Cloudflare', 'navnet (strong) bærer rækken');
  assert.match(cloudflare.themeText, /Mørk/, 'temaet står i tilgængelig tekst — prikken bærer betydningen alene');
  assert.equal(cloudflare.theme, 'dark', 'temaet bæres af rækken');
  assert.equal(cloudflare.fetched, true, 'den hentede stil er markeret');
  const blond = rows[0];
  assert.match(blond.themeText, /Lys/);
  assert.equal(blond.fetched, false);
  // Overflow-rækken står efter de otte og er ikke valgbar.
  const overflow = api.overflowText();
  assert.match(overflow, /3 flere\. Skriv for at filtrere\./, 'resten tælles ærligt op');
  dom.prompt.value = '/stil ko'; dom.prompt.selectionStart = 8; dom.prompt.emit('input');
  await settle();
  rows = api.rows();
  assert.deepEqual(plain(rows.map(row => row.id)), ['havnen', 'nordvang'], 'præfiks på navn, slug og kategori — her kategorien «Kommune»');
  dom.prompt.value = '/stil zzzz'; dom.prompt.selectionStart = 10; dom.prompt.emit('input');
  await settle();
  assert.equal(api.open(), true, 'ingen træffer lukker ikke popuppen på katalogniveauet');
  assert.equal(api.statusText(), 'Ingen stile matcher «zzzz»', 'statuslinjen siger det ærligt');
});

test('S4: Enter og Tab på katalogniveauet indsætter `/stil <slug> ` — de sender ALDRIG', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [], styles: async () => STYLES_CATALOG });
  dom.prompt.value = '/stil bl'; dom.prompt.selectionStart = 8; dom.prompt.emit('input');
  await settle();
  let prevented = false;
  dom.prompt.emit('keydown', { key: 'Enter', preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true, 'Enter når aldrig afsendelsen');
  assert.equal(dom.prompt.value, '/stil blond ', 'indsættelsen sætter slug med mellemrum');
  assert.equal(api.open(), false, 'popuppen lukker efter indsættelsen');
  dom.prompt.value = 'Byg /stil sk'; dom.prompt.selectionStart = 11; dom.prompt.emit('input');
  await settle();
  dom.prompt.emit('keydown', { key: 'Tab', preventDefault() {}, stopPropagation() {} });
  assert.equal(dom.prompt.value, 'Byg /stil skagen ', 'indsættelsen bevarer teksten omkring kommandoen');
  assert.deepEqual(plain(api.inserted()), [], 'katalogniveauet registrerer ingen skillaktivering');
});

test('S4: kataloghentningen genbruges mens popuppen står åben — og kasseres ved lukning', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let calls = 0;
  runModule(dom, api, { skills: async () => [], styles: async () => { calls++; return STYLES_CATALOG; } });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  dom.prompt.value = '/stil bl'; dom.prompt.selectionStart = 8; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 1, 'filtrering genbruger hentningen — én pr. åben session');
  dom.prompt.emit('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  assert.equal(calls, 2, 'genåbning henter igen som skills:list — projektet kan have skiftet');
});

test('S4: «Henter katalog…» og fejltekster står som status på katalogniveauet', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  let answer = null;
  runModule(dom, api, { skills: async () => [], styles: async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); return answer; } });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  assert.equal(api.statusText(), 'Henter katalog…', 'hentningen er en ærlig status');
  answer = { status: 'error', message: 'GradientDeck kunne ikke nås. Prøv igen.' };
  await settle();
  await settle();
  assert.equal(api.statusText(), 'GradientDeck kunne ikke nås. Prøv igen.', 'fejlen videresendes konkret');
  assert.equal(api.rows().length, 0, 'fejlstatus er ikke en valgbar række');
});

test('S4: katalogniveauet rydder op ved IME og blur som kommandoniveauet', async () => {
  const dom = makeDom();
  const api = freshModule(dom);
  runModule(dom, api, { skills: async () => [], styles: async () => STYLES_CATALOG });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  assert.equal(api.level(), 'styles');
  dom.prompt.emit('compositionstart');
  assert.equal(api.open(), false, 'sammensætning lukker også katalogniveauet');
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  dom.prompt.emit('focusout', { relatedTarget: null });
  assert.equal(api.open(), false, 'blur lukker katalogniveauet');
});

test('S4: samtykkedialogen lukker popuppen — kataloget genåbner alligevel (markør-nulstilling)', async () => {
  // Livefundet (probe 4.11): en modal dialog (GradientDeck-samtykket) lukker
  // popuppen, og Chromium nulstiller selectionStart til 0, selv når teksten er
  // urørt. Er TEKSTEN uændret, genbruges argumentet, så kataloget genåbnes —
  // ellers ville første-samtykke-åbningen aldrig vise stilene.
  const dom = makeDom();
  const api = freshModule(dom);
  let resolveCatalog;
  const catalog = new Promise(resolve => { resolveCatalog = resolve; });
  runModule(dom, api, { skills: async () => [], styles: () => catalog });
  dom.prompt.value = '/stil '; dom.prompt.selectionStart = 6; dom.prompt.emit('input');
  await settle();
  assert.equal(api.statusText(), 'Henter katalog…');
  // Dialogen åbner: prompten mister fokus → popuppen lukker; markøren nulstilles.
  dom.prompt.emit('focusout', { relatedTarget: null });
  dom.prompt.selectionStart = 0;
  assert.equal(api.open(), false);
  resolveCatalog({ status: 'ok', cached: false, stale: false, entries: STYLES_CATALOG.entries });
  await settle(); await settle();
  assert.equal(api.open(), true, 'kataloget genåbner efter samtykket — teksten er uændret');
  assert.equal(api.level(), 'styles');
  assert.equal(api.rows().length, 8, 'stilrækkerne står');
  // Ændrer brugeren teksten under hentningen, afgør markøren igen som før.
  let second;
  const catalog2 = new Promise(resolve => { second = resolve; });
  const dom2 = makeDom();
  const api2 = freshModule(dom2);
  runModule(dom2, api2, { skills: async () => [], styles: () => catalog2 });
  dom2.prompt.value = '/stil '; dom2.prompt.selectionStart = 6; dom2.prompt.emit('input');
  await settle();
  dom2.prompt.value = 'Nu skrev jeg noget andet'; dom2.prompt.selectionStart = 27; dom2.prompt.emit('input');  // teksten ændret: ingen genåbning fra den gamle fortsættelse
  second({ status: 'ok', cached: false, stale: false, entries: STYLES_CATALOG.entries });
  await settle(); await settle();
  assert.equal(api2.open(), false, 'en ændret tekst genåbner ikke kataloget fra den gamle fortsættelse');
});

test('S4: /stil aktiverer intet og ændrer ikke fingeraftrykket — resolve beholder RESERVED-ordenen', async t => {
  const f = await workbenchFixture(t);
  const plainMessage = await f.prepare({ text: 'Byg en landingpage' });
  const withStil = await f.prepare({ text: 'Byg en landingpage med /stil cloudflare' });
  assert.equal(withStil.commandInvocations, undefined, '/stil aktiverer ingen kommando');
  assert.equal(withStil.fingerprint, plainMessage.fingerprint, 'fingeraftrykket er byte-identisk — /stil indgår ikke');
  assert.equal(withStil.sessionFingerprint, plainMessage.sessionFingerprint, 'modelsessionen er uændret');
  const resolved = core.resolve('/design /stil /style', [
    { id: 'faelles-grundregler', title: 'Grundregler' },
    { id: 'harness-design', title: 'GradientDeck-design' }
  ]);
  assert.deepEqual(resolved.skills, ['harness-design'], '/design aktiverer; /stil og /style gør ikke');
  assert.deepEqual(resolved.reserved, ['stil', 'style'], 'de reserverede navne rapporteres som før');
});

// ─── 8 · S4-gennemgangen Fund 4: grammatikken deles mellem vært og afsendelse ──
// En selvstændig `/stil <slug>` hentes i værten uden nogen model, så app.js'
// forbindelses- og modelvagte må ikke stoppe den. Ren grense-grammatik i ÉN
// kilde (styleMessage i ui/slash-commands.js): værten (core/gradientdeck.cjs
// styleCommand) og afsendelsesvagten (app.js) kan aldrig divergere.

test('S4-fix (Fund 4): styleMessage — er beskeden en selvstændig /stil-kommando med argument?', () => {
  assert.equal(shared.styleMessage('/stil cloudflare'), true);
  assert.equal(shared.styleMessage('/style cloudflare'), true, 'aliaset gælder');
  assert.equal(shared.styleMessage('  /stil skygge  '), true, 'yderste whitespace er ligegyldigt');
  assert.equal(shared.styleMessage('/STIL skygge'), true, 'kommandonavnet er versaluafhængigt — værtens validSlug svarer på formatet');
  assert.equal(shared.styleMessage('/stil UGYLDIGT-format'), true, 'et ugyldigt slug-format er stadig kommandoen: værten svarer med den ærlige fejl');
  assert.equal(shared.styleMessage('/stil'), false, 'en bar /stil er almindelig tekst og kræver en model');
  assert.equal(shared.styleMessage('/stil '), false, 'tomt argument er ikke en kommando');
  assert.equal(shared.styleMessage('Byg noget med /stil skygge'), false, 'blandet prosa er en almindelig besked');
  assert.equal(shared.styleMessage('/stil skygge og byg'), false, 'prosa efter argumentet gør den til en almindelig besked');
  assert.equal(shared.styleMessage('```\n/stil skygge\n```'), false, 'kodeblokke er ikke kommandoen');
  assert.equal(shared.styleMessage(''), false);
  assert.equal(shared.styleMessage(null), false);
});

test('S4-fix (Fund 4): styleCommand genbruger styleMessage — vært og grænse er én kilde', () => {
  const { styleCommand } = require('../core/gradientdeck.cjs');
  for (const text of ['/stil cloudflare', '/style cloudflare', '  /stil skygge  ']) {
    assert.deepEqual(styleCommand(text), { slug: text.trim().split(/\s+/)[1].toLowerCase() }, `${text}: kommandoen anerkendes gennem styleMessage`);
  }
  for (const text of ['/stil UGYLDIGT', '/style ../', '/STIL Cloudflare']) {
    assert.deepEqual(styleCommand(text), { invalid: true }, `${text}: ugyldigt format gennem samme grense`);
  }
  for (const text of ['/stil', 'Byg med /stil skygge', '/stil skygge og byg', '', null]) {
    assert.equal(styleCommand(text), null, `${JSON.stringify(text)}: ikke en kommando — styleMessage siger nej, og værten følger`);
  }
});

test('S4-fix (Fund 4): app.js afsender en selvstændig /stil-kommando uden valgt AI-forbindelse', () => {
  assert.match(appSource, /styleMessage/, 'app.js genbruger den delte grammatik');
  // Udsnittet er selve onsubmit-floden: fra dens start til DENNE handlers
  // prepare-kald (med owner — dataknappens kommer først i filen).
  const slice = appSource.slice(appSource.indexOf("$('#chat-form').onsubmit"), appSource.indexOf("const data = await call('prepare', selection(), owner)"));
  assert.ok(slice.includes('styleOnly'), 'onsubmit beregner styleOnly ud fra beskedteksten');
  assert.match(slice, /!styleOnly && !\$\('#connection-select'\)\.value/, 'forbindelsesvagten springer for kommandoen');
  assert.match(slice, /!styleOnly && \(!\$\('#connection-select'\)\.value \|\| !\$\('#model-select'\)\.value/, 'modelvagten springer for kommandoen');
  assert.match(slice, /window\.SlashCommands\?\.styleMessage/, 'grammatikken kommer fra det delte modul — aldrig en lokal kopi');
});

// ─── 9 · S5-UI-fixe fra S3-liveanalysen (Claude) ─────────────────────────────

test('S5-UI: navnekolonnen får min-content-plads op til ~55% — navne afkortes mindst muligt', () => {
  const styles = fsSync.readFileSync(path.join(ui, 'styles.css'), 'utf8');
  const nameBlock = styles.slice(styles.indexOf('#slash-menu button strong'), styles.indexOf('#slash-menu button small'));
  assert.match(nameBlock, /min-width:\s*min-content/, 'navnekolonnen får min-content-plads');
  assert.match(nameBlock, /max-width:\s*55%/, 'loftet er ~55%, så beskrivelsen beholder plads');
  assert.match(nameBlock, /white-space:\s*nowrap/, 'DSH består: rækken er stadig én linje');
  assert.match(nameBlock, /text-overflow:\s*ellipsis/, 'afkortning sker med ellipsis — aldrig et klip');
});

test('S5-UI: Funktioner-teksten er almindeligt dansk — ingen uforklarede «verdener»-metaforer', () => {
  const catalog = JSON.parse(fsSync.readFileSync(path.join(__dirname, '..', '..', 'profiles', 'catalog.json'), 'utf8'));
  const feature = catalog.features.find(item => item.id === 'gradientdesign');
  assert.ok(feature, 'gradientdesign-funktionen findes i kataloget');
  assert.doesNotMatch(feature.summary, /verden(er|erne)?\b/i, '«verdener» er væk — metaforen forklares eller bruges ikke');
  assert.doesNotMatch(feature.summary, /et script, der trækker/i, 'script-metaforen er forklaret væk');
  assert.match(feature.summary, /design(retning|valg|metode)/i, 'teksten siger, hvad funktionen gør');
  assert.match(feature.summary, /\/design/, 'aktiveringen med /design står der stadig');
  assert.match(feature.summary, /besked/i, 'og at valget gælder pr. besked');
});
