# Aura Harness i beta

Aura Harness samler instruktioner og værktøjer til at bygge med AI. Du kan bruge instruktionerne i dit eget kodeværktøj eller afprøve Aura-appen. Betaen er til udviklere, IT-medarbejdere og teknisk interesserede kolleger, der vil gennemgå ændringerne og give feedback.

## Det kan du afprøve

- **Instruktionspakker:** grundregler og 12 skills til 23 kodeværktøjer. Pakkerne er tekstfiler, du kan læse og tilpasse. I Claude Code og OpenCode er indlæsningen afprøvet med en kontrolleret modelserver. De øvrige værktøjer følger deres officielle dokumentation; modellernes efterlevelse er ikke certificeret.
- **Aura-appen:** opret eller åbn et lokalt projekt, tilslut din egen AI, gennemgå en plan, og arbejd videre med kode, forhåndsvisning og gemte versioner. Appen bruger Electron og en lokal OpenCode-agent.
- **Bidrag:** fejlrapporter, erfaringer, dokumentation, skills og kodeændringer. Se [bidragsvejledningen](../CONTRIBUTING.md).

## Før du installerer

Installationsfiler udgives i [GitHub Releases](https://github.com/ai-alliancen-org/ai-harness/releases). En lokal bygning eller en ændring på `main` betyder ikke, at der findes en tilsvarende download. Læs altid udgivelsesnoterne for den konkrete fil.

**Status 13. oktober 2026:** beta.6 med Komplai-forbindelsen er bygget lokalt til Mac med Apple-chip, Intel-Mac og Windows x64. Der er endnu ingen udgivet installationspakke i GitHub Releases. Den [manuelle udgivelse](udgivelse.md) er klargjort til vedligeholderens gennemgang.

Instruktionspakke 0.2.1 udvider pakkekontrol, adgangsprøver, agentadgang og dokumentation før udgivelse. Den er klargjort i kildekoden og webguidens ZIP-filer, men endnu ikke publiceret. De lokale beta.6-installationsfiler er bygget før denne ændring og skal bygges og kontrolleres igen for at medtage den.

- Begge Mac-apps er Developer ID-signeret. Kode, profiler og signatur er kontrolleret inde i de faktiske diskbilleder. Beta.6 er endnu ikke notariseret.
- Appen til Apple-chip er startet med isolerede brugerdata; projektoprettelse, preview og lokale versioner er afprøvet med medfølgende værktøjer. Installation på en anden Mac mangler.
- Intel-pakken er ikke afprøvet på en Intel-Mac.
- Windows-pakken er usigneret. Indholdet er kontrolleret fra det faktiske installationsprogram på Mac; installation, første start og opdatering på Windows mangler.
- Komplai-login med en almindelig brugers rigtige konto, model og fælles budget mangler endnu en samlet prøve i produktionsmiljøet.

Vi har enhedstests og lokale appprøver med rigtige filer og kontrollerede modelservere. Det erstatter ikke afprøvning af den aktuelle pakke med brugerens rigtige model og computer. Se [teststatus](teststatus.md) for detaljer og tidligere forsøg.

## Rammer for afprøvningen

Brug opdigtede data og et separat testprojekt. Tag en sikkerhedskopi, før du åbner et eksisterende projekt. Modeller kan lave fejl, og instruktioner er ikke teknisk adgangskontrol. Appen har endnu ikke en isoleret sandbox for hele agenten eller fælles organisationslogin.

Du vælger selv AI og hosting. De tjenester kan modtage kode og data og have egne priser og vilkår. Brug i en kommune kræver stadig kommunens vurdering af databehandling, adgang og drift. Et fungerende preview er ikke en sikkerheds- eller GDPR-godkendelse.

Appen har endnu ingen automatisk opdatering. Testudgivelse afhænger af den valgte tjeneste og kan kræve ekstern opsætning; betaen lover ikke et færdigafprøvet forløb hos alle udbydere.

Byggeværktøjer og medfølgende npm har tidligere registrerede afhængighedsfund. Pakningen opdaterer ikke disse afhængigheder. Se [afgrænsningen i demogennemgangen](demogennemgang.md); betaen er ikke en sikkerhedsrevideret distribution.

## Hjælp os med at afprøve

Start med et lille projekt med opdigtede oplysninger. Prøv at bygge et udkast, ændre det, lukke og genåbne projektet og gendanne en gemt version. Beskriv, hvor du blev i tvivl, og hvad du forventede skulle ske.

[Opret en fejlrapport eller et forslag](https://github.com/ai-alliancen-org/ai-harness/issues). Oplys appversion, operativsystem og de nødvendige trin. Fjern nøgler, private data og personlige filstier fra eventuelle skærmbilleder og logs. Sikkerhedsproblemer sendes [privat til kontaktpersonen](../SECURITY.md).

Kontaktperson: **Parthee Vijayamohan**, [pavi@kalundborg.dk](mailto:pavi@kalundborg.dk). Betaen har ingen garanteret support eller svartid.
