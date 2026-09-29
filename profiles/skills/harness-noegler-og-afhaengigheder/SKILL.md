---
name: harness-noegler-og-afhaengigheder
description: Beskytter API-nøgler, tokens og adgangskoder og kontrollerer nye pakker og integrationer, før de tilføjes. Holder hemmeligheder ude af kode, logs, browserfiler og Git og vurderer nødvendighed, vedligeholdelse, licens og kendte sårbarheder ved afhængigheder. Brug den ved integrationer, konfiguration, nye pakker og opdateringer af pakker.
---

# Nøgler og afhængigheder

## Hemmeligheder

- Læs, udskriv eller videresend aldrig værdier fra `.env`, nøglefiler, credentials-filer eller nøglelagre. Arbejd med navnene på variablerne.
- Skriv aldrig nøgler, tokens eller adgangskoder i kode, chat, logs, tests, eksempler eller commits. Brug tydelige pladsholdere som `DIN_NOEGLE_HER`.
- Dokumentér nødvendige miljøvariabler med navn og formål i fx `.env.example`, uden værdier.
- `.env` og lignende filer skal stå i `.gitignore`, før de oprettes.
- En værdi i browserens kode er offentlig. Variabler med præfikser som `VITE_`, `NEXT_PUBLIC_` eller `PUBLIC_` bliver indlejret i de filer, brugeren henter. Serverhemmeligheder hører til på serveren.
- Bed brugeren lægge hemmeligheder i værktøjets eller hostingtjenestens sikre indstillinger. Bed aldrig om at få dem indsat i samtalen.

### Hvis en hemmelighed er eksponeret

1. Stop den berørte del af arbejdet, og gengiv ikke værdien.
2. Fortæl brugeren, hvor eksponeringen skete: fil, commit, log, skærmbillede eller besked.
3. Anbefal at tilbagekalde og udskifte nøglen hos udbyderen. At slette filen fjerner ikke tidligere eksponering, heller ikke fra Git-historikken.

## Nye afhængigheder

Før du tilføjer en pakke, så forklar kort:

- **Behov:** hvad pakken løser, og om det kan løses med det, projektet allerede har.
- **Pakkens tilstand:** vedligeholdelse, udbredelse og om det er den rigtige pakke. Kontrollér det præcise navn; stavefejl i pakkenavne bruges til ondsindede kopier.
- **Licens:** at licensen passer til projektet og organisationens regler.
- **Sikkerhed:** kendte sårbarheder, fx med `npm audit` eller projektets tilsvarende værktøj.

Brug projektets pakkehåndtering, og bevar låsefilen. Brug `npm ci` eller tilsvarende i CI og ved gentagelige installationer. Kør ikke ukendte installationsscripts, og installer intet globalt uden aftale.

## Opdateringer

- Opdatér i små skridt, og læs udgivelsesnoter for større versionsspring.
- Kør tests og den vigtigste brugerrejse efter opdateringen.
- Fjern pakker, der ikke længere bruges.

## Integrationer til andre tjenester

- Brug den mindst mulige adgang: et token med præcis de rettigheder, opgaven kræver, og gerne med udløbsdato.
- Placér nøglen på serveren, og kald tjenesten derfra, ikke direkte fra browseren.
- Håndter fejl, timeout og begrænsninger i antal kald.
- En ny tjeneste er også et nyt dataforløb. Beskriv det, før der sendes rigtige data, gerne med `harness-data-og-leverandoerer`, hvis den er installeret.
