# Aura Prime 0.6.0 beta 3

Teknisk version: `0.6.0-beta.3`, tag `v0.6.0-beta.3`. Releasen blev først udgivet som "Aura Prime beta 1" og er omdøbt til **Aura Prime 0.6.0 beta 3**. Appens mærke i denne pakke viser stadig "beta 0.6.0"; [0.6.0 beta 4](aura-prime-0.6.0-beta.4.md) retter mærket. DMG og opdaterings-ZIP er bygget fra `4a7b4ea8ccc1914f55859f510e4c3ba20ab5fb63` med Electron 45.0.0 og den låste Node 22.23.3-runtime.

Det er den første beta under navnet Aura Prime. Den er til macOS på Apple Silicon og er en prerelease til afprøvning. Brug et separat testprojekt med opdigtede data.

## Nyt i Aura Prime

- **Nyt UI/UX.** Integreret Aura-logo, sidebar der kan skjules helt, centreret samtalestart og samlede indstillinger i lyst og mørkt tema.
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
- Native prøve af kildekoden i isolerede profiler med blokeret netværk: førstestart, profil, opsætning, Nyt projekt ved 980×720 og 16 px, kladde, fokus, sidepanel, indstillinger, lyst og mørkt tema.
- **Den pakkede app** (`release/mac-arm64/Aura Prime.app`) er startet i en separat profil. Velkomsten vises, logo-asset'en serveres fra pakken (`200 image/svg+xml`), og Fortsæt uden profil fører til idéskærmen uden trinliste.
- `codesign --verify --deep --strict` består (ad hoc, hardened runtime). DMG'en indeholder appen og en Programmer-genvej.
- Ikke udført: Apple-notarisering, GitHub CI, Windows, Intel-Mac, rigtige AI-kald og en opgraderingsprøve fra en tidligere installation.

| Artefakt | SHA-256 |
|---|---|
| `Aura-Prime-0.6.0-beta.3-mac-arm64.dmg` | `ad6dba9f03c85da14a0c93eba195f2b24e86bd0216063ff2837d6427a6f7a60d` |
| `Aura-Prime-0.6.0-beta.3-mac-arm64.zip` | `67b3cb344827514dbaf0976bb042908892b42e683ee3b2463d02818ed85f8da3` |
| `beta-mac.yml` | `375614ce9540135a3c699b9d15f8332d734fda208c59d7316894e8cf2a148266` |

[Release, DMG og kontrolsummer](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.3)
