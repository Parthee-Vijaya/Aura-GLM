# Privacy Gate i Aura 1

Dette dokument gælder kildearbejdet i `Parthee-Vijaya/ai-harness` på `work/privacy-gate-followup`. Det indgår ikke i den udgivne `0.4.0-beta.2`-DMG. Den ældre Code-OSS-version og originalens PR’er er ikke ændret.

Privacy Gate kontrollerer, hvilke data en arbejdsopgave må sende til en model eller ekstern tjeneste. Den almindelige modelgodkendelse, planvalg og værktøjsgodkendelser består. YOLO giver ingen ekstra datadelingsrettigheder.

## Arbejdsformer

| Valg | Det sker i appen | Teknisk håndhævelse |
|---|---|---|
| Kun lokal | Opgaven bruger en dokumenteret model på denne computer. | Hele motoren og dens underprocesser kører med afgrænset filadgang. Kun den konkrete lokale modelrute kan bruges. Ingen cloudreserve. |
| Hybrid | Lokal forberedelse, eventuel tilladt cloudhjælp og lokal samling vises i samme samtale. | Motorerne har separate arbejdsområder og modelhistorik, krypterede Aura-session-snapshots og separate OpenCode-tilstande. Cloud får kun kontrolleret opgavemateriale. |
| Cloud med datakontrol | Den valgte eksterne model arbejder med tilladte oplysninger. | Et filtreret arbejdsområde indeholder kun inspicerbare, tilladte filer. Hele det endelige modelkald kontrolleres igen før afsendelse, også ved genforsøg. |

Indstillinger findes ved **Datakontrol** i det eksisterende arbejdsområde. Regler kan gælde projektet, en bestemt samtale eller idéhjælpen før projektstart. Når en idé bliver til et projekt, overføres regler og beskyttelseslabels, før de første projektfiler skrives. Idéhjælpen har kontrol af modelkald; den starter ingen agent, terminal eller hybridopgave. Organisationens regler sætter loftet for projektets og samtalens tilladelser.

Den første brugerbesked er også materiale: den sendes ikke til cloud før kontrollen. Historik, værktøjsresultater, filnavne, billeddata og andre dele af den endelige forespørgsel er omfattet. Katalog- og rutekald må heller ikke omgå en lokal arbejdsform.

## Data og godkendelser

- Offentligt og internt materiale kan kun sendes til tilladte destinationer og inden for regelhierarkiet.
- Fortroligt materiale behandles lokalt, medmindre en administrativ regel tillader en bestemt frigivelse.
- Strengt beskyttet materiale kan ikke frigives ved almindelig brugeraccept. Personoplysninger og hemmeligheder er særskilte egenskaber oven på dataklassen.
- Afledte filer og historik bevarer kildens beskyttelse. En ny model, genstart, faneskift eller deaktivering af en almindelig projektindstilling nulstiller ikke allerede beskyttet historik.
- En delingsgodkendelse gælder konkrete bytes, modtager, model/rute, formål og regelversion. Ændringer udløser ny vurdering. Godkendelsen af en byggeplan er ikke en delingsgodkendelse.
- Maskering erstatter fund lokalt, hvorefter materialet undersøges igen. Pladsholdere fra modelsvar bliver ikke automatisk til filstier, kommandoer eller originalværdier.

I idéhjælpen starter **Behandl lokalt** den allerede konfigurerede lokale model, efter at modtager og regler er kontrolleret igen. Den får den aktuelle brugerbesked og sin egen idéhistorik; cloudmodellens historik flyttes ikke automatisk med. En senere cloudbesked får heller ikke den lokale historik. Uden en dokumenteret og tilladt lokal model stopper handlingen. Et fejlbudskab fra en model kan ikke udgive sig for dette brugervalg.

I projektchatten gælder samme lokale valg. Den eksterne motor stoppes først, og ændringer fra dens ufærdige arbejdskopi føres ikke over. Den lokale motor får den oprindelige opgave, de tilladte lokale kilder og sin egen historik. Planvalg og fil-/værktøjsgodkendelser gælder fortsat. Aktiviteten viser, at arbejdet fortsætter på denne computer; forbrug og kontekstvindue beregnes ud fra modellen i det konkrete arbejdstrin.

Genkendelse bruger faste mønstre og konfigurerede beskyttede værdier. Den finder ikke med sikkerhed alle navne, indirekte personoplysninger eller fortrolige sammenhænge. Klassificér derfor følsomme mapper og projekter eksplicit. En generel lokal klassifikationsmodel og automatisk OCR er ikke installeret. Uigennemskuelige billeder, krypterede filer og andet ikke-understøttet materiale blokeres eller behandles lokalt; det sendes ikke som reserve til cloud.

## Hvad isolationen omfatter

Den kvalificerede motorvej bruger macOS Seatbelt omkring hele den versionslåste OpenCode-proces. Underprocesser arver samme fil- og netværksgrænse. Den tillader kun det konkrete arbejdsområde, nødvendige runtimefiler og de konkrete loopbackporte til motorens kontrol og Auras indholdskontrollerede gateway. Andre internetadresser, lokale tjenester og Unix-sockets er afvist.

En lokal native hjælper kontrollerer og afslutter det afgrænsede processetræ, også løsrevne børn. Filer føres først tilbage, når skrivende processer er bekræftet stoppet, kildebasis stadig matcher, og ændringerne har den nødvendige konkrete godkendelse. Stop, fejl og timeout giver ingen blind genafspilning eller tilbageførsel af et ufærdigt resultat.

Beskyttede cloudarbejdsområder indeholder ikke originalmapperne. Filtilbageførsel bruger et fast snapshot af de gennemgåede bytes. Afledte filer får krypteret proveniens, så en senere opgave ikke uden videre kan behandle dem som offentlige.

### Stop og sikker genoptagelse

Stop starter aldrig automatisk en ny opgave. Når brugeren senere sender en besked, kan Aura fortsætte fra det seneste gyldige punkt. En krypteret journal binder opgaven, planen, destinationerne, reglerne og de præcise filændringer sammen. Tidligere accepteret motorhistorik bevares; et ufærdigt, sikkert stoppet trin rulles tilbage til sit udgangspunkt.

Hvis en afbrydelse sker under filtilbageførsel, sammenlignes hver fil med både udgangspunktet og det allerede godkendte resultat. Allerede udførte ændringer gentages ikke. En delvis tilbageførsel kan kun færdiggøres for samme opgave og plan. Historik og filer gemmes holdbart før kvittering. Ukendte skrivende processer, ændret materiale eller uafklaret tilstand efter et nedbrud stopper genoptagelsen frem for at gætte eller genafspille kommandoer.

Isoleringen gælder den beskyttede kørsel og dens børn. Den er ikke en sikring mod en kompromitteret macOS-kernel, en administrator eller andre allerede kørende programmer på computeren. Hvis Aura selv har startet en ubeskyttet agent, installation, server eller Git-handling, som kan køre kode, i projektet i samme app-session, afvises aktivering: almindeligt Stop er ikke bevis for, at eventuelle løsrevne børn er væk. Slå datakontrol til før første kørsel i et nyt arbejdsområde. Git-operationer i beskyttede projekter isoleres uden netværk og uden hooks, filtre eller signeringsprogrammer. Git-worktrees med ekstern `.git`-pegefil afvises, fordi de udvider filgrænsen.

## Eksterne funktioner og preview

Almindelige hosting-, deploy-, upload-, Git-push-, integrations- og browserhandlinger kan ikke få en generel undtagelse via YOLO. En handling skal have en adapter, der kontrollerer hele den konkrete afsendelse; ellers afvises den i beskyttede projekter. Den eksisterende funktion er fortsat tilgængelig i ubeskyttede projekter. “Kun lokal” afgrænser opgavens behandling; appens separate automatiske opdateringstjek kan stadig kontakte opdateringstjenesten uden projektdata. Det er ikke en påstand om, at hele appen er netværksløs.

Den normale liveforhåndsvisning i appens fælles browser må ikke modtage beskyttede projektfiler. CSP og et HTTP-filter alene er ikke en fuld netværksgrænse, blandt andet på grund af WebRTC. Den automatiske kontrol af statiske sider bruger i stedet en separat Electron-proces med OS-forbud mod netværk og en privat, skrivebeskyttet kopi. Den undersøger desktop, mobil og simple klik og gemmer lokale screenshots, efter at processerne er bekræftet stoppet. Manglende isolation giver ingen tilbagefald til den almindelige renderer. En interaktiv beskyttet liveforhåndsvisning og generelle beskyttede pakkeinstallationer understøttes endnu ikke; de afvises, mens de almindelige funktioner bevares uden for beskyttede projekter.

## Administrativ registrering

Private konfigurationer ligger i profilens `harness/privacy/`-mappe, adskilt fra projektets kode. Mappen og dens private undermapper har adgang `0700`; filer skal kun kunne ændres af brugeren. Der må ikke ligge rå loginoplysninger i disse JSON-filer. API-nøgler håndteres fortsat af Auras krypterede nøglelager.

`destinations.json` knytter et gemt forbindelses-id til dokumenteret behandlingssted og præcis endpoint:

```json
{
  "LOCAL_CONNECTION_ID": {
    "endpoint": "http://127.0.0.1:11434/v1",
    "locality": "device",
    "revision": "local-installation-1"
  },
  "ORGANIZATION_CONNECTION_ID": {
    "endpoint": "https://models.example.invalid/v1",
    "locality": "organization",
    "revision": "approved-configuration-1"
  }
}
```

Dette er et eksempel med pladsholdere. Endpoint skal svare præcist til den gemte forbindelse. En localhostadresse er ikke i sig selv dokumentation for lokal behandling; den kan pege på en videresendende proxy. Uden en gyldig registrering behandles destinationen som cloud. En server på organisationens netværk vises som **Organisationens server**, ikke som denne computer.

`organization-policy.json` kan fastlægge dataklasse, destinationer, beskyttede kilder/værdier og konkrete frigivelsesregler. Projektets almindelige dialog kan indsnævre reglerne, men ikke ændre organisationens loft.

### Eksempel på begrænset CSV-frigivelse

Den implementerede transformer `csv-generic-schema-v1` erstatter originale kolonnenavne med `COLUMN_1`, `COLUMN_2` osv. og fremstiller faste syntetiske værdier. Originale rækker, kolonnenavne, filnavne og antal borgersager medsendes ikke. Datatyper og kolonneantal er stadig afledte oplysninger og kræver en præcis administrativ regel.

Reglen knytter projektrod, kilde-id, modtager-id, formål, transformation og version sammen. `hybrid-sources.json` registrerer kilden med relativ filsti og dataklasse. Konkrete eksempler og negative tests findes i `desktop/tests/privacy-hybrid-csv-release.test.cjs`, `desktop/tests/privacy-csv-provider-release.test.cjs` og `desktop/tests/privacy-product-native.test.cjs`. Strengt beskyttede kilder, hemmelighedsbærende tabeller og ændret kilde/regler kan ikke bruge den gamle frigivelse. En modeltekst eller et almindeligt klik kan ikke oprette en administrativ frigivelsesregel.

## Revisionsspor og drift

`audit.jsonl` registrerer tidspunkt, handlingstype, destinationsidentitet, dataklasse, beslutning og regelversion. Det gemmer ikke rå prompt, nøgle, filindhold eller følsomt filnavn. Auras snapshots af de adskilte modelsessioner, historikkens beskyttelsesniveau og filproveniens opbevares krypteret. OpenCodes egen tilstand ligger separat i adgangsbegrænsede lokale mapper. Auras almindelige lokale samtalevisning, projektfiler og screenshots følger fortsat appens eksisterende lokale lagring; Privacy Gate er ikke fulddiskkryptering. Et beskadiget eller manglende sikkerhedskritisk indeks stopper behandlingen.

Native isolation kræver den klargjorte, hashkontrollerede hjælper og den låste runtime. Manglende helper, forkert platform eller manglende kryptering stopper beskyttet arbejde. Der er ingen usikret host- eller cloudreserve. Kvalifikation på denne udviklingsmaskine er macOS på Apple Silicon; der påstås ikke Windows-/Linux-/Intel-kvalifikation eller Apple-notarisering.

## Afprøvning

Kør med den Node-version, der er fastlagt i `desktop/runtime-lock.json`:

```sh
node --test --test-concurrency=1 desktop/tests/*.test.cjs
AURA_PRIVACY_NATIVE=1 node --test --test-concurrency=1 desktop/tests/privacy-product-native.test.cjs
node desktop/scripts/verify-privacy-ui.cjs
node desktop/scripts/verify-privacy-review-ui.cjs
```

Native produktprøver bruger den rigtige OpenCode-motor, gateway, filsystem og isolation. Svarene leveres af en kontrolleret lokal HTTP-server, så testen kan bevise de faktisk sendte bytes og omgåelsesforsøg. Det er ikke en måling af Mistrals, Cortis eller GPT’s designkvalitet og kræver ingen rigtige borgerdata eller eksterne API-nøgler.

Før en senere DMG skal den eksisterende `runtime:prepare` køres, runtime-manifestet genopbygges gennem den normale kildevalidering, og den færdige pakke verificeres på ny. Der er ikke blot genberegnet hashes af en uverificeret runtime.

Se [integrations- og acceptstatus](privacy-gate-completion-assessment.md) for den konkrete gennemkørsel. En bestået kildeprøve er ikke en ny udgivet eller installeret DMG.
