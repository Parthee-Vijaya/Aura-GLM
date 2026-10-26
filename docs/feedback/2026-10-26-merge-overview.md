# Samlet ændring i Auras egen fork — 26. oktober 2026

Denne kildeintegration går til `Parthee-Vijaya/ai-harness`. Den bygger oven på designarbejdet i PR #25 og samler det efterfølgende lokale Privacy Gate-, OpenCode 2-, feedback- og robusthedsarbejde. Originalrepositoryet og dets PR’er ændres ikke. Den udgivne Aura 1 beta 0.4.0, opdateringsfeedet, installerede apps og brugerprofiler opdateres ikke af en Git-merge.

[Åbn det visuelle før/efter-overblik](https://mac-studio-tilhrende-parthee.tailefb5b1.ts.net/aura-ui/feedback-merge-20261026/) — kræver adgang til ejerens private Tailnet.

## Det brugeren vil opleve

| Område | Før | Efter |
|---|---|---|
| Skrivefelt og status | Et højt felt og status langt fra indtastningen reducerede pladsen til svaret. | Kompakt felt, som vokser med teksten, og faktisk arbejdsstatus tæt ved indtastningen. Kladde, forbrug, modelvalg og reduceret bevægelse bevares. |
| Sidebar | Fast bredde. | Justerbar med mus og tastatur, lokal lagring og bevarede mobil-/kollapsgrænser. |
| AI-spørgsmål | Frit svar krævede et ekstra klik; Enter var ikke ensartet. | Direkte svarfelt når spørgsmålet tillader det. Enter sender én gang, Shift+Enter giver linjeskift, og IME beskyttes. |
| Planlægning | En bekræftet idé kunne føre til gentagne tekniske afklaringer. | Skills genbruger brief og tidligere svar. En kortere planvisning bevarer eksplicit Byg og plan-ID. Nye væsentlige valg kræver fortsat afklaring. Modelefterlevelse er ikke målt på ny. |
| AI-forbindelser | Fjernelse skete ved første klik. | Navngivet bekræftelse, Annuller som sikkert fokus og genvalidering af netop forbindelsen. |
| Samtale / Planlæg / Byg | Korte tilstandsnavne uden forklaring i menuen. | Hver eksisterende arbejdsform forklares dér, hvor den vælges. YOLO kræver stadig sin advarsel. |
| Resultatet | Filantal og tekniske handlinger fyldte i samtalen. | Afprøv resultatet først, Ændringer, eksplicit gennemgang og konkret Fortryd. Ingen automatisk serverstart eller godkendelse. |

De konkrete visuelle ændringer er godkendt af brugeren. Billederne i det visuelle overblik er fra faktisk Electron med syntetiske projekter. Førbillederne er fra den lokale baseline før feedbackintegrationen; de er ikke en ny optagelse af originalrepositoryets `main`. Håndbyggede prototyper bruges ikke som produktbevis.

## Det, der ændres i baggrunden

- **OpenCode 2.1.4:** samme låste version i desktop og CLI. V2-adapter, spørgsmål, værktøjer, opgaveinstruktioner, isolerede hooks og migrationskontrol. Ingen automatisk model-/udbyderskift. [Opgradering og historisk kvalifikation](../opencode-2-upgrade.md).
- **Privacy Gate:** kontrol af hele modelkaldet, separate lokale/cloudbaserede sessioner, kontrolleret hybridarbejde og procesisolation. Native kvalifikation gælder macOS Apple Silicon; andre platforme må ikke falde tilbage til ubeskyttet behandling. [Opsætning og grænser](../privacy-gate.md).
- **Fælles filbeskyttelse:** én navnepolitik for filværktøjer, sandbox, snapshots, Git, eksport og Privacy Gate. Også patch, symlinks, case og filnavnealiaser efterprøves. [Detaljer](2026-10-26-protected-paths.md).
- **Stop og lukning:** samtidige afslutninger deler samme forløb. Gentaget Stop i en færdig samtale fjerner ikke planen. [Karakterisering](2026-10-26-session-lifecycle.md).
- **Forhåndsvisning:** Stop og projektskift invaliderer klargøring før sen serverstart; den manuelle gennemgang bindes til mappe, kontrolfiler, regler og udløb. [Afgrænsning](2026-10-26-preview-isolation.md).
- **Hastighed og måling:** lokale tids-/promptmålinger uden indhold eller telemetri. Identitetskontrolleret genbrug af Node-versionskontrollen sparer 68,633 ms i den målte lokale sekvens; selve sandboxkontrollen udføres stadig. Det er ikke en måling af cloudmodelhastighed. [Måling](2026-10-26-sandbox-probe-cache.md).
- **Windows-kompatibilitet:** almindelig Git må ikke afvises ud fra POSIX-rettighedsbits på Windows. Almindelige projekter uden privatmappe eller beskyttelsesmetadata må fortsætte, mens eksisterende beskyttet tilstand og aktivering af Privacy Gate fortsat afvises uden kvalificeret beskyttelse. Dette kontrolleres med modelleret Windows-metadata, ikke på en Windows-maskine.
- **Testgrundlag og fork:** fælles lokal checkkommando, kontrolleret modelserver, observerede OpenCode-kontrakter og releasekontrol, der bruger forkens distributionsidentitet. CI og releases forbliver manuelle.

## Afprøvning og grænser

Den afsluttende fulde premerge-kørsel består **1.729/1.729 tests, 0 fejl og 0 skips**, med native motor- og Privacy Gate-prøver aktiveret. De 721 kilde-/testfiler i målegrundlaget var uændrede under kørslen. Resultatet og kontrolsummerne er udledt maskinelt fra TAP i [premerge-verification.json](premerge-verification.json). De 29 kontrollerede Windows-platformtests indgår i totalen; de er ikke native Windows-prøver. Tidligere feedbackbeviser: 1.637 beståede tests og 31 eksplicitte skips; derudover 9/9 appforløb, 18/18 native UI-kontroller, 20/20 layoutkontroller og seks målrettede Privacy Gate-forløb. Antallene har overlappende dækning og må ikke lægges sammen til et antal unikke krav.

Der anvendes den rigtige Electron-app, OpenCode og macOS-isolation med kontrollerede modelsvar. Det er ikke en ny prøve med Mistral, Corti eller GPT. Der er ingen native Windows-/Linux-/Intel-prøve, ny pakket app, notarisering eller ændring af installerede brugerdata.

Privacy Gate er ikke en garanti for genkendelse af alle personoplysninger. Generel lokal klassifikationsmodel/OCR, beskyttet interaktiv livepreview, beskyttede pakkeinstallationer og eksterne handlinger uden en kontrolleret adapter er ikke leveret; de må afvises. Ukendt processtatus efter crash må ikke fortolkes som et sikkert stop.

Et ikke-blokerende Windows-restpunkt er registreret: statusmetadata angiver endnu modeldatakontrol som en generel kapabilitet, selv om `configure` afviser Windows. Rendererens eksisterende indstillingsformular er bevaret. Dette giver ingen adgang til beskyttet udførelse, men metadata og forklaringen bør tilpasses ved Windows-kvalifikation.

## Restarbejde

Se [alle 15 harness-punkter](harness-status-2026-10-26.json). Fuld tilstandsmaskine, holdbar aktivitetslog, generel crashgenoptagelse og flere ydelses-/designforbedringer er stadig åbne. Reviewets oprindelige tilstandstabel passer ikke direkte til den aktuelle hybridmotor; [afvigelsen og faseplanen](2026-10-26-state-machine-assessment.md) er dokumenteret. Windows-/deltagerprøven er klargjort [til senere](testpakke/README.md). OpenEnv-/OpenSandbox-arbejde er fortsat udskudt.

## Risiko og tilbagerulning

Dette er en samlet integration af flere allerede afprøvede, men hidtil lokale ændringer. De største risici er motorens V1/V2-overgang, afgrænsningen af proces-/filadgang og platformforskelle. Gamle motorfiler, godkendte planer, historik og lokale kilder bevares. En kode-rollback skal ikke slette eller omskrive en brugerprofil; en tidligere motor må kun åbne sin egen bevarede tilstand. Før en fremtidig DMG kræves selvstændig pakke- og migrationskvalifikation.
