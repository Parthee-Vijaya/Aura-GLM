(() => {
  const $ = selector => document.querySelector(selector), view = window.ShareView;
  const dialog = $('#deployment-dialog'), form = $('#deployment-form');
  const api = async (method, input) => { const r = await window.harness[method](input); if (!r.ok) throw Error(r.error); return r.value; };
  let guides = [], review = null, last = null, context = null, step = 'destination', trail = [], busyNow = false;
  const publish = { overview: null, organisations: [], generation: 0, slugEdited: false, addressCheck: 0, loginPending: false };
  const titles = { destination: 'Hvor vil du udgive?', providers: 'Hvilken udbyder bruger du?', guides: 'Hvor vil du udgive?', login: 'Log ind med komplai', organisation: 'Hvilken organisation vil du udgive for?', connect: 'Forbind organisationen?', app: 'Hvilken app vil du udgive til?', existing: 'Hvilken app vil du opdatere?', name: 'Hvad skal appen hedde?', address: 'Hvilken adresse skal appen have?', access: 'Hvem kan åbne appen?', team: 'Hvilket Vercel-team bruger du?', subscription: 'Hvilket Azure-abonnement bruger du?', group: 'Hvilken ressourcegruppe bruger du?', project: 'Hvilket projekt vil du udgive til?', files: 'Klar til at dele den gemte version?', options: 'Hvad vil du rette?', destinationOptions: 'Hvad vil du rette ved destinationen?', account: 'Konto og adgang', providerGuide: 'Udbyderens opsætning', kind: 'Hvad skal udgives?', directory: 'Hvor ligger filerne?', functions: 'Hvor ligger webside og Functions?', review: 'Gennemgå udgivelsen', result: 'Seneste udgivelse' };
  const onward = { name: 'access', team: 'project', subscription: 'group', group: 'project', project: 'files', kind: 'directory', functions: 'files' };
  const fields = { name: ['deploy-komplai-name'], team: ['deploy-scope'], subscription: ['deploy-subscription'], group: ['deploy-group'], project: ['deploy-project'], directory: ['deploy-directory'], functions: ['deploy-frontend', 'deploy-api'] };
  const komplai = () => $('#deploy-provider').value === 'komplai';
  const chosenApp = () => publish.overview?.apps.find(app => app.id === $('#deploy-komplai-app').value);
  function rows(id, values) { $(id).replaceChildren(...values.flatMap(([label, value]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value || 'Ikke oplyst'; return [dt, dd]; })); }
  function appCard(prefix, r) { const value = view.identity(r); for (const key of ['name', 'address', 'account']) $(`#${prefix}-${key}`).textContent = value[key]; }
  function invalidate() { review = null; $('#deployment-send').disabled = true; }
  function heading(title) { $('#deployment-heading').textContent = title; dialog.setAttribute('aria-labelledby', 'deployment-heading'); if (dialog.open) { dialog.scrollTop = 0; $('#deployment-heading').focus(); } }
  function navigation() {
    $('#deployment-back').hidden = !trail.length || publish.loginPending;
    $('#deployment-provider-help').hidden = komplai() || !['team', 'subscription', 'group', 'project'].includes(step);
    const retainedSelection = step === 'existing' && Boolean(chosenApp()) || step === 'organisation' && Boolean($('#komplai-publish-org').value);
    $('#deployment-next').hidden = !(onward[step] || ['address', 'directory', 'files'].includes(step) || retainedSelection);
    $('#deployment-next').textContent = step === 'files' ? 'Gennemgå udgivelse' : step === 'existing' ? 'Brug denne app' : 'Fortsæt';
  }
  function renderStep() {
    if (step === 'review') $('#deployment-review-footer').prepend($('#deployment-feedback')); else $('#deployment-feedback-slot').append($('#deployment-feedback'));
    for (const panel of form.querySelectorAll('[data-deploy-step]')) panel.hidden = panel.dataset.deployStep !== step;
    form.hidden = ['review', 'result'].includes(step); $('#deployment-review').hidden = step !== 'review'; $('#deployment-result').hidden = step !== 'result';
    navigation();
    $('#deployment-intro').textContent = step === 'destination' ? 'Giv andre et link til dit projekt.' : step === 'files' ? (komplai() ? 'Filerne sendes til organisationens app hos komplai.' : 'Filerne sendes til et testmiljø hos den valgte udbyder.') : '';
    $('#deployment-intro').hidden = !$('#deployment-intro').textContent;
    if (step === 'files') {
      $('#deployment-scope').textContent = view.scope(context);
      const app = chosenApp(); $('#deploy-komplai-current').hidden = !komplai() || !app;
      if (app) $('#deploy-komplai-current').textContent = `${new URL(app.url).hostname} · ${app.visibility === 'public' ? 'Alle med linket' : 'Organisationen'}. En ny version erstatter den udgivne.`;
    }
    if (step === 'app') {
      $('#komplai-publish-org-name').textContent = publish.overview?.organisationName || '';
      $('#komplai-publish-address').textContent = publish.overview?.address || '';
      $('#deploy-komplai-choose').hidden = !publish.overview?.apps.length;
    }
    if (step === 'destinationOptions') $('#deployment-account-options').open = !komplai();
    if (step === 'account') {
      const app = chosenApp(); $('#deployment-account-name').textContent = publish.overview?.organisationName || '';
      $('#deployment-account-access').textContent = app ? `${app.name}: ${app.visibility === 'private' ? 'Organisationens medlemmer' : 'Alle med linket'}.` : 'Forbundet til komplai Run.';
      $('#deploy-komplai-access').hidden = !app;
    }
    heading(titles[step] || titles.destination);
  }
  function go(next, { remember = true, clear = true } = {}) {
    if (remember && step !== next) trail.push(step);
    step = next; if (clear) $('#deployment-feedback').textContent = ''; renderStep();
  }
  async function busy(fn) {
    if (busyNow) return; busyNow = true; $('#deployment-fields').disabled = true;
    for (const id of ['check', 'open', 'portal', 'new']) $('#deployment-' + id).disabled = true;
    $('#deployment-feedback').textContent = 'Arbejder …';
    try { await fn(); }
    catch (error) {
      invalidate();
      if (step === 'review') go('files', { remember: false });
      $('#deployment-feedback').textContent = error.message;
    } finally {
      busyNow = false; $('#deployment-fields').disabled = false;
      $('#deployment-check').disabled = !last?.id; $('#deployment-open').disabled = !last?.url;
      $('#deployment-portal').disabled = !last?.target?.portal; $('#deployment-new').disabled = false;
    }
  }
  function showGuide(selector, id) {
    const option = guides.find(item => item.id === id), target = $(selector); target.replaceChildren(); if (!option) return;
    const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
    target.append(text('p', option.summary));
    const detail = document.createElement('details'); detail.append(text('summary', 'Opsætning, data og aftaler'), text('p', option.scope));
    const steps = document.createElement('ol'); steps.append(...option.steps.map(value => text('li', value))); detail.append(steps, text('p', option.data), text('p', 'Priser og eventuelle gratis kvoter følger din konto. Kontrollér vilkårene hos udbyderen.'));
    for (const kind of Object.keys(option.links)) { const button = text('button', { guide: 'Åbn udbyderens vejledning', data: 'Se aftaler og databehandling', region: 'Se regioner' }[kind]); button.type = 'button'; button.className = 'text-button'; button.onclick = () => api('deploymentGuideOpen', { id, kind }).catch(error => { $('#deployment-feedback').textContent = error.message; }); detail.append(button); }
    detail.append(text('small', 'Kilder gennemgået ' + new Date(option.checkedAt + 'T12:00:00Z').toLocaleDateString('da-DK') + '. Jeres konto og aftale er ikke kontrolleret.')); target.append(detail);
    if (!option.integrated) target.prepend(text('p', 'Udgives hos udbyderen. Aura uploader ikke herfra.'));
  }
  async function loadGuides() { guides = await api('deploymentGuides'); $('#hosting-guide-choice').replaceChildren(...guides.filter(item => !item.integrated).map(item => new Option(item.name, item.id))); showGuide('#hosting-guide-other', $('#hosting-guide-choice').value); }
  $('#hosting-guide-choice').onchange = () => showGuide('#hosting-guide-other', $('#hosting-guide-choice').value);
  function modes() {
    const azure = $('#deploy-provider').value === 'azure';
    for (const option of $('#deploy-mode').options) option.disabled = komplai() ? option.value !== 'static' : azure ? option.value === 'source' : option.value === 'functions';
    if ($('#deploy-mode').selectedOptions[0].disabled) $('#deploy-mode').value = 'static';
    $('#deployment-account').hidden = !komplai(); $('#deployment-provider-settings').hidden = komplai();
    $('#deployment-change-app').hidden = !komplai(); $('#deployment-account-options > summary').hidden = !komplai();
    $('#deployment-change-destination').textContent = komplai() ? 'Destination og app' : 'Destination og opsætning';
    $('#deployment-file-options').textContent = komplai() ? 'Ret filer og indstillinger' : 'Filer og opsætning';
  }
  function input() {
    if (komplai()) { const app = chosenApp(), visibility = app?.visibility || document.querySelector('[name="komplai-visibility"]:checked')?.value; return { provider: 'komplai', directory: $('#deploy-directory').value, visibility, ...(app ? { appId: app.id } : { name: $('#deploy-komplai-name').value, ...(publish.overview?.slugs ? { slug: $('#deploy-komplai-slug').value } : {}) }) }; }
    return { provider: $('#deploy-provider').value, project: $('#deploy-project').value, scope: $('#deploy-scope').value, subscription: $('#deploy-subscription').value, group: $('#deploy-group').value, mode: $('#deploy-mode').value, directory: $('#deploy-directory').value, frontend: $('#deploy-frontend').value, api: $('#deploy-api').value };
  }
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0].toUpperCase()).join('');
  function suggest(name) { let label = name.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); if (label.length > 40) { const cut = label.slice(0, 41), boundary = cut.lastIndexOf('-'); label = (boundary >= 3 ? cut.slice(0, boundary) : cut.slice(0, 40)).replace(/-+$/, ''); } return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(label) && !label.includes('--') ? label : ''; }
  function addressPreview() { $('#deploy-komplai-address-preview').textContent = !publish.overview?.slugs ? '' : $('#deploy-komplai-slug').value ? `Adresse: ${$('#deploy-komplai-slug').value}.${publish.overview.address}` : 'Appen får en tilfældig adresse.'; $('#deploy-komplai-edit-address').hidden = !publish.overview?.slugs; }
  function publishNotice(text = '', tone = 'info') { const el = $('#komplai-publish-feedback'); el.textContent = text; el.dataset.tone = text ? tone : ''; }
  function resetSignin() { publish.overview = null; publish.loginPending = false; $('#komplai-publish-signin').dataset.stage = 'start'; $('#komplai-publish-login').hidden = false; $('#komplai-publish-cancel').hidden = true; }
  function fillApps() {
    const keep = $('#deploy-komplai-app').value, query = $('#deploy-komplai-search').value.toLocaleLowerCase('da');
    const apps = (publish.overview?.apps || []).filter(app => `${app.name} ${new URL(app.url).hostname}`.toLocaleLowerCase('da').includes(query));
    $('#deploy-komplai-app').replaceChildren(new Option('Vælg en app', ''), ...apps.map(app => new Option(`${app.name} · ${new URL(app.url).hostname}`, app.id)));
    if (apps.some(app => app.id === keep)) $('#deploy-komplai-app').value = keep;
    $('#deploy-komplai-empty').hidden = Boolean(apps.length); if (step === 'existing') navigation();
  }
  async function loadPublish() {
    const state = await api('komplaiPublishState');
    if (!state.connected || state.expired) { resetSignin(); if (state.expired) publishNotice('Udgivelsesadgangen er udløbet. Log ind med komplai igen.', 'error'); return false; }
    try { publish.overview = await api('komplaiPublishOverview'); fillApps(); $('#deploy-komplai-suffix').textContent = '.' + publish.overview.address; addressPreview(); return true; }
    catch (error) { resetSignin(); publishNotice(error.message, 'error'); return false; }
  }
  async function chooseProvider(provider) { invalidate(); $('#deploy-provider').value = provider; modes(); if (provider === 'komplai') { const ready = await loadPublish(); go(ready ? 'app' : 'login'); } else go(provider === 'azure' ? 'subscription' : 'team'); }
  for (const button of form.querySelectorAll('[data-provider]')) button.onclick = () => busy(() => chooseProvider(button.dataset.provider));
  $('#deployment-other').onclick = () => go('providers'); $('#deployment-guides').onclick = () => go('guides');
  function showOrganisation() {
    const organisation = publish.organisations.find(item => item.id === $('#komplai-publish-org').value); if (!organisation) return;
    const avatar = document.createElement('span'), name = document.createElement('span'), line = document.createElement('span');
    avatar.className = 'komplai-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = initials(organisation.name); name.className = 'komplai-account-name'; name.textContent = organisation.name; line.className = 'komplai-balance'; line.textContent = 'Udgiver til ' + organisation.publishing.address; $('#komplai-publish-tile').replaceChildren(avatar, name, line);
    $('#komplai-publish-ai-row').hidden = !organisation.coding; $('#komplai-publish-ai').checked = false; go('connect');
  }
  $('#komplai-publish-org').onchange = () => { navigation(); showOrganisation(); };
  $('#komplai-publish-login').onclick = async () => {
    const generation = ++publish.generation; publish.loginPending = true; $('#komplai-publish-login').hidden = true; $('#komplai-publish-cancel').hidden = false; $('#komplai-publish-signin').dataset.stage = 'waiting'; $('#deployment-back').hidden = true; publishNotice('Fortsæt i browseren. Aura venter på dit login.', 'wait'); $('#komplai-publish-cancel').focus();
    try {
      const result = await api('komplaiLogin'); if (generation !== publish.generation || !dialog.open) return; publish.loginPending = false;
      publish.organisations = result.organisations.filter(item => item.publishing);
      if (!publish.organisations.length) { resetSignin(); renderStep(); publishNotice('Ingen af dine organisationer har komplai Run. Bed jeres administrator kontakte komplai.', 'error'); return; }
      $('#komplai-publish-signin').dataset.stage = 'organisation'; publishNotice();
      $('#komplai-publish-org').replaceChildren(new Option('Vælg organisation', ''), ...publish.organisations.map(item => new Option(item.name, item.id)));
      if (publish.organisations.length === 1) { $('#komplai-publish-org').value = publish.organisations[0].id; showOrganisation(); } else go('organisation');
    } catch (error) { if (generation === publish.generation && dialog.open) { resetSignin(); renderStep(); publishNotice(error.message, 'error'); } }
  };
  function cancelLogin() { ++publish.generation; publish.loginPending = false; window.harness.komplaiCancel(); resetSignin(); }
  $('#komplai-publish-cancel').onclick = () => { cancelLogin(); renderStep(); publishNotice('Login blev afbrudt. Du kan prøve igen.'); };
  $('#komplai-publish-confirm').onclick = () => busy(async () => { const organisation = publish.organisations.find(item => item.id === $('#komplai-publish-org').value); if (!organisation) throw Error('Vælg organisation igen.'); await api('komplaiConnect', { organisationId: organisation.id, publishing: true, coding: Boolean(organisation.coding && $('#komplai-publish-ai').checked) }); trail = ['destination']; if (!await loadPublish()) { go('login', { remember: false }); return; } window.dispatchEvent(new CustomEvent('harness:komplai-connected')); go('app', { remember: false }); });
  $('#komplai-publish-logout').onclick = () => busy(async () => { await api('komplaiPublishDisconnect'); invalidate(); resetSignin(); go('login'); publishNotice('Du er logget ud af komplai Run.', 'success'); window.dispatchEvent(new CustomEvent('harness:komplai-connected')); });
  $('#deploy-komplai-create').onclick = () => { invalidate(); $('#deploy-komplai-app').value = ''; for (const radio of form.querySelectorAll('[name="komplai-visibility"]')) radio.checked = false; if (!$('#deploy-komplai-name').value) $('#deploy-komplai-name').value = context?.projectName || ''; if (!publish.slugEdited) $('#deploy-komplai-slug').value = suggest($('#deploy-komplai-name').value); addressPreview(); go('name'); };
  $('#deploy-komplai-choose').onclick = () => { $('#deploy-komplai-search').value = ''; fillApps(); go('existing'); };
  $('#deploy-komplai-search').oninput = fillApps;
  $('#deploy-komplai-app').onchange = () => { invalidate(); navigation(); if (chosenApp()) { for (const radio of form.querySelectorAll('[name="komplai-visibility"]')) radio.checked = false; go('files'); } };
  $('#deploy-komplai-access').onclick = () => busy(async () => { await api('deploymentOpen', { komplaiApp: chosenApp()?.id }); invalidate(); $('#deployment-feedback').textContent = 'Ret adgangen i komplai. Næste gennemgang henter appens aktuelle adgang.'; });
  $('#deploy-komplai-edit-address').onclick = () => { checkAddress(); go('address'); };
  $('#deploy-komplai-name').oninput = () => { if (!publish.slugEdited) $('#deploy-komplai-slug').value = suggest($('#deploy-komplai-name').value); addressPreview(); };
  $('#deploy-komplai-slug').oninput = () => { publish.slugEdited = true; $('#deploy-komplai-slug').value = $('#deploy-komplai-slug').value.toLowerCase(); addressPreview(); checkAddress(); };
  async function checkAddress() {
    const generation = ++publish.addressCheck, slug = $('#deploy-komplai-slug').value, help = $('#deploy-komplai-slug-help');
    if (!slug) { help.textContent = 'Lad feltet stå tomt, så får appen en tilfældig adresse.'; help.dataset.tone = ''; return; }
    help.textContent = 'Kontrollerer adressen …'; help.dataset.tone = ''; await new Promise(resolve => setTimeout(resolve, 250)); if (generation !== publish.addressCheck || !publish.overview) return;
    try { const r = await api('komplaiPublishAddress', { slug }); if (generation !== publish.addressCheck) return; help.textContent = r.available ? `Appen får adressen ${slug}.${publish.overview.address}` : r.message; help.dataset.tone = r.available ? 'ok' : 'error'; } catch (error) { if (generation === publish.addressCheck) { help.textContent = error.message; help.dataset.tone = 'error'; } }
  }
  for (const radio of form.querySelectorAll('[name="komplai-visibility"]')) { const proceed = () => { if (step === 'access' && radio.checked) { invalidate(); go('files'); } }; radio.onclick = proceed; radio.onchange = proceed; }
  $('#deployment-file-options').onclick = () => go('options');
  function providerHelp() { showGuide('#hosting-guide-setup', $('#deploy-provider').value); go('providerGuide'); }
  $('#deployment-provider-help').onclick = providerHelp; $('#deployment-provider-settings').onclick = providerHelp;
  $('#deployment-change-files').onclick = () => { invalidate(); go(komplai() ? 'directory' : 'kind'); };
  $('#deployment-change-destination').onclick = () => go('destinationOptions');
  $('#deployment-change-app').onclick = () => busy(async () => { invalidate(); $('#deploy-komplai-search').value = ''; if (await loadPublish()) go('app'); else go('login'); });
  $('#deployment-select-destination').onclick = () => { invalidate(); go('destination'); };
  $('#deployment-account').onclick = () => go('account');
  $('#deployment-back').onclick = () => { invalidate(); const previous = trail.pop(); if (previous) go(previous, { remember: false }); };
  form.addEventListener('input', event => { if (['hosting-guide-choice', 'komplai-publish-org', 'komplai-publish-ai', 'deploy-komplai-search'].includes(event.target.id)) return; invalidate(); modes(); });
  async function prepareReview() {
    invalidate();
    if (komplai() && $('#deploy-komplai-app').value) { const selected = $('#deploy-komplai-app').value; publish.overview = await api('komplaiPublishOverview'); $('#deploy-komplai-search').value = ''; fillApps(); if (!publish.overview.apps.some(app => app.id === selected)) { go('existing'); throw Error('Appen findes ikke længere. Vælg en app igen.'); } $('#deploy-komplai-app').value = selected; }
    const r = await api('deploymentReview', input()); review = r.token; context = r.context || context;
    appCard('deployment-review-app', r);
    if (r.config.provider === 'komplai') rows('#deployment-summary', [['Gemt version', view.version(r)], ['Udgivelse', r.target.created ? 'Opretter en ny app' : 'Erstatter den udgivne version'], ['Hvem kan åbne den', r.config.visibility === 'private' ? 'Kun organisationen. Medlemmer logger ind med komplai.' : 'Alle med linket. Appen bliver offentlig. Undlad fortrolige oplysninger.'], ['Placering', r.target.region], ['Omkostninger', r.cost]]);
    else rows('#deployment-summary', [['Gemt version', view.version(r)], ['Destination', view.destination(r) + (r.config.provider === 'azure' ? ' · erstatter indholdet i testmiljøet' : '')], ...(r.config.mode === 'source' ? [['Build', 'Udbyderen bygger kildekoden og kan køre dens installations- og buildscripts med testmiljøets værdier.']] : []), ['Adgang', `${r.target.access || 'Udbyderen oplyser ikke adgangsreglerne.'} Testpersonens adgang er ikke afprøvet.`], ['Omkostninger', r.cost]]);
    rows('#deployment-details', [['Versionens ID', r.head], ['Destinationens ID', r.target.id || 'Oprettes ved udgivelse'], ['Konto / abonnement', r.config.provider === 'komplai' ? r.target.owner : r.config.scope || r.config.subscription || 'Fra dit eksisterende login'], ['Indhold', `${r.files.length} filer · ${r.bytes} bytes · ${r.hash}`], ['Placering', r.target.region], ['Miljøvariabler', r.target.environmentNote || r.target.environmentKeys?.join(', ') || 'Ingen navne rapporteret. Kontrollér opsætningen hos udbyderen.'], ['Build', r.build], ['Materiale', r.material], ['Projekt', view.scope(context)]]);
    $('#deployment-files').replaceChildren(...r.files.map(file => { const li = document.createElement('li'); li.textContent = file; return li; }));
    showGuide('#hosting-guide-current', r.config.provider); $('#deployment-technical').open = false; $('#deployment-send').disabled = false; $('#deployment-send').textContent = r.config.provider === 'komplai' ? 'Udgiv' : 'Udgiv til test'; go('review');
    $('#deployment-feedback').textContent = 'Ingen filer er uploadet endnu.';
  }
  form.onsubmit = event => {
    event.preventDefault();
    if (!(fields[step] || []).every(id => $('#' + id).reportValidity())) return;
    if (step === 'files') return busy(prepareReview);
    if (step === 'existing' && chosenApp()) { go('files'); return; }
    if (step === 'organisation' && $('#komplai-publish-org').value) { showOrganisation(); return; }
    if (step === 'address') { const previous = trail.pop(); go(previous || 'name', { remember: false }); return; }
    if (step === 'directory') { go($('#deploy-mode').value === 'functions' ? 'functions' : 'files'); return; }
    if (onward[step]) go(onward[step]);
  };
  $('#deployment-edit').onclick = () => { invalidate(); trail = ['destination']; go('files', { remember: false }); };
  $('#deployment-settings').onclick = () => busy(async () => { await api('deploymentOpen', 'settings'); invalidate(); go('files', { remember: false }); $('#deployment-feedback').textContent = 'Indstillingerne er åbnet. Gennemgå udgivelsen igen, når du er klar.'; });
  function receipt(r) {
    last = r; if (!r) return;
    const isKomplai = r.config.provider === 'komplai';
    appCard('deployment-result-app', r);
    const summary = view.receiptSummary(r); rows('#deployment-checks', view.checks(r));
    for (const [key, box, title, note] of [['publication', '#deployment-publication', '#deployment-state', '#deployment-state-note'], ['access', '#deployment-access', '#deployment-result-access', '#deployment-access-note']]) { $(box).dataset.tone = summary[key].tone; $(title).textContent = summary[key].title; $(note).textContent = summary[key].detail; }
    $('#deployment-verification').dataset.tone = summary.verification.tone; $('#deployment-verification').hidden = summary.verification.hidden === true;
    $('#deployment-verification h4').textContent = summary.verification.title; $('#deployment-verification p').textContent = summary.verification.detail;
    $('#deployment-verification .deployment-status-symbol').textContent = summary.verification.tone === 'positive' ? '✓' : summary.verification.tone === 'warning' ? '!' : 'i';
    rows('#deployment-receipt', [['Gemt version', view.version(r)], ['Upload påbegyndt', view.time(r.startedAt)], ['Versionens ID', r.head], ['Indholdets fingeraftryk', r.hash], ['Senest registrerede udbyderstatuskode', r.state], ['Adresse', r.url], ['Adgang rapporteret ved upload', r.target.access], ['Seneste kontrol', r.checkedAt ? view.time(r.checkedAt) : 'Ingen kontrol registreret']]);
    const primary = $('#deployment-main-actions'), secondary = $('#deployment-extra-actions');
    for (const id of ['check', 'open', 'portal', 'new']) { const button = $('#deployment-' + id); button.classList.remove('primary'); secondary.append(button); }
    $('#deployment-open').textContent = isKomplai ? 'Åbn appen' : 'Åbn testlink'; $('#deployment-portal').textContent = isKomplai ? 'Åbn i komplai' : 'Åbn hos udbyderen';
    $('#deployment-check').hidden = !r.id; $('#deployment-open').hidden = !r.url; $('#deployment-portal').hidden = !r.target.portal;
    const problem = !r.id || ['UNKNOWN', 'ERROR'].includes(r.state) || r.checks?.provider.status === 'unknown';
    const checked = r.checks?.provider.status === 'checked' && r.state === 'READY';
    const first = problem ? 'portal' : r.state === 'READY' && r.url ? 'open' : 'check'; primary.append($('#deployment-' + first)); $('#deployment-' + first).classList.add('primary');
    if (problem && r.id) primary.append($('#deployment-check')); else if (first === 'open') primary.append($('#deployment-' + (checked ? 'new' : 'check')));
    $('#deployment-receipt-details').open = false; go('result', { remember: false });
  }
  async function followLastApp() {
    if (last?.config?.provider !== 'komplai') return false;
    $('#deploy-provider').value = 'komplai'; $('#deploy-komplai-search').value = ''; modes(); if (!await loadPublish()) { go('login'); return true; }
    const appId = last.appId || last.config.appId;
    if (publish.overview.apps.some(app => app.id === appId)) { $('#deploy-komplai-app').value = appId; trail = ['destination', 'app']; go('files', { remember: false }); } else go('app');
    return true;
  }
  $('#deployment-new').onclick = () => busy(async () => { invalidate(); trail = []; if (!await followLastApp()) go('files', { remember: false }); });
  $('#deployment-send').onclick = () => busy(async () => {
    const token = review; invalidate(); if (!token) return;
    $('#deployment-feedback').textContent = 'Udgiver den gennemgåede version. Lukning af vinduet annullerer ikke udgivelsen.';
    try { receipt(await api('deploymentSend', token)); $('#deployment-feedback').textContent = 'Uploadsvaret er gemt.'; }
    finally { const state = await api('deploymentState'); if (state.last) receipt(state.last); }
  });
  $('#deployment-check').onclick = () => busy(async () => { receipt(await api('deploymentCheck')); });
  $('#deployment-open').onclick = () => busy(async () => { await api('deploymentOpen', 'site'); $('#deployment-feedback').textContent = 'Appen er åbnet i din browser.'; });
  $('#deployment-portal').onclick = () => busy(async () => { await api('deploymentOpen', 'portal'); $('#deployment-feedback').textContent = 'Oversigten er åbnet. Kontrollér udgivelsen dér, før du uploader igen.'; });
  $('#deploy-button').onclick = () => {
    dialog.showModal(); invalidate(); trail = []; $('#deployment-technical').open = false; $('#deployment-receipt-details').open = false;
    busy(async () => { const state = await api('deploymentState'); context = state.context; await loadGuides(); form.reset(); publish.slugEdited = false; publish.overview = null;
      if (state.config) { for (const key of ['provider', 'project', 'scope', 'subscription', 'group', 'mode', 'directory', 'frontend', 'api']) if (state.config[key] !== undefined) $('#deploy-' + key).value = state.config[key] || ''; }
      modes(); last = null; go('destination', { remember: false }); receipt(state.last);
    });
  };
  dialog.addEventListener('close', () => { invalidate(); ++publish.addressCheck; if (publish.loginPending || ['organisation', 'connect'].includes(step)) cancelLogin(); $('#deploy-button').focus(); });
})();
