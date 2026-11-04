# Aura Prime: reference fra den installerede app

Beslutning den 4. november 2026. Brugeren har afvist den første visuelle implementering og krævet en gennemgang af DeepSeek-appen fra installation og første start til indstillinger, skjult sidebar og integreret logo. Den konkrete reference er den installerede DeepSeek Harness 0.2.1-rc.5 på macOS. Opstart er gennemført med en separat tom profil, og den officielle DMG er læst uden at erstatte brugerens installation.

## Direction contract

THESIS: Aura åbner som en lokal arbejdsapp med en enkel indgang og en samtale i centrum. Den faktisk installerede reference bestemmer kompositionen. Auras funktioner og onboarding bevares.

OWN-WORLD: Neutral hovedflade, lysere sidebar, systemtypografi, gennemgående eget Aura-symbol og wordmark, blå valg og sendeknap. Logoet står på fladen. Settings bruger én centreret ramme med venstrenavigation, rækker og eget scrollområde.

STORY: Brugeren starter uden konto, vælger eventuelt en lokal profil og forbinder sin AI, når den skal bruges. Indstillinger gemmes på computeren. Datagennemgang og tilladelser følger fortsat de eksisterende controllere.

FIRST VIEWPORT: Første rene opstart er et faktisk native 600×700-vindue med brand øverst, velkomst midt på fladen og få handlinger nederst. Afslutning udvider til normal arbejdsramme; senere genåbning af introduktionen gør ikke vinduet kompakt igen. I arbejdsområdet ligger brand under den native titelbar i en 280 px sidebar. Ny samtale står centreret med projekt og tilstand over composeren. Sidebaren forsvinder helt ved skjul, og en åbnknap bliver synlig i titelbaren. Højre panel åbnes ved behov.

FORM: Brugerens navngivne, installerede reference. Ingen konceptkonkurrence. seed: none (unavailable).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Funktionelle bindinger

Ingen Aura-konto eller login. Profilnavn og ikon er valgfrie. Et fravalg gemmer ikke OS-brugernavn eller ugemt identitet og huskes lokalt. Lokal konfiguration bruger det eksisterende lager. Forbindelser, projekter, hjælp, detaljeniveau, modes, plan, filgodkendelser, datakontrol, isolation og YOLO-grænser bevares. Der er ikke bestilt kontosynkronisering eller eksport/import af config.

## Evidens

Referencebilleder og observationsrapport ligger i `/Users/parthee/aura-prime-redesign-20261104/reference-app/`. Billeder fra brugerens eksisterende samtaler må ikke flyttes ind i repositoryet. Testbilleder fra Aura skal bruge syntetiske projekter. Den tidligere slutvurdering er ikke brugeraccept af denne retning.


## Surfacebrief og aktuel implementering

Dette er den bestilte, udviklingsinterne kompositionskontrakt for `desktop/ui/index.html` med mode **Operate**. Den [registrerede surfacebrief](../../desktop/.impeccable/surfaces/desktop-ui-index-html.md) henviser hertil og genfindes af Impeccable-CLIen. Relaterede flader er arbejdsområde, velkomst, opsætning og indstillinger. Dokumentet må ikke indlejres i rendererens HTML, kommentarer, metadata eller bundles. [DESIGN.md](../../desktop/DESIGN.md) registrerer de faktiske globale tokens; [design.json](../../desktop/.impeccable/design.json) indeholder supplerende metadata og komponentudsnit. Den fastlagte Direction contract ovenfor er fortsat retningen; dette afsnit beskriver implementeringen, ikke ny brugeraccept.

Den første redesignrunde og [redesign-20261104.md](redesign-20261104.md) er historik efter brugerens afvisning. Det oprindelige [DESIGN-arkiv](archive/design-before-20261104.md) er bevaret uændret. Der er ikke kopieret private referencesamtaler eller referencebilleder ind i repositoryet.

Den aktuelle kode bruger 280 px sidebar som grundmål, 44 px titelbarrække og et transparent Aura-symbol på selve fladen. Skjult sidebar har bredde 0 og ingen ikonrail; åbn og Ny samtale findes øverst i hovedfladen. Eksisterende gemte bredder og desktopvalget bevares.

Ny tom samtale viser Aura-brand, projekt og arbejdsmåde over en centreret composer med 24 px radius og blå Send. En kladde alene bliver i centrum. Når der er beskeder, dokkes den samme composer-node nederst. Værktøjspanel lukkes midlertidigt ved nytom start uden at gemme et nyt panelvalg; eksplicit brugeråbning går gennem den eksisterende controller. Samtale/Arbejdsspor leder til samtalen og den eksisterende Aktivitet. Versioner, Projektmenu, Udgiv, Kodeværktøjer og Introduktion findes under Flere muligheder med deres oprindelige aktiveringsregler.

Første rene opstart bruger en faktisk native BrowserWindow på 600×700 med minimum 520×620 og resize/maksimering/fuld skærm slået fra. Velkomstindholdet fylder den kompakte ramme uden indvendig modalradius eller skygge. Ved afslutning bliver vinduet normalt: resize/maksimering/fuld skærm slås til, minimum bliver 980×720, grundmål 1440×940, og vinduet centreres og maksimeres. Opsætning og indstillinger er derefter højst 800×680 CSS-px med 66 px header, 174 px navigation og rullende indhold. Ved 680 px reduceres navigationen; ved 440 px lægges den over indholdet.

`core/onboarding-window.cjs` bruger booleanen `desktopWelcomeComplete` i det eksisterende lokale Store. Markøren er adskilt fra navn, ikon, profilfravalg, adgang og samtykke. Uden markør starter migreret profil, eksisterende projekter eller forbindelser i normal ramme. Ren, uafsluttet velkomst gentages kompakt efter genstart. Afslutning gemmer true atomisk. Senere Vis introduktion gør ikke en etableret installation kompakt. Boolean-IPCen `window:onboarding` læser ved true og afslutter/udvider ved false gennem den eksisterende main-frame/sendergrænse.

Interne projekt-/samtalerefreshes bruger `reveal:false`, så de ikke genåbner panel eller omskriver gemt panelOpen. Eksplicit panel-/fanevalg bevarer den almindelige persisterende controller.

Lokal profil er altid findbar, også uden navn/ikon. Kom i gang og Fortsæt uden profil har deres reelle controllere. Profilfravalg huskes, OS-brugernavn foreslås ikke, og ugemte profilfelter må ikke gemmes ved senere afslutning. Alle ti udbydere, hjælp, arbejdsdetaljer, lokal AI, nøglehjælp, idé og kodeværktøjsvejen består. Der er ingen kontosynkronisering eller ny konfigurationseksport.

## Lokal start og kontrol

Brug Node 24 først på hele PATH. Åbn med en ny profil frem for den almindelige brugerprofil:

```sh
cd /Users/parthee/ai-harness-work/desktop
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
aura_native_profile="$(mktemp -d -t aura-native-preview)"
env -u ELECTRON_RUN_AS_NODE ./node_modules/.bin/electron . --user-data-dir="$aura_native_profile"
```

Vælg også en syntetisk projektmappe ved manuel oprettelse. Kontroller velkomst, lokal profil/skip/relaunch, alle indstillingssektioner, tom samtale/kladde/beskeder, sidebar skjul/genåbn/relaunch, Flere muligheder, eksplicit panel, fokusretur og reduceret bevægelse. Prøv begge temaer, manuelt mørkt på lyst OS, mindst 1280 og 980 CSS-px samt stressbredderne 720/520/480. Stressbredder opnås i testharnessen; hovedvinduets normale minimum er 980×720. Skærmbilleder fra rendererens indhold kvalificerer ikke macOS' native systemknapper.

Fra repositoryroden kan de eksisterende, målrettede Node-prøver køres uden at ændre produktet:

```sh
PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test desktop/tests/profile-step.test.cjs desktop/tests/profile-chip.test.cjs desktop/tests/settings.test.cjs desktop/tests/dsh-polish.test.cjs desktop/tests/ui-frame.test.cjs desktop/tests/ui-sidebar-d1.test.cjs desktop/tests/viewport-layout.test.cjs desktop/tests/permission-menu-binding.test.cjs
```

## Kvalifikation og historik

Den tidligere uafhængige native genprøve lukkede NF-01 og NF-02 med qualified PASS for netop panelpræferencen og det kompakte førstestartsvindue. De tidligere Node 24-resultater med en ZIP-bytefejl er historiske. De låste ZIP-arkiver består med den medfølgende Node 22.23.3; ingen arkiver eller reproducerbarhedskrav er ændret.

Den 4. november er den samlede aktuelle kode kontrolleret med Node 22.23.3: 2.680 tests, 2.646 bestået, 34 skips og ingen fejl. Den separate prepush-gennemgang lukkede PF-01 om eksplicit Arbejdsspor i en tom samtale og PF-02 om den opdaterede versionspin. Den målrettede genprøve havde 24/24 beståede tests.

Den nye visuelle kontrol dokumenterer faktisk native opstart, lokal projektoprettelse, arbejdsområde, skjul/genåbning af sidebar og indstillinger i begge temaer. Profilikonernes forskydning er rettet og målt igen i den genstartede app. Se den aktuelle [QA-rapport](visual-qa-20261104.md) for screenshots, målinger og grænser. Dette kvalificerer ikke en DMG, Windows, betalte modelkald eller GitHub CI og udgør ikke brugerens samlede designaccept.
