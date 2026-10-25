// Observed events only: no invented plan or private reasoning.
(() => {
  const runs = new WeakMap();
  const section = node('section', undefined, 'live-work'); section.hidden = true;
  const title = node('h3'), note = node('p', '', 'hint'), todos = node('ol', undefined, 'live-todos');
  const draft = node('details', undefined, 'live-draft'), summary = node('summary'), explanation = node('p', 'Udkastet er ikke gemt endnu.', 'hint');
  const code = node('pre'); code.tabIndex = 0; code.setAttribute('aria-label', 'Kode under modtagelse');
  const follow = node('button', 'Følg de nyeste linjer', 'text-button'); follow.type = 'button';
  let following = true, shown = '', panelOwner = null;
  code.addEventListener('scroll', () => { following = code.scrollHeight - code.scrollTop - code.clientHeight < 40; follow.hidden = following; });
  follow.onclick = () => { following = true; code.scrollTop = code.scrollHeight; follow.hidden = true; };
  draft.append(summary, explanation, code, follow); section.append(title, note, todos, draft);
  $('#panel-activity').insertBefore(section, $('#activity-scroll'));
  const peek = node('p', '', 'live-peek'); $('#preview-empty').append(peek);
  const duration = ms => ms < 1000 ? 'under 1 s' : ms < 60000 ? Math.floor(ms / 1000) + ' s' : Math.floor(ms / 60000) + ' min ' + Math.floor(ms / 1000) % 60 + ' s';
  function create(v) {
    const card = node('details', undefined, 'work-progress-card'); card.open = true;
    const heading = node('summary'), mark = node('span', '✦', 'work-progress-symbol'); mark.setAttribute('aria-hidden', 'true');
    const labels = node('span'), name = node('strong'), meta = node('small'); meta.setAttribute('aria-live', 'off'); labels.append(name, meta); heading.append(mark, labels); card.append(heading);
    const body = node('div', undefined, 'work-progress-body'), list = node('ol', undefined, 'work-progress-steps');
    const technical = node('details', undefined, 'work-progress-technical'), technicalText = node('pre');
    technical.append(node('summary', 'Tekniske detaljer'), technicalText);
    const all = node('button', 'Se hele aktiviteten', 'text-button'); all.type = 'button';
    all.onclick = () => window.workspace.show('activity', { focus: true }); technical.append(all);
    const waiting = node('button', 'Gennemgå mit valg', 'text-button work-progress-choice'); waiting.type = 'button'; waiting.hidden = true;
    waiting.onclick = () => { const item = v.waitingFor[0]; if (!item?.element?.isConnected) return; item.element.scrollIntoView({ block: 'nearest' }); item.element.querySelector('button, textarea, input')?.focus(); };
    body.append(list, waiting, technical); card.append(body);
    const run = { started: v.runStartedAt, card, name, meta, list, technical, technicalText, waiting, entries: new Map(), recovery: null, ended: null, signature: '' };
    runs.set(v, run);
    // sendNow marks the run active just before inserting the user's message.
    queueMicrotask(() => { if (runs.get(v) === run && !card.parentNode) v.log.append(card); });
    return run;
  }
  function forView(v) {
    let run = runs.get(v);
    if (v.running && (!run || run.started !== v.runStartedAt)) run = create(v);
    return run;
  }
  function currentPhase(v, run) {
    if (v.waitingFor?.length) return { title: 'Venter på dit valg', detail: v.waitingFor[0].title, status: 'waiting' };
    if (run.recovery) return { title: run.recovery.title, detail: run.recovery.detail, status: 'running' };
    const progress = window.ChatDisplay.progress(v);
    return { title: window.ChatDisplay.phase(v) || v.statusDetail || 'AI’en arbejder', detail: progress.quiet ? progress.text : v.modelProgress?.draft ? 'Ændringen er under forberedelse og er ikke gemt endnu.' : '', status: 'running' };
  }
  function step(item) {
    const row = node('li', undefined, 'work-progress-step status-' + item.status);
    const mark = node('span', item.completed ? '✓' : item.status === 'error' ? '!' : item.status === 'running' ? '' : '·', 'work-progress-mark'); mark.setAttribute('aria-hidden', 'true');
    const body = node('div'); body.append(node('strong', item.title)); if (item.detail) body.append(node('p', item.detail)); row.append(mark, body);
    if (item.elapsed != null) row.append(node('time', duration(item.elapsed)));
    row.setAttribute('aria-label', (item.completed ? 'Afsluttet' : item.status === 'error' ? 'Mislykkedes' : item.status === 'running' ? 'I gang' : item.status === 'waiting' ? 'Venter' : 'Registreret') + ': ' + item.title);
    return row;
  }
  function renderCard(v) {
    const run = forView(v); if (!run) return;
    if (v.activityGroup) v.activityGroup.hidden = true;
    if (!v.running && !run.ended) run.ended = Date.now();
    run.card.hidden = !v.running && !run.entries.size;
    const entries = [...run.entries.values()], count = window.ChatDisplay.activitySummary(entries);
    const phase = v.running ? currentPhase(v, run) : null;
    const name = phase?.title || (v.runLabel === 'Fejl' ? 'Arbejdet sluttede med en fejl' : v.runLabel === 'Stoppet' ? 'Arbejdet blev stoppet' : 'Arbejdet er afsluttet');
    if (run.name.textContent !== name) run.name.textContent = name;
    const parts = [];
    if (count.total) parts.push(count.completed + ' af ' + count.total + ' handlinger afsluttet');
    if (count.errors) parts.push(count.errors + ' fejl');
    if (Number.isFinite(run.started) && run.started > 0) parts.push(duration((run.ended || Date.now()) - run.started));
    const meta = parts.join(' · ') || 'Følg arbejdet'; if (run.meta.textContent !== meta) run.meta.textContent = meta;
    // Recent facts only; the full exact log remains available in Activity.
    const rows = entries.filter(entry => entry.kind === 'tool' || ['approval', 'question'].includes(entry.kind)).slice(-4).map(entry => window.ChatDisplay.activityEntry(entry, { finished: !v.running }));
    if (phase && (!rows.length || !['running', 'waiting'].includes(rows.at(-1).status) || v.waitingFor?.length || run.recovery)) rows.push(phase);
    const signature = JSON.stringify(rows);
    if (signature !== run.signature) { run.signature = signature; run.list.replaceChildren(...rows.map(step)); }
    run.waiting.hidden = !v.waitingFor?.length;
    const details = entries.slice(-12).map(entry => [entry.title, entry.target, entry.error, Number.isInteger(entry.exit) ? 'Afslutningskode: ' + entry.exit : '', entry.output].filter(Boolean).join('\n'));
    const d = v.running && v.modelProgress?.draft;
    if (d) details.push(d.file + ' · ' + d.lines + ' linjer modtaget · ikke gemt endnu\n' + (d.hidden ? 'Indhold med mulige nøgler skjules.' : d.text || ''));
    const technical = details.join('\n\n') || 'Ingen tekniske handlinger registreret endnu.';
    if (run.technicalText.textContent !== technical) run.technicalText.textContent = technical;
  }
  $('#agent-follow').onclick = () => {
    const run = forView(view); if (!run) return;
    run.card.open = true; run.card.scrollIntoView({ block: 'nearest' }); run.card.querySelector('summary').focus({ preventScroll: true });
  };
  function render() {
    const v = view, p = v.modelProgress, d = p?.draft;
    renderCard(v);
    if (panelOwner !== v) { panelOwner = v; draft.open = false; shown = ''; }
    section.hidden = !v.running; peek.hidden = !v.running;
    if (!v.running) { code.textContent = ''; return; }
    const run = forView(v), phase = currentPhase(v, run);
    title.textContent = phase.title;
    note.textContent = phase.detail || 'Visningen følger de handlinger, Aura faktisk modtager.'; note.hidden = false;
    const list = v.todos || [], active = list.find(item => item.status === 'in_progress');
    peek.textContent = active?.text || phase.title;
    const signature = JSON.stringify(list);
    if (signature !== todos.dataset.value) {
      todos.dataset.value = signature;
      todos.replaceChildren(...list.map(item => {
        const row = node('li', ({ completed: '✓', in_progress: '›', cancelled: '–', pending: '○' })[item.status] + ' ' + item.text);
        row.className = 'todo-' + item.status; row.setAttribute('aria-label', ({ completed: 'AI’en markerede færdig', in_progress: 'I gang', cancelled: 'Udeladt', pending: 'Planlagt' })[item.status] + ': ' + item.text); return row;
      }));
    }
    todos.hidden = !list.length;
    draft.hidden = !d;
    if (!d) { code.textContent = ''; shown = ''; return; }
    summary.textContent = 'Tekniske detaljer · ' + d.file + ' · ' + (d.hidden ? 'indhold skjult' : d.lines + ' linjer modtaget');
    explanation.textContent = d.hidden ? 'Indholdet kan indeholde en nøgle og vises derfor ikke.' : 'Udkastet er ikke gemt endnu.' + (d.clipped ? ' Her vises de seneste linjer.' : '');
    if (shown !== d.id) { following = true; shown = d.id; }
    if (code.textContent !== d.text) { const top = code.scrollTop; code.textContent = d.text; code.scrollTop = following ? code.scrollHeight : top; }
    code.hidden = d.hidden; follow.hidden = following || d.hidden;
  }
  window.harness.onEvent(event => {
    if (!event.chat) return;
    const v = viewFor(event.chat), run = forView(v); if (!run) return;
    if (event.type === 'activity' && ['tool', 'approval', 'question', 'session'].includes(event.entry?.kind)) {
      const entry = event.entry;
      // An update to a previous task must not become a fact about the current run.
      if (Number.isFinite(entry.at) && entry.at < run.started) return;
      if (entry.kind !== 'session') {
        run.entries.set(entry.id, { ...run.entries.get(entry.id), ...entry });
      } else if (entry.title === 'Genoptager forbindelsen') run.recovery = entry;
      else if (entry.title === 'Forbindelsen er genoprettet') run.recovery = null;
    }
    if (event.type === 'model.progress' && event.progress?.phase !== 'waiting') run.recovery = null;
    renderCard(v); if (v === view) render();
  });
  window.liveWork = { render, noteTool(_id, v) { if (!forView(v)) return false; renderCard(v); return true; } };
})();
