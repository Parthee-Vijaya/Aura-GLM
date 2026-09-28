const { app, BrowserWindow, ipcMain, dialog, protocol, session, safeStorage, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createProject, openProject } = require('./core/projects.cjs');
const { startPreview } = require('./core/preview.cjs');
const { DevServer, inspect: inspectRuntime } = require('./core/dev-server.cjs');
const { Workbench } = require('./core/workbench.cjs');
const { GitHub } = require('./core/github.cjs');
const { Deployments } = require('./core/deployments.cjs');
const { Publishing } = require('./core/publishing.cjs');
const { Preferences } = require('./core/preferences.cjs');
const { Designs } = require('./core/designs.cjs');
const { capture, changes } = require('./core/changes.cjs');

// Bevar eksisterende forbindelser, designpakker og rendererindstillinger ved navneskift.
const existingUserData = app.getPath('userData');
const existingSessionData = app.getPath('sessionData');
app.setName('AI Harness');
app.setPath('userData', existingUserData);
app.setPath('sessionData', existingSessionData);

protocol.registerSchemesAsPrivileged([{ scheme: 'harness', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, preview, project, busy = false;
let assets = [];
let github, publishing, deployments, restoration;
let workbench, beforeChanges, externalPreview = null;
let devServer, detectedRuntime, forceStatic = false;
let quitReady = false, shuttingDown = null;
const failures = [];
function recordFailure(area, type) { failures.push({ area, type, at: new Date().toISOString() }); if (failures.length > 10) failures.shift(); }
function supportReport() {
  // Hjælp må ikke kontakte nøgleringen. Kontrollen sker først ved brug af en nøgle.
  return require('./core/diagnostics.cjs').diagnostics({ version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, versions: require('./core/runtime.cjs').get()?.versions, project: Boolean(project), running: workbench?.running, preview: devServer?.state, failures });
}
function shutdown() {
  if (!shuttingDown) shuttingDown = (async () => { github?.cancel(); await devServer?.stop(); await workbench?.close(); await preview?.close(); preview = null; })().finally(() => { shuttingDown = null; });
  return shuttingDown;
}
const uiURL = 'harness://app/index.html';
const profileRoot = app.isPackaged ? path.join(process.resourcesPath, 'profiles') : path.join(__dirname, '..', 'profiles');
if (app.isPackaged) require('./core/runtime.cjs').configure(process.resourcesPath);

async function activate(next) {
  if (workbench.running) throw new Error('Stop den aktive opgave, før du skifter projekt.');
  await workbench.activate(next);
  try { const restored = await restoration.previous(next.root); if (restored) await workbench.invalidatePlan(restored.id); }
  catch { await workbench.invalidatePlan(crypto.randomUUID()); workbench.historyWarning = 'Gendannelseskopien kan ikke læses. Projektfilerne er åbne, men den gamle plan er nulstillet. Kopien er bevaret i appens lokale data.'; }
  await devServer.activate(next.root);
  if (preview) await preview.close();
  project = next; preview = null; externalPreview = null; beforeChanges = null; assets = [];
  forceStatic = false; detectedRuntime = await inspectRuntime(next.root).catch(error => ({ kind: 'unknown', supported: false, reason: error.message }));
  if (next.staticPreview && !['vite', 'astro'].includes(detectedRuntime.kind)) preview = await startPreview(next.root);
  return { ...project, previewURL: preview?.url || null, runtime: { ...devServer.snapshot(), project: detectedRuntime }, workbench: await workbench.state() };
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, value) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiURL) throw new Error('Adgang afvist.');
    try { return { ok: true, value: await action(value) }; }
    catch (error) {
      recordFailure(channel.startsWith('git:') ? 'git' : channel.startsWith('connections:') ? 'forbindelse' : 'app', ['EACCES','EPERM'].includes(error.code) ? 'adgang' : error.code === 'ENOENT' ? 'mangler-fil' : 'handling');
      const messages = { EEXIST: 'Der findes allerede en mappe med det projektnavn. Vælg et andet navn eller en anden placering.', ENOENT: 'En nødvendig fil eller mappe findes ikke. Kontrollér projektmappen.', EACCES: 'Appen har ikke adgang til den valgte mappe.', EPERM: 'Operativsystemet tillader ikke handlingen på den valgte placering.' };
      return { ok: false, error: messages[error.code] || error.message };
    }
  });
}
async function exclusive(action) {
  if (busy) throw new Error('Vent på den igangværende handling.');
  busy = true;
  try { return await action(); } finally { busy = false; }
}
handle('project:create', input => exclusive(async () => {
  if (workbench.running) throw new Error('Stop den aktive opgave først.');
  const startup = await new Preferences(workbench.store).available({ ...input.startup, tests: input.tests });
  const selection = await dialog.showOpenDialog(window, { title: 'Vælg, hvor den nye projektmappe skal ligge', properties: ['openDirectory', 'createDirectory'] });
  if (selection.canceled) return null;
  const created = await createProject(selection.filePaths[0], input, assets, profileRoot);
  await workbench.store.saveProject(created.root, { startup: startup.values });
  if (input.remember === true) await new Preferences(workbench.store).save(startup.values);
  return activate(await openProject(created.root));
}));
handle('project:open', () => exclusive(async () => {
  const selection = await dialog.showOpenDialog(window, { title: 'Åbn en mappe som arbejdsområde', properties: ['openDirectory'] });
  if (selection.canceled) return null;
  return activate(await openProject(selection.filePaths[0]));
}));
handle('project:recent', () => workbench.history.recent());
handle('project:reopen', id => exclusive(async () => {
  const item = (await workbench.history.recent()).find(p => p.id === id);
  if (!item) throw new Error('Projektet findes ikke på listen. Brug Åbn projekt for at vælge mappen.');
  return activate(await openProject(item.root));
}));
handle('workspace:new-conversation', () => exclusive(async () => {
  if (!project || workbench.running) throw new Error('Stop opgaven, før du starter en ny samtale.');
  const choice = await dialog.showMessageBox(window, { type: 'question', title: 'Ny samtale', message: 'Start en ny samtale i dette projekt?', detail: 'Plan og kladde ryddes fra visningen. Den tidligere samtale arkiveres i appens datamappe og sendes ikke med. Projektfilerne bevares.', buttons: ['Annuller', 'Start ny samtale'], defaultId: 0, cancelId: 0 });
  if (choice.response !== 1) return null;
  return workbench.newConversation();
}));
handle('workspace:draft', input => {
  if (!project || input.root !== project.root) throw new Error('Projektet er skiftet. Kladden blev ikke gemt i en anden mappe.');
  return workbench.history.draft(project.root, input).then(() => true);
});
handle('project:new', () => exclusive(async () => {
  if (workbench.running) throw new Error('Stop den aktive opgave, før du skifter projekt.');
  await devServer.activate(null);
  await workbench.close(); workbench.project = null; externalPreview = null; beforeChanges = null;
  if (preview) await preview.close();
  preview = null; project = null; assets = [];
  return true;
}));
handle('assets:choose', kind => exclusive(async () => {
  if (!['logo', 'reference'].includes(kind)) throw new Error('Ukendt materialetype.');
  const selection = await dialog.showOpenDialog(window, { title: kind === 'logo' ? 'Vælg et logo' : 'Vælg inspirationsmateriale', properties: ['openFile', ...(kind === 'reference' ? ['multiSelections'] : [])], ...(kind === 'logo' ? { filters: [{ name: 'Billeder', extensions: ['png', 'jpg', 'jpeg', 'webp'] }] } : {}) });
  if (!selection.canceled) {
    const next = kind === 'logo' ? assets.filter(item => item.kind !== 'logo') : [...assets];
    if (next.length + selection.filePaths.length > 20) throw new Error('Vælg højst 20 filer.');
    for (const file of selection.filePaths) {
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Vælg almindelige filer på højst 10 MB.');
      next.push({ id: crypto.randomUUID(), kind, path: file });
    }
    assets = next;
  }
  return assets.map(({ id, kind, path: file }) => ({ id, kind, name: assets.find(a => a.id === id)?.name || path.basename(file) }));
}));
handle('assets:remove', id => {
  if (busy) throw new Error('Vent på den igangværende handling.');
  assets = assets.filter(item => item.id !== id);
  return assets.map(({ id, kind, path: file }) => ({ id, kind, name: assets.find(a => a.id === id)?.name || path.basename(file) }));
});
handle('preview:revision', async () => {
  if (!project || externalPreview) return null;
  const rootNow = project.root;
  const nextRuntime = await inspectRuntime(rootNow).catch(error => ({ kind: 'unknown', supported: false, reason: error.message }));
  if (project?.root !== rootNow) return null;
  if (JSON.stringify(nextRuntime) !== JSON.stringify(detectedRuntime)) {
    detectedRuntime = nextRuntime;
    window?.webContents.send('harness:event', { type: 'preview.runtime', ...devServer.snapshot(), project: detectedRuntime });
  }
  if (!forceStatic && ['vite', 'astro'].includes(nextRuntime.kind)) {
    if (preview) { const old = preview; preview = null; await old.close(); window?.webContents.send('harness:event', { type: 'preview.ready', url: null }); }
    return null;
  }
  if (!preview) {
    const updated = await openProject(project.root);
    if (updated.staticPreview) { preview = await startPreview(project.root); window?.webContents.send('harness:event', { type: 'preview.ready', url: preview.url }); }
    else return null;
  }
  const root = path.join(project.root, 'public');
  if (!(await fs.lstat(root)).isDirectory()) throw new Error('Den offentlige mappe mangler.');
  const entries = [];
  async function scan(dir, depth = 0) {
    if (depth > 12 || entries.length > 2000) throw new Error('Projektet overstiger forhåndsvisningens grænse.');
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await scan(file, depth + 1);
      else if (entry.isFile()) { const stat = await fs.stat(file); entries.push(`${file}:${stat.mtimeMs}:${stat.size}`); }
    }
  }
  await scan(root);
  await fs.access(path.join(root, 'index.html'));
  return crypto.createHash('sha256').update(entries.sort().join('\n')).digest('hex');
});

handle('preferences:get', () => new Preferences(workbench.store).get());
handle('preferences:save', input => exclusive(() => new Preferences(workbench.store).save(input)));
handle('designs:clear', () => exclusive(() => { assets = []; return []; }));
handle('designs:list', () => new Designs(workbench.store).list());
handle('designs:save', input => exclusive(() => new Designs(workbench.store).save(input, assets)));
handle('designs:apply', id => exclusive(async () => { const design = await new Designs(workbench.store).get(id); assets = design.assets; return { color: design.color, links: design.links, assets: assets.map(({ id, kind, name }) => ({ id, kind, name })) }; }));

function requireIdleProject() {
  if (!project) throw new Error('Åbn et projekt først.');
  if (workbench.running || workbench.finishing) throw new Error('Vent på agenten og en eventuel versionsgemning.');
  if (['installing', 'starting', 'stopping'].includes(devServer.state)) throw new Error('Vent på opstarten af forhåndsvisningen, eller stop den først.');
  return project.root;
}
handle('support:report', () => supportReport());
handle('support:save', async () => {
  const report = supportReport();
  const chosen = await dialog.showSaveDialog(window, { title: 'Gem fejlrapport', defaultPath: 'AI-Harness-fejlrapport.json', filters: [{ name: 'Fejlrapport', extensions: ['json'] }] });
  if (chosen.canceled || !chosen.filePath) return false;
  await fs.writeFile(chosen.filePath, JSON.stringify(report, null, 2), { mode: 0o600 }); return true;
});
handle('support:feedback', () => shell.openExternal('https://github.com/ai-alliancen-org/ai-harness/issues'));
handle('git:status', async () => {
  const root = requireIdleProject();
  return { ...await workbench.git.status(root), restoration: await restoration.status(root), autoCheckpoint: (await workbench.store.project(root)).autoCheckpoint === true };
});
handle('git:restore-review', input => exclusive(() => restoration.review(requireIdleProject(), input)));
handle('git:restore', token => exclusive(async () => {
  const root = requireIdleProject();
  await devServer.stop(); await workbench.close();
  let restored, error;
  try { restored = await restoration.apply(root, token); } catch (failure) { error = failure.message; }
  // activate kontrollerer journalen, også efter genstart eller en delvis gendannelse.
  return { restored, error, project: await activate(await openProject(root)) };
}));
handle('git:identity', value => exclusive(() => workbench.git.setIdentity(requireIdleProject(), value)));
handle('git:init', () => exclusive(() => workbench.git.initialize(requireIdleProject())));
handle('git:review', () => exclusive(() => workbench.git.review(requireIdleProject())));
handle('git:commit', input => exclusive(() => workbench.git.commit(requireIdleProject(), input)));
handle('git:automatic', value => exclusive(async () => {
  const root = requireIdleProject();
  if (typeof value !== 'boolean') throw new Error('Ugyldigt valg af automatisk checkpoint.');
  if (value) {
    const repo = await workbench.git.repository(root);
    const block = await require('./core/checkpoints.cjs').automaticBlock(repo);
    if (block) throw new Error(block);
  }
  await workbench.store.saveProject(root, { autoCheckpoint: value });
  return value;
}));

function hostingIdle() { if (workbench.running || workbench.finishing) throw new Error('Vent på den igangværende AI-opgave.'); }
handle('hosting:state', async () => ({ ...await github.state(), project: Boolean(project), publication: project ? await publishing.status(project.root).catch(error => ({ message: error.message, selected: null })) : null }));
handle('hosting:token', token => exclusive(async () => { hostingIdle(); publishing.reviews.clear(); return github.connectToken(token); }));
handle('hosting:login', () => exclusive(async () => { hostingIdle(); return github.startLogin(); }));
handle('hosting:poll', id => exclusive(async () => { hostingIdle(); publishing.reviews.clear(); return github.poll(id); }));
handle('hosting:cancel', () => { github.cancel(); return true; });
handle('hosting:browser', () => { if (!github.pending) throw new Error('Start login først.'); return shell.openExternal('https://github.com/login/device'); });
handle('hosting:disconnect', () => exclusive(async () => { hostingIdle(); publishing.reviews.clear(); return github.disconnect(); }));
handle('hosting:catalog', () => exclusive(async () => { hostingIdle(); return { owners: await github.owners(), repositories: await github.repositories() }; }));
handle('hosting:create', input => exclusive(async () => { hostingIdle(); return github.create(input); }));
handle('hosting:attach', fullName => exclusive(() => publishing.attach(requireIdleProject(), fullName)));
handle('hosting:review', () => exclusive(() => publishing.review(requireIdleProject())));
handle('hosting:push', token => exclusive(() => publishing.push(requireIdleProject(), token)));
handle('hosting:open', async () => { const root = requireIdleProject(); const selected = (await workbench.store.project(root)).publication; if (!selected) throw new Error('Vælg repository først.'); return shell.openExternal('https://github.com/' + require('./core/github.cjs').repository(selected.fullName)); });

handle('deployment:state', () => deployments.state(requireIdleProject()));
handle('deployment:review', input => exclusive(() => deployments.review(requireIdleProject(), input)));
handle('deployment:send', token => exclusive(() => deployments.deploy(requireIdleProject(), token)));
handle('deployment:check', () => exclusive(() => deployments.check(requireIdleProject())));
handle('deployment:open', async kind => {
  const state = await deployments.state(requireIdleProject());
  if(kind==='settings') return shell.openExternal(await deployments.settings(requireIdleProject()));
  if (!state.last) throw new Error('Ingen udgivelse registreret.');
  const url = kind === 'portal' ? state.last.target.portal : state.last.url;
  if (!url || !/^https:\/\//.test(url)) throw new Error('Intet link tilgængeligt.');
  return shell.openExternal(url);
});

handle('connections:account', kind => {
  const urls = { corti: 'https://console.corti.app/', mistral: 'https://console.mistral.ai/', anthropic: 'https://platform.claude.com/', openrouter: 'https://openrouter.ai/settings/keys', zen: 'https://opencode.ai/auth' };
  if (!Object.hasOwn(urls, kind)) throw new Error('Denne forbindelse opsættes hos din organisation eller på din egen server.');
  return shell.openExternal(urls[kind]);
});

handle('setup:status', async () => {
  try {
    if (project) { const status = await workbench.git.status(project.root); return { git: status.block || `Git er klar · branch ${status.branch}`, project: true }; }
    const version = (await require('./core/git.cjs').run(app.getPath('userData'), ['--version'])).toString().trim();
    return { git: `${version} · projektets historik og identitet kontrolleres, når du åbner et projekt.`, project: false };
  } catch (error) { return { git: error.message, project: Boolean(project) }; }
});
handle('connections:discover', () => require('./core/local-discovery.cjs').discoverLocalModels());
handle('connections:state', () => workbench.state());
handle('connections:save', value => exclusive(() => workbench.saveConnection(value)));
handle('connections:remove', value => exclusive(() => workbench.removeConnection(value)));
handle('connections:models', value => workbench.models(value));
handle('connections:routes', value => workbench.routes(value.connectionID, value.modelID));
handle('agent:prepare', value => exclusive(() => workbench.prepare(value)));
handle('agent:send', value => exclusive(async () => {
  if (!project) throw new Error('Åbn et projekt først.');
  if (['installing', 'starting', 'stopping'].includes(devServer.state)) throw new Error('Vent på opstarten af forhåndsvisningen, eller stop den først.');
  if (!beforeChanges) beforeChanges = await capture(project.root);
  return workbench.send(value);
}));
handle('agent:stop', () => workbench.stop());
handle('agent:reply', value => workbench.reply(value));
handle('agent:question', value => workbench.question(value));
handle('agent:changes', () => project ? changes(project.root, beforeChanges) : { files: [], skipped: 0 });
handle('skills:list', () => { if (!project) throw new Error('Åbn et projekt først.'); return workbench.skills.list(project.root); });
handle('skills:save', value => exclusive(async () => {
  if (!project || workbench.running) throw new Error('Åbn et projekt, og stop en eventuel opgave før skill-ændringer.');
  await workbench.close(); return workbench.skills.save(project.root, value);
}));
handle('preview:attach', value => exclusive(async () => {
  if (!project) throw new Error('Åbn et projekt først.');
  if (!value) { await devServer.stop(); forceStatic = true; externalPreview = null; if (preview) await preview.close(); const next = await openProject(project.root); preview = next.staticPreview ? await startPreview(project.root) : null; return preview?.url || null; }
  let url; try { url = new URL(value); } catch { throw new Error('Angiv en lokal serveradresse.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Brug en lokal http- eller https-adresse uden login eller parametre.');
  if (workbench.engine?.url === url.origin || workbench.gateway?.url.startsWith(url.origin + '/')) throw new Error('Agentens interne server kan ikke bruges som forhåndsvisning.');
  try { const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }); await response.body?.cancel(); if (!response.ok) throw new Error(); }
  catch { throw new Error('Den lokale udviklingsserver svarer ikke. Start den separat; appen kører ingen kommando automatisk.'); }
  await devServer.stop();
  if (preview) await preview.close(); preview = null; externalPreview = url.href;
  return externalPreview;
}));
handle('preview:runtime', () => devServer.status());
handle('preview:prepare', value => exclusive(async () => {
  requireIdleProject();
  return devServer.prepare(value?.action, value?.scripts === true);
}));
handle('preview:execute', token => exclusive(async () => {
  requireIdleProject(); forceStatic = false;
  return devServer.execute(token);
}));
handle('preview:stop', () => devServer.stop().then(() => devServer.snapshot()));

app.whenReady().then(() => {
  app.setAboutPanelOptions({ applicationName: 'AI Harness', applicationVersion: app.getVersion() });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'AI Harness', submenu: [
      { label: 'Om AI Harness', role: 'about' },
      ...(process.platform === 'darwin' ? [
        { type: 'separator' }, { label: 'Tjenester', role: 'services' },
        { type: 'separator' }, { label: 'Skjul AI Harness', role: 'hide' },
        { label: 'Skjul andre', role: 'hideOthers' }, { label: 'Vis alle', role: 'unhide' }
      ] : []),
      { type: 'separator' }, { label: 'Afslut AI Harness', role: 'quit' }
    ] },
    { label: 'Rediger', submenu: [
      { label: 'Fortryd', role: 'undo' }, { label: 'Gentag', role: 'redo' },
      { type: 'separator' }, { label: 'Klip', role: 'cut' }, { label: 'Kopiér', role: 'copy' },
      { label: 'Sæt ind', role: 'paste' }, { label: 'Vælg alt', role: 'selectAll' }
    ] },
    { label: 'Vis', submenu: [
      { label: 'Faktisk størrelse', role: 'resetZoom' }, { label: 'Zoom ind', role: 'zoomIn' },
      { label: 'Zoom ud', role: 'zoomOut' }, { type: 'separator' }, { label: 'Fuld skærm', role: 'togglefullscreen' },
      ...(!app.isPackaged ? [{ type: 'separator' }, { label: 'Udviklerværktøjer', role: 'toggleDevTools' }] : [])
    ] },
    { label: 'Vindue', submenu: [
      { label: 'Minimér', role: 'minimize' }, { label: 'Zoom vindue', role: 'zoom' },
      { label: 'Luk vindue', role: 'close' },
      ...(process.platform === 'darwin' ? [{ type: 'separator' }, { label: 'Vis alle forrest', role: 'front' }] : [])
    ] }
  ]));
  workbench = new Workbench({ directory: path.join(app.getPath('userData'), 'harness'), safeStorage, profiles: profileRoot, emit: event => { if (['session.error','engine.error'].includes(event.type)) recordFailure('agent', 'model'); if (window && !window.isDestroyed()) window.webContents.send('harness:event', event); } });
  restoration = new (require('./core/restoration.cjs').Restoration)(workbench.git, workbench.store);
  devServer = new DevServer({
    runner: app.isPackaged ? path.join(process.resourcesPath, 'app.asar.unpacked/core/dev-server-runner.cjs') : undefined,
    emit: state => {
      if (state.state === 'error') recordFailure('forhaandsvisning', 'server');
      if (state.root !== project?.root) return;
      if (state.state === 'running') {
        if (preview) { const old = preview; preview = null; void old.close(); }
        externalPreview = state.url;
      } else if (['starting', 'stopping', 'stopped', 'error'].includes(state.state)) externalPreview = null;
      if (window && !window.isDestroyed()) window.webContents.send('harness:event', { type: 'preview.runtime', ...state, project: detectedRuntime });
    }
  });
  deployments = new Deployments(workbench.store);
  github = new GitHub(workbench.store); publishing = new Publishing({ store: workbench.store, git: workbench.git, provider: github });
  protocol.handle('harness', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.host !== 'app' || !['index.html', 'app.js', 'server.js', 'viewport.js', 'hosting.js', 'deployment.js', 'styles.css', 'demo.css'].includes(name)) return new Response('Ikke fundet', { status: 404 });
    return new Response(await fs.readFile(path.join(__dirname, 'ui', name)), { headers: { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8' } });
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.on('will-download', event => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    let devAllowed = false;
    if (externalPreview) { const requested = new URL(details.url); const target = new URL(externalPreview); devAllowed = requested.host === target.host && [target.protocol, target.protocol === 'https:' ? 'wss:' : 'ws:'].includes(requested.protocol); }
    const allowed = details.url.startsWith('harness://app/') || (preview && details.url.startsWith(preview.url)) || devAllowed;
    callback({ cancel: !allowed });
  });
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    if (externalPreview && details.url.startsWith(new URL(externalPreview).origin + '/')) {
      const existing = Object.entries(headers).find(([key]) => key.toLowerCase() === 'content-security-policy');
      if (existing) delete headers[existing[0]];
      headers['Content-Security-Policy'] = [...(existing?.[1] || []), "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'"];
    }
    callback({ responseHeaders: headers });
  });
  function createWindow() {
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 720, backgroundColor: '#F8FAFC', title: 'AI Harness', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    const created = window;
    created.on('close', event => { if (quitReady) return; event.preventDefault(); shutdown().finally(() => { if (!created.isDestroyed()) created.destroy(); }); });
    created.on('closed', () => { externalPreview = null; window = null; assets = []; project = null; });
    window.loadURL(uiURL);
  }
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => { if (quitReady) return; event.preventDefault(); shutdown().finally(() => { quitReady = true; app.quit(); }); });
