# Teststatus før invitation

Senest kontrolleret 13. oktober 2026. Afsnittene er daterede, så tidligere begrænsninger kan læses i deres sammenhæng. Dette er status for den aktuelle arbejdsmappe, ikke en erklæring om, at alle installationsfiler eller modeller er klar. Der er ikke committet eller pushet i dette repository under denne gennemgang.

[Gennemgangen før offentlig beta](offentliggoerelse.md) samler historik- og logkontrol samt de lokale prøver af README, hjemmeside og udgivelseskontrol. Den offentliggør ikke appen og ændrer ikke installationsstatus nedenfor.

## Terminalpakke, platformsguides og GitHub-distribution · 13. oktober 2026

**Skrevet, enhedstestet og afprøvet med den faktiske lokale CLI-pakke på macOS arm64. Ikke offentliggjort eller afprøvet på Windows/Linux.** [Udgivelsesvejledningen](udgivelse-cli.md) beskriver det særskilte CLI-forløb. Desktopappens udgivelseskrav er bevaret.

- **35 relevante tests består:** CLI, udgivelsesregler og eksisterende Pages-/desktoprelease-kontrol. Nye negative prøver afviser ekstra/manglende filer, forkerte versioner, kladder, fremmede downloadadresser, ændrede hashværdier, symlinks og uventede arkivstier.
- **Den faktiske pakke er installeret separat på Mac.** Alle 93 installerede filer matcher både arkivet og kilderne. `doctor` finder Node 22.23.3, Git 2.50.1 og pakkens egen OpenCode 1.18.33. Terminalprøven gennemfører login, skjult nøgle, krypteret genåbning, plan, filændring, godkendelse, afvisning, preview, diff, stop, historik og en simuleret forbindelsesfejl. Modellen er en kontrolleret lokal server. Ingen betalte kald.
- **Udgivelsesstop er udløst på rigtige pakkefiler.** En beskidt arbejdsmappe, en pakke markeret `publishable: false`, en ændret Windows-vejledning og en ekstra fil afvises. Kilder og arkiv er kontrolleret før og efter pakning. Det er ikke en GitHub-kørsel eller en platformsinstallation på Linux.
- **Terminalsiden er set i browseren** ved 1280 og 390 pixels. Tre platformvalg, foldede detaljer, tastatur og reduceret bevægelse er kontrolleret. Ingen vandret rulning. Både den faktiske tomme releaseoversigt og en lokal visningsprøve med komplette metadata er afprøvet. Browserens download er dirigeret til den faktiske lokale npm-pakke og kontrolleret med SHA-256; det er ikke en offentlig GitHub-download.
- **GitHub er kun læst.** API'et viser ingen Releases og en Pages-adresse på `https://ai-alliancen-org.github.io/ai-harness/`. Alle fire workflows er YAML-kontrolleret og har kun `workflow_dispatch`. Det nye CLI-workflow er ikke kørt hos GitHub. Der er ikke startet CI, oprettet tags, uploadet filer, committet eller pushet.
- **Manglende prøver:** Windows i PowerShell/CMD udføres af brugeren efter [Windows-guiden](../cli/WINDOWS.md). Linux, macOS Intel, en almindelig ny bruger, faktisk offentlig download og Komplais produktionslogin mangler. Docker var ikke startet på denne Mac; der er ikke startet en Linux-maskine eller ændret infrastruktur.

Den lokale kandidat ligger i `dist/cli-distribution-2026-10-13/candidate-1/`. Npm-pakkens SHA-256 er `e0d09ca1f000034dcf4ca7ebd08cd231d79b77b9c982a1961c801abe8bd94b1d`. Den er mærket som en lokal prøve og kan ikke passere offentliggørelseskontrollen. Udgivelsen skal pakkes igen fra det gennemgåede, rene commit.

Lokal evidens: `/private/tmp/aura-distribution-unit.log`, `/private/tmp/aura-distribution-live.log`, browserbillederne `/private/tmp/aura-cli-page-desktop.png` og `/private/tmp/aura-cli-page-mobile.png`. Terminaludskriften ligger i `aura-cli-real-EKPxFX` under macOS' midlertidige mappe.

## Komplai API-token og Windows-prøve · 13. oktober 2026

**Skrevet, enhedstestet og afprøvet i Electron med rigtig OpenCode, faktiske projektfiler og en kontrolleret lokal Komplai-server. Ikke afprøvet mod Komplais produktions-API.** App og CLI har API-token som alternativ til browserlogin. [API-kontrakten](komplai-api-token.md) angiver den nødvendige metadataudvidelse; klienten afviser tilslutning, hvis API'en endnu ikke leverer den.

- **36 relevante enhedstests består.** De omfatter eksisterende PKCE-login, tokenkontrol, CLI-login, krypteret lagring, forkert adgang, manglende rettigheder, udløb, annullering og ændret organisation/kontrakt/vilkår. Fjernelse af et manuelt token kalder ikke serverens tilbagekaldelse; browserlogin beholder den tidligere adfærd.
- **Electron-prøven består.** En forkert nøgle, manglende API-metadata, read-only-adgang og ændret kontrakt bliver afvist gennem brugerfladen. Derefter gennemføres gyldigt token, valg af model, filgodkendelse, faktisk filændring, preview og forbrug i DKK. Tilslutning bruger kun GET-kald og ingen inferens. Tokenet kan fjernes lokalt, også når serveren bagefter afviser det.
- **Brugerfladen er set og målt.** Komplai-området går fra ét valg og 19 ord til to valg og 14 ord. Tokenindtastning har ét felt og to valg; gennemgangen har tre valg inklusive datavilkår. Tallene omfatter forbindelsens indhold, ikke appens navigation. Tastaturfokus, reduceret bevægelse og 980 × 720 er kontrolleret. En person uden teknisk baggrund har endnu ikke afprøvet denne ændring.
- **Nøglebeskyttelse:** Enhedstestene bruger CLI'ens rigtige kryptering. Electron-prøven erstatter systemets nøglebeskyttelse med en syntetisk testadapter og er ikke en Keychain-/DPAPI-prøve. Ingen rigtige tokens eller kreditter er brugt.
- **Windows:** [Vejledningen](../cli/WINDOWS.md) dækker lokal installation, PowerShell og CMD, mapper med mellemrum, skjult indtastning, plan/byg, afvisning, Ctrl+C, preview, genåbning og rapportering. Brugeren udfører platformsprøven; Windows og Linux er fortsat uprøvede for denne CLI.
- **Den konkrete CLI-pakke er installeret og kørt på macOS arm64.** Alle 91 pakkede og installerede filer matcher arbejdsmappen byte for byte. `doctor` finder pakkens OpenCode 1.18.33, Node 22.23.3 og Git. Den installerede CLI har gennemført plan, godkendt ændring, afvisning, Ctrl+C, preview, genåbning af det krypterede lager og en simuleret forbindelsesfejl i en rigtig terminal. Denne terminalprøve bruger en kompatibel lokal modelserver; det nye Komplai-tokenforløb er særskilt enhedstestet i CLI og gennemført i Electron.
- **Installationsfejl fanget:** Den første installation manglede motoren, fordi npm udelod en valgfri afhængighed. Eksplicit installation viste `ENOSPC`. Efter oprydning i vores midlertidige testinstallationer blev pakken installeret på ny med motoren og bestod prøven. Derfor indgår `doctor` som et påkrævet trin i Windows-vejledningen. Det er ikke dokumentation for en fejlfri installation på andre maskiner.

Lokal testpakke: `dist/cli-token-2026-10-13/aura-cli-windows-test.zip`. Den indeholder npm-pakken, Windows-vejledningen, kildefingeraftryk og kontrolsummer. Npm-pakkens SHA-256 er `ea55ca5e48e769be975adefe441cf53dfb89d54b6f2bc9805028dd40ef73cf27`. Der er endnu ingen offentlig download af denne CLI-pakke.

Lokal evidens: `/private/tmp/aura-token-unit-final.log`, `/private/tmp/aura-token-ui.log`, `/private/tmp/aura-token-measure.log` og `/private/tmp/aura-token-packaged-live.log`. Electron-skærmbillederne ligger i `aura-token-ui-bExCL4`, før/efter-målingen i `aura-token-measure-R2FPeD` og terminaludskriften i `aura-cli-real-QNYZFn` under macOS' midlertidige mappe. Ingen commits, push, Actions, publicering eller nye desktopinstallationsfiler er udført i denne milepæl.

## Aura CLI og nøglebeskyttelse på tværs af systemer · 13. oktober 2026

**Skrevet og enhedstestet; terminalforløbet er afprøvet på macOS med rigtig OpenCode og faktiske projektfiler. Ingen offentlig CLI-udgivelse.** CLI'en deler kodeagent, modelforbindelser og skills med desktopappen. Den kan åbne og oprette projekter, planlægge, bygge med godkendelser, vise preview i browseren, genåbne samtaler og gennemgå Git-versioner. Installationsvejledning og platformskontrol står i [CLI-vejledningen](../cli/README.md).

- **Nøglelager:** CLI'en bruger AES-256-GCM med scrypt og en adgangssætning, som indtastes skjult og ikke gemmes. Faktisk kryptering, genåbning, forkert adgangssætning og ændret krypteret indhold er afprøvet. Desktopappen beholder Keychain på macOS, DPAPI på Windows og systemets nøgletjeneste på Linux. En ny kontrol afviser Electrons usikre Linux-fallback `basic_text`; testen udløser afvisningen, selv når Electron melder kryptering tilgængelig.
- **Fælles funktioner:** Tests bruger faktiske mapper med mellemrum, kladder, regler, preview og versionsgemning/gendannelse. Commits oprettes kun i nye isolerede repositories med syntetiske filer. Hostingens gennemgang og afvisning er afprøvet med en simuleret adapter; der er ikke uploadet til Vercel eller Azure.
- **Testresultater:** Den samlede suite har 246 tests. 243 bestod i den sidste samlede kørsel; tre Git-tests blev afbrudt af manglende diskplads. Efter fjernelse af denne prøves genhentelige motorkopi bestod alle syv Git-tests ved genkørsel. De 17 CLI-tests består, herunder afviste nøglelagre, stop under forberedelse og korrekt ændringsantal efter en afvist opgave. Den foregående samlede suite bestod med 245 tests før tilføjelsen af den sidste regressionstest.
- **Pakning:** En lokal npm-pakke indeholder CLI, fælles motorkode og instruktionspakke 0.2.1. Native OpenCode-pakker er låst til 1.18.33 for macOS, Windows og Linux på x64/arm64 samt Linux med musl. Pakkens installerede Mac-variant har bestået `doctor` med Node 22.23.3 og bruger sin egen motorafhængighed. Installation af Codex-regler fra en pakket CLI er afprøvet i et separat projekt.
- **Installeret pakke afprøvet:** En rigtig terminal gennemførte skjult nøgleindtastning, plan, godkendt filændring, HTTP-preview, afvist ændring, diff, Ctrl+C, en ny opgave efter stop, afslutning/genåbning, oplåsning og en simuleret HTTP 401-fejl. Der bruges rigtig OpenCode og en kontrolleret lokal modelserver. Kaldets fælles regler, uændrede filer efter afvisning og fravær af nøgler/adgangssætning i terminaludskriften kontrolleres. En tidligere gentagelse ramte også fuld disk; den endelige installerede pakke bestod hele prøven efter oprydningen. Det er ikke en prøve med en rigtig ekstern AI-model.
- **Begrænsninger:** Windows CMD/PowerShell, Linux, Intel-Mac og Windows arm64 er ikke kørt på målplatformene. Der er ingen ny prøve med en rigtig AI-udbyder, Komplais produktionslogin eller kreditforbrug. Komplai-login deler desktopappens PKCE-forløb og kræver browser-callback på samme maskine; login fra en fjern SSH-maskine er ikke et understøttet device flow. CLI'ens samtalehistorik og projektfiler er ikke krypteret af nøglelageret.

Der er ikke ændret i Komplais repository, publiceret til npm eller startet GitHub Actions, commits, push eller deployment i denne milepæl. Næste platformsprøve skal installere den konkrete CLI-pakke på Windows og Linux og gennemføre login, plan, godkendt/afvist ændring, Ctrl+C, preview og genåbning.

Lokal evidens: `/private/tmp/aura-cli-unit-node22-final.log`, `/private/tmp/aura-cli-git-retry.log` og `/private/tmp/aura-cli-packaged-retry.log`. Den gennemgåede terminaludskrift ligger i prøvemappen `aura-cli-real-RFNPDu` under macOS' midlertidige mappe. Pakken er `/private/tmp/aura-cli-package/candidate-3/aura-harness-0.2.0-beta.6.tgz`, SHA-256 `2aeb89bcb7cce5863bdc02319d94095193e9066a609cd151b7035195ae773b59`. ZIP-pakkernes bytekontrol er kørt med repositoryets Node 22.23.3; Node 26 gav et andet komprimeringsresultat og bruges ikke som grundlag for den kontrol.

## Instruktionspakke 0.2.1: fire sikkerhedstilføjelser · 13. oktober 2026

**Skrevet, enhedstestet og installeret gennem appen i et isoleret projekt. Ikke offentliggjort.** De eksisterende skills er udvidet med kontrol af afhængigheders oprindelse, konkrete adgangsprøver mellem brugere og organisationer, gennemgang af agenters/MCP-værktøjers/hooks' rettigheder samt dokumentation af fund og godkendelser for den faktisk kontrollerede version. Der er fortsat 12 grundlæggende skills og to valgfrie integrationer. Ingen scannere eller eksekverbare scripts er tilføjet.

- **Enhedstestet:** 29 relevante tests består for bibliotek, ZIP-pakker, installation, valgfrie funktioner og skills. De kontrollerer blandt andet referencer, filindhold, manifest og kontrolsummer samt bevarelse af brugerens egne filer. Alle 23 downloadpakker er genereret som version 0.2.1.
- **Kørt i Electron:** Værktøjsforløbet installerer den nye reference `agentadgang.md` med byteidentisk indhold. Eksisterende projektregler bevares; gentagen installation og afinstallation med brugerændringer er afprøvet. Den udvidede sikkerhedsbeskrivelse er åbnet og visuelt gennemgået i appen. Git-commits forekommer kun i prøvens isolerede repository med syntetiske filer.
- **Webguide afprøvet:** Fem sider ved to skærmbredder, 83 lokale links og begge hovedforløb består uden sidefejl, unavngivne betjeninger eller vandret overløb. Det er en lokal prøve, ikke kontrol af en ny offentlig udgivelse.
- **Begrænsning:** Kontrollerne dokumenterer pakkernes indhold og installation, ikke at en rigtig model følger alle instruktionerne eller opdager konkrete sårbarheder. Ingen eksterne modelkald eller sikkerhedsscanning af en brugers projekt er gennemført. Skills er vejledning, ikke teknisk håndhævelse eller GDPR-godkendelse.
- **Installationsfiler skal genbygges:** Arbejdsmappen og de nye webpakker bruger 0.2.1. De allerede byggede beta.6-installationsfiler nedenfor indeholder fortsat 0.2.0 og skal genbygges og kontrolleres før udgivelse. Ingen commits, push, GitHub Actions eller offentliggørelse er foretaget.

Lokal evidens: `/private/tmp/aura-skills-021-unit.log`, `/private/tmp/aura-skills-021-tools.log` og `/private/tmp/aura-skills-021-web.log`. Skærmbilledet af den ændrede sikkerhedsbeskrivelse ligger i prøvemappen `harness-vaerktoejer-pqwoHg/02b-sikkerhedsskill.png` under macOS' midlertidige mappe.

## Beta.6: installationsfiler og udgivelsesvej · 13. oktober 2026

**Bygget og afprøvet lokalt med faktiske installationsfiler. Ikke offentliggjort.** Tre nye filer ligger i `desktop/release/beta.6/downloads/`: Mac med Apple Silicon, Intel-Mac og Windows x64. De indeholder Komplai-integrationen. Tidligere pakker er bevaret. [Udgivelsesvejledningen](udgivelse.md) beskriver de resterende trin; [udgivelsesnoterne](releases/0.2.0-beta.6.md) er en kladde.

- **Skrevet og enhedstestet:** 18 relevante tests består for pakning, downloadoversigt, Pages og udgivelseskontrol. Blandede versioner, manglende eller ekstra filer, ugyldige kontrolsummer, ændret filindhold, manglende Mac-kvitteringer og ufuldstændig Komplai-konfiguration afvises. En mislykket kontrol af blandede versioner bevarer den eksisterende filoversigt.
- **Faktisk pakkeindhold kontrolleret:** 66 kilde-/metadatafiler og 27 profilfiler matcher arbejdsmappekoden i begge monterede Mac-diskbilleder og i Windows-installationsprogrammets udpakkede indhold. Runtime-manifesterne matcher de fastlåste værktøjer: Node 22.23.3, Git 2.53.0 og OpenCode 1.18.33. Kontrollen afviste desuden en faktisk beta.5-app som forkert version. Dette er indholdskontrol, ikke en uafhængig sikkerhedsgennemgang af alle medfølgende programmer.
- **Mac-signering:** Begge apps inde i diskbillederne består den strenge signaturkontrol med Developer ID og Team ID `2UX98897JW`. Beta.6 er endnu ikke notariseret. Ingen filer er indsendt til Apple i denne milepæl. Downloadoversigten viser derfor ikke pakkerne som notariserede, og udgivelseskontrollen afviser den aktuelle filoversigt.
- **Pakket Apple Silicon-app afprøvet:** Oprettelse af projekt, faktisk forhåndsvisning og manuel versionsgemning består med isolerede appdata og de medfølgende værktøjer. Git-commits forekommer kun i prøvens nye repository med syntetiske filer.
- **Byggeforløb i den pakkede app:** Rigtig OpenCode og en kontrolleret lokal modelserver gennemførte plan uden filændring, godkendt kodeændring, fungerende preview med filtrering, mobilvisning, en efterfølgende ændring og gendannelse til de oprindelige filbytes. Første forsøg stoppede med timeout under opsætningen; en gentagelse bestod uden ændring af appkoden. Årsagen til første stop er ikke fastslået. Prøven logger nu fejlkontekst i kontrolleret tilstand. Dette er ikke en rigtig Komplai- eller modelprøve.
- **Downloads afprøvet:** En lokal browser hentede alle tre faktiske installationsfiler og kontrollerede filnavn, størrelse og SHA-256. De ekstra downloadkopier blev slettet efter kontrollen. Den lokale downloadside er afprøvet på både bred og smal skærm.
- **Pages afprøvet:** Fem sider i to skærmbredder, 83 lokale links og begge hovedforløb består uden sidefejl eller vandret overløb. Det er prøvet både med GitHubs faktiske tomme Release-liste og med en lokal prøveudgivelse baseret på de tre filers faktiske metadata. Sidstnævnte er kun en visningsprøve, ikke en offentlig Release. Downloadsidens desktop- og mobilbilleder er gennemgået.
- **Manuel offentliggørelse:** Det nye Release-workflow og de eksisterende bygge-/Pages-workflows har kun manuel start. YAML og kommandosyntaks er kontrolleret lokalt. Udgivelseslogikken er afprøvet med lokale filer; selve workflowet har ikke kørt hos GitHub. Ingen Actions-minutter, tags, Releases, commits, push eller deployment er startet herfra.
- **Eksterne forudsætninger:** GitHub viste fortsat ingen Releases. Et faktisk læsende kald til `https://api.komplai.dk/v1/aura/config` gav HTTP 404, som udløste den nye kontrol og stoppede den. Komplais produktionslogin, modelkald og kreditregnskab er endnu ikke afprøvet. De tidligere kendte afhængighedsfund er ikke rettet af denne pakning og skal vurderes inden offentliggørelse; se [demogennemgangen](demogennemgang.md).

**Mangler før kollegaprøven:** Apple-notarisation af de endelige Mac-filer, rigtig Komplai-prøve, offentlig Release og Pages-download samt installation og opdatering på testernes maskiner. Intel-Mac og Windows er ikke kørt på deres målplatforme i denne milepæl. Windows-filen er usigneret. Appen er ikke observeret hos en ny bruger.

Lokal evidens: `/private/tmp/aura-beta6-unit-final.log`, `/private/tmp/aura-beta6-package.log`, `/private/tmp/aura-beta6-controlled-retry.log`, `/private/tmp/aura-beta6-download.log`, `/private/tmp/aura-beta6-web-final.log` og `/private/tmp/aura-beta6-web-actual.log`. Loggen for første afbrudte byggeprøve er `/private/tmp/aura-beta6-controlled.log`. Installerne, filoversigten og kontrolsummerne ligger i den ignorerede mappe `desktop/release/beta.6/downloads/`.

## Komplai-login og organisationens kreditter · 13. oktober 2026

**Implementeret i Aura og Komplais backend; afprøvet lokalt med faktiske filer og isoleret kreditregnskab. Ikke deployet.** Komplai ligger under **Vælg en anden**. Brugeren logger ind i systembrowseren, vælger organisation og bekræfter brug af dens fælles AI-kreditter. Modeller, kundetakster i DKK og datavilkår kommer fra Komplai. Ingen Scaleway-nøgle indtastes i Aura, og der er ingen automatisk ændring af model eller betalingsform.

- **Enhedstestet:** Auras samlede suite bestod med 217 tests. Efter de sidste rettelser består de 27 relevante Komplai-/workbench-tests, herunder syv direkte Komplai-prøver af PKCE, afbrydelse, nøglelagring, organisationsbinding, vilkår, afregningsvisning, begrænsede svar og logoutfejl. Komplais 57 relevante enhedstests består: kodeprotokol, modelprofiler, kreditregnskab og eksisterende chat.
- **Kørt med rigtig API og database:** Ni integrationsprøver består mod Fastify, PostgreSQL og OpenFGA. De afviser også signerede login-tokens uden udløb eller brugeridentitet samt forkert udsteder, audience og udløbne tokens. Forkert klient og organisation, manglende bekræftelse, dubletter, ændrede priser og fjernet organisationsadgang afvises. Cachetakst, fælles saldo og samtidige reservationer er kontrolleret. Afbrudte svar bevarer en usikker reservation. Logout virker også efter udløb eller fjernet adgang. En bevidst fjernet databasebegrænsning udløser migrationskontrollen; transaktionen rulles bagefter tilbage.
- **Kørt i Electron med rigtig OpenCode:** Browser-callback, organisationsvalg, filgodkendelse, faktisk filændring, preview, afvisning, Stop og logout er gennemført i et isoleret projekt med mellemrum i navnet. Forbrug vises i DKK, og adgangsnøglen findes ikke i brugerfladens tekst. Projektet indeholder kun syntetiske filer. Der er ikke oprettet commits.
- **Set i appen:** Komplai-login og organisationsvalg har hver sit trin. Organisationsformularen har fire synlige betjeninger: valg af organisation, bekræftelse, Afbryd og de foldede datavilkår. Afbryd efter login og efterfølgende nyt login er prøvet i Electron. Kodeændringen er vist i forhåndsvisningen. Der er endnu ingen observation af en ny bruger.
- **Konfiguration kontrolleret:** Typekontrol af Komplais delte API-kode og API-tjeneste er genkørt og består; Hub bestod ved den foregående kontrol. Terraform-konfigurationen består `validate` med den fastlåste Zitadel-provider. En efterfølgende læsende produktionsplan med mål `zitadel_application_oidc.aura` viser én oprettelse af Aura-klienten og ingen andre ressourceændringer. Der er ikke kørt `apply`.
- **Afgrænsning:** Loginudsteder og Scaleway-model er simulerede. Kryptering bruger en testudgave af nøglelageret, ikke den rigtige macOS-nøglering. Windows, pakket app, rigtigt Zitadel-login og konkrete Scaleway-modeller er ikke afprøvet i denne milepæl. Den lokale databaseprøve udelader Index-migrationen, der kræver pgvector, og er ikke en samlet migrationsgodkendelse af Komplai. Der er ingen eksterne modelkald, betalingsforbrug, ændringer af Zitadel, GitHub Actions eller deployment.

**Forbrugsloft og datavisning:** De syv Komplai-enhedstests og fire nye prøver af loftet på 10 kr. består. Beløbsgrænsen er udløst med et kald, som ville overskride loftet; kaldet når ikke transporten. Den samme kontrol er koblet ind i den gennemførte Electron-prøve. Komplai står i det korte resumé; Scaleway, Hetzner, behandlingssteder og fulde priser kan læses i de udvidede oplysninger. De lange prisoplysninger ombrydes nu, og ændrede datavilkår kræver stadig ny godkendelse. Skærmbilledet er gennemgået.

**Almindeligt medlem:** Alle ni integrationsprøver er desuden gennemført med rollen `member`, tildelt Chat-adgang og organisationens aktiverede kodeprofil. Login, filændring og kreditafregning i Electron krævede ikke organisationsadministratorrettigheder. Dette er afprøvet med en syntetisk konto; Sebastians faktiske konto er ikke oprettet eller inviteret herfra.

Evidens: `desktop/tests/komplai.test.cjs`, `desktop/tests/komplai-live-budget.test.cjs`, `desktop/scripts/verify-komplai.cjs` og Komplai-repositoryets `packages/api-access/src/aura-http.integration.test.ts`. Den seneste gennemførte Electron-prøve har screenshots under `/private/var/folders/q9/914lvw356897pk8pb_29flv00000gn/T/aura-komplai-desktop-cxbnC6/`; datavisningen er visuelt gennemgået fra den forudgående prøve i `aura-komplai-desktop-qke3WC/`. Enhedslogs fra de tidligere kontroller ligger i `/private/tmp/aura-komplai-unit.log` og `/private/tmp/aura-komplai-targeted.log`.

Før rigtig brug skal Komplais offentlige Aura-loginapp oprettes, backend udgives og organisationens coding-adgang, modeller og datavilkår aktiveres. Opsætningen står i Komplai-repositoryets `docs/AURA.md`. Pakker fra før beta.6 indeholder ikke denne milepæl; de nye lokale beta.6-filer er beskrevet ovenfor.

### Første kollegaprøve på Mac og Windows

Download skal ske fra GitHub Pages, som linker til installationsfilerne i GitHub Releases. Den læsende kontrol 13. oktober fandt Pages konfigureret på `https://ai-alliancen-org.github.io/ai-harness/`, men ingen Releases. Komplais offentlige `/v1/aura/config` svarede 404. Den rigtige login- og modelprøve er derfor endnu ikke gennemført.

1. Udgiv Komplais Aura-login og API, og kontroller dem med en rigtig konto og den aftalte model. Den særskilte automatiske prøve har et loft på 10 kr.; almindelig appbrug har ikke dette personlige loft.
2. Invitér testeren som almindeligt medlem af Komplai. En e-mailadresse på `komplai.dk` er ikke en adgangstildeling. Kontroller kontoens organisationsmedlemskab og appadgang samt organisationens godkendelse af kodeværktøjer, modeller og kreditter.
3. Byg og kontroller en ny Mac- og Windows-pakke med integrationen, publicér dem på Releases, og opdater Pages gennem den godkendte udgivelsesvej. Test den faktiske download fra en browser uden GitHub-login. Ingen workflow eller publicering startes automatisk.
4. Lad testeren installere, forbinde Komplai, bygge og ændre en side med opdigtede data, lukke appen, fortsætte projektet og logge ud. Kontroller forbruget i Komplais regnskab. Notér appversion, operativsystem og det trin, hvor hjælp var nødvendig; del ingen tokens eller private projektfiler.

Planen er ikke en installationsgodkendelse. Rigtigt OAuth-login, betalt modelkald, Mac-/Windows-installation og observation af testeren mangler fortsat.

## Installationskontrol før invitation · 10. oktober 2026

**Tre lokale installationsfiler til beta.5 er bygget. De er ikke publiceret.** De ligger i `desktop/release/beta.5/downloads/` sammen med en downloadside, `release.json` og kontrolsummer. Windows er usigneret og endnu ikke installationsafprøvet. Intel-Mac kræver fortsat kontrol på en rigtig Intel-Mac. Rigtig modelprøve og testerens downloadadgang mangler også.

- **GitHub-kørsler er stoppet efter brugerens besked om forbrug.** Kørsel [38084418217](https://github.com/ai-alliancen-org/ai-harness/actions/runs/38084418217) på commit `2eedb27` blev afbrudt. Den nåede 210 beståede enhedstests på hver Mac-type og 207 beståede plus tre platformsbestemte overspringninger på Windows, uden testfejl. Apple Silicon nåede også pakket app, gendannelse, kontrolleret byggeforløb og demo; upload fejlede på lagerkvoten. Intel- og Windows-jobbene blev stoppet under pakning. Ingen nye byggearkiver blev gemt.
- **Ingen automatisk CI/CD:** Pages er deaktiveret på GitHub. Begge workflowfiler har nu kun `workflow_dispatch`; en konkret kørsel eller genaktivering kræver brugerens udtrykkelige tilladelse. Der startes ikke en kørsel alene på baggrund af ønsker om installation eller færdiggørelse. Lokale bygninger bruger ingen Actions-minutter.
- **Fire gamle byggearkiver er slettet med brugerens tilladelse.** Alle fire ZIP-filer blev først kontrolleret for størrelse, SHA-256 og indhold. GitHubs artefaktliste var derefter tom. Kopierne ligger nu i `desktop/.cache/actions-archive-2026-10-10/`, med `manifest.json`; de er flyttet fra den tidligere midlertidige mappe. Sletningen frigør lagerplads, ikke allerede brugte minutter.
- **Windows x64 er krydsbygget lokalt.** Den egentlige NSIS-installationsfil er pakket ud og kontrolleret; appen, ASAR og medfølgende Git, Node og OpenCode matcher byggeoutputtet. Alle 91 kontrollerede kilde- og profilfiler matcher repositoryet. OpenCode er 1.18.33, Node 22.23.3 og Git 2.53.0. Det er en filkontrol på Mac, ikke installation, første start eller opdatering på Windows. Filen er usigneret.
- **Apple Silicon-appen er signeret og notariseret.** Apple godkendte den første beta.5-DMG under `a07436f2-1508-4ae0-933f-9106ed8a2f94`. En efterfølgende kontrol fandt, at appen inde i diskbilledet manglede sin egen billet: `syspolicy_check` gav `Notary Ticket Missing`, selv om Gatekeeper accepterede signaturen. Billetten er nu også vedhæftet appen, som er pakket igen uden ændring af appkode eller signatur. Appen inde i den nye DMG består `codesign --verify --deep --strict`, `stapler validate`, Gatekeeper og `syspolicy_check distribution`. Ingen sikkerhedsindstillinger er ændret. Diskbilledet er bevidst ikke separat kodesigneret; en `spctl`-kontrol af diskbilledets primære signatur svarer derfor `no usable signature` og erstatter ikke kontrollerne af appen og notariseringsbilletten.
- **Den nye Apple Silicon-DMG afventer sin egen kvittering:** indsendelse `763936d3-5882-4a06-a9f5-b335c224ebb0`. Appens billet er vedhæftet og kontrolleret; downloadoversigten kalder først selve DMG-filen notariseret, når dens kvittering matcher dens aktuelle SHA-256. Status og filhash er gemt i `desktop/release/beta.5/apple-silicon/notary-*.json`.
- **Intel-Mac er bygget og signeret.** Samme 91 kilde-/profilfiler og fastlåste værktøjer er kontrolleret. `test:package` består under Rosetta med isolerede data, preview og lokal versionsgemning. OpenCode advarer om manglende AVX under emulering. Den efterfølgende kontrollerede byggeprøve blev afbrudt efter manglende fremdrift og endte med `page.click: Timeout 20000ms exceeded`; gendannelse og demo er derfor ikke verificeret i denne lokale Intel-pakke. Prøvens egne appdata blev slettet ved afslutning, og dens resterende testvindue blev lukket. Det er ikke bevis for en fejl på Intel-hardware, men heller ikke en installationsgodkendelse. Apples første indsendelse er `77094b83-93ac-47bb-a50c-a451235988c5`; appens billet og den endelige pakning skal kontrolleres efter Apples svar.
- **Downloadkontrollen prøver nu alle filer.** Alle tre faktiske installationsfiler er hentet i Chrome via lokal HTTP og sammenlignet på navn, størrelse og SHA-256; computer- og mobilvisningen består. En bevidst forkert kontrolsum på Windows-linket giver fejlstatus, også når første link er korrekt. Tekniske filnavne og kontrolsummer ligger under “Se detaljer”, og knapperne angiver Apple-chip, Intel eller Windows. Det er fortsat en lokal side, ikke et eksternt downloadlink.
- **Værktøjskontrollen kan ikke vente ubegrænset.** `test:package` afbryder versionskontrollen af et medfølgende værktøj efter 30 sekunder. Beskyttelsen er udløst med en faktisk proces, der ikke svarede; prøven fejlede med `ETIMEDOUT`. Seks pakkeenhedstests består, og den endelige Apple Silicon-app består den positive `test:package` med tidsgrænsen aktiv. Tidsgrænsen ændrer testværktøjet, ikke appens agentmotor.

Den allerede afprøvede Apple Silicon-app har gennemført `test:package`, `test:live-app --controlled`, `test:recovery` og `test:demo` med rigtig OpenCode, faktiske filer og en kontrolleret lokal model. Den kontrollerede prøve dækker plan, bygning, filtrering, rettelse, byteidentisk fortrydelse, fejl og genåbning. Ingen ekstern modelbetaling eller observation af en ny bruger er gennemført her.

Evidens ligger under `desktop/release/beta.5/`: `windows/inputs.json`, `windows/installer-check.json`, `intel/inputs.json`, Intel-prøvernes logs, `apple-silicon/final-dmg-check.json`, `download-check.log`, `download-negative.log` og `timeout-check.log`. `downloads/release.json` angiver de aktuelle filstørrelser og kontrolsummer. Indsendelser skal følges via deres eksisterende ID'er, ikke sendes igen. Efter stapling skal den ændrede DMG kopieres til downloadmappen, dens kvittering følge med, og filoversigt samt downloadkontrol køres igen.

Der er ingen publiceret Release eller bekræftet adgang fra en testers konto. Installation og opdatering på andre computere, en rigtig modelopgave og feedback fra en ny bruger mangler fortsat. Den tidligere beskrevne afhængighedsbegrænsning gælder stadig; funktionstests og Apple-notarisation er ikke en samlet sikkerhedsgodkendelse.

## Tre konkrete prøver før udsendelse · 8. oktober 2026

**De tre eksterne prøver er ikke alle gennemført.** En ny signeret beta.4 er bygget og kørt på udviklermaskinen; rigtig Corti, notarisation, en anden Mac og testerens egen downloadadgang kræver fortsat den konkrete adgang. Ingen pakke er publiceret, og repositoryets synlighed er uændret.

1. **Corti S1: skrevet og prøvet med kontrollerede svar, afventer nøgle til rigtig model.** `test:live-app` er opdateret til den aktuelle brugerflade og understøtter en konkret pakket app. Prøven opretter et isoleret, fiktivt projekt og gennemfører idé → plan → godkendt bygning → filtrering ved 1/5/9/99 deltagere → AI-rettelse af overskrift → gennemgået Fortryd. Alle medtagne projektfiler skal derefter være byteidentiske med før rettelsen, og filteret prøves igen i preview. Planen må ikke ændre filer. Opstarts-/værktøjsfejl og manglende filændringer giver fejlstatus; ingen succes udledes af alene en afsluttet samtale. Screenshots tages fra det faktiske Electron-vindue. Nøglen indtastes direkte i isoleret Aura, aldrig i chat eller terminal, og prøvens appdata slettes ved afslutning.

   Forløbet består både fra kildekoden og i den signerede pakke med **rigtig OpenCode, faktiske filer og en lokal kontrolleret model**, inklusive mobilbredde. Fem eksplicitte kontrolpunkter består. En særskilt kørsel med bevidst HTTP 401 giver exit 1 og en `run.review` med `status: error`, `failure.kind: key` og nul ændrede filer. Fejlbeskyttelsen er dermed udløst af et faktisk modelsvar. Det er ikke Corti-kvalitet eller en rigtig Corti-opgave. Corti-vinduet er klargjort ved nøgleindtastningen; modelkørslen er ikke gennemført uden brugerens adgang.

2. **Mac: bygget, signeret og kørt lokalt; notarisation og anden Mac afventer.** Kandidaten ligger i `/private/tmp/aura-pilot-signed.gmjWDz/` og er bygget med den dokumenterede identitet `Developer ID Application: mekbas IVS (2UX98897JW)`. `codesign --verify --deep --strict` består med faktisk nøgleringsadgang, og signaturen har TeamIdentifier `2UX98897JW`, hardened runtime, tidsstempel og bundne ressourcer. Gatekeeper-kontrollen afviser den med `Unnotarized Developer ID`: signering er ikke Apple-notarisation. `notarytool history` med den aftalte profil `ai-harness-notary` svarer, at profilen ikke findes. Ingen notarisation er indsendt. Den historiske HTTP 403 nedenfor er ikke denne prøves aktuelle resultat.

   `test:package` består med isolerede appdata og begrænset PATH: medfølgende Node/Git/npm/OpenCode, syntetisk projekt, preview og versionsgemning. Den monterede DMG er kontrolleret skrivebeskyttet: app-ASAR, executable, Info.plist og runtime-manifest matcher den afprøvede app, og den monterede apps signatur består. 103 fulgte byggeinputs matcher den tidligere kandidat; app-ASAR er byteidentisk med den fuldt afprøvede beta.4. Dette er fortsat samme udviklermaskine, ikke installation på en anden Mac uden udviklingsværktøjer. Der er ikke nulstillet nøglering eller omgået Gatekeeper.

3. **Download: faktisk lokal browserdownload består; ekstern testeradgang afventer.** Browseren henter den nye signerede DMG gennem lokal HTTP, og SHA-256 matcher `release.json`; computer- og mobilvisning består. GitHub main peger på `df681eb7b7d23df46b7ad26d39d73396a0b4886f`, repositoryet er privat, og der er nul Releases. Den anonyme releaseadresse svarer HTTP 404. Seneste vellykkede pakkeworkflow er [kørsel 36470547106](https://github.com/ai-alliancen-org/ai-harness/actions/runs/36470547106) fra `b5a83bf548f7d495bd9f32c6110d75bb278b0d43`, ikke det aktuelle commit. En lokal download eller vedligeholderens GitHub-adgang dokumenterer ikke en testpersons adgang. Der mangler en faktisk distributionsadresse og en prøve med testerens egen konto; ingen publicering eller ændring af adgang er foretaget.

**Ny signeret DMG:** `Aura-0.2.0-beta.4-mac-arm64.dmg`, 312.305.482 bytes, SHA-256 `54ddb07db123a29d1c54ee7af1085951afe1097c6a72be7f7a188623d63a905b`. ZIP: 304.401.397 bytes, SHA-256 `f4052c3f723d8405d4a18edff7b18d6973699dfb8b27778810037502f0f50fb3`. Begge er endnu uden notarisation. En senere Apple-billet ændrer DMG-filen og kræver frisk kontrolsum og downloadoversigt. Afhængighedsbegrænsningen fra demogennemgangen gælder også den signerede kandidat: signering afhjælper ikke biblioteket i medfølgende npm.

**Evidens:** `/private/tmp/aura-pilot-live-controlled-2.log`, `/private/tmp/aura-pilot-pack-controlled.log`, `/private/tmp/aura-pilot-pack-rejected.log`, `/private/tmp/aura-pilot-package.log`, `/private/tmp/aura-pilot-download.log` og kandidatens `build.log`, `release.json`, `mounted-test.json`. De kontrollerede forløbsrapporter og vinduesbilleder ligger i `/private/var/folders/q9/914lvw356897pk8pb_29flv00000gn/T/aura-rigtig-model-{34aSBe,fLhgN0,C1XY4R}/resultat/`; sidste mappe er den bevidste fejlprøve. Corti-prøvens log er `/private/tmp/aura-pilot-corti-live.log`; en rapport tæller først som rigtig model-evidens, når hele prøven har afsluttet. Den første kontrollerede kørsel fandt en ventefejl i prøven: en kompatibel forbindelse har ikke automatisk valgt model. Prøven vælger nu eksplicit testmodellen før afsendelse, og den afsluttende kørsel består.

## Demogennemgang og lokal beta.4 · 7. oktober 2026

Den samlede [UI/UX-gennemgang](demogennemgang.md) og det korte [materiale til testpersoner](demo-til-testere.md) er skrevet. Gennemgangen omfatter opstart, AI-adgang, idé, plan, godkendelser, rettelser, fortrydelse, genoptagelse, samtidige samtaler, deling, data, hjælp, hjemmeside og pakning. Første runde er fortsat aftalt til Mac og Corti S1. Brugerobservationen gennemføres som del af piloten; den er endnu ikke udført.

- **Skrevet og kørt i Electron:** Vælg AI og Send uden forbindelse går direkte til guiden, og Vælg senere bevarer kladden. Dialogtitler følger det synlige trin; featurekontakter og automatisk versionsgemning har navne. Escape fra Hjælp giver fokus tilbage til en synlig åbner. Før du sender forklarer den fortsatte sessions tidligere beskeder/værktøjsresultater; tilvalget er en ekstra historikkopi, og en plan påstås ikke sendt, før den findes. Hjælp har en foldet førstegangsvejledning, og app/installationsside følger eksisterende branding. Gem version venter på filgennemgangen.
- **Enhedstestet:** 208/208 består sekventielt med den fastlåste Node 22.23.3. Efter versions-/webændringerne er 12 relevante pakke-, Pages-, feedback- og fejlrapportprøver gentaget og består. Ingen samtidig enheds-/Electron-kørsel.
- **Kørt på faktiske filer:** 25 forskellige integrationsforløb består: 23 Electron-forløb og to motorprøver (`agent` og `app-skills`). De dækker bl.a. konkret idé, plan/bygning, permissions, fejl/Stop, genstart, filhenvisninger, rettelse/diff/fortryd, historie, samtidige kopier, Vite/Astro og de eksisterende delingsadaptere. Historiens og versionernes forløb er gentaget efter den sidste låsning. OpenCode 1.18.33 og udviklingsserverne er rigtige; modelsvar og hosting-API'er er kontrollerede. Ingen betalt model eller ekstern hosting-upload.
- **Målt og visuelt kontrolleret:** de samme 44 tilstande før/efter. Før: 3.214 ord, 264 valg, 50 ⓘ og 22 felter. Sidste eftermåling: 3.247 ord, 265 valg, 50 ⓘ og 22 felter. Klik pr. opgave 5/6/4/2, uændret. Ingen sidefejl. Førmålingen fandt skjult dialogtitel i velkomst/demo samt unavngiven versionskontakt og otte featurekontakter; den afgrænsede efterkontrol finder ingen af disse, dublerede ID'er eller dokument-overløb. Tallene er summer af skærmtilstande, ikke samlet læsebyrde; navne, tidspunkt og status giver små udsving.
- **Førstegangsforløb:** den nye `test:demo` har 41 beståede kontroller i både kildekode og pakket app. Den prøver rigtig oprettelse uden AI, modelguide, bevaret kladde, navne, tastatur, fokus, fejlrapport, 980 × 720, 150 % zoom, reduceret bevægelse og straks-lukning/genåbning med kladde. Send kan faktisk rammes ved den lille visning. Billeder tages fra Electron-vinduet. Tidligere falsk clipping kom fra Playwrights zoom-skærmbillede; det var ikke en konstateret layoutfejl i appen.
- **Pakket app kørt:** en ny `Aura 0.2.0-beta.4` til macOS arm64 er bygget lokalt og kørt med isolerede brugerdata. `test:package` prøver begrænset PATH, de medfølgende Node 22.23.3, Git 2.53.0, OpenCode 1.18.33 og npm, projektoprettelse, faktisk preview, lokal identitet og versionsgemning alene i testprojektet. Et forsinket faktisk `git:review`-IPC-svar beviser, at Gem version er låst, indtil svaret er kommet. Demo, recovery, frameworks, tools og chat består også i den samme pakke. Chat bruger den medfølgende OpenCode og en kontrolleret model til plan, eksplicit bygning, godkendt filændring, preview og manuel versionsgemning. Det udvidede rettelse→deling-forløb køres i kildekodeprøven; den pakkede gren har en smallere afgrænsning.
- **Pakkeindhold og download:** 103 faktiske kilde-/profil-/byggeinputs er registreret med SHA-256; appinputs er fulgt af Git. 64 kodefiler og 27 medfølgende profilfiler er bytekontrolleret mod pakken. De bevarede package.json-felter matcher; electron-builder udelader scripts/devDependencies. Ingen private testfiler, node_modules eller de to advisory-biblioteker i appens ASAR. DMG-integritet består. DMG'en er monteret skrivebeskyttet, og app.asar, executable, Info.plist og runtime-manifest matcher den afprøvede app. Faktisk browserdownload over lokal HTTP matcher release.json ved computer-/mobilvisning. Ingen download fra en publiceret release.
- **Signering:** codesign viser kun executable's ad hoc-signatur uden TeamIdentifier eller bundne ressourcer. Der er ingen Developer ID-signering eller notarisation af kandidaten. Det er ikke en Gatekeeper-installationsprøve eller en afprøvning på en separat ren Mac. Der er ikke indsendt noget til Apple.
- **Website:** fem sider, 10 visninger ved 1280/390 pixels, 79 lokale links med HTTP 200, ingen sidefejl eller vandret overløb. Bygget fra faktiske GitHub-svar. Repository stadig privat, nul releases, Pages HTTP 404 den 7. oktober. Ingen adgang eller synlighed ændret.
- **Afhængighedsstatus:** npm audit viser ni berørte poster, otte moderate/én høj, fra to underliggende advisories uden angivet rettet version. De findes i byggestakkens kæde og er ikke i appens ASAR. En særskilt kontrol af runtime finder dog også `http-cache-semantics 4.2.0` i medfølgende npm; kandidaten indeholder dermed fortsat et bibliotek omfattet af det høje advisory. Faktisk udnyttelse gennem npm er ikke reproduceret, og framework-prøverne bruger offentlige pakker uden registry-nøgler. Ingen dokumenteret fuld afhjælpning eller blind op-/nedgradering; den fulde runtime er ikke sikkerhedsrevideret. Kilder og afgrænsning står i demogennemgangen.
- **Kun skrevet i CI:** pakke-workflowet kører nu enhedstest før pakning og demo-forløbet mod pakken. Ændringerne er ikke kørt på GitHub. Kandidaten er bygget fra den aktuelle arbejdsmappe baseret på `e1dbf96`, ikke fra et nyt CI-commit.
- **Ikke deployet eller observeret med en bruger:** aktuelt Corti S1-forløb med brugerens nøgle, anden Mac, testerens downloadadgang, VoiceOver, Windows/Linux og brugerobservation mangler. Ældre Corti-/signeringsevidens nedenfor godkender ikke denne fil. Før ekstern udsendelse skal konkret model, signeret/notariseret installationsfil og adgang kontrolleres; derefter fuldender pilotens observation milepæl 7.

De første pakkeprøver viste to fejl i testens egne forventninger: `firstVersion` ændrer selv startsiden, og en tidligere versionsgemning kan have samme feedbacktekst. Prøverne kontrollerer nu den faktiske ugemte fil og venter på den nye gemnings afsluttede filstatus. Testens forsinkelse lægges på det rigtige IPC-svar; tidligere forsøg på at importere Node fra Playwrights evalueringskontekst var ikke understøttet. De afsluttende prøver består med uændrede fil- og commitkontroller.

**Lokal evidens:** `/private/tmp/aura-demo-unit.log`, `/private/tmp/aura-demo-targeted-units.log`, `/private/tmp/aura-demo-suite/{resultater,efterkontrol}.json`, `/private/tmp/aura-demo-history-check/resultater.json`, `/private/tmp/aura-demo-{audit-before,after-final}/maalinger.json`, `/private/tmp/aura-demo-pack-suite/resultater.json`, `/private/tmp/aura-demo-package-final.log`, `/private/tmp/aura-demo-pack-chat-final.log`, `/private/tmp/aura-demo-{source,archive,mounted}-final.json`, `/private/tmp/aura-demo-{signature,dmg,download}-final.log` og `/private/tmp/aura-demo-web-after.log` og `/private/tmp/aura-demo-runtime-advisory.json`. Prøveloggene angiver projektmapper, rapporter og skærmbilleder. Pakken og den lokale downloadside ligger i `/private/tmp/aura-demo-beta4-final/` og er ikke publiceret. Git-status skal gennemgås; tre nye prøvescripts og to nye dokumenter skal med i brugerens commit.

**Denne kandidats DMG:** `Aura-0.2.0-beta.4-mac-arm64.dmg`, 313.430.362 bytes, SHA-256 `281ed9120eb1f404a3edc1acecdbcba4f91ffcdfa1dea2fccfd7b2c3f881683e`. ZIP: 307.090.172 bytes, SHA-256 `b90208d708748f3bc280653dc58e3950626e0faea306fb0a0fdb6d0558de2303`. En ny signering, notarisation eller bygning giver en ny fil og kræver ny kontrolsum og relevant pakkeprøve.

## Deling og samlet brugerforløb · 7. oktober 2026

Syvende milepæl i [planen for brugerfladen](ux-plan.md). Den tekniske del er skrevet, enhedstestet og kørt mod faktiske projektfiler i Electron på macOS arm64. **Observationen med en person uden udviklererfaring er ikke gennemført**, så milepælen er endnu ikke fuldt observeret eller afsluttet efter sit oprindelige kriterium. Guiden og en tom notatskabelon findes i [testforløbet](testforloeb.md#milepæl-7-observation-af-det-samlede-forløb).

- **Skrevet:** deling gennem de eksisterende GitHub-, Vercel- og Azure-adaptere viser versionens navn/tid, destination med konto og miljø, adgangens faktiske evidens og mulige omkostninger før afsendelse. Tekniske ID'er, filer og build ligger under Se detaljer. Destination, gennemgang og resultat vises hver for sig; Ret destination bevarer felter og kræver ny godkendelse. Uflettede kopier er synligt udeladt. Ingen ny hosting- eller adgangstjeneste er tilføjet.
- **Enhedstestet:** 208 tests består i den samlede sekventielle slutkørsel med Node 22.23.3 på den aktuelle kode, inklusive de undervejs committede modelændringer. Delingsprøverne dækker engangsgodkendelse, ændret version/destination, beskyttede filer, links, hemmeligheder i tidligere versioner, navne uden omskrivning af Git, kvittering, anonyme HTTP-svar, redirects, for stort indhold, manglende filmatch og nulstilling af gammel evidens ved en mislykket frisk kontrol. Senere UI-justeringer afprøves særskilt i Electron; den rene resumévisnings to prøver er også gentaget efter den sidste tekstjustering.
- **Kørt mod rigtigt materiale:** alle 21 hidtidige Electron-prøver samt Astro-varianten af samtidige samtaler består. De køres sekventielt, adskilt fra enhedsprøverne. Framework-prøven blev afbrudt af `ENOSPC` ved skrivning af et skærmbillede; efter oprydning i prøvernes egne geninstallerbare afhængigheder blev den gentaget og bestod, og de resterende prøver blev gennemført. Kilder, Git-historik, logs og skærmbilleder er bevaret. Oprydningen har ikke berørt brugerprojekter, Docker eller npm-cache.
- **Samlet forløb:** `test:chat` bruger den rigtige OpenCode 1.18.33 og en kontrolleret lokal modelserver. I samme lokale testprojekt indtastes en konkret idé om fiktive mødelokaler i skrivefeltet, og det kontrolleres, at den når planlægningen. På samme projektfil gennemføres ønsker, Før du sender, plan og rettet plan, eksplicit bygning, faktisk filændring og preview, egen tekstrettelse, linje-diff, Fortryd til byteidentisk indhold og delingsgennemgang af den gemte version. Ingen cloud-upload i dette forløb. Fejl, bevaret besked og faktiske frem for opdigtede kontroller afprøves også. Efterkontrollen fandt en ventefejl i den nye test: den læste endnu den tidligere opgaves diff, inden tekstrettelsens diff var indlæst. Testen venter nu på den konkrete rettelse og kontrollerer stadig filens faktiske indhold.
- **GitHub:** `test:hosting` gennemfører kontrolleret Device Flow og GitHub-API, eksplicit privat oprettelse og almindeligt push til en rigtig **lokal** bare Git-server. Serverindhold og synkronisering kontrolleres. UI'et adskiller rapporteret privat synlighed, bekræftet serverversion og testpersonens endnu ikke afprøvede læseadgang. En kontofejl fjerner gammel gennemgang og tillader ny kontrol. Ingen push til github.com.
- **Testudgivelse:** `test:deployment` bruger rigtige filer og gemte versioner med **kontrollerede** Vercel- og Azure-svar. En faktisk ugemt fil udløser afvisning, og ingen upload tælles. Derefter prøves ændret destination, kvittering ved genåbning, påkrævede destinationsfelter med konkret native afvisning før udbyderkald, HTTP 401, frisk statusfejl efter READY, UNKNOWN uden automatisk genforsøg, også med beskeden bevaret ved genåbning og Azure harness-test med HTTP 200 og faktisk hashmatch af testfilen. Resultatet siger fortsat, at testpersonens adgang og øvrige funktioner ikke er afprøvet. Der oprettes ingen ekstern udgivelse.
- **Kopier:** begge `test:concurrent`-varianter kontrollerer gennem IPC fra en rigtig uflettet kopi, at afgrænsningen beskriver kopien, og at version og indholdsfingeraftryk kommer fra hovedprojektets gemte Git-version. Kopiens ændrede frameworkfil indgår ikke; ingen upload foretages. Begge afprøver også rigtige Vite-/Astro-servere og konkrete afvisninger af beskyttede filstier og adgang til den anden servers WebSocket.
- **Visuelt og tastatur:** delingens gennemgang og resultater er set som vinduesbilleder i Electron, også ved 980 × 720 og 150 % zoom. Ret destination bevarer felter, gennemgangen får fokus, Escape returnerer til åbneren, og reduceret bevægelse afprøves. GitHub-resultatets fokus og rulning tager højde for dialogens faste overskrift. Dialogerne kan rulle, uden vandret overløb.
- **Måling:** før/efter omfatter 44 skærme. Før: 3.220 ord, 267 valg, 51 ⓘ og 22 felter. Efter: 3.213 ord, 264 valg, 50 ⓘ og 22 felter. Klik pr. opgave er uændret: 5/6/4/2; ingen sidefejl. Første lag i Del ændres fra 54 ord/5 valg til 56 ord/4 valg; Sikkerhedskopi fra 49 ord/4 valg til 39 ord/2 valg. Delingsgennemgang, resultater, ukendt upload og større tekst måles desuden særskilt af `test:deployment`; de er nye tilstande i målingen og har ikke en registreret numerisk førmåling.
- **Ikke deployet eller observeret med en bruger:** ingen rigtig modelopgave, ekstern GitHub-/Vercel-/Azure-publicering, testpersons adgang, Windows, VoiceOver eller ny installationspakke er afprøvet i denne milepæl. Ældre dateret live- og pakkeevidens nedenfor er ikke en verifikation af disse ændringer. Testernes konkrete model og installations-/adgangsprøver skal gennemføres før invitation; brugerobservationen gennemføres i piloten før en samlet færdigmelding.

Lokal evidens: `/private/tmp/aura-7-unit-final.log`, `/private/tmp/aura-7-validated/{resultater,fortsaettelse,slutkontrol,deployment-final,deployment-chat-final,chat-final}.json` og deres prøvelogs; målingerne i `/private/tmp/aura-7-measure-{before,validated}/maalinger.json`. Prøveloggene angiver de konkrete midlertidige projektmapper og skærmbilleder. Ingen testværktøjer har committet i dette repository; brugerens nye commits er bevaret.

## Mistral Large 4 · 7. oktober 2026

- **Skrevet:** modelkort for `mistral-large-4` og `mistral-large-4-0`, markeret som offentlig prøveversion. Mistral-forbindelser bruger den Mistral-adapter, som allerede følger med OpenCode 1.18.33. Kataloggrænser har forrang; kendte Large 4-id'er får modelkortets kontekst som reserveværdi og Auras loft for svarlængde. Prisoverslaget bruger normal listepris og siger, at lanceringsrabatten ikke er fratrukket. Prisens kilde og kontroldato er adskilt fra datavilkårene. Et flytbart `mistral-large-latest` får ikke længere automatisk den gamle Large 3-pris.
- **Enhedstestet:** 208 tests består i den samlede sekventielle kørsel med den fastlåste Node 22.23.3. De nye prøver kontrollerer begge model-id'er, katalogets forrang for grænser og priser, cachepris, ændret prisgodkendelse og intet opdigtet standardvalg eller pris for ukendte versioner.
- **Kørt mod rigtigt materiale:** `npm run test:mistral` består i Electron på macOS med den rigtige OpenCode, faktiske projektfiler og en kontrolleret lokal server i Mistrals format. Prøven gennemfører plan, datagennemgang, værktøjskald, godkendt filændring og faktisk preview. Tænkeafsnit læses fra streaming, sendes tilbage efter værktøjskald og vises ikke som almindeligt svar. Tokenforbrug og prisoverslag registreres. Den prøver også afvisning, Stop efter et faktisk startet modelkald, nøglefejl uden automatisk genforsøg og genåbning med bevaret modelvalg.
- **Modelvalg kontrolleret i appen:** der vises tre kort, hvor samme prøvekatalog gav to før ændringen. Medium forbliver det hidtidige standardvalg. Med et nyt projekt og et katalog uden Medium forbliver valget tomt, og intet kort kaldes udbyderens standard. Den kontrol blev først ramt af testens egen ventefejl mellem to projektåbninger; prøven venter nu på det konkrete projekts afsluttede indlæsning. Den ændrede tekst siger, at kataloget mangler en pris, så den ikke modsiger listeprisen i datagennemgangen.
- **Visuelt kontrolleret:** skærmbilleder af modelvalget, kode/preview og tilstanden uden standardmodel er set. Modeldialogen er også set ved 980 × 720. Valg med tastaturet og reduceret bevægelse er afprøvet. Der er fortsat højst tre modelkort; model, udbyder og Mistrals standardindsats står under skrivefeltet. Send og pilen bevares på én linje ved lange modelnavne. Niveauet for indsatsen er ikke angivet som verificeret, og prøven kontrollerer, at Aura ikke sender et valg af `reasoning_effort`.
- **Ikke afprøvet:** ingen ekstern Mistral-opgave eller vurdering af modellens kode, dansk eller design. Brugeren valgte kun lokale kontroller. Denne ændring er ikke kørt på Windows eller i en ny installationspakke og er ikke deployet. Den ændrer ikke den resterende syvende UI-milepæl eller kravene før invitation nedenfor.

Prøvens seneste filer og skærmbilleder ligger lokalt i `/private/var/folders/q9/914lvw356897pk8pb_29flv00000gn/T/aura-mistral-D3oN7I`. Kilder og gentagelig kommando står i [desktopvejledningen](../desktop/README.md#mistral-large-4--7-oktober-2026).

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
