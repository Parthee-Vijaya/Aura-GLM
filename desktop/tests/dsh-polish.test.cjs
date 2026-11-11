// SPDX-License-Identifier: EUPL-1.2
// P1 · DSH-polish (0.5.5) — de statiske pins for skivens ændringer.
// Arbejdsliste: /Users/parthee/aura-prime-review/claude-uiux-audit.md (§1-§4),
// design: deepseek-design-plan.md §2 (alfa-hover, fire kantstyrker, brødtekst
// 14/22, boblefyld) og p1-brief.md (scope 1-10).
//
// Hver pin fryser én konkret ændring fra auditten: :where()-specificitets-
// rettelsen, det ene menu-materiale, typeskalaen, den enkeltrækkede status-
// linje, den rolige composer, alpha-hover, navy-palettens afstedling,
// trinrækkernes luft omkring ·, glyf-boksene, container-forespørgslerne og
// versionsnummeret. Kontrasten for de nye par beregnes her — intet antages.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = path.join(__dirname, '..', 'ui');
const read = name => fs.readFileSync(path.join(ui, name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(read('aura-tokens.css'));
const calm = strip(read('workspace-calm.css'));
const components = strip(read('components.css'));
const styles = strip(read('styles.css'));
const indexHtml = read('index.html');
const app = read('app.js');
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package-lock.json'), 'utf8'));

// ── Kontrastmatematik (WCAG 2.1, samme hjælper som ui-typography.test.cjs) ──
const luminance = rgb => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
const contrast = (fg, bg) => { const a = luminance(fg), b = luminance(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
const over = (fill, alpha, bg) => fill.map((channel, index) => Math.round(channel * alpha + bg[index] * (1 - alpha)));
const mix = (a, b, pctOfA) => a.map((channel, index) => Math.round(channel * pctOfA + b[index] * (1 - pctOfA)));

// ── 1. Tokens: typeskala, alfa-hover, fjerde kantstyrke, mørke flader ──
test('typeskalaen: --aura-text-12/13/14/15/26 med DSHs linjehøjder', () => {
  const root = /:root\s*\{([^}]*)\}/.exec(strip(read('aura-tokens.css')))[1];
  const expected = { 12: [16, 'statuslinje og tidsstempler'], 13: [20, 'sekundær tekst'], 14: [22, 'brødtekst'], 15: [22, 'topbjælkens titel'], 26: [32, 'heltens overskrift'] };
  for (const [size, [line, note]] of Object.entries(expected)) {
    const rule = new RegExp(`--aura-text-${size}:\\s*${size}px;\\s*--aura-text-${size}-line:\\s*${line}px`).exec(root);
    assert.ok(rule, `--aura-text-${size}/${line} findes (${note})`);
  }
});

test('hover and focus borders preserve both explicit theme variants', () => {
  const themes = require('./helpers/theme-tokens.cjs').tokenThemes(tokens);
  assert.deepEqual(themes.light['--aura-bg-hover'], { rgb: [38, 49, 72], a: 0.06 });
  assert.deepEqual(themes.dark['--aura-bg-hover'], { rgb: [255, 255, 255], a: 0.08 });
  assert.equal(themes.light['--aura-border-strongest'].a, 0.16);
  assert.equal(themes.dark['--aura-border-strongest'].a, 0.2);
});

test('composer and bubble surfaces remain distinct from the neutral dark canvas', () => {
  const {light, dark} = require('./helpers/theme-tokens.cjs').tokenThemes(tokens);
  assert.deepEqual(dark['--aura-bg'], [21,21,23]);
  assert.notDeepEqual(dark['--aura-bg-composer'], dark['--aura-bg']);
  assert.notDeepEqual(dark['--aura-bg-bubble'], dark['--aura-bg']);
  for (const theme of [light,dark]) {
    assert.ok(contrast(theme['--aura-ink'],theme['--aura-bg-bubble']) >= 4.5);
    assert.ok(contrast(theme['--aura-ink-muted'],theme['--aura-bg-composer']) >= 4.5);
  }
});

// ── 2. Én popover-grammatik ──
test('specificitetsfejlen er rettet: :where, ikke :is — .menu-material vinder', () => {
  assert.match(calm, /\.workspace-calm :where\(dialog,\[popover\]\)\s*\{/, 'audit §4: faldreglen bærer :where (0,1,0)');
  assert.ok(!/\.workspace-calm :is\(dialog,\[popover\]\)/.test(calm), ':is-versionen er væk');
});

test('de fem popovers fra auditten bærer menu-materialet', () => {
  for (const id of ['slash-menu', 'model-picker', 'settings-menu']) {
    assert.ok(new RegExp(`id="${id}"[^>]*class="[^"]*menu-material`).test(indexHtml) || new RegExp(`class="[^"]*menu-material"[^>]*id="${id}"`).test(indexHtml), `#${id} har .menu-material i markup`);
  }
  // T8: fladerne bærer også .aura-tooltip (den samlede tooltip-grammatik).
  assert.match(indexHtml, /<div id="status-line-help" popover class="status-line-help menu-material aura-tooltip"/, '.status-line-help har .menu-material og tooltip-grammatikken');
  assert.match(app, /node\('div', '', 'info-pop menu-material aura-tooltip'\)/, '.info-pop skabes med .menu-material og tooltip-grammatikken (app.js)');
});

test('slash og modelvælger: egne skygger/radier er væk — materialet ejer dem', () => {
  assert.ok(!/#slash-menu\s*\{[^}]*box-shadow/.test(styles), 'slash-popuppen har ingen egen skygge længere');
  assert.ok(!/#model-picker\s*\{[^}]*box-shadow/.test(styles), 'modelvælgeren har ingen egen skygge længere (#00000030 er væk)');
  assert.ok(!/#slash-menu\s*\{[^}]*border:/.test(styles), 'slash-popuppen har ingen egen 1 px-kant (0,5 px kommer fra .menu-material)');
  assert.ok(!/#model-picker\s*\{[^}]*border:/.test(styles), 'modelvælgeren har ingen egen kant');
  assert.ok(!/\.status-line-help\s*\{[^}]*box-shadow/.test(styles), 'statuslinjens tooltip har ingen egen skygge (#1836581f er væk)');
  assert.ok(!/\.info-pop\s*\{[^}]*box-shadow/.test(styles), 'ⓘ-boblen har ingen egen skygge');
  assert.match(components, /\.menu-material\s*\{[^}]*box-shadow:\s*var\(--aura-elevation-panel\)/, 'materialet bærer elevationen; hårstregen ligger i skyggen');
});

// ── 3. Brødtekst og de navngivne 11 px ──
test('conversation prose uses the redesigned readable 15/25 scale', () => {
  const rule = /\.workspace-calm \.chat-message\s*\{[^}]*\}/.exec(calm)[0];
  assert.match(rule, /font-size:\s*15px/);
  assert.match(rule, /line-height:\s*25px/);
});

test('workspace controls remain readable and the hidden status retains its accessible role', () => {
  assert.match(calm, /\.workspace-calm \.workspace-bar button\s*\{[^}]*font-size:\s*12px/);
  assert.match(indexHtml, /id="run-status"[^>]*role="status"/);
  const tabRules = [...calm.matchAll(/\.workspace-calm \.work-tab\s*\{[^}]*\}/g)].map(match => match[0]);
  assert.ok(tabRules.length >= 1);
  for (const rule of tabRules) assert.match(rule, /font-size:\s*12px/);
  assert.match(calm, /\.work-tab\[aria-selected="true"\]::after\s*\{[^}]*height:\s*2px/);
  assert.match(styles, /\.chat-latest\s*\{[^}]*font-size:\s*var\(--aura-text-12\)/);
});

// ── 4. Én boble og den rolige composer ──
test('brugerboblen er én: .user-bubble har ikke længere fyld, padding eller radius', () => {
  const rule = /\.chat-message\.user \.user-bubble\s*\{[^}]*\}/.exec(styles)[0];
  assert.match(rule, /background:\s*none/, 'fyldet findes kun på .chat-message.user');
  assert.match(rule, /padding:\s*0/, 'ingen dobbelt padding (20/32 → 10/16)');
  assert.match(rule, /border-radius:\s*0/, 'radius findes kun én gang');
  assert.ok(!/user-bubble[^{]*\{[^}]*#1e2a3c/.test(styles), 'den mørke navy #1e2a3c er væk (audit §2.1)');
  const bubble = /\.workspace-calm \.chat-message\.user\s*\{[^}]*\}/.exec(calm)[0];
  assert.match(bubble, /background:\s*var\(--aura-bg-bubble\)/, 'boblefyldet er DSHs eget token');
});

test('rolig composer: neutral fokus-kant, én kant og synlig tastaturring', () => {
  const calmFocus = /\.workspace-calm \.composer:focus-within\s*\{[^}]*\}/.exec(calm)[0];
  // Materialesystemet (0.7.0): et klik styrker den neutrale streg; accentringen hører til tastaturet.
  const clickState = /body\.workspace-calm \.composer:has\(textarea:focus-visible\)\s*\{[^}]*\}/.exec(calm)[0];
  assert.match(clickState, /outline:\s*none/, 'a click in the field draws no accent frame');
  const nativeRing = /html\[data-input-modality="keyboard"\] body\.workspace-calm \.composer:has\(textarea:focus-visible\)\s*\{[^}]*\}/.exec(calm)[0];
  assert.match(nativeRing, /outline:\s*2px solid var\(--aura-accent\)/, 'keyboard boundary uses a high-contrast focus token');
  assert.match(calmFocus, /box-shadow:\s*0 0 0 1px var\(--aura-border-strongest\)/, 'focus strengthens the neutral stroke of the one elevation');
  assert.doesNotMatch(calmFocus, /accent/, 'the pointer focus state stays neutral');
  const baseFocus = /\.composer:focus-within\s*\{[^}]*\}/.exec(strip(read('styles.css')))[0];
  assert.match(baseFocus, /border-color:\s*var\(--aura-border-strongest\)/, 'basisreglen er ligeledes neutral');
  assert.ok(!/#?0?e8f1ff|box-shadow:\s*0 0 0 3px/.test(baseFocus), 'den blå 3 px-ring ved musefokus er væk');
  const ring = /\.composer:has\(textarea:focus-visible\)\s*\{[^}]*\}/.exec(strip(read('styles.css')))[0];
  assert.match(ring, /outline:\s*2px solid var\(--accent\)/, 'ringen vises kun ved :focus-visible');
  const darkBlock = styles.slice(styles.lastIndexOf('@media (prefers-color-scheme: dark)'));
  assert.ok(!/\.composer:focus-within[^{]*\{[^}]*0 0 0 3px/.test(darkBlock), 'mørk tema har ingen ekstra ring ved fokus');
});

// ── 5. Navy-paletten er væk ──
test('styles.css\' mørke blok er navy-fri — aliaserne følger aura-tokens', () => {
  const darkBlock = styles.slice(styles.lastIndexOf('@media (prefers-color-scheme: dark)'));
  for (const navy of ['#0d1219', '#141c26', '#1d2a3d', '#2a3648', '#1d2942', '#233043', '#1e2a3c', '#1a2433', '#182230', '#16202d', '#111823', '#3a2f18', '#e0b34d', '#f4d9a6', '#c4d2e0', '#1c232e', '#1c2432', '#e0c9a0']) {
    assert.ok(!darkBlock.includes(navy), `navy-værdien ${navy} er væk fra den mørke blok`);
  }
  assert.match(darkBlock, /--tint:\s*var\(--aura-bg-tint\)/, '--tint følger det neutrale tint-token');
  assert.match(darkBlock, /--canvas:\s*var\(--aura-bg\)/, 'onboardingens lærred følger --aura-bg (21,21,23)');
  assert.ok(!/#resume-notice[^{]*\{[^}]*#1d2942/.test(styles), '#resume-notice #1d2942-id-specificiteten er borte');
  assert.match(/#resume-notice\s*\{[^}]*\}/.exec(strip(read('styles.css')))[0], /background:\s*var\(--aura-accent-faint\)/, '#resume-notice er på accent-faint i begge temaer');
  const diff = /\.diff-stat-badge\s*\{[^}]*\}/.exec(strip(read('styles.css')))[0];
  assert.ok(!/prefers-color-scheme[\s\S]*?\.diff-stat-badge\s*\{[^}]*#233043/.test(styles), '.diff-stat-badge har ingen mørk navy-blok');
  assert.match(strip(read('styles.css')), /\.diff-stat-badge \.added\s*\{[^}]*color-mix\(in srgb, var\(--aura-diff-add\) 70%, var\(--aura-ink\)\)/, '.added er token-blandet og læsbar');
  assert.match(strip(read('styles.css')), /\.diff-stat-badge \.removed\s*\{[^}]*color-mix\(in srgb, var\(--aura-diff-del\) 70%, var\(--aura-ink\)\)/, '.removed er token-blandet og læsbar');
});

// ── 6. Trin/live-glyffer ──
test('trinrækkerne: luft omkring ·, fast 16 px-glyfboks overalt, ét Arbejder-signal', () => {
  assert.match(components, /\.step-sep\s*\{[^}]*margin-inline:\s*4px/, 'audit §2.2: "Læser · fil.txt" — flex folder ikke luften væk');
  for (const selector of ['#composer-mode::before', '.topbar-mode::before', '.workspace-calm #agent-activity .activity-spinner']) {
    const rule = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*\\}').exec(components)[0];
    assert.match(rule, /width:\s*16px/, `${selector} er en fast 16 px-boks`);
    assert.match(rule, /font-size:\s*13px/, `${selector} har samme glyf-størrelse`);
    assert.match(rule, /line-height:\s*1/, `${selector} har samme grundlinje`);
  }
  // Fix-runde F2: ikonkolonnen er skræmmet til aria-hidden-ikon-spans —
  // span.privacy-entry-word er også et direkte span-barn og må ikke klemmes.
  assert.match(components, /#settings-menu button > span\[aria-hidden="true"\]\s*\{[^}]*width:\s*16px/, 'audit §2.5: indstillingsmenuens ikonkolonne er en fast 16 px-boks — kun for ikon-spans');
  assert.match(components, /#settings-menu \.privacy-entry \.privacy-shield\s*\{[^}]*width:\s*16px/, 'skjoldet står i samme 16 px-boks som de andre ikoner');
  const liveWork = read('live-work.js');
  assert.ok(!liveWork.includes("'Venter på svar fra AI’en.'") && !read('chat-display.js').includes("'Venter på svar fra AI’en.'"), 'fyldteksten (Venter på svar fra AIén) er væk — audit §2.3');
  assert.ok(!liveWork.includes("'Arbejder'"), 'trinrækken siger ikke Arbejder — ordet står kun i live-indikatoren (app.js §6.4)');
  assert.match(app, /Arbejder · \$\{elapsedText\(Date\.now\(\) - v\.runStartedAt\)\}/, 'live-indikatoren ejer "Arbejder · 12 s"');
  assert.match(app, /\$\('#agent-progress'\)\.hidden = waiting \|\| progress\.text === ''/, 'nuance-linjen står kun med indhold');
});

// ── 7. Container-forespørgsler på samtalepanelet ──
test('#chat-panel er en container: under 480 px rykker composeren sig selv', () => {
  assert.match(components, /#chat-panel\s*\{\s*container:\s*chat \/ inline-size/, 'panelet er navngivet inline-container (audit §3)');
  const at = components.indexOf('@container chat (width < 480px)');
  assert.ok(at >= 0, 'container-forespørgslen findes');
  const block = components.slice(at, components.indexOf('\n}', at)); // hele blokken — ikke et fast vindue
  assert.match(block, /#chat-panel:not\(\[data-phase="hero"\]\) #composer-mode\s*\{\s*display:\s*none/, 'arbejdsmåde-chippen er skjult i aktiv fase (B3: topbjælken har den)');
  assert.match(block, /#permission-pill\s*\{[^}]*width:\s*28px/, 'tilladelsespillen er et 28 px ikon');
  assert.match(block, /#permission-pill #permission-pill-label,\s*#permission-pill \.hero-chip-caret\s*\{\s*position: absolute !important/, 'etiket og caret fjernes visuelt — men forbliver pillens tilgængelige navn');
  assert.match(block, /#chat-panel \.composer-toolbar\s*\{\s*gap:\s*8px/, 'værktøjslinjens gap er 8 px — og #chat-panel-scopet slår calm-reglen');
});

// ── 8. Modelchippens udbyderikon ──
test('udbyderikonet har ingen hvid baggrund (audit §2)', () => {
  assert.ok(!/\.provider-brand-icon\s*\{[^}]*#fff/.test(calm), 'den hvide firkant er væk fra workspace-calm');
});

// ── 9. P1's nye kontrastpar — beregnet, ikke antaget ──
test('P1-kontrast: alfa-hover, boble, diff-badge og de mørke flader består AA', () => {
  const pairs = [
    // Alfa-hover komponeret over de flader, hover vises på; teksterne ovenpå.
    [[21, 21, 23], over([38, 49, 72], 0.06, [255, 255, 255]), 4.5, 'ink på alpha-hover over lærredet (lys)'],
    [[238, 238, 240], over([255, 255, 255], 0.08, [21, 21, 23]), 4.5, 'ink på alpha-hover over lærredet (mørk)'],
    [[190, 192, 196], over([255, 255, 255], 0.08, [44, 44, 46]), 4.5, 'ink-secondary på alpha-hover over composer-kortet (mørk)'],
    // Mørk muted på den nye hævede flade #2C2C2E (ui-typografiparets værdi).
    [[150, 152, 158], [44, 44, 46], 4.5, 'den fulgte muted på #2C2C2E (mørk)'],
    // Boblen (DSH §2: #EDF3FE / #2C2C2E) med brødtekst.
    [[21, 21, 23], [237, 243, 254], 4.5, 'brødtekst på den lyse boble'],
    [[238, 238, 240], [44, 44, 46], 4.5, 'brødtekst på den mørke boble'],
    // .diff-stat-badge'ens color-mix-par (diff 70 % + ink).
    [mix([34, 154, 96], [21, 21, 23], 0.7), [237, 243, 254], 4.5, '.added (lys)'],
    [mix([200, 52, 44], [21, 21, 23], 0.7), [237, 243, 254], 4.5, '.removed (lys)'],
    [mix([72, 180, 120], [238, 238, 240], 0.7), [38, 38, 40], 4.5, '.added (mørk)'],
    [mix([230, 90, 80], [238, 238, 240], 0.7), [38, 38, 40], 4.5, '.removed (mørk)'],
    // #resume-notice på accent-faint.
    [[21, 21, 23], [237, 243, 254], 4.5, 'resume-banner (lys)'],
    [[238, 238, 240], [27, 35, 54], 4.5, 'resume-banner (mørk)'],
    // Fokus-ringen bærer 3:1 som ikke-tekst (WCAG 1.4.11).
    [[65, 118, 230], [255, 255, 255], 3, 'focus-visible-ring (lys)'],
    [[103, 158, 254], [21, 21, 23], 3, 'focus-visible-ring (mørk)']
  ];
  for (const [fg, bg, minimum, label] of pairs) {
    const measured = contrast(fg, bg);
    assert.ok(measured >= minimum, `${label}: måler ${measured.toFixed(2)}:1 — kravet er ${minimum}:1`);
  }
});

// ── 10. Versionen ──
test('versionen er 0.7.0-beta.1 overalt (pakke, lås, rod og pakkeposten)', () => {
  assert.equal(pkg.version, '0.7.0-beta.1');
  assert.equal(lock.version, '0.7.0-beta.1');
  assert.equal(lock.packages[''].version, '0.7.0-beta.1');
});

// ═══ Fix-runde (review af 3feb05b): F2/F3/F4 ═══

// Mini-CSS: selektor-matchning på en strukturmodel (F2's reproduktion).
// Det nødvendige udsnit af appens selektorer: sammensatte led (tag/.klasse/
// #id/[attr="værdi"]), efterkommer (mellemrum) og barn (>).
const linkTree = (element, parent = null) => { element.parent = parent; for (const child of element.children ?? []) linkTree(child, element); return element; };
const compoundMatches = (part, el) => (part.match(/([.#]?)[\w-]+|\[[^\]]+\]/g) || []).every(token => {
  const attr = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(token);
  if (attr) { const value = el.attrs?.[attr[1]]; return attr[2] === undefined ? value !== undefined : value === attr[2]; }
  if (token[0] === '#') return el.id === token.slice(1);
  if (token[0] === '.') return Boolean(el.classes?.includes(token.slice(1)));
  return el.tag === token;
});
// En efterkommer-kæde [led-1 … led-n] matcher elementet, når led-n står på
// elementet selv og de tidligere led står på forfædre i rækkefølge.
const chainSatisfied = (parts, element) => {
  if (!compoundMatches(parts[parts.length - 1], element)) return false;
  const earlier = parts.slice(0, -1);
  const walkUp = (index, from) => {
    if (index < 0) return true;
    for (let at = from; at; at = at.parent) if (compoundMatches(earlier[index], at) && walkUp(index - 1, at.parent)) return true;
    return false;
  };
  return walkUp(earlier.length - 1, element.parent);
};
// Bærere: elementet (eller en forfader, der matcher gruppens første led)
// bærer barn-kæden videre mod selektorens venstre side. Hele gruppen skal
// være opfyldt på elementet, før en bærer findes.
const groupCarriers = (group, element) => {
  if (!chainSatisfied(group, element)) return [];
  const carriers = [];
  for (let at = element; at; at = at.parent) if (compoundMatches(group[0], at)) carriers.push(at);
  return carriers;
};
const selectorMatches = (selector, el) => {
  const groups = selector.trim().split(/\s*>\s*/).map(chunk => chunk.trim().split(/\s+/).filter(Boolean));
  if (!groups.length || groups.some(group => !group.length)) return false;
  const walk = (index, element) => {
    for (const carrier of groupCarriers(groups[index], element)) {
      if (index === 0) return true;
      if (carrier.parent && walk(index - 1, carrier.parent)) return true;
    }
    return false;
  };
  return walk(groups.length - 1, el);
};
const componentRules = [...components.matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(([whole, selector, body]) => [selector.trim(), body])
  .filter(([selector]) => !selector.includes('@'));

test('F2 · indstillingsmenuens etiket-span rammes IKKE af ikonklemmen (reproduceret struktur)', () => {
  // Strukturmodellen efter index.html + privacy-gate.js renderStatus: de
  // almindelige rækker er button > span[aria-hidden] > svg; Datakontrol-rækken
  // er button.privacy-entry > svg.privacy-shield + span.privacy-entry-word.
  // Review F2: den uskremmede "> span"-regel klemte etiket-spanet til 16 px
  // — ét bogstav pr. linje, rækken ~112 px. Pinnen matcher alle components-
  // regler mod modellen: ingen regel må sætte bredde/grid/flex på etiketten.
  const labelSpan = { tag: 'span', classes: ['privacy-entry-word'] };
  const shield = { tag: 'svg', classes: ['privacy-shield'] };
  const iconSpan = { tag: 'span', attrs: { 'aria-hidden': 'true' }, children: [{ tag: 'svg' }] };
  linkTree({ tag: 'div', id: 'settings-menu', children: [
    { tag: 'button', attrs: { id: 'settings-profile-button' }, children: [iconSpan] },
    { tag: 'button', classes: ['text-button', 'privacy-entry'], children: [shield, labelSpan] }
  ] });
  const clamps = body => /(^|[{;\s])width\s*:/.test(body) || /display\s*:\s*grid/.test(body) || /(^|[{;\s])flex\s*:/.test(body);
  for (const [selector, body] of componentRules) {
    assert.ok(!(selectorMatches(selector, labelSpan) && clamps(body)),
      `F2: reglen "${selector}" rammer .privacy-entry-word og må ikke klemme den (16 px-kolonnen er kun til ikon-spans)`);
  }
  // Ikon-spans og skjoldet står derimod STADIG i den faste 16 px-kolonne —
  // audit §2.5's justering (3 px-forskydningen) må ikke komme tilbage.
  assert.ok(componentRules.some(([selector, body]) => selectorMatches(selector, iconSpan) && /width:\s*16px/.test(body)), 'ikon-spanet beholder sin faste 16 px-boks');
  assert.ok(componentRules.some(([selector, body]) => selectorMatches(selector, shield) && /width:\s*16px/.test(body)), 'skjoldet står i samme 16 px-boks som ikonerne');
  // Og den skarpe selektor er den, reglen bruger:
  assert.match(components, /#settings-menu button > span\[aria-hidden="true"\]\s*\{[^}]*width:\s*16px/, 'ikonkolonnen er skræmmet til aria-hidden-ikon-spans');
  assert.ok(!/#settings-menu button > span\s*\{/.test(components), 'den uskremmede "> span"-regel er væk');
});

test('F3 → T8 · tooltippernes padding 10/12 ejes af .aura-tooltip — én grammatik, ingen døde erklæringer', () => {
  // Review F3 lagde paddingen på id-reglerne (den døde klasse-deklaration var
  // slået af .menu-material på kildeorden). T8 samler fladerne på ÉN
  // tooltip-grammatik: .aura-tooltip i components.css (efter .menu-material)
  // ejer 10/12 — id-reglerne har ingen padding længere, og 6/4 slås på
  // kildeorden, ikke specificitet.
  assert.match(components, /\.aura-tooltip\s*\{[^}]*padding:\s*10px 12px/, '.aura-tooltip ejer paddingen (10/12)');
  assert.ok(!/#status-line-help\s*\{[^}]*padding/.test(styles), '#status-line-help har ingen egen padding længere');
  assert.ok(!/#info-pop\s*\{[^}]*padding/.test(styles), '#info-pop har ingen egen padding længere');
  assert.ok(!/\.status-line-help\s*\{[^}]*padding/.test(styles), 'den døde klassebaserede padding er fjernet fra .status-line-help');
  assert.ok(!/\.info-pop\s*\{[^}]*padding/.test(styles), 'den døde klassebaserede padding er fjernet fra .info-pop');
});

test('F4 · #composer-mode i aktiv fase står på typeskalaen — ingen 11 px uden for badges', () => {
  // Review F4: basisreglen var P1's femte reelle 11 px (audit §3 + T3-gulvet).
  const rule = /#composer-mode\s*\{[^}]*\}/.exec(styles)[0];
  assert.match(rule, /font-size:\s*var\(--aura-text-12\)/, 'chippen bærer tokenskalaen (12 px)');
  assert.ok(!/font-size:\s*11px/.test(rule), '11 px er væk fra chippen');
});
