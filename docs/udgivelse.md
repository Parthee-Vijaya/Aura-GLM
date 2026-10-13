# Udgiv en desktopbeta

Terminalpakken har [sit eget udgivelsesforløb](udgivelse-cli.md) med tags, der begynder med `cli-v`. Den omfatter Windows, Linux og macOS og ændrer ikke desktopappens krav om platformsprøver og notarisation.

Installationsfilerne ligger i GitHub Releases. [GitHub Pages](https://ai-alliancen-org.github.io/ai-harness/) viser downloadknapper til den seneste publicerede version med gyldige installationsfiler. Begge udgivelser kræver en særskilt, manuel kørsel. Et commit eller push starter ingen af dem.

## Klargør den konkrete version

1. Opdatér `desktop/package.json` og rodpakken i `desktop/package-lock.json` til samme version. Gennemgå ændringerne og de relevante tests. Brugeren håndterer commit, push og tag.
2. Byg fra den gennemgåede kode efter [pakkevejledningen](../desktop/README.md#installationspakker--beta). Brug en ny outputmappe for hver platform og bygning. Bevar tidligere testede filer.
3. Kør `desktop/scripts/verify-package-source.cjs` med pakkens ressourcemappe og målplatform: `darwin-arm64`, `darwin-x64` eller `win32-x64`. Kontrollen sammenligner den faktiske appkode og profiler med arbejdsmappefiler, som er fulgt af Git, og runtime-manifestet med låsefilen. Den kontrollerer ikke alene installation eller signering.
4. Afprøv den pakkede app og dens medfølgende værktøjer. Notér, om prøven er kørt på den rigtige målplatform. En Windows-pakke bygget på Mac er stadig uprøvet på Windows.
5. Signér og notariser begge Mac-pakker. Kontrollér både appen og det endelige diskbillede efter [Apple-forløbet](../desktop/README.md#installationspakker--beta). En ny pakning eller signering kræver nye kontrolsummer og relevante kontroller.

Ved ændringer i appkode eller profiler efter pakningen skal pakken bygges og kontrolleres igen. Et korrekt versionsnummer beviser ikke, at indholdet svarer til kildekoden. `verify-package-source.cjs` skal også bestå mod den kildeversion, der får udgivelsens tag.

## Saml filer og dokumentation

Saml kun denne versions tre installationsfiler i en ny lokal mappe:

- `Aura-VERSION-mac-arm64.dmg`
- `Aura-VERSION-mac-x64.dmg`
- `Aura-VERSION-win-x64.exe`

Læg Mac-filernes `.notarized.json`-kvitteringer ved siden af filerne, og kør fra `desktop/`:

```bash
node scripts/release-site.cjs release/udgivelseskandidat
```

Erstat mappen med den faktiske mappe. Scriptet danner `release.json`, `SHA256SUMS.txt` og en lokal downloadside. Det læser versionen fra filnavnene og afviser blandede versioner. En Mac-kvittering tæller kun, hvis den har status Accepted, et indsendelses-id, en kontroldato og samme SHA-256 som filen. En kvittering er lokal dokumentation; Linux-kontrollen hos GitHub foretager ikke selv Apples signatur- eller billetkontrol.

Afprøv download med `node scripts/verify-download.cjs release/udgivelseskandidat`. Installationsfiler, Apple-kvitteringer og lokale rapporter skal ikke committes. Udgivelsesnoterne skal beskrive faktisk signering og afprøvning samt kendte begrænsninger. For beta.6 findes en [kladde til noterne](releases/0.2.0-beta.6.md).

## Komplai-prøven før beta.6 udgives

Denne beta skal bruges til Komplai-login. Den må derfor ikke offentliggøres som klar til den prøve, før følgende er gennemført:

- Produktionsklienten til OAuth og API'et er tilgængelige.
- En almindelig bruger har accepteret sin invitation til den valgte organisation og fået den nødvendige adgang. En mailadresse på organisationens domæne giver ikke i sig selv medlemskab.
- Organisationen har aktiveret kodning, valgt modeller og godkendt datavilkår og forbrug.
- Login fra den pakkede app, en reel kodeændring, kreditregistrering og logout er afprøvet. API-nøgler og tokens må ikke indgå i noter eller rapporter.

Den hidtil aftalte automatiserede modelprøve har et loft på **10 kr.** Det er ikke en tildeling af et personligt budget til testeren. Modellen og organisationens faktiske kreditregnskab skal kontrolleres særskilt.

## Fra gennemgang til offentlig download

1. Brugeren gennemgår, committer og pusher kildekoden og opretter et versionstag, fx `v0.2.0-beta.6`, på det gennemgåede commit. Tagget skal pege på samme commit som den `main`, workflowet startes fra. Ingen tag oprettes af workflowet.
2. Opret en **kladde** i GitHub Releases med det eksisterende tag og betamarkeringen slået til. Upload præcis de tre installationsfiler, `release.json` og `SHA256SUMS.txt`. Brug de gennemgåede udgivelsesnoter. Upload ikke lokale logs, Apple-loginoplysninger, ZIP-apps eller testdata.
3. Giv udtrykkelig tilladelse til den konkrete kørsel af **Offentliggør gennemgået desktopbeta**. Vælg `main`, angiv tagget og bekræft offentliggørelsen samt den gennemførte Komplai-prøve. Workflowet bygger ikke nye installationsfiler.
4. Workflowet kontrollerer tag, version, offentlig adgang, kladdens indhold, størrelser, SHA-256 og Mac-kvitteringer. Det downloader og kontrollerer de faktiske installationsfiler og foretager et læsende kald til Komplais loginopsætning. Manglende eller ændrede oplysninger stopper udgivelsen. Loginopsætningens svar beviser ikke, at et modelkald virker; det er den særskilte prøve ovenfor.
5. Giv derefter særskilt tilladelse til **Udgiv downloadside** med `offentlig_udgivelse` slået til. Der er ingen automatisk Pages-kørsel efter en Release.
6. Åbn Pages uden GitHub-login, hent hver offentlig installationsfil og kontrollér dens kontrolsum. Afprøv installation og opdatering på de maskiner, som betaen beskrives som afprøvet på. Registrér version og resultater i [teststatus](teststatus.md).

**Byg testpakker** er et separat, manuelt workflow til platformskontrol. Det gemmer midlertidige Actions-artefakter og offentliggør ingen Release. Dets Mac-pakker er som udgangspunkt usignerede og kan ikke passere udgivelseskontrollen ovenfor.
