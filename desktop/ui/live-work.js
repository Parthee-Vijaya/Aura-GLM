// Kun faktiske signaler. Udkastet er tekst fra en igangværende filhandling, ikke en gemt fil.
(() => {
  const section = node('section', undefined, 'live-work'); section.hidden = true;
  const title = node('h3'), note = node('p', '', 'hint'), todos = node('ol', undefined, 'live-todos');
  const draft = node('details', undefined, 'live-draft'), summary = node('summary'), explanation = node('p', 'Udkastet er ikke gemt endnu.', 'hint');
  const code = node('pre'); code.tabIndex = 0; code.setAttribute('aria-label', 'Kode under modtagelse');
  const follow = node('button', 'Følg de nyeste linjer', 'text-button'); follow.type = 'button';
  let following = true, shown = '';
  code.addEventListener('scroll', () => { following = code.scrollHeight - code.scrollTop - code.clientHeight < 40; follow.hidden = following; });
  follow.onclick = () => { following = true; code.scrollTop = code.scrollHeight; follow.hidden = true; };
  draft.append(summary, explanation, code, follow); section.append(title, note, todos, draft);
  $('#panel-activity').insertBefore(section, $('#activity-scroll'));
  const peek = node('p', '', 'live-peek'); $('#preview-empty').append(peek);
  const open = () => { window.workspace.show('activity', { focus: true }); draft.open = Boolean(view.modelProgress?.draft); };
  $('#agent-follow').onclick = open;
  function render() {
    const v = view, p = v.modelProgress, d = p?.draft;
    section.hidden = !v.running; peek.hidden = !v.running;
    if (!v.running) { code.textContent = ''; return; }
    const phase = window.ChatDisplay.phase(v);
    title.textContent = d ? 'Kode under modtagelse' : phase || v.statusDetail;
    note.textContent = window.ChatDisplay.progress(v).text; note.hidden = Boolean(d);
    const list = v.todos || [], active = list.find(item => item.status === 'in_progress');
    peek.textContent = active?.text || phase || 'Venter på AI’en …';
    const signature = JSON.stringify(list);
    if (signature !== todos.dataset.value) {
      todos.dataset.value = signature;
      todos.replaceChildren(...list.map(item => {
        const row = node('li', `${({ completed: '✓', in_progress: '›', cancelled: '–', pending: '○' })[item.status]} ${item.text}`);
        row.className = `todo-${item.status}`; row.setAttribute('aria-label', `${({ completed: 'AI’en markerede færdig', in_progress: 'I gang', cancelled: 'Udeladt', pending: 'Planlagt' })[item.status]}: ${item.text}`); return row;
      }));
    }
    todos.hidden = !list.length;
    draft.hidden = !d;
    if (!d) { code.textContent = ''; shown = ''; return; }
    summary.textContent = `${d.file} · ${d.hidden ? 'indhold skjult' : `${d.lines} linjer modtaget`}`;
    explanation.textContent = d.hidden ? 'Indholdet kan indeholde en nøgle og vises derfor ikke.' : `Udkastet er ikke gemt endnu.${d.clipped ? ' Her vises de seneste linjer.' : ''}`;
    if (shown !== d.id) { following = true; shown = d.id; }
    if (code.textContent !== d.text) { const top = code.scrollTop; code.textContent = d.text; code.scrollTop = following ? code.scrollHeight : top; }
    code.hidden = d.hidden; follow.hidden = following || d.hidden;
  }
  window.liveWork = { render };
})();
