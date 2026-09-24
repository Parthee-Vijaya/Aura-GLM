# AI Harness

Et modulært fundament til at bygge applikationer med AI. POC 1 er en dansk hjemmeside med instruktionspakker til Claude Code, Codex og OpenCode. POC 2 er en lokal desktop-app med projektopstart, kodeagent, modelforbindelser, designpakker og live-forhåndsvisning.

## Kør POC 1 lokalt

Kræver Python 3.10 eller nyere. Der er ingen eksterne afhængigheder, konti eller API-nøgler.

Byg downloadpakkerne fra det fælles profilgrundlag:

```bash
python3 scripts/build.py
```

Start en lokal webserver fra projektets rodmappe:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

Åbn http://127.0.0.1:4173. Server kun `site/dist`, aldrig projektets rodmappe med lokale indstillinger og Git-data.

## Indhold og vedligeholdelse

- `profiles/grundregler.md`: fælles danske instruktioner.
- `profiles/gitignore.txt`: forslag til modtagerens .gitignore; ingen personlige projektregler.
- `profiles/catalog.json`: værktøjernes filnavne, vejledning, kilder og version.
- `scripts/build.py`: genererer læsbare filer, indholdsmanifest og reproducerbare ZIP-pakker.
- `site/dist/`: den statiske hjemmeside og dens offentlige downloadfiler. Filerne i denne mappe skal med i Git.

Ret profilerne ved kilden, og byg igen. Ved versionsændringer opdateres også de direkte downloadlinks og versionsangivelsen i `site/dist/index.html`. Downloadpakker må ikke indeholde lokale arbejdsregler, nøgler eller privat materiale.

## Afprøvning

```bash
python3 -m unittest discover -s tests -v
```

Kontrollér også siden i en browser: vælg alle tre værktøjer, se filerne, hent pakkerne og følg vejledningen i et separat prøveprojekt. Pakkerne er instruktioner, ikke teknisk håndhævelse. Modeladfærd skal afprøves særskilt med det konkrete værktøj og den konkrete model.

## Status og næste POC

POC 1 kræver ikke modelkald og installerer ikke automatisk noget i brugerens projekt. Den er endnu ikke offentliggjort. Licens og vedligeholdelsesansvar skal aftales før ekstern kodeudveksling.

POC 2 i `desktop/` åbner lokale mapper og forbinder en OpenCode-kodeagent med valgte modeller. Designpakker kan genbruges, skills tilpasses, og modeldata/godkendelser gennemgås før handlinger. Se [startvejledning, verifikation og begrænsninger](desktop/README.md). Lokal manuel versionsgemning og valgfrie Git-checkpoints er implementeret. GitHub-forbindelse og særskilt kodepublicering er implementeret med eksplicit gennemgang før push. Andre Git-udbydere, cloud-arbejdsområder, deployment og installationspakker er endnu ikke implementeret. En rigtig kodeændring med gratis Cohere-model via OpenRouter er afprøvet i Electron. GitHub-API’et er afprøvet med kontrollerede svar og push til en lokal Git-server; live-GitHub afventer konto/appregistrering.

Se [bidragsvejledningen](CONTRIBUTING.md). Ældre dokumenter i `docs/` og `harness-options.md` indeholder tidligere arkitekturforslag; POC 1 er afgrænset som beskrevet her.
