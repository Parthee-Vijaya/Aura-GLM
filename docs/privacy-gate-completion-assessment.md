# Privacy Gate — integration og acceptstatus

> Historisk afprøvningsrapport fra arbejdet før commit/push. Ejeren har efterfølgende godkendt integration i sin egen fork; se [samlet ændring og aktuel verifikation](feedback/2026-10-26-merge-overview.md). Testtal og datidens leveringsstatus nedenfor bevares som historik.


**Arbejde påbegyndt 25. oktober 2026.** Brugeren har bekræftet integration i den aktuelle `Parthee-Vijaya/ai-harness`-fork. Kildebasis er `1d48bc4ba8c84454ee219dc2617f5bd2e09a03ab`; arbejdet ligger separat på `work/privacy-gate-followup`. Den ældre Aura-1/Code-OSS-kode og originalens PR’er ændres ikke. Dette er kilde- og testarbejde, ikke en ny udgivet eller installeret DMG.

Videre OpenEnv-modelsammenligning og OpenSandbox-produktvalg er [gemt til senere](deferred-openenv-sandbox.md). Den lokale isolation nedenfor er nødvendig for Privacy Gate og er ikke en OpenSandbox-integration.

## Implementeret i den aktuelle fork

| Leverance | Sammenhængende produktvej |
|---|---|
| 1. Kontrol af modelkald | Idéhjælp og projektchat bruger samme regelmotor. Den kontrollerer hele den endelige forespørgsel før første afsendelse og ved genforsøg. Konkrete delinger kan gennemgås i det tidligere godkendte Privacy Gate-UI. |
| 2. Hybridarbejde | Workbench → ChatSession → separat lokal forberedelse → kontrolleret cloudhjælp → lokal samling. Modellerne har hver sin historik og sit arbejdsområde. Plan-ID, værktøjsgodkendelser, Stop og genstart bevares. |
| 3. Håndhævet isolation | Hele den versionslåste OpenCode-motor og dens børn kører under macOS Seatbelt. Cloudkopien filtreres før start, netværket begrænses til den konkrete gateway og motorens egen kontrolport, og en native hjælper bekræfter processtop før filtilbageførsel. Statiske browserprøver kører i en særskilt proces uden netværk. |

Den første samlede kvalifikation nedenfor brugte OpenCode **1.18.33**. Den efterfølgende opgradering til **2.1.4**, migrationsgrænser og nye testresultater dokumenteres særskilt i [OpenCode 2-opgraderingen](opencode-2-upgrade.md). Der er ikke skiftet design, onboarding, modelleverandør eller almindeligt godkendelsesflow som led i integrationen.

## Sikkerhedskrav og bevis

| Krav | Konkret kontrol |
|---|---|
| Første besked og vedhæftninger | Native Workbench-prøver afviser beskyttet tekst og en gennemgået privat vedhæftning med **nul cloudmodelkald**. |
| Hele samtalen | Gate-tests omfatter historik, værktøjsresultater, kodede værdier, filnavne og genforsøg. Separate modelpartitioner med krypterede Aura-session-snapshots forhindrer automatisk sammenblanding; OpenCodes egen tilstand ligger i adgangsbegrænsede lokale mapper. |
| Idé bliver til projekt | Regler og krypterede oplysninger om beskyttelsesniveau overføres før første projektfil. Ændrede regler eller beskadigede beskyttelsesoplysninger afbryder oprettelsen, før privat tekst skrives uden beskyttelse. |
| Privat kilde og syntetisk uddrag | Hybridprøven læser en syntetisk privat CSV lokalt. En administrativt tilladt transformation laver generiske kolonnenavne og fiktive rækker, som gennemgås igen før cloudhjælp. Originale canaryværdier ses ikke på cloudforbindelsen. CSV-frigivelse arver beskyttelsen fra projekt, mappe og kildesporing og bindes til filidentitet, bytes og regler; samtidige ændringer og symlinkforsøg afvises. |
| Cloud kan ikke læse originalerne | Faktisk OpenCode med en eksplicit værktøjstilladelse kan stadig ikke læse en hostfil uden for sin afgrænsede kopi. Symlink- og underprocestests kontrollerer samme grænse. |
| Netværk kan ikke omgå gatewayen | Native prøver kontrollerer IPv4, IPv6, DNS, andre loopbackporte og Unix-sockets. Browserprøven forsøger HTTP, WebSocket og WebRTC/STUN uden browserstubs; den kontrollerede modtager registrerer ingen afsendelse. |
| Godkendelser kan ikke genbruges forkert | Tests ændrer payload, formål, modtager, konto/rute, kilde og regelversion. Gamle godkendelser afvises. Organisationens loft og strengt beskyttet materiale kan ikke tilsidesættes med almindelig accept eller YOLO. |
| Lokal fejl giver ingen cloudreserve | Native hybridprøve afviser den lokale model og registrerer nul cloudkald. Manglende isolation/kryptering stopper også behandlingen. |
| Lokal viderebehandling | Det konkrete valg “Behandl lokalt” stopper og ruller cloudkopien tilbage, før den konfigurerede lokale model overtager. Både idéhjælp, cloud med datakontrol og hybrid er prøvet. Lokal- og cloudhistorik holdes adskilt; pris, model og kontekstvindue følger det faktiske trin. |
| Stop, genstart og sideeffekter | Native motorprøver genoptager efter Stop med bevaret historik og opgavekontekst. Et gennemført lokalt hybridtrin gentages ikke. Gemmefejl efter filtilbageførsel afstemmes uden nye modelkald eller gentagne værktøjsgodkendelser. Journal og filer synkroniseres før kvittering. Ukendte skrivende processer efter et nedbrud giver fortsat en lås. |
| Lokal Git og versionshistorik | Beskyttet Git har ingen netværksadgang, hooks, filtre eller signeringsprogrammer. Native prøver bevarer checkpoints og godkendt gendannelse og afviser aktivering efter et uisoleret Git-hook med et løsrevet barn. |
| Planer og normale godkendelser | Native Workbench-forløb gennemfører Plan → valgt plan-ID → Byg → konkret filgodkendelse. De eksisterende Electron-prøver af planlægning og godkendelser består separat. |

## Afprøvning

Den afsluttende samlede gennemkørsel gav **1.355/1.355 beståede desktop-tests, nul fejl og nul oversprungne tests** på **183,60 sekunder**, inklusive de native produkt- og isolationstest samt de afsluttende rettelser til lokal viderebehandling og genoptagelse. Kørsel: `AURA_PRIVACY_NATIVE=1 node --test --test-concurrency=1 desktop/tests/*.test.cjs` med den versionslåste Node 22.23.3. Verificeret:

- 17 native Privacy Gate-produktprøver med den rigtige motor og kontrollerede HTTP-modelsvar, inklusive lokal overdragelse og genoptagelse.
- 27 native Git-, publishing- og egress-tests samt 59 CSV-regressioner.
- 28/28 CLI-tests. Npm-pack dry-run omfatter 189 filer, inklusive alle privacy-moduler og den native helpers kilde; private konfigurationer og testrapporter er ikke med.
- Fem native delingsdialogscenarier: Annuller og manglende lokal model sender nul modelkald; Godkend sender præcis de viste bytes én gang; ændret modtager ugyldiggør review; et reelt lokalvalg og en opfølgende besked giver to lokale kald, nul cloudkald og adskilt historik.
- 57 uafhængige adversarielle prøver af lokale overdragelser, krypteret journal, filtilbageførsel og historik. Disse indgår også i den samlede desktop-suite og skal ikke lægges oven i dens testantal.
- Native eksisterende planlægnings-UI: 11 checks, inklusive spørgsmål, egne svar, planændringer, Stop, genstart og 980 × 720.
- Native eksisterende godkendelses-UI: 8 checks, inklusive fil-diff, kommandogodkendelse, afvisning med besked, Stop/fortrydelse og forbindelsesfejl.
- Native Privacy Gate-UI: tre arbejdsformer, gemte regler, bevaret arbejdsområde/kladde og ingen rendererfejl.

De samlede logs, screenshots, kontrollerede HTTP-resultater og hashoversigten over de lokale ændringer ligger i den lokale rapportmappe `Aura1/ReleaseReports/privacy-gate-followup-20261025/`. `verification-summary.json` angiver de afsluttende beviser; tidligere gennemkørsler er bevaret som historik. De to særskilte UI-testprofiler er fjernet efter verificeret kopiering af 11 screenshots. Produkt- og sikkerhedstestene rydder deres egne syntetiske profiler op. Lokal kildekode og brugerprofiler er bevaret.

Dette er sikkerheds- og funktionsprøver med syntetiske data. De anvender den rigtige native motor, browser og OS-isolation; modelsvarene er kontrollerede, så de faktisk sendte bytes kan bevises. Ingen rigtige borgerdata, eksterne API-nøgler eller nye betalte modelprøver er brugt.

## Genoptagelsens præcise grænse

En ren Stop med bekræftet processtop kan fortsættes ved en ny, eksplicit brugerbesked. Tidligere vellykkede trin og den afbrudte opgaves kontekst bevares. Der er ingen automatisk genstart efter Stop.

En allerede påbegyndt filtilbageførsel kan kun færdiggøres ved samme oprindelige besked og fulde plan samt uændrede regler, modtager og filgrundlag. Ændret opgave eller manuelle filændringer afvises. Et ukendt nedbrud før holdbar kvittering for processtop kræver særskilt afklaring; Aura antager ikke, at andre skrivende processer er væk.

## Afgrænsninger, som skal stå tydeligt

- Native kvalifikation gælder **macOS på Apple Silicon**. Andre platforme stopper beskyttet arbejde, hvis den kvalificerede isolation mangler. Ingen Windows-/Linux-/Intel- eller notariseringspåstand.
- Faste regler og lokal mønstergenkendelse er ikke en garanti for at finde alle personoplysninger eller sammenhænge. En generel lokal klassifikationsmodel og automatisk OCR er ikke leveret. Ukendt materiale sendes ikke automatisk til cloud.
- Beskyttet statisk browserkontrol understøtter screenshots, desktop/mobil og simple klik. **Interaktiv beskyttet livepreview og generelle beskyttede pakkeinstallationer er endnu ikke understøttet.** De afvises frem for at køre uden isolation. Almindelige projekters eksisterende funktioner bevares.
- Hosting, deploy, Git-push og øvrige eksterne handlinger uden en fuldstændig kontrolleret adapter afvises i beskyttede projekter. Den fælles adapterkontrakt kan udbygges uden at give en generel netværksundtagelse.
- Aktivering afvises, hvis Aura har startet en uisoleret agent, installation, server eller risikabel Git-handling i samme projekt og app-session. Det er ikke opdagelse eller isolation af andre allerede kørende programmer. Et nyt arbejdsområde skal beskyttes før første kørsel.
- “Kun lokal” gælder opgavens behandling. Appens separate automatiske opdateringstjek kan fortsat kontakte opdateringstjenesten uden projektdata.
- Beskyttede Git-worktrees med en ekstern `.git`-pegefil afvises; der gives ikke automatisk adgang til metadata uden for projektets filgrænse.
- Modellen får ikke ret til at ændre reglerne. Lokalitet og administrative frigivelser kræver betroet profilkonfiguration, adskilt fra projektfiler og modelværktøjer. Se [opsætningsvejledningen](privacy-gate.md).
- Appens almindelige lokale samtalevisning, OpenCodes egen tilstand og projektfiler følger lokal lagring. Krypterede Aura-session-snapshots og proveniens er ikke et løfte om fulddiskkryptering eller beskyttelse mod en kompromitteret administrator/kernel.

## Leveringsstatus

Før en senere DMG skal `runtime:prepare` og frisk verifikation af den færdige pakke køres. Det eksisterende runtime-manifest er bevaret; kilde- og CLI-pakkeprøver kvalificerer ikke i sig selv en installeret app.

Koden og rapporterne bliver i den lokale arbejdsgren. Ingen commit, push, PR-oprettelse, merge eller DMG/release er foretaget som del af denne opgave. Eksisterende brugerprojekter, credentials og lokal kildekode bevares.
