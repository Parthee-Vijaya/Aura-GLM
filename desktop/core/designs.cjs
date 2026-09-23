const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { validate } = require('./projects.cjs');
class Designs {
  constructor(store) { this.store = store; }
  async list() { return ((await this.store.read()).designs || []).map(({ id, name, color, links, assets }) => ({ id, name, color, links, files: assets.length })); }
  async save(input, assets) {
    validate({ name: input.name, purpose: 'Designpakke', color: input.color, links: input.links, tests: 'manuel' });
    const id = randomUUID(); const directory = path.join(this.store.root, 'designs', id);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const copied = [];
    try {
    for (const asset of assets) {
      const stat = await fs.lstat(asset.path);
      if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error('Designpakken indeholder en ugyldig fil.');
      const filename = randomUUID() + path.extname(asset.path).toLowerCase();
      await fs.copyFile(asset.path, path.join(directory, filename), require('node:fs').constants.COPYFILE_EXCL);
      copied.push({ name: asset.name || path.basename(asset.path), kind: asset.kind, filename });
    }
    await this.store.update(state => { state.designs = [...(state.designs || []), { id, name: input.name.trim(), color: input.color, links: input.links, assets: copied }]; });
    return await this.list();
    } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
  }
  async get(id) {
    const item = ((await this.store.read()).designs || []).find(item => item.id === id);
    if (!item || !/^[a-f0-9-]{36}$/.test(item.id)) throw new Error('Designpakken findes ikke.');
    const assets = [];
    for (const asset of item.assets) {
      if (path.basename(asset.filename) !== asset.filename) throw new Error('Ugyldig designfil.');
      assets.push({ id: randomUUID(), kind: asset.kind, name: asset.name, path: path.join(this.store.root, 'designs', item.id, asset.filename) });
    }
    return { ...item, assets };
  }
}
module.exports = { Designs };
