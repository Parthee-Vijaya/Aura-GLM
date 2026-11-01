// "Sendt til AI": hvad Aura sendte ud over din tekst, pr. modelkald — kilde, størrelse og
// modtager fra den lokale journal. Aldrig indhold, aldrig nøgler. En læsevisning i Aktivitet,
// åbnet af brugeren; intet kan sendes eller godkendes herfra.
(function (root) {
  // Én post som tekst: klokkeslæt, modtager, omfang og kilderne pr. beskeddel.
  const sourceNames = { user: 'bruger', assistant: 'AI', tool: 'værktøj', system: 'systemprompt', developer: 'udvikler', besked: 'besked' };
  function describe(entry, kb = bytes => `${Math.max(1, Math.round(bytes / 102.4) / 10)} kB`.replace('.', ',')) {
    if (!entry || typeof entry !== 'object') return null;
    const at = typeof entry.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(entry.at) ? entry.at.slice(11, 16) : '';
    const model = entry.recipient?.model || 'ukendt model';
    const bytes = Number.isSafeInteger(entry.request?.bytes) ? kb(entry.request.bytes) : 'ukendt størrelse';
    const parts = Number.isSafeInteger(entry.request?.messages) ? entry.request.messages : null;
    const sources = [...new Set((entry.items || []).map(item => sourceNames[item.source] || item.source || 'besked'))];
    return {
      time: at, label: `${model}${parts !== null ? ` · ${parts} ${parts === 1 ? 'beskeddel' : 'beskeddele'}` : ''} · ${bytes}`,
      detail: sources.length ? `Kilder: ${sources.join(', ')}` : 'Ingen dele registreret'
    };
  }

  function mount() {
    const scroll = document.getElementById('activity-scroll');
    if (!scroll) return;
    const details = document.createElement('details'); details.className = 'request-log';
    const summary = document.createElement('summary'); summary.textContent = 'Sendt til AI';
    const hint = document.createElement('p'); hint.className = 'hint';
    hint.textContent = 'Hvad Aura sendte ud over din tekst i denne samtale: kilde, størrelse og modtager pr. kald. Indhold og nøgler gemmes aldrig.';
    const list = document.createElement('ol'); list.setAttribute('aria-label', 'Sendt til AI');
    const more = document.createElement('button'); more.type = 'button'; more.className = 'text-button'; more.hidden = true;
    more.textContent = 'Vis ældre kald';
    details.append(summary, hint, list, more);
    scroll.parentNode.insertBefore(details, scroll);

    // Journalen er pr. samtale: ved samtaleskift nulstilles visningen, så den forrige
    // samtales kald aldrig står under en ny samtale.
    let offset = 0, total = 0, owner = null, loaded = false;
    const reset = () => { list.replaceChildren(); more.hidden = true; offset = 0; loaded = false; };
    if (root.harness?.onEvent) root.harness.onEvent(event => {
      if (event.type === 'chats.updated' && event.active !== undefined && event.active !== owner) { owner = event.active; reset(); }
    });
    const render = page => {
      total = page.total;
      for (const entry of page.entries) {
        const line = describe(entry); if (!line) continue;
        const item = document.createElement('li');
        const heading = document.createElement('strong'); heading.textContent = line.label;
        const when = document.createElement('small'); when.textContent = line.time;
        item.append(when, document.createTextNode(' '), heading);
        const detail = document.createElement('p'); detail.className = 'hint'; detail.textContent = line.detail;
        item.append(detail); list.append(item);
      }
      more.hidden = offset >= total;
    };
    const load = async () => {
      try {
        const result = await window.harness.modelLogList({ offset, limit: 50 });
        if (result?.ok !== true) throw new Error(result?.error || 'Journalen kunne ikke læses');
        offset += result.value.entries.length;
        if (!list.children.length && !result.value.entries.length) {
          const empty = document.createElement('p'); empty.className = 'hint';
          empty.textContent = 'Ingen kald er sendt i denne samtale endnu.';
          details.insertBefore(empty, list);
        }
        render(result.value);
      } catch (error) {
        if (!list.children.length) { const failure = document.createElement('p'); failure.className = 'hint'; failure.textContent = error.message; details.insertBefore(failure, list); }
      }
    };
    details.addEventListener('toggle', () => { if (details.open) { if (!loaded) { loaded = true; reset(); } load(); } });
    more.addEventListener('click', load);
  }

  const api = { describe, mount };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RequestLogView = api;
  if (typeof document !== 'undefined') mount();
})(typeof window === 'object' ? window : globalThis);
