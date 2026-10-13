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
- Vurder et nøglefund efter udbyderens dokumentation og nøglens rettigheder. En offentlig klientnøgle er ikke en serverhemmelighed alene på grund af sit navn eller format; kontrollér i stedet, at adgangen bag den er begrænset.
- Konfigurér scannere til at maskere fund, før de skriver til log, rapport eller samtale. Registrér fil, linje og typen af hemmelighed uden selve værdien. Gengiv heller ikke hemmeligheder fra et værktøjs fejlbesked.

### Hvis en hemmelighed er eksponeret

1. Stop den berørte del af arbejdet, og gengiv ikke værdien.
2. Fortæl brugeren, hvor eksponeringen skete: fil, commit, log, skærmbillede eller besked.
3. Anbefal at tilbagekalde og udskifte nøglen hos udbyderen. At slette filen fjerner ikke tidligere eksponering, heller ikke fra Git-historikken.

## Nye afhængigheder

Før du tilføjer en pakke, så forklar kort:

- **Behov:** hvad pakken løser, og om det kan løses med det, projektet allerede har.
- **Oprindelse:** find det præcise pakkenavn og registry via projektets officielle dokumentation. Sammenhold udgiver, kilde-repository og udgivelse; et AI-forslag eller et eksisterende pakkenavn beviser ikke, at pakken er den rigtige. Undersøg uventede skift af udgiver eller kilde, før pakken køres.
- **Version og indhold:** kontrollér, hvilken version og kilde låsefilen faktisk vælger, også ved Git- og URL-afhængigheder. Se efter nye installationsscripts og ændringer i afhængighederne. En integritetskontrol beviser, at filen matcher låsefilen, ikke at indholdet er ufarligt.
- **Vedligeholdelse:** se efter aktuelle udgivelser og håndtering af fejl. Popularitet alene er ikke et sikkerhedsbevis.
- **Licens:** at licensen passer til projektet og organisationens regler.
- **Sikkerhed:** sammenhold den faktisk valgte version med advisoriens berørte versioner, fx via `npm audit` eller projektets tilsvarende værktøj. Et pakkenavn alene bekræfter ikke en sårbarhed. Notér advisory, version og om den berørte funktion bruges.

Brug projektets pakkehåndtering, og bevar låsefilen. Brug `npm ci` eller tilsvarende i CI og ved gentagelige installationer. Kør ikke ukendte installationsscripts, og installer intet globalt uden aftale.

Kend kontrolværktøjets dataflow før kørsel. `npm audit` sender pakkeoplysninger til det konfigurerede registry; det er ikke en offlinekontrol. Brug projektets godkendte tjenester, og send ikke private pakkenavne eller kode til nye tjenester uden aftale. En kontrol af den forkerte mappe, et netværkssvigt eller et manglende værktøj registreres som **ikke gennemført**, aldrig som nul sårbarheder. Fortolk statuskoder efter værktøjets dokumentation; en kode forskellig fra nul kan betyde fund.

## Opdateringer

- Opdatér i små skridt, og læs udgivelsesnoter for større versionsspring.
- Kør tests og den vigtigste brugerrejse efter opdateringen.
- Fjern pakker, der ikke længere bruges.

## Integrationer til andre tjenester

- Brug den mindst mulige adgang: et token med præcis de rettigheder, opgaven kræver, og gerne med udløbsdato.
- Placér nøglen på serveren, og kald tjenesten derfra, ikke direkte fra browseren.
- Håndter fejl, timeout og begrænsninger i antal kald.
- En ny tjeneste er også et nyt dataforløb. Beskriv det, før der sendes rigtige data, gerne med `harness-data-og-leverandoerer`, hvis den er installeret.

## Kilder til pakkekontrollen

Kontrolleret 13. oktober 2026: [npm om installationsscripts](https://docs.npmjs.com/cli/v11/using-npm/scripts/) og [npm audit om versioner, signaturer og afsendte pakkeoplysninger](https://docs.npmjs.com/cli/v11/commands/npm-audit/).
