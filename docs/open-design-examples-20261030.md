# Open Design-eksempler i Aura

30. oktober 2026. Opdateret 2026-10-30T19:06:55.259Z.

**Afsluttet måling.** Alle fire model- og browserforløb har et registreret udfald. Afbrudte forløb er bevaret som fejl, ikke erstattet af nye forsøg.

## Integration

To lokale, statiske HTML/CSS-eksempler er gjort tilgængelige gennem Auras eksisterende hovedskill: landingpage og redaktionelt overblik. Kilderne er låst til Open Design Agent Kit revision 1c19ab3b6257761f96c94c7cba43b85d9354673a. Kittets MIT-notice og indholdets Apache-2.0 bevares med hashes og kildehenvisninger.

Modellen vælger selv et relevant eksempel og tilpasser det til opgaven og projektets dokumenterede brand. Eksemplerne har uvirksomme demohandlinger og skal derfor omsættes til rigtig funktionalitet og testes. Ingen scripts, netværksafhængigheder, MCP-server eller nye programafhængigheder følger med.

Det korte katalog leveres i den eksisterende referencepakke. Den er 11.947 bytes, under det uændrede loft på 12 KiB. Hele eksemplerne indlæses efter behov gennem de eksisterende skillreferencer; de påtvinges ikke alle projekter. En genereret side er modeloutput, ikke en ny standard for Auras eget UI.

UI, onboarding B, planer, projekttilpasninger, godkendelser, modelvalg og datakontrol bevares. Lange offentlige kildehenvisninger angives læsbart med repository, revision og relativ filsti hver for sig. Privacy Gates regler er uændrede.

## Afprøvning

Kildetest: 2011 bestået, 32 oversprunget, 0 fejl. Oversprungne tests tæller ikke som beståede.

Fire nye prøver med rigtig Mistral mistral-large-4-0 og Corti corti-s1 gennem native Electron, Aura Workbench, gateway og OpenCode 2.1.4. Før er commit 504a9c5 med den eksisterende Unparalleled/Oversight-metode. Efter har de to lokale eksempler. Der er ingen manuel reparation af modeloutput.

Alle fire bruger samme Kalundborg-opgave og fiktive aktiviteter med lokal demotilmelding. Budget pr. prøve: 40 faktiske modeltransportforsøg, 900 sekunders kumulativ agenttid, fælles kontekstloft 131.072 tokens, højst 32.000 svartokens pr. kald og én automatisk produktrettelse. Det er fælles forsøgsgrænser, ikke et beløbsloft eller modellernes normale maksimum. Ingen YOLO, shell, Git eller modelskift. Den konkrete planhash godkendes før bygning, og filændringer vurderes hver for sig.

Tolv funktionskriterier blev fastlagt før genereringen: demo, søgning med og uden match, kombinerede filtre, nulstilling, detaljer, påkrævede felter, tilmelding, genindlæsning, afmelding, mobil og runtime/netværk. Browseren afprøver det uændrede output ved 1440 × 900 og 390 × 844 med eksterne browserkald blokeret. Ikke relevante og ikke gennemførte checks er særskilte. Kildehashes kontrolleres før og efter.

| Prøve | Udfald | Funktionstest | Agentsekunder | Forsøg / forbrugsoplyste kald | Kendt USD |
| --- | --- | --- | ---: | ---: | ---: |
| Mistral før | Afbrudt modelsvar; ingen blind gentagelse | 1 bestået, 11 fejl, 0 ikke relevante, 0 ikke afprøvet | 662,745 | 23 / 21 | 0.383519 + ukendt forbrug |
| Mistral efter | 40-kaldsloft nået; kald 41 ikke sendt | 8 bestået, 3 fejl, 1 ikke relevante, 0 ikke afprøvet | 744,228 | 40 / 38 | 0.646993 + ukendt forbrug |
| Corti før | Ingen app leveret; startside bevaret | Ikke gennemførligt som appforløb; 11 mangler, 1 statisk runtimekontrol | 339,283 | 10 / 9 | 0.380548 + ukendt forbrug |
| Corti efter | Fælles tidsbudget på 900 sekunder nået | 12 bestået, 0 fejl, 0 ikke relevante, 0 ikke afprøvet | 902,079 | 20 / 17 | 1.528601 + ukendt forbrug |

Agenttid inkluderer plan og bygning samt tidligere forbrug ved genoptagelse. Rapportens JSON viser samlet vægtid og eventuel driverpause særskilt.



## Indlæsning af eksempler og konklusion

- Mistral før: Katalog i første modelkald: nej. Registrerede eksempellæsninger: 0.
- Mistral efter: Katalog i første modelkald: ja. Registrerede eksempellæsninger: 0.
- Corti før: Katalog i første modelkald: nej. Registrerede eksempellæsninger: 0.
- Corti efter: Katalog i første modelkald: ja. Registrerede eksempellæsninger: 0.

Ingen eksempellæsninger er registreret i de fire prøver. Eksempelkataloget blev leveret i efter-prøverne, men faktisk brug af de to filer blev ikke verificeret. Integrationen er derfor verificeret som tilgængelig reference, ikke som dokumenteret kvalitetsløft. Før-prøvernes transportafbrud og efter-prøvernes budgetstop er yderligere begrænsninger. Der er ikke kørt ekstra modelprompts eller manuelle rettelser for at opnå et pænere resultat.

Cortis tidsstop blev registreret efter 902,079 sekunder inklusive stophåndtering, 2,079 sekunder over den planlagte grænse. Grænsen blev ikke forlænget til mere modelarbejde.

Browserdriverens første efter-prøver kunne ikke klikke skjulte radioinput direkte og læste en navigation før hash-hændelsen var færdig. Selektorerne er rettet til de synlige labels og til at vente på den synlige visning. Browserprøverne blev kørt igen på byteidentiske modelartefakter uden nye AI-kald. De oprindelige driverresultater er bevaret.

## Genoptagelse og begrænsninger

En eventuel afbrudt testdriver ved afsluttet plan registreres som sådan. Genoptagelse bruger kun samme gemte plan, samtale, motor-session og konfigurationsfingeraftryk. Planprompten gentages ikke, tidligere tid og kald tæller videre, og originale fejlbeviser bevares. Afbrudt modelindhold gentages aldrig blindt.

Ingen særskilt genoptagelseskontrol er registreret endnu.

Kendte prisestimater er beregnet af udbyderrapporterede tokens og de kontrollerede satser. Mistral: 0,70 USD input, 0,07 USD cache, 2,10 USD output pr. million. Corti: 2,00 / 0,20 / 8,00 USD; ræsonnement tæller som output. Et forsøg uden fulde forbrugstal kan være faktureret. Rapporten viser derfor kendt delsum og ukendt total, aldrig nul for manglende forbrug. Det er estimater, ikke fakturaer. Kilder: [Mistral](https://docs.mistral.ai/inference/pricing), [Corti](https://docs.corti.ai/models/models).

Der er én episode pr. model og metode. Resultaterne kan ikke bevise en generel kvalitetsgevinst. Funktionstest er adskilt fra manuel visuel vurdering. En pladsholder er ikke et modeldesign. Denne native kodeprøve kvalificerer ikke en installeret DMG. Credentials, rå prompts, logs og privat lokal konfiguration indgår ikke i den delbare rapport.

## Dokumentation og risiko

Den saniterede [JSON-rapport](open-design-examples-20261030.json) og [CSV-oversigt](open-design-examples-20261030.csv) følger med koden. De faktiske desktop- og mobilbilleder samt den klikbare før/efterrapport bevares i det lokale diagnostikarkiv `open-design-ab-20261030` på JARVIS. Billedhashes er med i JSON; binære billeder og private prøveprofiler er ikke lagt i Git.

Begge passive eksempler blev også renderet direkte i Auras isolerede preview ved 1440 × 900 og 390 × 844: ingen eksterne ressourcekald og ingen vandret siderulning blev registreret. Det er en rendertest af referencerne, ikke en funktionstest af deres statiske knapper eller et tilgængelighedscertifikat.

Risikoen er, at modellen kan kopiere statiske demohandlinger eller vælge et irrelevant visuelt udtryk. Skillen kræver derfor opgavetilpasning, respekt for godkendt brand og konkrete funktionstests. Referencerne kan også blive ignoreret, som de blev i denne prøve. At gøre dem tilgængelige er ikke en kvalitetsgaranti.

Tilbagerulning: fjern de fire nye referencefiler og katalogafsnittene, gendan den tidligere skill, og genbyg eksportpakkerne fra den tidligere kildeversion. Der kræves ingen migrering af brugerdata eller ændring af samtaler, planer og godkendelser. Produktets runtime og UI er uændrede.
