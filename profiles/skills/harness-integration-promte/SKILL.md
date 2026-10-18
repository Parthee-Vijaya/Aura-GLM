---
name: harness-integration-promte
description: Bygger en app, der kører i et Promte-arbejdsområde og bruger Promtes modeller, vidensbaser og data via app-biblioteket, og uploader kildekoden med Promtes kommandolinjeværktøj. Forklarer byggeregler, login, nøgler og godkendelse. Brug den, når projektet skal blive en Promte-app.
---

# Promte

En Promte-app er en React-app, der kører i en iframe i et arbejdsområde i Promte. Appen bruger organisationens modeller, vidensbaser og datalager gennem npm-pakken `@promte/app-library`. Kildekoden uploades med `@promte/app-upload`, og Promte-serveren tjekker og bygger den.

## Før du bygger

- **Adgang:** Brugeren skal have en Promte-installation og være administrator i appens arbejdsområde. Har brugeren ikke det, så byg og afprøv lokalt med Vite, og skriv en bestilling til IT. Brug skabelonen nederst.
- **Data:** Appen gemmer data i Promte, enten privat for hver bruger eller fælles for arbejdsområdet. Hvilke persondata appen behandler, afhænger af appen. Gem kun det, løsningen har brug for.
- **Hvor data sendes hen:** Appen kalder kun organisationens egen Promte-server. Promte sender modelkald videre til de modeller, organisationen har sat op.

## Projektet

Promte bygger med en fast React- og Vite-opsætning. Detaljer og fejlbeskeder står i `references/promte.md`.

- Pak appen ind i `PromteAppProvider`, og vent på `ready` fra `usePromte()`, før du kalder `usePromteClient()`.
- Vælg model fra `client.models()`. Skriv aldrig model-id'er fast i koden.
- Læg `react`, `react-dom` og `@promte/app-library` under `devDependencies`. Promte leverer selv de versioner, appen bygges med.
- Upload ikke byggekonfiguration som `vite.config.js`, `tailwind.config.js` eller `postcss.config.js`. Brug almindelig CSS.
- Andre npm-pakker skal have en fast version eller være låst i `package-lock.json`. Højst 20 pakker.

## Nøgler

Læg aldrig nøgler, adgangskoder eller tokens i browserkode, chat, logs eller versioner, og læg dem heller ikke i projektets `.env`. Skal appen kalde en anden tjeneste med en nøgle, så brug en backend-funktion i appen og en forbindelse, som en administrator har oprettet i Promte. Nøglen bliver på Promtes server.

Login til upload gemmes af kommandolinjeværktøjet i brugerens egen mappe, `~/.config/promte/credentials.json`, ikke i projektet. Bed aldrig brugeren indsætte et token i chatten.

## Upload

Kommandoerne henter en pakke fra npm. Kør dem kun, når brugeren har sagt ja til det.

1. `npx @promte/app-upload login`. Brugeren godkender i browseren. Brug `--host` med organisationens Promte-adresse, hvis den ikke er `https://app.promte.dk`.
2. `npx @promte/app-upload config --workspaceId <id>`. Id'et står i adressen på appens arbejdsområde.
3. `npx @promte/app-upload push`. Fejl i byggeriet vises i terminalen. Ret dem, og upload igen.
4. `npx @promte/app-upload status`. Står versionen til gennemgang, er den nuværende version online, indtil den nye er godkendt.

## Afprøvning

Kør `npm run dev`, og åbn appens arbejdsområde i Promte. Vælg **Lokal forhåndsvisning til udvikling** under **Forhåndsvisning**, og indtast `http://localhost:5173`. Appen skal vise, at `ready` er sand, og en liste over modeller fra `client.models()`. Brug opdigtede data, aldrig rigtige borgeres oplysninger.

## Bestilling til IT

Når brugeren mangler adgang, så skriv en kort bestilling med:
- formålet og hvem der skal bruge appen;
- hvilken Promte-installation og hvilket arbejdsområde;
- at brugeren skal være administrator i arbejdsområdet for at uploade versioner;
- hvilke data appen gemmer, og om der er persondata, så databeskyttelsesrådgiveren kan tage stilling;
- hvilke forbindelser til andre systemer appen skal bruge, hvis nogen.
