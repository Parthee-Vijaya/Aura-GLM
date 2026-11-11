// SPDX-License-Identifier: EUPL-1.2
// Publishes how the user is currently driving the app, so focus rings on
// buttons, tabs and rows appear for keyboard navigation and stay quiet after a
// click. Loaded without defer: the very first interaction is already classified.
// Text fields keep their own focus feedback (aura-tokens.css).
(() => {
  const root = document.documentElement;
  const set = value => { if (root.dataset.inputModality !== value) root.dataset.inputModality = value; };
  // Modifier keys alone do not show intent to navigate by keyboard.
  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);
  const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);
  // Typing into a text field is writing, not navigating: only Tab counts there.
  const typing = target => Boolean(target) && (target.isContentEditable === true || target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' && !NOT_TEXT.has(target.type));
  addEventListener('keydown', event => {
    if (MODIFIERS.has(event.key) || event.key !== 'Tab' && typing(event.target)) return;
    set('keyboard');
  }, true);
  addEventListener('pointerdown', () => set('pointer'), true);
})();
