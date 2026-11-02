// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Slice 4 of the UI/UX overhaul (docs/uiux-overhaul-design.md "Kernetal" 6,
// "Skiver" 4): ONE shared fold-out component (.disclosure) for every
// <details> surface — the ~50 static folds in index.html and the dynamically
// rendered ones in ui/*.js. Native <details>/<summary>, existing ids, structure
// and toggle behavior are untouched; the class is the only thing added.
// The height animation lives in ui/components.css behind a feature gate so a
// runtime without interpolate-size/::details-content keeps fully NATIVE folds
// (no JS shim); reduced motion kills the animation explicitly there.
const ui = path.join(__dirname, '..', 'ui');
const read = name => fs.readFileSync(path.join(ui, name), 'utf8');
const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
// Line comments are removed before scanning for creation sites so a <details>
// mentioned in prose (e.g. composer-help.js) is not counted as one. URL
// schemes ("https://") keep their // intact.
const stripLineComments = source => source.split('\n').map(line => line.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

test('static census: every <details> in index.html carries the .disclosure class', () => {
  const index = read('index.html');
  const tags = [...index.matchAll(/<details\b[^>]*>/g)].map(match => match[0]);
  // Task 4's grep census: 50 static folds. New folds must take the class, so
  // the floor stays honest in both directions.
  assert.ok(tags.length >= 50, `Task 4 counted 50 static folds — index.html now has ${tags.length}`);
  const missing = tags.filter(tag => !/ class="[^"]*\bdisclosure\b[^"]*"/.test(tag));
  assert.deepEqual(missing, [], 'static <details> without .disclosure');
});

test('dynamic renderers: every <details> creation site in ui/*.js sets the class', () => {
  const files = fs.readdirSync(ui).filter(name => name.endsWith('.js')).sort();
  const creation = /(?:\bnode|\bmake|\btext)\(\s*'details'|document\.createElement\(\s*'details'\s*\)|<details[\s>]/g;
  let total = 0;
  const missing = [];
  for (const name of files) {
    const source = stripLineComments(read(name));
    for (const match of source.matchAll(creation)) {
      total++;
      // The class must appear within a short window of the creation itself —
      // node('details', …, '… disclosure'), a className assignment right after
      // createElement, or class="disclosure" in a template string.
      const window = source.slice(match.index, match.index + 120);
      if (!/\bdisclosure\b/.test(window)) missing.push(`${name}: …${source.slice(match.index, match.index + 90)}…`);
    }
  }
  // Task 4's grep census: 26 dynamic creation sites across ui/*.js
  // (app 8, approvals 3, live-work 3, planning 3, history 2, workspace 1,
  // idea-refinement 1, request-log-view 1, deployment 1, deployment-setup 1,
  // project-settings 1, server 1).
  assert.ok(total >= 26, `Task 4 counted 26 dynamic folds — the ui/*.js files now have ${total}`);
  assert.deepEqual(missing, [], 'dynamic <details> creation without .disclosure');
});

test('components.css is served by the harness protocol and linked last in index.html', () => {
  const { FILES, allowed } = require('../core/ui-assets.cjs');
  assert.ok(FILES.includes('components.css'), 'components.css has a manifest entry — no silent 404 from harness://');
  assert.equal(allowed('components.css'), true);
  assert.ok(fs.existsSync(path.join(ui, 'components.css')), 'components.css exists on disk');
  const index = read('index.html');
  const links = [...index.matchAll(/<link rel="stylesheet" href="([a-z0-9-]+\.css)">/g)].map(match => match[1]);
  assert.ok(links.includes('components.css'), 'components.css is linked in index.html');
  assert.equal(links.at(-1), 'components.css', 'the component sheet is last in the link order, so component contracts win source-order ties');
});

test('animation contract: interpolate-size + ::details-content + native fallback', () => {
  const css = strip(read('components.css'));
  assert.match(css, /:root\s*\{[^}]*interpolate-size:\s*allow-keywords/, 'interpolate-size is enabled on the sheet root');
  // The animated rules must sit behind a feature gate: without BOTH features
  // the folds keep native behavior — no clipped content, no JS shim.
  const gate = /@supports \(interpolate-size: allow-keywords\) and selector\(::details-content\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(gate, 'the animation block is gated on interpolate-size AND ::details-content');
  const gated = gate[1];
  assert.match(gated, /::details-content\s*\{[^}]*block-size:\s*0/, 'the closed region starts at block-size 0');
  assert.match(gated, /::details-content\s*\{[^}]*overflow:\s*clip/, 'the collapsing region clips its content');
  assert.match(gated, /transition:[^;]*block-size[^;]*var\(--aura-transition-duration\)[^;]*var\(--aura-ease-in-out\)/, 'block-size animates with the token duration and curve');
  assert.match(gated, /content-visibility[^;]*allow-discrete/, 'content-visibility flips discretely so it stays visible through the close animation');
  assert.match(gated, /\[open\]::details-content\s*\{\s*block-size:\s*auto/, 'the open region is content-sized (block-size: auto)');
  assert.ok(!/\[open\][^{}]*min-height/.test(gated), 'the open fold has no empty minimum height');
  // Opening must not race text reads: transitions come from the after-change
  // style, so the [open] rule transitioning block-size ONLY makes
  // content-visibility flip to visible in the same style recalc as the click.
  // (Native details does the same; a transitioned flip would leave innerText
  // empty for a frame — scripts and a11y trees must be correct immediately.)
  const openRule = /details\.disclosure\[open\]::details-content\s*\{([^}]*)\}/.exec(gated);
  assert.ok(openRule, 'the open region rule exists inside the gate');
  assert.ok(!/content-visibility/.test(openRule[1]), 'the open after-change style transitions block-size only — content-visibility flips immediately on open');
  assert.match(gated, /::details-content\s*\{[^}]*transition:[^;]*content-visibility[^;]*allow-discrete/, 'the closed after-change style still delays the content-visibility flip until the collapse has finished');
});

test('summary contract: 13px ink on a 32px row, chevron, marker removal, note slot', () => {
  const css = strip(read('components.css'));
  const summary = /details\.disclosure > summary\s*\{([^}]*)\}/.exec(css);
  assert.ok(summary, 'the summary rule exists');
  assert.match(summary[1], /font-size:\s*13px/, '13px text (not the old 12px)');
  assert.match(summary[1], /color:\s*var\(--aura-ink\)/, 'ink color, not muted');
  assert.match(summary[1], /font-weight:\s*550/, 'medium weight');
  assert.match(summary[1], /min-height:\s*32px/, 'at least a 32px click row');
  assert.match(summary[1], /display:\s*flex/, 'flex-centered row');
  assert.match(summary[1], /list-style:\s*none/, 'no native list marker');
  assert.match(css, /details\.disclosure > summary::-webkit-details-marker\s*\{[^}]*display:\s*none/, 'the WebKit triangle is removed');
  // Chevron: temporary inline SVG (masked so it follows currentColor), rotating
  // on open. Task 8 replaces it centrally through the shared icon system.
  const chevron = /details\.disclosure > summary::after\s*\{([^}]*)\}/.exec(css);
  assert.ok(chevron, 'the chevron rule exists');
  assert.match(chevron[1], /width:\s*16px/, '16px chevron');
  assert.match(chevron[1], /height:\s*16px/, '16px chevron');
  assert.match(chevron[1], /background-color:\s*currentColor/, 'the chevron follows the summary color');
  assert.match(chevron[1], /mask:\s*url\("data:image\/svg\+xml/, 'inline SVG');
  assert.match(chevron[1], /transition:[^}]*rotate[^}]*var\(--aura-transition-duration\)/, 'rotation uses the token duration');
  assert.match(css, /details\.disclosure\[open\] > summary::after\s*\{[^}]*rotate:\s*180deg/, 'the chevron flips on [open]');
  assert.match(read('components.css'), /Task 8/, 'the comment hands the chevron to the Task 8 icon system');
  // Focus ring: the global :where ring in styles.css gives every summary a
  // 3px token-accent outline (3:1 against both surfaces) — the component keeps
  // that single ring instead of inventing a second.
  assert.match(strip(read('styles.css')), /:where\(button, input, textarea, select, summary, \[tabindex\]\):focus-visible\s*\{[^}]*outline:\s*3px solid var\(--accent\)/, 'the shared focus ring covers summaries');
  // Optional right-aligned note slot ("3 valgt") — CSS only; later slices set content.
  assert.match(css, /details\.disclosure > summary > \[data-summary-note\]\s*\{[^}]*margin-left:\s*auto/, 'the note slot exists');
});

test('reduced motion: the fold region has its own kill — the global one does not match ::details-content', () => {
  const css = strip(read('components.css'));
  const styles = strip(read('styles.css'));
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*\*, \*::before, \*::after\s*\{[^}]*transition:\s*none !important/, 'styles.css keeps the global reduced-motion kill');
  // ::details-content is its own pseudo-element: neither *, *::before nor *::after
  // matches it, so the component sheet must kill the transition itself.
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?details\.disclosure::details-content\s*\{[^}]*transition:\s*none !important/, '::details-content is explicitly killed under reduced motion (manually verified in Electron both ways)');
});
