# Skabelon til driftsvejledning

Brug de afsnit, der passer til appen. Skriv "ikke relevant" med en kort begrundelse frem for at udelade et afsnit i stilhed.

```markdown
# Drift af <appens navn>

## Formål og brugere
<Hvad appen gør, og hvem der bruger den.>

## Ansvar
- Systemejer: <rolle>
- Teknisk ansvarlig: <rolle>
- Henvendelser fra brugere: <kanal>

## Arkitektur
<Kort beskrivelse: frontend, backend, database, eksterne tjenester. Gerne en enkel tegning.>

## Tjenester og konti
| Tjeneste | Formål | Ejer af kontoen | Region | Udgift | Aftale |
|----------|--------|-----------------|--------|--------|--------|

## Konfiguration
| Miljøvariabel | Formål | Hvor den administreres |
|---------------|--------|------------------------|
<Kun navne, aldrig værdier.>

## Lokal opstart og afprøvning
<Kommandoer, der er afprøvet.>

## Udgivelse
<Hvordan en ny version bygges, afprøves og udgives, og hvem der godkender.>

## Gendannelse
- Tidligere version: <hvordan>
- Data: <backup, hyppighed, placering, sidst afprøvet>
- Databaseændringer: <hvordan en migrering rulles tilbage eller rettes>

## Overvågning og logs
<Hvad der overvåges, hvem der får besked, hvor logs ligger og hvor længe.>

## Opdateringer
<Rytme for afhængigheder og platform, og hvem der gør det.>

## Data
<Henvisning til dataoversigten og slettefrister.>

## Kendte begrænsninger og åbne spørgsmål
- <...>

## Nedlukning
<Hvordan appen, data og konti afvikles.>
```
