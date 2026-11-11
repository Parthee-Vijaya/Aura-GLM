// SPDX-License-Identifier: EUPL-1.2
// Automatisering (plan phase 3): a scheduled task lays its text ready in the
// composer at the chosen time. It never sends anything — the user sends, with
// the usual data review and permissions — and it only fires while the app runs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Automations, nextRun, validate, AutomationError, MAX_TASKS } = require('../core/automation.cjs');
const view = require('../ui/automation.js');

// Local wall-clock times, so the expectations hold in any time zone.
const at = (...parts) => new Date(...parts).getTime();
const THURSDAY_0700 = at(2026, 10, 12, 7, 0), ROOT = '/projekter/fjordby';
function memoryStore() {
  let state = { version: 1, connections: [], projects: {} };
  return { read: async () => structuredClone(state), update: async change => { const next = structuredClone(state), result = await change(next); state = next; return result; } };
}
const daily = (extra = {}) => ({ title: 'Morgenstatus', text: 'Giv mig en status på åbne opgaver', kind: 'daily', time: '08:00', ...extra });

test('the next run follows local wall-clock time for each schedule kind', () => {
  assert.equal(nextRun({ kind: 'daily', time: '08:00' }, THURSDAY_0700), at(2026, 10, 12, 8, 0));
  assert.equal(nextRun({ kind: 'daily', time: '08:00' }, at(2026, 10, 12, 8, 0)), at(2026, 10, 13, 8, 0), 'the exact minute has passed');
  assert.equal(nextRun({ kind: 'daily', time: '06:30' }, at(2026, 10, 30, 23, 0)), at(2026, 11, 1, 6, 30), 'month rollover');
  assert.equal(nextRun({ kind: 'weekly', time: '09:15', weekday: 1 }, THURSDAY_0700), at(2026, 10, 16, 9, 15), 'next Monday');
  assert.equal(nextRun({ kind: 'weekly', time: '09:15', weekday: 4 }, THURSDAY_0700), at(2026, 10, 12, 9, 15), 'later today');
  assert.equal(nextRun({ kind: 'weekly', time: '06:00', weekday: 4 }, THURSDAY_0700), at(2026, 10, 19, 6, 0), 'same weekday, time passed');
  const once = new Date(2026, 10, 14, 9, 0).toISOString();
  assert.equal(nextRun({ kind: 'once', at: once }, THURSDAY_0700), at(2026, 10, 14, 9, 0));
  assert.equal(nextRun({ kind: 'once', at: once }, at(2026, 10, 14, 9, 0)), null, 'a one-time task does not repeat');
});

test('input is trimmed and checked before anything is stored', () => {
  assert.deepEqual(validate(daily({ title: '  Morgenstatus  ' }), THURSDAY_0700), { title: 'Morgenstatus', text: 'Giv mig en status på åbne opgaver', kind: 'daily', time: '08:00' });
  assert.deepEqual(validate({ title: 'Ugeplan', text: 'Lav ugeplanen', kind: 'weekly', time: '09:15', weekday: 1, extra: 'ignoreres' }, THURSDAY_0700), { title: 'Ugeplan', text: 'Lav ugeplanen', kind: 'weekly', time: '09:15', weekday: 1 });
  for (const bad of [daily({ title: ' ' }), daily({ text: '' }), daily({ time: '24:00' }), daily({ time: '8:00' }), daily({ kind: 'hourly' }), { ...daily(), kind: 'weekly', weekday: 8 }, { ...daily(), kind: 'weekly' }, daily({ title: 'x'.repeat(81) }), daily({ text: 'x'.repeat(4001) }), null]) {
    assert.throws(() => validate(bad, THURSDAY_0700), AutomationError);
  }
  assert.throws(() => validate({ title: 'Engang', text: 'Tekst', kind: 'once', at: new Date(2026, 10, 12, 6, 0).toISOString() }, THURSDAY_0700), /fremtiden/);
  assert.throws(() => validate({ title: 'Engang', text: 'Tekst', kind: 'once', at: 'i morgen' }, THURSDAY_0700), AutomationError);
});

test('a due task is claimed once, marked ready and scheduled again', async () => {
  const automations = new Automations(memoryStore());
  const saved = await automations.save(ROOT, daily(), THURSDAY_0700);
  assert.equal(saved.next, at(2026, 10, 12, 8, 0)); assert.equal(saved.enabled, true); assert.equal(saved.pending, false); assert.equal(saved.root, ROOT);
  assert.deepEqual(await automations.claimDue(at(2026, 10, 12, 7, 59)), [], 'not yet');
  const due = await automations.claimDue(at(2026, 10, 12, 8, 0));
  assert.deepEqual(due.map(task => task.title), ['Morgenstatus']);
  assert.deepEqual(await automations.claimDue(at(2026, 10, 12, 8, 1)), [], 'claimed once');
  const [stored] = await automations.list(ROOT);
  assert.equal(stored.pending, true); assert.equal(stored.next, at(2026, 10, 13, 8, 0)); assert.equal(stored.here, true);
  await automations.clearPending(stored.id);
  assert.equal((await automations.list(ROOT))[0].pending, false);
});

test('time missed while the app was closed gives one delivery, not a backlog', async () => {
  const automations = new Automations(memoryStore());
  await automations.save(ROOT, daily(), THURSDAY_0700);
  const due = await automations.claimDue(at(2026, 10, 20, 12, 0));
  assert.equal(due.length, 1);
  assert.equal((await automations.list(ROOT))[0].next, at(2026, 10, 21, 8, 0));
});

test('a one-time task ends after its run; a paused task is not claimed', async () => {
  const automations = new Automations(memoryStore());
  const once = await automations.save(ROOT, { title: 'Engang', text: 'Tekst', kind: 'once', at: new Date(2026, 10, 12, 9, 0).toISOString() }, THURSDAY_0700);
  const paused = await automations.save(ROOT, daily(), THURSDAY_0700);
  await automations.toggle(paused.id, false, THURSDAY_0700);
  assert.deepEqual((await automations.claimDue(at(2026, 10, 12, 10, 0))).map(task => task.id), [once.id]);
  const list = await automations.list('/andet/projekt');
  const ended = list.find(task => task.id === once.id);
  assert.equal(ended.enabled, false); assert.equal(ended.next, null); assert.equal(ended.pending, true); assert.equal(ended.here, false, 'tasks belong to their project');
  const resumed = await automations.toggle(paused.id, true, at(2026, 10, 12, 10, 0));
  assert.equal(resumed.next, at(2026, 10, 13, 8, 0), 'resuming schedules from now, not from the past');
});

test('editing, removing and the task limit', async () => {
  const automations = new Automations(memoryStore());
  const saved = await automations.save(ROOT, daily(), THURSDAY_0700);
  const edited = await automations.save(ROOT, daily({ id: saved.id, title: 'Ny titel', time: '10:30' }), THURSDAY_0700);
  assert.equal(edited.id, saved.id); assert.equal(edited.title, 'Ny titel'); assert.equal(edited.next, at(2026, 10, 12, 10, 30));
  await assert.rejects(automations.save(ROOT, daily({ id: 'findes-ikke' }), THURSDAY_0700), AutomationError);
  await assert.rejects(automations.save('', daily(), THURSDAY_0700), /projekt/);
  await automations.remove(saved.id);
  assert.deepEqual(await automations.list(ROOT), []);
  for (let index = 0; index < MAX_TASKS; index++) await automations.save(ROOT, daily({ title: 'Opgave ' + index }), THURSDAY_0700);
  await assert.rejects(automations.save(ROOT, daily(), THURSDAY_0700), /højst/);
});

test('the schedule is described in plain Danish', () => {
  assert.equal(view.describe({ kind: 'daily', time: '08:00' }), 'Hver dag kl. 08.00');
  assert.equal(view.describe({ kind: 'weekly', time: '09:15', weekday: 1 }), 'Hver mandag kl. 09.15');
  assert.equal(view.describe({ kind: 'weekly', time: '09:15', weekday: 7 }), 'Hver søndag kl. 09.15');
  assert.match(view.describe({ kind: 'once', at: new Date(2026, 10, 14, 9, 0).toISOString() }), /^Én gang 14\. nov\.? kl\. 09\.00$/);
});

test('the feature is wired end to end and never sends on its own', () => {
  const desktop = path.join(__dirname, '..');
  const preload = fs.readFileSync(path.join(desktop, 'preload.cjs'), 'utf8'), main = fs.readFileSync(path.join(desktop, 'main.cjs'), 'utf8');
  for (const [name, channel] of [['automationList', 'automation:list'], ['automationSave', 'automation:save'], ['automationRemove', 'automation:remove'], ['automationToggle', 'automation:toggle'], ['automationClear', 'automation:clear']]) {
    assert.ok(preload.includes(`${name}: '${channel}'`), `preload exposes ${name}`);
    assert.ok(main.includes(`handle('${channel}'`), `main handles ${channel}`);
  }
  assert.match(main, /claimDue\(Date\.now\(\)\)/, 'the main process checks for due tasks');
  assert.match(main, /type: 'automation\.due'/);
  const index = fs.readFileSync(path.join(desktop, 'ui', 'index.html'), 'utf8').replace(/\n/g, ' ');
  assert.match(index, /<nav>[\s\S]*?<button type="button" id="automation-open"[^>]*>[\s\S]*?<span class="nav-text">Automatisering<\/span><\/button>[\s\S]*?<\/nav>/);
  assert.match(index, /<dialog id="automation-dialog" data-size="confirm" aria-labelledby="automation-title"/);
  assert.match(index, /Du sender den selv/, 'the dialog says who sends');
  assert.match(index, /mens Aura er åben/, 'and that tasks only fire while the app runs');
  assert.match(index, /<script src="automation\.js" defer><\/script>/);
  assert.ok(require('../core/ui-assets.cjs').FILES.includes('automation.js'));
  const source = fs.readFileSync(path.join(desktop, 'ui', 'automation.js'), 'utf8');
  assert.doesNotMatch(source, /call\('(send|prepare)'|harness\.(send|prepare)|requestSubmit|\.submit\(\)/, 'a scheduled task only fills the composer');
});
