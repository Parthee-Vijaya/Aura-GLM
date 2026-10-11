# Vedligeholdelse af hjemmeside og downloads

## Byg pakker og sider lokalt

Brug Node.js 22.23.3, som også er fastlåst til appens bygning. Andre Node-versioner kan komprimere ZIP-filerne forskelligt og dermed give andre kontrolsummer. Bygningen har ingen eksterne afhængigheder, konti eller API-nøgler.

Byg pakkerne, kataloget og de genererede sider fra det fælles bibliotek:

```bash
node scripts/build-packages.cjs
```

Start en lokal webserver fra projektets rodmappe:

```bash
python3 -m http.server 4173 --bind 127.0.0.1 --directory site/dist
```

Åbn http://127.0.0.1:4173. Server kun `site/dist`, aldrig projektets rodmappe med lokale indstillinger og Git-data.

## Indhold og vedligeholdelse

- `profiles/grundregler.md`: fælles danske grundregler med version og kontrolord.
- `profiles/skills/<navn>/SKILL.md`: de 12 skills og integrationerne til agenten. Kun Markdown, ingen scripts, og kun felterne `name` og `description`. Integrationer hedder `harness-integration-<system>` og følger ikke med pakkerne; se [integrationsskills.md](integrationsskills.md).
- `profiles/catalog.json`: skillsenes beskrivelser til mennesker, spørgsmål og svar, kilder, værktøjernes filplaceringer og appens funktioner, hvor hver skill hører til præcis én funktion.
- `profiles/gitignore.txt`: afsnittet til projektets `.gitignore`.
- `desktop/core/library.cjs`, `adapters.cjs` og `installer.cjs`: indlæsning og validering af biblioteket, filplacering pr. værktøj og sikker installation. Appen, `scripts/harness.cjs` og byggescriptet bruger de samme moduler.
- `scripts/build-packages.cjs`: genererer ZIP-pakker, `site/dist/catalog.json`, `skills.html`, `vaerktoejer.html`, de direkte downloads i `index.html` og `profiles/SKILLS.md`. Ret kilden i `profiles/`, og byg igen. Ret ikke de genererede filer.

Nye værktøjer tilføjes i kataloget med regelfil, skillmapper, kontrol, forbehold og officielle kilder. Status `afproevet` kræver en beskrivelse af version, dato og metode i `testedWith`. Downloadpakker må ikke indeholde lokale arbejdsregler, nøgler eller privat materiale.

## Afprøvning

Kør enhedsprøverne og browserprøven lokalt. Browserprøven bygger ud fra gemte GitHub-metadata og kontrollerer de fem sider på computer- og mobilbredde, begge brugsveje og de lokale links. Den udgiver intet. Aktuelle resultater og afgrænsning står i [gennemgangen før offentliggørelse](offentliggoerelse.md).

```bash
cd desktop
npm test
```

`packages.test.cjs` kontrollerer de faktiske ZIP-filer mod installationens filer, manifestets kontrolsummer, at bygningen er reproducerbar og opdateret, og at alle lokale links i den samlede side findes. `library.test.cjs` installerer og fjerner hvert værktøjs pakke i en tom mappe. Kontrollér også siden i en browser på computer- og mobilbredde. Pakkerne er instruktioner, ikke teknisk håndhævelse. Modeladfærd skal afprøves særskilt med det konkrete værktøj og den konkrete model.

## Downloadside og GitHub Pages

`site/dist/overview.html` er forsiden med projektets formål og de to brugsveje: eget kodeværktøj og Aura-appen. `desktop.html` er installationsvejledningen, og `index.html` er kilden til instruktionssiden `pakker.html`. Det faglige grundlag og de foreslåede kontroller ligger i [harness-grundlag.md](harness-grundlag.md) og [projektkontrol.md](projektkontrol.md); de er ikke en erklæring om implementerede funktioner.

`vaerktoejer.html` og `skills.html` genereres fra kataloget. Værktøjsoversigten viser for hvert værktøj, hvor filerne lægges, hvordan indlæsningen kontrolleres, og om placeringen er afprøvet eller følger dokumentationen. `skills.html` er FAQ'en om de skills, der følger med. [Teknisk grundlag](teknisk-grundlag.md) dokumenterer den faktiske OpenCode-arkitektur, Pi som kandidat og mulighederne for en senere webudgave. Brug den samlede Pages-bygning nedenfor, når navigationen mellem forside, værktøjsoversigt og pakker skal afprøves.

`scripts/build-pages.cjs` bygger forsiden fra faktiske GitHub Releases. Instruktionspakkerne bevares som `pakker.html`. Kun publicerede releasefiler vises; kladder og ukendte filtyper udelades. GitHubs kontrolsum vises, når den foreligger. Notarisation udledes ikke af filnavnet; installationsstatus skal dokumenteres i udgivelsesnoterne.

Workflowet `.github/workflows/pages.yml` kan kun startes manuelt. Det er desuden deaktiveret på GitHub fra 10. oktober 2026 efter brugerens ønske om at spare Actions-minutter. Ingen push eller release må starte en bygning. Genaktivering og hver konkret kørsel kræver brugerens udtrykkelige tilladelse; en anmodning om installationsfiler er ikke tilladelse til at bruge Actions. Workflowet uploader kun den genererede statiske mappe, aldrig installationsfiler, tokens eller repositoryroden. Det opretter ingen releases, tags eller commits.

### Klargøring til offentlig beta

**Status 11. oktober 2026:** Repositoryet er offentligt, og Pages er oprettet med GitHub Actions som kilde og HTTPS aktiveret. Siden er endnu ikke udgivet; workflowet er fortsat deaktiveret. [Gennemgangen før offentliggørelse](offentliggoerelse.md) dokumenterer kontrollen før skiftet til offentlig adgang.

Den lokale kontrol af udgivelseskommandoen fandt, at GitHub CLI ikke kan kombinere `--slurp` med `--jq`. Workflowet sender nu de indsamlede sider til `jq 'add'` som en separat kommando. Den rettede kommando er afprøvet mod repositoryets faktiske releasedata. Rettelsen skal være på `main`, før den godkendte manuelle udgivelse startes.

Workflowet kræver en manuel start på `main` med bekræftelsen `offentlig_udgivelse`. Feltet er som udgangspunkt slået fra. Det kontrollerer friske API-svar før bygning, før upload og før udgivelse:

- Repositoryet skal være `ai-alliancen-org/ai-harness` med `private: false` og `visibility: public`.
- Pages skal oplyse `public: true` og `build_type: workflow`. Branch-baseret automatisk Pages-bygning accepteres ikke.
- En manglende Pages-opsætning, ukendt adgang eller API-fejl stopper kørslen. Workflowet opretter ikke selv Pages og gør ikke repositoryet offentligt.

`scripts/pages-access.cjs` indeholder den fælles kontrol. Den kan også køres lokalt mod gemte API-svar. Vedligeholderen skal særskilt godkende skiftet til offentlig adgang, opsætningen af Pages med GitHub Actions som kilde samt genaktivering og den konkrete manuelle kørsel. Vælg ikke “Deploy from a branch”, da det kan starte bygninger ved push.

Kun hjemmesiden og tekstpakkerne uploades som Pages-indhold. Installationsfiler hentes via faktiske GitHub Releases; de kopieres ikke til Pages. Et offentligt repository har også offentlige publicerede Releases og offentlig historik. Private testfiler skal derfor ikke lægges i en publiceret Release her.

Der findes endnu ingen release med installationsfiler. Udgiv kun gennemgåede pakker med præcis signerings-/teststatus og kontrolsummer. En anmodning om at klargøre betaen giver ikke tilladelse til en Release eller en betalt byggeproces. Se [betastatus](beta.md) og [den konkrete installationskontrol](teststatus.md#installationskontrol-før-invitation--10-oktober-2026).

### Se den samlede forside lokalt

Læs metadata med den eksisterende GitHub CLI-adgang. Disse kommandoer ændrer ikke repositoryet eller dets synlighed:

```bash
mkdir -p .cache
gh api repos/ai-alliancen-org/ai-harness/releases > .cache/pages-releases.json
gh api repos/ai-alliancen-org/ai-harness --jq '{full_name, private, visibility}' > .cache/pages-repository.json
node scripts/build-pages.cjs .cache/pages-releases.json .cache/pages-repository.json
python3 -m http.server 4184 --bind 127.0.0.1 --directory .cache/pages
```

Åbn http://127.0.0.1:4184/. Bygningen samler forsiden, webguiden og installationssiden, så de interne links kan afprøves. Tjek store og små vinduer, tastaturnavigation og begge brugsveje. De to JSON-filer og den byggede mappe er lokale, ignorerede filer.

### Gentag browserkontrollen

Fra `desktop/`, med Google Chrome installeret:

```bash
npm run test:demo-web -- ../.cache/pages-releases.json ../.cache/pages-repository.json
```

Kontrollér også billederne fra prøven. Et simuleret `private: false` i en lokal kopi af metadata kan bruges til at afprøve den offentlige visning; det er ikke dokumentation for repositoryets faktiske adgang. Den sidste kontrol før upload skal altid bruge friske svar fra GitHub.

GitHub ændres først efter vedligeholderens gennemgang, commit og push samt særskilt godkendelse af offentliggørelsen og den konkrete kørsel.
