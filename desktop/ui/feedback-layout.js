// Approved feedback presentation. Run state and permissions remain owned by the main chat flow.
(() => {
  const el = id => document.getElementById(id);
  const divider = el('sidebar-divider'), sidebar = el('sidebar'), workspace = el('workspace');
  const composer = el('prompt'), content = el('chat-content'), banner = el('agent-activity');
  const storageKey = 'aura-sidebar-width-v1';
  let preferredWidth = 208, pointer = null, frame = null, presentation = { running: false, waitingTarget: null };
  try { const value = Number(localStorage.getItem(storageKey)); if (Number.isFinite(value) && value >= 180 && value <= 320) preferredWidth = value; } catch { /* Optional local layout preference. */ }
  const maxWidth = () => Math.max(180, Math.min(320, innerWidth - 680));
  const available = () => !workspace.hidden && innerWidth > 900 && !document.body.classList.contains('sidebar-collapsed');
  function sizeSidebar() {
    const width = Math.round(Math.max(180, Math.min(maxWidth(), preferredWidth)));
    document.body.style.setProperty('--feedback-sidebar-width', `${width}px`);
    divider.setAttribute('aria-valuemin', '180'); divider.setAttribute('aria-valuemax', String(maxWidth()));
    divider.setAttribute('aria-valuenow', String(width)); divider.setAttribute('aria-valuetext', `${width} pixels til projekter og samtaler`);
  }
  function saveWidth() { try { localStorage.setItem(storageKey, String(preferredWidth)); } catch { /* No data or permissions are stored here. */ } }
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !available()) return;
    pointer = event.pointerId; divider.setPointerCapture(pointer); divider.focus(); document.body.classList.add('resizing-sidebar'); event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    preferredWidth = Math.round(Math.max(180, Math.min(maxWidth(), event.clientX))); sizeSidebar();
  });
  function finishResize() {
    if (pointer === null) return;
    const previous = pointer; pointer = null;
    if (divider.hasPointerCapture(previous)) divider.releasePointerCapture(previous);
    document.body.classList.remove('resizing-sidebar'); saveWidth();
  }
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) divider.addEventListener(event, finishResize);
  window.addEventListener('blur', finishResize);
  divider.addEventListener('keydown', event => {
    if (!available() || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const width = Number(divider.getAttribute('aria-valuenow'));
    preferredWidth = Math.max(180, Math.min(maxWidth(), event.key === 'Home' ? 180 : event.key === 'End' ? maxWidth() : width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 40 : 10)));
    sizeSidebar(); saveWidth();
  });
  divider.addEventListener('dblclick', () => { preferredWidth = 208; sizeSidebar(); saveWidth(); });
  function fitComposer() {
    if (workspace.hidden || !composer.clientWidth) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.max(34, Math.min(150, composer.scrollHeight))}px`;
    composer.style.overflowY = composer.scrollHeight > 150 ? 'auto' : 'hidden';
  }
  // Hide the shortcut only when the actual question and its answer control are visible.
  // Tool/plan/data approvals remain visible and keep their existing review handlers.
  function visibleQuestion(target) {
    if (!target?.isConnected || !target.classList.contains('question-card') || !content.contains(target)) return false;
    const bounds = content.getBoundingClientRect(), card = target.getBoundingClientRect();
    const control = target.querySelector('textarea:not([hidden]), button:not([hidden]), input:not([hidden])');
    if (!control) return false;
    const answer = control.getBoundingClientRect();
    return card.top >= bounds.top - 2 && card.top < bounds.bottom && answer.height > 0 && answer.top >= bounds.top && answer.bottom <= bounds.bottom;
  }
  function refreshBanner() {
    const waiting = Boolean(presentation.waitingTarget?.isConnected);
    banner.hidden = !presentation.running || (waiting && visibleQuestion(presentation.waitingTarget) && !banner.contains(document.activeElement));
    banner.classList.toggle('is-actionable', waiting);
    banner.setAttribute('role', 'status');
    const jump = el('agent-activity-jump');
    if (waiting) jump.setAttribute('aria-label', el('agent-activity-text').textContent + '. Gå til dit valg.');
    else jump.removeAttribute('aria-label');
  }
  function schedule() { if (frame !== null) return; frame = requestAnimationFrame(() => { frame = null; refreshBanner(); }); }
  el('agent-activity-jump').addEventListener('click', schedule);
  content.addEventListener('scroll', schedule, { passive: true });
  banner.addEventListener('focusout', schedule);
  new ResizeObserver(schedule).observe(content);
  new ResizeObserver(() => { fitComposer(); schedule(); }).observe(el('chat-form'));
  composer.addEventListener('input', fitComposer); composer.addEventListener('focus', fitComposer);
  window.addEventListener('resize', () => { sizeSidebar(); fitComposer(); schedule(); });
  window.feedbackLayout = { fitComposer, update(value) { presentation = { running: Boolean(value.running), waitingTarget: value.waitingTarget || null }; fitComposer(); refreshBanner(); schedule(); } };
  sizeSidebar(); fitComposer();
})();

// FB11: the composer exposes existing modes; policy and draft changes use the existing select handler.
(() => {
  const menu = $('#composer-mode-menu'), toggle = $('#composer-mode'), select = $('#work-mode');
  const choices = [...menu.querySelectorAll('[data-work-mode]')], yolo = $('#composer-yolo');
  let owner = null;
  const same = () => owner && current?.root === owner.root && view?.id === owner.chat;
  const blocked = () => running || projectLoading || Boolean(view?.submitting) || toggle.disabled;
  const isOpen = () => menu.matches(':popover-open');
  function close({ focus = false } = {}) {
    if (isOpen()) menu.hidePopover();
    toggle.setAttribute('aria-expanded', 'false'); owner = null;
    if (focus) toggle.focus();
  }
  function position() {
    if (!isOpen()) return;
    const anchor = toggle.getBoundingClientRect(), composer = $('#chat-form').getBoundingClientRect();
    const width = Math.min(380, Math.max(300, composer.width), innerWidth - 24);
    menu.style.width = `${width}px`; menu.style.maxHeight = `${Math.max(140, innerHeight - 24)}px`;
    const height = menu.getBoundingClientRect().height;
    menu.style.left = `${Math.max(12, Math.min(composer.left, innerWidth - width - 12))}px`;
    menu.style.top = `${Math.max(12, Math.min(anchor.top - height - 12, innerHeight - height - 12))}px`;
  }
  function sync() {
    if (isOpen() && (!same() || blocked())) close();
    const selected = select.value === 'build' ? 'free' : select.value;
    for (const button of choices) {
      const chosen = button.dataset.workMode === selected;
      const option = [...select.options].find(item => item.value === button.dataset.workMode);
      button.hidden = Boolean(option?.hidden); button.disabled = blocked() || Boolean(option?.disabled);
      button.setAttribute('aria-checked', String(chosen)); button.tabIndex = chosen ? 0 : -1;
    }
    const build = ['build', 'free'].includes(select.value), active = Boolean(view?.conversationPermission?.active);
    yolo.hidden = !build; yolo.disabled = blocked(); yolo.textContent = active ? 'YOLO · slå fra' : 'YOLO · slå til …'; yolo.setAttribute('aria-pressed', String(active));
    $('#composer-mode-boundary').textContent = !build ? 'YOLO giver ingen ekstra rettigheder i denne arbejdsmåde.' : active ? 'Kun denne samtale. Planer og dataregler gælder stadig.' : 'Kun under Byg. Du gennemgår en advarsel først.';
    $('#composer-build-help').textContent = activePlan ? 'Byg videre på den valgte plan. Planens godkendelse, dataregler og værktøjsgodkendelser gælder stadig.' : 'Byg eller ret appen ud fra din besked. Planvalg, dataregler og værktøjsgodkendelser gælder stadig.';
    position();
  }
  function choose(button, keepOpen = false) {
    if (!same() || blocked() || button.hidden || button.disabled) return;
    // Byg retains a selected plan; choosing a mode never approves or submits it.
    select.value = button.dataset.workMode === 'free' && activePlan ? 'build' : button.dataset.workMode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    if (keepOpen) { sync(); button.focus(); } else close({ focus: true });
  }
  for (const button of choices) button.addEventListener('click', () => choose(button));
  menu.addEventListener('keydown', event => {
    const currentChoice = event.target.closest('[data-work-mode]');
    if (!currentChoice || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const visible = choices.filter(item => !item.hidden && !item.disabled), index = visible.indexOf(currentChoice);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : (index + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + visible.length) % visible.length;
    event.preventDefault(); choose(visible[next], true);
  });
  yolo.addEventListener('click', () => { if (!same() || blocked()) return; close(); $('#yolo-toggle').click(); });
  menu.addEventListener('toggle', () => { toggle.setAttribute('aria-expanded', String(isOpen())); if (!isOpen()) owner = null; });
  toggle.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); window.ComposerWorkMode.open(); } });
  window.addEventListener('resize', position);
  window.ComposerWorkMode = { sync, close, open() {
    if (isOpen()) { close({ focus: true }); return; }
    if (blocked() || !current?.root || !view?.id) return;
    owner = selectedOwner(); sync(); menu.showPopover(); toggle.setAttribute('aria-expanded', 'true'); position();
    choices.find(item => item.getAttribute('aria-checked') === 'true' && !item.hidden)?.focus();
  } };
})();
