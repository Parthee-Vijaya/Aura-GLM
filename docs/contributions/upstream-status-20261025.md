# Aura 1 beta 0.3.1 og forkens seneste kode: dækning i originalens PR’er

> **Efterfølgende lokalt arbejde:** [0.4.0-efterslæbet](upstream-followup-beta-0.4.0.md) kortlægger de nyere, endnu ikke indsendte tilføjelser. PR-heads og testtal nedenfor er den historiske kontrol fra 25. oktober, ikke en løbende live-status.

## Udført efter godkendelse — 25. oktober 2026

Den efterfølgende bestilling er udført i rækkefølgen nedenfor. Alle fem PR’er er åbne i originalen; ingen er flettet. Remote-heads og samtlige 13 billedlinks i beskrivelserne er verificeret mod GitHub. Originalens `main` er fortsat `dce68ea74a199ca214ab535a16ff22765d8ee8de`.

| PR | Handling | Verificeret head | Lokal validering |
|---|---|---|---|
| [#49 – Opret projekt](https://github.com/ai-alliancen-org/ai-harness/pull/49) | Ny | `cf5f90a` | 15 native kontroller; fuld suite 514/516 |
| [#23 – Designmetoden](https://github.com/ai-alliancen-org/ai-harness/pull/23) | Opdateret | `c1db20a` | 7/7 designprøver; native før/efter; fuld suite 521/523; 23 eksportpakker genbygget |
| [#43 – Altid aktiv designgrundpakke](https://github.com/ai-alliancen-org/ai-harness/pull/43) | Opdateret | `1b77c8b` | 22/22 fokuserede, 10 native, 7 motortransportforløb; fuld suite 520/522 |
| [#45 – YOLO under Byg](https://github.com/ai-alliancen-org/ai-harness/pull/45) | Opdateret | `252d8a0` | 35/35 fokuserede, 16 native, rigtig Electron/OpenCode/macOS-isolation; fuld suite 523/525 |
| [#50 – Synlig kørende version](https://github.com/ai-alliancen-org/ai-harness/pull/50) | Ny | `525a6d1` | 9/9 fokuserede, 8 native; fuld suite 517/519 |

De fulde suites har kun de to samme fejl i `approvals.test.cjs` (47 og 74), der er reproduceret på uændret upstream. Ingen prøver er sprunget over. Dette er lokal validering; der påstås ikke grøn GitHub CI. Motortransport bruger kontrollerede lokale modelsvar, ikke en ekstern models vurderede designkvalitet.

**Ekstra integrationstest af #23 + #43:** 527/529 desktoptests, 26/26 CLI-tests og syv transportforløb med den fulde designskill. De to desktopfejl er de samme upstream-fejl. Integration er bevaret lokalt på `test/mandatory-design-integration`, commit `89b6d35`. PR #43 beskriver genbygning af eksporterne og sammenfletning med F08/#36. PR #49 indeholder opstarts-/oprettelsesdelen på originalens kode og beskriver den nødvendige kobling med #44’s idéforfinelse; #44 er ikke ændret ved denne bestilling.

Før/efterbilleder kommer fra den faktiske Electron-app i separate testprofiler. Hver PR har en opdateret beskrivelse, testlog, præcis afgrænsning og integrationsnoter. Versions-PR’en viser originalens egne metadata (`0.6.0-beta.1`) og overfører ikke forkens navn, versionsnulstilling eller opdateringsfeed.

#39’s valgfrie lokale testsignering og den overlappende #48 er ikke ændret. Der er ingen ny DMG eller release. Testapps er lukket, syntetiske appprofiler er ryddet op, og lokal kildekode samt testprojekter/worktrees er bevaret.

Nedenstående er den historiske vurdering, som lå til grund for bestillingen. Henvisninger til “mangler” og PR-titler nedenfor gælder før de fem ændringer ovenfor.

---

Kontrolleret 25. oktober 2026. Dette er en kode- og PR-vurdering; ingen PR til originalen er oprettet, ændret, lukket eller flettet som del af vurderingen.

## Resultat

**Anbefaling: to nye selvstændige PR’er, opdateringer til #23, #43 og #45 samt en valgfri pakkeopdatering til #39.** Det er ikke en ny serie af PR’er for alle funktionerne. Der er allerede 31 afgrænsede funktions-/rettelsesforslag (#17–#47) og én bred, overlappende PR (#48).

GitHub viser 39 åbne PR’er i originalen: 32 fra Parthee og syv fra Dependabot. Ingen af Parthees #17–#48 er flettet i den kontrollerede udgave af originalens main.

## Sammenlignede udgaver

| Udgave | Kilde |
|---|---|
| Originalens aktuelle main | `dce68ea74a199ca214ab535a16ff22765d8ee8de` |
| Forkens produktkode efter dagens push | `af9f1677f9668c256809219e52666a26fb0be00c` |
| Udgivelsen Aura 1 beta 0.3.1 | tag `v0.3.1-beta.1`, commit `91612d4caaaf59bd5af523a8b7b43fbcf210fcc1` |
| Kilde registreret i den pakkede 0.3.1-app | `89a162512eae06daabea8c74350b554b7a612c93` |

Release-tagget tilføjer den efterfølgende udgivelsesdokumentation. **Den udgivne DMG indeholder ikke dagens altid aktive designgrundpakke og YOLO-udvidelse.** De er committet og pushet til forkens main; der er ikke bygget eller udgivet en ny DMG i denne opgave. Denne rapport er en efterfølgende dokumentationsændring og ændrer ikke den undersøgte produktkode.

## Anbefalet rækkefølge

### 1. Ny PR: ret låst projektoprettelse

Før: “Opret projekt” kan støde ind i den igangværende opstart eller idéforfinelse og vise “Denne handling er allerede i gang”.

Efter: opstart, idéforfinelse og oprettelse koordineres. Knappen afspejler den faktiske tilstand, kladden bevares, og oprettelse kan fortsætte uden en fastlåst handling. Knappen frigives før den indledende modelopfølgning; et fejlet modelkatalog må ikke kassere det gennemgåede forslag.

Rettelsen findes i den udgivne 0.3.1, men ikke i originalens main eller de gennemgåede åbne PR’er. Den omfatter `desktop/ui/app.js`, `desktop/ui/idea-refinement.js` og `desktop/scripts/verify-project-creation.cjs`. Kilde: `2f915722a2a02d86e9c39a7e21c8cce40b98e446`.

Jeg anbefaler en selvstændig fejlrettelse, selv om #44 også berører idéforfinelse: problemet omfatter hele projektoprettelsen og opstarten. Før indsendelse skal rettelsen tilpasses originalens gren og testes dér, herunder første klik, dobbeltklik, langsom opstart, idéforfinelse og fejlet modelkatalog.

### 2. Opdatér #23 og derefter #43: design fra første forsøg

[#23](https://github.com/ai-alliancen-org/ai-harness/pull/23) indeholder hovedskillen, men mangler det seneste krav om gennemarbejdet design i første udkast. Opdatér skillteksten og eksporterne i denne PR.

[#43](https://github.com/ai-alliancen-org/ai-harness/pull/43) aktiverer hovedskillen, når designfunktionen er valgt. Dens nuværende kode og beskrivelse respekterer fravalg. Forkens nye adfærd gør design til en grundpakke: gamle fravalg kan ikke slå den fra, og projekttilpasninger kan supplere, men ikke fjerne grundmetoden. Den anvendes før første idé-, plan- og byggeforsøg.

Det skal være opdateringer til de to eksisterende PR’er, med en udtrykkelig beskrivelse af den ændrede standardadfærd. Planer, datadelingsregler og værktøjsgodkendelser berøres ikke af designaktiveringen. Kilde: `af9f167`. Ændringen ligger efter den udgivne 0.3.1.

### 3. Opdatér #45: YOLO under Byg

[#45](https://github.com/ai-alliancen-org/ai-harness/pull/45) har allerede midlertidig tilladelse til den aktuelle samtale. Den nuværende PR starter fra en ventende godkendelse og omfatter projektarbejde og isolerede kommandoer. Dens beskrivelse udelukker automatisk tilladelse til direkte webkald og eksterne filstier.

Forkens seneste kode tilføjer YOLO under Byg, også før første værktøjskald. Efter advarsel og bekræftelse omfatter tilladelsen desuden almindelige webkald og adgang til eksterne filer, som ellers kræver en værktøjsgodkendelse. Den kan tilbagekaldes, er begrænset til den aktuelle samtale/appstart og gælder ikke i skrivebeskyttede tilstande. Beskyttede filer, planvalg, datadelingsregler og teknisk isolation består. Nøglemapper, følsomme filtyper samt relevante aliaser og symbolske links er dækket af læsebeskyttelsen.

Opdatér #45 med hele denne ændring, advarslens før/eftervisning og regressionstestene. Den nuværende PR-beskrivelse må ikke stå uændret, når omfanget udvides. Kilde: `af9f167`. Ikke med i den udgivne 0.3.1-DMG.

### 4. Ny PR: vis den kørende version under logoet

Før: brugeren kan ikke direkte se, hvilken appudgave der kører.

Efter: versionsmærket læser appens egne metadata og vises under logo/navn. Et mislykket versionsopslag må ikke blokere opstart eller projektoprettelse.

Funktionen findes i 0.3.1, men ikke i originalens main eller de åbne PR’er. Kilde: versionsdelen af `9f44ff7`, især `desktop/ui/app-version.js`, versionsfelter i `desktop/ui/index.html`, tilhørende stil og registrering i `desktop/main.cjs`.

Portér funktionen med originalens navn, versionsrække og udgivelseskanal. Forkens navn “Aura 1”, nulstilling til 0.3.1 og forkens opdateringsadresse skal ikke kopieres med. Vis et reelt før/efterbillede fra originalens grene ved forberedelsen.

### 5. Valgfrit: udvid #39 med lokal testsignering

[#39](https://github.com/ai-alliancen-org/ai-harness/pull/39) dækker allerede pakkens kildeidentitet og runtime-integritet. Forken har derudover lokal ad hoc-signering og særskilte entitlements til lokale testbuilds (`c51a32c` og `ffbeada`). Denne del er ikke med i de åbne PR’er.

Hvis originalen ønsker samme lokale testvej, kan det forberedes som en afgrænset udvidelse til #39. Developer ID-signering og de normale produktionsrettigheder skal bevares. Ad hoc-signering er ikke notarisation. Det er et valgfrit bidrag, ikke en manglende brugerfunktion.

## PR #48 skal afklares

[#48](https://github.com/ai-alliancen-org/ai-harness/pull/48), “Fix/compact onboarding and conversation flow”, indeholder **108 commits, 392 ændrede filer, 18.086 tilføjede og 410 fjernede linjer**. Beskrivelsen er tom. Dens head er `fa223d3b2ceb6f27e5fecf4c13f590913801036c`.

Den samler mange af de samme funktioner, som allerede er opdelt i #17–#47. Den bør derfor ikke behandles som endnu en uafhængig feature-PR. Min anbefaling er at prioritere de afgrænsede PR’er og derefter erstatte eller lukke #48, når eventuelle nødvendige integrationsbindinger er overført og testet. Ingen lukning er udført.

Nogle samlede linjer findes kun i #48, fordi de kobler flere funktioner sammen: chatkontekst med skills og vedhæftninger, fælles fil-/billed-/PDF-håndtering, flere komponenter i pakkens unpack-liste og bindinger mellem historik, modelvalg og samtaletilladelser. En linjeforskel er derfor ikke automatisk en ny feature. Disse samlinger skal kontrolleres, når PR’erne integreres; det er ikke bevist alene ved denne sammenligning, at 31 selvstændige merges giver en identisk app.

## Forskelle, der skal blive i fork’en

- Navnet Aura 1 og forkens distribution/opdateringsfeed.
- Versionsrækken, startpunktet 0.3.1 og forkens udgivelsesbeskrivelser.
- Forkens specifikke release- og oprydningspolitik.
- Lokale rapportplaceringer og arbejdsregler, som kun vedrører Parthees checkout.

Det er bevidste forskelle, ikke manglende feature-PR’er. Der er ikke behov for at sende nye dublet-PR’er for onboarding B, glød i chatfeltet, vedhæftninger, idéhjælp, mørk arbejdsvisning, modelkontekst, genforsøg eller sessionsgenoptagelse: der findes allerede åbne forslag for disse områder.

## Metode og testgrundlag

Originalens main, forkens main, release-tagget og samtlige 32 PR-heads blev hentet og kontrolleret mod GitHub. Produktionsændringer og tilføjede linjer blev sammenlignet på tværs af app, kerne, UI, CLI, fælles skills og katalog; de konkrete mangler blev efterprøvet i koden. Linjesammenligningen er et hjælpemiddel og erstatter ikke vurderingen af ens adfærd med forskellig kode eller en test af en samlet integration.

Testresultaterne for de nu pushede design-/YOLO-ændringer blev gennemgået: 753/753 desktoptests, 11/11 fokuserede læse-/tilladelsesprøver og 16 native Electron-kontroller bestået. Nativeprøven brugte en separat syntetisk profil og ingen eksterne AI-kald. Resultaterne er fra implementeringsprøven; der er ikke kørt en ny samlet upstream-integrationstest eller GitHub CI som del af denne PR-audit. Git-kontrol og syntakskontrol blev også gennemgået før push.

Ændringerne er pushet uden force-push. Eksisterende kildekode og brugerdata er bevaret. Ingen ny DMG eller release er oprettet.

## Alle 32 åbne forslag fra Parthee

“Dækket” betyder, at der allerede findes et forslag til funktionen; det er ikke en påstand om byte-identitet med den sammenbyggede fork. PR’erne er stadig åbne.

| PR | Titel | Vurdering |
|---|---|---|
| [#17](https://github.com/ai-alliancen-org/ai-harness/pull/17) | F20: Visuel onboarding med kompakt opstart og tydelige valg | Dækket af eksisterende forslag |
| [#18](https://github.com/ai-alliancen-org/ai-harness/pull/18) | F28: Vis aktivt arbejde med en lyskant rundt om chatfeltet | Dækket af eksisterende forslag |
| [#19](https://github.com/ai-alliancen-org/ai-harness/pull/19) | R01: Bind spørgsmål til aktiv opgave og bevar samtalen under afklaring | Dækket af eksisterende forslag |
| [#20](https://github.com/ai-alliancen-org/ai-harness/pull/20) | R02: Bevar modelsessionen fra Planlæg til Byg | Dækket af eksisterende forslag |
| [#21](https://github.com/ai-alliancen-org/ai-harness/pull/21) | F07: Vis seneste målte kontekst adskilt fra samtalens forbrug | Dækket af eksisterende forslag |
| [#22](https://github.com/ai-alliancen-org/ai-harness/pull/22) | F03: Vis lokale udbyderlogoer ved den valgte chatmodel | Dækket af eksisterende forslag |
| [#23](https://github.com/ai-alliancen-org/ai-harness/pull/23) | feat: add a reviewed primary app design method to the shared library | Opdatér skillteksten fra dagens commit |
| [#24](https://github.com/ai-alliancen-org/ai-harness/pull/24) | R04: Bevar senere brugerændringer i flettede projektkopier | Dækket af eksisterende forslag |
| [#25](https://github.com/ai-alliancen-org/ai-harness/pull/25) | R03: Giv lokale Vite- og Astro-forhåndsvisninger hver sin port | Dækket af eksisterende forslag |
| [#26](https://github.com/ai-alliancen-org/ai-harness/pull/26) | R06: Vis de faktiske fælles grundregler før afsendelse | Dækket af eksisterende forslag |
| [#27](https://github.com/ai-alliancen-org/ai-harness/pull/27) | F10: Gør AI-svar læsbare med tabeller, kopiering og sikre links | Dækket af eksisterende forslag |
| [#28](https://github.com/ai-alliancen-org/ai-harness/pull/28) | F11: Søg lokalt i samtalernes beskeder og åbn det præcise træf | Dækket af eksisterende forslag |
| [#29](https://github.com/ai-alliancen-org/ai-harness/pull/29) | Vedhæft gennemgåede tekstfiler direkte i samtalen (F13) | Dækket af eksisterende forslag |
| [#30](https://github.com/ai-alliancen-org/ai-harness/pull/30) | Brug udvalgte filer fra referencemapper som læsekontekst (F14) | Dækket af eksisterende forslag |
| [#31](https://github.com/ai-alliancen-org/ai-harness/pull/31) | Stop ejede OpenCode-processer efter brat app-lukning (R05) | Dækket af eksisterende forslag |
| [#32](https://github.com/ai-alliancen-org/ai-harness/pull/32) | Indtast AI-nøgler i et separat isoleret vindue (F05) | Dækket af eksisterende forslag |
| [#33](https://github.com/ai-alliancen-org/ai-harness/pull/33) | Indtast GitHub-token i det isolerede nøglevindue (F06) | Dækket af eksisterende forslag |
| [#34](https://github.com/ai-alliancen-org/ai-harness/pull/34) | Indlæs tidligere gemte beskeder med en diskret knap (F12) | Dækket af eksisterende forslag |
| [#35](https://github.com/ai-alliancen-org/ai-harness/pull/35) | F31: Gennemgå alle diff-linjer før en filændring godkendes | Dækket af eksisterende forslag |
| [#36](https://github.com/ai-alliancen-org/ai-harness/pull/36) | F08: Bind gennemgået appkontekst til den konkrete afsendelse | Dækket af eksisterende forslag |
| [#37](https://github.com/ai-alliancen-org/ai-harness/pull/37) | F09: Skeln modelkatalogets oplysninger fra observeret værktøjsstøtte | Dækket af eksisterende forslag |
| [#38](https://github.com/ai-alliancen-org/ai-harness/pull/38) | F16: Vedhæft gennemgåede PNG- og JPEG-billeder i chatten | Dækket af eksisterende forslag |
| [#39](https://github.com/ai-alliancen-org/ai-harness/pull/39) | T04: Verificér pakkens kildeidentitet og samtlige runtime-filer | Dækker T04; lokal testsignering er valgfri tilføjelse |
| [#40](https://github.com/ai-alliancen-org/ai-harness/pull/40) | F15: Gennemgå lokalt udtrukket PDF-tekst før deling i chatten | Dækket af eksisterende forslag |
| [#41](https://github.com/ai-alliancen-org/ai-harness/pull/41) | Genforsøg langsomme modelkald uden at gentage leverede handlinger | Dækket af eksisterende forslag |
| [#42](https://github.com/ai-alliancen-org/ai-harness/pull/42) | Genoptag agentens eksisterende session efter forbindelsesbrud | Dækket af eksisterende forslag |
| [#43](https://github.com/ai-alliancen-org/ai-harness/pull/43) | Aktivér den valgte hovedskill før planlægning og bygning | Opdatér til altid aktiv designgrundpakke |
| [#44](https://github.com/ai-alliancen-org/ai-harness/pull/44) | Forfin idéen med AI før projektet oprettes | Dækket af eksisterende forslag |
| [#45](https://github.com/ai-alliancen-org/ai-harness/pull/45) | Tillad projektarbejde for den aktuelle samtale efter tydelig advarsel | Opdatér med YOLO og udvidet læsebeskyttelse |
| [#46](https://github.com/ai-alliancen-org/ai-harness/pull/46) | Giv arbejdsvisningen et roligt og responsivt mørkt layout | Dækket af eksisterende forslag |
| [#47](https://github.com/ai-alliancen-org/ai-harness/pull/47) | Vis arbejdsstatus over forhåndsvisningen uden at genindlæse den | Dækket af eksisterende forslag |
| [#48](https://github.com/ai-alliancen-org/ai-harness/pull/48) | Fix/compact onboarding and conversation flow | Overlappende samle-PR; afklar integrationsbindinger |

Den prioriterede liste findes også som [CSV](upstream-actions-20261025.csv).
