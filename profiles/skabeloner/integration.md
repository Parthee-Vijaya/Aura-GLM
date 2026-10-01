---
name: harness-integration-SYSTEM
description: Henter DATA fra SYSTEM hos EJER og viser dem i appen. Forklarer adgang, nøgler, felter og persondata. Brug den, når projektet skal slå op i SYSTEM eller vise data derfra.
---

# SYSTEM

Én eller to sætninger: hvad systemet er, hvem der ejer det, og hvilke data integrationen giver adgang til.

## Før du bygger

- **Adgang:** Hvad kræver det? Fx ingen bruger, en gratis bruger eller en aftale og et certifikat. Kræver adgangen en aftale, et certifikat eller en åbning i en firewall, så byg med opdigtede eksempeldata, og skriv en bestilling til IT-afdelingen. Brug skabelonen nederst.
- **Data:** Hvilke felter findes, og hvilke er personoplysninger? Hvilke regler gælder, fx reklamebeskyttelse eller tavshedspligt?
- **Hvor data sendes hen:** Fra hvilken del af appen går forespørgslen, og til hvem?

## Nøgler

Læg aldrig en nøgle, et brugernavn eller en adgangskode i browserkode, chat, logs eller versioner. En statisk side må kun bruge åbne data uden nøgle. Kræver systemet en nøgle, så læg den i projektets `.env`, og brug den kun fra en server eller en serverless-funktion. Bed brugeren skrive nøglen i `.env` selv.

## Sådan henter du data

Adresse, forespørgsel og svar med et konkret eksempel. Lange detaljer, felter og fejlkoder står i `references/api.md`, hvis de er nødvendige.

## Afprøvning

En forespørgsel med et kendt, offentligt svar, som AI'en og brugeren kan kontrollere. Brug aldrig rigtige borgeres data i afprøvningen.

## Bestilling til IT

Kun når adgangen kræver IT-afdelingen. Skriv en kort bestilling med:
- formål og hvem der skal bruge løsningen;
- system og data;
- adgangstype, fx bruger, certifikat eller IP-adresse;
- ansvarlig person;
- databehandleraftale og databeskyttelsesrådgiverens rolle, hvis der er persondata.
