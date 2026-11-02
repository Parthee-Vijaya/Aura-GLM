// SPDX-License-Identifier: EUPL-1.2
// The on-demand help at help level 'delvis': a quiet "?" button by the
// composer opens the current surface's standing hints in a small popover.
// 'fuld' keeps the hints standing and never shows the button (that is CSS's
// business through the body classes); 'ingen' shows no help affordance at
// all. The popover always reads the hint texts from the live DOM — the hints
// have one source (index.html), so the popover can never drift from the real
// copy. A surface without hints hides the button honestly through the hidden
// attribute: a disabled or aria-hidden button would still stand visible and
// focusable with nothing to offer.
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.composerHelp = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const document = root.document;
  const button = document?.getElementById?.('composer-help');
  const popover = document?.getElementById?.('composer-help-popover');
  const list = document?.getElementById?.('composer-help-list');
  if (!button || !popover || !list) return Object.freeze({ hints: () => [], refresh() {}, open() {}, close() {} });

  // A hint stands on the surface when nothing on its ancestor chain carries
  // the hidden attribute. The <details> open state does not gate membership:
  // at 'delvis' the hint is hidden everywhere by CSS, so the popover is its
  // only home — opening or closing a details must not change what the "?" can
  // answer. The help-level CSS hiding does not count either: the popover
  // lists the hints that would otherwise show, not the ones still visible.
  function stands(element) {
    for (let node = element; node; node = node.parentElement) if (node.hidden === true) return false;
    return true;
  }
  // A hint's text without its "i" affordance buttons: the button label ("i")
  // is not part of the hint, so the copy is read from a clone with every .info
  // element stripped. Clone-free surfaces (no buttons) answer unchanged.
  function hintText(element) {
    if (!element) return '';
    const copy = element.cloneNode(true);
    for (const info of copy.querySelectorAll('.info')) info.remove();
    return String(copy.textContent).trim();
  }
  // The designated hint targets — the same three the help-level CSS hides.
  // The texts are read live, so the copy has exactly one source.
  function hints() {
    const texts = [];
    const add = element => { if (element && stands(element)) texts.push(hintText(element)); };
    add(document.getElementById('composer-shortcut'));
    const resume = document.getElementById('resume-notice');
    if (resume) add(resume.querySelector('.hint'));
    const options = document.getElementById('idea-options');
    if (options) for (const hint of options.querySelectorAll('.hint')) add(hint);
    return texts;
  }
  // The button only stands where it has something to show. Which level shows
  // it at all is CSS's business (help-delvis shows it, help-ingen does not);
  // hidden here means "this surface has no hints", and it is recomputed on
  // every profile event and right before each open.
  function refresh() {
    button.hidden = hints().length === 0;
    return button.hidden;
  }
  function expanded(on) { button.setAttribute('aria-expanded', String(on)); }
  function render() {
    list.replaceChildren(...hints().map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
  }
  let openState = false;
  // In the top layer the popover's containing block is the viewport, so the
  // anchor is computed from the button's viewport rectangle — the same way the
  // composer's mode menu positions itself. Without rectangle support (the
  // synthetic DOM) the popover simply keeps its default centered position.
  function position() {
    if (typeof button.getBoundingClientRect !== 'function' || typeof root.innerWidth !== 'number') return;
    const anchor = button.getBoundingClientRect();
    const width = Math.min(360, root.innerWidth - 24);
    const height = popover.offsetHeight || 0;
    popover.style.left = `${Math.max(8, Math.min(anchor.left, root.innerWidth - width - 8))}px`;
    popover.style.top = `${Math.max(8, anchor.top - height - 8)}px`;
  }
  function open() {
    refresh();
    if (button.hidden) return false;
    render();
    popover.showPopover();
    openState = true;
    expanded(true);
    position();
    // Focus moves into the popover (tabindex="-1"), so keyboard users land
    // on the help text and Escape has an anchor inside to close from.
    popover.focus();
    return true;
  }
  function close({ restoreFocus = true } = {}) {
    popover.hidePopover();
    openState = false;
    expanded(false);
    if (restoreFocus) button.focus();
  }
  // The button is the popover's native invoker (popovertarget in index.html):
  // the browser opens and closes it on clicks and keys, and the invoker is
  // exempt from light dismiss — a second "?" click closes the popover instead
  // of pointerdown's light dismiss closing it and the click re-opening it.
  // The toggle event is where the native path lands: the content, position,
  // focus and the honest aria state are applied here. open() has already done
  // the work on the programmatic path (openState guards the double pass — the
  // browser's toggle lands as a later task).
  popover.addEventListener('toggle', event => {
    if (event?.newState === 'open') {
      if (openState) return;
      openState = true;
      expanded(true);
      render();
      position();
      popover.focus();
    } else { openState = false; expanded(false); }
  });
  // Escape closes from inside the popover and returns focus to the button.
  popover.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  // An open popover re-anchors when its ground moves: a window resize and a
  // profile zoom step both change the button's rectangle and the viewport
  // (Chromium fires resize for a zoom change as well), so the position is
  // recomputed while the popover stands open. The profile events are the
  // belt-and-braces for a zoom step whose resize notification races the
  // event; recomputing beats closing, because the help stays where it was
  // asked for.
  root.addEventListener?.('resize', () => { if (openState) position(); });
  // The startup read and every save from any writer re-check the surface.
  for (const type of ['aura:profile', 'aura:profile-saved']) root.addEventListener?.(type, () => { refresh(); if (openState) position(); });
  refresh();
  return Object.freeze({ hints, refresh, open, close });
});
