// SPDX-License-Identifier: EUPL-1.2
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FONT_SIZE } = require('../core/profile.cjs');

// 4K-skalering: the profile's font size (10-16 px, 13 neutral) is applied by
// the main process as Chromium's page zoom — never a CSS zoom on the app root
// and never a --aura-text variable. This file pins the whole chain against the
// real sources: applyProfileFontSize clamps and sets the zoom factor, the
// startup path applies it before the window is painted, profile:save and the
// View menu's zoom entries persist through the profile, the preview's fit
// calculation is zoom-safe arithmetic, and the wide content caps live in
// workspace-calm.css as min-width media queries. Real source slices run in
// synthetic contexts (settings-theme.test.cjs's pattern).
const ui = path.join(__dirname, '..', 'ui');
const main = fs.readFileSync(path.join(__dirname, '..', 'main.cjs'), 'utf8');
const viewport = fs.readFileSync(path.join(ui, 'viewport.js'), 'utf8');
const calmCss = fs.readFileSync(path.join(ui, 'workspace-calm.css'), 'utf8');
const settingsSource = fs.readFileSync(path.join(ui, 'settings.js'), 'utf8');

function slice(source, marker, endMarker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `kilden mangler "${marker}"`);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, `kilden mangler "${endMarker}" efter "${marker}"`);
  return source.slice(start, end);
}
const mainSlice = (marker, endMarker) => slice(main, marker, endMarker);
const nearly = (a, b, epsilon = 1e-9) => Math.abs(a - b) < epsilon;

// applyProfileFontSize: the clamping apply step. An unreadable value folds to
// the neutral 13, and the zoom factor is always size/13 — never the raw
// renderer value.
test('main.cjs: applyProfileFontSize klamrer værdien og sætter zoomfaktoren', () => {
  // let bindings stay inside the script scope, so the test reads the module
  // value through a var — the source line itself is untouched by the swap.
  const source = mainSlice('let profileFontSize', 'async function stepFontSize').replace('let profileFontSize', 'var profileFontSize');
  const clampFontSize = require('../core/profile.cjs').clampFontSize;
  const scenario = window => {
    const zoom = [];
    const context = { FONT_SIZE, clampFontSize, window };
    vm.runInNewContext(source, context);
    return { context, zoom };
  };
  const live = scenario({ isDestroyed: () => false, webContents: { setZoomFactor: factor => live.zoom.push(factor) } });
  assert.equal(live.context.profileFontSize, FONT_SIZE.base, 'modulet starter på det neutrale 13');
  live.context.applyProfileFontSize(16);
  assert.equal(live.context.profileFontSize, 16, 'en gyldig værdi klamres igennem');
  assert.deepEqual(live.zoom.map(factor => Math.round(factor * 1000)), [Math.round(16 / 13 * 1000)], 'faktoren er størrelse/13 — her 1.231');
  live.context.applyProfileFontSize(99);
  assert.equal(live.context.profileFontSize, 13, 'en værdi uden for rækken klamres til 13 — rendereren er aldrig blindt betroet');
  assert.equal(live.zoom.length, 2, 'den klamrede ændring rammer vinduet som 100%');
  live.context.applyProfileFontSize('14');
  assert.equal(live.context.profileFontSize, 13, 'en ulæselig værdi giver det neutrale 13');
  assert.equal(live.zoom.length, 3, 'anvendelsen er idempotent — den klamrede 13 sættes igen, ikke sprunget over');
  assert.ok(Math.abs(live.zoom[2] - 1) < 1e-9, 'faktoren er den neutrale 1.0');
  live.context.applyProfileFontSize(10);
  assert.equal(live.zoom.length, 4, 'et gyldigt trin rammer vinduet igen');
  assert.ok(Math.abs(live.zoom[3] - 10 / 13) < 1e-9, 'nedre grænse 10 svarer til 0.769');
  const gone = scenario({ isDestroyed: () => true, webContents: { setZoomFactor: () => { throw new Error('et lukket vindue røres ikke'); } } });
  gone.context.applyProfileFontSize(16);
  assert.equal(gone.context.profileFontSize, 16, 'et lukket vindue crasher aldrig anvendelsen');
  const bare = scenario(null);
  bare.context.applyProfileFontSize(15);
  assert.equal(bare.context.profileFontSize, 15, 'før vinduet findes, holdes kun værdien klar');
});

// Startup: the profile's theme AND font size are read before createWindow, so
// the first paint matches the profile. The font size is applied to the window
// through the webPreferences zoom factor inside createWindow.
test('main.cjs: opstarten læser og anvender skriftstørrelsen før vinduet skabes', async () => {
  const line = mainSlice('try { const appearance = (await profileStore().get()).profile.appearance', '\n');
  const applied = [], zooms = [];
  const context = {
    applyProfileTheme: theme => applied.push(theme),
    applyProfileFontSize: size => zooms.push(size),
    profileStore: () => ({ get: async () => ({ profile: { appearance: { theme: 'dark', fontSize: 16 } } }) })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, context);
  assert.deepEqual(applied, ['dark'], 'temaet sættes ved opstart som før');
  assert.deepEqual(zooms, [16], 'skriftstørrelsen afleveres til anvendelsen ved opstart');
  const failing = {
    applyProfileTheme: theme => applied.push(theme),
    applyProfileFontSize: size => zooms.push(size),
    profileStore: () => ({ get: async () => { throw new Error('datamappen er låst'); } })
  };
  await vm.runInNewContext(`(async () => {\n${line}\n})()`, failing);
  assert.deepEqual(zooms, [16], 'en ulæselig profil efterlader den neutrale zoom og stopper ikke opstarten');
  assert.ok(main.indexOf('applyProfileFontSize(appearance.fontSize);') < main.indexOf('createWindow();'), 'skriftstørrelsen håndhæves før createWindow()');
});

// createWindow: the zoom factor travels in webPreferences (applied by Electron
// before the first paint) and is set explicitly before the first load — no
// flash of the base size, and reloads keep the profile's zoom.
test('main.cjs: createWindow giver webContents zoomfaktoren fra profilen — før første indlæsning', () => {
  // The slice runs to the closed handler (balanced) and appends the real first
  // load; the crash path's own loadURL must not cut the function short.
  const start = main.indexOf('function createWindow() {');
  assert.ok(start >= 0, 'createWindow findes i main.cjs');
  const endMarker = "created.on('closed', () => { window = null; assets = []; registry.deselect(); });";
  const end = main.indexOf(endMarker, start);
  assert.ok(end > start, 'createWindow afsluttes med closed-handlingen');
  const source = main.slice(start, end + endMarker.length);
  const order = [];
  class FakeWindow {
    constructor(options) {
      this.options = options;
      this.webContents = {
        setZoomFactor: factor => order.push(['setZoomFactor', factor]),
        setWindowOpenHandler: () => order.push(['setWindowOpenHandler']),
        on: () => {}
      };
    }
    maximize() {}
    isDestroyed() { return false; }
    on() {}
    loadURL(url) { order.push(['loadURL', url]); }
  }
  const context = {
    BrowserWindow: FakeWindow, path: { join: (...parts) => parts.join('/') }, __dirname: '/app',
    nativeTheme: { shouldUseDarkColors: false }, DISPLAY_NAME: 'Aura Prime', appIcon: 'icon.png',
    profileFontSize: 16, FONT_SIZE, window: null, uiURL: 'harness://app/index.html'
  };
  // The slice carries createWindow's opening brace; the wrapper closes the
  // function after the appended first load.
  vm.runInNewContext(`(${source}\nwindow.loadURL(uiURL);\n})()`, context);
  assert.ok(nearly(context.window.options.webPreferences.zoomFactor, 16 / 13), 'webPreferences bærer faktoren fra første ping — 16/13');
  assert.deepEqual(order.map(step => step[0]), ['setZoomFactor', 'setWindowOpenHandler', 'loadURL'], 'faktoren sættes eksplicit før den første indlæsning');
  assert.ok(nearly(order[0][1], 16 / 13), 'den eksplicitte faktor er også 16/13');
});

// profile:save: a patch that carries a font size applies the saved size; any
// other patch leaves the zoom untouched. The value comes from the saved
// profile, never from the request.
test('main.cjs: profile:save håndhæver skriftstørrelsen efter en gemning, der inkluderer den', async () => {
  const source = mainSlice("handle('profile:save'", '\n');
  let action = null;
  const zooms = [], themes = [];
  const context = {
    handle: (channel, fn) => { if (channel === 'profile:save') action = fn; },
    exclusive: fn => fn(),
    profileStore: () => ({ save: async input => ({ profile: { appearance: { theme: input.appearance?.theme, fontSize: input.appearance?.fontSize } } }) }),
    applyProfileTheme: theme => themes.push(theme),
    applyProfileFontSize: size => zooms.push(size)
  };
  vm.runInNewContext(source, context);
  assert.ok(action, 'profile:save-handleren er registreret');
  await action({ appearance: { fontSize: 16 } });
  assert.deepEqual(zooms, [16], 'den gemte skriftstørrelse anvendes straks');
  await action({ name: 'Anna' });
  assert.deepEqual(zooms, [16], 'en gemning uden skriftstørrelse rører ikke zoomen');
  await action({ appearance: { theme: 'dark' } });
  assert.deepEqual(themes, ['dark'], 'temagrenen består uændret ved siden af');
  assert.deepEqual(zooms, [16], 'en ren temagemning rører ikke zoomen');
});

// The View menu: Electron's unmanaged role zoom is gone; the three entries
// walk the profile's font size with explicit accelerators.
test('main.cjs: Vis-menuens zoomgange går gennem profilen — rollerne er væk', () => {
  for (const role of ['resetZoom', 'zoomIn', 'zoomOut']) assert.ok(!main.includes(`role: '${role}'`), `Electrons uadministrerede ${role}-rolle er fjernet`);
  const view = mainSlice("{ label: 'Vis', submenu: [", "\n    { label: 'Vindue'");
  const entries = [
    ['Faktisk størrelse', 'CmdOrCtrl+0', 'stepFontSize(0)'],
    ['Zoom ind', 'CmdOrCtrl+Plus', 'stepFontSize(1)'],
    ['Zoom ud', 'CmdOrCtrl+-', 'stepFontSize(-1)']
  ];
  for (const [label, accelerator, call] of entries) {
    const pattern = new RegExp(`label: '${label}', accelerator: '${accelerator.replace('+', '\\+')}', click: \\(\\) => void ${call.replace('(', '\\(').replace(')', '\\)')}`);
    assert.ok(pattern.test(view), `${label} har genvejen ${accelerator} og kalder ${call}`);
  }
  assert.ok(view.includes("role: 'togglefullscreen'"), 'fuldskærmsrollen består');
});

// stepFontSize: the menu's steps. Every step persists through the profile and
// applies the saved size; the bounds are honest no-ops, and a failing or busy
// save leaves the zoom as it was.
test('main.cjs: stepFontSize skriver trinnet gennem profilen og stopper ærligt ved grænserne', async () => {
  const source = mainSlice('async function stepFontSize', "handle('profile:get'");
  const plain = value => JSON.parse(JSON.stringify(value));
  const run = ({ start, fail = false }) => {
    const saves = [], zooms = [];
    const context = {
      FONT_SIZE,
      profileFontSize: start,
      exclusive: fn => fn(),
      profileStore: () => ({ save: async input => { if (fail) throw new Error('allerede i gang'); saves.push(input); return { profile: { appearance: { fontSize: input.appearance.fontSize } } }; } }),
      applyProfileFontSize: size => { context.profileFontSize = size; zooms.push(size); }
    };
    vm.runInNewContext(source, context);
    return { context, saves, zooms };
  };
  const up = run({ start: 13 });
  await up.context.stepFontSize(1);
  assert.deepEqual(plain(up.saves), [{ appearance: { fontSize: 14 } }], 'et trin op gemmes gennem profilen');
  assert.deepEqual(up.zooms, [14], 'den gemte størrelse anvendes straks');
  await up.context.stepFontSize(-1);
  assert.deepEqual(plain(up.saves[1]), { appearance: { fontSize: 13 } }, 'et trin ned går tilbage til 13');
  assert.deepEqual(up.zooms, [14, 13]);
  const top = run({ start: FONT_SIZE.max });
  await top.context.stepFontSize(1);
  assert.deepEqual(plain(top.saves), [], 'øvre grænse 16 er en stille no-op');
  const bottom = run({ start: FONT_SIZE.min });
  await bottom.context.stepFontSize(-1);
  assert.deepEqual(plain(bottom.saves), [], 'nedre grænse 10 er en stille no-op');
  const reset = run({ start: 16 });
  await reset.context.stepFontSize(0);
  assert.deepEqual(plain(reset.saves), [{ appearance: { fontSize: 13 } }], 'Faktisk størrelse gendammer det neutrale 13');
  assert.deepEqual(reset.zooms, [13], 'zoomen følger tilbage til 100%');
  const failed = run({ start: 13, fail: true });
  await failed.context.stepFontSize(1);
  assert.equal(failed.context.profileFontSize, 13, 'en afvist gemning lader zoomen stå — skærmen og profilen er aldrig uenige');
});

// viewport.js: the fit calculation is zoom-safe arithmetic. Chromium's page
// zoom scales every CSS pixel uniformly, so surface.clientWidth, the stage and
// the iframe's transform share one coordinate space; a zoomed window simply
// has fewer CSS pixels available, and the fit shrinks to match. The real
// expression is extracted from the source and exercised under several zoom
// factors: the preview always fits, and it never upscales past 100%.
test('viewport.js: fit-beregningen holder under app-zoom — udtrykket læser kun CSS-pixelpunkter', () => {
  const line = /const scale = fluid \|\| settings\.zoom === 'actual' \? 1 : [^;]+;/.exec(viewport);
  assert.ok(line, 'fit-udtrykket findes i viewport.js');
  const fitScale = (fluid, zoom, clientWidth, clientHeight, w, h) =>
    vm.runInNewContext(`(function (fluid, settings, surface, w, h) { var scale = ${line[0].slice('const scale = '.length)} return scale; })`, {})(fluid, { zoom }, { clientWidth, clientHeight }, w, h);
  // Zoom maps physical pixels down to CSS pixels: at factor z a physical
  // surface of W px offers W/z CSS pixels. That is the whole zoom effect on
  // the fit — the emulated width w stays the chosen CSS pixels.
  for (const factor of [10 / 13, 1, 16 / 13]) {
    const cssWidth = Math.round(2560 / factor), cssHeight = Math.round(1330 / factor);
    for (const w of [390, 768, 1920, 2560]) {
      const h = Math.round(w * 0.5625);
      const scale = fitScale(false, 'fit', cssWidth, cssHeight, w, h);
      assert.ok(scale <= 1, `faktor ${factor.toFixed(3)}: forhåndsvisningen opskaleres aldrig (w ${w} giver ${scale.toFixed(3)})`);
      assert.ok(w * scale <= cssWidth - 24 + 1e-6, `faktor ${factor.toFixed(3)}: bredden passer (${Math.round(w * scale)} ≤ ${cssWidth - 24})`);
      assert.ok(h * scale <= cssHeight - 24 + 1e-6, `faktor ${factor.toFixed(3)}: højden passer (${Math.round(h * scale)} ≤ ${cssHeight - 24})`);
    }
  }
  // A window so zoomed that the surface cannot offer 24 px still yields a sane
  // scale — never NaN, never an upscale.
  const tiny = fitScale(false, 'fit', 40, 40, 1920, 1080);
  assert.ok(Number.isFinite(tiny) && tiny <= 1, 'et mikroskopisk felt giver aldrig NaN eller opskalering');
  // 'actual' and fluid keep the 1:1 mapping under any zoom — the emulated
  // size is CSS pixels, exactly like the fit path.
  assert.equal(fitScale(false, 'actual', 1000, 800, 1920, 1080), 1, "'actual' viser 1:1");
  assert.equal(fitScale(true, 'fit', 1000, 800, 1920, 1080), 1, "fluid er altid 1:1");
  // The expression reads only CSS-pixel quantities: no zoom or DPR
  // compensation belongs in it, and none exists.
  assert.ok(!viewport.includes('devicePixelRatio') && !viewport.includes('getZoomFactor') && !viewport.includes('zoomFactor'), 'viewport.js kompenserer ikke selv for zoom — udtrykket lever allerede i CSS-pixelrummet');
});

// workspace-calm.css: the wide content caps. Below 1600 CSS px nothing changes;
// at 1600 the chat, the composer and the panel-closed chat grow, the heroes
// grow moderately; at 2000 the two chat widths grow one more step.
test('workspace-calm.css: bredere indholdsbredder på store skærme — intet under 1600', () => {
  const block = query => {
    const start = calmCss.indexOf(`@media (min-width: ${query}px)`);
    assert.ok(start >= 0, `media-queryen (min-width: ${query}px) findes`);
    const open = calmCss.indexOf('{', start);
    let depth = 0;
    for (let index = open; index < calmCss.length; index++) {
      if (calmCss[index] === '{') depth++;
      else if (calmCss[index] === '}') { depth--; if (depth === 0) return calmCss.slice(start, index + 1); }
    }
    throw new Error('Ubalancerede CSS-blokke');
  };
  const rules = css => {
    // Comments are stripped first (the repo's CSS-parse pattern), so only real
    // selectors become keys — the panel-closed composer rule carries one.
    const inner = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^@media[^{]*\{/, '').replace(/\}\s*$/, '');
    return Object.fromEntries([...inner.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(match => [match[1].trim(), match[2].trim()]));
  };
  const wide = rules(block(1600));
  assert.equal(wide['.workspace-calm .chat-content'], 'max-width: 960px;', 'samtalen vokser til 960 px ved 1600');
  assert.equal(wide['.workspace-calm .composer'], 'max-width: 960px;', 'composeren følger med til 960 px');
  assert.equal(wide['.workspace-calm .work-grid[data-surface="off"] .composer'], 'max-width: 960px;', 'den panel-lukkede composer følger også med — 720px-reglen (0,4,0) slår ellers kappen');
  assert.equal(wide['.workspace-calm .work-grid[data-surface="off"] #chat-panel'], 'max-width: 1080px;', 'fuldbredde samtale med lukket panel vokser til 1080 px');
  assert.equal(wide['.workspace-calm #project-intro'], 'max-width: 560px;', 'projektintroen vokser moderat til 560 px');
  assert.equal(wide['.workspace-calm #chat-choice'], 'max-width: 560px;', 'valgkortene vokser moderat til 560 px');
  assert.equal(Object.keys(wide).length, 6, '1600-trinnet rører de seks breddefelter');
  const widest = rules(block(2000));
  assert.equal(widest['.workspace-calm .chat-content'], 'max-width: 1040px;', 'samtalen når 1040 px ved 2000');
  assert.equal(widest['.workspace-calm .composer'], 'max-width: 1040px;', 'composeren når 1040 px ved 2000');
  assert.equal(widest['.workspace-calm .work-grid[data-surface="off"] .composer'], 'max-width: 1040px;', 'den panel-lukkede composer når også 1040 px ved 2000');
  assert.equal(widest['.workspace-calm .work-grid[data-surface="off"] #chat-panel'], 'max-width: 1200px;', 'panel-lukket samtale når 1200 px ved 2000');
  assert.equal(Object.keys(widest).length, 4, '2000-trinnet rører kun de fire breddefelter — heroerne forbliver ved 560');
  // The base widths are untouched: the caps are additive, and every min-width
  // rule sits after its base rule so the cascade order carries the override.
  assert.ok(calmCss.includes('.workspace-calm .chat-content { padding:20px 22px; max-width:800px;'), 'basis 800 px består');
  assert.ok(calmCss.includes('max-width: 900px; margin: 0 auto; width: 100%; }'), 'basis 900 px for lukket panel består');
  assert.ok(calmCss.includes('#project-intro { text-align: center; max-width: 520px;'), 'projektintroens basis 520 px består');
  assert.ok(calmCss.includes('#chat-choice { text-align: center; max-width: 520px;'), 'valgkortenes basis 520 px består');
  const minWidths = [...calmCss.matchAll(/@media\s*\(min-width:\s*(\d+)px\)/g)].map(match => Number(match[1]));
  assert.deepEqual(minWidths.sort((a, b) => a - b), [1600, 2000], 'præcis de to nye min-width-trin findes — ingen andre');
  for (const width of minWidths) {
    assert.ok(calmCss.indexOf(`@media (min-width: ${width}px)`) > calmCss.indexOf('.workspace-calm .chat-content {'), `${width}px-blokken står efter basisreglerne — kaskaden bærer overdækningen`);
  }
});

// settings.js mirrors core/profile.cjs's range: one source of truth, pinned.
test('settings.js: font-styringen spejler core/profile.cjs FONT_SIZE-kontrakten', () => {
  const mirror = /const FONT = Object\.freeze\(\{ min: (\d+), max: (\d+), base: (\d+) \}\);/.exec(settingsSource);
  assert.ok(mirror, 'FONT-konstanten findes i settings.js');
  assert.deepEqual({ min: Number(mirror[1]), max: Number(mirror[2]), base: Number(mirror[3]) }, { ...FONT_SIZE }, 'trinnet og kernen deler samme række');
  assert.ok(settingsSource.includes(`saveSection({ appearance: { fontSize: next } })`), 'trinnet gemmer kun sit eget felt gennem den delte kø');
  assert.ok(settingsSource.includes('Skriftstørrelse'), 'feltet har sit danske navn');
  assert.ok(settingsSource.includes('Skalerer hele appen'), 'beskrivelsen er ærlig: hele appen skaleres');
});

// The secure key-entry window follows the profile zoom too, so "Skalerer hele
// appen" stays honest through the key flow. Main hands the current factor to
// core/credential-entry.cjs, which reads it per request — no stored copy, so
// a later profile change reaches the next window.
test('main.cjs: det sikre nøglevindue får den aktuelle profilfaktor', () => {
  assert.ok(main.includes('zoomFactor:() => profileFontSize / FONT_SIZE.base,'), 'main giver nøglevinduet den aktuelle profilfaktor');
  const entrySource = fs.readFileSync(path.join(__dirname, '..', 'core', 'credential-entry.cjs'), 'utf8');
  assert.ok(entrySource.includes('...(zoomFactor ? { zoomFactor: zoomFactor() } : {})'), 'nøglevinduet læser faktoren pr. anmodning — en senere størrelse når det næste vindue');
});
