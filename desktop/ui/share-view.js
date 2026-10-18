(function (root, factory) {
  const view = factory();
  if (typeof module === 'object' && module.exports) module.exports = view;
  else root.ShareView = view;
})(typeof globalThis === 'object' ? globalThis : this, () => {
  const time = at => at && Number.isFinite(Date.parse(at)) ? new Date(at).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : 'tidspunkt ikke registreret';
  const version = r => `${r.version?.name || 'Gemt version'} · ${time(r.version?.at)}`;
  const provider = name => name === 'komplai' ? 'komplai Publish' : name === 'azure' ? 'Azure Static Web Apps' : 'Vercel';
  const states = { SUBMITTING: 'Upload påbegyndt; udfald endnu ikke bekræftet', UNKNOWN: 'Upload ikke bekræftet', QUEUED: 'I kø', BUILDING: 'Bygger', INITIALIZING: 'Forbereder', UPLOADED: 'Uploadsvaret er modtaget', READY: 'Udgivet ifølge udbyderen', ERROR: 'Fejl hos udbyderen', CANCELED: 'Annulleret hos udbyderen', AWAITING_UPDATE: 'Den nye version er endnu ikke bekræftet', REPLACED: 'En nyere version er udgivet siden', UNPUBLISHED: 'Appen er ikke udgivet lige nu', REMOVED: 'Appen er slettet hos komplai' };
  const host = value => { try { return new URL(value).hostname; } catch { return ''; } };
  function destination(r) {
    if (r.config.provider === 'komplai') return `komplai Publish · ${r.target.owner || 'organisation'} · ${host(r.url) || host(r.target.url) || r.target.host}`;
    return `${provider(r.config.provider)} · ${r.config.provider === 'azure' ? `${r.config.subscription || 'abonnement ikke registreret'} / ${r.config.group || 'ressourcegruppe ikke registreret'}` : r.config.scope || r.target.owner || 'konto fra login'} · ${r.target.name || r.config.project} · ${r.config.provider === 'azure' ? 'harness-test' : 'preview'}`; }
  function checks(r) {
    const c = r.checks;
    let site = 'Ikke kontrolleret', content = 'Ikke kontrolleret';
    if (c?.site.status === 'unreachable') site = 'Adressen kunne ikke nås';
    if (c?.site.status === 'answered') {
      const http = c.site.http;
      site = `${http === 401 || http === 403 ? 'Kræver adgang' : http >= 300 && http < 400 ? 'Viderestiller' : http >= 200 && http < 300 ? 'Svar modtaget' : 'Fejlsvar'} · HTTP ${http} uden login`;
    }
    const contents = { matched: 'Startsiden matcher den godkendte fil', different: 'Startsiden matcher ikke den godkendte fil', built: 'Bygges hos udbyderen; filmatch er ikke kontrolleret', 'too-large': 'Svaret er for stort til filkontrollen', unreadable: 'Indholdet kunne ikke læses' };
    content = contents[c?.content.status] || content;
    const komplai = r.config.provider === 'komplai';
    const visibility = c?.provider.status === 'checked' ? c.provider.visibility : null;
    const access = visibility === 'private' ? 'Kun organisationens medlemmer efter login med komplai' : visibility === 'public' ? 'Alle med linket' : null;
    return [
      ['Udbyder', c?.provider.status === 'unknown' ? `Seneste statuskontrol mislykkedes · ${time(c.at)}` : `${states[r.state] || 'Ukendt udbyderstatus'}${c ? ` · ${time(c.at)}` : r.checkedAt ? ' · tidligere registreret; genkontrollér' : ['UNKNOWN', 'SUBMITTING'].includes(r.state) ? ' · registreret lokalt' : ' · fra uploadsvaret'}`],
      ...(komplai ? [['Aktuel adgang', access ? `${access} ifølge komplai.${visibility !== r.config.visibility ? ' Det afviger fra dit valg ved upload.' : ''}` : 'Ikke kontrolleret. Åbn appen i komplai for at se den aktuelle adgang.']] : []),
      ['Startside', site], ['Indhold', content],
      ['Testerens adgang', komplai && visibility === 'private' ? 'Ikke afprøvet. Bed en kollega i organisationen åbne linket; et svar fra startsiden beviser ikke adgang til resten af appen.' : 'Ikke afprøvet. Åbn linket som testpersonen; et svar fra startsiden beviser ikke adgang til resten af appen.']
    ];
  }
  const scope = c => c?.copyCount ? `Deling bruger projektets gemte version. ${c.copyCount === 1 ? 'En samtalekopi er' : `${c.copyCount} samtalekopier er`} endnu ikke flettet ind og kommer ikke med. Vælg Flet ind i projektet, hvis rettelserne skal med.` : 'Deling bruger projektets gemte version. Ugemte rettelser kommer ikke med.';
  return { time, version, provider, destination, checks, scope };
});
