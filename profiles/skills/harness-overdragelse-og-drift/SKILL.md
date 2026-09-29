---
name: harness-overdragelse-og-drift
description: Gør en app klar til, at andre kan starte, drive, opdatere og gendanne den uden den oprindelige udvikler eller AI-værktøjet. Skriver start- og driftsvejledning uden adgangsoplysninger og afklarer ejerskab af konti, udgifter, overvågning, opdateringer og sikkerhedskopier. Brug den, før en app sættes i drift, når projektet skal overdrages, og når driftsopsætningen ændres.
---

# Overdragelse og drift

En app i drift skal kunne vedligeholdes af en anden end den, der byggede den. Dokumentationen er en del af leverancen, ikke en eftertanke.

## Fremgangsmåde

1. Læs den eksisterende dokumentation, og find huller med [skabelonen](references/driftsvejledning.md).
2. Opdatér README med formål, lokal opstart, afprøvning og udgivelse. Kør selv kommandoerne, så vejledningen er afprøvet.
3. Skriv en driftsvejledning, fx `docs/drift.md`, med de afsnit fra skabelonen, der er relevante.
4. Markér det, du ikke kan afgøre, fx hvem der ejer en konto, som et åbent spørgsmål til brugeren.

## Afklar ejerskab

- **Konti og tjenester:** hosting, domæne, database, e-mail og modeltjenester bør ejes af organisationen, ikke af en privat konto. Notér, hvem der administrerer dem.
- **Udgifter:** hvem betaler, og hvem får besked, hvis forbruget stiger.
- **Ansvar:** hvem er ansvarlig for drift, opdateringer og henvendelser fra brugerne. Skriv roller frem for personnavne, hvis dokumentationen er offentlig.
- **Adgang ved fratrædelse:** hvordan den oprindelige udviklers adgang fjernes, og nøgler udskiftes.

## Drift

- **Overvågning:** en simpel kontrol af, at appen svarer, og besked ved fejl.
- **Logs:** hvor de ligger, hvor længe de gemmes, og at de ikke indeholder personoplysninger eller hemmeligheder.
- **Opdateringer:** en fast rytme for sikkerhedsopdateringer af afhængigheder og platform.
- **Sikkerhedskopier og gendannelse:** hvad der tages backup af, hvor ofte, hvor den ligger, og hvornår gendannelse sidst er afprøvet.
- **Nedlukning:** hvordan appen og dens data slettes eller arkiveres, når den ikke længere skal bruges.

## Aldrig i dokumentationen

Adgangskoder, nøgler, tokens, personlige kontooplysninger eller rigtige personoplysninger. Henvis til, hvor de administreres, fx hostingtjenestens hemmelighedsindstillinger eller organisationens adgangssystem.

## Aflevering

Afslut med en liste over, hvad der er dokumenteret, hvad der er afprøvet, og hvilke spørgsmål der stadig skal afklares, før en anden kan overtage.
