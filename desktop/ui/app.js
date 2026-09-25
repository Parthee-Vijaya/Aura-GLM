const $ = selector => document.querySelector(selector);
let current = null, revision = null, polling = false, state = null, modelRequest = 0, acceptedFingerprint = null, pendingSend = null, running = false;
let skillList = [], roles = new Map(), parts = new Map();
function message(text, error = false) { const dialog = document.querySelector('dialog[open]'); if (dialog) { let notice = dialog.querySelector('.dialog-notice'); if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-notice'; notice.setAttribute('role', 'status'); dialog.append(notice); } notice.textContent = text; }  $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = false; }
async function call(method, value) { const result = await window.harness[method](value); if (!result.ok) throw new Error(result.error); return result.value; }
async function action(fn) { $('#message').hidden = true; try { return await fn(); } catch (error) { message(error.message, true); } }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function option(value, label) { const el = node('option', label); el.value = value; return el; }
function appendMessage(text, role = 'assistant') { $('#project-intro').hidden = true; $('#start-idea').hidden = true; const el = node('div', text, `chat-message ${role}`); $('#messages').append(el); $('#chat-content').scrollTop = $('#chat-content').scrollHeight; return el; }
let guidedSetup = false;
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
}
function renderSetup() {
  const previous = $('#setup-connection').value || preferredConnection;
  $('#setup-connection').replaceChildren(option('', 'Vælg forbindelse'), ...(state?.connections || []).map(c => option(c.id, c.name)));
  if (state?.connections.some(c => c.id === previous)) $('#setup-connection').value = previous;
  else verifiedConnection = '';
  if (!verifiedConnection) $('#setup-ai').textContent = $('#setup-connection').value ? 'Gemt opsætning · endnu ikke kontrolleret i denne session.' : 'Tilføj en forbindelse, eller fortsæt uden AI.';
  setupControls();
}
async function setupGit() {
  $('#setup-git-refresh').disabled = true;
  try { const result = await call('setupStatus'); $('#setup-git').textContent = result.git; $('#setup-git-open').hidden = !result.project; }
  finally { $('#setup-git-refresh').disabled = false; }
}
function showSetup(reason = '', fromIntroduction = false) {
  guidedSetup = fromIntroduction;
  setupActive = true; $('#setup').hidden = false; $('#workspace').hidden = true; $('#onboarding').hidden = true;
  $('#view-title').textContent = 'Opsætning'; $('#setup-reason').textContent = reason; $('#setup-reason').hidden = !reason;
  renderSetup(); action(setupGit); $('#setup-title').focus();
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
  guidedSetup = false; completeIntroduction('guided');
  setupActive = false; $('#setup').hidden = true; $('#workspace').hidden = !current; $('#onboarding').hidden = Boolean(current);
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
$('#setup-test').onclick = () => action(async () => {
  const id = $('#setup-connection').value, generation = ++setupGeneration;
  verifiedConnection = ''; setupControls(); $('#setup-test').disabled = true; $('#setup-ai').textContent = 'Henter modelkatalog fra den valgte server …';
  try {
    const models = await call('models', id);
    if (generation !== setupGeneration || id !== $('#setup-connection').value) return;
    verifiedConnection = models.length ? id : '';
    $('#setup-ai').textContent = models.length ? `Kataloget svarede med ${models.length} modeller. Modelkald er endnu ikke afprøvet.` : 'Serveren svarede uden modeller. Kontrollér opsætningen.';
  } catch (error) { if (generation === setupGeneration) $('#setup-ai').textContent = `Kontrollen mislykkedes: ${error.message} Rediger forbindelsen, eller prøv igen.`; }
  finally { if (generation === setupGeneration) setupControls(); }
});
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
  ++modelRequest; recovery = ''; $('#connection-warning').hidden = true; setupActive = false; $('#setup').hidden = true; setupControls();
  activePlan = null; modelCatalog = []; $('#model-shortlist').replaceChildren(); $('#plan-card').hidden = true; $('#run-review').hidden = true; $('#work-mode').value = project.purpose ? 'plan' : 'free'; updateWorkMode();
  current = project; revision = null; acceptedFingerprint = null; roles.clear(); parts.clear();
  $('#project-intro').hidden = false; $('#messages').replaceChildren(); $('#approvals').replaceChildren(); $('#prompt').value = '';
  $('#view-title').textContent = 'Arbejdsområde'; $('#active-project').textContent = project.name; $('#active-project').classList.add('active');
  $('#onboarding').hidden = true; $('#workspace').hidden = false; $('#skills-button').disabled = false;
  $('#project-name').textContent = project.name; $('#project-purpose').textContent = project.purpose || 'Eksisterende mappe. Beskriv din opgave i samtalen.'; $('#project-path').textContent = project.root;
  $('#reference-choices').replaceChildren();
  for (const asset of (project.assets || []).filter(a => a.kind === 'reference')) {
    const label = node('label', undefined, 'check-label'); const input = node('input'); input.type = 'checkbox'; input.value = asset.file;
    label.append(input, document.createTextNode(asset.name)); $('#reference-choices').append(label);
  }
  if (!$('#reference-choices').children.length) $('#reference-choices').textContent = 'Ingen referencefiler registreret i projektet.';
  showPreview(project.previewURL);
  if (project.warnings?.length) message(project.warnings.join(' '));
  state = project.workbench; $('#connection-select').value = ''; renderConnections();
  const saved = state.projectSettings.selection;
  if (autoConnect && saved && state.connections.some(c => c.id === saved.connectionID)) { $('#connection-select').value = saved.connectionID; await loadModels(saved); }
  else if (autoConnect && state.connections.some(c => c.id === preferredConnection)) { $('#connection-select').value = preferredConnection; await loadModels(); }
  const startup = state.projectSettings.startup;
  const preferredProjectConnection = saved?.connectionID || startup?.connectionID;
  if (!$('#connection-select').value && preferredProjectConnection && state.connections.some(c => c.id === preferredProjectConnection)) $('#connection-select').value = preferredProjectConnection;
  $('#project-startup').textContent = startup ? `Hostingønske: ${hostingLabel(startup.hosting)} · Tests: ${testLabel(startup.tests)}` : 'Ingen opstartsvalg gemt for dette projekt.';
  $('#model-options').open = !$('#model-select').value; $('#start-idea').hidden = !project.purpose; updateModelSummary();
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
function updateProvider() {
  const definition = state?.definitions[$('#provider-kind').value]; if (!definition) return;
  const help = { anthropic: 'Brug en Anthropic API-nøgle. Et Claude-abonnement kan endnu ikke forbindes her.', openrouter: 'Brug din OpenRouter-nøgle. Du vælger selv model og den udbyder, der modtager dine data. Gratis modeller er markeret i listen.', zen: 'Brug din OpenCode Zen-nøgle. Du vælger model og gennemgår pris og datavilkår før afsendelse.', ollama: 'Forbind til en Ollama-server, som allerede kører. Kontrollér adressen nedenfor; appen installerer ikke modeller.', compatible: 'Brug adressen fra din organisation eller egen modelserver, fx DGX Spark. Appen ændrer ikke serveren eller Tailscale.' };
  $('#provider-help').textContent = help[$('#provider-kind').value];
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
    updateModelSummary(); $('#connection-warning').hidden = true; $('#connection-status').textContent = state.connections.find(c => c.id === id)?.name || 'Ingen model valgt';
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
function selection() { return { mode: $('#work-mode').value, planID: activePlan?.id, connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-select').value, references: [...document.querySelectorAll('#reference-choices input:checked')].map(el => el.value) }; }
const detailLabels = { mode: 'Arbejdsmåde', planContext: 'Plan og afklaring, der sendes', projectChoices: 'Projektets opstartsvalg', connection: 'Forbindelse', model: 'Model', endpoint: 'Serveradresse', recipients: 'Modtagere', region: 'Behandlingssted', retention: 'Opbevaring', training: 'Brug til træning', price: 'Pris og gratisbegrænsninger', capabilities: 'Modelmuligheder', material: 'Hvad sendes?', references: 'Udvalgte private referencer', skills: 'Aktive skills', localStorage: 'Lokal historik og yderligere netværk', security: 'Forbindelsens sikkerhed', source: 'Kilde', checkedAt: 'Dokumentation kontrolleret', evidence: 'Grundlag' };
function showData(data, canSend) {
  $('#data-summary').replaceChildren();
  for (const [label, value] of Object.entries({ 'Din AI': `${data.model} · ${data.connection}`, 'Modtagere': data.recipients, 'Behandlingssted': data.region, 'Pris': data.price, 'Opbevaring': data.retention, 'Træning': data.training })) {
    $('#data-summary').append(node('dt', label), node('dd', Array.isArray(value) ? value.join(', ') : value));
  }
  $('#data-details').replaceChildren();
  for (const [key, label] of Object.entries(detailLabels)) { $('#data-details').append(node('dt', label), node('dd', key === 'mode' ? ({ plan: 'Afklar og planlæg', build: 'Byg den valgte plan', free: 'Arbejd direkte' }[data[key]]) : Array.isArray(data[key]) ? data[key].join(', ') || 'Ingen' : data[key] && typeof data[key] === 'object' ? JSON.stringify(data[key], null, 2) : data[key] || 'Ingen')); }
  $('#accept-send').hidden = !canSend; $('#data-dialog').showModal();
}
async function sendNow(data, text) {
  $('#model-options').open = false; $('#connection-warning').hidden = true; $('#data-dialog').close(); setRunning(true, 'Starter agent …');
  if ($('#work-mode').value === 'free') { activePlan = null; $('#plan-card').hidden = true; }
  $('#run-review').hidden = true; if ($('#work-mode').value === 'build') $('#plan-card').hidden = true; if ($('#work-mode').value === 'plan') { activePlan = null; $('#plan-card').hidden = true; }
  lastSentText = text; appendMessage(text, 'user'); $('#prompt').value = '';
  try { await call('send', { text, fingerprint: data.fingerprint }); acceptedFingerprint = data.fingerprint; }
  catch (error) { $('#prompt').value = text; setRunning(false, 'Fejl'); appendMessage(error.message, 'error'); connectionFailed(error.message); throw error; }
}
function setRunning(value, status) {
  running = value; $('#run-status').textContent = status; $('#send').disabled = value; $('#stop').hidden = !value;
  for (const selector of ['#work-mode', '#build-plan', '#model-load', '#model-search', '#connection-select', '#model-select', '#route-select', '#new', '#open', '#connections-button', '#skills-button', '#git-button', '#publish-button', '#setup-hosting', '#deploy-button', '#intro-button']) $(selector).disabled = value;
  for (const button of document.querySelectorAll('#model-shortlist button')) button.disabled = value;
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
  if (!parts.has(id)) parts.set(id, appendMessage('', role));
  return parts.get(id);
}
window.harness.onEvent(event => {
  const p = event.properties || {};
  if (event.type === 'plan.ready') { activePlan = event.plan; $('#plan-text').textContent = event.plan.text; $('#plan-card').hidden = false; requestAnimationFrame(() => $('#plan-card').scrollIntoView({ block: 'nearest' })); }
  if (event.type === 'run.review') renderRunReview(event);
  if (event.type === 'git.checkpoint') { appendMessage(event.message, 'system'); return; }
  if (event.type === 'preview.ready') return showPreview(event.url);
  if (event.type === 'session.new') { roles.clear(); parts.clear(); appendMessage('Ny modelsession. Tidligere modelsessioner overføres ikke automatisk. I det guidede forløb medsendes den viste plan og afklaring; se Data og vilkår.', 'system'); }
  if (event.type === 'run.status') {
    const active = ['starting', 'working'].includes(event.status);
    const statuses = { starting: 'Starter agent …', working: 'Arbejder …', idle: 'Klar', error: 'Fejl', stopped: 'Stoppet' };
    setRunning(active, statuses[event.status] || event.status);
    if (!active) $('#approvals').replaceChildren();
  }
  if (event.type === 'message.updated') roles.set(p.info.id, p.info.role);
  if (event.type === 'message.part.updated') {
    const part = p.part;
    if (roles.get(part.messageID) === 'user') return;
    if (part.type === 'text') partElement(part.id, 'assistant').textContent = part.text;
    if (part.type === 'tool') partElement(part.id, 'tool').textContent = `${toolLabels[part.tool] || part.tool} · ${toolStatuses[part.state?.status] || part.state?.status || ''}${part.state?.title ? '\n' + part.state.title : ''}`;
  }
  if (event.type === 'message.part.delta' && p.field === 'text' && roles.get(p.messageID) !== 'user') partElement(p.partID, 'assistant').textContent += p.delta;
  if (event.type === 'permission.asked') {
    const box = node('section', undefined, 'approval'); box.dataset.id = p.id;
    const explanation = approvalExplanation(p);
    box.append(node('strong', explanation.title), node('p', explanation.effect));
    box.append(node('p', (p.patterns || []).join('\n'), 'action-target'));
    if (p.metadata?.description) box.append(node('p', `Agentens begrundelse: ${p.metadata.description}`, 'hint'));
    const details = node('details'); details.append(node('summary', 'Tekniske detaljer'), node('pre', JSON.stringify({ paths: p.patterns, details: p.metadata }, null, 2))); box.append(details);
    for (const allow of [false, true]) { const button = node('button', allow ? 'Tillad én gang' : 'Afvis'); button.onclick = () => action(async () => { await call('reply', { id: p.id, allow }); box.remove(); }); box.append(button); }
    $('#approvals').append(box); box.scrollIntoView({ block: 'nearest' });
  }
  if (event.type === 'permission.replied') for (const box of $('#approvals').children) if (box.dataset.id === p.requestID) box.remove();
  if (event.type === 'question.asked') {
    const form = node('form', undefined, 'approval'); const fields = [];
    for (const question of p.questions) { form.append(node('p', question.question)); if (question.options?.length) form.append(node('p', question.options.map(o => `${o.label}: ${o.description}`).join('\n'), 'hint')); const input = node('input'); input.required = true; input.setAttribute('aria-label', question.question); form.append(input); fields.push(input); }
    const submit = node('button', 'Svar'); submit.type = 'submit'; form.append(submit); form.onsubmit = event => { event.preventDefault(); action(async () => { await call('question', { id: p.id, answers: fields.map(f => [f.value]) }); form.remove(); }); }; $('#approvals').append(form);
  }
  if (event.type === 'engine.error') appendMessage(event.message, 'error');
  if (event.type === 'session.error') { if (!$('#prompt').value) $('#prompt').value = lastSentText; const reason = p.error?.data?.message || p.error?.message || 'Modelkaldet mislykkedes. Kontrollér forbindelsen og kvoten.'; appendMessage(reason, 'error'); connectionFailed(reason); }
});
$('#color').addEventListener('input', event => { $('#color-value').value = event.target.value; });
for (const kind of ['logo', 'reference']) $(`#${kind}`).onclick = () => action(async () => showAssets(await call('chooseAssets', kind)));
$('#open').onclick = () => action(async () => displayProject(await call('openProject')));
$('#new').onclick = () => action(async () => { setupActive = false; $('#setup').hidden = true; ++modelRequest; recovery = ''; $('#connection-warning').hidden = true; await call('newProject'); current = null; revision = null; acceptedFingerprint = null; showPreview(null); $('#workspace').hidden = true; $('#onboarding').hidden = false; $('#skills-button').disabled = true; $('#view-title').textContent = 'Projektopstart'; $('#active-project').textContent = 'Intet projekt åbent'; $('#active-project').classList.remove('active'); $('#create-form').reset(); $('#color-value').value = $('#color').value; showAssets([]); await loadStartup(); nameTouched = false; saveIdeaDraft(); $('#purpose').focus(); });
$('#create-form').onsubmit = event => { event.preventDefault(); action(async () => { $('#create').disabled = true; try { const created = await call('createProject', { name: $('#name').value, purpose: $('#purpose').value, color: $('#color').value, links: $('#links').value.split('\n').map(line => line.trim()).filter(Boolean), tests: $('#tests').value, startup: startupValues(), remember: $('#remember-startup').checked }); if (created) { await displayProject(created); clearIdeaDraft(); } } finally { $('#create').disabled = false; } }); };
$('#connections-button').onclick = () => action(async () => { state = await call('connectionState'); renderConnections(); updateProvider(); $('#connections-dialog').showModal(); });
$('#provider-kind').onchange = updateProvider;
$('#reset-connection').onclick = () => { $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); };
$('#connection-form').onsubmit = event => { event.preventDefault(); action(async () => { $('#save-connection').disabled = true; const previousIDs = new Set(state.connections.map(c => c.id)); const input = { id: $('#connection-id').value || undefined, kind: $('#provider-kind').value, name: $('#connection-name').value, baseURL: $('#base-url').value, apiKey: $('#api-key').value, clearKey: $('#clear-key').checked }; $('#api-key').value = ''; try { state = await call('saveConnection', input); ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections(); const selected = state.connections.find(c => c.id === input.id || !previousIDs.has(c.id)); if (selected) $('#setup-connection').value = selected.id; setupControls(); $('#connection-feedback').textContent = 'Forbindelsen er gemt. Brug Test / hent modeller for at kontrollere serveren.'; $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); } finally { $('#save-connection').disabled = false; } }); };
$('#connection-select').onchange = () => { autoConnect = true; action(() => loadModels()); }; $('#model-select').onchange = () => { updateModelSummary(); action(() => loadRoutes()); };
$('#data-button').onclick = () => action(async () => showData(await call('prepare', selection()), false));
$('#chat-form').onsubmit = event => { event.preventDefault(); action(async () => { const text = $('#prompt').value.trim(); if (!text || running) return; if (!$('#connection-select').value) { $('#model-options').open = true; showConnectionWarning('Forbind en AI for at sende beskeden. Din kladde er bevaret.'); return; } if (!$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { $('#model-options').open = true; message('Vælg model og eventuel modeludbyder ved beskedfeltet.', true); return; } $('#send').disabled = true; try { const data = await call('prepare', selection()); if (data.fingerprint === acceptedFingerprint) await sendNow(data, text); else { pendingSend = { data, text }; showData(data, true); } } catch (error) { connectionFailed(error.message); throw error; } finally { $('#send').disabled = running; } }); };
$('#accept-send').onclick = () => action(async () => { const pending = pendingSend; pendingSend = null; if (pending) await sendNow(pending.data, pending.text); });
$('#stop').onclick = () => action(() => call('stop'));
$('#skills-button').onclick = () => action(async () => { skillList = await call('skills'); $('#skill-select').replaceChildren(...skillList.map(s => option(s.id, s.id))); showSkill(); $('#skills-dialog').showModal(); });
$('#skill-select').onchange = showSkill;
for (const reset of [true, false]) $(reset ? '#skill-reset' : '#skill-save').onclick = () => action(async () => { const id = $('#skill-select').value; skillList = await call('saveSkill', { id, content: $('#skill-content').value, enabled: $('#skill-enabled').checked, reset }); acceptedFingerprint = null; showSkill(); message('Skill-valget er gemt for dette projekt. Det træder i kraft i næste modelsession.'); });
$('#changes-button').onclick = () => action(async () => { const result = await call('changes'); $('#changes-list').replaceChildren(); if (!result.files.length) $('#changes-list').append(node('p', 'Ingen tekstændringer registreret siden første besked.')); for (const file of result.files) { const detail = node('details'); detail.append(node('summary', file.file), node('h3', 'Før'), node('pre', file.before ?? '(ny fil)'), node('h3', 'Efter'), node('pre', file.after ?? '(slettet fil)')); $('#changes-list').append(detail); } if (result.skipped) $('#changes-list').append(node('p', `${result.skipped} filregistreringer blev udeladt af hensyn til størrelse eller filtype.`)); $('#changes-dialog').showModal(); });
$('#attach-preview').onclick = () => $('#preview-dialog').showModal();
$('#preview-form').onsubmit = event => { event.preventDefault(); action(async () => { const url = await call('attachPreview', $('#preview-url').value); showPreview(url, true); $('#preview-dialog').close(); }); };
$('#static-preview').onclick = () => action(async () => { showPreview(await call('attachPreview', '')); $('#preview-dialog').close(); });
$('#refresh').onclick = () => { if (current?.previewURL) $('#preview').src = current.previewURL; };
for (const button of document.querySelectorAll('[data-close]')) button.onclick = () => document.getElementById(button.dataset.close).close();
$('#connections-dialog').addEventListener('close', () => { $('#api-key').value = ''; });
setInterval(async () => { if (!current || polling) return; polling = true; const project = current; try { const next = await call('revision'); if (current !== project || !next) return; if (revision && next !== revision) $('#preview').src = current.previewURL; revision = next; $('#preview-status').textContent = 'Lokal forhåndsvisning'; } catch { $('#preview-status').textContent = 'Kan ikke læse siden – kontrollér projektfilerne'; } finally { polling = false; } }, 1500);
action(async () => { $('#create').disabled = true; try { state = await call('connectionState'); renderConnections(); updateProvider(); await loadDesigns(); await loadStartup(); restoreIdeaDraft(); setupControls(); for (const id of ['#welcome-build', '#welcome-example', '#welcome-open']) $(id).disabled = false; if ($('#welcome-dialog').open) $('#welcome-title').focus(); else $('#purpose').focus(); } finally { $('#create').disabled = false; } });

async function loadDesigns() { const designs = await call('listDesigns'); $('#design-select').replaceChildren(option('', 'Vælg en tidligere gemt pakke'), ...designs.map(d => option(d.id, `${d.name} · ${d.files} filer`))); }
$('#save-design').onclick = () => action(async () => { await call('saveDesign', { name: $('#design-name').value, color: $('#color').value, links: $('#links').value.split('\n').map(s => s.trim()).filter(Boolean) }); await loadDesigns(); message('Designpakken er gemt lokalt og kan vælges i andre projekter.'); });
$('#design-select').onchange = () => action(async () => { updateStartupSummary(); if (!$('#design-select').value) { await clearStartupDesign(); return; } const design = await call('applyDesign', $('#design-select').value); $('#color').value = design.color; $('#color-value').value = design.color; $('#links').value = design.links.join('\n'); showAssets(design.assets); updateStartupSummary(); });


let gitReview = null;
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
  $('#git-auto').disabled = true;
  try {
  gitReview = null; $('#git-form').hidden = true; $('#git-init').hidden = true; $('#git-settings').hidden = true;
  const result = await call('gitStatus');
  $('#git-summary').textContent = result.block || `Branch: ${result.branch} · ${result.changes} ændrede filer · ${result.identity.name} <${result.identity.email}>`;
  $('#git-init').hidden = result.initialized;
  $('#git-settings').hidden = !result.initialized || result.wrongRoot;
  $('#git-auto').checked = result.autoCheckpoint;
  $('#git-history').replaceChildren(...result.history.map(item => node('li', `${item.id} · ${item.message}`)));
  if (!result.history.length) $('#git-history').append(node('li', 'Ingen gemte versioner endnu.'));
  if (result.initialized && !result.block) { $('#git-form').hidden = false; await loadGitReview(); }
  } finally { $('#git-auto').disabled = false; }
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
function updateModelSummary() {
  const model = $('#model-select');
  $('#model-summary').textContent = model.value ? model.selectedOptions[0].textContent : 'Vælg din AI';
}
function showConnectionWarning(reason) {
  $('#connection-warning-text').textContent = reason;
  $('#connection-warning').hidden = false;
  if (!current) showSetup(reason);
}
$('#repair-connection').onclick = () => showSetup($('#connection-warning-text').textContent);
$('#dismiss-connection').onclick = () => { $('#connection-warning').hidden = true; $('#prompt').focus(); };
$('#model-manage').onclick = () => $('#connections-button').click();
$('#start-idea').onclick = () => { $('#work-mode').value = 'plan'; updateWorkMode(); if (!$('#prompt').value.trim()) $('#prompt').value = `Jeg vil bygge: ${current?.purpose || ''}\n\nHjælp mig med at afklare idéen. Stil de nødvendige spørgsmål i almindeligt sprog og foreslå en kort plan, før du ændrer filer.`; $('#prompt').focus(); };
$('#model-select').addEventListener('change', updateModelSummary);

$('#model-done').onclick = () => { if (!$('#connection-select').value || !$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { message('Vælg en forbindelse, model og eventuel udbyder først.', true); return; } updateModelSummary(); $('#model-options').open = false; $('#prompt').focus(); };

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
  for (const selector of ['#startup-options', '#design-options', '#onboarding .advanced']) $(selector).open = false;
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
function showIntroduction() {
  $('#welcome-start').hidden = false; $('#welcome-demo').hidden = true;
  document.body.classList.add('introduction-open'); $('#welcome-dialog').showModal(); $('#welcome-title').focus();
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
$('#intro-button').onclick = showIntroduction;
$('#setup-back').onclick = () => guidedSetup ? showIntroduction() : action(() => leaveSetup(false));
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
$('#provider-account').onclick = () => action(() => call('providerAccount', $('#provider-kind').value));
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
$('#purpose').addEventListener('input', () => {
  if (!nameTouched) {
    const words = $('#purpose').value.trim().replace(/^(jeg vil (gerne )?(lave|bygge)|vi vil (lave|bygge))\s+/i, '').split(/\s+/).slice(0,7).join(' ');
    $('#name').value = (words.charAt(0).toLocaleUpperCase('da') + words.slice(1)).slice(0,80);
  }
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
function renderShortlist() {
  const candidates = modelCatalog.filter(m => m.capabilities?.tools !== false).sort((a, b) => Number(b.capabilities?.tools === true) - Number(a.capabilities?.tools === true) || a.name.localeCompare(b.name, 'da')).slice(0, 3);
  $('#model-shortlist').replaceChildren();
  for (const model of candidates) {
    const button = node('button', undefined, 'model-choice'); button.type = 'button';
    button.append(node('strong', model.name), node('span', modelDescription(model)));
    button.onclick = () => action(async () => { $('#model-select').value = model.id; $('#model-evidence').textContent = `${model.name}: ${modelDescription(model)}. Modtager: ${state.connections.find(c => c.id === $('#connection-select').value)?.name || 'valgt forbindelse'}. Endelig udbyder og vilkår gennemgås før afsendelse.`; updateModelSummary(); await loadRoutes(); });
    $('#model-shortlist').append(button);
  }
  $('#model-shortlist').append(node('p', candidates.length ? 'Et udvalg fra din forbindelse: modeller med oplyste værktøjskald først, derefter alfabetisk. Ingen kvalitetsrangering. *Andre gebyrer, kvoter og udbydervilkår kan gælde.' : 'Ingen forslag med kendt eller ukendt værktøjsstøtte. Gennemgå kataloget under Avanceret.', 'hint'));
}
$('#model-search').oninput = () => { const query = $('#model-search').value.toLocaleLowerCase(); for (const item of $('#model-select').options) item.hidden = Boolean(item.value && item.value !== $('#model-select').value && !item.textContent.toLocaleLowerCase().includes(query)); };
function updateWorkMode() {
  const mode = $('#work-mode').value;
  $('#mode-help').textContent = mode === 'plan' ? 'AI’en kan læse og stille spørgsmål. Filændringer og kommandoer er blokeret. Svar i samtalen, indtil planen passer.' : mode === 'build' ? 'AI’en bygger efter den plan, du har valgt. Handlinger kræver fortsat godkendelse.' : 'Skriv frit til kodeagenten. Filændringer, kommandoer og webopslag kræver godkendelse.';
}
$('#work-mode').onchange = () => { acceptedFingerprint = null; updateWorkMode(); };
$('#build-plan').onclick = () => {
  if (!activePlan || running) return;
  if ($('#prompt').value.trim()) { message('Send eller ryd din beskedkladde, før du bygger planen.'); return; }
  $('#work-mode').value = 'build'; updateWorkMode(); acceptedFingerprint = null;
  $('#prompt').value = 'Byg første udkast efter den plan, jeg har gennemgået. Afslut med konkrete ting, jeg skal prøve i forhåndsvisningen.';
  $('#chat-form').requestSubmit();
};
function approvalExplanation(p) {
  const explanations = {
    edit: ['Må AI’en ændre disse filer?', 'Ændringen bliver gemt i projektet. Gennemgå bagefter resultat og fildiff; der gemmes ikke automatisk en Git-version, medmindre du har valgt checkpoints.'],
    write: ['Må AI’en skrive denne fil?', 'En eksisterende fil kan blive erstattet. Gennemgå ændringen bagefter.'],
    bash: ['Må AI’en køre denne kommando?', 'Kommandoen kan ændre eller slette filer, installere pakker og kontakte tjenester med dine rettigheder. Godkend kun, hvis formålet og kommandoen giver mening.'],
    webfetch: ['Må AI’en besøge denne hjemmeside?', 'Hjemmesiden modtager forespørgslen. Det hentede indhold kan sendes videre til din valgte AI som kontekst.'],
    external_directory: ['Må AI’en få adgang uden for projektet?', 'Denne adgang omfatter en anden mappe på computeren. Den kan indeholde materiale, du ikke vil dele med modellen.'],
    grep: ['Må AI’en søge i filernes indhold?', 'Søgeresultaterne kan indgå i den kontekst, der sendes til modellen.']
  };
  const [title, effect] = explanations[p.permission] || ['Gennemgå denne handling', 'Læs målet og de tekniske detaljer, før du giver tilladelse.'];
  return { title, effect };
}
function renderRunReview(result) {
  const box = $('#run-review'); box.replaceChildren();
  if (result.mode === 'plan' && result.status === 'idle' && !result.files.length) { box.hidden = true; return; }
  box.hidden = false; requestAnimationFrame(() => box.scrollIntoView({ block: 'nearest' }));
  box.append(node('h3', result.status === 'idle' ? result.mode === 'plan' ? 'Forslaget er klar til gennemgang' : 'Opgaven er afsluttet · prøv resultatet' : 'Opgaven blev ikke afsluttet normalt'));
  if (result.unavailable) { box.append(node('p', 'Ændringsoversigten kunne ikke læses. Gennemgå filerne manuelt.')); return; }
  box.append(node('p', result.files.length ? `Registrerede ændringer i denne opgave: ${result.files.join(', ')}` : 'Ingen tekstfilændringer registreret i denne opgave.'));
  const commands = result.tools.filter(t => t.tool === 'bash');
  box.append(node('p', commands.length ? 'Kørte kommandoer (afsluttet er ikke det samme som bestået test):' : 'Ingen kommandoer kørt. Appen har ikke bekræftet funktionalitet eller tests.'));
  for (const tool of commands) box.append(node('p', `${tool.title || 'Kommando'} · ${toolStatuses[tool.status] || tool.status}`));
  if (result.tools.some(t => t.status === 'error')) box.append(node('p', 'Mindst ét værktøj fejlede eller blev afvist. Se samtalen, før du fortsætter.'));
  box.append(node('p', 'Prøv selv: åbn forhåndsvisningen, gennemfør den vigtigste opgave, og kontrollér også en smal skærmstørrelse. AI’ens beskrivelse er ikke et testbevis.', 'hint'));
  if (result.skipped) box.append(node('p', 'Nogle filer er udeladt af oversigten på grund af filtype eller størrelse.'));
  if (result.files.length) {
    const inspect = node('button', 'Gennemgå ændringer'); inspect.onclick = () => $('#changes-button').click();
    const save = node('button', 'Gem version'); save.onclick = () => $('#git-button').click(); box.append(inspect, save);
  }
}
