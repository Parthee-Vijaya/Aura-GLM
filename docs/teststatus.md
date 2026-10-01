# Teststatus før invitation

Kontrolleret 28. september 2026. Dette er status for den aktuelle arbejdsmappe, ikke en erklæring om, at alle installationsfiler eller modeller er klar. Der er ikke committet eller pushet under denne gennemgang.

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
