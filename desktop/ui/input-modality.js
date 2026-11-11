// SPDX-License-Identifier: EUPL-1.2
// Publishes how the user is currently driving the app, so focus rings on
// buttons, tabs and rows appear for keyboard use and stay quiet after a click.
// Loaded without defer: the very first interaction is already classified.
// Text fields are unaffected (aura-tokens.css keeps their focus feedback).
(() => {
  const root = document.documentElement;
  const set = value => { if (root.dataset.inputModality !== value) root.dataset.inputModality = value; };
  // Modifier keys alone do not show intent to navigate by keyboard.
  const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);
  addEventListener('keydown', event => { if (!MODIFIERS.has(event.key)) set('keyboard'); }, true);
  addEventListener('pointerdown', () => set('pointer'), true);
})();
