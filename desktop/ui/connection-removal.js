// SPDX-License-Identifier: EUPL-1.2
(function (root) {
  'use strict';
  let pending = null;
  function request({ connection, stillCurrent, remove, document = root.document }) {
    if (pending || !connection?.id || typeof stillCurrent !== 'function' || typeof remove !== 'function') return Promise.resolve(false);
    const make = (tag, text, className) => { const element = document.createElement(tag); if (text) element.textContent = text; if (className) element.className = className; return element; };
    const dialog = make('dialog', '', 'connection-removal-dialog'), heading = make('h2', 'Fjern AI-forbindelsen?'), description = make('p');
    dialog.id = 'connection-removal-dialog'; heading.id = 'connection-removal-title'; description.id = 'connection-removal-description';
    dialog.setAttribute('aria-labelledby', heading.id); dialog.setAttribute('aria-describedby', description.id);
    description.append(make('strong', connection.name || 'Den valgte forbindelse'), document.createTextNode(' og dens gemte adgangsoplysninger fjernes fra Aura 1. Dine projekter og samtaler bevares.'));
    const details = make('p', connection.retiredOAuth ? 'Den tidligere komplai-loginadgang tilbagekaldes. komplai Run bevares.' : 'En API-nøgle tilbagekaldes ikke hos udbyderen. Den kan stadig bruges i andre programmer.', 'hint');
    const status = make('p', '', 'connection-removal-status hint'); status.setAttribute('role', 'status'); status.hidden = true;
    const buttons = make('div', '', 'dialog-actions'), cancel = make('button', 'Annuller'), confirm = make('button', 'Fjern forbindelse', 'danger');
    cancel.type = confirm.type = 'button'; cancel.dataset.action = 'cancel'; confirm.dataset.action = 'confirm'; cancel.autofocus = true;
    buttons.append(cancel, confirm); dialog.append(heading, description, details, status, buttons);
    let resolve, settled = false, busy = false;
    const result = new Promise(done => { resolve = done; }); pending = result;
    const finish = accepted => { if (settled) return; settled = true; pending = null; if (dialog.open) dialog.close(); dialog.remove(); resolve(accepted); };
    const dismiss = () => { if (!busy) finish(false); };
    cancel.addEventListener('click', dismiss);
    dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
    dialog.addEventListener('close', () => { if (!settled && !busy) finish(false); });
    // Clicking inside empty dialog padding is not an outside click. Requiring
    // both pointer endpoints outside also prevents drag-to-backdrop dismissal.
    let outsideStarted = false;
    const outside = event => { const rect = dialog.getBoundingClientRect(); return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom); };
    dialog.addEventListener('pointerdown', event => { outsideStarted = outside(event); });
    dialog.addEventListener('click', event => { if (outsideStarted && outside(event)) dismiss(); outsideStarted = false; });
    confirm.addEventListener('click', async () => {
      if (busy || settled) return;
      if (!stillCurrent(connection.id)) { status.hidden = false; status.textContent = 'Forbindelsen eller dit valg er ændret. Luk denne gennemgang, og vælg forbindelsen igen.'; confirm.disabled = true; cancel.focus(); return; }
      busy = true; cancel.disabled = confirm.disabled = true; dialog.setAttribute('aria-busy', 'true'); status.hidden = false; status.textContent = 'Fjerner forbindelsen …';
      try { await remove(connection.id); finish(true); }
      catch (error) { status.textContent = error?.message || 'Forbindelsen kunne ikke fjernes. Prøv igen.'; }
      finally { busy = false; if (!settled) { cancel.disabled = false; confirm.disabled = !stillCurrent(connection.id); dialog.setAttribute('aria-busy', 'false'); cancel.focus(); } }
    });
    try { document.body.append(dialog); dialog.showModal(); cancel.focus(); }
    catch (error) { finish(false); throw error; }
    return result;
  }
  function bindInformationalDismiss(dialog) {
    // This explicit allowlist excludes connections/forms, credentials, updates,
    // plan/data/tool approvals, and any future dialog by default.
    if (!dialog || !['support-dialog', 'palette'].includes(dialog.id)) return false;
    let startedOutside = false;
    const outside = event => { const rect = dialog.getBoundingClientRect(); return event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom); };
    dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
    dialog.addEventListener('click', event => { if (dialog.open && startedOutside && outside(event)) dialog.close(); startedOutside = false; });
    return true;
  }
  const api = { request, bindInformationalDismiss };
  if (typeof module !== 'undefined') module.exports = api; else root.ConnectionRemoval = api;
})(globalThis);
