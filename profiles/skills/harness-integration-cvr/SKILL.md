---
name: harness-integration-cvr
description: Henter virksomhedsoplysninger fra Det Centrale Virksomhedsregister (CVR) via Datafordeleren eller Erhvervsstyrelsens system-til-system-adgang. Forklarer adgang, nøgler, reklamebeskyttelse og persondata om ejere. Brug den, når projektet skal slå virksomheder op eller vise data fra CVR.
---

# CVR

Det Centrale Virksomhedsregister (CVR) ejes af Erhvervsstyrelsen og rummer oplysninger om danske virksomheder. Data er gratis, men al adgang fra et program kræver en bruger eller en ansøgning.

## Før du bygger

- Byg først med tre til fem opdigtede virksomheder i samme form som det rigtige svar, fx i `data/eksempel-virksomheder.json`. Vis tydeligt, at det er eksempeldata.
- Spørg brugeren, om de har adgang. Har de ikke, så forklar de to veje nedenfor. Ansøgningen laver brugeren selv, og den kan tage tid.
- Hent aldrig data ved automatisk at læse sider på cvr.dk eller datacvr.virk.dk. Det er forbudt efter CVR-bekendtgørelsen § 17.

## Veje til data

1. **Datafordeleren:** GraphQL CVR v2 og totaldownload. Kræver en bruger og en API-nøgle. Det er uafklaret, om en bruger med e-mail eller MitID Privat får adgang, eller om det kræver MitID Erhverv; kontrollér det ved oprettelsen. Oplysninger om personer (CVRPerson) kræver ansøgning, MitID Erhverv, OAuth og en IP-adresse på en godkendt liste. Data kommer med en vis forsinkelse.
2. **Erhvervsstyrelsens system-til-system-adgang:** Elasticsearch med næsten realtidsdata og fuld historik. Gratis, men kræver ansøgning via en blanket. Behandlingen tager normalt tre uger. Adgangen bruger brugernavn og adgangskode.

Detaljer og kilder står i `references/cvr.md`.

## Nøgler

Brugernavn, adgangskode og API-nøgle ligger i projektets `.env` og bruges kun fra en server eller en serverless-funktion. En statisk side kan ikke hente CVR-data direkte. Bed brugeren skrive nøglerne i `.env` selv.

## Regler for brug

- **Reklamebeskyttelse:** Virksomheder og personer kan være reklamebeskyttede. Deres data må ikke bruges til direkte markedsføring. Viser løsningen kontaktoplysninger om en beskyttet enhed, skal den markeres tydeligt. Overtrædelse straffes med bøde.
- **Persondata:** Enkeltmandsvirksomheder og ejere er personer. Navne og visse adresser er offentlige, men CPR-numre må aldrig vises eller gemmes. Oplysninger om reelle ejere må kun bruges af dem, der har ret til dem. Gem kun det, løsningen har brug for.
- **Logning:** Søger løsningen i personoplysninger, forventer Datatilsynet, at søgninger logges ud fra en risikovurdering.
- **Kreditering:** Skriv "Data fra Det Centrale Virksomhedsregister (CVR)".

## Afprøvning

Afprøv med de opdigtede virksomheder, indtil adgangen er på plads. Når der er adgang, så slå en offentlig myndighed op, fx brugerens egen kommune, og sammenlign navn og adresse med cvr.dk. Brug aldrig enkeltpersoners virksomheder som testdata.
