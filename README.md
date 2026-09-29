# AI Harness

AI Harness er et udviklingsværktøj og en fælles arbejdsmetode til at bygge applikationer med AI, fra idé til drift. Vi henvender os til udviklere, IT-medarbejdere og teknisk interesserede kolleger i kommunerne, som vil have hjælp til at skrive kode og holde styr på et projekt.

Vi samler en fælles arbejdsmetode, vejledninger og instruktioner til kodeagenter. De skal hjælpe med opgaven, koden, afprøvningen og driften, herunder hvor data behandles, hvem der har adgang, og hvordan en anden udvikler kan overtage projektet. Desktopappen er én måde at bruge Harness på.

Du behøver ikke kunne kode en hel løsning fra bunden. Du skal være villig til at forstå de tjenester, du forbinder, gennemgå ændringer og afklare data og drift med din organisation. Harness skal gøre de valg lettere at træffe. Et Promte-abonnement er ikke nødvendigt; adgang og eventuel betaling til valgte AI- og hostingtjenester håndteres særskilt.

## To måder at bruge Harness

### Brug dit eget kodeværktøj

Behold Claude Code, Codex eller OpenCode, og brug Harness til at lære arbejdsgangen og give agenten fælles instruktioner. Du kan læse og tilpasse filerne uden at installere AI Harness eller forbinde en model til vores app.

De nuværende pakker indeholder grundregler om blandt andet Git, hemmeligheder og afprøvning samt en trinvis vejledning:

- [Claude Code](site/dist/downloads/claude/LAES-MIG.md)
- [Codex](site/dist/downloads/codex/LAES-MIG.md)
- [OpenCode](site/dist/downloads/opencode/LAES-MIG.md)

Webguiden og filerne findes i [hjemmesidens kilde](site/dist/). Automatisk installation fra repositoryet og eksport af det fulde skillbibliotek er endnu ikke implementeret.

Der findes også andre relevante værktøjer. Vi har undersøgt [ti alternativer og deres muligheder for fælles instruktioner](site/dist/vaerktoejer.html), herunder Cursor, GitHub Copilot, Gemini CLI og Pi. De er kandidater til videre afprøvning; vores nuværende downloadpakker dækker de tre værktøjer ovenfor.

### Brug AI Harness-appen

Appen samler samtale med din AI, kodeændringer, forhåndsvisning og versionsgemning. Du bruger din egen modelforbindelse, og projektfilerne ligger på din computer. Der er også hjælp til testudgivelse hos de hostingtjenester, der er understøttet.

Se [installation og opsætning](desktop/README.md) og [den konkrete teststatus](docs/teststatus.md). Appen er en testversion til inviterede brugere. Et komplet forløb fra download til drift er endnu ikke afprøvet på en almindelig testers egen computer.

## Hvad bygger appen på?

Vi har bygget vores egen **Electron-app** til Mac og Windows med **OpenCode som lokal kodeagent**. Vi bruger en fast OpenCode-version gennem en adapter og en særskilt konfiguration. Vi vedligeholder ikke en fork af OpenCode. AI-modellen vælges separat og kan køre hos en udbyder eller på en modelserver, brugeren har adgang til.

Harness tilføjer den guidede opstart, fælles instruktioner, modelforbindelser, godkendelser, forhåndsvisning, Git og hjælp til testudgivelse. Det følger det oprindelige forslag om at genbruge en agentmotor og bygge vores eget produkt omkring den.

Fælles organisationslogin, et revisionsspor med verificerede godkendere og en isoleret afvikling af hele kodeagenten er endnu ikke bygget. Pi er en mulig alternativ motor, som skal afprøves; det indgår ikke i appen. Se [det tekniske grundlag og vurderingen af Pi](docs/teknisk-grundlag.md).

## Hele vejen fra idé til drift

Det fælles Harness skal hjælpe brugeren med at:

1. **Afklare idéen.** Hvem skal bruge løsningen, hvad skal den kunne, og hvilke data behøver den?
2. **Vælge en egnet løsning.** Tag højde for kommunens eksisterende systemer, design, adgangskrav og muligheder for hosting.
3. **Bygge og kontrollere.** Bevar ændringshistorikken, beskyt nøgler, og afprøv funktioner, adgang og tilgængelighed.
4. **Udgive med et kendt ansvar.** Afklar databehandling og godkendelser, og kontrollér den faktiske tjeneste efter udgivelse.
5. **Vedligeholde eller overdrage.** Dokumentér opsætning, drift, opdateringer og gendannelse, så andre kan tage over.

Dette er produktets retning. Det fulde forløb er endnu ikke dækket af de nuværende downloadpakker. [Det faglige grundlag](docs/harness-grundlag.md) beskriver research, forslag til skills og de dele, der mangler.

## Kontrol over data og leverandører

Vi vil gøre datasuverænitet konkret: hvor data behandles og opbevares, hvem der kan tilgå dem, hvilke vilkår der gælder, og om kode og data kan flyttes til en anden leverandør. Det gælder både AI-værktøjet under udviklingen og den færdige apps database, hosting, logs og sikkerhedskopier.

Harness skal støtte kommunens arbejde med sikkerhed og GDPR. Instruktioner er dog ikke adgangskontrol eller en godkendelse til at behandle personoplysninger. Den konkrete løsning skal vurderes af kommunen og de relevante fagpersoner. Grundlaget beskriver [hvilke oplysninger og kontroller vi foreslår](docs/harness-grundlag.md#data-og-drift).

## Brug og tilpas de relevante dele

Grundregler beskriver det fælles ansvar. Skills beskriver bestemte arbejdsopgaver. Projektprofiler skal samle valg om teknologi, design og arbejdsgang. Kommuner og leverandører skal kunne bidrage med indhold og integrationer uden at være bundet til én model, Git-tjeneste eller hostingudbyder.

Appen har allerede redigerbare skills og lokale designpakker. Et fælles format til import, eksport og organisationsprofiler er stadig under udvikling. Målet er læsbare, versionsstyrede filer, hvor lokale tilpasninger bevares ved opdatering.

Koden, brugeren bygger, ligger i almindelige projektfiler. Med versionsstyring og den nødvendige dokumentation kan en udvikler overtage arbejdet uden AI Harness.

## Projekt og bidrag

Projektet tager udgangspunkt i kommunernes behov og kan også bruges i andre sammenhænge. Ambitionen er open source; licens og vedligeholdelsesansvar skal stadig aftales. Repositoryet er foreløbig privat, og GitHub Pages er ikke publiceret.

- [Bidrag med erfaringer, kode eller integrationer](CONTRIBUTING.md)
- [Læs research og forslag til det fælles Harness](docs/harness-grundlag.md)
- [Se de eksisterende instruktioner og skills](profiles/)
- [Byg og vedligehold hjemmesiden](docs/website.md)
- [Skriv tekster til projektet](docs/sprog.md)
