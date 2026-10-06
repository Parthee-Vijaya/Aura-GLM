const { app, BrowserWindow, ipcMain, dialog, protocol, session, safeStorage, Menu, shell, webFrameMain } = require('electron');
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
const projectFiles = require('./core/project-files.cjs');
const previewEdit = require('./core/preview-edit.cjs');
const { OwnTools } = require('./core/own-tools.cjs');

// Appen hedder Aura. Datamappen og navnet i nøgleringen bevares fra før navneskiftet; se core/app-identity.cjs.
const { appIdentity, rememberKeychain, projectParent, DISPLAY_NAME } = require('./core/app-identity.cjs');
const identity = appIdentity({ appData: app.getPath('appData'), packaged: app.isPackaged, customUserData: app.commandLine.hasSwitch('user-data-dir'), userData: app.getPath('userData'), sessionData: app.getPath('sessionData') });
rememberKeychain(identity);
app.setName(identity.keychainName);
app.setPath('userData', identity.userData);
app.setPath('sessionData', identity.sessionData);

protocol.registerSchemesAsPrivileged([{ scheme: 'harness', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, preview, project, busy = false, chosenParent = null;
let assets = [];
let github, publishing, deployments, restoration;
let workbench, externalPreview = null;
let ownTools;
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
  await stopPicking('project');
  await workbench.activate(next);
  try { const restored = await restoration.previous(next.root); if (restored) await workbench.invalidatePlan(restored.id); }
  catch { await workbench.invalidatePlan(crypto.randomUUID()); workbench.historyWarning = 'Gendannelseskopien kan ikke læses. Projektfilerne er åbne, men den gamle plan er nulstillet. Kopien er bevaret i appens lokale data.'; }
  await devServer.activate(next.root);
  if (preview) await preview.close();
  project = next; preview = null; externalPreview = null; assets = [];
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
// Nye projekter lægges i Dokumenter/Aura, medmindre brugeren selv har valgt en anden placering.
const defaultProjectParent = () => projectParent(app.getPath('documents'));
function projectLocation() {
  const parent = chosenParent || defaultProjectParent();
  return { chosen: Boolean(chosenParent), label: chosenParent ? parent : `Dokumenter › ${path.basename(parent)}`, path: parent };
}
handle('project:location', () => projectLocation());
handle('project:choose-location', () => exclusive(async () => {
  const selection = await dialog.showOpenDialog(window, { title: 'Vælg, hvor dine projekter skal ligge', defaultPath: chosenParent || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  if (!selection.canceled) chosenParent = await fs.realpath(selection.filePaths[0]);
  return projectLocation();
}));
handle('project:create', input => exclusive(async () => {
  if (workbench.running) throw new Error('Stop den aktive opgave først.');
  const startup = await new Preferences(workbench.store).available({ ...input.startup, tests: input.tests });
  const parent = chosenParent || defaultProjectParent();
  if (!chosenParent) await fs.mkdir(parent, { recursive: true });
  // Uden funktionen Design og tilgængelighed bruges hverken designpakke, logo eller inspiration fra startsiden.
  const features = (await workbench.features.get()).effective;
  const created = await createProject(parent, features.design ? input : { ...input, links: [] }, features.design ? assets : [], profileRoot);
  // Med Versioner og fortryd får nye projekter Git fra start og en version efter hver AI-opgave, så de altid kan fortrydes.
  // Et hostingønske eller en designpakke under en slået fra funktion følger ikke med projektet. Brugerens gemte standarder bevares.
  const projectStartup = { ...startup.values, ...(features.deling ? {} : { hosting: '' }), ...(features.design ? {} : { designID: '' }) };
  await workbench.store.saveProject(created.root, { startup: projectStartup, ...(features.versioner ? { autoCheckpoint: true } : {}) });
  let versionWarning = '';
  if (features.versioner) {
    try { await workbench.git.startProject(created.root); }
    catch (error) { versionWarning = `Versioner kunne ikke slås til: ${error.message} Projektet er oprettet, og du kan gemme versioner senere.`; }
  }
  // De seneste valg er udgangspunktet for næste projekt. Brugeren kan glemme dem under Flere valg.
  await new Preferences(workbench.store).save(startup.values);
  const opened = await openProject(created.root);
  if (versionWarning) opened.warnings.push(versionWarning);
  return activate(opened);
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
  await stopPicking('project');
  await devServer.activate(null);
  await workbench.close(); workbench.project = null; externalPreview = null;
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
// Aura Harness i brugerens eget kodeværktøj. Mappen vælges her i hovedprocessen; brugerfladen sender ingen stier.
const tools = () => ownTools ??= new OwnTools({ profiles: profileRoot, git: workbench.git });
handle('tools:catalog', () => tools().catalog());
handle('tools:folder', () => exclusive(async () => {
  const result = await dialog.showOpenDialog(window, { title: 'Vælg projektmappen', buttonLabel: 'Vælg mappe', properties: ['openDirectory', 'createDirectory'] });
  return result.canceled || !result.filePaths[0] ? null : tools().choose(result.filePaths[0]);
}));
handle('tools:review', input => exclusive(() => {
  if (!Array.isArray(input?.tools) || input.tools.length > 40 || input.tools.some(id => typeof id !== 'string')) throw new Error('Vælg gyldige værktøjer.');
  if (input.skills !== undefined && (!Array.isArray(input.skills) || input.skills.length > 60 || input.skills.some(name => typeof name !== 'string'))) throw new Error('Vælg gyldige skills.');
  return tools().plan(input.tools, input.skills);
}));
handle('tools:install', input => exclusive(() => tools().install({ skipConflicts: input?.skipConflicts === true })));
handle('tools:removal', () => exclusive(() => tools().planRemoval()));
handle('tools:remove', () => exclusive(() => tools().remove()));
handle('tools:reveal', async () => { const error = await shell.openPath(tools().requireTarget()); if (error) throw new Error('Mappen kunne ikke åbnes.'); });

function requireIdleProject() {
  if (!project) throw new Error('Åbn et projekt først.');
  if (workbench.running || workbench.finishing) throw new Error('Vent på agenten og en eventuel versionsgemning.');
  if (['installing', 'starting', 'stopping'].includes(devServer.state)) throw new Error('Vent på opstarten af forhåndsvisningen, eller stop den først.');
  return project.root;
}
handle('support:report', () => supportReport());
handle('support:save', async () => {
  const report = supportReport();
  const chosen = await dialog.showSaveDialog(window, { title: 'Gem fejlrapport', defaultPath: 'Aura-fejlrapport.json', filters: [{ name: 'Fejlrapport', extensions: ['json'] }] });
  if (chosen.canceled || !chosen.filePath) return false;
  await fs.writeFile(chosen.filePath, JSON.stringify(report, null, 2), { mode: 0o600 }); return true;
});
// Feedback går på e-mail til kontakten i package.json. Uden kontakt viser appen kun teksten om at skrive til den, der inviterede.
handle('support:contact', () => require('./core/feedback.cjs').contact());
handle('support:feedback', async () => {
  const feedback = require('./core/feedback.cjs'), person = feedback.contact();
  if (!person) return false;
  await shell.openExternal(feedback.mail(person, { version: app.getVersion(), system: `${{ darwin: 'macOS', win32: 'Windows' }[process.platform] || process.platform} ${process.arch}` }));
  return true;
});
handle('git:status', async () => {
  const root = requireIdleProject();
  return { ...await workbench.git.status(root), restoration: await restoration.status(root), autoCheckpoint: (await workbench.store.project(root)).autoCheckpoint === true };
});
handle('git:restore-review', input => exclusive(() => restoration.review(requireIdleProject(), input)));
handle('git:restore', input => exclusive(async () => {
  const root = requireIdleProject();
  const { token, label } = typeof input === 'string' ? { token: input, label: '' } : input || {};
  if (typeof label !== 'string' || label.length > 300 || /[\r\n\0]/.test(label)) throw new Error('Ugyldig beskrivelse af gendannelsen.');
  await devServer.stop(); await workbench.close();
  let restored, error, saved = null;
  try { restored = await restoration.apply(root, token); } catch (failure) { error = failure.message; }
  // Med automatiske versioner gemmes gendannelsen som en ny version. Historikken bevares, og næste opgave kan gemmes for sig.
  if (restored && (await workbench.store.project(root)).autoCheckpoint === true) {
    try {
      const review = await workbench.git.review(root);
      const files = review.files.filter(f => !f.blocked && restored.paths.includes(f.file)).map(f => f.file);
      if (files.length) saved = await workbench.git.commit(root, { token: review.token, files, message: label.trim() || 'Gendannet version' });
    } catch (failure) { error = `Filerne er gendannet, men den nye version blev ikke gemt: ${failure.message}`; }
  }
  if (restored) workbench.log({ kind: 'restore', title: 'Filerne er sat tilbage', detail: `${label.trim() || 'Gendannet version'} · ${restored.paths.length === 1 ? '1 fil' : `${restored.paths.length} filer`}${saved ? ' · gemt som ny version' : ''}`, status: 'completed' }, root);
  if (error) workbench.log({ kind: 'error', title: 'Gendannelsen gik ikke helt igennem', detail: error, status: 'error' }, root);
  // activate kontrollerer journalen, også efter genstart eller en delvis gendannelse.
  return { restored, error, saved, project: await activate(await openProject(root)) };
}));
handle('git:save', note => exclusive(async () => {
  const root = requireIdleProject(), result = await workbench.git.saveAll(root, note || '');
  if (result.saved) workbench.log({ kind: 'checkpoint', title: 'Du gemte en version', detail: note || 'Uden beskrivelse', status: 'completed' }, root);
  return result;
}));
handle('git:identity', value => exclusive(() => workbench.git.setIdentity(requireIdleProject(), value)));
handle('git:init', () => exclusive(() => workbench.git.initialize(requireIdleProject())));
handle('git:review', () => exclusive(() => workbench.git.review(requireIdleProject())));
handle('git:commit', input => exclusive(async () => {
  const root = requireIdleProject(), result = await workbench.git.commit(root, input);
  workbench.log({ kind: 'checkpoint', title: 'Du gemte en version med valgte filer', detail: String(input?.message || ''), status: 'completed' }, root);
  return result;
}));
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

// Faste sider hos udbyderne til nøglevejledningen. Kontrolleret 29. september 2026. Andre adresser åbnes aldrig herfra.
const accountPages = {
  anthropic: { start: 'https://platform.claude.com/', billing: 'https://platform.claude.com/settings/billing', keys: 'https://platform.claude.com/settings/keys' },
  mistral: { start: 'https://console.mistral.ai/', billing: 'https://admin.mistral.ai/organization/billing', privacy: 'https://admin.mistral.ai/plateforme/privacy', keys: 'https://console.mistral.ai/api-keys' },
  corti: { start: 'https://console.corti.app/signup', console: 'https://console.corti.app/', keys: 'https://console.corti.app/corti-models' },
  openrouter: { start: 'https://openrouter.ai/settings/keys' }, zen: { start: 'https://opencode.ai/auth' }
};
handle('connections:account', value => {
  const kind = typeof value === 'string' ? value : value?.kind, page = typeof value === 'string' ? 'start' : value?.page || 'start';
  if (!Object.hasOwn(accountPages, kind) || !Object.hasOwn(accountPages[kind], page)) throw new Error('Denne forbindelse opsættes hos din organisation eller på din egen server.');
  return shell.openExternal(accountPages[kind][page]);
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
  return workbench.send(value);
}));
handle('agent:stop', () => workbench.stop());
handle('agent:reply', value => workbench.reply(value));
handle('agent:question', value => workbench.question(value));
// Afklaring og plan: briefen er brugerens egne ord, og planen kan rettes af brugeren. Intet sendes, før næste besked.
handle('plan:brief', value => exclusive(() => workbench.saveBrief(value)));
handle('plan:wishes', value => exclusive(() => workbench.addWishes(value)));
handle('plan:edit', value => exclusive(() => workbench.editPlan(value)));
handle('plan:restore', value => exclusive(() => workbench.restorePlan(value)));
// Arbejdsfladens faner: Ændringer, Kode og Aktivitet. Alt er skrivebeskyttet; stier valideres her i hovedprocessen.
handle('changes:overview', () => project ? workbench.changeOverview() : { running: false, tasks: [], session: null });
handle('changes:file', value => { if (!project) throw new Error('Åbn et projekt først.'); return workbench.changeFile(value); });
handle('code:list', async () => {
  if (!project) throw new Error('Åbn et projekt først.');
  const root = project.root, result = await projectFiles.listFiles(root), changed = workbench.changedFiles();
  return { root, truncated: result.truncated, files: result.files.map(file => ({ ...file, changed: changed.get(file.path) || null })), deleted: [...changed].filter(([, kind]) => kind === 'slettet').map(([file]) => file) };
});
handle('code:read', file => { if (!project) throw new Error('Åbn et projekt først.'); return projectFiles.readFile(project.root, file); });
handle('activity:list', () => project ? workbench.activityList() : []);
handle('skills:list', () => { if (!project) throw new Error('Åbn et projekt først.'); return workbench.skills.list(project.root); });
handle('skills:save', value => exclusive(async () => {
  if (!project || workbench.running) throw new Error('Åbn et projekt, og stop en eventuel opgave før skill-ændringer.');
  await workbench.close(); return workbench.skills.save(project.root, value);
}));
// Funktioner: standarden for alle projekter og undtagelser for det åbne projekt. Ændringer gælder fra næste opgave.
handle('features:get', () => workbench.features.get(project?.root));
handle('features:save', value => exclusive(async () => {
  if (workbench.running || workbench.finishing) throw new Error('Stop opgaven, før du ændrer funktioner.');
  const result = await workbench.features.save(project?.root, value);
  workbench.prepared = null;
  return result;
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
// Kontrol af forhåndsvisningen efter en opgave: blev siden vist, og skrev den fejl i konsollen? Aura klikker ikke i siden.
const previewLog = { documents: [], errors: [] };
const previewOrigin = () => preview?.url || (externalPreview ? new URL(externalPreview).origin + '/' : null);
function fromPreview(url) { const origin = previewOrigin(); return Boolean(origin && typeof url === 'string' && url.startsWith(origin)); }
function remember(list, entry) { list.push(entry); while (list.length > 50) list.shift(); }
handle('preview:check', input => {
  if (!project) throw new Error('Åbn et projekt først.');
  const since = Number(input?.since) || 0, origin = previewOrigin();
  if (!origin) return { preview: false };
  const documents = previewLog.documents.filter(item => item.at >= since), errors = previewLog.errors.filter(item => item.at >= since);
  const last = documents.at(-1) || null;
  const result = { preview: true, loaded: Boolean(last), status: last?.status || null, errors: errors.slice(0, 5).map(({ message, source, line }) => ({ message, source, line })), errorCount: errors.length };
  const shown = !last ? 'siden svarede ikke' : last.status >= 400 ? `siden svarede med fejl ${last.status}` : 'siden blev vist';
  workbench.log({ kind: 'check', title: 'Kontrol af forhåndsvisningen', detail: `${shown[0].toUpperCase()}${shown.slice(1)} · ${errors.length ? `${errors.length} ${errors.length === 1 ? 'fejl' : 'fejl'} i siden: ${errors[0].message}` : 'ingen fejl i konsollen'}. Aura har ikke klikket eller afprøvet funktioner.`, status: !last || last.status >= 400 || errors.length ? 'error' : 'completed' });
  return result;
});
// Ændringstilstand i forhåndsvisningen. Brugeren slår den selv til; først da indsættes valgscriptet i previewets
// ramme. Sandbox, indholdspolitik og netværksregler er de samme, og siden kan ikke kalde Aura. Hvert valg hentes som
// data og renses her, før det vises eller bruges.
const picking = { active: false, key: '', generation: 0, selected: '' };
const sendEvent = event => { if (window && !window.isDestroyed()) window.webContents.send('harness:event', event); };
function previewFrame() {
  const main = window?.webContents.mainFrame;
  if (!main || !previewOrigin()) return null;
  return main.frames.find(frame => { try { return !frame.detached && fromPreview(frame.url); } catch { return false; } }) || null;
}
async function injectPicker() {
  const frame = previewFrame();
  if (!frame) throw new Error('Forhåndsvisningen er ikke klar. Vent, til siden er vist, og prøv igen.');
  const generation = ++picking.generation;
  await frame.executeJavaScript(previewEdit.pickerSource({ key: picking.key, selected: picking.selected }));
  void pickLoop(frame, generation);
}
async function pickLoop(frame, generation) {
  const key = JSON.stringify(picking.key);
  while (picking.active && generation === picking.generation) {
    let value;
    try { value = await frame.executeJavaScript(`window[${key}] ? window[${key}].next() : null`); } catch { return; }
    if (!picking.active || generation !== picking.generation || !value || typeof value !== 'object') return;
    if (value.type === 'exit') { await stopPicking('esc'); return; }
    if (value.type === 'pick') await pickedElement(value.element, frame.url).catch(error => sendEvent({ type: 'preview.pick', state: 'error', message: error.message }));
  }
}
async function stopPicking(reason) {
  if (!picking.active) return;
  picking.active = false; picking.generation++;
  const frame = previewFrame(), key = JSON.stringify(picking.key);
  try { await frame?.executeJavaScript(`window[${key}] && window[${key}].stop()`); } catch { /* Rammen er måske allerede væk. */ }
  sendEvent({ type: 'preview.pick', state: 'off', reason });
}
// Et valgt element: hvor teksten står i koden, og om Aura kan rette den direkte.
async function pickedElement(raw, frameURL) {
  const root = project?.root, origin = previewOrigin();
  if (!root || !origin) return;
  const selection = previewEdit.sanitizeSelection(raw);
  // Siden i forhold til forhåndsvisningens egen adresse, fx med Astros base-sti. Den statiske servers nøgle i stien sendes aldrig videre.
  const base = preview?.url || externalPreview || origin, url = String(frameURL || '');
  const relative = url.startsWith(base) ? url.slice(base.length) : url.startsWith(origin) ? url.slice(origin.length) : '';
  selection.page = '/' + relative.split(/[?#]/)[0];
  selection.pageFile = previewEdit.pageFileFor(relative, preview ? 'static' : detectedRuntime?.kind);
  const found = selection.leaf && selection.raw && !selection.secret ? await previewEdit.findText(root, selection.raw, { tag: selection.tag, pageFile: selection.pageFile }) : { matches: [] };
  if (project?.root !== root || !picking.active) return;
  const choice = previewEdit.chooseSource(found.matches, { pageFile: selection.pageFile });
  selection.source = choice.match ? { file: choice.match.file, line: choice.match.line } : null;
  selection.places = choice.match ? [] : found.matches.slice(0, 5).map(match => `${match.file}:${match.line}`);
  selection.sourceNote = choice.reason === 'many' ? `teksten står flere steder: ${selection.places.join(', ')}` : '';
  selection.edit = previewEdit.editability(selection, choice);
  selection.id = crypto.randomUUID();
  picking.selected = selection.selector;
  workbench.rememberSelection(selection);
  sendEvent({ type: 'preview.selected', root, selection: { id: selection.id, name: selection.name, tag: selection.tag, text: selection.text, raw: selection.edit.possible ? selection.raw : '', label: selection.label, page: selection.page, source: selection.source, places: selection.places, edit: selection.edit, secret: selection.secret } });
}
handle('preview:pick', async value => {
  if (!value?.on) { await stopPicking('user'); return { active: false }; }
  if (!project) throw new Error('Åbn et projekt først.');
  if (workbench.running || workbench.finishing) throw new Error('Vent, til AI’en er færdig, før du retter i siden.');
  if (!previewOrigin()) throw new Error('Forhåndsvisningen kører ikke. Start den først.');
  if (picking.active) await stopPicking('restart');
  Object.assign(picking, { active: true, key: previewEdit.newKey(), selected: '' });
  try { await injectPicker(); } catch (error) { picking.active = false; picking.generation++; throw error; }
  return { active: true };
});
handle('preview:edit-text', value => { if (!project) throw new Error('Åbn et projekt først.'); return workbench.textEdit(value); });
handle('changes:undo', value => exclusive(() => { if (!project) throw new Error('Åbn et projekt først.'); return workbench.undoTask(value); }));
// Viser forhåndsvisningen teksten nu? Bruges efter en rettelse; svaret kommer fra siden og er kun en kontrol.
handle('preview:contains', async value => {
  const text = String(value?.text || '').replace(/\s+/g, ' ').trim().slice(0, 2000), frame = previewFrame();
  if (!text || !frame) return false;
  try { return (await frame.executeJavaScript(`String(document.body ? document.body.textContent : '').replace(/\\s+/g, ' ').includes(${JSON.stringify(text)})`)) === true; } catch { return false; }
});
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
  app.setAboutPanelOptions({ applicationName: DISPLAY_NAME, applicationVersion: app.getVersion() });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: DISPLAY_NAME, submenu: [
      { label: `Om ${DISPLAY_NAME}`, role: 'about' },
      ...(process.platform === 'darwin' ? [
        { type: 'separator' }, { label: 'Tjenester', role: 'services' },
        { type: 'separator' }, { label: `Skjul ${DISPLAY_NAME}`, role: 'hide' },
        { label: 'Skjul andre', role: 'hideOthers' }, { label: 'Vis alle', role: 'unhide' }
      ] : []),
      { type: 'separator' }, { label: `Afslut ${DISPLAY_NAME}`, role: 'quit' }
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
      previewActivity(state);
      if (state.root !== project?.root) return;
      if (state.state === 'running') {
        if (preview) { const old = preview; preview = null; void old.close(); }
        externalPreview = state.url;
      } else if (['starting', 'stopping', 'stopped', 'error'].includes(state.state)) externalPreview = null;
      if (window && !window.isDestroyed()) window.webContents.send('harness:event', { type: 'preview.runtime', ...state, project: detectedRuntime });
    }
  });
  // Forhåndsvisningens server i Aktivitet: én række pr. tilstand med serverens egen besked. Loggen står i dialogen.
  const previewTitles = { installing: 'Forhåndsvisning: installerer pakker', installed: 'Forhåndsvisning: pakkerne er installeret', starting: 'Forhåndsvisning: starter serveren', running: 'Forhåndsvisning: serveren kører', stopped: 'Forhåndsvisning: stoppet', error: 'Forhåndsvisning: fejl' };
  const previewStates = new Map();
  function previewActivity(state) {
    if (!state.root || !previewTitles[state.state] || previewStates.get(state.root) === state.state) return;
    // Et stop uden en kørende server, fx ved gendannelse af et statisk projekt, er ikke en hændelse.
    if (state.state === 'stopped' && !['installing', 'installed', 'starting', 'running', 'error'].includes(previewStates.get(state.root))) return;
    previewStates.set(state.root, state.state);
    workbench.log({ kind: 'preview', title: previewTitles[state.state], detail: state.message || '', status: state.state === 'error' ? 'error' : ['installing', 'starting'].includes(state.state) ? 'running' : 'completed' }, state.root);
  }
  deployments = new Deployments(workbench.store);
  github = new GitHub(workbench.store); publishing = new Publishing({ store: workbench.store, git: workbench.git, provider: github });
  protocol.handle('harness', async request => {
    const url = new URL(request.url);
    const name = url.pathname.slice(1);
    if (url.host !== 'app' || !['index.html', 'app.js', 'workspace.js', 'plan-view.js', 'planning.js', 'approval-view.js', 'approvals.js', 'preview-edit.js', 'model-advice.js', 'server.js', 'viewport.js', 'hosting.js', 'deployment.js', 'styles.css', 'demo.css'].includes(name)) return new Response('Ikke fundet', { status: 404 });
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
  session.defaultSession.webRequest.onCompleted(details => {
    if (details.resourceType === 'subFrame' && fromPreview(details.url)) remember(previewLog.documents, { at: Date.now(), status: details.statusCode, url: details.url });
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
    window = new BrowserWindow({ width: 1440, height: 940, minWidth: 980, minHeight: 720, backgroundColor: '#F8FAFC', title: DISPLAY_NAME, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: false } });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // Fejl, som forhåndsvisningens side selv skriver i konsollen. Kun previewets ramme; appens egne meddelelser tælles ikke.
    window.webContents.on('console-message', event => {
      if (event.level !== 'error' || !fromPreview(event.frame?.url)) return;
      const clean = require('./core/dev-server.cjs').cleanOutput;
      remember(previewLog.errors, { at: Date.now(), message: clean(String(event.message || '')).slice(0, 300), source: String(event.sourceId || '').replace(previewOrigin() || '', ''), line: event.lineNumber || null });
    });
    // Genindlæses forhåndsvisningen i ændringstilstand, indsættes valgscriptet igen i den nye side.
    window.webContents.on('did-frame-finish-load', (_event, isMainFrame, processId, routingId) => {
      if (isMainFrame || !picking.active) return;
      let frame = null; try { frame = webFrameMain.fromId(processId, routingId); } catch { return; }
      if (frame && fromPreview(frame.url)) injectPicker().catch(() => {});
    });
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
