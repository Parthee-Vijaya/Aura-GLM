# Versioner og oprydning i Aura 1

Brugerens instruktion af 25. oktober 2026 gælder for denne fork, `Parthee-Vijaya/ai-harness`.

## Navn og version

Appen hedder **Aura 1**. Vis versionsmærket tydeligt under navnet ved logoet i sidepanelet, opsætningen og introduktionen. Mærket henter den kørende apps version fra native metadata; versionsnumre må ikke hardcodes i UI.

Ny versionsrække: **Aura 1 beta 0.3.1**. Releases har kun produktnavn, beta og versionsnummer i titlen. Beskriv ændringerne i beskrivelsen.

Agenten vælger fremover næste version efter den samlede ændring:

| Ændring | Eksempel fra 0.3.1 |
|---|---|
| Fejlrettelse, mindre forbedring eller vedligeholdelse | 0.3.2 |
| Større funktion eller en samlet, mærkbar udvidelse | 0.4.0 |
| Gennemgribende produkt-/arkitekturændring eller inkompatibel ændring | 1.0.0 |

Brug største relevante kategori, hvis en release indeholder flere ændringer. Bevar beta-betegnelsen, indtil brugeren har godkendt en stabil udgivelse. En større version alene betyder ikke, at produktet er stabilt.

Den tekniske SemVer er `0.3.1-beta.1`, tagget `v0.3.1-beta.1`, og den synlige titel **Aura 1 beta 0.3.1**. Hver udgivelse får et nyt tal i hovedversionen; tidligere tag/pakke må ikke overskrives. Brug `npm version <version>-beta.1 --no-git-tag-version --ignore-scripts` i `desktop` til at opdatere både package.json og package-lock.json. Kontrollér runtimeversion, UI, pakke, tag, feed, README og noter før publicering.

Hvis det ønskede tekniske tag allerede findes fra den gamle versionsrække, bruges næste ledige beta-iteration, eksempelvis `1.0.0-beta.2`. Den synlige version er stadig **Aura 1 beta 1.0.0**. Flyt aldrig et eksisterende tag.

Nulstillingen fra beta 1/1.1 (`1.0.0-beta.1`/`1.0.1-beta.1`) til `0.3.1-beta.1` kræver **manuel installation**. Den eksisterende beskyttelse mod automatisk nedgradering bevares. Efter manuel installation kan opdateringer følge den nye stigende række normalt. Bundle-, profil- og nøgleringsidentiteter bevares.

## Kvalifikation og offentliggørelse

- Bevar tidligere rettelser og kør relevante tests samt en native prøve af den faktiske pakke i en separat profil.
- Gem kildecommit, testbeviser, manifest og kontrolsummer. Skeln mellem lokale tests, GitHub CI, ekstern AI, signering og notarisering.
- Offentliggør kun DMG, opdaterings-ZIP og SHA256SUMS.txt som release-assets. Blokfiler og build-debugfiler forbliver midlertidige.
- Verificér de uploadede bytes/digests, downloadadresser og opdateringsfeed.

## Oprydning med bevaret lokal kode

**Lokal kode skal bevares, også når den er committed og pushed.** Slet ikke checkouts, worktrees, Git-metadata, prøvescripts, fixtures med kildekode eller lokale ændringer. En mappe i `/tmp` er ikke automatisk disponibel. Tidligere regler om at fjerne afsluttede worktrees er erstattet af dette krav.

Efter en verificeret release fjernes kun opgavens ubrugte byggede appkopier, installationspakker, caches og tydeligt syntetiske testprofiler. Kontrollér ejerskab, Git-indhold, processer, åbne filer, mounts og referencer først. Gem rapporter og beskrivelser før oprydning. Ved ukendt indhold bevares mappen.

Bevar højst de tre nyeste færdige lokale DMG-versioner. Fjern kun identificerede distributionsfiler; bevar mappernes beskrivelser, manifest, kontrolsummer og kode. Installerede apps, rigtige brugerprofiler, projekter og credentials omfattes ikke af oprydningen.

Brugeren har ved denne nulstilling bedt om at fjerne forkens eksisterende releases og begynde med 0.3.1. Arkivér beskrivelser og metadata først, og publicér/verificér den nye release før de gamle fjernes. Git-tags og historik bevares. Dette er ikke en tilladelse til at fjerne originalprojektets releases eller fremtidige GitHub-releases automatisk.
