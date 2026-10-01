# Integrationsskills

En integrationsskill lærer kodeagenten at bruge ét bestemt system, fx et offentligt register, rigtigt. Den forklarer adgang, nøgler, felter og persondata. Brugeren slår hver integration til for sig under Indstillinger › Funktioner. Kun de valgte integrationers skills når AI'en.

Integrationer ligger i det fælles bibliotek sammen med de øvrige skills. I eget kodeværktøj er de ikke forvalgt; man vælger dem til under Tilpas.

## Sådan ser en integration ud

- **Skillen:** `profiles/skills/harness-integration-<system>/SKILL.md`, bygget over [skabelonen](../profiles/skabeloner/integration.md). Lange detaljer ligger i `references/`. Der må ikke være scripts.
- **Kataloget (`profiles/catalog.json`):**
  - Skillen har de samme felter som andre skills: titel, kort beskrivelse, FAQ og kilder.
  - Den har desuden feltet `integration` med:
    - `system` og `owner`: hvad systemet er, og hvem der ejer det;
    - `maintainer`: hvem der vedligeholder skillen;
    - `access`, `data`, `dataFlow` og `cost`: i almindeligt dansk;
    - `itRoute` og `sensitive`: sandt eller falsk;
    - `checkedAt`: datoen for sidste kontrol mod kilderne.
  - Integrationen er en funktion med `group: "integrationer"`, `default: false` og præcis én skill. Den står i kategorien `integrationer`.
- **Kontrol:** `desktop/core/library.cjs` afviser en integration, hvor et af felterne mangler, der ikke er nogen kilde, eller den står et forkert sted.

## Krav ved gennemgang

1. **Faktuel og neutral:** Skillen beskriver, hvordan systemet bruges, og hvad det kræver. Den sammenligner sig ikke med konkurrenter og roser ikke leverandøren. Findes der en fælles standard, har standarden sin egen skill, og leverandørens skill bygger ovenpå.
2. **Kilder:** Hvert faktum om adgang, pris, grænser og vilkår har en kilde hos systemets ejer. `checkedAt` opdateres ved hver kontrol. Det, der ikke kan bekræftes, står som ikke verificeret.
3. **Adgang via IT:** Kræver adgangen en aftale, et certifikat eller en åbning i en firewall, skal skillen lade brugeren bygge med opdigtede data og skrive en færdig bestilling til IT-afdelingen. En begynder må ikke ledes gennem opsætning, der hører til IT.
4. **Følsomme data:** Rummer systemet helbreds- eller socialdata eller andre særlige kategorier, skal skillen starte med syntetiske data, databeskyttelsesrådgiveren og en konsekvensanalyse. `sensitive` er sat til sand.
5. **Nøgler:** Nøgler og adgangskoder står aldrig i browserkode, chat, logs eller versioner. De hører til i projektets `.env` og bruges kun fra en server. En statisk side bruger kun åbne data uden nøgle.
6. **Vedligeholdelse:** En leverandør eller kommune vedligeholder kun sin egen skill. En ændring af en andens skill gennemgås af den, der står som `maintainer`.

## Bidrag

Indtil videre skrives integrationer af AI Harness. Beslutningen om at åbne for bidrag som pull requests fra leverandører og kommuner tages sammen med repositoryets licens. Se [beslutningerne](decisions.md).
