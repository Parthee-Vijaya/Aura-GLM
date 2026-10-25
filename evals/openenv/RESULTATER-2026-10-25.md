# OpenEnv-pilot · Aura 1 · 25. oktober 2026

Piloten er gennemført med rigtige Mistral- og Corti-kald gennem Auras eksisterende native motor. De seks afsluttende forløb gennemførte plan, bygning, ændringsplan og ændring. De genererede apps er **ikke alle fejlfrie**, og designmålet om et gennemarbejdet første udkast er endnu ikke stabilt opfyldt.

Ingen produktfiler, UI, onboarding, skills eller godkendelsesregler er ændret. Piloten ligger alene i `evals/openenv/`. Ingen commit, push eller DMG blev lavet som del af denne undersøgelse.

## Metode og afgrænsning

- Kilde: `293670ca8b23fd7eab32e1dd190e3e6bb135c9fa`, Aura 1 beta 0.3.1, OpenCode 1.18.33. OpenEnv 0.10.0, Python 3.12 og repoets native Electron/Node-afhængigheder.
- Tre fælles opgaver: borgermøder, tidsregistrering og lokalebooking. Hver opgave bygges og får derefter et konkret ændringsønske i samme samtale. Én gentagelse pr. opgave i den afsluttende prøve.
- 11 aktive skills fra det nye projekts normale opsætning. Hovedskillen `harness-aura-design` er indlæst i første plan- og modelkald gennem Auras eksisterende `primaryBuildGuidance`. Indholdshashes er registreret. Dette tester den eksisterende pakke, ikke en ny prompt direkte mod modellens API.
- Mistral Medium 3.5 med standardindsats; Corti S1 med `low`. Indsatsen går gennem normal modelvalidering. Det er en sammenligning af disse konkrete konfigurationer, ikke en generel rangliste over udbyderne.
- 480 sekunder pr. trin og højst 64 færdigrapporterede modelkald pr. episode. Én udtrykkelig præcisering er tilladt, hvis modellen ikke returnerer en plan i Auras forventede format. Ingen fri bygning eller YOLO som genvej.
- Rigtige modelkald, kode, filgodkendelser og browserhandlinger; fiktive appdata. Ingen brugerprojekter indgår. Hemmeligheder forbliver i Electron-processen og den oprindelige krypterede testprofil.
- Første udkast og ændret version blev fotograferet ved 1440 × 900 og 390 × 844: **24 screenshots**. Browseren bruger Auras faktiske preview-server og indholdsregler. Eksterne netkald er blokeret under browserprøven.
- Testdriverens selectors er tilpasset de faktisk genererede kontroller. Eksempelvis kræver Cortis lokalefilter et klik på “Filtrér”, mens andre apps filtrerer straks. Ingen kandidatkode er rettet manuelt. Funktionstests er stikprøver, ikke en fuld tilgængeligheds- eller sikkerhedsvurdering.

## De seks afsluttende forløb

| Konfiguration | Opgave | Første bygning* | Ekstra planpræcisering | Browserkontroller, første + ændret | Bemærkning |
|---|---|---:|---:|---:|---|
| Mistral Medium 3.5 | Borgermøder | 74,1 sek. | 1 | 3/7 | Gemning og afmelding virker. Eksempelmærkning og tekst ved tom søgning mangler. |
| Mistral Medium 3.5 | Tidsregistrering | 60,6 sek. | 0 | 4/5 | Timer og sletning virker. Mobilvisningen skærer af; CSV-download blokeres. |
| Mistral Medium 3.5 | Lokalebooking | 144,7 sek. | 1 | 5/7 | Reservation, afmelding og skærmfilter virker. Eksempelmærkning mangler. |
| Corti S1 · low | Borgermøder | 83,1 sek. | 0 | 7/7 | De afprøvede forløb og eksempelmærkningen består. |
| Corti S1 · low | Tidsregistrering | 52,4 sek. | 0 | 4/5 | Timer og sletning virker. CSV-download blokeres. |
| Corti S1 · low | Lokalebooking | 85,3 sek. | 0 | 7/7 | Reservation, genindlæsning, annullering og filtre består. |

\* Bygningstiden er efter plangodkendelse. Den omfatter ikke første plan, opstart, ændringsrunde eller browserprøve.

Samlet: Mistral **12/19** og Corti **18/19** af de valgte browserkontroller. Tallene må ikke læses som universelle kvalitetsscorer. Begge konfigurationer gennemførte 3/3 agentforløb; kun to af Cortis tre apps bestod alle de valgte funktionstests i begge versioner. Ingen JavaScript-fejl blev observeret i de afprøvede forløb. Det udelukker ikke logiske fejl eller blokerede handlinger.

Samme samtale-id blev bevaret i alle seks forløb. Der var to konkrete plangodkendelser pr. episode. I alt 83 filhandlinger fik engangstilladelse, og 15 værktøjskald blev afvist under pilotens begrænsninger. Ingen ændringer i `public/` blev observeret under planlægningen. Dette er ikke et generelt bevis for alle former for sessionshukommelse eller isolation.

Auras anslåede pris for de seks afsluttende forløb var ca. **8,20 USD**: 6,58 USD Mistral og 1,61 USD Corti. Det er modelmetadata, ikke en faktura; indledende og afbrudte forsøg kommer oveni. Cacheforbrug og forskellige tænkeindstillinger gør en simpel prissammenligning misvisende.

## Visuel vurdering af første udkast

Corti leverede i disse tre forsøg mere sammenhængende farver, typografi, hjælpetekster og demomærkning. Borgermødeappen har en tydelig introduktion og gennemarbejdede tilmeldingsdialoger. Timeren bruger typografi til at fremhæve hovedhandlingen. Lokalebooking har ensartede kort og forståelige kapacitetsmærker.

Mistrals resultater er mere generiske: en blå kortoversigt, en formular/tabel og lokalekort med store farveflader, der gentager lokalenavnet. Tidsregistreringen har en god grundstruktur på desktop, men hele siden bliver bredere end mobilvinduet. Appen nulstiller også projektvalget, når en ny opgave oprettes; prøven vælger det igen gennem UI'et, inden timeren startes.

Ingen af konfigurationerne rammer konsekvent det visuelle ambitionsniveau i Parthees tidligere reference. Det er ikke dokumenteret, at skills har gjort resultaterne *flottere*, fordi piloten ikke har en sammenlignelig kontrolgruppe uden skills. Skills var aktive i alle forsøg. Mere instruktion alene er heller ikke dokumenteret som løsningen.

## Konkrete fund og næste prioritering

1. **Tilføj reel preview-feedback til byggeforløbet.** En model kan melde færdig, selv om CSV-eksport er blokeret. Begge tidsapps forsøger en browserdownload, som Auras `sandbox allow-scripts allow-same-origin allow-forms` afviser. Lær skillen den faktisk understøttede eksportvej, eller design en kontrolleret eksporthandling. Svæk ikke previewets beskyttelse for at få testen grøn. Den samme kompatibilitet bør kontrolleres for `alert`, `confirm` og `prompt`.
2. **Gør designkontrollen konkret og modeluafhængig.** Brug få navngivne kvalitetskriterier med screenshots: visuelt hierarki, komposition, særpræg, mobil, tomme tilstande og tydelig demodata. Lad en afgrænset rettelsesrunde arbejde ud fra observerede fejl. Bevar brugerens godkendte design og eksisterende tilladelser. Et “pænt” tekstsvar fra modellen er ikke tilstrækkeligt.
3. **Gør planformat og tænkeindsats mere forudsigelige.** To Mistral-ændringsplaner krævede en ekstra besked med de forventede overskrifter. Cortis standardindsats ramte 480 sekunder to gange; `low` gennemførte de tre afprøvede opgaver. Det er et argument for at undersøge disse indstillinger nærmere, ikke for automatisk at ændre brugerens modelvalg eller tilladelser.
4. **Gentag før generelle konklusioner.** Næste evaluering bør have mindst tre gentagelser pr. opgave og et versionsfast sammenligningsgrundlag. Tilføj semantiske filtertests og en egentlig opdateringsprøve med eksisterende browserdata. De nuværende gemmetests beviser genindlæsning inden for hver version; de beviser ikke alle datamigreringer mellem versioner.

Yderligere kodefund: Mistrals ændrede borgermødeapp beregner belægning ud fra browserens egne, unikke møde-id'er. Da et id kun kan forekomme én gang og kapaciteten er 10–20, kan et møde ikke blive fuldt gennem normal brug. Checkboxens betjening består, men det beviser derfor ikke, at belægningsmodellen er korrekt. Dette er en separat kodeobservation, ikke en bestået funktionstest.

## Indledende forsøg og fejlklassifikation

- `baseline/`: udeladt som kalibrering af testdriverens stier. En forkert fortolkning af visningsstier gav falske filafvisninger. Det er ikke en modelfejl.
- `live-v1/`: oprindelige Mistral-forsøg er bevaret. En ændringsrunde ramte den daværende grænse på 32 modelkald; en anden manglede en genkendelig ændringsplan. Grænsen er hævet til 64 i den afsluttende prøve, og den ene tilladte planpræcisering er dokumenteret.
- Gamle Corti-logins blev afvist. De er ikke medtaget som AI-resultater. Brugeren indtastede en ny forbindelse i det separate sikre nøglefelt.
- `live-corti/`: gyldig forbindelse, standardindsats. Borgermødets byggefase og tidsappens planfase ramte hver 480 sekunder. Lokalebooking blev derefter stoppet af testoperatøren og er ikke bedømt som en modelfejl. Ingen automatisk reserveudbyder blev brugt.
- `qualified/` og `corti-low/`: de seks afsluttende forløb i tabellen. Alle øvrige forsøg er bevaret med deres faktiske status.

## Reproducerbarhed og bevaring

Se README for kommandoer, afhængigheder og godkendelsesgrænser. Tre OpenEnv-protokoltests og politiktesten bestod. Protokoltests bruger kontrollerede fixtures og tælles ikke som rigtige modelprøver. Pilotens Python-pakker er isoleret i `.venv`; appens afhængigheder er uændrede.

Rapportpakken indeholder en klikbar gallerioversigt, 24 screenshots, CSV og JSON. De komplette lokale episoder indeholder planspor, godkendelser, kilde-/skillhashes, forbrug og genereret kode. Kun udvalgte screenshots og aggregerede data lægges i galleriet; rå sessionsfiler, forbindelser og motorkonfigurationer publiceres ikke. Ingen kildekode eller brugerdata er slettet.
