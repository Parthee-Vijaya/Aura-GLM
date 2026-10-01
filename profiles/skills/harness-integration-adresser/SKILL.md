---
name: harness-integration-adresser
description: Finder og viser danske adresser fra Danmarks Adresseregister via Klimadatastyrelsens Adressevælger og Datafordeleren. Forklarer token, nøgler, koordinater, kreditering og lukningen af DAWA. Brug den, når projektet skal søge efter, udfylde eller vise adresser.
---

# Adresser

Danske adresser kommer fra Danmarks Adresseregister (DAR), som Klimadatastyrelsen ejer. Data er frie og gratis under CC BY 4.0.

## Vælg tjeneste

- **Søg og udfyld en adresse, fx i en formular:** Klimadatastyrelsens Adressevælger. Den kan kaldes direkte fra browseren uden bruger.
- **Flere oplysninger om adressen, eller data fra BBR, Matriklen eller DAGI:** Datafordeleren med GraphQL. Den kræver en gratis API-nøgle, der kun må bruges fra en server.
- **Brug ikke DAWA** (`api.dataforsyningen.dk`). Den lukker 1. oktober 2026. Finder du DAWA i projektet, så sig det til brugeren, og skift til Adressevælgeren eller Datafordeleren.

## Adressevælgeren

- Søg: `https://adressevaelger.dk/adresser/soeg?tekst=<tekst>&token=adressevaelger123`. Brug `husnumre/soeg` i stedet, når kun bygningens indgang skal findes.
- Tokenet er obligatorisk. I dag er det en vilkårlig tekst på mindst 10 tegn, og Klimadatastyrelsen anbefaler `adressevaelger123`. Det er ikke en hemmelighed. Der kommer brugerstyring ultimo 2026 eller primo 2027; se `references/adressevaelger.md` før en udgivelse.
- Svaret er JSON med `status` og listen `fund`. Hvert fund har `type`, `id`, `titel` og `husnummerId`. `titel` er den adresse, brugeren skal se.
- Søgningen er fonetisk. Tag postnummeret med, så resultatet bliver entydigt. Standard er 100 fund, højst 200 med `maksimum`.
- Opslag med ID giver flere felter, fx postnummer, vejkode og koordinater: `https://adressevaelger.dk/adresser/<id>?token=adressevaelger123` eller `husnumre/<id>`.
- Koordinaterne er i ETRS89 UTM zone 32 (EPSG:25832) i meter. Et webkort som Leaflet bruger WGS84, så omregn, fx med proj4.
- Klimadatastyrelsen har en færdig søgekomponent; se `references/adressevaelger.md`.

## Datafordeleren

- Kræver en gratis bruger og en API-nøgle. Brugeren opretter selv begge dele; se `references/datafordeleren.md`.
- Nøglen sendes som parameteren `apiKey`. Læg den i projektets `.env`, og kald kun Datafordeleren fra en server eller en serverless-funktion. Læg den aldrig i browserkode, chat eller versioner.
- Adresser: GraphQL på `https://graphql.datafordeler.dk/DAR/v3`. Brug adressens eller husnummerets ID fra Adressevælgeren til opslag i andre registre.
- De gamle REST-tjenester og webbrugere lukker 15. januar 2027. Brug kun GraphQL og API-nøgle.

## Kreditering og data

- Skriv "Indeholder data fra Danmarks Adresseregister, Klimadatastyrelsen" ved listen eller kortet, som CC BY 4.0 kræver.
- En adresse alene er normalt ikke en personoplysning, men en adresse sammen med en person er. Gem kun det, løsningen har brug for.

## Afprøvning

Søg efter `Rådhuspladsen 1, 1550`. Svaret skal indeholde "Rådhuspladsen 1, 1550 København V". Brug offentlige adresser som denne i afprøvningen, aldrig borgeres adresser.
