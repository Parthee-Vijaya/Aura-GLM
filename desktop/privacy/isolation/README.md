# Privacy Gate: isolation af hele motoren på macOS

Denne adapter kører den eksisterende låste OpenCode-motor, dens værktøjer og underprocesser under én macOS Seatbelt-profil. Motorversionen ændres ikke. OpenSandbox og den gamle Code-OSS/VM-motor indgår ikke i denne integration.

## Grænse

- Kun det særskilte kopierede arbejdsområde og motorens egen tilstandsmappe kan skrives. Originalprojektet og den anden sessions mapper gives ikke til profilen.
- Systemfiler og eksplicitte låste runtime-/pluginfiler er læsbare. Andre projekter, brugerdata, nøglering, Unix-sockets, Apple Events og generel Mach-adgang er ikke tilladt.
- Udgående trafik er begrænset til to konkrete loopbackporte: Privacy Gates kontrollerede gateway og motorens egen HTTP-port. Der er ingen generel localhostregel, DNS, eksterne adresser eller undtagelser for pakkeregistre. Seatbelts `localhost:port` omfatter loopback; den virkelige motor bindes eksplicit til `127.0.0.1`.
- Agenten må ikke få cloudnøgler i miljø eller konfiguration. Gatewayens separate datakontrol skal stadig kontrollere hele modelkaldet. Et tilladt loopbackkald er ikke i sig selv en delingstilladelse.
- Preview, hosting, Git-push og andre værtsfunktioner ligger uden for denne adapter og skal særskilt blokeres eller formidles af Privacy Gate. Denne adapter gør ikke almindelige værtsprocesser isolerede.

## Levetid og Stop

`createEngineIsolation` returnerer `verify`, `launchSpec`, `attest` og `dispose`. Værten må starte motoren én gang pr. lease. Efter spawn skal `attest()` bekræfte den arvede profil, før nogen AI-opgave sendes.

`dispose()` stopper alle processer, der stadig tilhører profilen, og returnerer først `writersStopped: true`, når den native hjælper har bekræftet nul levende medlemmer. Det omfatter processer, som har løsrevet sig fra procesgruppen og fået en anden forælder. En kortlægning af parent-PID'er eller et process-group-kill alene bruges ikke som kvittering.

Profilen har læseadgang til én lille, uforanderlig kontrolfil uden for dens skrivbare mapper. En anden kontrolfil er skjult. Hjælperen identificerer profilen gennem kernelens faktiske adgangsbeslutninger for disse to filer; den læser ikke processernes argumenter, miljø eller brugerfiler. En kvalificeret test viser, at processen ikke kan ændre kontrolfilen eller erstatte sin sandboxprofil. Hjælperen bruger macOS' private `sandbox_check`-API. Manglende API-/runtimekvalifikation stopper beskyttet kørsel; der findes ingen ubeskyttet reserve.

Arbejdsresultater må først udlæses til endelig gennemgang og godkendt writeback efter en vellykket stopkvittering. Stop ændrer ikke projektets almindelige plan-, værktøjs- eller datagodkendelser.

## Klargøring og pakning

`node privacy/isolation/prepare-helper.cjs` bygger den lille native hjælper eksplicit under udvikling. `runtime:prepare` gør det samme til den relevante macOS-arkitektur og medtager helper, kildehash og eksekverbar hash i runtimeinventaret. Appstart kompilerer eller downloader aldrig en erstatning.

Hjælperens eksekverbare Mach-O-indhold bindes til manifestet. Apple-signaturen og dens størrelsesfelter normaliseres ved hashberegningen, så normal pakkesignering kan ændre signaturblobben uden at ændre programmet. Kodesignaturen skal stadig verificeres separat. Alle øvrige programbytes og load commands indgår. Pakningen kontrollerer også den aktuelle C-kilde og medtager den i kildebeviset.

## Verifikation

`node --test tests/privacy-isolation-engine.test.cjs` afprøver både politik og rigtig native kørsel på Apple Silicon:

- den låste OpenCode 1.18.33 og den eksisterende OpenCodeEngine med read guard, guardian og en rigtig lokal session;
- tilladt gatewaykald og afvisning af andre loopbackporte, ekstern IPv4/IPv6, DNS og Unix-sockets;
- afvisning af originalfiler, symlinkomgåelse og læsning gennem underprocesser;
- Stop af en løsrevet, forældreløs skriver, mens en anden isoleret samtale fortsætter;
- afvisning af ændrede mapper, genbrug efter Stop, ændret hjælperkode og ændring af kontrolfil/profil;
- signering af hjælperen uden ændring af dens kvalificerede programindhold.

Disse prøver bruger syntetiske data og en kontrolleret lokal gateway. De beviser ikke en ekstern models kvalitet, en færdig DMG eller isolation på Windows/Linux. Den samlede appprøve skal desuden gennemføre rigtige lokale/cloud-sessioner, datakontrol, stop og godkendt writeback gennem produktets normale API.

## Beskyttet statisk kvalitetskontrol

`inspectProtectedApp` tager en begrænset, lokal kopi af `public/` og åbner den i en **separat Electron-proces** med `createOfflineRendererIsolation`. Inputkopien er skrivebeskyttet, og profilen giver **ingen netværksrettigheder**, heller ikke loopback, DNS eller UDP. Genereret JavaScript åbnes aldrig i hovedappens renderer. Værten sender først inspektionsopgaven gennem et privat pipe efter procesattestation.

Den separate proces genbruger de normale desktop-/mobilmålinger, tastaturprøver og begrænsede klik fra `app-quality.cjs`. Kun den faste rapport og to navngivne PNG-filer læses efter en verificeret kvittering om nul levende processer. Derefter fjernes den run-ejede inputkopi og browsertilstand. Ved ukendt stopkvittering deles intet resultat, og mappen genbruges ikke. Stop under en aktiv browserprøve afslutter også denne scope.

Chromiums egen indlejrede macOS-sandbox kan ikke etableres inde i den arvede Seatbelt-scope. Derfor startes kun denne separate, allerede OS-isolerede proces med `--no-sandbox`. Webindhold har fortsat ingen Node-/preload-API, vinduer og rettigheder afvises, og CSP/proxy er supplerende begrænsninger. Den afgørende netværksgrænse ligger i operativsystemet. De nødvendige GUI-rettigheder er begrænset til LaunchServices, WindowServer, processens egen PID-bundne Chromium-rendezvous-service samt `RootDomainUserClient` og `IOSurfaceRootUserClient`. Ingen generel Mach-adgang gives.

`tests/privacy-isolation-renderer.test.cjs` kvalificerer på macOS/arm64 med Electron 44.4.4:

- rigtige HTTP-/WebSocket-/WebRTC-forsøg uden CSP, proxy eller API-stubs i den negative fixture; TCP-/UDP-modtagerne registrerer nul trafik;
- blokeret Node-TCP/UDP, ekstern TCP, underprocessers læsning af originalfiler og skrivning til inputkopien;
- faktiske desktop-/mobilscreenshots, tastatur- og klikmålinger i en beskyttet scope;
- Stop af en aktiv separat browser og bevaret originalprojekt.

Dette genetablerer den automatiske **statiske kvalitetskontrol**, ikke en interaktiv livepreview. Apps med serverkode eller nødvendige eksterne ressourcer rapporteres fortsat som ikke fuldt undersøgt. Interaktiv beskyttet preview skal have en tilsvarende kvalificeret separat grænse, før den kan åbnes.

`createOfflineProcessIsolation` stiller samme nul-netværksgrænse til rådighed for værtsstyrede processer, uden rendererens GUI-rettigheder. Den kan begrænse eksekvering til `allowedExecutables` og eksplicit acceptere et eksisterende, ikke-gruppe-/verdensskrivbart projekts mappetilstand. Den indstilling bruges ikke for agentmotor eller renderer.
