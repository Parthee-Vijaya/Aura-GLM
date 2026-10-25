// Real native IdeaRefinement pilot. Keys remain inside Electron safeStorage.
const { app, safeStorage } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const repository = process.argv[2], report = process.argv[3], configPath = process.argv[4];
const rawBrief = process.argv[6], clarificationFile = process.argv[7];
require('node:fs').mkdirSync(report, { recursive: false });
const { Workbench } = require(path.join(repository, 'desktop/core/workbench.cjs'));
const { Store } = require(path.join(repository, 'desktop/core/store.cjs'));
const { IdeaRefinement } = require(path.join(repository, 'desktop/core/idea-refinement.cjs'));
app.setName('Aura');
app.setPath('userData', path.join(report, 'native-profile'));
app.on('window-all-closed', () => {});
const hash = value => createHash('sha256').update(value).digest('hex');

class EphemeralStore extends Store {
  constructor(root, connection) { super(root, safeStorage); this.state = { version: 1, connections: [connection], projects: {} }; }
  async read() { return structuredClone(this.state); }
  async update() { throw Error('Pilot must not mutate source settings or approvals'); }
}
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
app.whenReady().then(async () => {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const idea = (await fs.readFile(rawBrief, 'utf8')).trim(), message = (await fs.readFile(clarificationFile, 'utf8')).trim();
  await fs.writeFile(path.join(report, 'inputs.json'), JSON.stringify({ idea, message, sourceSHA256: hash(idea) }, null, 2));
  const results = [];
  for (const target of config.targets.filter(target => !process.argv[5] || target.provider === process.argv[5])) {
    const started = Date.now(), output = path.join(report, target.provider);
    await fs.mkdir(output, { recursive: true });
    const source = await fs.readFile(target.settings), settings = JSON.parse(source);
    const connection = settings.connections.find(item => item.id === target.connectionID && item.kind === target.provider);
    if (!connection?.secret) throw Error('Selected encrypted connection missing');
    const identity = JSON.parse(await fs.readFile(path.join(path.dirname(target.settings), 'noeglering.json'), 'utf8'));
    if (identity.navn !== 'Aura') throw Error('Unexpected keychain identity');
    const store = new EphemeralStore(path.join(output, 'state'), connection);
    const bench = new Workbench({ store, directory: store.root, safeStorage, profiles: path.join(repository, 'profiles'), emit: () => {} });
    const requests = [];
    const service = new IdeaRefinement({ getWorkbench: () => bench, fetchImpl: async (url, options) => {
      // Persist only reviewed payload and destination, never HTTP headers/credentials.
      requests.push({ url, body: JSON.parse(options.body), startedAt: new Date().toISOString() });
      await fs.writeFile(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2));
      const response = await fetch(url, options);
      if (response.ok) { const body = await response.clone().text(); await fs.writeFile(path.join(output, 'response-' + requests.length + '.json'), body); await fs.writeFile(path.join(output, 'response-body.json'), body); }
      return response;
    }});
    emit({ provider: target.provider, state: 'preparing', model: target.model });
    const result = { productSource: Object.fromEntries(await Promise.all(['idea-refinement.cjs', 'build-design.cjs'].map(async file => [file, hash(await fs.readFile(path.join(repository, 'desktop/core', file)))]))), provider: target.provider, model: target.model, effort: 'provider-default', uiChanged: false, agentTools: false, buildStarted: false };
    try {
      const reviewed = await service.prepare({ name: 'Madbestilling', idea, message, connectionID: target.connectionID, modelID: target.model });
      await fs.writeFile(path.join(output, 'reviewed.json'), JSON.stringify({ system: reviewed.system, content: reviewed.content, disclosure: reviewed.disclosure }, null, 2));
      emit({ provider: target.provider, state: 'sending' });
      const answer = await service.send({ token: reviewed.token });
      await fs.writeFile(path.join(output, 'answer.json'), JSON.stringify(answer, null, 2));
      await fs.writeFile(path.join(output, 'answer.md'), '# ' + target.provider + '\n\n' + answer.description + '\n\n## Planforslag\n\n' + answer.plan + '\n\n## Spørgsmål\n\n' + answer.questions.map(q => '- ' + q).join('\n') + '\n');
      result.ok = true; result.descriptionCharacters = answer.description.length; result.planCharacters = answer.plan.length; result.questionCount = answer.questions.length;
    } catch (error) {
      result.ok = false;
      result.error = error.message; // Aura's sanitized error only; never raw provider bodies.
    } finally {
      service.stop(); await bench.close();
      result.seconds = (Date.now() - started) / 1000;
      result.requests = requests.length;
      result.sourceSettingsUnchanged = hash(source) === hash(await fs.readFile(target.settings));
      await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
      results.push(result); emit(result);
    }
  }
  await fs.writeFile(path.join(report, 'results.json'), JSON.stringify(results, null, 2));
  app.exit(results.every(r => r.ok && r.sourceSettingsUnchanged) ? 0 : 1);
}).catch(error => { emit({ error: error.message }); app.exit(1); });
