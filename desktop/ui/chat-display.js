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
  function progress(view, now = Date.now()) {
    const silence = Math.max(0, Math.floor((now - (view.lastSignalAt || view.runStartedAt)) / 1000));
    if (view.waitingFor?.length) return { quiet: false, text: '' };
    const received = view.receivedChars ? `${view.receivedChars.toLocaleString('da-DK')} tegn modtaget` : '';
    return { quiet: silence >= 15, text: silence >= 15 ? `Ingen nye signaler i ${silence} s. Du kan vente eller stoppe.` : received || 'Venter på svar fra AI’en.' };
  }
  const api = { swatches, progress };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChatDisplay = api;
})(typeof window === 'undefined' ? globalThis : window);
