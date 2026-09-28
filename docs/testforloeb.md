# Inviteret test af AI Harness

Formålet er at se, om en person uden udviklererfaring selv kan bygge, ændre og genfinde en lille app. Brug kun opdigtede oplysninger. En test af brugerfladen er ikke en godkendelse til at behandle kommunale personoplysninger.

## Før invitationen sendes

Vedligeholderen udfylder disse oplysninger for **den konkrete installationsfil**, ikke blot for kildekoden:

- Appversion, filnavn og SHA-256.
- Downloadlink, som testeren faktisk har adgang til. Repositoryet er privat; et GitHub-link kræver invitation og login.
- Afprøvet styresystem og arkitektur. En Windows-pakke bygget på en Mac er ikke en Windows-test.
- Mac-signatur og Apple-notarisation, eller den præcise begrænsning. Windows-signering angives særskilt.
- En navngiven model og udbyder, som har gennemført idé, plan, bygning og en efterfølgende ændring. Gratis adgang kan være begrænset af kapacitet og kvoter.
- Kontaktpersonen, som tager imod feedback. Brugeren behøver ikke oprette en GitHub-issue.

Udfyld først invitationen, når download og den aftalte model er afprøvet. Der er ingen grund til at bede en tester gætte endpoint, modelnavn eller arkitektur.

## Forslag til invitation

> Du er inviteret til at prøve AI Harness. Appen hjælper dig med at bygge en lille applikation ved at beskrive, hvad du vil have.
>
> Hent **[version og filnavn]** her: **[privat downloadlink]**. Den er afprøvet på **[system og arkitektur]**. **[Oplysning om signering/notarisation]**.
>
> Vi bruger **[model og forbindelse]**. **[Præcis adgangsvej: allerede startet Ollama eller API-nøgle indtastet i appen]**. Du skal ikke bruge GitHub eller en terminal for at bygge lokalt. Følg din arbejdsplads’ regler for installation og AI-adgang.
>
> Prøv fx: “Jeg vil lave en oversigt over tre fiktive mødelokaler, hvor jeg kan finde et lokale med plads til mit møde.” Brug opdigtede oplysninger, også når du afprøver resultatet.
>
> Send dine oplevelser til **[kontaktperson og kontaktvej]**. Fortæl, hvor du gik i stå, eller hvad du savnede. Appversion og en valgfri fejlrapport findes under Indstillinger → Hjælp og feedback. Send ikke API-nøgler eller arbejdspladsens data.

## Det testeren skal prøve

1. Installer og åbn appen uden terminalkommandoer. Gå gennem introduktionen, og forbind den aftalte AI. Prøv også at finde muligheden for at fortsætte uden AI.
2. Beskriv din idé med egne ord. Opret projektet i en mappe, du kan genfinde. Forklar med dine egne ord, hvad appen vil sende til modellen.
3. Læs AI’ens forslag, og bed om en ændring af planen. Byg derefter første udkast. Gennemgå eventuelle godkendelser, før du accepterer dem.
4. Prøv appen i preview på computer- og mobilbredde. Bed AI’en rette én konkret ting, og kontroller resultatet.
5. Gem en version via projektmenuen. Lav en ny ændring, gennemgå den tidligere version, og gendan den. Prøv derefter kopien fra før gendannelsen.
6. Skriv en kladde, luk AI Harness, og åbn projektet igen. Find kladden, samtalen og filerne.
7. Stop en AI-opgave. Beskriv, hvad du tror er gemt, og hvordan du vil fortsætte. Find Hjælp og feedback, og se fejlrapporten før eventuel deling.
8. Installer den næste testversion oven på den første, og åbn samme projekt. Kontroller filer, kladde, gemt designpakke og forbindelsesvalg. En nøgle kan kræve ny indtastning; nulstil aldrig systemets nøglering.

Test af React/Vite eller Astro omfatter også gennemgang af installation, start, mobilvisning, stop og genstart af preview. Apps med native platformskrav skal vurderes særskilt; denne test beviser ikke iOS-, Android- eller appbutiksunderstøttelse.

## Til den, der observerer

Bed testeren tænke højt. Start med opgaven, og undlad at fortælle, hvilken knap der skal trykkes på. Noter konkrete handlinger og formuleringer. Hvis du må forklare et trin, registreres det som hjælp, ikke som en selvstændigt gennemført opgave.

For hvert trin registreres: gennemført uden hjælp, gennemført med hjælp, eller ikke gennemført. Noter forventningen, det faktiske resultat og næste forsøg. Spørg til sidst, hvor projektet ligger, hvem der kan se det, hvem AI’en sender data til, og hvad en gemt version betyder.

Sproget vurderes ved at læse den faktiske plan og det færdige indhold. Noter engelske rester, sære ord, gentagelser og påstande om udførte tests. Design vurderes på læsbarhed, visuel sammenhæng, tastaturfokus, tomme tilstande og mobilvisning. En bestået kliktest kan ikke stå alene som sproglig eller visuel godkendelse.

## Fejl og opdatering

Fejlrapporten i appen indeholder faste statusfelter. Den medtager ikke samtaler, projektfiler, filstier, serveradresser, kontonavne eller nøgler. Brugeren vælger selv at gemme og sende den. Et skærmbillede kan derimod indeholde projektdata og skal gennemgås før deling.

Ved opdatering lukkes appen. På Mac erstattes appen i Programmer; på Windows køres installationsprogrammet igen. Projektmapper og appens lokale datamappe skal bevares. Test opdateringen med syntetiske projekter først. Der er ikke automatisk opdatering eller automatisk upload af fejlrapporter.

Gendannelse ændrer kun de filer, der vises i gennemgangen. HEAD, commits og index bevares. Nye filer uden for historikken, ignorerede filer, installerede pakker og eksterne databaser bliver ikke rullet tilbage. Kopien før gendannelse ligger i appens lokale datamappe; den er ikke en online sikkerhedskopi. Store filer, symbolske links, Git LFS og særlige Git-forløb kan kræve et almindeligt Git-værktøj.

## Gentagelige tekniske prøver

Læs byggevejledningen i [desktop/README.md](../desktop/README.md), før der pakkes. Kør fra `desktop/`:

```sh
npm test
npm run test:introduction
npm run test:resume
npm run test:recovery
npm run test:frameworks
```

`test:recovery` bruger rigtig Electron, OpenCode, HTTP, Git og projektfiler. Modelserveren leverer kontrollerede svar og fejl. Den kontrollerer gendannelse, fortrydelse efter genstart, forkert nøgle, kvote, afbrudt strøm, Stop, ny opgave og en lokal fejlrapport. Git-commits oprettes kun i nye syntetiske testrepositories.

Den eksterne modelprøve kræver et eksplicit modelvalg. Nøglen indtastes skjult og bruges kun til syntetiske projektdata. Testen accepterer kun OpenRouter-modeller og ruter med oplyst nulpris; ingen betalt fallback. Eksempel med et model-id, hvis det fortsat findes i kataloget:

```sh
HARNESS_LIVE_SCENARIO=tasks HARNESS_LIVE_MODEL=google/gemma-4-31b-it:free npm run test:openrouter
```

Scenarierne `rooms`, `tasks` og `activities` kontrollerer plan, filændring, funktion, efterfølgende ændring og mobilbredde. De er afgrænsede HTML-prøver. Gennemgå også `plan.txt`, `samtale.txt` og skærmbillederne; automatisk godkendelse af sproglig kvalitet er ikke indbygget.

Som standard afviser prøven alle kommandoer. `HARNESS_LIVE_ALLOW_INSPECTION=true` vælger i stedet et forløb, hvor testeren godkender et fast udvalg af `pwd` og `ls` i det syntetiske projekt. Prompten fortæller modellen om valget. Kommandokæder, installationer og andre kommandoer afvises stadig; filændringer er begrænset til `public/index.html`. Registrer valget sammen med resultatet, så prøver med forskellige tilladelser ikke blandes sammen.

Ollama eller en OpenAI-kompatibel server kan afprøves med samme scenarier. Vælg selv adresse og en installeret model med værktøjsstøtte. Kommandoen starter eller installerer ikke Ollama, modeller eller Tailscale:

```sh
HARNESS_LIVE_PROVIDER=ollama HARNESS_LIVE_URL=http://127.0.0.1:11434 HARNESS_LIVE_MODEL=MODEL_ID HARNESS_LIVE_SCENARIO=rooms npm run test:openrouter
```

Ved brug af `compatible` skal adressen omfatte API-basestien. Den automatiske prøve understøtter her kun egne servere uden nøgle; brug appens normale forbindelsesdialog, hvis serveren kræver en nøgle.

Pakkeprøve og opdatering på Mac, efter at begge versioner er bygget:

```sh
npm run test:package -- "release/beta.2/mac-arm64/AI Harness.app"
HARNESS_TEST_PACKAGE="release/beta.2/mac-arm64/AI Harness.app" npm run test:recovery
node scripts/verify-upgrade.cjs "release/mac-arm64/AI Harness.app" "release/beta.2/mac-arm64/AI Harness.app"
npm run release:site -- release/beta.2
```

Opdateringsprøven erstatter appen på samme sted i en midlertidig mappe. Den bruger samme isolerede appdata før og efter og kontrollerer projektfiler, forbindelsen, en syntetisk krypteret nøgle og gemte designpakker. En kladde kontrolleres også, hvis den gamle version understøtter kladdelagring. Prøven ændrer ikke den normalt installerede app eller brugerens projekter. Mac'en skal være låst op under de grafiske prøver.
