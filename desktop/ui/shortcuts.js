// Tastaturlaget: genvejene fanges i hovedprocessen (også med fokus i previewet) og udføres her.
// ⌘1-5 skifter fane, ⌘. stopper den kørende opgave, ⌘⇧M åbner modelvælgeren og ⌘L fokuserer
// skrivefeltet. Dialoger og popovers spærrer for navigationsgenveje; Stop og paletten består.
// Åbne valg (⌘K) og tekstkomposition røres ikke af dette lag.
(function (root) {
  const TABS = Object.freeze({ '1': 'preview', '2': 'plan', '3': 'changes', '4': 'code', '5': 'activity' });

  // Beslutningen er ren: genvej + tilstand → handling eller null. Testbar uden DOM.
  function decide(id, state) {
    if (id === 'stop') return state.running ? 'stop' : null;
    if (id === 'composer') return state.overlay ? null : 'composer';
    if (id === 'model') return state.overlay ? null : 'model';
    const tab = /^tab-([1-5])$/.exec(id);
    if (!tab) return null;
    if (state.overlay) return null;
    // ⌘1-5 åbner panelet, hvis det er lukket — DSH-stil chat-først.
    if (state.hiddenTab === TABS[tab[1]]) return null;
    return 'tab:' + TABS[tab[1]];
  }

  function apply(decision) {
    if (!decision) return;
    if (decision === 'stop') { const stop = document.getElementById('stop'); if (stop && !stop.hidden) stop.click(); return; }
    if (decision === 'composer') { const prompt = document.getElementById('prompt'); prompt?.focus(); return; }
    if (decision === 'model') { document.getElementById('model-chip')?.click(); return; }
    if (decision.startsWith('tab:')) { window.workspace?.show(decision.slice(4), { focus: true }); return; }
  }

  function overlayOpen() {
    // Dialoger, popovers og opsætningsskærmen (en <main>, ikke en dialog) spærrer navigation;
    // Stop består dog altid.
    if (document.querySelector('dialog[open], [popover]:popover-open')) return true;
    const working = document.getElementById('workspace');
    return !working || working.hidden;
  }

  function onShortcut(id) {
    apply(decide(id, {
      running: !document.getElementById('stop')?.hidden,
      overlay: overlayOpen(),
      hiddenTab: document.getElementById('tab-plan')?.offsetParent === null ? 'plan' : null,
      // Panelet er altid tilgængeligt: ⌘1-5 åbner det, hvis det er lukket.
      panelClosed: document.querySelector('.work-grid')?.dataset?.surface === 'off'
    }));
  }

  const api = { decide, apply, onShortcut, TABS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.Shortcuts = api;
  if (root.harness?.onEvent) root.harness.onEvent(event => { if (event.type === 'shortcut') onShortcut(event.id); });
})(typeof window === 'object' ? window : globalThis);
