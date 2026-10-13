# Udgiv Aura CLI

Terminalpakken udgives særskilt fra desktopappen. Den bruger tags som `cli-v0.2.0-beta.6`. Desktopappens tags begynder med `v`. GitHub Pages vælger den seneste komplette udgivelse af hver slags, så en terminalpakke ikke fjerner appens downloadknapper.

**Alle workflows startes manuelt.** Commit, push, tags og Releases starter ingen byggejob. En konkret GitHub-kørsel kræver brugerens tilladelse. Lokal pakning offentliggør intet. Windows- og Linux-installation er stadig uprøvet, indtil resultatet fra en rigtig målmaskine er registreret.

## Klargør lokalt

Læs denne vejledning ved hver udgivelse. Brug Node 22.12 eller nyere og en ny outputmappe. Fra repositoryets rod:

```sh
npm run test:cli
npm run test:cli-live
npm run package:cli -- dist/cli-proeve --local
```

`test:cli-live` kræver Python 3 og rigtig OpenCode. Den bruger en lokal modelserver, ikke en betalt AI. Pakkeprøven skal også køres mod den installerede npm-pakke: `node cli/tests/verify-cli.cjs /absolut/sti/node_modules/aura-harness/cli/aura.cjs`. Udelad `HARNESS_OPENCODE_PATH`, så prøven bruger pakkens egen motor.

Pakkescriptet læser filerne i det faktiske arkiv, afviser ekstra eller manglende filer og sammenligner hver fil med kildekoden. Symlinks og uventede filtyper afvises. En lokal prøve kan indeholde ukommittede filer og markeres med `publishable: false`. Den må ikke uploades som en officiel udgivelse.

En udgivelse indeholder præcis:

- `aura-harness-VERSION.tgz`, npm-pakken til alle platforme.
- `WINDOWS.md`, `LINUX.md` og `MACOS.md`, med denne versions filnavn.
- `CLI-RELEASE.json`, med kildecommit og kontrolsummer for kilder og filer.
- `SHA256SUMS.txt`, med kontrolsummer for de øvrige fem filer.

Installér pakken i en separat mappe med `npm install --include=optional --ignore-scripts --no-audit --no-fund --no-save /absolut/sti/til/pakken.tgz`. Kør den installerede `aura doctor`, og afprøv login, plan, ændring, afvisning, stop, preview og genåbning. Kontrollér på hver platform, at dens egen motor starter. Notér kildecommit, kontrolsum og faktisk afprøvning i [teststatus](teststatus.md). Opdater [udgivelsesnoterne](releases/cli-beta.md), hvis status ændres.

Ingen kørsel med en kontrolleret lokal model dokumenterer Komplais produktionslogin. Det testes særskilt, når API'en er klar. Terminalpakken kan installeres og bruges med andre forbindelser imens.

## Fra gennemgang til GitHub

1. Brugeren gennemgår, committer og pusher kode og dokumentation. Rodens `package.json` og `package-lock.json` skal have samme version. Filnavnet i de tre platformsguides skal følge versionen; pakningen afviser gamle filnavne. Pakkerne i `dist/` skal ikke committes.
2. Brugeren opretter og pusher tagget `cli-vVERSION` på det samme commit, som den manuelle kørsel startes fra på `main`. Workflowet opretter ikke tags. Brug aldrig et eksisterende tag til ændrede filer.
3. Start **Byg og udgiv terminalbeta** på `main` efter godkendelse af den konkrete kørsel. Angiv tagget. Uden `offentliggoer` bygges kun et midlertidigt Actions-artefakt. Med `offentliggoer` oprettes en ny kladde, filerne uploades, hentes og kontrolleres, og først derefter offentliggøres betaen.
4. Kontrollen kræver det rigtige offentlige repository, tag på kørslens commit, en ren arbejdsmappe, fulgte kildefiler, komplet arkiv og matchende SHA-256. Uploadede filer kontrolleres igen mod den udvalgte kildekode. En lokal prøve med `publishable: false` afvises. En ny kontrol før offentliggørelse afviser ændrede filer eller udgivelsesnoter.
5. Start **Udgiv downloadside** særskilt efter godkendelse af den konkrete kørsel. Siden får ingen opdigtede links til kommende versioner. Pakker og modelnøgler kopieres ikke ind i Pages.
6. Åbn `https://ai-alliancen-org.github.io/ai-harness/terminal.html` uden GitHub-login. Hent pakken og kontroller den mod SHA-256 på siden. Afprøv den hentede fil på Windows og Linux efter de medfølgende vejledninger.

Hvis upload eller kontrol fejler, kan der ligge en kladde på GitHub. Workflowet overskriver aldrig en eksisterende Release og bruger ikke `--clobber`. Undersøg kladden før oprydning. En eventuel sletning og ny kørsel kræver en ny, udtrykkelig beslutning; brug ikke automatisk genstart.

Pakken installerer OpenCode som en fastlåst, platformsbestemt npm-afhængighed. npm-registret skal derfor være tilgængeligt under installation. Der er ingen offlinepakke, Linux-desktopapp eller automatisk opdatering i dette forløb.
