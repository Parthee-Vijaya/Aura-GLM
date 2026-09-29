---
name: harness-git-og-samarbejde
description: Håndterer Git, så brugeren bevarer kontrollen over historikken. Skelner mellem at gemme filer, lave et checkpoint, pushe, åbne en pull request og udgive, foreslår sammenhængende versioner med en præcis commit-besked og vælger branches efter samarbejdsformen. Brug den ved milepæle, før commit eller push og når arbejdet skal deles med andre.
---

# Git og samarbejde

Brugeren ejer historikken. Du hjælper med at holde den ren, forståelig og sikker, men du laver kun Git-handlinger, som brugeren udtrykkeligt har bedt om.

## Fem forskellige handlinger

1. **Gem fil:** beskytter kladden på computeren. Det er ikke en version.
2. **Checkpoint (commit):** en lokal, sammenhængende version, der kan gendannes.
3. **Push:** sender versionerne til en fjernkopi, fx GitHub, GitLab eller Codeberg.
4. **Pull request:** beder andre gennemgå en ændring, før den kommer ind i hovedgrenen.
5. **Udgivelse:** gør en bestemt version tilgængelig for brugere. Det er en særskilt beslutning; brug `harness-udgivelse-og-gendannelse`.

Lav aldrig commit, push, merge, rebase, nye branches, tags eller pull requests uden en udtrykkelig anmodning om netop den handling. "Gør det færdigt" eller "send det af sted" er ikke en sådan anmodning. Spørg, hvis du er i tvivl.

## Checkpoints ved milepæle

- Foreslå et checkpoint, når en afgrænset opgave er færdig og afprøvet. En prompt er ikke en milepæl; én opgave kan kræve flere prompts, og en afbrudt opgave kan efterlade halve ændringer.
- Før du foreslår et commit: kør `git status` og `git diff`, og kontrollér, at kun de tilsigtede filer er med, og at der ingen hemmeligheder, lokale indstillinger eller store genererede filer er.
- Tilføj filer enkeltvis eller efter mappe. Brug ikke `git add .` uden at have set alt, der kommer med.
- Afslut milepælen med en oversigt over ændringerne, den faktiske afprøvning, kendte begrænsninger og et forslag til commit-besked.

## Commit-beskeder

- Kort, i bydeform og om den faktiske ændring: `tilføj filter efter antal pladser`.
- Følg projektets sprog og form. Mange projekter bruger et præfiks som `feat:`, `fix:`, `docs:`, `test:`, `refactor:` eller `ci:`.
- Én sammenhængende ændring pr. commit. Bland ikke oprydning med ny funktionalitet, hvis det kan undgås.
- Tilføj ikke modelnavne, medforfattere eller "genereret af" i beskeden, medmindre projektet selv ønsker det.

## Branches efter samarbejdsform

- **Alene på et prøveprojekt:** en enkel historik på hovedgrenen kan være tilstrækkelig.
- **Flere udviklere:** beskyt hovedgrenen, lav korte opgavegrene og brug pull requests med automatiske kontroller og review.
- **Parallelt arbejde:** worktrees giver separate arbejdsmapper til forskellige branches. Brug dem kun, når der faktisk arbejdes parallelt. De isolerer ikke processer, netværk eller hemmeligheder.
- **Miljøer:** test og produktion bør pege på kendte commits eller byggede versioner, ikke på permanente `test`- og `prod`-branches.

Et eksisterende projekt beholder sin egen proces. Foreslå ikke en ny model uden en grund.

## Aldrig uden særskilt aftale

- Force-push, rebase af delte branches eller omskrivning af historik, der allerede er delt.
- `git reset --hard`, `git clean` eller sletning af branches som oprydning.
- Ændring af Git-identitet, remotes, hooks eller branchbeskyttelse.

## Hemmeligheder i historikken

En `.gitignore` fjerner ikke filer, der allerede er sporet. Hvis en nøgle er committet, så stop, fortæl brugeren hvor, og anbefal at tilbagekalde og udskifte nøglen. Det er ikke nok at slette filen i et nyt commit, fordi nøglen stadig findes i historikken. Omskrivning af historik kræver brugerens beslutning.
