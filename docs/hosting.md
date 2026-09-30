# Hosting og deling af apps

Undersøgt 30. september 2026 som grundlag for en senere milepæl om Del. I dag kræver Del, at Vercel CLI eller Azure CLI er installeret og logget ind. Det er en blindgyde for begyndere. Alle oplysninger har kilder; "ikke verificeret" betyder, at der ikke blev fundet en primær kilde.

Denne side anbefaler ingen udbyder. Om appen må anbefale en hostingudbyder, er ikke afklaret. For AI-udbydere har brugeren besluttet, at appen ikke anbefaler.

## Tre veje for en begynder

1. **Gratis link på nettet:**
   - Tre gratis planer tillader brug i en organisation og kan styres med login i browseren og et upload-API: Netlify, GitHub Pages (kun offentlige repositories) og Cloudflare.
   - De kører på globale netværk fra amerikanske virksomheder, der er certificeret under EU-US Data Privacy Framework.
2. **Egen cloud:** Azure, AWS eller Google Cloud med en vejledning trin for trin. Det kræver abonnement, roller og en budgetalarm. Azure har regionen Denmark East, som åbnede i marts 2026, men hvilke tjenester der findes der, er ikke verificeret.
3. **Pakke til IT-afdelingen:** Et Docker-image med en README, der kan sendes til kommunens IT. Det kan bygges uden Docker Desktop.

## Gratis planer

- **Netlify:**
  - 300 kreditter om måneden. En udgivelse koster 15 kreditter og 1 GB trafik 20.
  - Funktioner, database og eget domæne er med. Kommerciel brug er tilladt, og der kræves intet kort.
  - Funktioner kører i Ohio; regionen kan kun vælges på betalte planer.
  - Kilder: [priser](https://www.netlify.com/pricing/), [gratisplanen](https://www.netlify.com/blog/introducing-netlify-free-plan/) og [funktionernes region](https://docs.netlify.com/build/functions/optional-configuration/).
- **Vercel Hobby:** Planen er kun til "non-commercial, personal use", så en kommune kan ikke bruge den gratis ([Hobby](https://vercel.com/docs/plans/hobby)).
- **GitHub Pages:**
  - Kun statiske filer, højst 1 GB pr. side.
  - Siden kan ikke bruges til en onlineforretning ([grænser](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)).
  - Gratis konti kræver et offentligt repository, og siden er altid offentlig ([Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)).
  - Der er ingen serverkode, database eller hemmeligheder; alt, der sendes til browseren, er offentligt.
- **Cloudflare:**
  - Forespørgsler på statiske filer er gratis og ubegrænsede. Workers giver 100.000 forespørgsler om dagen ([priser](https://developers.cloudflare.com/workers/platform/pricing/)).
  - Data i EU alene kræver Enterprise ([datalokalisering](https://developers.cloudflare.com/data-localization/)).
  - At der ikke kræves kort, og at kommerciel brug er tilladt, har kun en sekundær kilde.
- **Render:** Statiske sider er gratis. Gratis webtjenester går i dvale, og Render skriver "Do not use them for production" ([gratis](https://render.com/docs/free)). Frankfurt findes som region.
- **Heroku:** Ingen gratis plan; den billigste koster 5 USD om måneden ([priser](https://www.heroku.com/pricing)). Heroku får ikke længere nye funktioner.
- **Fly.io:** Kun en prøveperiode, derefter kræves kort ([prøve](https://docs.fly.io/about/free-trial/)).
- **Firebase Spark:** Gratis hosting uden kort. Funktioner kræver den betalte Blaze-plan ([priser](https://firebase.google.com/pricing)).
- **Azure Static Web Apps Free:** Planen er "for personal projects" og har ingen SLA. Oprettelse kræver kort og telefonnummer ([planer](https://learn.microsoft.com/en-us/azure/static-web-apps/plans)).
- **AWS Amplify:** 15 GB trafik om måneden. En konto på gratisplanen lukkes efter 6 måneder uden opgradering ([gratisniveau](https://aws.amazon.com/free/)).
- **Europæiske muligheder med en gratis plan:**
  - [statichost.eu](https://www.statichost.eu/pricing/) fra Sverige: én side, intet kort. Leverandørerne er Hetzner og Bunny ([DPA](https://www.statichost.eu/dpa/)). Vilkår for kommerciel brug er ikke verificeret.
  - Codeberg Pages: kun offentlige repositories med åben licens.
  - Scaleway: kræver kort.

## Udgivelse uden terminal

- **Netlify:**
  - Registrér en OAuth-app. Netlifys eget login er en "ticket"-proces i browseren uden klienthemmelighed.
  - Upload sker med `POST /api/v1/sites` og en ZIP-fil ([API-vejledning](https://docs.netlify.com/api-and-cli-guides/api-guides/get-started-with-api/)).
  - Vi har ikke afprøvet processen med vores egen klient.
- **GitHub:**
  - Login med device flow, som kun kræver klient-ID'et.
  - Filerne sendes med Git Data API, og Pages slås til med `POST /repos/{ejer}/{repo}/pages` ([Pages API](https://docs.github.com/en/rest/pages/pages)).
  - Kræver samme registrerede OAuth-app som sikkerhedskopien.
- **Cloudflare:** Egne OAuth-klienter findes siden juni 2026 og kræver PKCE og domænebekræftelse ([OAuth](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)). Alternativet er et API-token, som brugeren indsætter.
- **Vercel:** OAuth til API-kald er i lukket beta. I dag skal brugeren indsætte et token ([scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions)).
- **Azure, AWS og Google:** Kræver registrering hos organisationen, IAM-roller og ofte samtykke fra en administrator. Det egner sig bedre til en vejledning end til et klik i appen.

## Pakke til IT-afdelingen

**Statisk side:** Brug `nginx-unprivileged`, der kører som en almindelig bruger på port 8080 ([repo](https://github.com/nginx/docker-nginx-unprivileged)). Byg-mappen er `dist/` for Vite-projekter og `public/` for den statiske skabelon:

```dockerfile
FROM nginxinc/nginx-unprivileged:1.30-alpine-slim@sha256:e28dcf0a161ddcbf228c7364b4a14f9bad4763ae8f5317c437b896afa3df4b84
COPY public/ /usr/share/nginx/html/
```

**Node-app:**
- Byg i `node:24-trixie-slim`, og kør i `gcr.io/distroless/nodejs24-debian13:nonroot` med `npm ci --omit=dev` ([distroless](https://github.com/GoogleContainerTools/distroless)).
- Brug en `.dockerignore`, der udelader `node_modules` og hemmeligheder.

**README til IT:**
- ejer og kontakt, image-digest, port og sundhedstjek
- kørsel som almindelig bruger med skrivebeskyttet filsystem ([OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html))
- miljøvariabler uden værdier; data, backup og sletning
- logs til stdout uden personoplysninger
- opdateringsrutine og SBOM (`docker buildx build --sbom=true`)
- GDPR-noter: datakategorier, behandlingsgrundlag og artikel 28, 30 og 35
- en tilgængelighedserklæring for offentlige sider ([lov 692/2018](https://www.retsinformation.dk/eli/lta/2018/692))
- scannere fastlåst til et digest. Trivy blev kompromitteret i februar og marts 2026 ([Aqua](https://www.aquasec.com/blog/trivy-supply-chain-attack-what-you-need-to-know)).

**Bygning uden Docker Desktop:**
- Et statisk image er en basis plus ét lag filer. Det kan laves uden dæmon med `crane append` ([crane](https://github.com/google/go-containerregistry/blob/main/cmd/crane/doc/crane_append.md)).
- Node-apps kan bygges med containerify ([repo](https://github.com/eoftedal/containerify)).
- Docker Desktop kræver et betalt abonnement for offentlige myndigheder ([licens](https://docs.docker.com/subscription/desktop-license/)).

## Danmark og EU

- **Grundlaget for overførsel til USA:**
  - Overførsel af persondata til USA bygger på EU-US Data Privacy Framework fra 2023. Rammen er stadfæstet af Retten i 2025.
  - En appel (C-703/25 P) verserer ([WilmerHale](https://www.wilmerhale.com/en/insights/blogs/wilmerhale-privacy-and-cybersecurity-law/20251201-european-court-of-justice-to-review-challenge-to-eu-us-data-privacy-framework)).
- **Datatilsynets Chromebook-afgørelse:** Datatilsynet gav 29. januar 2026 51 kommuner alvorlig kritik for udokumenterede underdatabehandlere. Afgørelsen er relevant for enhver cloudtjeneste ([afgørelse](https://www.datatilsynet.dk/afgoerelser/afgoerelser/2026/jan/datatilsynet-giver-51-kommuner-alvorlig-kritik-i-chromebook-sag)).
- **Digital suverænitet:** Det er en del af den fællesoffentlige digitaliseringsstrategi for 2026–2029 ([Digitaliseringsstyrelsen](https://en.digst.dk/digital-transformation/digital-suveraenitet/)).
- **Hosting kun i EU:**
  - Gratis: statichost.eu og Codeberg Pages.
  - Betalt: Microsofts EU Data Boundary og AWS European Sovereign Cloud.

## Åbne spørgsmål til brugeren

1. Må appen anbefale en hostingudbyder, eller skal de vises ligestillet som AI-udbyderne?
2. Skal første version af Del være et gratis link (Netlify eller GitHub Pages), en pakke til IT eller begge?
3. Skal Del være en funktion, brugeren selv slår til, sammen med en skill for udgivelse?
