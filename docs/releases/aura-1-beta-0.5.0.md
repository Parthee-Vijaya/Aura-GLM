# Aura 1 beta 0.5.0

Teknisk version: `0.5.0-beta.4`. Iteration 4 er valgt, fordi de tre tidligere 0.5.0-tags findes fra originalens gamle versionsrække. Ingen eksisterende tags flyttes. Den synlige version er **Aura 1 beta 0.5.0**.

Denne testbeta til macOS/Apple Silicon samler OpenCode 2, Privacy Gate og de godkendte feedbackændringer. DMG og opdaterings-ZIP er bygget fra `320a2ae433e1b3e64130d448e43c7a2491b62605`. Efterfølgende merge- og releasecommits ændrer dokumentation og distributionsmetadata, ikke de pakkede produktfiler.

**Opfølgning 26. oktober:** Filindhold, ad-hoc-signaturer, 20 native coreprøver og alle valgte native pakke-/brugerfladeforløb består. GUI-prøven afventede nøgleringen ved udgivelsen og er nu gennemført efter brugerens godkendelse. Denne udgave er fortsat en prerelease til afprøvning; den er ikke Apple-notariseret. En tidligere sporadisk motoropstartsfejl er fortsat uafklaret. Brug et separat testprojekt med opdigtede data. [Prøvens omfang og den efterfølgende tekstrettelse](../feedback/2026-10-26-package-followup.md).

[Hent DMG](https://github.com/Parthee-Vijaya/ai-harness/releases/download/v0.5.0-beta.4/Aura-1-0.5.0-beta.4-mac-arm64.dmg) · [Release, ZIP og kontrolsummer](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v0.5.0-beta.4). Udgivelsen erstatter ikke en installeret app eller brugerens data automatisk.

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

R2-pakkens 20/20 native Privacy Gate-/migrationsprøver består på 49,795 sekunder. De kører den faktiske ASAR og medfølgende OpenCode 2.1.4, Git 2.53.0 og Node 22.23.3 under Electron 44.9.3. Modelserverne er kontrollerede. Den separate GUI-prøve ventede oprindeligt i macOS-nøgleringen; den historiske timeout er bevaret. Efter lokal godkendelse består onboarding, kontrolleret Plan/Byg/Ret/Fortryd, fejlgendannelse, rigtig React/Vite- og Astro-preview, Privacy Gate og feedback-/resultatvisning. Prøvernes to forældede antagelser er rettet, og native genprøver består. Recovery observerede 8 opgavekald, 7 sammenfatninger og 4 præcist kontrollerede planpåmindelser; de ekstra modelkald er fortsat et optimeringspunkt. [Maskinelt samlet resultat](beta-0.5.0-evidence/native-ui-final.json).

Artefaktkontrollen bekræfter identiske filer, symbolske links og rettigheder i originalappen, DMG og ZIP samt gyldige ad-hoc-signaturer. SHA-256:

| Artefakt | SHA-256 |
|---|---|
| DMG | `136c62fe918b97f051c259526589007bc19b043f4a9a0e0dcca8aab33c6b454a` |
| ZIP | `e82d026dd86f9e711792097f698d69db1aa48d23700f215d68799f4512876fb4` |

Lokal signering er ad hoc; der påstås ikke Apple-notarisering, GitHub CI, en rigtig AI-prøve eller kvalifikation af Windows, Linux eller Intel-Mac. De tre kendte høje afhængighedsmarkeringer i sandbox-runtime, node-forge og Zod er dokumenteret og ikke fjernet fra rapporteringen. [Vurdering og afgrænsning](../feedback/2026-10-26-dependency-boundaries.md). OpenEnv-/OpenSandbox-piloter og nye betalte modelprøver er fortsat udskudt. Ingen ny UI-retning tilføjes som del af pakkekvalifikationen.

Den generiske flerplatform-/notariseringskontrol anvendes ikke som udgivelsesbevis for denne afgrænsede fork-beta. Den manuelle udgivelseskontrol kræver præcis DMG, ZIP og SHA256SUMS.txt, matcher GitHub-digests og downloadede bytes og kontrollerer forkens opdateringsfeed med produktets egen validator. Download- og feedkontrol er ikke en udført automatisk installation.

## Beviser og oprydning

Rapporter og screenshots bevares lokalt i `ReleaseReports/package-beta-0.5.0-20261026/`, inklusive de faktiske TAP-filer, de oprindelige uafsluttede/fejlede GUI-rapporter, de beståede genprøver, kildebevis, artefaktkontrol og publiceringsrapport. PR #28–33 er flettet i egen fork. Originalens PR'er og GitHub Actions er uændrede. De offentlige 0.3.1- og 0.4.0-releases og deres beskrivelser bevares. Kun verificeret ubrugte byggeprodukter, caches og syntetiske testdata må ryddes op; lokal kode og brugerdata bevares.

## Efterfølgende kildeændring

Den godkendte servertekst er rettet i kildekoden efter denne pakkes udgivelse. Den siger nu korrekt, at serveren fortsætter ved projektskift og stoppes ved eksplicit Stop eller applukning. Backend, planer og godkendelser ændres ikke. DMG, ZIP, tag og feed er ikke overskrevet; teksten kommer med ved næste pakning. [Før/efter og præcis testmetode](../feedback/2026-10-26-package-followup.md).
