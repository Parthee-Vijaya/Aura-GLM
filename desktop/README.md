# AI Harness · desktop, POC 2

Dansk desktop-app med lokale arbejdsområder, kodeagent, modelvalg, skills, genbrugelige designpakker og forhåndsvisning. OpenCode 1.17.15 er den første agentadapter. Modellen kan køre på egen maskine, egen server eller hos en ekstern udbyder; projektfiler og agentprocessen kører fortsat lokalt.

## Start fra kildekoden

Kræver Node.js 22.12 eller nyere, npm og en eksisterende OpenCode-installation i præcis version 1.17.15. Appen søger i `~/.opencode/bin/`, på PATH eller i `HARNESS_OPENCODE_PATH`. Den installerer eller opgraderer ikke OpenCode. Kør fra `desktop/`:

```bash
npm ci
npm start
```

Der er endnu ingen signerede installationspakker. Windows og macOS er målplatforme; kun macOS er afprøvet. Electron kan kræve netadgang ved installation.

Appens navn og egne menuer er **AI Harness**. Under `npm start` bruges stadig udviklingsprogrammet `Electron.app` på macOS; systemets Dock, procesvisning og visse systemdialoger kan derfor fortsat vise Electron. Fuld systemnavngivning kræver en pakket app med egne bundle-oplysninger. Der ændres ikke i den installerede Electron-afhængighed. Navneskiftet bevarer eksisterende data- og sessionsmapper.

## Opstart og forbindelser

Appen starter på **Opsætning** med status for det lokale arbejdsområde, Git og gemte AI-forbindelser. Den kontakter ingen modelserver og dekrypterer ingen modelnøgle blot for at vise skærmen. **Kontrollér forbindelse** henter den valgte servers modelkatalog; ingen projektfiler eller prompts sendes. En vellykket katalogkontrol er ikke en afprøvning af modelkald, kvote eller kodeværktøjer.

**Fortsæt med AI** kræver et katalog med modeller. **Fortsæt uden AI-kontrol** åbner de lokale funktioner uden at kræve konto eller serveradgang. Ved lokal fortsættelse hentes heller ikke et gemt projekts modelkatalog automatisk. Et aktivt forbindelsesvalg eller en AI-opgave udløser først netværksadgang. Model og datavilkår kontrolleres stadig før enhver AI-opgave. Den foretrukne forbindelse huskes lokalt, men vises som ukontrolleret efter genstart. En gemt nøgle eller adresse er ikke i sig selv en bekræftet forbindelse.

Ved fejl under katalogkontrol i projektet eller under et modelkald vender opsætningen tilbage med en forklaring. Projektet, filerne og beskedkladden bevares; der foretages intet automatisk genforsøg eller udbyderskift. Brugeren kan rette forbindelsen, kontrollere igen eller fortsætte med de lokale funktioner. Kontroller sker ved brug, ikke som baggrundspolling; skærmen er ikke en garanti for fortsat adgang. **Opsætning** i sidepanelet kan altid åbnes, når agenten er standset.

Git-status er lokal og ændrer ingen konfiguration. Med et åbent projekt kan brugeren gå til versionsindstillingerne. Manglende Git blokerer ikke projektoprettelse eller preview. Git-login, push og cloud-arbejdsområder er markeret som utilgængelige; denne skærm aktiverer ikke hosting.

## Brugerrejse

1. Opret et projekt eller åbn en eksisterende eller tom mappe. Åbning kræver ikke `harness.json` og ændrer ingen projektfiler. Et ugyldigt manifest giver en advarsel.
2. Ved oprettelse kan du vælge farve, logo, links og referencefiler. Gem dem som en navngiven **designpakke** og vælg pakken igen ved et senere projekt. Biblioteket gemmer egne kopier lokalt i appens datamappe; flyttede originalfiler bryder derfor ikke pakken. Gentofte-adressen er kun et eksempel i inputfeltet og bliver ikke automatisk tilføjet. Pakker synkroniseres ikke mellem computere og opdaterer ikke allerede oprettede projekter.
3. Åbn **Forbindelser**, vælg type, adresse og eventuel API-nøgle. **Test / hent modeller** kontrollerer kataloget; det beviser ikke, at modellen kan bruge kodeværktøjer. Vælg derefter model i arbejdsområdet. OpenRouter kræver en konkret underleverandør og bruger ingen automatisk fallback.
4. Gennemse **Skills og regler**. Aktive instruktioner kan redigeres, deaktiveres og gendannes pr. projekt. API-nøgler hører til forbindelser, aldrig i skills. Skills er modelinstruktioner; tekniske tilladelser er adskilt.
5. Skriv en opgave. Før første afsendelse og ved ændrede vilkår, model, skills eller referencer viser appen modtagere, pris, behandlingssted, opbevaring, træning og dokumentationsgrundlag. Ukendte oplysninger vises som ukendte. Referencefiler vælges særskilt; links kan besøges via godkendte webopslag, inklusive relevante undersider.
6. Gennemgå filændringer, kommandoer og webopslag, når agenten beder om tilladelse. **Stop** afbryder opgaven. **Ændringer** viser tekstindhold før og efter; oversigten kan også indeholde samtidige manuelle ændringer.
7. En `public/index.html` vises automatisk. Under **Server** kan du tilslutte en allerede startet loopback-udviklingsserver. Ingen kommando køres ved projektåbning eller tilslutning. Manglende preview blokerer ikke chatten.

## Paneler og skærmstørrelser

Træk skillelinjen mellem samtale og preview for at ændre panelbredden. Skillelinjen kan også fokuseres med Tab og flyttes med piletasterne (Shift giver større trin); Home/End vælger yderpunkterne, og dobbeltklik gendanner standardbredden.

Preview tilbyder fleksibel størrelse, desktop 1920 × 1080, tablet/iPad 768 × 1024, mobil/iPhone 390 × 844 og egne mål fra 240 til 7680 CSS-pixels. Du kan rotere visningen, tilpasse den visuelt til panelet eller vise den ved 100 % med rulning. Nedskalering ændrer ikke sidens layoutbredde eller media queries. Valgene gemmes lokalt i appens brugerflade og ændrer ingen projektfiler. Størrelserne er repræsentative layouts, ikke emulering af Safari, touch eller en bestemt fysisk enhed.

Afprøvet i Electron på macOS med et rigtigt projekt: træk, tastatur, faste og egne mål, rotation, iframe-layoutmål, skalering og vinduesstørrelse. Windows er ikke afprøvet.

## Lokale Git-versioner

**Gem version** viser status, aktiv branch, Git-identitet og de seneste versioner. I en mappe uden Git kan brugeren aktivt oprette lokal historik. Vælg derefter filer, gennemgå indholdet før/efter og skriv en versionsbeskrivelse. Appen kræver en eksisterende Git-installation og konfigureret `user.name`/`user.email`; den ændrer ikke identiteten. Projektet er et almindeligt Git-repository, som kan overtages uden AI Harness.

Automatiske checkpoints er slået fra som standard og vælges pr. projekt. Gem først en version manuelt. Efter en afsluttet AI-opgave gemmer appen kun et checkpoint, når udgangspunktet var rent, historikken er uændret, og alle ændringer kan knyttes til agentens afsluttede `write`-/`edit`-værktøjer. Fejl, stop, afvisninger, shellkommandoer, patchværktøjer, hooks, filtre og uklare ændringer medfører, at automatisk gemning springes over med en forklaring. Filerne bevares. Et checkpoint er ikke en bekræftelse på, at koden virker.

Eksisterende staged ændringer, konflikter, igangværende Git-operationer og detached HEAD blokerer appens versionsgemning. Mapper inde i et overordnet repository skal åbnes fra repositoryets rod. Manuel gemning respekterer Git-hooks og signering; disse kan køre lokale programmer. Hvis et commit afvises, kan de valgte filer forblive staged til gennemgang i brugerens Git-værktøj.

Visningen understøtter højst 200 ændrede filer og 2 MB pr. fil. Kendte hemmelighedsfiler, private referencer, symbolske links og mistænkeligt tekstindhold blokeres. Visse billed- og skrifttypefiler kan vælges manuelt uden indholdsvisning. Kontrollen er heuristisk og finder ikke alle hemmeligheder; `.env`-skabeloner blokeres også. Undgå samtidige filændringer fra andre programmer under versionsgemning: Git-kontrollerne er ikke en lås på hele filsystemet.

Intet pushes eller deployes. AI Alliancens GitHub-organisation er en mulig fremtidig destination, ligesom brugerens egen konto, organisation, Codeberg eller egen Git-server. Denne milepæl kræver ingen hostingkonto og opretter ingen remote, branch eller organisationstilgang.

## Moduler og data

- `core/git.cjs`, `core/checkpoints.cjs`: lokal Git-gennemgang, eksplicit filvalg og valgfrie checkpoints efter agentopgaver.
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

Cloud-arbejdsområder, kommunale rettighedspolitikker, automatisk npm-/Docker-opsætning, hostingadaptere og publicering til Git-servere er ikke tilsluttet. Modelplacering og arbejdsområdets placering er separate valg i arkitekturen; denne version tilbyder kun lokale arbejdsområder. En cloud-implementering kræver et aftalt host-/loginmodul og håndhævelse af kommunens rettigheder. Azure er ikke valgt som obligatorisk destination. Claude-abonnement er utilgængeligt; Anthropic API-nøgle er den implementerede forbindelsesvej.

## Afprøvning

Kør fra `desktop/`:

```bash
npm test
npm run test:desktop
npm run test:setup
npm run test:agent
npm run test:chat
```

Git-testene og chattesten opretter rigtige commits med syntetiske filer og testidentitet i nye, isolerede midlertidige repositories. De committer eller pusher ikke dette projekt. Electron-testen bevarer den normale hjemmemappe, så macOS safeStorage kan bruge den eksisterende nøglering; testidentiteten sættes kun lokalt i testrepositoryet. Nøgleringen skal aldrig nulstilles som led i testen.

Desktop- og chattest kræver en grafisk session. Agent- og chattest kræver den installerede OpenCode 1.17.15. Native dialogers svar simuleres med isolerede teststier; operativsystemets dialogbetjening skal afprøves manuelt. Integrationstestene bruger en kontrolleret lokal modelserver, rigtige filer og rigtige OpenCode-værktøjer. Testmapper/skærmbilleder bevares under systemets midlertidige mappe, og stierne udskrives.

Den valgfrie webkontrol bruger en lokal testmodel, men lader den rigtige agents webværktøj hente Gentofte-guidens offentlige forside og underside:

```bash
node scripts/verify-design-web.cjs
```

Den særskilte eksterne modelprøve sender kun syntetisk projektmateriale og offentlige regler til Zen-modellen `big-pickle`, uden API-nøgle. Kontrollér aktuelle vilkår før en ny kørsel; den indgår ikke i standardtestene:

```bash
npm run test:live
```

## Verifikationsstatus · 24. september 2026

- **Skrevet og automatisk testet:** mapper uden manifest, designbibliotek, krypteringsfejl, projektspecifikke skills, stop under motoropstart, serveradresser, ukendte vilkår og låst routing. 16 tests består. Git-testene bruger rigtige midlertidige repositories og kontrollerer aktivt filvalg, sletning, forældet gennemgang, hemmeligheder, eksisterende stage, afvisende hooks samt checkpoint-afvisning ved stop, værktøjsfejl, kommandoer og samtidige ændringer.
- **Afprøvet på konkret materiale:** macOS/Electron 44.4.4, genåbning, rigtigt preview og designpakke genbrugt efter genstart og sletning af originaler. OpenCode 1.17.15 gennemførte en rigtig filændring med kontrolleret modelserver, godkendelse, afvisning og stop. Den samlede desktop-chatrejse består også: modelvalg, datagennemgang, streaming, godkendt filændring, preview, ændringsoversigt og skill-redigering. Genåbning bevarer modelvalg, og tilslutning til en eksisterende udviklingsserver er afprøvet. OpenCodes webværktøj hentede Gentofte-guidens forside og en relevant underside gennem godkendelser med en kontrolleret testmodel. Electron safeStorage blev afprøvet med en syntetisk nøgle; hverken rendererens forbindelsesdata eller indstillingsfilen indeholdt nøglen i klartekst.
- **Git-milepæl afprøvet i Electron på macOS:** UI-oprettelse af Git-historik, manuelt første commit, tilvalg af checkpoints og automatisk andet commit efter en rigtig OpenCode-filændring med en kontrolleret lokal modelserver. Git-historikken indeholdt det ændrede indhold, arbejdsområdet var rent, og preview viste resultatet. Nøglekryptering og genlæsning bestod med normal macOS-hjemmemappe. En tidligere test med midlertidig HOME udløste en nøgleringsdialog; testopsætningen isolerer nu Git via et testværktøj på PATH og ændrer ikke Electrons HOME. Ingen nulstilling af nøgleringen er en del af testen.
- **Opstartsskærm afprøvet i Electron på macOS:** første start uden modelkald, lokal adgang, tilføjelse af forbindelse, tomt katalog, utilgængelig server, genoprettelse, bevarede kladder, manglende Git og ny kontrol efter genstart. En rigtig OpenCode-session mod den kontrollerede testserver fik afvist modeladgang; opsætningen kom frem, beskeden blev bevaret, og intet automatisk checkpoint blev oprettet.
- **Ekstern prøve:** Zen-kataloget svarede, men modelkaldet uden nøgle blev afvist med HTTP 403. En vellykket ekstern AI-genereret kodeændring er derfor ikke verificeret. Ingen anden model eller betalingsvej blev forsøgt som fallback.
- **Ikke verificeret:** Windows, brugerens faktiske providerkonti, Ollama, DGX Spark/Tailscale, en rigtig AI-models selvstændige fortolkning af designguiden samt cloud-arbejdsområder. Ingen installationer er pakket, deployet eller observeret i drift.

Kilder: [OpenCode server](https://opencode.ai/docs/server/), [Zen-vilkår](https://opencode.ai/docs/en/zen/#privacy), [OpenRouter og databehandling](https://openrouter.ai/docs/guides/privacy/provider-logging), [Anthropic og træning](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). Datavisningen er leverandøroplysninger og eksplicitte ukendte forhold, ikke en juridisk eller teknisk sikkerhedsgodkendelse.
