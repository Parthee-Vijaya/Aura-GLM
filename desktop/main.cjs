const { app, BrowserWindow, ipcMain, dialog, protocol, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const { createProject, openProject } = require('./core/projects.cjs');
const { startPreview } = require('./core/preview.cjs');

protocol.registerSchemesAsPrivileged([{ scheme: 'harness', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, preview, project, busy = false;
let assets = [];
const uiURL = 'harness://app/index.html';
const profileRoot = path.join(__dirname, '..', 'profiles');

async function activate(next) {
  const server = await startPreview(next.root);
  if (preview) await preview.close();
  project = next;
  preview = server;
  assets = [];
  return { ...project, previewURL: preview.url };
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
  const selection = await dialog.showOpenDialog(window, { title: 'Vælg, hvor den nye projektmappe skal ligge', properties: ['openDirectory', 'createDirectory'] });
  if (selection.canceled) return null;
  return activate(await createProject(selection.filePaths[0], input, assets, profileRoot));
}));
handle('project:open', () => exclusive(async () => {
  const selection = await dialog.showOpenDialog(window, { title: 'Åbn en projektmappe oprettet med AI Harness', properties: ['openDirectory'] });
  if (selection.canceled) return null;
  return activate(await openProject(selection.filePaths[0]));
}));
handle('project:new', () => exclusive(async () => {
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
  return assets.map(({ id, kind, path: file }) => ({ id, kind, name: path.basename(file) }));
}));
handle('assets:remove', id => {
  if (busy) throw new Error('Vent på den igangværende handling.');
  assets = assets.filter(item => item.id !== id);
  return assets.map(({ id, kind, path: file }) => ({ id, kind, name: path.basename(file) }));
});
handle('preview:revision', async () => {
  if (!project) return null;
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

app.whenReady().then(() => {
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
    const allowed = details.url.startsWith('harness://app/') || (preview && details.url.startsWith(preview.url));
    callback({ cancel: !allowed });
  });
  function createWindow() {
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 720, backgroundColor: '#f8f9f6', title: 'AI Harness', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.on('will-attach-webview', event => event.preventDefault());
    window.on('closed', () => { window = null; assets = []; project = null; if (preview) { preview.close(); preview = null; } });
    window.loadURL(uiURL);
  }
  createWindow();
  app.on('activate', () => { if (!window) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (preview) preview.close(); });
