---
name: harness-eksisterende-projekt
description: Undersøger et eksisterende eller ældre projekt, før der foreslås ændringer eller nye konventioner. Laver en læsende gennemgang af instruktioner, teknologi, start- og testkommandoer, Git-status, CI og hosting og foreslår derefter kun de Harness-dele, der passer. Brug den, når et projekt åbnes første gang, overtages fra andre eller skal have AI Harness tilføjet.
---

# Eksisterende projekt

Et eksisterende projekt har valg, som andre har truffet af en grund. Forstå dem, før du foreslår noget nyt, og lad projektets egne konventioner gå forud for Harness' standardvalg.

## 1. Læs, før du kører noget

Gennemgangen er læsende. Kør ikke projektets kommandoer, installer ikke pakker og upload intet blot for at forstå projektet. Spørg, før du kører tests eller bygger.

Find og notér:

- **Instruktioner:** `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`, `GEMINI.md`, `CONTRIBUTING.md` og lignende. Læg mærke til modstridende regler.
- **Formål og dokumentation:** README, docs-mappe, arkitekturnoter og tidligere beslutninger.
- **Teknologi:** sprog, frameworks, pakkehåndtering og låsefiler (`package-lock.json`, `pnpm-lock.yaml`, `poetry.lock` osv.). Brug den pakkehåndtering, låsefilen viser.
- **Kommandoer:** start, test, build og lint, som de står i dokumentationen eller i fx `package.json`. Kør dem ikke endnu.
- **Git:** aktuel branch, uncommittede og staged ændringer, remotes og om der er igangværende merge eller rebase.
- **CI og drift:** workflows, deploymentfiler (`Dockerfile`, `vercel.json`, `staticwebapp.config.json` m.fl.) og miljøer.
- **Konfiguration:** navne på miljøvariabler fra fx `.env.example`. Læs aldrig værdierne i `.env` eller andre hemmelighedsfiler.
- **Integrationer og data:** eksterne tjenester, databaser og hvilke data løsningen håndterer.

## 2. Giv en kort oversigt

Skriv til brugeren:

- Hvad projektet er, og hvordan det startes og afprøves ifølge dokumentationen.
- De vigtigste konventioner, du vil følge.
- Det, der mangler eller er uklart. Manglende dokumentation er en usikkerhed, ikke et bevis på, at noget ikke findes.
- Kendte risici, fx gamle afhængigheder, hemmeligheder i koden eller manglende tests. Beskriv dem som fund i projektet, ikke som fejl i den nye ændring.

## 3. Foreslå, før du ændrer

- Foreslå de relevante Harness-dele og vis de præcise filændringer. Lad brugeren vælge.
- Tilføj ikke en ny formatter, pakkehåndtering, Git-model, branchestrategi, testramme eller hostingtjeneste som en skjult følge af opgaven.
- Bevar projektets eksisterende instruktioner. Nye regler placeres, så de ikke overskriver dem, og konflikter nævnes, før den berørte handling.

## Beskyt brugerens arbejde

- Bevar både staged og unstaged ændringer. En ændring fra agenten må kun omfatte det, der hører til opgaven.
- Brug aldrig `git add .`, `git reset --hard`, `git clean`, rebase eller force-push som oprydning.
- Hvis dine og brugerens ændringer i samme fil ikke kan adskilles sikkert, så stop og bed om en manuel gennemgang.
- Gamle problemer må ikke tilskrives den nye ændring, og manglende historik må ikke omskrives til en tidligere godkendelse.
