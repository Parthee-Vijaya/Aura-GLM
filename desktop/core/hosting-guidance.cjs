// Dokumentation kontrolleret 15. oktober 2026. Oplysninger om en tjeneste er ikke en vurdering af kundens aftale.
const checkedAt = '2026-10-15';
const options = [
  {
    id: 'vercel', name: 'Vercel', integrated: true,
    summary: 'Amerikansk leverandør. Global levering af frontend; backendens region vælges i projektet.',
    scope: 'Aura kan udgive færdige filer eller kildekode til et eksisterende Vercel-testprojekt.',
    data: 'En EU-region for funktioner omfatter ikke automatisk CDN, logs, support og andre tjenester. Kontrollér projektets databehandleraftale, underleverandører og adgangsbeskyttelse.',
    steps: ['Log ind i Vercel, og vælg et særskilt testprojekt med en eksisterende startversion.', 'Installér Vercel CLI, og log ind på denne computer. Find projektets navn og team.', 'Gem en version i Aura. Udfyld destinationen, gennemgå filerne og godkend udgivelsen. Kontrollér bagefter linket med testpersonen.'],
    links: { guide: 'https://vercel.com/docs', data: 'https://vercel.com/legal/dpa', region: 'https://vercel.com/docs/regions' }
  },
  {
    id: 'azure', name: 'Azure Static Web Apps', integrated: true,
    summary: 'Microsoft. Frontend leveres globalt; en EU-region til API’et er ikke det samme som udelukkende EU-behandling.',
    scope: 'Aura kan udgive en frontend og eventuelt et færdigbygget Node.js Functions-API til et eksisterende testmiljø.',
    data: 'Kontrollér Microsofts databehandleraftale, abonnementets konfiguration, logs og eventuelle tilknyttede tjenester. Et testmiljø er ikke automatisk adgangsbeskyttet.',
    steps: ['Opret eller vælg en Static Web App i jeres Azure-abonnement. Aftal region og adgang med den ansvarlige.', 'Installér Azure CLI og SWA CLI, og log ind. Find appnavn, abonnements-id og ressourcegruppe.', 'Gem en version i Aura. Gennemgå og udgiv til harness-test. Det erstatter tidligere indhold i det testmiljø.'],
    links: { guide: 'https://learn.microsoft.com/en-us/azure/static-web-apps/getting-started', data: 'https://www.microsoft.com/licensing/docs/view/Microsoft-Products-and-Services-Data-Protection-Addendum-DPA', region: 'https://learn.microsoft.com/en-us/azure/static-web-apps/faq' }
  },
  {
    id: 'cloudflare', name: 'Cloudflare Pages', integrated: false,
    summary: 'Amerikansk leverandør. Statiske sider distribueres på et globalt netværk.',
    scope: 'Upload af en færdigbygget hjemmeside hos Cloudflare. Denne vej kører ikke en almindelig Python- eller Node-server.',
    data: 'EU-behandling er ikke garanteret af Pages-navnet eller en gratis konto. Gennemgå databehandleraftale, besøgslogs og adgang til siden.',
    steps: ['Byg hjemmesiden lokalt. Find outputmappen med index.html, fx dist. Brug kun public, hvis den indeholder hele den færdige side.', 'Log ind hos Cloudflare. Vælg Workers & Pages og opret et Pages-projekt med Direct Upload.', 'Upload kun de færdige offentlige filer. Følg guiden, og afprøv det viste link. Direct Upload kan ikke senere skiftes til Git-integration i samme projekt.'],
    links: { guide: 'https://developers.cloudflare.com/pages/get-started/direct-upload/', data: 'https://www.cloudflare.com/cloudflare-customer-dpa/' }
  },
  {
    id: 'netlify', name: 'Netlify Drop', integrated: false,
    summary: 'Amerikansk leverandør. Til deling af færdigbyggede sider på et globalt netværk.',
    scope: 'Manuel upload hos Netlify. Byg React/Astro først; en Python-backend følger ikke med en mappe med frontendfiler.',
    data: 'Kontrollér adgangsbeskyttelse og kontoens databehandleraftale. Netlify Drop er ikke en garanti for behandling alene i EU.',
    steps: ['Byg siden lokalt, og find outputmappen med index.html. Fjern hemmeligheder og private data fra de offentlige filer.', 'Log ind på den konto, der skal eje siden, og brug Netlifys manuelle upload.', 'Upload outputmappen, og åbn det nye link. Kontrollér hvem der kan se siden, og hvordan næste version uploades.'],
    links: { guide: 'https://docs.netlify.com/deploy/create-deploys/', data: 'https://www.netlify.com/trust-center/' }
  },
  {
    id: 'github-pages', name: 'GitHub Pages', integrated: false,
    summary: 'GitHub / Microsoft. Til statiske hjemmesider; ingen Python- eller Node-backend.',
    scope: 'Opsættes i GitHub. Auras sikkerhedskopi af kode udgiver ikke i sig selv en hjemmeside.',
    data: 'Et privat repository gør ikke nødvendigvis Pages-siden privat. EU-behandling er ikke verificeret her. Gennemgå den aftale og de adgangsmuligheder, der gælder for jeres konto.',
    steps: ['Gem koden i det repository, der skal eje siden. Gennemgå indholdet før upload.', 'Vælg Settings → Pages på GitHub, og følg guiden til den relevante branch eller buildopsætning. GitHub Actions må kun aktiveres med din godkendelse.', 'Afprøv det udgivne link, billeder og navigation. Kontrollér adgangen særskilt fra repositoryets adgang.'],
    links: { guide: 'https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages', data: 'https://github.com/customer-terms/github-data-protection-agreement' }
  },
  {
    id: 'komplai', name: 'Komplai Publish', integrated: false,
    summary: 'Organisationens Komplai-miljø. Region og adgang følger den konkrete hostingaftale.',
    scope: 'Komplai har en særskilt udgivelsesadgang til færdige HTML/ZIP-apps. Den er ikke tilsluttet Auras udgivelsesknap endnu.',
    data: 'Komplai-login til AI giver ikke automatisk ret til hosting. Kontrollér miljøets databehandleraftale og underleverandører hos jeres administrator. Aktuel hosting og adgang er ikke kontrolleret af Aura.',
    steps: ['Bed administratoren om adgang til Komplai Publish. Opret eller vælg en app under Jeres apps.', 'Aftal om appen skal være offentlig eller kun synlig for organisationen. Brug Komplais egen udgivelsesvejledning og en særskilt adgang til netop appen.', 'Den undersøgte uploadvej modtager færdig HTML eller ZIP med index.html. Den kører ikke Python/Node-backends; afklar sådanne behov særskilt.'],
    links: { guide: 'https://app.komplai.dk/' }
  },
  {
    id: 'promte', name: 'Promte Apps', integrated: false,
    summary: 'Promte oplyser EU-hosting eller eget miljø. Den konkrete opsætning skal bekræftes af organisationen.',
    scope: 'Promte beskriver upload af egne AI-apps. Aura har endnu ingen uploadintegration til Promte.',
    data: 'Aftal databehandling, AI-modtagere, adgang og drift med Promte og jeres administrator. Produktets sikkerhedsbeskrivelse er ikke en godkendelse af den app, I bygger.',
    steps: ['Kontrollér, at jeres Promte-aftale omfatter egne apps, og få adgang til den relevante opsætning.', 'Læs Promtes krav til appen og dens AI-forbindelser, før koden tilpasses. Importformat og understøttelse af egen backend skal afklares.', 'Upload gennem Promtes forløb, og kontrollér det delte link med en bruger, der har den tilsigtede adgang.'],
    links: { guide: 'https://promte.com/blog/byg-dine-egne-ai-apps-vi-hoster-dem', data: 'https://docs.promte.com/GDPR-hosting-og-databehandling-1a79a6ea8b0a80e2bc04f4e2b41bab42' }
  }
];
function catalog() { return options.map(option => ({ ...option, checkedAt })); }
function link(id, kind) {
  const option = options.find(item => item.id === id);
  if (!option || !['guide', 'data', 'region'].includes(kind) || !option.links[kind]) throw Error('Denne hostingvejledning findes ikke.');
  return option.links[kind];
}
function guidance(enabled) {
  const entry = enabled ? 'Auras knap Del står øverst i projektet og åbner Udgiv til test. Den findes; bed ikke brugeren undersøge, om appen har en Del-knap.' : 'Deling er slået fra. Brugeren kan slå den til under Indstillinger → Funktioner. Forklar gerne mulighederne, men udgiv ikke.';
  return `${entry}\nIndbygget upload: Vercel og Azure Static Web Apps. Begge kræver eksisterende konto, projekt og lokalt login i deres CLI. Vercel kræver en startversion; Aura opretter ikke ressourcer eller konti. Sikkerhedskopi til GitHub deler kode, ikke et kørende testlink.\nUnder Andre steder at udgive findes vejledninger til Cloudflare Pages, Netlify Drop, GitHub Pages, Komplai Publish og Promte Apps. De vejledninger er ikke uploadintegrationer. Afklar frontend, backend, database, AI-modtagere og adgang før valg. Almindelige Python/Node-servere kan ikke udgives som statiske filer.\n${options.filter(o => !o.integrated).map(o => `${o.name}: ${o.scope}`).join('\n')}\nOplys ikke, at hosting er gratis eller udelukkende i EU uden at kontrollere de aktuelle vilkår og den konkrete opsætning. Region, leverandørens hjemland, CDN, logs og databehandleraftale er forskellige forhold. Brugeren godkender upload, adgang og omkostninger; du må ikke udgive fra agentens kommandoværktøj.`;
}
module.exports = { catalog, link, guidance };
