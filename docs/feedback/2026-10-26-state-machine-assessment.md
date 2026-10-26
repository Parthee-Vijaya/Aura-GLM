# P0-4: vurdering før eksplicit tilstandsmaskine

Dato: 26. oktober 2026. Efterprøvet mod den aktuelle arbejdskopi, inklusive de lokale rettelser af samtalens afslutning og Privacy Gate. Henvisningerne nedenfor gælder denne arbejdskopi, ikke reviewets commit `2b6ea3a`.

**Status: Den fulde tilstandsmaskine er ikke implementeret.** Reviewets foreslåede flade enum skal korrigeres, før refaktoreringen fortsætter. Det er muligt at samle tilstandsstyringen bag samme `ChatSession`-API, men den foreslåede tabel kan ikke indføres direkte uden at ændre eksisterende adfærd.

## Tre forskellige forhold

- **Klar til næste handling:** Samtalen må først modtage en ny afsendelse, når dens igangværende operationer og skrivninger er afsluttet. `running === false` er ikke tilstrækkeligt: en Stop-operation kan stadig gemme historik. `prepare()` og `send()` kontrollerer derfor også afslutningsbarriererne (`desktop/core/chat-session.cjs:226–227`, `:370–374`, `:988–1003`).
- **Seneste udfald:** `idle`, `error`, `stopped`, `interrupted` og `rejected` beskriver resultatet af en opgave. Et gemt udfald er ikke samme information som samtalens aktuelle parathed. Normal afslutning, Stop og lukning bevarer forskellige resultater og planvirkninger (`chat-session.cjs:930–971`, `:988–1003`, `:1108–1125`).
- **Ejerskab af en asynkron operation:** `finishing`, `stopping` og `closing` er promises og barrierer. Gentagne Stop-/luk-kald deler den eksisterende operation; lukning venter på igangværende afslutning. Stop under normal afslutning afvises. Denne kontrakt skal overleve en ny intern repræsentation (`chat-session.cjs:974–985`, `:1101–1125`).

## Afvigelser fra reviewets tabel

| Område | Adfærd, som skal bevares |
|---|---|
| Godkendelser og spørgsmål | Begge samlinger kan være udfyldt samtidig. `awaitingApproval` og `awaitingAnswer` kan ikke være gensidigt udelukkende faser. Svar er bundet til motor, session, generation og konkret anmodning (`chat-session.cjs:704–785`, `:1080–1099`). |
| Kvalitetskontrol | Rettelser bruger samme opgave, plan og session. Et svar kan slutte før afsendelsens kvittering; `pendingIdle` og genkendelse af et nyt svar forhindrer tab eller dobbelt afslutning (`chat-session.cjs:797–927`). |
| Privacy Gate | Normal motorafsendelse afventer en kvittering; hybridafsendelse afventer hele forløbet og lokal samling. Interne stages' terminalhændelser filtreres fra. Historikkerne må ikke komprimeres som én fælles samtale (`chat-session.cjs:441–443`; `desktop/core/privacy/hybrid-fork-engine.cjs:53–74`, `:123–174`). |
| Motorressourcer | `close(false)` bruges til motorudskiftning under aktiv opstart og er ikke en terminal samtaletilstand (`chat-session.cjs:441–444`, `:1101–1125`). |
| Uafhængige valg og bindinger | `chat/plan/build/free`, arkivering, forberedt samtykke, YOLO, generation og Privacy Gate-regler er ikke blot opgavefaser. De må ikke forsvinde ind i én enum (`chat-session.cjs:226–348`, `:385–418`, `:1007–1023`; `desktop/core/privacy-runtime-provider.cjs:77–100`). |

`generation`, motoridentitet, konkrete anmodningsidentiteter og Privacy Gate-bindinger skal fortsat afvise sene hændelser og ændrede tilladelser. En fase alene erstatter ikke disse kontroller.

## Mindste sikre næste leverance

1. Bevar karakteriseringstestene uændret som udgangspunkt. `desktop/tests/session-lifecycle-characterization.test.cjs` dækker allerede dobbelt afslutning, Stop/luk-kapløb, sene godkendelser, ventende historikskrivning og Stop efter afslutning.
2. Tilføj en seedet testmodel for afslutningens ejerskab og parathed. Afvikl handlinger, sene hændelser og udskudte kvitteringer mod den rigtige `ChatSession` med kontrolleret motor og midlertidige syntetiske filer. Kontroller ét opgaveresultat, én claim-frigivelse, bevarede planvirkninger og ingen genopståede godkendelser.
3. Supplér de eksisterende tests med kombinationer omkring opstart/Stop, samtidige spørgsmål og godkendelser, arkivering og invalidation samt hybridens lange afsendelse og interne stages. Genbrug `app-quality-lifecycle.test.cjs`, `question-lifetime.test.cjs`, `engine-compaction.test.cjs` og Privacy Gate-testene.
4. Saml derefter afslutningens ejerskab i ét internt modul bag det eksisterende API. Bevar promise-kontrakten, hændelser, historik, planer og godkendelser. Fjern øvrige flag ét område ad gangen efter dokumenteret adfærdslighed. Ingen ændring af UI indgår i dette trin.

**Testmodel er ikke produktmodel:** 10.000 sekvenser gennem en isoleret referencefunktion viser modellens konsistens. Produktverifikation kræver, at genererede sekvenser også sammenholdes med observerede resultater fra `ChatSession`. Native OpenCode-kontrakter og Privacy Gate-isolation er særskilte prøver og erstattes ikke af den kontrollerede motor.

Dette notat bygger på kildegennemgang og de eksisterende testcases. Der er ikke kørt en ny modelbaseret serie eller implementeret en fuld overgangstabel som led i vurderingen.
