---
name: harness-afproevning-og-fejlretning
description: Viser med faktisk afprøvning, at en ændring virker, og finder årsagen til fejl, før de rettes. Vælger relevante tests, reproducerer fejl, afprøver brugerrejsen og rapporterer præcist, hvor langt afprøvningen er nået. Brug den ved enhver kodeændring, ved fejlretning og før der meldes færdig.
---

# Afprøvning og fejlretning

En ændring er ikke færdig, fordi koden er skrevet. Den er færdig, når der er vist, at den virker, og brugeren ved præcis, hvad der er vist.

## Rapportér evidensen præcist

Brug disse trin, og påstå aldrig et højere trin, end evidensen understøtter:

1. **Skrevet:** koden findes, men er ikke kørt.
2. **Unit-testet:** automatiske tests af de enkelte dele består.
3. **Afprøvet på rigtigt materiale:** den faktiske brugerrejse er gennemført i appen, med rigtige filer, rigtig browser eller rigtig tjeneste.
4. **I drift og observeret:** den udgivne version er kontrolleret på sin rigtige adresse.

"Testene består" er trin 2 og siger intet om, hvorvidt funktionen er koblet rigtigt sammen. Hvis du ikke kan køre en kontrol, så sig det og forklar hvorfor.

## Vælg afprøvningen efter ændringen

- **Regler og databehandling:** unit-tests af beregninger, validering og filtrering.
- **Systemgrænser:** integrationstests mod API, database eller fil, gerne med en lokal testudgave af tjenesten.
- **Brugerrejser:** gennemfør den vigtigste handling i browseren eller appen, også på mobilbredde, når brugerfladen er ændret.
- **Fejltilfælde:** tom liste, ugyldigt input, manglende adgang, afbrudt forbindelse og langsom tjeneste, når ændringen berører dem.

Følg projektets teststrategi og kommandoer. Ingen procentgrænse for testdækning kan stå alene som kvalitetsmål. TDD er en mulig arbejdsform, ikke et krav til hver tekst- eller layoutændring.

## Ret fejl i den rigtige rækkefølge

1. Læs hele fejlbeskeden og loggen. Notér, hvad der forventes, og hvad der sker.
2. Reproducér fejlen med færrest mulige trin. Skriv en test, der fejler af den rigtige grund, når det er praktisk muligt.
3. Opstil en forklaring, og afprøv den. Ændr én ting ad gangen.
4. Ret årsagen, ikke symptomet. Skjul ikke fejlen med et tomt `catch`, en længere timeout eller en slået-fra test.
5. Kør reproduktionen og de relevante tests igen. Behold testen som regressionstest.

## Snyd ikke

- Ret ikke en test, så den passer til forkert kode. Hvis testen er forkert, så forklar hvorfor, før du ændrer den.
- Hardcod ikke forventede svar, og spring ikke tests over for at få en grøn kørsel.
- Opfind aldrig testresultater. Skriv de kommandoer, du har kørt, og resultatet.

## Aflevering

Afslut med:

- Hvad der er ændret.
- Hvilke kontroller der er kørt, med kommando og resultat.
- Hvilke manuelle trin brugeren selv bør prøve.
- Hvad der ikke er afprøvet, og hvorfor.
