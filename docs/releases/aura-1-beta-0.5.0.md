# Aura 1 beta 0.5.0 — lokal testpakke

Teknisk version: `0.5.0-beta.4`. Iteration 4 er valgt, fordi de tre tidligere 0.5.0-tags findes fra originalens gamle versionsrække. Ingen eksisterende tags flyttes. Den synlige version er **Aura 1 beta 0.5.0**.

Status: kildekoden er klargjort til pakning og kvalifikation på macOS/Apple Silicon. Der er endnu ikke offentliggjort en ny release, ændret opdateringsfeed eller erstattet en installeret app.

## Indhold

- OpenCode 2.1.4, herunder afprøvning af migration fra den tidligere motor.
- Privacy Gate: kontrol af modelkald, separate lokale/cloudbaserede sessioner, native isolation og genoptagelse efter et kontrolleret Stop. [Grænser og understøttede forløb](../privacy-gate.md).
- De allerede godkendte feedbackændringer: kompakt skrivefelt, status nær samtalen, justerbar sidebar, direkte spørgsmål/svar, forklaringer til arbejdsform og resultatkort. [Ændringsoverblik](../feedback/2026-10-26-merge-overview.md).
- Opdaterede afhængigheder og afgrænset sandbox-konfiguration. [Rettelser og tre resterende sikkerhedsmarkeringer](../feedback/2026-10-26-dependency-boundaries.md).
- Onboarding B, designhjælp, eksisterende funktioner, planer, godkendelser og YOLO-semantik bevares.

## Kvalifikation

De fire feedback- og Privacy Gate-prøver kan nu vælge den færdige app eksplicit. Testhjælperen kontrollerer faktisk executable, ASAR, separat profil og medfølgende runtime og falder aldrig tilbage på kildekoden ved en ugyldig pakkesti. De separate native coreprøver indlæser også koden fra ASAR; de bruger kontrollerede modelservere og syntetisk kryptering og er ikke en prøve af brugerens nøglering.

Samlet lokal kildekontrol før versionering: 1.761 tests består uden skips. En tidligere native opstartsfejl er bevaret og ikke forklaret; efterfølgende isolerede og samlede prøver er grønne. Den faktiske app, DMG og ZIP skal kvalificeres særskilt, før pakningen markeres klar.

Forventet lokal signering er ad hoc; der påstås ikke Apple-notarisering, GitHub CI, en rigtig AI-prøve eller kvalifikation af Windows, Linux eller Intel-Mac. OpenEnv-/OpenSandbox-piloter og nye betalte modelprøver er fortsat udskudt. Ingen UI-ændring tilføjes som del af pakkekvalifikationen.

## Beviser og oprydning

Rapporter og screenshots gemmes lokalt i `ReleaseReports/package-beta-0.5.0-20261026/`; de skal knytte den faktiske pakke til kildecommit og kontrolsummer. Den offentlige 0.4.0-release og dens beskrivelser bevares. Kun verificeret ubrugte byggeprodukter, caches og syntetiske testdata må ryddes op; lokal kode og brugerdata bevares.
