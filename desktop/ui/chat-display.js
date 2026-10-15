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
    return ({ waiting: 'Venter på udbyderen …', reasoning: 'Modellen forbereder næste skridt …', text: 'AI’en skriver et svar …', tool: p.draft ? `Modtager kode til ${p.draft.file} …` : 'Modellen forbereder en handling …' })[p.phase] || '';
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
  const api = { swatches, progress, phase };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChatDisplay = api;
})(typeof window === 'undefined' ? globalThis : window);
