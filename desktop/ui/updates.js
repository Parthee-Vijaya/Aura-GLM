(() => {
  const $ = selector => document.querySelector(selector);
  const dialog = $('#updates-dialog'); let state, opener;
  async function invoke(method, value) {
    const response = await window.harness[method](value);
    if (!response.ok) throw new Error(response.error);
    return response.value;
  }
  function render(next) {
    state = next;
    const status = {
      idle: 'Søg efter en ny version af Aura 1.', checking: 'Søger efter opdateringer …',
      current: 'Du har den nyeste version.', available: `Aura 1 ${state.available?.version} er klar.`,
      downloading: `Henter opdateringen · ${state.percent} %`, ready: 'Opdateringen er hentet.',
      installing: 'Gør klar til genstart …', error: 'Opdateringen kunne ikke gennemføres.',
      unavailable: 'Denne udgave opdateres med en installationsfil.'
    };
    $('#updates-version').textContent = `Aura 1 ${state.current}${state.channel === 'beta' ? ' · Beta' : ''}`;
    $('#updates-status').textContent = status[state.phase];
    $('#updates-error').textContent = state.error || '';
    $('#updates-warning').hidden = !state.warning;
    $('#updates-warning').textContent = state.warning ? `Sikkerhedsopdatering: ${state.warning.message}` : '';
    $('#updates-automatic').checked = state.automatic;
    $('#updates-progress').hidden = state.phase !== 'downloading'; $('#updates-progress').value = state.percent;
    const button = $('#updates-action');
    button.disabled = ['checking', 'downloading', 'installing'].includes(state.phase);
    button.textContent = state.phase === 'ready' ? 'Genstart og opdatér' : state.phase === 'available' ? 'Hent opdatering' : state.phase === 'unavailable' ? 'Åbn downloadsiden' : 'Søg efter opdateringer';
    $('#updates-notes').hidden = !state.available;
    $('#updates-restart-note').hidden = state.phase !== 'ready';
    $('#updates-settings').hidden = state.phase === 'unavailable';
    $('#updates-last-check').textContent = state.checkedAt ? 'Senest kontrolleret ' + new Date(state.checkedAt).toLocaleString('da-DK') : '';
    const notice = $('#updates-notice');
    notice.hidden = !state.warning && !state.available;
    notice.classList.toggle('critical', Boolean(state.warning));
    $('#updates-notice-text').textContent = state.warning ? 'Sikkerhedsopdatering til Aura 1' : state.phase === 'ready' ? 'Opdatering klar til genstart' : `Aura 1 ${state.available?.version} er klar`;
  }
  async function action(callback) {
    try { $('#updates-error').textContent = ''; const result = await callback(); if (result?.phase) render(result); }
    catch (error) { if (state) render(state); $('#updates-error').textContent = error.message; }
  }
  async function open() {
    opener = document.activeElement; $('#settings-menu').hidePopover();
    if (!dialog.open) dialog.showModal();
    await action(async () => render(await invoke('updatesState')));
    $('#updates-action').focus();
  }
  $('#updates-button').onclick = open; $('#updates-notice-open').onclick = open;
  $('#updates-action').onclick = () => action(async () => {
    if (state.phase === 'ready') { await saveChatDraft(true); saveIdeaDraft(); return invoke('updatesRestart'); }
    if (state.phase === 'available') return invoke('updatesDownload');
    if (state.phase === 'unavailable') return invoke('updatesWebsite');
    return invoke('updatesCheck');
  });
  $('#updates-automatic').onchange = () => action(() => invoke('updatesAutomatic', $('#updates-automatic').checked));
  $('#updates-notes').onclick = () => action(() => invoke('updatesNotes'));
  $('#updates-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => {
    if (opener?.checkVisibility()) opener.focus(); else $('#settings-toggle').focus();
  });
  window.harness.onEvent(event => { if (event.type === 'updates.state') render(event.value); if (event.type === 'updates.open') void open(); });
  invoke('updatesState').then(render).catch(() => {});
})();
