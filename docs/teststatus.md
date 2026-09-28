# Teststatus før invitation

Kontrolleret 28. september 2026. Dette er status for den aktuelle arbejdsmappe, ikke en erklæring om, at alle installationsfiler eller modeller er klar. Der er ikke committet eller pushet under denne gennemgang.

## Afprøvet på Mac

- 78 automatiske tests består. De omfatter rigtige midlertidige Git-repositories, HTTP-servere, filskrivning, afvisninger, hemmelighedsbeskyttelse og gendannelse. Modellerne i disse tests er kontrollerede testdata.
- Den trinvise AI-opsætning er gennemført i Electron: to store valg ved første start, nøgleformular, lokal opdagelse, tomt katalog, forbindelsesfejl, genkontrol, tilbage-navigation og Vælg senere. Tastatur, reduceret bevægelse og vinduet ved 980 × 720 er prøvet. Kladden bevares, og et faktisk projekt åbner i preview. Serverne leverer kontrollerede svar; forløbet er endnu ikke observeret med en kommunal medarbejder uden udviklererfaring.
- OpenCode-forløbet er gennemført med plan, afklaring, godkendt filændring, preview, versionsgemning og kontrolleret modelserver. Samtale, plan og kladde genfindes efter genstart; en afbrudt opgave starter ikke igen af sig selv.
- Gendannelse og fortrydelse er gennemført gennem appens knapper og efter genstart. HEAD, index, private indstillinger og nye filer uden for historikken bevares. Filrettigheder bevares; forældede gennemgange afvises. En fremkaldt skrivefejl kan håndteres med kopien før gendannelsen.
- Forkert nøgle, kvote og en faktisk afbrudt HTTP-strøm er fremkaldt. Hvert kald stopper uden automatisk gentagelse. Stop er prøvet efter et delvist modelsvar. En ny opgave lykkes efter hver fejl og efter Stop.
- En tidligere plan nulstilles efter gendannelse. Markøren kontrolleres ved genåbning, også når samtalefilen ikke kunne opdateres ved første forsøg.
- Fejlrapporten er gennemgået og gemt gennem filvælgeren. Den bruger faste statusfelter og udelader projektindhold, filstier, serveradresser, kontonavne og nøgler. Hjælpeskærmens unødvendige kontakt til nøgleringen er fjernet. Nøglelagring står som ikke kontrolleret; en fejlrapport må ikke udløse et nøgleopslag.

## Rigtige gratis modeller

Hver OpenRouter-prøve bruger syntetiske data, et eksplicit modelvalg og en enkelt rute med oplyst nulpris. Betalt fallback er slået fra. Resultaterne nedenfor beskriver de konkrete prøver, ikke modellernes generelle evner.

- **Qwen3.8 27B**, `qwen/qwen3.8-27b:free`, ruten `modelrun/fp4`: gav en plan, men med tydelige danske sprogfejl. Bygningen nåede ikke en færdig filændring inden testens grænse. Kan ikke anbefales ud fra denne prøve.
- **Gemma 4 31B**, `google/gemma-4-31b-it:free`, ruten `google-ai-studio`: afvist med HTTP 429. Ingen kodekvalitet kunne vurderes.
- **Nemotron 3 Super**, `nvidia/nemotron-3-super-120b-a12b:free`, ruten `nvidia`: gav en forståelig plan, men forsøgte derefter `ls -la`, selv om prøveopgaven udtrykkeligt forbød kommandoer. Handlingen blev afvist. Ingen fungerende aktivitetsoversigt blev bygget i denne prøve.
- **Laguna S 2.1**, `poolside/laguna-s-2.1:free`, ruten `poolside/fp4`: afvist med HTTP 429. Ingen kodekvalitet kunne vurderes.
- **North Mini Code**, `cohere/north-mini-code:free`, ruten `cohere`: gav en plan med engelske rester og uklare danske formuleringer. Forsøgte derefter en mappekommando, som denne prøve udtrykkeligt forbød. Kommandoen blev afvist; forløbet nåede ikke et fungerende udkast.

En særskilt North Mini Code-prøve tillod begrænset mappelæsning efter godkendelse. Her skrev modellen faktisk en opgaveliste, som blev vist i preview. Den brugte til sidst filværktøjerne uden en kommando. Prøven bestod dog ikke: feltet fik et andet tilgængeligt navn end det bestilte, så funktionskontrollen stoppede, før den efterfølgende ændring blev afprøvet. Skærmbilledet viser et roligt, læsbart layout, men svaret til brugeren skiftede til engelsk, og teksten “Datalagret i hukommelsen” er ikke godt dansk. Kodegennemgangen fandt desuden brugerinput sat direkte ind i `innerHTML` uden escaping. Det er ikke et tilfredsstillende grundlag for en anbefaling.

Der er endnu ikke grundlag for at anbefale én af disse gratis forbindelser som et stabilt førstevalg til testerne. Katalogadgang og værktøjsunderstøttelse er ikke tilstrækkeligt bevis. Prøverne `rooms`, `tasks` og `activities` omfatter også efterfølgende ændring og mobilvisning, når modellen når frem til et udkast.

Ingen Ollama-tjeneste blev fundet på standardadressen på denne Mac. Den kendte Spark-enhed fremgår af Tailscale, men Tailscale er stoppet på computeren. Ingen netværksopsætning eller modelinstallation er ændret. Der mangler en prøve med en faktisk lokal model.

## Pakker og CI

[GitHub-kørsel 36418496986](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36418496986) afprøvede commit `bde83ddbea4b973b2aa25e0e840336e8dab8fceb` (beta.2):

- **Windows x64:** Pakning, start med medfølgende værktøjer, projektoprettelse, preview, Git-identitet, versionsgemning, gendannelse og forbindelsesfejl bestod i en Windows-runner. En privat byggeartefakt er uploadet til kørslen. NSIS-installationen på en almindelig testmaskine er ikke afprøvet, og pakken er usigneret.
- **Apple Silicon og Intel-Mac:** Pakkerne blev bygget og startet. Begge nåede Git-identitetsformularen, men prøven udløb, mens den ventede på filvalget. Der er ikke tilstrækkelige detaljer i den gamle log til at fastslå årsagen. Kildekoden skjuler nu identitetsformularen, mens status genindlæses, så et sent svar ikke kan overskrive indtastningen. Pakkeprøven gentager dette forløb og skriver mere konkret fejlstatus. Mac-jobbene skal genkøres efter vedligeholderens næste commit/push.

Den nye guide og ændringerne i beta.3 er ikke med i denne CI-kørsel. Tidligere problemer med den skjulte Git-knap og dugites ekstra download blev ikke gentaget i kørslen.

Beta.3 til Apple Silicon er bygget separat i `desktop/release/beta.3/` med det godkendte mekbas-certifikat. Signaturen består `codesign --verify --deep --strict`. Alle 36 pakkede kildefiler matcher arbejdsmappen byte for byte; byggesystemet fjerner udviklingsscripts og -afhængigheder fra det pakkede manifest.

Den signerede app har bestået:

- Pakkeprøven med begrænset PATH: medfølgende Git, Node/npm og OpenCode, projektoprettelse, preview og versionsgemning i et syntetisk projekt. Git-status er genindlæst, mens identitetsformularen allerede var synlig, uden at indtastningen blev overskrevet.
- Den nye opstartsguide med tastatur, reduceret bevægelse, lille vindue, kontrolleret Ollama-katalog og oprettelse af et faktisk projekt.
- Gendannelse, fortrydelse efter genstart, nøglefejl, kvote, afbrudt HTTP-strøm, Stop og en ny opgave efter hver fejl. Hjælp og eksport af fejlrapport består også, når nøgleringskontrol bevidst afvises i testen.

DMG'en er monteret skrivebeskyttet; appens signatur og identiske `app.asar` er kontrolleret. Filoversigt og SHA-256 ligger sammen med DMG og ZIP. Downloadsiden er genereret lokalt, ikke publiceret.

Opdatering fra den signerede beta.2 til beta.3 er gennemført ved at erstatte appen samme sted i en midlertidig mappe. Projektfiler, forbindelse, syntetisk krypteret nøgle, designpakke og kladde er bevaret. Kladden er skrevet gennem appens skrivefelt. Den nye version sender ikke automatisk til den gemte modelserver. Prøven bruger isolerede brugerdata på udviklingsmaskinen; en separat maskine og Windows-opdatering mangler stadig.

Apple-notarisation kræver fortsat en tilgængelig lokal notarytool-profil. Signering alene er ikke notarisation.

## Før invitationerne kan sendes

1. Gennemfør et fuldt bygge- og rettelsesforløb med en lokal model og en hosted model, og vurder dansk og design på det faktiske resultat.
2. Gennemfør notarisation og kontrol af den endelige Mac-fil samt CI-kørsler på Mac og Windows med den aktuelle version.
3. Afprøv installation og opdatering på en separat testmaskine, herunder arbejdspladsens installationsrettigheder.
4. Observer en person uden udviklererfaring gennem [testforløbet](testforloeb.md), og ret de steder, hvor forklaring er nødvendig.
5. Giv de inviterede adgang til det konkrete downloadlink og en navngiven feedbackkontakt. Repositoryet er fortsat privat; der er ikke oprettet en offentlig download eller ændret synlighed.
