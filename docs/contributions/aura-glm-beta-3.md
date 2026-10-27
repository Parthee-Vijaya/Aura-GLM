# Aura GLM beta 3

Udgivelsesdato: 27. oktober 2026. Teknisk version: `1.0.0-beta.3`.

DMG og opdaterings-ZIP er bygget fra commit på grenen `work/aura-glm-about-dialog-20261027`.

| Artefakt | SHA-256 |
|---|---|
| `Aura-GLM-1.0.0-beta.3-mac-arm64.dmg` | `eab4b42373846ae8a3e94315881e3b8db53bd8349f27b5aa1c4a063a07375f1d` |
| `Aura-1-1.0.0-beta.3-mac-arm64.zip` | `22a1b86692fe9c2987efae6e1d69df221d93badb01fd78af64c1bf2940babb18` |

## Nyt: Om-dialogen med de kørende versioner

Appens menu har nu punktet **Om Aura GLM …** (i stedet for systemets enkl About-panel). Dialogen viser:

- **Appversion** — aflæses fra appens metadata (`app.getVersion()`), så den altid matcher pakken.
- **OpenCode (låst)** — den låste og afprøvede motorversion fra appens `runtime-lock.json`.
- **Electron / Chromium / Node (indbygget)** — aflæses fra den faktisk kørende runtime.
- **Node til agenten (låst)** og **Git til agenten (låst)** — værktøjspakkens låste versioner.
- **Maskine** — platform, arkitektur og systemudgave.

macOS' egne About-panel (Cmd-About) er samtidig beriget med den samme versionsrække som standard-Credits-linje, så der er to steder at se det.

Værdierne kommer fra en ny lille, fast-felt-saneret kilde: `desktop/core/about-info.cjs`. Den godkender kun kendte versionsformat-, platform- og udgivelsesstrenge — aldrig stier, miljøværdier eller andet indhold (samme disciplines som motoropstartsregistreringen). Dialogen åbnes gennem appens eksisterende menyhændelse (`about.open` sendes via `harness:event`, håndteres i samtalens hændelsesstruktur, og `openAbout()` henter data gennem preload-kanalen `about:info`.

## Afprøvning af beta 3

- **Fra kilde:** Unit-suite 1.925/1.959 beståede (2 kendte miljøfejl af afprøvningsmiljøet — uafhængige af ændringen). Verificeringstest af om-kildens faste felter (2 nye tests) består separat under `desktop/tests/about-info.test.cjs`.
- **Fra den pakkede app (Electron 45.0.0):** `verify-package` bestået. AI-brugerrejse mod kontrolleret model: alle 9 kontroller bestået, herunder Privacy Gate. **Om-dialogens rækker er verificeret direkte fra den pakkede app**: Appversion 1.0.0-beta.3 · OpenCode (låst) 2.1.4 · Electron 45.0.0 · Chromium 156.0.8078.48 · Node (indbygget) 24.22.0 · Node til agenten (låst) 22.23.3 · Git til agenten (låst) 2.53.0 · Maskine darwin arm64 25.6.0.
- Skærmoptagelser af dialogen findes i `/tmp/aura-about-dialog-beta3.png` (afprøvningsmaskine).

## Begrænsninger

- Ad hoc-signeret DMG, ikke Apple-notariseret (samme betingelser som tidligere betaudgivelser). Gatekeeper advarer ved første start.
- Om-dialogen viser OpenCode-, Git- og Node-værdierne fra den **låste** værktøjspakke. Hvis den faktisk startede motor afviger fra låsegodkendelsen, fanges det af motorens sundhedskontrol og vises som en Start-fejl i samtalen — om-dialogen præsenterer altså aftalen om 'den afprøvede version'.
- Menupunktet 'Om Aura GLM …' aflæser versionsdata ved **åbningstidspunktet**; en igangværende opdatering af motor eller runtime afspejles først efter genstart. Det er acceptabelt for et versions-vindue og undgår en baggrundspolling.

## Sådan afprøves den

- Download eller kopiér `Aura-GLM-1.0.0-beta.3-mac-arm64.dmg` fra `desktop/release/`. SHA-256 verificeres med `shasum -a 256`.
- I appen: Menuen **Aura GLM → Om Aura GLM …** viser dialogen med alle versioner (og macOS' About-panel viser den korte versionsliste i Credits). Sørg for at bruge et separat testprojekt med opdigtede data.
