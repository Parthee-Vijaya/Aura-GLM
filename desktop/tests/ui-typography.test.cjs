// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Skive 3 i UI/UX-overhaulen (docs/uiux-overhaul-design.md "Kernetal" 3-5,
// "Skiver" #3): et typografisk gulv, indholdsbaserede dialog-størrelsesklasser
// og mørk-tema-blokken som styles.css' sidste topniveau-blok.
//
// Gulvpolitikken (controller-aftalen): 11 px KUN sekundære tidsstempler/badges,
// 12 px hjælpetekst og små labels, 13-14 px interaktive kontroller, 14-16 px
// prosa. Intet tekst i hovedvinduets stylesheets må ligge under 11 px.
// credential-entry.css (det sikre nøglevindue) og demo.css (demodokumentet i
// welcomens iframe) er separate dokumenter uden link i index.html og ligger
// uden for gulvet — de er målt i opgaverapporten. Onboarding B's kunst-plakat
// er omfattet af gulvet; de løftede plakat-tekster er dokumenteret enkeltvis i
// opgaverapporten (task-3-report.md).
const ui = path.join(__dirname, '..', 'ui');
const read = name => fs.readFileSync(path.join(ui, name), 'utf8');
const indexHtml = read('index.html');
const stylesCss = read('styles.css');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Alle font-størrelser i ét stylesheet — både font-size-deklarationer og
// font:-shorthands (fx "font: 600 11px/1 ui-monospace"). 'inherit' og
// token-baserede værdier uden px springes over.
const fontSizesOf = (css, sheet) => {
  const found = [];
  const clean = strip(css);
  const declaration = /font(-size)?:\s*([^;{}]*)/g;
  let match;
  while ((match = declaration.exec(clean))) {
    const size = /(\d+(?:\.\d+)?)px/.exec(match[2]);
    if (size) found.push({ sheet, value: Number(size[1]), declaration: `font${match[1] || ''}: ${match[2].trim()}` });
  }
  return found;
};

// (a) Typografi-gulvet: intet tekst under 11 px i de stylesheets, index.html
// indlæser. Listen trækkes fra index.html, så en ny gateway-fil automatisk
// bliver omfattet.
test('typografi-gulv: ingen font-size under 11 px i hovedvinduets stylesheets', () => {
  const sheets = [...indexHtml.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(match => match[1]);
  assert.ok(sheets.length >= 10, 'stylesheets findes i index.html');
  const below = sheets.flatMap(sheet => fontSizesOf(read(sheet), sheet)).filter(size => size.value < 11);
  assert.deepEqual(below.map(size => `${size.sheet}: ${size.value}px (${size.declaration})`), [], 'alt tekst i hovedvinduet er mindst 11 px');
});

// (b) Dialog-størrelsesklasserne: confirm 480-560, wide 880-1040,
// complex 1120-1280 — alt med 92vw-loft, indholdsdrevet højde og dialogen
// selv som eneste rulleområde (docs/uiux-overhaul-design.md "Kernetal").
const CLASS_RANGES = { confirm: [480, 560], wide: [880, 1040], complex: [1120, 1280] };
const classWidth = size => {
  const rule = new RegExp(`dialog\\[data-size="${size}"\\]\\s*\\{([^}]*)\\}`).exec(strip(stylesCss));
  assert.ok(rule, `dialog[data-size="${size}"] findes i styles.css`);
  const width = /width:\s*([^;]+);/.exec(rule[1]);
  assert.ok(width, `${size}-klassen har en bredde`);
  const capped = new RegExp(`^min\\((\\d+)px,\\s*92vw\\)$`).exec(width[1].trim());
  assert.ok(capped, `${size}-bredden er min(px, 92vw) — viewporten loftet`);
  return Number(capped[1]);
};

test('dialog-klasser: confirm/wide/complex findes med dokumenterede breddegrænser', () => {
  const widths = { confirm: classWidth('confirm'), wide: classWidth('wide'), complex: classWidth('complex') };
  assert.equal(widths.confirm, 520, 'bekræftelser lander på 520 px (rækkevidde 480-560)');
  assert.equal(widths.wide, 1000, 'oversigtsdialoger lander på 1000 px (rækkevidde 880-1040)');
  assert.equal(widths.complex, 1130, 'opgave-/datadialoger lander på 1130 px (rækkevidde 1120-1280)');
  for (const [size, px] of Object.entries(widths)) {
    const [low, high] = CLASS_RANGES[size];
    assert.ok(px >= low && px <= high, `${size} (${px}px) holder sig i den dokumenterede rækkevidde ${low}-${high}`);
  }
});

// (c) Tildelingen: hver dialog har sin data-size. #settings-dialog bevarer
// sin egen bredde (780 — topane-layoutet; jf. controller-aftalen), og
// kommandopaletten har sin egen top-ankerende regel; begge undtagelser er
// dokumenteret her og i opgaverapporten.
test('dialog-tildeling: alle dialoger i index.html har en data-size — settings og palette undtaget', () => {
  const assigned = {
    'task-dialog': 'complex', 'connections-dialog': 'wide', 'data-dialog': 'complex', 'skills-dialog': 'wide',
    'features-dialog': 'wide', 'preview-dialog': 'confirm', 'updates-dialog': 'confirm', 'support-dialog': 'confirm',
    'about-dialog': 'confirm', 'restore-dialog': 'wide', 'hosting-dialog': 'wide', 'deployment-dialog': 'confirm',
    'tools-dialog': 'wide', 'welcome-dialog': 'wide', 'project-settings-dialog': 'wide', 'chat-materials-dialog': 'wide'
  };
  const exceptions = ['settings-dialog', 'palette'];
  const dialogs = [...indexHtml.matchAll(/<dialog\s+([^>]*)>/g)].map(match => ({
    id: (/id="([^"]+)"/.exec(match[1]) || [])[1],
    size: (/data-size="([^"]+)"/.exec(match[1]) || [])[1]
  }));
  assert.ok(dialogs.length >= 18, 'alle dialoger i index.html er fundet');
  for (const dialog of dialogs) {
    assert.ok(dialog.id, 'dialogen har et id');
    assert.ok(dialog.id in assigned || exceptions.includes(dialog.id), `${dialog.id} er kendt — nye dialoger skal tildeles en klasse eller dokumenteres som undtagelse`);
    if (exceptions.includes(dialog.id)) assert.equal(dialog.size, undefined, `${dialog.id} er en dokumenteret undtagelse med egen bredde`);
    else assert.equal(dialog.size, assigned[dialog.id], `#${dialog.id} bærer data-size="${assigned[dialog.id]}"`);
  }
});

// De dynamiske dialoger (JS-oprettede) får samme data-size som deres familie.
test('dialog-tildeling: JS-oprettede dialoger får også en data-size', () => {
  const expect = [
    ['conversation-permission.js', 1, 'confirm', '#conversation-permission-dialog'],
    ['connection-removal.js', 1, 'confirm', '#connection-removal-dialog'],
    ['history-search.js', 1, 'wide', '#history-search-dialog'],
    ['idea-refinement.js', 1, 'confirm', '#idea-review-dialog'],
    ['privacy-gate.js', 2, 'wide', '#privacy-settings-dialog og #privacy-sharing-dialog']
  ];
  for (const [file, count, size, label] of expect) {
    const source = read(file);
    const found = (source.match(new RegExp(`setAttribute\\('data-size',\\s*'${size}'\\)`, 'g')) || []).length;
    assert.ok(found >= count, `${label} sætter data-size="${size}"`);
  }
  const app = read('app.js');
  const removeAll = app.slice(app.indexOf("$('#setup-remove-all').onclick"), app.indexOf('async function displayProject('));
  assert.ok(/setAttribute\('data-size',\s*'confirm'\)/.test(removeAll), '#remove-all-dialog (fjern alle nøgler) er en confirm-dialog');
});

// (d) Dedikerede bredder må blive, når de ligger i klasses rækkevidde:
// onboarding B's #task-dialog (1130 = complex), samtale-tilladelsen (560 =
// confirm) og Privacy Gates godkendte 920 (wide). #settings-dialog bevarer
// sin egen 780-jf. controller-aftalen.
test('dialog-bredder: dedikerede pins holder sig i deres klasses rækkevidde', () => {
  const widthIn = (source, selectorPattern, label) => {
    const rule = new RegExp(`${selectorPattern}\\s*\\{[^}]*width:\\s*min\\((\\d+)px`).exec(strip(source));
    assert.ok(rule, `${label} har en bredde-regel`);
    return Number(rule[1]);
  };
  const task = widthIn(read('onboarding-b.css'), '#task-dialog\\.onboarding-b', '#task-dialog.onboarding-b');
  assert.ok(task >= CLASS_RANGES.complex[0] && task <= CLASS_RANGES.complex[1], `#task-dialog (${task}px) holder sig i complex-rækkevidden`);
  const permission = widthIn(read('conversation-permission.css'), '#conversation-permission-dialog', '#conversation-permission-dialog');
  assert.ok(permission >= CLASS_RANGES.confirm[0] && permission <= CLASS_RANGES.confirm[1], `samtale-tilladelsen (${permission}px) holder sig i confirm-rækkevidden`);
  const privacy = widthIn(read('privacy-gate.css'), '\\.privacy-dialog', '.privacy-dialog');
  assert.ok(privacy >= CLASS_RANGES.wide[0] && privacy <= CLASS_RANGES.wide[1], `privacy-dialogerne (${privacy}px) holder sig i wide-rækkevidden`);
  const settings = /#settings-dialog\s*\{[^}]*width:\s*min\(780px,\s*92vw\)/.exec(read('settings.css'));
  assert.ok(settings, '#settings-dialog bevarer sin egen 780 px-bredde (dokumenteret undtagelse)');
});

// De gamle, rækkevidde-løse bredder er væk — bredde-kilden er klassen.
test('dialog-bredder: de gamle faste bredder uden for klasses-rækkerne er fjernet', () => {
  const gone = [
    [stylesCss, /#task-dialog\s*\{[^}]*width:/, '#task-dialogs gamle 580 px-regel i styles.css'],
    [stylesCss, /#changes-dialog\s*\{[^}]*width:/, '#changes-dialog har nu wide-klassens bredde'],
    [stylesCss, /#hosting-dialog,\s*#deployment-dialog\s*\{[^}]*width:/, 'den delte 820 px-regel er væk'],
    [stylesCss, /#restore-dialog\s*\{[^}]*width:/, '#restore-dialog har nu wide-klassens bredde'],
    [stylesCss, /#updates-dialog\s*\{[^}]*max-width:/, '#updates-dialog har nu confirm-klassens bredde'],
    [stylesCss, /#deployment-dialog\s*\{[^}]*width:/, '#deployment-dialog har nu confirm-klassens bredde'],
    [stylesCss, /\.tools-dialog\s*\{[^}]*width:/, '.tools-dialog har nu wide-klassens bredde'],
    [stylesCss, /#welcome-dialog\s*\{[^}]*width:/, '#welcome-dialog har nu wide-klassens bredde'],
    [stylesCss, /\.history-search-dialog\s*\{[^}]*width:/, '.history-search-dialog har nu wide-klassens bredde'],
    [read('feedback-layout.css'), /\.connection-removal-dialog\s*\{[^}]*width:/, 'fjern-forbindelse-dialogen har nu confirm-klassens bredde'],
    [read('idea-refinement.css'), /#idea-review-dialog\s*\{[^}]*width:/, '#idea-review-dialog har nu confirm-klassens bredde']
  ];
  for (const [source, pattern, label] of gone) assert.ok(!pattern.test(strip(source)), label);
});

// (e) Mørk-blok-rækkefølgen: styles.css' mørk-tema-blok er filens SIDSTE
// topniveau-blok, så dens regler vinder kildeordens-kaskaden over alle
// tidligere baseregler (docs/uiux-overhaul-design.md "Anti-mål"). Nye regler
// skal lægges før blokken — aldri efter.
test('mørk blok: styles.css\' mørk-tema-blok er filens sidste topniveau-blok', () => {
  const clean = strip(stylesCss);
  const blocks = [];
  let depth = 0, start = 0;
  for (let index = 0; index < clean.length; index++) {
    if (clean[index] === '{') depth++;
    else if (clean[index] === '}') {
      depth--;
      if (depth === 0) { blocks.push(clean.slice(start, index + 1)); start = index + 1; }
    }
  }
  assert.ok(blocks.length > 10, 'topniveau-blokke er fundet');
  assert.equal(depth, 0, 'styles.css er balanceret');
  const last = blocks[blocks.length - 1].trim();
  assert.match(last, /^@media\s*\(prefers-color-scheme:\s*dark\)/, 'den sidste blok er mørk-tema-blokken — ingen regel kommer efter den');
});

// (f) Kontrasten for de løftede 11-12 px-tekster, målt på de rigtige token-
// værdier fra aura-tokens.css i BEGGE temaer (controller-aftale: beregn, antag
// intet). De faste mørke/legacy-værdier (styles.css' mørke blok) er målt med
// deres konkrete rgb-tal og dokumenteret i opgaverapporten.
const luminance = rgb => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
const contrast = (fg, bg) => { const a = luminance(fg), b = luminance(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
const tokenThemes = () => {
  const tokensCss = read('aura-tokens.css');
  const themes = {};
  const rootRule = /:root\s*\{([^}]*)\}/.exec(strip(tokensCss));
  const darkRule = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?:root:not\(\[data-workspace-theme="light"\]\)\s*\{([^}]*)\}/.exec(strip(tokensCss));
  assert.ok(rootRule && darkRule, 'aura-tokens.css har lys og mørk temablok');
  for (const [theme, rule] of [['light', rootRule[1]], ['dark', darkRule[1]]]) {
    themes[theme] = {};
    for (const match of rule.matchAll(/(--aura-[a-z-]+):\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)) themes[theme][match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
  }
  return themes;
};

test('kontrast: de løftede 11-12 px-tekster holder mindst 4,5:1 i begge temaer', () => {
  const themes = tokenThemes();
  // Token-parrene bag de løftede tekststørrelser (elementerne i kommentaren).
  const pairs = [
    ['--aura-ink-muted', '--aura-bg-raised', '12 px-hjælp/status på kort: #draft-status, .preview-footer, .run-evidence h4, .result-eyebrow, #composer-shortcut, .composer-status + .status-line (D5b-statuslinjen), effort-labels'],
    ['--aura-ink-secondary', '--aura-bg-sidebar', '12 px-sidepanel: .nav-label, .sidebar-bottom, .badge, 11 px .chat-meta'],
    ['--aura-ink-secondary', '--aura-bg-tint', '.diff-stat-badge (lys tint-baggrund)'],
    ['--aura-accent-hover', '--aura-bg-tint', '.answer-choice .recommended (11 px pille)'],
    ['--aura-accent-hover', '--aura-bg-sidebar', '.chat-meta.is-running/is-unread (11 px tidsstempel)'],
    ['--aura-button-primary-text', '--aura-button-primary', '.tab-badge (11 px optælling)'],
    ['--aura-ink', '--aura-bg-raised', '.step-output (12 px teknisk uddrag i trinrækken, D4b §6.3)'],
    ['--aura-warning-ink', '--aura-bg-raised', 'D2+D3: YOLO-pillens 13 px tekst/ikon på composer-fyldet (R4)'],
    ['--aura-ink-muted', '--aura-bg', 'D4b §6.3: trinrækkens verb/detalje/tid (12 px, teriær på lærredet)'],
    ['--aura-ink-secondary', '--aura-bg', 'D4b §6.3: trinrækkens hover/fokus-tekst + boblens tid (13 px)'],
    ['--aura-accent-ink', '--aura-bg', 'D4b §6.4: live-indikatoren ≋ Arbejder · 12 s (12 px)'],
    ['--aura-warning-ink', '--aura-bg', 'D4b §6.4: Venter på dig-indikatoren (12 px)'],
    ['--aura-warning-ink', '--aura-warning-subtle', 'D2+D3: YOLO-pillen på det svage advarselsfyld (R4)'],
    ['--aura-error', '--aura-bg', 'D4b §6.3: mislykket trins udfaldsmærke og fejltekst (12 px)']
  ];
  for (const [fg, bg, label] of pairs) {
    for (const theme of ['light', 'dark']) {
      assert.ok(themes[theme][fg] && themes[theme][bg], `${fg}/${bg} findes i ${theme}-temaet`);
      const measured = contrast(themes[theme][fg], themes[theme][bg]);
      assert.ok(measured >= 4.5, `${label}: ${fg} på ${bg} i ${theme} måler ${measured.toFixed(2)}:1 — kravet er 4,5:1`);
    }
  }
  // Faste værdier, der ikke kommer fra aura-tokens (styles.css' mørke blok og
  // status-farverne på .chat-meta): målt med deres konkrete tal. P1: den gamle
  // navy-palet (#233043, #e0b34d …) er udskiftet med tokens — parrene er
  // målt igen på de nye flader (P1-rapporten).
  const fixed = [
    [[190, 192, 196], [38, 38, 40], 8.3, '.diff-stat-badge mørk (P1): --aura-ink-secondary på --aura-bg-tint'],
    [[138, 83, 0], [249, 250, 251], 6.0, '.chat-meta.is-waiting (lys): #8a5300 på sidepanelet'],
    [[220, 160, 60], [27, 27, 28], 7.5, '.chat-meta.is-waiting (mørk, P1): --aura-warning-ink på sidepanelet'],
    [[21, 21, 23], [238, 242, 247], 16.2, '.change-tag (lys): --aura-ink på #eef2f7'],
    [[238, 238, 240], [38, 38, 40], 13.0, '.change-tag (mørk, P1): --aura-ink på --aura-bg-tint'],
    [[29, 107, 67], [227, 244, 234], 5.6, '.change-tag.change-ny (lys)'],
    [[72, 180, 120], [22, 48, 36], 5.5, '.change-tag.change-ny (mørk, P1): --aura-success på --aura-success-subtle'],
    [[163, 40, 42], [251, 233, 233], 6.2, '.change-tag.change-slettet (lys og mørk)']
  ];
  for (const [fg, bg, expected, label] of fixed) {
    const measured = contrast(fg, bg);
    assert.ok(measured >= 4.5, `${label}: måler ${measured.toFixed(2)}:1 — kravet er 4,5:1`);
    assert.ok(Math.abs(measured - expected) <= 0.6, `${label}: målingen ${measured.toFixed(2)} stemmer med den dokumenterede ${expected}:1`);
  }
});

// (g) Token-BRUG: kontrast-parrene i (f) er kun ægte, hvis de løftede regler
// faktisk bruger de kontrast-sikre tokens. Audits konkrete fund: --calm-faint
// på genvejslinjen og sidepanelet, accent på .tab-badge og Anbefalet-pillen.
test('token-brug: de løftede regler bruger de kontrast-sikre tokens', () => {
  const calmCss = read('workspace-calm.css');
  const calmRule = selector => {
    const match = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(strip(calmCss));
    return match ? match[1] : null;
  };
  // Genvejslinjen og statuslinjerne: svag (--calm-faint) tekst er målt under
  // 4,5:1 i begge temaer — de bruger nu --aura-ink-muted.
  assert.match(strip(calmCss), /#composer-shortcut\s*\{[^}]*font-size:\s*12px/, 'genvejslinjen er 12 px hjælpetekst');
  assert.ok(!/font-size:[^;}]*color:\s*var\(--calm-faint\)/.test(strip(calmCss)), 'ingen tekstregel kobler størrelse og --calm-faint længere');
  const statusRule = calmRule('.workspace-calm :is(.composer-status,#context-status)');
  assert.ok(statusRule && /font-size:\s*12px/.test(statusRule) && /var\(--muted\)/.test(statusRule) && !/faint/.test(statusRule), 'statuslinjerne bruger --muted, ikke faint');
  assert.ok(!/var\(--calm-faint\)/.test(calmRule('.workspace-calm :is(.nav-label,.chat-meta,.badge)') || '') && /var\(--aura-ink-secondary\)/.test(calmRule('.workspace-calm :is(.nav-label,.chat-meta,.badge)') || ''), 'sidepanelets labels/tidsstempler bruger --aura-ink-secondary');
  // styles.css: .tab-badge bruger det kontrast-sikre primærpar; Anbefalet-
  // pillen og tidsstempel-statuserne bruger accent-hover/ink-secondary.
  const badgeRule = /\.tab-badge\s*\{[^}]*\}/.exec(strip(stylesCss))[0];
  assert.match(badgeRule, /background:\s*var\(--aura-button-primary\)/, '.tab-badge har primærknappens baggrund');
  assert.match(badgeRule, /color:\s*var\(--aura-button-primary-text\)/, '.tab-badge har primærknappens tekstfarve');
  assert.match(strip(stylesCss), /\.answer-choice \.recommended\s*\{[^}]*color:\s*var\(--accent-hover\)/, 'Anbefalet-pillen bruger accent-hover (accent måler 3,8:1 i lyst tema)');
  assert.match(strip(stylesCss), /\.chat-meta\s*\{[^}]*color:\s*var\(--aura-ink-secondary\)/, '.chat-meta bruger ink-secondary (muted måler 4,49:1 på sidepanelet)');
  assert.match(strip(stylesCss), /\.chat-meta\.is-running,\s*\.chat-meta\.is-unread\s*\{[^}]*var\(--accent-hover\)/, 'tidsstempel-statuserne bruger accent-hover');
  assert.match(strip(stylesCss), /\.diff-stat-badge\s*\{[^}]*color:\s*var\(--aura-ink-secondary\)/, '.diff-stat-badge bruger ink-secondary (muted på tint måler 4,27:1)');
});
