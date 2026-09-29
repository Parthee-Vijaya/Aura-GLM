# Vedligeholdelse af hjemmeside og downloads

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

## Downloadside og GitHub Pages

`site/dist/overview.html` er forsiden med projektets formål og de to brugsveje: eget kodeværktøj og AI Harness-appen. `desktop.html` er installationsvejledningen, og `index.html` er kilden til instruktionssiden `pakker.html`. Det faglige grundlag og de foreslåede kontroller ligger i [harness-grundlag.md](harness-grundlag.md) og [projektkontrol.md](projektkontrol.md); de er ikke en erklæring om implementerede funktioner.

`vaerktoejer.html` er en kildebelagt oversigt over ti andre kodeværktøjer. Den beskriver mulige integrationer og må ikke læses som en liste over afprøvet Harness-understøttelse. [Teknisk grundlag](teknisk-grundlag.md) dokumenterer den faktiske OpenCode-arkitektur, Pi som kandidat og mulighederne for en senere webudgave. Brug den samlede Pages-bygning nedenfor, når navigationen mellem forside, værktøjsoversigt og pakker skal afprøves.

`scripts/build-pages.cjs` bygger forsiden fra faktiske GitHub Releases. Instruktionspakkerne bevares som `pakker.html`. Kun publicerede releasefiler vises; kladder og ukendte filtyper udelades. GitHubs kontrolsum vises, når den foreligger. Notarisation udledes ikke af filnavnet; installationsstatus skal dokumenteres i udgivelsesnoterne.

Workflowet `.github/workflows/pages.yml` bygger ved relevante push til `main`, ved publicering/redigering/sletning af releases eller manuelt. Tilføjelse af filer til en eksisterende release kræver en manuel kørsel bagefter. Det uploader kun den genererede statiske mappe, aldrig installationsfiler, tokens eller repositoryroden. Workflowet opretter ingen releases, tags eller commits.

**Aktuel adgang:** Kun inviterede testere. Repositoryet er privat, og organisationens abonnement er GitHub Free (kontrolleret 25. september 2026). Privat Pages kræver [GitHub Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site). Derfor er Pages endnu ikke aktiveret. Deployment sker kun, når GitHubs Pages-API udtrykkeligt oplyser `public: false`; et privat repository gør ikke automatisk selve Pages-siden privat. Så længe Pages ikke er slået til, bygger workflowet siden og springer udgivelsen over med en besked i kørslen. Offentlig Pages, en uklar synlighed og andre API-fejl stopper kørslen som fejl. Kontrollen blev ændret 29. september 2026, fordi hvert push ellers endte som en fejlet kørsel, selv om intet var gået i stykker.

Indtil privat Pages er tilgængeligt, kan inviterede testere med læseadgang hente installationsfiler fra repositoryets private Releases. Der findes endnu ingen release med installationsfiler. Publicér kun de gennemgåede pakker med præcis signerings-/teststatus og kontrolsummer; den lokale Mac-notarisation afventer registrering af Apples medlemsfornyelse og gyldig loginprofil. En offentlig informationsside med private downloads er en anden mulighed, men er ikke valgt eller aktiveret.

### Se den samlede forside lokalt

Læs metadata med den eksisterende GitHub CLI-adgang. Disse kommandoer ændrer ikke repositoryet eller dets synlighed:

```bash
mkdir -p .cache
gh api repos/ai-alliancen-org/ai-harness/releases > .cache/pages-releases.json
gh api repos/ai-alliancen-org/ai-harness --jq '{full_name, private}' > .cache/pages-repository.json
node scripts/build-pages.cjs .cache/pages-releases.json .cache/pages-repository.json
python3 -m http.server 4184 --bind 127.0.0.1 --directory .cache/pages
```

Åbn http://127.0.0.1:4184/. Bygningen samler forsiden, webguiden og installationssiden, så de interne links kan afprøves. Tjek store og små vinduer, tastaturnavigation og begge brugsveje. De to JSON-filer og den byggede mappe er lokale, ignorerede filer.

**Verifikation:** Tre automatiske tests afprøver tom tilstand, privat adgangstekst, udeladelse af kladder, downloadadresser og bevarelse af POC 1-pakker. Siden er også bygget fra repositoryets faktiske API-svar, som aktuelt indeholder nul releases. Ingen Pages-deployment eller download fra GitHub Releases er endnu udført. Kildeændringerne skal først gennemgås, committes og pushes af vedligeholderen.

Den 28. september 2026 er den omskrevne forside bygget fra friske GitHub-metadata og afprøvet i browseren. Begge brugsveje er fulgt til webguide og installationsside; alle tre værktøjsvalg viser det tilsvarende downloadlink. Springlink og tastaturfokus er kontrolleret. Visning ved 1280 og 390 pixels er kontrolleret uden vandret overløb. De tre Pages-tests og tre tests af de faktiske downloadpakker består. Det dokumenterer siden og pakkeindholdet, ikke modeladfærd, brugerforståelse eller de foreslåede nye integrationer.

Samme dag er værktøjsoversigten bygget med de allerede hentede GitHub-metadata og afprøvet via forsidens link. Alle ti værktøjer vises, kategorilink og springlink er fulgt, og forbindelsen videre til de eksisterende pakker er kontrolleret. Ved 390 pixels vises én kolonne; ved 1280 pixels viser browserens layout to kolonner uden vandret overløb. De 37 lokale HTML-links og ressourcer i Pages-outputtet findes, og de seks eksisterende tests består. Arkitekturbeskrivelsen bygger på kildegennemgang, og oplysninger om de ti værktøjer på deres officielle dokumentation. Ingen ny værktøjsintegration, Pi-motor, webbackend eller offentlig deployment er afprøvet eller tilføjet.
