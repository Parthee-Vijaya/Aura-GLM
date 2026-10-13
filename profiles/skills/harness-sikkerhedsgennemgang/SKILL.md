---
name: harness-sikkerhedsgennemgang
description: Gennemgår adgang, input, dataadskillelse og agentværktøjers rettigheder ved sikkerhedsrelevante ændringer og før udgivelse. Afprøver konkrete adgangsgrænser og skelner mellem bekræftede fejl, mistanker og manglende kontroller. Brug den ved ændringer i login, data, eksterne tjenester, MCP eller agentkonfiguration og før en app sættes i drift.
---

# Sikkerhedsgennemgang

En gennemgang finder konkrete fund. Den gør ikke en app sikker, og fravær af fund er ikke bevis for fravær af problemer. Beskriv præcist, hvad der er kontrolleret. En scanning er heller ikke en GDPR-godkendelse.

## Hvornår

- Ændringen berører login, roller, adgang, formularer, filupload, API'er, databaser, eksterne tjenester eller personoplysninger.
- Før en app udgives første gang og før større udgivelser.
- Når en afhængighed med kendte sårbarheder opdages.
- Når agentens værktøjer, MCP-servere, hooks eller rettigheder til filer, netværk og drift ændres.

## Fremgangsmåde

1. Notér kodeversion, miljø og omfang. Tegn kort, hvor data kommer ind, gemmes og sendes hen. Marker grænserne mellem browser, server, database, agentværktøjer og andre tjenester.
2. Gennemgå punkterne i [tjeklisten](references/tjekliste.md), der er relevante for ændringen. Spring ikke adgangskontrol og input over.
3. Afprøv relevante adgangsgrænser med syntetiske konti og data i et aftalt testmiljø efter tjeklistens prøveforløb. Ved agentværktøjer eller MCP læses også [agentadgang](references/agentadgang.md). En gennemgang giver ikke i sig selv tilladelse til at teste fremmede systemer eller ændre drift.
4. Registrér kontroller og fund efter [tjeklistens dokumentationsformat](references/tjekliste.md). Brug projektets register, hvis det findes; ellers et maskeret resumé i `docs/sikkerhed.md`. Detaljer om udnyttelige fejl hører til i organisationens aftalte, adgangsbegrænsede kanal.
5. Ret de fund, der hører til opgaven, og afprøv rettelsen. Andre fund foreslås som særskilte opgaver.

## De vigtigste regler

- **Adgangskontrol på serveren ved hver forespørgsel.** En skjult knap eller en kontrol i browseren er ikke adgangskontrol. Kontrollér også, at en bruger kun kan hente sine egne objekter, når id'et ændres i adressen.
- **Brug etableret login.** Byg ikke eget system til adgangskoder eller kryptering. Brug organisationens identitetsløsning eller en anerkendt tjeneste.
- **Valider input, og escape output.** Brug ikke `innerHTML` eller tilsvarende med brugerinput. Brug parameteriserede databaseforespørgsler.
- **Hemmeligheder på serveren.** Ingen hemmelige nøgler i browserens kode, i Git eller i logs. Offentlige klientnøgler vurderes efter udbyderens dokumentation og adgangsreglerne bag dem.
- **Afprøv dataadskillelse.** Brugere og organisationer må kun tilgå de data, deres rettigheder tillader. Afprøv både afvisning og den tilsigtede adgang; fælles data skal fortsat kunne deles efter projektets regler.
- **Sikre standarder.** HTTPS, sikre cookies, begrænsning af antal forsøg ved login og fejlbeskeder uden interne detaljer.

## Apps, der selv bruger en AI-model

Behandl modellens svar som utroværdigt input: escape det, og lad det ikke alene udføre handlinger. Tekst fra brugere, dokumenter og websider kan indeholde instruktioner til modellen. Send ikke hemmeligheder eller unødvendige personoplysninger i prompten.

## Brug af scannere

- Kontrollér understøttede sprog og filtyper, valgte regler og udeladelser mod de faktiske projektfiler. Fx kan `.cjs`, `.mjs`, databaseregler og infrastruktur være uden for en scanners dækning.
- Registrér værktøj, version, regelsæt, dato og gennemført omfang. En afbrudt eller ufuldstændig kørsel må ikke blive til et grønt resultat. Skeln mellem statuskoder for fund og for værktøjsfejl.
- Et mønstermatch er en mistanke, indtil kode og dataflow er undersøgt. Bekræft fx om input faktisk kan nå et usikkert HTML-kald, og om en nøgle er hemmelig eller offentlig. Alvor og sikkerhed for fundet er forskellige oplysninger.
- Maskér hemmeligheder og personoplysninger før rapportering. Brug kun aftalte scannertjenester; upload af kode eller pakkeoplysninger er også et dataflow.

## Stop og inddrag andre

- Løsningen skal i drift med personoplysninger, login eller integration til kommunens systemer: inddrag organisationens informationssikkerhedsfunktion, før den udgives. Kommuner kan være omfattet af NIS2-loven, som har korte frister for varsling om væsentlige hændelser.
- Du finder en eksponeret hemmelighed eller et fund, der kan være et sikkerhedsbrud: stop, fortæl det straks, og anbefal at tilbagekalde og udskifte nøglen. `harness-noegler-og-afhaengigheder` beskriver fremgangsmåden, hvis den er installeret. Et brud på persondatasikkerheden skal håndteres efter organisationens procedure.
