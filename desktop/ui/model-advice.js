// Modelkort pr. udbyder. AI Harness anbefaler ikke udbydere eller modeller. Første kort er udbyderens eget udgangspunkt,
// som udbyderen selv angiver det i sin dokumentation; det bruges som standard og kan skiftes med ét klik.
// Teksterne er faktuelle. Kontrolleret hos udbyderne 29. september 2026. Bruges af brugerfladen og af unit-testene.
(function (root) {
  const advice = {
    // Anthropic: "If you're unsure which model to use, start with Claude Opus 5.5" (platform.claude.com/docs/en/about-claude/models/overview).
    anthropic: [[/opus/i, 'Anthropics eget udgangspunkt'], [/sonnet/i, 'Hurtigere og billigere end Opus'], [/haiku/i, 'Hurtigst og billigst']],
    // Mistral udfasede Devstral 31. juli 2026 og peger på Mistral Medium 3.5 til agenter og kode. Codestral er lavet til kodeforslag.
    mistral: [[/^mistral-medium-(latest|3-5)/i, 'Mistrals model til agenter og kode'], [/^mistral-large-(latest|2512)/i, 'Mistrals store model · billigere pr. token'], [/devstral/i, 'Mistrals ældre kodemodel']],
    corti: [[/^corti-s1$/i, 'Cortis hovedmodel'], [/^corti-s1-mini$/i, 'Mindre og billigere'], [/s1/i, 'Cortis model i EU']],
    openrouter: [[/claude.*(opus|sonnet)/i, 'Claude gennem OpenRouter'], [/devstral|codestral|mistral-medium/i, 'Mistral gennem OpenRouter'], [/qwen.*coder/i, 'Åben kodemodel gennem OpenRouter']],
    // Zens gratis modeller virker kun fra OpenCodes egne programmer.
    zen: [[/^claude-opus/i, 'Claude gennem OpenCode Zen'], [/^claude-sonnet/i, 'Claude gennem OpenCode Zen']]
  };
  // Standardindsats for Anthropics nuværende modeller, når appen ikke selv vælger en. OpenCode sender ingen indsats, så API'ets standard gælder.
  const efforts = [[/^claude-fable-5/, 'høj'], [/^claude-opus-5-5/, 'mellem'], [/^claude-sonnet-5-5/, 'høj']];
  function effort(kind, id) { if (!['anthropic', 'zen', 'openrouter'].includes(kind)) return null; const bare = String(id).replace(/^anthropic\//, ''); return efforts.find(([pattern]) => pattern.test(bare))?.[1] || null; }
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
  const api = { suggest, newestFirst, effort };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ModelAdvice = api;
})(typeof window === 'object' ? window : globalThis);
