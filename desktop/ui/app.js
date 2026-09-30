const $ = selector => document.querySelector(selector);
let current = null, revision = null, polling = false, state = null, modelRequest = 0, acceptedFingerprint = null, pendingSend = null, running = false;
let activityGroup = null;
let skillList = [], roles = new Map(), parts = new Map(), partTypes = new Map();
function message(text, error = false) { const dialog = [...document.querySelectorAll('dialog[open]')].at(-1); if (dialog) { let notice = dialog.querySelector('.dialog-notice'); if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-notice'; notice.setAttribute('role', 'status'); dialog.append(notice); } notice.textContent = text; }  $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = false; }
async function call(method, value) { const result = await window.harness[method](value); if (!result.ok) throw new Error(result.error); return result.value; }
async function action(fn) { $('#message').hidden = true; try { return await fn(); } catch (error) { message(error.message, true); } }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
async function refreshRecent() {
  const items = await call('recentProjects'); $('#recent-projects').replaceChildren();
  for (const item of items.filter(item => item.root !== current?.root)) {
    const button = node('button', item.name); button.title = item.root; button.disabled = running;
    button.onclick = () => action(async () => { await saveChatDraft(); await displayProject(await call('reopenProject', item.id)); });
    $('#recent-projects').append(button);
  }
}
let draftTimer;
async function saveChatDraft() {
  clearTimeout(draftTimer);
  if (!current) return;
  const root = current.root, text = $('#prompt').value, mode = $('#work-mode').value;
  try { localStorage.setItem('harness.chatDraft.' + root, JSON.stringify({ text, mode })); } catch {}
  $('#draft-status').textContent = 'Gemmer kladde …';
  try { await call('saveDraft', { root, text, mode }); if (current?.root === root && $('#prompt').value === text) $('#draft-status').textContent = 'Kladde gemt på denne computer'; }
  catch { if (current?.root === root) $('#draft-status').textContent = 'Kladden kunne ikke gemmes. Kopiér teksten, før du lukker.'; }
}
function option(value, label) { const el = node('option', label); el.value = value; return el; }
function appendMessage(text, role = 'assistant') { $('#project-intro').hidden = true; $('#start-idea').hidden = true; const el = node('div', text, `chat-message ${role}`); $('#messages').append(el); $('#chat-content').scrollTop = $('#chat-content').scrollHeight; return el; }
let guidedSetup = false, setupStep = 'choice';
let setupActive = false, setupGeneration = 0, verifiedConnection = '', recovery = '', lastSentText = '';
let preferredConnection = '', autoConnect = false;
try { preferredConnection = localStorage.getItem('harness.preferredConnection') || ''; } catch {}
function setupControls() {
  const id = $('#setup-connection').value;
  $('#setup-test').disabled = !id || running;
  $('#setup-continue').disabled = !id || verifiedConnection !== id || running;
  $('#new').disabled = running; $('#open').disabled = running;
  $('#skills-button').disabled = running || setupActive || !current;
  $('#setup-button').disabled = running; $('#setup-local').disabled = running;
  $('#setup-git-open').disabled = running;
  $('#setup-edit').disabled = !id || running;
  $('#setup-continue').hidden = verifiedConnection !== id || !id;
  $('#setup-test').hidden = Boolean(id && verifiedConnection === id);
}
function moveConnectionForm(guided) {
  const parent = guided ? $('#setup-provider-body') : $('#connection-form-home');
  if (!guided) $('#connection-advanced').hidden = false;
  parent.append($('#connection-form'), $('#connection-feedback'));
  $('#save-connection').textContent = guided ? 'Gem og kontrollér' : 'Gem forbindelse';
  $('#reset-connection').hidden = guided;
  $('#clear-key-row').hidden = guided && !$('#connection-id').value;
}
function setupPage(step) {
  ++setupGeneration;
  setupStep = step;
  const headings = { choice: ['Hvordan vil du forbinde din AI?', 'Vælg den adgang, du allerede har.'], provider: ['Hvem er din udbyder?', 'Vælg den udbyder, du vil bruge. Har du ikke en nøgle endnu, viser vi dig, hvordan du får en.'], local: ['AI på din computer', 'Vi leder efter modeller, du allerede har i Ollama.'], saved: ['Din AI-forbindelse', 'Kontrollér forbindelsen, før du fortsætter.'], tools: ['Avanceret opsætning', 'Forbindelser og lokale værktøjer.'] };
  $('#setup-title').textContent = headings[step][0]; $('#setup-subtitle').textContent = headings[step][1];
  for (const el of document.querySelectorAll('[data-setup-step]')) el.hidden = el.dataset.setupStep !== step;
  moveConnectionForm(step === 'provider');
  $('#setup-advanced').hidden = step !== 'choice';
  $('#setup').dataset.step = step;
  $('#setup-title').focus(); window.scrollTo(0, 0); setupControls();
}
// Den guidede opsætning viser tre ligestillede udbydere som kort med faktuelle oplysninger; appen anbefaler ingen af dem. Resten ligger bag "Vælg en anden".
const featuredProviders = [
  { kind: 'anthropic', name: 'Claude', text: 'Fra Anthropic i USA.' },
  { kind: 'mistral', name: 'Mistral', text: 'Fra Mistral AI i Frankrig.' },
  { kind: 'corti', name: 'Corti', text: 'Fra Corti i Danmark. Modeller i EU.' }
];
function chooseProvider(kind) {
  $('#provider-kind').value = kind; updateProvider(); $('#connection-advanced').hidden = true;
  for (const card of document.querySelectorAll('#provider-cards button')) card.setAttribute('aria-pressed', String(card.dataset.kind === kind));
  $('#setup-provider-body').hidden = false; $('#api-key').focus();
}
function renderProviderCards() {
  $('#provider-cards').replaceChildren(...featuredProviders.map(item => {
    const card = node('button', undefined, 'provider-card'); card.type = 'button'; card.dataset.kind = item.kind; card.setAttribute('aria-pressed', 'false');
    card.append(node('strong', item.name), node('span', item.text));
    card.onclick = () => chooseProvider(item.kind);
    return card;
  }));
}
$('#provider-other').onclick = () => {
  $('#connection-form').classList.add('all-providers'); $('#connection-advanced').hidden = false;
  for (const card of document.querySelectorAll('#provider-cards button')) card.setAttribute('aria-pressed', 'false');
  if (featuredProviders.some(item => item.kind === $('#provider-kind').value)) { $('#provider-kind').value = 'openrouter'; updateProvider(); }
  $('#setup-provider-body').hidden = false; $('#provider-kind').focus();
};
function setupProvider(connection) {
  $('#connection-form').reset(); $('#connection-id').value = connection?.id || ''; $('#connection-feedback').textContent = '';
  $('#connection-form').classList.remove('all-providers'); renderProviderCards();
  $('#provider-kind').value = connection?.kind || 'anthropic'; updateProvider();
  if (connection) { $('#connection-name').value = connection.name; $('#base-url').value = connection.baseURL; }
  $('.key-guide').open = false; setupPage('provider');
  const featured = featuredProviders.some(item => item.kind === $('#provider-kind').value);
  if (connection && featured) chooseProvider(connection.kind);
  else if (connection) $('#provider-other').onclick();
  else $('#setup-provider-body').hidden = true;
}
function renderSetup() {
  const previous = $('#setup-connection').value || preferredConnection;
  $('#setup-connection').replaceChildren(option('', 'Vælg forbindelse'), ...(state?.connections || []).map(c => option(c.id, c.name)));
  if (state?.connections.some(c => c.id === previous)) $('#setup-connection').value = previous;
  else verifiedConnection = '';
  $('#setup-use-saved').hidden = !state?.connections.length;
  $('#setup-saved-hint').textContent = state?.connections.length === 1 ? state.connections[0].name : 'Vælg blandt dine gemte forbindelser.';
  if (!verifiedConnection) $('#setup-ai').textContent = $('#setup-connection').value ? 'Gemt opsætning · endnu ikke kontrolleret i denne session.' : 'Tilføj en forbindelse, eller fortsæt uden AI.';
  setupControls();
}
async function setupGit() {
  $('#setup-git-refresh').disabled = true;
  try { const result = await call('setupStatus'); $('#setup-git').textContent = result.git; $('#setup-git-open').hidden = !result.project; }
  finally { $('#setup-git-refresh').disabled = false; }
}
function showSetup(reason = '', fromIntroduction = false) {
  guidedSetup = fromIntroduction; document.body.classList.toggle('setup-guided', fromIntroduction);
  setupActive = true; $('#setup').hidden = false; $('#workspace').hidden = true; $('#onboarding').hidden = true;
  $('#view-title').textContent = 'Opsætning'; $('#setup-reason').textContent = reason; $('#setup-reason').hidden = !reason;
  renderSetup(); setupPage('choice'); action(discoverLocal);
}
function connectionFailed(reason) {
  verifiedConnection = ''; ++setupGeneration; acceptedFingerprint = null; pendingSend = null; setupControls();
  if (state?.connections.some(c => c.id === $('#connection-select').value)) $('#setup-connection').value = $('#connection-select').value;
  recovery = `AI-forbindelsen skal gennemgås: ${reason} Dit projekt og din kladde er bevaret.`;
  if (!running) { showConnectionWarning(recovery); recovery = ''; }
}
async function leaveSetup(useAI) {
  const id = $('#setup-connection').value;
  if (useAI && (!id || verifiedConnection !== id)) return;
  if (useAI) { preferredConnection = id; try { localStorage.setItem('harness.preferredConnection', id); } catch {} }
  autoConnect = useAI;
  ++setupGeneration; ++localDiscoveryGeneration; $('#api-key').value = ''; moveConnectionForm(false);
  guidedSetup = false; completeIntroduction('guided');
  document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true; $('#workspace').hidden = !current; $('#onboarding').hidden = Boolean(current);
  $('#view-title').textContent = current ? 'Arbejdsområde' : 'Projektopstart'; setupControls();
  if (useAI && current) { const saved = $('#connection-select').value === id ? { modelID: $('#model-select').value, routeID: $('#route-select').value } : {}; $('#connection-select').value = id; await loadModels(saved); }
  (current ? $('#prompt') : $('#purpose')).focus();
}
$('#setup-button').onclick = () => showSetup();
$('#setup-local').onclick = () => action(() => leaveSetup(false));
$('#setup-continue').onclick = () => action(() => leaveSetup(true));
$('#setup-manage').onclick = () => $('#connections-button').click();
$('#setup-git-refresh').onclick = () => action(setupGit);
$('#setup-git-open').onclick = () => $('#git-button').click();
$('#setup-connection').onchange = () => { ++setupGeneration; verifiedConnection = ''; $('#setup-ai').textContent = 'Forbindelsen er ikke kontrolleret.'; setupControls(); };
async function testSetupConnection() {
  const id = $('#setup-connection').value, generation = ++setupGeneration;
  verifiedConnection = ''; setupControls(); $('#setup-test').disabled = true; $('#setup-ai').textContent = 'Henter modelkatalog fra den valgte server …';
  try {
    const models = await call('models', id);
    if (generation !== setupGeneration || id !== $('#setup-connection').value) return;
    verifiedConnection = models.length ? id : '';
    const featured = featuredProviders.some(item => item.kind === state.connections.find(c => c.id === id)?.kind);
    $('#setup-ai').textContent = !models.length ? 'Forbindelsen svarer uden modeller. Tjek adgangen hos udbyderen, eller ret oplysningerne.' : featured ? 'Forbindelsen virker. Appen starter med udbyderens eget udgangspunkt, som du kan skifte under skrivefeltet.' : 'Forbindelsen svarer. Du vælger model i projektet.';
    if (models.length) $('#setup-subtitle').textContent = 'Din AI er klar.';
  } catch (error) { if (generation === setupGeneration) $('#setup-ai').textContent = `Kontrollen mislykkedes: ${error.message} Rediger forbindelsen, eller prøv igen.`; }
  finally { if (generation === setupGeneration) setupControls(); }
}
$('#setup-test').onclick = () => action(testSetupConnection);
$('#setup-use-saved').onclick = () => { setupPage('saved'); if (!$('#setup-connection').value && state.connections.length === 1) $('#setup-connection').value = state.connections[0].id; setupControls(); };
$('#setup-advanced').onclick = () => { setupPage('tools'); action(setupGit); };
$('#setup-edit').onclick = () => setupProvider(state.connections.find(c => c.id === $('#setup-connection').value));
$('#setup-local-address').onclick = () => { setupProvider(); $('#provider-other').onclick(); $('#provider-kind').value = 'ollama'; updateProvider(); };
function showAssets(assets) {
  $('#assets').replaceChildren();
  for (const asset of assets) {
    const item = node('li', `${asset.kind === 'logo' ? 'Logo' : 'Reference'}: ${asset.name} `);
    const button = node('button', 'Fjern', 'text-button'); button.type = 'button';
    button.addEventListener('click', () => action(async () => showAssets(await call('removeAsset', asset.id))));
    item.append(button); $('#assets').append(item);
  }
}
function showPreview(url, external = false) {
  if (current) current.previewURL = url;
  $('#preview-stage').hidden = !url; $('#preview').hidden = !url; $('#preview-empty').hidden = Boolean(url);
  $('#preview').setAttribute('sandbox', external ? 'allow-scripts allow-same-origin' : 'allow-scripts');
  if (url) $('#preview').src = url; else $('#preview').removeAttribute('src');
  $('#preview-status').textContent = url ? (external ? 'Tilsluttet lokal server' : 'Lokal forhåndsvisning') : 'Ingen forhåndsvisning';
}
async function displayProject(project) {
  if (!project) return;
  ++modelRequest; recovery = ''; $('#connection-warning').hidden = true; document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true; setupControls();
  activePlan = null; modelCatalog = []; $('#model-shortlist').replaceChildren(); $('#plan-card').hidden = true; $('#run-review').hidden = true; $('#work-mode').value = 'plan'; updateWorkMode();
  current = project; revision = null; acceptedFingerprint = null; roles.clear(); parts.clear(); partTypes.clear();
  $('#project-intro').hidden = false; $('#idea-options').open = false; for (const el of document.querySelectorAll('#idea-options select')) el.value = ''; $('#agent-activity').hidden = true; $('#messages').replaceChildren(); activityGroup = null; $('#approvals').replaceChildren(); $('#prompt').value = '';
  $('#new').removeAttribute('aria-current'); $('#view-title').textContent = 'Arbejdsområde'; $('#active-project').textContent = project.name; $('#active-project').classList.add('active');
  $('#onboarding').hidden = true; $('#workspace').hidden = false; $('#skills-button').disabled = false;
  $('#project-name').textContent = project.name; $('#project-purpose').textContent = project.purpose || 'Eksisterende mappe. Beskriv din opgave i samtalen.'; $('#project-path').textContent = project.root;
  $('#reference-choices').replaceChildren();
  for (const asset of (project.assets || []).filter(a => a.kind === 'reference')) {
    const label = node('label', undefined, 'check-label'); const input = node('input'); input.type = 'checkbox'; input.value = asset.file;
    label.append(input, document.createTextNode(asset.name)); $('#reference-choices').append(label);
  }
  if (!$('#reference-choices').children.length) $('#reference-choices').textContent = 'Ingen referencefiler registreret i projektet.';
  $('#task-dialog .reference-choice').hidden = !(project.assets || []).some(a => a.kind === 'reference');
  showPreview(project.previewURL);
  window.previewServer?.update(project.runtime);
  if (project.warnings?.length) message(project.warnings.join(' '));
  state = project.workbench; $('#connection-select').value = ''; renderConnections(); renderUsage(state.usage);
  const saved = state.projectSettings.selection;
  if (autoConnect && saved && state.connections.some(c => c.id === saved.connectionID)) { $('#connection-select').value = saved.connectionID; await loadModels(saved); }
  else if (autoConnect && state.connections.some(c => c.id === preferredConnection)) { $('#connection-select').value = preferredConnection; await loadModels(); }
  const startup = state.projectSettings.startup;
  const preferredProjectConnection = saved?.connectionID || startup?.connectionID;
  if (!$('#connection-select').value && preferredProjectConnection && state.connections.some(c => c.id === preferredProjectConnection)) $('#connection-select').value = preferredProjectConnection;
  $('#project-startup').textContent = startup ? `Hostingønske: ${hostingLabel(startup.hosting)} · Tests: ${testLabel(startup.tests)}` : 'Ingen opstartsvalg gemt for dette projekt.';
  $('#model-options').open = !$('#model-select').value; $('#start-idea').hidden = false; $('#start-idea').textContent = project.purpose ? 'Forbered første besked' : 'Få hjælp til en plan'; updateModelSummary();
  const history = state.workspace;
  $('#resume-notice').hidden = !history?.messages?.length && !state.historyWarning;
  $('#include-history').checked = false;
  if (history) {
    for (const item of history.messages) appendMessage(item.text, item.role);
    $('#prompt').value = history.draft || '';
    if (history.messages.length || history.draft) $('#work-mode').value = history.mode === 'build' && !history.plan ? 'plan' : history.mode;
    if (history.plan) { activePlan = history.plan; $('#plan-text').textContent = history.plan.text; $('#plan-card').hidden = history.mode !== 'plan'; }
    $('#resume-notice summary').textContent = ['interrupted', 'working'].includes(history.status) ? 'Den forrige opgave blev afbrudt' : 'Tidligere samtale';
    $('#resume-text').textContent = history.status === 'interrupted' || history.status === 'working' ? 'Den forrige opgave blev afbrudt. Gennemgå filerne, før du fortsætter. Intet er genstartet.' : 'Din samtale er hentet fra denne computer. Vælg selv, om den skal medsendes til AI’en.';
    if (history.trimmed) $('#resume-text').textContent += ' Den ældste del af samtalen er udeladt af hensyn til størrelse.';
  }
  if (state.historyWarning) $('#resume-text').textContent = state.historyWarning;
  try { const draft = JSON.parse(localStorage.getItem('harness.chatDraft.' + project.root)); if (draft && typeof draft.text === 'string' && (draft.text || !['working','interrupted'].includes(history?.status))) { $('#prompt').value = draft.text; if (['plan','free'].includes(draft.mode)) $('#work-mode').value = draft.mode; } } catch {}
  if (saved && state.connections.some(c => c.id === saved.connectionID) && !$('#model-select').value) {
    $('#connection-select').value = saved.connectionID; $('#model-select').replaceChildren(option(saved.modelID, saved.modelID));
    if (saved.routeID) { $('#route-row').hidden = false; $('#route-select').replaceChildren(option(saved.routeID, saved.routeID)); }
    updateModelSummary(); $('#model-options').open = false;
  }
  updateWorkMode(); $('#draft-status').textContent = history?.draft ? 'Kladde hentet fra denne computer' : '';
  await refreshRecent();
  $('#project-name').tabIndex = -1; if (!setupActive) $('#project-name').focus();
}
function renderConnections() {
  const previous = $('#connection-select').value;
  $('#connection-select').replaceChildren(option('', 'Vælg forbindelse'));
  $('#saved-connections').replaceChildren();
  for (const connection of state.connections) {
    $('#connection-select').append(option(connection.id, connection.name));
    const row = node('div', undefined, 'saved-connection');
    row.append(node('span', `${connection.name} · ${connection.hasKey ? 'nøgle gemt' : 'uden nøgle'}`));
    for (const [label, actionName] of [['Rediger', 'edit'], ['Test / hent modeller', 'test'], ['Fjern', 'delete']]) {
      const button = node('button', label, 'text-button'); button.type = 'button';
      button.onclick = () => action(async () => {
        if (actionName === 'edit') { $('#connection-id').value = connection.id; $('#provider-kind').value = connection.kind; updateProvider(); $('#connection-name').value = connection.name; $('#base-url').value = connection.baseURL; $('#api-key').value = ''; $('#clear-key').checked = false; }
        if (actionName === 'test') { $('#connection-feedback').textContent = 'Kontrollerer serveren …'; const models = await call('models', connection.id); $('#connection-feedback').textContent = `Serveren svarede med ${models.length} modeller. Modelkald og værktøjsbrug er endnu ikke verificeret.`; }
        if (actionName === 'delete') { state = await call('removeConnection', connection.id); ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections(); if (current && previous === connection.id) connectionFailed('Den valgte forbindelse er fjernet.'); }
      }); row.append(button);
    }
    $('#saved-connections').append(row);
  }
  if (state.connections.some(c => c.id === previous)) $('#connection-select').value = previous;
  else { $('#model-select').replaceChildren(option('', 'Hent modeller fra forbindelsen')); $('#route-row').hidden = true; }
  renderSetup(); renderStartupConnections();
}
// Trin for trin til en nøgle hos de tre udbydere i opsætningen. Knapperne åbner faste sider via hovedprocessen. Kontrolleret 29. september 2026.
const keyGuides = {
  anthropic: {
    steps: [['Opret en konto i Claude Console, Anthropics side for udviklere. Den er ikke det samme som Claude.ai. Anthropic kan spørge til din brug og i nogle tilfælde bede om ID.', 'start', 'Åbn Claude Console'],
      ['Køb kredit under Billing. Du betaler forud med kort.', 'billing', 'Åbn Billing'],
      ['Sæt en månedlig grænse under Spend limits på samme side, så forbruget ikke kan løbe løbsk.'],
      ['Opret en API-nøgle, og kopiér den. Den vises kun én gang.', 'keys', 'Åbn API-nøgler'],
      ['Indsæt nøglen i feltet herunder, og tryk Gem og kontrollér.']],
    cost: 'Vær opmærksom på, at du betaler pr. token gennem denne løsning. Priserne varierer meget afhængigt af opgavens kompleksitet. Du ser prisen for modellen, før noget sendes, og forbruget under skrivefeltet.'
  },
  mistral: {
    steps: [['Opret en konto i Mistral Studio. På mistral.ai hedder det Login → Studio. Gratisplanen kræver ikke kort, men Mistral må bruge data fra gratisplanen til træning.', 'start', 'Åbn Mistral Studio'],
      ['Slå betalt forbrug til, og sæt en månedlig grænse under Billing.', 'billing', 'Åbn Billing'],
      ['Fravælg træning under Privacy.', 'privacy', 'Åbn Privacy'],
      ['Opret en API-nøgle, og kopiér den. Den vises kun én gang.', 'keys', 'Åbn API-nøgler'],
      ['Indsæt nøglen i feltet herunder, og tryk Gem og kontrollér.']],
    cost: 'Vær opmærksom på, at du betaler pr. token gennem denne løsning, når gratisplanens kredit er brugt. Priserne varierer meget afhængigt af opgavens kompleksitet. Du ser prisen for modellen, før noget sendes, og forbruget under skrivefeltet.'
  },
  corti: {
    steps: [['Opret en konto i Corti Console med din arbejdsmail.', 'start', 'Åbn Corti Console'],
      ['Opret et projekt, og vælg regionen EU. Det giver 50 USD i prøvekredit.', 'console', 'Åbn Corti Console'],
      ['Sæt en månedlig grænse under Billing i Corti Console.'],
      ['Hent en API-nøgle under Corti Models, og kopiér den.', 'keys', 'Åbn Corti Models'],
      ['Indsæt nøglen i feltet herunder, og tryk Gem og kontrollér.']],
    cost: 'Vær opmærksom på, at du betaler pr. token gennem denne løsning, når prøvekreditten er brugt. Priserne varierer meget afhængigt af opgavens kompleksitet. Du ser prisen for modellen, før noget sendes, og forbruget under skrivefeltet.'
  }
};
function renderKeyGuide(kind) {
  const guide = keyGuides[kind];
  $('#key-steps').replaceChildren(...(guide?.steps || []).map(([text, page, label]) => {
    const item = node('li', text);
    if (page) { const button = node('button', label, 'text-button'); button.type = 'button'; button.onclick = () => action(() => call('providerAccount', { kind, page })); item.append(' ', button); }
    return item;
  }));
  $('#key-steps').hidden = !guide; $('#key-cost').textContent = guide?.cost || ''; $('#key-cost').hidden = !guide;
  $('#provider-account').hidden = Boolean(guide);
  $('#key-guide-summary').textContent = guide ? 'Har du ikke en nøgle? Sådan får du en' : 'Hvor finder jeg min nøgle?';
}
function updateProvider() {
  const definition = state?.definitions[$('#provider-kind').value]; if (!definition) return;
  const help = { corti: 'Du skal bruge en API-nøgle fra et Corti-projekt i EU. Appen skifter aldrig automatisk til USA eller en anden model.', mistral: 'Du skal bruge en API-nøgle fra Mistral.', anthropic: 'Du skal bruge en API-nøgle fra Anthropic. Et Claude Pro- eller Max-abonnement kan ikke bruges her.', openrouter: 'Brug din OpenRouter-nøgle. Du vælger selv model og den udbyder, der modtager dine data. Gratis modeller er markeret i listen.', zen: 'Brug en nøgle fra OpenCode Zen. Zens gratis modeller virker ikke i AI Harness, fordi Zen kun giver gratis adgang fra OpenCodes egne programmer. Zens modeller kører i USA.', ollama: 'Forbind til en Ollama-server, som allerede kører. Kontrollér adressen nedenfor; appen installerer ikke modeller.', compatible: 'Brug adressen fra din organisation eller egen modelserver, fx DGX Spark. Appen ændrer ikke serveren eller Tailscale.' };
  $('#provider-help').textContent = help[$('#provider-kind').value]; renderKeyGuide($('#provider-kind').value);
  $('.key-guide').hidden = ['ollama', 'compatible'].includes($('#provider-kind').value);
  $('#base-url').value = definition.baseURL; $('#connection-advanced').open = ['ollama', 'compatible'].includes($('#provider-kind').value); $('#base-url').readOnly = !['ollama', 'compatible'].includes($('#provider-kind').value);
  if (!$('#connection-id').value) $('#connection-name').value = definition.name;
}
async function loadModels(saved = {}) {
  const id = $('#connection-select').value; const generation = ++modelRequest; acceptedFingerprint = null;
  modelCatalog = []; $('#model-shortlist').replaceChildren(); $('#model-evidence').textContent = '';
  $('#model-select').replaceChildren(option('', id ? 'Henter modeller …' : 'Vælg en forbindelse først')); $('#route-row').hidden = true;
  updateModelSummary();
  if (!id) return;
  try {
    const models = await call('models', id); if (generation !== modelRequest) return;
    modelCatalog = models; $('#model-search').value = ''; renderShortlist();
    $('#model-select').replaceChildren(option('', 'Vælg model'));
    for (const model of models) {
      const free = model.price && model.price.prompt != null && model.price.completion != null && Number(model.price.prompt) === 0 && Number(model.price.completion) === 0;
      $('#model-select').append(option(model.id, `${model.name}${free ? ' · gratis*' : ''}`));
    }
    if (saved.modelID && models.some(m => m.id === saved.modelID)) { $('#model-select').value = saved.modelID; await loadRoutes(saved.routeID); }
    else preselectRecommended(id);
    markChosenModel(); updateModelSummary(); $('#connection-warning').hidden = true; $('#connection-status').textContent = state.connections.find(c => c.id === id)?.name || 'Ingen model valgt';
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
}
function selection() { return { includeHistory: $('#include-history').checked, mode: $('#work-mode').value, planID: activePlan?.id, connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-select').value, references: [...document.querySelectorAll('#reference-choices input:checked')].map(el => el.value) }; }
const detailLabels = { mode: 'Arbejdsmåde', conversation: 'Tidligere samtale, der sendes', projectGuidance: 'Appens vejledning om projektvalg og design', planContext: 'Plan og afklaring, der sendes', projectChoices: 'Projektets opstartsvalg', connection: 'Forbindelse', model: 'Model', endpoint: 'Serveradresse', recipients: 'Modtagere', region: 'Behandlingssted', retention: 'Opbevaring', training: 'Brug til træning', price: 'Pris og gratisbegrænsninger', capabilities: 'Modelmuligheder', material: 'Hvad sendes?', references: 'Udvalgte private referencer', skills: 'Aktive skills', localStorage: 'Lokal historik og yderligere netværk', security: 'Forbindelsens sikkerhed', source: 'Kilde', checkedAt: 'Dokumentation kontrolleret', evidence: 'Grundlag' };
// Kort resumé i almindeligt dansk. Alle oplysninger ligger under "Se alle oplysninger".
function showData(data, canSend) {
  $('#data-summary').replaceChildren();
  const unknown = [data.region, data.retention, data.training, data.price].filter(v => /ukendt|ikke verificeret/i.test(String(v)));
  $('#data-warning').hidden = !unknown.length;
  $('#data-warning').textContent = 'Nogle vilkår er ukendte for denne forbindelse. Del kun det, du er sikker på, at du må dele.';
  $('#data-lead').textContent = `Din besked, planen og de projektfiler, AI’en læser, sendes til ${data.provider || data.connection}.`;
  $('#data-material-text').textContent = data.material;
  $('#data-history-text').textContent = data.historyIncluded ? 'Tidligere samtale medsendes efter dit tilvalg. Se det præcise indhold under detaljerne.' : 'Gemt samtale fra tidligere sessioner medsendes ikke særskilt. Den aktive samtale og en valgt plan med afklaring indgår stadig.';
  for (const [label, value] of Object.entries({ 'AI': data.modelName ? `${data.modelName} · ${data.provider || data.connection}` : `${data.model} · ${data.connection}`, 'Hvor': data.regionShort || data.region, 'Træning': data.trainingShort || data.training, 'Pris': data.priceShort || data.price })) {
    $('#data-summary').append(node('dt', label), node('dd', Array.isArray(value) ? value.join(', ') : value));
  }
  $('#data-details').replaceChildren();
  for (const [key, label] of Object.entries(detailLabels)) { $('#data-details').append(node('dt', label), node('dd', key === 'mode' ? ({ plan: 'Afklar og planlæg', build: 'Byg den valgte plan', free: 'Arbejd direkte' }[data[key]]) : Array.isArray(data[key]) ? data[key].join(', ') || 'Ingen' : data[key] && typeof data[key] === 'object' ? JSON.stringify(data[key], null, 2) : data[key] || 'Ingen')); }
  $('#accept-send').hidden = !canSend; $('#data-dialog').showModal();
}
async function sendNow(data, text) {
  $('#model-options').open = false; $('#task-dialog').close(); activityGroup = null; $('#connection-warning').hidden = true; $('#data-dialog').close(); setRunning(true, 'Starter agent …');
  if ($('#work-mode').value === 'free') { activePlan = null; $('#plan-card').hidden = true; }
  $('#run-review').hidden = true; if ($('#work-mode').value === 'build') $('#plan-card').hidden = true; if ($('#work-mode').value === 'plan') { activePlan = null; $('#plan-card').hidden = true; }
  lastSentText = text; appendMessage(text, 'user'); $('#prompt').value = ''; await saveChatDraft();
  try { await call('send', { text, fingerprint: data.fingerprint }); acceptedFingerprint = data.fingerprint; }
  catch (error) { $('#prompt').value = text; await saveChatDraft(); setRunning(false, 'Fejl'); appendMessage(error.message, 'error'); connectionFailed(error.message); throw error; }
}
function setRunning(value, status) {
  running = value; $('#agent-activity').hidden = !value; if (value) $('#agent-activity').textContent = $('#work-mode').value === 'plan' ? 'AI’en udarbejder et forslag. Projektfilerne kan ikke ændres i denne arbejdsmåde.' : 'AI’en arbejder på din opgave. Du kan stoppe den herunder.'; $('#run-status').textContent = status; $('#send').disabled = value; $('#stop').hidden = !value;
  for (const selector of ['#model-chip', '#new-conversation', '#work-mode', '#build-plan', '#revise-plan', '#start-idea', '#model-load', '#model-search', '#connection-select', '#model-select', '#route-select', '#new', '#open', '#connections-button', '#skills-button', '#git-button', '#publish-button', '#setup-hosting', '#deploy-button', '#intro-button']) $(selector).disabled = value;
  for (const button of document.querySelectorAll('#model-shortlist button, #recent-projects button')) button.disabled = value;
  $('#include-history').disabled = value;
  setupControls();
  if (!value && recovery) { const reason = recovery; recovery = ''; showConnectionWarning(reason); }
}
function showSkill() {
  const skill = skillList.find(s => s.id === $('#skill-select').value); if (!skill) return;
  $('#skill-content').value = skill.content; $('#skill-enabled').checked = skill.enabled; $('#skill-source').textContent = `${skill.source} · ${skill.customized ? 'lokal tilpasning' : 'fælles version'}`;
}
const toolLabels = { read: 'Læs fil', edit: 'Rediger fil', write: 'Skriv fil', bash: 'Kør kommando', webfetch: 'Læs hjemmeside', websearch: 'Søg på nettet', glob: 'Find filer', grep: 'Søg i filer', external_directory: 'Adgang uden for projektet' };
const toolStatuses = { pending: 'Venter', running: 'I gang', completed: 'Afsluttet', error: 'Mislykkedes' };
function partElement(id, role) {
  if (!parts.has(id)) {
    if (role === 'tool') {
      if (!activityGroup) { activityGroup = node('details', undefined, 'activity-log'); activityGroup.append(node('summary', 'Vis aktivitet')); $('#messages').append(activityGroup); }
      const item = node('div', '', 'chat-message tool'); activityGroup.append(item); parts.set(id, item);
      activityGroup.querySelector('summary').textContent = `Vis aktivitet (${activityGroup.querySelectorAll('.tool').length})`;
    } else parts.set(id, appendMessage('', role));
  }
  return parts.get(id);
}
window.harness.onEvent(event => {
  const p = event.properties || {};
  if (event.type === 'preview.runtime') return window.previewServer?.update(event);
  if (event.type === 'usage') return renderUsage(event.usage);
  if (event.type === 'history.error') { $('#draft-status').textContent = event.message; message(event.message, true); }
  if (event.type === 'plan.ready') { activePlan = event.plan; $('#plan-card details').open = false; $('#plan-text').textContent = event.plan.text; $('#plan-card').hidden = false; requestAnimationFrame(() => $('#plan-card').scrollIntoView({ block: 'nearest' })); }
  if (event.type === 'run.review') renderRunReview(event);
  if (event.type === 'git.checkpoint') { appendMessage(event.message, 'system'); return; }
  if (event.type === 'preview.ready') { showPreview(event.url); window.previewServer?.refresh(); return; }
  if (event.type === 'session.new') { roles.clear(); parts.clear(); partTypes.clear(); partElement('session-' + Date.now(), 'tool').textContent = 'Ny modelsession. Valgt plan og afklaring følger med; øvrig gemt samtale kræver tilvalg.'; }
  if (event.type === 'run.status') {
    const active = ['starting', 'working'].includes(event.status);
    const statuses = { starting: 'Starter agent …', working: 'Arbejder …', idle: 'Klar', error: 'Fejl', stopped: 'Stoppet' };
    setRunning(active, statuses[event.status] || event.status);
    if (['stopped', 'error'].includes(event.status)) {
      if (!$('#prompt').value) $('#prompt').value = lastSentText;
      activePlan = null; $('#plan-card').hidden = true;
      if ($('#work-mode').value === 'build') { $('#work-mode').value = 'plan'; updateWorkMode(); }
    }
    if (!active) { $('#approvals').replaceChildren(); saveChatDraft(); }
  }
  if (event.type === 'message.updated') roles.set(p.info.id, p.info.role);
  if (event.type === 'message.part.updated') {
    const part = p.part;
    partTypes.set(part.id, part.type);
    if (roles.get(part.messageID) === 'user') return;
    if (part.type === 'text') partElement(part.id, 'assistant').textContent = part.text;
    if (part.type === 'tool' && running && ['pending', 'running'].includes(part.state?.status)) $('#agent-activity').textContent = `${toolLabels[part.tool] || 'Værktøjshandling'} · ${toolStatuses[part.state.status]}`;
    if (part.type === 'tool') partElement(part.id, 'tool').textContent = `${toolLabels[part.tool] || part.tool} · ${toolStatuses[part.state?.status] || part.state?.status || ''}${part.state?.title ? '\n' + part.state.title : ''}`;
  }
  if (event.type === 'message.part.delta' && p.field === 'text' && partTypes.get(p.partID) === 'text' && roles.get(p.messageID) !== 'user') partElement(p.partID, 'assistant').textContent += p.delta;
  if (event.type === 'permission.auto') { partElement('auto-' + Date.now() + Math.random(), 'tool').textContent = `Rediger fil · tilladt for denne opgave\n${event.file}`; return; }
  if (event.type === 'permission.asked') {
    $('#agent-activity').textContent = 'Venter på din godkendelse. Gennemgå handlingen i samtalen.';
    const box = node('section', undefined, 'approval'); box.dataset.id = p.id;
    const target = approvalTarget(p);
    const explanation = approvalExplanation(p, target);
    box.append(node('strong', explanation.title), node('p', explanation.effect));
    if (target.text) box.append(node('p', target.text, 'action-target'));
    if (p.metadata?.description) box.append(node('p', `AI’ens begrundelse: ${p.metadata.description}`, 'hint'));
    const details = node('details'); details.append(node('summary', 'Tekniske detaljer'), node('pre', JSON.stringify({ paths: p.patterns, details: p.metadata }, null, 2))); box.append(details);
    // Filændringer i projektet kan tillades for resten af opgaven. Alt andet spørger hver gang.
    const choices = target.projectFile ? [['Afvis', false], ['Kun denne fil', true], ['Tillad for denne opgave', true, 'task']] : [['Afvis', false], ['Tillad én gang', true]];
    const row = node('div', undefined, 'approval-actions');
    for (const [label, allow, scope] of choices) {
      const button = node('button', label, scope ? 'primary' : undefined); button.type = 'button';
      button.onclick = () => action(async () => { await call('reply', { id: p.id, allow, scope }); box.remove(); $('#agent-activity').textContent = !allow ? 'Handlingen er afvist. Afventer AI’en …' : scope ? 'Filændringer i projektet er tilladt, indtil opgaven er færdig.' : 'Godkendelsen er sendt. Afventer AI’en …'; });
      row.append(button);
    }
    box.append(row); $('#approvals').append(box); box.scrollIntoView({ block: 'nearest' });
  }
  if (event.type === 'permission.replied') for (const box of $('#approvals').children) if (box.dataset.id === p.requestID) box.remove();
  if (event.type === 'question.asked') {
    $('#agent-activity').textContent = 'AI’en har et spørgsmål til dig. Svar i samtalen.';
    const form = node('form', undefined, 'approval'); const fields = [];
    for (const question of p.questions) { form.append(node('p', question.question)); if (question.options?.length) form.append(node('p', question.options.map(o => `${o.label}: ${o.description}`).join('\n'), 'hint')); const input = node('input'); input.required = true; input.setAttribute('aria-label', question.question); form.append(input); fields.push(input); }
    const submit = node('button', 'Svar'); submit.type = 'submit'; form.append(submit); form.onsubmit = event => { event.preventDefault(); action(async () => { await call('question', { id: p.id, answers: fields.map(f => [f.value]) }); form.remove(); $('#agent-activity').textContent = 'Dit svar er sendt. Afventer AI’en …'; }); }; $('#approvals').append(form);
  }
  if (['engine.error', 'session.error'].includes(event.type)) { if (!$('#prompt').value) $('#prompt').value = lastSentText; const reason = event.message || p.error?.data?.message || p.error?.message || 'Modelkaldet mislykkedes. Kontrollér forbindelsen og kvoten.'; appendMessage(reason, 'error'); connectionFailed(reason); }
});
$('#color').addEventListener('input', event => { $('#color-value').value = event.target.value; });
for (const kind of ['logo', 'reference']) $(`#${kind}`).onclick = () => action(async () => showAssets(await call('chooseAssets', kind)));
$('#open').onclick = () => action(async () => { await saveChatDraft(); await displayProject(await call('openProject')); });
$('#new').onclick = () => action(async () => { await saveChatDraft(); document.body.classList.remove('setup-guided'); setupActive = false; $('#setup').hidden = true; ++modelRequest; recovery = ''; $('#connection-warning').hidden = true; await call('newProject'); current = null; revision = null; acceptedFingerprint = null; showPreview(null); $('#workspace').hidden = true; $('#onboarding').hidden = false; $('#skills-button').disabled = true; $('#new').setAttribute('aria-current', 'page'); $('#view-title').textContent = 'Projektopstart'; $('#active-project').textContent = 'Intet projekt åbent'; $('#active-project').classList.remove('active'); $('#create-form').reset(); $('#color-value').value = $('#color').value; showAssets([]); await loadStartup(); nameTouched = false; saveIdeaDraft(); $('#purpose').focus(); });
$('#create-form').onsubmit = event => { event.preventDefault(); action(async () => { $('#create').disabled = true; try { const created = await call('createProject', { name: $('#name').value, purpose: $('#purpose').value, color: $('#color').value, links: $('#links').value.split('\n').map(line => line.trim()).filter(Boolean), tests: $('#tests').value, startup: startupValues(), remember: $('#remember-startup').checked }); if (created) { await displayProject(created); clearIdeaDraft(); $('#start-idea').click(); } } finally { $('#create').disabled = false; } }); };
$('#connections-button').onclick = () => action(async () => { if (setupActive && setupStep === 'provider') setupPage('tools'); moveConnectionForm(false); state = await call('connectionState'); renderConnections(); updateProvider(); $('#connections-dialog').showModal(); });
$('#provider-kind').onchange = updateProvider;
$('#reset-connection').onclick = () => { $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); };
$('#connection-form').onsubmit = event => {
  event.preventDefault(); action(async () => {
    $('#save-connection').disabled = true;
    const generation = setupGeneration, guided = setupActive && setupStep === 'provider';
    const previousIDs = new Set(state.connections.map(c => c.id));
    const input = { id: $('#connection-id').value || undefined, kind: $('#provider-kind').value, name: $('#connection-name').value, baseURL: $('#base-url').value, apiKey: $('#api-key').value, clearKey: $('#clear-key').checked };
    $('#api-key').value = '';
    try {
      state = await call('saveConnection', input);
      const stillGuided = guided && setupActive && setupStep === 'provider' && generation === setupGeneration;
      ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections();
      const selected = state.connections.find(c => c.id === input.id || !previousIDs.has(c.id));
      if (selected) $('#setup-connection').value = selected.id;
      setupControls(); $('#connection-feedback').textContent = 'Forbindelsen er gemt. Brug Test / hent modeller for at kontrollere serveren.';
      $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider();
      if (stillGuided && selected) { setupPage('saved'); await testSetupConnection(); }
    } catch (error) {
      $('#connection-feedback').textContent = error.message;
    } finally { $('#save-connection').disabled = false; }
  });
};
$('#connection-select').onchange = () => { autoConnect = true; action(() => loadModels()); }; $('#model-select').onchange = () => { updateModelSummary(); action(() => loadRoutes()); };
$('#data-button').onclick = () => action(async () => showData(await call('prepare', selection()), false));
$('#chat-form').onsubmit = event => { event.preventDefault(); action(async () => { const text = $('#prompt').value.trim(); if (!text || running) return; if (!$('#connection-select').value) { openTaskSettings(); showConnectionWarning('Forbind en AI for at sende beskeden. Din kladde er bevaret.'); return; } if (!$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { openTaskSettings(); message('Vælg model og eventuel modeludbyder.', true); return; } $('#send').disabled = true; try { const data = await call('prepare', selection()); if (data.accepted || data.fingerprint === acceptedFingerprint) await sendNow(data, text); else { pendingSend = { data, text }; showData(data, true); } } catch (error) { connectionFailed(error.message); throw error; } finally { $('#send').disabled = running; } }); };
$('#accept-send').onclick = () => action(async () => { const pending = pendingSend; pendingSend = null; if (pending) await sendNow(pending.data, pending.text); });
$('#stop').onclick = () => action(() => call('stop'));
$('#skills-button').onclick = () => action(async () => { skillList = await call('skills'); $('#skill-select').replaceChildren(...skillList.map(s => option(s.id, s.id))); showSkill(); $('#skills-dialog').showModal(); });
$('#skill-select').onchange = showSkill;
for (const reset of [true, false]) $(reset ? '#skill-reset' : '#skill-save').onclick = () => action(async () => { const id = $('#skill-select').value; skillList = await call('saveSkill', { id, content: $('#skill-content').value, enabled: $('#skill-enabled').checked, reset }); acceptedFingerprint = null; showSkill(); message('Skill-valget er gemt for dette projekt. Det træder i kraft i næste modelsession.'); });
$('#changes-button').onclick = () => action(async () => { const result = await call('changes'); $('#changes-list').replaceChildren(); if (!result.files.length) $('#changes-list').append(node('p', 'Ingen tekstændringer registreret siden første besked.')); for (const file of result.files) { const detail = node('details'); detail.append(node('summary', file.file), node('h3', 'Før'), node('pre', file.before ?? '(ny fil)'), node('h3', 'Efter'), node('pre', file.after ?? '(slettet fil)')); $('#changes-list').append(detail); } if (result.skipped) $('#changes-list').append(node('p', `${result.skipped} filregistreringer blev udeladt af hensyn til størrelse eller filtype.`)); $('#changes-dialog').showModal(); });
$('#attach-preview').onclick = () => window.previewServer.open();
$('#preview-form').onsubmit = event => { event.preventDefault(); action(async () => { const url = await call('attachPreview', $('#preview-url').value); showPreview(url, true); $('#preview-dialog').close(); }); };
$('#static-preview').onclick = () => action(async () => { showPreview(await call('attachPreview', '')); $('#preview-dialog').close(); });
$('#refresh').onclick = () => { if (current?.previewURL) $('#preview').src = current.previewURL; };
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => document.getElementById(button.dataset.close).close();
$('#connections-dialog').addEventListener('close', () => { $('#api-key').value = ''; });
setInterval(async () => { if (!current || polling) return; polling = true; const project = current; try { const next = await call('revision'); if (current !== project || !next) return; if (revision && next !== revision) $('#preview').src = current.previewURL; revision = next; $('#preview-status').textContent = 'Lokal forhåndsvisning'; } catch { $('#preview-status').textContent = 'Kan ikke læse siden – kontrollér projektfilerne'; } finally { polling = false; } }, 1500);
action(async () => { $('#create').disabled = true; try { state = await call('connectionState'); renderConnections(); updateProvider(); await loadDesigns(); await loadStartup(); renderLocation(await call('projectLocation')); restoreIdeaDraft(); await refreshRecent(); setupControls(); for (const id of ['#welcome-build', '#welcome-example', '#welcome-open']) $(id).disabled = false; if ($('#welcome-dialog').open) $('#welcome-title').focus(); else $('#purpose').focus(); } finally { $('#create').disabled = false; } });

async function loadDesigns() { const designs = await call('listDesigns'); $('#design-select').replaceChildren(option('', 'Vælg en tidligere gemt pakke'), ...designs.map(d => option(d.id, `${d.name} · ${d.files} filer`))); }
$('#save-design').onclick = () => action(async () => { await call('saveDesign', { name: $('#design-name').value, color: $('#color').value, links: $('#links').value.split('\n').map(s => s.trim()).filter(Boolean) }); await loadDesigns(); message('Designpakken er gemt lokalt og kan vælges i andre projekter.'); });
$('#design-select').onchange = () => action(async () => { updateStartupSummary(); if (!$('#design-select').value) { await clearStartupDesign(); return; } const design = await call('applyDesign', $('#design-select').value); $('#color').value = design.color; $('#color-value').value = design.color; $('#links').value = design.links.join('\n'); showAssets(design.assets); updateStartupSummary(); });


let gitReview = null, restoreReview = null;
async function reviewRestoration(input) {
  restoreReview = null; $('#restore-confirm').disabled = true; $('#restore-files').replaceChildren(); $('#restore-feedback').textContent = ''; $('#restore-summary').textContent = 'Henter filerne fra versionen …';
  $('#restore-dialog').showModal();
  restoreReview = await call('restoreReview', input);
  $('#restore-title').textContent = restoreReview.undo ? 'Kopien før sidste gendannelse' : 'Gennemgå gendannelse';
  $('#restore-summary').textContent = `${restoreReview.files.length} filer berøres. ${restoreReview.untracked} filer uden for historikken bevares.`;
  for (const file of restoreReview.files) {
    const row = node('details'); row.append(node('summary', `${file.action}: ${file.file}`));
    if (file.binary) row.append(node('p', 'Binær fil. Kontrollér billedet eller skrifttypen efter gendannelse.'));
    else row.append(node('h4', 'Nu'), node('pre', file.before ?? '(findes ikke)'), node('h4', 'Efter gendannelse'), node('pre', file.after ?? '(slettes)'));
    $('#restore-files').append(row);
  }
  $('#restore-confirm').disabled = !restoreReview.files.length;
  if (!restoreReview.files.length) $('#restore-feedback').textContent = 'Filerne svarer allerede til den valgte version.';
}
$('#restore-undo').onclick = () => action(() => reviewRestoration({ undo: true }));
$('#restore-confirm').onclick = () => action(async () => {
  if (!restoreReview) return;
  const token = restoreReview.token; restoreReview = null; $('#restore-confirm').disabled = true;
  const result = await call('restoreVersion', token);
  await displayProject(result.project); await loadGit();
  $('#restore-dialog').close();
  $('#git-feedback').textContent = result.error || `${result.restored.files} ${result.restored.files === 1 ? 'fil er' : 'filer er'} gendannet. Gennemse forhåndsvisningen. Ændringerne er endnu ikke gemt som en ny version.`;
});
async function loadGitReview() {
  gitReview = null; $('#git-save').disabled = true; $('#git-files').replaceChildren();
  gitReview = await call('gitReview');
  for (const file of gitReview.files) {
    const row = node('section'); const label = node('label', undefined, 'check-label'); const input = node('input');
    input.type = 'checkbox'; input.value = file.file; input.disabled = Boolean(file.blocked);
    label.append(input, document.createTextNode(`${file.status} · ${file.file}`)); row.append(label);
    if (file.blocked) row.append(node('p', file.blocked, 'hint'));
    else if (file.binary) row.append(node('p', 'Binær billed- eller skrifttypefil. Indholdet vises ikke her; kontrollér filen før tilvalg.', 'hint'));
    else { const details = node('details'); details.append(node('summary', 'Se indhold før og efter'), node('h4', 'Før'), node('pre', file.before ?? '(ny fil)'), node('h4', 'Efter'), node('pre', file.text ?? '(slettet fil)')); row.append(details); }
    input.onchange = () => { $('#git-save').disabled = !$('#git-files input:checked'); }; $('#git-files').append(row);
  }
  if (!gitReview.files.length) $('#git-files').append(node('p', 'Ingen ændringer at gemme.'));
}
async function loadGit() {
  $('#git-dialog .dialog-notice')?.remove();
  $('#git-refresh').disabled = true; $('#git-identity').hidden = true;
  $('#git-auto').disabled = true; $('#git-history').replaceChildren(); $('#restore-undo').hidden = true;
  try {
  gitReview = null; $('#git-form').hidden = true; $('#git-init').hidden = true; $('#git-settings').hidden = true;
  const result = await call('gitStatus');
  $('#git-summary').textContent = result.block || `Branch: ${result.branch} · ${result.changes} ændrede filer · ${result.identity.name} <${result.identity.email}>`;
  $('#git-init').hidden = result.initialized;
  $('#git-identity').hidden = !result.initialized || result.wrongRoot || Boolean(result.identity?.name && result.identity?.email);
  $('#git-name').value = result.identity?.name || ''; $('#git-email').value = result.identity?.email || '';
  $('#git-name').readOnly = Boolean(result.identity?.name); $('#git-email').readOnly = Boolean(result.identity?.email);
  $('#git-settings').hidden = !result.initialized || result.wrongRoot;
  $('#git-auto').checked = result.autoCheckpoint;
  if (result.initialized && !result.block) { $('#git-form').hidden = false; await loadGitReview(); }
  $('#git-history').replaceChildren(...result.history.map(item => { const row = node('li'); const button = node('button', `${item.message} · ${item.id}`); button.disabled = Boolean(result.block); button.title = 'Gennemgå denne version før gendannelse'; button.onclick = () => action(() => reviewRestoration({ commit: item.commit })); row.append(button); return row; }));
  $('#restore-undo').hidden = !result.restoration; $('#restore-undo').disabled = Boolean(result.block);
  if (result.restoration && ['failed', 'prepared', 'applying'].includes(result.restoration.state)) $('#git-feedback').textContent = 'Sidste gendannelse blev afbrudt. Gennemgå kopien for at genskabe filerne fra før gendannelsen.';
  if (!result.history.length) $('#git-history').append(node('li', 'Ingen gemte versioner endnu.'));
  } finally { $('#git-auto').disabled = false; $('#git-refresh').disabled = false; }
}
$('#git-button').onclick = () => action(async () => { $('#git-feedback').textContent = ''; $('#git-dialog').showModal(); await loadGit(); });
$('#git-init').onclick = () => action(async () => { $('#git-init').disabled = true; try { await call('gitInit'); await loadGit(); } finally { $('#git-init').disabled = false; } });
$('#git-refresh').onclick = () => action(loadGit);
$('#git-auto').onchange = () => action(async () => { const selected = $('#git-auto').checked; try { await call('gitAutomatic', selected); $('#git-feedback').textContent = selected ? 'Automatiske lokale checkpoints er slået til for dette projekt.' : 'Automatiske checkpoints er slået fra.'; } catch (error) { $('#git-auto').checked = !selected; throw error; } });
$('#git-form').onsubmit = event => { event.preventDefault(); action(async () => {
  if (!gitReview) return;
  const input = { token: gitReview.token, message: $('#git-message').value, files: [...document.querySelectorAll('#git-files input:checked')].map(el => el.value) };
  gitReview = null; $('#git-save').disabled = true; $('#git-auto').disabled = true;
  try { const result = await call('gitCommit', input); $('#git-feedback').textContent = `Version ${result.head.slice(0, 8)} er gemt lokalt. Intet er pushet.`; $('#git-message').value = ''; }
  finally { await loadGit(); }
}); };

// Enkel adgang uden at skjule datagodkendelse eller ændre model automatisk.
// Under skrivefeltet står altid den aktive model, udbyderen og indsatsen, ligesom i Claude Code.
function updateModelSummary() {
  const model = $('#model-select');
  const connection = state?.connections.find(c => c.id === $('#connection-select').value);
  const provider = state?.definitions?.[connection?.kind]?.provider || connection?.name || '';
  const effort = model.value && window.ModelAdvice.effort(connection?.kind, model.value);
  const label = model.value ? [model.selectedOptions[0].textContent, provider, effort && `indsats ${effort}`].filter(Boolean).join(' · ') : 'Vælg AI';
  $('#model-summary').textContent = model.value ? model.selectedOptions[0].textContent : 'Vælg din AI';
  $('#model-chip').textContent = label;
  $('#model-chip').title = effort ? `Indsats ${effort} er udbyderens standard for modellen. Klik for at skifte model.` : 'Klik for at skifte model eller forbindelse.';
  $('#connection-status').textContent = model.value ? (state?.connections.find(c => c.id === $('#connection-select').value)?.name || 'Valgt forbindelse') + ' · ' + model.value : 'Ingen model valgt';
}
// Forbruget i samtalen: tokens ind og ud og en anslået pris ud fra udbyderens prisliste. Det faktiske forbrug står hos udbyderen.
const tokenCount = value => Math.round(value).toLocaleString('da-DK');
function renderUsage(usage) {
  const target = $('#usage-status');
  if (!usage || !usage.calls) { target.textContent = 'Intet forbrug i denne samtale endnu'; target.title = ''; return; }
  const input = usage.input + usage.cacheRead + usage.cacheWrite;
  const price = usage.unpriced === usage.calls ? 'pris ukendt' : usage.cost < 0.01 ? 'under 0,01 USD' : `ca. ${usage.cost.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD${usage.unpriced ? ' + ukendt' : ''}`;
  target.textContent = `Denne samtale: ${tokenCount(input)} tokens ind · ${tokenCount(usage.output + usage.reasoning)} ud · ${price}`;
  target.title = `${usage.calls} modelkald. Ind: ${tokenCount(usage.input)} nye, ${tokenCount(usage.cacheRead)} fra cache og ${tokenCount(usage.cacheWrite)} skrevet til cache. Ud: ${tokenCount(usage.output)} svar og ${tokenCount(usage.reasoning)} ræsonnement. Prisen er et overslag ud fra udbyderens listepris og kan afvige fra din faktura; se det faktiske forbrug hos udbyderen.`;
}
function showConnectionWarning(reason) {
  $('#connection-warning-text').textContent = reason;
  $('#connection-warning').hidden = false;
  if (!current) showSetup(reason);
}
$('#repair-connection').onclick = () => showSetup($('#connection-warning-text').textContent);
$('#dismiss-connection').onclick = () => { $('#connection-warning').hidden = true; $('#prompt').focus(); };
$('#model-manage').onclick = () => $('#connections-button').click();
$('#start-idea').onclick = () => {
  if (running) return;
  if ($('#prompt').value.trim()) { message('Din kladde er bevaret. Send eller ryd den, før du forbereder en ny besked.'); $('#prompt').focus(); return; }
  const choices = [['idea-platform', 'Platform'], ['idea-data', 'Data'], ['idea-ui', 'Brugerflade'], ['idea-design', 'Designværktøjer'], ['idea-backend', 'Backend']]
    .filter(([id]) => $(`#${id}`).value).map(([id, label]) => `${label}: ${$(`#${id}`).value}`);
  $('#work-mode').value = 'plan'; updateWorkMode();
  $('#prompt').value = `${current?.purpose || '[beskriv din idé her]'}${choices.length ? '\n\nMine ønsker:\n' + choices.join('\n') : ''}`;
  saveChatDraft(); $('#prompt').focus();
};
$('#model-select').addEventListener('change', updateModelSummary);

$('#model-done').onclick = () => { if (!$('#connection-select').value || !$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { message('Vælg en forbindelse, model og eventuel udbyder først.', true); return; } updateModelSummary(); $('#model-options').open = false; $('#task-dialog').close(); $('#prompt').focus(); };

function hostingLabel(value) { return ({ vercel: 'Vercel', azure: 'Azure', own: 'Egen løsning' })[value] || 'Beslut senere'; }
function testLabel(value) { return ({ manuel: 'Manuel gennemgang', automatiske: 'Automatiske tests', senere: 'Beslut senere' })[value] || 'Beslut senere'; }
function startupValues() { return { hosting: $('#startup-hosting').value, connectionID: $('#startup-connection').value, designID: $('#design-select').value, tests: $('#tests').value }; }
function renderStartupConnections() {
  const previous = $('#startup-connection').value;
  $('#startup-connection').replaceChildren(option('', 'Beslut senere'), ...(state?.connections || []).map(c => option(c.id, c.name)));
  if (state?.connections.some(c => c.id === previous)) $('#startup-connection').value = previous;
  updateStartupSummary();
}
function updateStartupSummary() {
  const values = startupValues();
  const connection = state?.connections.find(c => c.id === values.connectionID)?.name || 'AI vælges senere';
  const design = values.designID ? $('#design-select').selectedOptions[0]?.textContent : 'Intet design valgt';
  $('#startup-summary').textContent = `${connection} · ${hostingLabel(values.hosting)} · ${design} · ${testLabel(values.tests)}`;
  const chosen = values.connectionID || values.designID || values.hosting || values.tests !== 'senere';
  $('#project-options-summary').textContent = chosen ? 'Flere valg · dine standardvalg bruges' : 'Flere valg · valgfrit';
}
async function clearStartupDesign() {
  showAssets(await call('clearAssets')); $('#design-select').value = ''; $('#color').value = '#326556'; $('#color-value').value = '#326556'; $('#links').value = ''; updateStartupSummary();
}
async function loadStartup() {
  $('#create').disabled = true;
  try {
  const result = await call('preferencesGet');
  renderStartupConnections();
  $('#startup-hosting').value = result.values.hosting; $('#startup-connection').value = result.values.connectionID; $('#tests').value = result.values.tests; $('#design-select').value = result.values.designID;
  $('#remember-startup').checked = false; $('#startup-warning').textContent = result.warnings.join(' ');
  if (result.values.designID) {
    try { const design = await call('applyDesign', result.values.designID); $('#color').value = design.color; $('#color-value').value = design.color; $('#links').value = design.links.join('\n'); showAssets(design.assets); }
    catch { await clearStartupDesign(); $('#startup-warning').textContent = 'Designpakken kunne ikke indlæses. Vælg en anden, eller fortsæt uden design.'; }
  }
  for (const selector of ['#project-options', '#startup-options', '#design-options', '#onboarding .advanced']) $(selector).open = false;
  updateStartupSummary();
  } finally { $('#create').disabled = false; }
}
$('#startup-customize').onclick = () => { $('#startup-options').open = true; $('#startup-connection').focus(); };
$('#startup-skip').onclick = () => action(async () => { await clearStartupDesign(); $('#startup-hosting').value = ''; $('#startup-connection').value = ''; $('#tests').value = 'senere'; $('#remember-startup').checked = false; $('#startup-warning').textContent = 'Valgene er sprunget over for dette projekt. Dine gemte standarder er bevaret.'; updateStartupSummary(); });
$('#forget-startup').onclick = () => action(async () => { await call('preferencesSave', { hosting: '', connectionID: '', designID: '', tests: 'senere' }); $('#startup-warning').textContent = 'Standarderne er glemt. Valgene for dette projekt er bevaret.'; });
for (const selector of ['#startup-hosting', '#startup-connection', '#tests']) $(selector).addEventListener('change', updateStartupSummary);
$('#model-load').onclick = () => action(() => loadModels(state?.projectSettings.selection?.connectionID === $('#connection-select').value ? state.projectSettings.selection : {}));


// Introduktionen vælger kun brugerrejse. Den giver ingen model- eller værktøjstilladelser.
const introductionKey = 'harness.introduction.v1';
const ideaDraftKey = 'harness.ideaDraft.v1';
let nameTouched = false;
function completeIntroduction(mode) {
  try { localStorage.setItem(introductionKey, mode); } catch {}
}
function showIntroduction(step = 'path') {
  $('#welcome-path').hidden = step !== 'path'; $('#welcome-start').hidden = step !== 'start'; $('#welcome-demo').hidden = true;
  document.body.classList.add('introduction-open'); if (!$('#welcome-dialog').open) $('#welcome-dialog').showModal(); $(step === 'path' ? '#welcome-path-title' : '#welcome-title').focus();
}
function closeIntroduction() { document.body.classList.remove('introduction-open'); $('#welcome-dialog').close(); }
function leaveIntroduction() {
  if (setupActive) action(() => leaveSetup(false));
  completeIntroduction('skipped'); closeIntroduction();
  (current ? $('#prompt') : $('#purpose')).focus();
}
$('#welcome-skip').onclick = leaveIntroduction;
$('#welcome-dialog').addEventListener('close', () => { if (!$('#welcome-dialog').open) document.body.classList.remove('introduction-open'); });
$('#welcome-dialog').addEventListener('cancel', event => { event.preventDefault(); leaveIntroduction(); });
$('#intro-button').onclick = () => showIntroduction();
$('#setup-back').onclick = () => { if (setupStep !== 'choice') { $('#api-key').value = ''; setupPage('choice'); } else if (guidedSetup) showIntroduction('start'); else action(() => leaveSetup(false)); };
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
$('#welcome-example').onclick = () => { $('#welcome-start').hidden = true; $('#welcome-demo').hidden = false; demoPreview(false); $('#demo-title').focus(); };
$('#demo-change').onclick = () => demoPreview($('#demo-change').dataset.list !== 'true');
$('#demo-back').onclick = () => { $('#welcome-start').hidden = false; $('#welcome-demo').hidden = true; $('#welcome-title').focus(); };
$('#path-app').onclick = () => showIntroduction('start');
$('#welcome-back').onclick = () => showIntroduction('path');
$('#path-tools').onclick = () => { completeIntroduction('tools'); closeIntroduction(); openTools(); };
$('#tools-button').onclick = () => openTools();

// Harness i brugerens eget kodeværktøj. Ét spørgsmål pr. trin; hovedprocessen vælger mappen og skriver filerne efter en gennemgang.
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
  $('#tools-skill-count').textContent = toolsCatalog.skills.length;
  $('#tools-included-summary').textContent = `Hvad følger med? Grundregler og ${toolsCatalog.skills.length} skills`;
  $('#tools-skills').replaceChildren(...toolsCatalog.skills.map(skill => {
    const details = node('details', undefined, 'tools-skill');
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
  // Et tidligere udvalg bevares; ellers følger alle skills med.
  toolsSkills = new Set(folder.manifest?.skills || toolsCatalog.skills.map(skill => skill.name));
  await reviewTools();
});
// Resumé i almindeligt dansk. De præcise filændringer ligger under "Se de præcise ændringer".
function planLines(review) {
  const lines = [];
  const active = review.operations.filter(op => !['uaendret', 'konflikt', 'bevar'].includes(op.action));
  for (const op of active.filter(item => item.kind === 'blok' && item.path !== '.gitignore')) {
    const pointer = /@AGENTS\.md/.test(op.preview || '');
    const removing = op.action === 'fjern' || op.action === 'fjern-afsnit';
    if (removing) lines.push(`AI Harness-afsnittet i ${op.path} fjernes.`);
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
  else if (review.git.changes) notes.push(`Der er ${plural(review.git.changes, 'ændring', 'ændringer')}, som ikke er gemt i Git. Gem gerne en version først, så Harness' ændringer kan ses for sig.`);
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
    const details = node('details', undefined, `tools-ops tools-ops-${actionName}`);
    details.open = ['konflikt', 'tilfoej', 'bevar'].includes(actionName) || ops.length <= 4;
    details.append(node('summary', `${operationText[actionName]} · ${ops.length}`));
    const list = node('ul');
    for (const op of ops) {
      const item = node('li'); item.append(node('code', op.path));
      if (op.reason) item.append(node('span', ` ${op.reason}`, 'hint'));
      if (op.preview) { const view = node('details'); view.append(node('summary', op.kind === 'blok' ? 'Se afsnittet' : 'Se filen'), node('pre', op.preview)); item.append(view); }
      list.append(item);
    }
    details.append(list);
    return details;
  }));
}
async function reviewTools() {
  const installed = toolsFolder.manifest?.tools || [];
  const review = await call('toolsReview', { tools: [...new Set([...installed, toolsChoice])], skills: [...toolsSkills] });
  toolsReviewState = review;
  const name = toolById(toolsChoice).name;
  const nothing = review.operations.every(op => op.action === 'uaendret');
  const others = installed.filter(id => id !== toolsChoice).map(id => toolById(id)?.name || id);
  $('#tools-review-summary').textContent = nothing ? `AI Harness er allerede installeret til ${name} i ${review.folder}. Intet ændres.` : others.length && !installed.includes(toolsChoice) ? `AI Harness er allerede installeret til ${others.join(', ')} i ${review.folder}. ${name} tilføjes, når du installerer:` : `Det sker i ${review.folder}, når du installerer til ${name}:`;
  const left = toolsCatalog.skills.filter(skill => !toolsSkills.has(skill.name));
  $('#tools-skills-status').textContent = `Skills: ${toolsSkills.size} af ${toolsCatalog.skills.length} valgt${left.length ? ` · fravalgt: ${left.map(skill => skill.title).join(', ')}` : ''}`;
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
  let total = 0;
  for (const category of toolsCatalog.categories) {
    const inputs = [...document.querySelectorAll(`#tools-categories input[data-skill]`)].filter(input => category.skills.includes(input.dataset.skill));
    const chosen = inputs.filter(input => input.checked).length; total += chosen;
    const toggle = document.querySelector(`#tools-categories input[data-category="${category.id}"]`);
    toggle.checked = chosen === inputs.length; toggle.indeterminate = chosen > 0 && chosen < inputs.length;
    toggle.closest('.skill-category').querySelector('.skill-count').textContent = `${chosen} af ${inputs.length}`;
  }
  $('#tools-skill-total').textContent = `${total} af ${toolsCatalog.skills.length} skills valgt. Grundreglerne er altid med.`;
}
$('#tools-customize').onclick = () => { renderSkillPicker(); toolsStep('skills'); };
$('#tools-skills-all').onclick = () => { for (const input of document.querySelectorAll('#tools-categories input[data-skill]')) input.checked = true; updateSkillPicker(); };
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
  $('#tools-done-title').textContent = `${tool.name} kan nu bruge AI Harness`;
  $('#tools-done-summary').textContent = `Grundreglerne og ${plural(result.skills.length, 'skill', 'skills')} ligger i ${result.folder}.${result.skipped.length ? ` ${plural(result.skipped.length, 'fil, du har ændret, er', 'filer, du har ændret, er')} ikke rørt.` : ''} Gennemgå ændringerne i Git, før du gemmer en version.`;
  $('#tools-prompt-intro').textContent = `Åbn ${result.folder} i ${tool.name}, start en ny samtale, og skriv:`;
  $('#tools-prompt-text').textContent = 'Hvilke projektinstruktioner og skills fra AI Harness har du adgang til? Hvad er kontrolordet i AI Harness-profilen? Ændr ingen filer.';
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
  $('#tools-done-title').textContent = 'AI Harness er fjernet';
  $('#tools-done-summary').textContent = `AI Harness er fjernet fra ${result.folder}.${result.kept.length ? ` Disse filer, du har ændret, er bevaret: ${result.kept.join(', ')}.` : ''}`;
  $('#tools-prompt-intro').closest('.tools-prompt').hidden = true; $('#tools-verify').closest('details').hidden = true; $('#tools-removal').hidden = true; $('#tools-reveal').hidden = true;
  toolsStep('done');
});
$('#provider-account').onclick = () => action(() => call('providerAccount', $('#provider-kind').value));
function renderLocation(location) { $('#project-location').textContent = `Projektet gemmes i ${location.label}.`; $('#project-location').title = location.path; }
$('#choose-location').onclick = () => action(async () => renderLocation(await call('chooseProjectLocation')));
function saveIdeaDraft() {
  try { localStorage.setItem(ideaDraftKey, JSON.stringify({name: $('#name').value, purpose: $('#purpose').value, nameTouched})); $('#idea-draft-status').textContent = 'Idé og projektnavn er gemt som kladde på denne computer.'; } catch { $('#idea-draft-status').textContent = 'Kladden kan ikke gemmes automatisk på denne computer.'; }
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
  saveIdeaDraft();
});
try { if (!localStorage.getItem(introductionKey)) showIntroduction(); } catch { showIntroduction(); }

// Det guidede forløb ændrer aldrig model, rute eller betaling uden et aktivt valg.
let modelCatalog = [], activePlan = null;
function modelDescription(model) {
  const price = model.price;
  const known = price && price.prompt != null && price.completion != null && Number.isFinite(Number(price.prompt)) && Number.isFinite(Number(price.completion));
  const cost = !known ? 'Pris ukendt' : Number(price.prompt) === 0 && Number(price.completion) === 0 ? '0 USD for input/output*' : `${Number(price.prompt) * 1e6} / ${Number(price.completion) * 1e6} USD pr. mio. input-/outputtokens`;
  return `${cost} · ${model.capabilities?.tools === true ? 'Værktøjskald angivet i kataloget' : model.capabilities?.tools === false ? 'Ingen værktøjskald angivet' : 'Kodeværktøjer ikke verificeret'}`;
}
// For udbyderne i opsætningen vælges udbyderens eget udgangspunkt på forhånd. Det er ikke en anbefaling fra appen; modellen står under skrivefeltet og i resuméet før første afsendelse.
function preselectRecommended(connectionID) {
  const kind = state.connections.find(c => c.id === connectionID)?.kind;
  if (!featuredProviders.some(item => item.kind === kind)) return;
  const { curated, picks } = window.ModelAdvice.suggest(modelCatalog, kind);
  if (curated && picks[0]) $('#model-select').value = picks[0].model.id;
}
function markChosenModel() { for (const button of document.querySelectorAll('#model-shortlist .model-choice')) button.setAttribute('aria-pressed', String(button.dataset.model === $('#model-select').value)); }
function renderShortlist() {
  const kind = state.connections.find(c => c.id === $('#connection-select').value)?.kind;
  const { curated, picks } = window.ModelAdvice.suggest(modelCatalog, kind);
  $('#model-shortlist').replaceChildren();
  for (const { model, text } of picks) {
    const button = node('button', undefined, 'model-choice'); button.type = 'button'; button.dataset.model = model.id;
    button.append(node('strong', model.name), node('span', text));
    // Et klik vælger modellen og lukker dialogen. Kun OpenRouter kræver bagefter et valg af udbyder.
    button.onclick = () => action(async () => {
      $('#model-select').value = model.id; $('#model-evidence').textContent = `${model.name}: ${modelDescription(model)}. Modtager: ${state.connections.find(c => c.id === $('#connection-select').value)?.name || 'valgt forbindelse'}.`;
      markChosenModel(); updateModelSummary(); await loadRoutes();
      if ($('#route-row').hidden) { $('#model-options').open = false; $('#task-dialog').close(); $('#prompt').focus(); }
    });
    $('#model-shortlist').append(button);
  }
  $('#model-shortlist').append(node('p', !picks.length ? 'Ingen forslag fra din forbindelse. Se alle modeller nedenfor.' : curated ? 'Et udvalg af udbyderens modeller. Det første er udbyderens eget udgangspunkt; AI Harness anbefaler ingen model. Du ser pris og modtager, før noget sendes.' : 'Et udvalg fra din forbindelse. Du ser pris og modtager, før noget sendes.', 'hint'));
  markChosenModel();
}
$('#model-search').oninput = () => { const query = $('#model-search').value.toLocaleLowerCase(); for (const item of $('#model-select').options) item.hidden = Boolean(item.value && item.value !== $('#model-select').value && !item.textContent.toLocaleLowerCase().includes(query)); };
function updateWorkMode() {
  const mode = $('#work-mode').value;
  $('#composer-mode').textContent = mode === 'plan' ? 'Planlægning' : '';
  $('#mode-help').textContent = mode === 'plan' ? 'AI’en kan læse og stille spørgsmål. Filændringer og kommandoer er blokeret. Svar i samtalen, indtil planen passer.' : mode === 'build' ? 'AI’en bygger efter den plan, du har valgt. Handlinger kræver fortsat godkendelse.' : 'Skriv frit til kodeagenten. Filændringer, kommandoer og webopslag kræver godkendelse.';
}
$('#work-mode').onchange = () => { acceptedFingerprint = null; updateWorkMode(); };
$('#revise-plan').onclick = () => {
  if (!activePlan || running) return;
  $('#work-mode').value = 'plan'; updateWorkMode();
  if (!$('#prompt').value.trim()) $('#prompt').value = 'Ret forslaget: ';
  saveChatDraft(); $('#prompt').focus();
};
$('#build-plan').onclick = () => {
  if (!activePlan || running) return;
  if ($('#prompt').value.trim()) { message('Send eller ryd din beskedkladde, før du bygger planen.'); return; }
  $('#work-mode').value = 'build'; updateWorkMode(); acceptedFingerprint = null;
  $('#prompt').value = 'Byg første udkast efter den plan, jeg har gennemgået. Afslut med konkrete ting, jeg skal prøve i forhåndsvisningen.';
  $('#chat-form').requestSubmit();
};
// Målet vises som en sti i projektet, når det er muligt. OpenCode regner mønstre ud fra Git-roden eller fra computerens rod.
function approvalTarget(p) {
  const file = typeof p.metadata?.filepath === 'string' ? p.metadata.filepath : '';
  const root = current?.root || '';
  if (p.permission === 'edit' && file && root && (file.startsWith(root + '/') || file.startsWith(root + '\\'))) return { projectFile: true, text: file.slice(root.length + 1).replaceAll('\\', '/') };
  if (p.permission === 'bash') return { text: p.metadata?.command || (p.patterns || []).join('\n') };
  return { text: (p.patterns || []).join('\n') };
}
function approvalExplanation(p, target) {
  const explanations = {
    edit: target.projectFile ? ['Må AI’en ændre filer i projektet?', 'Vælg Tillad for denne opgave, så spørger vi ikke igen om filer i projektmappen, før opgaven er færdig. Du kan se alle ændringer bagefter under Ændringer.'] : ['Må AI’en ændre en fil uden for projektet?', 'Filen ligger ikke i projektmappen. Tillad kun, hvis du ved, hvorfor den skal ændres.'],
    bash: ['Må AI’en køre en kommando?', 'En kommando kan ændre eller slette filer, installere programmer og kontakte andre tjenester med dine rettigheder. Tillad kun, hvis du forstår, hvad den gør.'],
    webfetch: ['Må AI’en åbne en hjemmeside?', 'Hjemmesiden får besked om besøget, og indholdet sendes videre til din AI.'],
    external_directory: ['Må AI’en se en mappe uden for projektet?', 'Mappen kan indeholde materiale, du ikke vil dele med din AI.'],
    grep: ['Må AI’en søge i projektets filer?', 'Det, AI’en finder, sendes videre til din AI.']
  };
  const [title, effect] = explanations[p.permission] || ['Gennemgå denne handling', 'Læs de tekniske detaljer, før du tillader den.'];
  return { title, effect };
}
function renderRunReview(result) {
  const box = $('#run-review'); box.replaceChildren();
  if (result.mode === 'plan' && result.status === 'idle' && !result.files.length) { box.hidden = true; return; }
  box.hidden = false; requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest' }));
  box.append(node('h3', result.status === 'idle' ? 'Prøv resultatet i forhåndsvisningen' : 'Opgaven blev afbrudt eller fejlede'));
  if (result.unavailable) { box.append(node('p', 'Ændringsoversigten kunne ikke læses. Gennemgå filerne manuelt.')); return; }
  box.append(node('p', result.files.length ? `${result.files.length} ${result.files.length === 1 ? 'fil er ændret' : 'filer er ændret'}.` : 'Ingen filændringer registreret.'));
  const checks = node('details'); checks.append(node('summary', 'Kontroller og handlinger')); box.append(checks);
  const commands = result.tools.filter(t => t.tool === 'bash');
  checks.append(node('p', commands.length ? 'Kørte kommandoer (afsluttet er ikke det samme som bestået test):' : 'Ingen kommandoer kørt. Appen har ikke bekræftet funktionalitet eller tests.'));
  for (const tool of commands) checks.append(node('p', `${tool.title || 'Kommando'} · ${toolStatuses[tool.status] || tool.status}`));
  if (result.tools.some(t => t.status === 'error')) box.append(node('p', 'Mindst ét værktøj fejlede eller blev afvist. Se samtalen, før du fortsætter.'));
  checks.append(node('p', 'Gennemfør den vigtigste opgave, og prøv også en smal skærmstørrelse. AI’ens beskrivelse er ikke et testbevis.', 'hint'));
  if (result.skipped) box.append(node('p', 'Nogle filer er udeladt af oversigten på grund af filtype eller størrelse.'));
  if (result.files.length) {
    const inspect = node('button', 'Gennemgå ændringer'); inspect.onclick = () => $('#changes-button').click();
    const save = node('button', 'Gem version'); save.onclick = () => $('#git-button').click(); box.append(inspect, save);
  }
}

$('#git-identity').onsubmit = event => { event.preventDefault(); action(async () => { await call('gitIdentity', { name: $('#git-name').value, email: $('#git-email').value }); await loadGit(); }); };

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
  if (!current) return;
  try { localStorage.setItem('harness.chatDraft.' + current.root, JSON.stringify({ text: $('#prompt').value, mode: $('#work-mode').value })); } catch {}
  clearTimeout(draftTimer); draftTimer = setTimeout(saveChatDraft, 250);
});
$('#work-mode').addEventListener('change', saveChatDraft);
$('#include-history').onchange = () => { acceptedFingerprint = null; };
$('#setup-find-local').onclick = () => { setupPage('local'); if (!localDiscoveryResult) action(discoverLocal); };
$('#setup-add-provider').onclick = () => setupProvider();

$('#new-conversation').onclick = () => action(async () => { await saveChatDraft(); const result = await call('newConversation'); if (!result) return; localStorage.removeItem('harness.chatDraft.' + current.root); current.workbench = result; await displayProject(current); $('#prompt').focus(); });

function openTaskSettings() { $('#model-options').open = true; if (!$('#task-dialog').open) $('#task-dialog').showModal(); }
$('#model-chip').onclick = openTaskSettings;
for (const id of ['settings-menu', 'project-menu', 'preview-menu']) {
  document.getElementById(id).addEventListener('click', event => { if (event.target.closest('button') && (id !== 'preview-menu' || event.target.closest('#attach-preview'))) document.getElementById(id).hidePopover(); });
}

$('#support-button').onclick = () => action(async () => {
  $('#support-dialog').showModal(); $('#support-status').textContent = '';
  const report = await call('supportReport');
  $('#support-version').textContent = `AI Harness ${report.app} · ${report.system === 'darwin' ? 'macOS' : report.system === 'win32' ? 'Windows' : report.system} · ${report.arkitektur}`;
  $('#support-report').textContent = JSON.stringify(report, null, 2);
});
$('#support-save').onclick = () => action(async () => { $('#support-status').textContent = await call('supportSave') ? 'Rapporten er gemt på din computer. Du vælger selv, om du vil dele den.' : 'Rapporten blev ikke gemt.'; });
$('#support-feedback').onclick = () => action(() => call('supportFeedback'));
