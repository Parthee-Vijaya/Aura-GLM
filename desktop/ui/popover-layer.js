// SPDX-License-Identifier: EUPL-1.2
// The one anchored popover layer (UI/UX overhaul, D2+D3 Commit A).
//
// Every menu that hangs off an invoker — the model picker, the work-mode
// menu, the ⓘ info bubble, the "?" help popover and the hero's chip menus —
// anchors through this module. The menus stay native [popover] elements in
// the top layer (light dismiss and the Escape close watcher come from the
// browser); this layer owns placement only: it computes a position: fixed
// rectangle from the invoker's live getBoundingClientRect and repositions
// while the layer stands open.
//
// Why JS anchoring and not CSS anchor positioning: the app already has three
// hand-rolled positioners (model picker, mode menu, info bubble) whose menus
// need JS-side content sync anyway, and one mechanism that reads the live
// rect covers the profile zoom steps for free — getBoundingClientRect(),
// innerWidth and innerHeight all live in CSS-pixel space, so a font-size step
// (webContents zoomFactor) needs no compensation factor; Chromium fires
// `resize` when the factor changes, and the profile events are the belt for
// a zoom step whose resize races (the same contract settings-fontsize pins
// for viewport.js). CSS anchor positioning (Chromium 125+) would move the
// math into the stylesheet, but the codebase's menus would still need the
// JS sync pass, so the single JS layer was the smaller, more testable step.
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.PopoverLayer = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const document = root.document;
  if (!document || typeof document.addEventListener !== 'function') return Object.freeze({ open() { return false; }, close() {}, position() {} });

  let current = null;

  const number = (value, fallback) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; };
  function viewport() { return { width: number(root.innerWidth, 0), height: number(root.innerHeight, 0) }; }

  // Placement reads the LIVE rects: nothing is cached between frames, so a
  // moved invoker (resize, drag, zoom, scroll) is picked up by the next call.
  function place(state) {
    const { layer, invoker, options } = state;
    if (typeof invoker.getBoundingClientRect !== 'function' || typeof layer.getBoundingClientRect !== 'function') return;
    const anchor = invoker.getBoundingClientRect();
    const view = viewport();
    if (!view.width || !view.height) return;
    const margin = number(options.margin, 8), gap = number(options.gap, 8);
    const wanted = typeof options.width === 'function' ? number(options.width(), 0) : number(options.width, 0);
    const width = Math.max(0, Math.min(wanted || number(layer.offsetWidth, 0), view.width - margin * 2));
    if (width) { layer.style.width = `${Math.round(width)}px`; layer.style.maxWidth = `${Math.round(width)}px`; }
    const height = number(layer.offsetHeight, 0) || number(options.minHeight, 0);
    // Horizontal: the layer follows the invoker — start, end or center — and
    // clamps into the viewport. With align:'end' the layer's right edge rides
    // the invoker's right edge, so a menu on the composer never crosses the
    // workspace divider at any chat width: it moves with the column.
    let left = options.align === 'end' ? anchor.right - width
      : options.align === 'center' ? anchor.left + anchor.width / 2 - width / 2
      : anchor.left;
    left = Math.min(Math.max(margin, left), Math.max(margin, view.width - width - margin));
    // Vertical: 'above' (default) or 'below' preference, flipping to the
    // other side when there is no room; a layer that fits nowhere keeps the
    // viewport margin and lets its own overflow handle the rest.
    const above = anchor.top - height - gap, below = anchor.bottom + gap;
    let top;
    if (options.place === 'below') top = below + height <= view.height - margin ? below : above;
    else if (options.place === 'above') top = above >= margin ? above : below;
    else top = above >= margin ? above : (below + height <= view.height - margin ? below : Math.min(Math.max(margin, above), below));
    top = Math.min(Math.max(margin, top), Math.max(margin, view.height - height - margin));
    layer.style.left = `${Math.round(left)}px`;
    layer.style.top = `${Math.round(top)}px`;
  }

  function detach(state) {
    const { window: rootWindow, document: doc, handlers } = state;
    rootWindow.removeEventListener?.('resize', handlers.resize);
    doc.removeEventListener?.('scroll', handlers.scroll);
    for (const type of ['aura:profile', 'aura:profile-saved']) rootWindow.removeEventListener?.(type, handlers.profile);
    state.layer.removeEventListener?.('keydown', handlers.keydown);
    state.layer.removeEventListener?.('toggle', handlers.toggle);
  }

  function close({ focus = false } = {}) {
    const state = current; current = null;
    if (!state) return;
    detach(state);
    if (state.layer.hidePopover) state.layer.hidePopover();
    if (focus) state.invoker.focus?.();
  }

  function open(options = {}) {
    const { layer, invoker } = options;
    if (!layer || !invoker || typeof layer.showPopover !== 'function') return false;
    // One anchored layer at a time. A re-open of the layer that is already
    // current (the ⓘ bubble toggles between sources) swaps the listener set
    // without hiding; any other layer closes first. The pending toggle task
    // from an earlier hidePopover finds current gone and does nothing.
    if (current) {
      const previous = current; current = null; detach(previous);
      if (previous.layer !== layer) previous.layer.hidePopover?.();
    }
    const state = { layer, invoker, options, window: root, document, handlers: {} };
    current = state;
    // The browser owns dismissal (light dismiss, the Escape close watcher,
    // closing a second popover). This layer repositions while open and
    // returns focus to the invoker when it was the popover that had it.
    state.handlers.resize = () => current === state && place(state);
    state.handlers.scroll = () => current === state && place(state);
    state.handlers.profile = () => current === state && place(state);
    state.handlers.keydown = event => { if (event.key === 'Escape') { event.preventDefault?.(); close({ focus: true }); } };
    state.handlers.toggle = event => {
      if (event?.newState === 'closed' && current === state) {
        current = null; detach(state);
        // Light dismiss: focus stays where the user clicked. Only when the
        // focus sat inside the layer (or fell to the body) does it return.
        const active = docActive();
        if (active === docBody() || (active && state.layer.contains && state.layer.contains(active))) invoker.focus?.();
      }
    };
    root.addEventListener?.('resize', state.handlers.resize);
    document.addEventListener?.('scroll', state.handlers.scroll, { capture: true, passive: true });
    for (const type of ['aura:profile', 'aura:profile-saved']) root.addEventListener?.(type, state.handlers.profile);
    layer.addEventListener?.('keydown', state.handlers.keydown);
    layer.addEventListener?.('toggle', state.handlers.toggle);
    layer.showPopover();
    place(state);
    return true;
  }

  function docActive() { try { return document.activeElement; } catch { return null; } }
  function docBody() { try { return document.body; } catch { return null; } }

  function position() { if (current) place(current); }
  return Object.freeze({ open, close, position });
});
