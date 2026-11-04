(() => {
  const el = id => document.getElementById(id);
  const grid = document.querySelector('.work-grid');
  const divider = el('workspace-divider'), surface = el('preview-surface'), stage = el('preview-stage');
  const preset = el('viewport-preset'), width = el('viewport-width'), height = el('viewport-height'), zoom = el('viewport-zoom');
  const sizes = { desktop: [1920, 1080], tablet: [768, 1024], phone: [390, 844] };
  const storageKey = 'harness-workspace-layout-v1';
  let settings = { chat: 420, preset: 'fluid', width: 390, height: 844, zoom: 'fit' };
  // Fresh installs size the chat column with the CSS clamp in styles.css
  // (420-720px, 35% of the grid). An inline --chat-width would override it,
  // so this module writes one only after the user has actually chosen a
  // width; until then the divider announces the width the clamp rendered.
  let userWidth = false;
  const fluidWidth = () => Math.round(Math.min(720, Math.max(420, grid.clientWidth * 0.35)));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Number.isFinite(saved.chat)) { settings.chat = Math.max(280, saved.chat); userWidth = true; }
    if (saved && ['fluid', 'custom', ...Object.keys(sizes)].includes(saved.preset)) settings.preset = saved.preset;
    if (saved && Number.isInteger(saved.width) && saved.width >= 240 && saved.width <= 7680) settings.width = saved.width;
    if (saved && Number.isInteger(saved.height) && saved.height >= 240 && saved.height <= 7680) settings.height = saved.height;
    if (saved?.zoom === 'actual') settings.zoom = 'actual';
  } catch { /* Layout kan bruges, selv om lokal lagring ikke er tilgængelig. */ }
  // A chosen width persists; until one exists the chat width is left out, so
  // the next start keeps the responsive default instead of a frozen default.
  function save() {
    try {
      // D1/R5: layout-objektet er fælles — læs-ændre-skriv, så nøgler andre
      // moduler har gemt (sidepanelets bredde i 'sidebar') aldrig tabes.
      let stored = {}; try { stored = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { /* Første gemning. */ }
      const next = userWidth ? settings : { ...settings, chat: undefined };
      for (const key of Object.keys(next)) if (next[key] !== undefined) stored[key] = next[key];
      localStorage.setItem(storageKey, JSON.stringify({ ...stored }));
    } catch { /* Kun brugerfladevalg. */ }
  }
  function split(value = settings.chat) {
    if (!grid.clientWidth) return;
    // Arbejdsfladen beholder mindst 300 px, så fanerne og forhåndsvisningens værktøjer kan stå.
    const max = Math.max(280, grid.clientWidth - 307);
    const actual = userWidth ? Math.round(Math.min(max, Math.max(280, value))) : fluidWidth();
    // Only a chosen width may pin the column; the clamp renders on its own.
    if (userWidth) grid.style.setProperty('--chat-width', `${actual}px`);
    divider.setAttribute('aria-valuemin', '280'); divider.setAttribute('aria-valuemax', String(max));
    divider.setAttribute('aria-valuenow', String(actual)); divider.setAttribute('aria-valuetext', `${actual} pixels til samtalen`);
    return actual;
  }
  function controls() {
    for (const btn of preset.querySelectorAll('.viewport-icon')) btn.setAttribute('aria-pressed', btn.dataset.preset === settings.preset ? 'true' : 'false'); width.value = settings.width; height.value = settings.height; zoom.value = settings.zoom;
    el('viewport-dimensions').hidden = settings.preset === 'fluid'; zoom.disabled = settings.preset === 'fluid';
  }
  // The fit calculation is zoom-safe: Chromium's page zoom (the profile's
  // font size, applied by the main process) scales every CSS pixel uniformly,
  // so surface.clientWidth, the stage and the iframe's transform all live in
  // the same zoomed CSS-pixel space. A zoomed window simply has fewer CSS
  // pixels available (1600 physical px at factor 1.23 reads ~1301), and the
  // scale below shrinks to fit them — 'fit' still fits. That is also the
  // honest behaviour for the device emulation: the emulated width stays the
  // chosen CSS pixels, only the on-screen rendering grows.
  function render() {
    if (!surface.clientWidth || !surface.clientHeight) return;
    const fluid = settings.preset === 'fluid';
    const w = fluid ? surface.clientWidth : settings.width;
    const h = fluid ? surface.clientHeight : settings.height;
    const scale = fluid || settings.zoom === 'actual' ? 1 : Math.min(1, Math.max(1, surface.clientWidth - 24) / w, Math.max(1, surface.clientHeight - 24) / h);
    stage.style.width = `${w * scale}px`; stage.style.height = `${h * scale}px`;
    stage.style.marginTop = fluid ? '0' : '12px';
    const frame = el('preview');
    if (!frame) return;
    frame.style.width = `${w}px`; frame.style.height = `${h}px`; frame.style.transform = `scale(${scale})`;
    size = { width: w, height: h };
    el('viewport-info').textContent = `${w} × ${h} · ${Math.round(scale * 100)} %`;
    el('viewport-info').title = 'CSS-pixels. Visningen efterligner skærmstørrelsen, ikke enhedens browser eller touchfunktioner.';
  }
  // Den størrelse, siden vises i. Før/efter-billederne i historikken tages i samme størrelse.
  let size = { width: 1280, height: 800 };
  window.previewLayout = render;
  window.previewViewSize = () => settings.preset === 'fluid' ? { ...size } : { width: settings.width, height: settings.height };
  let pointer = null;
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = event.pointerId; divider.setPointerCapture(pointer); divider.focus(); document.body.classList.add('resizing-workspace');
    grid.dataset.dragging = 'true'; event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    // Moving the divider is the user's choice: the clamp hands the column over.
    userWidth = true;
    settings.chat = split(event.clientX - grid.getBoundingClientRect().left - 3.5); render();
  });
  function finish() { if (pointer === null) return; pointer = null; document.body.classList.remove('resizing-workspace'); delete grid.dataset.dragging; save(); }
  divider.addEventListener('pointerup', finish); divider.addEventListener('pointercancel', finish); divider.addEventListener('lostpointercapture', finish); window.addEventListener('blur', finish);
  divider.addEventListener('dblclick', () => { userWidth = true; settings.chat = 420; split(); save(); });
  divider.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    // Keys choose a width the way a drag does; the clamp hands over.
    userWidth = true;
    const current = Number(divider.getAttribute('aria-valuenow'));
    settings.chat = split(event.key === 'Home' ? 280 : event.key === 'End' ? grid.clientWidth : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 50 : 10)); save();
  });
  for (const btn of preset.querySelectorAll('.viewport-icon')) btn.addEventListener('click', () => {
    settings.preset = btn.dataset.preset;
    if (sizes[btn.dataset.preset]) [settings.width, settings.height] = sizes[btn.dataset.preset];
    controls(); render(); save();
  });
  for (const input of [width, height]) input.addEventListener('change', () => {
    if (!input.value || !input.checkValidity()) { controls(); return; }
    settings.width = Number(width.value); settings.height = Number(height.value); settings.preset = 'custom'; controls(); render(); save();
  });
  el('viewport-rotate').addEventListener('click', () => { [settings.width, settings.height] = [settings.height, settings.width]; settings.preset = 'custom'; controls(); render(); save(); });
  zoom.addEventListener('change', () => { settings.zoom = zoom.value; render(); save(); });
  new ResizeObserver(() => { split(); render(); }).observe(grid);
  new ResizeObserver(render).observe(surface);
  controls(); split(); render();
})();
