# POC 1 · Download af AI-instruktioner

## Afgrænsning

En dansk, statisk hjemmeside med pakker til Claude Code, Codex og OpenCode. Brugeren kan vælge værktøj, læse hver fil, kopiere indhold, hente enkelte filer eller en ZIP og følge en vejledning.

Der er ingen konti, API-nøgler, modelkald, automatisk installation eller telemetri. Instruktionerne er vejledning. De etablerer ikke sandboxing, central organisationsstyring eller sikkerhedsgarantier.

## Profil og pakker

Alle pakker bygges fra `profiles/grundregler.md`. Claude Code får `CLAUDE.md`; Codex og OpenCode får `AGENTS.md`. Der medfølger et generelt `.gitignore`-forslag, `LAES-MIG.md` og et manifest med version og SHA-256-kontrolsummer for indholdet. Kontrolsummer kan opdage indholdsforskelle; de er ikke en digital signatur eller et bevis på en betroet afsender.

Brugeren skal pakke ud separat og sammenflette eksisterende instruktioner og .gitignore. Vejledningen forklarer værktøjsspecifik indlæsning, relevante konflikter og en ufarlig prøveopgave. Kontrolordet FÆLLES-GRUNDLAG-01 er en hjælp til at undersøge indlæsningen, ikke dokumentation for håndhævelse.

## Bygning og lokal visning

Følg kommandoerne i [README](../README.md). Bygningen bruger kun Pythons standardbibliotek. Browseren bruger HTML, CSS og JavaScript uden eksterne biblioteker eller skrifttyper. Kun `site/dist` skal serveres eller offentliggøres.

De offentlige filer i `site/dist` skal versionsstyres, inklusive downloadpakker og skjulte `.gitignore`-filer i pakkerne. Projektets egen `.gitignore` har en eksplicit undtagelse for denne mappe.

## Afprøvningsstatus

Lokalt afprøvet den 22. september 2026:

- Pakkekontroller har åbnet alle tre ZIP-filer og sammenlignet indhold, filvisning, fælles kildeprofil, værktøjsnavne og kontrolsummer.
- Browsertest i Chrome på macOS har hentet alle tre ZIP-filer og sammenlignet de hentede bytes med de genererede filer.
- Enkeltfiler, filvalg, kopiering og valg af værktøj med tastatur er afprøvet.
- Fejl ved kopiering og indlæsning er fremprovokeret; manuel kopiering og direkte downloads er tilgængelige.
- Direkte downloads er tilgængelige uden JavaScript.
- Desktop- og mobilvisning er visuelt gennemgået; visninger på 390 og 640 pixels er kontrolleret for utilsigtet vandret rulning.

**Nået niveau:** skrevet, automatiseret kontrolleret og afprøvet på den konkrete lokale side og dens faktiske downloadfiler. Ikke offentliggjort eller observeret i drift.

**Ikke afprøvet:** faktisk indlæsning og efterlevelse i Claude Code, Codex og OpenCode med konkrete modelversioner; Windows, Safari og Firefox; en fuld manuel tilgængelighedsgennemgang. Ingen påstand om godkendelse til personoplysninger eller kommunal drift.

## Dokumentationsgrundlag

Filplacering og indlæsningsvejledning er sammenholdt med de officielle kilder den 22. september 2026:

- [Claude Code: projektinstruktioner](https://code.claude.com/docs/en/memory)
- [Codex: AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [OpenCode: regler](https://opencode.ai/docs/rules/)

Kilderne beskriver filformater og indlæsning, ikke en garanti for, at en model følger de foreslåede grundregler.
