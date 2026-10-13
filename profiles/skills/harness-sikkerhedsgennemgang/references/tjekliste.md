# Tjekliste til sikkerhedsgennemgang

Vælg de afsnit, ændringen berører. Brug for hver kontrol ét resultat: **Afprøvet uden fund**, **Bekræftet fejl**, **Skal undersøges**, **Ikke gennemført** eller **Ikke relevant** med begrundelse. En mistanke er ikke en bekræftet fejl, og en oversprunget kontrol er ikke bestået.

## Adgang og login

- [ ] Hver beskyttet side og API-handling kontrollerer adgang på serveren, også ved direkte kald uden brugerfladen.
- [ ] Adgang nægtes som udgangspunkt; kun det tilladte åbnes.
- [ ] En bruger kan ikke hente eller ændre andres objekter ved at ændre et id i adressen eller forespørgslen.
- [ ] Roller og administratorfunktioner er adskilt og afprøvet med en almindelig testbruger.
- [ ] Login bruger organisationens identitetsløsning eller en anerkendt tjeneste; ingen egne adgangskoder eller egen kryptering.
- [ ] Sessioner udløber, logout virker, og cookies er `Secure`, `HttpOnly` og har en passende `SameSite`.
- [ ] Formularer, der ændrer data med cookie-baseret login, er beskyttet mod CSRF.
- [ ] Antal loginforsøg og tunge handlinger er begrænset.

### Afprøv grænsen mellem brugere og organisationer

Brug kun syntetiske data og konti, som må bruges til prøven. Beskriv først den tilsigtede adgang, herunder delte data. En offentlig side uden brugerkonti kræver ikke et nyt login alene for denne prøve.

1. Opret et privat testobjekt som bruger A, og bekræft, at A kan læse og ændre det. Det beviser, at objektet og funktionen findes, før en afvisning afprøves.
2. Kald samme API som bruger B uden adgang. Prøv læsning og relevante skrivehandlinger med A's objekt-id. Skjulte knapper tæller ikke som afvisning. Kontrollér både svaret og bagefter, at objektet ikke er ændret eller lækket i lister og eksport.
3. Har appen organisationer, gentag mellem to testorganisationer, også med ændret organisations-id i sti, parametre eller indhold. Retten skal afledes af den godkendte identitet og medlemskabet, ikke af det indsendte id alene.
4. Afprøv uden login og med en almindelig bruger mod relevante administratorhandlinger. Kontrollér også et tilladt delt objekt, så prøven ikke blot viser, at alt er blokeret.
5. Bruger løsningen databasepolitikker som RLS, afprøv dem med den rolle og adgangsvej, appens brugere faktisk får. En administratorkonto eller service-nøgle, der omgår politikkerne, beviser ikke, at de beskytter brugerne.

Notér de faktiske kald, forventet adgang, observeret svar og dataændringer uden tokens eller rigtige personoplysninger. Manglende konti eller miljø betyder **Ikke gennemført** med en konkret næste handling.

## Input og output

- [ ] Alt input valideres på serveren: type, længde, format og tilladte værdier.
- [ ] Output escapes efter sammenhæng. Brugerinput sættes ikke ind med `innerHTML`, `dangerouslySetInnerHTML` eller tilsvarende.
- [ ] Databaseforespørgsler er parameteriserede. Ingen sammensatte SQL-strenge med input.
- [ ] Filupload begrænser type og størrelse, gemmes uden for webroden og vises ikke som HTML.
- [ ] Adresser, som serveren selv henter, er begrænset til kendte mål.

## Data og hemmeligheder

- [ ] Ingen nøgler, tokens eller adgangskoder i kode, Git-historik, browserfiler eller logs.
- [ ] Data er adskilt mellem brugere og organisationer og afprøvet med to testbrugere.
- [ ] Kun nødvendige data gemmes, og der er en slettefrist.
- [ ] Logs registrerer sikkerhedshændelser uden personoplysninger eller hemmeligheder.
- [ ] Sikkerhedskopier findes, og gendannelse er afprøvet eller planlagt.

## Konfiguration og drift

- [ ] HTTPS overalt; HTTP viderestilles.
- [ ] Sikkerhedsheadere er sat, fx `Content-Security-Policy`, `Strict-Transport-Security` og `X-Content-Type-Options`.
- [ ] Fejlsider viser ikke stakspor, interne stier eller versionsnumre.
- [ ] Test- og udviklingsfunktioner er slået fra i drift.
- [ ] Afhængigheder er kontrolleret for kendte sårbarheder, og låsefilen er committet.

## Apps med en AI-model

- [ ] Modellens svar behandles som utroværdigt input og escapes.
- [ ] Modellen kan ikke alene udføre ændringer, betalinger eller afsendelser uden kontrol.
- [ ] Prompten indeholder ingen hemmeligheder og kun nødvendige data.
- [ ] Brugerne kan se, at de interagerer med en AI, hvor det er relevant.

## Agentens arbejdsredskaber

- [ ] Aktive MCP-servere, hooks, værktøjer og deres faktiske adgang er gennemgået efter referencen om agentadgang, også når den byggede app ikke selv bruger AI.
- [ ] Instruktioner fra fremmed indhold giver ikke nye rettigheder, og en kontrolleret prøve kan ikke få værktøjerne til at overskride den aftalte adgang.

## Dokumentér kontroller og fund

Brug projektets format, hvis det allerede findes. Oplys som minimum:

- **Grundlag:** dato, miljø, commit-id og eventuelle lokale ændringer. Uden commit registreres en identificerbar filversion, fx filnavne og kontrolsummer. En prøve af ændrede filer må ikke tilskrives det uændrede commit.
- **Dækning:** kontrollerede filer, adgangsveje og filtyper, værktøjsversioner og regelsæt samt det, der var udeladt, fejlede eller ikke kunne afprøves. Ved en ASVS-henvisning angives både standardversion og krav-id, som er kontrolleret i kilden.
- **Resultat pr. kontrol:** hvad blev forsøgt, hvad forventedes, hvad blev observeret, og hvilket af de fem resultater gælder? Brug kun maskerede oplysninger.
- **Fund:** eget id, sted, konsekvens, evidens, sikkerhed for fundet, begrundet alvor og næste handling med ansvarlig rolle. Et manglende login til testmiljøet er en manglende kontrol, ikke en konstateret fejl i appens login.
- **Opfølgning:** løsningen og resultatet af en ny prøve på den rettede version. Sæt kun et fund til **Løst og kontrolleret**, når den relevante prøve er gennemført. Bevar tidligere resultater; omskriv ikke en gammel godkendelse til en ny.

Et samlet resumé skal nævne manglende kontroller og åbne fund, også hvis de øvrige prøver bestod. Brug ikke et generelt »sikker«- eller »GDPR-godkendt«-stempel.

## Kilder

Tjeklisten er et udvalg til webapps og erstatter ikke en fuld sikkerhedsvurdering. Prøven af adgang følger [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). Versionerede krav kan findes i [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/). Kilderne til disse tilføjelser er kontrolleret 13. oktober 2026.
