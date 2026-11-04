const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

// R1: pillen er et resumé, ikke reglen. De fire interne værdier (chat, plan,
// free, build — index.html/app.js/conversation-permission.js bekræfter
// modellen) skal hver især gengives ærligt, og »Spørg før ændringer« må KUN
// bruges, når det faktisk gælder — renderer kan ikke se opgavens givne
// tilladelser (approvals-policy.cjs allowed(): taskRules, autoProjectFiles,
// sandboxede automatiske kommandoer, gemte regler og mapperegler), så pillen
// hævder det aldrig.
const pill = require('../ui/permission-pill.js');
const summary = (mode, active) => pill.summary(mode, { active });

test('de fire interne værdier gengives ærligt — »Spørg før ændringer« hævdes aldrig', () => {
  assert.equal(summary('chat', false).label, 'Kun læsning', 'Samtale er læsning — skrivning blokeres i policyen');
  assert.equal(summary('plan', false).label, 'Kun læsning', 'Planlæg er læsning — skrivning blokeres i policyen');
  assert.equal(summary('free', false).label, 'Projektets tilladelser', 'Byg uden YOLO: de faktiske regler afgør — intet samlet udsagn findes renderer-siden');
  assert.equal(summary('build', false).label, 'Projektets tilladelser', 'Byg den valgte plan uden YOLO: samme ærlige resumé');
  assert.equal(summary('free', true).label, 'YOLO · kun denne samtale', 'YOLO aktiv er samtalegranten');
  assert.equal(summary('build', true).label, 'YOLO · kun denne samtale');
  // »Spørg før ændringer« må KUN bruges, når det faktisk gælder: ingen
  // tilstand her kan bevise det, så strengen optræder aldrig.
  for (const mode of ['chat', 'plan', 'free', 'build']) for (const active of [false, true]) {
    assert.ok(!JSON.stringify(summary(mode, active)).includes('Spørg før ændringer'), `${mode}/${active} hævder aldrig at spørge før ændringer`);
  }
  // Read-only modes holder deres etiket også med en armeret YOLO-grant:
  // granten giver ingen ekstra rettigheder i Samtale/Planlæg.
  assert.equal(summary('chat', true).label, 'Kun læsning');
  assert.equal(summary('plan', true).label, 'Kun læsning');
});

test('YOLO-punktet: deaktivering forsvinder aldrig — aktivering findes kun under Byg', () => {
  // R1: »Slå fra« forbliver tilgængelig, også når Byg-menuen er skjult.
  assert.equal(summary('chat', true).yolo, 'disable', 'armeret YOLO i Samtale kan slås fra');
  assert.equal(summary('plan', true).yolo, 'disable', 'armeret YOLO i Planlæg kan slås fra');
  assert.equal(summary('build', true).yolo, 'disable');
  assert.equal(summary('free', true).yolo, 'disable');
  // Aktiveringsvejen findes kun under Byg (dialogen afviser andet).
  assert.equal(summary('free', false).yolo, 'enable');
  assert.equal(summary('build', false).yolo, 'enable');
  assert.equal(summary('chat', false).yolo, 'none', 'Samtale tilbyder ikke YOLO');
  assert.equal(summary('plan', false).yolo, 'none', 'Planlæg tilbyder ikke YOLO');
});

test('hver tone har en forklaring, der siger sandheden om godkendelsesgrundlaget', () => {
  for (const [mode, active] of [['chat', false], ['free', false], ['free', true]]) {
    const state = summary(mode, active);
    assert.ok(state.explanation.length > 20, `${mode}/${active} har en forklaring`);
    assert.ok(!state.explanation.includes('undefined'), `${mode}/${active} forklaring er komplet`);
  }
  assert.match(summary('free', false).explanation, /projektets regler, opgavens tilladelser eller en gemt regel/);
  assert.match(summary('free', true).explanation, /Planer, dataregler og beskyttede filer g\u00e6lder stadig/);
  assert.match(summary('chat', false).explanation, /\u00e6ndrer ingen filer og k\u00f8rer ingen kommandoer/);
});

test('renderer-modulet gemmer intet: YOLO forbliver en samtaletilladelse under Byg', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'ui', 'permission-pill.js'), 'utf8');
  // AGENTS.md: YOLO aktiveres aldrig fra pillen uden dialogen, og valget
  // gemmes ikke til næste appstart. Modulet er rent: ingen kald til main,
  // ingen localStorage, ingen profilskrivning — kun resuméet.
  assert.ok(!/localStorage|profileSave|call\(|harness\./.test(source), 'pillen skriver ingen tilstand noget sted hen');
});

test('index.html: pillen og menuens opmærkning — YOLO-punktet bor hos pillen, caps-overskriften er væk', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
  // Pillen i bundrækken med ærlig aria og skjold-glyf (§5.3).
  assert.match(index, /id="permission-pill"[^>]*aria-expanded="false"/, 'pillen starter lukket');
  assert.match(index, /id="permission-pill"[^>]*aria-controls="permission-menu"/);
  assert.match(index, /id="permission-pill-label"/, 'pillens etiket har egen node');
  assert.ok(index.includes('class="permission-shield"'), 'skjold-glyffen er en eksisterende inline-SVG i appens stil — ikke et nyt ikonsæt');
  // YOLO-punktet (§5.4) og dets grænsenotat bor i pillens menu.
  const menuStart = index.indexOf('id="permission-menu"'), menuEnd = index.indexOf('</div>', index.indexOf('id="composer-mode-boundary"'));
  const menu = index.slice(menuStart, menuEnd);
  assert.ok(menu.includes('id="permission-menu-text"') && menu.includes('id="composer-yolo"') && menu.includes('id="composer-mode-boundary"'), 'menuen rummer forklaringen, YOLO-punktet og grænsen');
  // Arbejdsmåde-menuen: ingen versal overskrift, ingen YOLO-fod mere.
  const modeMenu = index.slice(index.indexOf('id="composer-mode-menu"'), index.indexOf('id="model-picker"'));
  assert.ok(!modeMenu.includes('mode-menu-title'), 'overskriften »HVAD VIL DU NU?« er fjernet (§5.4)');
  assert.ok(!modeMenu.includes('mode-menu-footer') && !modeMenu.includes('composer-yolo'), 'YOLO-punktet er flyttet ud af arbejdsmåde-menuen');
  assert.ok(modeMenu.includes('data-work-mode="chat"') && modeMenu.includes('data-work-mode="plan"') && modeMenu.includes('data-work-mode="free"'), 'de tre synlige valg består');
});

test('arbejdsmåde-menuen viser ÉT flueben: span’et er slukket, ::after ejer mærket (Fund 1)', () => {
  const fs2 = require('node:fs');
  const feedback = fs2.readFileSync(path.join(__dirname, '..', 'ui', 'feedback-layout.css'), 'utf8');
  const components = fs2.readFileSync(path.join(__dirname, '..', 'ui', 'components.css'), 'utf8');
  // Det gamle span-flueben (visibility:visible ved valgt) er slukket — ellers
  // renderede den valgte række TO fluebæn (spån + ::after).
  assert.match(feedback, /#composer-mode-menu \.mode-menu-check\s*\{\s*display:\s*none/, 'det gamle span-flueben er slukket med display:none');
  assert.ok(!/\.mode-menu-check\s*\{[^}]*visibility:\s*visible/.test(feedback) && !/\[aria-checked="true"\] \.mode-menu-check\s*\{[^}]*visibility:\s*visible/.test(feedback), 'ingen synlighedsregel vækker span’et igen');
  // .menu-material-ejeren: det ene flueben står i ::after ved aria-checked.
  assert.match(components, /\.menu-material \[aria-checked="true"\]::after\s*\{[^}]*content:\s*"\u2713"/, 'menu-materialets ::after ejer det ene flueben');
});

test('index.html: genvejslinjen lever videre som aria-describedby-mål og Send-tooltip (Parthee-beslutning)', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
  const SHORTCUT = 'Enter sender · Shift+Enter giver en ny linje';
  assert.ok(index.includes(`id="composer-shortcut"`), 'elementet består som describedby-mål');
  assert.ok(index.includes(SHORTCUT), 'teksten er uændret verbatim');
  assert.match(index, /id="composer-shortcut"[^>]*class="composer-shortcut visually-hidden"/, 'linjen er visuel skjult — tekst til skærmlæser og tooltip');
  assert.match(index, /id="prompt"[^>]*aria-describedby="composer-shortcut"/, 'skrivefeltet peger på den');
  assert.match(index, /id="send"[^>]*aria-describedby="composer-shortcut"/, 'Send peger på den');
  assert.ok(index.includes('title="' + SHORTCUT + '"'), 'Send bærer teksten som tooltip');
  assert.ok(index.includes('id="composer-help"'), '»?«-knappen består ved composeren (Parthee-beslutning)');
});

test('index.html: (+)-menuen lover alle fire stier — og pladsholderen lover ingen »/« eller »@« (R5)', () => {
  const index = fs.readFileSync(path.join(__dirname, '..', 'ui', 'index.html'), 'utf8');
  const menu = index.slice(index.indexOf('id="chat-materials-menu"'), index.indexOf('</div></div>', index.indexOf('id="chat-materials-menu"')));
  for (const path of ['Tekst og kode', 'PDF-dokument', 'Billede', 'Referencemappe']) assert.ok(menu.includes(path), `${path} består som vej`);
  assert.ok(menu.includes('data-material-picker="chatMaterialsChooseFiles"') && menu.includes('data-material-picker="chatMaterialsChooseFolder"'), 'de eksisterende bindingsstier består');
  assert.ok(!/\/ for kommandoer|@ for filer/.test(index), 'pladsholderen lover ingen slash- eller mention-funktioner (R5)');
});
