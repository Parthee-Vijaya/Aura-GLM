# AI Harness til Claude Code

Version 0.1.0. Til et kodeprojekt på Windows eller Mac.

## Før du begynder

Du skal selv have Claude Code installeret og adgang til en model gennem værktøjet.
Pakken indeholder ikke en model, API-nøgle eller et abonnement. Følg din organisations regler for værktøjer og data.

## 1. Pak ud et separat sted

Pak ZIP-filen ud i en midlertidig mappe. Pak den ikke direkte ud oven i dit projekt.
Windows: højreklik på ZIP-filen og vælg at udpakke alle filer. Mac: dobbeltklik på ZIP-filen.

## 2. Placér reglerne i projektet

Projektets rodmappe er den øverste mappe, du åbner i dit kodeværktøj; ofte ligger README.md og .git her.
Kopiér CLAUDE.md til denne mappe. Hvis filen allerede findes, skal du tage en kopi og sammenflette reglerne manuelt. Overskriv ikke eksisterende instruktioner.
Åbn .gitignore fra pakken i en teksteditor og tilføj relevante regler til projektets eksisterende .gitignore. På Mac kan skjulte filer vises med Cmd+Shift+punktum; på Windows kan skjulte elementer slås til i Stifinder.
manifest.json er pakkens versions- og indholdsoversigt og skal ikke indlæses som instruktion.

## 3. Genstart og undersøg indlæsningen

Start en ny session i projektmappen. Brug /memory til at undersøge, om projektets CLAUDE.md er med. Spørg derefter efter profilens kontrolord.
Andre CLAUDE.md-filer og administrerede indstillinger kan også påvirke sessionen. Denne pakke er til Claude Code, ikke en almindelig Claude-chat.

Du kan skrive:

> Hvilke projektinstruktioner har du indlæst? Hvad er kontrolordet i AI Harness-profilen? Opsummér reglerne for hemmeligheder, Git og afprøvning. Ændr ingen filer.

Forvent kontrolordet FÆLLES-GRUNDLAG-01 og en relevant opsummering. Svaret er en indikation, ikke bevis for teknisk håndhævelse. Hvis profilen ikke genkendes, kontrollér filnavn, placering, modstridende instruktioner og en ny session.

## 4. Afprøv med ufarligt materiale

Brug et tomt prøveprojekt og en opdigtet nøgle som IKKE_EN_RIGTIG_NOEGLE. Bed agenten forklare, hvor den bør opbevares, uden at skrive filer. Den bør foreslå beskyttet konfiguration og fraråde at lægge nøglen i kode eller commits.
Bed også agenten foreslå en lille ændring og forklare, hvordan den vil teste den og lade dig gennemgå et commit. Notér værktøjsversion, model, dato og afvigelser. Brug aldrig en rigtig hemmelighed til testen.

## 5. Bevar og opdatér

Gennemgå ændringerne i Git. Brug versionsstyring til at dele og gendanne projektets instruktioner. Hvis Git ikke er sat op, få hjælp til at oprette et repository før større ændringer.
Ved en ny profilversion: sammenlign med din nuværende fil, bevar lokale tilpasninger og afprøv igen. Pakken installerer eller overskriver ikke noget automatisk.

## Begrænsninger og kilder

Dette er vejledende instruktioner, ikke en sandbox eller en garanti mod datalæk. .gitignore påvirker ikke filer, som allerede er sporet, og hindrer ikke en agent i at læse dem.
Filformatet er sammenholdt med officiel dokumentation den 22. september 2026. Agenternes adfærd er ikke certificeret eller afprøvet på tværs af modeller og versioner.
Dokumentation: https://code.claude.com/docs/en/memory
