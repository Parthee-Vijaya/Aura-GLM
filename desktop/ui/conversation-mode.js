// Deles af hovedproces og brugerflade. En anbefaling giver aldrig adgang til at ændre filer.
(root => {
  const markers = ['<!-- aura:offer-plan -->', '<!-- aura:stay -->'];
  function visible(text) {
    text = String(text || '');
    // Skjul også en delvis slutmarkør under streaming. Kodeeksempler inde i svaret bevares.
    const start = text.lastIndexOf('\n') + 1, line = text.slice(start).trimEnd();
    if (text.slice(0, start).split('\n').filter(line => /^\s*```/.test(line)).length % 2) return text;
    if (line && markers.some(marker => marker.startsWith(line) || line === marker)) return text.slice(0, start).trimEnd();
    return text;
  }
  function action(text) {
    const lines = String(text || '').trimEnd().split('\n'), line = lines.at(-1);
    if (lines.slice(0, -1).filter(line => /^\s*```/.test(line)).length % 2) return null;
    return line === markers[0] ? 'plan' : line === markers[1] ? 'stay' : null;
  }
  function concretePlan(text) {
    const parsed = (typeof module === 'object' && module.exports ? require('./plan-view.js') : root.PlanView).parsePlan(visible(text));
    return ['bygger', 'design', 'teknik', 'proev'].every(key => parsed.sections.some(section => section.key === key && section.body.trim()));
  }
  const rules = `SAMTALE OG VALG: Følg brugerens aktuelle hensigt. En almindelig samtale eller et spørgsmål skal besvares direkte uden byggeplan, statusrapport eller prøvevejledning. Et nej til at bygge er ikke en godkendt plan. Ved et nej: anerkend det kort, afslut med slutmarkøren <!-- aura:stay --> på sin egen linje, og foreslå ikke bygning igen. I Samtale må du læse relevante projektfiler, men ikke ændre filer eller køre kommandoer. Hvis brugeren viser konkret interesse for en løsning og en plan ville være nyttig, kan du én gang foreslå at planlægge den og afslutte med <!-- aura:offer-plan --> på sin egen linje. Markøren giver kun en knap; brugeren vælger selv. Brug aldrig disse slutmarkører i kodeblokke. Kun i Planlæg skriver du selve planen under de fire overskrifter Det bygger vi, Sådan skal det se ud, Teknik og data, Det skal du prøve. Mangler afklaring, svar uden en plan. Filændringer kræver, at brugeren har valgt Byg eller Arbejd direkte.`;
  const api = { visible, action, concretePlan, rules };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.ConversationMode = api;
})(typeof window === 'object' ? window : globalThis);
