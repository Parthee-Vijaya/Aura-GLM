// SPDX-License-Identifier: EUPL-1.2
// Material system guard (plan: desktop/docs/materialesystem-plan.md, phase 1).
// The look drifted because every surface picked its own radius, border weight
// and shadow. These pins keep the shared scale: six radius tiers, one hairline,
// elevation instead of border + shadow, keyboard-only focus rings on buttons,
// and Aura's own accent with computed contrast.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = path.join(__dirname, '..', 'ui');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const sheets = fs.readdirSync(ui).filter(name => name.endsWith('.css')).sort()
  .map(name => ({ name, css: strip(fs.readFileSync(path.join(ui, name), 'utf8')) }));
const sheet = name => sheets.find(entry => entry.name === name).css;
const tokens = sheet('aura-tokens.css');
const calm = sheet('workspace-calm.css');
const components = sheet('components.css');
const root = /:root\s*\{([^}]*)\}/.exec(tokens)[1];
const rule = (css, selector) => {
  const at = css.indexOf(selector + ' {') >= 0 ? css.indexOf(selector + ' {') : css.indexOf(selector + '{');
  assert.ok(at >= 0, `rule ${selector} exists`);
  return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
};

// ── Radius: role tiers 4/8/12/16/20/28, full-round shapes and tiny glyph details ──
const TIERS = new Set(['0', '4px', '8px', '12px', '16px', '20px', '28px']);
const FULL_ROUND = new Set(['50%', '100%', '999px']);
const TINY = new Set(['1px', '2px']);
const onScale = part => TIERS.has(part) || FULL_ROUND.has(part) || TINY.has(part) || part === 'inherit' || /^var\(--[a-z0-9-]+\)$/.test(part) || part.startsWith('calc(');
const parts = value => value.replace(/!important/g, '').trim().split(/[\s/]+/).filter(Boolean);

test('every border-radius uses the shared scale', () => {
  const offenders = [];
  for (const { name, css } of sheets) {
    for (const match of css.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}]+)/g)) {
      const value = match[1].trim();
      // calc() and var() may contain spaces; they are accepted whole.
      if (/^(calc|var)\(/.test(value)) continue;
      const bad = parts(value).filter(part => !onScale(part));
      if (bad.length) offenders.push(`${name}: border-radius:${value}`);
    }
  }
  assert.deepEqual(offenders, [], 'radius values outside 4/8/12/16/20/28, full-round or tiny details');
});

test('radius custom properties resolve to the shared scale', () => {
  const offenders = [];
  for (const { name, css } of sheets) {
    for (const match of css.matchAll(/(--[a-z0-9-]*radius[a-z0-9-]*)\s*:\s*([^;}]+)/g)) {
      const value = match[2].trim();
      if (/^(calc|var)\(/.test(value)) continue;
      if (!parts(value).every(onScale)) offenders.push(`${name}: ${match[1]}:${value}`);
    }
  }
  assert.deepEqual(offenders, []);
  assert.match(root, /--aura-radius-panel:\s*28px/, 'main enclosing surfaces use 28 px');
});

// ── Hairline and elevation ──
test('tokens define one hairline and three elevation levels with the stroke in the shadow', () => {
  assert.match(root, /--aura-hairline:\s*0\.5px/);
  assert.match(root, /--aura-elevation-stroke:\s*0 0 0 var\(--aura-hairline\) var\(--aura-elevation-stroke-color\)/);
  for (const level of ['soft', 'panel', 'prominent']) {
    const value = new RegExp(`--aura-elevation-${level}:\\s*([^;]+);`).exec(root);
    assert.ok(value, `--aura-elevation-${level} exists`);
    assert.match(value[1], /^var\(--aura-elevation-stroke\),/, `${level} starts with the hairline stroke`);
  }
});

test('neutral borders draw at the hairline weight', () => {
  const offenders = [];
  for (const { name, css } of sheets) {
    for (const match of css.matchAll(/1px solid var\(--(?:line|border|aura-border|aura-border-strong|aura-border-faint)\)/g)) offenders.push(`${name}: ${match[0]}`);
  }
  assert.deepEqual(offenders, [], 'use var(--aura-hairline) for neutral solid borders');
});

test('the composer is an elevated surface: no border, panel radius, soft elevation', () => {
  const composer = rule(calm, 'body.workspace-calm .composer');
  assert.match(composer, /border:0/);
  assert.match(composer, /border-radius:var\(--aura-radius-panel\)/);
  assert.match(composer, /box-shadow:var\(--aura-elevation-soft\)/);
  assert.doesNotMatch(calm, /(?<!html\[data-input-modality="keyboard"\] )body\.workspace-calm \.composer:has\(textarea:focus-visible\)\s*\{\s*outline:2px/, 'a click in the field no longer draws the accent frame');
  assert.match(calm, /html\[data-input-modality="keyboard"\] body\.workspace-calm \.composer:has\(textarea:focus-visible\)/, 'keyboard focus keeps a visible ring');
});

test('the menu material carries its edge in the elevation, not in a second border', () => {
  const menu = rule(components, '.menu-material');
  assert.match(menu, /border:\s*0;/);
  assert.match(menu, /box-shadow:\s*var\(--aura-elevation-panel\)/);
});

// ── Focus follows input modality ──
test('focus rings on buttons follow the input modality', () => {
  const index = fs.readFileSync(path.join(ui, 'index.html'), 'utf8');
  assert.match(index, /<script src="input-modality\.js"><\/script>/, 'loaded early, without defer, so the first click is already classified');
  const script = fs.readFileSync(path.join(ui, 'input-modality.js'), 'utf8');
  assert.match(script, /dataset\.inputModality/);
  assert.match(script, /pointerdown/);
  assert.match(script, /keydown/);
  assert.match(tokens, /html\[data-input-modality="pointer"\] body :focus-visible:not\(:read-write\)\s*\{[^}]*outline-color:\s*transparent\s*!important/);
});

// ── Aura's own accent, with computed contrast ──
const luminance = rgb => {
  const linear = channel => { const c = channel / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * linear(rgb[0]) + 0.7152 * linear(rgb[1]) + 0.0722 * linear(rgb[2]);
};
const contrast = (fg, bg) => { const a = luminance(fg), b = luminance(bg); const [hi, lo] = a > b ? [a, b] : [b, a]; return (hi + 0.05) / (lo + 0.05); };

test('the accent comes from the Aura mark and stays readable in both themes', () => {
  const { light, dark } = require('./helpers/theme-tokens.cjs').tokenThemes(tokens);
  assert.deepEqual(light['--aura-accent'], [11, 127, 98]);
  assert.deepEqual(dark['--aura-accent'], [61, 214, 168]);
  // Send glyph on the accent fill (graphic object: 3:1), accent text on each surface (4.5:1).
  assert.ok(contrast([255, 255, 255], light['--aura-accent']) >= 4.5);
  assert.ok(contrast([21, 21, 23], dark['--aura-accent']) >= 4.5);
  for (const surface of ['--aura-bg', '--aura-bg-sidebar', '--aura-bg-panel', '--aura-accent-subtle', '--aura-accent-faint']) {
    assert.ok(contrast(light['--aura-accent-ink'], light[surface]) >= 4.5, `light accent ink on ${surface}`);
    assert.ok(contrast(dark['--aura-accent-ink'], dark[surface]) >= 4.5, `dark accent ink on ${surface}`);
  }
});

test('the sidebar wordmark follows the reference size and the brand font', () => {
  const brand = rule(calm, 'body.workspace-calm .brand-name');
  assert.match(brand, /font-size:18px/);
  assert.match(brand, /font-family:var\(--aura-font-family-brand\)/);
});
