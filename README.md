# AI Harness

Et modulært fundament til at bygge applikationer med AI. POC 1 er en dansk hjemmeside med instruktionspakker til Claude Code, Codex og OpenCode. POC 2 er påbegyndt som en lokal desktop-app med projektopstart og live-forhåndsvisning.

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

POC 2 har nu et desktopgrundlag i `desktop/`: opret og genåbn et lokalt projekt med designmateriale, fælles regler og løbende forhåndsvisning. Se [startvejledning og begrænsninger](desktop/README.md). AI-chat, Git-handlinger, hosting og installationspakker er endnu ikke implementeret.

Se [bidragsvejledningen](CONTRIBUTING.md). Ældre dokumenter i `docs/` og `harness-options.md` indeholder tidligere arkitekturforslag; POC 1 er afgrænset som beskrevet her.
