(function (root) {
  // Kun fulde hex-farver. Tekst og kode forbliver tekst, også hvis modellen sender HTML.
  function swatches(element) {
    const document = element.ownerDocument;
    const walker = document.createTreeWalker(element, 4);
    const texts = []; let text;
    while ((text = walker.nextNode())) if (!text.parentElement.closest('pre, a, .color-value, .color-swatch')) texts.push(text);
    for (const text of texts) {
      const pattern = /(?<![\w/#])#(?:[a-f\d]{8}|[a-f\d]{6}|[a-f\d]{4}|[a-f\d]{3})(?![\w-])/gi;
      const matches = [...text.textContent.matchAll(pattern)]; if (!matches.length) continue;
      const fragment = document.createDocumentFragment(); let offset = 0;
      for (const match of matches) {
        fragment.append(text.textContent.slice(offset, match.index));
        const value = document.createElement('span'); value.className = 'color-value';
        const square = document.createElement('span'); square.className = 'color-swatch'; square.style.setProperty('--swatch-color', match[0]);
        square.setAttribute('role', 'img'); square.setAttribute('aria-label', `Farve ${match[0]}`); square.title = match[0];
        value.append(square, match[0]); fragment.append(value); offset = match.index + match[0].length;
      }
      fragment.append(text.textContent.slice(offset)); text.replaceWith(fragment);
    }
  }
  function phase(view) {
    if (view.waitingFor?.length) return '';
    const p = view.modelProgress;
    if (!p || p.phase === 'received') return '';
    return ({ waiting: 'Venter på udbyderen …', reasoning: 'Modellen forbereder næste skridt …', text: 'AI’en skriver et svar …', tool: p.draft ? 'Forbereder en filændring …' : 'Modellen forbereder en handling …' })[p.phase] || '';
  }
  function progress(view, now = Date.now()) {
    const silence = Math.max(0, Math.floor((now - (view.lastSignalAt || view.runStartedAt)) / 1000));
    if (view.waitingFor?.length) return { quiet: false, text: '' };
    const p = view.modelProgress;
    if (p && silence < 15 && p.phase === 'reasoning') return { quiet: false, text: 'Der kommer fortsat signaler fra modellen. Intet nyt svar eller filindhold endnu.' };
    if (p && silence < 15 && p.phase === 'tool') return { quiet: false, text: p.draft ? (p.draft.hidden ? 'Indhold med mulige nøgler skjules.' : `${p.draft.lines} linjer modtaget · ikke gemt endnu`) : 'Handlingen vises, når modellen har sendt dens oplysninger.' };
    const received = view.receivedChars ? `${view.receivedChars.toLocaleString('da-DK')} tegn modtaget` : '';
    return { quiet: silence >= 15, text: silence >= 15 ? `Ingen nye signaler i ${silence} s. Du kan vente eller stoppe.` : received || 'Venter på svar fra AI’en.' };
  }
  // Presentation only: never infer a test result, business milestone or permission
  // from a command or from the model's private reasoning. Exact data stays available
  // in the optional technical view and in the existing approval controller.
  const toolActivity = {
    read: ['Undersøger en fil', 'Har undersøgt en fil'],
    glob: ['Finder projektets filer', 'Har fundet projektets filer'],
    list: ['Undersøger projektets mapper', 'Har undersøgt projektets mapper'],
    grep: ['Søger i projektets indhold', 'Har søgt i projektets indhold'],
    edit: ['Opdaterer en fil', 'Har opdateret en fil'],
    write: ['Skriver en fil', 'Har skrevet en fil'],
    multiedit: ['Opdaterer en fil', 'Har opdateret en fil'],
    patch: ['Opdaterer projektets filer', 'Har opdateret projektets filer'],
    apply_patch: ['Opdaterer projektets filer', 'Har opdateret projektets filer'],
    bash: ['Kører et arbejdstrin', 'Har kørt et arbejdstrin'],
    skill: ['Henter relevant vejledning', 'Har hentet relevant vejledning'],
    webfetch: ['Læser en hjemmeside', 'Har læst en hjemmeside'],
    websearch: ['Søger efter oplysninger', 'Har søgt efter oplysninger'],
    todowrite: ['Opdaterer opgavelisten', 'Har opdateret opgavelisten'],
    todoread: ['Læser opgavelisten', 'Har læst opgavelisten'],
    question: ['Forbereder et spørgsmål', 'Har stillet et spørgsmål']
  };
  function activityEntry(entry, options = {}) {
    const failed = entry.status === 'error' || entry.kind === 'tool' && Number.isInteger(entry.exit) && entry.exit !== 0;
    const unfinished = options.finished === true && ['pending', 'running', 'waiting'].includes(entry.status || 'pending');
    const status = failed ? 'error' : unfinished ? 'stopped' : entry.status || 'pending';
    const complete = status === 'completed';
    const labels = toolActivity[entry.tool] || ['Udfører en handling', 'Har udført en handling'];
    const title = entry.kind === 'tool' ? (failed ? 'En handling kunne ikke gennemføres' : unfinished ? 'Handlingen blev ikke afsluttet' : labels[complete ? 1 : 0]) : entry.title || 'Aktivitet';
    const detail = unfinished ? 'Kørslen er afsluttet. Der er ikke registreret et resultat for dette trin.' : entry.kind === 'tool' ? failed ? 'Se de tekniske detaljer. Handlingen er ikke markeret som bestået.' : entry.tool === 'bash' ? 'En lokal kommando. Resultatet kan ses under detaljer.' : '' : entry.detail || '';
    const elapsed = Number.isFinite(entry.started) && Number.isFinite(entry.ended) && entry.ended >= entry.started ? entry.ended - entry.started : null;
    return { title, detail, status, completed: complete && !failed, elapsed };
  }
  function activitySummary(entries) {
    const tools = entries.filter(entry => entry.kind === 'tool');
    return { total: tools.length, completed: tools.filter(entry => activityEntry(entry).completed).length,
      errors: tools.filter(entry => activityEntry(entry).status === 'error').length };
  }
  const api = { swatches, progress, phase, activityEntry, activitySummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChatDisplay = api;
})(typeof window === 'undefined' ? globalThis : window);
