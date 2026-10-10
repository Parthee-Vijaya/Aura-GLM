# Gennemgang før offentlig beta

Kontrolleret 10. og 11. oktober 2026 med udgangspunkt i `79fa7d19191f52ca53792bd89e08276e2732412a` og de efterfølgende lokale ændringer til offentliggørelsen. GitHubs `main` svarede til samme commit. Repositoryet er fortsat privat; ingen filer, releases eller hjemmeside er offentliggjort i denne gennemgang.

## Historik og indhold

Gitleaks 8.30.1 er hentet fra projektets officielle release og kontrolleret mod udgiverens SHA-256. Scanningen brugte standardregler, fuld maskering af resultater og ingen undtagelser for fund i projektet.

- Alle **55 commits** på de lokale refs er scannet. Klonen er ikke overfladisk. GitHub oplyste én branch, `main`, ingen tags og ingen pull requests.
- Alle **1.131 historiske filversioner** er desuden eksporteret og scannet separat, inklusive komprimerede filer. **95 ZIP-versioner med 2.228 medlemsfiler** er kontrolleret for læsbarhed og supplerende mønstre for nøgler og personoplysninger.
- Alle **15 Actions-kørslers logs**, i alt **58 logfiler**, er hentet og scannet. Ingen logs manglede, og scanningen gav ingen træffere i dem. GitHub oplyste nul releases, byggeartefakter, issues og kommentarer. Wiki var slået fra.
- De **264 nuværende versionsstyrede og nye filer** er scannet i en separat kopi, så lokale afhængigheder, testarkiver og rå byggelogs ikke blandes ind i resultatet. Her genfandt scanneren kun de samme to syntetiske teststrenge.
- **11 PNG-versioner** er set: otte genererede designforslag, ét skærmbillede af testprojektet og to appikoner. Der blev ikke fundet adgangsnøgler eller privat korrespondance i billederne. Designforslagene er allerede mærket som koncepter; viste personer, kommunemærker og funktioner er ikke dokumentation for kommunal tilslutning eller funktionalitet.

**Resultat:** Ingen bekræftede adgangsnøgler eller private nøgler er fundet. Historikscanneren gav to træffere i `desktop/tests/change-review.test.cjs` og `desktop/tests/project-files.test.cjs`; begge er syntetiske strenge, som afprøver skjulning af hemmeligheder. Scanningen af samtlige filversioner genfandt dem i fire blob-versioner. De er gennemgået og ikke skjult med en generel undtagelse. Supplerende mønstersøgning gav alene testdata og et logfilnavn.

Der er almindelige Git-forfatteroplysninger og lokale kildestier i historikken. Et ældre promptarkiv indeholder en lokal brugermappesti. Dette bliver også synligt ved offentliggørelsen; historikken er ikke omskrevet. Kontaktmailen i de nye dokumenter er oplyst af brugeren til offentlig brug.

Kontrollen omfatter mønstersøgning og målrettet gennemgang af fund og billedmateriale. Den er ikke bevis for, at enhver mulig hemmelighed, personoplysning eller sikkerhedsfejl er udelukket. Den omfatter ikke lokale, ignorerede brugerprojekter eller indholdet af gamle installationsarkiver, som ikke ligger på GitHub. De lokale installationsfiler offentliggøres ikke ved et skift af repositoryets synlighed.

## Betatekster og bidrag

- README og hjemmesiden beskriver de to brugsveje og mærker projektet som udviklingsbeta.
- [Betastatus](beta.md) adskiller tilgængelig kildekode fra publicerede installationsfiler og beskriver den manglende afprøvning på testeres egne maskiner.
- [Bidragsvejledningen](../CONTRIBUTING.md) dækker app, skills, integrationer, lokal afprøvning og gennemgang af pull requests.
- [Sikkerhedsvejledningen](../SECURITY.md) angiver Parthee Vijayamohan og pavi@kalundborg.dk som privat kontaktvej. Der er ikke sendt mail eller afprøvet modtagelse, og der loves ingen svartid. GitHubs private sikkerhedsrapportering er ikke aktiveret som erstatning for mailen.
- EUPL-1.2 ligger i `LICENSE`. De medfølgende værktøjers separate licenser og kildearkiver er beskrevet i `desktop/packaging/licenses/LAES-MIG.md`; hjemmesiden siger ikke længere, at projektets licens mangler.

## Hjemmeside og udgivelseskontrol

Pages-workflowet er klargjort til offentlig adgang. Det kræver manuelt valg af `offentlig_udgivelse` på `main`, som er fravalgt fra start. Begge workflows har fortsat kun `workflow_dispatch`. Pages-workflowet er fortsat deaktiveret på GitHub.

Den fælles kontrol i `scripts/pages-access.cjs` kræver et offentligt repository og offentlig Pages med `build_type: workflow`. Kontrollen gentages med friske GitHub-svar før upload og før udgivelse. Et privat repository, ukendt adgang, manglende Pages eller branch-baseret automatisk bygning stopper forløbet. Der ændres ingen synlighed, og Pages oprettes ikke automatisk.

Den nye kontrol er kørt mod repositoryets **faktiske private API-svar og afviser det**. Offentlig og ukendt adgang er enhedstestet med kontrollerede svar. Den offentlige side afprøves lokalt med en tydeligt adskilt metadata-kopi, hvor kun synligheden er ændret; det er ikke en offentlig deployment.

## Verifikation

De 12 berørte enhedsprøver for Pages og downloadpakker består med Node 22.23.3. ZIP-pakkernes kontrolsummer matcher de eksisterende filer. Den indledende prøve med computerens Node 24.2.0 gav en forskel i ZIP-komprimeringen; prøven er gentaget med projektets fastlåste Node-version, og byggevejledningen er præciseret.

Browserprøven består for fem sider ved 1280 og 390 pixels med både faktiske private metadata og simuleret offentlig adgang: 20 visninger, 79 lokale links pr. gennemløb og ingen sidefejl eller vandret overløb. De to hovedvalg er fulgt til henholdsvis webguide og installation, og springlinket er afprøvet med tastatur. Billederne af forside, mobilvisning og installationsside er gennemgået. Resultatfilerne i `.cache/publication-review/` henviser til browserens billeder i lokale midlertidige mapper; den maskerede scanning ligger samme sted som resultatfilerne. Disse filer er ignoreret og indgår ikke i Pages. Se [byggevejledningen](website.md) for gentagelse.

**Niveau:** skrevet, enhedstestet og lokalt afprøvet mod rigtigt repositoryindhold og hentede GitHub-data. Ikke offentliggjort eller observeret med en ny bruger. Ingen GitHub-kørsel, commit, push, historikændring eller meddelelse til andre er udført.

## Før selve skiftet

1. Vedligeholderen gennemgår ændringerne, herunder kontaktoplysninger og den synlige historik, og sørger for commit og push. De nye dokumenter og `scripts/pages-access.cjs` skal med.
2. Repositoryets synlighed ændres kun efter udtrykkelig tilladelse. Offentlige kopier og forks kan ikke trækkes tilbage ved senere at gøre repositoryet privat igen.
3. Pages opsættes særskilt med GitHub Actions som kilde. Genaktivering og den konkrete manuelle kørsel kræver særskilt tilladelse; ingen branch-bygning, tidsplan eller automatisk CI/CD tilføjes.
4. Den faktiske offentlige side, links og downloads kontrolleres uden login efter udgivelsen. Installationsfiler skal fortsat gennem deres egne kontroller før en Release. En tilgængelig hjemmeside er ikke en installationsgodkendelse.

GitHubs [vejledning om synlighed](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility) beskriver, at kode, Actions-historik og logs bliver offentlige ved skiftet. Nye commits, workflows, logs eller releases efter denne gennemgang skal vurderes, før der træffes beslutning om offentliggørelse.
