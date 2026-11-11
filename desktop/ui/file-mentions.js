// SPDX-License-Identifier: EUPL-1.2
// "@" in the composer: suggest project files and add the chosen one as a file
// reference. This is only a faster way into the reference chips the Kode tab
// already fills — the list comes from the same file listing (protected files
// are already left out there), choosing goes through workspace.addReference
// with its ten-reference limit, and the send path with its data review is
// untouched. Typing a mention reads no file content and sends nothing.
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.FileMentions = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';
  const MAX_ROWS = 8;

  // A mention starts at "@" at the start of the text or after whitespace, so
  // e-mail addresses are left alone. The token runs to the next whitespace.
  function mentionAt(text, caret) {
    if (typeof text !== 'string') return null;
    const at = Math.max(0, Math.min(Number.isInteger(caret) ? caret : text.length, text.length));
    const match = /(?:^|\s)(@[^\s@]*)$/.exec(text.slice(0, at));
    if (!match) return null;
    const rest = /^[^\s@]*/.exec(text.slice(at))[0];
    return { start: at - match[1].length, end: at + rest.length, query: match[1].slice(1) + rest };
  }

  // File-name prefix first, then file-name match, then anywhere in the path;
  // ties go to the shallowest and shortest path. An empty query lists the
  // shallowest files.
  function rank(files, query, limit = MAX_ROWS) {
    const needle = String(query || '').toLowerCase(), scored = [];
    for (const file of Array.isArray(files) ? files : []) {
      const path = typeof file === 'string' ? file : file?.path;
      if (typeof path !== 'string' || !path) continue;
      const lower = path.toLowerCase(), name = lower.slice(lower.lastIndexOf('/') + 1);
      let score = 0;
      if (needle) {
        if (name.startsWith(needle)) score = 0; else if (name.includes(needle)) score = 1; else if (lower.includes(needle)) score = 2; else continue;
      }
      scored.push({ path, score, depth: path.split('/').length });
    }
    scored.sort((a, b) => a.score - b.score || a.depth - b.depth || a.path.length - b.path.length || a.path.localeCompare(b.path));
    return scored.slice(0, limit).map(item => item.path);
  }

  // Remove the typed token; where it stood between two spaces, keep one.
  function strip(text, mention) {
    const before = text.slice(0, mention.start);
    let after = text.slice(mention.end);
    if (after.startsWith(' ') && (before === '' || before.endsWith(' '))) after = after.slice(1);
    return { text: before + after, caret: before.length };
  }

  const document = root.document;
  const prompt = document?.getElementById?.('prompt');
  if (prompt && typeof prompt.addEventListener === 'function') {
    const menu = document.createElement('div');
    menu.id = 'mention-menu'; menu.className = 'menu-material'; menu.setAttribute('popover', 'manual');
    menu.setAttribute('role', 'listbox'); menu.setAttribute('aria-label', 'Henvis til en fil i projektet');
    document.body.append(menu);
    let files = null, loadedAt = 0, rows = [], active = 0, composing = false, turn = 0;
    const isOpen = () => menu.matches(':popover-open');
    // The listing is cached briefly so a typed word does not ask the host per key.
    async function load() {
      if (files && Date.now() - loadedAt < 5000) return files;
      try { files = (await root.call('codeList')).files || []; } catch { files = []; }
      loadedAt = Date.now();
      return files;
    }
    function close() {
      turn++;
      if (isOpen()) menu.hidePopover();
      rows = []; menu.replaceChildren(); prompt.removeAttribute('aria-activedescendant');
    }
    function place() {
      const box = (prompt.closest('.composer') || prompt).getBoundingClientRect();
      menu.style.left = Math.round(box.left + 12) + 'px';
      menu.style.bottom = Math.round(root.innerHeight - box.top + 8) + 'px';
      menu.style.width = Math.round(Math.min(440, Math.max(240, box.width - 24))) + 'px';
    }
    function render() {
      menu.replaceChildren(...rows.map((path, index) => {
        const option = document.createElement('button'), slash = path.lastIndexOf('/'), name = document.createElement('span');
        option.type = 'button'; option.id = 'mention-option-' + index; option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(index === active)); option.tabIndex = -1;
        name.textContent = path.slice(slash + 1); option.append(name);
        if (slash > 0) { const folder = document.createElement('small'); folder.textContent = path.slice(0, slash); option.append(folder); }
        // Keep the caret in the field while the pointer picks a row.
        option.addEventListener('mousedown', event => event.preventDefault());
        option.addEventListener('click', () => choose(index));
        return option;
      }));
      prompt.setAttribute('aria-activedescendant', 'mention-option-' + active);
    }
    async function update() {
      if (composing) return;
      const mention = mentionAt(prompt.value, prompt.selectionStart);
      if (!mention) return close();
      const mine = ++turn, list = await load();
      if (mine !== turn) return;
      const next = rank(list, mention.query);
      if (!next.length) return close();
      rows = next;
      if (!isOpen()) { active = 0; place(); menu.showPopover(); } else { active = Math.min(active, rows.length - 1); place(); }
      render();
    }
    function choose(index) {
      const path = rows[index], mention = mentionAt(prompt.value, prompt.selectionStart);
      if (!path || !mention) return close();
      const result = strip(prompt.value, mention);
      close();
      prompt.value = result.text; prompt.setSelectionRange(result.caret, result.caret);
      prompt.dispatchEvent(new root.Event('input', { bubbles: true }));
      root.workspace?.addReference?.({ path });
    }
    // Capture phase: while the list is open, its keys must not send the message.
    prompt.addEventListener('keydown', event => {
      if (!isOpen() || event.isComposing || !rows.length) return;
      if (event.key === 'ArrowDown') active = (active + 1) % rows.length;
      else if (event.key === 'ArrowUp') active = (active + rows.length - 1) % rows.length;
      else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); event.stopImmediatePropagation(); choose(active); return; }
      else if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); return; }
      else return;
      event.preventDefault(); event.stopImmediatePropagation(); render();
    }, true);
    prompt.addEventListener('input', update);
    prompt.addEventListener('click', update);
    prompt.addEventListener('blur', close);
    prompt.addEventListener('compositionstart', () => { composing = true; });
    prompt.addEventListener('compositionend', () => { composing = false; update(); });
  }

  return Object.freeze({ MAX_ROWS, mentionAt, rank, strip });
});
