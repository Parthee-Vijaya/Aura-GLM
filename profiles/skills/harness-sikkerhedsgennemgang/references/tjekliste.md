# Tjekliste til sikkerhedsgennemgang

Vælg de afsnit, ændringen berører. Skriv for hvert punkt: kontrolleret og i orden, fund, eller ikke relevant med kort begrundelse.

## Adgang og login

- [ ] Hver beskyttet side og API-handling kontrollerer adgang på serveren, også ved direkte kald uden brugerfladen.
- [ ] Adgang nægtes som udgangspunkt; kun det tilladte åbnes.
- [ ] En bruger kan ikke hente eller ændre andres objekter ved at ændre et id i adressen eller forespørgslen.
- [ ] Roller og administratorfunktioner er adskilt og afprøvet med en almindelig testbruger.
- [ ] Login bruger organisationens identitetsløsning eller en anerkendt tjeneste; ingen egne adgangskoder eller egen kryptering.
- [ ] Sessioner udløber, logout virker, og cookies er `Secure`, `HttpOnly` og har en passende `SameSite`.
- [ ] Formularer, der ændrer data med cookie-baseret login, er beskyttet mod CSRF.
- [ ] Antal loginforsøg og tunge handlinger er begrænset.

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

## Registrér fund

| Fund | Sted | Alvor | Forslag | Status |
|------|------|-------|---------|--------|
| | | Kritisk / Høj / Middel / Lav | | Skal undersøges / Kræver handling / Afventer ansvarlig / Løst og kontrolleret / Ikke relevant med begrundelse |

Tjeklisten bygger på de gennemgående områder i OWASP ASVS og OWASP Top 10. Den er et udvalg til små webapps og erstatter ikke en fuld sikkerhedsvurdering.
