# Teststatus før invitation

Senest kontrolleret 7. oktober 2026. Afsnittene er daterede, så tidligere begrænsninger kan læses i deres sammenhæng. Dette er status for den aktuelle arbejdsmappe, ikke en erklæring om, at alle installationsfiler eller modeller er klar. Der er ikke committet eller pushet i dette repository under denne gennemgang.

## Samtidige opgaver og indfletning · 7. oktober 2026

Anden del (6B) af sjette milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet fra kildekoden på macOS arm64 med Electron 44.4.4 og OpenCode 1.18.33. Git-versionerne i prøverne er oprettet i midlertidige testprojekter.

- **Skrevet:** samtalekopier med eget arbejdsområde, motor, kode, ændringer og preview; indfletning gennem den eksisterende trevejsfletning og gendannelsesjournal. Kopier laves fra de aktuelle filer og bruger filkloner, hvor filsystemet understøtter det. Ingen Git-worktrees eller grene oprettes.
- **Enhedstestet:** 201 tests består i en samlet, sekventiel kørsel med den fastlåste Node 22.23.3. De nye og udvidede prøver bruger faktiske filer og dækker:
  - ugemte filer, udeladelse af `.git` og nøglefiler, kopiens selvstændige indhold og interne pakkelinks, som peger på kopiens egne pakker;
  - indfletning af forskellige linjer, konflikt ved samme linjer, nye og slettede filer og binære billedfiler;
  - afvisning af ændret kildekopi, projektfiler eller journalgrundlag efter gennemgangen, og konkrete beskyttede filstier og symbolske links;
  - automatiske versioner før og efter indfletning i testprojektet, og ingen automatisk version, når funktionen er slået fra;
  - Fortryd, der bevarer senere brugerrettelser, viser konflikt ved samme linjer og registrerer binære ændringer korrekt;
  - Stop under opstart og samtykkegemning, afvisning af dobbelt Send og reservation under afsendelse; et samtidigt idle-signal under abort må ikke frigive mappen eller vise Stoppet, mens versionen stadig gemmes;
  - genåbning, bevarelse af uflettet materiale ved fejl i registrering, papirkurv eller et forsvundet manifest, og oprydning af afsluttede kopier og dokumenterede afbrudte oprettelser.
- **Kørt mod rigtigt materiale i Electron:** `test:concurrent` består med 12 delprøver for både Vite 8.3.1 og Astro 7.3.5. Prøverne bruger rigtige OpenCode-motorer, faktiske projektfiler og en kontrolleret lokal modelserver. Forløbene er:
  1. To motorer venter samtidigt på hver sin godkendelse. Filens omfang er kopien, `.env` er udeladt, og en ukendt samtale samt `.env`, `.git/config` og `../udenfor.txt` afvises gennem appens API.
  2. Kode og preview følger kopien. Indtastede formularværdier bevares ved samtaleskift. Indfletning afvises, mens projektets opgave arbejder.
  3. En tredje samtale arbejder i en anden kopi, mens en færdig kopi flettes ind. Kun projektet og kildekopien skal være ledige; den tredje motor fortsætter.
  4. Indfletning bevarer projektets øvrige linje, medtager en billedfil og rydder den afsluttede kopi.
  5. Fortryd virker uden Git fra resultatkortet og Versioner; en senere brugerrettelse bevares, og billedfilen fjernes og står som slettet under Ændringer. Et ældre resultatkort afvises, når en senere handling har afløst journalen.
  6. Stop rammer den valgte samtale. Ved konflikt viser gennemgangen begge linjer og vælger brugerens linjer som standard.
  7. En uflettet kopi genåbnes efter genstart. Ved 980 × 720 og 150 % zoom er der ingen vandret siderulning. Tastaturet åbner indfletningen, bekræftelsen er synlig, og Escape giver fokus tilbage. Reduceret bevægelse afprøves.
  8. Annulleret sletning bevarer kopien. Bekræftet sletning advarer om tab af uflettede ændringer og fjerner den.
  9. Rettelser fra en kopi, hvor frameworkets server har kørt, flettes ind; kun kopiens server stoppes. Ved 980 × 720 og 150 % zoom kan Send stadig ses og rammes med markøren, også med statusbeskeden synlig.
  10. Automatiske versioner gemmer først en faktisk ugemt brugerrettelse og derefter indfletningen. Begge versioner har billeder. Den flettede versions før/efter-par har samme side og størrelse og findes også under samtalens ændringer. Billederne er set efter kørsel og viser projektet før og det faktisk flettede projekt efter.
  11. Projekt og kopi bruger forskellige serverporte og viser forskelligt faktisk indhold. Sletning stopper kopiens server og bevarer projektets. Browserens `securitypolicyviolation` beviser, at `connect-src` afviser WebSocket til den anden server.
  12. Stop under opstart bliver ved med at vise Stoppet og vises ikke som en fejl.
- **Fundet og rettet under afprøvningen:** Send holdt først en global lås og blokerede et samtaleskift under motoropstart. Pakkeindhold under `node_modules/**/dist` blev udeladt, så Vite ikke kunne starte i kopien. Genåbning kunne overtage startsiden efter brugerens navigation. Indfletningsknappen ventede på uvedkommende kopier. En statusbesked dækkede Send. Beskeder har nu egen plads i skærmen. Fortryd bruger både før- og efterindhold, så senere brugerrettelser bevares, og binære filer vises uden opdigtet linje-diff.
- **Afslutning og fokus:** Stop og agentens idle-hændelse kunne afslutte samme opgave hver for sig og vise Stoppet, mens en version stadig blev gemt. Stop ejer nu afslutningen. En rettelse efter Stop forbliver ugemt frem til indfletningens egen versionsgemning; det er kontrolleret med rigtig OpenCode og Git. En sen filindlæsning ved samtaleskift må heller ikke flytte fokus fra indfletningsknappen. Prøven forsinker rendererens afslutning efter den faktiske indlæsning og kontrollerer brugerens fokus. Tastaturprøven venter på en aktiveret knap, før den sender Enter.
- **Gennemgangens forklaringer:** Det foldede afsnit siger, at kopiens forhåndsvisning afsluttes, og at en kørende projektvisning bevares. Uden automatisk version henviser det til Fortryd på resultatkortet. Mangler enten projektets eller kopiens billede, står det i selve gennemgangen. Prøven tæller de synlige billeder og kræver, at kontrollen af ét billede faktisk er udløst; en første testversion søgte i en forkert beholder og blev afvist af denne slutkontrol.
- **Genstart med manglende kopidata:** Astro-prøven flytter kopiens manifest til side mellem to opstarter. Den rigtige app viser, at kopien ikke kan læses, og bevarer dens faktiske filer. Efter manifestet lægges tilbage, genåbnes kopien og resten af forløbet gennemføres. Et manglende manifest giver ikke i sig selv tilladelse til oprydning.
- **Testværktøjer og installation:** Playwrights fastlåste `waitForFunction` gentager ikke en asynkron betingelse, der returnerer `false`; billedprøven venter derfor på de faktiske IPC-svar i en løkke. En tidligere frameworkinstallation havde en afkortet native pakke og kunne ikke starte Vite. Kun `node_modules` i dokumenterede, afsluttede testmapper blev ryddet; projektfiler, historik, logs og billeder blev bevaret. En ny installation bestod preview-prøvens 13 delprøver med rigtige React/Vite- og Astro-servere.

- **Samlet kørsel:** Alle 21 Electron-prøver samt Astro-varianten består sekventielt. Det omfatter `concurrent`, `preview-edit`, `history`, `versions`, `chats`, `agent`, `approvals`, `chat`, `workspace`, `planning`, `preferences`, `frameworks`, `resume`, `recovery`, `desktop`, `setup`, `introduction`, `features`, `hosting`, `deployment` og `tools`. Delingsprøverne bruger simulerede tjenester og nye lokale Git-repositories; ingen ekstern publicering eller deploy er udført.
  - Efter de sidste tekstændringer er Vite- og Astro-indfletningens 12 delprøver samt historikkens 9 delprøver gentaget og bestået. I begge indfletningsprøver er kontrollen af ét billede uden modstykke faktisk udløst én gang.
- **Målt:** Den faste målesuites 44 skærme går fra 3.198 til 3.222 synlige ord med uændret 267 valg, 51 ⓘ og 22 felter. Klik pr. opgave er uændret: AI-forbindelse 5, idé til udkast 6, tekstrettelse 4 og Fortryd 2. Ingen sidefejl. Førmålingen er kørt på den committede 6A-kildekode; eftermålingen på denne arbejdsmappe.
  - Kopiernes nye tilstande måles desuden særskilt i begge frameworkforløb. Kopikortet har 16 ord og 2 valg; en ren indfletning med en billedfil har 40 ord og 3 valg. Konfliktgennemgangen har 56 ord og 6 kontroller: to linjevalg, bekræftelse, annullering og to afsnit, som kan foldes ud.
  - En indfletning ved 980 × 720 med kun kopiens billede har 35 ord og 3 valg, inklusive den nye forklaring af det manglende projektbillede.
  - Ved 980 × 720 og 150 % zoom er tekst, fokus og bekræftelsen set i billeder direkte fra Electron-vinduet. Statusbeskeden har egen plads, og Send er både synlig og ramt i en faktisk kontrol af elementet under markøren. Versionsbillederne er set som gemte JPEG-filer.
- **Lokal evidens:** Enhedskørsel i `/private/tmp/aura-6b-unit-final.log`; den samlede Electron-kørsel og målingen i `/private/tmp/aura-6b-validated/`; de gentagne forløb efter tekstændringerne i `/private/tmp/aura-6b-review-validated/`; før/efter-tal og skærmbilleder i `/private/tmp/aura-6b-measure-before/` og `/private/tmp/aura-6b-measure-validated/`. Frameworkprøvernes logs angiver mapperne med deres faktiske projektfiler, native skærmbilleder og før/efter-JPEG. De seneste frameworkmaterialer bevares med pakker; installerede pakker fra ældre, afsluttede prøver er ryddet med projektfiler, Git-historik, logs og billeder bevaret. Prøverne kan gentages med kommandoerne i [desktopvejledningen](../desktop/README.md).

**Ikke deployet eller observeret i en udgivelse.** Modelsvarene er kontrollerede; ingen rigtig model eller modelbetaling er brugt. Native dialogers svar er simulerede. Ikke afprøvet med en person uden udviklererfaring, VoiceOver, Windows/Linux, en pakket app eller mange store projekter. Kopier er separate arbejdsmapper; godkendte kommandoer har fortsat brugerens OS-rettigheder. Filer, som ikke kan gennemgås sikkert inden for størrelsesgrænserne, afviser indfletningen og bevarer kopien. En uflettet kopi bruger lokal lagerplads, indtil den flettes eller slettes efter bekræftelse.

## Samtaler, kommandopalet og eksempler · 6. oktober 2026

Første del (6A) af sjette milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33. Der er ikke committet eller pushet i dette repository.

- **Enhedstestet:** 190 automatiske tests består, når testfilerne køres én ad gangen. De nye og omskrevne dækker:
  - samtalefiler: genåbning af kladde, plan og samtale, afbrudt opgave, adskilte projekter og samtaler, grænsen på 200 beskeder og bevarelse af en beskadiget samtalefil;
  - flytning af en ældre samtale og arkiverede samtaler til samtalefiler, med bevaret brief, gendannelsesmarkør og uændret arkiv;
  - en tom samtale genbruges, en samtale med kladde gør ikke, navne efter første besked eller kladden, omdøbning og sletning gennem papirkurven;
  - redning efter en beskadiget projektfil: filen lægges til side, og samtalerne findes igen;
  - to samtaler i samme projekt: kun én arbejder ad gangen, den anden afvises med samtalens navn, godkendelser og spørgsmål går til den rigtige samtale, og sidepanelet får status samlet;
  - AI-sessionen fortsættes med samme regler og ikke med andre, og motoren sender aldrig en usikker sessions-id videre;
  - Ændringer og Aktivitet bevares pr. samtale, når projektet genåbnes, fx efter en gendannelse.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:chats` bruger den rigtige OpenCode-motor, rigtige projektfiler og en kontrolleret modelserver. Prøven har 10 delprøver:
  1. Eksempler på idéer udfylder idé og navn og skjules, når feltet har tekst.
  2. Paletten viser ikke handlinger fra funktioner, der er slået fra, og giver fokus tilbage efter Escape.
  3. En ny samtale åbnes, mens en anden venter på godkendelse; sidepanelet viser "venter på dig", og Send venter med navnet på den anden samtale.
  4. Paletten finder samtalen ved søgning og skifter med Enter; godkendelsen står i den rigtige samtale.
  5. En samtale arbejder i baggrunden med egen status og eget svar, et andet projekt kan ikke åbnes imens, og "nyt resultat" markeres og forsvinder ved åbning.
  6. Piletaster, Enter og ⌘K virker; genvejen virker også med fokus i forhåndsvisningen (sendt gennem browserens tastaturvej).
  7. Omdøb og slet fra samtalens menu; den slettede samtalefil sendes til papirkurven.
  8. Efter genstart åbnes samme samtale, og AI-sessionen fortsætter: modellen får samtalens tidligere beskeder.
  9. Et projekt fra før samtalerne får sin samtale og sit arkiv som samtaler; arkivfilerne er uændrede.
  10. 980 × 720, 150 % zoom og reduceret bevægelse.
- **Fundet og rettet under afprøvningen:**
  - Efter Stop og Fejl viste status "Klar", fordi status blev skrevet om, når samtalerne blev opdateret. En samtale viser nu sin egen seneste status.
  - En kladde skrevet lige før lukning gik tabt, fordi den hurtige lokale kopi blev gemt under den gamle nøgle uden samtale. En ikke-gemt kladde fra en ældre version flyttes til den første samtale, der åbnes.
  - Ændringer og Aktivitet forsvandt, når projektet blev genåbnet efter en gendannelse; "Filerne er sat tilbage" blev ikke logget. De ligger nu hos arbejdsbænken pr. samtale.
  - Ventelinjen nævnte altid "Ny samtale" og pressede skrivefeltets værktøjslinje sammen; den har nu samtalens navn og sin egen linje.
  - Samtalenavne blev skåret ned til to bogstaver ved siden af status; status står nu under navnet. Projektlisten havde et hul og stod i forkert rækkefølge.
  - Paletten gav fokus tilbage for sent og tog det fra den fane, handlingen flyttede til; uden projekt viste den kun én handling.
  - `Workbench.close()` ryddede samtalerne, så arbejdsbænken ikke kunne bruges videre i samme projekt. Den lukker nu kun motorerne.
- **Kørsler:** Alle 20 Electron-prøver består i én samlet kørsel. `test:resume` og `test:agent` er tilpasset sidepanelet og samtalerne. Hjælpefunktionen til AI-forbindelser venter nu på, at dialogen står stille, før den klikker; et klik under dialogens animation ramte ikke knappen i 1 af 13 forsøg. To fejl i en tidligere samlet kørsel skyldtes, at enhedstestene kørte samtidig.
- **Målt:** 3.197 synlige ord, 267 valg og 51 ⓘ på 44 skærme mod 2.995, 244 og 50 på 41 skærme efter milepæl 5. Klik pr. opgave er uændret, og der er ingen sidefejl.
  - Nye skærme: sidepanelet med projekter og samtaler (44 ord og 13 valg med sidepanelets faste knapper og links, målt med to samtaler), kommandopaletten (34 ord) og eksemplerne på idéer (3 valg bag ét link).
  - "Hvad vil du bygge?" har ét valg mere: linket til eksemplerne.
  - "Fortryd opgaven" siger nu, når Aura ikke har et billede fra før opgaven.

Ikke afprøvet:
- En rigtig model og en person uden teknisk baggrund.
- Skærmlæser (VoiceOver), Windows, Ctrl+K på Windows og Linux og en pakket app.
- Mange samtaler i ét projekt; sidepanelet viser seks og "Vis alle".

Kendte begrænsninger:
- Kun én samtale ad gangen kan arbejde i et projekt. Samtidige opgaver i hver sin kopi kommer i 6B.
- Ændringer og Aktivitet huskes for de otte senest brugte samtaler, så længe appen er åben.
- En samtale, der arbejder, kan ikke slettes, og et andet projekt kan ikke åbnes, før den er færdig.

## Visuel historik · 6. oktober 2026

Femte milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33. Git-versionerne i prøverne er oprettet i nye midlertidige projekter; der er ikke committet eller pushet i dette repository.

- **Fundet i Electron og brugt:** Et skjult vindue med offscreen-gengivelse kan tage et billede af forhåndsvisningen uden at vise det og uafhængigt af, hvilken fane brugeren ser. Det tog under ét sekund pr. billede. Vinduet har sin egen session uden lagring, og sidens indholdspolitik med sandbox gælder også dér.
- **Enhedstestet:** 182 automatiske tests består, når testfilerne køres én ad gangen. De 6 nye dækker:
  - fletningen: kun ændringen fjernes, brugerens senere rettelser bevares byte for byte med linjeskift, og ændringer af samme linjer er konflikter;
  - versionernes typer og navne og omdøbning, der ikke ændrer Git;
  - Fortryd af en gemt version med en senere version og en ugemt rettelse, en konflikt med brugerens valg, og at den første version ikke kan fortrydes;
  - Fortryd uden Git med kopi, valg ved en slettet fil og afvisning, når filen ændres mellem gennemgang og udførelse;
  - at en versions binære filer ikke vises;
  - billedernes par, binding til en version, før-billede fra samme visning og oprydning efter 80.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:history` bruger den rigtige OpenCode-motor, nye projekter med og uden Git og en kontrolleret modelserver med faste svar. Prøven har 9 delprøver:
  1. Versionen efter en AI-opgave hedder det, brugeren bad om, har type og tid og et billede af forhåndsvisningen.
  2. En version viser billede, filer og linje-diff; omdøbning gemmes i Aura, og Git-beskeden er uændret.
  3. En opgave får billeder før og efter af samme side i samme størrelse, både i versionen og under Denne samtale.
  4. Fortryd opgaven fjerner kun opgavens ændring og bevarer brugerens senere rettelse i samme fil. Rettelsen gemmes først som versionen "Dine ændringer før fortrydelsen".
  5. Ved en konflikt viser gennemgangen begge linjer, dine linjer er valgt som standard, og brugerens valg bruges.
  6. Gå tilbage hertil gemmer først en ugemt ændring som en version og bringer den ældre version tilbage som en ny version.
  7. Billederne ligger i appens data, ikke i projektet; billedvinduets session gemmer intet på disken, og vinduet lukkes igen.
  8. Versioner ved 980 × 720 og 150 % tekst uden vandret rulning; tastaturet åbner en version, og fokus føres tilbage.
  9. Uden Git fortrydes en opgave fra Auras øjebliksbillede med brugerens rettelse bevaret, og fortrydelsen kan selv fortrydes.
- **Fundet og rettet under afprøvningen:**
  - En gendannelse fik samme navn som den version, den gik tilbage til. Den hedder nu "Tilbage til »…«".
  - Fanen Ændringer kunne skifte tilbage fra Versioner, fordi den indlæste samtalens ændringer samtidig.
  - Konfliktvalgene var fuld bredde på grund af appens regel for felter.
  - Electron-prøverne valgte appens vindue som det første vindue. Mens Aura tager et billede, findes billedvinduet også, og en prøve hang i 12 minutter. Prøverne vælger nu appens vindue ud fra adressen.
- **Kørsler:** Alle 19 Electron-prøver består. `test:chat` fejlede først, fordi fanen Ændringer nu husker visningen Versioner; prøven vælger Denne samtale. `test:versions`, `test:recovery`, `test:chat`, `test:hosting` og `test:package` er tilpasset, fordi dialogen Versioner er erstattet af visningen under Ændringer.
- **Målt:** 2.995 synlige ord, 244 valg og 50 ⓘ på 41 skærme mod 2.776, 235 og 49 på 40 skærme efter milepæl 4. Klik pr. opgave er uændret, og der er ingen sidefejl.
  - Gennemgangen før Fortryd opgaven gik fra 36 til 18 ord med samme 3 valg; hvad der ellers berøres, er foldet sammen.
  - Versioner gik fra 50 til 71 ord og fra 6 til 5 valg: navne og typer er længere end de gamle tidspunkter, og hver version er ét valg.
  - Ny skærm: én version med billeder, to veje tilbage og filerne (174 ord inklusive linje-diff'en, 9 valg).
  - Ændringer har 2 valg mere for Denne samtale og Versioner.

Ikke afprøvet:
- En rigtig model og en person uden teknisk baggrund.
- Billeder af en Vite- eller Astro-forhåndsvisning før og efter en opgave; koden er den samme, men det er kun kørt med statisk HTML.
- Fletning af store filer med mange ændringer; algoritmen falder tilbage til at erstatte hele filen, når forskellen er meget stor.
- Skærmlæser (VoiceOver), Windows og en pakket app.

Kendte begrænsninger:
- Efter en gendannelse stoppes en Vite- eller Astro-server, som før denne milepæl. Så tages intet billede efter, før serveren er startet igen.
- Navne og billeder gemmes kun i Aura på denne computer. Flyttes projektet til en anden computer, har versionerne deres oprindelige navne og ingen billeder.

## Rettelser i forhåndsvisningen · 6. oktober 2026

Fjerde milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33, React 19.3.0, Vite 8.3.1 og Astro 7.3.5. Der er ikke committet eller pushet.

- **Fundet i Electron og brugt:** Hovedprocessen kan køre et script i forhåndsvisningens ramme, også når rammen er sandboxet og kører i sin egen proces, og scriptet kan levere brugerens valg tilbage som data. Scriptet kører i sidens egen verden; Electron tilbyder ingen isoleret verden for en underramme. Sandbox, indholdspolitik og netværksregler er ikke ændret, og siden får ingen preload eller IPC.
- **Enhedstestet:** 176 automatiske tests består, når testfilerne køres én ad gangen. De 10 nye dækker:
  - at sidens tekst findes i koden trods linjeskift, indrykning og HTML-tegnkoder;
  - at kommentarer, scripts, installerede pakker, build-mapper, `.env`, `secrets` og filer med mulige nøgler ikke er med i søgningen;
  - valget af kilde: én forekomst på den viste side, ellers i projektet, ellers i det rette tag, og ellers ingen;
  - hvordan den nye tekst skrives i HTML, JSX, Astro og Markdown, og hvornår Aura overlader den til AI'en;
  - rensning af data fra siden og en mulig nøgle i siden;
  - tekstrettelse, der kun ændrer teksten, og Fortryd byte for byte, også når filen er ændret siden;
  - Fortryd af en AI-opgave uden version: ny fil slettes, slettet fil kommer igen, beskyttede stier og stier uden for projektet afvises;
  - at en fil, Aura kun kunne læse før eller efter en opgave, ikke står som ny eller slettet.
  Køres alle testfiler samtidig, fejler 5 eksisterende tests med tidsgrænser for opstart af Node og motoren, mens computeren var travl (backup og macOS' programkontrol). De består alle, når de køres én ad gangen.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:preview-edit` bruger den rigtige OpenCode-motor, rigtige projektfiler i en midlertidig mappe uden Git og en kontrolleret modelserver med faste svar. React og Astro kører med rigtige pakker og deres egen udviklingsserver. Prøven har 13 delprøver:
  1. Ret i siden er slået fra fra start, og intet er indsat i siden.
  2. Slået til: sandbox og indholdspolitik er uændrede, siden har ingen adgang til Aura, og valgscriptets nøgle kan ikke tælles op.
  3. Sidens knap og link reagerer ikke, mens man vælger. Kortet viser navn, tekst og linjen i koden.
  4. Tekstrettelsen ændrer kun teksten i filen, ses i forhåndsvisningen (efter ca. 0,8 s), står under Ændringer som din og i Aktivitet, og Fortryd giver filen byte for byte tilbage.
  5. Kontrollen siger det, når forhåndsvisningen ikke viser rettelsen; her skriver sidens eget script teksten tilbage.
  6. Flere forekomster, et element med andre elementer og en mulig nøgle i siden rettes ikke direkte; kortet siger hvorfor.
  7. Tastatur: Escape afslutter og fjerner scriptet, Enter slår til, pil ned og Enter vælger, og fokus flytter til kortet.
  8. Efter genindlæsning kan man stadig vælge.
  9. Målrettet AI-ændring: målet står over skrivefeltet, i Før du sender, i beskeden til modellen, i samtalen og på resultatkortet. Den mulige nøgle og den statiske servers nøgle i adressen sendes ikke.
  10. Fortryd opgaven uden version sætter filen tilbage og kan ikke gentages.
  11. 980 × 720 uden vandret rulning; kortet og knappen står i panelet ved 125 % og 150 % tekst; valg virker i den skalerede mobilvisning; reduceret bevægelse slår kortets animation fra.
  12. React med Vite: JSX-teksten rettes i `src/App.tsx` og vises med HMR; Fortryd byte for byte; `Tilmeld {n}` rettes ikke direkte, og Reacts klik kører ikke, mens man vælger.
  13. Astro: overskriften rettes i `src/pages/index.astro` med `&` som HTML-tegnkode; tekst med en variabel rettes ikke direkte.
- **Fundet og rettet under afprøvningen:**
  - Den statiske forhåndsvisning opdagede ikke en rettelse, der kom, før dens første kontrol af filerne var færdig. Kortets kontrol sagde det korrekt. Aura genindlæser nu selv siden efter en rettelse og en fortrydelse.
  - Målingen viste, at resultatkortet efter første udkast kunne sige, at forhåndsvisningen ikke kørte, fordi den statiske server først starter, når den nye side er opdaget. Kontrollen spørger nu efter den nye forhåndsvisning først. Fejlen fandtes før milepælen; i milepæl 3's måling startede forhåndsvisningen tilfældigvis først.
  - Astros udviklerværktøj lægger sine egne elementer i siden. Vælges det, står det som Element og kan kun ændres af AI'en.
- **Kørsler:** Alle 18 Electron-prøver består, også de 17 fra tidligere milepæle. `test:frameworks` fejlede én gang, fordi et skærmbillede i Playwright ikke blev taget inden for 20 sekunder; den bestod ved næste kørsel. Valget i den nedskalerede mobilvisning fejlede først, fordi Playwright regner klik forkert i en skaleret ramme i en anden proces. Prøven klikker nu med musen på det sted, knappen ses, og det virker.
- **Målt:** 2.776 synlige ord, 235 valg og 49 ⓘ på 40 skærme mod 2.651, 218 og 48 på 36 skærme efter milepæl 3. Ingen sidefejl.
  - Fire nye skærme: Ret i siden (38 ord, 4 valg, 1 ⓘ), valgt element (15 ord, 4 valg inkl. luk og filnavnet), ny tekst (13 ord) og rettet med Fortryd (16 ord, 3 valg).
  - Ret en tekst i siden tager 4 klik: Ret i siden, elementet, Ret teksten og Gem.
  - Ændringer og Aktivitet har flere ord og valg, fordi målingens rettelse og fortrydelse står der.
  - Arbejdsområdet og resultatkortet er uændrede. Ret i siden er skjult, indtil der er en side.

Ikke afprøvet:
- En rigtig model, der får et mål fra forhåndsvisningen.
- Vue og Svelte; reglerne for filtyperne er kun enhedstestet.
- Komponenter med egen shadow DOM og sider med meget store DOM-træer.
- Skærmlæser (VoiceOver), Windows, en pakket app og en person uden teknisk baggrund.

Kendte begrænsninger:
- Fortryd for en tekstrettelse står på kortet, indtil man vælger et nyt element. Derefter er Versioner vejen tilbage, når projektet har dem.
- Sidens eget script kan se markeringen og kalde valgscriptet, mens Ret i siden er slået til. Det, siden sender, renses og vises, før noget ændres eller sendes.

## Godkendelser og fejl · 6. oktober 2026

Tredje milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33. Der er ikke committet eller pushet.

- **Fundet i OpenCode og brugt:** En afvisning med en besked giver AI'en beskeden som rettelse, og opgaven fortsætter. En afvisning uden besked stopper opgaven. En filgodkendelse har ændringen med som diff, og kommandoens afslutningskode ligger i `metadata.exit`. Electron opfanger konsolfejl og HTTP-status fra previewets ramme; det er afprøvet med en bevidst fejl i en side.
- **Enhedstestet:** 166 automatiske tests består, når testfilerne køres én ad gangen. De 5 nye dækker:
  - diff fra OpenCode med linjenumre;
  - kommandogæt og afslutningskoder;
  - fejltyper fra modelserveren for HTTP 401, 402, 403, 404, 429, 400 og 503;
  - afvisning med og uden besked gennem motorens API;
  - at Stop giver et resultatkort med filer og maskeret kommando-output;
  - at godkendelsen får kommandoens mappe og begrundelse med, og at en fejl fra OpenCode får en type.
  En eksisterende prøve fangede, at den nye besked om stilstand sagde "to minutter" uanset grænsen; den beregnes nu.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:approvals` bruger den rigtige OpenCode-motor, et nyt projekt med Git i en midlertidig mappe og en kontrolleret modelserver. Modellens svar er faste testdata; kommandoerne køres rigtigt. Prøven har 8 delprøver:
  1. Filgodkendelsen viser fil, antal linjer, ændringen og omfanget, og statuslinjen siger "Venter på dig" med Vis.
  2. Kommandokortet viser kommando, AI'ens begrundelse og et gæt, uden fremhævet Tillad.
  3. Kontroller viser sidens konsolfejl fra forhåndsvisningen og kommandoens afslutningskode 1 med output.
  4. Afvis med en besked: modellen fik beskeden, og opgaven fortsatte.
  5. Afvis: opgaven stopper, og kortet siger, hvad der blev afvist.
  6. Stop: kortet viser filen, AI'en nåede, og Fortryd det, den nåede, satte den tilbage.
  7. Nøgle, kvote og afbrudt forbindelse får hver sin forklaring og handling på ét kort; der vises ingen rød linje eller advarselsboks ved siden af. Prøv igen virker.
  8. Kortet holder sig inden for samtalen ved 980 × 720.
- **Kørsler:** Alle 17 Electron-prøver bestod. `test:chat` fejlede først på den gamle tekst "Ingen kommandoer kørt"; prøven er rettet og kontrollerer nu også Auras kontrol af siden. Efter en sidste forkortelse af godkendelsens tekster er `test:approvals` og `test:chat` kørt igen og består.
- **Målt:** 2.651 synlige ord, 218 valg og 48 ⓘ på 36 skærme mod 2.582, 217 og 47 efter milepæl 2. Klik pr. opgave er uændret, og der er ingen sidefejl.
  - Godkendelse af filændringer gik fra 43 til 60 ord og fra 5 til 7 valg: Se ændringen og Afvis med en besked er nye.
  - Resultatkortet gik fra 23 til 56 ord og fra 4 til 3 valg; Kontroller er ny.
  - Aktivitet har én række mere for kontrollen.

Ikke afprøvet:
- En rigtig model, der fejler, eller som får en afvisning med besked.
- Godkendelser for hjemmesider og mapper uden for projektet i Electron; de er kun dækket af den samme kode som filer og kommandoer.
- Kontrollen af en framework-server (Vite eller Astro) efter en opgave.
- Skærmlæser (VoiceOver), Windows, en pakket app og en person uden teknisk baggrund.

## Afklaring og plan · 6. oktober 2026

Anden milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33. Der er ikke committet eller pushet.

- **Fejl fundet og rettet:** AI'en har aldrig kunnet stille spørgsmål med svarmuligheder gennem Aura.
  - OpenCode tilbyder kun spørgeværktøjet til klienterne `app`, `cli` og `desktop` eller med `OPENCODE_ENABLE_QUESTION_TOOL`. Aura melder sig som `harness`.
  - Den tidligere spørgsmålsformular var derfor kun afprøvet med en falsk motor.
  - Prøvet mod den rigtige motor med en kontrolleret modelserver: uden flaget fik modellen glob, grep, read og webfetch under planlægning; med flaget også question.
- **Enhedstestet:** 161 automatiske tests består, når testfilerne køres én ad gangen. De 8 nye dækker:
  - briefen fra idé, ønsker og svar; ugyldige linjer; AI'ens markering "(anbefalet)" kommer ikke med;
  - planens fire afsnit, også med fede eller almindelige overskrifter og en overskrift i en kodeblok;
  - AI'ens anbefalede svar først;
  - brugerens egen plan, Gendan AI'ens version og en plan, der er stoppet;
  - en afbrudt byggeopgave, hvis plan genåbnes som seneste plan og ikke kan bygges;
  - svar og Spring over gennem motorens API;
  - at motoren får spørgeværktøjet.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:planning` bruger den rigtige OpenCode-motor, et nyt projekt med Git i en midlertidig mappe og en kontrolleret modelserver, der kalder question-værktøjet. Modellens svar er faste testdata. Prøven har 11 delprøver:
  1. Idé og ønsker står i briefen; beskeden indeholder kun idéen.
  2. Modellen får spørgeværktøjet og briefen; spørgsmålet tager ikke fokus fra skrivefeltet.
  3. Tre spørgsmål vises ét ad gangen med AI'ens anbefaling først, flere valg, Tilbage, eget svar og tastatur.
  4. Svarene når modellen og briefen. Planen står under Plan i fire afsnit; AI'en skifter ikke fane.
  5. Brugeren retter briefen og planen; planen siger, at briefen er ændret bagefter.
  6. Bygning bruger den rettede plan og brief; planen står som bygget og kan bygges igen.
  7. Bed AI'en rette giver en ny plan fra AI'en.
  8. Efter Stop kan den seneste plan læses, men ikke bygges, og bliver udgangspunkt for en ny plan.
  9. Spring over lader AI'en vælge selv, og opgaven fortsætter til en plan.
  10. Brief og plan genåbnes efter genstart.
  11. Fem faner står på én linje ved 980 × 720.
- **Fundet af prøven og rettet:** Spring over afviste først spørgsmålet. OpenCode stopper så opgaven, og brugeren fik "AI'en stoppede uden et resultat". Nu svarer Spring over, at AI'en skal vælge selv. Planen stod heller ikke som bygget, før brugerfladen fik besked fra hovedprocessen.
- **Kørsler:**
  - Alle 16 Electron-prøver bestod efter ændringerne i hovedprocessen og spørgsmålene. `test:workspace` fejlede først, fordi prøven ventede fire faner; prøven er rettet.
  - Efter de sidste ændringer (neutrale eksempler på startsiden og en rolig animation i den tomme forhåndsvisning) er `test:workspace`, `test:planning`, `test:desktop`, `test:introduction` og `test:chat` kørt igen og består. De øvrige elleve er ikke kørt igen efter disse to ændringer.
  - To kørsler af `test:planning` fejlede undervejs, efter at nogen havde klikket i det synlige prøvevindue: en titel var markeret, og vinduet havde en anden størrelse.
- **Målt:** `npm run measure:screens` giver 2.582 synlige ord, 217 valg og 47 ⓘ på 36 skærme mod 2.425, 206 og 47 på 34 skærme i den committede milepæl 1, målt med samme script. Ingen sidefejl.
  - Nye skærme: Spørgsmål fra AI'en (29 ord, 4 valg) og Plan (92 ord, 6 valg).
  - Plankortet i samtalen gik fra 26 til 20 ord.
  - Fra idé til første udkast tager 6 klik mod 5, fordi målingens model nu stiller et spørgsmål, som skal besvares.
  - Aktivitet og Se alle oplysninger voksede med henholdsvis spørgsmålet og projektbriefen.

Ikke afprøvet:
- En rigtig model, der selv vælger at stille spørgsmål med question-værktøjet og skriver planen under de fire overskrifter. Instruktionerne er skrevet, men kun afprøvet med faste modelsvar.
- Skærmlæser (VoiceOver), Windows, en pakket app og en person uden teknisk baggrund.

## Arbejdsflade med fire faner · 5. oktober 2026

Første milepæl i [planen for brugerfladen](ux-plan.md). Afprøvet på Mac med OpenCode 1.18.33. Der er ikke committet eller pushet.

- **Enhedstestet:** 153 automatiske tests består, når testfilerne køres én ad gangen (`node --test --test-concurrency=1 tests/*.test.cjs`). De 16 nye dækker:
  - linje-diff: linjenumre, kontekst, sammenlægning, nye og slettede filer, CRLF og 200 tilfældige rettelser, der kan genskabes; en fuld omskrivning af 3.000 linjer går ikke i stå;
  - filbeskyttelsen med konkrete input, der afvises: `.env`, `.env.example`, `config/produktion.env`, `references/`, `secrets/`, `.secrets/`, `node_modules/`, `.git/config`, `.npmrc`, `*.pem`, `credentials.json`, `../udenfor.txt`, `public/../.env`, `/etc/passwd`, `C:/Windows/win.ini`, omvendte skråstreger, tomme led, et symbolsk link til en fil og til en mappe uden for projektet, en binær fil, en fil over 1 MB og en fil med en mulig nøgle i indholdet;
  - filhenvisninger: kun tekstfiler og linjer, der findes;
  - tilskrivning: AI'ens fil, en fil ændret af både AI'en og brugeren, en kommando og brugerens egen fil, pr. opgave og for hele samtalen;
  - aktivitet: rigtige værktøjsdele med stier i projektet, maskeret kommando-output, patchfiler og loggens grænse.
- **Kørt mod rigtigt materiale i Electron:** `npm run test:workspace` bruger den rigtige OpenCode-motor, rigtige projektfiler i en ny midlertidig mappe og en kontrolleret lokal modelserver. Modellens svar er altså faste testdata, ikke en rigtig model. Prøven har 16 delprøver:
  1. Forhåndsvisning er udgangspunktet.
  2. Kode viser filerne som skrivebeskyttet tekst; et `<script>` i filen vises som tekst og køres ikke.
  3. Hovedprocessen afviser `.env`, en privat reference, stier uden for projektet og et symbolsk link, både ved læsning og som filhenvisning.
  4. Faneskift med mus og piletaster bevarer previewets formular og rulning og beskedkladden, og fokus er synligt.
  5. Mens AI'en arbejder og venter på en godkendelse, bliver brugeren i Kode, og skrivefeltet beholder fokus.
  6. Aktivitet viser de faktiske værktøjer, godkendelser med ventetid ("Venter på dig · i 2 s" og "Du tillod den · efter …"), kommandoens rigtige output og resultatet.
  7. Ændringer viser resumé, sammenligningsgrundlag og linje-diff. En fil, prøven selv retter, mens AI'en venter, står som "En kommando eller dig", ikke som AI'ens.
  8. Stier i AI'ens svar åbner den rigtige fil og linje.
  9. En filhenvisning står i skrivefeltet og i Før du sender og når modellen som sti og linje.
  10. Stop og en fejl fra modelserveren står i Aktivitet, og beskeden bevares.
  11. En senere rettelse gør AI'ens fil til "AI'en og andre" i Hele samtalen.
  12. Ved 980 × 720 er der ingen vandret rulning, og fanerne står på én linje. Ved 125 % og 150 % tekst bryder fanerne over to linjer, men står inden for vinduet, og Send er synlig. Ved 150 % er sidepanelet foldet sammen og kan foldes ud oven på indholdet og lukkes med Escape.
  13. Sidepanelet kan foldes sammen og ud med bevarede navne, menuen står ved knappen, og valget huskes.
  14. Reduceret bevægelse slår markeringens animation fra, og aktiviteten overlever en genindlæsning af brugerfladen.
- **Kørsler:** I den samlede kørsel bestod de 14 øvrige Electron-prøver (desktop, chat, opsætning, introduktion, genoptagelse, gendannelse, versioner, funktioner, standardvalg, agent, hosting, udgivelse, værktøjer og frameworks). `test:workspace` fejlede én gang i den kørsel: Aktivitet var valgt, hvor prøven ventede Kode. Appen skifter kun fane ved et klik eller med tastaturet, og fejlen er ikke set igen i fire efterfølgende kørsler. Årsagen er ikke fundet; et klik i det synlige prøvevindue er en mulig forklaring. Efter de sidste tekstrettelser er `test:workspace`, `test:chat`, `test:versions` og `test:recovery` kørt igen og består. De øvrige ti er ikke kørt igen efter disse rettelser.
- **Set i appen:** Skærmbilleder af alle fire faner ved 1440 × 940 og 980 × 720 og ved 125 % og 150 % tekst er gennemgået. Ved zoom tages billederne med Electrons egen `capturePage`; Playwrights skærmbillede skærer billedet til, når teksten er forstørret.
- **Målt:** `npm run measure:screens` giver 2.425 synlige ord, 206 valg og 47 ⓘ på 34 skærme mod 1.980, 186 og 48 på 32 skærme før. Klik pr. opgave er uændret: 5, 5 og 2. Ingen sidefejl.
  - Kode (104 ord, 10 valg) og Aktivitet (178 ord, 2 valg) er nye skærme bag deres faner.
  - Ændringer gik fra 11 ord, fordi den gamle dialog var tom efter Fortryd, til 170 ord med resumé og linje-diff for opgaven.
  - Arbejdsområdet fik 3 ord og 3 valg mere: fire faner i stedet for knappen Ændringer.
  - Godkendelsen og resultatkortet har hver ét valg mere, fordi filen er et link.

Ikke afprøvet:
- En rigtig model gennem arbejdsfladen. Der er ikke foretaget rigtige modelkald i denne milepæl.
- Skærmlæser (VoiceOver), Windows, en pakket app og en person uden teknisk baggrund.
- Ændringer og Aktivitet efter en genstart af appen. De gemmes ikke på disken, så fanerne er tomme igen; det er en bevidst begrænsning.

## Afprøvet på Mac

- 78 automatiske tests består. De omfatter rigtige midlertidige Git-repositories, HTTP-servere, filskrivning, afvisninger, hemmelighedsbeskyttelse og gendannelse. Modellerne i disse tests er kontrollerede testdata.
- Den trinvise AI-opsætning er gennemført i Electron: to store valg ved første start, nøgleformular, lokal opdagelse, tomt katalog, forbindelsesfejl, genkontrol, tilbage-navigation og Vælg senere. Tastatur, reduceret bevægelse og vinduet ved 980 × 720 er prøvet. Kladden bevares, og et faktisk projekt åbner i preview. Serverne leverer kontrollerede svar; forløbet er endnu ikke observeret med en kommunal medarbejder uden udviklererfaring.
- OpenCode-forløbet er gennemført med plan, afklaring, godkendt filændring, preview, versionsgemning og kontrolleret modelserver. Samtale, plan og kladde genfindes efter genstart; en afbrudt opgave starter ikke igen af sig selv.
- Gendannelse og fortrydelse er gennemført gennem appens knapper og efter genstart. HEAD, index, private indstillinger og nye filer uden for historikken bevares. Filrettigheder bevares; forældede gennemgange afvises. En fremkaldt skrivefejl kan håndteres med kopien før gendannelsen.
- Forkert nøgle, kvote og en faktisk afbrudt HTTP-strøm er fremkaldt. Hvert kald stopper uden automatisk gentagelse. Stop er prøvet efter et delvist modelsvar. En ny opgave lykkes efter hver fejl og efter Stop.
- En tidligere plan nulstilles efter gendannelse. Markøren kontrolleres ved genåbning, også når samtalefilen ikke kunne opdateres ved første forsøg.
- Fejlrapporten er gennemgået og gemt gennem filvælgeren. Den bruger faste statusfelter og udelader projektindhold, filstier, serveradresser, kontonavne og nøgler. Hjælpeskærmens unødvendige kontakt til nøgleringen er fjernet. Nøglelagring står som ikke kontrolleret; en fejlrapport må ikke udløse et nøgleopslag.

## Corti S1 og blindgyder · 1. oktober 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Med en rigtig model:** Corti S1 er kørt gennem appen med `npm run test:live-app` og brugerens nøgle fra Cortis miljø fr. Nøglen blev indtastet af brugeren i appen.
  - Forbindelse, plan og rettelse virker.
  - Siden "Find et lokale med plads til dit møde" blev bygget med søgefelt og tre lokalekort på godt dansk. Den blev gemt automatisk som version.
  - Hele samtalen kostede ca. 0,11 USD.
  - Første kørsel stoppede uden filer, fordi svaret var begrænset til 4.096 tokens. Det er rettet.
  - I sidste kørsel stoppede bygningen, efter at prøven afviste kommandoen `ls -la`. Appens regler beder nu AI'en bruge sine værktøjer til at se filer, og resultatkortet siger, når brugeren har afvist en handling. Begge dele er afprøvet med en kontrolleret model, ikke med Corti.
- **Enhedstestet:** 137 automatiske tests består. De nye dækker:
  - Corti-adressen ud fra nøglens miljø og afvisning af USA;
  - beskeden, når Corti afviser en nøgle;
  - at miljøet bevares ved redigering;
  - globale Git-filtre;
  - feedback på e-mail;
  - opstartstjekket af AI-motoren;
  - startsidens fingeraftryk.
- **Afprøvet i Electron med en kontrolleret modelserver:**
  - Alle 15 Electron- og motorprøver består, ligesom skill-prøverne i OpenCode og Claude Code.
  - `test:recovery` afprøver feedback-teksten uden kontakt.
  - `test:desktop` og `test:introduction` viser pladsholderen i preview-ruden og den rigtige side, når `index.html` er ændret.
  - `test:features` fandt, at en ⓘ-knap var markeret som åben et øjeblik efter, at boblen var lukket. Det er rettet.
- **Målt:** 1.980 synlige ord på 32 skærme.

Ikke afprøvet:
- **En pakket Aura.app (beta.4) og notarisering:** Apple-aftalen mangler.
- **Feedback-knappen med en rigtig kontakt:** Kontakten i `package.json` er endnu tom.
- **Corti med en nøgle fra EU-miljøet.**
- **En tester uden teknisk baggrund og Windows.**

## Navneskift til Aura · 1. oktober 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Enhedstestet:** 127 automatiske tests består, når testfilerne køres én ad gangen. De nye tests dækker:
  - **En ny installation** hedder Aura i datamappe og nøglering og husker det til næste opstart.
  - **En installation fra før navneskiftet** beholder sin datamappe og navnet "AI Harness" i nøgleringen, så gemte nøgler kan læses. Det gælder også en valgt datamappe med data fra før, som i opdateringsprøven.
  - **Projektmappe:** Nye projekter lægges i Dokumenter › Aura, medmindre Dokumenter › AI Harness findes.
  - **Markører:** Afsnit med de gamle `ai-harness`-markører opdateres til `aura-harness`, også når indholdet er uændret, og de kan fjernes. Nye og gamle markører i samme fil giver en konflikt.
  - **Downloadsider:** Siderne viser installationsfiler med både det nye og det tidligere navn.

  Prøverne af de gamle markører og den gamle nøglering fejler, når understøttelsen af det gamle navn fjernes. Det er afprøvet.
- **Afprøvet i Electron med en kontrolleret modelserver:**
  - Alle 15 Electron- og motorprøver består, ligesom skill-prøverne i OpenCode 1.18.33 og Claude Code.
  - Appen viser Aura i menu, vindue, velkomst og sidepanel.
  - Mappen hedder Dokumenter › Aura, og nye projekter får Git-identiteten `Aura-bruger`.
  - Eget kodeværktøj installerer afsnit mellem `aura-harness`-markørerne.
- **Målt:** `npm run measure:screens` giver 1.968 synlige ord på 32 skærme. Det er 11 færre end før, fordi "AI Harness" mange steder er blevet til "Aura".
- **Pakker:** De 23 pakker hedder `aura-harness-<værktøj>-0.2.0.zip`, og vejledningen i dem nævner de nye markører.
- **Indsats under skrivefeltet:** Linjen viser nu fx "Claude Opus 5.5 · Anthropic · middel indsats" i stedet for "indsats mellem". Det er set i skærmmålingen.

Ikke afprøvet:
- **En pakket Aura.app og en opdatering fra beta.3 (AI Harness.app):** `verify-upgrade` er tilpasset, men kræver to byggede apps.
- **Windows og en pakket app i det hele taget.**
- **Begyndergennemgangen med 27 skærmbilleder:** Scriptet lå i den midlertidige arbejdsmappe og forsvandt ved en genstart af Mac'en. Skærmmålingen dækker de samme skærme med skærmbilleder.

## Integrationsskills · 30. september 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Mod den rigtige tjeneste:** `npm run test:integrations` læser søgeadressen og testopslaget fra Adresser-skillens egen tekst og kalder Klimadatastyrelsens Adressevælger. Kontrollen viser, at:
  - søgningen finder "Rådhuspladsen 1, 1550 København V" med de felter, skillen beskriver;
  - tjenesten kan kaldes fra en browser;
  - opslag med ID giver postnummer og koordinater i EPSG:25832.
- **Enhedstestet:** 121 automatiske tests består, når testfilerne køres én ad gangen. De nye tests dækker:
  - Kataloget: en integration afvises uden system, ejer, adgang, data, dataflow, pris, kontroldato eller kilder, og uden for gruppen integrationer.
  - Integrationsskills holder nøgler på serveren og nævner systemets regler.
  - Pakker, projektets `.harness/LAES-MIG.md` og webguidens tekster tæller integrationer for sig, og pakkerne indeholder ingen integrationer.
  - `scripts/harness.cjs` bevarer et udvalg fra appen, også en valgt integration.
  - Webguidens script bruger kun felter, som kataloget har.
- **Afprøvet mod den rigtige motor:** `npm run test:app-skills` henter den valgte integration og dens reference i OpenCode 1.18.33. Det er gjort med og uden Git og under planlægning.
- **Afprøvet i Electron med en kontrolleret modelserver:**
  - `test:features`: Integrationen slås til for ét projekt. Dens ⓘ viser ejeren, og i næste session får modellen både skillen og appens regel om nøgler. Ved første start vises kun de seks almindelige funktioner.
  - `test:tools`: I eget kodeværktøj vælges integrationen til og installeres med sin reference. Den tælles for sig og huskes ved næste installation. Vælg alle skills vælger ikke integrationer.
  - De øvrige 12 Electron- og motorprøver består også, ligesom skill-prøverne i OpenCode 1.18.33 og Claude Code. Begyndergennemgangen gav 27 skærmbilleder uden sidefejl.
- **Fejl fundet og rettet undervejs:**
  - Webguiden viste "Filerne kunne ikke indlæses" fra 29. september. Kataloget havde to felter ved navn `categories`, så listen over skills fik værktøjernes kategorier. Rettelsen er afprøvet i browseren, og en ny test kontrollerer felterne.
  - Funktioner havde en vandret rullebjælke, når et projekt var åbent. Projektvalgets skjulte radioknapper fik den generelle bredde for input, så dialogen blev 848 px bred i stedet for 698. Nu kontrollerer `test:features`, at dialogen ikke er bredere end sin plads.
  - Flere tekster talte forkert, fx "14 skills", "12 af 14" og "Fravalgt: Adresser, CVR", selvom integrationer ikke er med som standard.
- **Målt:** `npm run measure:screens` giver 1.979 synlige ord, 188 valg og 48 ⓘ på 32 skærme, mod 1.923, 186 og 46 efter Rolige skærme.
  - Funktioner voksede med afsnittet Integrationer: fra 96 til 124 ord og fra 11 til 13 valg.
  - Instruktionerne viser nu også de to integrationer som slået fra, og resuméet i eget kodeværktøj nævner dem.
  - Sikkerhedskopi talte 14 ord mere, fordi GitHub-status denne gang nåede at blive indlæst før målingen. Målingen venter nu på den.

Ikke afprøvet:

- CVR mod den rigtige tjeneste. Det kræver en bruger hos Datafordeleren eller en ansøgning om system-til-system-adgang, og vi opretter ikke konti.
- Datafordeleren. Adresser-skillens afsnit om Datafordeleren bygger på dokumentationen, og et kald kræver en API-nøgle.
- En rigtig model, der selv vælger en integration og bygger med den. Prøverne bruger en kontrolleret modelserver.
- Windows, en pakket app og en person uden teknisk baggrund.

## Rolige skærme · 30. september 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Målt i Electron:** `npm run measure:screens` åbner 32 skærme og dialoger med en kontrolleret model og tæller det, der er synligt i første lag.
  - Synlige ord faldt fra 3.789 til 1.923, 49 % færre.
  - Valg faldt fra 209 til 186, plus 46 ⓘ.
  - Klik pr. opgave er uændret: 5 for at forbinde Claude, 5 fra idé til første udkast og 2 for at fortryde.
  - Der var ingen sidefejl.
  - De største fald er "Se alle oplysninger" fra 1.162 til 250 ord, nøglehjælpen fra 217 til 100 og AI-forbindelser fra 107 til 9.
- **Enhedstestet:** 117 automatiske tests består, når testfilerne køres én ad gangen.
- **Afprøvet i Electron med en kontrolleret modelserver:** Alle 15 Electron- og motorprøver består efter tilpasningen til de nye skærme. Det samme gør begge skill-prøver og begyndergennemgangen med 27 skærmbilleder uden sidefejl.
  - Testene tilføjer nu forbindelser ad samme vej som en bruger: AI-forbindelser › Tilføj forbindelse › Vælg en anden.
  - `test:preferences` afprøver den flade liste og de automatisk huskede valg.
  - `test:features` afprøver, at ⓘ åbner og lukker, både i og uden for en dialog. Kontrollen fandt en fejl, som er rettet: Et nyt klik på samme ⓘ åbnede boblen igen i stedet for at lukke den.
  - Rettelsen kom efter den samlede kørsel og er kun afprøvet med `test:features`. Ingen andre prøver klikker på ⓘ.

Ikke afprøvet:

- En person uden teknisk baggrund, der bruger skærmene. Målingen viser mængden af tekst, ikke om teksten forstås.
- Skærmlæser og tastatur i ⓘ-boblen ud over fokus og Escape.
- Windows og en pakket app.

## Funktioner og fælles skills · 30. september 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Enhedstestet:** 117 automatiske tests består, når testfilerne køres én ad gangen. De nye tests dækker:
  - Kataloget: hver skill hører til præcis én funktion, og Deling bygger på Versioner.
  - Standard for alle projekter: uden et valg er alt slået til, og valget ved første start huskes.
  - Undtagelser pr. projekt: de gemmes kun, når de afviger fra standarden, og kan fjernes igen.
  - Afhængigheder: Deling og Versioner følges ad begge veje.
  - Instruktioner i projektet: de kan tilpasses og gendannes, og en ugyldig SKILL.md afvises. Grundreglerne gælder altid.
  - Skills under en slået fra funktion kommer ikke med.
  - Læse- og skrivereglerne virker med stier i forhold til Git-roden og uden Git. En privat reference afvises, en valgt læses, `.git`, `.env` og `secrets` afvises, og skillmappen kan læses, men ikke ændres.
  - Motorens skillmappe skrives forfra og tager kun gyldige skills.
  - Appens regler følger funktionerne.
- **Afprøvet mod den rigtige motor:** `npm run test:app-skills` kører appens egne tilladelser og skills i OpenCode 1.18.33 med en kontrolleret modelserver. Det er gjort i et projekt med Git, et uden Git og under planlægning, og det viser:
  - Modellen ser præcis de aktive skills og kan hente dem.
  - Skillens referencefil kan læses uden spørgsmål.
  - En ikke valgt privat reference, `.env` og `.git/config` afvises.
  - En valgt reference kan læses.
  - OpenCodes egen skill er skjult, og en skill under en slået fra funktion findes ikke i motoren.
  - Projektets egen AGENTS.md indlæses ikke.

  Med de gamle regler kunne AI’en læse alle private referencer i et projekt med Git. Det viste en prøve af de samme regelformer mod samme motor.
- **Afprøvet i Electron med en kontrolleret modelserver:** `npm run test:features` gennemfører forløbet med rigtig OpenCode, Git og projektfiler:
  1. første start med Vælg selv, hvor Deling og Versioner følges ad
  2. en startside uden design og hostingønske
  3. et projekt med Git fra start, uden Del og Sikkerhedskopi og med direkte arbejde
  4. en opgave, hvor modellen kun ser Git-skillen og får appens regler for de valgte funktioner
  5. en undtagelse for projektet og en ændring for alle projekter; Planlægning skifter arbejdsmåden med det samme
  6. næste opgave i en ny modelsession med de nye skills
  7. et projekt uden versioner, som hverken får Git eller versionsknapper
  8. genstart, hvor valget er husket og spørgsmålet ikke stilles igen

  Introduktionsprøven viser spørgsmålet ved første start med to valg, hvor Hele pakken er anbefalet. Deling og udgivelse er ikke med i Hele pakken. Prøverne af Del og Sikkerhedskopi slår den derfor til først, og begyndergennemgangen gør det gennem panelet Funktioner. `verify-resume` ventede reelt kun 20 sekunder på planen, fordi ventetiden stod på den forkerte plads. Det er rettet. `verify-hosting` er rettet til den nuværende opsætning og består. De øvrige tolv Electron-prøver og skill-prøverne i eget kodeværktøj består også: OpenCode 1.18.33 og 1.17.15 samt Claude Code 2.1.150. `verify-framework-preview` bestod ved anden kørsel. Begyndergennemgangen gav 27 skærmbilleder uden sidefejl.

Målt: Med alle funktioner slået til er systemprompten vokset fra ca. 23.400 til 29.900 tegn pr. modelkald. Det skyldes listen over de 12 skills, som modellen skal kende for at kunne hente dem. Med færre funktioner bliver den kortere. En skills fulde tekst sendes kun, når den hentes.

Ikke afprøvet:

- En rigtig model, der selv vælger og henter en skill. Prøverne bruger en kontrolleret modelserver, der beder om skills i en fast rækkefølge.
- Windows, hvor OpenCode muligvis skriver stier med omvendt skråstreg. Tilladelsesmønstrene er kun afprøvet på Mac.
- En pakket app med ændringerne og en person uden teknisk baggrund.

## Gem, fortryd og kom tilbage · 30. september 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Enhedstestet:** 111 automatiske tests består, når testfilerne køres én ad gangen. De nye tests dækker:
  - Git fra start: branchen `main`, anonym identitet og første version. Hemmeligheder og private referencer kommer ikke med, og eksisterende repositories røres ikke.
  - automatiske versioner: de indeholder præcis opgavens filer, og brugerens ugemte filer bliver ugemte
  - et stop gemmes som "Afbrudt AI-opgave"; en opgave uden ændringer giver ingen version
  - en fil med en mulig nøgle kommer aldrig med; hooks og en ændret historik stopper automatisk gemning
  - Gem version med ét klik og tidspunkter i historikken
- **Afprøvet i Electron med en kontrolleret modelserver:** `npm run test:versions` gennemfører hele forløbet med rigtig OpenCode, Git og projektfiler:
  1. oprettelse med første version og anonym identitet
  2. en AI-opgave, der gemmes automatisk
  3. Fortryd opgaven, som sætter filen tilbage og gemmer "Fortrudt: …"
  4. Versioner med "Alt er gemt" og "i dag"-tidspunkter
  5. Gå tilbage hertil, der gemmer "Gendannet til: …"
  6. en ændring, brugeren selv laver, og som gemmes med Gem version
  7. genstart, hvor projektet, samtalen og forbruget kommer igen

  Desktop-prøven viser, at et projekt lukket med Nyt projekt ikke åbnes igen. De øvrige elleve Electron-prøver og skill-prøverne består også. Begyndergennemgangen gav 25 skærmbilleder uden sidefejl.

Ikke afprøvet:

- En rigtig model gennem appen. Prøven med Mistrals gratis plan (`npm run test:live-app`) venter på en nøgle.
- En pakket app med ændringerne, Windows og en person uden teknisk baggrund.
- Git-signering, der er slået til globalt. Så kan den første version mislykkes. Projektet oprettes stadig, og appen viser en besked.
- `verify-framework-preview` fejler af og til ved Vites genindlæsning og består ved næste kørsel. En særskilt opgave er foreslået.

## Første resultat uden spørgsmål · 29. september 2026

Afprøvet på Mac med OpenCode 1.18.33:

- **Enhedstestet:** 109 automatiske tests består, når testfilerne køres én ad gangen. De nye tests dækker:
  - mappenavne med æ, ø og å, og nummerering ved samme navn
  - tokengrænser for hver model
  - at gatewayen lader en langsom strøm køre færdig og stopper ved stilstand
  - at godkendelse for en hel opgave kun gælder filer i projektmappen og ophører, når opgaven slutter
  - vilkår og priser for hver udbyder og for hver af Zens modeller
  - at appen aldrig anbefaler en model, og udbyderens standardindsats
  - forbrugstælleren: hvert modelkald tælles én gang, ræsonnement afregnes som output, forbruget gemmes med samtalen og nulstilles ved ny samtale
  - at motorens forventede version svarer til låsefilen
- **Afprøvet i Electron med en kontrolleret modelserver:** Alle elleve prøver består med OpenCode 1.18.33: introduktion, opsætning, desktop, standardvalg, chat, genoptagelse, gendannelse, agent, værktøjer, frameworks og udgivelse.
  - Chatprøven viser `public/index.html` i godkendelsen og bruger Tillad for denne opgave. Resuméet før afsendelse vises ikke igen ved bygning.
  - Genoptagelsen viser, at accepterede vilkår huskes efter genstart, og at resuméet vises igen, når den tidligere samtale medsendes.
- **Begyndergennemgang:** Hele forløbet fra velkomst til genstart er gennemgået i appen med en kontrolleret model i Anthropics format og et skærmbillede af hver skærm.
  - Kaldet til modellen har nu `max_tokens=32000`. Før var det 4.096.
  - Efter fem kald viste linjen under skrivefeltet "Claude Opus 5.5 · Anthropic · indsats mellem" og "Denne samtale: 6.000 tokens ind · 1.500 ud · ca. 0,05 USD".
- **Skills i eget kodeværktøj:** Prøverne består med OpenCode 1.18.33 fra `.runtime` og med Claude Code 2.1.150 (`HARNESS_CLAUDE_PATH=~/.local/bin/claude`). Den ældre Claude Code 2.0.56, der ligger først på PATH på denne Mac, kender ikke et af prøvens flag. Prøven fejler derfor med den.

Ikke afprøvet:

- **En rigtig model gennem appen:**
  - Brugeren valgte ikke at betale for en prøve.
  - Zens gratis modeller afviser appen, fordi den melder sig som `harness`.
  - Prøven med Mistrals gratis plan (`npm run test:live-app`) ventede 30 minutter uden nøgle og blev derefter stoppet efter aftale.
- En pakket app med OpenCode 1.18.33, Windows, Intel-Mac og en person uden teknisk baggrund.
- `verify-hosting` fejlede på den committede version, fordi den ledte efter en foldeboks og filvalg, der er flyttet. Den er rettet 30. september 2026 og består. `verify-generated-preview` er en manuel prøve, der kræver en projektmappe.

## Få valg og udvælgelse af skills · 29. september 2026

- **Unit-testet:** 100 automatiske tests består, når testfilerne køres én ad gangen. Nye tests dækker anbefalede modeller pr. udbyder, fremhævede værktøjer, kategorier, installation af et udvalg af skills, fravalg ved næste installation, ingen skills og henvisninger mellem skills.
- **Afprøvet i Electron:** `test:tools` gennemfører fire kort og "Et andet værktøj" med søgning, et resumé i almindeligt dansk, udvælgelse af skills med låste grundregler, en fravalgt kategori og en fravalgt enkelt skill, installation til Claude Code og derefter Codex med det huskede udvalg, en fil ændret af brugeren og fjernelse. `test:setup` og `test:introduction` afprøver de tre udbyderkort og "Vælg en anden". Desktop, standardvalg, chat, resume og recovery består også efter ændringerne.
- **Set i browseren:** webguiden viser de fire mest brugte værktøjer og "Vis alle 24"; et direkte link til et andet værktøj åbner hele listen. Ingen vandret rulning ved 390 pixels.
- **Fundet undervejs:** appens egen protokol udleverede kun navngivne filer, så den nye `model-advice.js` gav tomme modelkort. Chattesten fandt fejlen, og filen er tilføjet.
- **Ikke afprøvet:** at en rigtig model vælger den anbefalede model eller de valgte skills, brugertest med en person uden teknisk baggrund og Windows.

## Harness i eget kodeværktøj · 29. september 2026

Afprøvet på Mac:

- **Unit-testet:** 96 automatiske tests består, når testfilerne køres én ad gangen (`node --test --test-concurrency=1 tests/*.test.cjs`). De nye tests dækker validering af biblioteket, adaptere, installation, opdatering, konflikter, symbolske links, CRLF, fjernelse, installation og fjernelse af hvert af de 23 værktøjers pakker, de faktiske ZIP-filer og at bygningen er reproducerbar.
- **Afprøvet i Electron:** `npm run test:tools` gennemfører førstevalget, valg af værktøjer, et rigtigt Git-projekt med egne regler og en `.gitignore`, der udelader `.claude/`, gennemgang, installation, gentagelse, konflikt ved en ændret skill og fjernelse. Projektets egne filer er uændrede bagefter. Introduktion, desktop, opsætning, agent og chat består også efter ændringerne.
- **Afprøvet i de rigtige værktøjer med en kontrolleret modelserver:** Claude Code 2.1.150 (`npm run test:skills-claude`) og OpenCode 1.17.15 (`npm run test:skills-opencode`) sender grundreglerne, kontrolordet og alle 12 skills til modellen og indlæser en skill, når modellen kalder den. Negative prøver uden importen i `CLAUDE.md` og uden `AGENTS.md` fejler som forventet. OpenCode fandt desuden alle 12 skills med `opencode debug skill` uden modelkald.
- **Hjemmesiden:** den samlede Pages-bygning er set i browseren. Webguide, FAQ, værktøjsoversigt, forside og appens side har ingen vandret rulning ved 390 pixels.

Ikke afprøvet:

- En rigtig models valg af skills. Den selvstændige Claude Code CLI var ikke logget ind, og OpenCodes gratis modeller afviste version 1.17.15 med beskeden om, at gratisadgangen kun kan bruges fra OpenCode. Codex havde ikke brugsadgang i denne omgang.
- De 21 værktøjer, hvis filplacering kun følger dokumentationen, Windows og en pakket app med ændringerne.

Kendt problem, som ikke skyldes ændringerne: tre npm-tests i `dev-server.test.cjs` fejler, når hele testsuiten køres parallelt, også med den uændrede kode fra HEAD. De består, når filerne køres én ad gangen.

## Rigtige gratis modeller

Hver OpenRouter-prøve bruger syntetiske data, et eksplicit modelvalg og en enkelt rute med oplyst nulpris. Betalt fallback er slået fra. Resultaterne nedenfor beskriver de konkrete prøver, ikke modellernes generelle evner.

- **Qwen3.8 27B**, `qwen/qwen3.8-27b:free`, ruten `modelrun/fp4`: gav en plan, men med tydelige danske sprogfejl. Bygningen nåede ikke en færdig filændring inden testens grænse. Kan ikke anbefales ud fra denne prøve.
- **Gemma 4 31B**, `google/gemma-4-31b-it:free`, ruten `google-ai-studio`: afvist med HTTP 429. Ingen kodekvalitet kunne vurderes.
- **Nemotron 3 Super**, `nvidia/nemotron-3-super-120b-a12b:free`, ruten `nvidia`: gav en forståelig plan, men forsøgte derefter `ls -la`, selv om prøveopgaven udtrykkeligt forbød kommandoer. Handlingen blev afvist. Ingen fungerende aktivitetsoversigt blev bygget i denne prøve.
- **Laguna S 2.1**, `poolside/laguna-s-2.1:free`, ruten `poolside/fp4`: afvist med HTTP 429. Ingen kodekvalitet kunne vurderes.
- **North Mini Code**, `cohere/north-mini-code:free`, ruten `cohere`: gav en plan med engelske rester og uklare danske formuleringer. Forsøgte derefter en mappekommando, som denne prøve udtrykkeligt forbød. Kommandoen blev afvist; forløbet nåede ikke et fungerende udkast.

En særskilt North Mini Code-prøve tillod begrænset mappelæsning efter godkendelse. Her skrev modellen faktisk en opgaveliste, som blev vist i preview. Den brugte til sidst filværktøjerne uden en kommando. Prøven bestod dog ikke: feltet fik et andet tilgængeligt navn end det bestilte, så funktionskontrollen stoppede, før den efterfølgende ændring blev afprøvet. Skærmbilledet viser et roligt, læsbart layout, men svaret til brugeren skiftede til engelsk, og teksten “Datalagret i hukommelsen” er ikke godt dansk. Kodegennemgangen fandt desuden brugerinput sat direkte ind i `innerHTML` uden escaping. Det er ikke et tilfredsstillende grundlag for en anbefaling.

Der er endnu ikke grundlag for at anbefale én af disse gratis forbindelser som et stabilt førstevalg til testerne. Katalogadgang og værktøjsunderstøttelse er ikke tilstrækkeligt bevis. Prøverne `rooms`, `tasks` og `activities` omfatter også efterfølgende ændring og mobilvisning, når modellen når frem til et udkast.

Ingen Ollama-tjeneste blev fundet på standardadressen på denne Mac. Den kendte Spark-enhed fremgår af Tailscale, men Tailscale er stoppet på computeren. Ingen netværksopsætning eller modelinstallation er ændret. Der mangler en prøve med en faktisk lokal model.

## Pakker og CI

[GitHub-kørsel 36470547106](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36470547106) afprøvede commit `b5a83bf548f7d495bd9f32c6110d75bb278b0d43` (beta.3). Alle tre platforme bestod:

- **Windows x64, Apple Silicon og Intel-Mac:** Pakning og start af den pakkede app med isolerede brugerdata og begrænset PATH. Medfølgende Git, Node/npm og OpenCode blev kontrolleret. Projektoprettelse, rigtigt preview, Git-identitet og versionsgemning blev gennemført i syntetiske projekter.
- **Gendannelse og fejl på alle tre platforme:** Gendan og fortryd gennem brugerfladen og efter genstart, bevaret HEAD og private filer, forkert nøgle, opbrugt kvote, afbrudt HTTP-strøm, Stop, ny opgave efter fejl og eksport af en fejlrapport. Modelserveren leverede kontrollerede svar; prøven vurderer ikke en rigtig models kode eller sprog.
- **Begrænsning:** Windows-prøven starter `win-unpacked/AI Harness.exe`, ikke NSIS-installationsprogrammet. Installation, opdatering, afinstallation, SmartScreen og arbejdspladsens politik er ikke afprøvet på en almindelig Windows-maskine. CI-pakkerne er usignerede. Den særskilte opstartsprøve med tastatur og reduceret bevægelse er fortsat kun kørt lokalt på Mac.

De tidligere timeout-fejl ved Git-identiteten på Mac blev ikke gentaget. De private byggeartefakter kan hentes af personer med repositoryadgang: [Windows x64](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36470547106/artifacts/10991466192), [Apple Silicon](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36470547106/artifacts/10991790730) og [Intel-Mac](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36470547106/artifacts/10991214935). De er knyttet til denne CI-kørsel og er ikke en publiceret Release.

Beta.3 til Apple Silicon er bygget separat i `desktop/release/beta.3/` med det godkendte mekbas-certifikat. Signaturen består `codesign --verify --deep --strict`. Alle 36 pakkede kildefiler matcher arbejdsmappen byte for byte; byggesystemet fjerner udviklingsscripts og -afhængigheder fra det pakkede manifest.

Den signerede app har bestået:

- Pakkeprøven med begrænset PATH: medfølgende Git, Node/npm og OpenCode, projektoprettelse, preview og versionsgemning i et syntetisk projekt. Git-status er genindlæst, mens identitetsformularen allerede var synlig, uden at indtastningen blev overskrevet.
- Den nye opstartsguide med tastatur, reduceret bevægelse, lille vindue, kontrolleret Ollama-katalog og oprettelse af et faktisk projekt.
- Gendannelse, fortrydelse efter genstart, nøglefejl, kvote, afbrudt HTTP-strøm, Stop og en ny opgave efter hver fejl. Hjælp og eksport af fejlrapport består også, når nøgleringskontrol bevidst afvises i testen.

DMG'en er monteret skrivebeskyttet; appens signatur og identiske `app.asar` er kontrolleret. Filoversigt og SHA-256 ligger sammen med DMG og ZIP. Downloadsiden er genereret lokalt, ikke publiceret.

Opdatering fra den signerede beta.2 til beta.3 er gennemført ved at erstatte appen samme sted i en midlertidig mappe. Projektfiler, forbindelse, syntetisk krypteret nøgle, designpakke og kladde er bevaret. Kladden er skrevet gennem appens skrivefelt. Den nye version sender ikke automatisk til den gemte modelserver. Prøven bruger isolerede brugerdata på udviklingsmaskinen; en separat maskine og Windows-opdatering mangler stadig.

Apple-notarisation er endnu ikke gennemført. Validering af loginprofilen for team `2UX98897JW` blev afvist med HTTP 403: en nødvendig aftale mangler eller er udløbet. Account Holder skal kontrollere medlemskab og ventende aftaler hos Apple. Ingen pakke er indsendt, og der er ingen notariseringskvittering. Signering alene er ikke notarisation.

## Før invitationerne kan sendes

1. Gennemfør et fuldt bygge- og rettelsesforløb med en lokal model og en hosted model, og vurder dansk og design på det faktiske resultat.
2. Gennemfør notarisation og kontrol af den endelige Mac-fil. CI-kørslen for beta.3 er bestået; nye appændringer kræver en ny pakke og kontrol.
3. Afprøv installation og opdatering på en separat testmaskine, herunder arbejdspladsens installationsrettigheder.
4. Observer en person uden udviklererfaring gennem [testforløbet](testforloeb.md), og ret de steder, hvor forklaring er nødvendig.
5. Giv de inviterede adgang til det konkrete downloadlink og en navngiven feedbackkontakt. Repositoryet er fortsat privat; der er ikke oprettet en offentlig download eller ændret synlighed.
