# AI Harness

AI Harness hjælper dig med at bygge applikationer med AI. Du kan hente instruktioner til dit nuværende kodeværktøj eller bruge desktopappen, hvor samtale, kodeændringer og forhåndsvisning er samlet.

Projektet er startet med udgangspunkt i den offentlige sektors behov. Kommuner, udviklere og leverandører kan bidrage med kode, integrationer og erfaringer. Instruktionerne kan bruges uden appen.

## Vælg den del, du har brug for

**Brug instruktionerne i dit eget værktøj.** Hent danske grundregler til [Claude Code](site/dist/downloads/claude/LAES-MIG.md), [Codex](site/dist/downloads/codex/LAES-MIG.md) eller [OpenCode](site/dist/downloads/opencode/LAES-MIG.md). Læs, tilpas og læg dem i dit projekt. Desktopappen er ikke nødvendig.

**Byg i desktopappen.** Beskriv din idé, tilslut din egen AI, gennemgå ændringerne og se resultatet ved siden af samtalen. Projektfilerne ligger lokalt. Appen hjælper med Git og tilbyder særskilt testudgivelse til understøttede hostingtjenester. Se [installation og opsætning](desktop/README.md).

**Gem instruktioner og design til flere projekter.** Appen har redigerbare skills og lokale designpakker med farver, logoer og referencer. Delbar import/eksport, projektpakker og centrale organisationsprofiler er planlagt, men har endnu ikke et fælles pakkeformat.

## Hvad består projektet af?

- **Skills og instruktioner** beskriver hvordan agenten skal håndtere hemmeligheder, Git, afprøvning og dokumentation.
- **Design- og projektpakker** skal gøre fælles valg lette at genbruge uden at låse projekter til appen.
- **Integrationer** forbinder modeller, kodeagenter, Git og hosting. De eksisterende adaptere er kode i projektet; der er endnu ikke et system til at installere eksterne plugins.
- **Organisationsprofiler** skal skelne mellem anbefalinger, standardvalg og håndhævede krav. Central administration og cloud-arbejdsområder er planlagt.

Instruktioner vejleder modellen. Adgangskontrol og godkendelser skal håndhæves af det værktøj eller miljø, der udfører handlingen. En eksporteret tekstfil kan ikke i sig selv garantere samme beskyttelse i alle kodeværktøjer.

Vi planlægger import og eksport af læsbare filer i pakker med versionsnumre. Brugeren skal kunne gennemgå indholdet, før eksisterende filer ændres. Nøgler, login og private samtaler skal holdes uden for almindelige delingspakker. Det er et designprincip, ikke en færdig eksportfunktion.

## Giv koden videre til en udvikler

Resultatet er almindelige projektfiler og Git-historik, når du vælger versionsstyring. En udvikler kan overtage koden med de nødvendige oplysninger om opsætning og drift. Projektfilerne kan åbnes og videreudvikles uden AI Harness.

## Prøv eller bidrag

Løsningen er under udvikling og afprøves med inviterede testere. Installation, signering og konkret teststatus fremgår af [desktopvejledningen](desktop/README.md). Licens og vedligeholdelsesansvar skal stadig aftales; ambitionen er open source.

- [Bidrag med kode, integrationer eller feedback](CONTRIBUTING.md)
- [Fælles instruktioner og skills](profiles/)
- [Start desktopappen fra kildekoden](desktop/README.md#start-fra-kildekoden)
- [Byg og vedligehold hjemmesiden](docs/website.md)
- [Skriv tekster til projektet](docs/sprog.md)
