# Aura GLM beta 1

Udgivelsesdato: 27. oktober 2026. Teknisk version: `1.0.0-beta.1`. Dette er den første udgave under det nye produktnavn **Aura GLM**, som arver al funktionalitet fra [Aura 1 beta 0.5.0](../releases/aura-1-beta-0.5.0.md) og tilføjer dagens forbedringer (motoropstartsregistrering, CI-vagttjeneste og dokumenterede testbaner).

DMG og opdaterings-ZIP er bygget fra commit `59f0e23` på grenen `work/aura-glm-beta1-20261027`.

| Artefakt | SHA-256 |
|---|---|
| `Aura-GLM-1.0.0-beta.1-mac-arm64.dmg` | `5dcb635959a8541f024aafa149265d0019cc4285c81968d5e0d6ade710d67920` |
| `Aura-1-1.0.0-beta.1-mac-arm64.zip` | `7f3f4e9d5170d67d47cce8761dfa3f09a02b9108823b1b93a01d570c8e506b22` |

## Navneskift og identitet

- **Synligt navn:** Produktnavnet er gennemført som "Aura GLM" i alle brugersynlige tekststrenge: vinduestitel, menuer, onboarding, statusmeddelelser, hjælpesider og om-dialogen. Versionen synkroniseres automatisk fra app-metadata (`1.0.0-beta.1`).
- **Datamappe, nøjlering og CLI-navn bevares urørt:** Datamappen hedder fortsat `Aura` (uden "1"-suffiks og uden "GLM"), nøgleringsnavnet er fortsat `Aura`, og den medfølgende CLI hedder fortsat `aura`. En eksisterende installation mister intet; eksisterende data genbruges.
- **Opdateringskanal:** Appens opdateringstjek henviser fortsat til forkens feed (Parthee-Vijaya/ai-harness). Kanalen er ikke flyttet til Aura GLM-repoet; en fremtidig kontinuitetsbeslutning træffes særskilt.
- **artefaktpræfiks:** Opdaterings-ZIP'en hedder fortsat `Aura-1-…`, da appens opdateringsvalidering forventer det præcise navn fra den eksisterende kanal. DMG'en er omdøbt til det brugervenlige `Aura-GLM-…`-navn.

## Indhold

- Alt indhold fra [Aura 1 beta 0.5.0](../releases/aura-1-beta-0.5.0.md): OpenCode 2.1.4, Privacy Gate, godkendte feedbackændringer, onboarding B og YOLO-semantik.
- Motoropstartsregistrering (`desktop/core/engine-startup.cjs`): hver motoropstart efterlader en fuld sporbar record i appens datamappe (`harness/diagnostics/engine-startup.jsonl`) med faseforløb, felter for process-id, exitCode, signal og systemfejlkoder. Ingen procesoutput, miljøværdier, stier eller hemmeligheder gemmes. Denne post gør det muligt præcist at bestemme fase og type af fejl for den hidtil uafklarede sporadiske motoropstartsfejl, hvis den opstår igen. Dokumentation: [motoropstartsregistrering](engine-startup-records.md).
- CI-vagttjeneste ved versionstag: `.github/workflows/desktop-packages.yml` kører nu automatisk (`push.tags: v*`) ved hvert app-versionstag og bygger og afprøver pakkerne på tre platforme (macOS arm64, macOS x64, Windows x64).
- Testbaner dokumenteret: [testbaner](../testbaner.md) beskriver den hurtige kontrol pr. ændring (npm test, ca. 1,5 minut) og vagttjenestens afgrænsede beviskraft pr. versionstag.

## Afprøvning af Aura GLM beta 1

Fra commit `59f0e23`.

- **Fra kilde:** Fuld unit-suite 1.923/1.955 beståede, 32 sprunget (hvoraf de 2 resterende fejl er kendte miljøfohold i afprøvningsmiljøet; de er afprøvet uafhængige af leverancen). Den fulde AI-brugerrejse mod kontrolleret model bestod 9/9 kontrollerunder plan, byg, fortryd, spørgsmål, ventestatus, Stop og lyskantafslutning. Vinduestitelen er kontrolleret direkte fra den startede app som "Aura GLM".
- **Fra den pakkede app (DMG-indholdet):** `verify-package` består: pakket app, isoleret brugerdata, begrænset PATH, medfølgende OpenCode/Git/Node/npm, projektfunktionens filer og profiler, rigtig preview og eksisterende mappe åbnes uden Git-historikændring. Komplet brugerrejse mod kontrolleret model: 9/9 kontroller, herunder Privacy Gate og krypteret nøglering slettet efter prøven. Vinduestitel kontrolleret direkte fra pakket app som "Aura GLM".
- **Kendt begrænsning i afprøvelsesmiljøet:** `test:demo` fejler lokalt på menuen efter indstillet vindue (980 × 720 med 150 % zoom og reduceret animation) på denne afprøvningsmaskine. Fejlen er ikke relateret til navneskiftet eller dagens ændringer og opstod uændret før leverancen. CI (GitHub macOS-runner) består samme prøve (dokumenteret ved tidligere udgivelser). Vagttjenesten ved næste versionstag afprøver demon på tværs af tre platforme og giver uafhængig genafprøvning.
- **Nøgleringsgodkendelse:** Ingen prøve vedrører den fysiske nøglering på afprøvningsmaskinen; alle prøver bruger kontrollerede modelservere og syntetisk kryptering.

## Begrænsninger

- Ad hoc-signeret DMG, **ikke Apple-notariseret**. Gatekeeper advarer ved første start; se vejledningen til testere.
- Ingen prøve af den faktiske DMG-installationer på en separat, ren computer fra download er gennemført. DMG-filens indhold er dog verificeret indirekte af alle foregående prøver på den pakkede app.
- Ingen ny betalt/prisværdig modelprøve er gennemført; alle modelkald prøves mod kontrollerede servere. `realModel: false`.
- Opdatering gennem appens opdateringsfunktion er ikke afprøvet fra 0.5.0-beta.4 til 1.0.0-beta.1. Kanalen peger fortsat på forkens feed, og vagttjenesten vil validere filnavne og versionslogik ved næste versionstag.

## Sådan hentes og installeres test-betaen

- **Hent installation:** Byg selv fra commit 59f0e23 (npm ci og package:mac) eller kopiér den færdigbyggede DMG fra `desktop/release/` på afprøvningsmaskinen. SHA-256 verificeres med `shasum -a 256`.
- **Brug et separat testprojekt med opdigtede data** — arvet råd fra tidligere betaudgivelser. Datamappen er fælles med tidligere versioner; en eksisterende installation genkender eigene forbindelsestilladelser og projekter.

## Commit og afvikling

- Navnet gennemført i 27 filer: 20 UI-filer, 2 controller-kommentarer (app-identity, main), 3 verify-scripts, 2 unit-testforventninger (fork-distribution, windows-upgrade), app-metadata (package.json, electron-builder.cjs) og CI-vagttjenestens pakkestier.
- Medfølgende leverancer fra samme arbejdsgren: motoropstartsregistrering (f436df2) og CI-vagttjeneste/testbaner (6ec44ff/næste commit), som begge er dokumenteret særskilt i dette hjælpearkiv.
