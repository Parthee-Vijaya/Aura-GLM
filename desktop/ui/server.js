(() => {
  let status = null, review = null, managedURL = null;
  const active = () => ['installing', 'starting', 'running', 'stopping'].includes(status?.state);
  const labels = { idle: '', installing: 'Installerer pakker …', installed: 'Pakkerne er klar', starting: 'Starter forhåndsvisningen …', running: 'Forhåndsvisningen kører', stopping: 'Stopper …', stopped: 'Forhåndsvisningen er stoppet', error: 'Forhåndsvisningen kræver din hjælp' };
  function update(value) {
    if (!value || value.root !== current?.root) return;
    if (status?.root !== value.root) { managedURL = null; review = null; $('#server-review').hidden = true; $('#server-scripts').checked = false; }
    status = value;
    if (value.state === 'running' && value.url && current.previewURL !== value.url) { managedURL = value.url; showPreview(value.url, true); }
    else if (!value.url && managedURL) { if (current.previewURL === managedURL) showPreview(null); managedURL = null; }
    const project = value.project;
    const framework = project && project.kind !== 'static';
    $('#server-description').textContent = project?.supported ? `${project.label} · ${project.installed ? 'Pakkerne findes i projektet.' : 'Projektets pakker skal installeres, før du kan se appen.'}` : project?.reason || 'Åbn et projekt først.';
    $('#server-status').textContent = value.message || labels[value.state] || '';
    $('#server-primary').hidden = !project?.supported || active();
    $('#server-primary').textContent = project?.installed ? 'Gennemgå opstart' : 'Gennemgå installation';
    $('#server-primary').disabled = running;
    $('#server-stop').hidden = !active(); $('#server-stop').disabled = value.state === 'stopping';
    $('#server-actions').hidden = Boolean(review);
    $('#server-install-options').hidden = !project?.supported;
    $('#server-reinstall').disabled = active() || running || Boolean(review);
    $('#server-scripts').disabled = active() || Boolean(review);
    $('#server-log').textContent = value.output || 'Ingen proceslog endnu.';
    $('#server-open').hidden = !framework;
    $('#server-open').textContent = active() ? 'Vis opstart' : 'error' === value.state ? 'Gennemgå fejlen' : 'Start forhåndsvisning';
    if (!current.previewURL && framework) {
      $('#preview-empty h2').textContent = labels[value.state] || 'Se din app';
      $('#preview-empty p').textContent = value.state === 'error' ? value.message : project.supported ? 'Start projektets lokale server for at se resultatet. Du gennemgår handlingen, før noget køres.' : project.reason;
    } else if (!framework) {
      $('#preview-empty h2').textContent = 'Din app vises her';
      $('#preview-empty p').textContent = 'Beskriv, hvad du vil bygge, i samtalen. Når projektet har en side, kan du følge resultatet her.';
    }
    if (active() || value.state === 'error') $('#preview-status').textContent = labels[value.state];
  }
  async function refresh() { const root = current?.root; if (!root) return; const value = await call('previewRuntime'); if (current?.root === root) update(value); }
  async function open() {
    review = null; $('#server-review').hidden = true; $('#server-scripts').checked = false;
    $('#preview-dialog .dialog-notice')?.remove();
    await refresh(); $('#preview-dialog').showModal();
  }
  async function prepare(operation) {
    review = await call('previewPrepare', { action: operation, scripts: $('#server-scripts').checked });
    $('#server-actions').hidden = true; $('#server-review').hidden = false;
    $('#server-review-title').textContent = operation === 'install' ? 'Installér projektets pakker?' : 'Start den lokale server?';
    $('#server-consequence').textContent = operation === 'install' ? `Pakker hentes fra de registre og adresser, projektets npm-opsætning og lockfil angiver. node_modules ${review.project.install === 'ci' ? 'erstattes med lockfilens versioner' : 'oprettes eller opdateres, og package-lock.json kan ændres'}. ${review.scripts ? 'Installationsscripts køres.' : 'Installationsscripts springes over.'}` : 'Projektkode og frameworkets konfiguration køres på din computer. Serveren bindes til 127.0.0.1 og stoppes, når du skifter projekt eller lukker appen.';
    $('#server-authority').textContent = 'Det er ikke en isoleret sandbox. Koden har din brugers adgang til filer og netværk. Appens modelnøgler sendes ikke med som miljøvariabler; projektets egen kode kan læse lokale indstillinger og filer.';
    $('#server-command').textContent = review.command;
    $('#server-folder').textContent = review.root;
    $('#server-packages').textContent = 'Direkte pakker: ' + review.project.dependencies.join(', ') + (operation === 'start' ? '. Frameworket startes direkte; npm predev og postdev køres ikke.' : '. npm kan også bruge din eksisterende lokale registeropsætning.');
    $('#server-confirm').textContent = operation === 'install' ? 'Installér pakker' : 'Start forhåndsvisning';
    $('#server-confirm').disabled = false; update(status);
  }
  $('#server-open').onclick = () => action(open);
  $('#server-primary').onclick = () => action(() => prepare(status.project.installed ? 'start' : 'install'));
  $('#server-reinstall').onclick = () => action(() => prepare('install'));
  $('#server-cancel').onclick = () => { review = null; $('#server-review').hidden = true; update(status); };
  $('#server-confirm').onclick = () => action(async () => {
    const token = review?.token; review = null; $('#server-confirm').disabled = true;
    try { update(await call('previewExecute', token)); } finally { $('#server-review').hidden = true; await refresh(); }
  });
  $('#server-stop').onclick = () => action(async () => { await call('previewStop'); await refresh(); });
  // Slutstatus skal genlæse, om installationen nu findes; processen genstartes aldrig her.
  window.harness.onEvent(event => {
    if (event.type === 'preview.runtime' && ['installed', 'stopped', 'error'].includes(event.state)) void action(refresh);
    if (event.type === 'run.status' && status) update(status);
  });
  window.previewServer = { update, refresh: () => action(refresh), open: () => action(open) };
})();
