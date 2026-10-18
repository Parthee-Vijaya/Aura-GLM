# Indlæsning og distribution

## Projektets egne regler

Aura indlæser `AGENTS.md` i arbejdsområdets rod før afsendelse i både desktopappen og CLI'en. Andre regelformater, overordnede mapper og regler i undermapper indlæses ikke automatisk i dette forløb.

Filen skal være en almindelig UTF-8-fil på højst 32 KiB. Symbolske links, ulæseligt indhold og for store filer stopper afsendelsen med en forklaring. Der afkortes ikke i stilhed. Indhold, kilde og SHA-256 fremgår under **Se alle oplysninger** før afsendelse. Indholdet sendes til den valgte model som projektinstruktioner; filen må derfor ikke indeholde hemmeligheder eller materiale, der ikke må deles med forbindelsen.

Projektregler går forud for Aura Harness' standardvalg. De udvider ikke værktøjernes adgang og tilsidesætter ikke brugerens konkrete afgrænsning. Modellen instrueres i at beskrive modstrid og spørge før den berørte handling. Dette er en instruks til modellen, ikke en automatisk semantisk konfliktkontrol.

Ændringer i filen kræver ny datagennemgang og ny modelsession. Aura kontrollerer igen før afsendelse, også efter motoropstart, så et gammelt gennemgået indhold ikke bruges i stilhed. I en samtalekopi bruges kopiens fil. Motorens automatiske projektkonfiguration er fortsat isoleret; projektreglerne sendes eksplicit gennem den fælles samtalemotor.

## Fælles skills og brugerflader

`profiles/grundregler.md`, `profiles/catalog.json` og mapperne i `profiles/skills/` er indholdskilderne. `library.cjs` validerer dem. `skills.cjs` anvender funktionstilvalg og projekttilpasninger. Grundregler sendes direkte; aktive skills og deres referencefiler stilles til rådighed for skill-værktøjet.

Tilpassede skills kontrolleres både før lagring og før brug. Henvisninger skal pege på medfølgende referencefiler eller kendte skills. Henvisninger mellem skills skal tåle et fravalg. En ugyldig ældre tilpasning skal rettes eller gendannes; den overskrives ikke automatisk. Tilpasning af referencefilernes indhold er ikke en ny funktion i denne milepæl.

Desktopappens og CLI'ens korte værktøjsinstruktioner vælges særskilt. CLI'en henviser til `aura login`, `/save`, `/versions`, `/undo`, `/preview`, `/server` og `/deploy`, hvor det er relevant. Terminalens første opgave bruger Planlæg, også hvis den fælles historik har desktopstandardens Samtale. En testudgivelse kan ikke tilsidesætte projektets aftalte CI/CD-proces.

## Distribution

Installer og eksportgenerator bruger samme filliste. Hver kodeværktøjspakke medtager `.harness/LICENSE` med repositoryets uændrede EUPL-1.2-tekst og `.harness/NOTICE.md` med oprindelse og kildehenvisning. Disse filer er omfattet af installationens kontrolsummer, konfliktkontrol, opdatering og fjernelse. En ændret licensfil overskrives ikke automatisk.

Desktoppakken medtager repositoryets `LICENSE` ved siden af `profiles/`, så den installerede app kan levere samme licens ved eksport. CLI-pakken medtager desuden de to fælles brugerflademoduler, som samtalemotoren afhænger af. CLI-arkivets tilladte filliste omfatter kun de navngivne moduler, ikke hele desktopbrugerfladen.

`profiles/SKILLS.md`, `site/dist` og ZIP-filerne genereres fra kilderne. Bygning og afprøvning af en lokal pakke er ikke en udgivelse eller dokumentation for, hvad en senere Git-baseret bygning ser. Nye kildefiler skal med i brugerens commit, før en fjernbygning kan indeholde dem. Lokale CLI-prøvepakker bygges med `--local` og markeres `publishable: false`.

## Gentagelige lokale prøver

Brug Node-versionen fra repositoryets byggevejledning. Fra `desktop/`:

```sh
npm test
npm run test:library-loading
npm run test:app-skills
npm run test:skills-opencode
npm run test:chat
```

`test:library-loading` bruger rigtig OpenCode og en kontrolleret lokal modelserver gennem Workbench. Den kontrollerer projektregler i Samtale, Planlæg og CLI, afvisning af afsendelse efter ændrede regler, ny modelsession, skilltilvalg, referencelæsning og afvisning af en fravalgt skill. `test:app-skills` undersøger motorens isolerede adgang direkte, uden den fælles samtalemotors eksplicitte projektinstruktioner. De to prøver undersøger derfor forskellige lag.

`test:skills-opencode` udpakker den faktiske OpenCode-ZIP i et midlertidigt projekt og undersøger grundregler, skillindlæsning og licensfiler. CLI'ens fulde terminalprøve køres både fra kilderne og mod en separat installeret npm-pakke efter `docs/udgivelse-cli.md`. Ingen af prøverne bruger betalte modelkald. Modelserverens forudbestemte værktøjskald beviser indlæsning og adgang, ikke en rigtig models selvstændige regelfølge.

Aktuel evidens og platformsbegrænsninger står i `docs/teststatus.md`.
