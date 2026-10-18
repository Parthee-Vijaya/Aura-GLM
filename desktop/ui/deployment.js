(() => {
  const $ = s => document.querySelector(s), view = window.ShareView;
  let guides = [];
  let review = null, last = null, focus = null, context = null;
  // komplai Publish: kontoen, organisationens adresse og dine apps hos komplai.
  let publish = { state: null, overview: null, organisations: [], generation: 0, slugEdited: false, addressCheck: 0 };
  const api = async (method, input) => { const r = await window.harness[method](input); if (!r.ok) throw Error(r.error); return r.value; };
  function rows(id, values) {
    $(id).replaceChildren(...values.flatMap(([label, value]) => {
      const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value || 'Ikke oplyst'; return [dt, dd];
    }));
  }
  async function busy(fn) {
    $('#deployment-fields').disabled = true;
    for (const id of ['check', 'open', 'portal', 'portal-details', 'new']) $('#deployment-' + id).disabled = true;
    $('#deployment-feedback').textContent = 'Arbejder …';
    try { await fn(); }
    catch (e) { invalidate(); if ($('#deployment-result').hidden) showForm(); $('#deployment-feedback').textContent = e.message; }
    finally {
      $('#deployment-fields').disabled = false;
      $('#deployment-check').disabled = !last?.id; $('#deployment-open').disabled = !last?.url;
      $('#deployment-portal').disabled = !last?.target?.portal; $('#deployment-new').disabled = false; $('#deployment-portal-details').disabled = !last?.target?.portal;
      if (focus) { const target = focus; focus = null; target.focus(); }
    }
  }
  function invalidate() { review = null; $('#deployment-review').hidden = true; $('#deployment-ack').checked = false; $('#deployment-send').disabled = true; }
  const komplaiSelected = () => $('#deploy-provider').value === 'komplai';
  function showForm() { invalidate(); $('#deployment-form').hidden = false; $('#deployment-result').hidden = true; focus = komplaiSelected() ? (publish.overview ? $('#deploy-komplai-app') : $('#komplai-publish-login')) : $('#deploy-project'); }
  // Overskrift, knapper og bekræftelse siger, hvad der sker hos den valgte destination.
  function wording() {
    const komplai = komplaiSelected();
    $('#deployment-heading').textContent = komplai ? 'Udgiv med komplai' : 'Udgiv til test';
    $('#deployment-intro').textContent = komplai ? 'Udgiv en gemt version til organisationens adresse på komplai.run.' : 'Giv andre et link til en gemt version. Linket er ikke nødvendigvis privat.';
    $('#deployment-ack-label').textContent = komplai ? 'Jeg har gennemgået version, adresse og hvem der kan åbne appen.' : 'Jeg har gennemgået version, destination, adgang og omkostninger. Testmiljøets nødvendige værdier er opsat hos udbyderen.';
    $('#deployment-send').textContent = komplai ? 'Udgiv' : 'Upload og udgiv til test';
    $('#deployment-review-title').textContent = komplai ? 'Gennemgå udgivelsen' : 'Gennemgå testudgivelsen';
  }
  function showGuide(selector, id) {
    const option = guides.find(item => item.id === id), target = $(selector); target.replaceChildren();
    if (!option) return;
    const text = (tag, value) => { const el = document.createElement(tag); el.textContent = value; return el; };
    target.append(text('p', option.summary));
    const detail = document.createElement('details'); detail.append(text('summary', 'Opsætning, data og aftaler'), text('p', option.scope));
    const steps = document.createElement('ol'); steps.append(...option.steps.map(step => text('li', step))); detail.append(steps, text('p', option.data));
    detail.append(text('p', 'Priser og eventuelle gratis kvoter følger din konto. Kontrollér vilkårene hos udbyderen.'));
    for (const kind of Object.keys(option.links)) {
      const button = text('button', { guide: 'Åbn udbyderens vejledning', data: 'Se aftaler og databehandling', region: 'Se regioner' }[kind]); button.type = 'button'; button.className = 'text-button';
      button.onclick = () => api('deploymentGuideOpen', { id, kind }).catch(error => { $('#deployment-feedback').textContent = error.message; }); detail.append(button);
    }
    detail.append(text('small', 'Kilder gennemgået ' + new Date(option.checkedAt + 'T12:00:00Z').toLocaleDateString('da-DK') + '. Jeres konto og aftale er ikke kontrolleret.'));
    target.append(detail);
    if (!option.integrated) target.prepend(text('p', 'Udgives hos udbyderen. Aura uploader ikke herfra.'));
  }
  async function loadGuides() {
    guides = await api('deploymentGuides');
    $('#hosting-guide-choice').replaceChildren(...guides.filter(item => !item.integrated).map(item => new Option(item.name, item.id)));
    showGuide('#hosting-guide-current', $('#deploy-provider').value); showGuide('#hosting-guide-other', $('#hosting-guide-choice').value);
  }
  $('#hosting-guide-choice').onchange = () => showGuide('#hosting-guide-other', $('#hosting-guide-choice').value);
  function modes() {
    const komplai = komplaiSelected();
    showGuide('#hosting-guide-current', $('#deploy-provider').value); $('#hosting-guide-current').hidden = komplai;
    $('#deploy-komplai').hidden = !komplai; $('#deploy-cloud').hidden = komplai; $('#deploy-project').required = !komplai;
    const ready = komplai && Boolean(publish.overview);
    for (const radio of document.querySelectorAll('[name="komplai-visibility"]')) radio.required = ready && !$('#deploy-komplai-app').value;
    $('#deploy-komplai-name').required = ready && !$('#deploy-komplai-app').value;
    $('#deployment-form button[type=submit]').disabled = komplai && !ready;
    wording();
    const azure = $('#deploy-provider').value === 'azure'; $('#deploy-scope').required = !azure && !komplai; $('#deploy-subscription').required = azure; $('#deploy-group').required = azure; $('#deploy-azure').hidden = !azure; $('#deploy-vercel').hidden = azure;
    for (const option of $('#deploy-mode').options) option.disabled = komplai ? option.value !== 'static' : azure ? option.value === 'source' : option.value === 'functions';
    if ($('#deploy-mode').selectedOptions[0].disabled) $('#deploy-mode').value = 'static';
    $('#deploy-functions').hidden = !azure || $('#deploy-mode').value !== 'functions';
  }
  function input() {
    if (komplaiSelected()) {
      const appId = $('#deploy-komplai-app').value, visibility = appId ? publish.overview?.apps.find(a => a.id === appId)?.visibility : document.querySelector('[name="komplai-visibility"]:checked')?.value;
      return { provider: 'komplai', directory: $('#deploy-directory').value, visibility, ...(appId ? { appId } : { name: $('#deploy-komplai-name').value, ...(publish.overview?.slugs ? { slug: $('#deploy-komplai-slug').value } : {}) }) };
    }
    return { provider: $('#deploy-provider').value, project: $('#deploy-project').value, scope: $('#deploy-scope').value, subscription: $('#deploy-subscription').value, group: $('#deploy-group').value, mode: $('#deploy-mode').value, directory: $('#deploy-directory').value, frontend: $('#deploy-frontend').value, api: $('#deploy-api').value };
  }
  // --- komplai Publish ---------------------------------------------------
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  function suggest(name) {
    let label = name.toLowerCase().replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (label.length > 40) { const cut = label.slice(0, 41), b = cut.lastIndexOf('-'); label = (b >= 3 ? cut.slice(0, b) : cut.slice(0, 40)).replace(/-+$/, ''); }
    return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/.test(label) && !label.includes('--') ? label : '';
  }
  function publishNotice(text = '', tone = 'info') { const el = $('#komplai-publish-feedback'); el.textContent = text; el.dataset.tone = text ? tone : ''; }
  function publishStage(stage) { $('#komplai-publish-signin').dataset.stage = stage; }
  function showSignin() {
    publish.overview = null; $('#komplai-publish-signin').hidden = false; $('#komplai-publish-ready').hidden = true; $('#komplai-publish-orgs').hidden = true;
    $('#komplai-publish-login').hidden = false; $('#komplai-publish-cancel').hidden = true; publishStage('start'); modes();
  }
  function showReady() {
    const o = publish.overview; $('#komplai-publish-signin').hidden = true; $('#komplai-publish-ready').hidden = false;
    $('#komplai-publish-avatar').textContent = initials(o.organisationName); $('#komplai-publish-org-name').textContent = o.organisationName;
    $('#komplai-publish-address').textContent = 'Udgiver til ' + o.address; $('#deploy-komplai-suffix').textContent = '.' + o.address;
    const keep = $('#deploy-komplai-app').value;
    $('#deploy-komplai-app').replaceChildren(new Option('Ny app', ''), ...o.apps.map(a => new Option(`${a.name} · ${new URL(a.url).hostname}`, a.id)));
    if (o.apps.some(a => a.id === keep)) $('#deploy-komplai-app').value = keep;
    $('#deploy-komplai-slug-row').hidden = !o.slugs; appChoice(); modes();
  }
  function appChoice() {
    const app = publish.overview?.apps.find(a => a.id === $('#deploy-komplai-app').value);
    $('#deploy-komplai-new').hidden = Boolean(app); $('#deploy-komplai-current').hidden = !app; $('#deploy-komplai-existing').hidden = !app; $('#deploy-komplai-visibility').hidden = Boolean(app);
    if (app) $('#deploy-komplai-current').textContent = `${new URL(app.url).hostname} · ${app.visibility === 'public' ? 'alle med linket' : 'organisationen'} lige nu. ${app.releases ? 'En ny version erstatter den udgivne.' : 'Ikke udgivet endnu.'}`;
    else if (!$('#deploy-komplai-name').value && context?.projectName) { $('#deploy-komplai-name').value = context.projectName; if (!publish.slugEdited) $('#deploy-komplai-slug').value = suggest(context.projectName); checkAddress(); }
    // Nye apps har intet forvalg. Eksisterende apps beholder deres aktuelle adgang.
    for (const radio of document.querySelectorAll('[name="komplai-visibility"]')) radio.checked = false;
  }
  async function checkAddress() {
    const generation = ++publish.addressCheck, slug = $('#deploy-komplai-slug').value, help = $('#deploy-komplai-slug-help');
    if (!publish.overview?.slugs || $('#deploy-komplai-app').value) return;
    if (!slug) { help.textContent = 'Lad feltet stå tomt, så får appen en tilfældig adresse.'; help.dataset.tone = ''; return; }
    help.textContent = 'Kontrollerer adressen …'; help.dataset.tone = '';
    await new Promise(r => setTimeout(r, 250)); if (generation !== publish.addressCheck) return;
    try {
      const r = await api('komplaiPublishAddress', { slug }); if (generation !== publish.addressCheck) return;
      help.textContent = r.available ? `Appen får adressen ${slug}.${publish.overview.address}` : r.message; help.dataset.tone = r.available ? 'ok' : 'error';
    } catch (e) { if (generation === publish.addressCheck) { help.textContent = e.message; help.dataset.tone = 'error'; } }
  }
  async function loadPublish() {
    publish.state = await api('komplaiPublishState');
    if (!publish.state.connected || publish.state.expired) { showSignin(); if (publish.state.expired) publishNotice('Udgivelsesadgangen er udløbet. Log ind med komplai igen.', 'error'); return; }
    try { publish.overview = await api('komplaiPublishOverview'); showReady(); }
    catch (e) { showSignin(); publishNotice(e.message, 'error'); }
  }
  function showPublishOrganisation() {
    const o = publish.organisations.find(x => x.id === $('#komplai-publish-org').value); if (!o) return;
    const tile = $('#komplai-publish-tile'), avatar = document.createElement('span'), name = document.createElement('span'), line = document.createElement('span');
    avatar.className = 'komplai-avatar'; avatar.setAttribute('aria-hidden', 'true'); avatar.textContent = initials(o.name);
    name.className = 'komplai-account-name'; name.textContent = o.name; line.className = 'komplai-balance'; line.textContent = 'Udgiver til ' + o.publishing.address;
    tile.replaceChildren(avatar, name, line);
    $('#komplai-publish-ai-row').hidden = !o.coding; $('#komplai-publish-ai').checked = false;
  }
  $('#komplai-publish-org').onchange = showPublishOrganisation;
  // Loginnet venter på browseren; formularen forbliver aktiv, så Afbryd kan bruges.
  $('#komplai-publish-login').onclick = async () => {
    const generation = ++publish.generation;
    $('#komplai-publish-login').hidden = true; $('#komplai-publish-cancel').hidden = false; publishStage('waiting'); publishNotice('Fortsæt i browseren. Aura venter på dit login.', 'wait'); $('#komplai-publish-cancel').focus();
    try {
      const result = await api('komplaiLogin'); if (generation !== publish.generation) return;
      publish.organisations = result.organisations.filter(o => o.publishing);
      if (!publish.organisations.length) { showSignin(); publishNotice('Ingen af dine organisationer har komplai Publish. Bed jeres administrator kontakte komplai.', 'error'); return; }
      $('#komplai-publish-org').replaceChildren(...publish.organisations.map(o => new Option(o.name, o.id)));
      const single = publish.organisations.length === 1; $('#komplai-publish-org').hidden = single; $('#komplai-publish-org').previousElementSibling.hidden = single;
      $('#komplai-publish-orgs').hidden = false; $('#komplai-publish-cancel').hidden = false; publishStage('organisation'); publishNotice(); showPublishOrganisation(); $('#komplai-publish-confirm').focus();
    } catch (e) { if (generation === publish.generation) { showSignin(); publishNotice(e.message, 'error'); $('#komplai-publish-login').focus(); } }
  };
  $('#komplai-publish-cancel').onclick = () => { ++publish.generation; window.harness.komplaiCancel(); showSignin(); publishNotice('Login blev afbrudt. Du kan prøve igen.'); $('#komplai-publish-login').focus(); };
  $('#komplai-publish-confirm').onclick = () => busy(async () => {
    const o = publish.organisations.find(x => x.id === $('#komplai-publish-org').value);
    await api('komplaiConnect', { organisationId: o.id, publishing: true, coding: o.coding && $('#komplai-publish-ai').checked });
    publishNotice(); await loadPublish(); window.dispatchEvent(new CustomEvent('harness:komplai-connected'));
    $('#deployment-feedback').textContent = `komplai Publish er forbundet til ${o.name}.`; focus = $('#deploy-komplai-app');
  });
  $('#komplai-publish-logout').onclick = () => busy(async () => {
    await api('komplaiPublishDisconnect'); invalidate(); showSignin(); publishNotice('Du er logget ud af komplai Publish. Adgangen er tilbagekaldt.', 'success'); $('#deployment-feedback').textContent = ''; window.dispatchEvent(new CustomEvent('harness:komplai-connected')); focus = $('#komplai-publish-login');
  });
  $('#deploy-komplai-app').onchange = () => { invalidate(); appChoice(); modes(); };
  $('#deploy-komplai-access').onclick = () => busy(async () => { await api('deploymentOpen', { komplaiApp: $('#deploy-komplai-app').value }); $('#deployment-feedback').textContent = 'Ret adgangen i komplai. Næste gennemgang henter appens aktuelle adgang.'; });
  $('#deploy-komplai-name').oninput = () => { if (!publish.slugEdited) { $('#deploy-komplai-slug').value = suggest($('#deploy-komplai-name').value); checkAddress(); } };
  $('#deploy-komplai-slug').oninput = () => { publish.slugEdited = true; $('#deploy-komplai-slug').value = $('#deploy-komplai-slug').value.toLowerCase(); checkAddress(); };
  function receipt(r) {
    last = r; $('#deployment-result').hidden = !r; if (!r) return;
    $('#deployment-form').hidden = true;
    const komplai = r.config.provider === 'komplai';
    $('#deployment-result-title').textContent = komplai ? 'Seneste udgivelse' : 'Seneste testudgivelse';
    $('#deployment-open').textContent = komplai ? 'Åbn appen' : 'Åbn testlink';
    for (const id of ['#deployment-portal', '#deployment-portal-details']) $(id).textContent = komplai ? 'Åbn i komplai' : 'Åbn hos udbyderen';
    $('#deployment-new').textContent = komplai ? 'Udgiv en ny version' : 'Gennemgå en ny testudgivelse';
    $('#deployment-state').textContent = `${view.version(r)} → ${view.destination(r)}`;
    rows('#deployment-checks', view.checks(r));
    $('#deployment-verification').textContent = (r.checkedAt && !r.checks ? 'Tidligere kontrolnotat (ikke genkontrolleret): ' : '') + (r.verification || (!r.id ? 'Uploadresultatet er ikke bekræftet. Kontrollér udbyderens oversigt, før du prøver en ny upload.' : 'Kontrollér udgivelsen, og afprøv derefter linket med testpersonen. Uploadsvaret beviser ikke, at appen virker.'));
    rows('#deployment-receipt', [['Upload påbegyndt', view.time(r.startedAt)], ['Versionens ID', r.head], ['Indholdets fingeraftryk', r.hash], ['Senest registrerede udbyderstatuskode', r.state], ['Testadresse', r.url], ['Adgang rapporteret ved upload', r.target.access], ['Seneste kontrol', r.checkedAt ? view.time(r.checkedAt) : 'Ingen kontrol registreret']]);
    $('#deployment-portal').hidden = Boolean(r.id && r.state !== 'UNKNOWN' && r.checks?.provider.status !== 'unknown' && r.state !== 'ERROR');
    $('#deployment-check').hidden = !r.id; $('#deployment-open').hidden = !r.url;
    $('#deployment-portal').classList.toggle('primary', !$('#deployment-portal').hidden);
    $('#deployment-check').classList.toggle('primary', $('#deployment-portal').hidden);
    focus = $('#deployment-result-title');
  }
  $('#deploy-button').onclick = () => {
    $('#deployment-dialog').showModal(); invalidate(); $('#deployment-technical').open = false; $('#deployment-receipt-details').open = false;
    busy(async () => {
      const s = await api('deploymentState'); context = s.context; await loadGuides(); $('#hosting-other').open = false;
      await loadPublish();
      if (s.config) {
        for (const key of ['provider', 'project', 'scope', 'subscription', 'group', 'mode', 'directory', 'frontend', 'api']) if (s.config[key] !== undefined) $('#deploy-' + key).value = s.config[key] || '';
        if (s.config.provider === 'komplai' && s.config.appId && publish.overview?.apps.some(a => a.id === s.config.appId)) { $('#deploy-komplai-app').value = s.config.appId; appChoice(); }
      }
      else { $('#deployment-form').reset(); publish.slugEdited = false; $('#deploy-provider').value = publish.overview ? 'komplai' : s.preference === 'azure' ? 'azure' : 'vercel'; if (publish.overview) appChoice(); }
      $('#deployment-scope').textContent = view.scope(s.context); modes(); last = null; showForm(); receipt(s.last);
      $('#deployment-feedback').textContent = s.last ? 'Seneste upload er hentet. En ny udgivelse kræver en ny gennemgang.' : 'Vælg destination, og gennemgå den gemte version før upload.';
    });
  };
  $('#deployment-form').addEventListener('input', event => { if (['hosting-guide-choice', 'komplai-publish-org', 'komplai-publish-ai'].includes(event.target.id)) return; invalidate(); modes(); });
  $('#deployment-form').onsubmit = e => {
    e.preventDefault(); invalidate(); busy(async () => {
      if (komplaiSelected() && $('#deploy-komplai-app').value) {
        const selected = $('#deploy-komplai-app').value;
        publish.overview = await api('komplaiPublishOverview'); showReady();
        if (!publish.overview.apps.some(app => app.id === selected)) throw Error('Appen findes ikke længere. Vælg en app igen.');
      }
      const r = await api('deploymentReview', input()); review = r.token;
      $('#deployment-scope').textContent = view.scope(r.context);
      if (r.config.provider === 'komplai') rows('#deployment-summary', [['Gemt version', view.version(r)], ['Adresse', `${r.target.url ? new URL(r.target.url).hostname : r.target.host}${r.target.created ? ' · ny app' : ''}`], ['Organisation', r.target.owner], ['Hvem kan åbne den', r.target.access + (r.target.currentVisibility && r.target.currentVisibility !== r.config.visibility ? ' Det ændrer appens nuværende deling.' : '')], ['Placering', r.target.region], ['Omkostninger', r.cost]]);
      else rows('#deployment-summary', [['Gemt version', view.version(r)], ['Destination', view.destination(r) + (r.config.provider === 'azure' ? ' · en ny upload erstatter indholdet i testmiljøet' : '')], ...(r.config.mode === 'source' ? [['Build', 'Udbyderen bygger kildekoden og kan køre dens installations- og buildscripts med testmiljøets værdier.']] : []), ['Adgang', `${r.target.access || 'Udbyderen oplyser ikke adgangsreglerne.'} Testpersonens adgang er ikke afprøvet.`], ['Omkostninger', r.cost]]);
      rows('#deployment-details', [['Versionens ID', r.head], ['Destinationens ID', r.target.id || 'Oprettes ved udgivelse'], ['Konto / abonnement', r.config.provider === 'komplai' ? r.target.owner : r.config.scope || r.config.subscription || 'Fra dit eksisterende login'], ['Indhold', `${r.files.length} filer · ${r.bytes} bytes · ${r.hash}`], ['Placering', r.target.region], ['Miljøvariabler', r.target.environmentNote || r.target.environmentKeys?.join(', ') || 'Ingen navne rapporteret. Kontrollér opsætningen hos udbyderen.'], ['Build', r.build], ['Materiale', r.material]]);
      $('#deployment-files').replaceChildren(...r.files.map(f => { const li = document.createElement('li'); li.textContent = f; return li; }));
      $('#deployment-technical').open = false; $('#deployment-form').hidden = true; $('#deployment-result').hidden = true; $('#deployment-review').hidden = false;
      focus = $('#deployment-review-title'); $('#deployment-feedback').textContent = 'Ingen filer er uploadet endnu.';
    });
  };
  $('#deployment-edit').onclick = () => busy(async () => { showForm(); $('#deployment-feedback').textContent = 'Ret destinationen, og gennemgå igen før upload.'; });
  // En ny version går som udgangspunkt til den app, der senest blev udgivet til, ikke til en ny app.
  async function followLastApp() {
    if (last?.config?.provider !== 'komplai') return;
    await loadPublish();
    const appId = last.appId || last.config.appId;
    if (publish.overview?.apps.some(a => a.id === appId)) { $('#deploy-provider').value = 'komplai'; $('#deploy-komplai-app').value = appId; appChoice(); modes(); }
  }
  $('#deployment-new').onclick = () => busy(async () => { await followLastApp(); showForm(); $('#deployment-feedback').textContent = last?.config?.provider === 'komplai' ? 'Den udgivne version bevares, indtil du udgiver en ny.' : 'Den tidligere udgivelse bevares, indtil en ny upload påbegyndes.'; });
  $('#deployment-settings').onclick = () => busy(async () => { await api('deploymentOpen', 'settings'); $('#deployment-feedback').textContent = 'Opsæt testmiljøet hos udbyderen. Ændrede indstillinger kræver en ny gennemgang.'; });
  $('#deployment-ack').onchange = () => { $('#deployment-send').disabled = !review || !$('#deployment-ack').checked; };
  $('#deployment-send').onclick = () => busy(async () => {
    const token = review; invalidate(); if (!token) return;
    $('#deployment-feedback').textContent = komplaiSelected() ? 'Udgiver den gennemgåede version til komplai. Lukning af vinduet annullerer ikke udgivelsen.' : 'Uploader den gennemgåede version. Lukning af vinduet annullerer ikke uploaden.';
    try { receipt(await api('deploymentSend', token)); $('#deployment-feedback').textContent = 'Uploadsvaret er gemt. Kontrollér status for at følge udgivelsen.'; }
    finally { receipt((await api('deploymentState')).last); }
  });
  $('#deployment-check').onclick = () => busy(async () => { receipt(await api('deploymentCheck')); $('#deployment-feedback').textContent = 'Seneste kontrol er gemt. Afprøv adgang og brugerforløb med testpersonen.'; });
  $('#deployment-open').onclick = () => busy(async () => { await api('deploymentOpen', 'site'); $('#deployment-feedback').textContent = 'Testlinket er åbnet i din browser.'; });
  $('#deployment-portal-details').onclick = () => $('#deployment-portal').onclick();
  $('#deployment-portal').onclick = () => busy(async () => { await api('deploymentOpen', 'portal'); $('#deployment-feedback').textContent = 'Udbyderens oversigt er åbnet. Kontrollér uploaden dér, før du prøver igen.'; });
})();
