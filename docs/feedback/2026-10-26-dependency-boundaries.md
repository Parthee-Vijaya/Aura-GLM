# Afhængigheder: afgrænset anvendelse, fortsat åbne advisories

Kontrolleret 26. oktober 2026 mod forkens låsefil, det aktuelle npm-register og den faktiske Electron-runtime. Den fulde npm-kontrol viste oprindeligt syv berørte pakker (seks højt og ét moderat klassificeret fund). De tilgængelige kompatible rettelser er opdateret; tre højt klassificerede fund består: to biblioteksfund og den afledte markering af sandbox-runtime. Dette notat er **ikke** en erklæring om nul sårbarheder.

## Rettede versioner

| Del | Før → efter | Betydning |
|---|---|---|
| Electron | 44.4.4 → 44.9.3 | Samme hovedversion; Chromium-/Electron-rettelser kommer med i selve appen. [Udgivelsesnoter](https://github.com/electron/electron/releases/tag/v44.9.3). |
| fast-uri | 3.1.8 → 3.1.9 | Kompatibel rettelse i byggeværktøjets URI-behandling. |
| http-cache-semantics | 4.2.0 → 4.3.0 | Kompatibel rettelse i byggeværktøjets HTTP-cache. |
| Undici, node-gyp | 6.29.0 → 6.29.1 | Kompatibel rettelse i byggeværktøjet. |
| Undici, direkte og byggeafhængighed | 7.29.1 → 7.30.1 | Låses også som direkte produktionsafhængighed, så appens fetch ikke bliver på Electrons ældre indbyggede udgave. |

**En npm-opdatering alene retter ikke Electrons indbyggede fetch.** Den faktiske Electron 44.9.3 indeholder Undici 7.29.1; den nye Electron 45.0.0 bruger samme Node-grundlag. [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c) beskriver et procesnedbrud ved et fejlformet serversvar. Derfor installerer den normale appopstart og CLI-start den officielle, låste Undici-implementation før produktmodulerne indlæses. Fetch, Request, Response og FormData kommer fra samme udgave; politik, destinationer, nøgler og genforsøg ændres ikke.

Den nye direkte afhængighed er **Undici 7.30.1, MIT**, låst i både desktop- og CLI-manifestet. Den var allerede en indirekte byggeafhængighed, men skal udtrykkeligt med i produktionspakken for at rette denne vej. Der tilføjes ingen alternativ modeltransport eller reserveudbyder.

## Åbne biblioteksfund

| Afhængighed | Låst version | Aktuel vurdering |
|---|---|---|
| `@anthropic-ai/sandbox-runtime` | 0.0.81 | Fortsat seneste publicerede version ved kontrollen. Produktionsafhængighed; markeringen nedarves fra de to biblioteker nedenfor. |
| `node-forge` | 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) har ingen udgivet rettet version. Aura anvender ikke SRTs valgfrie TLS-terminering. Ingen signaturverifikation gennem forge blev fundet i SRTs installerede kode. |
| `zod` | 3.25.76 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) vedrører ressourceforbrug ved validering af store samlinger. SRT importerer `zod/v3`; Auras direkte `SandboxManager.initialize` bruger ikke CLI-konfigurationsloaderen eller den eksterne decider, hvor valideringen findes. |

Zod 4.6.7 er tilgængelig, men [rettelsen](https://github.com/colinhacks/zod/commit/a0ebf97) vedrører v4. Den medfølgende v3-arrayparser er uændret i forhold til 3.25.76. En override ville derfor kunne fjerne en versionsalarm uden at rette den kode, SRT faktisk importerer. Den foreslåede automatiske nedgradering af sandbox-runtime til 0.0.50 ville desuden ændre isolationens fundament. Ingen af disse ændringer udføres.

## Afgrænsningen i Aura

Aura beholder de låste biblioteker og deres licenser: sandbox-runtime Apache-2.0, Zod MIT og node-forge BSD-3-Clause/GPL-2.0. Sandboxen får ingen ny afhængighed. En fælles policybygger og kontrol afviser andre indstillinger end dem, Aura selv bruger til projekt-, scratch- og pakkeregisteradgang. Ukendte indstillinger fjernes ikke stiltiende; kommandoen afvises.

Kontrollen sker både, når Aura opretter policyen, og i den separate kommandoproces før sandboxen aktiveres. Indlæsning og parsing begrænses, og fejl viser faste beskeder uden policyindhold. TLS-terminering, credential injection, ekstern decider og ekstra proxyveje er ikke godkendte konfigurationer. De eksisterende domæner, beskyttede filer, godkendelser og YOLO-semantik bevares.

Det begrænser Auras eksponering og opdager utilsigtet udvidelse af konfigurationen. Det retter ikke upstream-bibliotekerne, og npm-alarmene skal fortsat vises. En fremtidig SRT-opgradering skal genvurderes mod disse grænser og native isolationstests.

## Afprøvning og evidens

Faktiske rapporter bevares eksternt i `ReleaseReports/dependency-20261026/`:

- `audit-all.json` og `audit-after.json`: fuld audit før/efter, syv → tre berørte pakker. `audit-before.json` er den snævrere oprindelige produktionsaudit.
- `baseline-boundary-probe.json`: den tidligere runner accepterede en syntetisk policy med et ekstra tilladt domæne og skrev en markør; den nye runner afviste samme policy før udførelse. Ingen ekstern trafik.
- `policy-hidden-red.tap` og `policy-hidden-focused-green.tap`: skjulte policyfelter fejlede før rettelsen; 106 fokuserede/native tests består efter.
- `http-runtime-before-after.json`: den faktiske Electron-binær i Node-tilstand afsluttede med en uhåndteret fejl før rettelsen og overlevede efter. En separat native Electron-main-prøve efter rettelsen beviser fortsat fetch, streaming, afvisning af redirects, afbrydelse, multipart og Responses i Electron-protokollen. Den fejlede før-prøve i almindelig Electron-main viste en fejldialog og blev stoppet; den kaldes ikke en gennemført førmåling.
- `check-final.tap`: første samlede slutkørsel gav 1.759 beståede af 1.760, med én native opstartsfejl før Stop. Denne fejlrapport bevares. Den isolerede prøve og fire komplette native forløb med hver 19 tests bestod efterfølgende. Årsagen til den første opstartsfejl er stadig uafklaret; gentagelserne er ikke bevis for en rettelse.
- `check-diagnostic.tap`: hele pakken blev derefter kørt med begrænset, opt-in opstartsdiagnostik i den oprindelige rækkefølge. **1.761/1.761 tests bestod**, ingen springet over, på 195,6 sekunder. Diagnostikken logger metode, motor-id og en afgrænset fejlstack, ikke argumenter, nøgler eller modelindhold. Den faktiske pakkede app afprøves særskilt for at kontrollere opstart uden testens modulindlæsning.
- CLI-pakken er desuden bygget og installeret i en separat mappe uden udviklingsafhængigheder. `--help` og `--version` består med den deklarerede Undici-afhængighed (`cli-package-probe/`).

Native tests anvender syntetiske projekter og kontrollerede kommandoer/svar. De erstatter ikke andre platforme eller en rigtig AI-prøve. Den faktiske DMG kvalificeres særskilt. Denne ændring udskifter værtsappens HTTP-implementation; den er ikke en omskrivning af netværksbiblioteker i vilkårlige projekter eller underprocesser.

Tilbagerulning sker med en tilbageførsel af de afgrænsede kilde- og låsefilændringer. Det genindfører de beskrevne risici og bør kun bruges ved en konkret regression. Godkendte UI-filer og brugerdata ændres ikke af denne rettelse.
