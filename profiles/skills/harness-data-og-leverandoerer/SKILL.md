---
name: harness-data-og-leverandoerer
description: Holder styr på, hvilke data en løsning bruger, hvem der modtager dem, hvor de behandles og gemmes, og hvad der stadig er uafklaret. Fører en dataoversigt i projektet, skelner mellem data i udviklingen og i den færdige app og peger på de rette fagpersoner ved personoplysninger. Brug den ved nye dataforløb, nye tjenester eller leverandører og når der skal bruges personoplysninger.
---

# Data og leverandører

Der er to adskilte dataforløb, og begge skal kunne forklares:

1. **Udviklingen:** kodeværktøjet sender kode, filer, fejlbeskeder og samtalen til den valgte model. En lokal app betyder ikke, at modellen kører lokalt.
2. **Den færdige løsning:** database, hosting, logs, sikkerhedskopier, e-mail, analyse og andre tjenester, som brugernes data passerer.

## Fremgangsmåde

1. Brug opdigtede eller offentlige data under udviklingen, også i tests, eksempler og skærmbilleder.
2. Før en dataoversigt efter [skabelonen](references/dataoversigt.md), fx i `docs/data-og-leverandoerer.md`. Opdatér den, når et dataforløb eller en tjeneste ændres.
3. Beskriv for hver tjeneste: datakategorier, formål, hvor data behandles og gemmes, underleverandører, supportadgang, logs, sikkerhedskopier, slettefrist, brug til træning og mulighed for eksport. Angiv kilde og kontroldato. Skriv "ukendt" frem for at gætte.
4. Giv hvert åbent forhold en status: skal undersøges, kræver handling, afventer ansvarlig, løst og kontrolleret, eller ikke relevant med begrundelse.
5. Formulér konkrete spørgsmål til de rette roller, fx: "Tjenesten gemmer logs med e-mailadresser i 30 dage i USA. Er det dækket af vores aftaler?"

Brug de mindst mulige datamængder og rettigheder. En regionsangivelse fra en leverandør er ikke hele svaret; underleverandører, supportadgang og overførsler skal også med.

## Stop og inddrag andre

Skal løsningen bruges i en dansk offentlig organisation, så læs [de offentlige krav](references/offentlige-krav.md) og brug dem til at pege på de rigtige roller.

- **Personoplysninger i drift:** inddrag den ansvarlige for behandlingen og organisationens databeskyttelsesrådgiver, før rigtige data bruges. Hver leverandør, der behandler personoplysninger, kræver en databehandleraftale, og behandlingen skal med i organisationens fortegnelse. Ved sandsynlig høj risiko skal der laves en konsekvensanalyse først.
- **Følsomme oplysninger,** fx helbred, CPR-numre eller oplysninger om børn: stop, og få afklaret rammerne først.
- **Tjenester uden for EU/EØS eller med ukendt placering:** markér det som et åbent forhold til vurdering.
- **Muligt brud på persondatasikkerheden:** fortæl det straks, og følg organisationens procedure. Anmeldelse til Datatilsynet skal ske inden for 72 timer, når det er muligt.
- **Dokumenter i sager:** modtager, sender eller danner løsningen sagsdokumenter, skal de journaliseres og bevares i organisationens ESDH- eller fagsystem. Løsningen må ikke være den eneste kopi.
- **Løsningen bruger selv AI:** brugerne skal kunne se, at de interagerer med en AI, og nogle offentlige anvendelser er højrisiko efter AI-forordningen. Inddrag jura og den AI-ansvarlige.

## Det må du ikke

- Erklære en behandling lovlig eller godkende noget på organisationens vegne.
- Kalde en markering i en fil for en godkendelse. Når en person selv har skrevet sit navn og tidspunkt, så skriv "registreret lokalt af brugeren", ikke "godkendt".
- Kopiere rigtige personoplysninger ind i kode, tests, prompts, logs eller dokumentation.
- Lægge aftaler, følsomme fund eller navne på borgere i et offentligt repository. Henvis i stedet til, hvor de administreres.
