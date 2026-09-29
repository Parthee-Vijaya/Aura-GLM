---
name: harness-sikkerhedsgennemgang
description: Gennemgår sikkerheden, når en ændring berører login, adgang, input, filupload, data eller eksterne tjenester, og altid før en app sættes i drift. Kontrollerer adgangskontrol på serveren, validering og escaping, hemmeligheder, afhængigheder, logning og adskillelse af brugeres data og registrerer konkrete fund med alvor og næste handling. Brug den ved sikkerhedsrelevante ændringer og før udgivelse.
---

# Sikkerhedsgennemgang

En gennemgang finder konkrete fund. Den gør ikke en app sikker, og fravær af fund er ikke bevis for fravær af problemer. Beskriv præcist, hvad der er kontrolleret.

## Hvornår

- Ændringen berører login, roller, adgang, formularer, filupload, API'er, databaser, eksterne tjenester eller personoplysninger.
- Før en app udgives første gang og før større udgivelser.
- Når en afhængighed med kendte sårbarheder opdages.

## Fremgangsmåde

1. Tegn kort, hvor data kommer ind, hvor de gemmes, og hvor de sendes hen. Marker grænserne mellem browser, server, database og andre tjenester.
2. Gennemgå punkterne i [tjeklisten](references/tjekliste.md), der er relevante for ændringen. Spring ikke adgangskontrol og input over.
3. Afprøv de vigtigste fund i praksis, fx at en bruger uden adgang faktisk bliver afvist på serveren, og at indtastet HTML ikke bliver udført.
4. Registrér hvert fund med sted, beskrivelse, alvor, forslag til rettelse og status. Brug projektets register, hvis det findes; ellers `docs/sikkerhed.md`.
5. Ret de fund, der hører til opgaven, og afprøv rettelsen. Andre fund foreslås som særskilte opgaver.

## De vigtigste regler

- **Adgangskontrol på serveren ved hver forespørgsel.** En skjult knap eller en kontrol i browseren er ikke adgangskontrol. Kontrollér også, at en bruger kun kan hente sine egne objekter, når id'et ændres i adressen.
- **Brug etableret login.** Byg ikke eget system til adgangskoder eller kryptering. Brug organisationens identitetsløsning eller en anerkendt tjeneste.
- **Valider input, og escape output.** Brug ikke `innerHTML` eller tilsvarende med brugerinput. Brug parameteriserede databaseforespørgsler.
- **Hemmeligheder på serveren.** Ingen nøgler i browserens kode, i Git eller i logs.
- **Adskil data.** Brugere og organisationer må ikke kunne se hinandens data. Afprøv det med to testbrugere.
- **Sikre standarder.** HTTPS, sikre cookies, begrænsning af antal forsøg ved login og fejlbeskeder uden interne detaljer.

## Apps, der selv bruger en AI-model

Behandl modellens svar som utroværdigt input: escape det, og lad det ikke alene udføre handlinger. Tekst fra brugere, dokumenter og websider kan indeholde instruktioner til modellen. Send ikke hemmeligheder eller unødvendige personoplysninger i prompten.

## Stop og inddrag andre

- Løsningen skal i drift med personoplysninger, login eller integration til kommunens systemer: inddrag organisationens informationssikkerhedsfunktion, før den udgives. Kommuner kan være omfattet af NIS2-loven, som har korte frister for varsling om væsentlige hændelser.
- Du finder en eksponeret hemmelighed eller et fund, der kan være et sikkerhedsbrud: stop, fortæl det straks, og følg `harness-noegler-og-afhaengigheder`. Et brud på persondatasikkerheden skal håndteres efter organisationens procedure.
