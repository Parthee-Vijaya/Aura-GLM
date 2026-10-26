// Model-call control only. The host owns policy, exact bytes, recipients and permits.
// This surface never grants file, tool, plan or general recipient authority.
(() => {
  const CLASSES = ['public', 'internal', 'confidential', 'strict'];
  const DECISIONS = ['approve', 'local', 'cancel'];
  function contextKey(value = {}) { return JSON.stringify([value.root || '', value.chat || '']); }
  function allowedDecisions(review, now = Date.now()) {
    const expiry = typeof review?.expiresAt === 'number' ? review.expiresAt : Date.parse(review?.expiresAt);
    if (!review || typeof review.id !== 'string' || !review.id || typeof review.body !== 'string' || !Number.isFinite(expiry) || expiry <= now) return [];
    return DECISIONS.filter(decision => Array.isArray(review.allowedDecisions) && review.allowedDecisions.includes(decision));
  }
  function settingsInput(settings = {}) {
    const ref = value => ({ connectionID: typeof value?.connectionID === 'string' ? value.connectionID : '', modelID: typeof value?.modelID === 'string' ? value.modelID : '', routeID: typeof value?.routeID === 'string' ? value.routeID : '' });
    return { enabled: settings.enabled === true, workMode: ['local', 'hybrid', 'cloud-controlled'].includes(settings.workMode) ? settings.workMode : 'cloud-controlled',
      defaultClass: CLASSES.includes(settings.defaultClass) ? settings.defaultClass : 'internal', requireApproval: settings.requireApproval !== false,
      ...(settings.hybridPair ? { hybridPair: { local: ref(settings.hybridPair.local), external: ref(settings.hybridPair.external) } } : {}),
      protectedSources: Array.isArray(settings.protectedSources) ? settings.protectedSources.map(source => ({ path: typeof source?.path === 'string' ? source.path : '', classification: CLASSES.includes(source?.classification) ? source.classification : 'strict',
        attributes: { personalData: source?.attributes?.personalData === true, secrets: source?.attributes?.secrets === true }, ...(source?.uninspectable === true ? { uninspectable: true } : {}) })) : [] };
  }
  function findingSummary(findings = [], language = 'da') {
    const types = { name: ['navn', 'name'], person: ['person', 'person'], email: ['e-mailadresse', 'email address'], cpr: ['CPR-nummer', 'personal ID'], account: ['kontonummer', 'account number'], secret: ['hemmelighed', 'secret'], credential: ['adgangsoplysning', 'credential'], phone: ['telefonnummer', 'phone number'] };
    return findings.map(value => {
      const type = typeof value?.kind === 'string' ? value.kind : typeof value?.type === 'string' ? value.type : 'protected';
      const count = Number.isSafeInteger(value?.count) && value.count > 0 ? value.count : 1;
      return `${count} ${types[type]?.[language === 'en' ? 1 : 0] || (language === 'en' ? 'protected finding' : 'beskyttet fund')}`;
    }).join(' · ');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { contextKey, allowedDecisions, settingsInput, findingSummary };
  if (typeof document === 'undefined') return;

  const make = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const get = id => document.getElementById(id);
  const language = () => document.documentElement.lang === 'en' ? 'en' : 'da';
  const t = (da, en) => language() === 'en' ? en : da;
  const classLabel = value => ({ public: t('Offentligt', 'Public'), internal: t('Internt', 'Internal'), confidential: t('Fortroligt', 'Confidential'), strict: t('Strengt beskyttet', 'Strictly protected') })[value] || t('Ikke oplyst', 'Not reported');
  const locality = value => ({ device: t('Denne computer', 'This computer'), local: t('Denne computer', 'This computer'), organization: t('Organisationens server · en anden maskine', 'Organization server · another machine'), cloud: t('Cloud', 'Cloud'), external: t('Ekstern destination', 'External destination') })[value] || t('Behandlingssted ikke dokumenteret', 'Processing location not documented');
  const textValue = value => typeof value === 'string' ? value : '';
  let api = null, connected = false, snapshot = null, context = null, scope = 'project', generation = 0, busy = false, reviewing = null, lastFocus = null, expiryTimer = null, pendingQueue = [], reviewGeneration = 0, refreshPromise = null;
  let settingsDialog, sharingDialog, statusLine, loadingReviewID = null, choicesLoading = false;

  function button(text, action, className = '') { const value = make('button', text, className); value.type = 'button'; value.onclick = action; return value; }
  function label(text, control) { const value = make('label', text); value.htmlFor = control.id; return value; }
  function setNotice(target, text, error = false) { target.textContent = text; target.classList.toggle('is-error', error); }
  function openDialog(dialog) { if (dialog.open) return; lastFocus = document.activeElement; dialog.showModal(); }
  function closeDialog(dialog) { if (dialog.open) dialog.close(); lastFocus?.isConnected && lastFocus.focus?.(); }
  function switchControl(id, text, checked) {
    const value = button('', () => { value.setAttribute('aria-checked', String(value.getAttribute('aria-checked') !== 'true')); }); value.id = id;
    value.className = 'appearance-toggle privacy-switch'; value.setAttribute('role', 'switch'); value.setAttribute('aria-checked', String(checked));
    const track = make('span', undefined, 'switch-track'); track.setAttribute('aria-hidden', 'true'); track.append(make('span')); value.append(track, make('span', text)); return value;
  }
  function heading(dialog, title, close) {
    const row = make('div', undefined, 'privacy-heading'), heading = make('h2', title); heading.id = `${dialog.id}-title`;
    row.append(heading); if (close) row.append(button(t('Luk', 'Close'), close, 'text-button'));
    dialog.setAttribute('aria-labelledby', heading.id); return row;
  }
  function renderStatus() {
    const enabled = snapshot?.enabled === true || snapshot?.settings?.enabled === true;
    const mode = snapshot?.effective?.workMode || snapshot?.settings?.workMode;
    const title = !snapshot ? t('Datakontrol · hent status', 'Data control · load status') : enabled ? mode === 'local' ? t('Kun lokal · modelkald', 'Local only · model calls') : mode === 'hybrid' ? t('Hybrid · datakontrol', 'Hybrid · data control') : t('Cloud med datakontrol', 'Cloud with data control') : t('Datakontrol · ikke aktiveret', 'Data control · not enabled');
    for (const id of ['privacy-gate-button', 'privacy-model-button', 'privacy-settings-button']) { const value = get(id); if (value) { value.textContent = title; value.title = snapshot?.capabilities?.isolation === true ? t('Arbejdsform og dataregler. Lokal og ekstern behandling holdes adskilt; planer og værktøjsgodkendelser gælder fortsat.', 'Work mode and data rules. Local and external processing stay separate; plans and tool approvals still apply.') : t('Arbejdsform og dataregler. Leverance 1 kontrollerer modelkald; værktøjer er endnu ikke isoleret.', 'Work mode and data rules. Delivery 1 controls model calls; tools are not yet isolated.'); } }
    if (statusLine && !reviewing) statusLine.hidden = true;
  }
  function destinationRows() {
    const list = make('ul', undefined, 'privacy-destination-list');
    for (const destination of snapshot?.destinations || []) {
      const row = make('li'); row.append(make('strong', textValue(destination.label) || t('Destination', 'Destination')), make('span', locality(destination.locality)));
      if (destination.allowed === false) row.append(make('small', t('Ikke tilladt af gældende regler', 'Not permitted by current rules')));
      list.append(row);
    }
    if (!list.children.length) list.append(make('li', t('Vælg forbindelse og model i Auras eksisterende modelvælger. Ingen destination er frigivet her.', 'Choose a connection and model in Aura’s existing model picker. No destination is authorized here.')));
    return list;
  }
  function renderSettings({ preserve = false } = {}) {
    if (!settingsDialog) return;
    const previous = preserve && get('privacy-enable') ? readSettings() : null;
    const values = previous || settingsInput(snapshot?.settings), locked = snapshot?.rulesLocked === true, qualified = snapshot?.capabilities?.hybrid === true && snapshot?.capabilities?.isolation === true;
    settingsDialog.replaceChildren(heading(settingsDialog, t('Arbejdsform og datakontrol', 'Work mode and data control'), () => closeDialog(settingsDialog)));
    settingsDialog.append(make('p', t('Modelvalg og datatilladelser er to forskellige valg. Planer og værktøjsgodkendelser gælder fortsat.', 'Model choice and data permissions are separate choices. Plans and tool approvals still apply.'), 'privacy-lead'));
    const limitation = make('p', qualified ? t('Lokal og ekstern behandling holdes adskilt. Hver deling kontrolleres efter de gældende dataregler.', 'Local and external processing stay separate. Every sharing is checked against the current data rules.') : t('Leverance 1 · kontrol af modelkald. Hybridarbejde og isolation af terminal, preview og underprocesser er ikke aktiveret.', 'Delivery 1 · model-call control. Hybrid work and isolation of terminals, previews and subprocesses are not enabled.'), 'privacy-scope');
    settingsDialog.append(limitation);
    const scopeSelect = make('select'); scopeSelect.id = 'privacy-scope';
    const state = api.read();
    for (const [id, da, en, disabled] of [['project', 'Projekt', 'Project', !state.root], ['conversation', 'Denne samtale', 'This conversation', !state.chat], ['idea', 'Idéhjælp før projektstart', 'Idea workshop before project start', false]]) {
      const option = make('option', t(da, en)); option.value = id; option.disabled = disabled; scopeSelect.append(option);
    }
    scopeSelect.value = scope; scopeSelect.disabled = busy || choicesLoading;
    scopeSelect.onchange = () => { scope = scopeSelect.value; void refresh({ show: true }); };
    const scopeLabel = label(t('Reglerne gælder for', 'Rules apply to'), scopeSelect);
    if (!qualified) settingsDialog.append(scopeLabel, scopeSelect);
    const selection = make('p', undefined, 'privacy-selected-model');
    const mark = window.ProviderBrand?.icon?.(state.kind, state.modelID); if (mark) selection.append(mark);
    selection.append(make('span', `${t('Valgt model', 'Selected model')}: ${state.modelName || state.modelID || t('Ikke valgt', 'Not selected')}${state.connectionName ? ` · ${state.connectionName}` : ''}`)); settingsDialog.append(selection);
    const enabled = switchControl('privacy-enable', t('Datakontrol på modelkald', 'Data control for model calls'), locked ? true : values.enabled); enabled.disabled = locked || busy || choicesLoading;
    settingsDialog.append(enabled);
    const modes = make('div', undefined, 'privacy-mode-grid'); modes.setAttribute('role', 'group'); modes.setAttribute('aria-label', t('Arbejdsform', 'Work mode'));
    for (const [id, title, description, unavailable] of [
      ['local', t('Kun lokal', 'Local only'), qualified ? t('Planlægning og behandling på denne Mac. Eksterne tjenester er blokeret.', 'Planning and processing on this Mac. External services are blocked.') : t('Kun modeller på denne computer. Eksterne modelkald blokeres. Værktøjsisolation kommer i leverance 3.', 'Only models on this computer. External model calls are blocked. Tool isolation arrives in delivery 3.'), false],
      ['hybrid', t('Hybrid', 'Hybrid'), qualified ? t('Adskilte lokale og eksterne sessioner. Beskyttet materiale behandles lokalt.', 'Separate local and external sessions. Protected material is processed locally.') : t('Adskilte lokale og eksterne sessioner. Kræver leverance 2 og fuld isolation i leverance 3.', 'Separate local and external sessions. Requires delivery 2 and full isolation in delivery 3.'), !qualified],
      ['cloud-controlled', t('Cloud med datakontrol', 'Cloud with data control'), t('Hele modelkaldet kontrolleres lokalt før afsendelse til den valgte destination.', 'The complete model call is checked locally before it is sent to the selected destination.'), false]
    ]) {
      const value = button('', () => { modes.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.mode === id))); });
      value.dataset.mode = id; value.className = 'privacy-mode-card'; value.setAttribute('aria-pressed', String(values.workMode === id)); value.disabled = unavailable || busy || choicesLoading;
      value.append(make('strong', title), make('span', description)); if (unavailable) value.append(make('small', t('Kommer senere', 'Coming later'))); modes.append(value);
    }
    settingsDialog.append(modes);
    if (qualified) {
      for (const [side, id, da, en, hintDA, hintEN] of [
        ['local', 'privacy-local-model', 'Lokal model · denne Mac', 'Local model · this Mac', 'Beskyttede trin stopper, hvis lokal behandling er utilgængelig.', 'Protected steps stop if local processing is unavailable.'],
        ['external', 'privacy-external-model', 'Ekstern model og destination', 'External model and destination', 'Organisationens server er en anden maskine, ikke denne Mac.', 'The organization’s server is another machine, not this Mac.']
      ]) {
        const select = modelSelect(side, values.hybridPair?.[side]); select.id = id;
        const hint = make('p', t(hintDA, hintEN), 'privacy-footnote'); hint.id = id + '-hint'; select.setAttribute('aria-describedby', hint.id);
        settingsDialog.append(label(t(da, en), select), select, hint);
      }
      settingsDialog.append(scopeLabel, scopeSelect);
    }
    const fields = make('div', undefined, 'privacy-settings-grid'), classSelect = make('select'); classSelect.id = 'privacy-default-class';
    for (const id of CLASSES) { const option = make('option', classLabel(id)); option.value = id; classSelect.append(option); }
    classSelect.value = values.defaultClass; classSelect.disabled = busy || choicesLoading;
    const classField = make('div'); classField.append(label(t('Standardklasse for materiale', 'Default material class'), classSelect), classSelect);
    const approval = switchControl('privacy-require-approval', t('Gennemgå hver tilladt ekstern deling', 'Review every permitted external sharing'), values.requireApproval); approval.disabled = busy || choicesLoading;
    fields.append(classField, approval); settingsDialog.append(fields);
    if (scope !== 'idea') {
      const sources = make('section', undefined, 'privacy-source-settings'); sources.append(make('h3', t('Beskyttede kilder i projektet', 'Protected sources in the project')),
        make('p', t('Tilføj regler for konkrete filer eller mapper relativt til projektet. Reglerne begrænser adgangen; de giver ikke modellen filrettigheder. Organisationens arvede regler kan ikke fjernes her.', 'Add rules for specific files or folders relative to the project. Rules restrict access; they do not give the model file permissions. Inherited organization rules cannot be removed here.'), 'privacy-footnote'));
      const rows = make('div'); rows.id = 'privacy-source-rows';
      for (const source of values.protectedSources) rows.append(sourceRow(source, busy || choicesLoading));
      const add = button(t('Tilføj beskyttet fil eller mappe', 'Add protected file or folder'), () => {
        if (rows.children.length >= 32) return; rows.append(sourceRow({ path: '', classification: 'confidential', attributes: {} }, false)); rows.children[rows.children.length - 1].querySelector('input')?.focus();
      }, 'text-button'); add.id = 'privacy-add-source'; add.disabled = busy || choicesLoading; sources.append(rows, add); settingsDialog.append(sources);
    }
    const rules = make('section', undefined, 'privacy-rules'); rules.append(make('h3', t('Gældende regler og destinationer', 'Effective rules and destinations')));
    const effectiveClass = snapshot?.rules?.classification || snapshot?.effective?.defaultClass;
    rules.append(make('p', `${t('Gældende dataklasse', 'Effective data class')}: ${classLabel(effectiveClass)} · ${t('Regelversion', 'Policy version')}: ${textValue(snapshot?.policyVersion) || '—'}`));
    rules.append(make('p', locked ? t('Organisationens regler er låst. Projekt og samtale kan ikke udvide adgangen.', 'Organization rules are locked. Projects and conversations cannot expand access.') : t('Organisationens regler sætter loftet. Hostlaget afgør de faktiske tilladelser ved hvert modelkald.', 'Organization rules set the ceiling. The host determines actual permissions for every model call.')));
    const sources = snapshot?.rules?.protectedSources || snapshot?.effective?.protectedSources || [];
    if (Array.isArray(sources) && sources.length) rules.append(make('p', t(`${sources.length} beskyttede kilderegler. Kildeindhold og følsomme filnavne vises ikke i aktivitetsloggen.`, `${sources.length} protected-source rules. Source contents and sensitive filenames are not shown in the activity log.`)));
    rules.append(destinationRows()); settingsDialog.append(rules);
    const feedback = make('p', '', 'privacy-feedback'); feedback.id = 'privacy-settings-feedback'; feedback.setAttribute('role', 'status'); settingsDialog.append(feedback);
    const actions = make('div', undefined, 'privacy-actions'); const save = button(t('Gem dataregler', 'Save data rules'), () => { void saveSettings(); }, 'primary'); save.id = 'privacy-save'; save.disabled = busy || choicesLoading || !snapshot || api.read().running;
    actions.append(button(t('Luk', 'Close'), () => closeDialog(settingsDialog), 'text-button'), save); settingsDialog.append(actions);
  }
  function readSettings() {
    const protectedSources = get('privacy-source-rows') ? [...get('privacy-source-rows').children].map(row => ({ path: row.querySelector('[data-source-path]')?.value || '', classification: row.querySelector('[data-source-class]')?.value,
      attributes: { personalData: row.querySelector('[data-source-personal]')?.getAttribute('aria-checked') === 'true', secrets: row.querySelector('[data-source-secret]')?.getAttribute('aria-checked') === 'true' }, ...(row.dataset.uninspectable === 'true' ? { uninspectable: true } : {}) })) : [];
    const selected = side => { const value = get(`privacy-${side}-model`); try { const item = JSON.parse(value.value); return item.action === 'select' ? item.ref : value._previous; } catch { return value?._previous; } };
    const choices = get('privacy-local-model') ? { local: selected('local'), external: selected('external') } : null;
    const pair = choices ? choices.local?.connectionID || choices.external?.connectionID ? choices : undefined : snapshot?.settings?.hybridPair;
    return settingsInput({ enabled: get('privacy-enable')?.getAttribute('aria-checked') === 'true', workMode: settingsDialog.querySelector('[data-mode][aria-pressed=true]')?.dataset.mode,
      defaultClass: get('privacy-default-class')?.value, requireApproval: get('privacy-require-approval')?.getAttribute('aria-checked') === 'true', protectedSources, ...(pair ? { hybridPair: pair } : {}) });
  }
  function modelSelect(side, selected) {
    const select = make('select'), option = (text, value, disabled = false) => { const item = make('option', text); item.value = JSON.stringify(value); item.disabled = disabled; return item; };
    select._previous = selected; select.disabled = busy || choicesLoading || api.read().running;
    select.append(option(t('Vælg model', 'Choose a model'), { action: 'empty' }));
    let matching;
    for (const destination of snapshot?.destinations || []) {
      if ((side === 'local') !== (destination.locality === 'device') || destination.allowed === false) continue;
      const group = make('optgroup'); group.label = `${destination.label} · ${locality(destination.locality)}`;
      for (const model of destination.models || []) {
        if (destination.kind === 'openrouter') {
          for (const route of model.routes || []) add(model, route, group);
          group.append(option(`${t('Hent udbydere', 'Load providers')} · ${model.label}`, { action: 'routes', connectionID: destination.id, modelID: model.id }));
        } else add(model, null, group);
      }
      group.append(option(`${t('Hent modeller', 'Load models')} · ${destination.label}`, { action: 'models', connectionID: destination.id })); select.append(group);
      function add(model, route, group) {
        const ref = { connectionID: destination.id, modelID: model.id, routeID: route?.id || '' }, value = { action: 'select', ref };
        const item = option(`${model.label}${route ? ` · ${route.label} (${route.id})` : ''}`, value); group.append(item);
        if (JSON.stringify([ref.connectionID, ref.modelID, ref.routeID]) === JSON.stringify([selected?.connectionID, selected?.modelID, selected?.routeID || ''])) matching = item.value;
      }
    }
    if (selected?.connectionID && selected?.modelID && !matching) {
      const retained = option(`${selected.modelID}${selected.routeID ? ` · ${selected.routeID}` : ''}`, { action: 'select', ref: selected }, true); select.append(retained); matching = retained.value;
    }
    select.value = matching || JSON.stringify({ action: 'empty' });
    select.onchange = () => { let item; try { item = JSON.parse(select.value); } catch { return; } if (item.action === 'select') select._previous = item.ref; else if (['models', 'routes'].includes(item.action)) void loadChoices(item); else select._previous = undefined; };
    return select;
  }
  async function loadChoices(choice) {
    if (busy || choicesLoading || api.read().running) return;
    const version = generation, sourceContext = context, sourceScope = scope, values = readSettings(); choicesLoading = true; renderSettings({ preserve: true });
    try {
      await api.invoke(choice.action, choice.action === 'models' ? choice.connectionID : { connectionID: choice.connectionID, modelID: choice.modelID });
      if (version !== generation || sourceContext !== context || sourceScope !== scope) return;
      const latest = await api.invoke('privacyGet', { scope: sourceScope });
      if (version !== generation || sourceContext !== context || sourceScope !== scope) return;
      snapshot = latest; snapshot = { ...snapshot, settings: values }; choicesLoading = false; renderSettings();
    } catch { if (version === generation) { choicesLoading = false; renderSettings({ preserve: true }); setNotice(get('privacy-settings-feedback'), t('Modellerne kunne ikke hentes. Dit valg er bevaret. Prøv igen.', 'Models could not be loaded. Your choice is preserved. Try again.'), true); } }
    finally { if (version === generation) choicesLoading = false; }
  }
  let sourceNumber = 0;
  function sourceRow(source, disabled) {
    const row = make('div', undefined, 'privacy-source-row'); row.dataset.uninspectable = String(source.uninspectable === true);
    const path = make('input'); path.type = 'text'; path.id = `privacy-source-${++sourceNumber}`; path.dataset.sourcePath = ''; path.setAttribute('data-source-path', ''); path.autocomplete = 'off'; path.maxLength = 240;
    path.value = source.path || ''; path.placeholder = t('Fx data/beskyttet.csv', 'For example data/protected.csv'); path.disabled = disabled;
    const pathField = make('div'); pathField.append(label(t('Fil eller mappe i projektet', 'File or folder in the project'), path), path);
    const classification = make('select'); classification.id = `${path.id}-class`; classification.setAttribute('data-source-class', '');
    for (const id of CLASSES) { const option = make('option', classLabel(id)); option.value = id; classification.append(option); } classification.value = CLASSES.includes(source.classification) ? source.classification : 'confidential'; classification.disabled = disabled;
    const classField = make('div'); classField.append(label(t('Dataklasse', 'Data class'), classification), classification);
    const personal = switchControl(`${path.id}-personal`, t('Personoplysninger', 'Personal data'), source.attributes?.personalData === true); personal.setAttribute('data-source-personal', ''); personal.disabled = disabled;
    const secrets = switchControl(`${path.id}-secrets`, t('Hemmeligheder', 'Secrets'), source.attributes?.secrets === true); secrets.setAttribute('data-source-secret', ''); secrets.disabled = disabled;
    const attributes = make('div', undefined, 'privacy-source-attributes'); attributes.append(personal, secrets);
    const remove = button(t('Fjern projektregel', 'Remove project rule'), () => row.remove(), 'text-button'); remove.disabled = disabled;
    row.append(pathField, classField, attributes, remove); return row;
  }
  async function saveSettings() {
    if (busy || choicesLoading || !snapshot || api.read().running) return;
    const settings = readSettings(), sourceContext = context, sourceScope = scope, version = generation; busy = true; renderSettings({ preserve: true });
    if (settings.protectedSources.some(source => !source.path.trim() || source.path.startsWith('/') || source.path.includes('\\') || source.path.split('/').includes('..'))) {
      busy = false; renderSettings({ preserve: true }); setNotice(get('privacy-settings-feedback'), t('Brug en konkret sti i projektet uden / i starten eller .. som mappeled. Ingen regler er gemt.', 'Use a specific project path without an initial / or .. path segments. No rules were saved.'), true); return;
    }
    if (settings.workMode === 'hybrid' && !['local', 'external'].every(side => settings.hybridPair?.[side]?.connectionID && settings.hybridPair[side].modelID)) {
      busy = false; renderSettings({ preserve: true }); setNotice(get('privacy-settings-feedback'), t('Vælg både en lokal model og en ekstern model med konkret destination. Ingen regler er gemt.', 'Choose a local model and an external model with an exact destination. No rules were saved.'), true); return;
    }
    try {
      const result = await api.invoke('privacyConfigure', { scope: sourceScope, settings });
      if (version !== generation || sourceContext !== context || sourceScope !== scope) return;
      let selectionSynced = true;
      if (result.selection && typeof api.selectionChanged === 'function') { try { await api.selectionChanged(result.selection); } catch { selectionSynced = false; } }
      if (version !== generation || sourceContext !== context || sourceScope !== scope) return;
      snapshot = result; busy = false; renderStatus(); renderSettings(); setNotice(get('privacy-settings-feedback'), selectionSynced ? t('Datareglerne er gemt. Modelvalget og de almindelige godkendelser er bevaret.', 'Data rules are saved. Model selection and existing approvals are preserved.') : t('Datareglerne er gemt. Hent modelvalget igen, før du sender en besked. Ingen opgave er startet.', 'Data rules are saved. Reload the model selection before sending a message. No task was started.'), !selectionSynced);
    } catch { if (version === generation) { busy = false; renderSettings({ preserve: true }); setNotice(get('privacy-settings-feedback'), t('Reglerne kunne ikke gemmes. Ingen yderligere deling er godkendt. Hent reglerne igen.', 'The rules could not be saved. No additional sharing was approved. Reload the rules.'), true); } }
    finally { if (version === generation) { busy = false; if (get('privacy-save')) get('privacy-save').disabled = !snapshot || api.read().running; } }
  }
  async function refresh({ show = false } = {}) {
    if (!api) return;
    const version = ++generation, sourceContext = context, sourceScope = scope; snapshot = null; busy = true; renderStatus();
    if (show) { renderSettings(); openDialog(settingsDialog); }
    try {
      const result = await api.invoke('privacyGet', { scope: sourceScope });
      if (version !== generation || sourceContext !== context || sourceScope !== scope) return;
      snapshot = result; busy = false; renderStatus(); if (settingsDialog.open) renderSettings();
      for (const pending of result?.pending || []) if (typeof pending?.id === 'string' && !pendingQueue.includes(pending.id) && pending.id !== reviewing?.id) pendingQueue.push(pending.id);
      void nextReview();
    } catch { if (version === generation) { busy = false; if (settingsDialog.open) { renderSettings(); setNotice(get('privacy-settings-feedback'), t('Datakontrollens status kunne ikke hentes. Der er ikke givet nogen delingstilladelse.', 'Data-control status could not be loaded. No sharing permission was granted.'), true); } } }
  }
  function closeReview() {
    clearInterval(expiryTimer); expiryTimer = null; reviewing = null; ++reviewGeneration;
    sharingDialog.replaceChildren(); closeDialog(sharingDialog); if (statusLine) statusLine.hidden = true;
  }
  async function decide(decision) {
    const review = reviewing; if (!review || review.busy || !allowedDecisions(review).includes(decision)) return;
    const version = reviewGeneration; reviewing = { ...review, busy: true }; renderReview();
    try {
      await api.invoke('privacyDecide', { id: review.id, decision });
      if (version !== reviewGeneration || reviewing?.id !== review.id) return;
      closeReview(); void nextReview();
    } catch {
      if (version !== reviewGeneration || reviewing?.id !== review.id) return;
      reviewing = { ...review, busy: false }; renderReview();
      setNotice(get('privacy-review-feedback'), t('Delingen kunne ikke godkendes. Intet er frigivet af denne dialog. Hent den aktuelle vurdering igen.', 'The sharing could not be approved. This dialog authorized nothing. Reload the current assessment.'), true);
      const reload = button(t('Hent vurdering igen', 'Reload assessment'), () => { const id = reviewing.id; closeReview(); pendingQueue.unshift(id); void nextReview(); }, 'text-button'); get('privacy-review-feedback').after(reload);
    }
  }
  function renderReview() {
    if (!reviewing) return;
    const review = reviewing, allowed = allowedDecisions(review), expired = allowed.length === 0;
    sharingDialog.replaceChildren(heading(sharingDialog, t('Gennemgå denne deling', 'Review this sharing')));
    sharingDialog.append(make('p', t('Aura 1 vil sende følgende kontrollerede modelkald. Godkendelsen gælder kun dette indhold, denne modtager og dette formål.', 'Aura 1 will send the following checked model call. Approval applies only to this content, recipient and purpose.'), 'privacy-lead'));
    const details = make('dl', undefined, 'privacy-review-meta');
    const recipient = review.destination?.name || review.destination?.label || (typeof review.recipient === 'string' ? review.recipient : review.recipient?.label || review.recipient?.name || '');
    const fields = [[t('Modtager', 'Recipient'), recipient], [t('Model', 'Model'), textValue(review.destination?.model) || textValue(review.model)], [t('Formål', 'Purpose'), textValue(review.purpose)], [t('Regelversion', 'Policy version'), textValue(review.policyVersion)]];
    if (review.destination?.locality) fields.push([t('Behandlingssted', 'Processing location'), locality(review.destination.locality)]);
    if (review.destination?.endpoint) fields.push([t('Konkret endpoint', 'Exact endpoint'), textValue(review.destination.endpoint)]);
    for (const [title, value] of fields) { const row = make('div'); row.append(make('dt', title), make('dd', value || t('Ikke oplyst', 'Not reported'))); details.append(row); }
    sharingDialog.append(details);
    sharingDialog.append(make('p', findingSummary(review.findings, language()) || t('Ingen beskyttede fund oplyst. Hele indholdet nedenfor skal fortsat gennemgås.', 'No protected findings were reported. The complete contents below still need review.'), 'privacy-findings'));
    const bodyTitle = make('h3', t('Præcis, hvad der sendes', 'Exactly what will be sent')); bodyTitle.id = 'privacy-body-title';
    const body = make('pre', typeof review.body === 'string' ? review.body : t('Indholdet kan ikke vises. Delingen kan ikke godkendes.', 'Contents cannot be displayed. Sharing cannot be approved.'), 'privacy-payload'); body.id = 'privacy-payload'; body.tabIndex = 0; body.setAttribute('aria-labelledby', bodyTitle.id);
    sharingDialog.append(bodyTitle, body);
    sharingDialog.append(make('p', t('Dette ændrer hverken din plan, filrettigheder eller Auras værktøjsgodkendelser. En ændret forespørgsel eller modtager skal vurderes igen.', 'This does not change your plan, file permissions or Aura’s tool approvals. A changed request or recipient must be assessed again.'), 'privacy-footnote'));
    const expiry = make('p', expired ? t('Vurderingen er udløbet eller ufuldstændig. Ingen afsendelse er godkendt.', 'The assessment expired or is incomplete. No sending was approved.') : t('Denne konkrete deling afventer dit valg.', 'This specific sharing awaits your choice.'), 'privacy-feedback'); expiry.id = 'privacy-review-feedback'; expiry.setAttribute('role', 'status'); sharingDialog.append(expiry);
    const actions = make('div', undefined, 'privacy-actions');
    for (const [id, da, en, style] of [['local', 'Behandl lokalt', 'Process locally', ''], ['cancel', 'Annuller', 'Cancel', 'text-button'], ['approve', 'Godkend denne deling', 'Approve this sharing', 'primary']]) {
      if (!allowed.includes(id)) continue; const value = button(t(da, en), () => { void decide(id); }, style); value.dataset.privacyDecision = id; value.disabled = review.busy === true; actions.append(value);
    }
    if (expired) actions.append(button(t('Luk', 'Close'), () => { closeReview(); void nextReview(); }, 'text-button'));
    sharingDialog.append(actions);
  }
  async function nextReview() {
    if (!api || reviewing || loadingReviewID || !pendingQueue.length) return;
    const id = pendingQueue.shift(), version = ++reviewGeneration; loadingReviewID = id;
    try {
      const review = await api.invoke('privacyReview', { id });
      if (version !== reviewGeneration || reviewing) return;
      // The full review must be obtained from the trusted host, never reconstructed
      // from activity events or conversation text.
      if (!review || review.id !== id) { void nextReview(); return; }
      reviewing = review; renderReview(); if (settingsDialog.open) closeDialog(settingsDialog); openDialog(sharingDialog);
      statusLine.textContent = t('Deling afventer din godkendelse.', 'Sharing awaits your approval.'); statusLine.hidden = false;
      expiryTimer = setInterval(() => { if (reviewing && !allowedDecisions(reviewing).length) { clearInterval(expiryTimer); expiryTimer = null; renderReview(); } }, 500);
    } catch { if (version === reviewGeneration) { statusLine.textContent = t('Delingen kunne ikke gennemgås. Ingen afsendelse er godkendt.', 'Sharing could not be reviewed. No sending was approved.'); statusLine.hidden = false; } }
    finally { if (loadingReviewID === id) loadingReviewID = null; if (!reviewing) void nextReview(); }
  }
  function onEvent(event) {
    if (!connected) return;
    if (event?.type === 'privacy.review') {
      const id = event.id || event.properties?.id;
      if (typeof id === 'string' && id !== reviewing?.id && !pendingQueue.includes(id)) { pendingQueue.push(id); void nextReview(); }
    }
    if (event?.type === 'privacy.resolved') {
      const id = event.id || event.properties?.id; pendingQueue = pendingQueue.filter(value => value !== id);
      if (loadingReviewID === id) { ++reviewGeneration; loadingReviewID = null; }
      if (reviewing?.id === id) { closeReview(); void nextReview(); }
    }
    if (event?.type === 'privacy.activity' && statusLine) {
      // Do not display untrusted model text, payloads, filenames or host error bodies.
      const decision = event.decision || event.properties?.decision;
      const message = { allow: t('Modelkaldet er tilladt af datareglerne.', 'The model call is allowed by the data rules.'), rewrite: t('Modelkaldet er bearbejdet og kontrolleret igen.', 'The model call was rewritten and checked again.'), local: t('Det beskyttede modeltrin kræver lokal behandling.', 'The protected model step requires local processing.'), block: t('Modelkaldet blev blokeret af datareglerne.', 'The model call was blocked by the data rules.'), approval: t('Deling afventer din godkendelse.', 'Sharing awaits your approval.') }[decision];
      if (message) { statusLine.textContent = message; statusLine.hidden = false; }
    }
  }
  function sync() {
    if (!api) return;
    const next = contextKey(api.read());
    if (context !== next) {
      context = next; scope = api.read().root ? 'project' : 'idea'; snapshot = null; choicesLoading = false; ++generation; renderStatus();
      if (settingsDialog.open) { closeDialog(settingsDialog); }
      // Existing host pending decisions stay bound to their task. Navigating does
      // not approve or rebind a sharing; only the exact opaque review id is used.
      refreshPromise = refresh();
    }
    const save = get('privacy-save'); if (save) save.disabled = busy || choicesLoading || !snapshot || api.read().running;
  }
  function open() { sync(); void refresh({ show: true }); }
  window.PrivacyGate = { connect(value) {
    if (connected || !value || typeof value.read !== 'function' || typeof value.invoke !== 'function') return;
    api = value; connected = true;
    settingsDialog = make('dialog', undefined, 'privacy-dialog privacy-settings'); settingsDialog.id = 'privacy-settings-dialog'; settingsDialog.setAttribute('data-i18n-content', '');
    sharingDialog = make('dialog', undefined, 'privacy-dialog privacy-sharing'); sharingDialog.id = 'privacy-sharing-dialog'; sharingDialog.setAttribute('data-i18n-content', '');
    settingsDialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(settingsDialog); });
    sharingDialog.addEventListener('cancel', event => { event.preventDefault(); if (allowedDecisions(reviewing).includes('cancel')) void decide('cancel'); else if (!allowedDecisions(reviewing).length) closeReview(); });
    document.body.append(settingsDialog, sharingDialog);
    for (const [anchor, id, placement] of [[get('connections-button'), 'privacy-settings-button', 'after'], [get('advanced-model-context'), 'privacy-model-button', 'before'], [get('context-status'), 'privacy-gate-button', 'after']]) {
      if (!anchor) continue; const entry = button(t('Datakontrol og arbejdsform', 'Data control and work mode'), open, 'text-button privacy-entry'); entry.id = id; entry.setAttribute('aria-haspopup', 'dialog'); entry.setAttribute('aria-controls', settingsDialog.id); anchor[placement](entry);
    }
    statusLine = make('p', '', 'privacy-status'); statusLine.id = 'privacy-gate-status'; statusLine.setAttribute('role', 'status'); statusLine.hidden = true; get('chat-form')?.before(statusLine);
    window.addEventListener('aura:languagechange', () => { renderStatus(); if (settingsDialog.open) renderSettings({ preserve: true }); if (reviewing) renderReview(); });
    sync();
  }, open, sync, onEvent, refresh: () => refresh(), settled: () => refreshPromise };
})();
