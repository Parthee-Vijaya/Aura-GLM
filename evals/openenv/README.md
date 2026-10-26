# OpenEnv-pilot til Auras eksisterende skills

Piloten tester den aktuelle Aura-kode med rigtige Mistral- og Corti-kald. Den ændrer ikke appens UI, funktioner, modelvalg, planer eller godkendelsesregler. Den er et separat udviklingsværktøj og indgår ikke i en DMG.

Den første gennemførte pilot er dokumenteret i [Resultater 25. oktober 2026](RESULTATER-2026-10-25.md). Seks gennemførte agentforløb er ikke seks fejlfri apps; rapporten adskiller de to resultater.

Den efterfølgende [madapp-sammenligning med samme task og skills](MODELSAMMENLIGNING-2026-10-25.md) dokumenterer Mistral, Corti og den blokerede GPT-6.1-Sol-adgang. Første udkast, produktets automatiske rettelser, browserfejl og transportproblemer rapporteres separat.

## Hvad der bliver afprøvet

Tre identiske opgaver til hver udbyder: borgermøder, tidsregistrering og lokalebooking. Hver episode omfatter:

1. Ny separat projektmappe og samtale med Auras eksisterende skills, herunder den obligatoriske designhjælp.
2. En konkret plan. Ingen ændringer i projektets offentlige filer må ske under planlægningen.
3. Godkendelse bundet til planens indhold og Auras normale delingsgennemgang.
4. Første rigtige byggeforsøg med godkendelse af hver enkelt filændring.
5. En ændringsanmodning, en ny plan og en ny godkendelse i samme samtale.
6. Browserkontrol og screenshots af de faktiske genererede filer på desktop og mobil.

OpenEnv **0.10.0** ejer episodeforløbet gennem `HarnessEnvironment.reset_async()` og `step_async(HarnessAction(...))`. `AuraAdapter` forbinder det til Auras uændrede `Workbench`, gateway og OpenCode-motor i Electron. Det er ikke en separat prompt direkte mod modellens API. Skillernes navne og indholdshashes samt kildecommit gemmes i resultatet. Grundmetoden er indlæst på forhånd af Aura; særskilte `skill`-værktøjskald registreres også, men fravær af sådanne kald betyder ikke, at grundmetoden manglede.

OpenEnv bruges her til evaluering. Piloten træner ingen model og bruger ikke OpenEnv som en ny sikkerhedssandbox. Produktets eksisterende godkendelser er fortsat de relevante grænser.

## Afgrænsning og testautoritet

- Projekterne indeholder fiktive eksempeldata, men modelkald, kodegenerering, værktøjshandlinger og browserprøver er rigtige. Kontrollerede protokoltests er tydeligt adskilt fra modelresultater.
- Testdriveren handler som en bruger inden for en fast forhåndsdefineret prøve: den gennemgår og godkender den konkrete plan og giver kun engangstilladelse til HTML/CSS/JS/JSON/SVG i det nye projekts `public/`.
- Auras validerede, konkrete filmål bruges. Symlinks, brede stier, beskyttede filer, eksterne mapper, shell, Git og netværksværktøjer godkendes ikke. YOLO aktiveres ikke. Et afvist kald bliver registreret, også hvis modellen kommer videre.
- Nøgler læses via Electrons rigtige `safeStorage`. Krypterede kilder læses uden ændringer; nøgler kopieres ikke til Python, kommandolinje, model, rapport eller nye indstillingsfiler. Tilføj ved behov en forbindelse manuelt i en separat profil med `open-corti.cjs`.
- Modelkald bruger kun den valgte gemte forbindelse. Ingen reserveudbyder. Højst det konfigurerede antal færdigrapporterede modelkald pr. episode og en tidsgrænse pr. trin; et allerede igangværende kald kan nå at blive afregnet. Pris opgøres kun, når Aura har prisoplysninger. Dette er ikke et garanteret beløbsloft.
- Testdriveren genafspiller ikke en fejlet handling. Auras egen genoptagelse bevares. Eventuelle fejlede episoder bliver stående i resultaterne.
- Projekter, lokale kilder og rapporter bevares. Modelarbejdere og lokale previewservere lukkes efter prøven.

## Kørsel på denne Mac

Brug Python 3.12 og de allerede klargjorte native afhængigheder under `desktop/`. OpenEnv og alle Python-afhængigheder er fastlåst i `uv.lock` og holdes i pilotens ignorerede `.venv`.

```sh
uv sync --frozen --python 3.12
uv run --frozen python -m unittest -v test_adapter.py
../../desktop/.runtime/darwin-arm64/node/bin/node --test policy.test.cjs
uv run --frozen python run.py --connections /absolut/sti/connections.local.json --output /absolut/sti/ny-proeve --provider mistral --repetitions 1
uv run --frozen python run.py --connections /absolut/sti/connections.local.json --output /absolut/sti/ny-proeve --provider corti --repetitions 1
../../desktop/.runtime/darwin-arm64/node/bin/node evaluate.cjs /absolut/sti/ny-proeve
../../desktop/.runtime/darwin-arm64/node/bin/node functional.cjs /absolut/sti/ny-proeve
```

`connections.local.json` indeholder kun henvisninger til gemte forbindelser, aldrig nøgler:

```json
{
  "turnTimeoutSeconds": 480,
  "maxModelCalls": 64,
  "targets": [
    {"provider": "mistral", "model": "MODEL_FRA_KATALOGET", "settings": "/separat/profil/harness/settings.json", "connectionID": "VALGT_FORBINDELSE"},
    {"provider": "corti", "model": "MODEL_FRA_KATALOGET", "settings": "/anden/profil/harness/settings.json", "connectionID": "VALGT_FORBINDELSE"}
  ]
}
```

Hver episode har sin egen mappe. Eksisterende episoder overskrives ikke. `--cases meetings time rooms` kan begrænse kørslen; `--repetitions 3` giver i alt ni episoder pr. udbyder. Kør begge udbydere for samme scenarier og antal gentagelser, før de sammenlignes. Valg af model skal findes i det aktuelle katalog. En vellykket katalogforespørgsel er ikke i sig selv en vellykket AI-prøve.

En target kan sætte `"effort": "low"`, hvis Auras aktuelle modelkatalog understøtter valget. Det går gennem Auras almindelige validering og registreres som en særskilt konfiguration. Hvis modellen svarer uden en plan, som Aura kan godkende, beder driveren højst én gang om de fire forventede overskrifter. Præciseringen tælles særskilt; driveren opfinder ingen plan og bruger ikke fri bygning som genvej.

`functional.cjs` giver exitkode 1 ved fejlede brugeropgaver. Det er et resultat om den genererede app, ikke nødvendigvis en fejl i OpenEnv-adapteren. Kontrollerede adapter-/politiktests står for sig selv. Browserprøverne tilpasser selectors til de observerede HTML-varianter; ingen genereret kode eller lagrede data ændres for at få et resultat til at bestå.

### Produktets automatiske kontrol med en rigtig model

`food_first_draft.py --quality-loop` tilslutter produktets `createAppQualityInspector` til den rigtige Workbench. Driveren sender fortsat kun idéforløbet, godkendelsen af den konkrete plan og én byggeanmodning. Produktet bestemmer selv, om en lokal kontrol skal føre til et af højst to rettelsesforsøg i samme opgave og samtale. Ingen ekstra testagent eller håndskrevet kode retter det genererede resultat. Hver filændring kræver stadig pilotens almindelige engangsgodkendelse.

```sh
uv run --frozen python food_first_draft.py --connections /absolut/sti/connections.local.json --refined-answer /absolut/sti/answer.json --output /absolut/sti/ny-proeve/mistral-food --provider mistral --quality-loop
```

En frisk prøve kan bruge `--raw-brief /absolut/sti/originaltekst.txt` i stedet for `--refined-answer`; derved arves ingen gamle farve- eller layoutforslag. `real_idea_refinement.cjs` kan først sende originaltekst og særskilte afklaringer gennem produktets rigtige `IdeaRefinement`; det gemmer svaret og kildehashes og ændrer aldrig den oprindelige forbindelsesprofil. Det er ikke tilladt at erstatte et mislykket modelsvar med et håndskrevet forslag.

Hvert faktisk kontrolpas gemmer sin fulde lokale rapport, screenshots og en uændret `public/`-kopi under `quality/` og `quality-snapshots/`. `quality-passes.json` forbinder dem med modeltrinnet. `build.json` indeholder desuden produktets afsluttende kvalitetsstatus, så et gennemført modelsvar ikke forveksles med en bestået appkontrol. Kildehashes registrerer den konkrete produkt- og evalkode.

Kontrollen er en afgrænset browserprøve af en statisk app med afbrudt netværk. Den er ikke en komplet ordretest eller en visuel vurdering af designet. Eventuelle efterfølgende brugerflowtests og en vurdering af screenshots rapporteres særskilt. En afvist handling kan forhindre automatisk rettelse; piloten udvider ikke tilladelserne for at omgå det. Første kodeudkast og eventuelle automatiske rettelser skal sammenlignes hver for sig.

## Vurdering

Hold følgende adskilt i rapporten:

| Dimension | Evidens |
|---|---|
| Første udkast | Visuel vurdering af de uændrede screenshots: hierarki, komposition, typografi, detaljer og mobiludgave |
| Funktion | Faktiske klik, formularer, søgning/filtrering, gemning, genindlæsning og sletning |
| Videre arbejde | Ændringsønsket gennemføres, eksisterende funktioner virker fortsat, og samtalen bevares |
| Tilladelser | Ingen filændring i planlægning; konkret planvalg og filgodkendelser registreret; afviste handlinger tæller med |
| Stabilitet | Afsluttede/fejlede episoder, varighed, kald, forbrug og fejltyper. Ét godt forsøg er ikke statistisk dokumentation |

`evaluate.cjs` måler blandt andet vandret afskæring, unavngivne kontroller, billedfejl og JavaScript-fejl. Det er ikke en komplet tilgængeligheds- eller sikkerhedscertificering. Funktionstests skal afspejle brugeropgaverne og dokumentere eventuelle selectors, der tilpasses modellernes forskellige HTML. Koden må ikke rettes manuelt for at få et AI-resultat til at bestå.

Vurderingen af design er menneskelig/visuel. Den må ikke udledes alene af, at der findes CSS, et hero-felt eller et bestemt antal farver. Ingen påstand om “flottere” uden en navngiven sammenligning.

## Begrænsninger

Dette tester Auras native eksekveringslag og det genererede produkt i browseren. Det erstatter ikke en fuld prøve af den installerede DMG, onboardingens klik, appens UI, organisationens datakrav eller modellens egenskaber på andre opgaver. Ingen API-nøgler, rå sessionsfiler eller lokal forbindelseskonfiguration må indgå i en offentlig PR. Kun gennemgået rapportmateriale og screenshots kan deles.

OpenEnv-interface: https://github.com/meta-pytorch/OpenEnv/tree/v0.10.0/src/openenv/core/harness

## GPT via en afgrænset Codex-testadapter

`codex_comparison_worker.cjs` kan køre samme native Workbench → plan → konkret plangodkendelse → OpenCode-værktøjer → kvalitetskontrol med `codex_bridge.cjs` som lokal modeltransport. Broen bruger præcis `gpt-6.1-sol` med low og den eksisterende Codex-adgang. Det er en evalueringsadapter; den tilføjer ingen ny forbindelse eller automatisk fallback i produktet.

Broen sender hele Auras request inklusive historik, skilltekst og værktøjsschemas. Modellen returnerer tekst og navngivne værktøjskald; Argumenterne bevares som typede objekter og valideres mod de oprindelige schemas, før de serialiseres én gang til Auras wireformat. Codex' egne værktøjer er slået fra. Auras godkendelser, filkontrol, Stop og planvalg ejer fortsat udførelsen. Broen har ingen egne genforsøg eller filskriveværktøj; Auras eksisterende afgrænsede transportgenforsøg kan stadig gælde. Hvert modelkald er afgrænset til fem minutter, og klientafbrydelse lukker den tilhørende proces.

Konfigurationen bruger `bridgeModule` til dette modul og kan bruge `bridgeDirectory` til en privat evidensmappe. Standardplaceringen er forsøgets egen `codex-bridge/`, aldrig kildekoden. Requestlogs og rå modeltekst skal forblive private; publicér kun gennemgåede rapporter. `codex_bridge.test.cjs` kontrollerer schemaer, præcis model, ugyldige kald, native værktøjsforsøg, timeout og afbrydelse uden replay.

En afprøvet kompakt variant med JSON inde i en argumentstreng blev forkastet efter tre konkrete escape-fejl i genereret JavaScript. Se [GPT-transportprøven](GPT-TRANSPORT-2026-10-25.md). Den endelige adapter med typede objekter er afprøvet med rigtig GPT: appen består 26 browserkontroller, men agentforløbet ramte sin samlede frist efter to modeltimeouts og nåede ikke Auras egen kvalitetskontrol. GPT-stabilitet er derfor fortsat ikke løst.

**Efterfølgende rettelse og prøve:** [Fem kommunale landing pages](MUNICIPAL-LANDINGS-2026-10-25.md) dokumenterer den rettede adapter med eksplicit deaktivering af værtens implicitte skills, plugins og hukommelse, streng kontrol af ukendte hændelser, korrekte procesafslutninger og indholdsfri tids-/størrelsesmålinger. Alle fem Plan/Byg-forløb gennemførte med Auras egne skills og godkendelser; 79 modelkald havde ingen timeout. Tidligere forsøg og modellens fejlede læsninger er fortsat dokumenteret.

Modellens kendte ressourcestier skal kopieres præcist; broen omskriver ikke værktøjsargumenter og genafspiller ikke handlinger. Én kendt CLI-advarsel om et forældet konfigurationsnavn registreres som diagnostik; ukendte fejl eller native handlinger afvises. En afsluttet proces kan ikke efterfølgende markeres som afbrudt af klienten. Kaldets deadline forbliver afgrænset, og kun afsluttede, validerede svar giver evaldriveren fremdrift.

Denne isolerede sammenligning tester Auras gennemgåede skillbibliotek. Tilladelsen til at kombinere tilgængelige designskills er dokumenteret i [designvejledningen](../../docs/aura-design-skill.md); den genaktiverer ikke computerens øvrige værktøjer eller skills i evalueringen og påstår ikke, at GPT/Claude-modeller automatisk medbringer platformens skills.

## Kommunale designkilder

[Kommunal designprøve med Mistral og Corti](BRAND-MODELS-2026-10-25.md) sammenligner samme borgermødeopgave, 11 skills og Nyborgs originale logoer. Rapporten indeholder desktop-/mobilbilleder, konkrete flowfejl, sanitiserede JSON/CSV-resultater og afgrænsningen mellem officielle logoregler og modellernes egne designvalg. Mistrals reparationsforsøg blev stoppet af pilotens tilladelsesbedømmelse; det er en dokumenteret begrænsning, ikke en skjult eller rettet fejl.
