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

POC 2 i `desktop/` åbner lokale mapper og forbinder en OpenCode-kodeagent med valgte modeller. Designpakker kan genbruges, skills tilpasses, og modeldata/godkendelser gennemgås før handlinger. Se [startvejledning, verifikation og begrænsninger](desktop/README.md). Lokal manuel versionsgemning og valgfrie Git-checkpoints er implementeret. GitHub-forbindelse og særskilt kodepublicering er implementeret med eksplicit gennemgang før push. Testudgivelse til Vercel og Azure Static Web Apps er tilsluttet med separat filgennemgang og uploadgodkendelse; se desktop-vejledningens verifikationsniveau og begrænsninger. Lokale installationspakker til Mac og Windows samt en dansk downloadside er tilføjet. Apple Silicon-pakken er kørt med rigtig kodeændring og preview; Windows og Intel-Mac er ikke kørt på målmaskiner. Mac-notarisation og offentlig distribution afventer. Andre Git-udbydere og cloud-arbejdsområder er endnu ikke implementeret. En rigtig kodeændring med gratis Cohere-model via OpenRouter er afprøvet i Electron. GitHub-API’et er afprøvet med kontrollerede svar og push til en lokal Git-server; live-GitHub afventer konto/appregistrering.

Se [bidragsvejledningen](CONTRIBUTING.md). Ældre dokumenter i `docs/` og `harness-options.md` indeholder tidligere arkitekturforslag; POC 1 er afgrænset som beskrevet her.


## Downloadside og GitHub Pages

`scripts/build-pages.cjs` bygger en separat downloadforside fra faktiske GitHub Releases. Instruktionspakkerne bevares som `pakker.html`. Kun publicerede releasefiler vises; kladder og ukendte filtyper udelades. GitHubs kontrolsum vises, når den foreligger. Notarisation udledes ikke af filnavnet; installationsstatus skal dokumenteres i udgivelsesnoterne.

Workflowet `.github/workflows/pages.yml` bygger ved relevante push til `main`, ved publicering/redigering/sletning af releases eller manuelt. Tilføjelse af filer til en eksisterende release kræver en manuel kørsel bagefter. Det uploader kun den genererede statiske mappe, aldrig installationsfiler, tokens eller repositoryroden. Workflowet opretter ingen releases, tags eller commits.

**Aktuel adgang:** Kun inviterede testere. Repositoryet er privat, og organisationens abonnement er GitHub Free (kontrolleret 25. september 2026). Privat Pages kræver [GitHub Enterprise Cloud](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site). Derfor er Pages endnu ikke aktiveret. Deployment stopper, medmindre GitHubs Pages-API udtrykkeligt oplyser `public: false`; et privat repository gør ikke automatisk selve Pages-siden privat.

Indtil privat Pages er tilgængeligt, kan inviterede testere med læseadgang hente installationsfiler fra repositoryets private Releases. Der findes endnu ingen release med installationsfiler. Publicér kun de gennemgåede pakker med præcis signerings-/teststatus og kontrolsummer; den lokale Mac-notarisation afventer fortsat Apple-loginprofil. En offentlig informationsside med private downloads er en anden mulighed, men er ikke valgt eller aktiveret.

**Verifikation:** Tre automatiske tests afprøver tom tilstand, privat adgangstekst, udeladelse af kladder, downloadadresser og bevarelse af POC 1-pakker. Siden er også bygget fra repositoryets faktiske API-svar, som aktuelt indeholder nul releases. Ingen Pages-deployment eller download fra GitHub Releases er endnu udført. Kildeændringerne skal først gennemgås, committes og pushes af vedligeholderen.
