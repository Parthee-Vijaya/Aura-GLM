# Godkendt feedback integreret i Aura 1

26. oktober 2026. Parthee godkendte den konkrete før/efter-prototype med “Godkend og byg det ind”. Automatisk serverstart var udtrykkeligt undtaget. Senere valgte Parthee, at Windows-/brugertestpakken skal gøres klar til senere.

## Resultat

- Et mindre skrivefelt i hvile, som vokser med lange kladder. Modelvalg, vedhæftninger, Stop, data- og forbrugsoplysninger bevares.
- Faktisk arbejdsstatus tæt ved skrivefeltet. Når det ventende spørgsmål allerede er synligt, skjules den ekstra genvej. Ellers kan hele rækken aktiveres med mus eller tastatur. Status kommer fra den aktive samtales tilstand; layoutet opfinder ingen fremdrift.
- Projektpanelet kan trækkes mellem 180 og 320 pixels, med en yderligere vinduesgrænse. Piletaster, Home/End, dobbeltklik, kollaps og mobildrawer er bevaret. Kun bredden gemmes lokalt.
- Frit svar vises straks, når AI-spørgsmålet tillader det. Enter sender; Shift+Enter indsætter linjeskift. Komposition/IME og gentagne Enter-hændelser sender ikke dobbelt. Flervalg, tidligere spørgsmål, kladder, afvisning og skip bevares.
- Kort byggeplan viser højst tre faktiske afsnit fra planen. Ingen ny plan opfindes, og hele planen inklusive teknik findes stadig under Plan. “Byg planen” forbliver et eksplicit valg.
- Fjernelse af en forbindelse kræver en konkret bekræftelse. Annuller er standardfokus; ændret valg afvises, og gentaget klik sender kun ét kald til det oprindelige id. Projekter og samtaler bevares.
- Hjælp og feedback kan lukkes ved klik udenfor. Ingen generel lukning er føjet til nøglefelter, forbindelsesformularer eller godkendelser.
- Arkitekturskillen genbruger besvarede spørgsmål og undgår en obligatorisk framework-/hostingrunde for en lokal demo. Den afklarer fortsat nye dataflow, login, udgifter og tjenester. Modellen og de valgte designskills styrer designet.

Onboarding B, hovednavigation, oprindelige planvalg, værktøjs- og datagodkendelser samt YOLO-grænser er bevaret. Ingen automatisk serverstart, reserve-model eller bredere tilladelse er aktiveret.

[Se faktiske før/efterbilleder](https://mac-studio-tilhrende-parthee.tailefb5b1.ts.net/aura-ui/feedback-20261026/implementeret/).

## Før/efter og native kontrol

Ved 1280 × 800 CSS-pixels i den samme kontrollerede Mac-visning faldt skrivefeltets højde fra 130,09 til 84,5 pixels. Samtaleområdet er større; status er flyttet fra toppen af chatten til lige over feltet. Det måler pladsfordeling, ikke modelhastighed eller menneskelig brugervenlighed.

Rapporter ligger uden for Git under `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/`:

| Prøve | Resultat | Hvad det viser |
|---|---:|---|
| Samlet native UI | 20/20 | Lyst/mørkt tema, 1280/1440/1024/390-bredder, kompakt felt, reel status, sidebar, tastatur, plan og reduceret animation |
| Native spørgsmål/plan | 13/13 | Direkte svar, Enter/Shift+Enter/IME, enkelt-/flervalg, tilbage, fejl, dubletbeskyttelse og bevaret fuld plan |
| Native forbindelser | 17/17 | Cancel/Enter/Escape/backdrop, ændret valg, ét backendkald og bevarede data |
| Native YOLO-regression | Bestået | Rigtig Electron/OpenCode/OS-isolation med kontrolleret lokal modelserver og syntetiske filer |
| Preview-isolationsprøve | 19/19 | Faktisk fil-/netværksadfærd for normal server og eksisterende offlinegrænse, inklusive underproces |
| Native plan/bygning | 11/11 | Rigtig OpenCode med lokal kontrolleret model: spørgsmål, plan, godkendelse, bygning, Stop og genstart |
| Native Privacy Gate | 5/5 scenarier | Annuller/lokal/konkret deling, ændret destination og adskilt lokal historik; ingen betalt model |
| Fuld desktop-suite | 1.409 bestået, 28 eksplicit sprunget over, 0 fejl | 1.437 tests i alt, inklusive eksisterende lokale OpenCode-/Privacy Gate-ændringer |
| Ren målefunktion | 13/13 | Manglende, fejlende, afbrudte og komplette målinger holdes adskilt; private felter afvises |
| Arkitektur/design/plan | 21/21 | Bibliotek, eksport, motorens skillfiler, systemkontekst, designvalg og forældet plan |

Native prøver bruger den faktiske Electron-renderer og isolerede profiler, men kontrollerede hændelser eller en lokal kontrolleret modelserver. De er **ikke prøver med rigtig AI**. Windows, rigtig modeladfærd og ikke-tekniske deltagere er endnu ikke prøvet i denne omgang. Fuld suiteslutstatus og kildefingeraftryk findes i rapportmappen, så de faktiske bytes kan identificeres trods eksisterende ikke-committede ændringer.

Review fandt én tilgængelighedsfejl i første integration: en knap inde i en interaktiv statusrække. Den er rettet til ét egentligt knapmål, der dækker rækken. Native regression består efter rettelsen.

## Preview og testpakke

Den separate previewvurdering beskrives i [isolationsnotatet](2026-10-26-preview-isolation.md). Vurderingsfunktionen kunne ved denne UI-integration ikke selv starte en proces eller give rettigheder. Den efterfølgende [backlogrunde](2026-10-26-backlog-followup.md) har koblet den på den eksisterende manuelle servergennemgang. Prøven viser fortsat, hvorfor almindelig automatisk serverstart ikke bør slås til som en bivirkning af UI-opgaven.

[Brugertestpakken](testpakke/README.md) indeholder den fælles opgave, CSV-skemaer, hændelsesformat og protokol. Der er ingen personnavne, rå nøgler eller faktiske brugerresultater. Efter brugerens valg ligger den klar til en senere Windows-/brugerrunde.

## Kilde og udgivelse

Arbejdet ligger lokalt på `work/privacy-gate-followup` i den nuværende fork. Eksisterende Privacy Gate-/OpenCode-arbejde er bevaret. Kilder, testprojekter og rapporter er ikke slettet. Skillens genererede katalog og eksportpakker er opdateret lokalt, så pakkernes indhold svarer til kilden; ingen hjemmeside eller pakke er publiceret.

Der er ikke foretaget ny commit, push, CI-start, DMG-bygning eller udgivelse som del af denne godkendelse.
