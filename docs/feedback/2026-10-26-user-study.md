# Brugertest af vejen fra idé til første forhåndsvisning

Status pr. 26. oktober 2026: **godkendte UI-ændringer er integreret og nativeprøvet på Mac. Protokol og lokal målefunktion er klar; ingen ny brugertest er gennemført.** Brugeren har valgt at gemme testpakken til senere. Se [den samlede testpakke](testpakke/README.md). Der er ikke inviteret deltagere eller afsendt data. Test af målefunktionen er enhedstest med konstruerede hændelser og dokumenterer ikke produktets brugervenlighed.

## Grundlag og afgrænsning

Udgangspunktet er den fremsendte PDF *Feedback til Aura*, otte sider, fra hackathon 23. oktober. Den beskriver **Windows, Aura 0.3.0-beta.1**. Alle 16 punkter er registreret i [feedback-backlog.json](feedback-backlog.json). Den historiske observation er hverken en fejlrapport for den aktuelle Mac-version eller bevis for, at en nyere version har løst problemet.

Den indledende kodegennemgang er lavet på HEAD `1d48bc4ba8c84454ee219dc2617f5bd2e09a03ab` med eksisterende lokale ændringer i Privacy Gate og OpenCode 2. Appmetadata siger `0.4.0-beta.2`. HEAD alene identificerer derfor ikke det undersøgte produkt. En faktisk native prøve skal også registrere fingerprint af de relevante kildefiler, runtimeversion og den afprøvede pakke. Ved sammenligning bruges de låste kilde- og pakkefingeraftryk, ikke blot versionsmærket.

Godkendt UI, onboarding B, designskills, planvalg, dataregler og YOLO-semantik bevares. Brugeren har godkendt den konkrete før/efter-prototype. De afgrænsede ændringer er nu implementeret; native efterbilleder og testresultater ligger i den separate integrationsrapport. En enklere oplevelse må ikke skjule nye udgifter, modtagere eller rettigheder.

En separat native Mac-prøve er nu gennemført i Electron 44.4.4 med syntetiske filer og kontrollerede IPC-hændelser. Rapporten ligger lokalt under `Aura1/ReleaseReports/feedback-20261026/baseline/baseline-report.json` og indeholder 16 observationer, kildefingeraftryk og ni screenshots. Den reproducerer blandt andet ekstra klik før fritekstsvar, Enter som linjeskift, uændret sidebarbredde ved træk, ventebanneret og fjernelse af nøglefri prøveforbindelse uden bekræftelse. Ved 1280×800 var skrivefeltet cirka 130 px højt, samtaleindholdet cirka 446 px højt og status placeret 522 px over skrivefeltets top. Den aktuelle glow-animation bevægede sig i prøven. Tastaturzoom via CDP var uændret, men prøven kan omgå Electron-menuacceleratorer og beviser derfor ikke en fejl. **Ingen Windows-prøve, rigtig AI eller ny menneskelig brugertest indgår.**

Den foreslåede visning kan gennemgås i den [private før/efter-prototype](https://mac-studio-tilhrende-parthee.tailefb5b1.ts.net/aura-ui/feedback-20261026/). Den klikbare prøve er bevaret som godkendelsesgrundlag; produktets efterbilleder ligger under rapportens `integration-run2/`. Backloggen henviser til hver native observation særskilt, så kodefund og afprøvet adfærd ikke blandes sammen.

## Det vil vi undersøge

- Kan en ikke-teknisk deltager få en fungerende lokal demo uden at vælge framework eller forstå terminalkommandoer?
- Kan deltageren se forskel på arbejde, ventende svar/godkendelse, fejl og færdigt resultat?
- Får deltageren spørgsmål, som allerede er besvaret i opgaven eller briefen?
- Bevarer den enklere vej konkret plan-/datagennemgang og effektive Stop- og tilladelsesgrænser?

Første runde bør være lille og kvalitativ, eksempelvis 3–5 deltagere pr. platform. Det er et planlægningsforslag, ikke tilmeldte deltagere eller et statistisk repræsentativt udvalg. Et enkelt hackathonforløb kan afdække problemer, men kan ikke fastslå deres hyppighed.

## Samme opgave til alle

Giv deltageren denne tekst, uden ekstra instruktioner om, hvilke knapper der skal bruges:

> Byg en flot, rolig og mobilvenlig demo til tilmelding til borgermøder i den opdigtede Fjordby Kommune. Vis fire opdigtede møder med dato, sted, emne og ledige pladser. Man skal kunne søge, åbne et møde, vælge antal deltagere og se en bekræftelse samt sine demotilmeldinger. Brug et frit opdigtet kaldenavn, ingen rigtige personoplysninger. Ingen login, betaling, rigtige bestillinger eller eksterne integrationer. Gem kun på denne computer. Skriv tydeligt, at det er en demo, og at ingen tilmeldinger sendes til en kommune. Brug Auras designskills til et gennemarbejdet første udkast.

Modeller får præcis samme opgave og samme tilladte kontekst. Den valgte model og version, temperature/effort når tilgængeligt, skillhashes, referencefiler og dataregler låses pr. sammenligningsrunde. Modelskift, ændrede rettigheder, personlige designreferencer eller hjælp fra testlederen markeres som en ny betingelse; de må ikke indgå som et rent før/efter-resultat.

**Første fungerende forhåndsvisning** kræver, at mødelisten er synlig, et møde kan åbnes, en demotilmelding kan gennemføres, og bekræftelsen er synlig. En spinner, tom pladsholder eller appens egen påstand om færdigt arbejde tæller ikke. De øvrige krav kontrolleres ved opgavens afslutning.

## Praktisk gennemførsel

1. Kør først en teknisk native prøve med kontrolleret modelserver og syntetisk profil. Registrér den som teknisk prøve, ikke som observation med mennesker eller rigtig AI.
2. Brug en separat, tom testprofil og en dedikeret syntetisk projektmappe på både Windows og Mac. Eksisterende projekter og brugerdata røres ikke. Windows gennemprøves med dansk tastaturlayout, inklusive Ctrl+plus, Ctrl+minus og nulstilling. Mac prøves med tilsvarende Command-genveje.
3. Før en test med rigtig AI vælges model, deling og en udgiftsgrænse af testansvarlig/bruger. Nøgler indtastes via det sikre felt. Ingen nøglekopiering ind i testmateriale. En testsession giver ikke tilladelse til nye leverandører eller automatisk reserve-model.
4. Testlederen forklarer formålet og notatmetoden. Deltagelse og eventuelle optagelser aftales særskilt; video og skærmoptagelse er ikke standard. Registrér kun lokal hændelsesrækkefølge og relative tider. Deltageren kan stoppe når som helst.
5. Sæt tiden til nul, når opgaven er udleveret og forstået. Lad deltageren finde vej. Notér obligatoriske beslutninger og hjælp fra testlederen. Giv først hjælp, når deltageren beder om den eller ønsker at stoppe; sammenlign ikke et hjulpet forløb som selvstændigt gennemført.
6. Når første demo vises, lad deltageren gennemføre tilmeldingen med aliaset `Gæst-1`. Notér første verificerede forhåndsvisning. Kontroller også tom søgning, antal deltagere, mobilvisning og at intet sendes til en kommune.
7. Bed om én ændring: “Vis de møder, der stadig har ledige pladser, først.” Kontroller, at kontekst og tidligere valg bevares, og at opgaven ikke starter forfra med de samme afklaringer.
8. Afslut senest efter den på forhånd aftalte observationsperiode, også hvis ingen preview er nået. Registrér sluttypen som gennemført, stoppet, fejl eller uafsluttet; skjul aldrig de mislykkede forsøg i rapporten.

Forslag til observationsperiode: 20 minutter pr. første opgave og 5 minutter til ændringen. Perioden er en forsøgsramme, ikke et løfte om modellens hastighed. Ved revision efter preview kræves en ny, klart afgrænset observation, hvis første-udkast-målet skal sammenlignes.

## Målinger og definitioner

| Mål | Hvad tæller | Hvad tæller ikke |
|---|---|---|
| Tid til første fungerende preview | Fra opgave udleveres til verificeret hovedforløb; registrér også fra første sendte prompt | En blank side eller “færdig”-besked |
| Obligatoriske valg | Hver faktisk spærrende beslutning, opdelt i produkt, plan, data, værktøj og teknik | Frivilligt åbnede detaljer eller gentegning af samme dialog |
| Gentagne spørgsmål | Testleder konstaterer, at det efterspurgte svar allerede findes i opgaven/briefen | Et nyt valg efter reel ændring af opgave, modtager, data eller omkostning |
| Perioder uden meningsfuld status | Tid under aktivt AI-arbejde uden ny synlig fase eller substantiel svartekst | Ventetid på brugerens valg; glow og en sekunder-tæller er ikke ny fremdrift |
| Hjælp og resultat | Antal gange testlederen hjælper; faktisk gennemførsel/stop/fejl/uafsluttet | Antagelse om succes, fordi modellen stoppede med at skrive |

15 sekunder er en **analysegrænse** for at finde længere perioder uden ny status, ikke en regel om at opfinde et nyt arbejdstrin hvert 15. sekund. Lang modelbehandling kan være legitim. En ærlig “stadig i gang” skal skelnes fra opdigtet fremdrift og fra ny faktisk fremdrift. Rapporter både længste periode og den samlede tid over grænsen. Resultatet forklares sammen med brugerens oplevelse.

Ved afbrudt observation uden preview er tiden **ukendt**. Den må ikke skrives som nul eller observationsperiodens længde. Registrér længden som en nedre observationsgrænse og årsagen særskilt. Fejl og brugerstop er forskellige udfald; de må ikke ukritisk behandles som statistisk tilfældig censorering.

## Lokal og dataminimeret registrering

Målefunktionen er [feedback-metrics.cjs](../../desktop/core/feedback-metrics.cjs). Den er en ren beregning og er **ikke tilkoblet appen**. Den læser/skriver ingen filer, har ingen ur-, netværks- eller modelkald og sender ingen telemetri. Den modtager kun en liste af nummererede hændelser og relative heltalsmillisekunder. Ukendte felter, kategorier og forkert rækkefølge afvises med en fast fejltekst; afvist input citeres ikke i fejlen.

Tilladte hændelser:

| Hændelse | Betydning |
|---|---|
| `study.started` | Første hændelse, `sequence: 0`, `atMs: 0` |
| `prompt.submitted` | Brugeren sender en besked; indholdet registreres ikke |
| `choice.required` | Spærrende valg; kun `category: product/plan/data/tool/technical` |
| `question.repeated` | En observeret gentagelse; ingen spørgsmålstekst |
| `observer.helped` | Testlederen giver hjælp; ingen navne eller samtaletransskription |
| `work.started` / `work.ended` | Begyndelsen og afslutningen af en faktisk arbejdsperiode |
| `work.paused` / `work.resumed` | Pause på brugerens valg og genoptagelse; pausen tæller ikke som AI-stilhed |
| `activity.visible` | Ny meningsfuld synlig fase eller substantiel tekst, ikke blot timer/glow |
| `preview.verified` | Testlederen har verificeret det definerede hovedforløb |
| `study.completed` / `study.stopped` / `study.failed` | Entydig sidste hændelse; ingen hændelser derefter |

Hver hændelse har præcis `sequence`, `type`, `atMs` og kun for valg `category`. `sequence` er fortløbende fra nul. Hændelser må ikke optages igen ved UI-gentegning. Den rene funktion kan afvise en dubleret sekvens, men kan ikke genkende to semantisk identiske hændelser, der allerede er blevet omnummereret. Optager/testleder er ansvarlig for én registrering pr. faktisk hændelse.

Hvis observationen endnu ikke har en sluthændelse, skal `observedThroughMs` angives eksplicit. Ingen manglende måling erstattes med `Date.now()` eller formodet succes. Statusmålingen er ukendt, hvis arbejdsperioder ikke er registreret.

Eksempel på **konstrueret format**, ikke et målt produktresultat:

```js
const { summarizeFeedbackSession } = require('../../desktop/core/feedback-metrics.cjs');
const result = summarizeFeedbackSession([
  { sequence: 0, type: 'study.started', atMs: 0 },
  { sequence: 1, type: 'prompt.submitted', atMs: 1000 },
  { sequence: 2, type: 'work.started', atMs: 1200 },
  { sequence: 3, type: 'activity.visible', atMs: 1500 },
], { observedThroughMs: 6000 });
// outcome: incomplete; firstPreview.elapsedMs: null; activity.censored: true.
```

Der findes også en direkte kommandolinje til en allerede registreret observation:

```sh
desktop/.runtime/darwin-arm64/node/bin/node desktop/scripts/analyze-feedback.cjs /sti/til/events.json
```

For et forløb uden sluthændelse tilføjes eksempelvis `--observed-through-ms 6000`. `-` læser JSON fra standardinput; `--help` viser formatet. Værktøjet udskriver kun det aggregerede JSON-resultat og gemmer ikke selv filer. Ukendte argumenter og rå/private felter afvises. Input er begrænset til 2 MiB og 10.000 hændelser. Der startes ingen model, browser, server eller produktinstrumentering.

Gem kun lokale, aggregerede resultater og nummererede observationer uden navnekobling. Metadata begrænses til build-/kildefingerprint, platform/version, skærmstørrelse/zoom, modelversion, skillhashes, testbetingelse og om AI var kontrolleret eller reel. Registrér ikke profilnavn, kommune, bruger-id, e-mail, filstier, nøgledata, prompts eller svar. Rå samtaler og automatisk skærmoptagelse er ikke en del af protokollen. En PDF med personnavn lægges ikke i repository som testfixture.

## Rapportering og beslutning

Rapportér hver platform og modelbetingelse for sig. Vis antal startede, gennemførte, hjulpne, stoppede, fejlede og uafsluttede forsøg. For tiden til preview vises median og spænd for de faktisk observerede previews sammen med alle manglende previews; kun at vise de hurtigste succeser er misvisende. En lille første runde giver ikke grundlag for statistisk generalisering eller en påstand om modeluafhængig kvalitet.

Før/efter-runden skal bruge samme opgave, rettigheder, model og rammer. Modbalancér rækkefølgen eller brug nye deltagere, så læring af første version ikke forveksles med produktforbedring. Supplér eventuel sammenligning med individuelle observationer om, hvor deltageren gik i stå.

Beslut først videre ud fra: færre overflødige tekniske valg og gentagelser, mere forståelig status, flere gennemførte hovedforløb og bevarede sikkerhedsgrænser. Præcise produktmål fastsættes efter en målt baseline; dokumentet gør ikke et uprøvet sekundtal til et acceptkrav.

## Afgrænset præcisering af arkitekturskillen — implementeret

Den aktuelle kode er allerede mere afgrænset end den historiske feedback:

- `desktop/core/chat-session.cjs`, `composeAppContext`: højst tre nødvendige spørgsmål, ingen gentagelse af briefens svar, kort konkret plan og særskilt Byg-valg.
- `desktop/core/idea-refinement.cjs`: afklar kun målgruppe/anvendelse/deling og foreslå reversible designvalg. Idéhjælpen har ingen værktøjer og giver ingen byggetilladelse.
- `desktop/ui/app.js`, `#start-idea`: første projektidé vælger nu `free`/Byg, hvis brugeren ikke allerede har valgt en arbejdsmåde eller har en gemt kladde.
- `desktop/ui/planning.js`, `planSections`: “Teknik og data” foldes allerede sammen.

To skills kan samtidig trække forløbet mod endnu en afklaring: `harness-ide-og-afgraensning` kræver bekræftelse af beskrivelsen, mens `harness-arkitektur-og-teknologi` beder om organisationens eksisterende systemer, hosting, identitet og designsystem. Det er en mulig konflikt mellem generelle instruktioner, **ikke en bevist forklaring på det konkrete gamle modelforløb**.

Følgende præcisering er implementeret i `harness-arkitektur-og-teknologi`:

> Genbrug den eksisterende brief, beskrivelse og brugerens svar. Ved en afgrænset lokal demo uden login, betaling, delte data eller nye tjenester foreslår du reversible tekniske standardvalg og forklarer dem kort; spørg ikke brugeren om framework, testværktøj eller hosting. Spørg igen, når et ubesvaret valg ændrer funktion, dataflow, rettigheder, omkostninger eller reel drift. Bekræftelse af en idé er ikke værktøjstilladelse. Bevar den aktuelle arbejdsmåde og et eksplicit valgt plan-/Byg-forløb.

Den målrettede regression dækker skillens vej gennem bibliotek, eksport, motorfiler og systemkontekst samt bevarede rettighedsgrænser. En faktisk Workbench afviser en forældet plan. En efterfølgende modelprøve skal måle: lokal demo uden ekstra teknikspørgsmål; allerede besvarede produktvalg; reel ny login-/betalingsintegration; ændret dataflow; bruger siger nej; bruger har valgt Samtale eller Planlæg; ændret plan-id; ingen skrivning før gældende tilladelse. En model må ikke selv skifte til Byg, ophæve en plan eller genbruge en godkendelse med ændret indhold. Derefter måles faktiske modelsvar, uden at tekstmatch-enhedstest kaldes dokumentation for modellernes adfærd.

## Afprøvning af målegrundlaget

```sh
desktop/.runtime/darwin-arm64/node/bin/node --test desktop/tests/feedback-metrics.test.cjs
```

13/13 enhedstests bestod med projektets Node 22.23.3 den 26. oktober 2026: afbrudte observationer, fejl kontra Stop, pauser på brugerens valg, gentagne previews, ufuldstændige data, ugyldig livscyklus, forkert hændelsesrækkefølge og afvisning af private/ukendte felter. CLI-prøverne starter en faktisk Node-underproces, afleverer JSON via standardinput og kontrollerer, at fejlsvar ikke gengiver input eller filstier. Dette er **lokal enhedstest af beregningen og CLI**, ikke en native Windows-/Mac-brugertest, modeltest eller en udgivelsesgodkendelse.
