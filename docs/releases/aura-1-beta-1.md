# Aura 1 beta 1

Første navngivne udgivelse af den samlede `Parthee-Vijaya/ai-harness`-fork. Appversion: `1.0.0-beta.1`. Målplatform: macOS på Apple Silicon. Originalens åbne PR’er bliver ikke flettet ved denne udgivelse.

## Indhold

De 24 tidligere sammenlagte bidrag er bevaret sammen med de ti opdateringer og syv nye bidrag:

| Område | Beskrivelse og prøvegrundlag |
|---|---|
| Forbindelsen | [Afgrænsede genforsøg før svar](../contributions/model-retries/README.md) |
| Samtalens tilstand | [Genoptagelse med session og kontekst](../contributions/session-recovery/README.md) |
| Designskill | [Hovedskill til byggeopgaver](../contributions/primary-design/README.md) |
| Før projektoprettelse | [Idéhjælp og planudkast](../contributions/idea-refinement/README.md) |
| Godkendelser | [Fuld tilladelse til den aktuelle samtale](../contributions/conversation-permission/README.md) |
| Arbejdsområde | [Godkendt mørk visning og kompakt chat](../contributions/calm-workspace/README.md) |
| Forhåndsvisning | [Synlig arbejdsstatus og Vis alligevel](../contributions/preview-working/README.md) |

Onboarding B, planlægning, eksplicitte godkendelser og de eksisterende forbindelser er bevaret. Produktnavnet er Aura 1; datafolderen, projektfolderen og den eksisterende nøgleringsidentitet skifter ikke navn. En separat `--user-data-dir` bevares særskilt. Denne fork er ikke det separate Code-OSS-baserede Aura-1-repository.

## Installation og opdatering

Hent DMG’en fra [forkens release](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v1.0.0-beta.1), åbn den og kopiér **Aura 1.app** til den ønskede placering. Bevar den eksisterende app, indtil du har afprøvet denne udgave i en separat profil. Appen er ad hoc-signeret til lokal betatest, **ikke Developer ID-signeret eller notariseret**. macOS kan derfor kræve manuel åbning/godkendelse i systemets sikkerhedsindstillinger.

ZIP-filen er appens opdateringspakke; DMG’en er til manuel installation. SHA256SUMS.txt gør det muligt at kontrollere begge filer. Appens opdateringsfeed er bundet til denne forks repository, version, platform og filnavn. Den henter eller installerer ikke automatisk en ny version uden valg.

## Afprøvning

Den endelige pakkekontrol, testtal og kildecommit tilføjes efter bygning. Kontrollerede modelservere anvendes til reproducerbare fejl- og godkendelsesforløb; dette er ikke en kvalitetsmåling af Mistral, Corti eller andre eksterne modeller. GitHub CI og en anden fysisk testcomputer er ikke en del af denne lokale beta-kvalifikation.

## Oprydning og fremtidige udgivelser

Efter verificeret udgivelse fjernes denne opgaves midlertidige pakkefiler og syntetiske testprofiler. Kilder, beskrivelser, brugerdata og worktrees med aktive PR’er bevares. Kun de tre nyeste færdige lokale DMG-versioner skal beholdes. Navnet på en release skal være kort; funktionsbeskrivelser hører til i beskrivelsen.
