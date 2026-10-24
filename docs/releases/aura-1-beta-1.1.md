# Aura 1 beta 1.1

En rettelse til projektoprettelsen i `Parthee-Vijaya/ai-harness`. Appversion: `1.0.1-beta.1`. macOS på Apple Silicon.

## Hvad er rettet?

Ved første klik på **Opret projekt** kunne appen svare “Denne handling er allerede i gang. Du kan fortsat bruge de andre projekter.” Opstarten gjorde knappen aktiv, før det tidligere projekt var færdigt med at åbne. Projektoprettelsen og genåbningen konkurrerede derfor om samme lås. Idéhjælpens afslutning kunne også gøre knappen aktiv for tidligt.

Knappen følger nu den samlede tilstand for opstart, projektoprettelse og idéhjælp. Indsendelse af formularen kontrollerer samme tilstand, så gentagne klik ikke starter parallelle oprettelser. Når en handling fejler, frigives formularen, og idékladden bevares, så brugeren kan prøve igen. Den eksisterende beskyttelse mod samtidige projekthandlinger er bevaret.

Det godkendte UI, onboarding B, funktioner, forbindelser og plan- og værktøjsgodkendelser er bevaret. Idéhjælpens beskrivelse og planforslag overføres fortsat som et udkast; projektoprettelse starter ikke automatisk byggeriet. Eksisterende projekter, samtaler, nøglelager og indstillinger migreres ikke af denne rettelse.

## Installation

[Hent Aura 1 beta 1.1](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v1.0.1-beta.1). Luk Aura 1, åbn DMG’en, og erstat appen i Programmer. Slet ikke projekt- eller datamapper. ZIP-filen bruges til appopdatering; `SHA256SUMS.txt` indeholder kontrolsummer for begge pakker.

Appen er ad hoc-signeret og ikke Developer ID-signeret eller notariseret. macOS kan derfor kræve manuel godkendelse. Pakningen ændrer ikke den installerede app; installationen foretages af brugeren.

## Afprøvning

Pakken er bygget fra `c1effa85b635d38f32da3d2a80c026e0b85daa4c`. Eventuelle senere commits i udgivelsens tag omfatter kun dokumentation og opdateringsmetadata.

- **748 desktoptests og 27 CLI-tests** består.
- **15 kontroller i den faktiske app fra en skrivebeskyttet monteret DMG** består: normal projektoprettelse med rigtig Git-historik, samtidighed under genåbning, bevaret idékladde, genåbningsfejl, sene indstillings-/idéopdateringer, gentagen indsendelse, én mappe og én indledende version, uændrede godkendelser samt genforsøg efter afvist oprettelse.
- Samme nye regressionstest fejler mod den tidligere beta 1. Den præcise fejlbesked blev desuden genskabt i den tidligere pakkede app ved et enkelt klik. Tidspunktet for den konkurrerende genåbning blev kontrolleret for at gøre fejlen reproducerbar; projektoprettelse, IPC og Git var de rigtige implementeringer.
- **7 kontroller af idéhjælpen** består med en kontrolleret lokal modelserver, inklusive opfølgende spørgsmål og overførsel af beskrivelse og planudkast. Dette er ikke en prøve af en ekstern models svarkvalitet.
- Den pakkede app er startet med begrænset PATH og særskilt testprofil. Medfølgende OpenCode, Node, npm og Git samt projektfiler og lokalt preview består installationsprøven.
- **212 produkt-/profilfiler og 5.222 runtimefiler** er integritetskontrolleret. Hele appbundlens signatur, DMG-checksum og ZIP-indhold består kontrollen.

Se [testoversigt](beta1-1-evidence/test-summary.json), [projektoprettelse fra DMG](beta1-1-evidence/project-create.json), [idéhjælp](beta1-1-evidence/idea.json), [installationsprøve](beta1-1-evidence/dmg-native.json), [kildebevis](beta1-1-evidence/package-source.json) og [filmanifest](beta1-1-evidence/release-manifest.json).

Kontrollerne er lokale på denne Mac. GitHub CI, Windows, Intel-Mac, en anden fysisk computer og opdateringsinstallation oven på brugerens app er ikke afprøvet her. De øvrige [kendte begrænsninger fra beta 1](aura-1-beta-1.md#kendte-begrænsninger), herunder afhængighedsfund, gælder fortsat. Denne rettelse er ikke en ny sikkerhedsgodkendelse eller fuld Privacy Gate.

## Oprydning

Efter verificeret udgivelse fjernes opgavens midlertidige build og syntetiske testprofiler. Kilder, beskrivelser, rapporter, aktive PR-worktrees og brugerdata bevares. Kun de tre nyeste færdige lokale DMG-versioner beholdes. PR’erne til originalprojektet ændres ikke af denne release.
