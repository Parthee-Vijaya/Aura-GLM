# Skabelon til dataoversigt

Oversigten beskriver dataforløbene, så en anden kan forstå dem og stille de rigtige spørgsmål. Den er ikke en juridisk vurdering. Skriv "ukendt", når en oplysning mangler.

```markdown
# Data og leverandører · <appens navn>

Sidst opdateret: <dato> af <rolle>

## Kort fortalt
<Hvilke data løsningen bruger, til hvad, og om der er personoplysninger.>

## Data i udviklingen
| Værktøj og model | Hvad sendes | Hvor behandles det | Træning | Kilde og kontroldato |
|------------------|-------------|--------------------|---------|----------------------|
| <fx kodeværktøj og model> | Kode, filer og samtale; kun opdigtede data | <region eller ukendt> | <ja/nej/ukendt> | <link, dato> |

## Data i den færdige løsning
| Data | Formål | Personoplysninger | Hvem har adgang | Slettefrist |
|------|--------|-------------------|-----------------|-------------|

## Tjenester og leverandører
| Tjeneste | Rolle i løsningen | Data | Placering og underleverandører | Supportadgang | Logs og backup | Aftale | Kilde og kontroldato |
|----------|-------------------|------|--------------------------------|---------------|----------------|--------|----------------------|

## Åbne forhold
| Id | Forhold | Berører | Ansvarlig rolle | Status | Næste handling |
|----|---------|---------|-----------------|--------|----------------|
| D-1 | <konkret beskrivelse> | <data, tjeneste, funktion> | <rolle> | Skal undersøges | <handling> |

Status: Skal undersøges · Kræver handling · Afventer ansvarlig · Løst og kontrolleret · Ikke relevant med begrundelse

## Beslutninger
Tilføj nye linjer; ret ikke i tidligere beslutninger.

| Dato | Beslutning | Omfang og version | Truffet af (rolle) | Registrering |
|------|------------|-------------------|--------------------|--------------|
| <dato> | <beslutning> | <commit, miljø> | <rolle> | Registreret lokalt af brugeren |
```

Skriv ingen rigtige personoplysninger, aftaletekster eller hemmeligheder i oversigten. Hvis projektet er offentligt, så hold oversigten på et overordnet niveau, og henvis til organisationens egne systemer for detaljer.
