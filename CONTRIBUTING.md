# Bidrag til Aura Harness

Aura Harness er en udviklingsbeta med to brugsveje: instruktioner til dit eget kodeværktøj og desktopappen Aura. Vi tager udgangspunkt i kommunernes behov og vil gerne høre fra både udviklere og dem, der afprøver værktøjerne i deres arbejde.

Kontaktperson for betaen er **Parthee Vijayamohan**, [pavi@kalundborg.dk](mailto:pavi@kalundborg.dk). Kontaktpersonen koordinerer spørgsmål og bidrag med projektets bidragydere. Der er ingen garanteret svartid eller supportaftale.

## Fejl, forslag og erfaringer

[Opret en issue](https://github.com/ai-alliancen-org/ai-harness/issues) med det, du forsøgte, hvad du forventede, og hvad der skete. Oplys version, operativsystem og nødvendige trin. Brug opdigtede data, og fjern private oplysninger fra skærmbilleder og logs.

Sikkerhedsproblemer skal [rapporteres privat](SECURITY.md), ikke i en offentlig issue. Del aldrig borgeroplysninger, API-nøgler, adgangskoder, privat korrespondance eller fortroligt materiale fra samarbejdspartnere.

## Ændringer i kode og indhold

1. Beskriv behovet i en issue, før du begynder på en større ændring eller ny integration. En konkret rettelse kan sendes direkte som en pull request.
2. Arbejd i din egen fork og branch. Hold ændringen samlet om ét behov, og bevar eksisterende projekters filer og indstillinger.
3. Skriv brugerflade, vejledninger og beskrivelser på almindeligt dansk. Se [sprogvejledningen](docs/sprog.md) og appens [designprincipper](desktop/DESIGN.md).
4. Afprøv det berørte forløb. Beskriv separat, hvad der er skrevet, enhedstestet, kørt mod rigtige filer eller tjenester og observeret med brugere. Simulerede svar skal fremgå som simulerede. Manglende Windows- eller Mac-afprøvning skal stå tydeligt.
5. Åbn en pull request med problemet, ændringen og din afprøvning. Knyt den til den relevante issue, og nævn nye afhængigheder eller ændrede rettigheder. Et bidrag flettes først efter en vedligeholders gennemgang.

AI må gerne hjælpe med bidraget. Den, der indsender, skal selv gennemgå koden og kunne forklare dens funktion, rettigheder og begrænsninger. En models påstand om, at en test består, er ikke testdokumentation.

## Find den rigtige del

- **Grundregler og skills:** redigér kilderne i `profiles/`. Filplaceringer og beskrivelser ligger i `profiles/catalog.json`. Ændr kun en regel med en konkret begrundelse og en kilde, hvor det er relevant. Angiv værktøj, version og metode, når noget kaldes afprøvet.
- **Webguide og pakker:** se [bygning af hjemmesiden](docs/website.md). Genererede pakker og katalogsider bygges fra `profiles/`; de redigeres ikke direkte.
- **Appen og integrationer:** se [desktop/README.md](desktop/README.md) og [det tekniske grundlag](docs/teknisk-grundlag.md). Brug de eksisterende adaptere og det fælles bibliotek. Oplys modtagere, databehandling, pris, nødvendige rettigheder og ansvar for drift.

En integration skal have en ansvarlig kontakt, licens, kendte versioner og en reproducerbar afprøvning af både korrekt funktion og relevante fejl. Den må ikke aktivere sig selv, skifte til en betalt udbyder eller udvide brugerens rettigheder ubemærket. Tilgængelighed i kataloget er ikke en kommunal godkendelse.

## Lokal afprøvning

Appens afhængigheder og de lokale testkommandoer står i [desktop/README.md](desktop/README.md). Webguiden bygges med `node scripts/build-packages.cjs`; Pages-samlingen beskrives i [docs/website.md](docs/website.md).

GitHub Actions kører kun manuelt. Start eller genstart ikke workflows uden aftale med vedligeholderen om den konkrete kørsel. Et push, en pull request eller en release skal ikke starte CI/CD. Lokale resultater og deres begrænsninger vedlægges bidraget.

## Licens

Projektet bruger [EUPL-1.2](LICENSE), og bidrag indsendes under samme licens. Indsend kun materiale, du har ret til at dele. Bevar ophavsretstekster og licensoplysninger i tredjepartskode, og oplys om nye afhængigheder og deres licenser. Kopiér ikke logoer, designs, kommunale dokumenter eller kode fra andre projekter uden at have afklaret retten til det.

Se [betastatus](docs/beta.md) for de aktuelle begrænsninger og [teststatus](docs/teststatus.md) for dokumenteret afprøvning.
