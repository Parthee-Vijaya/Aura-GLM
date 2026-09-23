# AI Harness · desktop, POC 2

Dansk desktop-app med lokale arbejdsområder, kodeagent, modelvalg, skills, genbrugelige designpakker og forhåndsvisning. OpenCode 1.17.15 er den første agentadapter. Modellen kan køre på egen maskine, egen server eller hos en ekstern udbyder; projektfiler og agentprocessen kører fortsat lokalt.

## Start fra kildekoden

Kræver Node.js 22.12 eller nyere, npm og en eksisterende OpenCode-installation i præcis version 1.17.15. Appen søger i `~/.opencode/bin/`, på PATH eller i `HARNESS_OPENCODE_PATH`. Den installerer eller opgraderer ikke OpenCode. Kør fra `desktop/`:

```bash
npm ci
npm start
```

Der er endnu ingen signerede installationspakker. Windows og macOS er målplatforme; kun macOS er afprøvet. Electron kan kræve netadgang ved installation.

## Brugerrejse

1. Opret et projekt eller åbn en eksisterende eller tom mappe. Åbning kræver ikke `harness.json` og ændrer ingen projektfiler. Et ugyldigt manifest giver en advarsel.
2. Ved oprettelse kan du vælge farve, logo, links og referencefiler. Gem dem som en navngiven **designpakke** og vælg pakken igen ved et senere projekt. Biblioteket gemmer egne kopier lokalt i appens datamappe; flyttede originalfiler bryder derfor ikke pakken. Gentofte-adressen er kun et eksempel i inputfeltet og bliver ikke automatisk tilføjet. Pakker synkroniseres ikke mellem computere og opdaterer ikke allerede oprettede projekter.
3. Åbn **Forbindelser**, vælg type, adresse og eventuel API-nøgle. **Test / hent modeller** kontrollerer kataloget; det beviser ikke, at modellen kan bruge kodeværktøjer. Vælg derefter model i arbejdsområdet. OpenRouter kræver en konkret underleverandør og bruger ingen automatisk fallback.
4. Gennemse **Skills og regler**. Aktive instruktioner kan redigeres, deaktiveres og gendannes pr. projekt. API-nøgler hører til forbindelser, aldrig i skills. Skills er modelinstruktioner; tekniske tilladelser er adskilt.
5. Skriv en opgave. Før første afsendelse og ved ændrede vilkår, model, skills eller referencer viser appen modtagere, pris, behandlingssted, opbevaring, træning og dokumentationsgrundlag. Ukendte oplysninger vises som ukendte. Referencefiler vælges særskilt; links kan besøges via godkendte webopslag, inklusive relevante undersider.
6. Gennemgå filændringer, kommandoer og webopslag, når agenten beder om tilladelse. **Stop** afbryder opgaven. **Ændringer** viser tekstindhold før og efter; oversigten kan også indeholde samtidige manuelle ændringer.
7. En `public/index.html` vises automatisk. Under **Server** kan du tilslutte en allerede startet loopback-udviklingsserver. Ingen kommando køres ved projektåbning eller tilslutning. Manglende preview blokerer ikke chatten.

## Moduler og data

- `core/projects.cjs`: lokale mapper og kompatibilitet med `harness.json`, version 1.
- `core/designs.cjs`: genbrug af designmateriale uden modelkald. Kopier i appdata er almindelige lokale filer, ikke krypteret dokumentlagring.
- `core/workbench.cjs`: forbindelsesvalg, datagennemgang og sessioner; agentmotoren kan udskiftes via `engineFactory`.
- `core/connections.cjs`: normalisering, modelkatalog, egenskaber, leverandørrouting, dataoplysninger og motorkonfiguration. Anthropic Messages samt OpenAI-kompatible Chat Completions er implementeret. Responses-only modeller og modeller uden brugbare værktøjskald er ikke generelt understøttet; katalogsynlighed er ikke kompatibilitetsbevis.
- `core/engine.cjs`: versionskontrol, adgangskodebeskyttet loopback-server, sessionsstream, stop og godkendelser. Motoren får isolerede konfigurations-/datamapper; brugerens OpenCode-opsætning overskrives ikke. Effektive tilladelser kontrolleres før start. Automatisk deling, snapshots, plugins, MCP og eksterne skills er slået fra.
- `core/gateway.cjs`: autentificeret loopback-forbindelse mellem motor og valgt model. Den rigtige udbydernøgle bliver i hovedprocessen; motoren får en midlertidig nøgle. Ingen reserveudbyder eller automatisk ændring til en anden model.
- `core/store.cjs`: modelvalg, skills og indstillinger under Electrons `userData/harness`, uden for repositoryet. Modelnøgler krypteres med Electron `safeStorage`; appen afviser lagring, hvis kryptering ikke er tilgængelig. Lokalt samtale-/værktøjsindhold gemmes af OpenCode i samme appområde. Der er endnu ingen automatisk slettefrist eller historikbrowser.
- `core/skills.cjs` og `../profiles/skills/`: synlige danske instruktioner om mål, Git, nøgler, test og designresearch; de fælles grundregler vises også som en redigerbar skill.
- `core/preview.cjs`, `core/changes.cjs`: lokal visning og tekstbaseret ændringsoversigt med størrelsesgrænser.
- `main.cjs`, `preload.cjs`, `ui/`: validerede native handlinger, begrænset IPC-bro og brugerflade uden Node-adgang.

## Begrænsninger

Agenten er **ikke en OS-sandbox**. Godkendte kommandoer kan bruge den indloggede brugers rettigheder, læse filer og kontakte andre tjenester. Kendte hemmelighedsfiler og ikke-valgte referencer afvises i læseværktøjet; dette er ikke en garanti mod adgang gennem andre godkendte værktøjer. Gennemgå den konkrete handling. Redigerbare skills kan ikke ophæve agentens tekniske tilladelser.

Previewets renderer har ikke Node-/IPC-adgang. Statisk preview serverer kun almindelige filer under `public/`, afviser skjulte filer og symbolske links og blokerer eksternt netværk. Tilsluttet udviklingsserver tillader sin egen origin og WebSocket-forbindelse, men ikke andre tjenester. Serverens egne indlejringsregler bevares. Nogle apps kræver derfor yderligere integration. Filkontrollen beskytter ikke mod en anden lokal proces, der udskifter mapper under læsning. Brug betroede projektmapper.

Statisk preview genindlæser ved filændringer; det er ikke rammespecifik HMR. Filgrænsen er 10 MB. Ændringsoversigten udelader afhængigheder, kendte hemmelighedsfiler, referencer, binære/store filer og overstiger ikke 1.000 tekstfiler/10 MB samlet. Filnavne alene identificerer ikke alle hemmeligheder.

DGX Spark bruger **Egen server / DGX Spark** med den faktiske Tailscale-adresse, port og kompatible modeltjeneste. Appen ændrer ikke Tailscale eller serveren. Adresse og netværk fortæller ikke i sig selv, hvor modellen behandler data eller om den videresender til cloud.

Cloud-arbejdsområder, kommunale rettighedspolitikker, automatisk npm-/Docker-opsætning, hostingadaptere og Git-handlinger er ikke tilsluttet. Modelplacering og arbejdsområdets placering er separate valg i arkitekturen; denne version tilbyder kun lokale arbejdsområder. En cloud-implementering kræver et aftalt host-/loginmodul og håndhævelse af kommunens rettigheder. Azure er ikke valgt som obligatorisk destination. Claude-abonnement er utilgængeligt; Anthropic API-nøgle er den implementerede forbindelsesvej.

## Afprøvning

Kør fra `desktop/`:

```bash
npm test
npm run test:desktop
npm run test:agent
npm run test:chat
```

Desktop- og chattest kræver en grafisk session. Agent- og chattest kræver den installerede OpenCode 1.17.15. Native dialogers svar simuleres med isolerede teststier; operativsystemets dialogbetjening skal afprøves manuelt. Integrationstestene bruger en kontrolleret lokal modelserver, rigtige filer og rigtige OpenCode-værktøjer. Testmapper/skærmbilleder bevares under systemets midlertidige mappe, og stierne udskrives.

Den valgfrie webkontrol bruger en lokal testmodel, men lader den rigtige agents webværktøj hente Gentofte-guidens offentlige forside og underside:

```bash
node scripts/verify-design-web.cjs
```

Den særskilte eksterne modelprøve sender kun syntetisk projektmateriale og offentlige regler til Zen-modellen `big-pickle`, uden API-nøgle. Kontrollér aktuelle vilkår før en ny kørsel; den indgår ikke i standardtestene:

```bash
npm run test:live
```

## Verifikationsstatus · 23. september 2026

- **Skrevet og automatisk testet:** mapper uden manifest, designbibliotek, krypteringsfejl, projektspecifikke skills, stop under motoropstart, serveradresser, ukendte vilkår og låst routing. 12 tests består.
- **Afprøvet på konkret materiale:** macOS/Electron 44.4.4, genåbning, rigtigt preview og designpakke genbrugt efter genstart og sletning af originaler. OpenCode 1.17.15 gennemførte en rigtig filændring med kontrolleret modelserver, godkendelse, afvisning og stop. Den samlede desktop-chatrejse består også: modelvalg, datagennemgang, streaming, godkendt filændring, preview, ændringsoversigt og skill-redigering. Genåbning bevarer modelvalg, og tilslutning til en eksisterende udviklingsserver er afprøvet. OpenCodes webværktøj hentede Gentofte-guidens forside og en relevant underside gennem godkendelser med en kontrolleret testmodel. Electron safeStorage blev afprøvet med en syntetisk nøgle; hverken rendererens forbindelsesdata eller indstillingsfilen indeholdt nøglen i klartekst.
- **Ekstern prøve:** Zen-kataloget svarede, men modelkaldet uden nøgle blev afvist med HTTP 403. En vellykket ekstern AI-genereret kodeændring er derfor ikke verificeret. Ingen anden model eller betalingsvej blev forsøgt som fallback.
- **Ikke verificeret:** Windows, brugerens faktiske providerkonti, Ollama, DGX Spark/Tailscale, en rigtig AI-models selvstændige fortolkning af designguiden samt cloud-arbejdsområder. Ingen installationer er pakket, deployet eller observeret i drift.

Kilder: [OpenCode server](https://opencode.ai/docs/server/), [Zen-vilkår](https://opencode.ai/docs/en/zen/#privacy), [OpenRouter og databehandling](https://openrouter.ai/docs/guides/privacy/provider-logging), [Anthropic og træning](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). Datavisningen er leverandøroplysninger og eksplicitte ukendte forhold, ikke en juridisk eller teknisk sikkerhedsgodkendelse.
