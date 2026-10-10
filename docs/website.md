# Vedligeholdelse af hjemmeside og downloads

## Byg pakker og sider lokalt

Kræver Node.js 22.12 eller nyere. Der er ingen eksterne afhængigheder, konti eller API-nøgler.

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

**7. oktober 2026:** den samlede side er bygget fra faktiske repository-/release-svar. Repositoryet er stadig privat, der er nul releases, og Pages-API svarer HTTP 404. Ingen synlighed eller udgivelse er ændret. De fem sider er kørt i Chrome ved 1280 og 390 pixels: 10 visninger, 79 lokale links med HTTP 200 og ingen sidefejl eller vandret overløb. Installationssiden og forsiden bruger Auras koboltfarve. Testen dækker lokal betjening og faktiske metadata, ikke adgang fra en testpersons konto eller installation. Gentag med `npm run test:demo-web -- RELEASE-JSON REPOSITORY-JSON` fra `desktop/`.

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

**Aktuel adgang:** Kun inviterede testere. Repositoryet er privat, og organisationens abonnement er GitHub Free (kontrolleret 25. september 2026). Privat Pages kræver [GitHub Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site). Derfor er Pages endnu ikke aktiveret. Deployment sker kun, når GitHubs Pages-API udtrykkeligt oplyser `public: false`; et privat repository gør ikke automatisk selve Pages-siden privat. Så længe Pages ikke er slået til, bygger workflowet siden og springer udgivelsen over med en besked i kørslen. Offentlig Pages, en uklar synlighed og andre API-fejl stopper kørslen som fejl. Kontrollen blev ændret 29. september 2026, fordi hvert push ellers endte som en fejlet kørsel, selv om intet var gået i stykker.

Indtil privat Pages er tilgængeligt, kan inviterede testere med læseadgang hente installationsfiler fra repositoryets private Releases. Der findes endnu ingen release med installationsfiler. Udgiv kun de gennemgåede pakker gennem repositoryets CI/CD med præcis signerings-/teststatus og kontrolsummer. Det nuværende pakkeworkflow leverer midlertidige Actions-arkiver; det opretter ikke en Release. Apple-loginprofilen er oprettet og valideret 10. oktober; notarisation og downloadadgang skal stadig kontrolleres for den konkrete fil, jf. [teststatus](teststatus.md#installationskontrol-før-invitation--10-oktober-2026). En offentlig informationsside med private downloads er en anden mulighed, men er ikke valgt eller aktiveret.

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
