// Approved feedback presentation. Run state and permissions remain owned by the main chat flow.
(() => {
  const el = id => document.getElementById(id);
  const divider = el('sidebar-divider'), sidebar = el('sidebar'), workspace = el('workspace');
  const composer = el('prompt'), content = el('chat-content'), banner = el('agent-activity');
  // R5 (D1): sidepanelets bredde bor som NOGLE ny i det fælles layout-objekt
  // (harness-workspace-layout-v1) — den gamle nøgle er kun læst-fallback.
  // Skrivningen fletter i objektet, så chat-bredden og andre nøgler overlever;
  // viewport.js' gemning fletter på samme måde, så denne nøgle aldrig tabes.
  const layoutKey = 'harness-workspace-layout-v1', legacyKey = 'aura-sidebar-width-v1';
  let preferredWidth = 280, pointer = null, frame = null, presentation = { running: false, waitingTarget: null };
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey));
    const legacy = Number(localStorage.getItem(legacyKey));
    const value = Number.isFinite(saved?.sidebar) && saved.sidebar >= 264 && saved.sidebar <= 420 ? saved.sidebar
      : Number.isFinite(legacy) && legacy >= 180 && legacy <= 320 ? Math.max(264, Math.min(420, legacy)) : null;
    if (value) preferredWidth = value;
  } catch { /* Optional local layout preference. */ }
  const maxWidth = () => Math.max(264, Math.min(420, innerWidth - 680));
  const available = () => !workspace.hidden && innerWidth > 900 && !document.body.classList.contains('sidebar-collapsed');
  function sizeSidebar() {
    const width = Math.round(Math.max(264, Math.min(maxWidth(), preferredWidth)));
    document.body.style.setProperty('--feedback-sidebar-width', `${width}px`);
    divider.setAttribute('aria-valuemin', '264'); divider.setAttribute('aria-valuemax', String(maxWidth()));
    divider.setAttribute('aria-valuenow', String(width)); divider.setAttribute('aria-valuetext', `${width} pixels til projekter og samtaler`);
  }
  function saveWidth() {
    try {
      const saved = JSON.parse(localStorage.getItem(layoutKey)) || {};
      saved.sidebar = preferredWidth;
      localStorage.setItem(layoutKey, JSON.stringify(saved));
    } catch { /* No data or permissions are stored here. */ }
  }
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
    preferredWidth = Math.max(264, Math.min(maxWidth(), event.key === 'Home' ? 264 : event.key === 'End' ? maxWidth() : width + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 40 : 10)));
    sizeSidebar(); saveWidth();
  });
  divider.addEventListener('dblclick', () => { preferredWidth = 280; sizeSidebar(); saveWidth(); });
  function fitComposer() {
    if (workspace.hidden || !composer.clientWidth) return;
    composer.style.height = 'auto';
    // 36 px gulv dokket (52 px i helten via CSS-min), 336 px loft — derefter
    // scroller feltet internt (§5.1).
    composer.style.height = `${Math.max(36, Math.min(336, composer.scrollHeight))}px`;
    composer.style.overflowY = composer.scrollHeight > 336 ? 'auto' : 'hidden';
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
    // Båndet beholder altid sin faste plads i samtalen; idle skjules med opacity via is-idle,
    // så beskederne aldrig rykker sig, når arbejdet starter eller holder op.
    banner.hidden = false;
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
// Tilladelses-pillen bor her med arbejdsmåde-menuen (§5.3/§5.4): de to deler
// samme tilstand (arbejdsmåde + YOLO) og samme disabled-forløb (R1).
(() => {
  const menu = $('#composer-mode-menu'), toggle = $('#composer-mode'), select = $('#work-mode');
  const choices = [...menu.querySelectorAll('[data-work-mode]')], yolo = $('#composer-yolo');
  const pill = $('#permission-pill'), pillLabel = $('#permission-pill-label'), permissionMenu = $('#permission-menu'), menuText = $('#permission-menu-text'), boundary = $('#composer-mode-boundary');
  const topbarToggle = $('#topbar-mode');
  // B3: topbjælke-chippen og composer-chippen er to visninger af én tilstand;
  // begge spejler menuens åbningstilstand, og fokus vender tilbage til den
  // chip, der åbnede menuen.
  let owner = null, invoker = toggle;
  const same = () => owner && current?.root === owner.root && view?.id === owner.chat;
  const blocked = () => running || projectLoading || Boolean(view?.submitting) || toggle.disabled;
  const isOpen = () => menu.matches(':popover-open');
  function expanded(open) { toggle.setAttribute('aria-expanded', String(open)); topbarToggle?.setAttribute('aria-expanded', String(open)); }
  function close({ focus = false } = {}) {
    if (isOpen()) menu.hidePopover();
    expanded(false); owner = null;
    if (focus) invoker.focus();
  }
  function position() {
    if (!isOpen()) return;
    // Bredden følger composeren (som før), højden låses til visningsfladen;
    // selve forankringen — og genankringen ved zoom, rulning og resize —
    // ejer det fælles popover-lag.
    const composer = $('#chat-form').getBoundingClientRect();
    menu.style.maxHeight = `${Math.max(140, innerHeight - 24)}px`;
    if (window.PopoverLayer) window.PopoverLayer.position(); else menu.hidePopover();
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
    const active = Boolean(view?.conversationPermission?.active);
    // Tilladelses-pillen er et RESUMÉ, ikke reglen (R1): fire interne værdier
    // gengives ærligt, »Spørg før ændringer« hævdes kun, når det faktisk
    // gælder, og YOLO-punktet bor nu her (§5.4). Deaktiveringen forsvinder
    // aldrig — en armeret YOLO kan slås fra i enhver arbejdsmåde.
    const state = window.PermissionPill?.summary(select.value, { active });
    if (state) {
      pillLabel.textContent = state.label;
      pill.dataset.tone = state.tone;
      menuText.textContent = state.explanation;
      yolo.hidden = state.yolo === 'none';
      boundary.hidden = state.yolo === 'none';
      yolo.textContent = state.yolo === 'disable' ? 'Slå YOLO fra' : 'Slå YOLO til …';
      yolo.setAttribute('aria-pressed', String(active));
      boundary.textContent = state.yolo === 'disable' ? 'Kun denne samtale. Planer og dataregler gælder stadig.' : 'Kun under Byg. Du gennemgår en advarsel først.';
      pill.setAttribute('aria-label', `Tilladelser: ${state.label}`);
    }
    yolo.disabled = blocked();
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
  // YOLO aktiveres aldrig fra pillen uden dialogen: klikket går gennem
  // #yolo-toggle til den eksisterende advarselsdialog (conversation-permission.js),
  // og deaktiveringen er ét klik. Intet gemmes til næste appstart.
  yolo.addEventListener('click', () => { if (!same() || blocked()) return; window.PopoverLayer.close(); $('#yolo-toggle').click(); });
  pill.addEventListener('click', () => {
    sync();
    window.PopoverLayer.open({ layer: permissionMenu, invoker: pill, align: 'start', gap: 4, width: () => 320 });
  });
  permissionMenu.addEventListener('toggle', () => { pill.setAttribute('aria-expanded', String(permissionMenu.matches(':popover-open'))); });
  menu.addEventListener('toggle', () => { expanded(isOpen()); if (!isOpen()) owner = null; });
  toggle.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); window.ComposerWorkMode.open(); } });
  topbarToggle?.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); window.ComposerWorkMode.open(topbarToggle); } });
  window.ComposerWorkMode = { sync, close, open(from = toggle) {
    if (isOpen()) { close({ focus: true }); return; }
    if (blocked() || !current?.root || !view?.id) return;
    owner = selectedOwner(); invoker = from === toggle || from === topbarToggle ? from : toggle; sync();
    // Menen åbner gennem det fælles popover-lag: venstrestillet ved chippen,
    // 4 px fra ankeret (§5.4), bredde følger composeren. Laget genankorer ved
    // zoom, rulning og vinduesstørrelse — ingen faste koordinater.
    window.PopoverLayer.open({
      layer: menu, invoker, gap: 4,
      width: () => { const composer = $('#chat-form').getBoundingClientRect(); return Math.min(380, Math.max(300, composer.width), innerWidth - 24); }
    });
    expanded(true); position();
    choices.find(item => item.getAttribute('aria-checked') === 'true' && !item.hidden)?.focus();
  } };
})();
