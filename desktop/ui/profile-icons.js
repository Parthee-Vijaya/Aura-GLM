// The profile icon set is one source for the onboarding picker, the sidebar
// and the settings dialog. The glyph ids duplicate Profile.ICON_IDS from
// core/profile.cjs; the core module validates every saved icon id, and the
// test suite asserts the two lists stay identical. The profile itself is pure
// UI state: names and icons never reach prompts, the model log or diagnostics.
(function (scope, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (scope) scope.ProfileIcons = api;
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';
  const IDS = Object.freeze(['star', 'bolt', 'leaf', 'moon', 'box', 'bird', 'wave', 'compass', 'flame', 'heart', 'cube', 'spark']);
  // Danish labels give the radio buttons an accessible name.
  const LABELS = Object.freeze({
    star: 'Stjerne', bolt: 'Lyn', leaf: 'Blad', moon: 'Måne', box: 'Kasse', bird: 'Fugl',
    wave: 'Bølge', compass: 'Kompas', flame: 'Flamme', heart: 'Hjerte', cube: 'Terning', spark: 'Glimt'
  });
  // Stroke glyphs in the Aura design language: 24x24 viewBox, 1.5px strokes,
  // round caps and joins, no fill — colour always follows currentColor.
  const GLYPHS = Object.freeze({
    star: '<path d="M12 3 14.2 8.9 20.6 9.2 15.6 13.2 17.3 19.3 12 15.8 6.7 19.3 8.4 13.2 3.4 9.2 9.8 8.9Z"/>',
    bolt: '<path d="M13 2.8 4.8 13.4h5.7l-.9 7.8 8.2-10.6h-5.7Z"/>',
    leaf: '<path d="M11 20a7 7 0 0 1-1.2-13.9C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c.3-3 2.1-5.3 5.1-6C9.5 14.5 12 13 13 12"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    box: '<path d="M3.5 5.5h17v4h-17Z"/><path d="M5.5 9.5v9.5h13V9.5"/><path d="M10 13.5h4"/>',
    bird: '<path d="M16 7h.01"/><path d="M3.4 18H6a2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h1.5a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h2.6"/><path d="M18 8c1.5-2 3-2 4-2-.5 2-2 3-4 3"/><path d="M21.5 12.5c-1 1.5-3 3-7 3"/>',
    wave: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.4-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.4-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.4-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    compass: '<circle cx="12" cy="12" r="9.2"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3Z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
    heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z"/>',
    cube: '<path d="M3.5 8 12 3.2 20.5 8v8L12 20.8 3.5 16Z"/><path d="M3.5 8 12 12.5 20.5 8"/><path d="M12 12.5v8.3"/>',
    spark: '<path d="M12 3.2 13.9 9l5.9 1.9L13.9 13 12 18.8 10.1 13l-5.9-2.1L10.1 9Z"/>'
  });
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
  return Object.freeze({ IDS, LABELS, svg, initials });
});
