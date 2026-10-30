# Cortis transportafbrud før tekst og værktøjer

30. oktober 2026. Transportrettelse i kildekoden, afprøvet på macOS. Ingen ny DMG, installeret app eller udgivelse.

## Problem og efterprøvet årsag

En rigtig Corti S1-prøve fejlede i sit 17. fysiske modelkald. HTTP-strømmen blev lukket med `UND_ERR_SOCKET` efter 21,124 sekunder, 1.319 pakker og 327.352 bytes. Der var ingen afslutningsmarkør eller forbrugsrapport. Native OpenCode registrerede `provider.transport` og kun en delvis intern beregning på 12.448 tegn, ingen tekst eller værktøjskald fra dette svar.

Aura havde videresendt indledende metadata straks. Strømmen var derfor allerede markeret som afleveret til motoren, og den eksisterende regel mod blind gentagelse stoppede opgaven. Login og modelkatalog virkede. Det var ikke Auras samlede deadline.

En separat rigtig protokolprøve med højst 16 svartokens fastlagde Cortis tomme metadata: `prompt_token_ids: null` og `prompt_text: null` på startpakken samt `token_ids: null` på beregningspakker. Der blev kun gemt felttyper og forbrug, ingen nøgle eller svartekst.

## Rettelsen

- Kun Cortis kendte indledende metadata og interne beregning holdes tilbage fra agentmotoren i en buffer på cirka 4 MB. Den eksisterende aktivitetsvisning får fortsat tællere og status. Ingen nye rå beregninger vises.
- Før tekst, værktøjsinstruktioner eller ukendt indhold er afleveret til motoren, kan den eksisterende transportmekanisme genforsøge samme uforanderlige kald. Hvert forsøg kontrolleres igen af Privacy Gate. Der er fortsat højst tre forsøg inden for samme deadline.
- Første tekst, værktøjsinstruktion, afvisning, ukendt felt, ikke-tom ekstra metadata eller overskredet buffer afleverer strømmen. Derefter er gentagelse forbudt. Udførte handlinger og afleverede svar bliver ikke gentaget.
- En fuldstændig protokolmarkør afslutter nu leveringen uden at vente på en efterfølgende HTTP-lukning. En særskilt kontrolleret prøve viste ellers en falsk transportfejl efter et korrekt `[DONE]`. Det konkrete rigtige Corti-afbrud havde ingen afslutningsmarkør; de to fejltilfælde holdes adskilt.
- `finish_reason` alene afkorter ikke strømmen. Forbrugsrapporten og den fulde afslutning bevares. Et ufuldstændigt svar bliver ikke til en succes.

Model, udbyder, indsats, prompts, designskills, værktøjstilladelser, planvalg, YOLO, Privacy Gate, onboarding B og hostens godkendte UI er uændret. Mistral får ikke beregningsbufferen. Ingen nye afhængigheder, installationer eller rettigheder.

## Kildekontrol og kontrolleret native prøve

De første 19 nye regressionstests gav 9 fejl før rettelsen. Efter kvalificering af de observerede metadata består de 39 målrettede transporttests, inklusive de eksisterende tests. Fuld kildekontrol med låst Node 22.23.3: **2.035 bestået, 32 oversprunget, 0 fejl**.

En særskilt prøve bruger rigtig OpenCode 2.1.4 og gatewayen med en kontrolleret localhost-model. Første svar afbrydes under beregning med samme metadataform som Corti. Motoren får én brugerbesked, beholder samme session og viser én konkret godkendelse. Filværktøjet gennemføres én gang. Der bruges tre fysiske modelkald: det afbrudte forsøg, filkaldet og det afsluttende svar. Denne fejl er simuleret; den er ikke en prøve af en rigtig models designkvalitet.

## Samme opgave med rigtig Corti

Opgaven er fortsat “lav en landingpage til kalundborg kommunes aktivtets kalender for familier”. Scenario SHA-256: `f198ecba1ef840795f75d41b8aecb1eb733582159a6300ae986bdf572a26bbe3`.

Samme frosne designskills, samme Corti S1, samme fiktive data og samme loft pr. episode: 40 fysiske modelkald, 900 agentsekunder, 131.072 konteksttokens, 32.000 svartokens pr. kald og højst én produktrettelsesrunde. Alle kald går gennem native Electron, Aura Workbench, Privacy Gate, gateway og OpenCode. Modelfilerne er ikke repareret manuelt.

| Prøve | Agentresultat | Agenttid | Fysiske kald | Observeret prisestimat |
| --- | --- | ---: | ---: | ---: |
| Før transportrettelsen | Afbrudt, kun pladsholder | 813,172 sek. | 17 | 2,273548 USD plus ukendt |
| Kvalificeret rettelse | Bygningen afsluttet normalt | 874,507 sek. | 18 | 1,678650 USD |

Den sidste native assistentbesked afslutter med `stop`, og Aura går til `idle`. Der opstod intet nyt socketafbrud i den sidste rigtige episode. Automatisk genoprettelse er derfor dokumenteret i den tilsvarende native fejlprøve, ikke ved et naturligt afbrud i denne sidste modelkørsel.

Den faktiske app består **11 browserkontroller, 0 fejl og 1 ikke relevant** ved 1440 × 900 og 390 × 844: demo, søgning med og uden match, kombinerede filtre, nulstilling, detaljer, lokal tilmelding, genindlæsning, afmelding, mobil og runtime/netværk. Tilmeldingen er formularfri; feltvalidering er derfor ikke relevant, ikke bestået. Ingen JavaScript-/konsolfejl eller eksterne netkald i det afprøvede forløb. Modellens filer og afslutningssporet er hashkontrolleret uændrede før og efter browserprøven.

Produktets kvalitetskontrol har fortsat advarsler om små tekster og trykflader. Det store åbningsfelt skubber filtrene langt ned på mobilen. Resultatet er ikke en påstand om færdig designpolering.

### En testdriver-fejl står åben

Den strenge live-driver registrerer stadig `permission_reply_failed` ved en afvist grep-anmodning. **Råresultatet er bevaret som fejlet og er ikke omdøbt til en grøn kørsel.** Native værktøjsdata viser, at alle tre berørte grep-værktøjer blev afvist med `permission.rejected`; agenten afslutter normalt, og browserprøverne består. Den præcise callback-undtagelse blev ikke gemt, så dens årsag er ikke fastslået. Det er en særskilt testdriver-fejl, ikke et nyt observeret transportafbrud. Ingen godkendelsesregel er ændret for at få prøven til at bestå.

## Kvalificering, pris og bevis

To startede kvalificeringer blev stoppet, da rigtige pakker viste ekstra tomme metadatafelter. De bevares særskilt i udgiftsoverblikket. En direkte genoptagelse blev afvist før nye modelkald, fordi Aura gør planen læsbar uden at være bygbar efter en afbrudt appproces. Sessionen og samme plan i `lastPlan` er bevaret. Denne kontrol blev ikke omgået; den endelige episode er frisk med eget uændret budget.

Forbrug er opsamlet fra alle rapporterede gateway-pakker, også sammenfatninger. Den første fejlprøve har rapporter fra 16 af 17 kald. Dens interne samtaletæller havde ikke alle sammenfatninger med, så dens viste delestimat er lavere. Den sidste episode har forbrugsrapporter fra alle 18 kald. Dette bidrag ændrer ikke produktets forbrugstæller.

Samlet kendt modelestimat for hele undersøgelsen, inklusive kvalificeringer og den lille protokolprøve: **4,559662 USD plus ukendt forbrug fra tre afbrudte kald**. Ukendt er ikke nul. Prisen er ikke en faktura. [Cortis priser](https://docs.corti.ai/models/models), kontrolleret 30. oktober 2026: 2,00 USD input, 0,20 USD cache og 8,00 USD output pr. million tokens. Intern beregning indgår allerede i API'ets `completion_tokens` og tilføjes ikke to gange. [Cortis protokol](https://docs.corti.ai/api-reference/corti-models/chat/create-chat-completion).

Den lokale rapport `corti-transport-20261030/comparison.html` har faktiske før/efterbilleder, mobilbilleder, JSON, CSV, testudskrifter og særskilt beskrivelse af driver-fejlen. Rå prompts, beregninger, credentials og testprofiler er ikke i Git. Én episode pr. variant viser ingen generel design- eller hastighedsgevinst.

## Mistral og bevaring

Brugeren foretrækker Mistrals før-design fra den foregående prøve. Det bevares som foretrukken visuel reference i rapporten. Bedre funktionstal for efter-udkastet er ikke dokumentation for bedre æstetik. Denne transportrettelse ændrer ingen designprompt eller skill og bruger ingen nye betalte Mistral-kald.

Originalens PR'er, primær arbejdskopi, projekter, kontekst, planer, godkendelser og nøgler bevares. Lokal kode, worktrees, testkode og rapporter slettes ikke. Tilbagerulning består i at gendanne de to transportmoduler. Der er ingen datamigration.
