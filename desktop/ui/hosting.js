(() => {
  const $ = selector => document.querySelector(selector);
  let review = null, creation = null, login = null, timer = null;
  async function api(method, value) { const result = await window.harness[method](value); if (!result.ok) throw new Error(result.error); return result.value; }
  async function act(fn) {
    $('#hosting-body').disabled = true; $('#hosting-feedback').textContent = '';
    try { await fn(); }
    catch (error) { review = null; $('#hosting-push').disabled = true; $('#hosting-feedback').textContent = error.message; }
    finally { $('#hosting-body').disabled = false; }
  }
  function invalidate() { review = null; $('#hosting-review-result').hidden = true; $('#hosting-ack').checked = false; $('#hosting-push').disabled = true; }
  async function refresh() {
    const state = await api('hostingState');
    $('#hosting-status').textContent = state.connected ? `Konto gemt: ${state.login}${state.expired ? ' · adgang udløbet' : ' · kontrollér adgang før publicering'}` : 'Ingen GitHub-konto forbundet.';
    $('#hosting-auth').hidden = state.connected && !state.expired;
    $('#hosting-login').disabled = !state.browserLogin;
    $('#hosting-login-help').textContent = state.browserLogin ? 'Du godkender adgangen hos GitHub. Appen modtager ikke din GitHub-adgangskode.' : 'Browserlogin afventer projektets GitHub Client ID. Et GitHub-token kan bruges nedenfor.';
    $('#hosting-disconnect').disabled = !state.connected;
    $('#hosting-catalog').disabled = !state.connected;
    $('#hosting-project').hidden = !state.project || !state.connected;
    $('#hosting-publication').textContent = state.publication?.selected ? `${state.publication.selected.fullName} · branch ${state.publication.branch} · ${state.publication.changes} ugemte filer. Serverstatus er endnu ikke kontrolleret.` : state.publication?.message || '';
    $('#hosting-open').disabled = !state.publication?.selected;
    $('#hosting-review').disabled = !state.publication?.selected;
  }
  function cancelLogin() { clearTimeout(timer); timer = null; login = null; $('#hosting-device').hidden = true; return api('hostingCancel'); }
  async function poll(id) {
    if (login !== id) return;
    try {
      const result = await api('hostingPoll', id); if (login !== id) return;
      if (result.waiting) timer = setTimeout(() => poll(id), Math.max(1000, result.retryAfter));
      else { login = null; $('#hosting-device').hidden = true; invalidate(); await refresh(); $('#hosting-feedback').textContent = 'GitHub-adgangen er gemt krypteret. Hent konti og repositories for at fortsætte.'; }
    } catch (error) { if (login === id) { await cancelLogin().catch(() => {}); $('#hosting-feedback').textContent = error.message; } }
  }
  const open = () => { creation = null; $('#hosting-create-confirm').hidden = true; $('#hosting-dialog').showModal(); invalidate(); act(refresh); };
  $('#setup-hosting').onclick = open; $('#publish-button').onclick = open;
  $('#hosting-dialog').addEventListener('close', () => { $('#hosting-token').value = ''; cancelLogin().catch(() => {}); });
  $('#hosting-login').onclick = () => act(async () => { const value = await api('hostingLogin'); login = value.id; $('#hosting-code').textContent = value.code; $('#hosting-device').hidden = false; timer = setTimeout(() => poll(value.id), value.retryAfter); });
  $('#hosting-browser').onclick = () => act(() => api('hostingBrowser'));
  $('#hosting-cancel').onclick = () => act(cancelLogin);
  $('#hosting-token-form').onsubmit = event => { event.preventDefault(); const token = $('#hosting-token').value; $('#hosting-token').value = ''; act(async () => { await cancelLogin(); await api('hostingToken', token); invalidate(); await refresh(); $('#hosting-feedback').textContent = 'Konto kontrolleret og adgang gemt krypteret.'; }); };
  $('#hosting-disconnect').onclick = () => act(async () => { await cancelLogin(); await api('hostingDisconnect'); invalidate(); $('#hosting-repositories').replaceChildren(); $('#hosting-owner').replaceChildren(); await refresh(); });
  $('#hosting-catalog').onclick = () => act(async () => {
    const result = await api('hostingCatalog');
    $('#hosting-owner').replaceChildren(new Option('Vælg konto eller organisation', ''), ...result.owners.map(owner => new Option(`${owner.login} · ${owner.type === 'User' ? 'egen konto' : 'organisation'}`, owner.login)));
    $('#hosting-repositories').replaceChildren(new Option('Vælg repository', ''), ...result.repositories.map(repo => new Option(`${repo.fullName} · ${repo.private ? 'privat' : 'offentligt'}`, repo.fullName)));
    $('#hosting-feedback').textContent = `${result.repositories.length} repositories med skriveadgang. Organisationsregler kan stadig begrænse oprettelse og push.`;
  });
  $('#hosting-repositories').onchange = () => { $('#hosting-target').value = $('#hosting-repositories').value; invalidate(); };
  $('#hosting-attach-form').onsubmit = event => { event.preventDefault(); act(async () => { const target = await api('hostingAttach', $('#hosting-target').value.trim()); invalidate(); await refresh(); $('#hosting-feedback').textContent = `${target.fullName} er tilsluttet. Ingen filer er uploadet.`; }); };
  $('#hosting-create-form').onsubmit = event => { event.preventDefault(); creation = { owner: $('#hosting-owner').value, repo: $('#hosting-name').value.trim(), visibility: $('#hosting-visibility').value }; $('#hosting-create-description').textContent = `Opret ${creation.visibility === 'private' ? 'privat' : 'OFFENTLIGT'} repository ${creation.owner}/${creation.repo} på GitHub? Det oprettes tomt; ingen projektfiler sendes endnu.`; $('#hosting-create-confirm').hidden = false; };
  for (const id of ['hosting-owner', 'hosting-name', 'hosting-visibility']) $('#' + id).addEventListener('input', () => { creation = null; $('#hosting-create-confirm').hidden = true; });
  $('#hosting-create-cancel').onclick = () => { creation = null; $('#hosting-create-confirm').hidden = true; };
  $('#hosting-create-do').onclick = () => act(async () => {
    const input = creation; creation = null; $('#hosting-create-confirm').hidden = true; if (!input) return;
    const target = await api('hostingCreate', input); $('#hosting-create-section').open = false; $('#hosting-target').value = target.fullName;
    $('#hosting-feedback').textContent = `${target.url} er oprettet (${target.private ? 'privat' : 'offentligt'}). Tilslut det med knappen ovenfor. Der er ikke pushet filer.`;
  });
  $('#hosting-review').onclick = () => act(async () => {
    invalidate(); const result = await api('hostingReview');
    $('#hosting-review-result').hidden = false;
    $('#hosting-destination').textContent = `${result.target.fullName} · ${result.target.private ? 'privat' : 'OFFENTLIGT'} · branch ${result.branch} · lokal version ${result.head.slice(0, 8)}. ${result.synchronized ? 'Denne version er bekræftet på serveren.' : `${result.commits.length} commits sendes. ${result.remoteHead ? 'Eksisterende branch opdateres.' : 'Ny branch oprettes på serveren.'}`}`;
    $('#hosting-files').replaceChildren(...result.files.map(file => { const li = document.createElement('li'); li.textContent = file; return li; }));
    $('#hosting-publication').textContent = `${result.target.fullName} · ${result.synchronized ? 'samme version lokalt og på serveren' : 'lokale commits afventer push'}.`;
    review = result.token || null; $('#hosting-ack').disabled = !review;
    $('#hosting-review-result').scrollIntoView({ block: 'start' });
    $('#hosting-feedback').textContent = result.synchronized ? 'Lokalt og på serveren · synkroniseret.' : 'Gennemgangen gælder denne version og destination. Bekræft nedenfor for at sende.';
  });
  $('#hosting-ack').onchange = () => { $('#hosting-push').disabled = !review || !$('#hosting-ack').checked; };
  $('#hosting-push').onclick = () => act(async () => { const token = review; invalidate(); if (!token) return; const result = await api('hostingPush', token); await refresh(); $('#hosting-publication').textContent = `${result.target.fullName} · branch ${result.branch} · ${result.head.slice(0, 8)} bekræftet på serveren.`; $('#hosting-feedback').textContent = `${result.head.slice(0, 8)} · ${result.message}`; });
  $('#hosting-open').onclick = () => act(() => api('hostingOpen'));
})();
