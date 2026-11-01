// SPDX-License-Identifier: EUPL-1.2
// The unified settings dialog. One entry point, openSettings(section), routes
// to all settings surfaces: the inline sections (profile, appearance) render in
// #settings-dialog, while the four established dialogs keep their own open
// functions and open sequentially — a dialog is never nested in another, and
// their .open guards, [open] wait steps and close buttons are untouched.
(function (root) {
  'use strict';
  // Section order is the popover and nav order. Profile and appearance are
  // inline sections; the four other ids belong to the established dialogs and
  // are opened through the functions app.js registers.
  const SECTIONS = Object.freeze([
    {
      id: 'profile', label: 'Din profil',
      description: 'Dit navn og ikon, din standard-AI, standard arbejdsmåde, projektstandarder og hvor meget hjælp appen giver undervejs.'
    },
    {
      id: 'appearance', label: 'Udseende',
      description: 'Om appen følger systemets tema eller er lys eller mørk, og om sidepanelet er åbent, når appen starter.'
    },
    {
      id: 'connections', label: 'AI-forbindelser',
      description: 'Se, ret og fjern dine gemte forbindelser, og tilføj en ny, når du får ny adgang.'
    },
    {
      id: 'features', label: 'Funktioner',
      description: 'Vælg, hvad Aura Prime skal hjælpe med i dine projekter, fx versioner, planlægning og design.'
    },
    {
      id: 'updates', label: 'Opdateringer',
      description: 'Søg efter nye versioner af Aura Prime, og vælg selv, hvornår de hentes og installeres.'
    },
    {
      id: 'support', label: 'Hjælp og feedback',
      description: 'Find hjælp, gem en fejlrapport uden projektindhold, og send feedback til den, der inviterede dig.'
    }
  ].map(Object.freeze));
  const INLINE_SECTIONS = ['profile', 'appearance'];
  const HEADING_ID = 'settings-section-title';
  const inert = { open: async () => false, register: () => {} };

  function create({ document = root.document, sections = SECTIONS, toggle = '#settings-toggle' } = {}) {
    const dialog = document && document.querySelector('#settings-dialog');
    const content = document && document.querySelector('#settings-content');
    if (!dialog || !content) return inert;
    const known = new Map(sections.map(section => [section.id, section]));
    const inline = new Set(INLINE_SECTIONS.filter(id => known.has(id)));
    const navButtons = new Map();
    for (const button of dialog.querySelectorAll('[data-settings-section]')) navButtons.set(button.dataset.settingsSection, button);
    const openers = new Map();

    function register(map) {
      for (const [id, opener] of Object.entries(map || {})) if (known.has(id) && typeof opener === 'function') openers.set(id, opener);
    }
    function mark(section) {
      for (const [id, button] of navButtons) {
        if (id === section) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    }
    // Task 4 fills the real controls; until then each section states honestly
    // what it will hold — no "coming soon" placeholders.
    function describe(section) {
      const info = known.get(section);
      const heading = document.createElement('h3');
      heading.id = HEADING_ID;
      heading.textContent = info.label;
      const text = document.createElement('p');
      text.className = 'hint';
      text.textContent = info.description;
      content.replaceChildren(heading, text);
      content.setAttribute('aria-labelledby', HEADING_ID);
    }
    function show(section) {
      mark(section);
      describe(section);
      if (!dialog.open) dialog.showModal();
      navButtons.get(section)?.focus();
    }
    async function open(section) {
      if (!known.has(section)) return false;
      if (inline.has(section)) { show(section); return true; }
      const opener = openers.get(section);
      // Without a registered opener the section still opens with its description,
      // so no popover entry can ever be a dead button.
      if (!opener) { show(section); return true; }
      // Never nest dialogs: close this one first, then let the established open
      // function show its own dialog.
      if (dialog.open) dialog.close();
      await opener();
      return true;
    }
    dialog.addEventListener('close', () => {
      // Escape and the Luk button end here; when the dialog hands over to an
      // established dialog, focus belongs there instead of the toggle.
      if (!Array.from(document.querySelectorAll('dialog')).some(item => item.open)) document.querySelector(toggle)?.focus();
    });
    for (const [id, button] of navButtons) button.addEventListener('click', () => { void open(id); });
    return { open, register };
  }

  const api = { SECTIONS, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SettingsDialog = create({ document: root.document });
})(globalThis);
