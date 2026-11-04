const $ = selector => document.querySelector(selector);
let current = null, revision = null, polling = false, state = null, modelRequest = 0, acceptedFingerprint = null, pendingSend = null, running = false;
// The project "Nyt projekt" left open in the background — the idea surface's
// quiet return link (hidden on the first-run surface, where there is nothing
// behind it) brings it back through displayProject.
let ideaReturn = null;
let projectLoading = true, projectDisplayRequest = 0, navigationRequest = 0, startupLoads = 0;
// All owners contribute to availability. Finishing one task must not unlock a
// form still owned by startup, project creation or idea refinement.
function syncCreateAvailability() {
  $('#create').disabled = projectLoading || startupLoads > 0 || $('#idea-refinement').getAttribute('aria-busy') === 'true';
  $('#create').textContent = projectLoading ? 'Åbner projektmappen …' : 'Opret projekt';
}
// Et accepteret resumé gælder samme modelsession og samme delte materiale, også filhenvisninger.
const reviewKey = data => `${data.fingerprint}|${data.consentKey}`;
let skillList = [], skillOwner = null, featuresOwner = null;
function message(text, error = false) {
  const dialog = [...document.querySelectorAll('dialog[open]')].at(-1);
  if (dialog) { let notice = dialog.querySelector('.dialog-notice'); if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-notice'; notice.setAttribute('role', 'status'); dialog.append(notice); } notice.textContent = text; }
  // Beskeden tager sin egen plads, så den aldrig dækker skrivefeltet eller en knap.
  const surface = current && !$('#workspace').hidden ? $('#workspace') : !$('#setup').hidden ? $('#setup') : $('#onboarding');
  const anchor = surface.id === 'workspace' ? surface.querySelector('.work-grid') : surface.id === 'onboarding' ? $('#create-form') : surface.querySelector('section');
  (anchor?.parentElement || surface).insertBefore($('#message'), anchor);
  $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = false;
}
async function call(method, value, owner) { const result = await window.harness[method](value, owner); if (!result.ok) throw new Error(result.error); return result.value; }
const selectedOwner = () => current ? { root: current.root, chat: view.id } : null;
async function action(fn) { $('#message').hidden = true; try { return await fn(); } catch (error) { message(error.message, true); } }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
// Hver samtale har sin egen visning: beskeder, godkendelser, resultatkort, plan og status for dens opgave. Kun den åbne
// samtales visning står i siden med de faste id'er; de andre lever videre og opdateres af deres egne hændelser.
const views = new Map();
function makeView(id) {
  const v = { id, historyPending:[], historyLoaded:false, historyNotice:'', log: node('div'), approvals: node('div'), review: node('section', undefined, 'journey-card'), roles: new Map(), parts: new Map(), partTypes: new Map(), assistantText: new Map(), pendingMarkdown: new Set(), activityGroup: null, lastSentText: '', lastTarget: '', lastTargetRef: null, lastCheckpoint: null, rejectedThisRun: false, lastRejection: null, running: false, runStartedAt: 0, runLabel: '', statusDetail: '', waitingFor: [], plan: null, planCard: false, unread: false, draft: null, followChat: true, scrollTop: 0, lastSignalAt: 0, receivedChars: 0 };
  v.log.setAttribute('role', 'log'); v.review.hidden = true; v.review.setAttribute('aria-live', 'polite');
  // Every view's approvals surface is essential (godkendelser): the help level
  // can never hide it — mountView swaps this element into the page.
  v.approvals.setAttribute('data-help', 'essential');
  if (id) views.set(id, v);
  return v;
}
let view = makeView(null);
view.log = document.getElementById('messages'); view.approvals = document.getElementById('approvals'); view.review = document.getElementById('run-review');
const viewFor = id => !id ? view : views.get(id) || makeView(id);
// Den åbne samtales visning sættes i siden. Status, plan og knapper følger den.
function mountView(v) {
  if (view !== v) view.scrollTop = $('#chat-content').scrollTop;
  for (const [key, id] of [['log', 'messages'], ['approvals', 'approvals'], ['review', 'run-review']]) {
    const old = document.getElementById(id); if (old === v[key]) continue;
    old.removeAttribute('id'); v[key].id = id; old.replaceWith(v[key]);
  }
  view = v; v.root ||= current?.root || null;
  window.harness.selectContext?.(current ? { root: current.root, chat: v.id } : null);
  acceptedFingerprint = null; pendingSend = null;
  requestAnimationFrame(() => { if (view !== v) return; $('#chat-content').scrollTop = v.followChat ? $('#chat-content').scrollHeight : v.scrollTop; updateChatScroll(); }); v.unread = false; running = v.running; activePlan = v.plan;
  $('#plan-card').hidden = !v.planCard || !v.plan;
  updatePlanOffer(v);
  applyRunning(); renderHistoryControls(); window.ConversationPermission?.sync();
}
const anyRunning = () => running || [...views.values()].some(v => v.running);
// En samtales navn, som sidepanelet viser det.
const chatTitle = id => window.chats?.projects().find(project => project.root === current?.root)?.chats?.find(chat => chat.id === id)?.title || 'Ny samtale';
// ⓘ: en kort forklaring, der åbnes med et klik og lukkes med Escape eller et klik udenfor. Teksten står i knappens data-info.
// Boblen flyttes ind i den åbne dialog, så den ikke bliver utilgængelig bag en modal dialog.
const infoPop = node('div', '', 'info-pop menu-material aura-tooltip'); infoPop.id = 'info-pop'; infoPop.popover = 'auto'; infoPop.setAttribute('role', 'dialog'); infoPop.tabIndex = -1;
let infoSource = null, infoClosed = { at: 0, source: null };
function info(label, text) { const button = node('button', 'i', 'info'); button.type = 'button'; button.setAttribute('aria-label', `Mere om ${label}`); button.setAttribute('aria-expanded', 'false'); button.dataset.info = text; return button; }
function showInfo(button) {
  // Et klik uden for boblen lukker den allerede ved museklikket. Et klik på samme ⓘ skal derfor ikke åbne den igen.
  if (infoClosed.source === button && performance.now() - infoClosed.at < 400) return;
  const open = infoPop.matches(':popover-open');
  if (open) infoPop.hidePopover();
  if (open && infoSource === button) return;
  infoSource = button; infoPop.textContent = button.dataset.info; infoPop.setAttribute('aria-label', button.getAttribute('aria-label') || 'Forklaring');
  (button.closest('dialog[open]') || document.body).append(infoPop);
  // Boblen anker centreret under knappen gennem det fælles popover-lag og
  // følger zoom, rulning og vinduesstørrelse, mens den står åben.
  window.PopoverLayer.open({ layer: infoPop, invoker: button, align: 'center', place: 'below', gap: 8, margin: 16, width: () => Math.min(320, innerWidth - 32) });
  button.setAttribute('aria-expanded', 'true');
  infoPop.focus();
}
// beforetoggle kommer med det samme, når et klik udenfor lukker boblen; toggle kommer først efter klikket.
// Knappens aria-expanded følger boblen med det samme; toggle kommer først senere, og så ville tilstanden halte bagefter.
infoPop.addEventListener('beforetoggle', event => { if (event.newState === 'closed' && infoSource) { infoClosed = { at: performance.now(), source: infoSource }; infoSource.setAttribute('aria-expanded', 'false'); } });
infoPop.addEventListener('toggle', event => {
  if (event.newState !== 'closed' || !infoSource || infoPop.matches(':popover-open')) return;
  if (document.activeElement === document.body || infoPop.contains(document.activeElement)) infoSource.focus();
});
document.addEventListener('click', event => { const button = event.target.closest('button.info'); if (button) { event.preventDefault(); event.stopPropagation(); showInfo(button); } }, true);
// Sidepanelets projekter og samtaler: se chats.js.
async function refreshRecent() { await window.chats?.refresh(); }
let draftTimer;
async function saveChatDraft(required = false) {
  clearTimeout(draftTimer);
  if (!current) return;
  const root = current.root, chat = view.id, text = $('#prompt').value, mode = $('#work-mode').value;
  if (!chat) return;
  view.draft = { text, mode };
  try { localStorage.setItem(`harness.chatDraft.${root}.${chat}`, JSON.stringify({ text, mode })); } catch {}
  setDraftStatus('Gemmer kladde …');
  try { await call('saveDraft', { root, chat, text, mode }, { root, chat }); if (current?.root === root && view.id === chat && $('#prompt').value === text) setDraftStatus('Kladde gemt på denne computer'); }
  catch { if (current?.root === root && view.id === chat) setDraftStatus('Kladden kunne ikke gemmes. Kopiér teksten, før du lukker.', false); if (required === true) throw new Error('Kladden kunne ikke gemmes. Kopiér teksten, før du opdaterer.'); }
}
function option(value, label) { const el = node('option', label); el.value = value; return el; }
// Keep model text inert; external links cross the validated main-process boundary.
function markdownInto(element, text) {
  window.MarkdownView.render(element, text, {
    visible: value => window.ConversationMode.visible(value),
    copy: element.classList.contains('assistant') ? value => navigator.clipboard.writeText(value) : undefined,
    openLink: async url => { const result = await window.harness.openExternalLink({ url }); if (!result.ok) throw new Error(result.error); },
    decorate: target => { window.ChatDisplay.swatches(target); window.workspace?.linkify(target); }
  });
}
// Under streaming gemmes den rå tekst, og visningen opdateres højst én gang pr. skærmopdatering.
function showAssistant(id, text, v = view) {
  v.assistantText.set(id, text); partElement(id, 'assistant', v);
  if (!v.pendingMarkdown.size) requestAnimationFrame(() => { for (const part of v.pendingMarkdown) markdownInto(partElement(part, 'assistant', v), v.assistantText.get(part)); v.pendingMarkdown.clear(); });
  v.pendingMarkdown.add(id);
}
function appendMessage(text, role = 'assistant', v = view, at) {
  const active = v === view;
  if (active) { $('#project-intro').hidden = true; $('#start-idea').hidden = true; $('#chat-choice').hidden = true; }
  const el = node('div', '', `chat-message ${role}`);
  if (role === 'user') {
    // §6.2: boblen bærer teksten; handlingsrækken (tid + kopiér) står under
    // boblen på lærredet. Tiden er modtagelsestidspunktet, når det er kendt
    // (gemt med beskeden fra D4b) — der opfindes intet tidspunkt.
    el.append(node('div', text, 'user-bubble'));
    el.append(userActions(text, at));
    if (active) for (const message of v.log.querySelectorAll('.chat-message.user.message-latest')) message.classList.remove('message-latest');
    el.classList.add('message-latest');
  } else if (text) markdownInto(el, text);
  v.log.append(el);
  // Første besked flytter samtalen fra hero til active — composeren dokker.
  if (active) applyChatPhase();
  if (active && role === 'user') view.followChat = true;
  return el;
}
// Handlingsrækken under brugerboblen (§6.2): tid i 13 px tertiær med
// tabelcifre og et kopiér-ikon. Rækken fader ind ved hover/fokus; den seneste
// besked har den altid synlig (CSS: .message-latest).
function userActions(text, at) {
  const row = node('div', undefined, 'chat-message-actions');
  const time = node('time', Number.isFinite(at) ? new Date(at).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : '', 'chat-message-time');
  if (Number.isFinite(at)) time.dateTime = new Date(at).toISOString();
  time.hidden = !Number.isFinite(at);
  const copy = node('button', '', 'chat-message-copy'); copy.type = 'button';
  copy.setAttribute('aria-label', 'Kopiér beskeden'); copy.title = 'Kopiér beskeden';
  copy.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/></svg>';
  copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.setAttribute('aria-label', 'Kopieret'); setTimeout(() => copy.setAttribute('aria-label', 'Kopiér beskeden'), 1500); } catch { copy.setAttribute('aria-label', 'Kunne ikke kopiere'); } };
  row.append(time, copy);
  return row;
}
const chatContent = $('#chat-content');
function updateChatScroll() { $('#chat-latest').hidden = chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight < 48; }
chatContent.addEventListener('scroll', () => { view.followChat = chatContent.scrollHeight - chatContent.scrollTop - chatContent.clientHeight < 48; view.scrollTop = chatContent.scrollTop; updateChatScroll(); }, { passive: true });
chatContent.addEventListener('wheel', event => { if (event.deltaY < 0) view.followChat = false; }, { passive: true });
new MutationObserver(() => { if (view.followChat) chatContent.scrollTop = chatContent.scrollHeight; updateChatScroll(); }).observe(chatContent, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
$('#chat-latest').onclick = () => { view.followChat = true; chatContent.scrollTop = chatContent.scrollHeight; updateChatScroll(); };
let guidedSetup = false, setupStep = 'choice';
let connectionReceipt=null, connectionTicket=0;
let setupActive = false, setupGeneration = 0, verifiedConnection = '', recovery = '';
// F20 changes presentation only; connection checks and all actions remain owned by the existing controllers.
let onboardingPreviewKind = '';
// The four onboarding steps in order: Din profil, Detaljeniveau, Forbindelse
// (the choice and its sub-steps) and Din idé. The idea step lives on its own
// surface (#onboarding), so the discrete counter under the back button reads
// this map for every setup step.
const SETUP_STEPS = Object.freeze({ profile: 1, detail: 2, choice: 3, provider: 3, local: 3, saved: 3, tools: 3 });
// The onboarding profile step holds pure UI state: the fields are saved through
// profileSave and never reach prompts, the model log or diagnostics.
let profileStepShown = false, profileIconChoice = '';
const profileChoiceKey = 'aura.profile-choice.v1';
function hasProfileChoice() { try { return ['saved', 'skipped'].includes(localStorage.getItem(profileChoiceKey)); } catch { return false; } }
function recordProfileChoice(value) { try { localStorage.setItem(profileChoiceKey, value); } catch { /* This preference never blocks local use. */ } }
// Whether the stored avatar file exists — the main process owns the truth and
// answers it with every profile read, upload and removal.
let profileAvatarAvailable = false;
function syncOnboardingVisuals() {
  if (!window.OnboardingB) return;
  const selected = state?.connections?.find(c => c.id === $('#setup-connection').value);
  const details = setupStep === 'provider' && $('#setup-provider').dataset.view === 'details';
  const setupConnection = details ? state?.connections?.find(c => c.id === $('#connection-id').value) : setupStep === 'saved' ? selected : null;
  const setupCheck = setupConnection && connectionChecks.get(setupConnection.id);
  const kind = details ? $('#provider-kind').value : setupStep === 'local' ? 'ollama' : setupConnection?.kind || onboardingPreviewKind || '';
  const phase = setupStep === 'profile' || setupStep === 'detail' ? 'profile' : setupStep === 'saved' || setupStep === 'local' || details ? 'connection' : setupStep === 'provider' ? 'provider' : 'choice';
  const checked = Boolean(setupConnection && setupConnection.kind === kind && verifiedConnection === setupConnection.id && setupCheck?.status === 'ok' && setupCheck.count);
  // The simple restyle removed the setup's and the idea screen's visual
  // asides; the module stays for the model dialog's #model-visual. Every
  // render is guarded by its element, so a missing surface skips cleanly.
  const setupVisual = $('#setup-visual');
  if (setupVisual) window.OnboardingB.render(setupVisual, { kind, phase, preview: setupStep === 'provider' && !details, connectionName: setupConnection?.name || '', saved: Boolean(setupConnection), checked, error: setupCheck?.status === 'error', pending: setupCheck?.status === 'checking' });
  const connection = state?.connections?.find(c => c.id === $('#connection-select').value);
  const check = connection && connectionChecks.get(connection.id);
  const model = $('#model-select');
  window.OnboardingB.render($('#model-visual'), { kind: connection?.kind || '', phase: 'model', connectionName: connection?.name || '', modelName: model.value ? model.selectedOptions[0]?.textContent || model.value : '', saved: Boolean(connection), checked: Boolean(check?.status === 'ok' && check.count), error: check?.status === 'error', pending: check?.status === 'checking', modelChosen: Boolean(model.value) });
  const ideaVisual = $('#idea-visual');
  if (ideaVisual) {
    const startup = state?.connections?.find(c => c.id === $('#startup-connection').value);
    const startupCheck = startup && connectionChecks.get(startup.id);
    window.OnboardingB.render(ideaVisual, { kind: startup?.kind || '', phase: 'idea', connectionName: startup?.name || '', saved: Boolean(startup), checked: Boolean(startupCheck?.status === 'ok' && startupCheck.count), error: startupCheck?.status === 'error' });
  }
}

// Profilen er eneste kilde for appens standarder: arbejdsmåden i helt nye
// samtaler, standard-AI'et i nye projekter og panelets starttilstand.
// profileState hentes ved start efter migrationen og genoptages efter hver
// profilgemning; preferredConnection foder fra profilen, og den gamle
// localStorage-nøgle læses kun én gang som migreringskilde.
let profileState = null;
let preferredConnection = '', autoConnect = false;
try { preferredConnection = localStorage.getItem('harness.preferredConnection') || ''; } catch {}
function setupControls() {
  syncCreateAvailability();
  const id = $('#setup-connection').value, busy = projectLoading;
  $('#setup-test').disabled = !id || busy;
  $('#setup-continue').disabled = !id || verifiedConnection !== id || busy;
  $('#new').disabled = busy; $('#new-chat').disabled = busy; $('#open').disabled = busy;
  $('#skills-button').disabled = busy || setupActive || !current; $('#features-button').disabled = busy;
  $('#setup-local').disabled = busy;
  $('#setup-git-open').disabled = busy;
  $('#setup-edit').disabled = !id || busy;
  $('#setup-continue').hidden = verifiedConnection !== id || !id;
  $('#setup-test').hidden = Boolean(id && verifiedConnection === id);
  $('#setup-add-another').hidden = !id || verifiedConnection !== id;
  syncOnboardingVisuals();
}
function moveConnectionForm(guided, addFlow = false) {
  // Formularen har tre hjem: den guidede opsætning, dialogens redigeringsvisning
  // og dialogens lette tilføj-flow. Det samme formular- og feedbackelement flytter.
  const parent = addFlow ? $('#add-connection-home') : guided ? $('#setup-provider-body') : $('#connection-form-home');
  if (!guided) $('#connection-advanced').hidden = false;
  parent.append($('#connection-form'), $('#connection-feedback'));
  $('#save-connection').textContent = guided || addFlow ? 'Gem og kontrollér' : 'Gem forbindelse';
  // En helt ny forbindelse i tilføj-flowet har endnu ingen gemt nøgle at fjerne.
  $('#clear-key-row').hidden = addFlow || guided && !$('#connection-id').value;
}
function setupPage(step) {
  ++setupGeneration;
  setupStep = step;
  const headings = { profile: ['Din lokale profil', 'Profilen er valgfri. Du kan også tilpasse Aura senere under Indstillinger.'], detail: ['Hvor meget vil du se af AI’ens arbejde?', 'Det ændrer kun, hvordan arbejdet vises — ikke hvad Aura kan.'], choice: ['Hvordan vil du forbinde din AI?', 'Vælg den adgang, du allerede har.'], provider: ['Hvem er din udbyder?', 'Har du ikke en nøgle, viser vi dig, hvordan du får en.'], local: ['AI på din computer', 'Vi leder efter modeller, du allerede har i Ollama.'], saved: ['Din AI-forbindelse', 'Kontrollér forbindelsen, før du fortsætter.'], tools: ['Avanceret opsætning', 'Forbindelser og lokale værktøjer.'] };
  $('#setup-title').textContent = headings[step][0]; $('#setup-subtitle').textContent = headings[step][1];
  for (const el of document.querySelectorAll('[data-setup-step]')) el.hidden = el.dataset.setupStep !== step;
  moveConnectionForm(step === 'provider');
  $('#setup-advanced').hidden = step !== 'choice';
  // The profile and detail steps own their complete action rows (Fortsæt and,
  // on the detail step, its own "Vælg senere"); the quick actions under the
  // sections belong to the connection choice and its sub-steps.
  $('.setup-quick-actions').hidden = step === 'profile' || step === 'detail';
  $('#setup').dataset.step = step;
  // The discrete counter under the back button (Parthee's approved "Trin N
  // af 4"); the idea step is number 4 on its own surface (#onboarding).
  $('#setup-step-state').textContent = `Trin ${SETUP_STEPS[step] ?? 3} af 4`;
  $('#setup-title').focus(); window.scrollTo(0, 0); setupControls();
}
// The profile step in onboarding: name, icon, theme and help level. Every field is
// optional; "Fortsæt" saves the whole set, and empty strings are valid profile values.
// The icon choice is one compact row: the initials, the three Aura variants and
// the avatar slot — an upload button until a picture is stored, a selectable
// rounded preview afterwards. The picture itself is the main process's business:
// the row only asks for the picker and renders the outcome.
function renderProfileIconRow() {
  const row = $('#profile-icon-row'), ids = window.ProfileIcons?.IDS || [];
  const initialsChoice = node('button', undefined, 'profile-icon-choice profile-initials');
  initialsChoice.type = 'button';
  initialsChoice.dataset.icon = '';
  initialsChoice.setAttribute('role', 'radio'); initialsChoice.setAttribute('aria-checked', 'false');
  initialsChoice.setAttribute('aria-label', 'Initialer');
  renderProfileInitialsChoice(initialsChoice);
  initialsChoice.onclick = () => selectProfileIcon('');
  const choices = [initialsChoice, ...ids.map(id => {
    const choice = node('button', undefined, 'profile-icon-choice'); choice.type = 'button';
    choice.dataset.icon = id; choice.setAttribute('role', 'radio'); choice.setAttribute('aria-checked', 'false');
    choice.setAttribute('aria-label', window.ProfileIcons?.LABELS?.[id] || id);
    choice.innerHTML = window.ProfileIcons.svg(id);
    choice.onclick = () => selectProfileIcon(id);
    return choice;
  })];
  const slot = node('button', undefined, 'profile-icon-choice profile-avatar-slot'); slot.type = 'button';
  if (profileAvatarAvailable) {
    slot.dataset.icon = 'upload';
    slot.setAttribute('role', 'radio'); slot.setAttribute('aria-checked', 'false');
    slot.setAttribute('aria-label', window.ProfileIcons?.LABELS?.upload || 'Eget billede');
    slot.innerHTML = window.ProfileIcons.avatarImage();
    window.ProfileIcons?.attachAvatarFallback?.(slot, initialsPreview());
    slot.onclick = () => selectProfileIcon('upload');
  } else {
    slot.id = 'profile-avatar-slot';
    slot.setAttribute('aria-label', 'Upload eget billede');
    slot.title = 'Upload eget billede';
    slot.innerHTML = window.ProfileIcons.svg('upload');
    slot.onclick = () => action(uploadProfileAvatar);
  }
  row.replaceChildren(...choices, slot);
  // T8 (ventelistens parked minor): ikonvælgeren er ét tab-stop med roving
  // tabindex — pile flytter fokus (uden at vælge), Home/End går til enderne.
  window.ProfileIcons?.wireRadioGroup?.(row);
  $('#profile-avatar-remove').hidden = !profileAvatarAvailable;
}
// Empty identity uses a person affordance. Initials follow only a name the user entered.
function initialsPreview() {
  return window.ProfileIcons?.initials($('#profile-name').value.trim()) || '';
}
function renderProfileInitialsChoice(choice) {
  const initials = initialsPreview();
  choice.textContent = initials;
  if (!initials) choice.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';
}
function updateProfileInitialsPreview() {
  const initialsChoice = document.querySelector('#profile-icon-row .profile-initials');
  if (initialsChoice) renderProfileInitialsChoice(initialsChoice);
}
function selectProfileIcon(icon) {
  profileIconChoice = window.ProfileIcons?.IDS.includes(icon) || icon === 'upload' && profileAvatarAvailable ? icon : '';
  for (const choice of document.querySelectorAll('#profile-icon-row button')) {
    const selected = choice.dataset.icon === profileIconChoice;
    choice.setAttribute('aria-checked', String(selected));
  }
}
function profilePatch() {
  const theme = [...document.querySelectorAll('#profile-theme input')].find(input => input.checked)?.value;
  // Appearance is one unit: the theme from the step, the panel's start state
  // from the cached profile — a migrated panelOpen: false is never reset here.
  return { name: $('#profile-name').value.trim(), icon: profileIconChoice, helpLevel: $('#profile-help').value, appearance: { theme: theme === 'light' || theme === 'dark' ? theme : 'system', panelOpen: profileState?.appearance?.panelOpen !== false } };
}
async function prepareProfileStep(profile) {
  renderProfileIconRow();
  // Identity is an explicit local choice. Never adopt the macOS account name.
  $('#profile-name').value = profile?.name || '';
  updateProfileInitialsPreview();
  selectProfileIcon(profile?.icon || '');
  for (const input of document.querySelectorAll('#profile-theme input')) input.checked = input.value === (profile?.appearance?.theme || 'system');
  $('#profile-help').value = profile?.helpLevel || 'fuld';
  syncProfileHelpCards();
}
async function saveProfileStep() {
  const patch = profilePatch();
  try {
    const saved = await call('profileSave', patch);
    // The cache and the announcement carry the canonical profile: the chip and
    // every recommendation follow the saved values without a restart.
    adoptProfile(saved.profile);
    announceProfileSaved(saved.profile);
    // The presentation applies the save at once: the theme hands over to the
    // calm workspace (so the hint copy never goes stale), and the chosen help
    // level applies from this moment — not after a restart. The first session
    // is exactly when the help choice matters.
    await applyProfilePresentation();
  } catch { /* saving the profile never blocks the setup */ }
}
// The profile is presentation state: after a restart the help level and theme
// must be in effect from the app's first paint, not only after a visit to
// settings. The hint copy refreshes from the profile — the single source.
async function applyProfilePresentation() {
  try {
    // After the startup pass the profile is already read; only without it is
    // it fetched here, so the presentation never shows a stale theme.
    const { profile } = profileState ? { profile: profileState } : await call('profileGet');
    // All three help levels map to their own body class; 'fuld' carries none,
    // so removing both classes restores the standing hints.
    document.body.classList.toggle('help-delvis', profile.helpLevel === 'delvis');
    document.body.classList.toggle('help-ingen', profile.helpLevel === 'ingen');
    // The transcript detail level maps the same way, but every level carries
    // its own class — 'standard' (Nøgletrin) is the neutral default, and the
    // workspace writers key on the explicit class. An unreadable value folds
    // to 'standard', like the lenient read in the main process.
    const transcriptView = ['compact', 'detailed'].includes(profile.transcriptView) ? profile.transcriptView : 'standard';
    document.body.classList.toggle('transcript-compact', transcriptView === 'compact');
    document.body.classList.toggle('transcript-standard', transcriptView === 'standard');
    document.body.classList.toggle('transcript-detailed', transcriptView === 'detailed');
    window.calmWorkspace?.setTheme?.(profile.appearance?.theme);
  } catch { /* the profile is optional at startup */ }
}
// The profile is adopted: the cache, the standard AI and the chat-choice
// recommendation follow along every time the profile is read or saved.
function adoptProfile(profile) {
  profileState = profile || null;
  preferredConnection = profile?.standardAI?.connectionID || '';
  applyChatChoiceRecommendation();
}
// Every successful profile save from this file is announced with the canonical
// profile, like the saves from Indstillinger and the workspace writers: the
// sidebar chip and the cache follow along without a restart.
function announceProfileSaved(profile) {
  try { window.dispatchEvent(new CustomEvent('aura:profile-saved', { detail: profile })); } catch { /* an announcement never blocks the flow */ }
}
// The startup one-shot migration: the three retired localStorage keys are sent
// to profile:migrate and deleted only after the confirmed save — otherwise
// they wait for the next start. The main process is idempotent through the
// migrated marker, so a repeated call changes nothing.
async function migrateLegacyProfile() {
  const legacyKeys = [['harness.preferredConnection', 'preferredConnection'], ['harness-workspace-theme-v1', 'workspaceTheme'], ['aura-surface-open', 'surfaceOpen']];
  const legacy = {};
  for (const [key, field] of legacyKeys) { try { const value = localStorage.getItem(key); if (value !== null) legacy[field] = value; } catch { /* without local storage there is nothing to migrate */ } }
  let migrated = false;
  try { await call('profileMigrate', legacy); migrated = true; } catch { /* the keys wait for the next start */ }
  if (migrated) for (const [key] of legacyKeys) { try { localStorage.removeItem(key); } catch {} }
}
// The startup profile pass in one order: migration, read, the aura:profile
// event for the consumers, and then the presentation (help level and theme),
// so the profile's theme always wins over a previous session's hint. The
// migration in this pass pins the features default in the same atomic store
// update the main process also performs before the window is created; a
// connectionState answer fetched before this point (app.js's startup order)
// can carry the pre-pin package, so the features are re-read here — also when
// the migration itself failed (the main process's pin still applies), and the
// action's applyFeatures() applies what the store now says.
async function startupProfile() {
  await migrateLegacyProfile();
  try { const read = await call('profileGet'); profileAvatarAvailable = read.hasAvatar === true; window.ProfileIcons?.setAvatarRevision?.(read.avatarRevision || 0); adoptProfile(read.profile); } catch { /* the profile is optional at startup */ }
  window.dispatchEvent(new CustomEvent('aura:profile', { detail: profileState || {} }));
  await applyProfilePresentation();
  try { if (state?.features) state.features = await call('featuresGet'); } catch { /* the features keep the connectionState answer */ }
}
// The three help cards are the visible choice surface for #profile-help; the
// hidden select keeps the save path byte-for-byte (profilePatch and
// prepareProfileStep read and write its value). One sync after every write
// keeps the pair from drifting; a card change writes the select back.
function syncProfileHelpCards() {
  const value = $('#profile-help').value;
  for (const input of document.querySelectorAll('#setup-profile .help-cards input')) input.checked = input.value === value;
}
for (const input of document.querySelectorAll('#setup-profile .help-cards input')) input.onchange = () => { $('#profile-help').value = input.value; };
$('#profile-continue').onclick = () => action(async () => { await saveProfileStep(); recordProfileChoice('saved'); setupPage('detail'); });
$('#profile-skip').onclick = () => action(() => {
  // Do not let leaveSetup save values from a profile the user declined.
  profileStepShown = false;
  recordProfileChoice('skipped');
  setupPage('detail');
});
// D6 · Detaljeniveau: three radio cards between the profile and the access
// choice. Fortsæt saves only the transcript level through the shared profile
// queue; "Vælg senere" skips the step without a save, so an existing saved
// level always survives (R7 — only a brand-new profile has none, and
// blank() answers 'standard').
function detailViewValue() { return [...document.querySelectorAll('#setup-detail input')].find(input => input.checked)?.value || 'standard'; }
function prepareDetailStep(profile) {
  const value = ['compact', 'detailed'].includes(profile?.transcriptView) ? profile.transcriptView : 'standard';
  for (const input of document.querySelectorAll('#setup-detail input')) input.checked = input.value === value;
}
$('#detail-continue').onclick = () => action(async () => {
  try {
    const saved = await call('profileSave', { transcriptView: detailViewValue() });
    // The cache, the announcement and the presentation follow the canonical
    // profile, like every other profile save in the setup.
    adoptProfile(saved.profile);
    announceProfileSaved(saved.profile);
    await applyProfilePresentation();
  } catch { /* saving the profile never blocks the setup */ }
  setupPage('choice');
});
$('#detail-skip').onclick = () => action(() => setupPage('choice'));
// The avatar upload and removal run in the main process: the picker opens there,
// the picture is stored there, and this step only re-renders the row from the
// answer. A rejected upload shows its Danish error through action(); a canceled
// picker changes nothing. Both paths announce the canonical profile, so the
// sidebar chip follows along without a restart.
async function uploadProfileAvatar() {
  const result = await call('profileUploadAvatar');
  // En afbrudt vælger er en status, ikke en fejl: intet er rørt, og rækken står.
  if (result?.canceled) { message('Billedvalget blev afbrudt.'); return; }
  profileAvatarAvailable = result.hasAvatar === true;
  window.ProfileIcons?.setAvatarRevision?.(result.avatarRevision || 0);
  adoptProfile(result.profile);
  announceProfileSaved(result.profile);
  renderProfileIconRow();
  selectProfileIcon('upload');
}
async function removeProfileAvatar() {
  const result = await call('profileRemoveAvatar');
  profileAvatarAvailable = result.hasAvatar === true;
  window.ProfileIcons?.setAvatarRevision?.(result.avatarRevision || 0);
  adoptProfile(result.profile);
  announceProfileSaved(result.profile);
  renderProfileIconRow();
  selectProfileIcon('');
}
$('#profile-avatar-remove').onclick = () => action(removeProfileAvatar);
$('#profile-name').oninput = updateProfileInitialsPreview;
// Udbyderne vises på lige vilkår. Et valg åbner kun den valgte forbindelses opsætning.
const featuredProviders = [{ kind: 'anthropic' }, { kind: 'mistral' }, { kind: 'corti' }, { kind: 'alexandra' }];
const providerCards = [
  { kind: 'alexandra', name: 'Alexandra', text: 'Alexandra AI Platform.' },
  { kind: 'azure', name: 'Azure', text: 'OpenAI og Microsoft Foundry.' },
  { kind: 'anthropic', name: 'Claude', text: 'Anthropic API.' },
  { kind: 'corti', name: 'Corti', text: 'Corti API.' },
  { kind: 'compatible', name: 'Egen server', text: 'Et kompatibelt API.' },
  { kind: 'mistral', name: 'Mistral', text: 'Mistral API.' },
  { kind: 'ollama', name: 'Ollama', text: 'Lokalt eller på en server.' },
  { kind: 'openai', name: 'OpenAI', text: 'OpenAI API.' },
  { kind: 'zen', name: 'OpenCode Zen', text: 'OpenCode Zen API.' },
  { kind: 'openrouter', name: 'OpenRouter', text: 'OpenRouter API.' }
];
function providerPicker() {
  onboardingPreviewKind = '';
  clearConnectionReceipt();
  $('#setup-provider').dataset.view = 'choose'; $('#setup-provider-body').hidden = true; $('#provider-cards').hidden = false;
  $('#setup-title').textContent = 'Hvem vil du forbinde?'; $('#setup-subtitle').textContent = 'Vælg den udbyder eller server, du har adgang til.'; $('#setup-title').focus();
  syncOnboardingVisuals();
}
function chooseProvider(kind) {
  onboardingPreviewKind = kind;
  $('#provider-kind').value = kind; updateProvider();
  $('#setup-provider').dataset.view = 'details'; $('#provider-cards').hidden = true;
  $('#setup-title').textContent = `Forbind ${providerCards.find(item => item.kind === kind)?.name || kind}`;
  $('#setup-subtitle').textContent = ['ollama', 'compatible'].includes(kind) ? 'Indtast adressen på din modelserver.' : 'Brug din adgangsnøgle fra udbyderen.';
  $('#connection-advanced').hidden = false;
  $('#setup-provider-body').hidden = false; $('#setup-title').focus();
  syncOnboardingVisuals();
}
function renderProviderCards(container = $('#provider-cards'), onChoose = chooseProvider, setup = true) {
  // Opsætningsskærmen og dialogens tilføj-flow deler gengivelsen: de samme kort,
  // logoer og statuslinjer. Preview-håndtagene og onboarding-markeringen (valg-
  // krydset) hører kun til opsættelsens gitter og har ingen styles i dialogen.
  container.replaceChildren(...providerCards.map(item => {
    const card = node('button', undefined, 'provider-card'); card.type = 'button'; card.dataset.kind = item.kind;
    const logo = node('img'); logo.src = `provider-${item.kind}.svg`; logo.alt = ''; logo.width = 28; logo.height = 28;
    const status = node('small'); status.dataset.providerStatus = item.kind;
    card.append(logo, node('strong', item.name), node('span', item.text), status);
    if (setup) {
      window.OnboardingB?.decorateProviderCard(card, item.kind);
      card.addEventListener('focus', () => { onboardingPreviewKind = item.kind; syncOnboardingVisuals(); });
      card.addEventListener('pointerenter', () => { onboardingPreviewKind = item.kind; syncOnboardingVisuals(); });
    }
    card.onclick = () => onChoose(item.kind); return card;
  }));
  updateProviderStatuses();
}
function setupProvider(connection) {
  $('#connection-form').reset(); $('#connection-id').value = connection?.id || ''; $('#connection-feedback').textContent = '';
  $('#connection-form').classList.remove('all-providers'); renderProviderCards();
  $('#provider-kind').value = connection?.kind || 'anthropic'; updateProvider();
  $('.key-guide').open = false; setupPage('provider');
  if (connection) { chooseProvider(connection.kind); fillConnection(connection); }
  else providerPicker();
}
function renderSetup() {
  const previous = $('#setup-connection').value || preferredConnection;
  $('#setup-connection').replaceChildren(option('', 'Vælg forbindelse'), ...(state?.connections || []).map(c => option(c.id, c.name)));
  if (state?.connections.some(c => c.id === previous)) $('#setup-connection').value = previous;
  else verifiedConnection = '';
  $('#setup-use-saved').hidden = !state?.connections.length;
  $('#setup-saved-hint').textContent = state?.connections.length === 1 ? state.connections[0].name : 'Vælg blandt dine gemte forbindelser.';
  const removeAll = (state?.connections || []).slice();
  $('#setup-remove-all').hidden = removeAll.length === 0;
  $('#setup-remove-all').textContent = removeAll.length === 1 ? 'Fjern den gemte nøgle …' : `Fjern alle gemte nøgler (${removeAll.length}) …`;
  if (!verifiedConnection) $('#setup-ai').textContent = $('#setup-connection').value ? 'Gemt opsætning · endnu ikke kontrolleret i denne session.' : 'Tilføj en forbindelse, eller fortsæt uden AI.';
  setupControls();
}
async function setupGit() {
  $('#setup-git-refresh').disabled = true;
  try { const result = await call('setupStatus'); $('#setup-git').textContent = result.git; $('#setup-git-open').hidden = !result.project || !featureOn('versioner'); }
  finally { $('#setup-git-refresh').disabled = false; }
}
async function showSetup(reason = '', fromIntroduction = false) {
  if (fromIntroduction) $('#onboarding').classList.remove('idea-without-steps');
  guidedSetup = fromIntroduction; document.body.classList.toggle('setup-guided', fromIntroduction);
  // The profile step opens first when a guided setup starts with an empty profile:
  // a first guided introduction always has one, and a filled profile is never asked
  // again — repeat setup goes straight to the connection choice.
  let profile = null, readProfile = false;
  if (fromIntroduction) { try { const read = await call('profileGet'); profile = read.profile; profileAvatarAvailable = read.hasAvatar === true; window.ProfileIcons?.setAvatarRevision?.(read.avatarRevision || 0); readProfile = true; adoptProfile(profile); } catch { /* without a readable profile the setup starts at the connection choice */ } }
  setupActive = true; $('#setup').hidden = false; $('#workspace').hidden = true; $('#onboarding').hidden = true;
  $('#view-title').textContent = 'Opsætning'; $('#setup-reason').textContent = reason; $('#setup-reason').hidden = !reason;
  renderSetup(); profileStepShown = readProfile && !profile?.name && !profile?.icon && !hasProfileChoice();
  setupPage(profileStepShown ? 'profile' : 'choice'); action(discoverLocal);
  if (profileStepShown) { await prepareProfileStep(profile); prepareDetailStep(profile); }
}
function connectionFailed(reason) {
  invalidateConnection($('#connection-select').value, reason);
  verifiedConnection = ''; ++setupGeneration; acceptedFingerprint = null; pendingSend = null; setupControls();
  if (state?.connections.some(c => c.id === $('#connection-select').value)) $('#setup-connection').value = $('#connection-select').value;
  recovery = `AI-forbindelsen skal gennemgås: ${reason} Dit projekt og din kladde er bevaret.`;
  if (!running) { showConnectionWarning(recovery); recovery = ''; }
}
async function leaveSetup(useAI) {
  const id = $('#setup-connection').value;
  if (useAI && (!id || verifiedConnection !== id)) return;
  // Funktionen er ikke længere et spørgsmål under opsætningen: grundpakken gælder, og
  // hver funktion tilvælges ad gangen under Indstillinger › Funktioner.
  const returningToConnections = Boolean(repeatSetup);
  autoConnect = returningToConnections && !useAI ? repeatSetup.autoConnect : useAI;
  repeatSetup = null;
  // The profile fields are saved before completing the setup, and a verified
  // connection becomes the profile's standard AI when none is chosen yet.
  try {
    const patch = profileStepShown ? profilePatch() : {};
    if (useAI) {
      const current = await call('profileGet');
      profileAvatarAvailable = current.hasAvatar === true;
      adoptProfile(current.profile);
      if (!current.profile?.standardAI?.connectionID) patch.standardAI = { connectionID: id, modelID: current.profile?.standardAI?.modelID || '' };
    }
    if (Object.keys(patch).length) {
      const saved = await call('profileSave', patch);
      adoptProfile(saved.profile);
      announceProfileSaved(saved.profile);
      // The presentation hands the theme over from the saved profile and
      // applies the help level chosen in the profile step before the setup
      // hands over to the first session.
      await applyProfilePresentation();
    }
  } catch { /* saving the profile never blocks completing the setup */ }
  profileStepShown = false;
  ++setupGeneration; ++localDiscoveryGeneration; clearConnectionReceipt(); moveConnectionForm(false);
  // Review 4.11: a repeat setup (e.g. from idea refinement) never rewrites an earlier "skipped" choice.
  { let earlier = null; try { earlier = localStorage.getItem(introductionKey); } catch {} if (guidedSetup || !earlier) completeIntroduction('guided'); }
  guidedSetup = false;
  document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true; $('#workspace').hidden = !current; $('#onboarding').hidden = Boolean(current);
  $('#view-title').textContent = current ? 'Arbejdsområde' : 'Projektopstart'; setupControls();
  if (useAI && current) { const saved = $('#connection-select').value === id ? { modelID: $('#model-select').value, routeID: $('#route-select').value } : {}; $('#connection-select').value = id; await loadModels(saved); }
  applyFeatures();
  (current ? $('#prompt') : $('#purpose')).focus();
  if (returningToConnections && !useAI) $('#connections-button').click();
}
$('#setup-local').onclick = () => action(() => leaveSetup(false));
$('#setup-remove-all').onclick = () => action(async () => {
  const removeAll = (state?.connections || []).slice();
  if (!removeAll.length) return;
  const make = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
  const dialog = make('dialog', '', 'connection-removal-dialog'); dialog.id = 'remove-all-dialog'; dialog.setAttribute('data-size','confirm');
  const heading = make('h2', 'Fjern alle gemte nøgler?'); heading.id = 'remove-all-title'; dialog.setAttribute('aria-labelledby', 'remove-all-title');
  const description = make('p');
  description.append(make('strong', removeAll.length === 1 ? '1 forbindelse' : `${removeAll.length} forbindelser`), document.createTextNode(' og deres gemte adgangsoplysninger fjernes fra Aura Prime. Dine projekter og samtaler bevares.'));
  const names = make('ul', '', 'hint'); for (const connection of removeAll) names.append(make('li', connection.name || 'Forbindelse'));
  const details = make('p', 'API-nøgler tilbagekaldes ikke hos udbyderne. De kan stadig bruges i andre programmer, og du kan altid tilføje dem igen i Aura Prime.', 'hint');
  const status = make('p', '', 'connection-removal-status hint'); status.setAttribute('role', 'status'); status.hidden = true;
  const buttons = make('div', '', 'dialog-actions');
  const cancel = make('button', 'Annuller'); cancel.type = 'button'; cancel.dataset.action = 'cancel'; cancel.autofocus = true;
  const confirm = make('button', 'Fjern alle', 'danger'); confirm.type = 'button'; confirm.dataset.action = 'confirm';
  buttons.append(cancel, confirm); dialog.append(heading, description, names, details, status, buttons);
  let busy = false, settled = false;
  const dismiss = () => { if (!busy) { settled = true; dialog.close(); } };
  cancel.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', () => dialog.remove());
  confirm.addEventListener('click', async () => {
    if (busy || settled) return;
    busy = true; cancel.disabled = confirm.disabled = true; dialog.setAttribute('aria-busy', 'true'); status.hidden = false;
    let removed = 0;
    for (const connection of removeAll) {
      status.textContent = `Fjerner ${removed + 1} af ${removeAll.length} · ${connection.name || 'forbindelse'} …`;
      try { await call('removeConnection', connection.id); removed++; }
      catch (error) { if (removed === 0) { status.textContent = error?.message || 'Ingen forbindelser kunne fjernes. Prøv igen.'; busy = false; cancel.disabled = false; cancel.focus(); return; } break; }
    }
    status.textContent = removed === removeAll.length ? `Alle ${removed} forbindelser er fjernet.` : `${removed} af ${removeAll.length} forbindelser er fjernet. Resten kunne ikke fjernes — prøv igen for de resterende.`;
    setTimeout(async () => {
      settled = true; dialog.close();
      try { state = await call('connectionState'); renderConnections(); } catch {}
      renderSetup();
      const still = (state?.connections || []).length;
      $('#setup-remove-all').hidden = still === 0;
      $('#setup-remove-all').textContent = still === 0 ? 'Fjern alle gemte nøgler …' : still === 1 ? 'Fjern den gemte nøgle …' : `Fjern alle gemte nøgler (${still}) …`;
    }, 900);
  });
  document.body.append(dialog); dialog.showModal(); cancel.focus();
});
$('#setup-add-another').onclick = () => setupProvider();
$('#setup-continue').onclick = () => action(() => leaveSetup(true));
$('#setup-manage').onclick = () => $('#connections-button').click();
$('#setup-git-refresh').onclick = () => action(setupGit);
$('#setup-git-open').onclick = () => $('#git-button').click();
$('#setup-connection').onchange = () => { ++setupGeneration; verifiedConnection = ''; $('#setup-ai').textContent = 'Forbindelsen er ikke kontrolleret.'; setupControls(); };
async function testSetupConnection() {
  const id = $('#setup-connection').value, generation = ++setupGeneration;
  verifiedConnection = ''; setupControls(); $('#setup-test').disabled = true; $('#setup-ai').textContent = 'Henter modelkatalog fra den valgte server …';
  try {
    const models = await checkedModels(id);
    if (generation !== setupGeneration || id !== $('#setup-connection').value) return;
    verifiedConnection = models.length ? id : '';
    const featured = featuredProviders.some(item => item.kind === state.connections.find(c => c.id === id)?.kind);
    $('#setup-ai').textContent = models[0]?.configuredDeployment ? 'Adgangen svarer. Dit deployment afprøves først, når du sender en opgave.' : !models.length ? 'Forbindelsen svarer uden modeller. Tjek adgangen hos udbyderen, eller ret oplysningerne.' : featured ? 'Forbindelsen virker. Appen starter med udbyderens eget udgangspunkt, som du kan skifte under skrivefeltet.' : 'Forbindelsen svarer. Du vælger model i projektet.';
    if (models.length) $('#setup-subtitle').textContent = 'Forbindelsen er gemt.';
  } catch (error) { if (generation === setupGeneration) $('#setup-ai').textContent = `Kontrollen mislykkedes: ${error.message} Rediger forbindelsen, eller prøv igen.`; }
  finally { if (generation === setupGeneration) setupControls(); }
}
$('#setup-test').onclick = () => action(testSetupConnection);
$('#setup-use-saved').onclick = () => { setupPage('saved'); if (!$('#setup-connection').value && state.connections.length === 1) $('#setup-connection').value = state.connections[0].id; setupControls(); };
$('#setup-advanced').onclick = () => { setupPage('tools'); action(setupGit); };
$('#setup-edit').onclick = () => setupProvider(state.connections.find(c => c.id === $('#setup-connection').value));
$('#setup-local-address').onclick = () => { setupProvider(); chooseProvider('ollama'); };
function showAssets(assets) {
  $('#assets').replaceChildren();
  for (const asset of assets) {
    const item = node('li', `${asset.kind === 'logo' ? 'Logo' : 'Reference'}: ${asset.name} `);
    const button = node('button', 'Fjern', 'text-button'); button.type = 'button';
    button.addEventListener('click', () => action(async () => showAssets(await call('removeAsset', asset.id))));
    item.append(button); $('#assets').append(item);
  }
}
const previewFrames = new Map(); const previewRevisions = new Map();
function usePreviewContext(context) {
  if (!current || !context) return;
  const root = context.workspaceRoot || current.root;
  let frame = previewFrames.get(root);
  if (!frame) { frame = previewFrames.size ? node('iframe', undefined, 'preview-frame') : ($('#preview') || node('iframe', undefined, 'preview-frame')); frame.title = 'Dit projekts lokale forhåndsvisning'; previewFrames.set(root, frame); if (!frame.isConnected) $('#preview-stage').append(frame); }
  for (const other of previewFrames.values()) { other.removeAttribute('id'); other.hidden = other !== frame; other.inert = other !== frame; }
  frame.id = 'preview'; frame.hidden = false; frame.dataset.root = root;
  if (current.workspaceRoot) previewRevisions.set(current.workspaceRoot, revision);
  current.workspaceRoot = root; current.isolated = Boolean(context.isolated); revision = previewRevisions.get(root) || null;
  if (state && 'copy' in context) state.copy = context.copy;
  $('#workspace-scope').hidden = !context.isolated; $('#copy-notice').hidden = !context.isolated;
  $('#copy-path').textContent = root;
  $('#copy-omissions').textContent = state?.copy?.omissions?.length ? `Udeladt af kopien: ${state.copy.omissions.slice(0, 8).join(', ')}. Nøgler og Git-historik kopieres ikke.` : 'Nøgler, Git-historik og symbolske links kopieres ikke. Ændringer gennemgås før indfletning.';
  showPreview(context.previewURL, context.previewExternal); window.previewServer?.update(context.runtime); window.previewLayout?.();
}
function showPreview(url, external = false) {
  if (current) { current.previewURL = url; current.previewExternal = Boolean(url && external); }
  $('#preview-stage').hidden = !url; $('#preview').hidden = !url; $('#preview-empty').hidden = Boolean(url);
  // Hver statisk forhåndsvisning har sin egen aura-preview-origin, adskilt fra
  // appens harness-origin. Den må derfor bruge sit eget lokale lager.
  $('#preview').setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
  if (url) { if ($('#preview').getAttribute('src') !== url) $('#preview').src = url; } else $('#preview').removeAttribute('src');
  $('#preview-status').textContent = url ? (external ? 'Tilsluttet lokal server' : 'Lokal forhåndsvisning') : 'Ingen forhåndsvisning';
  window.previewEdit?.onPreview(); syncResultPreview();
}
async function displayProject(project, { firstTask = false } = {}) {
  if (!project) return;
  const request = ++projectDisplayRequest;
  window.harness.selectContext?.({ root: project.root, chat: project.workbench.chat });
  ++modelRequest; recovery = ''; $('#connection-warning').hidden = true; document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true; setupControls();
  modelCatalog = []; $('#model-shortlist').replaceChildren(); $('#work-mode').value = 'chat'; updateWorkMode();
  if (current?.workspaceRoot) previewRevisions.set(current.workspaceRoot, revision);
  current = project; revision = null; acceptedFingerprint = null;
  // Every project display closes the idea surface's return link: the
  // workspace is back, and the next "Nyt projekt" stashes a fresh one.
  ideaReturn = null; $('#idea-back').hidden = true;
  window.dispatchEvent(new CustomEvent('aura:project', { detail: { root: project.root } }));
  // Projekter beholder samtaler, godkendelser og forhåndsvisning i baggrunden.
  const known = views.has(project.workbench.chat);
  mountView(viewFor(project.workbench.chat));
  if (firstTask) view.firstProjectTask = true;
  try { localStorage.setItem(lastProjectKey, project.root); } catch {}
  $('#idea-options').open = false; for (const el of document.querySelectorAll('#idea-options select')) el.value = '';
  // Chip-etiketterne følger select-nulstillingen (kompas-fix 2): ellers står
  // det gamle valg på chippen, efter at payloadkilden er ryddet.
  window.HeroComposer?.syncIdeaChips();
  $('#new').removeAttribute('aria-current'); $('#view-title').textContent = 'Arbejdsområde';
  $('#onboarding').hidden = true; $('#workspace').hidden = false; $('#skills-button').disabled = false;
  $('#project-name').textContent = project.name; $('#project-purpose').textContent = project.purpose || 'Eksisterende mappe. Beskriv din opgave i samtalen.'; $('#project-path').textContent = project.root; syncTopbar();
  // Projekt-chippen (§4): navnet på chippen, og »Projektoplysninger« som ⓘ
  // ved chippen — stien og opstartsvalgene står i data-info, id'erne består
  // som skjult tekst (prøverne læser dem).
  $('#project-chip-name').textContent = project.name; $('#project-chip').title = `Projekt: ${project.name}`;
  $('#reference-choices').replaceChildren();
  for (const asset of (project.assets || []).filter(a => a.kind === 'reference')) {
    const label = node('label', undefined, 'check-label'); const input = node('input'); input.type = 'checkbox'; input.value = asset.file;
    label.append(input, document.createTextNode(asset.name)); $('#reference-choices').append(label);
  }
  if (!$('#reference-choices').children.length) $('#reference-choices').textContent = 'Ingen referencefiler registreret i projektet.';
  $('#task-dialog .reference-choice').hidden = !(project.assets || []).some(a => a.kind === 'reference');
  usePreviewContext(project.workbench.preview || project);
  window.previewServer?.update(project.runtime);
  if (project.warnings?.length) message(project.warnings.join(' '));
  view.conversationPermission = project.workbench.conversationPermission || { active: false }; window.ConversationPermission?.sync();
  state = project.workbench; $('#connection-select').value = ''; renderConnections(); applyFeatures();
  const saved = state.projectSettings.selection;
  const startup = state.projectSettings.startup;
  const preferredProjectConnection = saved?.connectionID || startup?.connectionID;
  const unavailableSelection = Boolean(preferredProjectConnection && !state.connections.some(c => c.id === preferredProjectConnection));
  const retiredSelection = (state.retiredConnections || []).some(c => c.id === preferredProjectConnection);
  if (autoConnect && preferredProjectConnection && !unavailableSelection) { $('#connection-select').value = preferredProjectConnection; await loadModels(saved || {}); }
  else if (!preferredProjectConnection && autoConnect && state.connections.some(c => c.id === preferredConnection)) { $('#connection-select').value = preferredConnection; await loadModels(); }
  if (request !== projectDisplayRequest || current !== project) return;
  if (!$('#connection-select').value && preferredProjectConnection && state.connections.some(c => c.id === preferredProjectConnection)) {
    $('#connection-select').value = preferredProjectConnection;
    // The creation-time startup connection is an explicit choice that prefilled
    // from the profile: without a saved model, the profile's standard model
    // preselects straight from its id — the same offline path a saved selection
    // takes — so the standard model applies without a prior session click
    // (autoConnect) and without a catalog fetch. The full catalog loads when
    // the model picker opens.
    const standard = profileState?.standardAI;
    if (!saved?.connectionID && standard?.connectionID === preferredProjectConnection && standard.modelID) {
      $('#model-select').replaceChildren(option(standard.modelID, pentModelNavn(standard.modelID, standard.modelID)));
      updateModelSummary();
    }
  }
  $('#project-startup').textContent = startup ? `Hostingønske: ${hostingLabel(startup.hosting)} · Tests: ${testLabel(startup.tests)}` : 'Ingen opstartsvalg gemt for dette projekt.';
  // ⓘ'ens tekst på projekt-chippen sammensættes af de samme kilder (§4):
  // sti, opstartsvalg og den faste sætning om lokal kørsel.
  $('#project-chip-info').dataset.info = `${$('#project-path').textContent}\n${$('#project-startup').textContent}\nFiler og agent kører på denne computer. Ingen installationer eller Git-handlinger udføres ved åbning.`;
  $('#model-options').open = !$('#model-select').value; $('#start-idea').textContent = project.purpose ? 'Forbered første besked' : 'Beskriv din idé'; updateModelSummary();
  if (saved && state.connections.some(c => c.id === saved.connectionID) && !$('#model-select').value) {
    $('#connection-select').value = saved.connectionID; $('#model-select').replaceChildren(option(saved.modelID, saved.modelID));
    if (saved.routeID) { $('#route-row').hidden = false; $('#route-select').replaceChildren(option(saved.routeID, saved.routeID)); }
    updateModelSummary(); $('#model-options').open = false;
  }
  fillChat(state, !known);
  if (unavailableSelection) showConnectionWarning(retiredSelection ? 'komplai bruges nu kun til udgivelse. Vælg en anden AI for at fortsætte samtalen. Dit projekt og din kladde er bevaret.' : 'Den gemte AI-forbindelse er ikke tilgængelig. Vælg en anden AI for at fortsætte samtalen. Dit projekt og din kladde er bevaret.');
  await refreshRecent();
  if (request !== projectDisplayRequest || current !== project) return;
  await window.workspace?.onProject();
  window.versions?.refreshStatus();
  $('#project-name').tabIndex = -1; if (!setupActive) $('#project-name').focus();
}
// Chat-choice: profilen anbefaler sin standard-arbejdsmåde med et mærkat, men
// begge valg forbliver lige tilgængelige. Mærket er tekst i kortet — samme
// Anbefalet-pille som funktionsvalget — så der ingen skjult aria-tilstand er
// at holde i synk.
function applyChatChoiceRecommendation() {
  // Anbefalingen kræver en indlæst profil: uden profilgrundlag vises intet
  // mærkat — aldrig en gættet anbefaling.
  const wanted = profileState ? (profileState.workMode === 'plan' ? '#choice-plan' : '#choice-chat') : '';
  for (const card of [$('#choice-plan'), $('#choice-chat')]) {
    if (!card) continue;
    const recommended = Boolean(wanted) && card === $(wanted);
    card.classList.toggle('is-recommended', recommended);
    let badge = card.querySelector('.recommended');
    if (recommended && !badge) { badge = node('span', 'Anbefalet', 'recommended'); card.querySelector('strong')?.after(badge); }
    if (!recommended && badge) badge.remove();
  }
}
// Den åbne samtales indhold: beskeder, kladde, arbejdsmåde, plan og besked om en afbrudt opgave. fresh betyder, at
// beskederne skal vises fra den gemte samtale; ellers står de allerede i samtalens visning.
function fillChat(next, fresh) {
  const history = next.workspace, v = view;
  // Startup events can create an empty view before displayProject receives the
  // stored conversation. Its existence does not mean its plan was restored.
  fresh ||= !v.historyLoaded && !v.log.children.length;
  if (fresh || !v.historyLoaded && !v.log.children.length) { const page=window.HistoryPages.takePrevious(history?.messages || []);v.historyPending=page.older;v.historyLoaded=true;for(const item of page.recent){const element=appendMessage(item.text,item.role,undefined,item.at);if(typeof item.id==='string')element.dataset.messageId=item.id;} }
  renderHistoryControls();
  const empty = !v.log.children.length;
  // Første samtale i projektet viser den fulde intro med projektdetaljerne.
  // Efterfølgende nye samtaler får et enkelt valg: planlægge først eller bygge.
  const firstChat = v.firstProjectTask === true;
  $('#project-intro').hidden = !(empty && firstChat); $('#start-idea').hidden = !(empty && firstChat);
  $('#chat-choice').hidden = !(empty && !firstChat);
  $('#resume-notice').hidden = !history?.messages?.length && !next.historyWarning; $('#resume-notice').open = false;
  $('#include-history').checked = false;
  if (fresh) v.planOffer = history?.planOffer === true;
  if (fresh) { v.plan = next.plan || null; v.planCard = Boolean(next.plan) && ['chat', 'plan'].includes(history?.mode); }
  updatePlanOffer(v);
  activePlan = v.plan; $('#plan-card').hidden = !v.planCard || !v.plan;
  // Første projektopgave bygger frit; ellers arver en helt ny samtale uden
  // kladde og historik profilens arbejdsmåde. Kladde og historik vinder.
  $('#work-mode').value = v.firstProjectTask ? 'free' : (profileState?.workMode === 'plan' ? 'plan' : 'chat');
  $('#prompt').value = '';
  if (history) {
    $('#prompt').value = history.draft || '';
    if (history.messages.length || history.draft) $('#work-mode').value = history.mode === 'build' && !next.plan ? defaultMode() : history.mode;
    $('#resume-notice summary').textContent = ['interrupted', 'working'].includes(history.status) && !v.running ? 'Den forrige opgave blev afbrudt' : 'Tidligere samtale';
    $('#resume-text').textContent = ['interrupted', 'working'].includes(history.status) && !v.running ? 'Den forrige opgave blev afbrudt. Gennemgå filerne, før du fortsætter. Intet er genstartet.' : 'Din samtale er hentet fra denne computer. Hos samme AI kan samtalen fortsætte med tidligere beskeder og værktøjsresultater. Start Ny samtale for et nyt forløb. Du kan også vælge at medsende en ekstra kopi, fx ved skift af AI.';
    if (history.trimmed) $('#resume-text').textContent += ' Den ældste del af samtalen er udeladt af hensyn til størrelse.';
  }
  if (next.historyWarning) $('#resume-text').textContent = next.historyWarning;
  // Kladden: det, der står i skrivefeltet i denne samtale, også hvis den ikke nåede at blive gemt.
  // Før samtalerne havde projektet én lokal kladde; den flyttes én gang til den samtale, der åbnes først.
  try { const key = `harness.chatDraft.${current.root}`, legacy = localStorage.getItem(key); if (legacy !== null) { if (localStorage.getItem(`${key}.${v.id}`) === null) localStorage.setItem(`${key}.${v.id}`, legacy); localStorage.removeItem(key); } } catch {}
  try { const draft = JSON.parse(localStorage.getItem(`harness.chatDraft.${current.root}.${v.id}`)); if (draft && typeof draft.text === 'string' && (draft.text || !['working','interrupted'].includes(history?.status))) { $('#prompt').value = draft.text; if (['chat','plan','free'].includes(draft.mode)) { $('#work-mode').value = draft.mode; v.modeChosen = true; } } } catch {}
  if (v.draft) { $('#prompt').value = v.draft.text; if (['chat','plan','free','build'].includes(v.draft.mode)) $('#work-mode').value = v.draft.mode; }
  v.contextUsage = next.contextUsage || null;
  // Genindlæst visning (fx efter et renderer-nedbrud): hovedprocessen ejer sandheden om den
  // kørende opgave. Status genopbygges, og ventende valg hentes igen — intet sendes på ny,
  // intet godkendes, og YOLO aktiveres ikke igen.
  if (next.chatRunning && !v.running) {
    setRunning(true, 'Arbejder', v);
    v.statusDetail = 'Visningen er genindlæst · opgaven fortsætter';
    // Svaret tilhører det ejende view — også hvis brugeren skiftede samtale undervejs:
    // kortene tegnes i viewets egen DOM og ses, når samtalen åbnes igen.
    if (fresh) call('pendingChoices').then(choices => {
      for (const choice of choices?.approvals || []) window.approvals.show(choice.properties, v);
      for (const choice of choices?.questions || []) window.planning.showQuestion(choice.properties, v);
      if (v === view) renderStatus();
    }).catch(() => { /* Ventende valg kan ikke genfindes; statuslinjen viser fortsat arbejdet. */ });
    renderStatus();
  }
  v.usage = v.usage || next.usage; v.speed = next.speed || v.speed || null;
  renderStatusLine();
  updateWorkMode(); setDraftStatus(history?.draft ? 'Kladde hentet fra denne computer' : '');
  updateStartIdea(); applyRunning();
  // Anbefalingen følger profilen, også når chat-choice netop er blevet vist.
  applyChatChoiceRecommendation();
  window.planning?.onProject(next);
  // "?"-knappens grundlag følger med fladen: projektintroen og
  // resume-bemærkningen kan være kommet eller gået med dette skift.
  window.composerHelp?.refresh?.();
}
// Skift til en anden samtale i samme projekt. En samtale, der arbejder, fortsætter i baggrunden.
async function showChat(next) {
  if (!next?.chat) return;
  ++projectDisplayRequest;
  window.harness.selectContext?.({ root: current?.root, chat: next.chat });
  state = next;
  const known = views.has(next.chat);
  mountView(viewFor(next.chat));
  view.conversationPermission = next.conversationPermission || { active: false }; window.ConversationPermission?.sync();
  fillChat(next, !known);
  usePreviewContext(next.preview);
  window.workspace?.clearReferences();
  await window.workspace?.onChat?.();
  window.chats?.render();
  if (view.followChat) $('#chat-content').scrollTop = $('#chat-content').scrollHeight;
}
// A local search hit selects a stored message for display, never as model context.
window.openStoredMessage = async result => {
  if (!result || !/^[a-f0-9]{64}$/.test(result.project || '') || !/^[a-f0-9-]{36}$/.test(result.chat || '') || typeof result.message !== 'string' || result.message.length > 200) throw new Error('Vælg et aktuelt lokalt søgeresultat.');
  const project = window.chats.projects().find(item => item.id === result.project);
  if (!project) throw new Error('Projektet findes ikke længere. Søg igen.');
  if (project.root !== current?.root && anyRunning()) throw new Error('Vent på de aktive opgaver, før du åbner et andet projekt.');
  await saveChatDraft(true);
  await window.chats.openChat(project, result.chat);
  if (current?.root !== project.root || view.id !== result.chat) throw new Error('Samtalen er skiftet. Vælg søgeresultatet igen.');
  const owner = view, find = () => [...owner.log.children].find(element => element.dataset?.messageId === result.message);
  if (!find()) {
    if (owner.running) throw new Error('Samtalen arbejder stadig. Åbn træffet igen, når opgaven er færdig.');
    const next = await call('chatOpen', result.chat);
    if (view !== owner) throw new Error('Samtalen er skiftet. Vælg søgeresultatet igen.');
    // Reload only the transcript. A same-chat search must not reset an unsaved
    // brief/plan editor, model selection, draft or approval controls.
    owner.log.replaceChildren(); owner.parts.clear(); owner.assistantText.clear(); owner.pendingMarkdown.clear();
    for (const item of next.workspace?.messages || []) { const element = appendMessage(item.text, item.role, owner, item.at); if (typeof item.id === 'string') element.dataset.messageId = item.id; }
    owner.historyPending=[];owner.historyLoaded=true;owner.historyNotice='';renderHistoryControls();
  }
  const target = find(); if (!target) throw new Error('Beskeden findes ikke længere i den gemte samtale. Søg igen.');
  for (const element of owner.log.querySelectorAll('.search-message-hit')) element.classList.remove('search-message-hit');
  owner.followChat = false; target.classList.add('search-message-hit'); target.tabIndex = -1;
  target.scrollIntoView({ block: 'center', behavior: 'auto' }); target.focus({ preventScroll: true }); return target;
};
// Forbindelser bliver gemt hver for sig. Kontrolstatus gælder kun katalogkald i denne appsession.
let editingConnection = '', connectionPage = 0, checkingConnections = false, repeatSetup = null;
const connectionChecks = ConnectionOverview.tracker();
function invalidateConnection(id, detail) {
  if (!state?.connections.some(c => c.id === id)) return;
  const check = connectionChecks.begin(id);
  connectionChecks.finish(id, check, { status: 'error', detail });
  updateConnectionChecks();
}
function checkLabel(id) {
  const check = connectionChecks.get(id);
  if (!check) return 'Ikke kontrolleret';
  if (check.status === 'checking') return 'Kontrollerer …';
  if (check.status === 'error') return 'Ikke forbundet';
  const time = new Date(check.checkedAt).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
  return check.count ? `Forbundet · kontrolleret ${time}` : 'Ingen modeller i kataloget';
}
function updateConnectionChecks() {
  for (const el of document.querySelectorAll('[data-connection-status]')) {
    el.textContent = checkLabel(el.dataset.connectionStatus);
    const check = connectionChecks.get(el.dataset.connectionStatus);
    el.dataset.state = check?.status === 'ok' && check.count ? 'connected' : check?.status || 'unchecked';
    el.title = check?.detail || 'Forbindelsen er gemt, men endnu ikke kontrolleret efter appstart.';
  }
  updateProviderStatuses();
  syncOnboardingVisuals();
}
function updateProviderStatuses() {
  for (const el of document.querySelectorAll('[data-provider-status]')) {
    const connections = (state?.connections || []).filter(c => c.kind === el.dataset.providerStatus);
    const connected = connections.filter(c => { const check = connectionChecks.get(c.id); return check?.status === 'ok' && check.count; }).length;
    const failures = connections.filter(c => connectionChecks.get(c.id)?.status === 'error').length;
    el.textContent = !connections.length ? 'Ikke tilføjet' : connected ? `${connected} af ${connections.length} forbundet` : failures === connections.length ? 'Ikke forbundet' : `${connections.length} gemt · ikke kontrolleret`;
    el.dataset.state = connected === connections.length && connected ? 'connected' : failures === connections.length && failures ? 'error' : 'unchecked';
    el.title = connections.map(c => `${c.name}: ${checkLabel(c.id)}`).join('\n');
  }
}
function renderConnectionList() {
  const retired = state.retiredConnections || [];
  const connections = [...state.connections, ...retired];
  const result = ConnectionOverview.page(connections, state.definitions, $('#connections-search').value, connectionPage);
  $('#retired-connections-notice').hidden = !retired.length;
  connectionPage = result.index;
  $('#saved-connections').replaceChildren(...result.items.map(connection => {
    const row = node('div', undefined, 'saved-connection'), text = node('span');
    const isRetired = retired.some(item => item.id === connection.id);
    text.append(node('strong', connection.name), node('small', isRetired ? 'komplai · tidligere AI-forbindelse' : state.definitions[connection.kind]?.name || connection.kind));
    if (isRetired) {
      const remove = node('button', connection.account?.authMethod === 'token' ? 'Fjern fra Aura Prime' : 'Log ud og fjern', 'text-button danger');
      remove.type = 'button'; remove.setAttribute('aria-label', `${remove.textContent}: ${connection.name}`);
      remove.title = connection.account?.authMethod === 'token' ? 'Fjerner det gemte token fra Aura Prime. Tokenet kan stadig bruges i andre programmer.' : 'Tilbagekalder den gamle AI-adgang og fjerner forbindelsen. komplai Run bevares.';
      remove.onclick = () => action(async () => { remove.disabled = true; try { await removeSavedConnection(connection.id, { fromList: true }); $('#connections-search').focus(); } finally { remove.disabled = false; } });
      row.append(text, remove); return row;
    }
    const status = node('small'); status.dataset.connectionStatus = connection.id; text.append(status);
    const edit = node('button', 'Åbn', 'text-button'); edit.type = 'button'; edit.setAttribute('aria-label', `Åbn ${connection.name}`);
    edit.onclick = () => editConnection(connection);
    row.append(text, edit); return row;
  }));
  if (!result.total) $('#saved-connections').append(node('p', connections.length ? 'Ingen forbindelser passer til søgningen.' : 'Ingen forbindelser endnu.', 'hint'));
  $('#connections-pages').hidden = result.pages === 1;
  $('#connections-page').textContent = `${result.index + 1} af ${result.pages}`;
  $('#connections-prev').disabled = !result.index; $('#connections-next').disabled = result.index === result.pages - 1;
  $('#connections-check').disabled = checkingConnections || !state.connections.length;
  updateConnectionChecks();
}
function renderConnections() {
  const previous = $('#connection-select').value;
  if (!$('#connection-id').value) renderProviderKindOptions();
  $('#connection-select').replaceChildren(option('', 'Vælg forbindelse'), ...state.connections.map(c => option(c.id, c.name)));
  renderConnectionList();
  if (state.connections.some(c => c.id === previous)) $('#connection-select').value = previous;
  else { $('#model-select').replaceChildren(option('', 'Hent modeller fra forbindelsen')); $('#route-row').hidden = true; }
  renderSetup(); renderStartupConnections();
}
$('#connections-search').oninput = () => { connectionPage = 0; renderConnectionList(); };
$('#connections-prev').onclick = () => { --connectionPage; renderConnectionList(); };
$('#connections-next').onclick = () => { ++connectionPage; renderConnectionList(); };
function catalogResult(models) {
  const detail = models[0]?.configuredDeployment ? `Adgangen svarer. Deploymentet ${models[0].id} afprøves først, når du sender en opgave.` : models.length ? `${models.length} ${models.length === 1 ? 'model' : 'modeller'} i kataloget. Kodearbejde og ledig kvote er ikke afprøvet.` : 'Forbindelsen svarer uden modeller. Tjek adgangen hos udbyderen.';
  return { status: 'ok', count: models.length, deployment: Boolean(models[0]?.configuredDeployment), detail };
}
async function checkedModels(id) {
  const check = connectionChecks.begin(id); updateConnectionChecks();
  try {
    const models = await call('models', id);
    connectionChecks.finish(id, check, catalogResult(models));
    return models;
  } catch (error) {
    connectionChecks.finish(id, check, { status: 'error', detail: error.message });
    throw error;
  } finally { updateConnectionChecks(); }
}
async function checkConnection(id) {
  try { return catalogResult(await checkedModels(id)); }
  catch (error) { return { status: 'error', detail: error.message }; }
}
$('#connections-check').onclick = () => action(async () => {
  if (checkingConnections) return;
  checkingConnections = true; renderConnectionList(); $('#connections-feedback').textContent = 'Henter modelkataloger …';
  const queue = state.connections.map(c => c.id), total = queue.length; let successful = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(2, total) }, async () => {
      while (queue.length) { const result = await checkConnection(queue.shift()); if (result?.status === 'ok' && result.count) ++successful; }
    }));
    $('#connections-feedback').textContent = `${successful} af ${total} forbindelser svarer med modeller. Ingen AI-opgave er sendt.`;
  } finally { checkingConnections = false; renderConnectionList(); }
});
function connectionView(view) {
  $('#connections-list').hidden = view !== 'list'; $('#connection-edit').hidden = view !== 'edit';
  $('#connection-add-flow').hidden = view !== 'add';
  // Enhver anden visning afslutter tilføj-flowet, så ingen kladde lægger i formularen.
  if (view !== 'add') addingConnectionStage = '';
  $('#connections-heading').textContent = view === 'edit' ? 'Din forbindelse' : view === 'add' ? 'Tilføj forbindelse' : 'AI-forbindelser';
}
function fillConnection(connection) {
  $('#connection-name').value = connection.name; $('#base-url').value = connection.baseURL;
  $('#azure-endpoint').value = connection.kind === 'azure' ? connection.baseURL : '';
  $('#azure-deployment').value = connection.deployment || ''; $('#azure-protocol').value = connection.protocol || 'responses';
  $('#custom-protocol').value = connection.kind === 'compatible' && ['openai', 'responses', 'anthropic'].includes(connection.protocol) ? connection.protocol : 'openai';
  $('#provider-id').value = connection.providerID || '';
  if (connection.kind === 'cloudflare') { $('#cloudflare-account').value = (/\/accounts\/([a-f0-9]{32})\//.exec(connection.baseURL || '') || [])[1] || ''; syncCloudflareAddress(); }
}
// Forbindelsestjek i trin (4.11): reach, key and models need no model call.
// Text and tools would spend tokens and stay skipped until a reviewed live path exists.
const DIAGNOSE_STEPS = { reach: 'Adressen svarer', key: 'Nøglen accepteres', models: 'Modeller hentet', text: 'Tekstsvar', tools: 'Værktøjskald' };
const DIAGNOSE_STATUS = { ok: 'OK', failed: 'Fejlede', skipped: 'Sprunget over', unknown: 'Ukendt' };
function diagnosePanel() {
  let panel = $('#connection-diagnose');
  if (panel || typeof window.harness?.connectionDiagnose !== 'function') return panel;
  panel = node('section', undefined, 'connection-diagnose'); panel.id = 'connection-diagnose'; panel.setAttribute('aria-labelledby', 'connection-diagnose-title');
  const title = node('h4', 'Kontrollér trin for trin'); title.id = 'connection-diagnose-title';
  const lead = node('p', 'Tjekker adresse, nøgle og modelliste uden at sende en besked til modellen.', 'hint');
  const run = node('button', 'Kontrollér nu'); run.type = 'button'; run.id = 'connection-diagnose-run';
  const list = node('ol', undefined, 'diagnose-steps'); list.id = 'connection-diagnose-steps'; list.setAttribute('aria-live', 'polite');
  run.onclick = () => action(async () => {
    const id = $('#connection-id').value; if (!id) return;
    run.disabled = true; list.replaceChildren(node('li', 'Kontrollerer …', 'hint'));
    try {
      const result = await call('connectionDiagnose', { id });
      if ($('#connection-id').value !== id) return;
      list.replaceChildren(...(result?.steps || []).map(step => {
        const item = node('li', undefined, 'diagnose-step'); item.dataset.status = step.status;
        item.append(node('span', DIAGNOSE_STEPS[step.id] || step.id, 'diagnose-name'), node('span', DIAGNOSE_STATUS[step.status] || step.status, 'diagnose-status'));
        if (step.detail) item.append(node('small', step.detail));
        return item;
      }));
    } catch (error) { list.replaceChildren(node('li', error.message || 'Kontrollen kunne ikke gennemføres.', 'hint')); }
    finally { run.disabled = false; }
  });
  panel.append(title, lead, run, list);
  $('#connection-edit').append(panel);
  return panel;
}
function editConnection(connection) {
  moveConnectionForm(false); editingConnection = connection.id;
  { const panel = diagnosePanel(); if (panel) { $('#connection-diagnose-steps').replaceChildren(); panel.hidden = false; } }
  $('#connection-form').reset(); $('#connection-id').value = connection.id; $('#provider-kind').value = connection.kind; updateProvider(); fillConnection(connection);
  clearConnectionReceipt(); $('#clear-key').checked = false;
  $('#connection-feedback').textContent = connectionChecks.get(connection.id)?.detail || ''; connectionView('edit');
  $('#connection-use').disabled = projectLoading;
  $('#connection-use').focus();
}
$('#connection-back').onclick = () => { clearConnectionReceipt(); connectionView('list'); renderConnectionList(); $('#connections-search').focus(); };
// Det lette "Tilføj forbindelse"-flow: udbydergitter og formularen ligger inde i
// AI-forbindelsesdialogen, så opsætningsskærmen ikke genåbnes. Rækkefølgen er
// udfyld → gem → kontrollér, fordi kontrollen kræver en gemt forbindelses-id.
// Udbyderkataloget (4.11): én dropdown bygget udelukkende af motorens
// definitions. Grupperne følger definitionens group-felt; ældre definitioner
// uden felt får en fast plads, så kataloget aldrig mister en udbyder.
const CATALOG_GROUPS = [['eu', 'EU og Danmark'], ['popular', 'Populære udbydere'], ['local', 'På din computer eller server']];
const LOCAL_KINDS = ['ollama', 'compatible', 'lmstudio', 'vllm'];
function catalogGroup(kind, definition) {
  if (CATALOG_GROUPS.some(([id]) => id === definition?.group)) return definition.group;
  if (['corti', 'alexandra', 'mistral'].includes(kind)) return 'eu';
  if (LOCAL_KINDS.includes(kind)) return 'local';
  return 'popular';
}
function catalogEntries() {
  const definitions = state?.definitions || {};
  return Object.entries(definitions).filter(([kind]) => kind !== 'compatible').map(([kind, definition]) => ({ kind, definition, group: catalogGroup(kind, definition) }))
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name, 'da'));
}
function catalogSelect(select, placeholder, exclude = []) {
  const previous = select.value;
  const groups = CATALOG_GROUPS.map(([id, label]) => {
    const items = catalogEntries().filter(entry => entry.group === id && !exclude.includes(entry.kind));
    if (!items.length) return null;
    const group = document.createElement('optgroup'); group.label = label;
    group.append(...items.map(entry => option(entry.kind, entry.definition.name)));
    return group;
  }).filter(Boolean);
  select.replaceChildren(...(placeholder ? [option('', placeholder)] : []), ...groups);
  if (Array.from(select.options || []).some(item => item.value === previous)) select.value = previous;
}
// The form's own select follows the same catalog, plus "Egen API" last.
function renderProviderKindOptions() {
  if (!state?.definitions) return;
  catalogSelect($('#provider-kind'));
  if (state.definitions.compatible) $('#provider-kind').append(option('compatible', 'Egen API · kompatibel server'));
}
function catalogTerms(kind) {
  const definition = state?.definitions?.[kind], note = $('#catalog-terms');
  note.hidden = !definition;
  if (!definition) return;
  note.textContent = definition.termsVerified === false
    ? 'Vilkår ikke kontrolleret af Aura. Læs udbyderens vilkår for træning, region og opbevaring, før du sender projektindhold.'
    : [definition.trainingShort, definition.regionShort, definition.retentionShort].filter(Boolean).join(' · ');
  note.dataset.verified = String(definition.termsVerified !== false);
}
$('#catalog-provider').onchange = () => { const kind = $('#catalog-provider').value; catalogTerms(kind); if (kind) chooseAddProvider(kind); };
let addingConnectionStage = '';
function openAddConnection() {
  // En ny flow-runde afslutter gemninger og kontroller fra en tidligere runde:
  // deres generationsvagt ser, at deres flow ikke længere er det aktive.
  ++setupGeneration;
  clearConnectionReceipt();
  $('#connection-form').reset(); $('#connection-id').value = ''; $('#connection-feedback').textContent = '';
  renderProviderCards($('#add-provider-cards'), chooseAddProvider, false);
  $('#connection-add-lead').textContent = 'Vælg den udbyder eller server, du har adgang til';
  // Parthee 4.11: the card grid stays for the established providers; the
  // catalog's newer providers sit in one dropdown below it.
  catalogSelect($('#catalog-provider'), 'Vælg en anden udbyder', providerCards.map(card => card.kind)); $('#catalog-provider').value = ''; catalogTerms('');
  $('#add-provider-catalog').hidden = !$('#catalog-provider').querySelector('optgroup');
  $('#add-provider-cards').hidden = false; $('#add-connection-home').hidden = true;
  addingConnectionStage = 'choose'; connectionView('add');
  ($('#add-provider-cards').querySelector('button') || $('#connection-add-cancel')).focus();
}
function chooseAddProvider(kind) {
  moveConnectionForm(false, true);
  // The stage is set before updateProvider, so the key-reuse row renders with the form.
  addingConnectionStage = 'form';
  renderProviderKindOptions(); $('#provider-kind').value = kind; updateProvider();
  $('#add-provider-cards').hidden = true; $('#add-provider-catalog').hidden = true; $('#add-connection-home').hidden = false;
  $('#connection-add-lead').textContent = `Forbind ${providerCards.find(item => item.kind === kind)?.name || state?.definitions?.[kind]?.provider || state?.definitions?.[kind]?.name || kind}`;
  $('#connection-feedback').textContent = '';
  (LOCAL_KINDS.includes(kind) || state?.definitions?.[kind]?.editableBaseURL === true && kind !== 'azure' ? $('#base-url') : kind === 'azure' ? $('#azure-endpoint') : $('#credential-open')).focus();
}
function resetAddConnection() {
  addingConnectionStage = '';
  clearConnectionReceipt();
  $('#connection-form').reset(); $('#connection-id').value = ''; $('#connection-feedback').textContent = '';
  moveConnectionForm(false);
  renderKeyReuse();
}
function closeAddConnection() {
  resetAddConnection();
  connectionView('list'); renderConnectionList();
  $('#connection-add').focus();
}
// Key reuse in the add-connection flow: the sources are saved connections of the
// same provider that hold a key. The revision comes from the public connection
// state, so the save can reject a source that changed after it was read.
function keyReuseSources(kind) {
  return (state?.connections || []).filter(c => c.kind === kind && c.hasKey && c.id !== $('#connection-id').value);
}
function renderKeyReuse() {
  const select = $('#connection-key-reuse'), sources = keyReuseSources($('#provider-kind').value);
  $('#connection-key-reuse-row').hidden = addingConnectionStage !== 'form' || !sources.length;
  const picked = select.value;
  select.replaceChildren(option('', 'Ingen — indtast selv en nøgle'), ...sources.map(c => option(c.id, c.name)));
  select.value = sources.some(c => c.id === picked) ? picked : '';
}
$('#connection-key-reuse').onchange = () => {
  clearConnectionReceipt();
  const kind = $('#provider-kind').value, source = keyReuseSources(kind).find(c => c.id === $('#connection-key-reuse').value);
  // Picking a source prefills the address; a save with a changed address is
  // rejected main-side with the copy-key error.
  if (kind === 'azure') $('#azure-endpoint').value = source?.baseURL || '';
  else $('#base-url').value = source ? source.baseURL : state?.definitions[kind]?.baseURL ?? '';
};
async function verifyAddedConnection(connection) {
  // Udfyld → gem → kontrollér: resultatet tilhører den gemte forbindelse. Ved fejl
  // forbliver den oprettet med fejlteksten synlig og redigering/fjernelse i listen.
  const generation = setupGeneration;
  $('#connection-id').value = connection.id;
  $('#connection-feedback').textContent = 'Forbindelsen er gemt. Kontrollerer adgangen …';
  const result = await checkConnection(connection.id);
  renderConnectionList();
  if (generation !== setupGeneration || !$('#connections-dialog').open || addingConnectionStage !== 'form') return;
  if (result?.status === 'ok' && result.count) {
    $('#connections-feedback').textContent = `${connection.name} er gemt. ${result.detail}`;
    closeAddConnection();
  } else {
    $('#connection-feedback').textContent = `${result?.detail || 'Kontrollen mislykkedes.'} Forbindelsen er gemt — ret oplysningerne, og gem igen, eller annullér for at redigere eller fjerne den i listen.`;
  }
}
$('#connection-add').onclick = () => openAddConnection();
$('#connection-add-cancel').onclick = () => closeAddConnection();
// Escape opfører sig som Annullér, mens flowet er åbent; ellers lukker dialogen som før.
$('#connections-dialog').addEventListener('cancel', event => {
  if (addingConnectionStage) { event.preventDefault(); closeAddConnection(); }
});
$('#connections-setup').onclick = () => {
  repeatSetup = { autoConnect }; $('#connections-dialog').close(); showSetup('', true);
};
$('#connection-use').onclick = () => action(async () => {
  const id = editingConnection;
  // Sessionvalg: forbindelsen aktiveres nu. Profilen er et fast valg og
  // ændres kun eksplicit i Indstillinger eller gennem Brug som standard.
  preferredConnection = id;
  clearConnectionReceipt(); $('#connections-dialog').close();
  if (current) {
    const saved = $('#connection-select').value === id ? { modelID: $('#model-select').value, routeID: $('#route-select').value } : {};
    $('#connection-select').value = id; autoConnect = true; openTaskSettings(); await loadModels(saved);
  } else { renderStartupConnections(); $('#startup-connection').value = id; autoConnect = true; updateStartupSummary(); message('Forbindelsen er valgt. Beskriv det, du vil bygge.'); }
});
$('#connection-test').onclick = () => action(async () => {
  const id = editingConnection; $('#connection-test').disabled = true; $('#connection-feedback').textContent = 'Kontrollerer den gemte forbindelse …';
  try { const result = await checkConnection(id); if (result && !setupActive && id === $('#connection-id').value) $('#connection-feedback').textContent = result.detail; }
  finally { $('#connection-test').disabled = false; }
});
async function removeSavedConnection(id, { fromList = false } = {}) {
  const find = () => [...(state?.connections || []), ...(state?.retiredConnections || [])].find(connection => connection.id === id);
  const connection = find(), navigation = navigationRequest, editing = editingConnection;
  if (!connection) return false;
  const original = JSON.stringify(connection);
  const stillCurrent = exactID => exactID === id && navigation === navigationRequest && $('#connections-dialog').open && (fromList ? !$('#connections-list').hidden : editingConnection === editing && editing === id && !$('#connection-edit').hidden) && JSON.stringify(find()) === original;
  return window.ConnectionRemoval.request({ connection: { id, name: connection.name, retiredOAuth: connection.kind === 'komplai' && connection.account?.authMethod !== 'token' }, stillCurrent, remove: async exactID => {
    if (!stillCurrent(exactID)) throw Error('Forbindelsen eller dit valg er ændret. Gennemgå fjernelsen igen.');
    const selected = $('#connection-select').value, next = await call('removeConnection', exactID);
    connectionChecks.clear(exactID);
    if (navigation !== navigationRequest) return;
    state = next; ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections();
    connectionView('list'); $('#connections-feedback').textContent = 'Forbindelsen er fjernet. Dine projekter og samtaler er bevaret.';
    if (current && selected === exactID) connectionFailed('Den valgte forbindelse er fjernet.');
  } });
}
$('#connection-remove').onclick = () => action(() => removeSavedConnection(editingConnection));
// Trin for trin til en nøgle hos de tre udbydere i opsætningen. Knapperne åbner faste sider via hovedprocessen. Kontrolleret 29. september 2026.
const keyGuides = {
  openai: { steps: [['Åbn din OpenAI API-konto.', 'start', 'Åbn'], ['Opret en API-nøgle.', 'keys', 'Åbn'], ['Indsæt nøglen herunder.']], cost: 'OpenAI API afregnes separat fra et ChatGPT-abonnement. Prisen afhænger af model og tokenforbrug.' },
  azure: { steps: [['Åbn dit projekt i Microsoft Foundry.', 'start', 'Åbn'], ['Kopiér serveradresse, API-nøgle og deployment-navn.'], ['Indsæt oplysningerne her.']] },
  anthropic: {
    steps: [['Opret en konto i Claude Console.', 'start', 'Åbn', 'Claude Console er Anthropics side for udviklere og ikke det samme som Claude.ai. Anthropic kan spørge til din brug og i nogle tilfælde bede om ID.'],
      ['Køb kredit under Billing.', 'billing', 'Åbn', 'Du betaler forud med kort.'],
      ['Sæt en månedlig grænse.', null, null, 'Under Spend limits på siden Billing, så forbruget ikke kan løbe løbsk.'],
      ['Opret en API-nøgle, og kopiér den.', 'keys', 'Åbn', 'Nøglen vises kun én gang.'],
      ['Indsæt den herunder.']],
    cost: 'Du ser modtager og pris for modellen, før noget sendes, og forbruget under skrivefeltet.'
  },
  mistral: {
    steps: [['Opret en konto i Mistral Studio.', 'start', 'Åbn', 'På mistral.ai hedder det Login › Studio. Gratisplanen kræver ikke kort, men Mistral må bruge data fra gratisplanen til træning.'],
      ['Slå betalt forbrug til, og sæt en månedlig grænse.', 'billing', 'Åbn', 'Under Billing.'],
      ['Fravælg træning.', 'privacy', 'Åbn', 'Under Privacy.'],
      ['Opret en API-nøgle, og kopiér den.', 'keys', 'Åbn', 'Nøglen vises kun én gang.'],
      ['Indsæt den herunder.']],
    cost: 'Du betaler, når gratisplanens kredit er brugt. Du ser modtager og pris for modellen, før noget sendes, og forbruget under skrivefeltet.'
  },
  corti: {
    steps: [['Opret en konto i Corti Console.', 'start', 'Åbn', 'Brug din arbejdsmail.'],
      ['Opret et projekt i regionen EU.', 'console', 'Åbn', 'Et nyt projekt giver 50 USD i prøvekredit.'],
      ['Sæt en månedlig grænse.', null, null, 'Under Billing i Corti Console.'],
      ['Hent en API-nøgle under Corti Models, og kopiér den.', 'keys', 'Åbn'],
      ['Indsæt den herunder.']],
    cost: 'Du betaler, når prøvekreditten er brugt. Du ser modtager og pris for modellen, før noget sendes, og forbruget under skrivefeltet.'
  },
  alexandra: {
    steps: [['Opret en konto på Alexandra AI Platform.', 'start', 'Åbn', 'Alexandra Instituttets AI-platform med behandling i Danmark.'],
      ['Opret en API-nøgle under API-nøgler, og kopiér den.', 'keys', 'Åbn', 'Selve nøglen vises kun, når du opretter den. Der findes personlige og organisationsejede nøgler.'],
      ['Sæt en månedlig forbrugsgrænse under Fakturering.', 'billing', 'Åbn', 'Grænsen gælder også beløb, der er reserveret til igangværende kald.'],
      ['Indsæt nøglen herunder.']],
    cost: 'Platformen kræver saldo eller kredit hos Alexandra. Priserne er i DKK pr. million tokens. Du ser modtager og pris for modellen, før noget sendes, og forbruget under skrivefeltet.'
  }
};
// Trin i almindeligt dansk: én kort linje, en knap til udbyderens side og uddybning bag ⓘ.
function renderKeyGuide(kind) {
  // Catalog providers without a written guide get one honest step: the key page from the definition.
  const definition = state?.definitions?.[kind];
  const guide = keyGuides[kind] || (definition?.keyURL ? { steps: [[`Opret en API-nøgle hos ${definition.provider || definition.name}.`, 'start', `Åbn ${definition.provider || definition.name}`]] } : null);
  $('#key-steps').replaceChildren(...(guide?.steps || []).map(([text, page, label, more]) => {
    const item = node('li', text);
    if (more) item.append(info(text.replace(/\.$/, '').toLocaleLowerCase('da'), more));
    if (page) { const button = node('button', label, 'text-button'); button.type = 'button'; button.setAttribute('aria-label', `${label}: ${text}`); button.onclick = () => action(() => call('providerAccount', { kind, page })); item.append(' ', button); }
    return item;
  }));
  $('#key-steps').hidden = !guide;
  $('#cost-info').dataset.info = guide?.cost || 'Du ser modtager og pris for modellen, før noget sendes, og forbruget under skrivefeltet.';
  $('#provider-account').hidden = Boolean(guide);
  $('#key-guide-summary').textContent = guide ? 'Har du ikke en nøgle? Sådan får du en' : 'Hvor finder jeg min nøgle?';
}
function updateProvider() {
  clearConnectionReceipt();
  const definition = state?.definitions[$('#provider-kind').value]; if (!definition) return;
  const help = { openai: 'Brug en OpenAI API-nøgle. Den afregnes separat fra dit ChatGPT-abonnement.', azure: 'Brug API-nøglen og deployment-navnet fra din Azure OpenAI- eller Foundry-ressource.', corti: 'Du skal bruge en nøgle fra Corti Models i et projekt i EU, EU-S eller Frankrig. Appen skifter aldrig automatisk til USA eller en anden model.', alexandra: 'Du skal bruge en API-nøgle fra Alexandra AI Platform. Appen bruger kun platformens egen adresse i Danmark. Adgangen til den enkelte model styres af din organisation.', mistral: 'Du skal bruge en API-nøgle fra Mistral.', anthropic: 'Du skal bruge en API-nøgle fra Anthropic. Et Claude Pro- eller Max-abonnement kan ikke bruges her.', openrouter: 'Brug din OpenRouter-nøgle. Du vælger selv model og den udbyder, der modtager dine data. Gratis modeller er markeret i listen.', zen: 'Brug en nøgle fra OpenCode Zen. Zens gratis modeller virker ikke i Aura Prime, fordi Zen kun giver gratis adgang fra OpenCodes egne programmer. Zens modeller kører i USA.', ollama: 'Forbind til en Ollama-server, som allerede kører. Kontrollér adressen nedenfor; appen installerer ikke modeller.', compatible: 'Brug adressen fra din organisation eller egen modelserver. Serveren kan køre lokalt eller på jeres netværk.' };
  $('#provider-info').dataset.info = help[$('#provider-kind').value]; renderKeyGuide($('#provider-kind').value);
  $('.key-guide').hidden = LOCAL_KINDS.includes($('#provider-kind').value) || (!keyGuides[$('#provider-kind').value] && !definition.keyURL);
  const isAzure = $('#provider-kind').value === 'azure';
  $('#azure-fields').hidden = !isAzure; $('#azure-endpoint').required = isAzure; $('#azure-deployment').required = isAzure;
  $('#base-url').required = !isAzure;
  for (const el of [$('#base-url'), $('#base-url').previousElementSibling, $('#base-url-help').nextElementSibling]) el.hidden = isAzure;
  const editableAddress = LOCAL_KINDS.includes($('#provider-kind').value) || definition.editableBaseURL === true;
  $('#base-url').value = definition.baseURL; $('#connection-advanced').open = editableAddress; $('#base-url').readOnly = !editableAddress;
  $('#custom-api-fields').hidden = $('#provider-kind').value !== 'compatible';
  // Opsætningshjælp (4.11): Cloudflare needs an account id inside the address;
  // the main process still validates the finished address strictly.
  const kindNow = $('#provider-kind').value;
  $('#cloudflare-fields').hidden = kindNow !== 'cloudflare';
  $('#cloudflare-account').required = kindNow === 'cloudflare';
  if (kindNow === 'cloudflare') { const match = /\/accounts\/([a-f0-9]{32})\//.exec($('#base-url').value || ''); $('#cloudflare-account').value = match ? match[1] : ''; syncCloudflareAddress(); }
  const portHelp = { lmstudio: 'LM Studio bruger normalt port 1234. Start serveren under Developer i LM Studio, og ret adressen under Avanceret, hvis du har valgt en anden port.', vllm: 'vLLM bruger normalt port 8000 (vllm serve). Ret adressen under Avanceret, hvis serveren kører et andet sted.', ollama: 'Ollama bruger normalt port 11434 på denne computer.' }[kindNow];
  $('#local-port-help').hidden = !portHelp; $('#local-port-help').textContent = portHelp || '';
  $('#base-url').placeholder = $('#provider-kind').value === 'compatible' ? 'https://gateway.example/v1' : '';
  if (!$('#connection-id').value) { const used = new Set((state?.connections || []).map(c => c.name)); let name = definition.name, number = 2; while (used.has(name)) name = `${definition.name} ${number++}`; $('#connection-name').value = name; }
  renderKeyReuse();
}
async function loadModels(saved = {}) {
  const id = $('#connection-select').value; const generation = ++modelRequest; acceptedFingerprint = null;
  modelCatalog = []; $('#model-shortlist').replaceChildren(); $('#model-evidence').textContent = '';
  $('#model-select').replaceChildren(option('', id ? 'Henter modeller …' : 'Vælg en forbindelse først')); $('#route-row').hidden = true;
  updateModelSummary();
  if (!id) return;
  try {
    const models = await checkedModels(id); if (generation !== modelRequest) return;
    modelCatalog = models; $('#model-search').value = ''; renderShortlist();
    $('#model-select').replaceChildren(option('', 'Vælg model'));
    for (const model of models) {
      const free = model.price && model.price.prompt != null && model.price.completion != null && Number(model.price.prompt) === 0 && Number(model.price.completion) === 0;
      $('#model-select').append(option(model.id, `${pentModelNavn(model.id, model.name)}${free ? ' · gratis*' : ''}`));
    }
    if (saved.modelID && models.some(m => m.id === saved.modelID)) { $('#model-select').value = saved.modelID; await loadRoutes(saved.routeID); }
    else if (profileState?.standardAI?.connectionID === id && profileState.standardAI.modelID && models.some(m => m.id === profileState.standardAI.modelID)) { $('#model-select').value = profileState.standardAI.modelID; await loadRoutes(); }
    else preselectRecommended(id);
    markChosenModel(); updateModelSummary(); refreshEffortLevels(); $('#connection-warning').hidden = true; $('#connection-status').textContent = state.connections.find(c => c.id === id)?.name || 'Ingen model valgt';
  } catch (error) { if (generation === modelRequest) { $('#model-select').replaceChildren(option('', 'Forbindelsen kunne ikke læses')); connectionFailed(error.message); } throw error; }
}
async function loadRoutes(saved = '') {
  acceptedFingerprint = null;
  const id = $('#connection-select').value, modelID = $('#model-select').value;
  const connection = state.connections.find(c => c.id === id); $('#route-row').hidden = connection?.kind !== 'openrouter';
  if (connection?.kind !== 'openrouter' || !modelID) return;
  const routes = await call('routes', { connectionID: id, modelID });
  if ($('#connection-select').value !== id || $('#model-select').value !== modelID) return;
  $('#route-select').replaceChildren(option('', 'Vælg udbyder – ingen automatisk routing'));
  for (const route of routes) $('#route-select').append(option(route.id, route.name));
  if (routes.some(route => route.id === saved)) $('#route-select').value = saved;
  renderStatusLine();
}
function selection() { return { text: $('#prompt').value, chatMaterials:window.chatMaterials?.selection() || null, effort: view?.effort || null, includeHistory: $('#include-history').checked, mode: $('#work-mode').value, planID: activePlan?.id, connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-select').value, references: [...document.querySelectorAll('#reference-choices input:checked')].map(el => el.value), fileRefs: window.workspace?.references() || [], previewTarget: window.workspace?.target()?.id || null, view: window.previewViewSize?.() || null, chat: view.id, invokedSkills: window.SlashCommands?.inserted() || [] }; }
const detailLabels = { rules: 'Fælles grundregler, der sendes', projectInstructions: 'Projektets egne regler, der sendes', projectDesignDocument: 'Projektets DESIGN.md, der sendes', gradientdeckStyle: 'Ekstern designreference, der sendes', workspace: 'Arbejdsmappe', mode: 'Arbejdsmåde', brief: 'Projektbrief, der sendes', previewReferenceText: 'Valgt element, der sendes', conversation: 'Tidligere samtale, der sendes', projectGuidance: 'Appens vejledning om projektvalg og design', planContext: 'Plan og afklaring, der sendes', projectChoices: 'Projektets opstartsvalg', projectDesign: 'Projektets designvalg', fileReferences: 'Filhenvisninger i beskeden', connection: 'Forbindelse', model: 'Model', endpoint: 'Serveradresse', recipients: 'Modtagere', region: 'Behandlingssted', retention: 'Opbevaring', training: 'Brug til træning', price: 'Pris og gratisbegrænsninger', capabilities: 'Modelmuligheder', material: 'Hvad sendes?', references: 'Udvalgte private referencer', skills: 'Skills, AI’en kan hente', commandInvocations: 'Kommandoer aktiveret i beskeden', localStorage: 'Lokal historik og yderligere netværk', security: 'Forbindelsens sikkerhed', source: 'Kilde', checkedAt: 'Dokumentation kontrolleret', evidence: 'Grundlag' };
// Kort resumé i almindeligt dansk. Alle oplysninger ligger under "Se alle oplysninger".
function showData(data, canSend) {
  $('#data-summary').replaceChildren();
  const unknown = [data.region, data.retention, data.training, data.price].filter(v => /ukendt|ikke verificeret/i.test(String(v)));
  $('#data-warning').hidden = !unknown.length;
  $('#data-warning').textContent = 'Nogle vilkår er ukendte for denne forbindelse. Del kun det, du er sikker på, at du må dele.';
  const hasPlan = Array.isArray(data.planContext) ? data.planContext.length > 0 : Boolean(data.planContext);
  const material = ['Din besked', data.brief ? 'projektbriefen' : '', hasPlan ? 'planen og afklaringen' : ''].filter(Boolean);
  $('#data-lead').textContent = `${material.join(', ')} og de projektfiler, AI’en læser, sendes til ${data.provider || data.connection}.`;
  // Den fortsatte agentsession kan allerede have historik. Tilvalget nedenfor er en ekstra kopi, ikke en kontakt til at slette AI'ens kontekst.
  $('#data-history-text').textContent = 'I denne samtale kan AI’en bruge tidligere beskeder og værktøjsresultater. Start Ny samtale for et nyt forløb.' + (data.historyIncluded ? ' En ekstra kopi af tidligere samtale medsendes efter dit tilvalg. Se indholdet under alle oplysninger.' : '');
  $('#data-history-text').hidden = false;
  // Filhenvisninger står i første lag, fordi de er nyt materiale, brugeren selv har valgt at dele.
  // Et valgt element står også i første lag: AI'en får elementets tekst, placering og et uddrag af sidens HTML.
  // S5: en anvendt GradientDeck-stil står i første lag — tredjepartstekst fra
  // ui.gradientdeck.com medsendes som en del af projektets DESIGN.md.
  const shared = [data.fileReferences?.length ? `Filhenvisninger: ${data.fileReferences.join(', ')}. AI’en får stien og læser selv filen i projektet.` : '', data.previewReference ? `Valgt i forhåndsvisningen: ${data.previewReference}. AI’en får elementets tekst, placering og et uddrag af sidens HTML; se det under alle oplysninger.` : '', data.gradientdeckStyle ? `Ekstern designreference: ${data.gradientdeckStyle}. Stilen er tredjepartstekst, der medsendes som projektets DESIGN.md.` : ''].filter(Boolean);
  $('#data-refs-text').textContent = shared.join(' ');
  $('#data-refs-text').hidden = !shared.length;
  for (const [label, value] of Object.entries({ 'AI': data.modelName ? `${data.modelName} · ${data.provider || data.connection}` : `${data.model} · ${data.connection}`, 'Hvor': data.regionShort || data.region, 'Træning': data.trainingShort || data.training, 'Pris': data.priceShort || data.price })) {
    $('#data-summary').append(node('dt', label), node('dd', Array.isArray(value) ? value.join(', ') : value));
  }
  // Alle oplysninger som korte rækker. Lange tekster, fx appens vejledning og planen, har hver sin fold.
  $('#data-details').replaceChildren();
  for (const [key, label] of Object.entries(detailLabels)) {
    const value = data[key];
    if (key === 'projectInstructions' && !value) continue;
    if (['fileReferences', 'brief', 'previewReferenceText', 'commandInvocations', 'gradientdeckStyle'].includes(key) && !value?.length) continue;
    const text = key === 'mode' ? ({ chat: 'Samtale', plan: 'Planlæg', build: 'Byg den valgte plan', free: 'Byg' }[value]) : key === 'conversation' && !value ? 'Medsendes ikke. Den aktive samtale og en valgt plan indgår stadig.' : Array.isArray(value) ? value.join(', ') || 'Ingen' : value && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || 'Ingen');
    const dd = node('dd');
    if (text.length > 160) { const fold = node('details', undefined, 'disclosure'); fold.append(node('summary', `Vis (${text.split(/\s+/).length} ord)`), node('pre', text)); dd.append(fold); }
    else dd.textContent = text;
    $('#data-details').append(node('dt', label), dd);
  }
  window.ChatMaterials.disclose(data.chatMaterials);
  if (data.appContext) {
    const dd = node('dd'), list = node('div');
    list.append(node('p', data.appContext.scope, 'hint'));
    for (const part of data.appContext.components) {
      const fold = node('details', undefined, 'disclosure'); fold.append(node('summary', part.title), node('p', `${part.source} · revision ${part.revision}`, 'hint'), node('p', `SHA-256: ${part.hash}`, 'hint'), node('pre', part.text)); list.append(fold);
    }
    dd.append(list); $('#data-details').append(node('dt', 'Sporbar kontekst · vis præcis tekst'), dd);
  }
  if (data.modelSupport) {
    const support = data.modelSupport, dd = node('dd'), fold = node('details', undefined, 'disclosure');
    fold.append(node('summary', 'Katalogoplysninger og faktiske prøver'));
    const word = value => value === true ? 'angivet' : value === false ? 'ikke angivet som understøttet' : 'ukendt';
    fold.append(node('p', `Katalog · værktøjer: ${word(support.catalog.model.tools)} · billeder: ${word(support.catalog.model.images)}`));
    if (support.catalog.route) fold.append(node('p', `Valgt rute · værktøjer: ${word(support.catalog.route.tools)} · billeder: ${word(support.catalog.route.images)}`));
    fold.append(node('p', support.catalog.checkedAt ? `Katalog læst: ${support.catalog.checkedAt}` : 'Katalogets kontroltidspunkt er ukendt.', 'hint'));
    if (!support.measurements.length) fold.append(node('p', 'Ingen faktisk prøve registreret for denne forbindelse, model og rute.'));
    for (const item of support.measurements) fold.append(node('p', `${item.capability === 'images' ? 'Billeder' : 'Værktøjer'} · ${item.outcome === 'passed' ? 'bestået' : 'fejlet'} · ${item.environment === 'controlled' ? 'kontrolleret testserver' : 'udbyderprøve'} · ${item.at} · ${item.method}`));
    fold.append(node('p', support.note, 'hint'), node('pre', JSON.stringify(support.binding, null, 2))); dd.append(fold);
    $('#data-details').append(node('dt', 'Prøvegrundlag for modelstøtte'), dd);
  }
  $('#accept-send').hidden = !canSend; $('#data-dialog').showModal();
}
async function sendNow(data, text) {
  const v = view, owner = selectedOwner(); v.activityGroup = null; v.planCard = false; v.runConnection = $('#connection-select').value;
  v.runContextSelection = { connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-row').hidden ? '' : $('#route-select').value };
  v.activeModelSummary = $('#model-chip').textContent;
  v.activeModelBrand = { kind: state?.connections.find(c => c.id === v.runConnection)?.kind, modelID: $('#model-select').value };
  $('#model-options').open = false; $('#task-dialog').close(); $('#connection-warning').hidden = true; $('#data-dialog').close(); setRunning(true, 'Starter agent …');
  if ($('#work-mode').value === 'free') { activePlan = null; $('#plan-card').hidden = true; }
  $('#run-review').hidden = true; if ($('#work-mode').value === 'build') $('#plan-card').hidden = true; if ($('#work-mode').value === 'plan') { activePlan = null; $('#plan-card').hidden = true; }
  Object.assign(v, { lastSentText: text, lastTarget: data.previewReference || '', lastTargetRef: window.workspace?.target() || null, lastCheckpoint: null, rejectedThisRun: false, lastRejection: null });
  appendMessage(text + (data.fileReferenceText || '') + (v.lastTarget ? `\n\nMål i forhåndsvisningen: ${v.lastTarget}` : ''), 'user', v, Date.now()); $('#prompt').value = ''; await saveChatDraft();
  const compact = v.compactNext === true; v.compactNext = false; v.effortLevels = data.effortLevels || [];
  try { await call('send', { text, fingerprint: data.fingerprint, contextBinding: data.contextBinding, chat: v.id, compact }, owner); if (view === v) { acceptedFingerprint = reviewKey(data); window.workspace?.clearReferences(); } }
  catch (error) { if (error.message === 'Opgaven blev stoppet før afsendelse.') { setRunning(false, 'Stoppet', v); return; } if (view === v) { $('#prompt').value = text; await saveChatDraft(); } setRunning(false, 'Fejl', v); renderRunReview({ status: 'error', files: [], tools: [], failure: { kind: 'start', message: error.message } }, v); }
}
// Under en opgave viser statusfeltet, hvor længe den har kørt, så en lang tænkepause ikke ligner, at appen er gået i stå.
let runTimer = null;
const elapsedText = ms => { const seconds = Math.floor(ms / 1000); return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`; };
// Én status for opgaven. Overskriften i samtalen siger kort, hvor opgaven er; linjen under siger, hvad der sker, og
// om AI'en venter på brugeren. Efter Stop og fejl står vejen videre på resultatkortet, ikke i flere bokse.
// Status pr. samtale. Godkendelser og spørgsmål i en samtale i baggrunden vises i sidepanelet og venter, til den åbnes.

// Status-badge farvning følger tilstanden fra run-state — ikke teksten, så 'Stoppet' er
// aldrig rødt som en fejl, og 'Venter på dig' er aldrig gråt.
function updateBadgeClass() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  const badge = document.getElementById('run-status');
  if (!badge) return;
  badge.classList.remove('run-idle', 'run-error', 'run-working', 'run-stopped');
  badge.classList.add(window.RunState.badgeClass(view));
}

function setStatusDetail(text, v = view) { v.statusDetail = text; if (v === view) { renderStatus(); updateBadgeClass(); } }
function waitFor(id, title, element, v = view) { v.waitingFor = [...v.waitingFor.filter(item => item.id !== id), { id, title, element }]; if (v === view) renderStatus(); window.chats?.render(); }
function doneWaiting(id, v = view) { v.waitingFor = v.waitingFor.filter(item => item.id !== id); if (v === view) renderStatus(); window.chats?.render(); }
// Topbjælken (§6.1): samtaletitlen 15/22 vægt 500, projektnavnet som teriær
// brødkrumme. Titlen læses fra sidepanelets projektliste — ingen ny kilde.
function syncTopbar() {
  if (typeof document === 'undefined' || !document.getElementById) return;
  const chat = window.chats?.projects().find(project => project.root === current?.root)?.chats?.find(item => item.id === view.id)?.title || 'Ny samtale';
  const title = view.id ? chat : 'Ny samtale';
  if ($('#chat-title').textContent !== title) $('#chat-title').textContent = title;
  const name = current?.name || '';
  if ($('#project-name').textContent !== name) $('#project-name').textContent = name;
}
// Sidepanelets opdatering (omdøb, ny titel) skubber titlen op i bjælken.
window.topbarSync = syncTopbar;
function renderStatus() {
  const v = view, waiting = v.running && v.waitingFor.length > 0;
  // Båndet hører til samtalefladen; idle skjules med opacity, så pladsen altid er reserveret.
  $('#agent-activity').hidden = false;
  // Skillelinjen over live-indikatoren (§6.4) står kun, når der er indhold i loggen.
  $('#agent-activity').dataset.sep = v.log.childElementCount > 0 ? 'on' : 'off';
  // Lyskanten følger kun den aktive samtale; ventende valg står stille.
  $('#chat-form').dataset.metalState = v.running ? (waiting ? 'waiting' : 'working') : 'idle';
  $('#agent-activity').classList.toggle('is-idle', !v.running); $('#agent-activity').classList.toggle('is-waiting', waiting);
  // Live-indikatoren (§6.4): "Arbejder · 12 s" med sekundur — fasen og det
  // aktuelle trin står i samtalens trinrækker (§6.3/§6.5), ikke her.
  $('#agent-activity-text').textContent = waiting ? `Venter på dig · ${v.waitingFor[0].title}${v.waitingFor.length > 1 ? ` Og ${v.waitingFor.length - 1} mere.` : ''}` : v.running ? `Arbejder · ${elapsedText(Date.now() - v.runStartedAt)}${v.repeat ? ` · Gentager samme handling (${v.repeat.count}. gang)` : ''}` : v.runLabel || 'Klar';
  $('#agent-activity-jump').hidden = !waiting; $('#agent-follow').hidden = waiting;
  window.liveWork?.render();
  window.previewWorking?.render();
  const progress = window.ChatDisplay.progress(v);
  // P1: nuance-linjen står kun med indhold — aldrig som fyld ved siden af
  // live-indikatorens ene "Arbejder · 12 s".
  $('#agent-progress').textContent = progress.text; $('#agent-progress').hidden = waiting || progress.text === '';
  $('#agent-activity').classList.toggle('is-quiet', progress.quiet && !waiting);
  window.feedbackLayout?.update({ running: v.running, waitingTarget: waiting ? v.waitingFor[0].element : null });
  $('#chat-form').setAttribute('aria-busy', String(v.running));
  if (v.running) $('#run-status').textContent = waiting ? 'Venter på dig' : `${v.runLabel} ${elapsedText(Date.now() - v.runStartedAt)}`;
  syncTopbar();
}
$('#agent-activity-jump').onclick = () => { const item = view.waitingFor[0]; if (!item?.element?.isConnected) return; item.element.scrollIntoView({ block: 'nearest' }); item.element.querySelector('button, textarea, input')?.focus(); };
function setRunning(value, status, v = view) {
  if (value && !v.running) { v.runStartedAt = Date.now(); v.lastSignalAt = v.runStartedAt; v.receivedChars = 0; v.modelProgress = null; v.todos = []; v.lastReview = null; v.repeat = null; }
  if (!value) v.waitingFor = [];
  v.running = value; v.runLabel = status;
  // Skærmlæseren holder sig fra den løbende genopbygning under arbejdet; svaret annonceres,
  // når statuslinjen og resultatkortet (aria-live) siger, at opgaven er færdig.
  v.log.setAttribute('aria-busy', value ? 'true' : 'false');
  if (value) v.statusDetail = status.startsWith('Starter') ? 'Aura Prime starter AI’en …' : $('#work-mode').value === 'plan' ? 'Venter på modellens forslag …' : 'Venter på modellen …';
  if (v === view) { running = value; $('#run-status').textContent = status; updateBadgeClass(); updateModelSummary(); }
  applyRunning(); window.chats?.render();
  if (!anyRunning() && recovery) { const reason = recovery; recovery = ''; showConnectionWarning(reason); }
}
// Navigation og indstillinger er tilgængelige, mens opgaver fortsætter i baggrunden.
function applyRunning() {
  const busy = projectLoading || running;
  clearInterval(runTimer); runTimer = running ? setInterval(renderStatus, 1000) : null;
  // Samtalerodens fase følger indlæsning og beskeder (settling → hero/active).
  applyChatPhase();
  // Afsendelsesbuen: Send viser en roterende bue, mens besedden forberedes.
  $('#chat-form').dataset.submitting = String(Boolean(view.submitting));
  // Den tomme forhåndsvisning ånder roligt, mens AI'en arbejder. Animationen slås fra ved reduceret bevægelse.
  $('#preview-empty').classList.toggle('is-working', busy);
  // En samtale, der ikke arbejder, viser sin egen seneste status, fx Stoppet eller Fejl. Linjen over skrivefeltet siger, hvis en anden arbejder.
  if (!running) $('#run-status').textContent = view.runLabel || 'Klar';
  $('#send').disabled = projectLoading || running || Boolean(view.submitting); $('#send').hidden = running; $('#stop').hidden = !running;
  if (typeof document !== 'undefined' && running && document.activeElement && document.activeElement.id === 'send') $('#stop').focus();
  $('#composer-wait').hidden = true;
  const mainRunning = window.chats?.projects().find(item => item.root === current?.root)?.chats?.some(chat => chat.running && !chat.isolated);
  $('#merge-copy').disabled = projectLoading || running || Boolean(mainRunning);
  $('#copy-wait').hidden = !current?.isolated || running || !mainRunning;
  const value = projectLoading;
  for (const selector of ['#new', '#new-chat', '#open', '#connections-button', '#skills-button', '#features-button', '#publish-button', '#setup-hosting', '#deploy-button', '#intro-button']) $(selector).disabled = value;
  for (const selector of ['#composer-mode', '#topbar-mode', '#accept-plan-offer', '#work-mode', '#build-plan', '#revise-plan', '#start-idea']) $(selector).disabled = running;
  for (const selector of ['#model-chip', '#model-load', '#model-search', '#connection-select', '#model-select', '#route-select']) $(selector).disabled = projectLoading;
  for (const button of document.querySelectorAll('#model-shortlist button')) button.disabled = projectLoading;
  $('#task-next-note').hidden = !running;
  $('#include-history').disabled = running;
  setupControls();
  renderStatus(); window.previewEdit?.available(); window.chatMaterials?.sync(); window.ComposerWorkMode?.sync();
}
function showSkill() {
  const skill = skillList.find(s => s.id === $('#skill-select').value); if (!skill) return;
  $('#skill-content').value = skill.content;
  $('#skill-source').textContent = `${skill.customized ? 'Lokal tilpasning i dette projekt' : 'Fælles version fra biblioteket'}${skill.alwaysOn ? ' · gælder altid' : skill.enabled ? '' : ' · funktionen er slået fra'}`;
}
const toolLabels = { read: 'Læs fil', edit: 'Rediger fil', write: 'Skriv fil', bash: 'Kør kommando', webfetch: 'Læs hjemmeside', websearch: 'Søg på nettet', glob: 'Find filer', grep: 'Søg i filer', external_directory: 'Adgang uden for projektet' };
const toolStatuses = { pending: 'Venter', running: 'I gang', completed: 'Afsluttet', error: 'Mislykkedes' };
// Værktøjerne står under Aktivitet. Samtalen viser én linje pr. opgave med antallet og en vej dertil.
function noteTool(id, v = view) {
  if (window.liveWork?.noteTool?.(id, v)) return;
  if (!v.activityGroup) {
    v.activityGroup = node('p', undefined, 'activity-pointer'); v.activityGroup.tools = new Set();
    const open = node('button', 'Se Aktivitet', 'text-button'); open.type = 'button'; open.onclick = () => window.workspace.show('activity');
    v.activityGroup.append(node('span'), open); v.log.append(v.activityGroup);
  }
  v.activityGroup.tools.add(id);
  const count = v.activityGroup.tools.size;
  v.activityGroup.firstChild.textContent = `AI’en har brugt ${count} ${count === 1 ? 'værktøj' : 'værktøjer'}.`;
}
function partElement(id, role, v = view) {
  if (!v.parts.has(id)) v.parts.set(id, appendMessage('', role, v));
  return v.parts.get(id);
}
async function openAbout() {
  const list = document.getElementById('about-list');
  let info = null;
  try { const response = await window.harness.about(); info = response?.ok === true ? (response.value || null) : null; } catch { info = null; }
  const value = key => info?.[key] || 'ikke tilgængelig';
  const rows = [
    ['Appversion', value('app')],
    ['OpenCode (låst)', value('opencode')],
    ['Electron', value('electron')],
    ['Chromium', value('chromium')],
    ['Node (indbygget)', value('nodeEmbedded')],
    ['Node til agenten (låst)', value('nodeRuntime')],
    ['Git til agenten (låst)', value('git')],
  ];
  const machine = [info?.platform, info?.arch, info?.osRelease].filter(Boolean).join(' ');
  list.innerHTML = rows.map(([label, text]) => `<dt>${label}</dt><dd>${text}</dd>`).join('') + `<dt>Maskine</dt><dd>${machine || 'ikke tilgængelig'}</dd>`;
  document.getElementById('about-dialog').showModal();
}
// Hændelser fra en samtales opgave vises i dens egen visning, også når en anden samtale er åben.
window.harness.onEvent(event => {
  if (event.type === 'about.open') { openAbout(); return; }
  window.PrivacyGate?.onEvent(event);
  const p = event.properties || {};
  if (event.type === 'chat.copy-removed') { previewFrames.get(event.workspaceRoot)?.remove(); previewFrames.delete(event.workspaceRoot); previewRevisions.delete(event.workspaceRoot); return; }
  if (event.type === 'chat.preview' && event.chat === view.id) { usePreviewContext(event); return; }
  if (event.type === 'chat.workspace' && event.chat === view.id) { window.workspace?.onChat(); return; }
  if (event.type === 'preview.runtime' && event.workspaceRoot && event.workspaceRoot !== current?.workspaceRoot) return;
  if (event.type === 'preview.runtime') return window.previewServer?.update(event);
  if (event.type === 'history.error' && (!event.chat || event.chat === view.id) && (!event.root || event.root === current?.root)) { setDraftStatus(event.message, false); message(event.message, true); }
  if (event.type === 'preview.ready' && event.workspaceRoot && event.workspaceRoot !== current?.workspaceRoot) return;
  if (event.type === 'preview.ready') { showPreview(event.url); window.previewServer?.refresh(); return; }
  if (event.type === 'chats.updated') { Promise.resolve(window.chats?.update(event)).then(applyRunning, () => {}); return; }
  if (!event.chat && ['usage', 'plan.ready', 'run.review', 'git.checkpoint', 'session.new', 'run.status', 'message.updated', 'message.part.updated', 'message.part.delta', 'permission.asked', 'question.asked', 'engine.error', 'session.error'].includes(event.type) && !view.id) return;
  const v = viewFor(event.chat), active = v === view;
  if (event.root) v.root ||= event.root;
  if (event.type === 'conversation.permission') { v.conversationPermission = { active: event.active === true }; if (active) window.ConversationPermission?.sync(); return; }
  if (v.running && ['message.part.updated', 'message.part.delta', 'permission.asked', 'question.asked', 'permission.replied', 'question.replied', 'usage'].includes(event.type)) v.lastSignalAt = Date.now();
  if (event.type === 'run.todos') { v.todos = event.todos; if (active) renderStatus(); return; }
  // Løkkesignal: en observation, ikke en fejlkonklusion. Vises i statuslinjen, mens turen kører,
  // og gemmes på viewet til resultatkortet. Ny tur rydder den.
  if (event.type === 'run.repeat') { v.repeat = { tool: event.tool, count: event.count, level: event.level, label: event.label, at: Date.now() }; if (active) { renderStatus(); updateBadgeClass(); } window.chats?.render(); return; }
  if (event.type === 'files.written') { if (v.modelProgress) v.modelProgress.draft = null; if (active) renderStatus(); }
  if (event.type === 'model.progress') { if (v.running) { v.modelProgress = event.progress; v.lastSignalAt = event.progress.lastContentAt; if (active) renderStatus(); } return; }
  if (event.type === 'message.part.delta' && typeof p.delta === 'string' && v.partTypes.get(p.partID) === 'text') { v.receivedChars += p.delta.length; if (active) renderStatus(); }
  if (event.type === 'usage') { v.usage = event.usage; v.contextUsage = event.contextUsage || null; v.speed = event.speed || null; if (active) renderStatusLine(); return; }
  if (event.type === 'plan.offer') { v.planOffer = event.offered; updatePlanOffer(v); }
  if (event.type === 'plan.retired') { v.plan = null; v.planCard = false; if (active) { activePlan = null; $('#plan-card').hidden = true; } }
  if (event.type === 'plan.ready') { v.plan = event.plan; v.planCard = true; if (v.buildOffer) { v.buildOffer = false; v.review.hidden = true; } updatePlanOffer(v); if (active) { activePlan = event.plan; window.planning?.onPlan(event.plan); $('#plan-card').hidden = false; if (v.followChat) requestAnimationFrame(() => $('#plan-card').scrollIntoView({ block: 'nearest' })); } }
  if (event.type === 'run.review') { renderRunReview(event, v); if (!active) { v.unread = true; window.chats?.render(); } }
  // Versionen efter opgaven vises på resultatkortet. Kun en oversprunget version nævnes i samtalen.
  if (event.type === 'git.checkpoint') { v.lastCheckpoint = event; if (event.status === 'skipped') appendMessage(event.message, 'system', v); return; }
  if (event.type === 'session.new') { v.contextUsage = null; if (active) renderStatusLine(); v.roles.clear(); v.parts.clear(); v.partTypes.clear(); }
  if (event.type === 'run.status') {
    const working = ['starting', 'working'].includes(event.status);
    const statuses = { starting: 'Starter agent …', working: 'Arbejder …', idle: 'Klar', error: 'Fejl', stopped: 'Stoppet', rejected: 'Klar' };
    setRunning(working, statuses[event.status] || event.status, v);
    if (['stopped', 'error'].includes(event.status)) {
      if (event.status === 'stopped') { v.plan = null; v.planCard = false; }
      if (active) {
        if (!$('#prompt').value) $('#prompt').value = v.lastSentText;
        // Målet i forhåndsvisningen følger med beskeden tilbage, så Send igen retter det samme element.
        if (v.lastTargetRef && !window.workspace?.target()) window.workspace?.setTarget(v.lastTargetRef);
        if (event.status === 'stopped') { activePlan = null; $('#plan-card').hidden = true; }
        if (event.status === 'stopped' && $('#work-mode').value === 'build') { $('#work-mode').value = 'plan'; updateWorkMode(); }
      } else v.draft = { text: v.lastSentText, mode: event.status === 'stopped' && v.draft?.mode === 'build' ? 'plan' : v.draft?.mode || 'chat' };
    }
    if (!working) { v.approvals.replaceChildren(); if (active) saveChatDraft(); }
  }
  if (event.type === 'message.updated') v.roles.set(p.info.id, p.info.role);
  if (event.type === 'message.part.updated') {
    const part = p.part;
    v.partTypes.set(part.id, part.type);
    if (v.roles.get(part.messageID) === 'user') return;
    if (part.type === 'text') showAssistant(part.id, part.text, v);
    if (part.type === 'tool' && v.running && ['pending', 'running'].includes(part.state?.status)) setStatusDetail(`${toolLabels[part.tool] || 'Værktøjshandling'} · ${toolStatuses[part.state.status]}`, v);
    // Når et værktøj er færdigt, tænker modellen over næste skridt. Banneret må ikke blive stående på det afsluttede værktøj.
    if (part.type === 'tool' && v.running && ['completed', 'error'].includes(part.state?.status)) setStatusDetail('Venter på modellens næste svar …', v);
    if (part.type === 'text' && v.running) setStatusDetail('AI’en skriver …', v);
    if (part.type === 'reasoning' && v.running) setStatusDetail('Modellen forbereder næste skridt …', v);
    if (part.type === 'tool') noteTool(part.id, v);
  }
  if (event.type === 'message.part.delta' && p.field === 'text' && v.partTypes.get(p.partID) === 'text' && v.roles.get(p.messageID) !== 'user') showAssistant(p.partID, (v.assistantText.get(p.partID) || '') + p.delta, v);
  if (event.type === 'permission.auto') return;
  // Godkendelser: se approvals.js. Fokus bliver, hvor brugeren er; statuslinjen siger, at AI'en venter.
  if (event.type === 'permission.asked') window.approvals.show(p, v);
  // AI'ens spørgsmål vises ét ad gangen med klikbare svar; se planning.js. Fokus bliver, hvor brugeren er.
  if (event.type === 'question.asked') window.planning.showQuestion(p, v);
  // En fejl under en opgave vises ét sted: på resultatkortet med en vej videre. Beskeden står klar i skrivefeltet.
  if (['engine.error', 'session.error'].includes(event.type) && !event.permissionRejected) {
    if (active && !$('#prompt').value) $('#prompt').value = v.lastSentText;
    if (['key', 'access', 'rejected', 'notfound'].includes(event.failure?.kind)) {
      invalidateConnection(v.runConnection, event.failure?.message || event.message || 'Udbyderen afviste opgaven. Kontrollér adgang og model.');
      verifiedConnection = ''; ++setupGeneration; acceptedFingerprint = null; pendingSend = null; setupControls();
    }
    if (v.running) setStatusDetail('Der opstod en fejl. AI’en stopper.', v);
  }
});
function setProjectColor(color) { $('#color-chosen').checked = Boolean(color); $('#color').disabled = !color; $('#color').value = color || '#475569'; $('#color-value').value = color || 'Ikke valgt'; }
const projectColor = () => $('#color-chosen').checked ? $('#color').value : null;
$('#color-chosen').onchange = () => { $('#color').disabled = !$('#color-chosen').checked; $('#color-value').value = projectColor() || 'Ikke valgt'; };
$('#color').addEventListener('input', event => { $('#color-value').value = event.target.value; });
for (const kind of ['logo', 'reference']) $(`#${kind}`).onclick = () => action(async () => showAssets(await call('chooseAssets', kind)));
$('#open').onclick = () => action(async () => { const request = ++navigationRequest, owner = selectedOwner(); await saveChatDraft(); const project = await call('openProject', undefined, owner); if (request === navigationRequest) await displayProject(project); });
$('#new').onclick = () => action(async () => {
  const request = ++navigationRequest, owner = selectedOwner();
  await saveChatDraft(); if (request !== navigationRequest) return;
  await call('newProject', undefined, owner); if (request !== navigationRequest) return;
  try { localStorage.removeItem(lastProjectKey); } catch {}
  document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true;
  ++modelRequest; ++projectDisplayRequest; recovery = ''; $('#connection-warning').hidden = true;
  if (current?.workspaceRoot) previewRevisions.set(current.workspaceRoot, revision);
  // The frame-less idea surface offers one quiet way back: when "Nyt projekt"
  // leaves a project open in the background, the link returns to it. A
  // first-run idea screen has nothing behind it and never shows the link.
  ideaReturn = current; $('#idea-back').hidden = !ideaReturn;
  // Review 4.11: the onboarding step rail belongs to the first-run setup only.
  if (ideaReturn) $('#onboarding').classList.add('idea-without-steps');
  current = null; window.harness.selectContext?.(null);
  window.dispatchEvent(new CustomEvent('aura:project', { detail: { root: null } })); revision = null; acceptedFingerprint = null;
  mountView(makeView(null)); $('#workspace').hidden = true; $('#onboarding').hidden = false; $('#skills-button').disabled = true;
  $('#new').setAttribute('aria-current', 'page'); $('#view-title').textContent = 'Projektopstart'; $('#create-form').reset(); setProjectColor(null); showAssets([]);
  const features = await call('featuresGet', undefined, null); if (request !== navigationRequest || current) return;
  state.features = features; await loadStartup(); if (request !== navigationRequest || current) return;
  applyFeatures(); nameTouched = false; restoreIdeaDraft(); saveIdeaDraft(); showIdeaExamples(); $('#purpose').focus();
});
// Parthee 4.11 (D1-previewgodkendelsen): "Ny samtale" og "Nyt projekt" er to
// adskilte handlinger. Den store knap starter en ny samtale i det åbne
// projekt — samme vej som + ved et projekt i listen (newChat →
// newConversation-IPC). Uden et åbet projekt er der intet at samtale i, og
// knappen fører da samme sted hen som "Nyt projekt" (DSH §3).
$('#new-chat').onclick = () => { if (!current) return $('#new').onclick(); action(newChat); };
// The return link uses the very flow the sidebar's open button ends in —
// displayProject re-mounts the retained view, restores the frame and brings
// the workspace back without creating anything. The idea draft stays a
// draft: it survives the round-trip untouched.
$('#idea-back').onclick = () => action(async () => {
  const project = ideaReturn; if (!project) return;
  await displayProject(project);
  if (current === project) $('#prompt').focus();
});
$('#create-form').onsubmit = event => {
  event.preventDefault();
  if (current || projectLoading || startupLoads > 0 || $('#idea-refinement').getAttribute('aria-busy') === 'true') return;
  action(async () => {
    projectLoading = true; applyRunning();
    const refined = window.IdeaRefinement?.take();
    let created;
    try {
      created = await call('createProject', {
        name: $('#name').value, purpose: $('#purpose').value, color: projectColor(),
        links: $('#links').value.split('\n').map(line => line.trim()).filter(Boolean),
        tests: $('#tests').value, startup: startupValues()
      });
      if (!created) return;
      await displayProject(created, { firstTask: true });
      clearIdeaDraft();
    } finally {
      projectLoading = false; applyRunning();
    }
    if (!refined) { $('#start-idea').click(); return; }
    // Preserve the reviewed proposal even if the model catalog is temporarily unavailable.
    window.draftMessage(refined.text + '\n\nForslag fra idéhjælpen (ikke en godkendt byggeplan):\n' + refined.plan +
      '\n\nAfklar eventuelle mangler, og lav en plan til min gennemgang, før der bygges.',
      'Din beskrivelse og dit planforslag er klar til gennemgang.',
      { mode: featureOn('planlaegning') ? 'plan' : 'chat' });
    $('#connection-select').value = refined.selection.connectionID;
    await loadModels(refined.selection);
  });
};
function openConnectionsSection() { return action(async () => { const owner = selectedOwner(), ticket = navigationRequest; if (setupActive && setupStep === 'provider') setupPage('tools'); moveConnectionForm(false); const next = await call('connectionState', undefined, owner); if (ticket !== navigationRequest || owner?.root !== current?.root) return; state = next; renderConnections(); updateProvider(); connectionView('list'); $('#connections-feedback').textContent = ''; $('#connections-dialog').showModal(); }); }
$('#provider-kind').onchange = () => { updateProvider(); };
$('#connection-form').onsubmit = event => {
  event.preventDefault(); action(async () => {
    $('#save-connection').disabled = true;
    const generation = setupGeneration, guided = setupActive && setupStep === 'provider';
    const addFlow = !guided && addingConnectionStage === 'form';
    const previousIDs = new Set(state.connections.map(c => c.id));
    const input = connectionInput();
    if(connectionReceipt)input.keyReceipt=connectionReceipt;
    // A picked saved key is only a reference; a freshly typed key always wins over it.
    else if(addFlow){const reuse=keyReuseSources($('#provider-kind').value).find(c=>c.id===$('#connection-key-reuse').value);if(reuse){input.copyKeyFrom=reuse.id;input.copyKeyRevision=reuse.revision;}}
    connectionReceipt=null;
    try {
      state = await call('saveConnection', input); if (input.id) connectionChecks.clear(input.id);
      const stillGuided = guided && setupActive && setupStep === 'provider' && generation === setupGeneration;
      const stillAddFlow = addFlow && generation === setupGeneration && addingConnectionStage === 'form';
      ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections();
      const selected = state.connections.find(c => c.id === input.id || !previousIDs.has(c.id));
      if (selected) $('#setup-connection').value = selected.id;
      setupControls(); $('#connection-feedback').textContent = 'Forbindelsen er gemt.';
      if (stillAddFlow && selected) await verifyAddedConnection(selected);
      else if (addFlow) {
        // En forældet tilføj-flow-gemning: flowet blev annulleret eller lukket,
        // mens gemningen løb. Forbindelsen er gemt, men formularen kan tilhøre en
        // ny flow-runde — kun et stillestående flow ryddes og viser listen.
        if (!addingConnectionStage) { $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); connectionView('list'); }
        $('#connections-feedback').textContent = 'Forbindelsen er gemt.';
      }
      else {
        $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider();
        if (stillGuided && selected) { setupPage('saved'); await testSetupConnection(); }
        else if (!guided) { connectionView('list'); $('#connections-feedback').textContent = 'Forbindelsen er gemt.'; }
      }
    } catch (error) {
      $('#connection-feedback').textContent = error.message;
    } finally { $('#save-connection').disabled = false; }
  });
};
$('#connection-select').onchange = () => { autoConnect = true; action(() => loadModels()); }; $('#model-select').onchange = () => { updateModelSummary(); action(() => loadRoutes()); };
$('#data-button').onclick = () => action(async () => {
  const data = await call('prepare', selection());
  // S4: en selvstændig /stil-kommando har ingen modelgennemgang — værten har
  // allerede hentet stilen (samtykke skete der); kvitteringen står i rækken.
  // S5: en HENTET stil åbner stilkortet med dens faktiske anvendelse.
  if (data.styleCommand) {
    if (data.styleCommand.status === 'ok') showStyleCard(data.styleCommand);
    else setDraftStatus(data.styleCommand.message, false);
    return;
  }
  showData(data, false);
});
// Låsen tilhører samtalen og sættes før første await, også ved tastaturafsendelse.
$('#chat-form').onsubmit = event => {
  event.preventDefault();
  const sourceView = view, owner = selectedOwner(), text = $('#prompt').value.trim();
  if (!text || running || projectLoading || sourceView.submitting || pendingSend) return;
  sourceView.submitting = true;
  action(async () => {
    try {
      // S4-gennemgangens Fund 4: en selvstændig `/stil <slug>` håndteres i
      // værten uden nogen model — de almindelige forbindelses- og modelvagte
      // gælder den ikke. Grammatikken kommer fra det delte modul
      // (styleMessage), og værten genvaliderer kommandoen fra selve teksten
      // (core/gradientdeck.cjs styleCommand) og svarer selv på et ugyldigt
      // slug-format.
      const styleOnly = window.SlashCommands?.styleMessage?.(text) === true;
      if (!styleOnly && !$('#connection-select').value && !state?.connections?.length) { showSetup('Tilslut en AI for at sende beskeden. Din kladde er bevaret.'); return; }
      if (!styleOnly && (!$('#connection-select').value || !$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value))) { openTaskSettings(); message('Vælg model og eventuel modeludbyder.', true); return; }
      $('#send').disabled = true;
      if (['chat', 'plan'].includes($('#work-mode').value) && window.ConversationMode.buildRequest(text)) {
        $('#work-mode').value = activePlan ? 'build' : 'free'; $('#include-history').checked = true; acceptedFingerprint = null; updateWorkMode(); saveChatDraft();
      }
      const data = await call('prepare', selection(), owner);
      if (view !== sourceView || current?.root !== owner?.root) return;
      // S4: en selvstændig `/stil <slug>` er håndteret i værten FØR selve
      // prepare — samtykke, snæver GET, indholdskontrol og kvittering. Ingen
      // modelkald. Succes rydder kommandoen ud af feltet; en fejl lader teksten
      // stå, så den kan prøves igen.
      // S5: en hentet stil åbner stilkortet — anvendelsen skriver DESIGN.md i
      // projektet gennem værten, med Bevar/Erstat, hvis der findes et i forvejen.
      if (data.styleCommand) {
        if (data.styleCommand.status === 'ok') { $('#prompt').value = ''; saveChatDraft(); showStyleCard(data.styleCommand); }
        else setDraftStatus(data.styleCommand.message, false);
        return;
      }
      if (data.accepted || reviewKey(data) === acceptedFingerprint) await sendNow(data, text);
      else { pendingSend = { data, text }; showData(data, true); }
    } catch (error) { if (view === sourceView) { connectionFailed(error.message); throw error; } }
    finally { sourceView.submitting = false; if (view === sourceView) applyRunning(); }
  });
};
$('#prompt').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.altKey || event.shiftKey || event.isComposing || event.keyCode === 229) return;
  // S2: En åben slash-popup ejer Enter — indsættelsen må aldrig sende beskeden.
  // Popuppen stopper selv tasten her; dette er det andet led i samme garanti.
  if (window.SlashCommands?.open()) return;
  event.preventDefault();
  if (event.repeat || !$('#prompt').value.trim() || $('#send').disabled || view.submitting || pendingSend) return;
  $('#chat-form').requestSubmit();
});
// S3: Den generiske slash-popup kobles til skrivefeltet. /design er hævet som
// skillalias for harness-design (GradientDeck-porten); /stil venter på S4-S5.
// Rækkerne er skills fra skills:list; aliaset gør, at harness-design vises og
// indsættes som /design. Skills hentes gennem den samme IPC som
// Skills-dialogen; uden projekt svarer udbyderen med en tom liste, og
// popuppen åbner ikke. selection() fører de indsatte tokens videre som
// invokedSkills; værten genvaliderer aktiveringen fra selve beskedteksten.
//
// S4: /stil (alias /style) er en betroet indbygget række, og `/stil ` åbner
// katalogniveauet. Kataloget hentes VED FØRSTE åbning i projektet — aldrig
// ved appstart — gennem gradientdeck:catalog; rendereren sender aldrig URL,
// headere eller transport, kun projektet. Én hentning pr. åben popupsession
// (som skills:list); lukningen kasserer den.
window.SlashCommands?.init({
  prompt: $('#prompt'),
  layer: document.getElementById('slash-menu'),
  skills: async () => call('skills', undefined, selectedOwner()),
  styles: async () => call('gradientdeckCatalog', undefined, selectedOwner()),
  // Efter-byg F4 (Codex, Vigtig): hentningerne bindes til projekt og samtale
  // gennem en stabil nøgle — et sent svar fra et forrigt projekt/chat kan
  // aldrig genåbne popuppen eller trænge en nyere popup til side.
  owner: () => { const owner = selectedOwner(); return owner ? `${owner.root}\u0000${owner.chat}` : null; }
});
// S4 · GradientDeck-samtykke: værten ejer beslutningen og kilden; rendereren
// viser dialogen og fører KUN valget tilbage (once/project/cancel) — aldrig
// URL'er, stier eller transport. «Annullér», Luk og Escape er samme svar.
let gradientdeckConsentID = null;
window.harness?.onEvent?.(event => {
  if (event?.type !== 'gradientdeck.consent') return;
  gradientdeckConsentID = event.id;
  $('#gradientdeck-consent-title').textContent = event.kind === 'style' ? `Hent stilen «${event.name}»?` : 'Hent stilkatalog fra GradientDeck?';
  $('#gradientdeck-consent-lead').textContent = event.kind === 'style'
    ? 'Stilen hentes til appens private cache. Du vælger bagefter på stilkortet, om den skal anvendes i projektet.'
    : 'Kataloget med stilbiblioteket hentes fra GradientDeck og gemmes kun i appens private cache. Ingen projektfiler eller beskeder sendes.';
  $('#gradientdeck-consent-url').textContent = event.url;
  $('#gradientdeck-consent').showModal();
});
$('#gradientdeck-consent').addEventListener('close', () => {
  if (!gradientdeckConsentID) return;
  const id = gradientdeckConsentID; gradientdeckConsentID = null;
  void action(async () => { try { await call('gradientdeckConsent', { id, choice: 'cancel' }); } catch { /* værtens samtykke er måske allerede udløbet */ } });
});
const gradientdeckChoice = choice => action(async () => {
  if (!gradientdeckConsentID) return;
  const id = gradientdeckConsentID; gradientdeckConsentID = null;
  $('#gradientdeck-consent').close();
  try { await call('gradientdeckConsent', { id, choice }); }
  catch (error) { message(error.message, true); }
});
$('#gradientdeck-consent-once').onclick = () => gradientdeckChoice('once');
$('#gradientdeck-consent-project').onclick = () => gradientdeckChoice('project');

// S5 · Stilkortet: en hentet stil bliver til en faktisk anvendelse. Kortets
// data kommer fra værtens hentningsresultat (navn, kategori, tema, præcis
// kilde); ANVENDELSEN går gennem gradientdeck:apply — værten skriver
// DESIGN.md i projektet, rendereren sender kun slug, valg og det
// forventnings-mærke, diff-gennemgangen gav. Findes der et DESIGN.md i
// forvejen, viser værten forskellen og valgene Bevar/Erstat; Bevar lukker
// uden nogen skrivning (intet er rørt). En sendable:false-stil har ingen
// «klar»-status: kortet siger ærligt, at datakontrollen afviser den ved
// afsendelse, og Anvend-knappen er slået fra — værten blokerer den samme vej.
const styleTheme = value => ({ dark: 'Mørk', light: 'Lys', mixed: 'Blandet' }[value] || 'Ukendt tema');
const styleCard = { data: null, busy: false };
const styleDate = value => Number.isFinite(value) ? new Date(value).toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' }) : 'ukendt dato';
function showStyleCard(data) {
  styleCard.data = { ...data };
  styleCard.busy = false;
  renderStyleCard();
  $('#gradientdeck-style').showModal();
}
function renderStyleCard() {
  const data = styleCard.data, dialog = $('#gradientdeck-style');
  if (!data || !dialog) return;
  const meta = $('#gradientdeck-style-meta');
  meta.replaceChildren();
  for (const [label, value] of [
    ['Kategori', data.category || '—'], ['Tema', styleTheme(data.theme)],
    ['Kilde', data.sourceUrl || ''], ['Hentet', data.fetchedAt ? styleDate(data.fetchedAt) : ''],
  ]) if (value) { meta.append(node('dt', label), node('dd', value)); }
  const warning = $('#gradientdeck-style-warning'), diffwrap = $('#gradientdeck-style-diffwrap');
  const keep = $('#gradientdeck-style-keep'), apply = $('#gradientdeck-style-apply');
  warning.hidden = true; diffwrap.hidden = true; apply.hidden = false; apply.disabled = false;
  keep.textContent = 'Luk'; keep.dataset.close = 'gradientdeck-style';
  if (data.status === 'conflict') {
    $('#gradientdeck-style-title').textContent = 'Erstat DESIGN.md?';
    $('#gradientdeck-style-lead').textContent = `Projektet har allerede et DESIGN.md. Her er forskellen til «${data.name}»-stilen.`;
    const diff = $('#gradientdeck-style-diff');
    diff.replaceChildren();
    for (const hunk of data.diff?.hunks || []) {
      if (hunk.skippedBefore) diff.append(node('p', `${hunk.skippedBefore} uændrede linjer`, 'style-card-skip'));
      for (const line of hunk.lines) diff.append(node('span', `${line.type === '+' ? '+' : line.type === '-' ? '−' : ' '} ${line.text || ''}`, `style-card-line is-${line.type === '+' ? 'add' : line.type === '-' ? 'del' : 'ctx'}`));
    }
    $('#gradientdeck-style-diffstats').textContent = `${data.diff?.added ?? 0} tilføjede og ${data.diff?.removed ?? 0} fjernede linjer${data.diff?.truncated ? ' · visningen er afkortet' : ''}`;
    diffwrap.hidden = false;
    keep.textContent = 'Bevar eksisterende'; keep.dataset.close = '';
    keep.onclick = () => { dialog.close(); setDraftStatus('Eksisterende DESIGN.md er bevaret. Intet er ændret.'); };
    apply.textContent = 'Erstat';
    apply.onclick = () => applyStyleCard('replace', data.expected, data.expectedStyle);
  } else if (data.status === 'applied') {
    $('#gradientdeck-style-title').textContent = `«${data.name}»-stilen er anvendt`;
    $('#gradientdeck-style-lead').textContent = data.message || 'DESIGN.md er opdateret.';
    apply.textContent = 'Vis ændring';
    apply.onclick = () => { dialog.close(); $('#tab-changes').click(); };
    keep.onclick = () => dialog.close();
  } else if (data.status === 'kept') {
    $('#gradientdeck-style-title').textContent = 'DESIGN.md er bevaret';
    $('#gradientdeck-style-lead').textContent = data.message || 'Eksisterende DESIGN.md er bevaret. Intet er ændret.';
    apply.hidden = true;
    keep.onclick = () => dialog.close();
  } else if (data.status === 'blocked') {
    $('#gradientdeck-style-title').textContent = `Stilen «${data.name}» kan ikke anvendes`;
    $('#gradientdeck-style-lead').textContent = 'Stilen er hentet til appens private cache.';
    warning.hidden = false; warning.textContent = data.message;
    apply.hidden = true;
    keep.textContent = 'Luk';
    keep.onclick = () => dialog.close();
  } else if (data.status === 'error') {
    $('#gradientdeck-style-title').textContent = 'Stilen kunne ikke anvendes';
    $('#gradientdeck-style-lead').textContent = data.message || 'Prøv igen.';
    apply.hidden = true;
    keep.onclick = () => dialog.close();
  } else {
    $('#gradientdeck-style-title').textContent = `Stilen «${data.name}» er hentet`;
    $('#gradientdeck-style-lead').textContent = 'Stilen ligger i appens private cache. Anvend den for at gøre den til projektets DESIGN.md — designhjælpen bruger den fra din næste besked.';
    if (data.sendable === false) { warning.hidden = false; warning.textContent = data.message; apply.disabled = true; apply.title = data.message; }
    apply.textContent = 'Anvend i projektet';
    apply.onclick = () => applyStyleCard('apply', null);
    keep.onclick = () => dialog.close();
  }
  apply.disabled = apply.disabled || styleCard.busy;
  apply.textContent = styleCard.busy ? `${apply.textContent} …` : apply.textContent;
}
async function applyStyleCard(choice, expected, expectedStyle) {
  const data = styleCard.data;
  if (!data || styleCard.busy) return;
  styleCard.busy = true; renderStyleCard();
  try {
    const result = await call('gradientdeckApply', { slug: data.slug, choice, ...(expected ? { expected } : {}), ...(expectedStyle ? { expectedStyle } : {}) }, selectedOwner());
    styleCard.data = { ...data, ...result };
    if (styleCard.data.status === 'applied') setDraftStatus(styleCard.data.message, false);
  } catch (error) {
    styleCard.data = { ...data, status: 'error', message: error.message };
  } finally {
    styleCard.busy = false; renderStyleCard();
  }
}
$('#send').setAttribute('aria-keyshortcuts', 'Enter Meta+Enter Control+Enter');
$('#send').title = 'Enter sender. Shift+Enter giver en ny linje.';
$('#data-dialog').addEventListener('close', () => { pendingSend = null; });
$('#accept-send').onclick = () => action(async () => { const pending = pendingSend; pendingSend = null; if (pending) await sendNow(pending.data, pending.text); });
$('#stop').onclick = () => action(() => call('stop'));
$('#skills-button').onclick = () => action(async () => { const owner = selectedOwner(), ticket = navigationRequest; const next = await call('skills', undefined, owner); if (ticket !== navigationRequest || owner?.root !== current?.root) return; skillOwner = owner; skillList = next; $('#skill-select').replaceChildren(...skillList.map(s => option(s.id, s.enabled ? s.title : `${s.title} · slået fra`))); showSkill(); $('#skills-dialog').showModal(); });
$('#skill-select').onchange = showSkill;
for (const reset of [true, false]) $(reset ? '#skill-reset' : '#skill-save').onclick = () => action(async () => { const id = $('#skill-select').value; const owner = skillOwner, next = await call('saveSkill', { id, content: $('#skill-content').value, reset }, owner); if (owner?.root !== current?.root || !$('#skills-dialog').open) return; skillList = next; acceptedFingerprint = null; showSkill(); message(reset ? 'Den fælles version bruges igen i dette projekt. Det gælder fra din næste besked.' : 'Instruktionen er gemt for dette projekt. Den gælder fra din næste besked.'); });
$('#attach-preview').onclick = () => window.previewServer.open();
$('#preview-form').onsubmit = event => { event.preventDefault(); action(async () => { const url = await call('attachPreview', $('#preview-url').value); showPreview(url, true); $('#preview-dialog').close(); }); };
$('#static-preview').onclick = () => action(async () => { showPreview(await call('attachPreview', '')); $('#preview-dialog').close(); });
$('#refresh').onclick = () => { if (current?.previewURL) $('#preview').src = current.previewURL; };
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => document.getElementById(button.dataset.close).close();
// Kun ren information får klik-udenfor. Formularer og godkendelser bevarer deres egne forløb.
window.ConnectionRemoval.bindInformationalDismiss($('#support-dialog'));
// Menuhandlingen er skjult igen, når dialogen lukkes. Giv fokus tilbage til den synlige menuåbner.
for (const id of ['support-dialog', 'connections-dialog', 'features-dialog']) document.getElementById(id).addEventListener('close', () => {
  if (document.querySelector('dialog[open]') || setupActive) return;
  const active = document.activeElement;
  if (active === document.body || !active?.checkVisibility({ checkVisibilityCSS: true })) $('#settings-toggle').focus();
});
$('#connections-dialog').addEventListener('close', () => {
  clearConnectionReceipt();
  // Lukning midt i tilføj-flowet efterlader formularen ren — ingen kladre lægger i setup senere.
  if (addingConnectionStage) { resetAddConnection(); connectionView('list'); }
});
setInterval(async () => { if (!current || polling) return; polling = true; const project = current, root = current.workspaceRoot; try { const next = await call('revision'); if (current !== project || current.workspaceRoot !== root || !next) return; if (revision && next !== revision) $('#preview').src = current.previewURL; revision = next; $('#preview-status').textContent = 'Lokal forhåndsvisning'; } catch { $('#preview-status').textContent = 'Kan ikke læse siden – kontrollér projektfilerne'; } finally { polling = false; } }, 1500);
// Profilen kan også gemmes uden for denne fil (fx i Indstillinger): hændelsen
// bærer den gemte profil, så cachen — arbejdsmåden, anbefalingen og standard-
// AI'et — følger med uden genstart, og den viste projektopstart synkroniserer
// de felter, brugeren endnu ikke har ændret for projektet.
window.addEventListener('aura:profile-saved', event => { if (event?.detail) { adoptProfile(event.detail); syncStartupFromProfile(event.detail); } });
// A profile save the main process made on its own — the View menu's zoom
// steps — is announced on the shared profile-saved event like every
// renderer-side save: the cache, the chip, the settings UI and the startup
// sync follow the menu's step without a restart.
window.harness?.onEvent?.(event => { if (event?.type === 'profile.saved' && event.profile) announceProfileSaved(event.profile); });
// En profilgemning opdaterer den allerede viste projektopstart: urørte felter
// følger profilen; felter, brugeren har rørt for dette projekt, vinder.
function syncStartupFromProfile(profile) {
  if (current || $('#onboarding').hidden) return;
  const request = navigationRequest;
  action(async () => {
    try {
      await applyStartupDefaults(profile, { touched: startupTouched });
      if (request !== navigationRequest) return;
      updateStartupSummary();
    } catch { /* den næste loadStartup udfylder igen fra profilen */ }
  });
}
action(async () => { syncCreateAvailability(); try { state = await call('connectionState'); await startupProfile(); renderConnections(); updateProvider(); await loadDesigns(); await loadStartup(); applyFeatures(); renderLocation(await call('projectLocation')); restoreIdeaDraft(); showIdeaExamples(); await refreshRecent(); setupControls(); for (const id of ['#welcome-build', '#welcome-example', '#welcome-open']) $(id).disabled = false; if ($('#welcome-dialog').open) $('#welcome-title').focus(); else { $('#purpose').focus(); await reopenLast(); } } finally { projectLoading = false; applyRunning(); } });
// Kom tilbage: det senest åbnede projekt åbnes igen ved start, så man fortsætter, hvor man slap.
// Et projekt, brugeren selv har lukket med Nyt projekt, åbnes ikke igen.
const lastProjectKey = 'harness.lastProject.v1';
async function reopenLast() {
  const previous = projectLoading; projectLoading = true; applyRunning();
  try {
    let root = ''; try { root = localStorage.getItem(lastProjectKey) || ''; } catch {}
    const last = root && (await call('recentProjects')).find(item => item.root === root);
    if (!last) return;
    try { await displayProject(await call('reopenProject', last.id)); }
    catch { message(`Det seneste projekt, ${last.name}, kunne ikke åbnes. Det er måske flyttet eller slettet. Brug Åbn projekt for at finde det.`, true); }
  } finally { projectLoading = previous; applyRunning(); }
}

async function loadDesigns() { const designs = await call('listDesigns'); $('#design-select').replaceChildren(option('', 'Intet design'), ...designs.map(d => option(d.id, `${d.name} · ${d.files} filer`))); }
$('#save-design').onclick = () => action(async () => { await call('saveDesign', { name: $('#design-name').value, color: projectColor(), links: $('#links').value.split('\n').map(s => s.trim()).filter(Boolean) }); await loadDesigns(); message('Designpakken er gemt lokalt og kan vælges i andre projekter.'); });
$('#design-select').onchange = () => action(async () => { updateStartupSummary(); if (!$('#design-select').value) { await clearStartupDesign(); return; } const design = await call('applyDesign', $('#design-select').value); setProjectColor(design.color); $('#links').value = design.links.join('\n'); showAssets(design.assets); updateStartupSummary(); });


// Versioners navne forkortes ved et ordskifte, så historikken kan læses. Samme regel som for AI-opgaver.
function shortLabel(text, max = 80) { const value = String(text).replace(/\s+/g, ' ').trim(); return value.length <= max ? value : value.slice(0, max).replace(/[\s,.;:]+\S*$/, '') + ' …'; }
// Tidspunkt for en version i almindeligt dansk: "i dag 14.32", "i går 09.10" eller "3. okt. 14.32".
function versionTime(at) {
  const date = new Date(at); if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }), day = new Date(); day.setHours(0, 0, 0, 0);
  const start = new Date(date); start.setHours(0, 0, 0, 0); const days = Math.round((day - start) / 86400000);
  return days === 0 ? `i dag ${time}` : days === 1 ? `i går ${time}` : `${date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' })} ${time}`;
}
// Versioner, gendannelse og fortryd ligger i history.js.

// Enkel adgang uden at skjule datagodkendelse eller ændre model automatisk.
// Under skrivefeltet står altid den aktive model, udbyderen og indsatsen, ligesom i Claude Code.
const effortNames = { minimal: 'minimal', low: 'lav', medium: 'middel', high: 'høj', xhigh: 'meget høj', max: 'maksimal' };

// Korte, læsbare modelnavne — 'mistral-large-4' → 'Mistral Large 4', 'corti-s1' → 'Corti S1'.
// Allerede læsbare navne med mellemrum og uden maskintegn røres ikke.
function pentModelNavn(modelID, navn) {
  const raa = String(navn || modelID || '').trim();
  if (!raa) return 'Uden navn';
  if (/\s/.test(raa) && !/[:/]/.test(raa) && !/-/.test(raa)) return raa;
  const merke = { gpt: 'GPT', um: 'UM', ai: 'AI', eu: 'EU', io: 'IO', os: 'OS', llm: 'LLM', php: 'PHP', sql: 'SQL', html: 'HTML', css: 'CSS', ui: 'UI', oss: 'OSS' };
  const ord = raa.replace(/[:/]/g, ' ').replace(/-/g, ' ').replace(/([a-zA-Z]{2,})(?=\d)/g, '$1 ').split(/\s+/).filter(Boolean);
  return ord.map(o => {
    const kendt = merke[o.toLowerCase()];
    if (kendt) return kendt;
    if (/[0-9]/.test(o[0])) return o.toUpperCase();
    return o[0].toUpperCase() + o.slice(1);
  }).join(' ');
}
function updateModelSummary() {
  window.PrivacyGate?.sync();
  const model = $('#model-select');
  const connection = state?.connections.find(c => c.id === $('#connection-select').value);
  const provider = state?.definitions?.[connection?.kind]?.provider || connection?.name || '';
  const chosen = model.value && view?.effort ? effortNames[view.effort] || view.effort : null;
  const effort = model.value && window.ModelAdvice.effort(connection?.kind, model.value);
  const effortLabel = chosen ? `${chosen} indsats` : effort ? `${effort} indsats` : connection?.kind === 'mistral' ? 'standardindsats' : '';
  $('#model-effort-text').textContent = chosen ? `Valgt i denne samtale.` : effort ? `Standard: ${effort}.` : '';
  // Chips og række følger modellens faktiske niveauer: et tilbud backenden afviser, vises ikke.
  const allowedEfforts = window.ModelAdvice.effortSteps(view?.effortLevels).filter(level => level !== null);
  const effortRow = typeof document !== 'undefined' ? document.getElementById('model-effort') : null;
  if (effortRow) effortRow.hidden = allowedEfforts.length === 0;
  if (typeof document !== 'undefined' && document.querySelectorAll) for (const chip of document.querySelectorAll('.effort-chip')) { const active = chip.dataset.effort === view?.effort; chip.setAttribute('aria-checked', active ? 'true' : 'false'); chip.hidden = !allowedEfforts.includes(chip.dataset.effort); chip.disabled = !allowedEfforts.includes(chip.dataset.effort); }
  // Chippen deler navn og indsats: navnet (model + modtager) står i 13/20 i
  // sekundær farve, indsatsen i en læsbar dæmpet tone (§5.2.4; R4-målt
  // 4,69:1 lyst / 5,08:1 mørkt — caption er for svag til tekst).
  const name = model.value ? [pentModelNavn(model.value, model.selectedOptions[0]?.textContent), provider].filter(Boolean).join(' · ') : 'Vælg AI';
  // Review 4.11: Send stays clickable (it routes to setup), but looks quiet until an AI is chosen.
  { const send = $('#send'); if (send?.dataset) send.dataset.noModel = String(!model.value); }
  $('#model-summary').textContent = model.value ? pentModelNavn(model.value, model.selectedOptions[0]?.textContent) : 'Vælg din AI';
  const brand = view.running && view.activeModelSummary ? view.activeModelBrand : { kind: connection?.kind, modelID: model.value };
  window.ProviderBrand.decorate($('#model-chip'), { ...brand, label: view.running && view.activeModelSummary ? view.activeModelSummary : name, note: view.running && view.activeModelSummary ? '' : effortLabel });
  $('#model-chip').title = chosen ? `Du har valgt ${chosen} indsats i denne samtale. Klik for at skifte model eller indsats.` : effort ? `${effort[0].toUpperCase()}${effort.slice(1)} indsats er udbyderens standard for modellen. Klik for at skifte model.` : connection?.kind === 'mistral' ? 'Aura Prime sender ikke et valg af indsats. Mistrals standard gælder; niveauet er ikke verificeret. Klik for at skifte model eller forbindelse.' : 'Klik for at skifte model eller forbindelse.';
  renderStatusLine();
  $('#connection-status').textContent = model.value ? (state?.connections.find(c => c.id === $('#connection-select').value)?.name || 'Valgt forbindelse') + ' · ' + model.value : 'Ingen model valgt';
  syncOnboardingVisuals();
}
// Forbrugets tal står i statuslinjen; det faktiske forbrug står hos udbyderen.
// Én statuslinje under composeren (D5b §7): kontekst · tok/s · tokens · pris — altid
// alle fire felter, og manglende data viser 0 (Parthee/Codex-varianten), aldrig
// »ukendt« og aldrig en udeladt del. Linjen har bevidst INGEN aria-live — den
// opdaterer hver tur og ville støje i skærmlæseren (den gamle forbrugsstatus'
// aria-live="polite" er bortfaldet med den); nuancerne står i tooltippet.
function statusSelection() {
  return view.running && view.runContextSelection ? view.runContextSelection : { connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-row').hidden ? '' : $('#route-select').value };
}
function renderStatusLine() {
  const line = $('#context-status');
  if (!line) return;
  const selected = statusSelection();
  const connection = state?.connections.find(item => item.id === selected.connectionID) || null;
  const model = modelCatalog?.find(item => item.id === selected.modelID);
  const shaped = window.StatusLine.format({
    selected, connection, modelName: model?.name || selected.modelID || '',
    contextValue: window.ContextDisplay.project(selected, view.contextUsage, model, $('#connection-select').value),
    usage: view.usage || null, speed: view.speed || null,
  });
  line.hidden = !current || !view.id;
  $('#context-field').textContent = shaped.context;
  $('#speed-field').textContent = shaped.speed;
  $('#tokens-field').textContent = shaped.tokens;
  $('#price-field').textContent = shaped.price;
  line.setAttribute('aria-label', [shaped.context, shaped.speed, shaped.tokens, shaped.price].join(' · '));
  renderContextHud(selected, model);
  const help = $('#status-line-help');
  help.replaceChildren(...shaped.tooltip.map(text => node('p', text)));
  if (help.matches(':popover-open')) window.PopoverLayer?.position();
}
// Tooltippet åbnes ved hover (400 ms forsinkelse), tastaturfokus og klik/touch
// (native »title« er utilstrækkeligt). ÉN mekanisme (ui/tooltip.js): Popover-
// laget ejer placeringen, browseren ejer lukning — og et klik udenfor må ikke
// straks åbne boblen igen (mekanismens 400 ms-vagt). Ind 40 ms / ud 80 ms og
// 12/16-radius-8-looket kommer fra .aura-tooltip (components.css).
// Kontekstvisning (plugin, 4.11): a compact context meter beside the model
// chip. It shows only a measured share of the model's window — never a guess —
// and is off unless the user turns it on under Indstillinger › Plugins.
let contextHudOn = false;
function renderContextHud(selected = statusSelection(), model = modelCatalog?.find(item => item.id === statusSelection().modelID)) {
  const hud = $('#context-hud'); if (!hud) return;
  const value = window.ContextDisplay.project(selected, view.contextUsage, model, $('#connection-select').value);
  const measured = Number.isFinite(value.percentage) && Number.isFinite(value.windowTokens);
  hud.hidden = !contextHudOn || !current || !view.id;
  const percent = measured ? Math.max(0, Math.min(100, Math.round(value.percentage))) : null;
  $('#context-hud-value').textContent = percent === null ? '–' : `${percent}%`;
  hud.dataset.level = percent === null ? 'unknown' : percent >= 85 ? 'high' : percent >= 60 ? 'mid' : 'low';
  hud.style?.setProperty?.('--context-share', String(percent ?? 0));
  hud.setAttribute('aria-label', percent === null ? 'Kontekst: endnu ikke målt' : `Kontekst brugt: ${percent} % af modellens vindue`);
  hud.title = hud.getAttribute('aria-label');
}
function applyPluginValues(values) { contextHudOn = values?.contextHud === true; renderContextHud(); }
window.addEventListener('aura:plugins', event => applyPluginValues(event.detail?.values));
if (typeof window.harness?.pluginsGet === 'function') void window.harness.pluginsGet().then(result => { if (result?.ok) applyPluginValues(result.value.values); }).catch(() => {});
function openStatusHelp() {
  const line = $('#context-status');
  if (!line) return;
  window.PopoverLayer.open({ layer: $('#status-line-help'), invoker: line, align: 'center', place: 'above', gap: 6, margin: 16, width: () => Math.min(380, innerWidth - 32) });
}
function wireStatusLineHelp() {
  const line = $('#context-status'), help = $('#status-line-help');
  if (!line || !help) return;
  window.Tooltip.wire({ layer: help, invoker: line, open: openStatusHelp, click: 'toggle' });
}
wireStatusLineHelp();
// Kladdestatus: kortvarig role=status yderst til højre i samme række. Succes-
// tekster fader ud efter ca. 2,5 s (teksten består til skærmlæseren); fejl står
// synligt, indtil de er løst (Codex). verify-chats/verify-resume/verify-demo
// afhænger af "Kladde gemt/hentet på denne computer".
//
// S4-UI (livefundet 4.11): rækken er ÉN nowrap-række, og kladdestatussen er et
// forbigående segment EFTER $0,00*. Får segmentet og målingerne ikke plads på
// samme linje, viger MÅLINGERNE først (draft-crowded) — Datakontrol-knappen er
// en altid-synlig sikkerhedsflade og viger aldrig. Målingen sker efter DOM-
// opdateringen (requestAnimationFrame), og tilstanden ryddes, når segmentet
// toner ud eller erstattes — målingerne kommer altid tilbage.
let draftFadeTimer = null;
function draftCrowding(text) {
  const row = $('#status-line-row'), el = $('#draft-status');
  if (!row || !el) return;
  row.classList.remove('draft-crowded');
  if (!text) return;
  requestAnimationFrame(() => {
    if (el.textContent !== text || !el.isConnected) return;
    if (row.scrollWidth > row.clientWidth + 1) row.classList.add('draft-crowded');
  });
}
function setDraftStatus(text, fade = true) {
  const el = $('#draft-status');
  if (!el) return;
  clearTimeout(draftFadeTimer);
  el.textContent = text || '';
  el.classList.remove('draft-faded', 'draft-gone');
  draftCrowding(text || '');
  // Transient: fad ud efter ca. 2,5 s og giv pladsen tilbage (Codex: ingen
  // permanent plads under talrækken). Teksten bliver i DOM'en til skærmlæseren
  // og prøverne; fejltekster står, indtil de er løst.
  if (text && fade) draftFadeTimer = setTimeout(() => {
    el.classList.add('draft-faded');
    draftFadeTimer = setTimeout(() => { el.classList.add('draft-gone'); draftCrowding(''); }, 700);
  }, 2500);
}
$('#route-select').addEventListener('change', renderStatusLine);
function showConnectionWarning(reason) {
  $('#connection-warning-text').textContent = reason;
  $('#connection-warning').hidden = false;
  if (!current) showSetup(reason);
}
$('#repair-connection').onclick = () => showSetup($('#connection-warning-text').textContent);
$('#dismiss-connection').onclick = () => { $('#connection-warning').hidden = true; $('#prompt').focus(); };
$('#model-manage').onclick = () => { $('#task-dialog').close(); showSetup(); };
// Forbered første besked vises kun, når skrivefeltet er tomt og samtalen ikke er begyndt. Så står der aldrig to måder at starte på.
// Helten (§4) står, når samtalen er tom; purpose og idé-chips hører til projektets
// første opgave, og chat-choice-kortene er fjernet visuelt (arbejdsmåde-chippen er
// den synlige vej — id'erne og deres logik bevares til testene).
function updateStartIdea() {
  // Vis kun intro-elementer, når samtalen er tom og der ikke er skrevet i feltet.
  const emptyPrompt = !$('#prompt').value.trim();
  const firstChat = view?.firstProjectTask === true;
  const empty = !view?.log?.children.length;
  const show = Boolean(current) && empty && emptyPrompt;
  $('#project-intro').hidden = !(show && firstChat);
  $('#start-idea').hidden = !(show && firstChat);
  $('#chat-choice').hidden = !(show && !firstChat);
  // Så snart der står en kladde i feltet, trækker helt-dekorationerne sig
  // (§4): composeren står alene i ro — ingen layoutspring midt i skrivningen.
  $('#chat-panel').dataset.heroQuiet = emptyPrompt ? 'false' : 'true';
}
// Samtalerodens fase (§4): hero (tom samtale — centreret helt med composeren),
// active (beskeder — composeren dokket i bunden) eller settling (indlæsning —
// composeren er visibility:hidden, så det forkerte layout aldrig blinker frem,
// mens en gemt samtale genindlæses). Composeren, resume-banneret, YOLO-baren og
// arbejdsmåde-chippen er de samme noder, der flyttes mellem de to pladser —
// kladder og fokus overlever flytningen, og bredden er --chat-col-rammen fra T1
// i begge tilstande.
function applyChatPhase() {
  const panel = $('#chat-panel');
  if (!panel) return;
  const hero = !view?.log?.children.length;
  const phase = projectLoading ? 'settling' : hero ? 'hero' : 'active';
  if (panel.dataset.phase === phase) return;
  panel.dataset.phase = phase;
  const heroRoot = $('#conversation-hero'), slot = $('#hero-composer-slot');
  const form = $('#chat-form'), mode = $('#composer-mode'), resume = $('#resume-notice'), bar = $('#conversation-permission-status');
  if (phase === 'hero') {
    // Chip over composeren (B3), banneret over composeren, composeren i stakken.
    $('#hero-chips').append(mode);
    slot.append(resume, ...(bar ? [bar] : []), form);
    heroRoot.hidden = false;
  } else {
    heroRoot.hidden = true;
    $('#chat-content').prepend(resume);
    $('#model-chip').before(mode);
    // Composeren dokker først; statusrækken sættes derefter ind umiddelbart før
    // den (before virker i formens NUVÆRENDE forælder — rækkefølgen er
    // kontrakten; #context-status forblever i rækken som privacy-gate-anker).
    $('#status-line-row').before(form);
    if (bar) form.before(bar);
  }
  updateWorkMode();
}
function v_logHasMessages() { return Boolean(view?.log?.children.length); }
$('#choice-plan').onclick = () => { $('#chat-choice').hidden = true; $('#work-mode').value = 'plan'; updateWorkMode(); if (!$('#prompt').value.trim()) $('#prompt').value = 'Lad os lave en plan for det, jeg vil bygge.'; $('#prompt').focus(); };
$('#choice-chat').onclick = () => { $('#chat-choice').hidden = true; $('#work-mode').value = 'chat'; updateWorkMode(); $('#prompt').focus(); };
// Projekt-chip og idé-chips (§4/T5) bindes ved start; syntetiske testkontekster
// uden de rigtige select-elementer (ingen .options) har intet at binde.
function wireHeroComposer() {
  if (!$('#idea-platform') || !$('#idea-platform').options || !$('#idea-chip-platform')) return;
  // Projekt-chippen: listen svarer til sidepanelet — samme openProject-handler
  // — med »Åbn mappe …« nederst som #open's egen klikvej (R5: ingen logikduplikat).
  // Det åbne projekt står som valgt og kan ikke klikkes (openProject ville blot
  // folde sidepanelet ud).
  $('#project-chip').onclick = () => {
    const list = $('#project-chip-list'); list.replaceChildren();
    for (const project of window.chats?.projects() || []) {
      const item = node('button', project.name, 'project-chip-item'); item.type = 'button'; item.title = project.root;
      if (project.root === current?.root) { item.setAttribute('aria-current', 'true'); item.disabled = true; }
      else item.onclick = () => action(() => window.chats.openProject(project));
      list.append(item);
    }
    window.PopoverLayer.open({ layer: $('#project-chip-menu'), invoker: $('#project-chip'), align: 'start', place: 'below', gap: 8, width: () => 288 });
  };
  $('#project-chip-open').onclick = () => { window.PopoverLayer.close(); $('#open').click(); };
  const IDEA_CHIP_PICKS = [
    { chip: 'idea-chip-platform', menu: 'idea-chip-platform-menu', label: 'idea-chip-platform-label', select: 'idea-platform', name: 'Platform' },
    { chip: 'idea-chip-data', menu: 'idea-chip-data-menu', label: 'idea-chip-data-label', select: 'idea-data', name: 'Data' }
  ];
  const IDEA_TECHNIQUE_GROUPS = [['idea-ui', 'Brugerflade'], ['idea-design', 'Designværktøjer'], ['idea-backend', 'Backend']];
  // En radioregel bygger alt fra select'ens egne valg — ét kilde, én sandhed.
  function ideaRadio(text, value, onChoose) {
    const item = node('button', text, 'idea-menu-item'); item.type = 'button'; item.dataset.value = value;
    item.setAttribute('role', 'menuitemradio'); item.onclick = onChoose;
    return item;
  }
  function checkRadios(container, value) { for (const item of container.querySelectorAll('[role="menuitemradio"],[role="radio"]')) item.setAttribute('aria-checked', String(item.dataset.value === value)); }
  function syncIdeaChipLabels() {
    for (const pick of IDEA_CHIP_PICKS) {
      const value = $(`#${pick.select}`).value;
      $(`#${pick.label}`).textContent = value ? `${pick.name} · ${value}` : pick.name;
    }
    const chosen = IDEA_TECHNIQUE_GROUPS.filter(([id]) => $(`#${id}`).value);
    $('#idea-chip-technique-label').textContent = !chosen.length ? 'Tekniske ønsker' : chosen.length === 1 ? `Teknik · ${$(`#${chosen[0][0]}`).value}` : `Teknik · ${chosen.length} valgte`;
  }
  for (const pick of IDEA_CHIP_PICKS) {
    const menu = $(`#${pick.menu}`), select = $(`#${pick.select}`), chip = $(`#${pick.chip}`);
    for (const option of [...select.options]) menu.append(ideaRadio(option.textContent, option.value, () => {
      select.value = option.value; syncIdeaChipLabels(); window.PopoverLayer.close(); chip.focus();
    }));
    chip.onclick = () => {
      checkRadios(menu, select.value);
      window.PopoverLayer.open({ layer: menu, invoker: chip, align: 'start', place: 'below', gap: 8, width: () => 288 });
    };
  }
  // Den flade tekniksektion bygges én gang fra select'ernes egne valg.
  const ideaTechniqueGroups = new Map();
  for (const [id, name] of IDEA_TECHNIQUE_GROUPS) {
    const group = node('div', undefined, 'idea-menu-group'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', name);
    group.append(node('p', name, 'idea-menu-group-title'));
    const select = $(`#${id}`);
    for (const option of [...select.options]) {
      const radio = ideaRadio(option.textContent, option.value, () => { select.value = option.value; checkRadios(group, select.value); syncIdeaChipLabels(); });
      radio.setAttribute('role', 'radio');
      group.append(radio);
    }
    ideaTechniqueGroups.set(id, group);
    $('#idea-technique-groups').append(group);
  }
  $('#idea-chip-technique').onclick = () => {
    for (const [id, group] of ideaTechniqueGroups) checkRadios(group, $(`#${id}`).value);
    window.PopoverLayer.open({ layer: $('#idea-chip-technique-panel'), invoker: $('#idea-chip-technique'), align: 'start', place: 'below', gap: 8, width: () => 320 });
  };
  syncIdeaChipLabels();
  // displayProject nulstiller select'erne ved projektskift — synkroniseringen
  // skal kunne kaldes derfra, så chippen aldrig viser et valg, kilden ikke har.
  window.HeroComposer = { syncIdeaChips: syncIdeaChipLabels };
}
wireHeroComposer();
$('#start-idea').onclick = () => {
  if (running) return;
  if ($('#prompt').value.trim()) { message('Din kladde er bevaret. Send eller ryd den, før du forbereder en ny besked.'); $('#prompt').focus(); return; }
  const wishes = [['idea-platform', 'Platform'], ['idea-data', 'Data'], ['idea-ui', 'Brugerflade'], ['idea-design', 'Designværktøjer'], ['idea-backend', 'Backend']]
    .filter(([id]) => $(`#${id}`).value).map(([id, label]) => ({ label, value: $(`#${id}`).value }));
  // Projektidéen er en byggeopgave. Et arbejdsmådevalg eller en gemt kladde
  // har dog forrang; Planlæg vælges kun af brugeren.
  if (!view.modeChosen && !view.draft) $('#work-mode').value = 'free';
  updateWorkMode();
  // Med planlægning kommer ønskerne i projektbriefen, som følger med hver besked. Uden står de i beskeden som før.
  const inBrief = featureOn('planlaegning') && wishes.length;
  $('#prompt').value = `${current?.purpose || '[beskriv din idé her]'}${wishes.length && !inBrief ? '\n\nMine ønsker:\n' + wishes.map(w => `${w.label}: ${w.value}`).join('\n') : ''}`;
  saveChatDraft(); updateStartIdea(); $('#prompt').focus();
  if (inBrief) action(async () => { await window.planning.addWishes(wishes); message('Dine ønsker står i projektbriefen under Plan.'); });
};
$('#model-select').addEventListener('change', updateModelSummary);
// Modelvælgeren: "Brug som standard" gemmer standardAI som én enhed. Det
// aktuelle projekts valg rører aldrig profilen af sig selv.
$('#model-standard').onclick = () => action(async () => {
  const connectionID = $('#connection-select').value, modelID = $('#model-select').value;
  if (!connectionID || !modelID) { message('Vælg en forbindelse og en model, før du gør dem til din standard.', true); return; }
  const saved = await call('profileSave', { standardAI: { connectionID, modelID } });
  adoptProfile(saved.profile);
  announceProfileSaved(saved.profile);
  message(`${$('#model-select').selectedOptions[0]?.textContent || modelID} er nu din standard-AI. Nye projekter starter med den.`);
});

$('#model-done').onclick = () => { if (!$('#connection-select').value || !$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { message('Vælg en forbindelse, model og eventuel udbyder først.', true); return; } updateModelSummary(); $('#model-options').open = false; $('#task-dialog').close(); $('#prompt').focus(); };

// Funktioner: brugeren slår dem til og fra under Indstillinger › Funktioner. Et fravalg skjuler handlingen; filer og historik bevares.
const featureOn = id => state?.features?.effective?.[id] !== false;
const defaultMode = () => 'chat';
// En besked fra et andet forløb bruger den valgte arbejdsmåde og den normale afsendelsesvej.
// En kladde, brugeren selv har skrevet, overskrives aldrig.
window.draftMessage = (text, note, options = {}) => {
  if (!current || running || view.submitting) return false;
  if (options.owner && (options.owner.root !== current.root || options.owner.chat !== view.id)) return false;
  if ($('#prompt').value.trim()) { message(`${note} Din kladde er bevaret, så skriv selv til AI’en, når du er klar.`); $('#prompt').focus(); return; }
  $('#work-mode').value = ['chat', 'plan', 'free', 'build'].includes(options.mode) ? options.mode : 'plan'; updateWorkMode();
  $('#prompt').value = text; saveChatDraft(); updateStartIdea(); message(note); $('#prompt').focus();
  if (options.submit) $('#chat-form').requestSubmit();
  return true;
};
// Et login uden for funktionsdialogen, fx Promte i forhåndsvisningen, kan ændre de anbefalede funktioner.
window.refreshFeatures = async () => { const owner = selectedOwner(), sourceState = state; const features = await call('featuresGet', undefined, owner); if (sourceState !== state || owner?.root !== current?.root) return; state.features = features; applyFeatures(); };
window.sharingOn = () => featureOn('deling');
function applyFeatures() {
  $('#git-button').hidden = !featureOn('versioner');
  // Udgiv er altid synlig; uden udgivelse eller en gemt version viser Udgiv det næste trin.
  for (const id of ['#publish-button', '#setup-hosting', '#startup-hosting-row']) $(id).hidden = !featureOn('deling');
  window.dispatchEvent(new Event('aura:features'));
  window.planning?.render();
  for (const id of ['#design-options', '#design-row']) $(id).hidden = !featureOn('design');
  updateStartupSummary();
}
// Én kontakt pr. funktion med én linje forklaring. Skills står bag ⓘ i Indstillinger › Funktioner.
function featureRow(feature, checked, onChange, note) {
  const row = node('div', undefined, 'feature-row'); row.dataset.feature = feature.id;
  const label = node('label', undefined, 'feature-toggle');
  const title = node('strong', feature.title);
  const requires = feature.requires.map(id => state.features.list.find(item => item.id === id).title);
  const integration = feature.skills[0]?.integration;
  // En integration viser ejer, adgang og dataflow, så man kan vurdere den, før den slås til.
  if (integration) title.append(info(feature.title, [`System: ${integration.system}`, `Ejer: ${integration.owner}`, `Adgang: ${integration.access}`, `Data: ${integration.data}`, `Dataflow: ${integration.dataFlow}`, `Pris: ${integration.cost}`, integration.itRoute ? 'Kræver hjælp fra IT-afdelingen.' : '', integration.sensitive ? 'Omfatter følsomme personoplysninger.' : '', `Skillen vedligeholdes af ${integration.maintainer} og er kontrolleret ${integration.checkedAt}.`].filter(Boolean).join('\n')));
  else title.append(info(feature.title, `${feature.skills.length === 1 ? 'Skill' : 'Skills'}, AI’en henter, når opgaven passer:\n${feature.skills.map(skill => `• ${skill.title}: ${skill.summary}`).join('\n')}${requires.length ? `\n\nBygger på ${requires.join(' og ')}, som slås til sammen med den.` : ''}`));
  const text = node('span'); text.append(title, node('small', feature.summary));
  const input = node('input'); input.type = 'checkbox'; input.setAttribute('role', 'switch'); input.setAttribute('aria-label', feature.title); input.dataset.feature = feature.id; input.checked = checked; input.disabled = projectLoading;
  input.id = `feature-${feature.id}-${crypto.randomUUID()}`; label.htmlFor = input.id;
  input.onchange = () => onChange(feature.id, input.checked);
  label.append(text, input); row.append(label);
  if (note) row.append(note);
  return row;
}
// Indstillinger › Funktioner: standarden for alle projekter eller undtagelser for det åbne projekt.
let featureScope = 'alle';
function renderFeatures(focus) {
  const features = state.features, project = featureScope === 'projekt';
  $('#features-scope').hidden = !current; $('#features-project-name').textContent = `Kun ${current?.name || 'dette projekt'}`; $('#features-project-name').title = current?.name || '';
  for (const radio of document.querySelectorAll('[name="features-scope"]')) radio.checked = radio.value === featureScope;
  const values = project ? features.effective : features.defaults;
  const row = feature => {
    let note;
    if (current && features.exceptions[feature.id] !== undefined) {
      const missing = feature.requires.filter(id => !features.effective[id]).map(id => features.list.find(item => item.id === id).title);
      const status = !features.exceptions[feature.id] ? 'slået fra' : missing.length ? `slået til, men kræver ${missing.join(' og ')}` : 'slået til';
      note = node('p', project ? `Kun i dette projekt: ${status}.` : `${current.name} har en undtagelse: ${status}.`, 'feature-note');
      if (project) { const reset = node('button', 'Brug standarden', 'text-button'); reset.type = 'button'; reset.onclick = () => action(() => saveFeatures(feature.id, null)); note.append(' ', reset); }
    }
    return featureRow(feature, values[feature.id] === true, (id, value) => action(() => saveFeatures(id, value)), note);
  };
  // Integrationer står for sig: én kontakt pr. system, som man slår til, når projektet skal bruge det.
  const integrations = features.list.filter(feature => feature.group === 'integrationer');
  const heading = integrations.length ? [node('h3', 'Integrationer', 'features-group'), node('p', 'Slå de systemer til, dit projekt skal hente data fra.', 'hint')] : [];
  $('#features-list').replaceChildren(...features.list.filter(feature => !feature.group && !feature.alwaysOn).map(row), ...heading, ...integrations.map(row));
  $('#features-advanced').hidden = !current;
  if (focus) document.querySelector(`#features-list input[data-feature="${focus}"]`)?.focus();
}
async function saveFeatures(id, value) {
  const owner = featuresOwner, scope = featureScope, sourceState = state;
  const features = await call('featuresSave', { scope, values: { [id]: value } }, owner);
  if (sourceState !== state || owner?.root !== current?.root) return;
  state.features = features; renderFeatures(id);
  acceptedFingerprint = null; applyFeatures();
  // En funktionskontakt ændrer ikke brugerens valg af Byg eller Samtale.
  if (id === 'planlaegning' && !features.effective.planlaegning && current && !running && !activePlan && $('#work-mode').value === 'plan') { $('#work-mode').value = defaultMode(); updateWorkMode(); saveChatDraft(); }
  $('#features-feedback').textContent = `Gemt for ${featureScope === 'projekt' ? 'dette projekt' : 'alle projekter'}. Det gælder fra din næste besked.`;
}
function openFeaturesSection() { return action(async () => {
  const owner = selectedOwner(), ticket = navigationRequest, features = await call('featuresGet', undefined, owner);
  if (ticket !== navigationRequest || owner?.root !== current?.root) return;
  featuresOwner = owner; state.features = features;
  featureScope = current && Object.keys(state.features.exceptions).length ? 'projekt' : 'alle';
  $('#features-feedback').textContent = ''; renderFeatures(); $('#features-dialog').showModal();
}); }
for (const radio of document.querySelectorAll('[name="features-scope"]')) radio.onchange = () => { featureScope = radio.value; $('#features-feedback').textContent = ''; renderFeatures(); };

function hostingLabel(value) { return ({ vercel: 'Vercel', azure: 'Azure', own: 'Egen løsning' })[value] || 'Beslut senere'; }
function testLabel(value) { return ({ manuel: 'Manuel gennemgang', automatiske: 'Automatiske tests', senere: 'Beslut senere' })[value] || 'Beslut senere'; }
function startupValues() { return { hosting: $('#startup-hosting').value, connectionID: $('#startup-connection').value, designID: $('#design-select').value, tests: $('#tests').value }; }
function renderStartupConnections() {
  const previous = $('#startup-connection').value;
  $('#startup-connection').replaceChildren(option('', 'Beslut senere'), ...(state?.connections || []).map(c => option(c.id, c.name)));
  if (state?.connections.some(c => c.id === previous)) $('#startup-connection').value = previous;
  updateStartupSummary();
}
// Flere valg viser de valg, der er truffet. Valg under en slået fra funktion nævnes ikke, men huskes, hvis funktionen slås til igen.
function updateStartupSummary() {
  const values = startupValues(), design = featureOn('design'), sharing = featureOn('deling');
  const chosen = [state?.connections.find(c => c.id === values.connectionID)?.name, sharing && values.hosting && hostingLabel(values.hosting), design && values.designID && $('#design-select').selectedOptions[0]?.textContent.split(' · ')[0], values.tests !== 'senere' && testLabel(values.tests)].filter(Boolean);
  $('#project-options-summary').textContent = chosen.length ? `Flere valg · ${chosen.join(' · ')}` : 'Flere valg · valgfrit';
  syncOnboardingVisuals();
}
async function clearStartupDesign() {
  showAssets(await call('clearAssets')); $('#design-select').value = ''; setProjectColor(null); $('#links').value = ''; updateStartupSummary();
}
// Startup fields from the profile: the connection list refreshes, then the four
// fields fill. touched is the set of fields the user has already changed for
// this project — they win over a newer profile; null fills everything. The
// design apply belongs to the design field: an untouched design follows the
// profile's choice with colour, links and assets.
async function applyStartupDefaults(profile, { touched = null } = {}) {
  const skip = key => touched?.has(key) === true;
  renderStartupConnections();
  const standard = profile.standardAI?.connectionID || '';
  if (!skip('#startup-hosting')) $('#startup-hosting').value = profile.projectDefaults?.hosting || '';
  if (!skip('#startup-connection')) $('#startup-connection').value = standard && (state?.connections || []).some(c => c.id === standard) ? standard : '';
  if (!skip('#tests')) $('#tests').value = profile.projectDefaults?.tests || 'senere';
  if (!skip('#design-select')) {
    const designID = profile.projectDefaults?.designID || '';
    $('#design-select').value = designID;
    if (designID) {
      try { const design = await call('applyDesign', designID, selectedOwner()); setProjectColor(design.color); $('#links').value = design.links.join('\n'); showAssets(design.assets); }
      catch { await clearStartupDesign(); $('#startup-warning').textContent = 'Designpakken kunne ikke indlæses. Vælg en anden, eller fortsæt uden design.'; }
    }
  }
  return profile;
}
async function loadStartup() {
  const request = navigationRequest, owner = selectedOwner();
  ++startupLoads; syncCreateAvailability();
  startupTouched.clear();
  try {
    // Flere valg præudfyldes fra profilen: projektstandarderne og standard-
    // AI'ets forbindelse. Projektets egne valg skriver aldrig tilbage.
    const result = await call('profileGet', undefined, owner);
    if (request !== navigationRequest) return;
    const { profile, warnings = [] } = result;
    $('#startup-warning').textContent = warnings.join(' ');
    await applyStartupDefaults(profile);
    if (request !== navigationRequest) return;
    for (const selector of ['#project-options', '#design-options']) $(selector).open = false;
    updateStartupSummary();
  } finally { --startupLoads; syncCreateAvailability(); }
}
for (const selector of ['#startup-hosting', '#startup-connection', '#tests']) $(selector).addEventListener('change', updateStartupSummary);
// Projektopstartens felter følger profilen, indtil brugeren selv rører dem:
// et rørt felt vinder over en senere profilgemning (fx fra Indstillinger).
const startupTouched = new Set();
for (const selector of ['#startup-hosting', '#startup-connection', '#tests', '#design-select']) $(selector).addEventListener('change', () => { startupTouched.add(selector); });
$('#model-load').onclick = () => action(() => loadModels(state?.projectSettings.selection?.connectionID === $('#connection-select').value ? state.projectSettings.selection : {}));


// Introduktionen vælger kun brugerrejse. Den giver ingen model- eller værktøjstilladelser.
const introductionKey = 'harness.introduction.v1';
const ideaDraftKey = 'harness.ideaDraft.v1';
let nameTouched = false;
function syncOnboardingWindow(open) {
  if (typeof window.harness?.onboardingWindow !== 'function') return;
  void window.harness.onboardingWindow(open).then(result => {
    if (result?.ok) document.body.classList.toggle('native-welcome-window', result.value.compact);
  }).catch(() => {});
}
function completeIntroduction(mode) {
  try { localStorage.setItem(introductionKey, mode); } catch {}
}
function showIntroduction(step = 'path') {
  syncOnboardingWindow(true);
  $('#welcome-path').hidden = step !== 'path'; $('#welcome-start').hidden = step !== 'start'; $('#welcome-demo').hidden = true;
  $('#welcome-dialog').setAttribute('aria-labelledby', step === 'path' ? 'welcome-path-title' : 'welcome-title');
  document.body.classList.add('introduction-open'); if (!$('#welcome-dialog').open) $('#welcome-dialog').showModal(); $(step === 'path' ? '#welcome-path-title' : '#welcome-title').focus();
}
function closeIntroduction() { document.body.classList.remove('introduction-open'); $('#welcome-dialog').close(); syncOnboardingWindow(false); }
function leaveIntroduction() {
  if (setupActive) action(() => leaveSetup(false));
  recordProfileChoice('skipped');
  completeIntroduction('skipped'); $('#onboarding').classList.add('idea-without-steps'); closeIntroduction();
  (current ? $('#prompt') : $('#purpose')).focus();
}
$('#welcome-skip').onclick = leaveIntroduction;
$('#welcome-dialog').addEventListener('close', () => { if (!$('#welcome-dialog').open) document.body.classList.remove('introduction-open'); });
$('#welcome-dialog').addEventListener('cancel', event => { event.preventDefault(); leaveIntroduction(); });
$('#intro-button').onclick = () => showIntroduction();
$('#setup-back').onclick = () => { const leave = () => repeatSetup ? action(() => leaveSetup(false)) : guidedSetup ? showIntroduction('start') : action(() => leaveSetup(false)); if (setupStep === 'provider' && $('#setup-provider').dataset.view === 'details') providerPicker(); else if (setupStep === 'detail') setupPage('profile'); else if (setupStep === 'profile') leave(); else if (setupStep !== 'choice') { clearConnectionReceipt(); setupPage('choice'); } else if (profileStepShown) setupPage('detail'); else leave(); };
async function beginGuidedProject() {
  if (current) { await $('#new').onclick(); if (current) return; }
  closeIntroduction(); showSetup('', true);
}
$('#welcome-build').onclick = () => action(beginGuidedProject);
$('#demo-build').onclick = () => action(beginGuidedProject);
$('#welcome-open').onclick = () => action(async () => {
  const project = await call('openProject');
  if (!project) return;
  completeIntroduction('opened'); closeIntroduction(); await displayProject(project);
});
function demoPreview(list) {
  $('#demo-preview').srcdoc = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="harness://app/demo.css"><small>BIBLIOTEKET · DEMONSTRATION</small><h1>Det sker på biblioteket</h1><section class="${list?'list':'cards'}"><article><strong>Læseklub</strong><p>Tirsdag · kl. 16</p></article><article><strong>Hjælp til din computer</strong><p>Torsdag · kl. 10</p></article></section></html>`;
  $('#demo-answer').textContent = list ? 'Nu vises aktiviteterne som en liste. I dit eget projekt beskriver du ændringerne i samtalen.' : 'Her er et eksempel med to aktiviteter. Prøv at ændre visningen.';
  $('#demo-change').textContent = list ? 'Vis aktiviteterne som kort' : 'Vis aktiviteterne som en liste';
  $('#demo-change').dataset.list = String(list);
}
$('#welcome-example').onclick = () => { $('#welcome-start').hidden = true; $('#welcome-demo').hidden = false; $('#welcome-dialog').setAttribute('aria-labelledby', 'demo-title'); demoPreview(false); $('#demo-title').focus(); };
$('#demo-change').onclick = () => demoPreview($('#demo-change').dataset.list !== 'true');
$('#demo-back').onclick = () => showIntroduction('start');
$('#path-app').onclick = () => showIntroduction('start');
$('#welcome-back').onclick = () => showIntroduction('path');
$('#path-tools').onclick = () => { completeIntroduction('tools'); closeIntroduction(); openTools(); };
$('#tools-button').onclick = () => openTools();

// Aura Harness i brugerens eget kodeværktøj. Ét spørgsmål pr. trin; hovedprocessen vælger mappen og skriver filerne efter en gennemgang.
let toolsCatalog = null, toolsFolder = null, toolsChoice = null, toolsReviewState = null, toolsSkills = null;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const operationText = { opret: 'Opret', tilfoej: 'Tilføj afsnit', opdater: 'Opdatér', uaendret: 'Uændret', konflikt: 'Ændret af dig · røres ikke', fjern: 'Fjern', 'fjern-afsnit': 'Fjern afsnit', bevar: 'Bevares' };
async function toolsAction(fn) {
  $('#tools-error').hidden = true;
  try { return await fn(); } catch (error) { $('#tools-error').textContent = error.message; $('#tools-error').hidden = false; }
}
function toolsStep(step) {
  for (const id of ['choose', 'folder', 'review', 'skills', 'done', 'remove']) $(`#tools-step-${id}`).hidden = id !== step;
  $(`#tools-${step}-title`).focus();
}
const toolById = id => toolsCatalog.tools.find(tool => tool.id === id);
async function copyText(text, button) {
  const label = button.textContent;
  try { await navigator.clipboard.writeText(text); button.textContent = 'Kopieret'; } catch { button.textContent = 'Kunne ikke kopiere'; }
  setTimeout(() => { button.textContent = label; }, 1800);
}
function toolCard(tool) {
  const button = node('button', undefined, 'tools-card'); button.type = 'button'; button.dataset.tool = tool.id;
  button.append(node('strong', tool.name), node('span', tool.summary));
  button.onclick = () => chooseTool(tool.id);
  return button;
}
function renderAllTools(query) {
  const words = query.trim().toLocaleLowerCase('da');
  const others = toolsCatalog.tools.filter(tool => !toolsCatalog.featuredTools.includes(tool.id) && (!words || `${tool.name} ${tool.vendor}`.toLocaleLowerCase('da').includes(words)));
  $('#tools-list').replaceChildren(...(others.length ? others.map(tool => {
    const row = node('div', undefined, 'tools-row');
    const text = node('span'); text.append(node('strong', tool.name), node('small', tool.installable ? ` · ${tool.vendor}` : ` · ${tool.vendor} · kopiér teksten til platformens egne felter`));
    const button = node('button', tool.installable ? 'Vælg' : 'Kopiér tekst'); button.type = 'button'; button.dataset.tool = tool.id;
    button.onclick = tool.installable ? () => chooseTool(tool.id) : () => copyText(toolsCatalog.knowledge, button);
    row.append(text, button); return row;
  }) : [node('p', 'Ingen værktøjer passer til søgningen.', 'hint')]));
}
function renderToolsCatalog() {
  // Integrationer følger ikke med, før man vælger dem, så tallet her er de skills, der installeres som standard.
  const base = toolsCatalog.skills.filter(skill => !skill.integration).length, extra = toolsCatalog.skills.length - base;
  $('#tools-skill-count').textContent = base;
  $('#tools-included-summary').textContent = `Hvad følger med? Grundregler og ${base} skills${extra ? ` · ${extra} ${extra === 1 ? 'integration' : 'integrationer'} kan vælges til` : ''}`;
  $('#tools-skills').replaceChildren(...toolsCatalog.skills.map(skill => {
    const details = node('details', undefined, 'tools-skill disclosure');
    const summary = node('summary'); summary.append(node('strong', skill.title), node('span', ` · ${skill.summary}`));
    const list = node('dl');
    for (const [label, key] of [['Hvad gør den?', 'hvad'], ['Hvornår bruges den?', 'hvornaar'], ['Hvad får du?', 'resultat'], ['Hvad gør den ikke?', 'ikke']]) list.append(node('dt', label), node('dd', skill.faq[key]));
    details.append(summary, list);
    return details;
  }));
  $('#tools-featured').replaceChildren(...toolsCatalog.featuredTools.map(id => toolCard(toolById(id))));
  renderAllTools('');
}
$('#tools-more').onclick = () => { $('#tools-all').hidden = false; $('#tools-more').hidden = true; $('#tools-search').focus(); };
$('#tools-search').oninput = () => renderAllTools($('#tools-search').value);
async function openTools() {
  $('#tools-error').hidden = true;
  if (!$('#tools-dialog').open) $('#tools-dialog').showModal();
  await toolsAction(async () => { toolsCatalog ??= await call('toolsCatalog'); renderToolsCatalog(); });
  $('#tools-all').hidden = true; $('#tools-more').hidden = false; $('#tools-search').value = '';
  toolsStep('choose');
}
function chooseTool(id) {
  toolsChoice = id;
  $('#tools-folder-lead').textContent = `Vælg den mappe, du åbner i ${toolById(id).name}. Det er ofte den mappe, hvor README.md og .git ligger.`;
  toolsStep('folder');
}
$('#tools-back-choose').onclick = () => toolsStep('choose');
$('#tools-folder').onclick = () => toolsAction(async () => {
  const folder = await call('toolsFolder');
  if (!folder) return;
  toolsFolder = folder;
  // Et tidligere udvalg bevares; ellers følger alle skills med undtagen integrationer, som man vælger til.
  toolsSkills = new Set(folder.manifest?.skills || toolsCatalog.skills.filter(skill => !skill.integration).map(skill => skill.name));
  await reviewTools();
});
// Resumé i almindeligt dansk. De præcise filændringer ligger under "Se de præcise ændringer".
function planLines(review) {
  const lines = [];
  const active = review.operations.filter(op => !['uaendret', 'konflikt', 'bevar'].includes(op.action));
  for (const op of active.filter(item => item.kind === 'blok' && item.path !== '.gitignore')) {
    const pointer = /@AGENTS\.md/.test(op.preview || '');
    const removing = op.action === 'fjern' || op.action === 'fjern-afsnit';
    if (removing) lines.push(`Aura Harness-afsnittet i ${op.path} fjernes.`);
    else if (pointer) lines.push(op.action === 'opret' ? `${op.path} oprettes med en henvisning til AGENTS.md.` : op.action === 'tilfoej' ? `${op.path} får en henvisning til AGENTS.md. Dine egne regler bevares.` : `Henvisningen i ${op.path} opdateres.`);
    else lines.push(op.action === 'opret' ? `Grundreglerne lægges i en ny ${op.path}.` : op.action === 'tilfoej' ? `Grundreglerne tilføjes nederst i ${op.path}. Dine egne regler bevares.` : `Grundreglerne i ${op.path} opdateres til version ${review.version}.`);
  }
  const skills = new Map();
  for (const op of active.filter(item => /\/harness-[a-z0-9-]+\//.test(item.path))) {
    const [, dir, name] = /^(.*)\/(harness-[a-z0-9-]+)\//.exec(op.path);
    const key = `${dir}|${op.action === 'fjern' ? 'fjern' : op.action === 'opret' ? 'opret' : 'opdater'}`;
    if (!skills.has(key)) skills.set(key, new Set());
    skills.get(key).add(name);
  }
  for (const [key, names] of skills) {
    const [dir, kind] = key.split('|');
    lines.push(kind === 'opret' ? `${plural(names.size, 'skill', 'skills')} lægges i ${dir}.` : kind === 'fjern' ? `${plural(names.size, 'skill', 'skills')} fra en tidligere installation fjernes fra ${dir}.` : `${plural(names.size, 'skill', 'skills')} opdateres i ${dir}.`);
  }
  const ignore = active.find(item => item.path === '.gitignore');
  if (ignore) lines.push(ignore.action === 'opret' ? 'En ny .gitignore holder hemmeligheder og lokale filer ude af Git.' : ignore.action === 'tilfoej' ? '.gitignore får et afsnit, der holder hemmeligheder og lokale filer ude af Git.' : 'Afsnittet i .gitignore opdateres.');
  if (active.some(item => item.path.startsWith('.harness/') && item.action === 'opret')) lines.push('En kort forklaring og en oversigt over installationen lægges i .harness.');
  return lines;
}
function reviewNotes(review) {
  const notes = [];
  if (review.conflicts) notes.push(`${plural(review.conflicts, 'fil er', 'filer er')} ændret af dig og bliver ikke rørt.`);
  if (review.git.initialized === false) notes.push('Mappen bruger ikke Git, så ændringerne kan ikke fortrydes med en tidligere version.');
  else if (review.git.changes) notes.push(`Der er ${plural(review.git.changes, 'ændring', 'ændringer')}, som ikke er gemt i Git. Gem gerne en version først, så Aura Harness' ændringer kan ses for sig.`);
  if (review.ignored === null) notes.push('Det kunne ikke kontrolleres, om projektets .gitignore udelader nogle af filerne.');
  else if (review.ignored.length) {
    const groups = new Map();
    for (const file of review.ignored) { const dir = review.dirs.find(item => file.startsWith(`${item}/`)); const key = dir ? `${dir}/` : file; groups.set(key, (groups.get(key) || 0) + 1); }
    const summary = [...groups].map(([key, count]) => key.endsWith('/') ? `${key} (${plural(count, 'fil', 'filer')})` : key).join(', ');
    notes.push(`Projektets .gitignore udelader ${summary}. Filerne kommer ikke med, når andre henter projektet. Ret .gitignore, hvis de skal deles.`);
  }
  return [...notes, ...review.warnings];
}
function renderOperations(target, operations) {
  const groups = new Map();
  for (const op of operations) { if (!groups.has(op.action)) groups.set(op.action, []); groups.get(op.action).push(op); }
  target.replaceChildren(...[...groups].map(([actionName, ops]) => {
    const details = node('details', undefined, `tools-ops tools-ops-${actionName} disclosure`);
    details.open = ['konflikt', 'tilfoej', 'bevar'].includes(actionName) || ops.length <= 4;
    details.append(node('summary', `${operationText[actionName]} · ${ops.length}`));
    const list = node('ul');
    for (const op of ops) {
      const item = node('li'); item.append(node('code', op.path));
      if (op.reason) item.append(node('span', ` ${op.reason}`, 'hint'));
      if (op.preview) { const view = node('details', undefined, 'disclosure'); view.append(node('summary', op.kind === 'blok' ? 'Se afsnittet' : 'Se filen'), node('pre', op.preview)); item.append(view); }
      list.append(item);
    }
    details.append(list);
    return details;
  }));
}
// Integrationer vælges til for de systemer, man bruger. De tælles for sig og står aldrig som fravalgte skills.
function skillChoice(chosen) {
  const base = toolsCatalog.skills.filter(skill => !skill.integration);
  return { base, left: base.filter(skill => !chosen.has(skill.name)), integrations: toolsCatalog.skills.filter(skill => skill.integration && chosen.has(skill.name)) };
}
async function reviewTools() {
  const installed = toolsFolder.manifest?.tools || [];
  const review = await call('toolsReview', { tools: [...new Set([...installed, toolsChoice])], skills: [...toolsSkills] });
  toolsReviewState = review;
  const name = toolById(toolsChoice).name;
  const nothing = review.operations.every(op => op.action === 'uaendret');
  const others = installed.filter(id => id !== toolsChoice).map(id => toolById(id)?.name || id);
  $('#tools-review-summary').textContent = nothing ? `Aura Harness er allerede installeret til ${name} i ${review.folder}. Intet ændres.` : others.length && !installed.includes(toolsChoice) ? `Aura Harness er allerede installeret til ${others.join(', ')} i ${review.folder}. ${name} tilføjes, når du installerer:` : `Det sker i ${review.folder}, når du installerer til ${name}:`;
  const { base, left, integrations } = skillChoice(toolsSkills);
  $('#tools-skills-status').textContent = `Skills: ${base.length - left.length} af ${base.length} valgt${left.length ? ` · fravalgt: ${left.map(skill => skill.title).join(', ')}` : ''}${integrations.length ? ` · integrationer: ${integrations.map(skill => skill.title).join(', ')}` : ''}`;
  const lines = planLines(review);
  $('#tools-plan').replaceChildren(...lines.map(text => node('li', text))); $('#tools-plan').hidden = !lines.length;
  const notes = reviewNotes(review);
  $('#tools-notes').replaceChildren(...notes.map(text => node('li', text))); $('#tools-notes').hidden = !notes.length;
  renderOperations($('#tools-operations'), review.operations);
  $('#tools-install').textContent = nothing ? 'Registrér installationen' : review.conflicts ? 'Installer resten' : 'Installer';
  toolsStep('review');
}
// Udvælgelse som i en cookie-dialog: kategorier kan slås til og fra samlet, og hver kan foldes ud til de enkelte skills.
function renderSkillPicker() {
  $('#tools-categories').replaceChildren(...toolsCatalog.categories.map(category => {
    const box = node('div', undefined, 'skill-category');
    const head = node('div', undefined, 'skill-category-head');
    const label = node('label', undefined, 'check-label');
    const toggle = node('input'); toggle.type = 'checkbox'; toggle.dataset.category = category.id;
    const text = node('span'); text.append(node('strong', category.title), node('small', '', 'skill-count'), node('small', category.summary));
    label.append(toggle, text);
    const expand = node('button', 'Vis skills', 'text-button'); expand.type = 'button'; expand.setAttribute('aria-expanded', 'false');
    const list = node('div', undefined, 'skill-list'); list.hidden = true;
    expand.onclick = () => { list.hidden = !list.hidden; expand.setAttribute('aria-expanded', String(!list.hidden)); expand.textContent = list.hidden ? 'Vis skills' : 'Skjul skills'; };
    for (const name of category.skills) {
      const skill = toolsCatalog.skills.find(item => item.name === name);
      const row = node('label', undefined, 'check-label');
      const input = node('input'); input.type = 'checkbox'; input.dataset.skill = name; input.checked = toolsSkills.has(name);
      input.onchange = updateSkillPicker;
      const detail = node('span'); detail.append(node('strong', skill.title), node('small', skill.summary));
      row.append(input, detail); list.append(row);
    }
    toggle.onchange = () => { for (const input of list.querySelectorAll('input')) input.checked = toggle.checked; updateSkillPicker(); };
    head.append(label, expand); box.append(head, list);
    return box;
  }));
  updateSkillPicker();
}
function updateSkillPicker() {
  for (const category of toolsCatalog.categories) {
    const inputs = [...document.querySelectorAll(`#tools-categories input[data-skill]`)].filter(input => category.skills.includes(input.dataset.skill));
    const chosen = inputs.filter(input => input.checked).length;
    const toggle = document.querySelector(`#tools-categories input[data-category="${category.id}"]`);
    toggle.checked = chosen === inputs.length; toggle.indeterminate = chosen > 0 && chosen < inputs.length;
    toggle.closest('.skill-category').querySelector('.skill-count').textContent = `${chosen} af ${inputs.length}`;
  }
  const { base, left, integrations } = skillChoice(new Set([...document.querySelectorAll('#tools-categories input[data-skill]:checked')].map(input => input.dataset.skill)));
  $('#tools-skill-total').textContent = `${base.length - left.length} af ${base.length} skills valgt${integrations.length ? ` og ${integrations.length} ${integrations.length === 1 ? 'integration' : 'integrationer'}` : ''}. Grundreglerne er altid med.`;
}
$('#tools-customize').onclick = () => { renderSkillPicker(); toolsStep('skills'); };
// Vælg alle skills gælder ikke integrationerne; dem vælger man enkeltvis.
$('#tools-skills-all').onclick = () => { for (const input of document.querySelectorAll('#tools-categories input[data-skill]')) if (!toolsCatalog.skills.find(skill => skill.name === input.dataset.skill).integration) input.checked = true; updateSkillPicker(); };
$('#tools-skills-back').onclick = () => toolsStep('review');
$('#tools-skills-save').onclick = () => toolsAction(async () => {
  toolsSkills = new Set([...document.querySelectorAll('#tools-categories input[data-skill]')].filter(input => input.checked).map(input => input.dataset.skill));
  await reviewTools();
});
$('#tools-back').onclick = () => toolsStep('folder');
$('#tools-install').onclick = () => toolsAction(async () => {
  const result = await call('toolsInstall', { skipConflicts: Boolean(toolsReviewState?.conflicts) });
  const tool = toolById(toolsChoice);
  toolsFolder = { ...toolsFolder, manifest: { version: result.version, tools: result.tools } };
  $('#tools-prompt-intro').closest('.tools-prompt').hidden = false; $('#tools-verify').closest('details').hidden = false; $('#tools-removal').hidden = false; $('#tools-reveal').hidden = false;
  $('#tools-done-title').textContent = `${tool.name} kan nu bruge Aura Harness`;
  $('#tools-done-summary').textContent = `Grundreglerne og ${plural(result.skills.length, 'skill', 'skills')} ligger i ${result.folder}.${result.skipped.length ? ` ${plural(result.skipped.length, 'fil, du har ændret, er', 'filer, du har ændret, er')} ikke rørt.` : ''} Gennemgå ændringerne i Git, før du gemmer en version.`;
  $('#tools-prompt-intro').textContent = `Åbn ${result.folder} i ${tool.name}, start en ny samtale, og skriv:`;
  $('#tools-prompt-text').textContent = 'Hvilke projektinstruktioner og skills fra Aura Harness har du adgang til? Hvad er kontrolordet i Aura Harness-profilen? Ændr ingen filer.';
  $('#tools-prompt-text').dataset.expect = `Svaret bør nævne kontrolordet ${toolsCatalog.controlWord}.`;
  $('#tools-verify-summary').textContent = `Sådan kontrollerer du det i ${tool.name}`;
  $('#tools-verify').replaceChildren(...result.tools.map(id => { const item = toolById(id); const box = node('div'); box.append(node('strong', item.name), node('p', item.verification), node('p', item.caveat, 'hint')); return box; }), node('p', $('#tools-prompt-text').dataset.expect, 'hint'));
  toolsStep('done');
});
$('#tools-copy-prompt').onclick = () => copyText($('#tools-prompt-text').textContent, $('#tools-copy-prompt'));
$('#tools-reveal').onclick = () => toolsAction(() => call('toolsReveal'));
$('#tools-done').onclick = () => $('#tools-dialog').close();
$('#tools-removal').onclick = () => toolsAction(async () => { renderOperations($('#tools-remove-operations'), (await call('toolsRemoval')).operations); toolsStep('remove'); });
$('#tools-remove-back').onclick = () => toolsStep('done');
$('#tools-remove').onclick = () => toolsAction(async () => {
  const result = await call('toolsRemove');
  toolsFolder = { ...toolsFolder, manifest: null };
  $('#tools-done-title').textContent = 'Aura Harness er fjernet';
  $('#tools-done-summary').textContent = `Aura Harness er fjernet fra ${result.folder}.${result.kept.length ? ` Disse filer, du har ændret, er bevaret: ${result.kept.join(', ')}.` : ''}`;
  $('#tools-prompt-intro').closest('.tools-prompt').hidden = true; $('#tools-verify').closest('details').hidden = true; $('#tools-removal').hidden = true; $('#tools-reveal').hidden = true;
  toolsStep('done');
});
$('#provider-account').onclick = () => action(() => call('providerAccount', $('#provider-kind').value));
function renderLocation(location) { $('#project-location').textContent = `Projektet gemmes i ${location.label}.`; $('#project-location').title = location.path; }
$('#choose-location').onclick = () => action(async () => renderLocation(await call('chooseProjectLocation')));
function saveIdeaDraft() {
  try { localStorage.setItem(ideaDraftKey, JSON.stringify({name: $('#name').value, purpose: $('#purpose').value, nameTouched})); $('#idea-draft-status').textContent = ($('#name').value.trim() || $('#purpose').value.trim()) ? 'Kladden er gemt på denne computer.' : 'Gemmes som kladde. Ingen AI kontaktes endnu.'; } catch { $('#idea-draft-status').textContent = 'Kladden kan ikke gemmes automatisk på denne computer.'; }
}
function clearIdeaDraft() { try { localStorage.removeItem(ideaDraftKey); } catch {} }
function restoreIdeaDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(ideaDraftKey));
    if (draft && typeof draft.name === 'string' && typeof draft.purpose === 'string') {
      $('#name').value = draft.name.slice(0,80); $('#purpose').value = draft.purpose.slice(0,3000); nameTouched = draft.nameTouched === true;
    }
  } catch {}
}
$('#name').addEventListener('input', () => { nameTouched = true; saveIdeaDraft(); });
// Et kort navneforslag ud fra idéen: det, der skal laves, uden resten af sætningen. Brugeren kan altid rette det.
const genericNames = new Set(['side', 'app', 'hjemmeside', 'webside', 'løsning', 'værktøj', 'system', 'program', 'platform', 'portal', 'oversigt', 'liste', 'formular', 'applikation', 'prototype', 'tjeneste', 'webapp']);
function suggestName(purpose) {
  const text = purpose.trim().replace(/^(jeg|vi)\s+(vil|skal|ønsker at|kunne godt tænke (mig|os) at)\s+(gerne\s+)?(lave|bygge|skabe|have|udvikle)\s+/i, '').replace(/^(en|et|nogle|min|mit|mine|vores)\s+/i, '');
  let words = text.split(/[,.;:!?\n]|\s(?:hvor|som|der|så|til at|for at)\s/i)[0].trim().split(/\s+/).filter(Boolean);
  if (words.length === 1 && genericNames.has(words[0].toLocaleLowerCase('da'))) {
    const place = /(?:^|\s)(?:i|til|for|om|på)\s+(?:vores|min|mit|mine|jeres|den|det|de)?\s*([\p{L}-]{4,}(?:\s+[\p{L}-]+){0,2})/iu.exec(text);
    words = place ? place[1].split(/\s+/) : text.split(/\s+/).slice(0, 5);
  }
  const name = words.slice(0, 5).join(' ');
  return (name.charAt(0).toLocaleUpperCase('da') + name.slice(1)).slice(0, 80);
}
$('#purpose').addEventListener('input', () => {
  if (!nameTouched) $('#name').value = suggestName($('#purpose').value);
  saveIdeaDraft(); showIdeaExamples();
});
// Tre faste eksempler på idéer, der virker som en lokal side uden server. Et eksempel udfylder kun idéen og navnet;
// AI'en bygger det først, når du starter projektet. De vises kun, når idéfeltet er tomt, så intet overskrives.
const ideaExamples = [
  { title: 'Tilmelding til arrangementer', hint: 'Kommende arrangementer med tilmelding', name: 'Arrangementer og tilmelding', purpose: 'En side med vores kommende arrangementer, hvor man kan se dato, sted og en kort beskrivelse og tilmelde sig med navn og e-mail. Tilmeldingerne gemmes i browseren, så siden virker uden server, og arrangøren kan se en liste over de tilmeldte.' },
  { title: 'Tjekliste til nye kolleger', hint: 'Første arbejdsdag med flueben', name: 'Tjekliste til nye kolleger', purpose: 'En tjekliste til nye kolleger på deres første arbejdsdag, hvor de kan sætte flueben ved hver opgave, se hvor meget der mangler, og printe listen. Fluebenene huskes i browseren.' },
  { title: 'Quiz om Danmarkshistorie', hint: 'Ti spørgsmål og en score til sidst', name: 'Quiz om Danmarkshistorie', purpose: 'En quiz med ti spørgsmål om Danmarkshistorie. Man ser ét spørgsmål ad gangen med fire svarmuligheder, får at vide, om svaret var rigtigt, og ser sin score til sidst med mulighed for at prøve igen.' }
];
function showIdeaExamples() {
  const empty = !$('#purpose').value.trim();
  $('#idea-examples-row').hidden = !empty;
  if (!empty) { $('#idea-examples').hidden = true; $('#idea-examples-toggle').setAttribute('aria-expanded', 'false'); }
}
$('#idea-examples').replaceChildren(...ideaExamples.map(example => {
  const button = node('button', undefined, 'idea-example'); button.type = 'button';
  button.append(node('strong', example.title), node('span', example.hint));
  button.onclick = () => {
    $('#purpose').value = example.purpose; $('#name').value = example.name; nameTouched = false;
    saveIdeaDraft(); showIdeaExamples();
    const field = $('#purpose'); field.focus(); field.setSelectionRange(field.value.length, field.value.length);
    message('Eksemplet er sat ind. Ret det til, eller start projektet, så bygger AI’en det.');
  };
  return button;
}));
$('#idea-examples-toggle').onclick = () => {
  const open = $('#idea-examples').hidden;
  $('#idea-examples').hidden = !open; $('#idea-examples-toggle').setAttribute('aria-expanded', String(open));
  if (open) $('#idea-examples .idea-example').focus();
};
try { const intro = localStorage.getItem(introductionKey); if (!intro) showIntroduction(); else { if (intro === 'skipped') $('#onboarding').classList.add('idea-without-steps'); syncOnboardingWindow(false); } } catch { showIntroduction(); }

// Det guidede forløb ændrer aldrig model, rute eller betaling uden et aktivt valg.
let modelCatalog = [], activePlan = null;
function modelDescription(model) {
  const price = model.price;
  const known = price && price.prompt != null && price.completion != null && Number.isFinite(Number(price.prompt)) && Number.isFinite(Number(price.completion));
  const cost = !known ? 'Kataloget oplyser ingen pris' : Number(price.prompt) === 0 && Number(price.completion) === 0 ? '0 USD for input/output*' : `${Number(price.prompt) * 1e6} / ${Number(price.completion) * 1e6} ${price.currency === 'DKK' ? 'DKK' : 'USD'} pr. mio. input-/outputtokens`;
  return `${cost} · ${model.capabilities?.tools === true ? 'Værktøjskald angivet i kataloget' : model.capabilities?.tools === false ? 'Ingen værktøjskald angivet' : 'Kodeværktøjer ikke verificeret'}`;
}
// For udbyderne i opsætningen vælges udbyderens eget udgangspunkt på forhånd. Det er ikke en anbefaling fra appen; modellen står under skrivefeltet og i resuméet før første afsendelse.
function preselectRecommended(connectionID) {
  const kind = state.connections.find(c => c.id === connectionID)?.kind;
  if (!featuredProviders.some(item => item.kind === kind)) return;
  const { defaultID } = window.ModelAdvice.suggest(modelCatalog, kind);
  if (defaultID) $('#model-select').value = defaultID;
}
function markChosenModel() { for (const button of document.querySelectorAll('#model-shortlist .model-choice')) button.setAttribute('aria-pressed', String(button.dataset.model === $('#model-select').value)); }
function renderShortlist() {
  const kind = state.connections.find(c => c.id === $('#connection-select').value)?.kind;
  const { curated, defaultID, picks } = window.ModelAdvice.suggest(modelCatalog, kind);
  $('#model-shortlist').replaceChildren();
  for (const { model, text } of picks) {
    const button = node('button', undefined, 'model-choice'); button.type = 'button'; button.dataset.model = model.id;
    if (window.OnboardingB) {
      button.append(node('strong', model.name), node('span', text));
      window.OnboardingB.decorateProviderCard(button, kind);
      // Keep the approved card layout while identifying routed model publishers.
      const brandAsset = window.ProviderBrand.asset(kind, model.id);
      const logo = button.querySelector('img');
      if (!brandAsset) logo?.remove();
      else if (kind === 'openrouter' && logo) logo.src = brandAsset;
    } else {
    const heading = node('strong', undefined, 'provider-brand-heading');
    const logo = window.ProviderBrand.icon(kind, model.id, document);
    if (logo) heading.append(logo);
    heading.append(node('span', model.name));
    button.append(heading, node('span', text));
    }
    // Et klik vælger modellen og lukker dialogen. Kun OpenRouter kræver bagefter et valg af udbyder.
    button.onclick = () => action(async () => {
      if ($('#model-select').value !== model.id) view.effort = null;
      $('#model-select').value = model.id; $('#model-evidence').textContent = `${model.name}: ${modelDescription(model)}. Modtager: ${state.connections.find(c => c.id === $('#connection-select').value)?.name || 'valgt forbindelse'}.`;
      markChosenModel(); updateModelSummary(); await loadRoutes();
      if ($('#route-row').hidden) { $('#model-options').open = false; $('#task-dialog').close(); $('#prompt').focus(); }
    });
    $('#model-shortlist').append(button);
  }
  // Modellen øverst er udbyderens eget udgangspunkt, ikke appens anbefaling. Det står synligt; resten ligger bag ⓘ.
  const hint = node('p', !picks.length ? 'Ingen forslag fra din forbindelse. Se alle modeller nedenfor.' : defaultID ? 'Den første er udbyderens eget udgangspunkt.' : 'Et udvalg fra din forbindelse.', 'hint');
  if (picks.length) hint.append(info('modellerne', `${curated ? 'Aura Prime anbefaler ingen model. ' : ''}Du ser pris og modtager, før noget sendes.`));
  $('#model-shortlist').append(hint);
  markChosenModel();
}
$('#model-search').oninput = () => { const query = $('#model-search').value.toLocaleLowerCase(); for (const item of $('#model-select').options) item.hidden = Boolean(item.value && item.value !== $('#model-select').value && !item.textContent.toLocaleLowerCase().includes(query)); };
function updateWorkMode() {
  const mode = $('#work-mode').value;
  view.composerMode = mode;
  const label = ({ chat: 'Samtale', plan: 'Planlæg', build: 'Byg', free: 'Byg' })[mode];
  $('#composer-mode').textContent = label;
  // Topbjælke-chippen (B3) er en anden visning af SAMME tilstand: samme etiket,
  // samme datamarkør, samme disabled-forløb — de fire interne værdier
  // (chat/plan/free/build) og "Byg den valgte plan"-forløbet er urørt.
  $('#topbar-mode').textContent = label;
  // Chip-glyfferne (◌ ≡ ◇) følger datattributten via CSS — D0-ikonsættet er
  // afvist af Parthee, så de eksisterende glyffer genbruges.
  $('#composer-mode').dataset.mode = mode;
  $('#composer-mode').setAttribute('aria-label', `Arbejdsmåde: ${label}. Vælg arbejdsmåde`);
  $('#topbar-mode').dataset.mode = mode;
  // Helteoverskriften følger arbejdsmåden (§4).
  $('#hero-heading').textContent = ({ chat: 'Hvad vil du tale om?', plan: 'Hvad skal vi planlægge?', build: 'Hvad skal vi bygge?', free: 'Hvad skal vi bygge?' })[mode];
  // Ærlig pladsholder pr. tilstand (§5.1): helt for den tomme samtale, aktiv
  // under beskeder. »/« åbner kommandomenuen (slash-commands.js); der loves
  // intet om »@«, fordi der ikke findes en mention-parser.
  const hero = $('#chat-panel')?.dataset.phase === 'hero';
  $('#prompt').placeholder = window.workspace?.target() ? 'Hvad skal AI’en ændre her? Fx Gør teksten kortere.' : hero ? (mode === 'chat' ? 'Stil et spørgsmål, eller beskriv din idé …' : 'Beskriv hvad du vil bygge, eller skriv / for kommandoer …') : ['chat', 'plan'].includes(mode) ? 'Skriv en besked, eller / for kommandoer …' : 'Beskriv det, du vil bygge eller ændre, eller / for kommandoer …';
  $('#mode-help').textContent = mode === 'chat' ? 'Tal med AI’en om projektet. Filerne ændres ikke.' : mode === 'plan' ? 'Lav en plan sammen med AI’en, før den ændrer appen.' : mode === 'build' ? 'AI’en bygger efter den plan, du har valgt. Handlinger kræver fortsat godkendelse.' : 'AI’en ændrer appen efter din besked og projektets tilladelser.';
  window.ConversationPermission?.sync(); window.ComposerWorkMode?.sync();
}
$('#work-mode').onchange = () => {
  if (['chat', 'plan'].includes(view.composerMode) && ['free', 'build'].includes($('#work-mode').value)) $('#include-history').checked = true;
  view.modeChosen = true; acceptedFingerprint = null; updateWorkMode();
  if ($('#work-mode').value === 'chat') { view.planCard = false; $('#plan-card').hidden = true; }
};
$('#composer-mode').onclick = () => { if (window.ComposerWorkMode) return window.ComposerWorkMode.open(); $('#task-dialog').showModal(); $('#task-dialog .workflow').open = true; $('#work-mode').focus(); };
// B3: topbjælke-chippen åbner den samme forankrede arbejdsmåde-menu (§5.4) —
// to visninger af én tilstand, ét ændringsforløb.
$('#topbar-mode').onclick = () => { if (window.ComposerWorkMode) return window.ComposerWorkMode.open($('#topbar-mode')); $('#task-dialog').showModal(); $('#task-dialog .workflow').open = true; $('#work-mode').focus(); };
$('#accept-plan-offer').onclick = () => {
  if (running) return;
  if (activePlan) { view.planCard = true; $('#plan-card').hidden = false; updatePlanOffer(); $('#build-plan').focus(); return; }
  $('#work-mode').value = 'plan'; updateWorkMode(); view.planOffer = false; $('#plan-offer').hidden = true;
  if (!$('#prompt').value.trim()) $('#prompt').value = 'Lad os lave en plan for det, vi har talt om.';
  $('#include-history').checked = true; acceptedFingerprint = null; saveChatDraft(); $('#prompt').focus();
};
$('#dismiss-plan-offer').onclick = () => action(async () => {
  view.planOffer = false; $('#plan-offer').hidden = true;
  await call('saveDraft', { root: current.root, chat: view.id, text: $('#prompt').value, mode: $('#work-mode').value, dismissPlanOffer: true });
  $('#prompt').focus();
});
$('#revise-plan').onclick = () => {
  if (!activePlan || running) return;
  $('#work-mode').value = 'plan'; updateWorkMode();
  if (!$('#prompt').value.trim()) $('#prompt').value = 'Ret forslaget: ';
  saveChatDraft(); $('#prompt').focus();
};
$('#build-plan').onclick = () => {
  if (!activePlan || running) return;
  if ($('#prompt').value.trim()) { message('Send eller ryd din beskedkladde, før du bygger planen.'); return; }
  $('#work-mode').value = 'build'; $('#include-history').checked = true; updateWorkMode(); acceptedFingerprint = null;
  $('#prompt').value = 'Byg første udkast efter den plan, jeg har gennemgået. Afslut med konkrete ting, jeg skal prøve i forhåndsvisningen.';
  $('#chat-form').requestSubmit();
};
// Resultatkortet kvitterer for ændringerne. Værktøjer og kontrolresultater står i Aktivitet.
// En plain afvisning stopper opgaven i OpenCode; kortet siger det i stedet for at give modellen skylden.
function updatePlanOffer(v = view) {
  // Et konkret forslag har allerede næste handling. En sen markør må ikke starte en ny planrunde.
  if (v.plan || v.buildOffer) v.planOffer = false;
  if (v === view) $('#plan-offer').hidden = !v.planOffer;
}
const reviewButton = (text, onClick, primary = false) => { const button = node('button', text, primary ? 'primary' : undefined); button.type = 'button'; button.onclick = onClick; return button; };
const retrySend = () => { if (running) return; if (!$('#prompt').value.trim()) $('#prompt').value = view.lastSentText; $('#send').click(); };
function reviewFiles(box, result) {
  if (!result.files?.length) return;
  if (!result.task) return;
  // Hver fil åbner sin linje-diff under Ændringer. Brugeren vælger selv at skifte fane.
  const list = node('ul', undefined, 'review-files');
  for (const file of [...result.files].sort((a, b) => a.localeCompare(b, 'da')).slice(0, 6)) { const item = node('li'), link = node('button', file, 'file-ref'); link.type = 'button'; link.dataset.path = file; link.dataset.change = result.task; link.title = `Se ændringerne i ${file}`; item.append(link); list.append(item); }
  if (result.files.length > 6) list.append(node('li', `og ${result.files.length - 6} flere`, 'hint'));
  box.append(list);
}
const filesText = (count, prefix) => count ? `${prefix} ${count} ${count === 1 ? 'fil' : 'filer'}:` : '';
// Fortryd opgaven: kun opgavens egne ændringer fjernes, og det, du har rettet siden, bevares. Er opgaven gemt som
// version, fortrydes versionen; ellers bruges Auras øjebliksbillede, så længe appen er åben. Begge veje gennemgås først.
function undoAction(result, label, title, v = view) {
  if (!result.files.length || !result.task || v.undoneTasks?.has(result.task)) return null;
  const checkpoint = v.lastCheckpoint?.status === 'saved' && v.lastCheckpoint.head ? v.lastCheckpoint : null, task = shortLabel(v.lastSentText);
  const button = reviewButton(label, () => action(() => reviewRestoration(checkpoint ? { revert: checkpoint.head } : { task: result.task }, { title, confirm: title, label: `Fortrudt: ${task}`, taskUndo: true, taskID: result.task })));
  button.classList.add('text-button'); return button;
}
function resultActions(result, v = view) {
  const actions = node('div', undefined, 'review-actions');
  if (result.files.length && result.task) {
    // Viewing the diff is navigation, not the user's acknowledgement of the result.
    actions.append(reviewButton('Se ændringer', () => action(async () => {
      if (v !== view) return;
      await window.workspace.showChange(result.task);
    })));
  }
  const undo = undoAction(result, 'Fortryd opgaven', 'Fortryd opgaven', v);
  if (undo) { const menu = node('details', undefined, 'result-options disclosure'); menu.append(node('summary', 'Flere valg'), undo); actions.append(menu); }
  return actions;
}
function syncResultPreview() {
  const button = view?.review?.querySelector('.result-try');
  if (!button) return;
  button.disabled = !current?.previewURL;
  const note = view.review.querySelector('.result-preview-note');
  if (note) note.hidden = Boolean(current?.previewURL);
}
function completedResult(result, v = view) {
  const box = v.review;
  box.classList.add('result-complete');
  box.append(node('p', 'RESULTAT', 'result-eyebrow'), node('h3', 'Prøv resultatet', 'result-receipt'), node('p', 'AI’ens arbejde er afsluttet. Afprøv selv resultatet, før du bygger videre.', 'result-description'));
  const hint = node('p', 'Prøv de vigtigste handlinger og det, du bad om.', 'result-test-hint');
  box.append(hint);
  const evidence = evidenceBlock(result, v); if (evidence) box.append(evidence);
  const actions = node('div', undefined, 'review-actions');
  const preview = reviewButton('Afprøv resultatet', () => {
    if (v !== view || actions.parentNode !== box || !current?.previewURL) return;
    // Switch only to the existing preview. This never starts or reconnects a server.
    window.workspace.show('preview', { focus: true });
  }, true);
  preview.classList.add('result-try'); preview.disabled = v !== view || !current?.previewURL; actions.append(preview);
  if (result.task) actions.append(reviewButton('Ændringer', () => action(async () => {
    if (v !== view || actions.parentNode !== box) return;
    await window.workspace.showChange(result.task);
  })));
  box.append(actions);
  const unavailable = node('p', 'Forhåndsvisningen er ikke startet. Du kan gennemgå ændringerne eller åbne Server og opstart i forhåndsvisningen.', 'hint result-preview-note');
  unavailable.hidden = v === view && Boolean(current?.previewURL); box.append(unavailable);
  if (result.skipped) box.append(node('p', 'Nogle filer er udeladt af oversigten på grund af filtype eller størrelse.', 'hint'));
  if (result.task) {
    const review = node('div', undefined, 'result-review-status');
    const label = node('span', v.reviewedTask === result.task ? 'Du har markeret resultatet som gennemgået' : 'Ikke gennemgået af dig');
    const mark = reviewButton('Marker som gennemgået', () => {
      if (v !== view || review.parentNode !== box || running || v.running || v.undoneTasks?.has(result.task)) return;
      v.reviewedTask = result.task; label.textContent = 'Du har markeret resultatet som gennemgået'; mark.disabled = true;
      box.classList.add('is-reviewed');
    });
    mark.classList.add('text-button'); mark.disabled = v.reviewedTask === result.task || Boolean(v.undoneTasks?.has(result.task));
    review.append(label, mark); box.append(review);
  }
  const undo = undoAction(result, 'Fortryd opgaven', 'Fortryd opgaven', v);
  if (undo) { undo.classList.add('result-undo'); box.append(undo); }
}

const targetLine = (box, v = view) => { if (v.lastTarget) box.append(node('p', `Mål: ${v.lastTarget}`, 'review-target')); };
// "Aura har set": Auras egne målinger af turen — adskilt fra modellens egen tekst, som står i
// samtalen. Kun facts fra evidensblokken, bygget med tekstknuder; ukendt forbliver ukendt.
function evidenceBlock(result, v = view) {
  const e = result?.evidence; if (!e) return null;
  const section = node('section', undefined, 'run-evidence'), list = node('dl');
  const row = (term, fact) => { list.append(node('dt', term), node('dd', fact)); };
  row('Filer', e.files.count === null ? 'Kunne ikke måles' : e.files.count === 0 ? 'Ingen ændringer målt' : `${e.files.count === 1 ? '1 fil' : `${e.files.count} filer`} ændret · målt på disken`);
  if (e.commands.run !== null) row('Kommandoer', `${e.commands.run === 1 ? '1 kommando' : `${e.commands.run} kommandoer`} kørt${e.commands.failed ? ` · ${e.commands.failed} med fejl` : ''}${e.commands.unknown ? ' · udfald delvist ukendt' : ''}`);
  row('Lokal kontrol', e.quality.ran ? (e.quality.findings === null ? 'gennemført' : e.quality.findings === 0 ? 'ingen fund' : `${e.quality.findings} fund`) : e.quality.unsupported === true ? 'ikke mulig for projektet' : 'ikke kørt');
  if (v?.repeat) row('Observation', `Samme handling gentaget ${v.repeat.count}. gang i træk`);
  section.append(node('h4', 'Aura har set'), list);
  return section;
}
function renderRunReview(result, v = view) {
  const box = v.review; box.replaceChildren(); box.classList.toggle('result-complete', false); box.classList.toggle('is-reviewed', false);
  // Resultatkortet er afslutningsbeviset for turen; statusafledningen (run-state) læser det.
  v.lastReview = result;
  const { lastCheckpoint, lastSentText, rejectedThisRun, lastRejection } = v;
  result = { files: [], tools: [], ...result };
  v.buildOffer = ['chat', 'plan'].includes(result.mode) && result.status === 'idle' && result.buildOffer === true && !v.plan && !v.waitingFor?.length;
  updatePlanOffer(v);
  const show = () => { box.hidden = false; if (v === view && v.followChat) requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest' })); };
  const saved = result.files.length && lastCheckpoint?.status === 'saved';
  if (result.task && v.undoneTasks?.has(result.task)) { show(); box.append(node('h3', 'Opgaven er fortrudt'), node('p', 'Opgavens ændringer er allerede gennemgået og fortrudt.')); return; }
  if (result.unavailable) { show(); box.append(node('h3', 'Ændringerne kunne ikke læses'), node('p', 'Gennemgå filerne under Kode, før du fortsætter.')); return; }
  if (result.status === 'error') {
    // Fejl: typen afgør forklaringen og handlingen. Den rå besked står under Se detaljer.
    const info = window.ApprovalView.failureText(result.failure?.kind); show();
    box.append(node('h3', info.title), node('p', `${info.text} Din besked står klar i skrivefeltet.`));
    if (result.files.length) { box.append(node('p', filesText(result.files.length, 'AI’en nåede at ændre'))); reviewFiles(box, result); }
    const failureEvidence = evidenceBlock(result, v); if (failureEvidence) box.append(failureEvidence);
    const actions = node('div', undefined, 'review-actions');
    const kind = state?.connections.find(c => c.id === $('#connection-select').value)?.kind;
    const pages = { anthropic: 'billing', mistral: 'billing', corti: 'console', alexandra: 'billing', openrouter: 'start', zen: 'start' };
    if (info.action === 'connection') actions.append(reviewButton('Gennemgå AI-forbindelse', () => showSetup(info.title), true));
    if (info.action === 'account' && pages[kind]) actions.append(reviewButton('Åbn kontoen hos udbyderen', () => action(() => call('providerAccount', { kind, page: pages[kind] })), true));
    else if (info.action === 'account') actions.append(reviewButton('Gennemgå AI-forbindelse', () => showSetup(info.title), true));
    if (info.action === 'model') actions.append(reviewButton('Vælg en anden model', () => openTaskSettings(), true));
    actions.append(reviewButton('Prøv igen', retrySend, info.action === 'retry'));
    if (result.files.length) actions.append(resultActions(result, v));
    box.append(actions);
    if (result.failure?.message) { const fold = node('details', undefined, 'review-details disclosure'); fold.append(node('summary', 'Se detaljer'), node('pre', result.failure.message)); box.append(fold); }
    return;
  }
  if (result.status === 'stopped') {
    show();
    box.append(node('h3', 'Du stoppede opgaven')); targetLine(box, v); box.append(node('p', result.files.length ? filesText(result.files.length, 'AI’en nåede at ændre') : 'AI’en nåede ikke at ændre noget. Din besked står klar i skrivefeltet, så du kan sende den igen.'));
    reviewFiles(box, result);
    if (saved) box.append(node('p', 'Det, den nåede, er gemt som en version, så du kan fortryde det.', 'hint'));
    const stoppedEvidence = evidenceBlock(result, v); if (stoppedEvidence) box.append(stoppedEvidence);
    const actions = node('div', undefined, 'review-actions');
    if (result.files.length) actions.append(resultActions(result, v));
    actions.append(reviewButton('Send igen', retrySend, !saved));
    box.append(actions); return;
  }
  if (rejectedThisRun) {
    // Afvist uden besked: AI'en stoppede. Vejen videre er at sige, hvad den skal gøre i stedet.
    show();
    box.append(node('h3', 'Du afviste en handling, så AI’en stoppede'), node('p', lastRejection ? `Afvist: ${lastRejection.title.replace(/^Må AI’en /, '').replace(/\?$/, '')}${lastRejection.target ? ` · ${lastRejection.target.split('\n')[0].slice(0, 160)}` : ''}.` : 'En handling blev afvist.'));
    if (result.files.length) { box.append(node('p', filesText(result.files.length, 'Før det nåede AI’en at ændre'))); reviewFiles(box, result); }
    const actions = node('div', undefined, 'review-actions');
    actions.append(reviewButton('Skriv, hvad AI’en skal gøre i stedet', () => { if (!$('#prompt').value.trim()) $('#prompt').value = 'Gør det på en anden måde: '; $('#prompt').focus(); }, true), reviewButton('Send beskeden igen', () => { $('#prompt').value = lastSentText; retrySend(); }));
    if (result.files.length) actions.append(resultActions(result, v));
    box.append(actions); return;
  }
  // En opgave, der slutter uden svar og uden ændringer, må ikke ligne et resultat.
  if (!result.files.length && result.answered === false) {
    const long = result.finish === 'length';
    show(); box.append(node('h3', 'AI’en stoppede uden et resultat'), node('p', long
      ? 'Modellen brugte hele svaret på at tænke og nåede ikke at skrive noget. Det sker oftest ved store opgaver og lange samtaler.'
      : 'AI’en stoppede uden at svare eller ændre filer. Prøv igen. Virker det stadig ikke, så vælg en anden model.'));
    const actions = node('div', undefined, 'review-actions'), again = () => { $('#prompt').value = lastSentText; retrySend(); };
    // Lav indsats får modellen til at tænke kortere. Den vises kun, når modellen tager imod den og ikke allerede bruger den.
    const lower = long && v.effort !== 'low' && (v.effortLevels || []).includes('low');
    if (lower) actions.append(reviewButton('Prøv igen med lav indsats', () => { v.effort = 'low'; updateModelSummary(); again(); }, true));
    // En lang samtale gøres kortere, før beskeden sendes igen. Planen og filerne bevares.
    if (long && v.log.querySelectorAll('.chat-message.user').length > 1) actions.append(reviewButton('Gør samtalen kortere og prøv igen', () => { v.compactNext = true; again(); }, !lower));
    actions.append(reviewButton('Prøv igen', again, !actions.children.length));
    box.append(actions); return;
  }
  if (v.buildOffer) {
    show(); box.append(node('h3', 'Næste skridt'));
    const build = reviewButton('Byg videre', () => {
      if (v !== view || running || v.submitting) return;
      if ($('#prompt').value.trim()) { message('Send eller ryd din beskedkladde først.'); $('#prompt').focus(); return; }
      $('#include-history').checked = true;
      window.draftMessage('Byg videre ud fra det, vi har aftalt i samtalen.', 'AI’en bygger videre ud fra samtalen.', { mode: 'free', submit: true, owner: selectedOwner() });
    }, true);
    box.append(build); return;
  }
  // Et svar kan være en afklaring eller et spørgsmål. Ingen filændringer er
  // ikke et bevis på, at brugerens samlede opgave er afsluttet. Svaret og skrivefeltet bliver stående.
  if (!result.files.length) { box.hidden = true; return; }
  show();
  box.classList.toggle('is-reviewed', v.reviewedTask === result.task);
  completedResult(result, v);
}


let localDiscoveryGeneration = 0, localDiscoveryResult = null;
async function discoverLocal() {
  const generation = ++localDiscoveryGeneration;
  localDiscoveryResult = null;
  $('#local-discovery-use').hidden = true;
  $('#local-discovery-retry').disabled = true;
  $('#local-discovery-models').replaceChildren();
  $('#local-discovery-status').textContent = 'Leder efter Ollama på denne computer …';
  try {
    const result = await call('discoverLocalModels');
    if (generation !== localDiscoveryGeneration) return;
    localDiscoveryResult = result; $('#setup-local-hint').textContent = result.status === 'found' ? `${result.models.length} ${result.models.length === 1 ? 'model fundet' : 'modeller fundet'} i Ollama.` : 'Brug en model, du har i Ollama.';
    $('#local-discovery-status').textContent = ({ found: 'Vi fandt dine modeller. Du kan fortsætte med Ollama.', empty: 'Ollama er åben, men har ingen modeller. Tilføj en model i Ollama, og søg igen.', invalid: 'Vi kunne ikke læse modellerne. Kontrollér Ollama, eller brug en anden adresse.', unavailable: 'Åbn Ollama, hvis du har det installeret, og søg igen. Du kan også vælge senere.' })[result.status];
    for (const model of result.models.slice(0, 6)) $('#local-discovery-models').append(node('li', model.name + (model.remote ? ' · mulig cloudmodel' : '')));
    if (result.models.length > 6) $('#local-discovery-models').append(node('li', `Og ${result.models.length - 6} andre modeller`));
    $('#local-discovery-use').hidden = result.status !== 'found';
  } finally { if (generation === localDiscoveryGeneration) $('#local-discovery-retry').disabled = false; }
}
$('#local-discovery-retry').onclick = () => action(discoverLocal);
$('#local-discovery-use').onclick = () => action(async () => {
  if (running || localDiscoveryResult?.status !== 'found') return;
  $('#local-discovery-use').disabled = true;
  try {
    const address = localDiscoveryResult.baseURL;
    let saved = state.connections.find(c => c.kind === 'ollama' && c.baseURL === address);
    if (!saved) {
      state = await call('saveConnection', { kind: 'ollama', name: 'Ollama på denne computer', baseURL: address });
      saved = state.connections.find(c => c.kind === 'ollama' && c.baseURL === address);
    }
    renderConnections(); $('#setup-connection').value = saved.id;
    verifiedConnection = ''; setupPage('saved'); await testSetupConnection();
  } finally { $('#local-discovery-use').disabled = false; }
});

$('#prompt').addEventListener('input', () => {
  updateStartIdea();
  if (!current || !view.id) return;
  // Kladden gemmes straks lokalt for samtalen, så den også findes, hvis appen lukkes, før den er skrevet til samtalefilen.
  try { localStorage.setItem(`harness.chatDraft.${current.root}.${view.id}`, JSON.stringify({ text: $('#prompt').value, mode: $('#work-mode').value })); } catch {}
  clearTimeout(draftTimer); draftTimer = setTimeout(saveChatDraft, 250);
});
$('#work-mode').addEventListener('change', saveChatDraft);
$('#include-history').onchange = () => { acceptedFingerprint = null; };
$('#setup-find-local').onclick = () => { setupPage('local'); if (!localDiscoveryResult) action(discoverLocal); };
$('#setup-add-provider').onclick = () => setupProvider();

// Ny samtale i det åbne projekt. Den forrige står i sidepanelet og kan åbnes igen; en opgave i den fortsætter.
async function newChat() { if (!current) return; const owner = selectedOwner(), request = ++navigationRequest; await saveChatDraft(); const next = await call('newConversation', undefined, owner); if (!next || request !== navigationRequest || current?.root !== owner.root) return; current.workbench = next; await showChat(next); $('#prompt').focus(); }
$('#merge-copy').onclick = () => action(() => reviewRestoration({ merge: true, chat: view.id }, { title: 'Flet samtalens ændringer ind?', confirm: 'Flet ind i projektet', label: `Flettet ind: ${chatTitle(view.id)}` }));

function openTaskSettings() {
  if (!state?.connections?.length) { showSetup('Tilslut en AI for at bygge videre. Din kladde er bevaret.'); return; }
  $('#model-options').open = true; if (!$('#task-dialog').open) $('#task-dialog').showModal();
}
// Modelvælgeren anker ved chippen gennem det fælles popover-lag: højre kant
// ved chippen (align 'end'), så vælgeren følger kolonnen og aldrig krydser
// skillelinjen i nogen chatbredde. Zoom og vinduesstørrelse genankorer gennem
// lagets resize-lyttere — der er ingen faste koordinater.
$('#model-chip').onclick = async () => {
  await buildModelPicker();
  window.PopoverLayer.open({ layer: document.getElementById('model-picker'), invoker: $('#model-chip'), align: 'end', width: 340 });
  document.getElementById('model-picker-search')?.focus();
};
// Combobox-relationen: aria-expanded følger popoberen, så skærmlæseren ved, om listen er åben.
document.getElementById('model-picker').addEventListener('toggle', () => { document.getElementById('model-picker-search')?.setAttribute('aria-expanded', String(document.getElementById('model-picker').matches(':popover-open'))); });
let pickerEntries = [];
function syncPickerEffort() {
  const range = document.getElementById('picker-effort-range');
  const valueEl = document.getElementById('picker-effort-value');
  const row = document.getElementById('picker-effort');
  const labels = document.querySelector('.effort-slider-labels');
  // Trinene kommer fra modellens faktiske indsatsniveauer, så vælgeren aldrig tilbyder et valg, backenden afviser.
  const steps = window.ModelAdvice.effortSteps(view?.effortLevels);
  if (row) row.hidden = steps.length < 2;
  if (!range || steps.length < 2) return;
  if (labels && !labels.dataset.bound) {
    labels.dataset.bound = '1';
    labels.addEventListener('click', event => { const span = event.target.closest('span[data-effort-level]'); if (!span) return; range.value = span.dataset.effortLevel; range.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  if (!range.dataset.bound) {
    range.dataset.bound = '1';
    range.addEventListener('input', () => { setEffort(window.ModelAdvice.effortSteps(view?.effortLevels)[Number(range.value)] ?? null); oppdaterEffortSlider(true); });
    range.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); document.getElementById('model-picker').hidePopover(); $('#model-chip').focus(); } });
  }
  range.max = steps.length - 1;
  if (labels) labels.replaceChildren(...steps.slice(1).map((level, index) => { const span = node('span', window.ModelAdvice.effortLabel(level)); span.dataset.effortLevel = index + 1; span.title = `${window.ModelAdvice.effortLabel(level)} indsats`; return span; }));
  const ind = Math.max(0, steps.indexOf(view?.effort ?? null));
  range.value = ind; valueEl.textContent = window.ModelAdvice.effortLabel(steps[ind]);
  range.setAttribute('aria-valuetext', window.ModelAdvice.effortLabel(steps[ind]));
  oppdaterEffortSlider(false);
  // Vækker animationen: fyldet glider ind fra venstre, når vælgeren åbnes.
  requestAnimationFrame(() => requestAnimationFrame(() => oppdaterEffortSlider(false)));
}
function oppdaterEffortSlider(pop = false) {
  const range = document.getElementById('picker-effort-range');
  const fill = document.querySelector('.picker-effort-slider .effort-slider-fill');
  const thumb = document.querySelector('.picker-effort-slider .effort-slider-thumb');
  const valueEl = document.getElementById('picker-effort-value');
  if (!range || !fill || !thumb) return;
  const steps = window.ModelAdvice.effortSteps(view?.effortLevels);
  const label = window.ModelAdvice.effortLabel(steps[Number(range.value)] ?? null);
  const prosent = steps.length > 1 ? (Number(range.value) / (steps.length - 1)) * 100 : 0;
  fill.style.width = `${prosent}%`; thumb.style.left = `${prosent}%`;
  valueEl.textContent = label;
  range.setAttribute('aria-valuetext', label);
  if (pop) { thumb.classList.remove('pop'); void thumb.offsetWidth; thumb.classList.add('pop'); }
}

async function buildModelPicker() {
  const list = document.getElementById('model-picker-list');
  const search = document.getElementById('model-picker-search');
  if (search && !search.dataset.bound) {
    search.dataset.bound = '1';
    // Tastaturnavigation som i Codex: pilene bevæger sig gennem listen, Enter vælger.
    search.addEventListener('input', () => renderModelPicker(search.value));
    search.addEventListener('keydown', event => {
      const poster = [...list.querySelectorAll('button')];
      if (!poster.length) return;
      const aktiv = poster.findIndex(b => b.dataset.aktiv === '1');
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const neste = event.key === 'ArrowDown' ? Math.min(poster.length - 1, aktiv + 1) : Math.max(0, aktiv < 0 ? 0 : aktiv - 1);
        poster.forEach(b => delete b.dataset.aktiv); poster[neste].dataset.aktiv = '1';
        // Skærmlæseren følger markeringen gennem listens knapper.
        search.setAttribute('aria-activedescendant', poster[neste].id);
        poster[neste].scrollIntoView({ block: 'nearest' });
      } else if (event.key === 'Enter') {
        event.preventDefault();
        (poster.find(b => b.dataset.aktiv === '1') || poster[0]).click();
      } else if (event.key === 'Escape') {
        event.preventDefault(); document.getElementById('model-picker').hidePopover(); $('#model-chip').focus();
      }
    });
  }
  const conn = $('#connection-select'), connModel = $('#model-select');
  await refreshEffortLevels();
  syncPickerEffort();
  if (!conn?.value) { pickerEntries = []; if (search) search.value = ''; renderModelPicker(''); list.replaceChildren(node('p', 'Ingen forbindelse valgt endnu.', 'hint')); return; }
  const currentID = connModel?.value ?? '';
  // En mislykket hentning er ikke et tomt katalog: fejl og genforsøgsvej vises særskilt.
  let catalogFailed = false;
  if (!modelCatalog?.length) { list.replaceChildren(node('p', 'Henter modeller …', 'hint')); try { await loadModels(); } catch { catalogFailed = true; } }
  pickerEntries = [];
  if (currentID) {
    // Ved en fejlet hentning viser selecten en fejltekst; modelnavnet må ikke stamme derfra.
    const chosenText = connModel.selectedOptions?.[0]?.textContent || '';
    const fromPlaceholder = ['Henter modeller …', 'Forbindelsen kunne ikke læses', 'Vælg model', 'Vælg en forbindelse først'].includes(chosenText);
    pickerEntries.push({ modelID: currentID, label: pentModelNavn(currentID, fromPlaceholder ? '' : chosenText), current: true });
  }
  for (const model of modelCatalog || []) {
    if (model.id === currentID) continue;
    const free = model.price && model.price.prompt != null && model.price.completion != null && Number(model.price.prompt) === 0 && Number(model.price.completion) === 0;
    pickerEntries.push({ modelID: model.id, label: `${pentModelNavn(model.id, model.name)}${free ? ' · gratis*' : ''}` });
  }
  if (!pickerEntries.length) { if (search) search.value = ''; renderModelPicker(''); list.replaceChildren(node('p', catalogFailed ? 'Modellerne kunne ikke hentes fra forbindelsen. Kontrollér den, og prøv igen her eller under Flere indstillinger.' : 'Ingen modeller fundet hos forbindelsen.', 'hint')); return; }
  if (search) search.value = '';
  renderModelPicker('');
  if (catalogFailed) list.prepend(node('p', 'Modellerne kunne ikke hentes fra forbindelsen. Listen kan være ufuldstændig; prøv igen under Flere indstillinger.', 'hint'));
}
// Modelevner (4.11): only documented capabilities are shown; unknown stays
// "ukendt" and never blocks a choice. Byg needs tools, so the tag guides.
function modelCapabilityTags(model) {
  const caps = model?.capabilities; if (!caps || typeof caps !== 'object') return [];
  const tags = [];
  if (model.buildSuitable === true || caps.tools === true) tags.push(['Kan bygge', 'build']);
  else if (model.buildSuitable === false || caps.tools === false) tags.push(['Kun samtale', 'chat-only']);
  else tags.push(['Ukendt om den kan bygge', 'unknown']);
  if (caps.images === true) tags.push(['Billeder', 'images']);
  if (caps.reasoning === true) tags.push(['Ræsonnering', 'reasoning']);
  return tags;
}
function renderModelPicker(term = '') {
  const list = document.getElementById('model-picker-list');
  const search = document.getElementById('model-picker-search');
  const needle = term.trim().toLowerCase();
  // Listen genopbygges; en gammel knapmarkering må ikke blive hængende som pegepind.
  if (search) search.removeAttribute('aria-activedescendant');
  const matches = needle ? pickerEntries.filter(e => e.label.toLowerCase().includes(needle) || e.modelID.toLowerCase().includes(needle)) : pickerEntries;
  list.replaceChildren(...(matches.length ? matches.map((item, index) => {
    const btn = node('button', undefined, 'model-picker-option'); btn.type = 'button'; btn.id = `model-option-${index}`; btn.setAttribute('role', 'option');
    btn.append(node('span', item.label, 'model-picker-name'));
    const tags = modelCapabilityTags(modelCatalog?.find(model => model.id === item.modelID));
    if (tags.length) { const row = node('span', undefined, 'model-capabilities'); row.append(...tags.map(([text, kind]) => { const tag = node('span', text, 'model-capability'); tag.dataset.kind = kind; return tag; })); btn.append(row); btn.setAttribute('aria-description', tags.map(([text]) => text).join(', ')); }
    btn.setAttribute('aria-selected', String(!!item.current));
    btn.onclick = () => {
      document.getElementById('model-picker').hidePopover();
      const select = $('#model-select'); if (item.modelID && select && select.value !== item.modelID) { select.value = item.modelID; select.dispatchEvent(new Event('change', { bubbles: true })); }
      $('#prompt').focus();
    };
    return btn;
  }) : [node('p', 'Ingen model matcher søgningen.', 'hint')]));
}
$('#model-picker-more').onclick = () => { document.getElementById('model-picker').hidePopover(); openTaskSettings(); };

// Drag-and-drop: træk filer ind i chatboksen — de gennemgås gennem den samme sikre vej som filvælgeren
const chatForm = $('#chat-form');
['dragenter', 'dragover'].forEach(type => chatForm.addEventListener(type, event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; chatForm.classList.add('composer-dragging'); }));
chatForm.addEventListener('dragleave', event => { if (!chatForm.contains(event.relatedTarget)) chatForm.classList.remove('composer-dragging'); });
chatForm.addEventListener('drop', async event => {
  event.preventDefault(); chatForm.classList.remove('composer-dragging');
  const files = [...event.dataTransfer?.files || []];
  if (!files.length) return;
  const paths = files.map(file => file.path).filter(Boolean);
  if (!paths.length) { message('Filerne kunne ikke læses fra træk-og-drop. Brug + knappen.', true); return; }
  try {
    // offerFiles gennemgår filerne (type, størrelse, indhold) og viser dem til godkendelse
    const result = await window.harness.chatMaterialsOffer({ paths });
    if (result?.ok !== true) { message(result?.error || 'Filerne kunne ikke vedhæftes.', true); return; }
    // Hvis gennemgangen gav et anbringelse afventes: standard-tekst
    if (result.value?.cancelled) { /* Brugeren annullerede */ }
  } catch (err) { message(`Filerne kunne ikke vedhæftes: ${err.message}`, true); }
});

// En valgt indsats hører til modellen. Et skift af model eller forbindelse vender tilbage til udbyderens standard.
const resetEffort = () => { if (view) view.effort = null; updateModelSummary(); };
$('#model-effort-reset').onclick = resetEffort;
// Indsats-knapperne i Vælg AI-dialogen: gem niveauet til samtalen og visning hvorefter.
function setEffort(level) { if (!view) return; view.effort = level || null; updateModelSummary(); }
// Henter modellens faktiske indsatsniveauer fra hovedprocessen (kendt tabel + katalogets egne
// oplysninger), så vælgeren viser de samme trin, backenden accepterer — også før første afsendelse
// og efter et modelskift. Ingen netværksforbindelse bruges.
let effortLevelsRequest = 0;
async function refreshEffortLevels() {
  if (!view) return;
  const id = $('#connection-select')?.value, modelID = $('#model-select')?.value;
  if (!id || !modelID) return;
  const generation = ++effortLevelsRequest;
  try {
    const capabilities = (modelCatalog || []).find(model => model.id === modelID)?.capabilities;
    const levels = await call('effortLevels', { connectionID: id, modelID, capabilities });
    if (generation !== effortLevelsRequest || !view || !Array.isArray(levels)) return;
    view.effortLevels = levels;
    // Modellen kan ikke tage imod et tidligere valgt niveau; samtalen falder da tilbage til standard.
    if (view.effort && !levels.includes(view.effort)) { view.effort = null; updateModelSummary(); }
    else if (document.getElementById('model-picker')?.matches(':popover-open')) syncPickerEffort();
  } catch { /* Niveauerne hentes igen ved næste valg; intet forkert vises imens. */ }
}
for (const chip of document.querySelectorAll('.effort-chip')) { chip.onclick = () => { setEffort(chip.dataset.effort); }; }
for (const id of ['#connection-select', '#model-select']) $(id).addEventListener('change', () => { if (view?.effort) resetEffort(); refreshEffortLevels(); });
for (const id of ['settings-menu', 'project-menu', 'preview-menu']) {
  document.getElementById(id).addEventListener('click', event => { if (event.target.closest('button') && (id !== 'preview-menu' || event.target.closest('#attach-preview'))) document.getElementById(id).hidePopover(); });
}

function openSupportSection() { return action(async () => {
  $('#support-dialog').showModal(); $('#support-status').textContent = '';
  const report = await call('supportReport');
  $('#support-version').textContent = `Aura Prime ${report.app} · ${report.system === 'darwin' ? 'macOS' : report.system === 'win32' ? 'Windows' : report.system} · ${report.arkitektur}`;
  $('#support-report').textContent = JSON.stringify(report, null, 2);
  // Adressen står synligt, så den kan kopieres, hvis computeren ikke har et e-mailprogram.
  const person = await call('supportContact');
  $('#support-contact').textContent = person ? `Send feedback til ${person.name}, ${person.email}.` : 'Send feedback til den, der inviterede dig.';
  $('#support-feedback').hidden = !person; if (person) $('#support-feedback').textContent = `Skriv en e-mail til ${person.name}`;
}); }
$('#support-save').onclick = () => action(async () => { $('#support-status').textContent = await call('supportSave') ? 'Rapporten er gemt på din computer. Du vælger selv, om du vil dele den.' : 'Rapporten blev ikke gemt.'; });
$('#support-feedback').onclick = () => action(() => call('supportFeedback'));

// Settings has one entry point. settings.js owns the dialog and the section
// route; this block wires the six popover entries and registers the four
// established dialogs' own open functions, so no dialog ever nests in another.
function openSettings(section) { return window.SettingsDialog?.open(section); }
window.SettingsDialog?.register({ connections: openConnectionsSection, features: openFeaturesSection, support: openSupportSection });
$('#settings-profile-button').onclick = () => openSettings('profile');
$('#settings-appearance-button').onclick = () => openSettings('appearance');
$('#connections-button').onclick = () => openSettings('connections');
$('#features-button').onclick = () => openSettings('features');
$('#plugins-button').onclick = () => openSettings('plugins');
$('#support-button').onclick = () => openSettings('support');
// updates.js runs after app.js and binds #updates-button itself; adopt its open
// function as the section's opener, then route the button through openSettings.
document.addEventListener('DOMContentLoaded', () => {
  window.SettingsDialog?.register({ updates: $('#updates-button').onclick });
  $('#updates-button').onclick = () => openSettings('updates');
});

// Udgiv forbinder komplai Run fra sin egen dialog; appens funktioner følger med.
window.addEventListener('harness:komplai-connected', () => action(async () => { state = await call('connectionState'); renderConnections(); applyFeatures(); }));

window.ChatMaterials.connect({read:()=>({root:current?.root,chat:view.id,running:running||projectLoading}),invoke:(method,value,owner)=>call(method,value,owner),invalidate:()=>{acceptedFingerprint=null;pendingSend=null;if($('#data-dialog').open)$('#data-dialog').close();}});
function syncCloudflareAddress() {
  const id = $('#cloudflare-account').value.trim().toLowerCase();
  const valid = /^[a-f0-9]{32}$/.test(id);
  if (valid) $('#base-url').value = `https://api.cloudflare.com/client/v4/accounts/${id}/ai/v1`;
  $('#cloudflare-destination').textContent = valid ? `Adressen bliver ${$('#base-url').value}` : 'Du finder konto-id\'et i Cloudflare-dashboardet under Workers AI. Adressen bygges ud fra det.';
}
$('#cloudflare-account').addEventListener('input', syncCloudflareAddress);
function connectionInput(){return {id:$('#connection-id').value||undefined,kind:$('#provider-kind').value,name:$('#connection-name').value,baseURL:$('#provider-kind').value==='azure'?$('#azure-endpoint').value:$('#base-url').value,deployment:$('#azure-deployment').value,protocol:$('#provider-kind').value==='compatible'?$('#custom-protocol').value:$('#azure-protocol').value,...($('#provider-kind').value==='compatible'&&$('#provider-id').value.trim()?{providerID:$('#provider-id').value.trim()}:{}),clearKey:$('#clear-key').checked};}
function clearConnectionReceipt(){connectionReceipt=null;connectionTicket++;$('#credential-status').textContent='Ingen ny nøgle valgt';void call('credentialCancel').catch(()=>{});}
$('#credential-open').onclick=()=>action(async()=>{
  clearConnectionReceipt();const ticket=connectionTicket,configuration=connectionInput(),identity=JSON.stringify(configuration);$('#credential-open').disabled=true;
  try{const result=await call('credentialEntry',{purpose:'connection',configuration});if(ticket!==connectionTicket||JSON.stringify(connectionInput())!==identity)return;if(!result.canceled){connectionReceipt=result.keyReceipt;$('#credential-status').textContent='Ny nøgle klar til at gemme';}}
  finally{$('#credential-open').disabled=false;}
});
for(const id of ['connection-name','base-url','azure-endpoint','azure-deployment','azure-protocol','clear-key'])$('#'+id).addEventListener('input',clearConnectionReceipt);
$('#connection-form').addEventListener('reset',clearConnectionReceipt);
function renderHistoryControls(){const count=view.historyPending?.length||0;$('#history-load').hidden=!count;$('#history-load').textContent=`Indlæs tidligere beskeder (${count})`;$('#history-load-status').hidden=!view.historyNotice;$('#history-load-status').textContent=view.historyNotice||'';}
$('#history-load').onclick=()=>{
  const v=view,container=$('#chat-content'),height=container.scrollHeight,top=container.scrollTop;
  const page=window.HistoryPages.takePrevious(v.historyPending);if(!page.recent.length)return;
  const fragment=document.createDocumentFragment(),staging={...v,log:fragment};
  for(const item of page.recent){const element=appendMessage(item.text,item.role,staging,item.at);if(typeof item.id==='string')element.dataset.messageId=item.id;}
  v.followChat=false;v.log.prepend(fragment);v.historyPending=page.older;v.historyNotice=`${page.recent.length} tidligere beskeder indlæst fra denne computer.`;renderHistoryControls();
  const position=top+container.scrollHeight-height;container.scrollTop=position;v.scrollTop=position;
  if(!page.older.length)$('#history-load-status').focus({preventScroll:true});
  requestAnimationFrame(()=>{if(view===v){container.scrollTop=position;v.scrollTop=position;updateChatScroll();}});
};

window.PrivacyGate?.connect({
  invoke: (method, value) => call(method, value, value?.scope === 'idea' ? null : selectedOwner()),
  read: () => { const connection = state?.connections?.find(item => item.id === $('#connection-select').value); return { root: current?.root || '', chat: view.id || '', running: view.running, kind: connection?.kind, connectionName: connection?.name, modelID: $('#model-select').value, modelName: $('#model-select').selectedOptions[0]?.textContent || '' }; }
});

window.addEventListener('aura:privacy-revoke-previews',event=>{for(const root of event.detail?.roots||[]){previewFrames.get(root)?.remove();previewFrames.delete(root);previewRevisions.delete(root);}});
