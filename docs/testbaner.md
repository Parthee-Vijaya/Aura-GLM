# Testbaner: hvad der køres hvornår

Fra 27. oktober 2026. Princippet er to baner: en hurtig kontrol pr. ændring og en selvstændig vagttjeneste pr. udgivelse. Ingen af banerne erstatter godkendelser, notariseringsbevis eller de særskilte native prøver, der dokumenteres i [teststatus](teststatus.md) pr. udgivelse.

## Bane 1 — hurtig kontrol ved hver ændring

```bash
cd desktop && npm test          # appens unit- og motortests
node scripts/check.cjs          # alle testgrupper: desktop, cli og openenv
```

- **Hvad den beviser:** appens moduler, motorkontrakten, CLI og instruktionssuitens indhold fungerer sammen i kilden. Varighed få minutter.
- **Hvad den ikke beviser:** pakkede apps, platforme ud over den maskine, der kører, eller rigtige modelforløb. Bane 1 k signaturen siger altså intet om installationspakker — kun om kilden.
- **Begrænsning på afviklingsmaskinen:** kræver den låste runtime og Node-version, der ligger i `runtime-lock.json`. Køres på en anden Node (f.eks. Homebrew Node 26) eller uden `.runtime`, fejler de native motor- og Privacy Gate-prøver miljøbetinget. Det er ikke en appfejl; reglen er i [udviklingsvejledningen](../desktop/README.md).

## Bane 2 — vagttjeneste ved versionstag

Workflowet [Byg testpakker](../.github/workflows/desktop-packages.yml) kører nu automatisk, når et appversionstag (`v*`, f.eks. `v0.5.0-beta.4`) pushes, og kan fortsat startes manuelt.

- **Hvad den beviser:** pr. versionstag bygger vagttjenesten pakken på macOS arm64, macOS x64 og Windows x64, kører hele Bane 1, kontrollerer pakkens version, kode, profiler og låste værktøjsmanifest, og afprøver gendannelse, Byg-forløbet (bygning, preview og fortrydelse med lokal testmodel) og demo i den pakkede app. Artefakterne bevares i syv dage med kontrolsumme.
- **Hvad den ikke beviser:** Apple-notarisering (bygningen er bevidst ad hoc-signeret på GitHub og rører ingen certifikater), fysisk hardware (GitHub-runnere er virtuelle maskiner), eller at downloadsiden leverer det rigtige indhold — efter udgivelsen kontrolleres det særskilt som beskrevet i [teststatus](teststatus.md).
- **Hvad den ikke gør:** vagttjenesten offentliggør intet. Udgivelses- og offentliggørelsesforløbet forbliver et særskilt, manuelt workflow med udtrykkelig godkendelse, og det røres ikke af denne ændring.

## Forholdet mellem banerne

| | Bane 1: hurtig kontrol | Bane 2: vagttjeneste |
|---|---|---|
| Hvornår | Ved hver kildeændring | Ved hvert appversionstag og manuelt |
| Hvor | Den udvikleres maskine | GitHub-runnere på tre platforme |
| Beviser | Kilden og kontrakterne | Bygget pakke på alle platforme |
| Ej beviser | Pakkede apps, fremmede platforme | Notarisering, fysisk hardware, downloads |
| Afprøver | `npm test`, `check.cjs` | Pakning, pakkekontrol, gendannelse, demo og Byg-forløbet med lokal testmodel |

## Grænseoversigt

- Ingen bane udfører modelkald hos en rigtig udbyder eller koster abonnement; Bane 2 bruger en kontrolleret testmodel.
- En grøn vagttjeneste er et uafhængigt bygnings- og afprøvelsesbevis — ikke et release-godkendelsesbevis. Udgivelsen afprøves fortsat lokalt efter de regler, der gælder pr. udgivelse.

## dokumenteret afvikling

27. oktober 2026: Workflowet `desktop-packages.yml` udvides med `push.tags: 'v*'` ved siden af den eksisterende manuelle start. Yaml-strukturen er syntaksvalideret lokalt (js-yaml); den første automatiske afvikling sker ved næste appversionstag.
