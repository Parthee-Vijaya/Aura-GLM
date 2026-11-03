// Én statuslinje under composeren (D5b §7): kontekst · tok/s · tokens · pris.
// Parthees format: altid alle fire felter; manglende data viser 0 — aldrig
// »ukendt« og aldrig en udeladt del (Codex-varianten). Nuancerne står i det
// ærlige tooltip, som deler målekvalifikation, hastighedens dækning, R9 og
// prisgrundlag. Bag tok/s står D5a-registraturets indholdsfrie DTO; 0 er en
// visningsværdi, når der endnu ikke findes en kvalificeret måling.
(() => {
  const number = (value, digits = 0) => Number(value).toLocaleString('da-DK', { maximumFractionDigits: digits });
  const plain = (value, digits = 0) => Number.isFinite(value) && value >= 0 ? value.toLocaleString('da-DK', { maximumFractionDigits: digits }) : null;
  const price2 = value => Number.isFinite(value) && value >= 0 ? value.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  // opencode-forkortelsen i dansk talformat: under 1.000 som hele tal, ellers
  // k/M med højst én decimal og uden afsluttende ,0 (12k, 79,8k, 1M, 1,5M).
  function shortTokens(value) {
    if (!Number.isFinite(value) || value < 0) return '0';
    if (value < 1000) return String(Math.round(value));
    if (value < 999950) return (value / 1000).toLocaleString('da-DK', { maximumFractionDigits: 1 }) + 'k';
    return (value / 1e6).toLocaleString('da-DK', { maximumFractionDigits: 1 }) + 'M';
  }
  function contextField(selected, value) {
    if (!selected || typeof selected.modelID !== 'string' || !selected.modelID) return '0/0';
    const input = Number.isFinite(value?.inputTokens) && value.inputTokens >= 0 ? value.inputTokens : 0;
    const window = Number.isFinite(value?.windowTokens) && value.windowTokens > 0 ? value.windowTokens : null;
    if (window === null) return shortTokens(input); // intet vindue: tal uden /vindue og uden procent
    const percentage = Number.isFinite(value?.percentage) && value.percentage >= 0 ? Math.round(value.percentage) : 0;
    return `${shortTokens(input)}/${shortTokens(window)} (${percentage}%)`;
  }
  function speedField(speed) {
    const value = speed && speed.known === true && Number.isSafeInteger(speed.value) && speed.value >= 0 ? speed.value : 0;
    return `${number(value)} tok/s`;
  }
  function tokensField(usage) {
    const total = usage && Number.isSafeInteger(usage.calls) && usage.calls > 0
      ? (usage.input || 0) + (usage.cacheRead || 0) + (usage.cacheWrite || 0) + (usage.output || 0) + (usage.reasoning || 0)
      : 0;
    return `${number(total)} tokens`;
  }
  // Prisen er et overslag: USD først, derefter DKK — ingen stiltiende omregning.
  // Kald uden prisliste markerer beløbet med *; lokal Ollama koster reelt $0,00.
  function priceField(usage, local) {
    const calls = Number.isSafeInteger(usage?.calls) && usage.calls >= 0 ? usage.calls : 0;
    const unpriced = Number.isSafeInteger(usage?.unpriced) && usage.unpriced >= 0 ? usage.unpriced : 0;
    const otherCalls = Number.isSafeInteger(usage?.otherCalls) && usage.otherCalls >= 0 ? usage.otherCalls : 0;
    const parts = [];
    const usd = Number.isFinite(usage?.cost) && usage.cost >= 0 ? usage.cost : 0;
    if (calls - unpriced - otherCalls > 0) parts.push(usd > 0 && usd < 0.01 ? '<$0,01' : `$${price2(usd)}`);
    const dkk = Number.isFinite(usage?.otherCosts?.DKK) ? usage.otherCosts.DKK : null;
    if (dkk !== null && dkk >= 0 && otherCalls > 0) parts.push(dkk > 0 && dkk < 0.01 ? '<0,01 kr.' : `${price2(dkk)} kr.`);
    if (!parts.length) parts.push('$0,00');
    return parts.join(' + ') + (unpriced > 0 && !local ? '*' : '');
  }
  function tooltipLines({ selected, connection, modelName, contextValue, usage, speed }) {
    const lines = [];
    const chosen = Boolean(selected && selected.modelID);
    const input = Number.isFinite(contextValue?.inputTokens) && contextValue.inputTokens >= 0 ? contextValue.inputTokens : null;
    const window = Number.isFinite(contextValue?.windowTokens) && contextValue.windowTokens > 0 ? contextValue.windowTokens : null;
    if (chosen) {
      lines.push(input === null
        ? 'Kontekst: afventer den seneste måling. Tal i linjen er visningsværdi, ikke en måling.'
        : `Kontekst: ${number(input)} tokens input inklusive cache i det senest afsluttede modelkald — ikke samtalens samlede forbrug. Værktøjer og senere beskeder kan ændre konteksten.`);
      lines.push(window === null
        ? 'Kataloget oplyser intet kontekstvindue for modellen.'
        : `Oplyst kontekstvindue: ${number(window)} tokens. Procenten er målt mod modellens kapacitet, ikke mod Auras arbejdsgrænse.`);
    } else lines.push('Vælg en AI, før kontekst og hastighed kan måles.');
    if (chosen) lines.push(`Målt på ${modelName || selected.modelID}${connection?.name ? ` hos ${connection.name}` : ''}.`);
    if (speed && speed.known === true && Number.isSafeInteger(speed.value)) {
      lines.push(`Observeret svarhastighed (inkl. ræsonnement, ekskl. værktøjstid): ${number(speed.value)} tok/s i den seneste tur — målt over ${number(speed.stepCount || 0)} trin.`);
      if (Number.isSafeInteger(speed.ttftMs) && speed.ttftMs >= 0) lines.push(`TTFT: ${number(speed.ttftMs)} ms.`);
    } else lines.push('Afventer første gyldige hastighedsmåling. 0 er visningsværdi.');
    const calls = Number.isSafeInteger(usage?.calls) && usage.calls >= 0 ? usage.calls : 0;
    if (calls) {
      lines.push(`Forbrug i samtalen: ${number(calls)} modelkald. Ind: ${number(usage.input || 0)} nye, ${number(usage.cacheRead || 0)} fra cache og ${number(usage.cacheWrite || 0)} skrevet til cache. Ud: ${number(usage.output || 0)} svar og ${number(usage.reasoning || 0)} ræsonnement.`);
    } else lines.push('Ingen modelkald i denne samtale endnu.');
    if (connection?.kind === 'ollama') lines.push('Ingen API-omkostning for lokal kørsel.');
    else if (Number.isSafeInteger(usage?.unpriced) && usage.unpriced > 0) lines.push(`${number(usage.unpriced)} kald mangler prisdata; beløbet dækker prissatte kald.`);
    lines.push('Prisen er et overslag ud fra udbyderens listepris og kan afvige fra din faktura; se det faktiske forbrug hos udbyderen.');
    return lines;
  }
  function format(input = {}) {
    const local = input?.connection?.kind === 'ollama';
    return {
      context: contextField(input.selected, input.contextValue),
      speed: speedField(input.speed),
      tokens: tokensField(input.usage),
      price: priceField(input.usage, local),
      tooltip: tooltipLines(input),
    };
  }
  const api = { format, shortTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.StatusLine = api;
})();
