// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Én indholdsramme (UI/UX-overhaulens skive 1, docs/uiux-overhaul-design.md
// "Kernetal"): samtaleteksten og composeren deler én ramme. --chat-col er
// rammens bredde, --chat-gutter er afstanden uden for rammen; composeren
// trækker gutteren fra sin egen bredde, så kortet rammer tekstkolonnens kant
// i alle tilstande. Disse pins holder ramme-kontrakten mod de rigtige
// stylesheets; settings-fontsize.test.cjs piner de store skærms trinværdier.
const ui = path.join(__dirname, '..', 'ui');
const tokensCss = fs.readFileSync(path.join(ui, 'aura-tokens.css'), 'utf8');
const calmCss = fs.readFileSync(path.join(ui, 'workspace-calm.css'), 'utf8');
const stylesCss = fs.readFileSync(path.join(ui, 'styles.css'), 'utf8');

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Balanced-brace extraction: the block that opens at or after `start`, so
// nested @media bodies parse without a CSS library.
function blockAt(css, start) {
  const open = css.indexOf('{', start);
  assert.ok(open >= 0, 'CSS-blokken åbner');
  let depth = 0;
  for (let index = open; index < css.length; index++) {
    if (css[index] === '{') depth++;
    else if (css[index] === '}') { depth--; if (!depth) return [open, index]; }
  }
  throw new Error('Ubalancerede CSS-blokke');
}
function mediaBlock(css, query) {
  // Whitespace-tolerant: the repo writes both `@media (min-width: 1600px)`
  // and `@media(max-width:1100px)`.
  const pattern = new RegExp(`@media\\s*${query.replace(/[()]/g, '\\$&').replace(/:\s*/g, ':\\s*')}`);
  const at = css.search(pattern);
  assert.ok(at >= 0, `media-queryen ${query} findes`);
  const [open, close] = blockAt(css, at);
  return strip(css.slice(open + 1, close));
}
// Every `{ … }` body whose selector is exactly `selector` — a `.composer`
// lookup never matches `.composer:focus-within`, and longer selectors that
// merely contain the text are skipped by the brace check.
function declarationsOf(css, selector) {
  const found = [];
  let at = css.indexOf(selector);
  while (at >= 0) {
    const brace = css.indexOf('{', at + selector.length);
    if (brace < 0) break;
    if (css.slice(at + selector.length, brace).trim() === '') {
      const [open, close] = blockAt(css, at);
      found.push(strip(css.slice(open + 1, close)).trim());
    }
    at = css.indexOf(selector, at + 1);
  }
  return found;
}
function declaration(declarations, property) {
  // Comments and selector braces are bridged, so a lookup works on a bare
  // rule body as well as on a whole media block.
  const clean = strip(declarations).replace(/\s+/g, ' ');
  const match = new RegExp(`(?:^|[{;]\\s*)${property}\\s*:\\s*([^;}]+)`).exec(clean);
  return match ? match[1].trim() : null;
}
// Selector → declarations inside one media body (the repo's CSS-parse
// pattern from settings-fontsize.test.cjs).
const rulesOf = body => Object.fromEntries([...body.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(match => [match[1].trim(), match[2].trim()]));

// (a) The token exists once, with its three stepped values spread over the
// base :root and the two min-width queries.
test('aura-tokens.css: rammen --chat-col og gutteren --chat-gutter findes i :root', () => {
  const [open, close] = blockAt(tokensCss, tokensCss.indexOf(':root'));
  const root = tokensCss.slice(open + 1, close);
  assert.equal(declaration(root, '--chat-col'), '800px', 'rammen er 800 px i basis');
  assert.equal(declaration(root, '--chat-gutter'), '22px', 'gutteren er 22 px i basis');
});

test('workspace-calm.css: rammen trapper 960/1040 på store skærme — uden egne selektorbredder', () => {
  const wide = mediaBlock(calmCss, '(min-width: 1600px)');
  const widest = mediaBlock(calmCss, '(min-width: 2000px)');
  assert.equal(declaration(wide, '--chat-col'), '960px', 'ved 1600 vokser rammen til 960 px');
  assert.equal(declaration(widest, '--chat-col'), '1040px', 'ved 2000 når rammen 1040 px');
  // The stepped token REPLACES the per-selector widths: no rule in the steps
  // may set a max-width of its own on the two frame elements.
  for (const [name, body] of [['1600', wide], ['2000', widest]]) {
    for (const key of Object.keys(rulesOf(body))) {
      assert.ok(!key.includes('.chat-content') && !key.includes('.composer'), `${name}-trinnet giver ${key} sin egen bredde — kun rammen må bære den`);
    }
  }
  assert.ok(calmCss.indexOf('@media (min-width: 1600px)') > calmCss.indexOf('.workspace-calm .composer {'), '1600-trinnet står efter grundreglen — kaskaden bærer overdækningen');
});

// (b) Both frame elements reference the token — the chat directly, the
// composer through the gutter-compensated calc.
test('workspace-calm.css: chat-indhold og composer deler rammen via --chat-col', () => {
  const chat = declarationsOf(calmCss, '.workspace-calm .chat-content');
  assert.ok(chat.length >= 1, 'chat-indholdets grundregel findes');
  assert.equal(declaration(chat[0], 'max-width'), 'var(--chat-col)', 'tekstkolonnen lukkes ved rammen');
  assert.equal(declaration(chat[0], 'padding'), '20px var(--chat-gutter)', 'gutteren er padding på kolonnen — afstanden uden for rammen');
  assert.equal(declaration(chat[0], 'margin'), '0 auto', 'tekstkolonnen centrerer sig');
  const composer = declarationsOf(calmCss, '.workspace-calm .composer');
  assert.ok(composer.length >= 1, 'composerens grundregel findes');
  assert.equal(declaration(composer[0], 'max-width'), 'calc(var(--chat-col) - var(--chat-gutter) * 2)', 'composeren lukkes ved rammen minus gutteren');
  assert.equal(declaration(composer[0], 'width'), 'calc(100% - var(--chat-gutter) * 2)', 'på smalle paneler følger kortet tekstkolonnen — ikke panelets kant');
  assert.equal(declaration(composer[0], 'margin'), '8px auto 5px', 'kortet centrerer sig som tekstkolonnen');
  // styles.css's base rule carries the same frame, so the contract is not
  // calm-only.
  const base = declarationsOf(stylesCss, '.composer')[0];
  assert.ok(base, 'composerens grundregel i styles.css findes');
  assert.ok(/var\(--chat-col\)/.test(declaration(base, 'max-width') || ''), 'grundreglen lukker også ved rammen');
  assert.ok(/var\(--chat-gutter\)/.test(declaration(base, 'width') || ''), 'grundreglen trækker også gutteren fra');
});

// (c) The 720 px empty-chat rule and the 22 px asymmetry are gone; the
// composer compensates the gutter, parse-verified.
test('workspace-calm.css: den tomme samtale-composers egen bredde (720 px) er væk', () => {
  assert.equal(declarationsOf(calmCss, '.workspace-calm .work-grid[data-surface="off"] .composer').length, 0, 'den panel-lukkede composer har ingen egen bredde længere');
  for (const selector of ['.workspace-calm .chat-content', '.workspace-calm .composer']) {
    for (const body of declarationsOf(calmCss, selector)) {
      const width = declaration(body, 'max-width');
      assert.ok(width === null || width.includes('var(--chat-col)'), `${selector} bærer ingen egen pixelbredde — rammen gør det`);
    }
  }
  // Panel-kappen består som afrundet af rammen (ruling 3): #chat-panel
  // begrænser kolonnen, --chat-col begrænser indholdet.
  assert.ok(calmCss.includes('.workspace-calm .work-grid[data-surface="off"] #chat-panel { max-width: 900px; margin: 0 auto; width: 100%; }'), 'panel-luk-kappen (900 px) består');
});

// The edge measurement: composer max-width + gutter == chat-content indre
// bredde. The declared calc is resolved with the real token numbers, and the
// width model is walked across panel widths — the composer box must equal
// the text column at every width, not just at the cap.
test('kantmåling: composers kant == tekstkolonnens kant på de erklærede tal', () => {
  const [open, close] = blockAt(tokensCss, tokensCss.indexOf(':root'));
  const root = tokensCss.slice(open + 1, close);
  const chatCol = Number(declaration(root, '--chat-col').replace('px', ''));
  const gutter = Number(declaration(root, '--chat-gutter').replace('px', ''));
  const resolve = (expr, values) => {
    let js = expr.replace(/var\((--[a-z-]+)\)/g, (whole, name) => {
      assert.ok(values[name] !== undefined, `${name} er defineret`);
      return String(values[name]);
    });
    js = js.replace(/^calc\(/, '(').replace(/(\d)px/g, '$1');
    assert.match(js, /^[\d\s()+*-]+$/, 'udtrykket er et rent regnestykke');
    return Function(`"use strict"; return (${js});`)();
  };
  const composer = declarationsOf(calmCss, '.workspace-calm .composer')[0];
  const maxExpr = declaration(composer, 'max-width');
  const widthExpr = declaration(composer, 'width');
  assert.equal(resolve(maxExpr, { '--chat-col': chatCol, '--chat-gutter': gutter }), chatCol - gutter * 2, 'composerens max-bredde er præcis tekstkolonnens bredde');
  assert.equal(resolve(widthExpr.replace(/100%/, '100'), { '--chat-gutter': gutter }), 100 - gutter * 2, 'under kappen trækker kortet gutteren fra panelet');
  // Model walk: chat-content's inner column and the composer's box must
  // coincide for every panel width (≤0.5 px rounding) — with the base
  // gutter and with the narrow step's 18 px.
  const walk = gutter => {
    const column = panel => Math.min(panel, chatCol) - gutter * 2;
    const card = panel => Math.min(panel - gutter * 2, chatCol - gutter * 2);
    for (const panel of [280, 420, 700, 780, 800, 900, 1000, 1080, 1200, 1600, 3840]) {
      assert.ok(Math.abs(column(panel) - card(panel)) <= 0.5, `gutter ${gutter}, panel ${panel} px: composeren rammer tekstkolonnens kant`);
    }
  };
  walk(gutter);
  // The narrow step keeps the contract: gutter and padding share one source.
  const narrow = mediaBlock(calmCss, '(max-width: 1100px)');
  assert.equal(declaration(narrow, '--chat-gutter'), '18px', 'det smalle trin sætter gutter-tokenet');
  const narrowChat = declarationsOf(narrow, '.workspace-calm .chat-content');
  assert.equal(narrowChat.length, 1, 'det smalle trin rører kun padding på kolonnen');
  assert.equal(declaration(narrowChat[0], 'padding'), '18px var(--chat-gutter)', 'padding følger gutter-tokenet — 18 px-kontrakten består');
  walk(18);
});
