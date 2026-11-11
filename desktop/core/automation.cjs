// SPDX-License-Identifier: EUPL-1.2
'use strict';
// Automatisering: scheduled tasks that lay their text ready in the composer.
// A task never sends anything to an AI by itself. The user sends, with the
// usual data review and permissions. Tasks live in the local settings file,
// belong to one project, and only fire while the app is running; time missed
// while it was closed gives one delivery, not a backlog.
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const KINDS = ['once', 'daily', 'weekly'];
const MAX_TASKS = 50, TITLE_LIMIT = 80, TEXT_LIMIT = 4000;
class AutomationError extends Error {}

// The first run strictly after `after` (epoch ms), in local wall-clock time, or null.
function nextRun(task, after) {
  if (task.kind === 'once') { const at = Date.parse(task.at); return Number.isFinite(at) && at > after ? at : null; }
  const [hours, minutes] = task.time.split(':').map(Number), start = new Date(after);
  for (let day = 0; day <= 7; day++) {
    // Built from date parts, so month ends and daylight-saving shifts follow the calendar.
    const at = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day, hours, minutes, 0, 0);
    if (at.getTime() > after && (task.kind === 'daily' || (at.getDay() + 6) % 7 + 1 === task.weekday)) return at.getTime();
  }
  return null;
}

function validate(input, now) {
  if (!input || typeof input !== 'object') throw new AutomationError('Opgaven kunne ikke læses.');
  const title = typeof input.title === 'string' ? input.title.trim() : '', text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!title || title.length > TITLE_LIMIT) throw new AutomationError(`Giv opgaven en titel på højst ${TITLE_LIMIT} tegn.`);
  if (!text || text.length > TEXT_LIMIT) throw new AutomationError(`Skriv teksten til skrivefeltet. Den må højst fylde ${TEXT_LIMIT} tegn.`);
  if (!KINDS.includes(input.kind)) throw new AutomationError('Vælg, hvornår opgaven skal udløses.');
  if (input.kind === 'once') {
    const at = typeof input.at === 'string' ? Date.parse(input.at) : NaN;
    if (!Number.isFinite(at)) throw new AutomationError('Vælg dato og tid.');
    if (at <= now) throw new AutomationError('Tidspunktet skal ligge i fremtiden.');
    return { title, text, kind: 'once', at: new Date(at).toISOString() };
  }
  if (typeof input.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new AutomationError('Vælg et klokkeslæt.');
  if (input.kind === 'daily') return { title, text, kind: 'daily', time: input.time };
  if (!Number.isInteger(input.weekday) || input.weekday < 1 || input.weekday > 7) throw new AutomationError('Vælg en ugedag.');
  return { title, text, kind: 'weekly', time: input.time, weekday: input.weekday };
}

class Automations {
  constructor(store) { this.store = store; }
  // All tasks, the ones that are ready first; `here` marks the given project's own.
  async list(root) {
    const tasks = (await this.store.read()).automations || [];
    return tasks.map(task => ({ ...task, here: task.root === root, project: path.basename(task.root) }))
      .sort((a, b) => Number(b.pending) - Number(a.pending) || (a.next ?? Infinity) - (b.next ?? Infinity) || a.title.localeCompare(b.title, 'da'));
  }
  async save(root, input, now) {
    if (typeof root !== 'string' || !root) throw new AutomationError('Åbn et projekt først.');
    const fields = validate(input, now);
    return this.store.update(state => {
      const tasks = state.automations = state.automations || [];
      let task = input.id === undefined ? null : tasks.find(item => item.id === input.id);
      if (input.id !== undefined && !task) throw new AutomationError('Opgaven findes ikke længere.');
      if (!task) {
        if (tasks.length >= MAX_TASKS) throw new AutomationError(`Du kan have højst ${MAX_TASKS} planlagte opgaver.`);
        task = { id: randomUUID(), root, created: now, last: null };
        tasks.push(task);
      }
      for (const key of ['at', 'time', 'weekday']) delete task[key];
      Object.assign(task, fields, { enabled: true, pending: false, next: nextRun(fields, now) });
      return { ...task };
    });
  }
  async remove(id) { return this.store.update(state => { state.automations = (state.automations || []).filter(task => task.id !== id); }); }
  async toggle(id, enabled, now) {
    return this.store.update(state => {
      const task = (state.automations || []).find(item => item.id === id);
      if (!task) throw new AutomationError('Opgaven findes ikke længere.');
      // Resuming schedules from now, never from the paused past.
      const next = enabled ? nextRun(task, now) : null;
      if (enabled && next === null) throw new AutomationError('Tidspunktet er passeret. Opret opgaven igen med et nyt tidspunkt.');
      Object.assign(task, { enabled, next });
      return { ...task };
    });
  }
  async clearPending(id) { return this.store.update(state => { const task = (state.automations || []).find(item => item.id === id); if (task) task.pending = false; }); }
  // Marks every task whose time has come as ready and schedules its next run.
  async claimDue(now) {
    const pending = (await this.store.read()).automations || [];
    if (!pending.some(task => task.enabled && Number.isFinite(task.next) && task.next <= now)) return [];
    return this.store.update(state => {
      const due = [];
      for (const task of state.automations || []) {
        if (!task.enabled || !Number.isFinite(task.next) || task.next > now) continue;
        task.pending = true; task.last = now; task.next = nextRun(task, now);
        if (task.next === null) task.enabled = false;
        due.push({ ...task });
      }
      return due;
    });
  }
}

module.exports = { Automations, AutomationError, nextRun, validate, KINDS, MAX_TASKS };
