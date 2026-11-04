// SPDX-License-Identifier: EUPL-1.2
// D1 · Sidepanelet i DSH-stil (0.5.9) — de statiske pins for skivens ændringer.
// Arbejdsliste: claude-uiux-audit.md §3 + top-10 punkt 7, claude-s3-analysis.md
// (fund a og d), deepseek-design-plan.md §3, d1-brief.md (B1-B6-beslutningerne:
// #new beholder newProject-handleren; D7 udskydes; skjoldet røres ikke).
//
// Hver pin fryser ét konkret mål fra auditten: bredde 280 (264-420, R5-nøgle),
// brandrække 60 px med versionpillen ét sted, "Ny samtale" 38 px radius 12,
// menupunkter med ikon + venstrestilling (også "Søg i samtaler"),
// sektionshoved 36 px i 13/500 uden versaler, projektrækker 34 px,
// samtalerækker 32 px i 14/20, valgt række i neutralt fyld, profilrække 44 px,
// og overlay-skuffens inset der følger topbjælken. Kontrasten for de nye
// par beregnes her — intet antages (R4).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = path.join(__dirname, '..', 'ui');
const read = name => fs.readFileSync(path.join(ui, name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const tokens = strip(read('aura-tokens.css'));
const calm = strip(read('workspace-calm.css'));
const feedbackCss = strip(read('feedback-layout.css'));
const components = strip(read('components.css'));
const styles = strip(read('styles.css'));
const indexHtml = read('index.html');
const app = read('app.js');
const chats = read('chats.js');
const feedback = read('feedback-layout.js');
const viewport = read('viewport.js');
const rule = (css, selector) => {
  const found = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}').exec(css);
  return found ? found[1] : null;
};

// ── 1. Bredde: 280 standard, træk 264-420, R5-nøgle i layout-objektet ──
test('sidepanelets bredde er 280 px — og trækket 264-420 gemmes i layout-objektet (R5)', () => {
  assert.match(calm, /--sidebar:\s*280px/, 'workspace-calm: standardbredden er 280 px (audit §3)');
  assert.ok(!/--sidebar:\s*175px/.test(calm), 'det smalle 175 px-trin er væk (audit §3)');
  assert.match(styles, /--sidebar:\s*280px/, 'basis (--root i styles.css) er også 280 px');
  assert.match(feedbackCss, /--feedback-sidebar-width,\s*280px/, 'skillelinjens CSS-fallback er 280 px');
  // R5: sidebar-bredden bor som NY NØGLE i layout-objektet — den gamle
  // nøgle er kun læst-fallback, og viewport.js' gemning fletter i stedet
  // for at overskrive, så nøglen aldrig tabes.
  assert.match(feedback, /harness-workspace-layout-v1/, 'feedback-layout kender layout-objektet');
  assert.match(feedback, /saved\.sidebar/, "bredden læses fra nøglen 'sidebar'");
  assert.match(feedback, /saved\.sidebar\s*=\s*preferredWidth/, "bredden gemmes i nøglen 'sidebar' (læs-ændre-skriv)");
  assert.match(feedback, /aura-sidebar-width-v1/, 'den gamle nøgle er læst-fallback for gemte bredder');
  assert.match(viewport, /JSON\.parse\(localStorage\.getItem\(storageKey\)\)/, 'viewport.js læser det gemte objekt før gemning');
  assert.ok(/function save\(\)[\s\S]{0,900}localStorage\.setItem\(storageKey,\s*JSON\.stringify\(\{\s*\.\.\.stored/.test(viewport), 'viewport.js fletter i det gemte objekt — ukendte nøgler (sidebar) overlever');
  const min = /(\d+)\s*,\s*Math\.min\(420/.exec(feedback);
  assert.ok(/preferredWidth = 280/.test(feedback), 'standardbredden i JS er 280');
  assert.ok(!/preferredWidth = 208/.test(feedback), 'den gamle 208-standard er væk');
  assert.match(feedback, /264/, 'trækkets gulv er 264 px');
  assert.match(feedback, /420/, 'trækkets loft er 420 px');
  assert.match(feedback, /aria-valuemin', '264'/, 'gulvet annonseres til skærmlæseren');
  assert.match(feedback, /preferredWidth = 280; sizeSidebar\(\)/, 'dobbeltklik nulstiller til 280');
});

// ── 2. Brandrækken 60 px med versionpillen som eneste versionflade ──
test('brandrækken er 60 px og versionen står KUN der (S3-fund d)', () => {
  const brand = rule(calm, '.workspace-calm .brand');
  assert.ok(brand && /min-height:\s*60px/.test(brand), 'brandrækken er 60 px (audit §3)');
  const pill = rule(styles, '.app-version');
  assert.ok(pill && /border-radius:\s*999px/.test(pill) && /font-size:\s*11px/.test(pill) && /line-height:\s*17px/.test(pill), 'versionpillen er 11/17 (DSH §3)');
  assert.ok(pill && /var\(--aura-ink-secondary\)/.test(pill), 'pillens tekst bærer den kontrastmålte sekundærfarve');
  // Versionen står KUN ét sted i selve sidepanelet. Onboarding B's
  // velkomstdialog (app-rammen er væk dér) har sin egen brandflade og røres
  // ikke af D1 — derfor tælles kun inden for <aside class="sidebar">.
  const sidebarMarkup = /<aside class="sidebar"[\s\S]*?<\/aside>/.exec(indexHtml.replace(/\n/g, ' '))[0];
  const count = [...sidebarMarkup.matchAll(/data-app-version/g)].length;
  assert.equal(count, 1, 'versionen findes præcis ét sted i sidepanelet');
  assert.ok(/class="brand"[^>]*>[\s\S]*?data-app-version/.test(sidebarMarkup), 'versionpillen står i brandrækken');
  assert.ok(!/badge" data-app-version/.test(sidebarMarkup), 'den gamle Testversion-badge i sidepanelets bund er væk');
});

// ── 3. Handlingerne er ADSKILTTE (Parthee 4.11, supersederer B2-noten om at
// #new beholder newProject-handleren): "Ny samtale" starter en ny samtale i
// det åbne projekt; "Nyt projekt" er den eksisterende projektoprettelse. ──
test('"Ny samtale" (#new-chat) og "Nyt projekt" (#new) er to adskilte handlinger (Parthee 4.11)', () => {
  // Den store knap er #new-chat: "Ny samtale", 38 px radius 12 i primærparret.
  assert.ok(/id="new-chat"[^>]*title="Ny samtale"/.test(indexHtml), 'den store knap hedder Ny samtale');
  assert.match(indexHtml, /<span class="nav-text">Ny samtale<\/span>/, 'knappens tekst er Ny samtale');
  assert.ok(indexHtml.indexOf('id="new-chat"') < indexHtml.indexOf('<nav>'), 'den store knap står over nav som sin egen knap');
  const big = rule(styles, '#new-chat');
  assert.ok(big && /min-height:\s*38px/.test(big), 'knappen er 38 px (audit §3)');
  assert.ok(big && /border-radius:\s*var\(--aura-radius-md\)/.test(big), 'radius 12 (DSH-skalaen)');
  assert.ok(big && /background:\s*var\(--aura-button-primary\)/.test(big) && /color:\s*var\(--aura-button-primary-text\)/.test(big), 'DSH-primærparret (sort/hvid, ikke accent)');
  // #new er menupunktet "Nyt projekt" og beholder den eksisterende handler.
  assert.ok(/id="new"[^>]*title="Nyt projekt"/.test(indexHtml), 'menupunktet hedder Nyt projekt');
  assert.ok(/<nav>[\s\S]{0,40}id="new"/.test(indexHtml.replace(/\n/g, '')), '"Nyt projekt" står i nav-rækken med de øvrige menupunkter');
  const handler = /\$\('#new'\)\.onclick = \(\) => action\(async \(\) => \{[\s\S]{0,220}call\('newProject'/.exec(app);
  assert.ok(handler, 'app.js binder stadig newProject på #new (Nyt projekt)');
  // Den store knap: ny samtale i det åbne projekt; uden projekt samme vej som
  // Nyt projekt (DSH §3: uden et åbent projekt er der intet at samtale i).
  assert.match(app, /\$\('#new-chat'\)\.onclick = \(\) => \{ if \(!current\) return \$\('#new'\)\.onclick\(\); action\(newChat\); \};/, '"Ny samtale" har sin egen handler: newChat med Nyt projekt-fallback');
  assert.match(app, /async function newChat\(\) \{ if \(!current\) return;[\s\S]{0,200}call\('newConversation'/, 'newChat er appens eksisterende samtalestart (newConversation-IPC)');
  // Begge knapper følger den samme busy/loading-håndtering som #open.
  assert.match(app, /\$\('#new'\)\.disabled = busy; \$\('#new-chat'\)\.disabled = busy; \$\('#open'\)\.disabled = busy;/, 'begge deaktiveres under projektlæsning');
  assert.ok(/\['#new', '#new-chat', '#open'/.test(app), 'læsningsløkken kender den store knap');
});

// ── 4. Menupunkter: ikon + venstrestilling for ALLE (S3-fund a) ──
test('alle menupunkter har ikon og venstrestilling — også "Søg i samtaler"', () => {
  const search = /<button type="button" id="history-search-open"[^>]*>[\s\S]*?<\/button>/.exec(indexHtml.replace(/\n/g, ' '));
  assert.ok(search, '#history-search-open findes');
  assert.ok(/<nav>[\s\S]*?id="history-search-open"/.test(indexHtml.replace(/\n/g, ' ')), '"Søg i samtaler" står i nav-rækken med de øvrige menupunkter');
  assert.ok(/id="history-search-open"[^>]*>[\s\S]*?aria-hidden="true"[\s\S]*?<svg/.test(indexHtml.replace(/\n/g, '')), '"Søg i samtaler" har et ikon');
  assert.ok(/id="history-search-open"[^>]*>[\s\S]*?class="nav-text"/.test(indexHtml.replace(/\n/g, '')), '"Søg i samtaler" har venstrestillet tekst');
  // Rækkerne: 36 px, radius 12 — samme grammatik for nav-knapper og de tre
  // text-button-rækker (Indstillinger, Værktøjer, Introduktion).
  const rows = rule(styles, '.sidebar :is(nav button,#settings-toggle,#tools-button,#intro-button)');
  assert.ok(rows && /min-height:\s*36px/.test(rows) && /border-radius:\s*var\(--aura-radius-md\)/.test(rows), 'menupunkterne er 36 px-rækker med radius 12');
  assert.ok(rows && /text-align:\s*left/.test(rows), 'teksten står til venstre');
  const icons = rule(styles, '.sidebar :is(nav button,#settings-toggle,#tools-button,#intro-button) span:not(.nav-text)');
  assert.ok(icons && /width:\s*18px/.test(icons) && /height:\s*18px/.test(icons), 'ikonerne sidder i en fast 18 px-boks');
  for (const id of ['new', 'settings-toggle', 'tools-button', 'intro-button']) assert.ok(new RegExp(`id="${id}"[^>]*>[\\s\\S]{0,120}<svg`).test(indexHtml.replace(/\n/g, '')), `#${id} har et ikon`);
});

// ── 5. Sektionshovedet: 36 px i 13/500 — almindelig skrift ──
test('sektionshovedet er 36 px i 13/500 uden versaler (audit §3)', () => {
  assert.ok(indexHtml.includes('>Projekter</div>'), 'teksten er "Projekter" — ikke "PROJEKTER"');
  assert.ok(!indexHtml.includes('PROJEKTER'), 'versal-teksten er væk fra markup');
  const label = rule(styles, '.nav-label');
  assert.ok(label && /min-height:\s*36px/.test(label), 'sektionshovedet er en 36 px-række');
  assert.ok(label && /font-size:\s*13px/.test(label) && /font-weight:\s*500/.test(label), '13 px og vægt 500');
  assert.ok(label && !/letter-spacing:\s*\.0/.test(label), 'spatieringen (.08em) er væk fra sektionshovedet (styles.css:55)');
  assert.ok(label && !/text-transform/.test(label), 'ingen versaler på sektionshovedet');
});

// ── 6. Projektrækkerne: 34 px, én linje, fulde navn i title ──
test('projektrækkerne er 34 px i 14/20 med ellipsis og fulde navn i title', () => {
  const name = rule(styles, '.project-name');
  assert.ok(name && /min-height:\s*34px/.test(name), 'projektrækken er 34 px (audit §3)');
  assert.ok(name && /font-size:\s*14px/.test(name) && /line-height:\s*20px/.test(name), 'projektnavnet er 14/20');
  assert.ok(name && /white-space:\s*nowrap/.test(name) && /text-overflow:\s*ellipsis/.test(name) && /overflow:\s*hidden/.test(name), 'navnet afkortes med ellipsis — ét linjebrud');
  assert.ok(name && !/overflow-wrap:\s*anywhere/.test(name), 'to-linje-bruddet (overflow-wrap) er væk');
  assert.ok(/name\.title = project\.name/.test(chats), 'chats.js sætter det fulde navn i title');
  const current = rule(styles, '.project-entry.is-current .project-name');
  assert.ok(current && /background:\s*var\(--aura-bg-hover\)/.test(current), 'den valgte række bruger det NEUTRALE hover-fyld (DSH §3)');
});

// ── 7. Samtalerækkerne: 32 px i 14/20, valgt række neutral ──
test('samtalerækkerne er 32 px i 14/20 og den valgte række er neutral (styles.css:904-fundet)', () => {
  const row = rule(styles, '.chat-row');
  assert.ok(row && /min-height:\s*32px/.test(row), 'samtalerækken er 32 px (audit §3)');
  assert.ok(row && /font-size:\s*14px/.test(row) && /line-height:\s*20px/.test(row), '14/20 (audit §3)');
  const selected = rule(styles, '.chat-row[aria-current="true"]');
  assert.ok(selected && /background:\s*var\(--aura-bg-hover\)/.test(selected) && /color:\s*var\(--aura-ink\)/.test(selected), 'den valgte række er neutral — det hårdkodede blå er væk');
  for (const blue of ['#e3ecfa', '#163b75', '#e9f0fb']) assert.ok(!styles.includes(blue), `det hårdkodede blå ${blue} er væk fra styles.css`);
  const more = rule(styles, '.chat-more');
  assert.ok(more && /var\(--aura-bg-raised\)/.test(more), '"•••"-knappen er neutral i begge temaer');
  // DSH §3: statussen ("arbejder"/"venter på dig") står på samme linje som
  // titlen — ellers bliver statusrækken 52 px i stedet for 32 px.
  assert.ok(!/\.chat-row\.has-status\s*\{[^}]*row-gap/.test(styles) && !/\.chat-row\.has-status \.chat-meta\s*\{[^}]*grid-row:\s*2/.test(styles), 'statusrækken er én linje — 32 px også med status (DSH §3)');
});

// ── 8. Profilrækken: 44 px ──
test('profilrækken er 44 px og åbner stadig den eksisterende profilflade', () => {
  const chip = rule(styles, '.profile-chip');
  assert.ok(chip && /min-height:\s*44px/.test(chip), 'profilrækken er 44 px (audit §3)');
  assert.ok(chip && /border-radius:\s*var\(--aura-radius-md\)/.test(chip), 'radius 12 som rækkerne');
  assert.match(rule(styles, '.profile-chip[hidden]') || '', /display:\s*none/, '[hidden]-reglen består (profile-chip-testen)');
});

// ── 9. Overlay-skuffen følger topbjælken — ingen hårdkodet 51 px ──
test('overlay-skuffens inset følger topbjælken (52 px) gennem én token', () => {
  assert.match(tokens, /--aura-workspace-bar:\s*52px/, 'bjælkehøjden er én token i aura-tokens.css');
  assert.match(calm, /inset:\s*var\(--aura-workspace-bar\)\s*auto\s*0\s*0/, 'skuffens inset følger bjælken (workspace-calm.css:155-fundet)');
  assert.match(feedbackCss, /top:\s*var\(--aura-workspace-bar\)/, 'skillelinjen starter under bjælken');
  const bar = rule(components, '.workspace-calm .workspace-bar');
  assert.ok(bar && /min-height:\s*var\(--aura-workspace-bar\)/.test(bar), 'bjælken selv er målet fra token');
  for (const [css, name] of [[calm, 'workspace-calm.css'], [feedbackCss, 'feedback-layout.css']]) assert.ok(!/51px/.test(css), `ingen hårdkodet 51 px i ${name}`);
});

// ── 10. Kontrast (R4): de nye flader måles i begge temaer ──
const luminance = rgb => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
const contrast = (fg, bg) => { const a = luminance(fg), b = luminance(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };
const tokenThemes = () => {
  const themes = {};
  const rootRule = /:root\s*\{([^}]*)\}/.exec(tokens);
  const darkRule = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[\s\S]*?:root:not\(\[data-workspace-theme="light"\]\)\s*\{([^}]*)\}/.exec(tokens);
  for (const [theme, body] of [['light', rootRule[1]], ['dark', darkRule[1]]]) {
    themes[theme] = {};
    for (const match of body.matchAll(/(--aura-[a-z-]+):\s*rgb\((\d+),\s*(\d+),\s*(\d+)\)/g)) themes[theme][match[1]] = [Number(match[2]), Number(match[3]), Number(match[4])];
    for (const match of body.matchAll(/(--aura-[a-z-]+):\s*rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/g)) themes[theme][match[1]] = { rgb: [Number(match[2]), Number(match[3]), Number(match[4])], a: Number(match[5]) };
  }
  return themes;
};
test('kontrast: sidepanelets nye flader holder AA i begge temaer', () => {
  const themes = tokenThemes();
  const over = (fill, bg) => fill.rgb.map((channel, index) => Math.round(channel * fill.a + bg[index] * (1 - fill.a)));
  for (const theme of ['light', 'dark']) {
    const T = themes[theme];
    const pairs = [
      [T['--aura-ink-secondary'], T['--aura-bg-sidebar'], 'menupunkter, sektionshoved og projektnavne på sidepanelet'],
      [T['--aura-ink'], over(T['--aura-bg-hover'], T['--aura-bg-sidebar']), 'valgt række: blæk på hover-fyldet over sidepanelet'],
      [T['--aura-ink-secondary'], T['--aura-bg-tint'], 'versionpillen på tint-fyldet'],
      [T['--aura-button-primary-text'], T['--aura-button-primary'], '"Ny samtale" (primærknappens par)'],
      [T['--aura-ink-secondary'], T['--aura-bg-raised'], '"•••"-knappen og teksten på dens flade']
    ];
    for (const [fg, bg, label] of pairs) {
      const measured = contrast(fg, bg);
      assert.ok(measured >= 4.5, `${label} (${theme}): måler ${measured.toFixed(2)}:1 — kravet er 4,5:1`);
    }
  }
});

// ── 11. Sidebar-tekst holder sig på typografi-gulvet ──
test('sidepanelets nye størrelser følger gulvet: 11 px kun i versionpillen', () => {
  const label = rule(styles, '.nav-label');
  assert.ok(label && /font-size:\s*13px/.test(label), 'sektionshovedet er 13 px — ikke 12');
  const chip = rule(styles, '.profile-chip');
  assert.ok(chip && /font-size:\s*13px/.test(chip), 'profilrækken er 13 px');
  const rows = rule(styles, '.sidebar :is(nav button,#settings-toggle,#tools-button,#intro-button)');
  assert.ok(rows && /font-size:\s*13px/.test(rows), 'menupunkterne er 13 px');
});
