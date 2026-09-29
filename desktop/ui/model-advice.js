// Anbefalede modeller pr. udbyder. Højst tre forslag; for kendte udbydere er de AI Harness' egne standardvalg
// i prioriteret rækkefølge, ellers et udvalg fra kataloget. Bruges af brugerfladen og af unit-testene.
(function (root) {
  const advice = {
    anthropic: [[/sonnet/i, 'Anbefalet · god balance mellem kvalitet, hastighed og pris'], [/opus/i, 'Mest grundig · dyrere'], [/haiku/i, 'Hurtigst og billigst · til små opgaver']],
    mistral: [[/devstral/i, 'Anbefalet · Mistrals model til kode'], [/codestral/i, 'Mistrals model til kodeforslag'], [/mistral-(large|medium)/i, 'Mistrals generelle model']],
    corti: [[/s1/i, 'Anbefalet · Cortis model i EU']],
    openrouter: [[/claude.*sonnet|sonnet/i, 'Anbefalet · Claude gennem OpenRouter'], [/devstral|codestral/i, 'Mistrals kodemodel gennem OpenRouter'], [/qwen.*coder/i, 'Åben kodemodel gennem OpenRouter']],
    zen: [[/big-pickle/i, 'Gratis model fra OpenCode Zen'], [/free/i, 'Gratis model · begrænset kapacitet']]
  };
  // Versionsnumre sammenlignes tal for tal; datoer med seks eller flere cifre tæller ikke med.
  const versionKey = id => (id.match(/\d+/g) || []).filter(part => part.length < 6).map(Number);
  function newestFirst(a, b) {
    const x = versionKey(a.id), y = versionKey(b.id);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const difference = (y[i] ?? -1) - (x[i] ?? -1); if (difference) return difference; }
    return a.id.localeCompare(b.id);
  }
  function suggest(catalog, kind) {
    const usable = catalog.filter(model => model.capabilities?.tools !== false);
    const picks = [];
    for (const [pattern, text] of advice[kind] || []) {
      const match = usable.filter(model => pattern.test(model.id) && !picks.some(pick => pick.model.id === model.id)).sort(newestFirst)[0];
      if (match) picks.push({ model: match, text });
    }
    if (picks.length) return { curated: true, picks: picks.slice(0, 3) };
    const fallback = [...usable].sort((a, b) => Number(b.capabilities?.tools === true) - Number(a.capabilities?.tools === true) || a.name.localeCompare(b.name, 'da')).slice(0, 3);
    return { curated: false, picks: fallback.map(model => ({ model, text: model.capabilities?.tools === true ? 'Kan bruge kodeværktøjer ifølge kataloget' : 'Understøttelse af kodeværktøjer er ukendt' })) };
  }
  const api = { suggest, newestFirst };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ModelAdvice = api;
})(typeof window === 'object' ? window : globalThis);
