# AI Harness

AI Harness er et udviklingsværktøj og en fælles arbejdsmetode til at bygge applikationer med AI, fra idé til drift. Vi henvender os til udviklere, IT-medarbejdere og teknisk interesserede kolleger i kommunerne, som vil have hjælp til at skrive kode og holde styr på et projekt.

Vi samler en fælles arbejdsmetode, vejledninger og instruktioner til kodeagenter. De skal hjælpe med opgaven, koden, afprøvningen og driften, herunder hvor data behandles, hvem der har adgang, og hvordan en anden udvikler kan overtage projektet. Desktopappen er én måde at bruge Harness på.

Du behøver ikke kunne kode en hel løsning fra bunden. Du skal være villig til at forstå de tjenester, du forbinder, gennemgå ændringer og afklare data og drift med din organisation. Harness skal gøre de valg lettere at træffe. Et Promte-abonnement er ikke nødvendigt; adgang og eventuel betaling til valgte AI- og hostingtjenester håndteres særskilt.

## To måder at bruge Harness

### Brug dit eget kodeværktøj

Behold det kodeværktøj, du bruger i dag, og giv det AI Harness' grundregler og 12 skills til arbejdet fra idé til drift. Der er pakker til 23 kodeværktøjer, blandt andet Claude Code, Codex, OpenCode, Cursor, GitHub Copilot, Gemini CLI, Mistral Vibe og Zed. Lovable får en tekst til platformens egne felter.

- [Læs, hvad hver skill gør, og hvad den ikke gør](profiles/SKILLS.md). Samme oversigt findes som webside i [skills.html](site/dist/skills.html).
- [Se, hvor filerne lægges i hvert værktøj](site/dist/vaerktoejer.html), og hvordan du kontrollerer, at de er indlæst.
- [Hent pakken til dit værktøj i webguiden](site/dist/index.html).

Der er tre måder at installere på: med AI Harness-appen, ved at bede din egen kodeagent følge vejledningen i pakken eller manuelt. Udviklere med adgang til repositoryet kan også bruge kommandolinjen:

```bash
node scripts/harness.cjs install --tools claude-code,cursor --project ../mit-projekt
```

Installationen viser de præcise ændringer, før noget skrives. Eksisterende filer overskrives aldrig: Harness tilføjer et afgrænset afsnit i fx `AGENTS.md` og `.gitignore` og springer ændrede filer over. `.harness/installation.json` registrerer version og kontrolsummer, så en opdatering eller fjernelse kun rører uændrede filer. Skillsene indeholder kun tekst, ingen scripts og ingen værktøjstilladelser.

I Claude Code og OpenCode er det afprøvet med en kontrolleret modelserver, at grundregler og skills bliver sendt til modellen. De øvrige værktøjer følger deres officielle dokumentation. Hvor godt en bestemt model følger instruktionerne, er ikke målt.

### Brug AI Harness-appen

Appen samler samtale med din AI, kodeændringer, forhåndsvisning og versionsgemning. Du bruger din egen modelforbindelse, og projektfilerne ligger på din computer. Der er også hjælp til testudgivelse hos de hostingtjenester, der er understøttet. Ved første start vælger du mellem at bygge i appen og at lægge Harness i dit eget kodeværktøj; begge veje kan åbnes igen senere.

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

Grundregler og skills ligger i [profiles](profiles/) som læsbare filer, og [kataloget](profiles/catalog.json) beskriver hvert værktøjs filplaceringer. Lokale tilpasninger bevares ved opdatering. Organisationsprofiler med kommunens egne krav og standardvalg er endnu ikke bygget, og appens egen agent bruger fortsat sine egne instruktioner i `profiles/app`.

Koden, brugeren bygger, ligger i almindelige projektfiler. Med versionsstyring og den nødvendige dokumentation kan en udvikler overtage arbejdet uden AI Harness.

## Projekt og bidrag

Projektet tager udgangspunkt i kommunernes behov og kan også bruges i andre sammenhænge. Ambitionen er open source; licens og vedligeholdelsesansvar skal stadig aftales. Repositoryet er foreløbig privat, og GitHub Pages er ikke publiceret.

- [Bidrag med erfaringer, kode eller integrationer](CONTRIBUTING.md)
- [Læs research og forslag til det fælles Harness](docs/harness-grundlag.md)
- [Se de eksisterende instruktioner og skills](profiles/)
- [Byg og vedligehold hjemmesiden](docs/website.md)
- [Skriv tekster til projektet](docs/sprog.md)
