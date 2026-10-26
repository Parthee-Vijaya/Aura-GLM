# Feedback: enklere og sikrere forhåndsvisning

Dato: 26. oktober 2026. Arbejdet gælder forkens aktuelle kilde med de lokale OpenCode 2- og Privacy Gate-ændringer. Intet i dette arbejde er en release eller en ændring af originalprojektet.

## Hvad er leveret?

Der er tilføjet et afgrænset backendmodul til at afgøre, hvilken gennemgang en previewhandling kræver: `desktop/core/preview-startup-review.cjs`. I den efterfølgende backlogrunde er modulet koblet på `DevServer` som ekstra kontrol af den eksisterende manuelle gennemgang. Der er ingen ny UI eller IPC-handling. Den godkendte brugerflade og de eksisterende rettigheder er uændrede.

Backlogrunden reproducerede og rettede en fejl, hvor en proces kunne starte efter Stop under asynkron klargøring. Stop, projektskift og konfigurationsændring invaliderer nu klargøring og afsendelse. Gennemgangen bindes desuden til mappeidentitet, regelrevision, konfiguration og et kort udløb. Installationskontrol må heller ikke vise en gammel færdigtilstand efter Stop eller projektskift. Dette er kontrol af den manuelt godkendte handling, ikke automatisk serverstart eller ny procesisolation. Se [opfølgningen](2026-10-26-backlog-followup.md).

Modulet skelner mellem:

| Handling eller tilstand | Resultat |
|---|---|
| Projektets statiske public-filer, uden aktiv Privacy Gate | Kandidat til Auras indbyggede filvisning, uden projektkommando. Den eksisterende browser-, protokol- og netværkskontrol skal fortsat bruges. Mappenavnet public er ikke en dataklassifikation. |
| Vite, Astro eller andre projektprocesser | Kræver fortsat konkret gennemgang. Genkendelse af et framework er ikke bevis for isolation. |
| Pakkeinstallation | Særskilt gennemgang; pakkenavn eller `--ignore-scripts` gør ikke automatisk installation isoleret. |
| Aktive projekt- eller samtaledataregler | Kræver den særskilte beskyttede rute. Almindelig statisk visning og projektserver får ingen genvej. |
| Manglende eller ændrede regler, ukendt handling, udløbet gennemgang | Afvisning og ny vurdering. |

`prepare()` registrerer et kortlivet grundlag med projektmappens identitet, handlingen, regelrevisionen, runtimekonfigurationen, inspektørens kontrolfilsfingeraftryk og installationstilstanden. `consume()` undersøger grundlaget igen og kan kun gennemføres én gang. Også ændringer under den asynkrone inspektion, genbrug, parallelle kald, udskiftet mappe og tilbagekaldelse afvises. Højst 32 gennemgange holdes i hukommelsen.

Begge resultater har **`authorizesExecution: false`**. `requiresProcessExecution` beskriver, om handlingen kræver projektkode; det er ikke en tilladelse. `skipTechnicalReview` kan kun være sand for kandidaten til den indbyggede statiske filvisning og må kun styre præsentationen af kommandoteknik, aldrig give en generel tilladelse. Modulet starter ingen proces, giver ingen værktøjsrettighed og tilbyder ingen reservevej. Det kan derfor ikke bruges som en sandboxattest eller som erstatning for godkendelse. Fingeraftrykket beskriver de kontrollerede opstartsfiler; det er ikke et komplet hash af alle pakker og alle genererede filer.

## Hvad viste den native prøve?

`desktop/scripts/verify-preview-isolation-boundary.cjs` bruger den rigtige `DevServer.prepare/execute/stop` samt den eksisterende `createOfflineProcessIsolation`. Alle input er syntetiske. Prøven bruger en lille lokal pakke, der efterligner Vites startinterface, så ingen pakker skal hentes. Den tester dermed Auras procesgrænse, ikke en bestemt rigtig Vite-version.

Der er en kontrolleret modtagerserver på `127.0.0.1`. Ingen ekstern server, AI-model, nøgle, nøglering, eksisterende projekt eller brugerprofil er brugt.

| Kontrol | Almindelig gennemgået projektserver | Eksisterende offlineproces |
|---|---|---|
| Læse syntetisk fil uden for projektet | Muligt | Blokeret |
| Skrive syntetisk fil uden for projektet | Muligt | Blokeret |
| Kontakte en anden lokal HTTP-tjeneste | Muligt | Blokeret |
| Læse originalen gennem en underproces | Muligt | Blokeret |
| Skrive udenfor gennem en underproces | Ikke særskilt påkrævet i kontrolruten | Blokeret |
| Åbne en lokal serverport | Projektserveren starter | Blokeret |
| Skrive inde i arbejdsområdet | Muligt | Muligt i den isolerede partition |
| Afslutning | Serveren stoppet | Native attest: alle skrivende processer stoppet, nul resterende processer i scope |

Alle **19 native kontroller** bestod på **macOS arm64 med den forberedte Node 22.23.3-runtime**. Den kontrollerede modtager så præcis én forespørgsel fra den almindelige projektserver og ingen fra offlineprocessen. Den syntetiske beskyttede kilde forblev uændret.

Konklusionen er begrænset og konkret: `127.0.0.1` og filtrerede miljøvariable er ikke procesisolation. Den eksisterende offlinegrænse virker i den afprøvede situation, men den er hverken en læsebeskyttet inputvisning eller en livepreviewserver. Det ville være forkert blot at fjerne den nuværende advarsel eller automatisk starte projektkommandoer med den.

## Platforme

| Platform | Dokumenteret her | Hvad må ikke påstås? |
|---|---|---|
| macOS arm64 | Rigtige processer og fil-/loopbackforsøg i begge ruter. | En færdig isoleret livepreviewlauncher er ikke leveret. |
| Windows | Enhedstests viser, at klassifikationen fortsat kræver gennemgang og aldrig giver automatisk eksekvering. | Ingen Windows-app eller OS-isolation er afprøvet her. |
| Linux | Enhedstests giver samme tilbageholdende resultat. | Ingen native bubblewrap-/netværksprøve er kørt her. |

Prøvescriptet rapporterer eksplicit ikke-kvalificeret på andre værter; det bruger ingen uisoleret reserve til offlineprøven.

## Næste integration efter godkendt UI

1. Brug modulets klassifikation til at undgå at vise kommandoteknik for den allerede indbyggede statiske filvisning. Bevar alle eksisterende protokol-, browser-, data- og destinationsvagter.
2. Bevar særskilt gennemgang for projektserver og installation, indtil der findes en kvalificeret procesgrænse på den konkrete platform. En YOLO-tilladelse må ikke sætte dataregler eller teknisk isolation ud af kraft.
3. Kvalificér en særskilt livepreviewlauncher: konkret, verificeret runtime; kun eksplicit staged input; ingen originalsider, hjemmemappe eller credentials; skrivbar scratch; faste, kontrollerede previewkanaler; blokeret øvrig kommunikation; nedarvet grænse og bekræftet processtop. Inkludér Vite/Astro-konfiguration, plugins, underprocesser, browser-WebSockets og previews selv i angrebsprøverne.
4. Organisationens forhåndsgodkendelse kan først knyttes til netop denne kvalificerede operation og gældende regelversion. Et generelt “npm run dev er sikkert” er ikke tilstrækkeligt.

Dette arbejde ændrer ingen plan- eller værktøjsgodkendelse og aktiverer ikke automatisk preview. Det reducerer integrationsrisikoen og giver et testet beslutningsgrundlag til den næste konkrete ændring.

## Afprøvning og beviser

- `desktop/tests/preview-startup-review.test.cjs`: **13/13** enhedstests med rigtige syntetiske mapper og kontrolfiler; ingen netværkskald.
- Native prøve: **19/19** kontroller som beskrevet ovenfor.
- Samlet målrettet regression: **33/33** tests i `dev-server.test.cjs`, `privacy-egress-integration.test.cjs` og `preview-startup-review.test.cjs`; nul fejl eller skips. De eksisterende tests bruger bl.a. lokale npm-pakker og en kontrolleret HTTP-modtager.
- Rapportmappe: `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/preview/`.
- `review-unit.tap`: maskinelt testoutput.
- `native-boundary.json`: kontroller, observationer, procesafslutning og begrænsninger.
- `regression.tap`: maskinelt output fra de 33 regressionstests.
- De syntetiske kildefixtures og rapporter er bevaret til reproduktion. Testserver og isolerede arbejdsprocesser er stoppet.
- Ingen live-AI-prøve, Windows-nativeprøve, CI, commit, push, DMG eller release indgår i denne leverance.

Reproduktion fra repositoryroden:

```sh
desktop/.runtime/darwin-arm64/node/bin/node --test desktop/tests/preview-startup-review.test.cjs
desktop/.runtime/darwin-arm64/node/bin/node desktop/scripts/verify-preview-isolation-boundary.cjs "$HOME/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/preview"
```
