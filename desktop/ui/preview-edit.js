// Ret i siden: en frivillig ændringstilstand i forhåndsvisningen. Brugeren vælger et element og retter teksten i et felt
// her i Aura eller beder AI'en ændre elementet. Selve siden ændres ikke af Aura, mens man skriver; rettelsen gemmes i
// projektets fil, og forhåndsvisningen viser den, når siden opdateres. Fortryd sætter filen tilbage.
(() => {
  let active = false, selection = null, edit = null, checking = 0;
  const toggle = $('#preview-pick');
  function setActive(value) {
    active = value; toggle.setAttribute('aria-pressed', String(value));
    $('#pick-hint').hidden = !value || !$('#pick-card').hidden;
    document.body.classList.toggle('picking', value);
  }
  // Uden en side er knappen skjult; mens AI'en arbejder, er den slået fra.
  function available() {
    toggle.hidden = !current?.previewURL; toggle.disabled = running;
    toggle.title = running ? 'Vent, til AI’en er færdig' : 'Vælg en tekst, et billede eller en knap i siden og ret den';
  }
  async function start() { await call('previewPick', { on: true }); setActive(true); $('#preview').focus(); }
  async function stop({ keepResult = true } = {}) {
    const was = active; setActive(false);
    if (!keepResult || !edit) hideCard();
    if (was) await call('previewPick', { on: false }).catch(() => {});
  }
  function hideCard() { $('#pick-card').hidden = true; selection = null; edit = null; checking++; $('#pick-hint').hidden = !active; }
  toggle.onclick = () => action(() => active ? stop() : start());

  const quote = text => `»${text.length > 140 ? text.slice(0, 139) + '…' : text}«`;
  // Kortet: hvad der er valgt, hvor teksten står i koden, og de to veje videre.
  function show(value) {
    selection = value; edit = null; checking++;
    $('#pick-title').textContent = value.name;
    $('#pick-text').textContent = value.secret ? 'Indholdet vises ikke, fordi det kan indeholde en nøgle eller adgangskode.' : value.text ? quote(value.text) : value.label ? quote(value.label) : 'Ingen tekst';
    const source = $('#pick-source'); source.replaceChildren();
    if (value.source) {
      const link = node('button', `${value.source.file}, linje ${value.source.line}`, 'file-ref'); link.type = 'button';
      link.title = 'Åbn filen under Kode';
      link.onclick = () => window.workspace.openFile(value.source.file, { line: value.source.line });
      source.append('I koden: ', link, '. ');
    }
    if (!value.edit.possible) source.append(value.edit.reason);
    source.hidden = !source.childNodes.length;
    $('#pick-edit').hidden = !value.edit.possible;
    $('#pick-ai').classList.toggle('primary', !value.edit.possible);
    $('#pick-actions').hidden = false; $('#pick-form').hidden = true; $('#pick-result').hidden = true;
    $('#pick-card').hidden = false; $('#pick-hint').hidden = true;
    $('#pick-title').focus();
  }
  $('#pick-close').onclick = () => { hideCard(); if (active) $('#preview').focus(); };
  $('#pick-edit').onclick = () => {
    if (!selection?.edit.possible) return;
    $('#pick-actions').hidden = true; $('#pick-form').hidden = false;
    $('#pick-value').value = selection.raw; $('#pick-value').focus(); $('#pick-value').select();
  };
  $('#pick-cancel').onclick = () => { $('#pick-form').hidden = true; $('#pick-actions').hidden = false; $('#pick-edit').focus(); };
  // Enter gemmer; teksten er én linje i siden. Escape fortryder redigeringen, ikke ændringstilstanden.
  $('#pick-value').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); $('#pick-form').requestSubmit(); }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); $('#pick-cancel').click(); }
  });
  $('#pick-form').onsubmit = event => {
    event.preventDefault();
    const chosen = selection, text = $('#pick-value').value;
    action(async () => {
      const result = await call('previewEditText', { id: chosen.id, text });
      if (selection !== chosen) return;
      edit = { ...result, old: chosen.raw, undone: false };
      selection = { ...chosen, raw: result.text, text: result.text };
      $('#pick-text').textContent = quote(result.text);
      $('#pick-form').hidden = true; $('#pick-source').hidden = true; $('#pick-result').hidden = false; $('#pick-undo').hidden = false; $('#pick-undo').disabled = false;
      $('#pick-result-text').textContent = `Rettet i ${result.file}, linje ${result.line}.`;
      reloadStatic(); verify(result.text, 'Forhåndsvisningen viser den nye tekst.');
      $('#pick-undo').focus();
    });
  };
  // Den statiske forhåndsvisning genindlæses straks efter en rettelse. Vite og Astro opdaterer selv siden.
  // Den faste kontrol af filerne får den nye tilstand bagefter, så siden ikke genindlæses to gange.
  function reloadStatic() {
    if (!current?.previewURL || current.previewExternal) return;
    $('#preview').src = current.previewURL;
    call('revision').then(next => { if (next) revision = next; }, () => {});
  }
  // Kontrol: viser forhåndsvisningen teksten? Efter 8 sekunder siger Aura det, hvis ikke, og bliver ved med at
  // kigge i op til 30 sekunder, fordi en travl computer eller en udviklingsserver kan være længe om at opdatere.
  async function verify(text, ok) {
    const run = ++checking, check = $('#pick-check'), started = Date.now();
    check.className = 'hint check-pending'; check.textContent = 'Aura kontrollerer forhåndsvisningen …';
    while (Date.now() - started < 30000) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (run !== checking) return;
      if (await call('previewContains', { text }).catch(() => false)) { if (run === checking) { check.className = 'hint check-ok'; check.textContent = ok; } return; }
      if (run === checking && Date.now() - started >= 8000 && !check.classList.contains('check-unknown')) { check.className = 'hint check-unknown'; check.textContent = 'Filen er gemt, men forhåndsvisningen viser det ikke endnu. Genindlæs forhåndsvisningen med ↻.'; }
    }
  }
  $('#pick-undo').onclick = () => action(async () => {
    if (!edit || edit.undone) return;
    const result = await call('changesUndo', { task: edit.task });
    edit = { ...edit, undone: true, undoTask: result.task };
    selection = selection && { ...selection, raw: edit.old, text: edit.old };
    $('#pick-text').textContent = quote(edit.old);
    $('#pick-result-text').textContent = `Fortrudt. Teksten i ${edit.file} er sat tilbage.`;
    $('#pick-undo').hidden = true;
    reloadStatic(); verify(edit.old, 'Forhåndsvisningen viser den oprindelige tekst igen.');
    $('#pick-diff').focus();
  });
  $('#pick-diff').onclick = () => { if (edit) window.workspace.showChange(edit.undone ? edit.undoTask : edit.task, edit.file); };
  // Bed AI'en ændre det: elementet bliver målet for næste besked og står over skrivefeltet, indtil beskeden er sendt.
  $('#pick-ai').onclick = () => action(async () => {
    if (!selection) return;
    const label = `${selection.name}${selection.text ? ` ${quote(selection.text.length > 40 ? selection.text.slice(0, 39) + '…' : selection.text)}` : ''}`;
    window.workspace.setTarget({ id: selection.id, label });
    await stop({ keepResult: false });
    $('#prompt').focus();
  });

  // Escape i Aura afslutter også ændringstilstanden, når man ikke er ved at skrive.
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !active || event.defaultPrevented || document.querySelector('dialog[open]') || event.target.closest?.('textarea, input, select, form')) return;
    action(() => stop()).then(() => toggle.focus());
  });
  window.harness.onEvent(event => {
    if (event.type === 'preview.pick' && event.state === 'off') { const esc = event.reason === 'esc'; setActive(false); if (!edit) hideCard(); if (esc) toggle.focus(); }
    if (event.type === 'preview.pick' && event.state === 'error') message(event.message, true);
    if (event.type === 'preview.selected' && event.root === current?.root && active) show(event.selection);
    if (event.type === 'run.status') { if (['starting', 'working'].includes(event.status) && active) action(() => stop()); available(); }
  });
  window.previewEdit = {
    // Ny forhåndsvisning eller nyt projekt: valget hører til den gamle side.
    onPreview() { if (active) action(() => stop({ keepResult: false })); else hideCard(); available(); },
    reset() { setActive(false); hideCard(); available(); },
    available, reloadStatic,
    get active() { return active; }
  };
})();
