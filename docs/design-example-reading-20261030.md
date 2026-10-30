# Læs designeksemplet før et nyt UI

30. oktober 2026. Afsluttet måling, inklusive registrerede fejl og fortsættelser.

## Problem og efterprøvet årsag

Begge tidligere modeller modtog kataloget, men kaldte ikke skillværktøjet og læste ikke eksemplerne. Det er efterprøvet i deres gemte native værktøjsforløb. Vejledningen gjorde eksemplet valgfrit og sagde samtidig, at hovedskillen allerede var indlæst. Kun et ekstra skillkald viste filernes præcise runtime-stier. Dermed blev det let at arbejde videre uden eksempelindhold.

En særskilt lokal prøve med den låste OpenCode 2.1.4 viser, at skillværktøjet og læsning af den aktive reference virker med de eksisterende tilladelser. Det er en rigtig motor med en kontrolleret localhost-model, ikke en prøve af en rigtig models designkvalitet. Native V2 bruger inputfeltet id. Et lokalt kald med name blev afvist; et kald med id indlæste skillen og referencen. Ingen af de tidligere rigtige modeller havde et sådant afvist skillkald; hovedårsagen til deres manglende læsning var vejledningen. Auras aktivitetsadapter forventede desuden stadig name og kunne derfor overse et korrekt native id-kald.

## Rettelse og bevarelse

- Et kort læsetrin står først i Auras kontekst ved et nyt UI: hent hovedskillen med det korrekte native ID, vælg selv ét relevant eksempel og læs den præcise filsti fra skillresultatet. Et allerede læst eksempel genbruges i samme samtale.
- Skillen og det korte katalog beskriver samme fremgangsmåde. Modellen bestemmer stadig design, brandtilpasning og eventuel forkastelse af eksempeludtrykket. Der vælges ingen fast palette eller opgaveskabelon.
- V2-adapteren bevarer id og tilføjer name til Auras eksisterende aktivitetsformat, både i livehændelser og genoprettede snapshots. Native input ændres ikke.
- Idéhjælp uden værktøjer påtvinges ingen værktøjskald. Ved vedligeholdelse genbruges godkendt UI. Ingen nye fil-, netværks-, værktøjs- eller YOLO-tilladelser, automatisk installation eller modelskift.

UI, onboarding B, funktioner, kontekst, planer, godkendelser, datakontrol og isolation bevares. Eksempelkoden og licenserne er uændrede. De 23 eksportpakker er genbygget fra kilden.

## Afprøvning

To regressionstests blev skrevet før rettelsen og fejlede. De består efter rettelsen. De målrettede 37 tests for designkontekst, referencebudget, passiv levering og V2-adapter består.

Fuld kildekontrol: 2013 bestået, 32 oversprunget og 0 fejl. Den endelige TAP-udskrift bevares lokalt. En fejl i testfixturets opsamling af HTTP-bytes ved lange tekster med danske tegn er rettet separat; assertions og produktets HTTP-transport er uændrede.

Begge nye forsøg bruger rigtige modeller gennem native Electron, Aura Workbench, Privacy Gate, gateway og OpenCode 2.1.4: mistral-large-4-0 og corti-s1. Før-rækkerne genbruger de to seneste faktiske prøver, som blev bevaret før læserettelsen. De er ikke kørt eller repareret igen.

Samme opgave: “lav en landingpage til kalundborg kommunes aktivtets kalender for familier”. Samme afklaringer og fiktive data. Scenario SHA-256: f198ecba1ef840795f75d41b8aecb1eb733582159a6300ae986bdf572a26bbe3. Samme loft pr. episode: 40 faktiske modeltransportforsøg, 900 sekunders kumulativ agenttid, 131.072 konteksttokens, 32.000 svartokens pr. kald og højst én produktrettelsesrunde. Samme budget betyder ikke samme faktiske tokenforbrug.

Bekræftet eksempellæsning kræver både afsluttet read af en hashkontrolleret fil og tre karakteristiske kodelinjer fra samme kilde i et efterfølgende modelkalds værktøjsresultat. Katalogtekst i systemprompten tæller ikke. Begge nye modeller har denne bekræftelse for open-design-landing.md.

| Prøve | Bekræftede eksempler | Faste funktionskriterier | Agentsekunder | Modelkald | Kendt USD |
| --- | ---: | --- | ---: | ---: | ---: |
| Mistral før | 0 | 8 bestået, 3 fejl, 1 ikke relevante | 744.228 | 40 | 0.646993 + ukendt |
| Mistral efter | 1 | 11 bestået, 0 fejl, 1 ikke relevante | 621.67 | 32 | 0.671726 |
| Corti før | 0 | 12 bestået, 0 fejl, 0 ikke relevante | 902.079 | 20 | 1.528601 + ukendt |
| Corti efter | 1 | 1 bestået, 11 fejl, 0 ikke relevante | 840.358 | 17 | 1.497318 + ukendt |

Browserprøven bruger de samme tolv kriterier: demo, søgning med og uden match, kombinerede filtre, nulstilling, detaljer, påkrævede felter, tilmelding, genindlæsning, afmelding, mobil og runtime/netværk. Native vinduer ved 1440 × 900 og 390 × 844, eksternt browsernetværk blokeret, og genereret kilde og afslutningsbevis hashkontrolleret før og efter. Modelfilerne repareres ikke manuelt. Formularfri tilmelding giver ikke en bestået feltvalidering; kontrollen markeres ikke relevant.

## Afbrud og fortsættelser

Mistrals testdriver blev stoppet ved en afsluttet plan efter en callback-fejl. Samme gemte plan, samtale og motorsession blev verificeret med 12 kontroller før genoptagelse. De første syv kald og 122,115 agentsekunder tæller videre. Planprompten blev ikke sendt igen.

Cortis byggesvar blev afbrudt efter modtaget indhold, før nogen appfiler var ændret. Der blev ikke foretaget en blind gentagelse. Samme allerede registrerede motorsession blev genoptaget med en særskilt fortsættelsesbesked efter kontrol af identitet, plan og uændrede filer. 12 yderligere kontroller binder genoptagelsen. De første 12 kald og 370,824 agentsekunder tæller videre. Et indledende forsøg på at binde genoptagelsen til det afsluttede engines live-ID blev afvist før noget nyt modelkald; den tidligere registrerede sessionsidentitet blev derefter efterprøvet mod den gemte samtale. Alle oprindelige fejlbeviser er bevaret. Driverpauser står særskilt i JSON, og samlet vægtid inkluderer dem.

## Pris og begrænsninger

Prisen er et estimat af rapporterede tokens, ikke en faktura. Manglende forbrug er ukendt, ikke nul. Mistral: 0,70 USD input, 0,07 cache og 2,10 output pr. million tokens. Corti: 2,00 / 0,20 / 8,00 USD; ræsonnement tæller som output. Kilder kontrolleret 30. oktober 2026: [Mistral](https://docs.mistral.ai/inference/pricing), [Corti](https://docs.corti.ai/models/models). Native skillkontrakt: [OpenCode 2 Skills](https://dev.opencode.ai/v2/docs/skills/).

Én episode pr. model og variant. Eksempellæsning er ikke det samme som godt design. Mistrals nye resultat har fungerende søgning og en mere kompakt åbning, men fortsat et generisk kortgitter og meget luft i filterpanelet og mobilåbningen. Æstetisk vurdering er manuel og holdes adskilt fra funktionskontrollerne. Et generelt designløft kan ikke udledes af denne prøve alene.

Corti leverede ingen ny app i denne episode. To byggesvar blev afbrudt, og kun en pladsholder samt et ubrugt logo er bevaret. Den ene beståede browserkontrol er pladsholderens statiske runtime; den er ikke en bestået appfunktion eller designscore. Denne prøve viser derfor ikke et æstetisk kvalitetsløft hos Corti.

Saniteret [JSON](design-example-reading-20261030.json) og [CSV](design-example-reading-20261030.csv) følger med koden. Faktiske før/efterbilleder og den klikbare rapport reading-comparison.html bevares i diagnostikarkivet design-example-recovery-20261030 på JARVIS. Kildehashes binder de historiske før-prøver og billederne. Rå prompts, ræsonnement, credentials, private indstillinger og browserprofiler er ikke i Git. Denne kildeprøve kvalificerer ingen installeret DMG.

Tilbagerulning: gendan forrige designvejledning og V2-adapter, og genbyg eksportpakkerne. Ingen brugerdata, planer eller godkendelser skal migreres eller slettes.
