---
name: harness-arkitektur-og-teknologi
description: Anbefaler én begrundet løsning, når et projekt skal vælge platform, framework, datalagring, backend, login eller hosting. Tager udgangspunkt i eksisterende systemer og organisationens aftaler, sammenligner kun relevante alternativer og forklarer konti, udgifter, drift, hvor data behandles, og hvordan løsningen kan flyttes. Brug den ved ny projektopsætning og når en opgave kræver en ny tjeneste, database, login eller hosting.
---

# Arkitektur og teknologi

Vælg det enkleste, der løser opgaven, og som organisationen kan drive og vedligeholde. Brugeren skal ikke kende frameworknavne for at kunne godkende valget; forklar konsekvenserne i almindeligt sprog.

## Genbrug før nybyg

1. Bevar teknologien i et eksisterende projekt, medmindre opgaven kræver et begrundet skift. Brug `harness-eksisterende-projekt` først.
2. Spørg, om organisationen allerede har et system, en fælles løsning eller en godkendt tjeneste til opgaven. Kommuner kan fx have løsninger fra fællesoffentlige eller fælleskommunale samarbejder.
3. Spørg til organisationens godkendte hosting, identitetsløsning og designsystem, før du foreslår nye.
4. I danske offentlige organisationer: læs [offentlig infrastruktur](references/offentlig-infrastruktur.md) om OS2, login med MitID, fælles registre og hosting.

## Standardvalg til nye webprojekter

| Behov | Udgangspunkt |
|-------|--------------|
| Enkel informationsside uden fælles data | HTML, CSS og lidt JavaScript |
| Indholdstungt website med mange sider | Astro |
| Interaktiv app i browseren | React med TypeScript og Vite |
| App med routing, serverfunktioner eller datahentning på serveren | Et React-framework, valgt bevidst |

- Brug TypeScript med `strict` slået til. Valider stadig data, der kommer udefra.
- Native mobil- og desktopapps har egne krav til udviklingsværktøjer, signering, afprøvning på enheder og distribution. En webforhåndsvisning viser ikke, at en iOS-app virker.

## Data og backend vælges for sig

Afklar først, om data skal deles mellem brugere, overleve en genstart, have adgangskontrol, bruge baggrundsjob eller integrationer. Sammenlign derefter kun de relevante muligheder:

1. **Ingen backend:** data i statiske filer eller kun i brugerens browser.
2. **Serverfunktioner hos hostingudbyderen:** små funktioner uden egen server.
3. **Administreret tjeneste:** database, login eller lager som tjeneste.
4. **Egen backend med database:** mest kontrol og mest drift.

En hostingudbyder er ikke det samme som en backend-arkitektur. En demo, der kun gemmer i hukommelsen eller i browseren, skal kaldes en demo.

## Login

- Brug en etableret identitetsløsning. Byg aldrig et eget system til adgangskoder til en løsning i drift.
- Medarbejdere logger typisk ind med organisationens egen identitetsløsning. Spørg den it-ansvarlige, hvilken der skal bruges.
- Kræver en offentlig selvbetjeningsløsning sikker login for borgere eller virksomheder, skal myndigheden bruge NemLog-in med MitID. Det kræver aftale og opsætning; lov det ikke som en hurtig tilføjelse.

## Design og komponenter

Organisationens designsystem kommer før et nyt tema. Foreslå ét begrundet valg og nævn relevante alternativer: Tailwind CSS er CSS-værktøjer, shadcn/ui er komponenter i projektets egen kode oven på Tailwind, og MUI og Bootstrap er komponentbiblioteker med egne forudsætninger. Installer ikke flere af dem på én gang.

## Løsninger, der selv bruger AI

Hvis løsningen kalder en AI-model, er det et nyt dataforløb og et nyt sted, hvor utroværdigt input kommer ind. Brug `harness-data-og-leverandoerer` og `harness-sikkerhedsgennemgang`. Brugerne skal kunne se, at de interagerer med en AI, og organisationen skal vurdere, om særlige regler for AI-systemer gælder.

## Anbefalingen

Skriv:

1. **Anbefaling og begrundelse** i to til fire sætninger.
2. **Alternativer**, og hvornår de ville være bedre.
3. **Konsekvenser:** konti, udgifter, drift og vedligeholdelse, hvor data behandles og gemmes, og hvor let løsningen kan flyttes til en anden leverandør.
4. **Det skal afklares:** godkendelser, aftaler og fagpersoner, der skal inddrages.

Opret ingen konti, tjenester eller betalte ressourcer uden brugerens udtrykkelige godkendelse. Lov ikke funktioner eller integrationer, som værktøjerne ikke har.
