const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

class Store {
  constructor(root, safeStorage, platform = process.platform) { this.root = root; this.safeStorage = safeStorage; this.platform = platform; this.queue = Promise.resolve(); }
  async read() {
    try { const state = JSON.parse(await fs.readFile(path.join(this.root, 'settings.json'), 'utf8')); if (state.version !== 1) throw new Error(); return state; }
    catch (error) { if (error.code === 'ENOENT') return { version: 1, connections: [], projects: {} }; throw new Error('Appens indstillinger kan ikke læses. De er bevaret til gennemgang.'); }
  }
  update(change) {
    const task = this.queue.then(async () => {
      const state = await this.read(); const result = await change(state);
      await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
      const tmp = path.join(this.root, `settings-${randomUUID()}.tmp`);
      await fs.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await fs.rename(tmp, path.join(this.root, 'settings.json'));
      return result;
    });
    this.queue = task.catch(() => {}); return task;
  }
  encrypt(key) {
    if (!key) return undefined;
    if (!this.encryptionAvailable()) throw new Error('Sikker nøglebeskyttelse er ikke tilgængelig. Nøglen blev ikke gemt. På Linux skal en nøgletjeneste være låst op; terminalversionen kan bruge sit krypterede lager.');
    return this.safeStorage.encryptString(key).toString('base64');
  }
  decrypt(connection) {
    if (!connection.secret) return '';
    if (!this.encryptionAvailable()) throw new Error('Nøglelageret er låst eller mangler sikker nøglebeskyttelse.');
    try { return this.safeStorage.decryptString(Buffer.from(connection.secret, 'base64')); } catch { throw new Error('Nøglen kan ikke dekrypteres på denne computer. Indtast den igen.'); }
  }
  encryptionAvailable() {
    if (!this.safeStorage.isEncryptionAvailable()) return false;
    // Electron kan melde kryptering tilgængelig på Linux, selv om den bruger en offentlig, fast adgangskode.
    // CLI'ens lager har ikke denne metode; det bruger sin egen adgangssætning og nøgleafledning.
    return this.platform !== 'linux' || this.safeStorage.getSelectedStorageBackend?.() !== 'basic_text';
  }
  publicConnection({ secret, ...connection }) { return { ...connection, hasKey: Boolean(secret) }; }
  projectKey(root) { return createHash('sha256').update(root).digest('hex'); }
  async project(root) { return (await this.read()).projects[this.projectKey(root)] || {}; }
  async saveProject(root, values) { return this.update(state => { const id = this.projectKey(root); state.projects[id] = { ...state.projects[id], ...values }; return state.projects[id]; }); }
}
module.exports = { Store };
