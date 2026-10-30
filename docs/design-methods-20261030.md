# Designskill: Unparalleled og Oversight

30. oktober 2026. Opdateret 2026-10-30T18:15:53.530Z.

**Afsluttet måling.** Alle fire model- og browserforløb har et registreret udfald. Afbrudte forløb er bevaret som fejl, ikke erstattet af nye forsøg.

## Ændringen

Auras eksisterende hovedskill er udvidet med en tilpasset Unparalleled-metode og egne formuleringer inspireret af Oversights arbejdsmetode. Unparalleled-materialets MIT-licens og oprindelse bevares. Ingen proprietære Oversight-prompts, templates eller designaktiver kopieres.

Tre korte, betroede referencer indlæses før første idé-, plan- eller byggekald: designbrief, brandresearch og komponentinspiration. Kun faste tilladte stier kan medtages. Hele filer indlæses, højst 8 KiB pr. fil og 12 KiB samlet inklusive indpakning. Udeladte filer angives tydeligt. Modellen vælger fortsat selv komposition og visuelt design gennem skills. Der vælges ingen modelafhængig palette, skabelon eller ny reserveudbyder.

Eksisterende projekters egne skilltekster bevares uændret. Ældre tilpasninger kan læses og gemmes sammen med nye betroede grundreferencer. Referencernes faktiske indhold indgår i den eksisterende kontekstbinding før afsendelse. UI, onboarding B, modeller, værktøjsrettigheder, planer og godkendelser ændres ikke.

Den første systemtekst vokser fra cirka 46,6 kB til 57,0 kB. Referencepakken er 11.437 bytes inklusive indpakning; øvrige skilltekster er også tilpasset. Samme øvre budget er ikke samme faktiske tokenforbrug eller et prisloft.

## Afprøvning

- Kildetest: 2007 bestået, 32 sprunget over, 0 fejl, i alt 2039. Det er kildesuitens resultat; de oversprungne prøver hævdes ikke at være bestået.
- Rigtige kald til Mistral `mistral-large-4-0` og Corti `corti-s1` gennem native Electron, Auras Workbench, gateway og OpenCode 2.1.4. Dette er en native kodeprøve, ikke en kvalificering af en installeret DMG.
- Samme Kalundborg-opgave med fiktive aktiviteter og lokal demotilmelding i alle fire arme. Ingen brugerprojekter eller reelle tilmeldinger bruges.
- Samme øvre budget pr. arm: 40 modeltransportforsøg, 900 sekunders agenttid, fælles kontekstloft på 131.072 tokens, 32.000 svartokens pr. kald og højst én automatisk produktrettelse. Plan og bygning deler budgettet. Det er testens begrænsninger, ikke nødvendigvis modellernes normale maksimum, og ikke et beløbsloft.
- Planhash og konkrete filændringer godkendes. Samme begrænsede officielle brandresearch; ingen YOLO, shell, Git, brede filstier eller modelskift.
- Tolv foruddefinerede funktionskriterier dækker demomærkning, søgning med/uden match, filtre, nulstilling, detaljer, validering, tilmelding, genindlæsning, afmelding, mobilforløb og runtime/netværk. Kriterier og modelkode ændres ikke.
- Browserprøve ved 1440 × 900 og 390 × 844 med eksterne browserkald blokeret. Screenshots og kildehashes kontrolleres. Et rent browserinventar tæller aldrig som bestået funktionstest.

## Resultater

| Arm | Udfald | 12 funktionskriterier | Agentsekunder | Transportforsøg / forbrugsoplyste kald | Kendt USD |
|---|---|---|---:|---:|---:|
| Mistral før | App leveret; lokal kvalitetskontrol kræver gennemgang | 12 bestået, 0 fejl, 0 ikke relevante, 0 ikke afprøvet | 548,403 | 21 / 21 | 0.579483 (estimat) |
| Mistral efter | 40-kaldsloft nået; kald 41 ikke sendt | 11 bestået, 0 fejl, 1 ikke relevante, 0 ikke afprøvet | 607,413 | 40 / 39 | 0.552656 + ukendt forbrug |
| Corti før | Ingen app leveret; startside bevaret | Ikke gennemførligt som appforløb; 11 mangler, 1 statisk runtimekontrol | 326,644 | 12 / 11 | 0.726112 + ukendt forbrug |
| Corti efter | Ingen kørende app; logoasset ikke integreret | Ikke gennemførligt som appforløb; 11 mangler, 1 statisk runtimekontrol | 900,083 | 18 / 15 | 1.644741 + ukendt forbrug |

Agenttid er kumulativ fra seneste afsluttede fase. HTML/JSON viser også samlet vægtid og særskilt driverpause.

- Mistral før: Første udkast gemt før kvalitetskontrollen er byteidentisk med det bevarede slutoutput. 0 automatiske rettelsesrunder registreret. En afvist værktøjstilladelse under bygning forhindrede automatisk rettelse efter Auras eksisterende regel. Det udleder ikke, hvorfor modellen bad om adgangen.

Mistrals funktionstest er adskilt fra Auras lokale design- og kvalitetskontrol. Et bestået brugerforløb er ikke bevis for god kontrast eller æstetisk polering. Et transportafbrudt forløb uden en app kan omvendt ikke bedømmes som et modeldesign. Manuel æstetisk vurdering ligger særskilt; der opfindes ingen automatisk designscore.

## Driverafbrydelse og genoptagelse

Planprøver ramte afviste godkendelsessvar, herunder HTTP 404, hvis årsag ikke er fuldt fastslået. Evaldriveren kontrollerer nu dubletter og aktuelle anmodninger og registrerer accepterede svar. Ukendte fejl ignoreres ikke. Det er ikke dokumenteret som en produktrettelse.

Genoptagelse bevarer samtale, session, planhash og konfigurationsfingeraftryk. Ingen planprompt gentages; tidligere tid og kald tæller videre. Oprindelige beviser bevares.

- mistral-before: 13/13 genoptagelsesbindinger verificeret.
- corti-before: 13/13 genoptagelsesbindinger verificeret.
- mistral-after: 13/13 genoptagelsesbindinger verificeret.

Bindingerne omfatter kode, profiler, model, opgave, initialfiler, session/samtale og tidligere forbrug/tid. Afbrudt strøm efter modtaget indhold gentages ikke blindt.

## Pris og fortolkning

Priserne er estimater for udbyderrapporteret forbrug, ikke fakturaer. Satser kontrolleret 30. oktober 2026: Mistral 0,70 USD input, 0,07 USD cache og 2,10 USD output pr. million tokens; Corti 2,00 / 0,20 / 8,00 USD. Ræsonnement afregnes som output. Auras ældre Mistral-prisberegning erstattes kun i rapportens estimat.

Et afbrudt kald kan være faktureret uden komplette forbrugstal. Kendt forbrug vises da separat, mens den samlede pris er ukendt, aldrig 0. Corti-før har 12 transportforsøg, 11 forbrugsoplyste kald og 0,726112 USD kendt forbrug; ét forsøg mangler forbrugsoplysninger.

Kilder: [Mistrals prisliste](https://docs.mistral.ai/inference/pricing) og [Cortis modeldokumentation](https://docs.corti.ai/models/models).

Der er én episode pr. model og metode, n=1. Cache, researchsider og svartider varierer. Prøven viser de konkrete resultater og kan ikke bevise en generel kvalitetsgevinst eller isolere Oversights bidrag fra referenceindlæsningen. Ingen ekstra visionrunde gives til den ene model. Ingen genereret kode rettes manuelt.

Kun udvalgte målinger, kildehashes, funktionsudfald og screenshots hører til den delbare rapport. API-nøgler, indstillinger, private lokale stier, systemprompts, rå modeloutput, logs og intern ræsonnementstekst medtages ikke.

## Maskinlæsbare resultater og vurdering

Se [JSON med målinger og hver funktionskontrol](design-methods-20261030.json) og [CSV til sammenligning](design-methods-20261030.csv). Screenshotreferencerne i JSON peger på den lokale evidenspakke; billedfiler og rå testdata publiceres ikke i dette commit.

Mistrals efterudgave viser aktiviteterne tidligere på desktop, men er stadig præget af ens kort og en stor filterflade på mobil. Det er ikke en dokumenteret generel kvalitetsgevinst. Corti leverede ingen app i nogen af de to forsøg. Integrationen gør metoden tilgængelig og bevarer grænserne, men denne prøve kvalificerer ikke designkvaliteten som færdig eller en ny DMG.
