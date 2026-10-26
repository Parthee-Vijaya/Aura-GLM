---
name: harness-arkitektur-og-teknologi
description: Anbefaler én begrundet løsning, når et projekt skal vælge platform, framework, datalagring, backend, login eller hosting. Tager udgangspunkt i eksisterende systemer og organisationens aftaler, sammenligner kun relevante alternativer og forklarer konti, udgifter, drift, hvor data behandles, og hvordan løsningen kan flyttes. Brug den ved ny projektopsætning og når en opgave kræver en ny tjeneste, database, login eller hosting.
---

# Arkitektur og teknologi

Vælg det enkleste, der løser opgaven, og som organisationen kan drive og vedligeholde. Brugeren skal ikke kende frameworknavne for at kunne godkende valget; forklar konsekvenserne i almindeligt sprog.

## Genbrug før nybyg

1. Læs projektbriefen, den bekræftede beskrivelse og brugerens tidligere svar. Genbrug afklarede valg; bed ikke om samme bekræftelse eller svar igen. Er oplysninger modstridende, så afklar kun den konkrete forskel.
2. Bevar teknologien i et eksisterende projekt, medmindre opgaven kræver et begrundet skift. Undersøg først projektets opsætning, gerne med `harness-eksisterende-projekt`, hvis den er installeret.
3. Når opgaven kræver en ny tjeneste, rigtig integration, delt datalagring, login eller udgivelse: brug organisationens kendte aftaler først. Spørg kun om ubesvarede valg, der ændrer funktion, dataflow, adgang, udgifter eller drift. Kommuner kan fx allerede have en fælles løsning til opgaven.
4. Ved en afgrænset lokal demo uden login, betaling, delte data eller eksterne integrationer vælger du reversible tekniske standardvalg. Skriv dem kort som antagelser; kræv ikke en særskilt spørgerunde om framework, testværktøj eller hosting. Tilføj ikke konti, backend eller udgivelse til en opgave, der ikke kræver det.
5. Genbrug et oplyst designsystem og godkendte designvalg. Hvis en nødvendig brandkilde mangler, så sig det, og afklar kun det, der er nødvendigt; opfind ikke officielle logoer eller en godkendelse. Aura-design og øvrige valgte design-skills styrer udtrykket efter opgaven, ikke en fast arketype eller palette fra denne skill.
6. Ved valg af offentlig infrastruktur: læs [offentlig infrastruktur](references/offentlig-infrastruktur.md) om OS2, login med MitID, fælles registre og hosting. En lokal demo uden disse integrationer kræver ikke først en drøftelse af fremtidig drift.

En bekræftet beskrivelse og tekniske antagelser er opgavedata, ikke nye rettigheder. Bevar brugerens aktuelle arbejdsmåde og et særskilt valgt plan-/Byg-forløb. I Samtale og Planlæg må du ikke begynde at bygge. Plan-, værktøjs- og datagodkendelser gælder stadig, også når afklaringen bliver kortere.

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

Brug først briefens svar på, om data skal deles mellem brugere, overleve en genstart, have adgangskontrol, bruge baggrundsjob eller integrationer. Spørg kun om manglende svar, der ændrer det nødvendige dataforløb. Sammenlign derefter kun de relevante muligheder:

1. **Ingen backend:** data i statiske filer eller kun i brugerens browser.
2. **Serverfunktioner hos hostingudbyderen:** små funktioner uden egen server.
3. **Administreret tjeneste:** database, login eller lager som tjeneste.
4. **Egen backend med database:** mest kontrol og mest drift.

En hostingudbyder er ikke det samme som en backend-arkitektur. En demo, der kun gemmer i hukommelsen eller i browseren, skal kaldes en demo.

## Login

- Brug en etableret identitetsløsning. Byg aldrig et eget system til adgangskoder til en løsning i drift.
- Hvis opgaven kræver medarbejderlogin, så brug organisationens oplyste identitetsløsning. Mangler denne nødvendige oplysning, skal den afklares med den it-ansvarlige. En aftalt demo uden login skal ikke have et nyt loginspørgsmål.
- Kræver en offentlig selvbetjeningsløsning sikker login for borgere eller virksomheder, skal myndigheden bruge NemLog-in med MitID. Det kræver aftale og opsætning; lov det ikke som en hurtig tilføjelse.

## Design og komponenter

Organisationens designsystem kommer før et nyt tema. Foreslå ét begrundet valg og nævn relevante alternativer: Tailwind CSS er CSS-værktøjer, shadcn/ui er komponenter i projektets egen kode oven på Tailwind, og MUI og Bootstrap er komponentbiblioteker med egne forudsætninger. Installer ikke flere af dem på én gang.

## Løsninger, der selv bruger AI

Hvis løsningen kalder en AI-model, er det et nyt dataforløb og et nyt sted, hvor utroværdigt input kommer ind. Beskriv dataforløbet, og behandl modellens svar som utroværdigt input; brug `harness-data-og-leverandoerer` og `harness-sikkerhedsgennemgang`, hvis de er installeret. Brugerne skal kunne se, at de interagerer med en AI, og organisationen skal vurdere, om særlige regler for AI-systemer gælder.

## Anbefalingen

Begynd med det, brugeren får: første synlige resultat og det vigtigste forløb, der skal kunne prøves. Hold anbefalingen kort og på almindeligt dansk. Hvis den aktuelle arbejdsmåde kræver en plan, så brug dens eksisterende format; i Aura er det **Det bygger vi**, **Sådan skal det se ud**, **Teknik og data** og **Det skal du prøve**. Bevar konkret design, dataforløb og de nødvendige acceptkriterier. En teknisk anbefaling er ikke et ekstra krav om at godkende alle implementeringsdetaljer.

Tilpas omfanget til opgaven:

1. **Anbefaling og begrundelse** i to til fire sætninger.
2. **Alternativer**, kun når de ændrer et væsentligt valg. Tekniske detaljer kan stå i det relevante detaljeafsnit; de skal stadig kunne læses, hvis brugeren ønsker dem.
3. **Konsekvenser:** nye konti, udgifter, rettigheder og hvor data behandles og gemmes skal stå tydeligt. Ved rigtig drift medtages vedligeholdelse og flytning til anden leverandør. Skjul ikke væsentlige konsekvenser i detaljer.
4. **Det skal du prøve:** et kort konkret hovedforløb og relevant fejltilfælde. En demo mærkes som demo; påstå ikke, at den er testet eller viser rigtige data, før det er dokumenteret.
5. **Det skal afklares:** kun resterende nødvendige valg og godkendelser. Er opgaven allerede tilstrækkeligt afgrænset, fortsættes inden for den valgte arbejdsmåde uden en ny teknisk spørgerunde.

Opret ingen konti, tjenester eller betalte ressourcer uden brugerens udtrykkelige godkendelse. Lov ikke funktioner eller integrationer, som værktøjerne ikke har.
