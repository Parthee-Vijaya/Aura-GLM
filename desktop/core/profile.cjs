// The user profile is pure UI state owned by the main process: name, icon and
// the saved standards for new projects and conversations. Profile data must
// never flow into prompts, the model log, diagnostics or feedback reports.
// The profile follows the Preferences pattern: one class, atomic store
// updates, Danish validation errors, and warnings for dead references.
const { normalize } = require('./preferences.cjs');

const ICON_IDS = Object.freeze(['star', 'bolt', 'leaf', 'moon', 'box', 'bird', 'wave', 'compass', 'flame', 'heart', 'cube', 'spark']);
const PROJECT_DEFAULTS = Object.freeze({ hosting: '', designID: '', tests: 'senere' });
const THEME_VALUES = Object.freeze(['system', 'light', 'dark']);
const HELP_VALUES = Object.freeze(['fuld', 'minimal']);
const WORK_MODES = Object.freeze(['chat', 'plan']);

// A fresh profile: no name or icon, full help, system theme, panel open,
// no standard AI, chat as the work mode and undecided project standards.
function blank() {
  return { name: '', icon: '', helpLevel: 'fuld', appearance: { theme: 'system', panelOpen: true }, standardAI: { connectionID: '', modelID: '' }, workMode: 'chat', projectDefaults: { ...PROJECT_DEFAULTS }, migrated: 0 };
}

function cleanID(value) { return typeof value === 'string' && value.length <= 100 && !/[\x00-\x1f]/.test(value) ? value : null; }
function cleanName(value) { if (typeof value !== 'string' || value.length > 60 || /[\x00-\x1f]/.test(value)) throw new Error('Ugyldigt profilnavn.'); return value; }
function cleanIcon(value) { if (typeof value !== 'string' || value !== '' && !ICON_IDS.includes(value)) throw new Error('Ukendt profilikon.'); return value; }
function cleanChoice(value, allowed, message) { if (!allowed.includes(value)) throw new Error(message); return value; }

// partial keeps only the fields the patch actually carries: appearance saves
// merge field by field in Profile.save, so a writer that owns only the theme
// can never drag a stale panelOpen back over a newer write (or vice versa).
// null is not a valid value in either mode — only undefined means "not sent".
function normalizeAppearance(input = {}, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldigt udseende.');
  const result = {};
  if (!partial || input.theme !== undefined) result.theme = input.theme === undefined ? 'system' : cleanChoice(input.theme, THEME_VALUES, 'Ukendt tema.');
  if (!partial || input.panelOpen !== undefined) result.panelOpen = input.panelOpen === undefined ? true : cleanChoice(input.panelOpen, [true, false], 'Ugyldig starttilstand for panelet.');
  return result;
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

// A save replaces only the keys the renderer sends. Each nested object is one
// unit — except appearance, which merges field by field (see normalizeAppearance),
// so the separate theme and panel writers can never overwrite each other.
function normalizePatch(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Ugyldig profil.');
  const patch = {};
  if (input.name !== undefined) patch.name = cleanName(input.name);
  if (input.icon !== undefined) patch.icon = cleanIcon(input.icon);
  if (input.helpLevel !== undefined) patch.helpLevel = cleanChoice(input.helpLevel, HELP_VALUES, 'Ukendt hjælpeniveau.');
  if (input.appearance !== undefined) patch.appearance = normalizeAppearance(input.appearance, { partial: true });
  if (input.standardAI !== undefined) patch.standardAI = normalizeStandardAI(input.standardAI);
  if (input.workMode !== undefined) patch.workMode = cleanChoice(input.workMode, WORK_MODES, 'Ukendt arbejdsmåde.');
  if (input.projectDefaults !== undefined) patch.projectDefaults = normalizeProjectDefaults(input.projectDefaults);
  return patch;
}

// A lenient read of a stored profile: a value this version does not know (fx
// an icon or help level from a newer beta) falls back field by field to the
// blank() default with a Danish warning instead of throwing. An unreadable
// field can never lock the settings, a save, project creation or migration —
// and the next successful save repairs the file. Saving a patch stays strict.
const READ_WARNINGS = Object.freeze({
  profile: 'Din profil kunne ikke læses og er nulstillet.',
  name: 'Dit profilnavn kunne ikke læses og er nulstillet.',
  icon: 'Dit profilikon kunne ikke læses og er nulstillet.',
  helpLevel: 'Dit hjælpeniveau kunne ikke læses og er nulstillet.',
  appearance: 'Dit udseende kunne ikke læses og er nulstillet.',
  standardAI: 'Din standard-AI kunne ikke læses og er nulstillet.',
  workMode: 'Din arbejdsmåde kunne ikke læses og er nulstillet.',
  projectDefaults: 'Dine projektstandarder kunne ikke læses og er nulstillet.',
});
// Each nested group reads one field at a time through its strict validator,
// so one unreadable value resets only that field — the readable sister fields
// survive the read. warn() is already bound to the group's warning text.
function readGroup(value, fallback, normalize, keys, warn) {
  const result = { ...fallback };
  if (value === undefined) return result;
  if (!value || typeof value !== 'object' || Array.isArray(value)) { warn(); return result; }
  for (const key of keys) if (value[key] !== undefined) {
    try { result[key] = normalize({ [key]: value[key] })[key]; } catch { warn(); }
  }
  return result;
}
function readProfile(input) {
  const warnings = [];
  const warn = text => { if (!warnings.includes(text)) warnings.push(text); };
  const fresh = blank();
  // No profile at all is a fresh state, not corruption: the blank profile
  // answers without a warning. Only a non-object value on disk is corrupt.
  if (input === undefined) return { profile: fresh, warnings };
  if (!input || typeof input !== 'object' || Array.isArray(input)) { warn(READ_WARNINGS.profile); return { profile: fresh, warnings }; }
  const field = (text, fallback, read) => { try { return read(); } catch { warn(text); return fallback; } };
  const group = (value, fallback, normalize, keys, text) => readGroup(value, fallback, normalize, keys, () => warn(text));
  const profile = {
    name: field(READ_WARNINGS.name, '', () => input.name === undefined ? '' : cleanName(input.name)),
    icon: field(READ_WARNINGS.icon, '', () => input.icon === undefined ? '' : cleanIcon(input.icon)),
    helpLevel: field(READ_WARNINGS.helpLevel, 'fuld', () => input.helpLevel === undefined ? 'fuld' : cleanChoice(input.helpLevel, HELP_VALUES, 'Ukendt hjælpeniveau.')),
    appearance: group(input.appearance, fresh.appearance, normalizeAppearance, ['theme', 'panelOpen'], READ_WARNINGS.appearance),
    standardAI: group(input.standardAI, fresh.standardAI, normalizeStandardAI, ['connectionID', 'modelID'], READ_WARNINGS.standardAI),
    workMode: field(READ_WARNINGS.workMode, 'chat', () => input.workMode === undefined ? 'chat' : cleanChoice(input.workMode, WORK_MODES, 'Ukendt arbejdsmåde.')),
    projectDefaults: readProjectDefaults(input.projectDefaults, warn).values,
    migrated: input.migrated === 1 ? 1 : 0,
  };
  return { profile, warnings };
}

// The project-defaults shape reads per field as well; the legacy startup
// defaults share it, so one expired value (fx hosting from a retired provider)
// never blocks migration — the field stays at its default and the rest folds.
function readProjectDefaults(input, warn = () => {}) {
  const warnings = [];
  const localWarn = text => { if (!warnings.includes(text)) warnings.push(text); warn(text); };
  const values = { ...PROJECT_DEFAULTS };
  if (input === undefined) return { values, warnings };
  if (!input || typeof input !== 'object' || Array.isArray(input)) { localWarn(READ_WARNINGS.projectDefaults); return { values, warnings }; }
  for (const key of Object.keys(PROJECT_DEFAULTS)) if (input[key] !== undefined) {
    try { values[key] = normalize({ [key]: input[key] })[key]; } catch { localWarn(READ_WARNINGS.projectDefaults); }
  }
  return { values, warnings };
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
    // Reading is lenient: an unknown value from a newer version falls back per
    // field with a warning instead of locking the settings or the app.
    const read = readProfile(state.profile);
    const result = resolveReferences(read.profile, state);
    return { profile: result.profile, warnings: [...read.warnings, ...result.warnings] };
  }
  async save(input) {
    // Validate the patch before the write, so a rejected save never touches the file.
    const patch = normalizePatch(input);
    return this.store.update(state => {
      // The stored profile is read leniently, so a corrupt field never blocks
      // saving the fields the renderer just changed. appearance merges field by
      // field: a writer that only owns the theme can never drag a stale
      // panelOpen back over a newer write (or vice versa).
      const read = readProfile(state.profile);
      const merged = { ...read.profile, ...patch };
      if (patch.appearance) merged.appearance = { ...read.profile.appearance, ...patch.appearance };
      const result = resolveReferences(merged, state);
      state.profile = result.profile;
      return { profile: result.profile, warnings: [...read.warnings, ...result.warnings] };
    });
  }
  // Renderer-initiated one-shot migration in a single atomic update: the saved
  // startup defaults fold in first, then the renderer's three legacy values,
  // each only into fields the profile has not chosen yet. Once the marker is
  // set the call is a no-op that returns the existing profile unchanged.
  // Corrupt profile fields and expired startup-default values never throw —
  // the fold leaves them at their defaults.
  async migrate(input) {
    return this.store.update(state => {
      const profile = readProfile(state.profile).profile;
      if (profile.migrated === 1) return { profile };
      const legacyDefaults = state.startupDefaults && typeof state.startupDefaults === 'object' && !Array.isArray(state.startupDefaults) ? state.startupDefaults : null;
      if (legacyDefaults) {
        const legacy = readProjectDefaults(legacyDefaults).values;
        const connection = cleanID(legacyDefaults.connectionID);
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
