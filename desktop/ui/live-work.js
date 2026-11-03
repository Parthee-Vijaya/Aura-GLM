// Trinrækker (D4b, §6.3): AI'ens arbejde som kompakte enlinje-rækker i samtalen.
// Kun observerede hændelser: ingen opdigtede planer og ingen private tænkeuddrag (R6) —
// rækken "Forbereder svaret" læser stream-progress' offentlige fase og tegnantal, aldrig
// resonnementets tekst. Godkendelser, Privacy Gate, planforslag og fejl, der kræver
// handling, beholder deres egne altid-synlige kort: rækkerne folder dem aldrig ind.
(function (root) {
  // ---------- Rene hjælpere (ren rendererlogik, testbar i Node) ----------
  // Verberne følger §2's kortform (Tænker/Læser/Bruger færdighed/Søger/Kører/Retter);
  // detaljen er målet fra den observerede hændelse. Glyfferne er de eksisterende
  // unicode-tegn (D0-ikonsættet er afvist).
  const VERBS = { read: 'Læser', glob: 'Finder filer', list: 'Kigger i mapper', grep: 'Søger', webfetch: 'Læser hjemmeside', websearch: 'Søger', edit: 'Retter', write: 'Skriver', multiedit: 'Retter', patch: 'Retter', apply_patch: 'Retter', bash: 'Kører', skill: 'Bruger færdighed', todoread: 'Læser opgavelisten', todowrite: 'Opdaterer opgavelisten', question: 'Spørger' };
  const GLYPHS = { read: '▤', glob: '▤', list: '▤', webfetch: '▤', grep: '⌕', websearch: '⌕', edit: '✎', write: '✎', multiedit: '✎', patch: '✎', apply_patch: '✎', bash: '▶', skill: '◈', todoread: '▤', todowrite: '✎', question: '◈' };
  const duration = ms => ms < 1000 ? 'under 1 s' : ms < 60000 ? Math.floor(ms / 1000) + ' s' : Math.floor(ms / 60000) + ' min ' + Math.floor(ms / 1000) % 60 + ' s';
  const READS = ['read', 'glob', 'list', 'webfetch', 'todoread'], EDITS = ['edit', 'write', 'multiedit', 'patch', 'apply_patch', 'todowrite'];
  // Detaljeniveauet læses af kropsklasserne (D4a: transcript-compact|standard|detailed,
  // standard er udgangspunktet). En ulæselig værdi folder til standard.
  function level(doc) {
    const list = doc?.body?.classList;
    if (!list) return 'standard';
    if (list.contains('transcript-compact')) return 'compact';
    if (list.contains('transcript-detailed')) return 'detailed';
    return 'standard';
  }
  // Grupperækkens tekst, fx "6 trin · 3 filer læst · 1 rettet · 14 s" (§6.3).
  function groupSummary(entries, ms) {
    const tools = entries.filter(entry => entry.kind === 'tool');
    const reads = tools.filter(entry => READS.includes(entry.tool)).length;
    const edits = tools.filter(entry => EDITS.includes(entry.tool)).length;
    const errors = tools.filter(entry => entry.status === 'error').length;
    const parts = [tools.length + ' trin'];
    if (reads) parts.push(reads === 1 ? '1 fil læst' : `${reads} filer læst`);
    if (edits) parts.push(edits === 1 ? '1 rettet' : `${edits} rettede`);
    if (errors) parts.push(errors === 1 ? '1 mislykkedes' : `${errors} mislykkedes`);
    if (Number.isFinite(ms) && ms >= 0) parts.push(duration(ms));
    return parts.join(' · ');
  }
  // FasERÆKKEN (R6): verbet er "Forbereder svaret", detaljen er stream-progress'
  // offentlige fase og tegnantal — aldrig resonnementets tekst. De lange
  // faseformuleringer fra chat-display bruges kun som tilbagefald uden tegn.
  function phaseRow(v, run) {
    if (v.waitingFor?.length) return { title: 'Venter på dit valg', detail: v.waitingFor[0].title, glyph: '●', status: 'waiting' };
    if (run.recovery) return { title: run.recovery.title, detail: run.recovery.detail, glyph: '✦', status: 'running' };
    const p = v.modelProgress;
    if (p && p.phase !== 'received') {
      if (p.phase === 'reasoning') return { title: 'Forbereder svaret', detail: p.reasoningChars ? `${p.reasoningChars.toLocaleString('da-DK')} tegn` : 'Modellen forbereder næste skridt …', glyph: '✦', status: 'running' };
      if (p.phase === 'text') return { title: 'Skriver svaret', detail: p.textChars ? `${p.textChars.toLocaleString('da-DK')} tegn` : 'AI’en skriver et svar …', glyph: '✦', status: 'running' };
      if (p.phase === 'tool') return p.draft ? { title: 'Retter', detail: p.draft.file, glyph: '✎', status: 'running' } : { title: 'Kører', detail: 'Modellen forbereder en handling …', glyph: '▶', status: 'running' };
      if (p.phase === 'waiting') return { title: 'Forbereder svaret', detail: 'Venter på udbyderen …', glyph: '✦', status: 'running' };
    }
    return null;
  }
  const api = { VERBS, GLYPHS, READS, EDITS, duration, level, groupSummary, phaseRow };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.StepRows = api;

  // ---------- DOM-trådningen (browser + prøve-fixture) ----------
  if (typeof document === 'undefined' || !document.getElementById) return;
  const runs = new WeakMap();
  function create(v) {
    const holder = node('div', '', 'turn-steps');
    const run = { started: v.runStartedAt, holder, entries: new Map(), recovery: null, ended: null, fold: null, open: new Set(), liveOpen: false, signature: '' };
    runs.set(v, run);
    // sendNow marks the run active just before inserting the user's message, so the
    // rows land between the user's bubble and the AI's answer parts.
    queueMicrotask(() => { if (runs.get(v) === run && !holder.parentNode) v.log.append(holder); });
    return run;
  }
  function forView(v) {
    let run = runs.get(v);
    if (v.running && (!run || run.started !== v.runStartedAt)) run = create(v);
    return run;
  }
  // Den fulde titel står som aria-label på rækken: detaljen afkortes visuelt,
  // men hjælpemidler og den foldede række viser hele målet (O2).
  function rowLabel(presentation, target) {
    const state = presentation.status === 'completed' ? 'Afsluttet' : presentation.status === 'error' ? 'Mislykkedes' : presentation.status === 'running' ? 'I gang' : presentation.status === 'waiting' ? 'Venter' : presentation.status === 'stopped' ? 'Ikke afsluttet' : 'Registreret';
    return `${state}: ${presentation.title}${target ? ` ${target}` : ''}`;
  }
  // Glyf-boksen har to lag: verbets glyf og (ved hover/fokus) en chevron —
  // de krydsfader hinanden på 100 ms (§6.3). Glyffen er dekoreret aria-hidden.
  function glyphBox(char) {
    const glyph = node('span', undefined, 'step-glyph'); glyph.setAttribute('aria-hidden', 'true');
    glyph.append(node('span', char, 'step-glyph-char'));
    return glyph;
  }
  // Det foldede indhold: målet står altid fuldt og umaskeret øverst (O2), fejl og
  // afventende valg er aldrig fanget af fade-maskerne — kun det lange output ruller.
  // Udkastet (koden under modtagelse) følger den kørende filrække, også når
  // stream-progress' værktøjs-id og aktivitetens id er forskellige.
  function contentFor(entry, v) {
    const content = node('div', undefined, 'step-content');
    if (entry.target) content.append(node('pre', entry.target, 'step-target'));
    if (entry.error) content.append(node('pre', entry.error, 'step-error'));
    if (Number.isInteger(entry.exit) && entry.exit !== 0) content.append(node('p', `Afslutningskode: ${entry.exit}`, 'step-exit'));
    const d = v.running && v.modelProgress?.draft;
    // Udkastet (koden under modtagelse) følger den aktuelle filrække: den
    // nyeste, ikke-afsluttede skrive-/redigeringshandling. Stream-progress'
    // værktøjs-id og aktivitetens id kan være forskellige, og en startet
    // handling kan mangle både status og mål, indtil argumenterne er helt modtaget.
    const editing = ['edit', 'write', 'multiedit', 'patch', 'apply_patch'].includes(entry?.tool) && !['completed', 'error', 'stopped'].includes(entry?.status);
    const drafting = d && (!entry || entry.id === d.id || editing);
    if (drafting) {
      const head = node('p', `${d.file} · ${d.lines} linjer modtaget · ikke gemt endnu`, 'step-draft-head');
      const note = node('p', d.hidden ? 'Indhold med mulige nøgler skjules.' : 'Udkastet er ikke gemt endnu.' + (d.clipped ? ' Her vises de seneste linjer.' : ''), 'hint step-draft-note');
      const pre = node('pre', d.hidden ? '' : d.text, 'step-output step-draft'); pre.tabIndex = 0; pre.setAttribute('aria-label', 'Kode under modtagelse');
      content.append(head, note, pre);
    } else if (entry.output) content.append(node('pre', entry.output, 'step-output'));
    if (!content.childNodes.length) content.append(node('p', 'Ingen tekniske detaljer registreret.', 'hint'));
    return content;
  }
  function stepRow(entry, v, options = {}) {
    const presentation = window.ChatDisplay.activityEntry(entry, { finished: !v.running });
    const details = node('details', undefined, `disclosure step status-${presentation.status}`);
    details.dataset.id = entry.id;
    const summary = node('summary', undefined, 'step-row');
    const glyph = glyphBox(GLYPHS[entry.tool] || '▤');
    const text = node('span', undefined, 'step-text');
    text.append(node('span', options.verb || VERBS[entry.tool] || 'Udfører', 'step-verb'));
    if (entry.target) text.append(node('span', ' · ', 'step-sep'), node('span', entry.target, 'step-detail'));
    if (presentation.status === 'running' || presentation.status === 'waiting') text.append(node('span', '· kører', 'step-running-note'));
    const meta = node('span', undefined, 'step-meta');
    if (presentation.elapsed != null) meta.append(node('time', duration(presentation.elapsed), 'step-time'));
    meta.append(node('span', presentation.status === 'completed' ? '✓' : presentation.status === 'error' ? '!' : presentation.status === 'stopped' ? '×' : presentation.status === 'waiting' ? '●' : '', 'step-mark'));
    meta.setAttribute('aria-hidden', 'true');
    summary.append(glyph, text, meta);
    summary.setAttribute('aria-label', rowLabel(presentation, entry.target));
    summary.title = entry.target || presentation.title;
    details.append(summary, contentFor(entry, v));
    return details;
  }
  function phaseLine(phase, run, v, options = {}) {
    const summary = node('summary', undefined, 'step-row');
    const glyph = glyphBox(phase.glyph);
    const text = node('span', undefined, 'step-text');
    text.append(node('span', options.verb || phase.title, 'step-verb'));
    if (phase.detail) text.append(node('span', ' · ', 'step-sep'), node('span', phase.detail, 'step-detail'));
    if (phase.status === 'running' || phase.status === 'waiting') text.append(node('span', '· kører', 'step-running-note'));
    const meta = node('span', undefined, 'step-meta');
    const elapsed = Number.isFinite(run.started) && run.started > 0 ? (run.ended || Date.now()) - run.started : null;
    if (elapsed != null) meta.append(node('time', duration(elapsed), 'step-time'));
    meta.setAttribute('aria-hidden', 'true');
    summary.append(glyph, text, meta);
    summary.setAttribute('aria-label', phase.status === 'waiting' ? `Venter: ${phase.title} ${phase.detail}` : `${phase.title}${phase.detail ? ` ${phase.detail}` : ''}`);
    return summary;
  }
  // Enkelt live-linje (compact/standard, §6.5): "Arbejder · {aktuelt trin}" med
  // uret til højre; indholdet bag klik er det aktuelle trins tekniske detaljer.
  // Compact viser kun "Arbejder · 12 s" — undtagen ventetilstanden, der er en
  // altid-synlig tilstand (§6.3) og derfor står frem på alle niveauer.
  function liveRow(v, run) {
    const lvl = level(document);
    const tools = [...run.entries.values()].filter(entry => entry.kind === 'tool');
    const current = [...tools].reverse().find(entry => entry.status === 'running') || tools.at(-1) || null;
    const phase = phaseRow(v, run);
    // Ventetilstanden er en altid-synlig tilstand (§6.3): verbet skifter fra
    // "Arbejder" til "Venter på dit valg" på alle niveauer.
    const waiting = Boolean(v.waitingFor?.length);
    const detail = waiting ? v.waitingFor[0].title
      : lvl === 'compact' ? ''
      : current ? `${VERBS[current.tool] || 'Udfører'}${current.target ? ` · ${current.target}` : phase?.draft ? ` · ${phase.draft.file}` : ''}`
      : phase ? `${phase.title}${phase.detail ? ` · ${phase.detail}` : ''}`
      : '';
    const details = node('details', undefined, `disclosure step step-live status-${waiting ? 'waiting' : 'running'}`);
    const summary = phaseLine({ title: waiting ? 'Venter på dit valg' : 'Arbejder', detail, glyph: waiting ? '●' : '✦', status: waiting ? 'waiting' : 'running' }, run, v);
    details.append(summary, contentFor(current || {}, v));
    const all = node('button', 'Se hele aktiviteten', 'text-button step-all'); all.type = 'button';
    all.onclick = () => window.workspace.show('activity', { focus: true });
    details.querySelector('.step-content').append(all);
    if (v.waitingFor?.length) {
      const waiting = node('button', 'Gennemgå mit valg', 'text-button step-waiting'); waiting.type = 'button';
      waiting.onclick = () => { const item = v.waitingFor[0]; if (!item?.element?.isConnected) return; item.element.scrollIntoView({ block: 'nearest' }); item.element.querySelector('button, textarea, input')?.focus(); };
      details.querySelector('.step-content').append(waiting);
    }
    details.addEventListener('toggle', () => { run.liveOpen = details.open; });
    details.open = run.liveOpen;
    return details;
  }
  function renderCard(v) {
    const run = forView(v); if (!run) return;
    if (v.activityGroup) v.activityGroup.hidden = true;
    const finished = !v.running;
    if (finished && !run.ended) run.ended = Date.now();
    const lvl = level(document);
    const tools = [...run.entries.values()].filter(entry => entry.kind === 'tool');
    const show = v.running || tools.length > 0;
    run.holder.hidden = !show;
    if (!show) { run.holder.replaceChildren(); run.signature = ''; return; }
    // Færdig tur → ÉN grupperække (§6.3): "▸ 6 trin · 3 filer læst · 1 rettet · 14 s".
    // Igangværende tur → alle rækker live (detailed) eller én live-linje (compact/standard).
    const mode = finished ? 'group' : lvl === 'detailed' ? 'rows' : 'live';
    const phase = finished ? null : phaseRow(v, run) || { title: window.ChatDisplay.phase(v) || v.statusDetail || 'AI’en arbejder', detail: '', glyph: '✦', status: 'running' };
    const signature = JSON.stringify([mode, lvl, tools.map(entry => [entry.id, entry.status, entry.target, entry.error, entry.output?.length, entry.exit]), phase && [phase.title, phase.detail, phase.status], v.waitingFor?.length, v.modelProgress?.draft?.id]);
    if (signature !== run.signature) {
      run.signature = signature;
      const children = [];
      if (mode === 'group') {
        const group = node('details', undefined, 'disclosure step step-group');
        const summary = node('summary', undefined, 'step-row');
        const glyph = glyphBox('▸');
        const text = node('span', groupSummary(tools, run.ended - run.started), 'step-text');
        const meta = node('span', undefined, 'step-meta');
        meta.append(node('time', duration((run.ended || Date.now()) - run.started), 'step-time'));
        meta.setAttribute('aria-hidden', 'true');
        summary.append(glyph, text, meta);
        summary.setAttribute('aria-label', `Arbejdet: ${groupSummary(tools, run.ended - run.started)}`);
        const body = node('div', undefined, 'step-group-rows');
        for (const entry of tools) {
          const row = stepRow(entry, v);
          row.addEventListener('toggle', () => { if (row.open) run.open.add(entry.id); else run.open.delete(entry.id); });
          row.open = run.open.has(entry.id);
          body.append(row);
        }
        const all = node('button', 'Se hele aktiviteten', 'text-button step-all'); all.type = 'button';
        all.onclick = () => window.workspace.show('activity', { focus: true });
        body.append(all);
        group.append(summary, body);
        // Brugerens foldvalg vinder (R7): rækken holdt åben/lukket, som brugeren
        // valgte — niveauet bestemmer kun udgangstilstanden, og et niveauskift
        // ændrer aldrig en manuelt åbnet gruppe.
        group.addEventListener('toggle', () => { run.fold = group.open ? 'open' : 'closed'; });
        group.open = run.fold === 'open';
        children.push(group);
      } else if (mode === 'rows') {
        for (const entry of tools) {
          const row = stepRow(entry, v);
          row.addEventListener('toggle', () => { if (row.open) run.open.add(entry.id); else run.open.delete(entry.id); });
          row.open = run.open.has(entry.id);
          children.push(row);
        }
        const last = children.at(-1);
        if (phase && !(last?.classList.contains('status-running') || last?.classList.contains('status-waiting'))) {
          const details = node('details', undefined, `disclosure step status-${phase.status}`);
          details.append(phaseLine(phase, run, v), contentFor(v.running && v.modelProgress?.draft && phase.title === 'Retter' ? { id: v.modelProgress.draft.id, target: v.modelProgress.draft.file } : {}, v));
          children.push(details);
        }
      } else children.push(liveRow(v, run));
      run.holder.replaceChildren(...children);
    } else {
      // Fintopdatering: kun uret ændrer sig hvert sekund — ingen genopbygning,
      // så en række, brugeren har foldet ud, aldrig lukkes af en streamhændelse.
      for (const time of run.holder.querySelectorAll('.step-meta .step-time')) {
        const details = time.closest('details');
        const entry = details?.dataset.id ? run.entries.get(details.dataset.id) : null;
        const presentation = entry ? window.ChatDisplay.activityEntry(entry, { finished }) : null;
        const elapsed = presentation?.elapsed != null ? presentation.elapsed : Number.isFinite(run.started) && run.started > 0 ? (run.ended || Date.now()) - run.started : null;
        const text = elapsed != null ? duration(elapsed) : '';
        if (time.textContent !== text) time.textContent = text;
      }
    }
  }
  $('#agent-follow').onclick = () => {
    const run = forView(view); if (!run) return;
    const group = run.holder.querySelector('details.step-group, details.step-live, details.step');
    if (run.fold !== null) run.fold = 'open';
    if (group) { group.open = true; group.scrollIntoView({ block: 'nearest' }); group.querySelector('summary')?.focus({ preventScroll: true }); }
    else run.holder.scrollIntoView({ block: 'nearest' });
  };
  // ---------- Panelet Aktivitet: den eksisterende live-visning (uændret flade) ----------
  const section = node('section', undefined, 'live-work'); section.hidden = true;
  const title = node('h3'), note = node('p', '', 'hint'), todos = node('ol', undefined, 'live-todos');
  const draft = node('details', undefined, 'live-draft disclosure'), summary = node('summary'), explanation = node('p', 'Udkastet er ikke gemt endnu.', 'hint');
  const code = node('pre'); code.tabIndex = 0; code.setAttribute('aria-label', 'Kode under modtagelse');
  const follow = node('button', 'Følg de nyeste linjer', 'text-button'); follow.type = 'button';
  let following = true, shown = '', panelOwner = null;
  code.addEventListener('scroll', () => { following = code.scrollHeight - code.scrollTop - code.clientHeight < 40; follow.hidden = following; });
  follow.onclick = () => { following = true; code.scrollTop = code.scrollHeight; follow.hidden = true; };
  draft.append(summary, explanation, code, follow); section.append(title, note, todos, draft);
  $('#panel-activity').insertBefore(section, $('#activity-scroll'));
  const peek = node('p', '', 'live-peek'); $('#preview-empty').append(peek);
  function render() {
    const v = view, p = v.modelProgress, d = p?.draft;
    renderCard(v);
    if (panelOwner !== v) { panelOwner = v; draft.open = false; shown = ''; }
    section.hidden = !v.running; peek.hidden = !v.running;
    if (!v.running) { code.textContent = ''; return; }
    const run = forView(v), phase = phaseRow(v, run) || { title: window.ChatDisplay.phase(v) || v.statusDetail || 'AI’en arbejder', detail: '', status: 'running' };
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
})(typeof window === 'undefined' ? globalThis : window);
