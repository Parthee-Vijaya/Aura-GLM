# Teststatus før invitation

Kontrolleret 28. september 2026. Dette er status for den aktuelle arbejdsmappe, ikke en erklæring om, at alle installationsfiler eller modeller er klar. Der er ikke committet eller pushet under denne gennemgang.

## Afprøvet på Mac

- 78 automatiske tests består. De omfatter rigtige midlertidige Git-repositories, HTTP-servere, filskrivning, afvisninger, hemmelighedsbeskyttelse og gendannelse. Modellerne i disse tests er kontrollerede testdata.
- Opstarten er gennemført i Electron: introduktion, spring over, lokal demonstration, AI-opsætning, annulleret mappevalg og projekt med preview. Ingen rigtig person uden udviklererfaring har endnu observeret dette forløb.
- OpenCode-forløbet er gennemført med plan, afklaring, godkendt filændring, preview, versionsgemning og kontrolleret modelserver. Samtale, plan og kladde genfindes efter genstart; en afbrudt opgave starter ikke igen af sig selv.
- Gendannelse og fortrydelse er gennemført gennem appens knapper og efter genstart. HEAD, index, private indstillinger og nye filer uden for historikken bevares. Filrettigheder bevares; forældede gennemgange afvises. En fremkaldt skrivefejl kan håndteres med kopien før gendannelsen.
- Forkert nøgle, kvote og en faktisk afbrudt HTTP-strøm er fremkaldt. Hvert kald stopper uden automatisk gentagelse. Stop er prøvet efter et delvist modelsvar. En ny opgave lykkes efter hver fejl og efter Stop.
- En tidligere plan nulstilles efter gendannelse. Markøren kontrolleres ved genåbning, også når samtalefilen ikke kunne opdateres ved første forsøg.
- Fejlrapporten er gennemgået og gemt gennem filvælgeren. Den bruger faste statusfelter og udelader projektindhold, filstier, serveradresser, kontonavne og nøgler.

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

Den første GitHub-kørsel er [36414672768](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36414672768), baseret på commit `39f341f0b896bf648fa4958b547fa5fcfab1a2aa`. Den indeholder ikke de nye ændringer i arbejdsmappen.

- Windows x64 og Intel-Mac blev pakket og startet. Begge nåede projektoprettelse og preview, men prøven stoppede ved **Gennemgå igen**, som var skjult, når Git-identiteten manglede. Knappen er flyttet ud af den skjulte formular i kildekoden.
- Apple Silicon-jobbet stoppede ved et HTTP 500-svar under dugites ekstra Git-download. Den ubrugte udviklingsafhængighed er fjernet; projektets særskilte download med fastlåst kontrolsum leverer fortsat Git. `npm ci` og runtime-kontrollen er gennemført lokalt efter ændringen.
- Workflowet er udvidet med gendannelses- og forbindelsesfejlprøven i den pakkede app. Rettelserne kræver et nyt commit/push fra vedligeholderen og en ny CI-kørsel, før de kan kaldes afprøvet på Windows og Intel-Mac.

Beta.2 til Apple Silicon er bygget separat i `desktop/release/beta.2/` med det godkendte mekbas-certifikat. Signaturen består `codesign --verify --deep --strict`. 36 pakkede kildefiler matcher arbejdsmappen byte for byte; byggesystemet fjerner udviklingsscripts og -afhængigheder fra det pakkede manifest.

Den signerede app har bestået pakkeprøven med begrænset PATH: medfølgende Git, Node/npm og OpenCode, projektoprettelse, preview og versionsgemning i et syntetisk projekt. DMG'en er monteret skrivebeskyttet; signatur og det identiske `app.asar` er kontrolleret. Filoversigt og SHA-256 ligger sammen med DMG og ZIP. Downloadsiden er kun genereret lokalt, ikke publiceret.

De efterfølgende grafiske prøver af gendannelse og opdatering fra beta.1 blev blokeret, da Mac'en var låst. De skal gentages efter oplåsning. Apple-notarisation kræver fortsat en tilgængelig lokal notarytool-profil. Signering alene er ikke notarisation.

## Før invitationerne kan sendes

1. Gennemfør et fuldt bygge- og rettelsesforløb med en lokal model og en hosted model, og vurder dansk og design på det faktiske resultat.
2. Gennemfør notarisation og kontrol af den endelige Mac-fil samt en ny Windows-kørsel med de rettede filer.
3. Afprøv installation og opdatering på en separat testmaskine, herunder arbejdspladsens installationsrettigheder.
4. Observer en person uden udviklererfaring gennem [testforløbet](testforloeb.md), og ret de steder, hvor forklaring er nødvendig.
5. Giv de inviterede adgang til det konkrete downloadlink og en navngiven feedbackkontakt. Repositoryet er fortsat privat; der er ikke oprettet en offentlig download eller ændret synlighed.
