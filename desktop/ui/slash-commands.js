// SPDX-License-Identifier: EUPL-1.2
// The generic slash-command framework (S2 of the GradientDeck UI/UX overhaul).
//
// Typing `/` at word start in the composer opens a popup above the field:
// registered commands first, then the project's skills from skills:list —
// name and a short description per row, at most MAX_ROWS visible. Choosing a
// row inserts `/name ` into the message; for a skill row the token itself is
// the activation — the main process re-parses the exact text (core/slash-
// commands.cjs requires this module's pure grammar), so a removed token is a
// removed activation and a hand-typed token follows the same rules.
//
// No commands are registered in S2: /stil and /design are RESERVED for
// S4-S5, and registerCommand refuses those names so later slices can add
// them without touching this framework.
//
// Trigger rules: word start only (beginning of the text or after
// whitespace); never inside fenced code blocks or URL-ish words; never
// during IME composition. Enter in the OPEN popup inserts — it never sends
// the message (this module stops the key's propagation and app.js' own Enter
// listener refuses while the popup stands open).
(function (scope, factory) {
  const api = factory(scope);
  if (typeof module === 'object' && module.exports) module.exports = api;
  scope.SlashCommands = api;
})(typeof window === 'object' ? window : globalThis, function (root) {
  'use strict';

  // ── Pure token grammar (shared with core/slash-commands.cjs) ──
  // Reserved command names (Parthee's decision): /stil (alias /style) and
  // /design belong to S4-S5. The framework must never register them.
  const RESERVED = Object.freeze(['design', 'stil', 'style']);
  // The ground-rules entry in skills:list is not a skill row and never a
  // command — the rules always ship, so they cannot be "activated".
  const RULES_ID = 'faelles-grundregler';
  const MAX_ROWS = 8;
  const NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  const TOKEN_CHARS = /^[a-z0-9-]*$/i;

  // A fenced code block toggles with each ``` or ~~~ line prefix; a token
  // that starts while the fence is open never triggers.
  function insideFence(text, position) {
    const before = String(text).slice(0, position);
    let fences = 0;
    for (const line of before.split('\n')) if (/^\s*(?:```|~~~)/.test(line)) fences++;
    return fences % 2 === 1;
  }

  // All complete command tokens in a text: `/name` standing as its own word
  // (beginning of the text or after whitespace), never inside a fenced code
  // block, never part of a URL or path (a word containing :, . or / is not a
  // token). Duplicated names are returned once, first occurrence first.
  // Decision (S2 review, Minor-3): a token must end at whitespace or the end
  // of the text — trailing punctuation does NOT activate (`/harness-kodestil,
  // tak!` is inert). The rule is deliberately conservative and identical for
  // the popup and the host: it is what keeps `/foo.baz` and `[se /design]`
  // from activating by accident, and popup-inserted tokens always carry their
  // own trailing space. S3-S5 keep this rule and document it in their
  // registration guidance rather than widening the accepted set.
  function parseTokens(text) {
    if (typeof text !== 'string' || !text.includes('/')) return [];
    const tokens = [];
    const seen = new Set();
    for (const match of text.matchAll(/(^|[\s])(\/[a-z0-9-]+)(?![^\s])/gi)) {
      const start = match.index + match[1].length;
      if (insideFence(text, start)) continue;
      const name = match[2].slice(1).toLowerCase();
      if (seen.has(name)) continue;
      seen.add(name);
      tokens.push({ name, start, end: start + match[2].length });
    }
    return tokens;
  }

  // The token being typed at the caret: the word from the last whitespace up
  // to the caret when it starts with `/`, while the whole word keeps the bare
  // `/name` shape (URLs like https://… and paths like /foo/bar never trigger)
  // and no fence surrounds it. `query` is the typed part after the slash that
  // the popup filters on; `end` is the whole word's end, so insertion replaces
  // the full token.
  function tokenAt(text, caret) {
    if (typeof text !== 'string' || !text.includes('/')) return null;
    const end = Math.max(0, Math.min(Number.isInteger(caret) ? caret : text.length, text.length));
    const before = text.slice(0, end);
    const match = /(?:^|[\s])(\/[a-z0-9-]*)$/i.exec(before);
    if (!match) return null;
    const start = end - match[1].length;
    const word = /^\/[a-z0-9-]*(?![^\s])/i.exec(text.slice(start));
    if (!word) return null;
    if (insideFence(text, start)) return null;
    return { start, end: start + word[0].length, query: match[1].slice(1).toLowerCase() };
  }

  // ── Command registration (S3-S5 add /design and /stil through this) ──
  const commands = new Map();
  function registerCommand(command) {
    const name = typeof command?.name === 'string' ? command.name.toLowerCase() : '';
    if (!NAME.test(name) || name.length > 64 || RESERVED.includes(name) || commands.has(name)) return false;
    const description = typeof command?.description === 'string' && command.description.trim()
      ? command.description.trim().slice(0, 120) : '';
    const activate = typeof command?.activate === 'function' ? command.activate : null;
    commands.set(name, Object.freeze({ name, description, activate }));
    return true;
  }

  // ── Popup state ──
  const state = { ready: false, open: false, composing: false, rows: [], buttons: [], active: -1, inserted: new Set(), skills: [] };
  const options = { prompt: null, layer: null, skills: null, popoverLayer: null };

  function currentLayer() { return options.popoverLayer || root.PopoverLayer || null; }

  function promptAria(on, activeId) {
    const prompt = options.prompt;
    if (!prompt) return;
    if (on) {
      prompt.setAttribute('aria-expanded', 'true');
      prompt.setAttribute('aria-controls', options.layer?.id || 'slash-menu');
      if (activeId) prompt.setAttribute('aria-activedescendant', activeId);
    } else {
      prompt.removeAttribute('aria-expanded');
      prompt.removeAttribute('aria-controls');
      prompt.removeAttribute('aria-activedescendant');
    }
  }

  function markActive() {
    state.buttons.forEach((button, index) => {
      const active = index === state.active;
      button.setAttribute('aria-selected', String(active));
      if (active) {
        button.scrollIntoView?.({ block: 'nearest' });
        promptAria(true, button.id);
      }
    });
    if (state.active < 0) promptAria(true, null);
  }

  function showLayer() {
    const layer = options.layer, prompt = options.prompt;
    const anchor = currentLayer();
    if (anchor?.open) anchor.open({ layer, invoker: prompt, width: () => Math.min(420, Math.max(220, (root.innerWidth || 1024) - 16)), gap: 8 });
    else layer.showPopover?.();
  }

  function close() {
    if (!state.open) return;
    state.open = false; state.rows = []; state.buttons = []; state.active = -1; state.skills = [];
    // Discard the fetched list with the session: the next open re-reads
    // skills:list, so a project or chat switch can never show the previous
    // project's enabled-markings (review finding 1).
    skillsRequest = null;
    options.layer?.hidePopover?.();
    promptAria(false);
  }

  // Row descriptions: skills carry title and summary, and a disabled skill says
  // that the activation is for this message only — the project's own feature
  // choice is never touched.
  function buildRows(query) {
    const needle = String(query || '').toLowerCase();
    const matches = (...parts) => parts.some(part => typeof part === 'string' && part.toLowerCase().startsWith(needle));
    const commandRows = [...commands.values()]
      .filter(command => matches(command.name))
      .map(command => ({ kind: 'command', id: command.name, description: command.description, enabled: true, activate: command.activate }));
    const skills = state.skills.filter(entry => entry?.id && entry.id !== RULES_ID && matches(entry.id, ...(entry.id || '').split('-'), entry.title));
    skills.sort((a, b) => (b.enabled === true) - (a.enabled === true) || String(a.title || '').localeCompare(String(b.title || ''), 'da'));
    const skillRows = skills.map(entry => ({
      kind: 'skill', id: entry.id, enabled: entry.enabled === true,
      description: `${entry.title || entry.id} · ${entry.summary || ''}${entry.enabled === true ? '' : ' · slået fra i projektet · aktiveres kun for denne besked'}`
    }));
    return [...commandRows, ...skillRows].slice(0, MAX_ROWS);
  }

  function render(rows) {
    const layer = options.layer;
    state.rows = rows;
    state.buttons = rows.map((row, index) => {
      const button = root.document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'option');
      button.id = `${layer.id || 'slash-menu'}-option-${index}`;
      button.setAttribute('aria-selected', 'false');
      const name = root.document.createElement('strong');
      name.textContent = '/' + row.id;
      const description = root.document.createElement('small');
      description.textContent = row.description;
      button.append(name, description);
      // A row click keeps the caret in the textarea (mousedown preventDefault)
      // and inserts through the same path as the keyboard.
      button.addEventListener('mousedown', event => event.preventDefault?.());
      button.addEventListener('click', () => insert(row));
      return button;
    });
    layer.replaceChildren(...state.buttons);
    const previous = state.active;
    state.active = Math.min(previous < 0 ? 0 : previous, rows.length - 1);
    markActive();
    if (!state.open) { state.open = true; showLayer(); }
    else currentLayer()?.position?.();
  }

  function insert(row) {
    const prompt = options.prompt;
    if (!prompt || !row) return false;
    const text = String(prompt.value ?? '');
    const caret = typeof prompt.selectionStart === 'number' ? prompt.selectionStart : text.length;
    const token = tokenAt(text, caret);
    if (!token) { close(); return false; }
    const replacement = '/' + row.id + ' ';
    prompt.value = text.slice(0, token.start) + replacement + text.slice(token.end);
    const at = token.start + replacement.length;
    prompt.setSelectionRange?.(at, at);
    state.inserted.add(row.id);
    if (row.kind === 'command' && typeof row.activate === 'function') row.activate({ name: row.id });
    close();
    prompt.focus?.();
    // app.js gemmer kladden på input-hændelsen; indsættelsen skal reagere som tastatur.
    prompt.dispatchEvent?.(typeof root.Event === 'function' ? new root.Event('input', { bubbles: true }) : { type: 'input' });
    return true;
  }

  // One skills fetch per popup session (the review's "samtaleskift" fix): the
  // fetch is started when the popup opens and reused while it stands open —
  // filtering is local — but every close path DISCARDS it, so the next open
  // re-reads skills:list for the CURRENT project, exactly like the Skills
  // dialog does at each opening. Empty or failed answers are never kept, not
  // even for this session: a first "Åbn et projekt først." or a failed fetch
  // can never leave the popup permanently dead — the next evaluation tries
  // again. (A skillsKey per owner would also work, but needs app.js; fetching
  // per open is equally correct and stays inside this module.)
  let skillsRequest = null;
  function ensureSkills() {
    if (!skillsRequest) {
      const request = (async () => { try { return await options.skills(); } catch { return []; } })();
      skillsRequest = request;
      request.then(list => { if (skillsRequest === request && (!Array.isArray(list) || !list.length)) skillsRequest = null; });
    }
    return skillsRequest;
  }

  // One evaluation per input/select event: the token at the caret decides
  // whether the popup stands open, and the skills fetch is re-checked against
  // the live text once it resolves (a stale pass steps aside for a newer one).
  async function evaluate() {
    const prompt = options.prompt;
    if (!prompt || !options.layer || !root.document) return;
    if (state.composing) { close(); return; }
    const text = String(prompt.value ?? '');
    const caret = typeof prompt.selectionStart === 'number' ? prompt.selectionStart : text.length;
    const token = tokenAt(text, caret);
    if (!token) { close(); return; }
    state.skills = await ensureSkills();
    if (state.composing) { close(); return; }
    const now = tokenAt(String(prompt.value ?? ''), typeof prompt.selectionStart === 'number' ? prompt.selectionStart : String(prompt.value ?? '').length);
    if (!now || now.start !== token.start || now.query !== token.query) return;
    const rows = buildRows(now.query);
    if (!rows.length) { close(); return; }
    render(rows);
  }

  function move(step) {
    if (!state.open || !state.buttons.length) return;
    state.active = Math.max(0, Math.min(state.buttons.length - 1, state.active + step));
    markActive();
  }

  // The popup owns these keys while it stands open. Enter and Tab insert and
  // never reach the composer's own Enter handler (which would send); the
  // arrows walk the rows; Escape closes. IME keys are left to the composition.
  function onKeydown(event) {
    if (!state.open || state.composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      move(event.key === 'ArrowDown' ? 1 : -1);
    } else if (event.key === 'Enter') {
      if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault(); event.stopPropagation();
      insert(state.rows[state.active] || state.rows[0]);
    } else if (event.key === 'Tab') {
      if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey) return;
      event.preventDefault(); event.stopPropagation();
      insert(state.rows[state.active] || state.rows[0]);
    } else if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      close();
    }
  }

  function init(input = {}) {
    if (state.ready || !input.prompt || !input.layer || typeof root.document?.createElement !== 'function') return false;
    const prompt = input.prompt, layer = input.layer;
    options.prompt = prompt; options.layer = layer;
    options.skills = typeof input.skills === 'function' ? input.skills : null;
    options.popoverLayer = input.popoverLayer || null;
    state.ready = true;
    prompt.addEventListener('keydown', onKeydown, true);
    prompt.addEventListener('input', () => { evaluate(); });
    // Caret moves by mouse or arrows re-check the token (a collapsed selection
    // only — dragging a selection across text must not open anything).
    prompt.addEventListener('select', () => { if (prompt.selectionStart === prompt.selectionEnd) evaluate(); });
    prompt.addEventListener('focusout', event => { if (!layer.contains?.(event?.relatedTarget)) close(); });
    prompt.addEventListener('compositionstart', () => { state.composing = true; close(); });
    prompt.addEventListener('compositionend', () => { state.composing = false; evaluate(); });
    // The browser's light dismiss and close watcher land here: the state and
    // the textarea's aria must follow the native close as well.
    layer.addEventListener('toggle', event => {
      if (event?.newState === 'closed' && state.open) {
        state.open = false; state.rows = []; state.buttons = []; state.active = -1; state.skills = [];
        // The browser's own dismissal (light dismiss, Escape close watcher)
        // is a close path too: the fetched list goes with the session.
        skillsRequest = null;
        promptAria(false);
      }
    });
    return true;
  }

  // The renderer's record of what the popup inserted, for selection()'s
  // invokedSkills. The host never trusts it — activation is re-parsed from the
  // text — so the record only answers for tokens still present in the message.
  function inserted() {
    if (!options.prompt) return [];
    const present = new Set(parseTokens(String(options.prompt.value ?? '')).map(token => token.name));
    return [...state.inserted].filter(name => present.has(name));
  }

  return Object.freeze({
    RESERVED, RULES_ID, MAX_ROWS,
    parseTokens, tokenAt, insideFence,
    registerCommand, commands: () => [...commands.values()],
    init, open: () => state.open, close, rows: () => [...state.rows], inserted
  });
});
