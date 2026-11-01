// Én statusafledning for samtalen. Ren funktion af view-tilstanden: ingen DOM, ingen globale
// værdier — så alle forbrugere (badge, statuslinje, sidepanel, arbejdskort) rammes af de samme
// regler. Prioritet: venter på dig → gendannelse → arbejde → seneste afslutning → klar.
// Afslutningen læses af view'ets seneste resultatkort (lastReview) og gælder kun, når turen
// er den, kortet handler om; en gammel afslutning må aldrig overstyre en ny tur.
(function (root) {
  const KEYS = Object.freeze(['idle', 'working', 'waiting', 'recovering', 'done', 'stopped', 'error']);
  function derive(v) {
    if (!v) return { key: 'idle', label: 'Klar', detail: '' };
    if (v.running) {
      if (Array.isArray(v.waitingFor) && v.waitingFor.length) return { key: 'waiting', label: 'Venter på dig', detail: v.waitingFor[0]?.title || '' };
      if (v.recovery) return { key: 'recovering', label: 'Gendanner forbindelsen', detail: typeof v.recovery === 'string' ? v.recovery : '' };
      return { key: 'working', label: v.runLabel || 'Arbejder', detail: v.statusDetail || '' };
    }
    const review = v.lastReview;
    if (review) {
      if (review.status === 'error') return { key: 'error', label: 'Fejl', detail: review.failure?.kind === 'timeout' ? 'Tidsgrænsen blev nået' : '' };
      if (review.status === 'stopped') return { key: 'stopped', label: 'Stoppet', detail: '' };
      if (review.status === 'rejected') return { key: 'stopped', label: 'Afbrudt', detail: '' };
      if (review.status === 'completed') return { key: 'done', label: 'Færdig', detail: '' };
    }
    return { key: 'idle', label: v.runLabel || 'Klar', detail: '' };
  }
  // Badge-klassen følger tilstanden, ikke teksten: 'Stoppet' er aldrig en fejl, 'Venter' er aldrig stoppet.
  const BADGE = Object.freeze({ idle: 'run-idle', working: 'run-working', waiting: 'run-working', recovering: 'run-working', done: 'run-idle', stopped: 'run-stopped', error: 'run-error' });
  function badgeClass(state) { return BADGE[derive(state).key] || 'run-idle'; }
  const api = { derive, badgeClass, KEYS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RunState = api;
})(typeof window === 'object' ? window : globalThis);
