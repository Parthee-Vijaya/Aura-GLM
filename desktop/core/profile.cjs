// The user profile is pure UI state owned by the main process: name, icon and
// the saved standards for new projects and conversations. Profile data must
// never flow into prompts, the model log, diagnostics or feedback reports.
// The profile follows the Preferences pattern: one class, atomic store
// updates, Danish validation errors, and warnings for dead references.
const { normalize } = require('./preferences.cjs');

const ICON_IDS = Object.freeze(['star', 'bolt', 'leaf', 'moon', 'box', 'bird', 'wave', 'compass', 'flame', 'heart', 'cube', 'spark']);
const PROJECT_DEFAULTS = Object.freeze({ hosting: '', designID: '', tests: 'senere' });

// A fresh profile: no name or icon, full help, system theme, panel open,
// no standard AI, chat as the work mode and undecided project standards.
function blank() {
  return { name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat', projectDefaults: { ...PROJECT_DEFAULTS }, migrated: 0 };
}

function cleanID(value) { return typeof value === 'string' && value.length <= 100 && !/[\x00-\x1f]/.test(value) ? value : null; }
function cleanName(value) { if (typeof value !== 'string' || value.length > 60 || /[\x00-\x1f]/.test(value)) throw new Error('Ugyldigt profilnavn.'); return value; }
function cleanIcon(value) { if (typeof value !== 'string' || value !== '' && !ICON_IDS.includes(value)) throw new Error('Ukendt profilikon.'); return value; }
function cleanChoice(value, allowed, message) { if (!allowed.includes(value)) throw new Error(message); return value; }

function normalizeAppearance(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldigt udseende.');
  return {
    theme: input.theme === undefined ? 'system' : cleanChoice(input.theme, ['system', 'light', 'dark'], 'Ukendt tema.'),
    panelOpen: input.panelOpen === undefined ? true : cleanChoice(input.panelOpen, [true, false], 'Ugyldig starttilstand for panelet.'),
  };
}

function normalizeStandardAI(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldigt standard-AI-valg.');
  const result = { connectionID: '', modelID: '' };
  for (const key of Object.keys(result)) if (input[key] !== undefined) { const id = cleanID(input[key]); if (id === null) throw new Error('Ugyldigt standard-AI-valg.'); result[key] = id; }
  return result;
}

// Project standards reuse the Preferences rules, so both classes share one
// validation. normalize also validates a stray connectionID key; it is
// dropped from the canonical three-field form.
function normalizeProjectDefaults(input = {}) {
  const values = normalize(input);
  return { hosting: values.hosting, designID: values.designID, tests: values.tests };
}

function normalizeProfile(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldig profil.');
  return {
    name: input.name === undefined ? '' : cleanName(input.name),
    icon: input.icon === undefined ? '' : cleanIcon(input.icon),
    helpLevel: input.helpLevel === undefined ? 'fuld' : cleanChoice(input.helpLevel, ['fuld', 'minimal'], 'Ukendt hjælpeniveau.'),
    appearance: normalizeAppearance(input.appearance),
    standardAI: normalizeStandardAI(input.standardAI),
    workMode: input.workMode === undefined ? 'chat' : cleanChoice(input.workMode, ['chat', 'plan'], 'Ukendt arbejdsmåde.'),
    projectDefaults: normalizeProjectDefaults(input.projectDefaults),
    migrated: input.migrated === 1 ? 1 : 0,
  };
}

// A save replaces only the keys the renderer sends; each nested object is
// replaced as one unit, and the migration marker is never renderer-writable.
function normalizePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldig profil.');
  const patch = {};
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.icon !== undefined) patch.icon = cleanIcon(input.icon);
  if (input.helpLevel !== undefined) patch.helpLevel = cleanChoice(input.helpLevel, ['fuld', 'minimal'], 'Ukendt hjælpeniveau.');
  if (input.appearance !== undefined) patch.appearance = normalizeAppearance(input.appearance);
  if (input.standardAI !== undefined) patch.standardAI = normalizeStandardAI(input.standardAI);
  if (input.workMode !== undefined) patch.workMode = cleanChoice(input.workMode, ['chat', 'plan'], 'Ukendt arbejdsmåde.');
  if (input.projectDefaults !== undefined) patch.projectDefaults = normalizeProjectDefaults(input.projectDefaults);
  return patch;
}

// Saved references that no longer exist are cleared and reported, like Preferences.available.
function resolveReferences(profile, state) {
  const warnings = [];
  const result = { ...profile, appearance: { ...profile.appearance }, standardAI: { ...profile.standardAI }, projectDefaults: { ...profile.projectDefaults } };
  if (result.standardAI.connectionID && !state.connections.some(c => c.id === result.standardAI.connectionID)) {
    result.standardAI = { connectionID: '', modelID: '' };
    warnings.push('Din standard-AI findes ikke længere. Vælg en ny, eller beslut senere.');
  }
  if (result.projectDefaults.designID && !(state.designs || []).some(d => d.id === result.projectDefaults.designID)) {
    result.projectDefaults.designID = '';
    warnings.push('Din standarddesignpakke findes ikke længere.');
  }
  return { profile: result, warnings };
}

class Profile {
  constructor(store) { this.store = store; }
  async get() {
    const state = await this.store.read();
    return resolveReferences(normalizeProfile(state.profile), state);
  }
  async save(input) {
    // Validate the patch before the write, so a rejected save never touches the file.
    const patch = normalizePatch(input);
    return this.store.update(state => {
      const result = resolveReferences({ ...normalizeProfile(state.profile), ...patch }, state);
      state.profile = result.profile;
      return result;
    });
  }
  // Renderer-initiated one-shot migration in a single atomic update: the saved
  // startup defaults fold in first, then the renderer's three legacy values,
  // each only into fields the profile has not chosen yet. Once the marker is
  // set the call is a no-op that returns the existing profile unchanged.
  async migrate(input) {
    return this.store.update(state => {
      const profile = normalizeProfile(state.profile);
      if (profile.migrated === 1) return { profile };
      const legacy = state.startupDefaults && typeof state.startupDefaults === 'object' && !Array.isArray(state.startupDefaults) ? normalizeProjectDefaults(state.startupDefaults) : null;
      if (legacy) {
        const connection = cleanID(state.startupDefaults.connectionID);
        if (!profile.standardAI.connectionID && connection) profile.standardAI.connectionID = connection;
        if (!profile.projectDefaults.hosting) profile.projectDefaults.hosting = legacy.hosting;
        if (!profile.projectDefaults.designID) profile.projectDefaults.designID = legacy.designID;
        if (profile.projectDefaults.tests === PROJECT_DEFAULTS.tests) profile.projectDefaults.tests = legacy.tests;
      }
      const preferred = cleanID(input?.preferredConnection);
      if (!profile.standardAI.connectionID && preferred) profile.standardAI.connectionID = preferred;
      if (profile.appearance.theme === 'system' && ['light', 'dark'].includes(input?.workspaceTheme)) profile.appearance.theme = input.workspaceTheme;
      if (profile.appearance.panelOpen === true && (input?.surfaceOpen === 'true' || input?.surfaceOpen === 'false')) profile.appearance.panelOpen = input.surfaceOpen === 'true';
      profile.migrated = 1;
      state.profile = profile;
      return { profile };
    });
  }
}
Profile.ICON_IDS = ICON_IDS;
module.exports = { Profile, ICON_IDS, blank };
