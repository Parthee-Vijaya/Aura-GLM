// SPDX-License-Identifier: EUPL-1.2
// The unified settings dialog. One entry point, openSettings(section), routes
// to all settings surfaces: the inline sections (profile, appearance) render
// in #settings-dialog, while the four established dialogs keep their own open
// functions and open sequentially — a dialog is never nested in another, and
// their .open guards, [open] wait steps and close buttons are untouched.
// The profile and appearance sections render real controls from the profile:
// fill(profile) shows the current values, each control saves its own field
// group through the shared profile save queue (ui/profile-save.js), and the
// units travel whole from this dialog (appearance merges field by field in
// the main process: { theme, panelOpen } writes and the font-size stepper's
// { fontSize } write can never overwrite each other). The profile is pure UI
// state: names and icons never reach prompts, the model log, diagnostics or
// feedback reports.
(function (root) {
  'use strict';
  // Section order is the popover and nav order. Profile and appearance are
  // inline sections; the four other ids belong to the established dialogs and
  // are opened through the functions app.js registers.
  const SECTIONS = Object.freeze([
    {
      id: 'profile', label: 'Lokal profil',
      description: 'Navn og ikon er valgfrie og gemmes kun på din computer. Du behøver ingen konto.'
    },
    {
      id: 'appearance', label: 'Generelt',
      description: 'Vælg tema, tekststørrelse og hvor meget af AI’ens arbejde du vil se. Ændringer gemmes med det samme.'
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
      id: 'plugins', label: 'Plugins',
      description: 'Slå indbyggede plugins til og fra, og se hvilke der endnu venter på sikker tilkobling. Alt er slået fra, indtil du vælger det, og godkendelser gælder fortsat.'
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
  const INLINE_SECTIONS = ['profile', 'appearance', 'plugins'];
  const HEADING_ID = 'settings-section-title';
  // The theme hint key (aura.theme-hint.v1) has one writer: workspace-calm.js.
  // This module only calls calmWorkspace.setTheme, so the hint copy, the body
  // dataset and the button state always agree. The profile stays the single source.
  // Option sets reuse the exact labels from the onboarding profile step and
  // the per-project "Flere valg" so the same choices read the same everywhere.
  const THEMES = Object.freeze([['system', 'Følg system'], ['light', 'Lyst'], ['dark', 'Mørkt']]);
  const WORK_MODES = Object.freeze([['chat', 'Samtale · beskriv og byg'], ['plan', 'Planlæg · afklar og byg en plan først']]);
  const HELP_LEVELS = Object.freeze([['fuld', 'Fuld hjælp · forklaringer og forslag undervejs'], ['delvis', 'Hjælp ved behov · "?"-knappen viser tips ved skrivefeltet'], ['ingen', 'Ingen hjælp · hverken tips eller "?"-knap']]);
  // The transcript detail levels mirror core/profile.cjs's TRANSCRIPT_VALUES
  // contract (one test pins the two together): compact shows the answers,
  // standard (Nøgletrin) adds the key steps, detailed shows every allowed
  // work detail. The titles and descriptions are the exact texts the
  // onboarding detail step (D6) uses, so the choice reads the same everywhere.
  const TRANSCRIPT_LEVELS = Object.freeze([
    ['compact', 'Kun resultater', 'Du ser svaret og det færdige resultat, uden arbejdet undervejs.'],
    ['standard', 'Nøgletrin', 'Du ser svaret og de vigtigste trin undervejs.'],
    ['detailed', 'Alle detaljer', 'Du ser alle trin undervejs: filer, kommandoer og status.']
  ]);
  const HOSTINGS = Object.freeze([['', 'Beslut senere'], ['vercel', 'Vercel'], ['azure', 'Azure'], ['own', 'Organisationens løsning / egen server']]);
  const TEST_STYLES = Object.freeze([['senere', 'Beslut senere'], ['manuel', 'Manuel gennemgang af brugerrejsen'], ['automatiske', 'Automatiske tests og manuel gennemgang']]);
  // The font-size range mirrors core/profile.cjs's FONT_SIZE contract (one
  // test pins the two together): whole steps 10-16 with 13 as the neutral
  // size. The main process applies each saved size as the window's zoom
  // factor (13 => 100%), so the whole app scales — this stepper only writes
  // its own field; it never touches the zoom itself.
  const FONT = Object.freeze({ min: 10, max: 16, base: 13 });
  // The empty project defaults, identical to core/preferences.cjs's blank values.
  const BLANK_STANDARDS = Object.freeze({ hosting: '', designID: '', tests: 'senere' });
  const EMPTY_PROFILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
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
    const secondaryDialogs = new Map([['connections', 'connections-dialog'], ['features', 'features-dialog'], ['updates', 'updates-dialog'], ['support', 'support-dialog']]);
    // Preserve the existing dialogs and their guards, but carry the same
    // navigation and row surface through every settings section.
    for (const [section, dialogID] of secondaryDialogs) {
      const target = document.querySelector('#' + dialogID);
      const source = dialog.querySelector('.settings-nav');
      if (!target || !source?.cloneNode || target.querySelector('.native-settings-layout')) continue;
      target.classList.add('native-settings-shell');
      const layout = document.createElement('div'); layout.className = 'native-settings-layout';
      const nav = source.cloneNode(true); nav.setAttribute('aria-label', 'Indstillingsområder');
      const body = document.createElement('div'); body.className = 'native-settings-content';
      for (const child of [...target.children]) if (!child.classList.contains('dialog-heading')) body.append(child);
      layout.append(nav, body); target.append(layout);
      for (const button of nav.querySelectorAll('[data-settings-section]')) {
        if (button.dataset.settingsSection === section) button.setAttribute('aria-current', 'true');
        else button.removeAttribute('aria-current');
        button.addEventListener('click', () => { void open(button.dataset.settingsSection); });
      }
    }
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
    function paintInitials(choice, name) {
      if (!choice) return;
      const text = typeof name === 'string' ? name.trim() : '';
      if (text) choice.textContent = icons?.initials(text) || text.slice(0, 2).toUpperCase();
      else choice.innerHTML = EMPTY_PROFILE_ICON;
      choice.setAttribute('aria-label', text ? 'Initialer' : 'Intet ikon');
    }
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
    function groupHeading(text) {
      const heading = document.createElement('h4');
      heading.className = 'settings-group-heading';
      heading.textContent = text;
      content.append(heading);
    }
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

    // A profile saved outside this dialog — the View menu's zoom steps in the
    // main process — arrives on the same event every renderer-side save
    // announces. The cache and the open controls follow it, so the stepper
    // never stands on a size the menu has already stepped past. The dialog's
    // own announcements carry the very profile it just filled in — those are
    // skipped (same object), so a self-save never renders twice. The window
    // listener catches app.js's announcements; the document listener this
    // dialog's own bubbling dispatches.
    for (const target of [document, root]) target.addEventListener?.('aura:profile-saved', event => { if (event?.detail && event.detail !== profile) fill(event.detail); });

    // Theme and help application, shared by open and every save. The hint
    // copy, the body dataset and the button state are written by one writer —
    // workspace-calm.js's setTheme — so this module only hands the choice
    // over; 'system' follows prefers-color-scheme there.
    function applyTheme(theme) {
      const choice = theme === 'light' || theme === 'dark' ? theme : 'system';
      themeHost()?.setTheme?.(choice);
    }
    function applyHelp(helpLevel) {
      // All three levels map to their own body class; 'fuld' clears both, so
      // the standing hints return.
      document.body.classList.toggle('help-delvis', helpLevel === 'delvis');
      document.body.classList.toggle('help-ingen', helpLevel === 'ingen');
    }
    // The transcript detail level maps to its own body class at all three
    // levels: 'standard' (Nøgletrin) is the neutral default but still carries
    // its explicit class, and an unreadable value folds to it — the same
    // mapping app.js's applyProfilePresentation applies at startup.
    function applyTranscript(level) {
      const choice = ['compact', 'detailed'].includes(level) ? level : 'standard';
      document.body.classList.toggle('transcript-compact', choice === 'compact');
      document.body.classList.toggle('transcript-standard', choice === 'standard');
      document.body.classList.toggle('transcript-detailed', choice === 'detailed');
    }
    // The font-size stepper's paint: the current value and honest bounds —
    // the buttons stop at 10 and 16, because the profile accepts nothing else.
    function fontClamp(value) { return Number.isInteger(value) && value >= FONT.min && value <= FONT.max ? value : FONT.base; }
    function paintFontSize(value) {
      const sizeValue = byId('settings-font-size-value');
      if (sizeValue) sizeValue.textContent = `${value} px`;
      const down = byId('settings-font-down'), up = byId('settings-font-up');
      if (down) down.disabled = value <= FONT.min;
      if (up) up.disabled = value >= FONT.max;
    }

    // Renders the current profile into the open section's controls. Controls
    // that belong to another section are simply absent, so every lookup is
    // guarded — a late answer from a fetch can never fill the wrong section.
    function fill(value) {
      profile = value || null;
      if (!profile) return;
      applyTheme(profile.appearance?.theme);
      applyHelp(profile.helpLevel);
      applyTranscript(profile.transcriptView);
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
          if (choice.dataset.icon === '') paintInitials(choice, profile.name);
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
      const transcript = byId('settings-transcript');
      if (transcript) {
        const level = ['compact', 'detailed'].includes(profile.transcriptView) ? profile.transcriptView : 'standard';
        for (const input of transcript.querySelectorAll('input')) input.checked = input.value === level;
      }
      if (byId('settings-font-size-value')) paintFontSize(fontClamp(profile.appearance?.fontSize));
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
        icons?.setAvatarRevision?.(result.avatarRevision || 0);
        fill(result.profile);
        announce(result.warnings?.length ? result.warnings : ['Ændringerne er gemt.']);
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
          icons?.setAvatarRevision?.(next.avatarRevision || 0);
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
          // En afbrudt vælger er en status, ikke en fejl: intet er rørt, og rækken står.
          if (result?.canceled) { announce(['Billedvalget blev afbrudt.']); return; }
          avatarAvailable = result.hasAvatar === true;
          icons?.setAvatarRevision?.(result.avatarRevision || 0);
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
          icons?.setAvatarRevision?.(result.avatarRevision || 0);
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
      groupHeading('Dig i Aura');
      const name = document.createElement('input');
      name.id = 'settings-name';
      name.type = 'text';
      name.maxLength = 60;
      name.autocomplete = 'nickname';
      name.placeholder = 'Fx Anna';
      name.addEventListener('change', () => { void saveSection({ name: name.value.trim() }); });
      // The initials preview follows the name as it is typed; a committed save refills.
      name.addEventListener('input', () => { paintInitials(byId('settings-icons')?.querySelector('.profile-initials'), name.value); });
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
      paintInitials(initialsChoice, profile?.name);
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
        icons?.attachAvatarFallback?.(slot, profile?.name || '');
        slot.onclick = () => { void saveSection({ icon: slot.getAttribute('aria-checked') === 'true' ? '' : 'upload' }); };
      } else {
        slot.id = 'settings-avatar-slot';
        slot.setAttribute('aria-label', 'Upload eget billede');
        slot.title = 'Upload eget billede';
        slot.innerHTML = icons?.svg('upload') || '';
        slot.onclick = () => { void uploadAvatar(); };
      }
      row.append(slot);
      // T8 (the parked "roving tabindex" minor): same one-tab-stop discipline
      // as the onboarding picker — arrows move focus, click selects.
      icons?.wireRadioGroup?.(row);
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
      content.append(note('Navn og ikon kan stå tomme. Med et navn bruger appen dine initialer. Et eget billede gemmes kun på din computer og sendes aldrig til AI’en.'));

      groupHeading('Nye projekter');
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

      groupHeading('Hjælp undervejs');
      const help = document.createElement('select');
      help.id = 'settings-help';
      help.replaceChildren(...HELP_LEVELS.map(([value, label]) => option(value, label)));
      help.addEventListener('change', () => { void saveSection({ helpLevel: help.value }); });
      content.append(field('Hjælp i appen', help, 'settings-help'));
      content.append(note('Hjælp ved behov viser tips via "?"-knappen ved skrivefeltet. Ingen hjælp skjuler også "?"-knappen. Advarsler, godkendelser og "Før du sender" vises altid.'));
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
        const graphic = document.createElementNS ? document.createElementNS('http://www.w3.org/2000/svg', 'svg') : document.createElement('svg');
        graphic.setAttribute('viewBox', '0 0 24 24'); graphic.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : document.createElement('path');
        path.setAttribute('d', value === 'light' ? 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0' : value === 'dark' ? 'M20.5 14A8.5 8.5 0 0 1 10 3.5a8.5 8.5 0 1 0 10.5 10.5' : 'M3 4h18v13H3ZM8 21h8m-4-4v4');
        graphic.append(path);
        wrap.append(input, graphic, text);
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
      panelText.textContent = 'Arbejdsfladen er åben, når appen starter';
      panel.append(checkbox, panelText);
      content.append(panel);
      content.append(note('Bestemmer, om arbejdsfladen vises ved siden af samtalen, når appen starter.'));

      // Skriftstørrelse: a compact − / value / + stepper over the whole 10-16
      // range. Each step saves only its own field; the main process applies
      // the saved size as the window's zoom factor, so the whole app scales
      // while the user steps. The display follows the click at once — a failed
      // save refills the last known profile, so the stepper never lies.
      const size = document.createElement('div');
      size.className = 'settings-fontsize';
      const sizeDown = document.createElement('button');
      sizeDown.id = 'settings-font-down';
      sizeDown.type = 'button';
      sizeDown.textContent = '−';
      sizeDown.setAttribute('aria-label', 'Mindre tekst');
      const sizeValue = document.createElement('output');
      sizeValue.id = 'settings-font-size-value';
      const sizeUp = document.createElement('button');
      sizeUp.id = 'settings-font-up';
      sizeUp.type = 'button';
      sizeUp.textContent = '+';
      sizeUp.setAttribute('aria-label', 'Større tekst');
      const sizeStep = delta => {
        // The step is computed inside the serialized save, from the store's
        // fresh answer — never from the cached pre-step value: two quick '+'
        // clicks walk 14 then 15, because the second click reads the first
        // one's write. The paint follows the computed step at once; a failed
        // save refills the last known profile, so the stepper never lies.
        void saveQueue.queued(async () => {
          try {
            const fresh = await invoke('profileGet');
            const current = fontClamp(fresh?.profile?.appearance?.fontSize);
            const next = Math.min(FONT.max, Math.max(FONT.min, current + delta));
            if (next === current) return;
            paintFontSize(next);
            await saveProfile({ appearance: { fontSize: next } });
          } catch (error) {
            announce([error.message], true);
            if (profile) fill(profile);
          }
        });
      };
      sizeDown.addEventListener('click', () => sizeStep(-1));
      sizeUp.addEventListener('click', () => sizeStep(1));
      size.append(sizeDown, sizeValue, sizeUp);
      content.append(field('Skriftstørrelse', size, 'settings-font-size-value'));
      content.append(note('Skalerer hele appen: tekst, knapper og forhåndsvisning. 13 px er normal størrelse.'));

      // Arbejdsdetaljer (D4a): three radio cards with the same titles and
      // honest one-line descriptions as the onboarding detail step (D6).
      // Each choice saves only its own field through the shared queue, so
      // the level never travels with a theme or font-size write.
      const transcript = document.createElement('fieldset');
      transcript.id = 'settings-transcript';
      transcript.className = 'settings-transcript';
      const transcriptLegend = document.createElement('legend');
      transcriptLegend.textContent = 'Arbejdsdetaljer';
      transcript.append(transcriptLegend);
      for (const [value, title, text] of TRANSCRIPT_LEVELS) {
        const wrap = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'settings-transcript';
        input.value = value;
        input.addEventListener('change', () => { void saveSection({ transcriptView: input.value }); });
        const heading = document.createElement('strong');
        heading.textContent = title;
        const description = document.createElement('small');
        description.textContent = text;
        wrap.append(input, heading, description);
        transcript.append(wrap);
      }
      content.append(transcript);
      content.append(note('Vælg, hvor meget af AI’ens arbejde du ser i samtalen. Dine muligheder og godkendelser er de samme ved alle niveauer.'));
      feedbackArea();
    }

    // Plugins (4.11). The main process owns every value and refuses anything
    // unavailable; this view only shows the definitions and writes one field.
    const PLUGIN_ICONS = {
      subagents: ['#4176e6', '<rect x="4" y="4" width="10" height="10" rx="2.5"/><rect x="10" y="10" width="10" height="10" rx="2.5"/>'],
      webfetch: ['#1f9d6f', '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.4 3.9 5.2 3.9 8.5s-1.3 6.1-3.9 8.5c-2.6-2.4-3.9-5.2-3.9-8.5s1.3-6.1 3.9-8.5Z"/>'],
      websearch: ['#0ea5b7', '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>'],
      shell: ['#4f63d8', '<path d="m5 7 5 5-5 5M12 18h7"/>'],
      lsp: ['#8b5cf6', '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>'],
      mcp: ['#e07a2e', '<path d="M8 4v5M16 4v5M6 9h12v3a6 6 0 0 1-12 0V9ZM12 18v3"/>'],
      contextHud: ['#2f80ed', '<path d="M5 19V11M10 19V6M15 19v-9M20 19V9"/>']
    };
    let pluginState = null;
    function pluginIcon(id) {
      const [color, body] = PLUGIN_ICONS[id] || ['#61666b', '<circle cx="12" cy="12" r="7"/>'];
      const tile = document.createElement('span'); tile.className = 'plugin-icon'; tile.setAttribute('aria-hidden', 'true');
      tile.style?.setProperty?.('--plugin-color', color);
      tile.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
      return tile;
    }
    async function savePlugin(change) {
      try { pluginState = await invoke('pluginsSave', change); root.dispatchEvent?.(new root.CustomEvent('aura:plugins', { detail: { values: pluginState.values } })); renderPluginsFields(); }
      catch (error) { announce([error.message || 'Pluginvalget kunne ikke gemmes.'], true); renderPluginsFields(); }
    }
    const PLUGIN_FIELD_LABELS = { timeoutSeconds: ['Tidsgrænse', 'sek.'], outputLimitKB: ['Outputloft', 'KB'] };
    function pluginNumberFields(definition, value) {
      const wrap = document.createElement('div'); wrap.className = 'plugin-fields';
      const current = value && typeof value === 'object' ? value : {};
      for (const setting of definition.settings) {
        if (setting.type !== 'number') continue;
        const [label, unit] = PLUGIN_FIELD_LABELS[setting.key] || [setting.key, ''];
        const id = `plugin-${definition.id}-${setting.key}`;
        const field = document.createElement('label'); field.className = 'plugin-field'; field.htmlFor = id;
        const name = document.createElement('span'); name.textContent = label;
        const input = document.createElement('input'); input.id = id; input.type = 'number'; input.inputMode = 'numeric';
        input.min = String(setting.min); input.max = String(setting.max); input.step = '1';
        input.placeholder = String(setting.min); input.value = Number.isFinite(current[setting.key]) ? String(current[setting.key]) : '';
        const suffix = document.createElement('span'); suffix.className = 'plugin-unit'; suffix.textContent = unit;
        input.addEventListener('change', () => {
          const next = { ...current };
          if (input.value === '') delete next[setting.key];
          else {
            const number = Math.round(Number(input.value));
            if (!Number.isFinite(number) || number < setting.min || number > setting.max) { input.setCustomValidity?.(`Vælg mellem ${setting.min} og ${setting.max}.`); input.reportValidity?.(); return; }
            input.setCustomValidity?.(''); next[setting.key] = number;
          }
          void savePlugin({ id: definition.id, value: next });
        });
        field.append(name, input, suffix); wrap.append(field);
      }
      return wrap;
    }
    function pluginRow(definition) {
      const row = document.createElement('div'); row.className = 'plugin-row'; row.dataset.plugin = definition.id;
      if (!definition.available) row.dataset.unavailable = 'true';
      const text = document.createElement('div'); text.className = 'plugin-text';
      const title = document.createElement('strong'); title.id = `plugin-title-${definition.id}`; title.textContent = definition.title;
      if (definition.group === 'experimental') { const badge = document.createElement('span'); badge.className = 'plugin-badge'; badge.textContent = 'Eksperimentel'; title.append(' ', badge); }
      const summary = document.createElement('small'); summary.textContent = definition.summary;
      text.append(title, summary);
      if (!definition.available && definition.reason) {
        const why = document.createElement('details'); why.className = 'disclosure plugin-reason';
        const label = document.createElement('summary'); label.textContent = 'Hvorfor ikke endnu?';
        const reason = document.createElement('small'); reason.textContent = definition.reason;
        why.append(label, reason); text.append(why);
      }
      const value = pluginState?.values?.[definition.id];
      let control;
      if (!definition.available) {
        control = document.createElement('span'); control.className = 'plugin-state'; control.textContent = 'Kommer senere';
      } else if (definition.id === 'webfetch') {
        control = document.createElement('select'); control.className = 'plugin-select';
        control.append(option('ask', 'Spørg først'), option('deny', 'Slået fra'));
        control.value = value === 'deny' ? 'deny' : 'ask';
        control.setAttribute('aria-labelledby', title.id);
        control.disabled = !definition.available;
        control.addEventListener('change', () => { void savePlugin({ id: definition.id, value: control.value }); });
      } else if (typeof definition.default === 'boolean') {
        control = document.createElement('button'); control.type = 'button'; control.className = 'plugin-switch';
        control.setAttribute('role', 'switch'); control.setAttribute('aria-checked', String(value === true)); control.setAttribute('aria-labelledby', title.id);
        control.disabled = !definition.available;
        if (!definition.available) control.title = definition.reason || 'Ikke tilgængelig endnu';
        control.addEventListener('click', () => { void savePlugin({ id: definition.id, value: value !== true }); });
      } else if (Array.isArray(definition.settings) && definition.settings.length) {
        control = pluginNumberFields(definition, value);
      } else {
        control = document.createElement('span'); control.className = 'plugin-state'; control.textContent = definition.available ? 'Standard' : 'Ikke tilgængelig';
      }
      row.append(pluginIcon(definition.id), text, control);
      return row;
    }
    function mcpServers() {
      const wrap = document.createElement('section'); wrap.className = 'plugin-mcp'; wrap.setAttribute('aria-labelledby', 'plugin-mcp-title');
      const heading = document.createElement('h4'); heading.id = 'plugin-mcp-title'; heading.textContent = 'MCP-servere';
      wrap.append(heading, note('Gem en lokal kommando eller en HTTPS-adresse nu. Serverne startes ikke, før Aura kan dække dem med godkendelser, sandbox og Privacy Gate.'));
      const servers = pluginState?.mcp?.servers || [];
      const list = document.createElement('div'); list.className = 'plugin-mcp-list';
      if (!servers.length) list.append(note('Ingen MCP-servere gemt.'));
      for (const server of servers) {
        const row = document.createElement('div'); row.className = 'plugin-mcp-row';
        const label = document.createElement('span'); label.textContent = `${server.name || server.id} · ${server.type === 'remote' ? server.url : [server.command, ...(server.args || [])].join(' ')}`;
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Fjern';
        remove.setAttribute('aria-label', `Fjern MCP-serveren ${server.name || server.id}`);
        remove.addEventListener('click', () => { void savePlugin({ mcp: { remove: server.id } }); });
        row.append(label, remove); list.append(row);
      }
      const form = document.createElement('form'); form.className = 'plugin-mcp-form';
      const id = document.createElement('input'); id.id = 'plugin-mcp-id'; id.required = true; id.pattern = '[a-z][a-z0-9-]{1,39}'; id.placeholder = 'fx filer-lokalt'; id.autocomplete = 'off'; id.spellcheck = false;
      const type = document.createElement('select'); type.id = 'plugin-mcp-type'; type.append(option('local', 'Lokal kommando'), option('remote', 'Remote · HTTPS'));
      const target = document.createElement('input'); target.id = 'plugin-mcp-target'; target.required = true; target.autocomplete = 'off'; target.spellcheck = false;
      let targetLabel = null;
      const sync = () => { target.placeholder = type.value === 'remote' ? 'https://mcp.example/sse' : 'npx -y @scope/server --flag'; if (targetLabel) targetLabel.textContent = type.value === 'remote' ? 'Adresse' : 'Kommando'; };
      type.addEventListener('change', sync);
      const add = document.createElement('button'); add.type = 'submit'; add.textContent = 'Gem server';
      const targetField = field('Kommando', target, 'plugin-mcp-target');
      targetLabel = targetField.querySelector?.('label') || null; sync();
      form.append(field('Server-ID', id, 'plugin-mcp-id'), field('Type', type, 'plugin-mcp-type'), targetField, add);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const parts = target.value.trim().split(/\s+/).filter(Boolean);
        const server = type.value === 'remote' ? { id: id.value.trim(), type: 'remote', url: target.value.trim() } : { id: id.value.trim(), type: 'local', command: parts[0] || '', args: parts.slice(1) };
        void savePlugin({ mcp: { add: server } });
      });
      wrap.append(list, form);
      return wrap;
    }
    function pluginGroup(title, items) {
      const group = document.createElement('section'); group.className = 'plugin-group';
      const heading = document.createElement('h4'); heading.textContent = title;
      group.append(heading, ...items.map(pluginRow));
      return group;
    }
    function renderPluginsFields() {
      if (current !== 'plugins') return;
      content.replaceChildren(...[...content.children].slice(0, 2));
      if (!pluginState) { content.append(note('Henter plugins …')); return; }
      const definitions = pluginState.definitions || [];
      const ready = group => definitions.filter(item => item.group === group && item.available);
      if (ready('builtin').length) content.append(pluginGroup('Indbyggede plugins', ready('builtin')));
      if (ready('experimental').length) content.append(pluginGroup('Eksperimentelle plugins', ready('experimental')));
      const waiting = definitions.filter(item => !item.available);
      if (waiting.length) {
        const group = pluginGroup('Venter på sikker tilkobling', waiting); group.classList.add('plugin-waiting');
        group.querySelector('h4').after(note('Disse plugins kan ikke slås til endnu, fordi de ville gå uden om Auras godkendelser, sandbox eller Privacy Gate. De bliver tilgængelige, når den sikre tilkobling er bygget.'));
        content.append(group);
      }
      if (definitions.some(item => item.id === 'mcp')) content.append(mcpServers());
      const skills = document.createElement('section'); skills.className = 'plugin-group';
      const skillsHeading = document.createElement('h4'); skillsHeading.textContent = 'Installerede skills';
      const openFeatures = document.createElement('button'); openFeatures.type = 'button'; openFeatures.className = 'text-button'; openFeatures.textContent = 'Åbn Funktioner og skills';
      openFeatures.addEventListener('click', () => { void open('features'); });
      skills.append(skillsHeading, note('Skills styres under Funktioner, fx versioner, planlægning, design og sikkerhed. De gælder stadig sammen med plugins.'), openFeatures);
      content.append(skills);
      feedbackArea();
    }
    async function loadPlugins() {
      try { pluginState = await invoke('pluginsGet'); }
      catch (error) { pluginState = { definitions: [], values: {}, mcp: { servers: [] } }; announce([error.message || 'Plugins kunne ikke hentes.'], true); }
      renderPluginsFields();
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
      for (const dialogID of secondaryDialogs.values()) {
        const target = document.querySelector('#' + dialogID);
        if (target?.open) target.close();
      }
      current = section;
      dialog.dataset.section = section;
      mark(section);
      describe(section);
      if (section === 'profile') renderProfileFields();
      if (section === 'appearance') renderAppearanceFields();
      if (section === 'plugins') { renderPluginsFields(); void loadPlugins(); }
      content.scrollTop = 0;
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
        icons?.setAvatarRevision?.(profileResult.avatarRevision || 0);
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
      for (const [id, dialogID] of secondaryDialogs) {
        const target = document.querySelector('#' + dialogID);
        if (id !== section && target?.open) target.close();
      }
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
    // Navigation moves focus only. An external section can open another
    // dialog, so arrows must never activate a section as a side effect.
    const navigationSurfaces = [dialog.querySelector('.settings-nav'), ...[...secondaryDialogs.values()].map(id => document.querySelector('#' + id)?.querySelector('.settings-nav'))].filter(Boolean);
    for (const navigation of navigationSurfaces) navigation.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || !['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...navigation.querySelectorAll('[data-settings-section]')].filter(button => !button.disabled && !button.hidden);
      const index = buttons.indexOf(document.activeElement);
      if (index < 0) return;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    });
    return { open, register, fill, saveSection };
  }

  const api = { SECTIONS, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SettingsDialog = create({ document: root.document });
})(globalThis);
