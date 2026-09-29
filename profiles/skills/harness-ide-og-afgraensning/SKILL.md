---
name: harness-ide-og-afgraensning
description: Afklarer en ny app, en ny funktion eller en opgave, der skifter retning, før der skrives kode. Finder brugerne, den vigtigste handling, de nødvendige data og konkrete acceptkriterier og stiller kun spørgsmål, der ændrer et væsentligt valg. Brug den ved projektstart, når brugeren beskriver en idé, og når opgaven er uklar eller vokser undervejs.
---

# Idé og afgrænsning

Målet er en kort, aftalt beskrivelse af opgaven, som brugeren kan genkende, og som kan afprøves. Byg ikke, før beskrivelsen er bekræftet.

## Fremgangsmåde

1. Læs det, der findes: README, noter om projektet, eksisterende kode og tidligere beslutninger. Byg videre på det, der allerede er aftalt.
2. Find svar på disse spørgsmål, gerne ud fra det brugeren allerede har skrevet:
   - Hvem skal bruge løsningen, og i hvilken situation?
   - Hvad er den vigtigste handling, brugeren skal kunne gennemføre?
   - Hvilke data skal løsningen vise, gemme eller sende? Indgår personoplysninger eller fortrolige oplysninger?
   - Skal data deles mellem flere brugere eller overleve en genstart?
   - Hvad hører ikke med i denne omgang?
3. Stil højst tre spørgsmål ad gangen og kun om valg, der ændrer retningen. Skriv reversible antagelser tydeligt i beskrivelsen i stedet for at spørge om dem.
4. Skriv beskrivelsen efter skabelonen nedenfor, og bed brugeren bekræfte eller rette den.
5. Gem den bekræftede beskrivelse, hvor projektet samler sin dokumentation. I et nyt projekt: `docs/opgave.md`.
6. Når opgaven skifter retning, så opdatér beskrivelsen og sig, hvad der er ændret. En teknisk ændring må ikke i stilhed ændre formålet.

## Skabelon

```markdown
# <Kort navn på opgaven>

## Formål
<Én eller to sætninger: hvem, hvad og hvorfor.>

## Brugere og situation
<Hvem bruger løsningen, og hvornår?>

## Det skal brugeren kunne
- Brugeren kan <konkret handling>.
- Brugeren kan <konkret handling>.

## Data
<Hvilke data, hvor de kommer fra, og om der er personoplysninger. Skriv "kun opdigtede eksempeldata" under udviklingen, når det er aftalt.>

## Ikke med i denne omgang
- <Afgrænsning>

## Antagelser
- <Antagelse, der kan ændres senere>

## Sådan prøver vi det
- <Konkret prøve, fx "Søg på et lokale med plads til 8, og se kun de lokaler, der passer.">
```

## Gode acceptkriterier

- Beskriv en handling og et synligt resultat, ikke en teknologi. Skriv "Brugeren kan filtrere lokaler efter antal pladser", ikke "Tilføj et filter-komponent".
- Tag de vigtigste fejltilfælde med: tom liste, ugyldigt input, manglende adgang.
- Et kriterium skal kunne afprøves af en person, der ikke har skrevet koden.

## Stop og inddrag andre

- Løsningen skal behandle personoplysninger, fortrolige oplysninger eller rigtige sager: aftal opdigtede data til udviklingen, og brug `harness-data-og-leverandoerer`.
- Løsningen kræver login, integration til kommunens systemer, betaling eller en ny tjeneste: sig det tidligt, og brug `harness-arkitektur-og-teknologi`.
- Brugeren beder om noget, der rækker ud over opgaven: foreslå det som en særskilt opgave i stedet for at bygge det med.
