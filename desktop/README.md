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

Appen starter med **Hvad vil du bygge?**: en idé og et projektnavn. Designmateriale og avancerede projektvalg er foldet sammen. Brugeren kan oprette eller åbne et lokalt projekt uden AI- eller GitHub-konto. Opstarten kontakter ingen modelserver og dekrypterer ingen modelnøgle.

**Forbindelser og konto** i sidepanelet samler AI og valgfri GitHub-adgang. **Kontrollér forbindelse** henter kun den valgte servers modelkatalog. Et katalogsvar beviser ikke adgang til modelkald, kvote eller kodeværktøjer. **Fortsæt med AI** kræver et katalog med modeller; **Fortsæt lokalt** kræver ingen serveradgang. Den foretrukne forbindelse huskes lokalt, men bliver ukontrolleret efter genstart. Der skiftes aldrig automatisk til en anden model eller udbyder.

Arbejdsområdet viser samtale og preview. Modelvalget ligger foldbart ved beskedfeltet; **Brug dette valg** folder det sammen. Før afsendelse vises stadig datamodtagere, pris og vilkår, når en ny godkendelse er nødvendig. Tilføjelse af en almindelig API-forbindelse viser udbyder og nøgle; navn og serveradresse ligger under **Avanceret**. Egen server og Ollama åbner adressefelterne, fordi de skal kontrolleres. Der er endnu ingen automatisk organisationsopsætning eller Claude-abonnementsforbindelse.

**Brug min projektidé som første besked** udfylder en kladde, der beder AI'en stille nødvendige spørgsmål og foreslå en plan før filændringer. Det sender ikke noget og overskriver ikke en eksisterende kladde. Den tekniske startskabelon er fortsat den lokale HTML/CSS/JavaScript-skabelon; opstarten foretager ikke et skjult modelkald.

Fejl i modelkatalog eller modelkald vises i arbejdsområdet med **Gennemgå AI-forbindelse** og **Fortsæt lokalt**. Projekt, preview og beskedkladde bevares. Ingen automatisk gentagelse eller baggrundskontrol. GitHub er valgfri sikkerhedskopi og samarbejde; manglende adgang blokerer kun publiceringen. Lokale Git-oplysninger ligger under **Avanceret · lokale værktøjer**. Manglende Git blokerer ikke oprettelse eller preview.

## Brugerrejse

1. Opret et projekt eller åbn en eksisterende eller tom mappe. Åbning kræver ikke `harness.json` og ændrer ingen projektfiler. Et ugyldigt manifest giver en advarsel.
2. Ved oprettelse kan du vælge farve, logo, links og referencefiler. Gem dem som en navngiven **designpakke** og vælg pakken igen ved et senere projekt. Biblioteket gemmer egne kopier lokalt i appens datamappe; flyttede originalfiler bryder derfor ikke pakken. Gentofte-adressen er kun et eksempel i inputfeltet og bliver ikke automatisk tilføjet. Pakker synkroniseres ikke mellem computere og opdaterer ikke allerede oprettede projekter.
3. Åbn **AI-indstillinger**, vælg type, adresse og eventuel API-nøgle. **Test / hent modeller** kontrollerer kataloget; det beviser ikke, at modellen kan bruge kodeværktøjer. Vælg derefter model i arbejdsområdet. OpenRouter kræver en konkret underleverandør og bruger ingen automatisk fallback.
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

Versionsgemning pusher eller deployer ikke. Kodepublicering er en særskilt, eksplicit handling beskrevet nedenfor. Lokale funktioner kræver fortsat ingen hostingkonto.

## GitHub og kodepublicering

**Forbind GitHub** under Forbindelser og konto og **Del** i arbejdsområdet åbner samme modul. GitHub er den første udbyderadapter; `Publishing` afhænger af en provider med `id`, `get` og `credential`, samt en udskiftelig Git-transport. Codeberg, GitHub Enterprise og egne servere har endnu ingen færdig adapter. Projektet forbliver et almindeligt Git-repository.

Browserlogin bruger GitHubs Device Flow. En vedligeholder skal registrere en OAuth-app, aktivere Device Flow og angive dens offentlige Client ID i `HARNESS_GITHUB_CLIENT_ID` ved start. Ingen client secret skal indbygges eller deles. OAuth beder om `repo read:org`; dette er bred adgang. Organisationen kan kræve egen godkendelse eller SSO. En GitHub App med finere rettigheder er ikke implementeret her. Alternativt kan brugeren indtaste et GitHub-token i appens skjulte felt. Et afgrænset token skal have relevante repositories og Contents read/write; oprettelse og workflows kan kræve yderligere rettigheder. Browserlogin uden Client ID er tydeligt deaktiveret.

Adgangstokens valideres mod GitHubs bruger-API og gemmes med Electron safeStorage adskilt fra modelnøgler. Renderer og projektfiler får ikke tokenet retur. Annullering og udløb kræver nyt login; refresh-tokens bruges ikke. **Fjern adgang fra appen** sletter kun den lokale adgang, ikke GitHubs autorisation. Appen overtager ikke `gh`-login eller brugerens Git-identitet.

Efter kontrol af kontoen kan brugeren vælge egen konto eller en organisation, inklusive AI Alliancen ved tilstrækkelige rettigheder. Repositorylisten viser adgang, ikke en garanti for at organisations- og branchregler tillader handlingen. Oprettelse kræver særskilt bekræftelse af ejer, navn og privat/offentlig synlighed. Et nyt repository oprettes tomt uden commit; det tilsluttes derefter aktivt. Eksisterende repositories kan vælges fra listen eller angives som `ejer/navn`.

Tilslutning tilføjer `origin` eller `harness-github`, hvis der ikke allerede findes en passende remote. En eksisterende remote overskrives aldrig. Appens valg gemmes desuden pr. projekt uden for repositoryet. Push bruger den præcist gennemgåede HTTPS-destination og branch, ikke en skjult standardremote.

**Gennemgå historik til push** kræver rent arbejdsområde, en gemt version og afklaret Git-status. Den henter serverens branch og nødvendige Git-objekter uden at ændre arbejdsfiler, lokal branch eller FETCH_HEAD. Serverhistorik foran eller forskellig fra den lokale afvises til manuel integration. Ingen automatisk merge, rebase, pull eller force-push. Ved første push kan den gennemgåede branch oprettes på serveren; ingen andre branches eller tags pushes.

Kontrollen gennemgår filindhold i alle udgående versioner, også slettede hemmeligheder i tidligere commits. Kendte private filer, symbolske links, undermoduler, ukendte binærtyper, store historikker, shallow repositories og lokale historikerstatninger afvises. Grænser: 100 commits, 2.000 filer, 2 MB pr. blob og 20 MB samlet. Filnavne, almindelige tokenmønstre og disse grænser er ikke en garanti mod hemmeligheder. Git-hooks, Git LFS og særlige netværks-/URL-regler kræver publicering i brugerens Git-værktøj; appen slår dem ikke fra.

Før push vises destination, synlighed, branch, commitantal og filer. Brugeren bekræfter aktivt. Lokal HEAD, serverreference og synlighed kontrolleres igen; ændringer kræver en ny gennemgang. Almindeligt Git-push beskytter desuden mod samtidige ikke-fast-forward-opdateringer. GitHub-branchregler kan afvise push. Nøglen gives kun til Git-processens miljø for den faste HTTPS-destination, aldrig til argumenter, logs eller Git-konfiguration på disk. Git er en betroet lokal proces, ikke en OS-sandbox.

Et bekræftet push betyder, at versionen blev set på serveren ved kontrollen. Senere ændringer kræver ny kontrol. En netværksfejl kan gøre udfaldet ukendt; appen forsøger ikke automatisk igen. **Kode på GitHub er ikke en deployet applikation.** Deployment følger i en anden milepæl.

## Moduler og data

- `core/github.cjs`, `core/publishing.cjs`: GitHub-login, repositoryvalg, historikgennemgang og separat push.
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

Cloud-arbejdsområder, kommunale rettighedspolitikker, automatisk npm-/Docker-opsætning, deploymentadaptere er ikke tilsluttet. GitHub er den eneste færdige kodepubliceringsadapter. Modelplacering og arbejdsområdets placering er separate valg i arkitekturen; denne version tilbyder kun lokale arbejdsområder. En cloud-implementering kræver et aftalt host-/loginmodul og håndhævelse af kommunens rettigheder. Azure er ikke valgt som obligatorisk destination. Claude-abonnement er utilgængeligt; Anthropic API-nøgle er den implementerede forbindelsesvej.

## Afprøvning

Kør fra `desktop/`:

```bash
npm test
npm run test:desktop
npm run test:setup
npm run test:agent
npm run test:chat
npm run test:hosting
```

Git-, publicerings- og chattestene opretter rigtige commits med syntetiske filer og testidentitet i nye, isolerede midlertidige repositories. Publiceringstestene pusher kun mellem nye lokale testrepositories. GitHub-API’et simuleres i testen; ingen eksterne repositories oprettes. De committer eller pusher ikke dette projekt. Electron-testen bevarer den normale hjemmemappe, så macOS safeStorage kan bruge den eksisterende nøglering; testidentiteten sættes kun lokalt i testrepositoryet. Nøgleringen skal aldrig nulstilles som led i testen.

Desktop- og chattest kræver en grafisk session. Agent- og chattest kræver den installerede OpenCode 1.17.15. Native dialogers svar simuleres med isolerede teststier; operativsystemets dialogbetjening skal afprøves manuelt. Integrationstestene bruger en kontrolleret lokal modelserver, rigtige filer og rigtige OpenCode-værktøjer. Testmapper/skærmbilleder bevares under systemets midlertidige mappe, og stierne udskrives.

Den valgfrie webkontrol bruger en lokal testmodel, men lader den rigtige agents webværktøj hente Gentofte-guidens offentlige forside og underside:

```bash
node scripts/verify-design-web.cjs
```

Den særskilte eksterne modelprøve sender kun syntetisk projektmateriale og offentlige regler til Zen-modellen `big-pickle`, uden API-nøgle. Kontrollér aktuelle vilkår før en ny kørsel; den indgår ikke i standardtestene:

```bash
npm run test:live
```

En særskilt prøve med en rigtig gratis OpenRouter-model køres med `npm run test:openrouter`. Den beder om en testnøgle i terminalen uden ekko og sender kun syntetiske projektdata samt offentlige regler. Den bruger som standard `cohere/north-mini-code:free`, kontrollerer model- og rutepriser og bruger én konkret gratis rute uden fallback. For OpenRouters `:free`-varianter sætter gatewayen også nul som maksimal input-, output-, request- og billedpris. Nøglen må ikke angives som argument, i kildekoden eller i chatlogs. Testen er ikke en del af standardtestsuiten.

## Verifikationsstatus · 24. september 2026

- **Skrevet og automatisk testet:** mapper uden manifest, designbibliotek, krypteringsfejl, projektspecifikke skills, stop under motoropstart, serveradresser, ukendte vilkår og låst routing. 25 tests består. Git-testene bruger rigtige midlertidige repositories og kontrollerer aktivt filvalg, sletning, forældet gennemgang, hemmeligheder, eksisterende stage, afvisende hooks samt checkpoint-afvisning ved stop, værktøjsfejl, kommandoer og samtidige ændringer.
- **Afprøvet på konkret materiale:** macOS/Electron 44.4.4, genåbning, rigtigt preview og designpakke genbrugt efter genstart og sletning af originaler. OpenCode 1.17.15 gennemførte en rigtig filændring med kontrolleret modelserver, godkendelse, afvisning og stop. Den samlede desktop-chatrejse består også: modelvalg, datagennemgang, streaming, godkendt filændring, preview, ændringsoversigt og skill-redigering. Genåbning bevarer modelvalg, og tilslutning til en eksisterende udviklingsserver er afprøvet. OpenCodes webværktøj hentede Gentofte-guidens forside og en relevant underside gennem godkendelser med en kontrolleret testmodel. Electron safeStorage blev afprøvet med en syntetisk nøgle; hverken rendererens forbindelsesdata eller indstillingsfilen indeholdt nøglen i klartekst.
- **Git-milepæl afprøvet i Electron på macOS:** UI-oprettelse af Git-historik, manuelt første commit, tilvalg af checkpoints og automatisk andet commit efter en rigtig OpenCode-filændring med en kontrolleret lokal modelserver. Git-historikken indeholdt det ændrede indhold, arbejdsområdet var rent, og preview viste resultatet. Nøglekryptering og genlæsning bestod med normal macOS-hjemmemappe. En tidligere test med midlertidig HOME udløste en nøgleringsdialog; testopsætningen isolerer nu Git via et testværktøj på PATH og ændrer ikke Electrons HOME. Ingen nulstilling af nøgleringen er en del af testen.
- **Opstartsskærm afprøvet i Electron på macOS:** første start uden modelkald, lokal adgang, tilføjelse af forbindelse, tomt katalog, utilgængelig server, genoprettelse, bevarede kladder, manglende Git og ny kontrol efter genstart. En rigtig OpenCode-session mod den kontrollerede testserver fik afvist modeladgang; opsætningen kom frem, beskeden blev bevaret, og intet automatisk checkpoint blev oprettet.
- **GitHub/publicering afprøvet:** 25 automatiske tests består. Electron gennemfører Device Flow mod et kontrolleret GitHub-API, ejer-/organisationsvalg, eksplicit privat oprettelse, remote-tilslutning, gennemgang og almindeligt push til en rigtig lokal Git-server. Serverindhold og efterfølgende synkroniseringsstatus kontrolleres. Forløbet blev også gennemført med netop HTML-filen fra den rigtige OpenRouter-prøve. API-token er ikke tilgængeligt i rendererens offentlige tilstand eller i klartekst i indstillingsfilen. Rigtigt GitHub-login og push til github.com er endnu ikke afprøvet; det kræver den faktiske appregistrering eller en brugerforbundet konto.
- **Ekstern OpenRouter-prøve:** `cohere/north-mini-code:free` via ruten `cohere` gennemførte en rigtig filændring gennem OpenCode 1.17.15, med godkendelse og preview i Electron. Både katalog- og rutepris var nul; gatewayen fastholdt udbyderen, deaktiverede fallback og satte maksimal pris til nul. Testen brugte kun syntetiske projektfiler og offentlige regler. To tidligere forsøg blev afvist af testens eget stifilter; tredje forsøg bestod efter præcisering af den ene tilladte fil.
- **Tidligere Zen-prøve:** Zen-kataloget svarede, men modelkaldet uden nøgle blev afvist med HTTP 403. Denne Zen-forbindelse gav ikke en vellykket kodeændring. Ingen anden model eller betalingsvej blev forsøgt som fallback.
- **Ikke verificeret:** Windows, øvrige providerkonti, Ollama, DGX Spark/Tailscale, en rigtig AI-models selvstændige fortolkning af designguiden samt cloud-arbejdsområder. Ingen installationer er pakket, deployet eller observeret i drift.

Kilder: [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow), [GitHub repository-API](https://docs.github.com/en/rest/repos/repos), [OpenRouter prisgrænser](https://openrouter.ai/docs/guides/routing/provider-selection#max-price), [OpenCode server](https://opencode.ai/docs/server/), [Zen-vilkår](https://opencode.ai/docs/en/zen/#privacy), [OpenRouter og databehandling](https://openrouter.ai/docs/guides/privacy/provider-logging), [Anthropic og træning](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training), [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). Datavisningen er leverandøroplysninger og eksplicitte ukendte forhold, ikke en juridisk eller teknisk sikkerhedsgodkendelse.

## Afprøvning af enkel opstart

Den forenklede brugerrejse afprøves med `test:setup`, `test:desktop`, `test:chat` og `test:hosting`. Testene kontrollerer foldede standardvalg, lokal adgang uden konto, bevarede kladder ved forbindelsesfejl, eksplicit modelvalg, designpakker, preview og uændrede godkendelser. GitHub-kald i publiceringstesten er simulerede; Git og filerne er virkelige, isolerede testmaterialer. Denne milepæl kræver ingen nye eksterne modelkald og ændrer ikke deployment eller installationspakker.
