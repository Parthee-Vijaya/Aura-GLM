# Lokal afprøvning af arbejdet mod Aura 0.6

Status 23. oktober 2026. Dette dokument beskriver arbejdsmappeændringer, ikke en udgivet version. Versionsnummeret er stadig `0.5.0-beta.3`. Den installerede app og brugerens projekter er ikke opdateret af prøverne. [Udgivelsesvejledningen](udgivelse.md) gælder fortsat.

## Brugerforløb

- **Nyt projekt** er sidepanelets primære handling. Projektets **+** opretter en ekstra samtale. Første idé står som en redigerbar kladde i Byg; ekstra samtaler starter i Samtale.
- Projekter kan arbejde samtidigt med forskellige modeller. Svar, godkendelser, previews og opgavestatus tilhører det projekt og den samtale, der startede opgaven. Indstillinger og navigation forbliver tilgængelige.
- Et konkret forslag med fire planafsnit kan bygges direkte, også når det blev skrevet i Samtale. Skift til Byg medtager idéen og tidligere svar. Enter sender; Shift+Enter giver en ny linje.
- Accepteret modelsamtykke genbruges ved fortsættelse og skift af arbejdsmåde. Ændret model, modtager, vilkår eller private referencer kræver fortsat gennemgang. Projektets fil- og kommandotilladelser kan ses og fjernes.
- Udgivelsesflowet har tilbageveje, synlig arbejdsstatus og mulighed for kontoskift i Komplai. Ved offentlig udgivelse står det præcise appnavn ved bekræftelsesfeltet. Promte-konvertering går til Byg. Featurekontakter og informationsknapper har adskilte klikområder.
- Lokal forhåndsvisning genkender flere projekttyper og bevarer projektets browserlager. En vellykket lokal bygning beviser ikke i sig selv, at appens eksterne login og data fungerer hos en anden udbyder.

## Evidens

**Skrevet** betyder, at ændringen findes i arbejdsområdet. **Unit-testet** betyder, at afgrænsede kodeprøver består. **Kørt med reelt materiale** betyder, at den nævnte app, motor eller faktiske projektkopi er kørt. Kontrollerede servere er altid angivet. **Udgivet og observeret** kræver særskilt installations- og tjenestekontrol; ingen ændring i denne milepæl har nået det trin.

| Område | Nået trin | Faktisk prøve og afgrænsning |
|---|---|---|
| Flere projekter, modeller og afslutning | Kørt med reelt materiale | Rigtig Electron og OpenCode, tre samtidige projekter, modelvalg, baggrundssvar, sammenfatning og afslutning uden idle-events. Lokale kontrollerede modeller; ingen ekstern AI. |
| Samtale → Byg | Kørt med reelt materiale | Tidligere idé med i faktiske modelrequests. Et konkret samtaleforslag går direkte til bygning uden ekstra planrequest. |
| Kommandoisolation | Kørt med reelt materiale | Rigtig OpenCode-plugin og macOS-isolation, herunder automatisk bash uden modelcredentials. Separate prøver af npm-installation, underprocesser, symbolske links og adgang uden for projektet. |
| Skrivefelt, ny projektidé og kontoskift | Kørt med reelt materiale | Electron med kontrollerede model- og provideradaptere: Enter, Shift+Enter, Cmd/Ctrl+Enter, tekstkomposition, samtykke, Byg-kladde, Promte-konvertering og Komplai A → logud → B. Sidste prøve inkluderer plan-loop og synligt appnavn med specialtegn samt forkert/korrekt bekræftelse. |
| Udgivelsesdialoger | Kørt med reelt materiale | 21 skærme gennem Electron med kontrollerede udbydersvar. Forberedelse, bygning og upload viser spinner; fejl og tilbageveje afprøvet. Intet overløb ved 980 × 720 og 150 % zoom. |
| Komplai → Azure | Kørt med reelt materiale | Komplai-kvittering → Konto og adgang → Log ud → Tilbage → Azure samt Udgiv et andet sted → Azure. Den gamle kvittering, adresse og gemte destination bevares. Kontrolleret udbydergrænse; ingen rigtig kontoændring. |
| Promte-login og preview-adgang | Kørt med reelt materiale | Rigtig loginbackend, krypteret lager, proxy og IPC med kontrolleret browser/HTTP. Sent login A kan ikke erstatte B; logud afviser cached adgang før netkald. Testside, ikke det officielle appbibliotek. |
| Vite 5 og native Rollup på Mac | Kørt med reelt materiale | Den installerede Nodes signeringsfejl og Vites CJS-fejl er reproduceret i kopier. Node-kopi med særskilt entitlement indlæser Rollup; rettet runner serverer app og kompileret JSX. Kun ad hoc-signering af kopien. |
| Promte-projektets npm-konflikt | Kørt med reelt materiale | Faktisk ERESOLVE reproduceret; den afgrænsede installationspolicy bygger den virkelige projektkopi med Vite og 15 cachede pakker. Ingen upload. Promte-login og data er stadig afhængige af Promte. |
| Skærmgennemgang | Kørt med reelt materiale | 41 skærme målt i Electron, ingen sidefejl. Skærmbilleder gennemgået. Tre versionsskærme udeladt for at undgå Git-skrivninger. Ingen observation med ny testperson. |
| Windows og andre maskiner | Unit-testet, ikke platformsafprøvet | Understøttelse og gamle indstillinger afprøves med simuleret platform. Det erstatter ikke installation, opdatering, nøglering, virksomhedsnetværk eller modelkald på en rigtig Windows-maskine. |

Den sidste samlede kildeprøve bestod med 80 målrettede tests og 13 forløb gennem rigtig Electron/OpenCode, herunder automatisk filændring, husket præcis kommando med bred automatisk kørsel slået fra og forsinket IPC-svar under projektskift. Der var 23 kontrollerede modelrequests og ingen fejl. Windows-forløbet er en simulation med gamle forbindelser og workspace-v1, ikke en platformsprøve.

Første lokale pakning afslørede, at electron-builder flyttede to SDK-afhængigheder, så den eksterne agentmotor ikke kunne læse dem uden for apparkivet. Pakkereglerne er rettet og unit-testet. Den nye pakkes eksterne resolver og hele motorforløbet består: 14 kontroller, 23 lokale modelrequests og ingen fejl. Det inkluderer samme 13 kildeforløb, faktisk kommandoisolation, automatisk filadgang og en præcis husket kommando med bred automatisk kørsel slået fra.

Diagnostikpakken ligger lokalt i `/private/tmp/aura-0.6-lokalpakke.w2pOWk/mac-arm64/Aura.app`. Den er bygget fra arbejdsområdet med `--dir`, uden Developer ID-signering, notarisation eller installation. 114 appfiler, 32 profilfiler, direkte runtimeafhængigheder og runtime-låseoplysninger matcher kilden. Pakken har ingen `app-update.yml`, og releasekontrollen kan derfor ikke bestå som for en distributionspakke. Det er en kontrol af den lokale pakke, ikke af CI, opdateringsmekanismen eller en offentlig release.

Den særskilte `verify-package.cjs` bestod også: pakket opstart med isolerede brugerdata og begrænset PATH, medfølgende OpenCode/Git/Node/npm, faktiske filer fra projektfunktionen og rigtig forhåndsvisning. Prøven opretter ingen Git-historik og afprøver derfor ikke automatisk versionsgemning eller Gem version. Resultatet og skærmbilledet ligger i `harness-package-yGbrti` i testmaskinens midlertidige mappe.

## Reproducerbare prøver

Kør fra `desktop/` med den medfølgende Node-version. Electron-prøver åbner appvinduer og bruger nye midlertidige datamapper. De ændrer ikke den installerede Aura eller rigtige brugerprojekter. De relevante scripts blokerer Git-skrivninger.

```bash
node scripts/verify-multi-project.cjs
node scripts/verify-composer-actions.cjs
node scripts/verify-deployment.cjs
node scripts/verify-publishing-switch.cjs
node scripts/verify-promte-preview.cjs
node scripts/verify-komplai-preview.cjs
AURA_MEASURE_NO_GIT=1 node scripts/measure-screens.cjs /private/tmp/aura-skaerme
```

`verify-native-runtime.cjs` og `verify-promte-build.cjs` tager eksplicitte projekt-/appstier og arbejder i nye kopier. De faktiske inddata skal læses først. Kør ikke alle gamle testfiler ukritisk: nogle historiske fixtures opretter Git-commits og hører ikke til denne prøvekørsel.

Lokale rapporter fra de gennemførte prøver findes i testmaskinens midlertidige mappe:

- `aura-flere-projekter-DhiW1L/rapport.json`: sidste samlede kildeprøve, 13 forløb, 23 modelrequests, ingen fejl.
- `aura-flere-projekter-FZVrc3/rapport.json`: pakket app, 14 kontroller, 23 modelrequests, ingen fejl.
- `aura-skrivefelt-lH6DEE`: sidste skrivefelt-, plan-, navnebekræftelses- og kontoprøve; 9 forberedelser og 8 afsendelser.
- `aura-del-cloud-QEgQeg`: 21 udgivelsesskærme, herunder mindre vindue, forstørret tekst, status og fejlgendannelse.
- `aura-udbyderskift-q0TRSw/rapport.json`: begge veje fra en eksisterende Komplai-udgivelse til Azure; den tidligere kvittering bevares.
- `aura-promte-preview-HUqVmZ/rapport.json`: login, kontoskift, sene svar og logud gennem den rigtige backend.
- `aura-native-runtime-hAOsZD/rapport.json`: native signeringsfejl og Vite 5-regression.
- `aura-promte-byg-kfjxWB/rapport.json`: faktisk ERESOLVE før rettelsen og vellykket bygning efter.
- `/private/tmp/aura-0.6-after-no-git/maalinger.json`: 41 skærme, 0 sidefejl. Ingen fuld førmåling; tallene er ikke en før/efter-sammenligning.

Rapporterne er lokale prøveresultater og distribueres ikke med appen.

## Kompatibilitet og udgivelsesgrænser

- React med Vite og statisk Astro kan ende som browserfiler til Komplai Run. SSR, Python-servere, databaser og baggrundsjob bliver ikke til browserfiler af den grund. Den nuværende Komplai-integration starter ingen Python-server.
- Automatisk kommandokørsel kræver understøttet OS-isolation. Uden understøttelse kræver kommandoer enkeltgodkendelse; tidligere gemte regler må ikke blokere almindelige byggeopgaver eller give automatisk adgang. Et udtrykkeligt valg af bred automatisk kommandokørsel afvises, når isolation mangler.
- App-ID, datamappens identitet og nøglelager ændres ikke. Gamle indstillinger får ikke automatisk bredere tilladelser. Dette er ikke en garanti for fejlfrie opdateringer på uprøvede maskiner.
- Kommunernes Promte-værter og loginrettigheder er uændrede. Der er ikke gennemført en ny offentlig udgivelse hos Promte, Komplai eller andre udbydere i disse prøver.
- Ingen Git-commit, push, workflow, notarisation eller offentlig release er udført. Nye filer skal med i brugerens gennemgang og commit, før en Git-baseret pakning kan indeholde dem. En lokal pakke alene validerer ikke et senere CI-byg.
