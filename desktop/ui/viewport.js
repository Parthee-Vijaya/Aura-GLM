(() => {
  const el = id => document.getElementById(id);
  const grid = document.querySelector('.work-grid');
  const divider = el('workspace-divider'), surface = el('preview-surface'), stage = el('preview-stage'), frame = el('preview');
  const preset = el('viewport-preset'), width = el('viewport-width'), height = el('viewport-height'), zoom = el('viewport-zoom');
  const sizes = { desktop: [1920, 1080], tablet: [768, 1024], phone: [390, 844] };
  const storageKey = 'harness-workspace-layout-v1';
  let settings = { chat: 350, preset: 'fluid', width: 390, height: 844, zoom: 'fit' };
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && Number.isFinite(saved.chat)) settings.chat = Math.max(280, saved.chat);
    if (saved && ['fluid', 'custom', ...Object.keys(sizes)].includes(saved.preset)) settings.preset = saved.preset;
    if (saved && Number.isInteger(saved.width) && saved.width >= 240 && saved.width <= 7680) settings.width = saved.width;
    if (saved && Number.isInteger(saved.height) && saved.height >= 240 && saved.height <= 7680) settings.height = saved.height;
    if (saved?.zoom === 'actual') settings.zoom = 'actual';
  } catch { /* Layout kan bruges, selv om lokal lagring ikke er tilgængelig. */ }
  function save() { try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Kun brugerfladevalg. */ } }
  function split(value = settings.chat) {
    if (!grid.clientWidth) return;
    const max = Math.max(280, grid.clientWidth - 287);
    const actual = Math.round(Math.min(max, Math.max(280, value)));
    grid.style.setProperty('--chat-width', `${actual}px`);
    divider.setAttribute('aria-valuemin', '280'); divider.setAttribute('aria-valuemax', String(max));
    divider.setAttribute('aria-valuenow', String(actual)); divider.setAttribute('aria-valuetext', `${actual} pixels til samtalen`);
    return actual;
  }
  function controls() {
    preset.value = settings.preset; width.value = settings.width; height.value = settings.height; zoom.value = settings.zoom;
    el('viewport-dimensions').hidden = settings.preset === 'fluid'; zoom.disabled = settings.preset === 'fluid';
  }
  function render() {
    if (!surface.clientWidth || !surface.clientHeight) return;
    const fluid = settings.preset === 'fluid';
    const w = fluid ? surface.clientWidth : settings.width;
    const h = fluid ? surface.clientHeight : settings.height;
    const scale = fluid || settings.zoom === 'actual' ? 1 : Math.min(1, Math.max(1, surface.clientWidth - 24) / w, Math.max(1, surface.clientHeight - 24) / h);
    stage.style.width = `${w * scale}px`; stage.style.height = `${h * scale}px`;
    stage.style.marginTop = fluid ? '0' : '12px';
    frame.style.width = `${w}px`; frame.style.height = `${h}px`; frame.style.transform = `scale(${scale})`;
    el('viewport-info').textContent = `${w} × ${h} · ${Math.round(scale * 100)} %`;
    el('viewport-info').title = 'CSS-pixels. Visningen efterligner skærmstørrelsen, ikke enhedens browser eller touchfunktioner.';
  }
  let pointer = null;
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    pointer = event.pointerId; divider.setPointerCapture(pointer); divider.focus(); document.body.classList.add('resizing-workspace'); event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    settings.chat = split(event.clientX - grid.getBoundingClientRect().left - 3.5); render();
  });
  function finish() { if (pointer === null) return; pointer = null; document.body.classList.remove('resizing-workspace'); save(); }
  divider.addEventListener('pointerup', finish); divider.addEventListener('pointercancel', finish); divider.addEventListener('lostpointercapture', finish); window.addEventListener('blur', finish);
  divider.addEventListener('dblclick', () => { settings.chat = 350; split(); save(); });
  divider.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number(divider.getAttribute('aria-valuenow'));
    settings.chat = split(event.key === 'Home' ? 280 : event.key === 'End' ? grid.clientWidth : current + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 50 : 10)); save();
  });
  preset.addEventListener('change', () => {
    settings.preset = preset.value;
    if (sizes[preset.value]) [settings.width, settings.height] = sizes[preset.value];
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
