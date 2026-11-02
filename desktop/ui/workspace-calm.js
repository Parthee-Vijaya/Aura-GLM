// Approved workspace presentation. This module never sends messages or grants permissions.
(() => {
  const root = document.getElementById('workspace');
  const el = id => document.getElementById(id);
  const body = document.body;
  const narrow = matchMedia('(max-width: 720px)');
  const overlaySidebar = matchMedia('(max-width: 900px)');
  // Theme: the profile is the single source; aura.theme-hint.v1 is the
  // read-only renderer copy, written only by profile/theme code (this module
  // and settings.js) so the theme applies synchronously at startup. Without a
  // stored choice the app follows the system's light/dark state.
  const themeHintKey = 'aura.theme-hint.v1';
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  function storedChoice() { try { const v = localStorage.getItem(themeHintKey); return ['system', 'light', 'dark'].includes(v) ? v : null; } catch { return null; } }
  function resolveTheme() { const choice = storedChoice(); return choice === 'light' || choice === 'dark' ? choice : (systemDark.matches ? 'dark' : 'light'); }
  let theme = resolveTheme(), mobileSurface = false;

  const themeButton = node('button', 'Mørk arbejdsvisning');
  themeButton.id = 'workspace-theme'; themeButton.type = 'button';
  themeButton.setAttribute('role', 'switch');
  el('project-menu').append(themeButton);
  const navigation = node('button', '☰', 'calm-navigation');
  navigation.id = 'workspace-navigation'; navigation.type = 'button';
  navigation.setAttribute('aria-label', 'Vis projekter og samtaler');
  navigation.setAttribute('aria-controls', 'sidebar'); navigation.setAttribute('aria-expanded', 'false');
  root.querySelector('.workspace-bar').prepend(navigation);

  const mobile = node('nav', undefined, 'calm-mobile-tabs');
  mobile.setAttribute('aria-label', 'Arbejdsvisning');
  const chatButton = node('button', 'Samtale'), surfaceButton = node('button', 'Arbejdsflade');
  chatButton.type = surfaceButton.type = 'button';
  chatButton.id = 'workspace-chat'; surfaceButton.id = 'workspace-surface';
  chatButton.setAttribute('aria-controls', 'chat-panel'); surfaceButton.setAttribute('aria-controls', 'work-surface');
  mobile.append(chatButton, surfaceButton); root.append(mobile);

  function applyTheme() {
    body.dataset.workspaceTheme = theme;
    themeButton.setAttribute('aria-checked', String(theme === 'dark'));
  }
  // Profile/theme code calls this after saving a theme: refresh the hint copy
  // and apply the choice immediately ('system' follows prefers-color-scheme).
  function setTheme(choice) {
    try { localStorage.setItem(themeHintKey, choice === 'light' || choice === 'dark' ? choice : 'system'); } catch { /* Presentation only. */ }
    theme = resolveTheme();
    applyTheme();
  }
  async function invoke(method, value) {
    const response = await window.harness[method](value);
    if (!response.ok) throw new Error(response.error);
    return response.value;
  }
  // The project-menu button cycles light/dark: the visual change and the hint
  // are synchronous; the profile persists asynchronously as the single source.
  themeButton.onclick = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    void (async () => {
      try {
        const current = await invoke('profileGet');
        await invoke('profileSave', { appearance: { theme: next, panelOpen: current.profile?.appearance?.panelOpen !== false } });
      } catch { /* The hint keeps this session's choice; the profile stays authoritative. */ }
    })();
  };
  // Follows the system's light/dark change unless a stored choice overrides it.
  systemDark.addEventListener('change', () => { theme = resolveTheme(); applyTheme(); });
  function closeSidebar() {
    body.classList.remove('calm-sidebar-open'); navigation.setAttribute('aria-expanded', 'false');
  }
  navigation.onclick = () => {
    if (!overlaySidebar.matches) { el('sidebar-toggle').click(); return; }
    // Preserve the user's regular sidebar preference outside this temporary drawer.
    const open = body.classList.toggle('calm-sidebar-open'); navigation.setAttribute('aria-expanded', String(open)); panes();
    if (open) el('sidebar-toggle').focus();
  };
  el('sidebar-toggle').addEventListener('click', event => {
    if (!body.classList.contains('workspace-calm') || !overlaySidebar.matches) return;
    event.stopImmediatePropagation(); closeSidebar(); navigation.focus();
  }, true);
  el('sidebar').addEventListener('click', event => {
    if (overlaySidebar.matches && event.target.closest('.chat-row, .project-name')) closeSidebar();
  });
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest('#sidebar, #workspace-navigation')) closeSidebar();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && body.classList.contains('calm-sidebar-open')) { closeSidebar(); navigation.focus(); }
  });
  function panes() {
    root.classList.toggle('calm-mobile-surface', mobileSurface);
    chatButton.setAttribute('aria-pressed', String(!mobileSurface)); surfaceButton.setAttribute('aria-pressed', String(mobileSurface));
    el('chat-panel').inert = narrow.matches && mobileSurface;
    el('work-surface').inert = narrow.matches && !mobileSurface;
    // A hidden drawer must not retain keyboard focus targets.
    el('sidebar').inert = body.classList.contains('workspace-calm') && overlaySidebar.matches && !body.classList.contains('calm-sidebar-open');
    window.previewLayout?.();
  }
  function showPane(showSurface, focus = false) {
    mobileSurface = showSurface; panes();
    if (focus && narrow.matches) (showSurface ? root.querySelector('.work-tab[aria-selected="true"]') : el('prompt'))?.focus();
  }
  chatButton.onclick = () => showPane(false, true); surfaceButton.onclick = () => showPane(true, true);
  const sidebarObserver = new MutationObserver(panes); sidebarObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
  narrow.addEventListener('change', panes);
  overlaySidebar.addEventListener('change', () => { closeSidebar(); panes(); });
  function visibility() {
    body.classList.toggle('workspace-calm', !root.hidden);
    if (root.hidden) { closeSidebar(); el('sidebar').inert = false; }
    panes();
  }
  new MutationObserver(visibility).observe(root, { attributes: true, attributeFilter: ['hidden'] });
  window.calmWorkspace = { showSurface: () => showPane(true), showChat: () => showPane(false), setTheme };
  applyTheme(); visibility();
})();
