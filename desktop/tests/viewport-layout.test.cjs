// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Responsive panel layout (UI/UX overhaul slice 2, docs/uiux-overhaul-design.md
// "Kernetal" bullet 2, "Skiver" #2): the panel-open chat column scales with
// the viewport — clamp(360px, 54%, 880px) as the CSS fallback — while a
// user-chosen width, persisted in harness-workspace-layout-v1, always wins.
// The pins cover both sides of the contract: the stylesheet that renders a
// fresh install, and the module that must not freeze that default with an
// inline --chat-width (inline style beats the CSS fallback, so an
// unconditional init write would defeat the clamp at every screen size).
const ui = path.join(__dirname, '..', 'ui');
const stylesCss = fs.readFileSync(path.join(ui, 'styles.css'), 'utf8');
const calmCss = fs.readFileSync(path.join(ui, 'workspace-calm.css'), 'utf8');
const viewportSource = fs.readFileSync(path.join(ui, 'viewport.js'), 'utf8');

const strip = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Every `{ … }` body whose selector is exactly `selector` — the repo's
// CSS-parse pattern from ui-frame.test.cjs (exact-selector match, so a
// `.work-grid` lookup never matches a longer selector that contains the text).
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
  const clean = strip(declarations).replace(/\s+/g, ' ');
  const match = new RegExp(`(?:^|[{;]\\s*)${property}\\s*:\\s*([^;}]+)`).exec(clean);
  return match ? match[1].trim() : null;
}

// The clamp a fresh install renders, mirrored in JS for the divider's
// announced value: 54% of the grid's content box, floored at 360 and capped
// at 880 — the same numbers styles.css's fallback must carry.
const fluidAt = width => Math.round(Math.min(880, Math.max(360, width * 0.54)));

// ── Synthetic DOM for the whole viewport.js IIFE ──
// The width contract lives in the IIFE's wiring (init, storage load, drag and
// keyboard handlers, ResizeObservers), so the whole module runs in a vm — the
// same renderer-code approach as profile-consumption.test.cjs, but without
// slicing: every inline style write and every localStorage save is observable.
function makeNode(id) {
  const node = {
    id, attributes: new Map(), dataset: {}, listeners: {},
    clientWidth: 0, clientHeight: 0, value: '', hidden: false, disabled: false,
    inline: [], // [property, value] pairs written through style.setProperty
    setAttribute(name, value) { node.attributes.set(name, String(value)); },
    getAttribute(name) { return node.attributes.has(name) ? node.attributes.get(name) : null; },
    addEventListener(name, handler) { (node.listeners[name] ||= []).push(handler); },
    focus() {}, setPointerCapture() {}, releasePointerCapture() {},
    checkValidity: () => true,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: node.clientWidth, height: node.clientHeight }),
    querySelectorAll: () => [],
  };
  node.removed = [];
  node.style = {
    setProperty(name, value) { node.inline.push([name, value]); },
    removeProperty(name) { node.removed.push(name); },
  };
  return node;
}

function runViewport({ saved = null, gridWidth = 1400, surfaceWidth = 800, surfaceHeight = 600 } = {}) {
  const storageKey = 'harness-workspace-layout-v1';
  const storage = new Map(saved ? [[storageKey, JSON.stringify(saved)]] : []);
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, makeNode(id)); return nodes.get(id); };
  const grid = makeNode('work-grid'); grid.clientWidth = gridWidth;
  const surface = node('preview-surface'); surface.clientWidth = surfaceWidth; surface.clientHeight = surfaceHeight;
  const buttons = ['fluid', 'desktop', 'tablet', 'phone'].map(name => {
    const button = makeNode(`viewport-icon-${name}`); button.dataset.preset = name; return button;
  });
  node('viewport-preset').querySelectorAll = selector => selector === '.viewport-icon' ? buttons : [];
  const observers = [];
  const windowObj = { listeners: {}, addEventListener(name, handler) { (windowObj.listeners[name] ||= []).push(handler); } };
  const classes = new Set();
  const context = {
    document: {
      body: { classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) } },
      getElementById: node,
      querySelector: selector => selector === '.work-grid' ? grid : null,
    },
    window: windowObj,
    localStorage: {
      getItem: key => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    ResizeObserver: class {
      constructor(callback) { this.callback = callback; observers.push(this); }
      observe(target) { this.target = target; }
      unobserve() {} disconnect() {}
    },
  };
  vm.runInNewContext(viewportSource, context);
  return {
    grid, divider: node('workspace-divider'), buttons, classes, storage, windowObj, node,
    savedJson: () => JSON.parse(storage.get(storageKey) || 'null'),
    inlineChatWidths: () => grid.inline.filter(([name]) => name === '--chat-width'),
    resizeGrid(width) { grid.clientWidth = width; for (const observer of observers) if (observer.target === grid) observer.callback(); },
  };
}
const fire = (node, name, event = {}) => { for (const handler of node.listeners[name] || []) handler(event); };
const dragTo = (fixture, width) => {
  fire(fixture.divider, 'pointerdown', { button: 0, pointerId: 4, preventDefault() {} });
  fire(fixture.divider, 'pointermove', { pointerId: 4, clientX: width + 3.5 });
  fire(fixture.divider, 'pointerup', { pointerId: 4 });
};

// (a) The stylesheet carries the responsive default: the grid rule's fallback
// is the clamp, the fixed 420px fallback is gone everywhere, and the
// closed-panel rule keeps its own single-column layout.
test('styles.css: the panel-open chat column starts at the viewport clamp; the fixed 420px fallback is gone', () => {
  const grid = declarationsOf(calmCss, '.workspace-calm .work-grid');
  assert.ok(grid.length >= 1, 'the .work-grid rule exists');
  assert.equal(declaration(grid[0], 'grid-template-columns').replace(/\s/g, ''), 'var(--chat-width,clamp(360px,54%,880px))7pxminmax(0,1fr)', 'fresh installs render the clamp (360-880px, 54% of the grid)');
  assert.ok(!stylesCss.includes('var(--chat-width, 420px)'), 'no rule keeps the fixed 420px fallback');
  const closed = declarationsOf(calmCss, '.workspace-calm .work-grid[data-surface="off"]');
  assert.equal(declaration(closed[0], 'grid-template-columns').replace(/\s/g, ''), 'minmax(0,1fr)', 'the closed-panel grid keeps its single column');
});

// (b) No inline value without a choice: a fresh install leaves --chat-width to
// the stylesheet (no inline write at init, none on resize), while the divider
// still announces the width the clamp actually rendered.
test('viewport.js: a fresh install writes no inline --chat-width — the divider announces the clamp', () => {
  const f = runViewport({ gridWidth: 1400 });
  assert.deepEqual(f.inlineChatWidths(), [], 'init writes no inline --chat-width — the CSS clamp renders on its own');
  assert.equal(f.divider.getAttribute('aria-valuenow'), String(fluidAt(1400)), 'the announced value follows the responsive chat column');
  assert.equal(f.divider.getAttribute('aria-valuemin'), '280', 'the drag floor is still 280px');
  assert.equal(f.divider.getAttribute('aria-valuemax'), String(1400 - 307), 'the drag ceiling is still grid minus 307px');
  assert.equal(f.divider.getAttribute('aria-valuetext'), `${fluidAt(1400)} pixels til samtalen`, 'the announced text format is unchanged');
  assert.equal(f.savedJson(), null, 'init persists nothing');
});

test('viewport.js: window resizes keep the clamp alive — no frozen inline width mid-session', () => {
  const f = runViewport({ gridWidth: 1400 });
  f.resizeGrid(2400);
  assert.deepEqual(f.inlineChatWidths(), [], 'a resize still writes no inline value');
  assert.equal(f.divider.getAttribute('aria-valuenow'), String(fluidAt(2400)), 'a wide grid reaches the 880px cap');
  f.resizeGrid(800);
  assert.equal(f.divider.getAttribute('aria-valuenow'), String(fluidAt(800)), 'a narrow grid follows the responsive default');
  assert.deepEqual(f.inlineChatWidths(), [], 'the column follows the viewport, not a frozen pixel count');
  assert.equal(f.savedJson(), null, 'resizes persist nothing');
});

// (c) A saved width always wins: applied (clamped to grid−307 as today) at
// startup, re-clamped when the window shrinks, restored when space returns.
test('viewport.js: a saved width wins — applied clamped at startup and on resizes', () => {
  const f = runViewport({ saved: { chat: 500 }, gridWidth: 1400 });
  assert.deepEqual(f.inlineChatWidths(), [['--chat-width', '500px']], 'a saved width is written inline at init');
  assert.equal(f.divider.getAttribute('aria-valuenow'), '500');
  f.resizeGrid(700);
  assert.deepEqual(f.inlineChatWidths().at(-1), ['--chat-width', `${700 - 307}px`], 'a shrinking window re-clamps the saved width');
  f.resizeGrid(1400);
  assert.deepEqual(f.inlineChatWidths().at(-1), ['--chat-width', '500px'], 'the saved width returns when space does');
  const oversized = runViewport({ saved: { chat: 2000 }, gridWidth: 1000 });
  assert.deepEqual(oversized.inlineChatWidths(), [['--chat-width', `${1000 - 307}px`]], 'a saved width above the ceiling applies clamped, as today');
  const undersized = runViewport({ saved: { chat: 100 }, gridWidth: 1400 });
  assert.deepEqual(undersized.inlineChatWidths(), [['--chat-width', '280px']], 'a saved width below the floor applies as 280px, as today');
});

test('viewport.js: the first drag chooses and persists a width — a restart applies it', () => {
  const f = runViewport({ gridWidth: 1400 });
  fire(f.divider, 'pointerdown', { button: 0, pointerId: 4, preventDefault() {} });
  assert.ok(f.classes.has('resizing-workspace'), 'the drag flow still flags the body');
  fire(f.divider, 'pointermove', { pointerId: 4, clientX: 563.5 });
  assert.deepEqual(f.inlineChatWidths(), [['--chat-width', '560px']], 'dragging writes the chosen width inline');
  fire(f.divider, 'pointerup', { pointerId: 4 });
  assert.ok(!f.classes.has('resizing-workspace'), 'the flag leaves with the drag');
  assert.equal(f.savedJson()?.chat, 560, 'the drag persists the chosen width');
  const restart = runViewport({ saved: f.savedJson(), gridWidth: 1400 });
  assert.deepEqual(restart.inlineChatWidths(), [['--chat-width', '560px']], 'a restart applies the saved width from the first paint');
  assert.equal(restart.divider.getAttribute('aria-valuenow'), '560');
});

test('viewport.js: Home resets to 280 and arrow keys step from the clamp — both persist as today', () => {
  const home = runViewport({ gridWidth: 1400 });
  fire(home.divider, 'keydown', { key: 'Home', shiftKey: false, preventDefault() {} });
  assert.deepEqual(home.inlineChatWidths(), [['--chat-width', '280px']], 'Home resets to the 280px floor');
  assert.equal(home.divider.getAttribute('aria-valuenow'), '280');
  assert.equal(home.savedJson()?.chat, 280, 'the reset persists');
  const arrow = runViewport({ gridWidth: 1400 });
  fire(arrow.divider, 'keydown', { key: 'ArrowRight', shiftKey: false, preventDefault() {} });
  assert.deepEqual(arrow.inlineChatWidths(), [['--chat-width', `${fluidAt(1400) + 10}px`],], 'an arrow key steps from the clamp the grid actually rendered');
  assert.equal(arrow.savedJson()?.chat, fluidAt(1400) + 10, 'the stepped width persists');
  const end = runViewport({ gridWidth: 1400 });
  fire(end.divider, 'keydown', { key: 'End', shiftKey: false, preventDefault() {} });
  assert.deepEqual(end.inlineChatWidths(), [['--chat-width', `${1400 - 307}px`]], 'End still jumps to the ceiling');
});

test('viewport.js: double-click restores responsive sizing and preserves other layout preferences', () => {
  const f = runViewport({ saved: { chat: 560, sidebar: 300, preset: 'phone', width: 390, height: 844 }, gridWidth: 1400 });
  fire(f.divider, 'dblclick');
  assert.deepEqual(f.grid.removed, ['--chat-width'], 'reset removes the inline override');
  assert.equal(f.divider.getAttribute('aria-valuenow'), String(fluidAt(1400)));
  assert.equal(f.savedJson()?.chat, undefined, 'reset removes the persisted manual width');
  assert.equal(f.savedJson()?.sidebar, 300, 'the sibling sidebar preference survives');
  assert.equal(f.savedJson()?.preset, 'phone', 'the preview selection survives');
  f.resizeGrid(2400);
  assert.equal(f.divider.getAttribute('aria-valuenow'), String(fluidAt(2400)), 'resizing follows the responsive width after reset');
  const restart = runViewport({ saved: f.savedJson(), gridWidth: 2400 });
  assert.deepEqual(restart.inlineChatWidths(), [], 'restart leaves the responsive width to CSS');
  assert.equal(restart.divider.getAttribute('aria-valuenow'), String(fluidAt(2400)));
});

// The preview viewport sizes are viewport.js's other job: presets keep
// working, and their saves must not smuggle a chat width along — a fresh user
// who only changes the preview keeps the responsive column across restarts.
test('viewport.js: preview presets keep working and save no chat width until one is chosen', () => {
  const f = runViewport({ gridWidth: 1400 });
  assert.deepEqual(JSON.parse(JSON.stringify(f.windowObj.previewViewSize())), { width: 800, height: 600 }, 'fluid mode reports the surface size');
  const desktop = f.buttons.find(button => button.dataset.preset === 'desktop');
  for (const handler of desktop.listeners.click) handler();
  assert.equal(f.savedJson()?.chat, undefined, 'a preset click saves no chat width');
  assert.equal(f.savedJson()?.preset, 'desktop', 'the preset itself saves');
  assert.deepEqual(JSON.parse(JSON.stringify(f.windowObj.previewViewSize())), { width: 1920, height: 1080 }, 'the preset still drives the preview size');
  const restart = runViewport({ saved: f.savedJson(), gridWidth: 1400 });
  assert.deepEqual(restart.inlineChatWidths(), [], 'after a preset-only save, a restart still renders the clamp');
  assert.equal(restart.divider.getAttribute('aria-valuenow'), String(fluidAt(1400)), 'and the divider still announces it');
  assert.equal(typeof f.windowObj.previewLayout, 'function', 'the preview layout hook stays exposed');
});
