// En Promte-app i forhåndsvisningen beder siden omkring den om forbindelse (init). Aura svarer som Promte:
// appen får sine indstillinger, og dens kald sendes gennem Aura til den koblede Promte-app.
// Forhåndsvisningen har en opak origin, så appen genkendes på sit vindue, ikke på origin.
(() => {
  const $ = selector => document.querySelector(selector);
  const status = $('#promte-preview');
  let pending = null, createdApp = null;
  const frameFor = source => [...document.querySelectorAll('#preview-stage iframe')].find(frame => frame.contentWindow === source);
  const dark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  function show(text, action = null) {
    status.hidden = !text; status.textContent = text; status.disabled = !action;
    status.onclick = action ? () => action().catch(error => show(error.message)) : null;
  }
  async function connect(frame) {
    const r = await window.harness.promtePreviewConnect();
    if (!r.ok) { show(`Promte: ${r.error}`); return null; }
    const value = r.value;
    if (!value.active) { show(''); return null; }
    if (!value.connected) {
      show('Log ind med Promte for at afprøve appen', async () => {
        show('Godkend Aura i browseren …');
        const login = await window.harness.promtePreviewLogin();
        if (!login.ok) throw Error(login.error);
        // Appen er holdt op med at spørge, mens brugeren loggede ind. En genindlæsning starter forbindelsen igen.
        frame.src = frame.src;
      });
      return null;
    }
    // Aura opretter først en app i Promte, når brugeren vælger det.
    if (!value.settings) {
      show(`Opret appen ${value.name} i Promte`, async () => {
        show('Opretter appen i Promte …');
        const created = await window.harness.promtePreviewCreate();
        if (!created.ok) throw Error(created.error);
        if (created.value?.created) createdApp = created.value.workspaceId;
        frame.src = frame.src;
      });
      return null;
    }
    // Oprettelsen nævnes, så længe projektet er åbent, også når appen spørger igen.
    if (value.created) createdApp = value.workspaceId;
    show(createdApp === value.workspaceId ? `Promte · ${value.name} (ny app oprettet)` : `Promte · ${value.name}`);
    return value;
  }
  async function init(frame, source) {
    // Appen gentager init, indtil den får svar. Kun ét svar ad gangen.
    pending ||= connect(frame).finally(() => { setTimeout(() => { pending = null; }, 1000); });
    const value = await pending;
    if (!value || frame.contentWindow !== source) return;
    source.postMessage({ type: 'set-settings', value: value.settings }, '*');
    source.postMessage({ type: 'set-dark-mode', value: dark() }, '*');
    if (value.settings.user) source.postMessage({ type: 'set-user', value: value.settings.user }, '*');
  }
  async function serialize(body) {
    if (body instanceof Blob) return body.arrayBuffer();
    if (Array.isArray(body?.form)) return { form: await Promise.all(body.form.map(async ([name, value]) => [name, value instanceof Blob ? { data: await value.arrayBuffer(), type: value.type, name: value.name } : value])) };
    return body ?? null;
  }
  async function proxy(source, data) {
    const reply = message => source.postMessage({ type: 'promte-fetch-response', id: data.id, ...message }, '*');
    try {
      const r = await window.harness.promtePreviewFetch({ path: data.path, method: data.method, headers: data.headers, body: await serialize(data.body) });
      if (!r.ok) return reply({ error: r.error });
      reply({ status: r.value.status, statusText: r.value.statusText, headers: r.value.headers, body: r.value.body });
    } catch (error) { reply({ error: error.message || 'Kaldet til Promte mislykkedes.' }); }
  }
  window.addEventListener('message', event => {
    const frame = frameFor(event.source), data = event.data;
    if (!frame || !data || typeof data !== 'object') return;
    if (data.type === 'init' && data.fetchProxy === true) init(frame, event.source);
    else if (data.type === 'promte-fetch-request' && typeof data.id === 'string') proxy(event.source, data);
  });
  window.addEventListener('aura:project', () => { createdApp = null; show(''); });
})();
