const $ = selector => document.querySelector(selector);
let current = null, revision = null, polling = false, state = null, modelRequest = 0, acceptedFingerprint = null, pendingSend = null, running = false;
let skillList = [], roles = new Map(), parts = new Map();
function message(text, error = false) { const dialog = document.querySelector('dialog[open]'); if (dialog) { let notice = dialog.querySelector('.dialog-notice'); if (!notice) { notice = document.createElement('p'); notice.className = 'dialog-notice'; notice.setAttribute('role', 'status'); dialog.append(notice); } notice.textContent = text; }  $('#message').textContent = text; $('#message').classList.toggle('error', error); $('#message').hidden = false; }
async function call(method, value) { const result = await window.harness[method](value); if (!result.ok) throw new Error(result.error); return result.value; }
async function action(fn) { $('#message').hidden = true; try { return await fn(); } catch (error) { message(error.message, true); } }
function node(tag, text, className) { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; }
function option(value, label) { const el = node('option', label); el.value = value; return el; }
function appendMessage(text, role = 'assistant') { const el = node('div', text, `chat-message ${role}`); $('#messages').append(el); $('#chat-content').scrollTop = $('#chat-content').scrollHeight; return el; }
let setupActive = true, setupGeneration = 0, verifiedConnection = '', recovery = '', lastSentText = '';
let preferredConnection = '', autoConnect = false;
try { preferredConnection = localStorage.getItem('harness.preferredConnection') || ''; } catch {}
function setupControls() {
  const id = $('#setup-connection').value;
  $('#setup-test').disabled = !id || running;
  $('#setup-continue').disabled = !id || verifiedConnection !== id || running;
  $('#new').disabled = running || setupActive; $('#open').disabled = running || setupActive;
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
function showSetup(reason = '') {
  setupActive = true; $('#setup').hidden = false; $('#workspace').hidden = true; $('#onboarding').hidden = true;
  $('#view-title').textContent = 'Opsætning'; $('#setup-reason').textContent = reason; $('#setup-reason').hidden = !reason;
  renderSetup(); action(setupGit); $('#setup-title').focus();
}
function connectionFailed(reason) {
  verifiedConnection = ''; ++setupGeneration; acceptedFingerprint = null; pendingSend = null;
  if (state?.connections.some(c => c.id === $('#connection-select').value)) $('#setup-connection').value = $('#connection-select').value;
  recovery = `AI-forbindelsen skal gennemgås: ${reason} Dit projekt og din kladde er bevaret.`;
  if (!running) { showSetup(recovery); recovery = ''; }
}
async function leaveSetup(useAI) {
  const id = $('#setup-connection').value;
  if (useAI && (!id || verifiedConnection !== id)) return;
  if (useAI) { preferredConnection = id; try { localStorage.setItem('harness.preferredConnection', id); } catch {} }
  autoConnect = useAI;
  setupActive = false; $('#setup').hidden = true; $('#workspace').hidden = !current; $('#onboarding').hidden = Boolean(current);
  $('#view-title').textContent = current ? 'Arbejdsområde' : 'Projektopstart'; setupControls();
  if (useAI && current) { const saved = $('#connection-select').value === id ? { modelID: $('#model-select').value, routeID: $('#route-select').value } : {}; $('#connection-select').value = id; await loadModels(saved); }
  (current ? $('#prompt') : $('#name')).focus();
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
  setupActive = false; $('#setup').hidden = true; setupControls();
  current = project; revision = null; acceptedFingerprint = null; roles.clear(); parts.clear();
  $('#messages').replaceChildren(); $('#approvals').replaceChildren(); $('#prompt').value = '';
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
  renderSetup();
}
function updateProvider() {
  const definition = state?.definitions[$('#provider-kind').value]; if (!definition) return;
  $('#base-url').value = definition.baseURL; $('#base-url').readOnly = !['ollama', 'compatible'].includes($('#provider-kind').value);
  if (!$('#connection-id').value) $('#connection-name').value = definition.name;
}
async function loadModels(saved = {}) {
  const id = $('#connection-select').value; const generation = ++modelRequest; acceptedFingerprint = null;
  $('#model-select').replaceChildren(option('', id ? 'Henter modeller …' : 'Vælg en forbindelse først')); $('#route-row').hidden = true;
  if (!id) return;
  try {
    const models = await call('models', id); if (generation !== modelRequest) return;
    $('#model-select').replaceChildren(option('', 'Vælg model'));
    for (const model of models) {
      const free = model.price && Number(model.price.prompt) === 0 && Number(model.price.completion) === 0;
      $('#model-select').append(option(model.id, `${model.name}${free ? ' · gratis*' : ''}`));
    }
    if (saved.modelID && models.some(m => m.id === saved.modelID)) { $('#model-select').value = saved.modelID; await loadRoutes(saved.routeID); }
    $('#connection-status').textContent = state.connections.find(c => c.id === id)?.name || 'Ingen model valgt';
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
function selection() { return { connectionID: $('#connection-select').value, modelID: $('#model-select').value, routeID: $('#route-select').value, references: [...document.querySelectorAll('#reference-choices input:checked')].map(el => el.value) }; }
const detailLabels = { connection: 'Forbindelse', model: 'Model', endpoint: 'Serveradresse', recipients: 'Modtagere', region: 'Behandlingssted', retention: 'Opbevaring', training: 'Brug til træning', price: 'Pris og gratisbegrænsninger', capabilities: 'Modelmuligheder', material: 'Hvad sendes?', references: 'Udvalgte private referencer', skills: 'Aktive skills', localStorage: 'Lokal historik og yderligere netværk', security: 'Forbindelsens sikkerhed', source: 'Kilde', checkedAt: 'Dokumentation kontrolleret', evidence: 'Grundlag' };
function showData(data, canSend) {
  $('#data-details').replaceChildren();
  for (const [key, label] of Object.entries(detailLabels)) { $('#data-details').append(node('dt', label), node('dd', Array.isArray(data[key]) ? data[key].join(', ') || 'Ingen' : data[key])); }
  $('#accept-send').hidden = !canSend; $('#data-dialog').showModal();
}
async function sendNow(data, text) {
  $('#data-dialog').close(); setRunning(true, 'Starter agent …');
  lastSentText = text; appendMessage(text, 'user'); $('#prompt').value = '';
  try { await call('send', { text, fingerprint: data.fingerprint }); acceptedFingerprint = data.fingerprint; }
  catch (error) { $('#prompt').value = text; setRunning(false, 'Fejl'); appendMessage(error.message, 'error'); connectionFailed(error.message); throw error; }
}
function setRunning(value, status) {
  running = value; $('#run-status').textContent = status; $('#send').disabled = value; $('#stop').hidden = !value;
  for (const selector of ['#connection-select', '#model-select', '#route-select', '#new', '#open', '#connections-button', '#skills-button', '#git-button']) $(selector).disabled = value;
  setupControls();
  if (!value && recovery) { const reason = recovery; recovery = ''; showSetup(reason); }
}
function showSkill() {
  const skill = skillList.find(s => s.id === $('#skill-select').value); if (!skill) return;
  $('#skill-content').value = skill.content; $('#skill-enabled').checked = skill.enabled; $('#skill-source').textContent = `${skill.source} · ${skill.customized ? 'lokal tilpasning' : 'fælles version'}`;
}
function partElement(id, role) {
  if (!parts.has(id)) parts.set(id, appendMessage('', role));
  return parts.get(id);
}
window.harness.onEvent(event => {
  const p = event.properties || {};
  if (event.type === 'git.checkpoint') { appendMessage(event.message, 'system'); return; }
  if (event.type === 'preview.ready') return showPreview(event.url);
  if (event.type === 'session.new') { roles.clear(); parts.clear(); appendMessage('Ny modelsession. Tidligere samtaler overføres ikke ved skift af forbindelse, model, referencer eller skills.', 'system'); }
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
    if (part.type === 'tool') partElement(part.id, 'tool').textContent = `${part.tool} · ${part.state?.status || ''}${part.state?.title ? '\n' + part.state.title : ''}`;
  }
  if (event.type === 'message.part.delta' && p.field === 'text' && roles.get(p.messageID) !== 'user') partElement(p.partID, 'assistant').textContent += p.delta;
  if (event.type === 'permission.asked') {
    const box = node('section', undefined, 'approval'); box.dataset.id = p.id;
    box.append(node('strong', `Godkend handling: ${p.permission}`), node('pre', JSON.stringify({ paths: p.patterns, details: p.metadata }, null, 2)));
    box.append(node('p', 'En godkendt kommando kan læse filer og kontakte tjenester med din brugers rettigheder. Agenten er ikke en OS-sandbox.', 'hint'));
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
$('#new').onclick = () => action(async () => { await call('newProject'); current = null; revision = null; acceptedFingerprint = null; showPreview(null); $('#workspace').hidden = true; $('#onboarding').hidden = false; $('#skills-button').disabled = true; $('#view-title').textContent = 'Projektopstart'; $('#active-project').textContent = 'Intet projekt åbent'; $('#active-project').classList.remove('active'); $('#create-form').reset(); $('#color-value').value = $('#color').value; showAssets([]); $('#name').focus(); });
$('#create-form').onsubmit = event => { event.preventDefault(); action(async () => { $('#create').disabled = true; try { await displayProject(await call('createProject', { name: $('#name').value, purpose: $('#purpose').value, color: $('#color').value, links: $('#links').value.split('\n').map(line => line.trim()).filter(Boolean), tests: $('#tests').value })); } finally { $('#create').disabled = false; } }); };
$('#connections-button').onclick = () => action(async () => { state = await call('connectionState'); renderConnections(); updateProvider(); $('#connections-dialog').showModal(); });
$('#provider-kind').onchange = updateProvider;
$('#reset-connection').onclick = () => { $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); };
$('#connection-form').onsubmit = event => { event.preventDefault(); action(async () => { $('#save-connection').disabled = true; const input = { id: $('#connection-id').value || undefined, kind: $('#provider-kind').value, name: $('#connection-name').value, baseURL: $('#base-url').value, apiKey: $('#api-key').value, clearKey: $('#clear-key').checked }; $('#api-key').value = ''; try { state = await call('saveConnection', input); ++setupGeneration; verifiedConnection = ''; acceptedFingerprint = null; renderConnections(); $('#connection-feedback').textContent = 'Forbindelsen er gemt. Brug Test / hent modeller for at kontrollere serveren.'; $('#connection-form').reset(); $('#connection-id').value = ''; updateProvider(); } finally { $('#save-connection').disabled = false; } }); };
$('#connection-select').onchange = () => { autoConnect = true; action(() => loadModels()); }; $('#model-select').onchange = () => action(() => loadRoutes());
$('#data-button').onclick = () => action(async () => showData(await call('prepare', selection()), false));
$('#chat-form').onsubmit = event => { event.preventDefault(); action(async () => { const text = $('#prompt').value.trim(); if (!text || running) return; if (!$('#connection-select').value) { showSetup('Vælg en AI-forbindelse for at sende beskeden. Din kladde er bevaret.'); return; } if (!$('#model-select').value || (!$('#route-row').hidden && !$('#route-select').value)) { message('Vælg model og eventuel modeludbyder over samtalen.', true); return; } $('#send').disabled = true; try { const data = await call('prepare', selection()); if (data.fingerprint === acceptedFingerprint) await sendNow(data, text); else { pendingSend = { data, text }; showData(data, true); } } catch (error) { connectionFailed(error.message); throw error; } finally { $('#send').disabled = running; } }); };
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
action(async () => { state = await call('connectionState'); renderConnections(); updateProvider(); showSetup(); });

async function loadDesigns() { const designs = await call('listDesigns'); $('#design-select').replaceChildren(option('', 'Vælg en tidligere gemt pakke'), ...designs.map(d => option(d.id, `${d.name} · ${d.files} filer`))); }
$('#save-design').onclick = () => action(async () => { await call('saveDesign', { name: $('#design-name').value, color: $('#color').value, links: $('#links').value.split('\n').map(s => s.trim()).filter(Boolean) }); await loadDesigns(); message('Designpakken er gemt lokalt og kan vælges i andre projekter.'); });
$('#design-select').onchange = () => action(async () => { if (!$('#design-select').value) return; const design = await call('applyDesign', $('#design-select').value); $('#color').value = design.color; $('#color-value').value = design.color; $('#links').value = design.links.join('\n'); showAssets(design.assets); });
action(loadDesigns);

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
