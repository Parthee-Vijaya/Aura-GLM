---
name: harness-kodestil
description: Holder koden læsbar og til at overtage for en anden udvikler. Følger projektets konventioner, giver klare navne og kommentarer, der forklarer hvorfor, og holder kompleksiteten nede. Brug den, når der skrives eller ændres kode, og når en ændring gennemgås før et commit.
---

# Kodestil og vedligeholdelse

Koden skal kunne læses, rettes og overtages af en anden udvikler uden AI-værktøjet. Projektets eksisterende konventioner går forud for alt nedenfor.

## Følg projektet

- Brug projektets formatter, linter, mappestruktur og navngivning. Kør dem, hvis de findes, og ret de fund, din ændring skaber.
- Skriv ny kode, så den ligner koden omkring den. Indfør ikke en ny stil i én fil.
- Bevar låsefiler og den valgte pakkehåndtering.

## Standardvalg i nye projekter

- Kodenavne på engelsk og brugerfladetekster på dansk. Oversæt ikke fagbegreber, hvis oversættelsen bliver forkert. Et dansk domæneord kan være det mest præcise navn.
- Navne skal vise formål og om nødvendigt enhed: `timeoutMs`, `maxAttendees`, `isArchived`.
- TypeScript med `strict` slået til i nye TypeScript-projekter. Typer beskytter under udviklingen, men erstatter ikke validering af data udefra.
- Valider input ved systemets grænser: formularer, API-kald, filer og data fra andre tjenester.

## Hold det enkelt

- Én funktion eller komponent skal have én tydelig opgave. Del op, når en funktion bliver svær at beskrive i én sætning.
- Byg ikke abstraktioner til behov, der ikke findes endnu. Tre ens linjer er ofte bedre end en for tidlig fællesfunktion.
- Slet død kode i stedet for at kommentere den ud. Git husker den gamle version.
- Undgå magiske tal og tekster. Giv dem et navn, eller saml dem i konfiguration.
- Håndter fejl, hvor de kan håndteres. Skjul dem ikke med tomme `catch`-blokke.
- Fejlbeskeder til brugeren skal forklare problemet og næste mulige handling på dansk. Logbeskeder må ikke indeholde personoplysninger, nøgler eller adgangskoder.

## Kommentarer

- Forklar hvorfor, kontrakter og begrænsninger: en forretningsregel, et krav fra en ekstern tjeneste, en kendt fejl i en afhængighed.
- Gentag ikke det, koden allerede siger. `i++ // læg én til` hjælper ingen.
- Hold kommentarer sande. Ret eller slet dem, når koden ændres.
- Offentlige funktioner og moduler i fælles kode kan have en kort beskrivelse af formål, input og output.

## Før du afleverer

Gennemgå din egen ændring som en kollega ville:

1. Løser ændringen opgaven og kun den?
2. Er der unødig kompleksitet, gentagelser eller døde grene?
3. Er navne og kommentarer forståelige for en, der ikke har set samtalen?
4. Er fejltilfælde håndteret, og er der tests for det, der kan gå galt?
5. Er dokumentationen opdateret, hvis adfærd, opsætning eller kommandoer er ændret?

Nævn bevidste afvigelser fra konventionerne og begrundelsen for dem.
