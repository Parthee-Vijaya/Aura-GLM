// The profile icon set is one source for the onboarding picker, the sidebar
// and the settings dialog: three Aura-mark line variants (core/profile.cjs
// validates the same ids, and the test suite asserts the two lists stay
// identical) plus the initials fallback and the stored avatar. The profile is
// pure UI state: names, icons and pictures never reach prompts, the model log
// or diagnostics. The glyphs are original stroke drawings in the DSH language
// (24x24 viewBox, 1.5px strokes, round caps, currentColor) inspired by the
// Aura mark: an open ring with its satellite dot (ui/onboarding-aura-mark.svg).
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (scope) scope.ProfileIcons = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const IDS = Object.freeze(['aura-1', 'aura-2', 'aura-3']);
  // Danish labels give the radio buttons an accessible name; 'upload' names
  // the stored avatar wherever it is shown (the picker slot and the chip).
  const LABELS = Object.freeze({ 'aura-1': 'Aura · ring', 'aura-2': 'Aura · bølge', 'aura-3': 'Aura · kredsløb', upload: 'Eget billede' });
  // The stored avatar is served by the app's own protocol under one fixed
  // name — no paths, no data URLs, nothing the renderer can point elsewhere.
  // The ?v= cache-buster carries the picture's own revision (the file's
  // mtime, handed over from every profile answer through setAvatarRevision):
  // Chromium may reuse a cached image even with no-store, so a new picture in
  // the same session needs a fresh URL. The value only changes when the file
  // does — upload and removal answer with a fresh revision — so the rest of
  // the session keeps the URL (and the browser's copy) stable.
  const AVATAR_SRC = 'avatar.png';
  let avatarRevision = 0;
  function setAvatarRevision(value) { if (Number.isFinite(value)) avatarRevision = Math.max(0, Math.trunc(value)); }
  function avatarImage() { return `<img src="${AVATAR_SRC}${avatarRevision > 0 ? `?v=${avatarRevision}` : ''}" alt="" draggable="false">`; }
  // A picture that fails to load (fx removed from another surface since the
  // last profile read) falls back to the initials — the same honest answer the
  // profile itself gives when the file is gone. The fallback is bound per
  // surface right after the markup lands; the CSP (script-src 'self') leaves
  // no room for an inline onerror in the img string itself.
  function attachAvatarFallback(container, name) {
    const img = typeof container?.querySelector === 'function' ? container.querySelector('img') : null;
    if (!img || typeof img.addEventListener !== 'function') return;
    img.addEventListener('error', () => {
      container.textContent = initials(name);
      container.title = 'Initialer';
    });
  }
  // Stroke glyphs in the Aura design language, drawn from the Aura mark:
  // ring + satellite, ring + wave through the middle, layered orbits.
  const GLYPHS = Object.freeze({
    'aura-1': '<path d="M15.8 5.4A7.6 7.6 0 1 1 8.2 5.4"/><circle cx="12" cy="3.8" r="1.5" fill="currentColor" stroke="none"/>',
    'aura-2': '<path d="M15.8 5.4A7.6 7.6 0 1 1 8.2 5.4"/><path d="M6.1 12.3c1-2 2-2 3 0c1 2 2 2 3 0c1-2 2-2 3 0c1 2 2 2 3 0"/>',
    'aura-3': '<path d="M16 5A8.1 8.1 0 1 1 8 5"/><path d="M7.1 12A4.9 4.9 0 0 1 16.9 12"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
    // The upload slot's action glyph — a picture, not a profile choice.
    upload: '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="9.5" r="1.7"/><path d="m5.5 17.5 4-4 2.8 2.8 3.2-3.2 3 3"/>'
  });
  // The avatar <img> markup: same fixed source everywhere it is displayed.
  function svg(id) {
    if (typeof id !== 'string' || !Object.hasOwn(GLYPHS, id)) return '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${GLYPHS[id]}</svg>`;
  }
  // The fallback mark when no icon is chosen: the first letters of the first
  // two words, or of the single name, uppercased per Danish rules (Æ, Ø, Å).
  function initials(name) {
    const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    const first = words[0].charAt(0);
    const second = words.length > 1 ? words[1].charAt(0) : words[0].charAt(1);
    return (first + second).toLocaleUpperCase('da');
  }
  return Object.freeze({ IDS, LABELS, svg, avatarImage, attachAvatarFallback, setAvatarRevision, initials });
});
