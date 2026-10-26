# Aura 1 beta 0.5.0 — lokal testpakke

Teknisk version: `0.5.0-beta.4`. Iteration 4 er valgt, fordi de tre tidligere 0.5.0-tags findes fra originalens gamle versionsrække. Ingen eksisterende tags flyttes. Den synlige version er **Aura 1 beta 0.5.0**.

Status: lokal r2-app, DMG og ZIP er bygget fra `320a2ae433e1b3e64130d448e43c7a2491b62605` på macOS/Apple Silicon. Filindhold, signaturer og pakkens 20 native coreprøver består. Den samlede brugerfladeprøve afventer macOS-nøgleringen; pakken er derfor endnu ikke færdigkvalificeret. Der er ikke offentliggjort en ny release, ændret opdateringsfeed eller erstattet en installeret app.

## Indhold

- OpenCode 2.1.4, herunder afprøvning af migration fra den tidligere motor.
- Privacy Gate: kontrol af modelkald, separate lokale/cloudbaserede sessioner, native isolation og genoptagelse efter et kontrolleret Stop. [Grænser og understøttede forløb](../privacy-gate.md).
- De allerede godkendte feedbackændringer: kompakt skrivefelt, status nær samtalen, justerbar sidebar, direkte spørgsmål/svar, forklaringer til arbejdsform og resultatkort. [Ændringsoverblik](../feedback/2026-10-26-merge-overview.md).
- Opdaterede afhængigheder og afgrænset sandbox-konfiguration. [Rettelser og tre resterende sikkerhedsmarkeringer](../feedback/2026-10-26-dependency-boundaries.md).
- Stop under motoropstart tilbagekalder også ventende starttilladelser. Gendannede filer opdaterer den allerede godkendte statiske forhåndsvisning. [Rettelser og testafgrænsning](../feedback/2026-10-26-package-regressions.md).
- Onboarding B, designhjælp, eksisterende funktioner, planer, godkendelser og YOLO-semantik bevares.

## Kvalifikation

De fire feedback- og Privacy Gate-prøver kan nu vælge den færdige app eksplicit. Testhjælperen kontrollerer faktisk executable, ASAR, separat profil og medfølgende runtime og falder aldrig tilbage på kildekoden ved en ugyldig pakkesti. De separate native coreprøver indlæser også koden fra ASAR; de bruger kontrollerede modelservere og syntetisk kryptering og er ikke en prøve af brugerens nøglering.

Samlet lokal kildekontrol efter rettelser og karakterisering: **2.051/2.051 tests består**, 0 fejl og 0 skips, 194,181 sekunder, med native motor- og Privacy Gate-prøver aktiveret. Den inkluderer 256 seedede afslutningsforløb. En tidligere sporadisk native opstartsfejl er bevaret og endnu ikke forklaret; efterfølgende isolerede og samlede prøver er grønne. Den må ikke kaldes rettet alene på grund af de grønne gentagelser.

R2-pakkens 20/20 native Privacy Gate-/migrationsprøver består på 49,795 sekunder. De kører den faktiske ASAR og medfølgende OpenCode 2.1.4, Git 2.53.0 og Node 22.23.3 under Electron 44.9.3. Modelserverne er kontrollerede. Den separate GUI-prøve ventede i `SecItemCopyMatching`/`SecKeychainItemCopyContent` ved opstart; der afventes brugerens lokale godkendelse. Denne venten tæller hverken som bestået GUI-test eller som dokumenteret motorfejl.

Artefaktkontrollen bekræfter identiske filer, symbolske links og rettigheder i originalappen, DMG og ZIP samt gyldige ad-hoc-signaturer. SHA-256:

| Artefakt | SHA-256 |
|---|---|
| DMG | `136c62fe918b97f051c259526589007bc19b043f4a9a0e0dcca8aab33c6b454a` |
| ZIP | `e82d026dd86f9e711792097f698d69db1aa48d23700f215d68799f4512876fb4` |

Lokal signering er ad hoc; der påstås ikke Apple-notarisering, GitHub CI, en rigtig AI-prøve eller kvalifikation af Windows, Linux eller Intel-Mac. OpenEnv-/OpenSandbox-piloter og nye betalte modelprøver er fortsat udskudt. Ingen ny UI-retning tilføjes som del af pakkekvalifikationen.

## Beviser og oprydning

Rapporter og screenshots gemmes lokalt i `ReleaseReports/package-beta-0.5.0-20261026/`; de skal knytte den faktiske pakke til kildecommit og kontrolsummer. Den offentlige 0.4.0-release og dens beskrivelser bevares. Kun verificeret ubrugte byggeprodukter, caches og syntetiske testdata må ryddes op; lokal kode og brugerdata bevares.
