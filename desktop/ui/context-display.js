// Senest målte modelkald, aldrig en beregning ud fra samtalens samlede tokens.
// D5b: formateringen (den gamle "Kontekst ukendt"-linje) er afløst af
// ui/status-line.js, som bruger project() og gør resten af linjen.
(() => {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const windowSize = value => Number.isSafeInteger(value) && value > 0 ? value : null;
  function project(selected = {}, snapshot = null, model = null, catalogConnectionID = selected.connectionID) {
    const binding = snapshot?.binding;
    const matched = Boolean(binding && selected.connectionID && selected.modelID &&
      ['connectionID', 'modelID', 'routeID'].every(key => binding[key] === (selected[key] || '')) &&
      typeof binding.sessionID === 'string' && binding.sessionID && typeof binding.engineID === 'string' && binding.engineID);
    const input = matched && snapshot?.known === true && snapshot.source === 'engine-step-finish' && snapshot.reliability === 'last-request' ? count(snapshot.inputTokens) : null;
    const measuredWindow = matched ? windowSize(snapshot?.windowTokens) : null;
    const limit = measuredWindow ?? (catalogConnectionID === selected.connectionID ? windowSize(model?.limits?.context) : null);
    const percentage = input !== null && measuredWindow !== null ? input / measuredWindow * 100 : null;
    return { inputTokens: input, windowTokens: limit, percentage: Number.isFinite(percentage) ? percentage : null };
  }
  const api = { project };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ContextDisplay = api;
})();
