const { app, BrowserWindow, ipcMain, dialog, protocol, session, safeStorage } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createProject, openProject } = require('./core/projects.cjs');
const { startPreview } = require('./core/preview.cjs');
const { Workbench } = require('./core/workbench.cjs');
const { Designs } = require('./core/designs.cjs');
const { capture, changes } = require('./core/changes.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'harness', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, preview, project, busy = false;
let assets = [];
let workbench, beforeChanges, externalPreview = null;
const uiURL = 'harness://app/index.html';
const profileRoot = path.join(__dirname, '..', 'profiles');

async function activate(next) {
  if (workbench.running) throw new Error('Stop den aktive opgave, før du skifter projekt.');
  await workbench.activate(next);
  if (preview) await preview.close();
  project = next; preview = null; externalPreview = null; beforeChanges = null; assets = [];
  if (next.staticPreview) preview = await startPreview(next.root);
  return { ...project, previewURL: preview?.url || null, workbench: await workbench.state() };
}

function handle(channel, action) {
  ipcMain.handle(channel, async (event, value) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiURL) throw new Error('Adgang afvist.');
    try { return { ok: true, value: await action(value) }; }
    catch (error) {
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
  const selection = await dialog.showOpenDialog(window, { title: 'Vælg, hvor den nye projektmappe skal ligge', properties: ['openDirectory', 'createDirectory'] });
  if (selection.canceled) return null;
  const created = await createProject(selection.filePaths[0], input, assets, profileRoot);
  return activate(await openProject(created.root));
}));
handle('project:open', () => exclusive(async () => {
  const selection = await dialog.showOpenDialog(window, { title: 'Åbn en mappe som arbejdsområde', properties: ['openDirectory'] });
  if (selection.canceled) return null;
  return activate(await openProject(selection.filePaths[0]));
}));
handle('project:new', () => exclusive(async () => {
  if (workbench.running) throw new Error('Stop den aktive opgave, før du skifter projekt.');
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

handle('designs:list', () => new Designs(workbench.store).list());
handle('designs:save', input => exclusive(() => new Designs(workbench.store).save(input, assets)));
handle('designs:apply', id => exclusive(async () => { const design = await new Designs(workbench.store).get(id); assets = design.assets; return { color: design.color, links: design.links, assets: assets.map(({ id, kind, name }) => ({ id, kind, name })) }; }));

handle('connections:state', () => workbench.state());
handle('connections:save', value => exclusive(() => workbench.saveConnection(value)));
handle('connections:remove', value => exclusive(() => workbench.removeConnection(value)));
handle('connections:models', value => workbench.models(value));
handle('connections:routes', value => workbench.routes(value.connectionID, value.modelID));
handle('agent:prepare', value => exclusive(() => workbench.prepare(value)));
handle('agent:send', value => exclusive(async () => {
  if (!project) throw new Error('Åbn et projekt først.');
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
  if (!value) { externalPreview = null; if (preview) await preview.close(); const next = await openProject(project.root); preview = next.staticPreview ? await startPreview(project.root) : null; return preview?.url || null; }
  let url; try { url = new URL(value); } catch { throw new Error('Angiv en lokal serveradresse.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error('Brug en lokal http- eller https-adresse uden login eller parametre.');
  if (workbench.engine?.url === url.origin || workbench.gateway?.url.startsWith(url.origin + '/')) throw new Error('Agentens interne server kan ikke bruges som forhåndsvisning.');
  try { const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) }); await response.body?.cancel(); if (!response.ok) throw new Error(); }
  catch { throw new Error('Den lokale udviklingsserver svarer ikke. Start den separat; appen kører ingen kommando automatisk.'); }
  if (preview) await preview.close(); preview = null; externalPreview = url.href;
  return externalPreview;
}));

app.whenReady().then(() => {
  workbench = new Workbench({ directory: path.join(app.getPath('userData'), 'harness'), safeStorage, profiles: profileRoot, emit: event => { if (window && !window.isDestroyed()) window.webContents.send('harness:event', event); } });
  protocol.handle('harness', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.host !== 'app' || !['index.html', 'app.js', 'styles.css'].includes(name)) return new Response('Ikke fundet', { status: 404 });
    return new Response(await fs.readFile(path.join(__dirname, 'ui', name)), { headers: { 'Content-Type': { 'index.html': 'text/html; charset=utf-8', 'app.js': 'text/javascript', 'styles.css': 'text/css' }[name] } });
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
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 720, backgroundColor: '#f8f9f6', title: 'AI Harness', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.on('closed', () => { workbench.close(); externalPreview = null; window = null; assets = []; project = null; if (preview) { preview.close(); preview = null; } });
    window.loadURL(uiURL);
  }
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { workbench?.close(); if (preview) preview.close(); });
