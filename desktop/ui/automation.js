// SPDX-License-Identifier: EUPL-1.2
// Automatisering: the dialog for scheduled tasks and the delivery of a due
// task into the composer. A task only ever fills the composer; the user sends,
// through the same reviewed path as any other message.
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.Automation = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const WEEKDAYS = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
  const MONTHS = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
  const two = value => String(value).padStart(2, '0');
  const clock = time => 'kl. ' + String(time).replace(':', '.');
  const when = ms => { const date = new Date(ms); return `${date.getDate()}. ${MONTHS[date.getMonth()]} ${clock(two(date.getHours()) + ':' + two(date.getMinutes()))}`; };
  function describe(task) {
    if (task.kind === 'daily') return `Hver dag ${clock(task.time)}`;
    if (task.kind === 'weekly') return `Hver ${WEEKDAYS[task.weekday - 1]} ${clock(task.time)}`;
    return `Én gang ${when(Date.parse(task.at))}`;
  }

  const document = root.document, dialog = document?.getElementById?.('automation-dialog');
  if (dialog) {
    const $ = id => document.getElementById(id);
    const list = $('automation-list'), empty = $('automation-empty'), form = $('automation-form'), error = $('automation-error'), opener = $('automation-open');
    let tasks = [];
    const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
    const button = (label, action, className) => { const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', action); return node; };
    const kind = () => form.querySelector('input[name="automation-kind"]:checked').value;
    const fail = failure => { error.textContent = failure.message; error.hidden = false; };
    function syncFields() {
      const value = kind();
      $('automation-at-field').hidden = value !== 'once'; $('automation-weekday-field').hidden = value !== 'weekly'; $('automation-time-field').hidden = value === 'once';
    }
    // Lays the text in the composer; a draft that is already there is kept above it.
    function place(task) {
      const prompt = $('prompt'); if (!prompt) return;
      prompt.value = prompt.value.trim() ? prompt.value.replace(/\s+$/, '') + '\n\n' + task.text : task.text;
      prompt.dispatchEvent(new root.Event('input', { bubbles: true })); prompt.focus();
    }
    const status = task => task.pending ? 'Klar nu' : task.enabled ? `Næste: ${when(task.next)}` : task.kind === 'once' ? 'Afsluttet' : 'Sat på pause';
    function render() {
      opener.toggleAttribute('data-pending', tasks.some(task => task.pending));
      empty.hidden = tasks.length > 0;
      list.replaceChildren(...tasks.map(task => {
        const item = el('li'), head = el('div', 'automation-head'), actions = el('div', 'automation-actions');
        if (task.pending && task.here) actions.append(button('Læg i skrivefeltet', async () => { place(task); dialog.close(); try { await root.call('automationClear', task.id); await refresh(); } catch (failure) { root.message?.(failure.message, true); } }, 'primary'));
        if (task.pending && !task.here) actions.append(button('Markér som set', () => act('automationClear', task.id)));
        if (task.kind !== 'once' || task.enabled) actions.append(button(task.enabled ? 'Sæt på pause' : 'Genoptag', () => act('automationToggle', { id: task.id, enabled: !task.enabled })));
        actions.append(button('Slet', () => act('automationRemove', task.id)));
        head.append(el('strong', '', task.title), actions);
        item.append(head, el('p', 'hint', [describe(task), status(task), task.here ? null : `Projekt: ${task.project}`].filter(Boolean).join(' · ')));
        return item;
      }));
    }
    async function refresh() { tasks = await root.call('automationList'); render(); }
    async function act(method, value) { error.hidden = true; try { await root.call(method, value); await refresh(); } catch (failure) { fail(failure); } }

    for (const radio of form.querySelectorAll('input[name="automation-kind"]')) radio.addEventListener('change', syncFields);
    form.addEventListener('submit', async event => {
      event.preventDefault(); error.hidden = true;
      const value = kind(), input = { title: $('automation-name').value, text: $('automation-text').value, kind: value };
      if (value === 'once') { const at = new Date($('automation-at').value); input.at = Number.isFinite(at.getTime()) ? at.toISOString() : ''; }
      else { input.time = $('automation-time').value; if (value === 'weekly') input.weekday = Number($('automation-weekday').value); }
      try { await root.call('automationSave', input); form.reset(); syncFields(); await refresh(); } catch (failure) { fail(failure); }
    });
    opener.addEventListener('click', async () => {
      error.hidden = true;
      try { await refresh(); } catch (failure) { root.message?.(failure.message, true); return; }
      syncFields(); dialog.showModal();
    });
    root.harness?.onEvent?.(event => {
      if (event?.type !== 'automation.due' || !event.task) return;
      const task = event.task, prompt = $('prompt');
      // `current` is the open project (app.js). Only its own tasks reach its composer.
      const here = typeof current !== 'undefined' && current && current.root === task.root;
      if (here && prompt && !prompt.value.trim() && !document.querySelector('dialog[open]')) {
        place(task);
        root.call('automationClear', task.id).catch(() => {});
        root.message?.(`Planlagt opgave „${task.title}“ ligger klar i skrivefeltet. Du sender den selv.`);
      } else {
        opener.setAttribute('data-pending', '');
        root.message?.(`Planlagt opgave „${task.title}“ er klar under Automatisering.`);
      }
    });
  }

  return Object.freeze({ describe, when });
});
