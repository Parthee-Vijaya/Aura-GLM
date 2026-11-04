# Aura Prime 0.6.0 beta 4

Teknisk version: `0.6.0-beta.4`, tag `v0.6.0-beta.4`. DMG og opdaterings-ZIP er bygget fra `90a3e3c` med Electron 45.0.0 og den låste Node 22.23.3-runtime. Det er en prerelease til afprøvning på macOS med Apple Silicon. Brug et separat testprojekt med opdigtede data.

**Nyt siden 0.6.0 beta 3:** Versionsmærket i appen viser nu hele versionen på samme form som releasen, **0.6.0 beta 4** (før "beta 0.6.0"). Produktet er ellers uændret i forhold til [0.6.0 beta 3](aura-prime-beta-1.md).

## Nyt i Aura Prime


- **Nyt UI/UX efter den installerede DeepSeek Harness-app.** Integreret Aura-logo, sidebar der kan skjules helt, centreret samtalestart og samlede indstillinger i lyst og mørkt tema.
- **Ingen konto.** Kompakt velkomstvindue med Kom i gang eller Fortsæt uden profil. Profilen er valgfri og gemmes lokalt.
- **Nyt projekt uden scroll** ved 980×720. Opret-handlingen har en fast bundrække, og idékladden bevares, hvis du går tilbage til arbejdsfladen.
- **Opsætningen holder næste handling synlig.** Gem og fortsæt står fast i bunden af lange trin. Trinlisten vises kun i det guidede førstegangsforløb.
- **Forfin idéen uden AI** åbner forbindelsesopsætningen og bevarer kladden.
- **Fokus og detaljer.** Fokus følger sidepanelet og tilbagehandlingen. Logoets midterprik vises i begge temaer. Ens tilstandstegn, cirklet infoikon, én fokusramme på skrivefeltet og en dæmpet Send uden valgt AI.

Funktioner, onboarding, Samtale/Planlæg/Byg, planer, godkendelser, Privacy Gate, datadeling og YOLO-grænser er bevaret. Se [CHANGELOG](../../CHANGELOG.md).

## Installation

Åbn DMG'en, og træk **Aura Prime** til Programmer. Appen er ad hoc-signeret og **ikke Apple-notariseret**. Første gang skal den derfor åbnes med højreklik → Åbn, eller tillades under Systemindstillinger → Anonymitet og sikkerhed.

Installerede Aura GLM 1.0.0-beta.x-klienter opdaterer ikke automatisk til denne version. Versionsrækken er lavere, og nedgradering er blokeret. De kræver en manuel installation, som accepteret 1. november 2026. App-, data- og nøglelageridentitet er bevaret.

## Kvalifikation

- Samlet lokal kontrol (`scripts/check.cjs`, Node 22.23.3) på kildecommit: **2.646 pass, 34 skips, 0 fail**.
- Den pakkede app er startet i en separat profil. Velkomsten viser versionsmærket **0.6.0 beta 4**, og logoets titel er "Aura Prime 0.6.0 beta 4".
- `codesign --verify --deep --strict` består (ad hoc, hardened runtime). DMG'en indeholder appen (0.6.0-beta.4) og en Programmer-genvej. `beta-mac.yml` angiver 0.6.0-beta.4.
- De native UX-prøver fra beta 3 (førstestart, profil, Nyt projekt, kladde, fokus, temaer) gælder samme produktkode. Kun versionsmærket er ændret.
- Ikke udført: Apple-notarisering, GitHub CI, Windows, Intel-Mac, rigtige AI-kald og en opgraderingsprøve fra en tidligere installation.

| Artefakt | SHA-256 |
|---|---|
| `Aura-Prime-0.6.0-beta.4-mac-arm64.dmg` | `ddb07f46d648a3e876ac5fda7464962e62f91ffd83d305b52b84e84e05147b58` |
| `Aura-Prime-0.6.0-beta.4-mac-arm64.zip` | `480d4e454843299817450d3843dfd35311b9f1eaa873b18b3947f9970287cf99` |
| `beta-mac.yml` | `40f279386ddc4424f5fa2591b490cb44295eb53fe43da99a515a04fdbd7111d3` |

[Release, DMG og kontrolsummer](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.4)
