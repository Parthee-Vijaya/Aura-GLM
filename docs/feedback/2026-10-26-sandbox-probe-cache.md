# Kortere lokal kontrol af kommandoisolation

Den 26. oktober 2026 er den gentagne versionsprøve af Auras betroede Node-runtime afkortet. Ændringen berører ingen UI, projektregler, godkendelser, planvalg eller YOLO-semantik.

## Afgrænsning og tillidsgrænse

`sandbox-probe-cache.cjs` opbevarer højst ét positivt resultat fra en versionsprøve i hukommelsen. Ved hvert opslag kontrolleres alle runtime-kandidater i deres oprindelige rækkefølge, også en manglende foretrukken runtime. Identiteten omfatter sti, realpath, fil-id, enhed, ejer, gruppe, rettigheder, størrelse, mtime og ctime med nanosekundpræcision. Identiteten kontrolleres igen efter versionsprøven. Udskiftning, symlinkændring, ændrede rettigheder eller en ny foretrukken runtime kræver derfor en ny prøve. Fejl og negative resultater gemmes ikke.

Den fulde kontrol af sandboxens installerede afhængigheder kører fortsat i en ny proces ved hvert senere `support()`-kald på både Mac og Linux. Kun overlappende kald med samme runtime-/runneridentitet deler deres igangværende kontrol. Afsluttede supportresultater caches **ikke**. Forslaget om en positiv Mac-cache på fem sekunder er bevidst fravalgt: sikker invalidering ville kræve yderligere gennemgang af den eksterne runners faktisk indlæste afhængighedsgraf. En cache alene på pakkenavn og version ville ikke være tilstrækkelig.

Politik, projektsti, aktiveringstoken og autoritet caches aldrig. Hver rigtig kommando starter fortsat sin egen runner, læser den konkrete politik og gennemfører sandbox-initialiseringen med en frisk afhængighedskontrol. En senere manglende runtime eller ødelagt sandbox giver en fejl; der tilføjes ingen vej til almindelig, uisoleret kørsel.

## Måling før og efter

Samme lokale Mac, arm64 og Node 22.23.3. Seriernes rækkefølge er én første supportprøve, 20 runtime-opslag, 20 supportprøver, 20 direkte runner-prøver, 100 filmetadata-prøver, 100 runner-hashes og 10 gentagelser af `support → support → nodePath`. Målingen er lokal proces-/filsystemtid; der bruges ingen model eller projekthandling.

| Serie | Antal | Median før | Median efter |
| --- | ---: | ---: | ---: |
| Runtime-opslag | 20 | 20,527 ms | 0,070 ms |
| Fuld supportkontrol | 20 | 94,437 ms | 72,357 ms |
| Runner alene | 20 | 71,364 ms | 71,039 ms |
| To supportkontroller og runtime-opslag | 10 | 212,851 ms | 144,218 ms |

Den sidste serie sparer lokalt 68,633 ms i median, cirka 32 %. Den første enkeltmåling var 87,942 ms før og 124,618 ms efter. Der hævdes derfor ingen gevinst ved kold start eller for hele tiden frem til modellens første token. Den fulde afhængighedskontrol står stadig for hovedparten af ventetiden.

## Afprøvning

- 24/24 målrettede tests består: positiv cache, samtidighed, ingen negativ cache, invalidation under prøven, runtimekonfiguration, ændrede og manglende filer, symlinks, permissions, gendannet mtime og uventede filsystemfejl. Produktionsmodulet prøves desuden med en kontrolleret procesgrænse, herunder en manglende dependency og ugyldigt kontrolsvar. Samtidighedsprøven bruger en deterministisk gate.
- 5/5 eksisterende lokale isolationsprøver består mod den rigtige macOS-sandbox: plugin, projektarbejde, beskyttede filer, andre mapper, symlinks, arvede testnøgler, installationsscript med underproces samt aktivering og ødelagt aktiveringstilstand. Der er kun brugt syntetiske testfiler. Prøverne med eksternt pakkeregister og ekstern URL indgår ikke i denne afgrænsede kørsel.
- Windows er ikke kørt. Den rene POSIX-permissionprøve har en eksplicit Windows-begrundelse; en symlinkprøve springes kun over på Windows, hvis systemet konkret afviser oprettelsen uden tilstrækkelige rettigheder.
- Ingen rigtig AI, CI, release, commit eller push er udført som del af denne ændring.

Rå lokale beviser bevares under `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/backlog-followup/`: `command-support-baseline.json`, `command-support-after.json`, `sandbox-probe-cache-2.tap` og `sandbox-probe-cache-native.tap`.

Gentag målingen med den medleverede Node-runtime og `desktop/tests/helpers/measure-sandbox-probes.cjs`, efterfulgt af en ny lokal rapportsti. Hjælperen afviser overskrivning af en eksisterende rapport. Testfilerne og rapporterne bevares.
