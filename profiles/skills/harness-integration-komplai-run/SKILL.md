---
name: harness-integration-komplai-run
description: Forbereder statiske browserapps til Komplai Run og vejleder om udgivelse, adgang og kontrol af den udgivne version. Brug den, når brugeren har valgt Run til en ny app eller vil opdatere en app der. Skelner mellem Auras desktopapp, Aura-terminalen og andre kodeværktøjer.
---

# Komplai Run

Run viser færdige browserapps på adresser som `budget.komplai.run`. Brug denne skill, når brugeren har valgt Run. Den opretter ikke i sig selv adgang eller giver tilladelse til at udgive.

## Forbered appen

- Læs projektets eksisterende byggeopsætning. Byg React, Vite eller andre frameworks lokalt, og find den faktiske outputmappe med `index.html`. Upload ikke kildeprojektet.
- Lever enten én HTML-fil med alt indhold indlejret eller en ZIP med `index.html` og alle nødvendige billeder, skrifttyper, CSS- og JavaScript-filer. Hver udgivelse erstatter hele versionen; filer fra den forrige version følger ikke med.
- Brug relative filadresser eller stier fra appens egen rod. Kontrollér den færdige outputmappe i en browser, herunder navigation, indlæste filer og eksterne kald.
- Run kører ingen serverkode og stiller ikke database, fælles fillager, AI-proxy eller funktioner til rådighed gennem denne udgivelsesvej. Kræver løsningen det, skal den del afklares særskilt. Browserens lokale lager er hverken fælles data eller en sikkerhedskopi.
- Hold `.env`, nøgler, private data, kildekort og `node_modules` ude af udgivelsen. En browserapp kan ikke holde en API-nøgle hemmelig, heller ikke bag login.

## I Auras desktopapp

Brugeren udgiver gennem **Del** og Komplai-login. I nogle versioner hedder valget **komplai Publish**. Er deling slået fra, kan brugeren slå den til under **Indstillinger → Funktioner**.

Agentens kommandoværktøj må ikke publicere. Brug hverken CLI, direkte API-kald eller en anden vej som omgåelse af Del. Forbered filerne og forklar det næste trin i appen; bed ikke om en udgivelsesnøgle i samtalen.

Aura bruger en særskilt udgivelsesadgang, der gælder i 30 dage for personens egne apps i den valgte organisation. AI-adgang og udgivelsesadgang er forskellige. Lad brugeren vælge app i Del og gennemgå filerne før upload. Ved en ny app vælges adresse og adgang uden forvalg. En eksisterende app beholder sin adgang; ændringer af adgang, tilbagerulning, afpublicering og sletning håndteres i Hub under Run.

## I Aura-terminalen

`/deploy` understøtter Vercel og Azure Static Web Apps, ikke Komplai Run. Forbered filerne og henvis brugeren til manuel upload i Hub. Omgå ikke Auras udgivelsesforløb eller godkendelser med CLI eller direkte API-kald fra agentens kommandoværktøj.

## I andre kodeværktøjer

Læs [references/run.md](references/run.md) for terminalforløbet, uploadformatet og fejlhåndtering. Brug den versionsfaste kommando fra appens vejledning i Hub. Antag ikke, at pakken findes i npm-registret.

Terminalforløbet bruger en nøgle til én eksisterende app, som udløber efter syv dage. Brugeren sætter den i værktøjets private miljø eller CLI'ens skjulte nøglefelt. Læg den aldrig i chat, kommandoargumenter, projektfiler, versionshistorik eller logs. Udgiv kun, når brugeren har godkendt målappen, filerne og adgangen; en eksisterende godkendelse af samme handling skal ikke indhentes igen. Følg fortsat projektets regler for udgivelse og CI/CD.

## Adgang og resultat

En offentlig app udleverer HTML og alle medsendte filer til enhver. En organisationsintern app kræver Komplai-login; en udgivelsesnøgle giver ikke læseadgang. Kontrollér den konkrete organisations aftale og rammer, hvis omkostninger eller databehandling er uafklaret. Lov ikke gratis drift eller en bestemt behandlingsregion ud fra produktnavnet.

Efter upload: åbn den faktiske appadresse, afprøv den vigtigste handling og kontrollér den valgte adgang. Ved afbrudt forbindelse eller ukendt udfald skal den aktive version kontrolleres i Hub før et nyt forsøg. Gentag ikke automatisk.

Rapportér den observerede version og de kontroller, der faktisk er gennemført. En lokal prøve, et godkendt upload og en afprøvet app på dens rigtige adresse er forskellige resultater.
