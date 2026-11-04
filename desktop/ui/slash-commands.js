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
// S3 claims the reserved name /design as a skill alias (SKILL_TOKENS): the
// ported GradientDeck skill harness-design is invoked as /design in both the
// popup and the host. No command is registered under the name — RESERVED
// still guards it. /stil (alias /style) remains reserved for S4.
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
  // Reserved command names (Parthee's decision): /stil (alias /style) is
  // reserved for S4. The framework must never register them.
  const RESERVED = Object.freeze(['design', 'stil', 'style']);
  // S3 claims /design for the ported GradientDeck skill: the skill carries id
  // harness-design and is INVOKED as /design. This alias table is the single
  // source shared with core/slash-commands.cjs — the popup shows and inserts
  // /design, and the host resolves the token to the skill for that send.
  // registerCommand still refuses the name (RESERVED): it belongs to the
  // skill alias, never to a registered command. If the skill is absent from
  // skills:list, the token is inert like any other reserved name.
  const SKILL_TOKENS = Object.freeze({ 'harness-design': 'design' });
  const skillToken = id => (typeof id === 'string' && Object.hasOwn(SKILL_TOKENS, id) ? SKILL_TOKENS[id] : id);
  const tokenSkill = name => { for (const [id, token] of Object.entries(SKILL_TOKENS)) if (token === name) return id; return null; };
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
  // token). EVERY occurrence is returned — consumers deduplicate themselves
  // (the host's resolve by name/id, inserted() builds a Set, and the title
  // derivation strips each occurrence in place).
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
    for (const match of text.matchAll(/(^|[\s])(\/[a-z0-9-]+)(?![^\s])/gi)) {
      const start = match.index + match[1].length;
      if (insideFence(text, start)) continue;
      const name = match[2].slice(1).toLowerCase();
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

  // S4 · katalogniveauet: argumentet efter `/stil ` (alias /style). Matcher
  // kun når markøren står i selve argumentet — `(^|\s)/(stil|style) ` og
  // derefter det halvskrevne slug — og respekterer fences og URL-ord ligesom
  // tokenAt: https://x.dk/stil er ikke et argument, og /design har intet niveau.
  function argumentAt(text, caret) {
    if (typeof text !== 'string' || !text.includes('/')) return null;
    const end = Math.max(0, Math.min(Number.isInteger(caret) ? caret : text.length, text.length));
    const match = /(?:^|[\s])(\/(?:stil|style)[ \t][a-z0-9-]*)$/i.exec(text.slice(0, end));
    if (!match) return null;
    const start = end - match[1].length;
    // Insertion replaces the WHOLE argument word (as tokenAt does for tokens),
    // so a caret mid-word never leaves a stray tail behind.
    const word = /^\/(?:stil|style)[ \t][a-z0-9-]*(?![^\s])/i.exec(text.slice(start));
    if (!word) return null;
    if (insideFence(text, start)) return null;
    return { start, end: start + word[0].length, query: (word[0].split(/[ \t]/)[1] || '').toLowerCase() };
  }

  // S4-gennemgangens Fund 4: er HELE beskeden en selvstændig /stil-kommando med
  // præcis ét argument? Grammatikken deles med værten (core/gradientdeck.cjs
  // kræver dette modul) og med afsendelsesvagterne i app.js, så grænsen og
  // værten aldrig divergerer. Slug'ens FORMAT hører værten til (styleCommand
  // svarer med den ærlige fejl) — her afgøres kun formen: to led, /stil|/style.
  function styleMessage(text) {
    const parts = typeof text === 'string' ? text.trim().split(/\s+/).filter(Boolean) : [];
    return parts.length === 2 && /^\/(?:stil|style)$/i.test(parts[0]);
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
  const state = { ready: false, open: false, composing: false, level: null, rows: [], buttons: [], active: -1, inserted: new Set(), skills: [], statusText: '', overflowText: '', noteText: '' };
  const options = { prompt: null, layer: null, skills: null, styles: null, popoverLayer: null, owner: null };
  // Efter-byg F4: popuppens session-generation. Enhver bruger-ejet lukning
  // (Escape, light dismiss, indsættelse) afslutter sessionen; kørende
  // evalueringer bærer deres generation og træder til side, når den er
  // forbigået — et sent svar kan dermed aldrig genåbne eller fortrænge
  // noget. Forskydningen (modal dialog) er den eneste undtagelse.
  let popupSession = 0;

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
    // P1 (audit §2.6): bredden følger COMPOSEREN — det kort, feltet står i —
    // ikke vinduet. Popuppen rækker altså aldrig over i topbjælken eller
    // arbejdsfladen, og lange navne afkortes med ellipsis i stedet for at
    // scrolle vandret. topLimit holder laget under topbjælkens titel: er der
    // ikke plads over feltet, folder laget ned i stedet for at dække den.
    const card = prompt?.closest?.('.composer') || prompt;
    if (anchor?.open) anchor.open({
      layer, invoker: prompt, gap: 8,
      width: () => { const rect = card?.getBoundingClientRect?.(); return Math.min(420, Math.max(220, rect?.width || 320)); },
      topLimit: () => { const bar = root.document?.querySelector?.('.workspace-bar'); const rect = bar?.getBoundingClientRect?.(); return rect?.bottom ? rect.bottom + 4 : 0; },
      // S3-fix (UX 8a): ved folden ned respekterer laget COMPOSERKORTETS bund —
      // ikke feltets — så kortets handlingsrække aldrig dækkes ved lave vinduer.
      belowOf: () => card
    });
    else layer.showPopover?.();
  }

  function close({ invalidate = true } = {}) {
    // Efter-byg F4 (Codex, Vigtig): en lukning er enten brugerens eget valg
    // (Escape, klik udenfor, indsættelse, tomme rækker) eller en FORSKYDNING:
    // en modal dialog overtog fokus, mens en hentning står og venter
    // (GradientDeck-samtykket lukker popuppen midt i kataloghentningen). Ved
    // invalidate afsluttes sessionen — en senere hentning kan ALDRIG genåbne
    // popuppen; ved forskydning består den samme generation, så netop
    // samtykke-strømmen kan genåbne kataloget ærligt, når svaret kommer.
    if (invalidate) { popupSession++; skillsRequest = null; stylesRequest = null; }
    if (!state.open) { state.level = null; return; }
    state.open = false; state.level = null; state.rows = []; state.buttons = []; state.active = -1; state.skills = []; state.statusText = ''; state.overflowText = ''; state.noteText = '';
    options.layer?.hidePopover?.();
    promptAria(false);
  }

  // Forskydningstesten: står en modal <dialog> åben (samtykket), er lukningen
  // en forskydning — ikke brugerens valg. Popuppen selv er et popover-lag og
  // rammes aldrig af forespørgslen.
  const modalDisplaced = () => Boolean(root.document?.querySelector?.('dialog[open]'));

  // Row descriptions: skills carry title and summary, and a disabled skill says
  // that the activation is for this message only — the project's own feature
  // choice is never touched. S3: a skill with an invocation alias (harness-
  // design → /design) is shown and inserted under its alias token, and its row
  // is PINNED after commands, before the plain skill rows — /design is the
  // popup's main entrance, so it must be visible at bare `/`, not sorted to
  // row 9 under the enabled skills (fix-round finding UX 6, measured live).
  // S4: /stil (alias /style) får sin egen fastgjorte række som betroet
  // indbygget kommando — mellem aliasrækken og skills, så RESERVED-før-katalog
  // består: kommandoer, /design, /stil og derefter kataloget.
  // S5-UI-fix (a) fra S3-liveanalysen: rækkens beskrivelse starter med det,
  // rækken gør — ikke med skillens navn. Navnet i rækken ER tokenet (/design),
  // så titlen foran resuméet blev en selvgentagelse («GradientDeck-design ·
  // GradientDecks designbedømmelse …»). Resuméet fortæller handlingen; er det
  // fraværende, falder rækken tilbage til titlen.
  const STYLES_COMMAND = Object.freeze({ kind: 'builtin', id: 'stil', names: ['stil', 'style'], description: 'Vælg en designstil fra GradientDeck · hentes sikkert, anvendes i projektet' });
  function buildRows(query) {
    const needle = String(query || '').toLowerCase();
    const matches = (...parts) => parts.some(part => typeof part === 'string' && part.toLowerCase().startsWith(needle));
    const commandRows = [...commands.values()]
      .filter(command => matches(command.name))
      .map(command => ({ kind: 'command', id: command.name, description: command.description, enabled: true, activate: command.activate }));
    const skills = state.skills.filter(entry => entry?.id && entry.id !== RULES_ID && matches(skillToken(entry.id), entry.id, ...(entry.id || '').split('-'), entry.title));
    skills.sort((a, b) => (b.enabled === true) - (a.enabled === true) || String(a.title || '').localeCompare(String(b.title || ''), 'da'));
    const rowOf = entry => ({
      kind: 'skill', id: skillToken(entry.id), enabled: entry.enabled === true,
      // S5-UI-fix (a): beskrivelsen starter med det, skillen gør — titlen
      // står ikke længere to gange i rækken (token + titel + resumé).
      description: `${entry.summary || entry.title || ''}${entry.enabled === true ? '' : ' · slået fra · kun for denne besked'}`
    });
    const aliasRows = [], plainRows = [];
    for (const entry of skills) (skillToken(entry.id) === entry.id ? plainRows : aliasRows).push(rowOf(entry));
    const builtinRows = STYLES_COMMAND.names.some(name => name.startsWith(needle)) ? [STYLES_COMMAND] : [];
    return [...commandRows, ...aliasRows, ...builtinRows, ...plainRows].slice(0, MAX_ROWS);
  }

  function render(rows) {
    const layer = options.layer;
    state.level = 'commands';
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

  // ── S4 · katalogniveauet: GradientDecks stile gennem host-ejet IPC ──
  // Rækkerne bor i en INDRE beholder (.slash-styles) med CSS-ejet højde til
  // otte faste rækker — popover-lagets rydning af sin egen inline-maxHeight
  // (S3-noten) kan derfor aldrig ændre listens højde. Status («Henter
  // katalog…», «Ingen stile matcher «x»», konkrete fejl), «Gemt katalog»-
  // markeringen og overflow-rækken står uden for listen og er ikke valgbare.

  function styleButton(row, index) {
    const layer = options.layer;
    const button = root.document.createElement('button');
    button.type = 'button';
    button.className = 'slash-row slash-row--style';
    button.setAttribute('role', 'option');
    button.id = `${layer.id || 'slash-menu'}-style-${index}`;
    button.setAttribute('aria-selected', 'false');
    const name = root.document.createElement('strong');
    name.textContent = row.name || row.id;
    const description = root.document.createElement('small');
    description.textContent = row.themeText;
    const dot = root.document.createElement('span');
    dot.className = 'slash-theme-dot' + (row.theme === 'dark' ? ' is-dark' : ' is-light');
    dot.setAttribute('aria-hidden', 'true');
    button.append(name, description, dot);
    button.addEventListener('mousedown', event => event.preventDefault?.());
    button.addEventListener('click', () => insert(row));
    return button;
  }

  function renderStyles(rows, status, note, overflow) {
    const layer = options.layer;
    state.level = 'styles';
    state.rows = rows;
    state.statusText = status || '';
    state.noteText = note || '';
    state.overflowText = overflow || '';
    state.buttons = rows.map((row, index) => styleButton(row, index));
    const parts = [];
    if (!rows.length && state.statusText) {
      const statusRow = root.document.createElement('div');
      statusRow.className = 'slash-status';
      statusRow.setAttribute('role', 'status');
      statusRow.textContent = state.statusText;
      parts.push(statusRow);
    }
    if (rows.length) {
      const container = root.document.createElement('div');
      container.className = 'slash-styles';
      container.setAttribute('role', 'presentation');
      container.replaceChildren(...state.buttons);
      parts.push(container);
    }
    if (state.noteText) {
      const noteRow = root.document.createElement('div');
      noteRow.className = 'slash-note';
      noteRow.setAttribute('role', 'presentation');
      noteRow.textContent = state.noteText;
      parts.push(noteRow);
    }
    if (state.overflowText) {
      const moreRow = root.document.createElement('div');
      moreRow.className = 'slash-more';
      moreRow.setAttribute('role', 'presentation');
      moreRow.textContent = state.overflowText;
      parts.push(moreRow);
    }
    layer.replaceChildren(...parts);
    const previous = state.active;
    state.active = rows.length ? Math.min(previous < 0 ? 0 : previous, rows.length - 1) : -1;
    markActive();
    if (!state.open) { state.open = true; showLayer(); }
    else currentLayer()?.position?.();
  }

  // Præfiks på navn, slug eller kategori — navnepræfiks først, derefter
  // alfabetisk med dansk alfabetisering. Højst otte rækker; resten tælles op.
  // Temaet står ALTID i tilgængelig tekst (Mørk/Lys/Blandet/Ukendt tema) —
  // prikken er dekorativ og bærer aldrig betydningen alene (WCAG 1.4.1).
  const THEME_LABELS = { dark: 'Mørk', light: 'Lys', mixed: 'Blandet' };
  function matchStyles(catalog, query) {
    const needle = String(query || '').toLowerCase();
    const prefix = (value) => typeof value === 'string' && value.toLowerCase().startsWith(needle);
    const entries = (catalog.entries || []).filter(entry => entry?.slug && (prefix(entry.name) || prefix(entry.slug) || prefix(entry.category)));
    entries.sort((a, b) => (prefix(b.name) - prefix(a.name)) || String(a.name || a.slug).localeCompare(String(b.name || b.slug), 'da'));
    const fetched = new Set(catalog.cachedStyles || []);
    return entries.map(entry => ({
      kind: 'style', id: entry.slug, name: entry.name || entry.slug, theme: entry.theme,
      themeText: `${entry.category || ''} · ${THEME_LABELS[entry.theme] || 'Ukendt tema'}${fetched.has(entry.slug) ? ' · hentet' : ''}`,
      fetched: fetched.has(entry.slug),
    }));
  }

  function insert(row) {
    if (row?.kind === 'style') return insertStyle(row);
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

  // Valg på katalogniveauet indsætter `/stil <slug> ` — det sender ALDRIG
  // beskeden; selve hentningen med samtykke sker i værten, når beskeden sendes.
  function insertStyle(row) {
    const prompt = options.prompt;
    if (!prompt || !row) return false;
    const text = String(prompt.value ?? '');
    const caret = typeof prompt.selectionStart === 'number' ? prompt.selectionStart : text.length;
    const argument = argumentAt(text, caret);
    if (!argument) { close(); return false; }
    const replacement = '/stil ' + row.id + ' ';
    prompt.value = text.slice(0, argument.start) + replacement + text.slice(argument.end);
    const at = argument.start + replacement.length;
    prompt.setSelectionRange?.(at, at);
    close();
    prompt.focus?.();
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
  let skillsRequest = null, skillsOwner = null;
  function ensureSkills() {
    // Efter-byg F4: hentningen er bundet til ejeren (root + chat) — skifter
    // projektet eller samtalen, startes en FRISK hentning i stedet for at
    // genbruge svaret fra det forrige.
    const owner = options.owner ? options.owner() : null;
    if (skillsRequest && (!options.owner || skillsOwner === owner)) return skillsRequest;
    const request = (async () => { try { return await options.skills(); } catch { return []; } })();
    skillsRequest = request; skillsOwner = owner;
    request.then(list => { if (skillsRequest === request && (!Array.isArray(list) || !list.length)) skillsRequest = null; });
    return skillsRequest;
  }
  // One evaluation per input/select event: the token at the caret decides
  // whether the popup stands open, and the skills fetch is re-checked against
  // the live text once it resolves (a stale pass steps aside for a newer one).
  // S4: argumentet efter `/stil ` åbner katalogniveauet i stedet — kataloget
  // hentes ÉN gang pr. åben session (som skills:list) og kasseres ved lukning,
  // så et projekt- eller samtaleskift aldrig viser det forrige projekts data.
  let stylesRequest = null, stylesOwner = null;
  function ensureStyles() {
    // Efter-byg F4: kataloget er ligesom skills bundet til ejeren — en ny
    // projekt- eller samtaleskiftet åbning henter aldrig det forriges svar.
    const owner = options.owner ? options.owner() : null;
    if (stylesRequest && (!options.owner || stylesOwner === owner)) return stylesRequest;
    const request = (async () => { try { return await options.styles?.(); } catch { return null; } })();
    stylesRequest = request; stylesOwner = owner;
    request.then(catalog => { if (stylesRequest === request && (!catalog || typeof catalog !== 'object')) stylesRequest = null; });
    return stylesRequest;
  }

  const danishDate = value => {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }).replace(/\.$/, '') : '';
  };

  async function evaluateStyles(argument) {
    const prompt = options.prompt;
    const at = popupSession, ownerAt = options.owner ? options.owner() : null;
    const textAtStart = String(prompt.value ?? '');
    renderStyles([], 'Henter katalog…', '', '');
    const catalog = await ensureStyles();
    // Efter-byg F4: sessionen og ejeren genkontrolleres efter await — en
    // lukket popup eller et skiftet projekt/chat gør svaret magtesløst.
    if (popupSession !== at || (options.owner && options.owner() !== ownerAt)) return;
    // En modal dialog (samtykket) lukker popuppen og efterlader en ustabil
    // markør: Chromium nulstiller selectionStart, selv når teksten er urørt.
    // Er TEKSTEN uændret, genbruges argumentet, så kataloget genåbnes ærligt;
    // er teksten ændret, afgør den aktuelle markør som før.
    const text = String(prompt.value ?? '');
    const now = text === textAtStart ? argument : argumentAt(text, typeof prompt.selectionStart === 'number' ? prompt.selectionStart : text.length);
    if (!now || state.composing) { close(); return; }
    if (!catalog || catalog.status !== 'ok') {
      renderStyles([], catalog?.message || 'Kataloget kunne ikke hentes. Prøv igen.', '', '');
      return;
    }
    const note = catalog.stale ? `Gemt katalog · sidst hentet ${danishDate(catalog.fetchedAt)}` : '';
    const rows = matchStyles(catalog, now.query);
    if (!rows.length) {
      renderStyles([], now.query ? `Ingen stile matcher «${now.query}»` : 'Ingen stile i kataloget.', note, '');
      return;
    }
    const overflow = rows.length > MAX_ROWS ? `… ${rows.length - MAX_ROWS} flere. Skriv for at filtrere.` : '';
    renderStyles(rows.slice(0, MAX_ROWS), '', note, overflow);
  }

  async function evaluate() {
    const prompt = options.prompt;
    if (!prompt || !options.layer || !root.document) return;
    if (state.composing) { close(); return; }
    const text = String(prompt.value ?? '');
    const caret = typeof prompt.selectionStart === 'number' ? prompt.selectionStart : text.length;
    const argument = argumentAt(text, caret);
    if (argument) { await evaluateStyles(argument); return; }
    const token = tokenAt(text, caret);
    if (!token) { close(); return; }
    const at = popupSession, ownerAt = options.owner ? options.owner() : null;
    const fetched = await ensureSkills();
    // Efter-byg F4: sessionen og ejeren genkontrolleres efter await — et sent
    // skills-svar kan hverken genåbne en lukket popup eller vise et forrige
    // projekts liste i en nyere popup. Tilstanden røres først efter tjekket.
    if (popupSession !== at || (options.owner && options.owner() !== ownerAt)) return;
    if (state.composing) { close(); return; }
    state.skills = fetched;
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
    options.styles = typeof input.styles === 'function' ? input.styles : null;
    options.popoverLayer = input.popoverLayer || null;
    // Efter-byg F4: hentningerne bindes til ejeren (root + chat) gennem en
    // stabil nøgle fra app.js — et svar fra et forrige projekt eller en
    // forrige samtale renderer aldrig ind i en nyere popup.
    options.owner = typeof input.owner === 'function' ? input.owner : null;
    state.ready = true;
    prompt.addEventListener('keydown', onKeydown, true);
    prompt.addEventListener('input', () => { evaluate(); });
    // Caret moves by mouse or arrows re-check the token (a collapsed selection
    // only — dragging a selection across text must not open anything).
    prompt.addEventListener('select', () => { if (prompt.selectionStart === prompt.selectionEnd) evaluate(); });
    prompt.addEventListener('focusout', event => { if (!layer.contains?.(event?.relatedTarget)) close({ invalidate: !modalDisplaced() }); });
    prompt.addEventListener('compositionstart', () => { state.composing = true; close(); });
    prompt.addEventListener('compositionend', () => { state.composing = false; evaluate(); });
    // The browser's light dismiss and close watcher land here: the state and
    // the textarea's aria must follow the native close as well. Er en modal
    // dialog åben (samtykket), er lukningen en forskydning — sessionen
    // består, og strømmen kan genåbne ærligt; ellers gælder den som enhver
    // anden bruger-ejet lukning (efter-byg F4).
    layer.addEventListener('toggle', event => {
      if (event?.newState === 'closed') close({ invalidate: !modalDisplaced() });
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
    RESERVED, RULES_ID, MAX_ROWS, SKILL_TOKENS, skillToken, tokenSkill,
    parseTokens, tokenAt, argumentAt, styleMessage, insideFence,
    registerCommand, commands: () => [...commands.values()],
    init, open: () => state.open, close, rows: () => [...state.rows], inserted,
    level: () => (state.open ? state.level : null), statusText: () => state.statusText, overflowText: () => state.overflowText
  });
});
