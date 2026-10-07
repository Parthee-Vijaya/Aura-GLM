# Aura: gennemgang før den første brugertest

7. oktober 2026 · arbejdsmappe baseret på `e1dbf96` med endnu ikke committede ændringer · kandidat `0.2.0-beta.4`.

Aura har et sammenhængende lokalt byggeforløb, som er afprøvet på faktiske filer med den rigtige agentmotor. Gennemgangen har rettet konkrete problemer ved første brug, tastaturbetjening og datagennemgang. **Det er endnu ikke en publiceret, installationsklar udgivelse til andre computere.** Den aftalte Corti-model, installation på testpersonens computer og adgang til den konkrete download skal stadig kontrolleres. Brugerforståelse skal undersøges i selve piloten.

Det er en gennemgang af produktets forløb, skærme, relevante kodeområder og test-/udgivelsesvej. Det er ikke en formel sikkerhedscertificering, fuld WCAG-revision eller en garanti for AI-genereret kode.

## Hvad der er gennemgået

Projektregler, UX-plan, designstandard, beslutninger, dokumentation, Electron-opstart, preload/IPC, arbejdsområde, agent-/modelsessioner, projektfiler, tilladelser, preview, rettelser, versioner, samtidige samtaler, deling, fejlrapport, pakning, runtime og hjemmeside. Før ændringerne blev 44 skærmtilstande målt og set. Første brug uden AI blev desuden prøvet som et særskilt forløb. Efter ændringerne er skærme og relevante forløb kontrolleret igen.

Der er brugt isolerede testprojekter med faktiske HTML-, React/Vite- og Astro-filer, rigtige udviklingsservere og OpenCode 1.18.33. Modelsvar og hosting-API'er er kontrollerede testdata. Native filvælgere får kontrollerede svar. Git-versioner og lokal Git-overførsel sker kun i syntetiske testrepositories. Ingen brugerprojekter eller deres Git-historik er ændret af prøverne.

## Vurdering af det samlede brugerforløb

### Første start, idé og AI-adgang

De to brugsveje er tydelige: byg i Aura, eller installer instruktioner i eget kodeværktøj. Store kort og ét spørgsmål ad gangen giver en rolig start. Den lokale demonstration kræver ingen model. Idéfeltet er rummeligt; de tre idéeksempler ligger bag ét link. Projektoprettelse kræver hverken GitHub eller en terminal, og navnekollisioner overskriver ikke eksisterende mapper.

Den vigtigste observerede blindgyde var fortsættelse uden AI: Vælg AI og Send åbnede en tom modeldialog, mens Tilføj forbindelse lå i det avancerede lag. Begge handlinger åbner nu forbindelsesguiden direkte, når ingen forbindelse findes. Vælg senere bevarer kladden. En gemt forbindelse bruger fortsat modeldialogen; Aura anbefaler ingen model eller udbyder.

API-adgang er stadig et reelt krav til en ekstern AI. En vejledning kan hjælpe med konto og nøgle, men kan ikke erstatte testerens aftalte adgang eller arbejdspladsens regler. Ifølge beslutningen fra 1. oktober er første runde på Mac med Corti S1. Den beslutning ændres ikke af denne gennemgang.

### Afklaring, plan og bygning

Samtale og arbejdsflade bliver stående ved siden af hinanden. Planen kan læses og rettes; Byg første udkast er en eksplicit handling. Brief, svar og plan er adskilt, og en afbrudt eller forældet plan bliver ikke bygget. Skift mellem faner bevarer previewets tilstand og beskedkladden. Agenten overtager ikke brugerens valgte fane.

De automatiske prøver beviser overgangen gennem den rigtige motor og de faktiske filændringer. De beviser ikke, at Corti selv stiller gode spørgsmål, skriver en tilstrækkelig plan eller bygger en brugbar app med de seneste ændringer. Den seneste daterede Corti-prøve fra 1. oktober kan ikke bruges som en ny beta.4-godkendelse.

### Godkendelser, aktivitet og fejl

Godkendelser viser handling, mål og konsekvens; AI'ens begrundelse er markeret som dens egen. Diff og rå oplysninger ligger under detaljer. Venter på dig, Stop og fejl har konkrete veje videre. Aktivitet viser faktiske værktøjer, output og afslutningskoder. Ingen kommando er lig med ingen kørt test; et indlæst preview er ikke en funktionstest.

Afvisning, afvisning med besked, forkert nøgle, kvote, afbrudt strøm, Stop og genoptagelse er kørt. Kommandoers forklaring er et gæt ud fra teksten, ikke en sikkerhedskontrol. En godkendt kommando kører med brugerens OS-rettigheder. Piloten skal undersøge, om testpersonerne faktisk forstår Tillad, Afvis og Fortryd.

### Preview og rettelser

Det neutrale preview siger, når første version endnu ikke er klar. Det viser ikke en opdigtet færdig app. Frivillig Ret i siden markerer et konkret element, og en direkte tekstændring eller et AI-mål kan gennemgås og fortrydes. Valgt indhold og filhenvisninger står synligt før afsendelse.

Statisk HTML samt understøttede Vite-/React- og Astro-forløb er prøvet med rigtige filer og servere. Tekst, der ikke kan knyttes sikkert til en kilde, skal afvises. Previewet er isoleret fra appens privilegier, men en fungerende browservisning beviser ikke database, login, alle skærmstørrelser eller andre platforme. Aura har ikke et native-app-preview eller en fuld editor.

### Ændringer, versioner og fortrydelse

Resumé før linje-diff og et tydeligt sammenligningsgrundlag gør ændringer forståelige. Samtidige brugerrettelser bliver ikke automatisk tilskrevet AI'en. Versionsbilleder er bundet til den faktiske version og visning; et manglende billede forklares frem for at blive opfundet. Omdøbning i Aura omskriver ikke Git-historikken.

Fortryd og gendannelse er prøvet på faktiske filer, også med senere brugerrettelser og konflikt. En ny fejl blev fundet i pakkeprøven: Gem version var aktiv, før den avancerede filgennemgang var afsluttet. Knappen venter nu på læsningen; prøven forsinker den faktiske læsning for at bevise, at låsningen aktiveres. Appen bliver ikke til et generelt Git-værktøj, og beskyttede eller for store filer kræver fortsat særskilt gennemgang.

### Navigation, flere samtaler og kopier

Sidepanelets projekter og samtaler, ny samtale med + og kommandopaletten gør genoptagelse konkret. Godkendelser og status tilhører den samtale, der arbejder. Samtidige opgaver i samme projekt bruger en særskilt kopi, når projektmappen er optaget; Flet ind gennemgår forskellene og bevarer brugerens linjer ved den anbefalede konfliktløsning.

Kopier, konflikt, genstart, Stop, oprydning og separate Vite-/Astro-servere er prøvet. Det er stadig værd at observere, om førstegangsbrugere forstår projekt kontra kopi. Derfor er flere samtidige opgaver en valgfri opfølgning i den første brugertest. Der er ikke foretaget en belastningsprøve med mange store projekter; uflettede kopier bruger lokal lagerplads.

### Kode, aktivitet og tekniske oplysninger

Kode er skrivebeskyttet tekst med filvalg og filhenvisninger. Det giver mulighed for indsigt uden at tvinge førstegangsbrugeren ind i en editor. Aktivitet kan forklare ventetid og fejl. Begge er nyttige som støtte, men bør ikke være påkrævede trin i det første testforløb. Model, udbyder, indsats, tokens og prisoverslag står fortsat ved skrivefeltet.

### Data, tilladelser og tillid

Før du sender viser modtager, behandlingssted, træning, pris og delt materiale. En vigtig formulering er rettet: den samme AI-session kan allerede bruge tidligere beskeder og værktøjsresultater. Det er nu synligt i første lag. Tilvalget hedder Medsend en ekstra kopi af tidligere samtale; det er ikke en kontakt, der slår AI'ens hukommelse fra. Ny samtale starter et nyt forløb. Første besked påstår heller ikke længere, at en endnu ikke eksisterende plan sendes.

Konkrete `.env`-/Git-stier, private referencer, symlinks, hemmelighedsindhold og uvalgte skills er prøvet som afvisningsinputs. Fejlrapporten indeholder ikke projektindhold eller kladde og sendes ikke automatisk. Disse kontroller er afgrænsede tekniske prøver, ikke en OS-sandbox eller en godkendelse af persondata. Testpersonerne skal bruge opdigtede oplysninger og deres godkendte AI-adgang.

### Tilgængelighed og layout

Velkomst og demonstration refererede til en skjult overskrift. Dialogens tilgængelige navn følger nu den synlige overskrift. Featurekontakter og automatisk versionsgemning har eksplicitte navne. Lukning af indstillingsdialoger giver fokus tilbage til en synlig åbner, når browseren ellers efterlod fokus på BODY. Hjælp har en foldet guide til den første app; udvikleretiketten er blevet Testversion.

Tastatur, synligt fokus, Escape, faneskift, reduceret bevægelse og 980 × 720 med 150 % zoom er kørt. Vinduesbilleder tages gennem Electron: Playwrights tidligere zoom-billede klippede fejlagtigt. Det var en fejl i målingen, ikke dokumentation for klippet UI. De 44 skærmes afgrænsede DOM-kontrol finder efter rettelserne ingen unavngivne kontroller, skjulte dialogtitler, dublerede ID'er eller dokument-overløb. VoiceOver og en fuld kontrast-/WCAG-gennemgang er ikke udført; DOM-kontrollen tæller ikke som sådan.

### Deling og distribution

Deling adskiller version, destination, kontoadgang, udbyderkvittering, anonymt HTTP-svar og faktisk filmatch. Ret destination kræver en ny gennemgang. En gammel succes bliver ikke ved med at se aktuel ud efter en ny fejl. De nuværende kontrollerede hostingprøver er kørt; ingen ekstern upload er foretaget.

Installationssiden bruger nu samme koboltfarve som appen og forsiden. Fem websidetyper er bygget fra faktiske GitHub-metadata og afprøvet på computer og mobil. Metadata den 7. oktober viser stadig et privat repository, nul releases og HTTP 404 for Pages. Beslutningen om en senere offentlig GitHub-udgivelse er altså endnu ikke gennemført. Siden opfinder ikke downloadfiler eller adgang.

En lokal beta.4-pakke er bygget fra en eksplicit filliste og fastlåst runtime. Alle faktiske appinputs er versionsstyrede, men arbejdsmappeændringerne er endnu ikke reproduceret af CI. Det nye demo-forløb og enhedstest er føjet til pakke-workflowet; den ændrede workflow-kørsel er kun skrevet. Aktuel pakkeafprøvning og kontrolsummer står i teststatus.

## Afhængigheder og sikkerhedsafgrænsning

`npm audit` rapporterer ni berørte afhængighedsposter: otte moderate og én høj, uden kritiske. De følger af to advisories i byggeværktøjets afhængighedskæde: [http-cache-semantics](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) og [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c). De aktuelle advisories angiver ingen rettet version. En foreslået blind nedgradering af electron-builder er ikke gennemført.

Appens faktiske ASAR er inspiceret: ingen `node_modules`, tests, scripts, `.env`, `http-cache-semantics` eller `sprintf-js` er pakket i appens kodearkiv. Det er ikke en afgrænsning af hele distributionen: en efterfølgende kontrol finder også `http-cache-semantics 4.2.0` i det medfølgende npm. Kandidaten indeholder derfor fortsat et bibliotek omfattet af det høje advisory i sit installationsværktøj. Den konkrete fejl ved cache mellem forskellige autentificerede HTTP-svar er ikke reproduceret gennem npm her; ingen privat registry eller adgangsnøgle er brugt i framework-prøverne. Der er ikke dokumenteret en rettet version eller en fuld afhjælpning. Medfølgende Node/npm/OpenCode/Git er ikke fuldt sikkerhedsrevideret her. Værktøjernes fastlåste versioner og licenser følger pakningen. Byggeadvarslerne skal følges op, når en rettet kompatibel kæde foreligger.

## Før testpersonerne installerer

1. Gennemgå og commit kilde, nye prøver og dokumentation; brug repositoryets CI/CD til den udgivelse, der skal deles. Lokal pakning er ikke en observeret CI-udgivelse.
2. Gennemfør idé → plan → bygning → rettelse → fortrydelse med den aftalte Corti S1 og en nøgle indtastet af brugeren. Se både den genererede app og modellens svar; katalogadgang alene er ikke nok. Ingen ny rigtig modelnøgle er indtastet i denne gennemgang.
3. Kontroller den konkrete Mac-pakkes Developer ID-signatur, notarisation, SHA-256 og installation på en anden computer efter arbejdspladsens politik. Den lokale kandidat er uden Developer ID-signering/notarisation. Kontrol af DMG-integritet er ikke en Gatekeeper-installationsprøve.
4. Afprøv det faktiske downloadlink fra en testers konto, og send version, platform, AI-adgang og kontaktvej sammen med [testmaterialet](demo-til-testere.md). Ændring af repositoryets synlighed eller publicering er ikke udført her.

Brugerobservationen er pilotens formål, ikke en forudsætning om, at den allerede skal være gennemført. Når adgang, model og installation er kontrolleret, kan de første personer inviteres; deres faktiske observationer udfylder milepæl 7's sidste kriterium. Der er ingen foreslået ny funktionsmilepæl før denne pilot.

## Hvad piloten skal besvare

Kan personen komme fra egen idé til en brugbar app uden hjælp? Forstår de, hvad der sendes til AI, og hvad Tillad betyder? Finder de rettelse og Fortryd uden at frygte datatab? Kan de lukke og finde projektet igen? Er modeladgang, ventetid eller kopier den største hindring? Registrer den konkrete situation og ordlyd; en samlet tilfredshedsscore alene kan ikke vise, hvad der skal rettes.

Detaljeret evidens og præcise afgrænsninger står i [teststatus](teststatus.md). Det korte materiale til personerne står i [Demo til testere](demo-til-testere.md); den eksisterende [observationsguide](testforloeb.md) bruges af den, der følger testen.
