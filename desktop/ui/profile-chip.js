// SPDX-License-Identifier: EUPL-1.2
// The sidebar's profile chip — the smallest honest display of the profile: the
// chosen icon, or the initials fallback, plus the name. It follows the profile
// events (the startup read and every save from any writer) and opens the
// profile section of the settings dialog. The profile is pure UI state: the
// chip shows it locally, and name and icon never reach prompts or servers.
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.profileChip = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const document = root.document;
  const chip = document?.getElementById?.('profile-chip');
  if (!chip) return Object.freeze({ render() {} });
  const mark = document.getElementById('profile-chip-mark');
  const name = document.getElementById('profile-chip-name');
  function render(profile) {
    const icon = typeof profile?.icon === 'string' && (root.ProfileIcons?.IDS?.includes(profile.icon) || profile.icon === 'upload') ? profile.icon : '';
    const text = typeof profile?.name === 'string' ? profile.name : '';
    // An empty local profile still needs a discoverable settings entry.
    // The person glyph is an affordance, never a saved icon or identity.
    if (!icon && !text.trim()) {
      mark.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
      mark.removeAttribute('title');
      name.textContent = 'Lokal profil';
      chip.setAttribute('aria-label', 'Lokal profil og indstillinger');
      chip.title = 'Lokal profil og indstillinger';
      chip.hidden = false;
      return chip;
    }
    if (icon === 'upload') { mark.innerHTML = root.ProfileIcons.avatarImage(); root.ProfileIcons.attachAvatarFallback(mark, text); mark.title = 'Eget billede'; }
    else if (icon) { mark.innerHTML = root.ProfileIcons.svg(icon); mark.removeAttribute('title'); }
    else { mark.innerHTML = ''; mark.textContent = root.ProfileIcons.initials(text); mark.title = 'Initialer'; }
    name.textContent = text;
    chip.setAttribute('aria-label', `Din profil${text ? `: ${text}` : icon ? `: ${root.ProfileIcons.LABELS[icon]}` : ''}`);
    chip.title = text || root.ProfileIcons.LABELS[icon] || '';
    chip.hidden = false;
    return chip;
  }
  // The startup read and every successful save carry the canonical profile.
  for (const type of ['aura:profile', 'aura:profile-saved']) root.addEventListener(type, event => { render(event.detail); });
  chip.addEventListener('click', () => { try { root.SettingsDialog?.open?.('profile'); } catch { /* uden en dialog åbner klikket intet */ } });
  render({});
  return Object.freeze({ render });
});
