# Feedback og harness: opfølgning 26. oktober 2026

> Historisk afprøvningsrapport fra arbejdet før commit/push. Ejeren har efterfølgende godkendt integration i sin egen fork; se [samlet ændring og aktuel verifikation](2026-10-26-merge-overview.md). Testtal og datidens leveringsstatus nedenfor bevares som historik.


Arbejdet ligger lokalt i `Parthee-Vijaya/ai-harness` på `work/privacy-gate-followup`, oven på de eksisterende OpenCode 2-, Privacy Gate- og godkendte feedbackændringer. HEAD er `1d48bc4b`; det identificerer ikke de endnu ikke committede ændringer. Ingen udgivelse, DMG, push eller GitHub Actions er startet her.

## Feedback først

- **FB10, gentagen afklaring:** Idéskillen skal genbruge det allerede bekræftede brief og svar. Nye væsentlige spørgsmål skal stadig afklares. Godkendelse af byggeplan, værktøjer og data bevares. Ændringen er også genereret til de 23 eksisterende skillpakker. Enhedstests viser, at instruktionen og eksporterne følger med; en rigtig models efterlevelse er ikke målt her.
- **FB07/09/12/16, arbejdsforløbet:** En native prøve bruger rigtig Electron og OpenCode 2.1.4 med en kontrolleret lokal modelserver. Plan, spørgsmål med direkte svarfelt, stilstandsstatus, Stop, filændringer, fungerende preview og fortrydelse består. Det er en reproducerbar integrationsprøve, ikke en prøve af en cloudmodels kvalitet.
- **FB14, preview:** En fejl kunne starte en projektproces efter Stop under asynkron klargøring. Stop og projektskift invaliderer nu klargøringen. Den eksisterende manuelle gennemgang bindes til projektmappens identitet, kontrolfiler, regler, konfiguration og udløb og kan kun bruges én gang. Installation må heller ikke vise en gammel færdigtilstand efter Stop. Automatisk serverstart og ny procesisolation er ikke leveret; se [afgrænsningen](2026-10-26-preview-isolation.md).
- **FB11/15, arbejdsform og resultat:** Brugeren godkendte begge konkrete forslag. Menuen forklarer nu Samtale, Planlæg og Byg. Resultatkortet prioriterer afprøvning, med Ændringer, eksplicit gennemgang og Fortryd. Nativeprøven består 18/18 med faktisk Electron, syntetiske filer og byte-kontrolleret fortrydelse. Ingen modelkald, automatisk serverstart eller Git-skrivninger i denne UI-prøve; planvalg og YOLO-advarsel er bevaret. En opdaget klikfejl er rettet: skrivefeltets tastaturhint flytter ikke længere Byg-knappen under tab af fokus. 20/20 kompakt-/kladde-/fokusprøver og et fysisk Byg-klik består.
- **FB01 og brugertest:** Dansk Windows-tastatur og ikke-tekniske deltagere afventer som aftalt. Testpakken er klar; der er ingen indsamlede deltagerresultater.

## Harness-review: testgrundlag

Reviewets henvisninger gælder en ældre udgave. Den aktuelle motor er OpenCode 2.1.4. Ændringerne nedenfor er efterprøvet mod den aktuelle fork.

| Ændring | Resultat og afgrænsning |
|---|---|
| Releaseidentitet | Releasekontrollen henter repository og filpræfiks fra forkens distributionskonfiguration. Fremmede repositories afvises fortsat. Ældre filnavne kan læses i historiske Pages-data; nye releases valideres med det gældende præfiks. |
| Skillnavne | Ugyldige navne afvises før filopslag, også på filsystemer, der skelner mellem store og små bogstaver. |
| Platformafhængige tests | Manglende systemværktøjer giver en konkret begrundelse for skip. Fejl i en installeret runtime eller uventede diskfejl bliver fortsat testfejl. POSIX-rettighedsprøven er eksplicit afgrænset fra Windows og root. |
| Fælles lokal kontrol | `npm run check` kører desktop-, CLI- og eksisterende JavaScript-evaltests med samme Node-runtime og faste filvalg. CI-triggere er uændrede. |
| Kontrolleret modelserver | Én genbrugelig localhost-fixture understøtter Chat Completions, Responses og Anthropic samt forsinkelse, afbrudt strøm og HTTP-fejl. Den kræver syntetiske data og beholder kun forespørgsler i hukommelsen. Gatewayens recoverytests bruger den. |
| Kontraktoptagelser | Den faktiske OpenCode 2.1.4 er afprøvet mod den kontrollerede modelserver: godkendt skrivning, afvist for langt input efterfulgt af komprimering i samme session og aflivning af den ejede motorproces efter første tekst. Sanitiserede fixtures dokumenterer den observerede kontrakt. |
| Lokale målinger | Tider for forberedelse, motorstart, afsendelse og første indhold samt byte-/tokenestimater pr. promptdel gemmes i en begrænset hukommelsesbuffer. Ingen tekst, hemmeligheder, telemetri eller UI-ændring. Målinger for hybridmotoren er udtrykkeligt ikke understøttet og står tomme. |
| Kortere runtimekontrol | Kun den uændrede Nodes versionsresultat genbruges efter ny identitetskontrol. Fuld sandboxkontrol kører stadig. 24 målrettede tests og 5 native isolationstests består; lokal sekvensmedian falder fra 212,851 til 144,218 ms. Ingen påstand om hurtigere koldstart eller cloudmodel. [Måling og grænser](2026-10-26-sandbox-probe-cache.md). |
| Fælles filbeskyttelse | Samme navnepolitik bruges af filværktøjer, godkendelser, kommandosandbox, snapshots, Git, eksport og Privacy Gate. 32 native scenarier / 33 tests dækker beskyttede og almindelige mutationer samt referencer og patchformater. [Afgrænsning og fejlbeviser](2026-10-26-protected-paths.md). |
| Samtalens afslutning | 20 karakteriseringsprøver fandt samtidige Stop/lukning-fejl og tab af plan ved gentaget Stop. Afslutningen deler nu ét forløb, og Stop i en allerede færdig samtale ændrer intet. 105/105 målrettede tests består; dette er ikke den fulde tilstandsmaskine. [Afgrænsning](2026-10-26-session-lifecycle.md). |

Den fælles modelserver er ikke en rigtig AI. De eksisterende evaltests er politiktests; der er ikke genoptaget OpenEnv-benchmarks eller OpenSandbox-arbejde.

## Verifikation

- Samlet lokal kontrol: **1.637 bestået, 0 fejl, 31 eksplicit oversprungne**, af 1.668 tests. De oversprungne er særskilte opt-in-nativeprøver; resultatet beviser ikke, at de er kørt.
- Native forløb: **9/9** med Electron og OpenCode 2.1.4, kontrolleret modelserver, nul rendererfejl og 11 screenshots. To tilsigtede filskrivninger skete én gang hver; fortrydelse genskabte filen byte for byte. Status ved stille strøm og Stop blev efterprøvet.
- Den brede regression opdagede også en manglende betroet modulfil i den isolerede browsers læseliste og forkert relativ modulindlæsning i Windows-testens VM. Begge er rettet: den separate browser består 5/5 med uændret netværksblokering og privat skrivebeskyttet kopi, og den modellerede Windows-politik består 8/8. Fejlbeviserne er bevaret. Dette er ikke en native Windows-prøve.
- **6/6 målrettede native Privacy Gate-prøver** består med faktisk OpenCode 2.1.4, gateway og macOS-isolation: lokal/cloud-hybrid, fuld værktøjstilladelse uden adgang til hostens hemmelighed, plan → eksplicit Byg → konkret godkendelse, privat første besked, godkendt hybridplan og ny eksplicit besked efter Stop med bevaret kontekst. De seks køres særskilt efter den samlede kontrol; de bruger kontrollerede lokale modelsvar.
- Før/efter-regressioner er kørt for releaseidentitet, skillnavne og previewets Stop-fejl. Samlet kontrol indeholder de nye regressionstests.
- Der er ingen rigtig model-, native Windows- eller menneskelig brugertest i denne runde. En eksisterende npm-isolationstest henter sin faste prøvepakke fra npm; der er ingen model- eller nøglekald.

Maskinelle logs er bevaret uden for Git i `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/backlog-followup/`: `check-followup-final-2.tap` og de målrettede TAP-filer. De seneste native UI- og integrationsbeviser findes i `feedback-rest-20261026/native-focus-after/report.json`, `compact-regression-after/report.json` og `live-controlled-all-final/rapport.json` under samme ReleaseReports-rod. Den første preview-regression blev kun vist i terminalen; en sekundær note må ikke præsenteres som den oprindelige TAP-fil. Den særskilte Privacy Gate-prøve ligger i `privacy-native-preservation-final.tap`. Kilder og tidligere rapporter bevares.

## Næste afgrænsninger

Brugeren har bekræftet rækkefølgen: feedback først, derefter harness-reviewet. Kontraktoptagelser og lokale målinger er leveret. Den faktiske 2.1.4 håndterede kontekstoverløb ved komprimering og fortsættelse med samme model/session i prøven; derfor tilføjes ingen konkurrerende genforsøgsfunktion på dette grundlag. Motorcrash er karakteriseret, men automatisk genoptagelse efter crash er ikke leveret.

Den kolde prøve målte 7,941 ms forberedelse, 438,916 ms motorstart, 3,153 ms kvittering og 71,524 ms til første observerede indhold. Ved genbrug: 5,670 / 0 / 2,932 / 55,243 ms. Reviewede/systembytes var uændrede (10.257/10.586), og hver besked gav én prompt-POST. Det dokumenterer målegrundlaget, ikke rigtig cloudlatens eller en påvist hastighedsforbedring. Providerens rapporterede forbrug holdes adskilt fra bytebaserede estimater.

Beskyttede filnavne er samlet i [én fælles kontrol](2026-10-26-protected-paths.md), med separate referencegodkendelser, realpath-kontrol og bevaret Privacy Gate-politik. Samtalens samtidige afslutningsveje er [karakteriseret](2026-10-26-session-lifecycle.md). Reviewets flade tilstandstabel passer ikke til den aktuelle hybridafsendelse, samtidige spørgsmål/godkendelser eller ejerskabet af asynkrone afslutninger. Den større refaktorering afventer derfor [den korrigerede faseplan](2026-10-26-state-machine-assessment.md); den gamle tabel indføres ikke direkte. Der mangler fortsat bl.a. fuld tilstandsmaskine, holdbar aktivitetslog, sikker crashgenoptagelse, øvrige hastighedsforbedringer og designkontrol for projektservere. Disse punkter er ikke markeret som leveret af denne runde. [Maskinlæsbart overblik over alle 15 reviewpunkter](harness-status-2026-10-26.json).

Nye UI-retninger, automatiske CI-triggere, et standardiseret Starter Kit og deling af screenshots med en model er ikke godkendt af denne opfølgning. Auras eksisterende model- og skillstyrede designretning bevares.
