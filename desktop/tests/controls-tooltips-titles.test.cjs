// SPDX-License-Identifier: EUPL-1.2
// T8 · Kontroller, tooltips og samtaletitler (0.6.0-beta.2) — de statiske pins for
// skivens ændringer. Arbejdsliste: claude-uiux-audit.md punkt 9 + §4, S3-fund
// (f) (samtaletitler) + #chat-materials-menu-skyggen, P1-rapportens bekymring
// (a) (<480 px: begge arbejdsmåde-chips væk), D1-re-reviewens NOTE (calm-
// skuffens skygge er hårdkodet) og t8-brief.md (bindende).
//
// Hver pin fryser én konkret ændring: .approval-kind på --aura-warning-ink
// (≥5:1 i BEGGE temaer, målt her — intet antages), switches på --aura-tokens,
// .info som systemfont-glyf i fast 16 px-boks, ÉN tooltip-mekanisme (12/16,
// radius 8, menu-materiale, ind 40 ms / ud 80 ms, 400 ms forsinkelse, hover
// OG fokus, aria), titelafledning uden kommando-tokens (ren lokal afledning),
// altid-én-arbejdsmåde-chip, (+)-menuen på menu-materialet, calm-skuffens
// skygge på --aura-shadow-overlay, ikonvælgerens roving tabindex og
// versionsnummeret.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const ui = path.join(root, 'ui');
const read = file => fs.readFileSync(file, 'utf8');
const uiRead = name => read(path.join(ui, name));
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(uiRead('aura-tokens.css'));
const styles = strip(uiRead('styles.css'));
const calm = strip(uiRead('workspace-calm.css'));
const components = strip(uiRead('components.css'));
const materialsCss = strip(uiRead('chat-materials.css'));
const indexHtml = uiRead('index.html');
const app = uiRead('app.js');
const settingsJs = uiRead('settings.js');
const tooltipJs = fs.existsSync(path.join(ui, 'tooltip.js')) ? uiRead('tooltip.js') : '';
const profileIcons = uiRead('profile-icons.js');
const historySource = uiRead('../core/workspace-history.cjs');
const { titleFrom } = require(path.join(root, 'core', 'workspace-history.cjs'));
const pkg = JSON.parse(read(path.join(root, 'package.json')));
const lock = JSON.parse(read(path.join(root, 'package-lock.json')));

// ── Kontrastmatematik (WCAG 2.1, samme hjælper som dsh-polish.test.cjs) ──
const luminance = rgb => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
const contrast = (fg, bg) => { const a = luminance(fg), b = luminance(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
const tokenRGB = (values, name) => values[`--${name}`] || null;
const themes = require('./helpers/theme-tokens.cjs').tokenThemes(tokens);
const themeBlocks = () => Object.entries(themes).map(([theme, values]) => [values, theme]);

// ── 1. .approval-kind: --aura-warning-ink, 12 px, ≥5:1 i begge temaer ──
test('.approval-kind bærer --aura-warning-ink og 12 px i begge regler (MUST-FIX)', () => {
  const base = /\.approval-kind\s*\{[^}]*\}/.exec(styles);
  assert.ok(base, 'basisreglen findes');
  assert.match(base[0], /color:\s*var\(--aura-warning-ink\)/, 'basisreglen bruger --aura-warning-ink (ikke #8a5a12)');
  assert.match(base[0], /font-size:\s*var\(--aura-text-12\)/, '11 px er løftet til typeskalaens 12 px');
  assert.ok(!/8a5a12/.test(base[0]), 'den hårdkodede advarselsfarve er væk');
  const calmRule = /\.workspace-calm :is\(\.approval-kind[^)]*\)\s*\{[^}]*\}/.exec(calm);
  assert.ok(calmRule, 'calm-reglen findes');
  assert.match(calmRule[0], /color:\s*var\(--aura-warning-ink\)/, 'calm-reglen bruger --aura-warning-ink (ikke --calm-warning)');
});

test('.approval-kind måler ≥5:1 på warning-subtle i BEGGE temaer (målt, ikke antaget)', () => {
  for (const [block, theme] of themeBlocks()) {
    const ink = tokenRGB(block, 'aura-warning-ink');
    const subtle = tokenRGB(block, 'aura-warning-subtle');
    assert.ok(ink && subtle, `${theme}: tokens findes`);
    const ratio = contrast(ink, subtle);
    assert.ok(ratio >= 5, `${theme}: warning-ink på warning-subtle er ${ratio.toFixed(2)}:1 — kravet er ≥5:1`);
  }
});

// ── 2. Switches på --aura-tokens (af-/til-stil, thumb og fokus) ──
test('switchens spor, knop og fokus står på --aura-tokens i basisreglen', () => {
  const track = /input\[type=checkbox\]\[role=switch\]\s*\{[^}]*\}/.exec(styles);
  const thumb = /input\[type=checkbox\]\[role=switch\]::before\s*\{[^}]*\}/.exec(styles);
  const checked = /input\[type=checkbox\]\[role=switch\]:checked\s*\{[^}]*\}/.exec(styles);
  const checkedThumb = /input\[type=checkbox\]\[role=switch\]:checked::before\s*\{[^}]*\}/.exec(styles);
  const focus = /input\[type=checkbox\]\[role=switch\]:focus-visible\s*\{[^}]*\}/.exec(styles);
  assert.ok(track && thumb && checked && checkedThumb, 'switchens fire regler findes');
  assert.match(track[0], /background:\s*var\(--aura-switch-track\)/, 'af-sporet bærer sit eget spor-token (efter-byg F12 — ikke --aura-bg-tint/#c5d0de)');
  assert.match(thumb[0], /background:\s*var\(--aura-ink-muted\)/, 'knappen er --aura-ink-muted (ikke hvid/#14263b40-skygge)');
  assert.ok(!/14263b40/.test(thumb[0]), 'den hårdkodede knap-skygge er væk');
  assert.match(checkedThumb[0], /background:\s*var\(--aura-bg\)/, 'til-knappen er --aura-bg på accent-sporet');
  assert.ok(focus, 'switchen har en :focus-visible-regel');
  assert.match(focus[0], /outline:\s*2px solid var\(--accent\)/, 'fokusringen er accent (synlig ved tastatur)');
});

test('switchens kontrast er målt i begge temaer (knop ≥3:1 mod spor og accent-spor)', () => {
  for (const [block, theme] of themeBlocks()) {
    const muted = tokenRGB(block, 'aura-ink-muted'), track = tokenRGB(block, 'aura-switch-track') || tokenRGB(block, 'aura-bg-tint');
    const accent = tokenRGB(block, 'aura-accent'), bg = tokenRGB(block, 'aura-bg');
    const off = contrast(muted, track), on = contrast(bg, accent);
    assert.ok(off >= 3, `${theme}: knop på af-spor er ${off.toFixed(2)}:1 — kravet er ≥3:1`);
    assert.ok(on >= 3, `${theme}: knop på accent-spor er ${on.toFixed(2)}:1 — kravet er ≥3:1`);
  }
});

test('den mørke bloks switch-duplikater er væk — basisreglen ejer begge temaer', () => {
  const darkBlock = styles.slice(styles.lastIndexOf('@media (prefers-color-scheme: dark)'));
  assert.ok(!/role=switch/.test(darkBlock), 'mørk blok har ingen switch-regler tilbage');
  // #c5d0de var switchens egen; den findes ikke længere noget sted. #14263b40
  // tilhører også switchens knap-skygge — men dialog-sløret (dialog::backdrop)
  // bærer sin egen ældre værdi, der er en anden flade uden for denne skive.
  assert.ok(!/c5d0de/.test(strip(uiRead('styles.css')) + calm + components), '#c5d0de er væk fra alle sheets');
  const track = /input\[type=checkbox\]\[role=switch\]\s*\{[^}]*\}/.exec(styles);
  const thumb = /input\[type=checkbox\]\[role=switch\]::before\s*\{[^}]*\}/.exec(styles);
  assert.ok(track && thumb && !/14263b40/.test(track[0] + thumb[0]), 'knappens #14263b40-skygge er væk fra switchen');
});

// ── 3. .info: systemfont + linjeglyf i fast 16 px-boks ──
test('.info-knappen er en systemfont-glyf i en fast 16 px-boks — Georgia og #b9c7dc er væk', () => {
  const rule = /\.info\s*\{[^}]*\}/.exec(styles);
  assert.ok(rule, 'reglen findes');
  assert.ok(!/Georgia/.test(rule[0]) && !/italic/.test(rule[0]), 'kursiv Georgia er væk');
  assert.ok(!/b9c7dc/.test(strip(uiRead('styles.css'))), 'kanten #b9c7dc er væk');
  assert.ok(!/border:\s*1px/.test(rule[0]), 'knappen har ingen egen kant');
  assert.match(rule[0], /width:\s*16px;\s*height:\s*16px/, 'glyfboksen er fast 16 px som de øvrige glyffer');
  assert.match(rule[0], /font-family:\s*var\(--aura-font-family\)/, 'systemfonten er --aura-font-family');
  assert.match(rule[0], /font-size:\s*13px;\s*line-height:\s*1/, 'glyffen står i 13/1 som de øvrige glyfbokse');
  assert.match(rule[0], /color:\s*var\(--aura-ink-secondary\)/, 'glyffen bærer den læsbar sekundære farve');
  const hover = /\.info:hover:not\(:disabled\)\s*\{[^}]*\}/.exec(styles);
  const expanded = /\.info\[aria-expanded="true"\]\s*\{[^}]*\}/.exec(styles);
  assert.ok(hover && expanded, 'hover- og åben-tilstandene findes');
  assert.match(hover[0], /background:\s*var\(--aura-bg-hover\)/, 'hover er alfa-fyldet');
  assert.match(hover[0], /color:\s*var\(--aura-ink\)/, 'hover-teksten er ink');
  assert.match(expanded[0], /background:\s*var\(--aura-button-primary\)/, 'åben-tilstanden er primærknappens par');
  assert.match(expanded[0], /color:\s*var\(--aura-button-primary-text\)/, 'åben-tilstandens tekst er primærknappens tekstfarve');
});

test('.info-glyffen måler AA i begge temaer (sekundær på lærred og primærknappens par)', () => {
  for (const [block, theme] of themeBlocks()) {
    const secondary = tokenRGB(block, 'aura-ink-secondary'), canvas = tokenRGB(block, 'aura-bg');
    const primary = tokenRGB(block, 'aura-button-primary'), primaryText = tokenRGB(block, 'aura-button-primary-text');
    const rest = contrast(secondary, canvas), open = contrast(primaryText, primary);
    assert.ok(rest >= 4.5, `${theme}: glyffen hviler på ${rest.toFixed(2)}:1 — kravet er AA (≥4,5:1)`);
    assert.ok(open >= 4.5, `${theme}: åben-tilstanden måler ${open.toFixed(2)}:1 — kravet er AA (≥4,5:1)`);
  }
});

// ── 4. ÉN tooltip-mekanisme ──
test('.aura-tooltip er den ene tooltip-grammatik: 12/16, radius 8, menu-materiale, ind 40 ms / ud 80 ms', () => {
  const rule = /\.aura-tooltip\s*\{[^}]*\}/.exec(components);
  assert.ok(rule, 'komponenten findes i components.css');
  assert.match(rule[0], /font-size:\s*var\(--aura-text-12\)/, 'teksten er 12 px fra typeskalaen');
  assert.match(rule[0], /line-height:\s*var\(--aura-text-12-line\)/, 'linjehøjden er 16 px fra typeskalaen');
  assert.match(rule[0], /border-radius:\s*var\(--aura-radius-sm\)/, 'radius er 8');
  assert.match(rule[0], /padding:\s*10px 12px/, 'paddingen ejer fladen (over menu-materialets 6/4)');
  assert.match(rule[0], /transition:[^}]*opacity 80ms/, 'ud-fasen er 80 ms');
  assert.match(rule[0], /allow-discrete/, 'popover-laget lever gennem overgangen');
  const open = /\.aura-tooltip:popover-open\s*\{[^}]*\}/.exec(components);
  assert.ok(open, 'åbn-reglen findes');
  assert.match(open[0], /transition:[^}]*opacity 40ms/, 'ind-fasen er 40 ms');
  const starting = /@starting-style\s*\{[^}]*\.aura-tooltip:popover-open\s*\{[^}]*opacity:\s*0[^}]*\}[^}]*\}/.exec(components);
  assert.ok(starting, '@starting-style giver ind-fasen sit udgangspunkt');
});

test('tooltips mekanisme: 400 ms forsinkelse, hover OG fokus, aria (ui/tooltip.js)', () => {
  assert.match(tooltipJs, /delay\s*=\s*400|DELAY\s*=\s*400/, '400 ms forsinkelse er mekanismens egen konstant');
  assert.match(tooltipJs, /mouseenter/, 'hover åbner (m. forsinkelse)');
  assert.match(tooltipJs, /setTimeout\(.*open|timer\s*=\s*setTimeout/, 'forsinkelsen er en timer');
  assert.match(tooltipJs, /addEventListener\('focus'/, 'tastaturfokus åbner uden musehover');
  assert.match(tooltipJs, /blur/, 'fokus-tab lukker');
  assert.match(tooltipJs, /aria-describedby/, 'mekanismen binder laget til afbryderen med aria-describedby');
  assert.match(app, /window\.Tooltip\.wire|Tooltip\.wire\(/, 'statuslinjens hjælp er koblet på mekanismen (app.js)');
});

test('de to tooltip-flader bærer mekanismen: .status-line-help og .info-pop', () => {
  assert.match(indexHtml, /<div id="status-line-help" popover class="status-line-help menu-material aura-tooltip"[^>]*role="tooltip"/, 'statuslinjens hjælp er menu-materiale + tooltip-mekanisme med role=tooltip');
  assert.match(indexHtml, /id="context-status"[^>]*aria-describedby="status-line-help"/, 'afbryderen peger på laget (aria består)');
  assert.match(app, /node\('div', '', 'info-pop menu-material aura-tooltip'\)/, 'ⓘ-boblen skabes på samme materiale og mekanisme');
  assert.ok(!/#status-line-help\s*\{[^}]*padding/.test(styles), '#status-line-help ejer ikke længere padding (grammatikken gør)');
  assert.ok(!/#info-pop\s*\{[^}]*padding/.test(styles), '#info-pop ejer ikke længere padding (grammatikken gør)');
});

test('kendelsen: native title-attributter forbliter appens lette lag (dokumenteret)', () => {
  // S1-review Minor-2: native title vises ikke ved tastaturfokus i Chromium.
  // Kendelsen er dokumenteret i tooltip.js — mekanismen dækker fokus for sine
  // flader, og de native titler forbliver som det lette lag (fx #send, projekt-
  // rækker, skillelinjer). Pins: dokumentationen findes, og de native titler
  // er ikke blevet fjernet fra de eksisterende flader.
  assert.match(tooltipJs, /native title|S1-review|tastaturfokus/i, 'kendelsen er dokumenteret i mekanismen');
  assert.match(indexHtml, /id="send"[^>]*title="/, 'native title består på Send (kendelsen: det lette lag bliver)');
});

// ── 5. Samtaletitler: ren lokal afledning uden kommando-tokens ──
test('titelafledning: kommando-tokens strippes med den delte token-grammatik', () => {
  assert.equal(titleFrom([{ role: 'user', text: '/design Lav en rolig forside til projektet' }]), 'Lav en rolig forside til projektet', 'S3-fund (f): /design står ikke i titlen');
  // Efter-byg F5 (Codex d1 + T8-review Minor): kun KENDTE kommando-tokens
  // strippes — et bart /ord som «/gradient» er brugerens indhold, ikke en
  // kommando. (Denne pin fryste den gamle overbredde stripning; nu ændres den
  // med vilje til at bevare det ubekendte token.)
  assert.equal(titleFrom([{ role: 'user', text: '/design /gradient Byg en forside i GradientDeck-stil. Blå.' }]), '/gradient Byg en forside i GradientDeck-stil', 'kendte tokens strippes — det ubekendte /gradient er indhold og består');
  assert.equal(titleFrom([{ role: 'user', text: '/design /design Byg et kort. Blåt.' }]), 'Byg et kort', 'ALLE forekomster af det kendte token strippes (efter-byg F5)');
  assert.equal(titleFrom([{ role: 'user', text: 'Ryd op i /src-mappen. Blåt.' }]), 'Ryd op i /src-mappen', 'et bart /ord er brugerens indhold — det strippes ikke (Codex-reproen)');
  assert.equal(titleFrom([{ role: 'user', text: 'Hvad betyder /stil? Godt spørgsmål.' }]), 'Hvad betyder /stil', 'efterfølgende tegn gør /stil? til inert tekst — intet strippes overhovedet');
  assert.equal(titleFrom([{ role: 'user', text: 'Byg en side /design med ro' }]), 'Byg en side med ro', 'tokens midt i teksten strippes også');
  assert.equal(titleFrom([{ role: 'user', text: '/design\n\nLav en rolig forside til projektet' }]), 'Lav en rolig forside til projektet', 'kommandolinjen er ikke en meningsfuld linje — næste afsnit er');
});

test('titelafledning: første MENINGSFULDE besked, fald tilbage til tomt', () => {
  assert.equal(titleFrom([{ role: 'user', text: '/design' }, { role: 'assistant', text: 'Svar' }, { role: 'user', text: 'Lav en forside til klubben' }]), 'Lav en forside til klubben', 'en besked der kun er en kommando, er ikke navnet — den næste brugerbesked er');
  assert.equal(titleFrom([]), '', 'ingen beskeder giver tomt (forbrugerne viser Ny samtale)');
  assert.equal(titleFrom([{ role: 'user', text: '   ' }]), '', 'tom tekst giver tomt');
  assert.equal(titleFrom([{ role: 'user', text: '/design ' }]), '', 'en besked der kun er kommando-token, giver tomt');
});

test('titelafledning: lange navne afkortes ved et ordskifte (bestående kontrakt)', () => {
  const long = titleFrom([{ role: 'user', text: 'En lang beskrivelse af en side til foreningens medlemmer med kalender og tilmelding til arrangementer' }]);
  assert.ok(long.endsWith(' …')); assert.ok(long.length <= 62); assert.doesNotMatch(long, /\S+[^\s…]…$/);
  const commandLong = titleFrom([{ role: 'user', text: '/design Lav en meget lang forside til foreningens medlemmer med kalender, tilmelding og udskriftvenlig visning af hele listen' }]);
  assert.ok(commandLong.endsWith(' …'), 'afkortningen gælder også efter kommando-strip');
  assert.doesNotMatch(commandLong, /design/i, 'kommandoen følger ikke med i den afkortede titel');
});

test('titelafledning er ren og lokal: ingen netværks- eller modelkald i kilden', () => {
  const source = historySource.slice(historySource.indexOf('function titleFrom'), historySource.indexOf('module.exports'));
  assert.ok(source.length > 0, 'titleFrom findes');
  for (const banned of [/fetch/, /require\('node:http/, /net\./, /ipc/, /invoke/, /chat\(/]) assert.doesNotMatch(source, banned, `afledningen må ikke bruge ${banned}`);
  assert.match(historySource, /parseTokens/, 'token-grammatikken genbruges fra ui/slash-commands.js (én kilde)');
});

test('titlerne er ÉN kilde: topbjælke, projektliste og Fortryd/genoptag-stier læser samme kilde med Ny samtale-fald', () => {
  const chats = uiRead('chats.js');
  assert.match(chats, /chat\.title \|\| 'Ny samtale'/, 'projektlistens fald er Ny samtale');
  assert.match(app, /chatTitle = id =>[\s\S]{0,220}\?\.title \|\| 'Ny samtale'/, 'merge-etiketten (Fortryd/genoptag) læser samme kilde med samme fald');
  assert.match(app, /syncTopbar[\s\S]{0,400}title \|\| 'Ny samtale'/, 'topbjælken læser titlen fra projektlisten — ingen ny kilde');
  const workbench = read(path.join(root, 'core', 'workbench.cjs'));
  assert.match(workbench, /other\.title \|\| 'Ny samtale'/, 'hovedprocessens fejltekst har samme fald');
  const main = read(path.join(root, 'main.cjs'));
  assert.match(main, /\?\.title \|\| 'Ny samtale'/, 'slette-dialogen har samme fald');
  // Der findes ingen anden afledning: titleFrom er kun eksporteret fra
  // workspace-history og bruges kun derinde + i testene.
  const exports_ = /module\.exports = \{[^}]*\}/.exec(historySource);
  assert.match(exports_[0], /titleFrom/, 'titleFrom er stadig modulets ene rene afledning');
});

// ── 6. Altid én arbejdsmåde-chip (P1-bekymring a: vinduer <480 px) ──
test('topbjælkens chip viger aldrig helt: 700 px-reglen skjuler den ikke længere', () => {
  const narrow = /@media \(max-width: 700px\)\s*\{[^}]*\}/.exec(components);
  assert.ok(narrow, '700 px-reglen findes (brødkrummen beholder sin snævring)');
  assert.ok(!/\.topbar-mode\s*\{[^}]*display:\s*none/.test(narrow[0]), 'chippen skjules ikke ved 700 px — container-reglen ejer afvejningen');
  assert.match(narrow[0], /workspace-crumb/, 'brødkrummens snævring består');
});

test('container-reglen skjuler stadig composer-chippen under 480 px — topbjælken har den', () => {
  const container = /@container chat \(width < 480px\)\s*\{[\s\S]*?\n\}/.exec(components);
  assert.ok(container, 'container-reglen findes');
  assert.match(container[0], /#chat-panel:not\(\[data-phase="hero"\]\) #composer-mode\s*\{\s*display:\s*none/, 'composer-chippen er skjult i aktiv fase under 480 px');
  // Invarianten: chippen har altid præcis ét synligt hjem — i smalt vindue er
  // det topbjælken (700 px-reglen skjuler den ikke længere).
  assert.ok(!/\.topbar-mode[^}]*display:\s*none/.test(components), 'ingen regel i components.css skjuler topbjælke-chippen længere');
});

// ── 7. #chat-materials-menu på menu-materialet ──
test('(+)-menuen bærer menu-materialet — egen skygge, kant og flade er væk', () => {
  assert.match(indexHtml, /<div id="chat-materials-menu" class="menu-material" hidden>/, 'menuen har .menu-material i markuppen');
  const menu = /#chat-materials-menu\s*\{[^}]*\}/.exec(materialsCss);
  assert.ok(menu, 'geometry-reglen findes');
  for (const gone of [/box-shadow/, /background/, /border:/, /border-radius/, /padding/]) assert.doesNotMatch(menu[0], gone, 'menuens eget materiale er væk (menu-materialet ejer det)');
  assert.match(menu[0], /position:\s*absolute/, 'ankeringet ved (+)-knappen består (position)');
  assert.ok(!/#chat-materials-menu button:hover/.test(materialsCss), 'egen hover-række er væk — menu-materialets gælder');
  const calmMenu = /\.workspace-calm #chat-materials-menu\s*\{[^}]*\}/.exec(calm);
  assert.ok(!calmMenu, 'den tunge calm-skygge #0004 er væk fra menuen');
  const heading = /#chat-materials-menu\s*>\s*strong\s*\{[^}]*\}/.exec(materialsCss);
  assert.ok(heading, 'overskriften har sin egen regel');
  assert.match(heading[0], /font-size:\s*(?:12px|var\(--aura-text-12\))/, 'overskriften er løftet fra 11 px til 12 px på skalaen');
});

// ── 8. D1-noten: calm-skuffens skygge på --aura-shadow-overlay ──
test('calm-skuffen (overlay ved ≤900 px) bærer --aura-shadow-overlay — ikke den hårdkodede', () => {
  const drawer = /\.workspace-calm\.calm-sidebar-open \.sidebar\s*\{[^}]*\}/.exec(calm);
  assert.ok(drawer, 'skuffe-reglen findes');
  assert.match(drawer[0], /box-shadow:\s*var\(--aura-shadow-overlay\)/, 'skyggen er tokenet (samme som legacy-overlay-stien)');
  assert.ok(!/10px 0 35px/.test(calm), 'den hårdkodede 10px 0 35px #0004 er væk');
  // Paritet med legacy-stien (ui-sidebar-d1.test.cjs:182) — begge skuffer på ét token.
  const legacy = /body\.sidebar-overlay \.sidebar\s*\{[^}]*\}/.exec(styles);
  assert.ok(legacy && /var\(--aura-shadow-overlay\)/.test(legacy[0]), 'legacy-stien består på samme token');
});

// ── 9. Ikonvælgeren: roving tabindex fra ventelisten (billig udgave) ──
test('ikonvælgeren får roving tabindex: pil taster igennem, ét tab-stop', () => {
  assert.match(profileIcons, /function wireRadioGroup/, 'hjælperen findes i profile-icons.js (én kilde)');
  assert.match(profileIcons, /ArrowRight/, 'piletaster håndteres');
  assert.match(profileIcons, /tabIndex =/, 'tabindex styres (roving)');
  assert.match(profileIcons, /Home|End/, 'Home/End håndteres');
  assert.match(app, /window\.ProfileIcons\?\.wireRadioGroup|ProfileIcons\.wireRadioGroup/, 'onboarding-vælgeren er koblet (app.js)');
  assert.match(settingsJs, /wireRadioGroup/, 'indstillings-vælgeren er koblet (settings.js)');
});

// ── 10. Version 0.6.0-beta.6 ──
test('versionen er 0.6.0-beta.6 overalt (pakke, lås, rod og pakkeposten)', () => {
  assert.equal(pkg.version, '0.6.0-beta.6');
  assert.equal(lock.version, '0.6.0-beta.6');
  assert.equal(lock.packages[''].version, '0.6.0-beta.6');
});

// ── 11. Efter-byg F6: #chat-menu og #composer-help-popover på menu-materialet ──
// Codex d2 + Claude: begge popups bar den gamle tunge skygge og uigennemsigtig
// flade ved siden af appens lette, gennemskinnelige menuer. Krav: samme
// materiale som .menu-material — --aura-shadow-menu, --aura-menu-bg, radius
// lg og 0,5 px kant, med samme @supports/forced-colors-faldgrunde.
test('efter-byg F6: #chat-menu og #composer-help-popover bærer menu-materialet — den gamle skygge er væk', () => {
  // Materiale-reglen er ID-båren: den slår calm-reglernes :where(dialog,[popover])
  // (som ellers binder 0,1,0 og vinder på kildeorden) og den generiske [popover]-regel.
  const material = /#chat-menu,\s*#composer-help-popover\s*\{[^}]*\}/.exec(styles);
  assert.ok(material, 'den delte materiale-regel (#chat-menu, #composer-help-popover) findes');
  for (const property of [/box-shadow:\s*var\(--aura-shadow-menu\)/, /background:\s*var\(--aura-menu-bg\)/, /backdrop-filter:\s*blur\(40px\) saturate\(150%\)/, /border-radius:\s*var\(--aura-radius-lg\)/, /border:\s*0\.5px solid var\(--aura-border\)/]) assert.match(material[0], property, 'materialet bærer menu-grammatikken');
  const geometry = /\.chat-menu\s*\{[^}]*\}/.exec(styles);
  assert.ok(geometry, 'geometri-reglen (.chat-menu) findes');
  assert.match(geometry[0], /position:\s*fixed/, 'ankeringen består (position)');
  assert.doesNotMatch(geometry[0], /box-shadow|background:/, 'geometri-reglen bærer intet materiale');
  assert.ok(!/0 8px 24px #18223524/.test(styles), 'den gamle hårdkodede skygge er væk fra styles.css');
  assert.ok(!/\.chat-menu\s*\{[^}]*#0004/.test(styles + calm), 'chat-menuens regel bærer ingen tung #0004-skygge');
  // Faldgrunde-paritet med components.css' materiale (uden backdrop-filter og
  // forced-colors får fladen en uigennemsigtig erstatning).
  const supports = /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)\s*\{[^@]*\}/.exec(styles);
  assert.ok(supports && /#chat-menu/.test(supports[0]) && /--aura-bg-raised/.test(supports[0]), 'uden backdrop-filter er fladen uigennemsigtig raised');
  const forcedBlocks = [...styles.matchAll(/@media \(forced-colors: active\)\s*\{[\s\S]*?\n\}/g)].map(match => match[0]);
  assert.ok(forcedBlocks.some(block => /#chat-menu/.test(block) && /Canvas/.test(block)), 'forced-colors-faldgrunden dækker menuen');
});

// ── 12. Efter-byg F7: ÉT scrim-token for dialog-sløret ───────────────────────
// Codex d3: styles.css:315 (#14263b40) og workspace-calm.css:21 (rgba(0,0,0,.36))
// er to forskellige slør; privacy-gate har sit eget stærkere (#080c1699), som
// er en bevidst sikkerhedsflade. Krav: begge dialog::backdrop-regler bærer ÉT
// delt token i aura-tokens.css.
test('efter-byg F7: dialog-sløret er ÉN token i begge regler — basis og calm', () => {
  assert.match(tokens, /--aura-scrim:\s*/, 'scrim-tokenet findes i aura-tokens.css');
  const base = /dialog::backdrop\s*\{[^}]*\}/.exec(styles);
  assert.ok(base, 'basisreglen findes');
  assert.match(base[0], /background:\s*var\(--aura-scrim\)/, 'basisreglen bruger tokenet');
  const calmRule = /\.workspace-calm dialog::backdrop\s*\{[^}]*\}/.exec(calm);
  assert.ok(calmRule, 'calm-reglen findes');
  assert.match(calmRule[0], /background:\s*var\(--aura-scrim\)/, 'calm-reglen bruger det SAMME token — ét sted at rette sløret');
  assert.ok(!/14263b40/.test(styles), 'den gamle blågrå slør #14263b40 er væk fra styles.css');
  assert.ok(!/dialog::backdrop\s*\{[^}]*#0[0-9a-f]{5}/.test(calm), 'calm-reglen bærer ingen rå slørfarve');
});

// ── 13. Efter-byg F11: «•••» dækker ikke statusteksten på samtalerækken ──────
// Claude (bekræftet live på HEAD: .chat-more overlappede .chat-meta med 22 px —
// «arbe•••»). DSH-mønsteret: når menu-knappen står frem (hover/fokus), viger
// statusteksten — aldrig to lag oven på hinanden.
test('efter-byg F11: .chat-meta viger, når «•••»-knappen står frem (hover/fokus)', () => {
  const rule = /\.chat-list > li:is\(:hover, :focus-within\) \.chat-meta\s*\{[^}]*\}/.exec(styles);
  assert.ok(rule, 'vige-reglen findes');
  assert.match(rule[0], /visibility:\s*hidden/, 'statusteksten viger ved hover og tastaturfokus');
  // Vige-reglen dækker samme betingelser som knappens synlighedsregel.
  const more = /\.chat-list > li:not\(:hover\):not\(:focus-within\) \.chat-more:not\(\[aria-expanded="true"\]\)\s*\{[^}]*\}/.exec(styles);
  assert.ok(more && /opacity:\s*0/.test(more[0]), 'knappens synlighedsregel består uændret');
});

// ── 14. Efter-byg F12: slukket switch-spor er synligt i mørkt tema ───────────
// Claude (bekræftet live på HEAD: spor rgb(38,38,40) på kort rgb(44,44,46) —
// «en løs prik»). Krav: af-sporet får sit eget token, tydeligt over kortet i
// mørkt tema, og knop-kontrasten (≥3:1) måles mod DET token.
test('efter-byg F12: switchens af-spor bærer sit eget token — synligt over kortet i mørkt tema', () => {
  const track = /input\[type=checkbox\]\[role=switch\]\s*\{[^}]*\}/.exec(styles);
  assert.ok(track, 'switch-reglen findes');
  assert.match(track[0], /background:\s*var\(--aura-switch-track\)/, 'af-sporet bærer sit eget spor-token (ikke --aura-bg-tint)');
  for (const [block, theme] of themeBlocks()) {
    const trackRGB = tokenRGB(block, 'aura-switch-track'), knob = tokenRGB(block, 'aura-ink-muted'), card = tokenRGB(block, 'aura-bg-raised');
    assert.ok(trackRGB, `${theme}: --aura-switch-track er defineret`);
    const knobOnTrack = contrast(knob, trackRGB);
    assert.ok(knobOnTrack >= 3, `${theme}: knop på af-spor er ${knobOnTrack.toFixed(2)}:1 — kravet er ≥3:1`);
    const trackOnCard = contrast(trackRGB, card);
    assert.ok(trackOnCard >= 1.15, `${theme}: sporet adskiller sig fra kortet (${trackOnCard.toFixed(2)}:1) — aldrig «en løs prik»`);
  }
});

// ── 15. Efter-byg F9: den lukkede slash-popup tegner sig ikke selv ──────────
// Claude (bekræftet live på HEAD, begge temaer): #slash-menu's basisregel satte
// `display: grid` — en forfatterregel, der slår browserens `display: none`
// for LUKKEDE popovers til side, så popuppen stod som en tom, indrammet
// strimmel (420×13 px) under topbjælken over chatkolonnen. Merge-blokering.
test('efter-byg F9: #slash-menu er display:none, når popuppen er lukket — ingen tom strimmel under topbjælken', () => {
  const base = /#slash-menu\s*\{[^}]*\}/.exec(styles);
  assert.ok(base, 'basisreglen findes');
  assert.doesNotMatch(base[0], /display:\s*grid/, 'basisreglen sætter ALDRIG display — browserens egen lukkede popover-display gælder');
  const open = /#slash-menu\.menu-material:popover-open\s*\{[^}]*\}/.exec(styles);
  assert.ok(open, ':popover-open-reglen findes');
  assert.match(open[0], /display:\s*grid/, 'griddet står KUN på :popover-open — geometrien (grid-template-columns) forbliver i basisreglen');
});

