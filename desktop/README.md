# AI Harness · desktop, POC 2

Dansk desktop-app med lokale arbejdsområder, kodeagent, modelvalg, skills, genbrugelige designpakker og forhåndsvisning. OpenCode 1.17.15 er den første agentadapter. Modellen kan køre på egen maskine, egen server eller hos en ekstern udbyder; projektfiler og agentprocessen kører fortsat lokalt.

## Start fra kildekoden

Kræver Node.js 22.12 eller nyere, npm og en eksisterende OpenCode-installation i præcis version 1.17.15. Appen søger i `~/.opencode/bin/`, på PATH eller i `HARNESS_OPENCODE_PATH`. Den installerer eller opgraderer ikke OpenCode. Kør fra `desktop/`:

```bash
npm ci
npm start
```

Der findes lokale betapakker til macOS (Apple Silicon og Intel) og Windows x64; se installationsafsnittet nedenfor. Mac-pakkerne er signerede, men afventer notarisation. Kun Apple Silicon-pakken er kørt. Electron kan kræve netadgang ved installation fra kildekoden.

Appens navn og egne menuer er **AI Harness**. Under `npm start` bruges stadig udviklingsprogrammet `Electron.app` på macOS; systemets Dock, procesvisning og visse systemdialoger kan derfor fortsat vise Electron. Fuld systemnavngivning kræver en pakket app med egne bundle-oplysninger. Der ændres ikke i den installerede Electron-afhængighed. Navneskiftet bevarer eksisterende data- og sessionsmapper.

## Opstart og forbindelser

Ved første start vises **Byg et værktøj til din hverdag** med Start et projekt, Prøv et eksempel og Åbn et projekt. **Spring introduktionen over** går direkte til projektoprettelsen og huskes på denne computer. Introduktionen kan åbnes igen fra sidepanelet. Den guidede vej tilbyder AI-forbindelse eller fortsættelse uden AI; derefter beskriver brugeren sin idé og får et redigerbart navneforslag. Designmateriale og avancerede projektvalg er foldet sammen. Brugeren kan oprette eller åbne et lokalt projekt uden AI- eller GitHub-konto. Velkomst og demonstration kontakter ingen modelserver. Når AI-opsætningen åbnes, henter appen automatisk Ollamas modelliste fra http://127.0.0.1:11434/api/tags med en kort timeout. Ingen modelnøgle dekrypteres under søgningen.

**Forbindelser og konto** i sidepanelet samler AI og valgfri GitHub-adgang. **Kontrollér forbindelse** henter kun den valgte servers modelkatalog. Et katalogsvar beviser ikke adgang til modelkald, kvote eller kodeværktøjer. **Fortsæt med AI** kræver et katalog med modeller; **Fortsæt uden AI** kræver ingen serveradgang. Den foretrukne forbindelse huskes lokalt, men bliver ukontrolleret efter genstart. Der skiftes aldrig automatisk til en anden model eller udbyder.

Arbejdsområdet viser samtale og preview. Modelvalget ligger foldbart ved beskedfeltet; **Brug dette valg** folder det sammen. Før afsendelse vises stadig datamodtagere, pris og vilkår, når en ny godkendelse er nødvendig. Tilføjelse af en almindelig API-forbindelse viser udbyder og nøgle; navn og serveradresse ligger under **Avanceret**. Egen server og Ollama åbner adressefelterne, fordi de skal kontrolleres. Der er endnu ingen automatisk organisationsopsætning eller Claude-abonnementsforbindelse.

**Brug min projektidé som første besked** vælger Afklar og planlæg og udfylder en kladde. Det sender ikke noget og overskriver ikke en eksisterende kladde. I denne tilstand afviser agentmotoren filskrivning og kommandoer; brugeren vælger senere Byg første udkast. Den tekniske startskabelon er fortsat den lokale HTML/CSS/JavaScript-skabelon; opstarten foretager ikke et skjult modelkald.

Fejl i modelkatalog eller modelkald vises i arbejdsområdet med **Gennemgå AI-forbindelse** og **Fortsæt uden AI**. Projekt, preview og beskedkladde bevares. Ingen automatisk gentagelse eller baggrundskontrol. GitHub er valgfri sikkerhedskopi og samarbejde; manglende adgang blokerer kun publiceringen. Lokale Git-oplysninger ligger under **Avanceret · lokale værktøjer**. Manglende Git blokerer ikke oprettelse eller preview.

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

**Gem version** viser status, aktiv branch, Git-identitet og de seneste versioner. I en mappe uden Git kan brugeren aktivt oprette lokal historik. Vælg derefter filer, gennemgå indholdet før/efter og skriv en versionsbeskrivelse. Kildekodeversionen kræver Git; installationspakken medleverer Git. Ved manglende navn/e-mail viser appen en formular og gemmer kun manglende oplysninger i projektets lokale Git-konfiguration efter brugerens aktive valg. En eksisterende identitet overskrives ikke. Projektet er et almindeligt Git-repository, som kan overtages uden AI Harness.

Automatiske checkpoints er slået fra som standard og vælges pr. projekt. Gem først en version manuelt. Efter en afsluttet AI-opgave gemmer appen kun et checkpoint, når udgangspunktet var rent, historikken er uændret, og alle ændringer kan knyttes til agentens afsluttede `write`-/`edit`-værktøjer. Fejl, stop, afvisninger, shellkommandoer, patchværktøjer, hooks, filtre og uklare ændringer medfører, at automatisk gemning springes over med en forklaring. Filerne bevares. Et checkpoint er ikke en bekræftelse på, at koden virker.

Eksisterende staged ændringer, konflikter, igangværende Git-operationer og detached HEAD blokerer appens versionsgemning. Mapper inde i et overordnet repository skal åbnes fra repositoryets rod. Manuel gemning respekterer Git-hooks og signering; disse kan køre lokale programmer. Hvis et commit afvises, kan de valgte filer forblive staged til gennemgang i brugerens Git-værktøj.

Visningen understøtter højst 200 ændrede filer og 2 MB pr. fil. Kendte hemmelighedsfiler, private referencer, symbolske links og mistænkeligt tekstindhold blokeres. Visse billed- og skrifttypefiler kan vælges manuelt uden indholdsvisning. Kontrollen er heuristisk og finder ikke alle hemmeligheder; `.env`-skabeloner blokeres også. Undgå samtidige filændringer fra andre programmer under versionsgemning: Git-kontrollerne er ikke en lås på hele filsystemet.

Versionsgemning pusher eller deployer ikke. Kodepublicering er en særskilt, eksplicit handling beskrevet nedenfor. Lokale funktioner kræver fortsat ingen hostingkonto.

## GitHub og kodepublicering

**Forbind GitHub** under Forbindelser og konto og **Sikkerhedskopi** i arbejdsområdet åbner samme modul. GitHub er den første udbyderadapter; `Publishing` afhænger af en provider med `id`, `get` og `credential`, samt en udskiftelig Git-transport. Codeberg, GitHub Enterprise og egne servere har endnu ingen færdig adapter. Projektet forbliver et almindeligt Git-repository.

Browserlogin bruger GitHubs Device Flow. En vedligeholder skal registrere en OAuth-app, aktivere Device Flow og angive dens offentlige Client ID i `HARNESS_GITHUB_CLIENT_ID` ved start. Ingen client secret skal indbygges eller deles. OAuth beder om `repo read:org`; dette er bred adgang. Organisationen kan kræve egen godkendelse eller SSO. En GitHub App med finere rettigheder er ikke implementeret her. Alternativt kan brugeren indtaste et GitHub-token i appens skjulte felt. Et afgrænset token skal have relevante repositories og Contents read/write; oprettelse og workflows kan kræve yderligere rettigheder. Browserlogin uden Client ID er tydeligt deaktiveret.

Adgangstokens valideres mod GitHubs bruger-API og gemmes med Electron safeStorage adskilt fra modelnøgler. Renderer og projektfiler får ikke tokenet retur. Annullering og udløb kræver nyt login; refresh-tokens bruges ikke. **Fjern adgang fra appen** sletter kun den lokale adgang, ikke GitHubs autorisation. Appen overtager ikke `gh`-login eller brugerens Git-identitet.

Efter kontrol af kontoen kan brugeren vælge egen konto eller en organisation, inklusive AI Alliancen ved tilstrækkelige rettigheder. Repositorylisten viser adgang, ikke en garanti for at organisations- og branchregler tillader handlingen. Oprettelse kræver særskilt bekræftelse af ejer, navn og privat/offentlig synlighed. Et nyt repository oprettes tomt uden commit; det tilsluttes derefter aktivt. Eksisterende repositories kan vælges fra listen eller angives som `ejer/navn`.

Tilslutning tilføjer `origin` eller `harness-github`, hvis der ikke allerede findes en passende remote. En eksisterende remote overskrives aldrig. Appens valg gemmes desuden pr. projekt uden for repositoryet. Push bruger den præcist gennemgåede HTTPS-destination og branch, ikke en skjult standardremote.

**Gennemgå historik til push** kræver rent arbejdsområde, en gemt version og afklaret Git-status. Den henter serverens branch og nødvendige Git-objekter uden at ændre arbejdsfiler, lokal branch eller FETCH_HEAD. Serverhistorik foran eller forskellig fra den lokale afvises til manuel integration. Ingen automatisk merge, rebase, pull eller force-push. Ved første push kan den gennemgåede branch oprettes på serveren; ingen andre branches eller tags pushes.

Kontrollen gennemgår filindhold i alle udgående versioner, også slettede hemmeligheder i tidligere commits. Kendte private filer, symbolske links, undermoduler, ukendte binærtyper, store historikker, shallow repositories og lokale historikerstatninger afvises. Grænser: 100 commits, 2.000 filer, 2 MB pr. blob og 20 MB samlet. Filnavne, almindelige tokenmønstre og disse grænser er ikke en garanti mod hemmeligheder. Git-hooks, Git LFS og særlige netværks-/URL-regler kræver publicering i brugerens Git-værktøj; appen slår dem ikke fra.

Før push vises destination, synlighed, branch, commitantal og filer. Brugeren bekræfter aktivt. Lokal HEAD, serverreference og synlighed kontrolleres igen; ændringer kræver en ny gennemgang. Almindeligt Git-push beskytter desuden mod samtidige ikke-fast-forward-opdateringer. GitHub-branchregler kan afvise push. Nøglen gives kun til Git-processens miljø for den faste HTTPS-destination, aldrig til argumenter, logs eller Git-konfiguration på disk. Git er en betroet lokal proces, ikke en OS-sandbox.

Et bekræftet push betyder, at versionen blev set på serveren ved kontrollen. Senere ændringer kræver ny kontrol. En netværksfejl kan gøre udfaldet ukendt; appen forsøger ikke automatisk igen. **Kode på GitHub er ikke en deployet applikation.** Testudgivelse er en separat handling beskrevet nedenfor.

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

Cloud-arbejdsområder, kommunale rettighedspolitikker, automatisk npm-/Docker-opsætning og andre deploymenttyper end dem beskrevet nedenfor er ikke tilsluttet. GitHub er den eneste færdige kodepubliceringsadapter. Modelplacering og arbejdsområdets placering er separate valg i arkitekturen; denne version tilbyder kun lokale arbejdsområder. En cloud-implementering kræver et aftalt host-/loginmodul og håndhævelse af kommunens rettigheder. Azure er ikke valgt som obligatorisk destination. Claude-abonnement er utilgængeligt; Anthropic API-nøgle er den implementerede forbindelsesvej.

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

## Valg, der kan huskes eller springes over

Opstarten viser en kort opsummering af AI-forbindelse, hostingønske, gemt designpakke og teststrategi. **Tilpas** åbner valgene. **Beslut senere** rydder dem og designmaterialet for den aktuelle projektkladde, men bevarer idé, navn og gemte standarder. **Husk disse valg til nye projekter** gemmer kun ved en faktisk projektoprettelse; en annulleret mappedialog gemmer ingen standarder. **Glem mine standardvalg** fjerner standarderne uden at ændre kladden eller eksisterende projekter.

Standarderne ligger i appdata. Nye projekter får deres egen kopi i projektindstillingerne uden for repositoryet. Et eksisterende projekts modelvalg har forrang. Manglende forbindelser og designpakker giver en forklaring og vælges ikke automatisk på ny. En husket AI-forbindelse kontakter ikke serveren; brug **Hent modeller** før modelvalg. Designpakken kopieres lokalt som hidtil; private referencer er stadig ikke valgt til modellen.

Hostingønsket vises i projektoplysninger og medsendes som kontekst efter datagennemgangen. Det opretter ingen cloudressource og er ikke en godkendelse af upload, omkostninger eller publicering. Startskabelonen er stadig statisk HTML/CSS/JavaScript. Hostingønsket foreslår nu udbyder i udgivelsesdialogen. Organisationers centrale standarder er endnu ikke tilsluttet. Der loves derfor ikke automatisk tilpasning af projekttypen til destinationen.

`npm run test:preferences` afprøver gemning, genstart, spring-over og glem i Electron med isolerede projekter. `tests/preferences.test.cjs` kontrollerer validering, manglende henvisninger og at nye standarder ikke ændrer eksisterende projekter eller gemmer godkendelser/nøgler.

## Udgiv til test

**Udgiv til test** er valgfri og kræver ingen GitHub-forbindelse. Vælg et eksisterende hostingprojekt, gennemgå filerne og bekræft upload. Destinationen huskes pr. projekt uden for repositoryet. Avancerede valg er foldet sammen. Produktion, branches og projektets lokale filer ændres ikke.

Pakken læses fra den gemte Git-version i den valgte mappe, som bliver uploadens rod. Arbejdsområdet skal være rent. Ignorerede buildfiler på disken medtages ikke: ved færdigbygget frontend skal det faktiske output være gemt i Git; ved Vercel-kildekode bygger udbyderen i stedet. Grænserne er 2.000 filer, 2 MB pr. fil og 20 MB samlet. Kendte hemmelighedsfiler, private referencer, links, undermoduler og LFS-pointere afvises. Indholdskontrollen er heuristisk.

Gennemgangen viser Git-version, filnavne, indholdsfingeraftryk, destination, adgang, placering og mulige omkostninger. Version og destination genkontrolleres før upload. Godkendelsen er engangsbrug og udløber. Projekt-/appindstillinger gemmes, men godkendelsen huskes ikke til næste udgivelse.

### Vercel

Kræver eksisterende login i Vercel CLI og et eksisterende projekt i det angivne team. Adapteren bruger CLI'ens API-adgang og opretter **preview** uden Git-push, produktionsflag eller ændrede projektindstillinger. Adapteren afviser projekter uden en eksisterende klar produktionsversion, før der uploades. Vercel promoverede første udgivelse til produktion i liveafprøvningen, både med udeladt target og eksplicit staging. Derfor skal en startversion oprettes særskilt hos Vercel, helst i et dedikeret testprojekt. Kontrollen gentages før upload; undgå samtidige sletninger af udgivelser fra andre værktøjer. Vercel CLI 59.25.2 er brugt i afprøvningen. Et andet program kan angives med `HARNESS_VERCEL_PATH`.

- **Færdigbygget frontend:** vælg fx `public`. Projektet skal have standardindstillinger uden framework, egne build-/installationskommandoer, outputmappe eller særskilt rodmappe. Appen overskriver ikke disse indstillinger.
- **Kildekode:** vælg fx `.` med `package.json` og lockfil. Projektets Vercel-indstillinger styrer framework og build. En særskilt Vercel-rodmappe afvises, fordi pakken allerede er afgrænset til den valgte mappe. Understøttelse af serverkode afhænger af Vercels runtime og frameworkadapter.

Preview-miljøvariabler opsættes i Vercel. Appen viser variabelnavne, aldrig værdier, og opretter ingen hemmeligheder. Installations- og buildscripts fra kildekoden kører hos Vercel og kan læse disse værdier. Et preview kan være offentligt eller kræve login afhængigt af kontoens adgangsindstillinger.

### Azure Static Web Apps

Kræver Azure CLI-login, SWA CLI og en eksisterende Static Web App. Angiv abonnement-ID, ressourcegruppe og navn. Programstier kan angives med `HARNESS_AZ_PATH` og `HARNESS_SWA_PATH`. SWA CLI kan hente sit deploymentværktøj ved første brug. Der installeres ingen npm-afhængigheder eller startes projektkommandoer lokalt.

Adapteren bruger det navngivne **harness-test**-miljø; næste upload erstatter dets indhold. Produktion er ikke destination. Azure-kontoen skal have rettighed til at læse ressourcen og hente deploymentnøglen. Nøglen gives kortvarigt til SWA-processens miljø, aldrig argumenter, renderer, projektfiler eller appens kvittering. CLI'ernes eksisterende kontologin administreres af deres egne værktøjer.

Færdigbygget frontend skal have `index.html`. Frontend med Functions kræver adskilte mapper, fx `public` og `api`, med `host.json` og færdigt selvstændigt Node.js 22-API. `node_modules` medtages ikke; afhængigheder skal være bundlet. Appen bygger ikke Functions. Langvarige serverprocesser, Docker, databaser og automatisk ressourceoprettelse er ikke en del af adapteren. Hemmeligheder og adgangsregler opsættes særskilt i Azure-testmiljøet.

### Status og kontrol

**Kontrollér status** følger den registrerede udgivelse. Appen kontrollerer kun kendte HTTPS-testadresser hos udbyderen og følger ikke redirects ved indholdskontrollen. Ved statiske sider sammenlignes startsideindholdet med den godkendte fil. Udbyderindsatte scripts kan give forskelligt fingeraftryk; appen beder da om manuel gennemgang frem for at erklære fuld overensstemmelse. Ved kildekode beviser et HTTP-svar kun, at adressen svarer. Backend, login og brugerrejser kræver yderligere afprøvning. En loginbeskyttet side bliver ikke meldt som verificeret.

Azure-status skal have et opdateringstidspunkt efter uploadstart, før en gammel testversion kan tælle som klar. Dette er ikke en lås mod andre, der samtidig udgiver til samme miljø. Uploadfejl kan have ukendt udfald: kontrollér udbyderens oversigt før nyt forsøg. Appen gentager ikke automatisk. Lukning af dialogen annullerer ikke en allerede igangsat cloududgivelse.

### Verifikation og kilder

`npm test` består med 39 tests. `test:deployment` og `test:desktop` består i Electron på macOS. Testene omfatter snapshots fra rigtige isolerede Git-repositories, engangsgodkendelser, ændret version/destination, fejlstatus, indholdskontrol og leverandørkontrakter. `npm run test:deployment` afprøver Electron-dialog og IPC med rigtige filer og simulerede hostingsvar. `node scripts/verify-deployment.cjs --live-vercel` uploader syntetisk materiale til det konkret godkendte `progressify/ai-harness-test`; kommandoen skal kun bruges med ejerens tilladelse.

Vercel-forløbet er afprøvet gennem Electron med en syntetisk HTML-side i `progressify/ai-harness-test`; Vercel bekræftede `target: null` og `READY`. Den anonyme kontrol registrerer korrekt viderestilling til login. En særskilt autentificeret CLI-kontrol hentede den godkendte HTML-side; Vercel havde tilføjet sit feedback-script, så hele HTTP-svaret var ikke byteidentisk. De to syntetiske udgivelser, som Vercel klassificerede som produktion under fejlsøgningen, er fjernet. Kontrollen før upload blev derefter afprøvet mod det rigtige projekt og afviste korrekt manglende startversion. Kun preview-testudgivelsen er efterladt.

Azure er ikke liveafprøvet; der er endnu ingen testressource. Windows og framework-/Functions-apps er ikke afprøvet live i denne milepæl. CLI-installation/login kræver stadig ekstern opsætning; dette er endnu ikke et fuldt guidet hostinglogin for nye brugere.

Kilder kontrolleret 24. september 2026: [Vercel deployments API](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [SWA deploy](https://azure.github.io/static-web-apps-cli/docs/cli/swa-deploy/), [Azure-miljøer](https://learn.microsoft.com/en-us/azure/static-web-apps/preview-environments) og [Azure buildstatus](https://learn.microsoft.com/en-us/rest/api/appservice/static-sites/get-static-site-builds?view=rest-appservice-2024-11-01).

## Flere hostingmuligheder

Dialogen viser også mulige kommende adaptere, tydeligt adskilt fra de aktive destinationer. Der er endnu ingen upload til disse fra appen:

- [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/preview-deployments/) og [Workers](https://developers.cloudflare.com/workers/versions-and-deployments/version-urls/): preview-/versionsadresser. Workers kræver en kompatibel runtime; det er ikke en vilkårlig Node-server.
- [Netlify](https://cli.netlify.com/commands/deploy/): CLI'en opretter som standard draft-deploys. Funktioner og build skal håndteres efter Netlifys format.
- [Render](https://render.com/docs/preview-environments): preview-miljøer til flere tjenester og datalagre.
- [Railway](https://docs.railway.com/environments): særskilte vedvarende miljøer og PR-miljøer.
- Egen server, fx kommunal infrastruktur eller Hetzner: kræver en adapter til den valgte runtime, adgang og testadresse.

Valgmulighederne er ikke et løfte om gratis drift eller godkendt databehandling. Pris, region, logging, opbevaring, hemmeligheder og adgang skal vurderes pr. konto og tjeneste. Kilder kontrolleret 24. september 2026.

## Introduktion og bevægelse · 25. september 2026

Introduktionen er valgfri. Spring over og Escape gemmer kun et lokalt navigationsvalg; de giver ingen værktøjstilladelser, accepterer ingen datavilkår og tilslutter ingen konto. Tilbage-navigation og Vis introduktion gør det muligt at vende tilbage. Et annulleret mappevalg efterlader kladden.

Den lokale demonstration viser en aktivitetsoversigt med faste svar og skift mellem kort og liste. Den er tydeligt markeret som demonstration, bruger ingen model og opretter intet projekt. Eksemplet vises i en sandboxet iframe uden scriptrettigheder. Appens indholdspolitik er bevaret.

Idé og projektnavn gemmes automatisk i rendererens lokale lager, uden kryptering. Nøgler og private referencefiler gemmes ikke dér. Kladden genlæses ved genstart og ryddes efter vellykket projektoprettelse. Manuelt rettede navne bliver ikke overskrevet af navneforslaget.

Tilslut AI viser en vejledning til egen API-adgang. Udbyderknappen åbner kun faste adresser for Anthropic, OpenRouter og OpenCode Zen gennem main-processen. Egen server og Ollama viser deres adresseopsætning i stedet. Ingen nøgle eller projektdetalje sendes til hjemmesiden af appen. En ny gemt forbindelse vælges lokalt i opsætningen, men kontakter først udbyderen ved brugerens kontrol. Katalogkontrol er stadig ikke en afprøvet kodeopgave; den første rigtige AI-opgave kræver modelvalg og datagennemgang.

Datagennemgangen viser model, modtagere, behandlingssted, pris, opbevaring og træning før afsendelse. Yderligere oplysninger og regler kan foldes ud. Ingen standardmodel eller betalingsrute vælges automatisk.

Navigation og status bruger samme typografi og rolige overgange mellem trin. Operativsystemets reduceret-bevægelse-indstilling slår animationer og overgange fra. Fokus flyttes til det nye trin; interaktive kontroller beholder synligt tastaturfokus.

**Verifikation:** `npm run test:introduction` afprøver velkomst, demonstration, reduceret bevægelse, spring over, genindlæsning, navneforslag, kladde, tilbage-navigation, annulleret mappevalg og oprettelse af et virkeligt projekt med preview i Electron. De øvrige UI-tests bruger den rigtige Spring over-knap ved start. Ingen fælles organisationslogin, browserlogin til modeludbydere, automatisk værktøjsinstallation eller signeret installationspakke er implementeret i denne milepæl. Forløbet er endnu ikke brugertestet med kommunale medarbejdere, og Windows er ikke afprøvet.

Udbydervejledningen bygger på [Anthropics adgangsvejledning](https://platform.claude.com/docs/en/manage-claude/authentication), [OpenRouters introduktion](https://openrouter.ai/docs/quickstart) og [OpenCodes udbydervejledning](https://opencode.ai/docs/providers), kontrolleret 25. september 2026.

## Fra idé til første udkast · 25. september 2026

Arbejdsområdet tilbyder tre modelkort fra den valgte forbindelses aktuelle katalog. Modeller med oplyste værktøjskald vises først, derefter sorteres alfabetisk; modeller med udtrykkeligt manglende værktøjsstøtte vises kun i det fulde katalog. Udvalget er ikke en kvalitetsrangering. **Alle modeller · avanceret** har søgning og fuld valgliste. Ingen model, betalingsrute eller reserveudbyder vælges automatisk. Input-/outputpris vises som oplyst af kataloget; andre gebyrer, kvoter og ukendte vilkår afklares fortsat i datagennemgangen. Katalogdata beviser ikke, at en model kan gennemføre kodeopgaver.

Nye projekter med en idé starter i **Afklar og planlæg**. Eksisterende mapper uden idé starter i **Arbejd direkte · avanceret**. Brugeren kan frit vælge mellem dem før afsendelse. Planlægning tillader læsning under de eksisterende filbegrænsninger, spørgsmål og godkendte webopslag; skriveværktøjer, shell og øvrige ukendte værktøjer er afvist af motorens tilladelser. Det er ikke alene en promptinstruktion. Der oprettes ingen automatiske checkpoints for planlægningsopgaver. Det er fortsat ikke en OS-sandbox mod andre processer.

AI’en bliver bedt om kun at stille nødvendige spørgsmål og foreslå en kort plan med konkrete ting, brugeren skal prøve. Spørgsmål kan besvares i samtalen eller gennem agentens spørgsmålsværktøj. Seneste afsluttede forslag vises med **Byg første udkast**. Appen vurderer ikke automatisk, om forslaget er tilstrækkeligt eller alle spørgsmål er afklaret; brugeren gennemgår det. En ny planlægningsbesked ugyldiggør den tidligere plan. Bygning kræver den aktuelle plans ID og ny datagennemgang. Kommandoer og filændringer kræver stadig deres egne godkendelser.

Plan og afklaringsbeskeder medsendes ved overgangen til en ny byggesession og vises under Data og vilkår. Almindelige opfølgende afklaringer kræver ikke gentaget samtykke, når model, regler, referencer og vilkår er uændrede. Planen er sessionsdata i hukommelsen og nulstilles ved genåbning af projektet; OpenCodes lokale samtalelog kan fortsat indeholde beskederne. Skift af model eller forbindelse kan sende den viste afklaring til den nye modtager efter datagennemgang.

Godkendelseskort forklarer på dansk, hvad en filændring, kommando, websidelæsning eller adgang uden for projektet indebærer. Målet vises altid; rå værktøjsdata ligger under Tekniske detaljer. Eventuel begrundelse fra agenten markeres som agentens egen. Forklaringerne er ikke en analyse af, om en konkret kommando er sikker.

Afslutningen viser ændrede tekstfiler registreret i den enkelte opgave og status for eventuelle shellværktøjer. En afsluttet kommando er ikke automatisk en bestået test. AI’en bliver desuden bedt om at beskrive ændringer, faktisk udførte kontroller og manuelle prøvetrin. Appen markerer eksplicit, når ingen kommandoer er kørt, og tilbyder ændringsgennemgang og den eksisterende **Gem version**-dialog. Oversigten kan omfatte samtidige manuelle ændringer og udelader store/private/binære filer efter de eksisterende grænser. Den samlede Ændringer-dialog dækker stadig fra første besked i arbejdsområdet.

**Verifikation:** 41 automatiske tests består. Den rigtige OpenCode-motor er kørt mod en kontrolleret lokal modelserver: et bevidst skriveforsøg under planlægning blev afvist uden filændring; en forældet plan blev afvist; den godkendte plan fulgte med til en rigtig filændring og preview. Electron-forløbet omfatter modelkort, opfølgende afklaring, eksplicit bygning, datagennemgang, godkendelse, ændringsoversigt og Git-version i et isoleret testrepository. Projekt-/preview- og forbindelsestestene består også på macOS. Ingen ny ekstern modelafprøvning, Windows-kørsel, brugertest med kommunale medarbejdere eller cloududgivelse er udført i denne milepæl.

## Installationspakker · beta

Kør alle følgende kommandoer fra `desktop/`. Pakningen henter kun fastlåste værktøjer fra `runtime-lock.json`, kontrollerer deres SHA-256/SHA-512 og kopierer dem til appens ressourcemappe. Byg ikke fra en mappe med ukendte lokale ændringer. Appens kode pakkes fra en eksplicit filliste; projekter, nøgler, testmapper og udviklerens indstillinger medtages ikke. Git, Node/npm og OpenCode følger med; model, API-adgang, Docker og hosting-CLI'er følger ikke med. Installationen ændrer ikke systemets PATH eller eksisterende værktøjer.

```bash
npm ci
npm run runtime:prepare -- darwin-arm64
npm run package:mac -- --arm64
```

Intel-Mac bruger `darwin-x64` og `--x64`. Windows bygges på Windows med mål `win32-x64` og `npm run package:windows -- --x64`; ARM64 bruger `win32-arm64` og `--arm64`. Pakken er en betaversion. Windows-kørsel kræver særskilt afprøvning på Windows, også hvis krydsbygning lykkes.

Signering sker kun, når `HARNESS_SIGN_IDENTITY` eksplicit angives til det godkendte Developer ID-certifikat ved Mac-bygning. Angiv certifikatnavnet uden præfikset `Developer ID Application:`; den lokalt godkendte identitet er `mekbas IVS (2UX98897JW)`. Der er ingen automatisk valg af certifikat. Notarisation er særskilt og kræver en opsat Apple-profil; en signeret pakke er ikke automatisk notariseret. Indtil notarisation er gennemført, må testpakken ikke beskrives som en friktionsfri installation på andre Mac-computere. Omgå ikke kommunens installationspolitik.

```bash
npm run test:package -- "release/mac-arm64/AI Harness.app"
npm run release:site
```

`test:package` starter den pakkede app med isoleret brugerdata og begrænset PATH, kontrollerer medfølgende værktøjer, opretter et syntetisk projekt og viser preview. Den nulstiller aldrig macOS-nøgleringen. Downloadfiler og den genererede downloadside ligger i `desktop/release/` og skal distribueres separat, ikke committes som binære filer. Bygning uploader ikke noget. Downloadsiden viser kun faktiske filer og SHA-256; den opfinder ikke publicerede links.

Vedligeholdere kan starte workflowet **Byg testpakker** manuelt efter eget commit/push. Workflowet uploader byggeartefakter til den konkrete GitHub Actions-kørsel, ikke en offentlig Release. Mac-pakker fra workflowet er usignerede, medmindre en særskilt godkendt signeringsopsætning tilføjes. Kildearkiver og tredjepartslicenser følger med runtime; projektets egen distributionslicens skal stadig aftales af vedligeholderne.


Notarisation efter opsætning af lokal `notarytool`-profil:

```bash
node scripts/notarize.cjs release/AI-Harness-0.2.0-beta.1-mac-arm64.dmg PROFILNAVN
npm run release:site
```

Scriptet indsender den konkrete DMG til Apple, kræver Accepted, vedhæfter billetten og validerer den. En kvittering bindes til filens SHA-256. Downloadsiden markerer kun en fil som notariseret, hvis kvittering og aktuel kontrolsum matcher. En ny bygning kræver ny notarisation. Profilnavnet er ikke en adgangskode; profilen oprettes lokalt med Apples værktøj. Apple-login og private nøgler må ikke lægges i repositoryet.


### Faktisk afprøvning · 25. september 2026

45 automatiske tests består. Den signerede Apple Silicon-app er startet som pakket app med isolerede brugerdata, normal HOME og begrænset PATH. De medfølgende OpenCode-, Git- og Node/npm-værktøjer er kontrolleret. Et syntetisk projekt er oprettet, vist i preview og versionsgemt gennem brugerfladen med eksplicit lokal Git-identitet. En rigtig OpenCode-session mod en kontrolleret lokal modelserver har gennemført planlægning, godkendt filændring, preview og manuel versionsgemning. Testen bruger ingen ekstern betalt model. Automatiske checkpoints afvises korrekt, når Git-filtre er aktive; den manuelle vej er afprøvet i pakken.

Apple Silicon-DMG'en er monteret skrivebeskyttet; appens signatur og overensstemmelse med den afprøvede app er kontrolleret. Downloadsiden er afprøvet i Chrome på desktop- og mobilbredde med faktisk download og kontrolsum. Intel-Mac og Windows x64 er pakket, men ikke kørt på deres målmaskiner; Windows er usigneret. GitHub-workflowet er skrevet, men ikke kørt på GitHub. Der er endnu ingen offentlig downloadadresse, Apple-notarisation eller afprøvning på en separat, nyinstalleret computer.

Opret om nødvendigt en lokal Apple-loginprofil interaktivt:

```bash
xcrun notarytool store-credentials ai-harness-notary --team-id 2UX98897JW
```

Værktøjet spørger efter Apple-konto og en app-specifik adgangskode. Indtast dem kun lokalt. Profilen gemmes i nøgleringen og valideres af Apple; almindelig Apple-kontoadgangskode skal ikke bruges. En eksisterende profil kan bruges i stedet. Nulstil ikke nøgleringen, hvis der opstår en adgangsfejl.


## Corti S1 og Mistral · 25. september 2026

Vælg **Corti S1 · EU** eller **Mistral API** under forbindelser, gem din API-nøgle, og hent kontoens aktuelle modeller. Intet modelvalg, forbrug eller skift til anden udbyder sker automatisk. Nøgler bruger det eksisterende krypterede lager og sendes kun fra hovedprocessens gateway.

Corti bruger fast `https://ai.eu.corti.app/v1` og kræver en nøgle fra et EU-projekt. Modellerne hentes fra `/models`; embedding-modeller udelades fra kodechatten. Samme Corti-modelnavn kan dække andre underliggende modeller i USA, så adapteren skifter ikke region. EU-oplysningerne er leverandørudsagn, ikke en kontrol af jeres aftale eller installation. Se [Cortis regioner](https://docs.corti.ai/models/regions) og [API-vejledning](https://docs.corti.ai/models/quickstart).

Mistral bruger fast `https://api.mistral.ai/v1`. Katalogets `completion_chat: false` udelader modeller uden chat, og `function_calling` bruges til at vise oplyst værktøjsstøtte. Manglende pris eller egenskaber vises fortsat som ukendte. Træningsvalg og opbevaring afhænger af konto og model; appen kan ikke verificere kontoens indstillinger. Se [modelkatalog](https://docs.mistral.ai/api/endpoint/models) og [træningsvilkår](https://help.mistral.ai/en/articles/347617-do-you-use-my-user-data-to-train-your-artificial-intelligence-models). Kilder kontrolleret 25. september 2026.

Promte er efter aftale udeladt fra denne milepæl. Den fundne [Responses API-vejledning](https://kommune.applai.dk/docs/admin/api-og-responses) beskriver arbejdsområde-assistenter, men dokumenterer ikke egne kodeværktøjer; en fremtidig adapter kræver afklaring.

Verifikation: katalog, Bearer-adgang, streaming, værktøjskald og afviste kald er afprøvet gennem gatewayen med lokale kontrollerede HTTP-servere. Udbydervalgene er afprøvet i Electron på macOS. Ingen live-modelopgave mod Corti eller Mistral er gennemført; det kræver konto/nøgle og valgt model. Eksisterende installationspakker indeholder ikke disse kildeændringer før en ny bygning.


## Lokal modelopdagelse og projektforslag · 26. september 2026

AI-opsætningen søger efter en kørende Ollama på standardadressen på denne computer. Der søges ikke på netværket eller på Tailscale. Appen sender ingen prompt, starter ingen model og installerer intet. Brugeren vælger aktivt at gemme forbindelsen; en eksisterende forbindelse med samme type og adresse genbruges. Manglende server, tomt katalog og ugyldigt svar har hver sin forklaring. Andre adresser og API-udbydere tilføjes gennem den eksisterende forbindelsesdialog.

Modeller med cloudmarkører vises som mulige cloudmodeller. Fravær af markøren beviser ikke lokal databehandling. Modelvalg og datagennemgang gælder fortsat før første afsendelse.

Agenten får nu fælles instruktioner om at begrunde teknologivalg, bevare eksisterende kode, afklare behov for backend og login samt foreslå et konkret design. React/TypeScript, Astro og designbiblioteker er muligheder i samtalen, ikke nye indbyggede skabeloner. Agenten skal foreslå ét designvalg, tilbyde relevante alternativer og respektere brugerens valg før installation. Tailscale behandles separat som netværksadgang. Planlægningen omfatter også målplatform, offlinebrug, fælles data, login og valget mellem ingen backend, serverless, administrerede tjenester og egen backend. Native teknologier kan foreslås, men appen har ingen indbygget native bygning, simulator eller appbutiksudgivelse. Framework-servere startes fortsat særskilt.

Verifikation: Ti relevante automatiske tests består, inklusive HTTP-katalog og afviste redirects. Opstarten er kørt i Electron på macOS med kontrolleret Ollama-katalog og et faktisk prøveprojekt med preview. Ingen rigtig Ollama-model, Corti-opgave, Windows-installation eller kvalitetsvurdering af et modelgenereret design er afprøvet i denne milepæl. De nye agentinstruktioner er skrevet og koblet til afsendelsen; deres effekt kræver en live-opgave.
