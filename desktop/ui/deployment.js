(() => {
  const $ = s => document.querySelector(s), view = window.ShareView;
  let review = null, last = null, focus = null;
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
  function showForm() { invalidate(); $('#deployment-form').hidden = false; $('#deployment-result').hidden = true; focus = $('#deploy-project'); }
  function modes() {
    const azure = $('#deploy-provider').value === 'azure'; $('#deploy-scope').required = !azure; $('#deploy-subscription').required = azure; $('#deploy-group').required = azure; $('#deploy-azure').hidden = !azure; $('#deploy-vercel').hidden = azure;
    for (const option of $('#deploy-mode').options) option.disabled = azure ? option.value === 'source' : option.value === 'functions';
    if ($('#deploy-mode').selectedOptions[0].disabled) $('#deploy-mode').value = 'static';
    $('#deploy-functions').hidden = !azure || $('#deploy-mode').value !== 'functions';
  }
  function input() { return { provider: $('#deploy-provider').value, project: $('#deploy-project').value, scope: $('#deploy-scope').value, subscription: $('#deploy-subscription').value, group: $('#deploy-group').value, mode: $('#deploy-mode').value, directory: $('#deploy-directory').value, frontend: $('#deploy-frontend').value, api: $('#deploy-api').value }; }
  function receipt(r) {
    last = r; $('#deployment-result').hidden = !r; if (!r) return;
    $('#deployment-form').hidden = true;
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
      const s = await api('deploymentState');
      if (s.config) for (const key of ['provider', 'project', 'scope', 'subscription', 'group', 'mode', 'directory', 'frontend', 'api']) $('#deploy-' + key).value = s.config[key] || '';
      else { $('#deployment-form').reset(); $('#deploy-provider').value = s.preference === 'azure' ? 'azure' : 'vercel'; }
      $('#deployment-scope').textContent = view.scope(s.context); modes(); last = null; showForm(); receipt(s.last);
      $('#deployment-feedback').textContent = s.last ? 'Seneste upload er hentet. En ny udgivelse kræver en ny gennemgang.' : 'Vælg destination, og gennemgå den gemte version før upload.';
    });
  };
  $('#deployment-form').addEventListener('input', () => { invalidate(); modes(); });
  $('#deployment-form').onsubmit = e => {
    e.preventDefault(); invalidate(); busy(async () => {
      const r = await api('deploymentReview', input()); review = r.token;
      $('#deployment-scope').textContent = view.scope(r.context);
      rows('#deployment-summary', [['Gemt version', view.version(r)], ['Destination', view.destination(r) + (r.config.provider === 'azure' ? ' · en ny upload erstatter indholdet i testmiljøet' : '')], ...(r.config.mode === 'source' ? [['Build', 'Udbyderen bygger kildekoden og kan køre dens installations- og buildscripts med testmiljøets værdier.']] : []), ['Adgang', `${r.target.access || 'Udbyderen oplyser ikke adgangsreglerne.'} Testpersonens adgang er ikke afprøvet.`], ['Omkostninger', r.cost]]);
      rows('#deployment-details', [['Versionens ID', r.head], ['Destinationens ID', r.target.id], ['Konto / abonnement', r.config.scope || r.config.subscription || 'Fra dit eksisterende login'], ['Indhold', `${r.files.length} filer · ${r.bytes} bytes · ${r.hash}`], ['Placering', r.target.region], ['Miljøvariabler', r.target.environmentNote || r.target.environmentKeys?.join(', ') || 'Ingen navne rapporteret. Kontrollér opsætningen hos udbyderen.'], ['Build', r.build], ['Materiale', r.material]]);
      $('#deployment-files').replaceChildren(...r.files.map(f => { const li = document.createElement('li'); li.textContent = f; return li; }));
      $('#deployment-technical').open = false; $('#deployment-form').hidden = true; $('#deployment-result').hidden = true; $('#deployment-review').hidden = false;
      focus = $('#deployment-review-title'); $('#deployment-feedback').textContent = 'Ingen filer er uploadet endnu.';
    });
  };
  $('#deployment-edit').onclick = () => busy(async () => { showForm(); $('#deployment-feedback').textContent = 'Ret destinationen, og gennemgå igen før upload.'; });
  $('#deployment-new').onclick = () => busy(async () => { showForm(); $('#deployment-feedback').textContent = 'Den tidligere udgivelse bevares, indtil en ny upload påbegyndes.'; });
  $('#deployment-settings').onclick = () => busy(async () => { await api('deploymentOpen', 'settings'); $('#deployment-feedback').textContent = 'Opsæt testmiljøet hos udbyderen. Ændrede indstillinger kræver en ny gennemgang.'; });
  $('#deployment-ack').onchange = () => { $('#deployment-send').disabled = !review || !$('#deployment-ack').checked; };
  $('#deployment-send').onclick = () => busy(async () => {
    const token = review; invalidate(); if (!token) return;
    $('#deployment-feedback').textContent = 'Uploader den gennemgåede version. Lukning af vinduet annullerer ikke uploaden.';
    try { receipt(await api('deploymentSend', token)); $('#deployment-feedback').textContent = 'Uploadsvaret er gemt. Kontrollér status for at følge udgivelsen.'; }
    finally { receipt((await api('deploymentState')).last); }
  });
  $('#deployment-check').onclick = () => busy(async () => { receipt(await api('deploymentCheck')); $('#deployment-feedback').textContent = 'Seneste kontrol er gemt. Afprøv adgang og brugerforløb med testpersonen.'; });
  $('#deployment-open').onclick = () => busy(async () => { await api('deploymentOpen', 'site'); $('#deployment-feedback').textContent = 'Testlinket er åbnet i din browser.'; });
  $('#deployment-portal-details').onclick = () => $('#deployment-portal').onclick();
  $('#deployment-portal').onclick = () => busy(async () => { await api('deploymentOpen', 'portal'); $('#deployment-feedback').textContent = 'Udbyderens oversigt er åbnet. Kontrollér uploaden dér, før du prøver igen.'; });
})();
