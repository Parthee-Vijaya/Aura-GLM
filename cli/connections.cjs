const { definitions } = require('../desktop/core/connections.cjs');
const { discoverLocalModels } = require('../desktop/core/local-discovery.cjs');
const { KomplaiLogin } = require('../desktop/core/komplai.cjs');
const { openBrowser } = require('./browser.cjs');

async function unlockConnection(app, id) {
  const connection = await app.bench.connection(id);
  if (connection.secret) { await app.vault.unlock(app.ui); app.ui.protect(app.bench.store.decrypt(connection)); }
  return connection;
}
async function login(app, kind) {
  const { ui, bench, vault } = app;
  if (!kind) {
    kind = await ui.choose('Hvordan vil du forbinde din AI?', [
      { label: 'Jeg har en adgangsnøgle', value: 'key' }, { label: 'AI på min computer', value: 'ollama' }, { label: 'Log ind med Komplai', value: 'komplai' }
    ]);
    if (!kind) return null;
  }
  if (kind === 'key') {
    kind = await ui.choose('Vælg udbyder', [{ label: 'Claude', value: 'anthropic' }, { label: 'Mistral', value: 'mistral' }, { label: 'Corti', value: 'corti' }, { label: 'Vælg en anden', value: 'other' }]);
    if (kind === 'other') kind = await ui.choose('Vælg en anden udbyder', ['openrouter', 'zen', 'compatible', 'komplai'].map(value => ({ value, label: definitions[value].name })));
    if (!kind) return null;
  }
  if (!Object.hasOwn(definitions, kind)) throw new Error('Ukendt udbyder. Brug aura login uden udbydernavn.');
  if (kind === 'komplai') {
    await vault.unlock(ui);
    const flow = app.loginFactory?.() || new KomplaiLogin(); app.pendingLogin = flow;
    try {
      ui.line('Login åbnes i browseren på denne computer. Adgang til en organisation kræver medlemskab og aktiverede kodeværktøjer.');
      const result = await flow.start(url => (app.openBrowser || openBrowser)(url, ui));
      const id = await ui.choose('Hvilken organisations fælles kreditter vil du bruge?', result.organisations.map(o => ({ value: o.id, label: o.name })));
      if (!id) return null;
      const org = result.organisations.find(o => o.id === id);
      ui.line(JSON.stringify({ organisation: org.name, data: org.data, contract: org.contract }, null, 2));
      if (!await ui.confirm('Forbind kontoen og tillad brug af organisationens fælles kreditter?')) return null;
      const connection = await flow.connect(id, bench.store);
      ui.protect(bench.store.decrypt(await bench.connection(connection.id)));
      ui.line('Komplai er tilsluttet. Modellen vælges separat.');
      return connection.id;
    } finally { flow.cancel(); app.pendingLogin = null; }
  }
  const definition = definitions[kind]; let baseURL = definition.baseURL;
  if (kind === 'ollama') {
    const discovery = await discoverLocalModels();
    ui.line(discovery.models.length ? `${discovery.models.length} modeller fundet i Ollama på denne computer.` : 'Ingen kørende modeller fundet på Ollamas standardadresse. Du kan angive en anden adresse.');
  }
  if (['compatible', 'ollama'].includes(kind)) baseURL = (await ui.ask('Serveradresse', { fallback: baseURL, required: true })).trim();
  const name = await ui.ask('Forbindelsens navn', { fallback: definition.name });
  const apiKey = await ui.ask(definition.keyRequired ? 'API-nøgle' : 'API-nøgle (tom ved ingen)', { secret: true, required: definition.keyRequired });
  ui.protect(apiKey);
  if (apiKey) await vault.unlock(ui);
  const before = new Set((await bench.store.read()).connections.map(c => c.id));
  const state = await bench.saveConnection({ kind, name, baseURL, apiKey });
  const connection = state.connections.find(c => !before.has(c.id));
  ui.line('Forbindelsen er gemt. Henter modellisten; ingen beskeder eller projektfiler sendes.');
  const models = await bench.models(connection.id);
  ui.line(`${models.length} modeller fundet. Det beviser ikke adgang til kodeværktøjer eller ledig kvote.`);
  return connection.id;
}
async function selectModel(app, connectionID) {
  const { bench, ui } = app;
  if (!connectionID) {
    const saved = (await bench.store.read()).connections;
    if (!saved.length) connectionID = await login(app);
    else {
      connectionID = await ui.choose('Vælg AI-forbindelse', [...saved.map(c => ({ value: c.id, label: c.name })), { value: 'new', label: 'Tilføj en forbindelse' }]);
      if (connectionID === 'new') connectionID = await login(app);
    }
  }
  if (!connectionID) return null;
  await unlockConnection(app, connectionID);
  const models = await bench.models(connectionID);
  const modelID = await ui.choose('Vælg model', models.map(m => ({ value: m.id, label: `${m.name || m.id}${m.name && m.name !== m.id ? ` (${m.id})` : ''}${m.capabilities?.tools === false ? ' · kataloget angiver ingen værktøjskald' : ''}` })));
  if (!modelID) return null;
  const routes = await bench.routes(connectionID, modelID);
  const connection = await bench.connection(connectionID);
  let routeID = '';
  if (connection.kind === 'openrouter') {
    routeID = await ui.choose('Hvilken udbyder hos OpenRouter skal behandle data?', routes.map(r => ({ value: r.id, label: `${r.name} · ${JSON.stringify(r.price || 'ukendt pris')}` })));
    if (!routeID) return null;
  }
  const selection = { connectionID, modelID, routeID };
  if (bench.project) await bench.store.saveProject(bench.project.root, { selection });
  return selection;
}
async function disclose(ui, data, force = false) {
  if (data.accepted && !force) return true;
  ui.line('\nFør du sender');
  ui.line(`Modtager: ${typeof data.recipients === 'string' ? data.recipients : JSON.stringify(data.recipients)}`);
  ui.line(`Behandling: ${data.region}`);
  ui.line(`Træning: ${data.training}`);
  ui.line(`Opbevaring: ${data.retention}`);
  ui.line(`Pris: ${data.price}`);
  ui.line('Der betales pr. token, når modellen har en pris. Forbruget afhænger af opgavens kompleksitet. Ingen automatisk overgang til en anden model.');
  ui.line(`Materiale: ${data.material}`);
  ui.line(`Kilde: ${data.source} · kontrolleret ${data.checkedAt}`);
  ui.line(data.security);
  if (data.references?.length) ui.line(`Valgte private referencer: ${data.references.join(', ')}`);
  ui.line(data.localStorage);
  while (true) {
    const action = await ui.choose('Vil du sende med disse oplysninger, også hvor forhold er ukendte?', [{ label: 'Send', value: 'send' }, { label: 'Annuller', value: 'cancel' }, { label: 'Se alle oplysninger', value: 'details' }]);
    if (action !== 'details') return action === 'send';
    ui.line(JSON.stringify(data, null, 2));
  }
}
module.exports = { login, selectModel, unlockConnection, disclose };
