const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

// brief er null, indtil brugeren eller et svar ændrer den; så bruges projektets idé som udgangspunkt.
const empty = () => ({ version: 1, draft: '', mode: 'plan', messages: [], plan: null, planConversation: [], status: 'idle', brief: null });
// Samtalen er lokale brugerdata, ikke projektfiler eller adgangstilladelser.
class WorkspaceHistory {
  constructor(store) { this.store = store; this.queue = Promise.resolve(); }
  file(root) { return path.join(this.store.root, 'workspaces', this.store.projectKey(root) + '.json'); }
  async read(root) {
    try {
      const data = JSON.parse(await fs.readFile(this.file(root), 'utf8'));
      if (data.version !== 1 || !Array.isArray(data.messages) || !Array.isArray(data.planConversation) || typeof data.draft !== 'string') throw new Error();
      return data;
    } catch (error) {
      if (error.code === 'ENOENT') return empty();
      throw new Error('Den gemte samtale kan ikke læses. Filen er bevaret; projektfilerne er ikke berørt.');
    }
  }
  update(root, change) {
    const task = this.queue.then(async () => {
      const data = await this.read(root);
      await change(data);
      data.updatedAt = new Date().toISOString();
      const target = this.file(root);
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      const temp = target + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temp, JSON.stringify(data), { mode: 0o600 });
      await fs.rename(temp, target);
      return data;
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async open(project) {
    const data = await this.update(project.root, data => {
      if (['working', 'interrupted'].includes(data.status)) {
        // En afbrudt opgaves plan bygges ikke uden ny planlægning, men kan læses som den seneste plan.
        data.status = 'interrupted'; if (data.plan) data.lastPlan = { ...data.plan, reason: 'afbrudt', retiredAt: Date.now() }; data.plan = null;
        if (!data.draft) data.draft = [...data.messages].reverse().find(m => m.role === 'user')?.text || '';
      }
    });
    await this.store.saveProject(project.root, { recent: { root: project.root, name: project.name, at: data.updatedAt } });
    return data;
  }
  startConversation(root) {
    const task = this.queue.then(async () => {
      const target = this.file(root), archive = target.replace(/\.json$/, '') + '-archives';
      const previous = await fs.readFile(target);
      await fs.mkdir(archive, { recursive: true, mode: 0o700 });
      await fs.writeFile(path.join(archive, randomUUID() + '.json'), previous, { mode: 0o600 });
      // Briefen beskriver projektet og følger med til den nye samtale. Plan og beskeder arkiveres.
      let brief = null; try { brief = JSON.parse(previous.toString('utf8')).brief || null; } catch {}
      const temp = target + '.' + randomUUID() + '.tmp';
      await fs.writeFile(temp, JSON.stringify({ ...empty(), brief }), { mode: 0o600 });
      await fs.rename(temp, target);
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async recent() {
    return Object.entries((await this.store.read()).projects).filter(([, p]) => p.recent).map(([id, p]) => ({ id, ...p.recent })).sort((a,b) => b.at.localeCompare(a.at)).slice(0, 12);
  }
  draft(root, input) {
    if (typeof input.text !== 'string' || input.text.length > 30000 || !['plan','build','free'].includes(input.mode)) throw new Error('Ugyldig kladde.');
    return this.update(root, data => { data.draft = input.text; data.mode = input.mode; });
  }
  saveBrief(root, brief) { return this.update(root, data => { data.brief = brief; }); }
  savePlan(root, plan, planConversation, lastPlan) { return this.update(root, data => { data.plan = plan; data.planConversation = planConversation; data.lastPlan = lastPlan || null; }); }
  saveRun(root, run) {
    return this.update(root, data => {
      for (const message of run.messages) {
        if (!['user','assistant','system'].includes(message.role) || typeof message.text !== 'string') continue;
        const existing = data.messages.findIndex(m => m.id === message.id);
        if (message.text.length > 30000) data.trimmed = true;
        const safe = { id: message.id, role: message.role, text: message.text.slice(0, 30000) };
        if (existing < 0) data.messages.push(safe); else data.messages[existing] = safe;
      }
      let size = data.messages.reduce((n,m) => n + m.text.length, 0);
      while (data.messages.length > 200 || size > 200000) { size -= data.messages.shift().text.length; data.trimmed = true; }
      data.plan = run.plan; data.planConversation = run.planConversation;
      if (run.lastPlan !== undefined) data.lastPlan = run.lastPlan;
      data.status = run.status; data.mode = run.mode;
      if (run.usage && typeof run.usage === 'object') data.usage = run.usage;
      if (run.clearDraft) data.draft = '';
    });
  }
}
module.exports = { WorkspaceHistory };
