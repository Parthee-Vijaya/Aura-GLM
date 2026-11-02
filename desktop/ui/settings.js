// SPDX-License-Identifier: EUPL-1.2
// The unified settings dialog. One entry point, openSettings(section), routes
// to all settings surfaces: the inline sections (profile, appearance) render
// in #settings-dialog, while the four established dialogs keep their own open
// functions and open sequentially — a dialog is never nested in another, and
// their .open guards, [open] wait steps and close buttons are untouched.
// The profile and appearance sections render real controls from the profile:
// fill(profile) shows the current values, each control saves its own field
// group through the shared profile save queue (ui/profile-save.js), and the
// units travel whole from this dialog (appearance { theme, panelOpen },
// standardAI, projectDefaults). The profile is pure UI state: names and icons
// never reach prompts, the model log, diagnostics or feedback reports.
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
  // The theme hint key (aura.theme-hint.v1) has one writer: workspace-calm.js.
  // This module only calls calmWorkspace.setTheme, so the hint copy, the body
  // dataset and the button state always agree. The profile stays the single source.
  // Option sets reuse the exact labels from the onboarding profile step and
  // the per-project "Flere valg" so the same choices read the same everywhere.
  const THEMES = Object.freeze([['system', 'Følg system'], ['light', 'Lyst'], ['dark', 'Mørkt']]);
  const WORK_MODES = Object.freeze([['chat', 'Samtale · beskriv og byg'], ['plan', 'Planlæg · afklar og byg en plan først']]);
  const HELP_LEVELS = Object.freeze([['fuld', 'Fuld hjælp · forklaringer og forslag undervejs'], ['minimal', 'Minimal · kun det vigtigste']]);
  const HOSTINGS = Object.freeze([['', 'Beslut senere'], ['vercel', 'Vercel'], ['azure', 'Azure'], ['own', 'Organisationens løsning / egen server']]);
  const TEST_STYLES = Object.freeze([['senere', 'Beslut senere'], ['manuel', 'Manuel gennemgang af brugerrejsen'], ['automatiske', 'Automatiske tests og manuel gennemgang']]);
  // The empty project defaults, identical to core/preferences.cjs's blank values.
  const BLANK_STANDARDS = Object.freeze({ hosting: '', designID: '', tests: 'senere' });
  const inert = { open: async () => false, register: () => {}, fill: () => {}, saveSection: async () => null };

  function create({ document = root.document, sections = SECTIONS, toggle = '#settings-toggle', harness = root.harness, icons = root.ProfileIcons, themeHost = () => root.calmWorkspace, saveQueue = root.profileSaveQueued } = {}) {
    const dialog = document && document.querySelector('#settings-dialog');
    const content = document && document.querySelector('#settings-content');
    if (!dialog || !content) return inert;
    const known = new Map(sections.map(section => [section.id, section]));
    const inline = new Set(INLINE_SECTIONS.filter(id => known.has(id)));
    const navButtons = new Map();
    for (const button of dialog.querySelectorAll('[data-settings-section]')) navButtons.set(button.dataset.settingsSection, button);
    const openers = new Map();
    // The last known profile, connection list, design list and avatar state;
    // fill() renders from them, so a failed save can always restore the last
    // known values.
    let profile = null, connections = [], designs = [], current = null, avatarAvailable = false;

    function invoke(method, value) {
      const request = harness?.[method];
      if (typeof request !== 'function') return Promise.reject(new Error('Profilen er ikke tilgængelig lige nu.'));
      return Promise.resolve(request(value)).then(response => {
        if (!response || response.ok === false) throw new Error(response?.error || 'Handlingen kunne ikke gennemføres.');
        return response.value;
      });
    }
    const byId = id => content.querySelector('#' + id);
    function option(value, text) { const el = document.createElement('option'); el.value = value; el.textContent = text; return el; }
    function field(labelText, control, htmlFor) {
      const row = document.createElement('div');
      row.className = 'settings-field';
      const label = document.createElement('label');
      label.textContent = labelText;
      if (htmlFor) label.setAttribute('for', htmlFor);
      row.append(label, control);
      return row;
    }
    function note(text) { const el = document.createElement('p'); el.className = 'hint'; el.textContent = text; return el; }
    function feedbackArea() {
      const el = document.createElement('p');
      el.id = 'settings-feedback';
      el.className = 'hint';
      el.setAttribute('role', 'status');
      content.append(el);
      return el;
    }
    function announce(lines, isError = false) {
      const area = byId('settings-feedback');
      if (!area) return;
      const text = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).join(' ');
      area.textContent = text;
      area.classList.toggle('error', Boolean(text && isError));
    }
    // Every successful save announces the canonical profile: app.js keeps a
    // cache for new conversations and the standard-AI prefill, and the event
    // keeps that cache in step without a restart. The event bubbles from the
    // document up to the window, where app.js listens.
    function dispatchSaved(profile) {
      try { document.dispatchEvent(new CustomEvent('aura:profile-saved', { detail: profile, bubbles: true })); } catch { /* a missing event target never blocks a save */ }
    }

    // Theme and help application, shared by open and every save. The hint
    // copy, the body dataset and the button state are written by one writer —
    // workspace-calm.js's setTheme — so this module only hands the choice
    // over; 'system' follows prefers-color-scheme there.
    function applyTheme(theme) {
      const choice = theme === 'light' || theme === 'dark' ? theme : 'system';
      themeHost()?.setTheme?.(choice);
    }
    function applyHelp(helpLevel) {
      document.body.classList.toggle('help-minimal', helpLevel === 'minimal');
    }

    // Renders the current profile into the open section's controls. Controls
    // that belong to another section are simply absent, so every lookup is
    // guarded — a late answer from a fetch can never fill the wrong section.
    function fill(value) {
      profile = value || null;
      if (!profile) return;
      applyTheme(profile.appearance?.theme);
      applyHelp(profile.helpLevel);
      const name = byId('settings-name');
      // Never overwrite text the user is still typing; committed saves refill.
      if (name && document.activeElement !== name) name.value = profile.name || '';
      const grid = byId('settings-icons');
      if (grid) {
        // The avatar slot changes shape with the avatar state (an upload action
        // or a selectable preview). A late fetch answer — or an upload made in
        // another surface — rebuilds the profile fields instead of filling a
        // row whose slot no longer matches the state.
        if (Boolean(grid.querySelector('.profile-avatar-slot')?.dataset?.icon) !== avatarAvailable) { refreshProfileSection(); return; }
        for (const choice of grid.querySelectorAll('button')) {
          // The initials are a first-class choice: an empty icon means the
          // initials radio is the selected one, not that nothing is selected.
          choice.setAttribute('aria-checked', String(choice.dataset.icon === (profile.icon || '')));
          if (choice.dataset.icon === '') choice.textContent = icons?.initials(profile.name || '') || 'AK';
        }
      }
      const mode = byId('settings-work-mode');
      if (mode) mode.value = profile.workMode || 'chat';
      const help = byId('settings-help');
      if (help) help.value = profile.helpLevel || 'fuld';
      const connection = byId('settings-standard-connection');
      if (connection) {
        connection.replaceChildren(option('', 'Beslut senere'), ...connections.map(item => option(item.id, item.name || 'Forbindelse')));
        const chosen = profile.standardAI?.connectionID || '';
        connection.value = chosen && connections.some(item => item.id === chosen) ? chosen : '';
        const model = byId('settings-standard-model');
        if (model) {
          const modelID = profile.standardAI?.modelID || '';
          model.hidden = !modelID;
          model.textContent = modelID ? `Standardmodel: ${modelID}` : '';
        }
      }
      const hosting = byId('settings-hosting');
      if (hosting) hosting.value = profile.projectDefaults?.hosting || '';
      const design = byId('settings-design');
      if (design) {
        design.replaceChildren(option('', 'Intet design'), ...designs.map(item => option(item.id, `${item.name} · ${item.files} filer`)));
        const chosen = profile.projectDefaults?.designID || '';
        design.value = chosen && designs.some(item => item.id === chosen) ? chosen : '';
      }
      const tests = byId('settings-tests');
      if (tests) tests.value = profile.projectDefaults?.tests || 'senere';
      const panel = byId('settings-panel-open');
      if (panel) panel.checked = profile.appearance?.panelOpen !== false;
      const theme = byId('settings-theme');
      if (theme) for (const input of theme.querySelectorAll('input')) input.checked = input.value === (profile.appearance?.theme || 'system');
    }

    // Saves are serialized through the one shared renderer queue
    // (ui/profile-save.js), which the theme button and the panel toggle use
    // as well: main.cjs's exclusive() rejects overlapping profile writes, so
    // rapid field changes must never race each other (a rejected save would
    // revert the field the user just changed).
    function saveSection(partial) { return saveQueue.queued(() => saveProfile(partial)); }

    // Every save bumps a generation; a read that started earlier refuses its
    // own answer, so an older UI state can never be dragged back on screen.
    let profileGeneration = 0;

    // Saves a partial profile patch and refreshes everything from the answer:
    // values, theme and help level. A rejected save shows its Danish error and
    // restores the last known values.
    async function saveProfile(partial) {
      ++profileGeneration;
      try {
        const result = await invoke('profileSave', partial);
        fill(result.profile);
        announce(result.warnings);
        dispatchSaved(result.profile);
        return result;
      } catch (error) {
        announce([error.message], true);
        if (profile) fill(profile);
        return null;
      }
    }

    // "Glem projektstandarder": preferencesSave writes the profile's project
    // defaults (core/preferences.cjs owns the same validation), then the
    // profile is fetched again so the fields show the canonical answer. The
    // refreshed profile is announced, so the app cache and the startup screen
    // follow the cleared standards.
    async function forgetStandards() {
      return saveQueue.queued(async () => {
        try {
          const cleared = await invoke('preferencesSave', { ...BLANK_STANDARDS });
          const next = await invoke('profileGet');
          if (!next || !next.profile) return;
          fill(next.profile);
          announce(['Projektstandarderne er nulstillet.', ...(cleared?.warnings || []), ...(next.warnings || [])]);
          dispatchSaved(next.profile);
        } catch (error) {
          announce([error.message], true);
          if (profile) fill(profile);
        }
      });
    }

    // The avatar upload and removal are serialized through the shared save queue
    // like every other profile write, so a rapid field change can never race the
    // avatar's own save in the main process. The main process owns the whole
    // picture flow — picker, scaling, storage — and answers with the outcome
    // alone; a canceled picker changes nothing.
    async function uploadAvatar() {
      return saveQueue.queued(async () => {
        try {
          const result = await invoke('profileUploadAvatar');
          if (result?.canceled) return;
          avatarAvailable = result.hasAvatar === true;
          profile = result.profile;
          refreshProfileSection();
          announce(['Dit profilbillede er gemt.', ...(result.warnings || [])]);
          dispatchSaved(result.profile);
          byId('settings-icons')?.querySelector('[data-icon="upload"]')?.focus();
        } catch (error) {
          announce([error.message], true);
        }
      });
    }
    async function removeAvatar() {
      return saveQueue.queued(async () => {
        try {
          const result = await invoke('profileRemoveAvatar');
          avatarAvailable = result.hasAvatar === true;
          profile = result.profile;
          refreshProfileSection();
          announce(['Dit profilbillede er fjernet.', ...(result.warnings || [])]);
          dispatchSaved(result.profile);
          byId('settings-avatar-slot')?.focus();
        } catch (error) {
          announce([error.message], true);
        }
      });
    }
    // The avatar slot changes shape between upload and removal (action button or
    // selectable preview), so the section cannot just refill the old controls —
    // it rebuilds its fields from the last known profile and avatar state.
    function refreshProfileSection() {
      describe('profile');
      renderProfileFields();
      if (profile) fill(profile);
    }

    function renderProfileFields() {
      const name = document.createElement('input');
      name.id = 'settings-name';
      name.type = 'text';
      name.maxLength = 60;
      name.autocomplete = 'nickname';
      name.placeholder = 'Fx Anna';
      name.addEventListener('change', () => { void saveSection({ name: name.value.trim() }); });
      // The initials preview follows the name as it is typed; a committed save refills.
      name.addEventListener('input', () => { const preview = byId('settings-icons')?.querySelector('.profile-initials'); if (preview) preview.textContent = icons?.initials(name.value.trim()) || 'AK'; });
      content.append(field('Hvad skal Aura kalde dig?', name, 'settings-name'));
      content.append(note('Navnet bliver i appen og sendes aldrig til AI’en eller nogen server.'));

      // The compact icon row: the initials, the three Aura variants and the
      // avatar slot — an upload button until a picture is stored, a selectable
      // rounded preview afterwards. The picture itself is the main process's
      // business; this row only asks for the picker and renders the outcome.
      const row = document.createElement('div');
      row.id = 'settings-icons';
      row.className = 'profile-icon-row';
      row.setAttribute('role', 'radiogroup');
      row.setAttribute('aria-label', 'Dit ikon');
      const initialsChoice = document.createElement('button');
      initialsChoice.type = 'button';
      initialsChoice.className = 'profile-icon-choice profile-initials';
      initialsChoice.dataset.icon = '';
      initialsChoice.setAttribute('role', 'radio');
      initialsChoice.setAttribute('aria-checked', 'false');
      initialsChoice.setAttribute('aria-label', 'Initialer');
      initialsChoice.textContent = icons?.initials(profile?.name || '') || 'AK';
      // The initials are also the deselect target: choosing them saves the empty icon.
      initialsChoice.onclick = () => { void saveSection({ icon: '' }); };
      row.append(initialsChoice);
      for (const id of icons?.IDS || []) {
        const choice = document.createElement('button');
        choice.type = 'button';
        choice.className = 'profile-icon-choice';
        choice.dataset.icon = id;
        choice.setAttribute('role', 'radio');
        choice.setAttribute('aria-checked', 'false');
        choice.setAttribute('aria-label', icons?.LABELS?.[id] || id);
        choice.innerHTML = icons?.svg(id) || '';
        // Clicking the chosen icon again returns to the initials fallback.
        choice.onclick = () => { void saveSection({ icon: choice.getAttribute('aria-checked') === 'true' ? '' : id }); };
        row.append(choice);
      }
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'profile-icon-choice profile-avatar-slot';
      if (avatarAvailable) {
        slot.dataset.icon = 'upload';
        slot.setAttribute('role', 'radio');
        slot.setAttribute('aria-checked', 'false');
        slot.setAttribute('aria-label', icons?.LABELS?.upload || 'Eget billede');
        slot.innerHTML = icons?.avatarImage() || '';
        slot.onclick = () => { void saveSection({ icon: slot.getAttribute('aria-checked') === 'true' ? '' : 'upload' }); };
      } else {
        slot.id = 'settings-avatar-slot';
        slot.setAttribute('aria-label', 'Upload eget billede');
        slot.title = 'Upload eget billede';
        slot.innerHTML = icons?.svg('upload') || '';
        slot.onclick = () => { void uploadAvatar(); };
      }
      row.append(slot);
      const iconWrap = document.createElement('div');
      iconWrap.className = 'profile-icon-wrap';
      iconWrap.append(row);
      if (avatarAvailable) {
        const removeAvatarButton = document.createElement('button');
        removeAvatarButton.id = 'settings-avatar-remove';
        removeAvatarButton.type = 'button';
        removeAvatarButton.className = 'text-button';
        removeAvatarButton.textContent = 'Fjern billedet';
        removeAvatarButton.onclick = () => { void removeAvatar(); };
        iconWrap.append(removeAvatarButton);
      }
      content.append(field('Ikon', iconWrap));
      content.append(note('Uden valgt ikon bruger appen dine initialer, fx AK for Anna Klit. Et eget billede gemmes kun i appen på din computer og sendes aldrig til AI’en.'));

      const connection = document.createElement('select');
      connection.id = 'settings-standard-connection';
      connection.addEventListener('change', () => {
        // standardAI is one unit: a new connection starts without a standard
        // model; the model picker's "Brug som standard" sets it explicitly.
        const chosen = connection.value;
        const modelID = chosen && profile?.standardAI?.connectionID === chosen ? (profile.standardAI.modelID || '') : '';
        void saveSection({ standardAI: { connectionID: chosen, modelID } });
      });
      content.append(field('Standard-AI', connection, 'settings-standard-connection'));
      const model = document.createElement('p');
      model.id = 'settings-standard-model';
      model.className = 'hint';
      model.hidden = true;
      content.append(model);
      content.append(note('Nye projekter starter med denne forbindelse, når du ikke vælger en anden undervejs.'));

      const mode = document.createElement('select');
      mode.id = 'settings-work-mode';
      mode.replaceChildren(...WORK_MODES.map(([value, label]) => option(value, label)));
      mode.addEventListener('change', () => { void saveSection({ workMode: mode.value }); });
      content.append(field('Standard arbejdsmåde', mode, 'settings-work-mode'));

      const hosting = document.createElement('select');
      hosting.id = 'settings-hosting';
      hosting.replaceChildren(...HOSTINGS.map(([value, label]) => option(value, label)));
      const design = document.createElement('select');
      design.id = 'settings-design';
      const tests = document.createElement('select');
      tests.id = 'settings-tests';
      tests.replaceChildren(...TEST_STYLES.map(([value, label]) => option(value, label)));
      // projectDefaults is one unit: every save carries all three fields.
      const standardsPatch = () => ({ projectDefaults: { hosting: hosting.value, designID: design.value, tests: tests.value } });
      hosting.addEventListener('change', () => { void saveSection(standardsPatch()); });
      design.addEventListener('change', () => { void saveSection(standardsPatch()); });
      tests.addEventListener('change', () => { void saveSection(standardsPatch()); });
      content.append(field('Udgivelse', hosting, 'settings-hosting'));
      content.append(field('Design', design, 'settings-design'));
      content.append(field('Tests', tests, 'settings-tests'));
      const forgetRow = document.createElement('div');
      forgetRow.className = 'settings-forget';
      const forget = document.createElement('button');
      forget.id = 'settings-forget-standards';
      forget.type = 'button';
      forget.className = 'text-button';
      forget.textContent = 'Glem projektstandarder';
      forget.onclick = () => { void forgetStandards(); };
      forgetRow.append(forget);
      content.append(forgetRow);
      content.append(note('Projektstandarderne gælder nye projekter; det enkelte projekt kan altid vælge anderledes.'));

      const help = document.createElement('select');
      help.id = 'settings-help';
      help.replaceChildren(...HELP_LEVELS.map(([value, label]) => option(value, label)));
      help.addEventListener('change', () => { void saveSection({ helpLevel: help.value }); });
      content.append(field('Hjælp i appen', help, 'settings-help'));
      content.append(note('Minimal hjælp fjerner korte genvejs- og forklaringslinjer. Advarsler og vigtige beskeder vises altid.'));
      feedbackArea();
    }

    function renderAppearanceFields() {
      const theme = document.createElement('fieldset');
      theme.id = 'settings-theme';
      theme.className = 'settings-theme';
      const legend = document.createElement('legend');
      legend.textContent = 'Tema';
      theme.append(legend);
      for (const [value, label] of THEMES) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'settings-theme';
        input.value = value;
        // appearance is one unit: theme and panelOpen always travel together.
        input.addEventListener('change', () => { void saveSection({ appearance: { theme: input.value, panelOpen: byId('settings-panel-open')?.checked !== false } }); });
        const text = document.createElement('span');
        text.textContent = label;
        wrap.append(input, text);
        theme.append(wrap);
      }
      content.append(theme);
      content.append(note('Temaet følger dit system, medmindre du vælger selv.'));

      const panel = document.createElement('label');
      panel.className = 'settings-check';
      const checkbox = document.createElement('input');
      checkbox.id = 'settings-panel-open';
      checkbox.type = 'checkbox';
      checkbox.addEventListener('change', () => {
        const active = [...theme.querySelectorAll('input')].find(input => input.checked)?.value || 'system';
        void saveSection({ appearance: { theme: active, panelOpen: checkbox.checked } });
      });
      const panelText = document.createElement('span');
      panelText.textContent = 'Sidepanelet er åbent, når appen starter';
      panel.append(checkbox, panelText);
      content.append(panel);
      content.append(note('Bestemmer, om arbejdsfladen vises ved siden af samtalen, når appen starter.'));
      feedbackArea();
    }

    // Heading and honest intro for every section; non-inline sections stop
    // here (their established dialog holds the real content).
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
      current = section;
      mark(section);
      describe(section);
      if (section === 'profile') renderProfileFields();
      if (section === 'appearance') renderAppearanceFields();
      // The cached profile renders instantly; the fetch refreshes it.
      if (profile) fill(profile);
      if (!dialog.open) dialog.showModal();
      navButtons.get(section)?.focus();
    }
    async function load(section) {
      // A read that started before the newest save must never refill the
      // controls when its answer lands late — it would drag an older UI state
      // (fx a saved theme) back on screen. Only a save bumps the generation;
      // the read refuses its own answer when a save has happened since.
      const generation = profileGeneration;
      try {
        const reads = [invoke('profileGet')];
        if (section === 'profile') {
          // A failed list fetch keeps the section usable with empty choices.
          reads.push(invoke('connectionState').catch(() => null), invoke('listDesigns').catch(() => null));
        }
        const [profileResult, connectionResult, designResult] = await Promise.all(reads);
        if (generation !== profileGeneration) return;
        if (connectionResult) connections = connectionResult.connections || [];
        if (designResult) designs = designResult || [];
        avatarAvailable = profileResult.hasAvatar === true;
        fill(profileResult.profile);
        announce(profileResult.warnings);
      } catch (error) {
        announce([error.message || 'Profilen kunne ikke hentes lige nu.'], true);
      }
    }
    async function open(section) {
      if (!known.has(section)) return false;
      if (inline.has(section)) { show(section); void load(section); return true; }
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
    function register(map) {
      for (const [id, opener] of Object.entries(map || {})) if (known.has(id) && typeof opener === 'function') openers.set(id, opener);
    }
    function mark(section) {
      for (const [id, button] of navButtons) {
        if (id === section) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
      }
    }
    dialog.addEventListener('close', () => {
      // Escape and the Luk button end here; when the dialog hands over to an
      // established dialog, focus belongs there instead of the toggle.
      if (!Array.from(document.querySelectorAll('dialog')).some(item => item.open)) document.querySelector(toggle)?.focus();
    });
    for (const [id, button] of navButtons) button.addEventListener('click', () => { void open(id); });
    return { open, register, fill, saveSection };
  }

  const api = { SECTIONS, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SettingsDialog = create({ document: root.document });
})(globalThis);
