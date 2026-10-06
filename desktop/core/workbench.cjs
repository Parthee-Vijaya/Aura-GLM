const crypto = require('node:crypto');
const { Store } = require('./store.cjs');
const { WorkspaceHistory } = require('./workspace-history.cjs');
const connections = require('./connections.cjs');
const { Skills } = require('./skills.cjs');
const { Features } = require('./features.cjs');
const { loadLibrary } = require('./library.cjs');
const { OpenCodeEngine, VERSION } = require('./engine.cjs');
const { GitVersions } = require('./git.cjs');
const { Checkpoints } = require('./checkpoints.cjs');
const brief = require('./brief.cjs');
const { ChatSession, planningReply } = require('./chat-session.cjs');
const { Activity } = require('./activity.cjs');

// Det, der hører til hele projektet: forbindelser, funktioner, skills, briefen, versioner og forhåndsvisningens valg,
// og projektets samtaler. Hver samtale er en ChatSession med sin egen motor og opgave. Kun én samtale ad gangen kan
// arbejde i den samme mappe; den, der arbejder, har "krav" på mappen, indtil opgaven er færdig.
class Workbench {
  constructor({ directory, safeStorage, profiles, emit, engineFactory = options => new OpenCodeEngine(options) }) {
    this.store = new Store(directory, safeStorage); this.history = new WorkspaceHistory(this.store);
    // Biblioteket indlæses én gang. Funktionerne afgør, hvilke af dets skills appens AI kan hente.
    let library = null;
    this.library = () => library ??= loadLibrary(profiles).catch(error => { library = null; throw error; });
    this.features = new Features(this.store, this.library); this.skills = new Skills(this.library, this.store, this.features);
    // Versionen efter en opgave hører til den samtale, hvis opgave gemmes.
    this.git = new GitVersions();
    this.checkpoints = new Checkpoints(this.git, event => { const owner = this.checkpointOwner; if (owner) { owner.checkpointEvent(event); owner.emit(event); } else emit(event); });
    this.engineFactory = engineFactory; this.profiles = profiles; this.emit = emit; this.catalogs = new Map();
    this.chats = new Map(); this.chatID = null; this.claims = new Map(); this.project = null; this.previewSelections = new Map();
    // Samtalernes Ændringer og Aktivitet, så længe appen er åben, også når projektet lukkes og åbnes igen.
    this.memory = new Map(); this.lastChatID = null;
  }
  // Den åbne samtale. Handlinger uden en bestemt samtale gælder den.
  get chat() { return this.chats.get(this.chatID) || null; }
  get running() { return [...this.chats.values()].some(chat => chat.running); }
  get finishing() { return [...this.chats.values()].find(chat => chat.finishing)?.finishing || null; }
  get workspace() { return this.chat?.data || null; }
  // Motorer og forbindelser i brug, så forhåndsvisningen aldrig peger på dem.
  servers() { return [...this.chats.values()].flatMap(chat => [chat.engine?.url, chat.gateway?.url]).filter(Boolean); }
  chatFor(id) {
    const chat = id ? this.chats.get(id) : this.chat;
    if (!chat) throw new Error(id ? 'Samtalen er ikke åben længere. Vælg den igen.' : this.project ? 'Start en ny samtale med + for at fortsætte.' : 'Åbn et projekt først.');
    return chat;
  }

  // En samtales Ændringer og Aktivitet. De senest brugte huskes; en åben samtale glemmes aldrig.
  changesFor(id, root) {
    let changes = this.memory.get(id);
    if (!changes) changes = { baseline: null, current: null, startedAt: null, tasks: [], activity: new Activity(entry => this.emit({ type: 'activity', root, entry, chat: id })) };
    this.memory.delete(id); this.memory.set(id, changes);
    for (const key of this.memory.keys()) if (this.memory.size > 8 && key !== id && !this.chats.has(key)) this.memory.delete(key);
    return changes;
  }

  // ---------- Hvem arbejder i hvilken mappe ----------
  claimable(chat) {
    const other = this.claims.get(chat.root);
    if (other && other !== chat && (other.running || other.finishing)) throw new Error(`Samtalen »${other.title || 'Ny samtale'}« arbejder allerede i projektet. Vent, til den er færdig, eller stop den.`);
  }
  claim(chat) { this.claimable(chat); this.claims.set(chat.root, chat); }
  release(chat) { if (this.claims.get(chat.root) === chat) this.claims.delete(chat.root); }
  busyRoot(root) { const chat = this.claims.get(root); return Boolean(chat && (chat.running || chat.finishing)); }
  // Motorer for samme mappe deler arbejdsmappe; en anden samtales ledige motor lukkes, før en ny starter.
  async closeOthers(chat) { for (const other of this.chats.values()) if (other !== chat && other.root === chat.root && !other.running && other.engine) await other.close(false); }
  // Sidepanelet opdateres samlet, højst én gang pr. 100 ms.
  chatsChanged() {
    if (this.chatsTimer || !this.project) return;
    this.chatsTimer = setTimeout(() => { this.chatsTimer = null; if (this.project) this.chatList().then(chats => this.emit({ type: 'chats.updated', root: this.project.root, chats, active: this.chatID }), () => {}); }, 100);
  }

  // ---------- Projekt og samtaler ----------
  async state() {
    const state = await this.store.read(), chat = this.chat;
    return { connections: state.connections.map(c => this.store.publicConnection(c)), definitions: connections.definitions, engineVersion: VERSION, projectSettings: this.project ? await this.store.project(this.project.root) : {}, running: this.running, workspace: chat?.data || null, historyWarning: this.historyWarning || chat?.historyWarning || '', usage: chat ? chat.currentUsage() : null, features: await this.features.get(this.project?.root), brief: this.project ? this.brief : null, plan: chat?.plan || null, lastPlan: chat?.lastPlan || null, chat: chat?.id || null, chatRunning: Boolean(chat?.running), chats: this.project ? await this.chatList() : [] };
  }
  async activate(project) {
    await this.close();
    if (this.chatID) this.lastChatID = this.chatID;
    this.chats.clear(); this.claims.clear(); this.chatID = null;
    this.project = project; this.historyWarning = ''; this.restorationID = null;
    this.brief = brief.initialBrief(project.purpose); this.previewSelections = new Map();
    try {
      const data = await this.history.open(project);
      // En gemt brief, der ikke kan læses, erstattes ikke stiltiende: idéen bruges, og den gemte fil bevares.
      if (data.brief) { try { this.brief = brief.normalizeBrief(data.brief); } catch { this.historyWarning = 'Den gemte brief kan ikke læses. Idéen bruges som udgangspunkt; filen er bevaret.'; } }
      await this.openChat(data.active);
    } catch (error) { this.historyWarning = error.message; this.chatID = null; }
    return this.state();
  }
  // Åbner en samtale. En samtale, der arbejder, fortsætter i baggrunden, mens en anden er åben.
  async openChat(id) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    let chat = this.chats.get(id);
    if (!chat) {
      const data = await this.history.openChat(this.project.root, id);
      chat = new ChatSession(this, data, this.project.root);
      this.chats.set(id, chat);
    } else await this.history.updateProject(this.project.root, project => { project.active = id; });
    this.chatID = id;
    if (this.restorationID) await chat.invalidatePlan(this.restorationID);
    this.chatsChanged();
    return this.state();
  }
  async newChat() {
    if (!this.project) throw new Error('Åbn et projekt først.');
    const data = await this.history.createChat(this.project.root);
    return this.openChat(data.id);
  }
  async renameChat(input) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    const data = await this.history.renameChat(this.project.root, input?.id, input?.title);
    const chat = this.chats.get(data.id); if (chat) chat.data = { ...chat.data, title: data.title, renamed: data.renamed };
    this.chatsChanged();
    return { title: data.title };
  }
  // Sletning flytter samtalen væk med remove, fx til papirkurven. En samtale, der arbejder, kan ikke slettes.
  async deleteChat(input, remove) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    const chat = this.chats.get(input?.id);
    if (chat?.running || chat?.finishing) throw new Error('Stop opgaven i samtalen, før du sletter den.');
    if (chat) { await chat.close(); this.chats.delete(chat.id); }
    this.memory.delete(input?.id);
    const project = await this.history.removeChat(this.project.root, input?.id, remove);
    if (this.chatID === input?.id) { this.chatID = null; return project.active ? this.openChat(project.active) : this.newChat(); }
    this.chatsChanged();
    return this.state();
  }
  // Projektets samtaler med deres status lige nu: arbejder, venter på dig, afbrudt eller klar.
  async chatList(root = this.project?.root) {
    const list = await this.history.chats(root);
    return list.map(item => { const live = root === this.project?.root ? this.chats.get(item.id) : null; return { ...item, title: live?.data.title || item.title, running: Boolean(live?.running), waiting: Boolean(live?.running && live?.waiting) }; });
  }
  async newConversation() { return this.newChat(); }

  // ---------- Det, der gælder hele projektet ----------
  // Uden en åben samtale, fx mens projektet genåbnes efter en gendannelse, logges i den samtale, der sidst var åben.
  log(entry) { return this.chat ? this.chat.log(entry) : this.memory.get(this.lastChatID)?.activity.put(entry); }
  activityList(id) { return this.chats.get(id || this.chatID)?.activityList() || []; }
  session(id) { return this.chats.get(id || this.chatID)?.session() || null; }
  // Efter en gendannelse beskriver planerne en anden version. Den åbne samtale nulstilles nu, de andre, når de åbnes.
  async invalidatePlan(restorationID) { this.restorationID = restorationID; await this.chat?.invalidatePlan(restorationID); }
  // Briefen: brugerens egne ord. Ændringer gælder fra næste besked og starter ikke en ny modelsession.
  async saveBrief(input) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    const next = brief.normalizeBrief(input);
    next.updatedAt = new Date().toISOString();
    return this.storeBrief(next);
  }
  async addWishes(wishes) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    if (!Array.isArray(wishes) || wishes.length > 10 || wishes.some(w => typeof w?.label !== 'string' || typeof w?.value !== 'string')) throw new Error('Ugyldige ønsker.');
    return this.storeBrief(brief.normalizeBrief(brief.addWishes(this.brief, wishes)));
  }
  async storeBrief(next) {
    const root = this.project.root;
    if (this.historyWarning && !this.chat) throw new Error('Briefen kan ikke gemmes, fordi samtalefilen ikke kan læses.');
    await this.history.saveBrief(root, next);
    if (this.project?.root === root) { this.brief = next; this.emit({ type: 'brief.updated', root, brief: next }); }
    return next;
  }
  // Et valgt element huskes, så beskeden til AI'en og tekstrettelsen bruger Auras eget valg og ikke data fra skærmen.
  rememberSelection(selection) {
    this.previewSelections.set(selection.id, selection);
    for (const key of this.previewSelections.keys()) if (this.previewSelections.size > 20) this.previewSelections.delete(key);
    return selection;
  }

  // ---------- Forbindelser og modeller ----------
  async saveConnection(input) {
    if (this.running) throw new Error('Stop opgaverne, før du ændrer forbindelser.');
    const connection = connections.normalize(input);
    await this.closeEngines();
    await this.store.update(state => {
      const previous = state.connections.find(c => c.id === connection.id);
      if (input.id && !previous) throw new Error('Forbindelsen findes ikke.');
      // En Corti-nøgle hører til sit eget miljø. Uden ny nøgle beholder forbindelsen adressen fra den gemte nøgle.
      if (connection.kind === 'corti' && !input.apiKey && !input.clearKey && previous?.kind === 'corti') connection.baseURL = previous.baseURL;
      connection.secret = input.apiKey ? this.store.encrypt(input.apiKey) : (input.clearKey || previous?.kind !== connection.kind || previous?.baseURL !== connection.baseURL ? undefined : previous?.secret);
      state.connections = [...state.connections.filter(c => c.id !== connection.id), connection];
    });
    this.catalogs.delete(connection.id); for (const chat of this.chats.values()) chat.prepared = null;
    return this.state();
  }
  async removeConnection(id) { if (this.running) throw new Error('Stop opgaverne først.'); await this.closeEngines(); await this.store.update(state => { state.connections = state.connections.filter(c => c.id !== id); }); this.catalogs.delete(id); return this.state(); }
  async closeEngines() { for (const chat of this.chats.values()) if (!chat.running) await chat.close(false); }
  async connection(id) { const connection = (await this.store.read()).connections.find(c => c.id === id); if (!connection) throw new Error('Vælg en gemt forbindelse.'); return connection; }
  async models(id) { const connection = await this.connection(id); const models = await connections.listModels(connection, this.store.decrypt(connection)); this.catalogs.set(id, models); return models; }
  async routes(id, modelID) { const connection = await this.connection(id); return connections.routes(connection, this.store.decrypt(connection), modelID); }
  async selection(input) {
    if (!this.project) throw new Error('Åbn et projekt først.');
    if (typeof input.modelID !== 'string' || !/^[a-zA-Z0-9_./:@+-]{1,200}$/.test(input.modelID)) throw new Error('Vælg en gyldig model.');
    const connection = await this.connection(input.connectionID);
    // Kataloget hentes igen før afsendelse, så ændret pris/model giver nye oplysninger.
    const model = (await this.models(connection.id)).find(m => m.id === input.modelID);
    if (!model) throw new Error('Modellen findes ikke længere hos denne forbindelse.');
    const routes = await this.routes(connection.id, model.id);
    const route = routes.find(r => r.id === input.routeID);
    if (connection.kind === 'openrouter' && !route) throw new Error('Vælg en konkret OpenRouter-udbyder.');
    await this.store.saveProject(this.project.root, { selection: { connectionID: connection.id, modelID: model.id, routeID: route?.id || '' } });
    return { connection, model, route };
  }

  // ---------- Handlinger i en samtale ----------
  // Uden input.chat gælder handlingen den åbne samtale.
  prepare(input) { return this.chatFor(input?.chat).prepare(input); }
  send(input) { return this.chatFor(input?.chat).send(input); }
  stop(input) { return this.chatFor(input?.chat).stop(); }
  // Godkendelser og spørgsmål hører til den samtale, hvis motor stillede dem.
  reply(input) { const chat = input?.chat ? this.chatFor(input.chat) : [...this.chats.values()].find(item => item.engine?.pending.has(input?.id)) || this.chatFor(); return chat.reply(input); }
  question(input) { const chat = input?.chat ? this.chatFor(input.chat) : [...this.chats.values()].find(item => item.questions?.has(input?.id)) || this.chatFor(); return chat.question(input); }
  editPlan(input) { return this.chatFor(input?.chat).editPlan(input); }
  restorePlan(input) { return this.chatFor(input?.chat).restorePlan(input); }
  saveDraft(input) { return this.chatFor(input?.chat).saveDraft(input); }
  changeOverview(input) { return this.chatFor(input?.chat).changeOverview(); }
  changeFile(input) { return this.chatFor(input?.chat).changeFile(input); }
  changedFiles(input) { return this.chats.get(input?.chat || this.chatID)?.changedFiles() || new Map(); }
  textEdit(input) { return this.chatFor(input?.chat).textEdit(input); }
  undoTask(input) { return this.chatFor(input?.chat).undoTask(input); }
  recordEdit(input) { return this.chatFor().recordEdit(input); }
  ensureBaseline() { return this.chatFor().ensureBaseline(); }
  findTask(id) { for (const changes of this.memory.values()) { const task = changes.tasks.find(item => item.id === id); if (task) return task; } return null; }
  // Lukker samtalernes motorer og afbryder en opgave i gang. Projektet og samtalerne forbliver åbne; activate skifter dem.
  async close() {
    for (const chat of this.chats.values()) await chat.close();
    clearTimeout(this.chatsTimer); this.chatsTimer = null;
    await this.history.queue;
  }
}
module.exports = { Workbench, planningReply };
