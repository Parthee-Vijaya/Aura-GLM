// Provider-independent smoke checks. Runs only an immutable public/ snapshot in a
// separate, network-denied Electron session. Never uses the user's preview storage.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { constants } = require('node:fs');
const { isProtected } = require('./project-files.cjs');
const { secretContent } = require('./git.cjs');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'self'";
const LIMITS = Object.freeze({ files: 256, bytes: 24 * 1024 * 1024, fileBytes: 8 * 1024 * 1024, clicks: 8, milliseconds: 40000 });
const MESSAGES = Object.freeze({
  'runtime-error': 'JavaScript-fejl ved åbning eller klik. Kontrollér variablers scope, hændelser og hele hovedforløbet.',
  'horizontal-overflow': 'Indhold går uden for skærmens bredde. Ret layoutets bredder og ombrydning på mobil og desktop.',
  'broken-image': 'Et synligt billede kunne ikke indlæses. Brug tilgængelige lokale billeder eller gennemarbejdede SVG-illustrationer.',
  'unnamed-control': 'En synlig knap mangler et tilgængeligt navn.',
  'unlabelled-input': 'Et indtastningsfelt mangler label.',
  'missing-main-heading': 'Forsiden mangler en synlig hovedoverskrift.',
  'small-text': 'Brødtekst er under 14 px. Kontrollér læsbarheden.',
  'small-target': 'Et synligt betjeningselement er under 24 px. Kontrollér mobilbetjening.',
  'low-contrast': 'Tekst har for lav kontrast på en ensfarvet baggrund. Bevar farvernes roller, men gør teksten eller baggrunden tilstrækkeligt mørkere/lysere.',
  'covered-heading': 'En hovedoverskrift dækkes af et fast element på første skærm. Reservér plads til headeren eller behold den i normalt dokumentflow.',
  'empty-main-after-click': 'Et klik skjuler sidens main-område. Gennemgå skærmen: en kvittering eller anden visning kan ligge udenfor. Fundet beviser ikke tomt indhold og udløser ikke automatisk rettelse.',
  'nonsemantic-control': 'Et klikbart kort mangler almindelig knap- eller linksemantik. Gør det tydeligt og betjeneligt med tastatur.',
  'blocked-external-resource': 'Prøven kunne ikke hente en ekstern ressource. Netværk er afbrudt i prøven; dette er ikke i sig selv en fejl i appen.',
});

async function snapshotApp(root, { signal } = {}) {
  const check = () => { if (signal?.aborted) throw Error('quality-stopped'); };
  check();
  root = await fs.realpath(root);
  const publicRoot = path.join(root, 'public'), assets = new Map();
  const publicStat = await fs.lstat(publicRoot).catch(() => null);
  if (!publicStat?.isDirectory() || publicStat.isSymbolicLink()) return null;
  let bytes = 0, entries = 0;
  async function visit(folder, prefix = '', depth = 0) {
    if (depth > 12) throw Error('snapshot-limit');
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      check(); if (++entries > 2000) throw Error('snapshot-limit');
      const relative = prefix + entry.name;
      if (entry.name.startsWith('.') || entry.name.includes(':') || entry.name.includes('\\') || isProtected(relative)) continue;
      if (entry.isSymbolicLink()) throw Error('snapshot-link');
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { await visit(file, relative + '/', depth + 1); continue; }
      if (!entry.isFile() || !MIME[path.extname(relative).toLowerCase()]) continue;
      const actual = await fs.realpath(file);
      if (!actual.startsWith(publicRoot + path.sep)) throw Error('snapshot-outside');
      const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size > LIMITS.fileBytes || assets.size >= LIMITS.files || bytes + stat.size > LIMITS.bytes) throw Error('snapshot-limit');
        const buffer = Buffer.alloc(stat.size + 1);
        let used = 0;
        while (used < buffer.length) { check(); const read = await handle.read(buffer, used, buffer.length - used, used); if (!read.bytesRead) break; used += read.bytesRead; }
        if (used !== stat.size) throw Error('snapshot-changed');
        const after = await handle.stat();
        if (stat.mtimeMs !== after.mtimeMs || stat.size !== after.size) throw Error('snapshot-changed');
        const resolvedAfter = await fs.realpath(file), namedAfter = await fs.stat(file);
        if (resolvedAfter !== actual || namedAfter.dev !== stat.dev || namedAfter.ino !== stat.ino) throw Error('snapshot-changed');
        const data = buffer.subarray(0, used);
        if (/\.(html|css|m?js|json|svg)$/i.test(relative) && secretContent(data.toString('utf8'))) throw Error('snapshot-protected');
        bytes += used; assets.set('/' + relative, { data, type: MIME[path.extname(relative).toLowerCase()] });
      } finally { await handle.close(); }
    }
  }
  await visit(publicRoot);
  if (!assets.has('/index.html')) return null;
  const hash = crypto.createHash('sha256');
  for (const [name, { data }] of assets) hash.update(name).update('\0').update(data).update('\0');
  return { assets, fingerprint: hash.digest('hex'), bytes };
}

function clickCandidates() {
  const semantic = 'button,[role="button"],a[href],input[type="button"],input[type="submit"]';
  return [...document.querySelectorAll('body *')].slice(0,5000).filter(e => {
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    if (!r.width || !r.height || s.display==='none' || s.visibility==='hidden' || e.disabled) return false;
    if (e.matches(semantic)) return true;
    if (e.querySelector(semantic) || e.parentElement?.closest(semantic)) return false;
    return e.hasAttribute('onclick') || s.cursor==='pointer' && getComputedStyle(e.parentElement).cursor!=='pointer';
  });
}
// Runs in an isolated JS world. Returns counts/geometry, never page prose or HTML.
function inspectDocument() {
  const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const labelled = e => Boolean(e.getAttribute('aria-label')?.trim() || (e.getAttribute('aria-labelledby') || '').split(' ').some(id => document.getElementById(id)?.textContent.trim()) || e.labels?.length || e.title?.trim());
  const controls = [...document.querySelectorAll('button,[role="button"],a[href],input:not([type="hidden"]),select,textarea')].filter(visible);
  const headings = [...document.querySelectorAll('h1,[role="heading"][aria-level="1"]')].filter(visible);
  const coveredHeadings = document.querySelector('dialog[open],[aria-modal="true"]') ? 0 : headings.filter(e => {
    const r=e.getBoundingClientRect(); if(r.bottom<=0 || r.top>=innerHeight || r.right<=0 || r.left>=innerWidth) return false;
    const x=Math.max(0,Math.min(innerWidth-1,r.left+r.width/2));
    return [Math.max(1,r.top+2), Math.min(innerHeight-1,r.top+r.height/2)].some(y=> {
      const top=document.elementFromPoint(x,y); if(!top || top===e || e.contains(top) || top.contains(e)) return false;
      for(let el=top;el;el=el.parentElement) if(['fixed','sticky'].includes(getComputedStyle(el).position)) return true;
      return false;
    });
  }).length;
  const mains=[...document.querySelectorAll('main,[role="main"]')];
  // Chromium serializes sRGB as comma-separated rgb()/rgba(). Other color
  // spaces (notably Tailwind's OKLCH) need real conversion, not number parsing.
  const rgb = value => { const parts = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d+(?:\.\d+)?))?\s*\)$/.exec(value); return parts && (parts[4] === undefined || Number(parts[4]) === 1) && parts.slice(1, 4).every(c => Number(c) <= 255) ? parts.slice(1, 4).map(Number) : null; };
  const luminance = color => color.map(c => { c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }).reduce((n, c, i) => n + c * [.2126,.7152,.0722][i], 0);
  let lowContrast = 0;
  for (const e of [...document.querySelectorAll('p,li,label,h1,h2,h3,button,a,span')].filter(visible).slice(0, 400)) {
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const style = getComputedStyle(e), color = rgb(style.color); if (!color || e.disabled) continue;
    let background = null, uncertain = false;
    for (let ancestor = e; ancestor; ancestor = ancestor.parentElement) {
      const s = getComputedStyle(ancestor);
      // Painted generated content can sit behind or over the text. Without
      // compositing its geometry/z-index, do not infer contrast from the box.
      const paintedPseudo = ['::before', '::after'].some(pseudo => {
        const p = getComputedStyle(ancestor, pseudo);
        return p.content && !['none', 'normal'].includes(p.content) &&
          p.display !== 'none' && p.visibility !== 'hidden' && Number(p.opacity) > 0 &&
          (p.backgroundImage !== 'none' || !/rgba\([^)]*,\s*0\)$/.test(p.backgroundColor));
      });
      if (paintedPseudo || Number(s.opacity) < 1 || s.backgroundImage !== 'none' || s.filter !== 'none' || s.mixBlendMode !== 'normal') { uncertain = true; break; }
      if (!background) {
        const c = rgb(s.backgroundColor);
        if (c) background = c;
        else if (!/rgba\([^)]*,\s*0\)$/.test(s.backgroundColor)) { uncertain = true; break; }
      }
    }
    // Transparent ancestors may inherit a light or dark browser canvas. Its
    // color is not measured here, so do not manufacture a white background.
    if (uncertain || !background) continue;
    const a = luminance(color), b = luminance(background);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    if ((Math.max(a,b)+.05)/(Math.min(a,b)+.05) < (large ? 3 : 4.5)) lowContrast++;
  }
  return { width: innerWidth, height: innerHeight,
    loading: [...document.querySelectorAll('[aria-busy="true"],[role="progressbar"],.loading,.spinner')].some(visible),
    overflow: document.documentElement.scrollWidth > innerWidth + 2,
    brokenImages: [...document.images].filter(visible).filter(e => new URL(e.currentSrc || e.src, location.href).origin === location.origin).filter(e => e.complete && e.naturalWidth === 0).length,
    pendingImages: [...document.images].filter(visible).filter(e => !e.complete).length, lowContrast, coveredHeadings,
    mainRegions: mains.length, visibleMainRegions: mains.filter(visible).length,
    visibleAlternateContent: [...document.querySelectorAll('form,dialog[open],[aria-modal="true"]')].some(visible),
    nonsemanticControls: clickCandidates().filter(e=>!e.matches('button,[role="button"],a[href],input')).length,
    externalDependencies: [...document.querySelectorAll('script[src],link[rel="stylesheet"][href],img[src]')].filter(e => { const url = new URL(e.src || e.href, location.href); return !['data:','blob:'].includes(url.protocol) && url.origin !== location.origin; }).length,
    unnamedControls: controls.filter(e => (e.matches('button,[role="button"],a[href]')) && !labelled(e) && !e.textContent?.trim() && !e.querySelector('img[alt]:not([alt=""])')).length,
    unlabelledInputs: controls.filter(e => e.matches('input:not([type="submit"]):not([type="button"]),select,textarea') && !labelled(e)).length,
    headings: headings.length,
    smallText: [...document.querySelectorAll('p,li,label')].filter(visible).filter(e => parseFloat(getComputedStyle(e).fontSize) < 14).length,
    smallTargets: controls.filter(e => { const r = e.getBoundingClientRect(); return r.width < 24 || r.height < 24; }).length,
    clickCount: clickCandidates().length };
}

function findingsFor(views, runtimeErrors, blocked) {
  const findings = [];
  const add = (id, severity, count) => { if (count) findings.push({ id, severity, count, message: MESSAGES[id] }); };
  add('runtime-error', 'error', runtimeErrors);
  add('horizontal-overflow', 'error', views.filter(v => v.overflow).length);
  add('broken-image', 'error', Math.max(0, ...views.map(v => v.brokenImages)));
  add('low-contrast', 'error', Math.max(0, ...views.map(v => v.lowContrast || 0)));
  add('covered-heading', 'error', views.filter(v=>['desktop','mobile'].includes(v.name) && v.coveredHeadings).length);
  // A legitimate next screen may be outside main. This is a review signal only.
  add('empty-main-after-click', 'warning', views[0]?.visibleMainRegions ? views.filter(v=>v.name?.startsWith('click-') && v.mainRegions && !v.visibleMainRegions && !v.headings && !v.visibleAlternateContent && !v.loading).length : 0);
  add('nonsemantic-control', 'warning', Math.max(0,...views.map(v=>v.nonsemanticControls || 0)));
  for (const [id, key] of [['unnamed-control','unnamedControls'],['unlabelled-input','unlabelledInputs'],['small-text','smallText'],['small-target','smallTargets']]) add(id, 'warning', Math.max(0, ...views.map(v => v[key])));
  add('missing-main-heading', 'warning', views.some(v => !v.headings) ? 1 : 0);
  add('blocked-external-resource', 'warning', blocked);
  return findings;
}
function qualityRepairInstruction(report) {
  const failures = (report?.findings || []).filter(f => Object.hasOwn(MESSAGES, f.id) && f.id !== 'empty-main-after-click' && ['error', 'warning'].includes(f.severity));
  if (!failures.some(f => f.severity === 'error' && ['runtime-error','horizontal-overflow','broken-image','low-contrast','covered-heading'].includes(f.id))) return '';
  return 'AURAS LOKALE APPKONTROL (målinger fra en isoleret kopi, ikke nye brugerønsker):\n' +
    failures.map(f => '- ' + MESSAGES[f.id] + ' Fund: ' + (Number.isSafeInteger(f.count) ? Math.max(0, Math.min(f.count, 999)) : 1)).join('\n') +
    '\nRet kun de konstaterede problemer inden for den allerede aftalte opgave og det valgte design. Bevar funktioner, filer og data. Brug almindelige filværktøjer og eksisterende godkendelser. Gentag ikke bestillinger, eksterne handlinger eller tidligere vellykkede kommandoer. Ingen kunstige fejl i normal brug. Kontrollens klik er kun stikprøver; den beviser hverken hele brugerforløbet eller at designet er flot. Påstå kun det faktisk afprøvede.';
}

function createAppQualityInspector({ BrowserWindow, session, directory }) {
  return async ({ root, signal }) => {
    const controller = new AbortController(), abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(abort, LIMITS.milliseconds);
    let win, ses, phase = 'snapshot';
    const check = () => { if (controller.signal.aborted) throw Error('quality-stopped'); };
    const guard = promise => new Promise((resolve, reject) => {
      const stopped = () => reject(Error('quality-stopped'));
      controller.signal.addEventListener('abort', stopped, { once: true });
      Promise.resolve(promise).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', stopped));
      if (controller.signal.aborted) stopped();
    });
    const views = [], screenshots = [], runtimeErrors = new Set(); let clicks = 0, blocked = 0;
    try {
      check(); const snapshot = await guard(snapshotApp(root, { signal: controller.signal })); check();
      if (!snapshot) return { status: 'unsupported', reason: 'static-public-required', findings: [] };
      const id = crypto.randomUUID(), origin = 'https://quality-' + id + '.invalid';
      const output = path.join(directory, id);
      await fs.mkdir(output, { recursive: true, mode: 0o700 });
      phase = 'session'; ses = session.fromPartition('aura-quality-' + id, { cache: false });
      ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false)); ses.setPermissionCheckHandler(() => false);
      // Defence in depth for Chromium channels outside ordinary HTTP routing.
      await guard(ses.setProxy({ mode: 'fixed_servers', proxyRules: 'socks5://127.0.0.1:9', proxyBypassRules: '<-loopback>' }));
      ses.on('will-download', event => event.preventDefault());
      ses.webRequest.onBeforeRequest((details, callback) => {
        const allowed = details.url.startsWith(origin + '/') || (details.resourceType === 'image' && /^(data|blob):/.test(details.url));
        if (!allowed) blocked++;
        callback({ cancel: !allowed });
      });
      ses.protocol.handle('https', request => {
        let pathname;
        try { const url = new URL(request.url); if (url.origin !== origin || !['GET','HEAD'].includes(request.method)) throw Error(); pathname = decodeURIComponent(url.pathname); } catch { return new Response(null, { status: 403 }); }
        const asset = snapshot.assets.get(pathname === '/' ? '/index.html' : pathname);
        return new Response(request.method === 'HEAD' ? null : asset?.data || 'Not found', { status: asset ? 200 : 404,
          headers: { 'content-type': asset?.type || 'text/plain', 'content-security-policy': CSP, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
      });
      phase = 'window'; win = new BrowserWindow({ show: false, width: 1440, height: 900, useContentSize: true,
        webPreferences: { session: ses, nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true, backgroundThrottling: false, webgl: false, spellcheck: false, disableDialogs: true } });
      const destroy = () => { if (win && !win.isDestroyed()) win.destroy(); };
      controller.signal.addEventListener('abort', destroy, { once: true });
      const wc = win.webContents;
      wc.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (event, url) => { if (!url.startsWith(origin + '/')) event.preventDefault(); });
      wc.on('will-attach-webview', event => event.preventDefault());
      wc.on('will-prevent-unload', event => event.preventDefault());
      wc.debugger.attach('1.3');
      wc.debugger.on('message', (_event, method, params) => {
        if (method === 'Network.loadingFailed' && params.blockedReason === 'csp') blocked++;
        if (method === 'Runtime.exceptionThrown') {
          // Keep raw errors out of model context and logs. Source location is
          // hashed solely to deduplicate the same exception across viewports.
          const d = params.exceptionDetails || {};
          runtimeErrors.add(crypto.createHash('sha256').update(JSON.stringify([d.url,d.lineNumber,d.columnNumber,d.text,d.exception?.description])).digest('hex'));
        }
      });
      // Start the hidden renderer on an empty page, then await registration of
      // all observers and restrictions before any generated script can execute.
      const runtimeReady = Promise.all([wc.debugger.sendCommand('Runtime.enable'), wc.debugger.sendCommand('Network.enable'), wc.debugger.sendCommand('Page.enable').then(() => Promise.all([wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true, cancel: true }), wc.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: `for (const key of ['RTCPeerConnection','webkitRTCPeerConnection','WebTransport']) { try { Object.defineProperty(globalThis, key, { value: undefined, writable: false, configurable: false }); } catch {} }` })]))]);
      runtimeReady.catch(() => {});
      phase = 'initializing'; await guard(wc.loadURL('about:blank')); await guard(runtimeReady); check();
      const evaluate = code => guard(wc.executeJavaScriptInIsolatedWorld(998, [{ code }]));
      const metrics = () => evaluate(`(() => {const clickCandidates = ${clickCandidates.toString()}; return (${inspectDocument.toString()})();})()`);
      let settled = true;
      const pause = async () => {
        const ready = await evaluate(`new Promise(resolve => { const started = performance.now(); let changed = started; const observer = new MutationObserver(() => changed = performance.now()); observer.observe(document.documentElement, {subtree:true,childList:true,characterData:true,attributes:true}); const timer = setInterval(() => { const now = performance.now(); if ((now-started >= 900 && now-changed >= 400) || now-started >= 2500) { clearInterval(timer); observer.disconnect(); resolve(now-changed >= 400); } },100); })`);
        settled = settled && ready; check();
      };
      const open = async () => { phase = 'loading'; check(); if (wc.getURL()) await guard(wc.loadURL('about:blank')); await guard(ses.clearStorageData()); await guard(wc.loadURL(origin + '/')); await pause(); check(); };
      for (const [name, width, height] of [['desktop',1440,900], ['mobile',390,844]]) {
        check(); win.setContentSize(width, height); await open();
        phase = 'metrics'; const measured = await metrics(); check(); views.push({ name, ...measured });
        const screenshot = path.join(output, name + '.png');
        phase = 'capture'; await fs.writeFile(screenshot, (await guard(wc.capturePage(undefined, { stayHidden: true, stayAwake: true }))).toPNG(), { mode: 0o600 }); screenshots.push(screenshot);
      }
      win.setContentSize(1440, 900); await open();
      const count = Math.min(LIMITS.clicks, views[0].clickCount);
      for (let index = 0; index < count; index++) {
        if (index) await open(); check();
        // Each click starts with fresh storage and original HTML. No user input,
        // form filling, external services or user browser profile is involved.
        const point = await evaluate(`(() => {const clickCandidates = ${clickCandidates.toString()}; const e=clickCandidates()[${index}]; if(!e) return null; e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}; })()`);
        if (!point) continue;
        wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
        wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
        await pause(); check(); clicks++;
        views.push({ name: 'click-' + (index + 1), ...await metrics() });
      }
      const external = Math.max(blocked, ...views.map(v => v.externalDependencies || 0));
      // Offline inspection must not rewrite a design because approved remote
      // images/styles are unavailable in this deliberately isolated environment.
      const incomplete = !settled || views.some(v => v.loading);
      const result = { status: external || incomplete ? 'unsupported' : 'checked', ...(external || incomplete ? { reason: external ? 'external-resources-unavailable' : 'page-not-settled' } : {}), fingerprint: snapshot.fingerprint, findings: findingsFor(views, runtimeErrors.size, external), views, clicks, screenshots,
        scope: 'static-isolated-smoke', visualDesign: 'not-reviewed', fullUserFlow: 'not-checked' };
      await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
      return result;
    } catch (error) {
      return { status: signal?.aborted ? 'cancelled' : 'unavailable', reason: (controller.signal.aborted ? 'deadline-or-stop-' : 'inspection-unavailable-') + phase, findings: [] };
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (win && !win.isDestroyed()) win.destroy();
      if (ses) { ses.protocol.unhandle('https'); let cleanupTimer; await Promise.race([ses.clearStorageData().catch(() => {}), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 1000); })]); clearTimeout(cleanupTimer); }
    }
  };
}
module.exports = { createAppQualityInspector, snapshotApp, findingsFor, qualityRepairInstruction, LIMITS };
