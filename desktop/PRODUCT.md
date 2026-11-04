# Aura Prime

## Platform

web

Aura Prime er en lokal Electron-desktopapp til macOS og Windows. Webteknologien beskriver brugerfladen, ikke en ny offentlig webtjeneste.

## Formål

Brugeren arbejder fra idé og afklaring til plan, lokale kodeændringer, forhåndsvisning og gennemgang i ét arbejdsområde. Eksisterende modelmotorer, filadgang og projektdata har ansvar for funktionerne. UI-laget præsenterer dem og må ikke skabe nye tilladelser.

## Brugere

Den eksisterende projektbeskrivelse henvender sig til udviklere, IT-medarbejdere og teknisk interesserede kolleger, blandt andet i kommuner. Designet skal give en enkel indgang og adgang til de eksisterende detaljer. En mere præcis prioritering mellem målgrupper er endnu ikke valgt i denne redesignsession.

## Redesignbestilling

Parthee har den 4. november 2026 bestilt et fuldt UI/UX-redesign med en installeret desktop-referenceapp som reference. Layout, navigation og visuel præsentation kan ændres frit. Aura Prime-navnet, appens reelle funktioner og hele onboardingforløbet videreføres. Retningen er en arbejdsapp med neutrale lyse og mørke flader, sort/hvid hovedhandling og blå markering af valg.

Parthee afviste efterfølgende den første visuelle implementering, fordi den ikke lignede den installerede referenceapp. Den installerede referenceapp og dens faktiske opstartsforløb er nu referencen. Den store integrerede logoplacering, helt skjulbare sidebar, centrerede samtalestart og samlede indstillinger skal kunne genkendes i Aura. Hjemmesidens præsentation alene er utilstrækkelig som visuel dokumentation.

Aura har intet kontologin. En personlig profil er valgfri og lokal. Et fravalg må ikke gemme computerens brugernavn eller formularens ugemte identitet og må ikke medføre gentagne profilspørgsmål. Tema, tekststørrelse, hjælp og øvrig konfiguration gemmes fortsat gennem appens eksisterende lokale indstillingslager. Dette er ikke en bestilling på kontosynkronisering eller en ny konfigurationseksport.

## Funktioner og grænser

- Profil, hjælpeniveau, arbejdsdetaljer, AI-forbindelser, nøglehjælp, lokal AI og projektidé bevares i onboarding. Udbydere og modeller vælges gennem de eksisterende controllere.
- Projekter, samtaler, historik, kladder, vedhæftninger og referencemapper bevares.
- Samtale, Planlæg og Byg bevarer deres interne værdier og forskellige adgangsgrænser.
- Arbejdsfladen bevarer Forhåndsvisning, Plan, Ændringer, Kode og Aktivitet. Faktiske hændelser må ikke erstattes af simuleret produktaktivitet.
- Datagennemgang, planer, filgodkendelser og isolation bevares. YOLO kræver eksisterende advarsel og bekræftelse, gælder kun samtalen og må ikke omgå beskyttede filer eller datadeling.
- Modelvalg, forbrug, kontekst, hjælp, versioner, sikkerhedskopi og udgivelse bevarer deres eksisterende funktion og aktivering.
- Tema, tekststørrelse, tastaturbetjening og vinduesstørrelse skal fungere sammen. Gemte manuelle bredder bevares; nulstilling må kun ændre det valgte layoutfelt.

## Kilder

Brugerens bestilling, repositoryets AGENTS.md, README.md og de eksisterende UI-controllere. Visuel reference: den installerede desktop-referenceapp. Ingen nye effekt- eller sikkerhedspåstande følger af redesignet.
