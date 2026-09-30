# Produktretning og beslutninger

## Fælles Harness og to brugsveje

Retning afklaret i projektsamtalen 28. september 2026. Dette er ikke en formel vedtagelse på vegne af deltagende kommuner.

AI Harness skal samle en fælles arbejdsmetode for kommunal udvikling med AI fra idé til drift. Indholdet skal hjælpe både nye og erfarne brugere med kodekvalitet, sikkerhed, databeskyttelse, kontrol over data og overdragelse. Det skal kunne bruges gennem eget kodeværktøj og en selvstændig webguide eller samlet i desktopappen. README og hjemmesidens forside skal forklare formålet og give de to veje samme vægt.

[Det faglige grundlag](harness-grundlag.md) indeholder research og forslag til skills, teknologivalg og integration. [Projektkontrol](projektkontrol.md) beskriver forslag til konkrete risikoregistreringer, versionsbundne beslutninger, Git og tilslutning af eksisterende projekter. De tekniske forslag er endnu ikke implementeret eller godkendt som organisationspolitik. Tekstinstruktioner må ikke omtales som teknisk håndhævelse eller en garanti for GDPR.

## Præcisering af målgruppe og teknisk grundlag

Afklaret i projektsamtalen 28. september 2026: Den primære målgruppe er udviklere, IT-medarbejdere og teknisk interesserede kolleger, som vil bygge med AI, men ønsker hjælp til kode og udviklingsarbejdsgang. De skal fortsat kunne tage stilling til tjenester, data og hosting med deres organisation. Guidet opstart og et enkelt sprog bevares. Harness kræver ikke et Promte-abonnement; det indebærer ikke, at valgte modeller eller hostingtjenester er gratis.

Kildegennemgangen bekræfter det oprindelige forslag om en egen brugerflade og konfiguration omkring OpenCode uden en fork. Det samlede forslag om organisationsstyring, revisionsspor og isolation er ikke implementeret. Pi skal vurderes som mulig alternativ motor; der er ikke besluttet eller udført et skift. Se [teknisk grundlag](teknisk-grundlag.md).

## Få valg og udvælgelse af skills · 29. september 2026

Besluttet i projektsamtalen: Hvert beslutningspunkt har ét eller to hovedvalg og højst tre til fire synlige muligheder med resten bag ét link, fx "Bruger du en anden udbyder? Vælg en anden". Opsætningen skal kunne gennemføres uden tvivlsspørgsmål af en person uden teknisk baggrund. Reglen står i `AGENTS.md` og `desktop/DESIGN.md`.

Skills kan vælges til og fra som i en cookie-dialog: grundreglerne er altid med, og de 12 skills er delt i fire kategorier, som kan slås til og fra samlet eller enkeltvis. Udvalget gemmes i `.harness/installation.json` og bruges igen ved næste installation. Henvisninger mellem skills skal tåle, at den anden skill er fravalgt.

Standardvalg i implementeringen, som kan ændres i kataloget eller koden: fire fremhævede kodeværktøjer (Claude Code, GitHub Copilot, Codex og Cursor), tre udbyderkort (Claude, Mistral og Corti) og anbefalede modeller pr. udbyder i `desktop/ui/model-advice.js`.

## Fælles bibliotek og installation i eget kodeværktøj · 29. september 2026

Besluttet i projektsamtalen: Standardvalgene i [det faglige grundlag](harness-grundlag.md) er grundlaget for skillsene, det skal være let at læse om hver skill som en FAQ, og pakkerne skal dække flere værktøjer end Claude Code, Codex og OpenCode.

Tekniske valg i implementeringen:

- **Én kilde:** `profiles/catalog.json`, `profiles/grundregler.md` og `profiles/skills/` er kilden til appens installation, `scripts/harness.cjs`, webguidens ZIP-pakker og de genererede sider. Filplaceringer pr. værktøj er data, ikke kode.
- **Portable skills:** navne med præfikset `harness-` i ASCII, kun `name` og `description` i frontmatter, kun Markdown og ingen scripts eller værktøjstilladelser. Menneskelige beskrivelser og kilder står i kataloget, instruktionerne til agenten i SKILL.md.
- **Regler:** `AGENTS.md` er fælles regelfil. Claude Code og Gemini CLI får en `CLAUDE.md` eller `GEMINI.md`, der importerer den, så indholdet ikke står to gange. Aider og Zed kræver særskilt opmærksomhed og er beskrevet i deres forbehold.
- **Skillmapper:** så få mapper som muligt, så alle valgte værktøjer kan se skillsene; `.agents/skills` dækker de fleste. Ved lige dækning vælges værktøjets egen foretrukne mappe.
- **Sikker installation:** afgrænsede afsnit mellem faste markører i eksisterende filer, aldrig overskrivning, `.harness/installation.json` med version og kontrolsummer, konflikter ved ændrede filer, gennemgang med engangsnøgle og fjernelse af kun uændrede filer. Installationen gælder ét projekt ad gangen.
- **Udgåede værktøjer:** Continue og Roo Code får ingen pakker, fordi de ikke længere udvikles.
- **Appens egen agent:** bruger fortsat sine egne instruktioner, nu i `profiles/app`. Overgangen til det fælles bibliotek med indlæsning efter behov er en særskilt beslutning, fordi den ændrer den afprøvede agentadfærd.

## Historiske møde- og produktnotater

**Aktuel implementeringsstatus:** POC 1 er implementeret. POC 2 omfatter lokal kodeagent via OpenCode 1.17.15, modeladaptere, synlige skills, dataoplysninger, vilkårlig projektåbning og genbrugelige designpakker. Se [desktopvejledningen](../desktop/README.md) for den faktiske verifikation og begrænsninger. Noterne nedenfor er historiske.

Meeting input · 22 September 2026

These records capture the project discussion, not formal approval by all participating organisations. No implementation has begun. The working name is **AI Harness** (`ai-harness`); municipal use is the initial context rather than a restriction on who can adopt it.

## AI Alliancen context

The [AI Alliancen website](https://ai-alliancen.org/) describes an independent professional network and introduces Agent Harness as an architecture proposal involving controls outside the agent. Its [member page](https://ai-alliancen.org/medlemmer) emphasises reusable experience across organisations and states that membership is not a product endorsement. Its [principles and meeting charter](https://ai-alliancen.org/charter) are explicitly a draft awaiting shared discussion and approval. These sources provide context, not adopted project governance or confirmed partner commitments. Reviewed 22 September 2026; the detailed knowledge page could not be retrieved during this review.

## Current direction

1. **Modular foundation.** The interface, client adapters, model connections, profiles, organisation configuration, execution controls, deployment, and evidence can be adopted separately, subject to documented dependencies.
2. **Approachable first-party interface.** Explore a downloadable application using OpenCode as its local coding backend. Do not require ordinary participants to operate a terminal.
3. **Other clients remain possible.** Design shared services and configuration contracts so participants can use existing coding clients. Do not promise equivalent support before testing each integration.
4. **Local workspaces for the POC.** Participants build on their laptops. This supersedes the earlier recommendation for centrally hosted coding workspaces. Local isolation and dependency installation remain design decisions.
5. **One real event organisation.** Assign participants to a shared Hackathon organisation. Store its configuration as organisation data rather than hardcoded application-wide settings.
6. **Individual access.** Shared organisation membership does not grant access to everyone else's projects. Service credentials and deployment permissions must be scoped and revocable.
7. **Optional organisation management.** Later deployments can inherit municipal configuration through verified organisational sign-in. Independent use remains possible without that service.
8. **Guided deployment.** Treat hosting as a separate module. Explain configuration, provider compatibility, secrets, audience, costs, checks, and recovery. Verify the actual hosted application.
9. **Open contribution model.** Providers and municipalities should be able to contribute model integrations, tool/data connectors, hosting adapters, profiles, and templates under documented contracts and tests.
10. **Evidence over blanket guarantees.** State exactly which version, environment, and configuration was tested. Guidance, enforced restrictions, application quality, and operational approval are distinct claims.

## Questions for upcoming meetings

### Product and event

- Which operating systems and managed municipal laptop restrictions must we support?
- Who are the participants, and what facilitator support will be available?
- Which concrete application tasks should demonstrate success?
- What is the required client coverage for the event, and what can be labelled experimental?
- Are only synthetic/public data permitted? Who approves the event data policy?
- Is the event outcome a preview, a persistent application, or both?

### Identity and organisation configuration

- How do participants enrol in the Hackathon organisation: invitation, event login, or existing identity providers?
- Which settings are adjustable defaults and which are mandatory restrictions?
- Who administers the event, approves publication, and can revoke access?
- Which event records are retained, for what purpose, and for how long?

### Local execution and service access

- What local sandbox mechanism supports each required OS, and what are its demonstrated limits?
- How does installation work without requiring unsupported administrator access?
- Which services must be reachable from municipal networks?
- Which credentials remain service-side, and which scoped tokens are issued to clients?
- How does each supported client inherit guidance and authenticate to shared services?

### Models and hosting

- Which actual model endpoints and versions are available, and what capacity is reserved for concurrent use?
- Which hosting integrations will partners supply, and under what licenses and operating responsibilities?
- Which application capabilities must deployments support: databases, persistent files, authentication, jobs, or external connectors?
- Who owns the hosting accounts, costs, application domains, backups, and post-event operation?
- What happens to previews, project data, and participant access after the event?

### Project stewardship

- Confirm repository name and whether discussion documents are public now.
- Select the project license and contribution terms before accepting reusable code contributions.
- Name maintainers and define how architectural decisions are accepted.
- Agree how integrations become verified and how vulnerabilities are reported privately.

## Recording later decisions

For each material decision, record the problem, chosen approach, responsible owner, consequences, and evidence needed to revisit it. Distinguish a proposal from an accepted decision. Record partner capabilities as unverified until confirmed and exercised.

## Opdateret POC-retning

- **POC 1:** En enkel dansk hjemmeside med download af fælles AI-instruktioner og værktøjsspecifikke vejledninger til Claude Code, Codex og OpenCode. Ingen konti, modelkald eller central styring i denne POC.
- **POC 2:** En installerbar app til Windows og Mac med lokal agentmotor og brugerens egne modelforbindelser. Samtalen vises til venstre og en løbende forhåndsvisning af den applikation, der bygges, til højre. Forhåndsvisningen skal afspejle de aktuelle ændringer og vise forståelig status ved opstart og fejl. De to POC'er skal dele konfigurationsgrundlag.
- Disse præciseringer erstatter tidligere beskrivelser af den første POC som en samlet desktop-, organisations- og hostingløsning. Den bredere arkitektur er fortsat en fremtidig retning.
- **POC 2, oplevelse:** Lovable-inspireret brugerflade med en lokal live-server. En fremtidig “Gem”-handling skal kunne oprette et Git-commit efter en synlig gennemgang af de relevante ændringer. En separat “Deploy”-handling skal udgive til den valgte, konfigurerede destination. Dette er produktfunktioner til senere afklaring og ændrer ikke reglen om, at assistenten ikke laver commits i dette repository.
- **POC 2, projektoprettelse:** Hjælp brugeren fra idé til et lokalt projekt gennem en enkel samtale. Spørg efter navn og formål, og afklar kun de valg, som kræver brugerens stillingtagen. Teknologi, kodekonventioner og teststrategi skal have forståelige standardforslag og kunne tilpasses af interesserede brugere; de må ikke være obligatoriske tekniske spørgsmål for alle. Appen opretter den aftalte mappestruktur og bevarer projektvalgene uden at kræve en særskilt dokumentarbejdsgang. Undersøg eksisterende indhold før oprettelse. Dette er et designkrav, ikke en implementeret funktion.
- **POC 2, platforme:** Første desktopversion skal understøtte både Windows og macOS. Afprøvning skal dokumenteres særskilt for hvert operativsystem; en vellykket Mac-kørsel er ikke en Windows-verifikation.
- **POC 2, opsætning:** Understøt både eksisterende udviklingsværktøjer på maskinen og en guidet opsætning for brugere uden dem. Undersøg eksisterende installationer først. Vis nødvendige installationer og tilladelser, og overskriv ikke brugerens værktøjer eller maskinopsætning uden konkret godkendelse. Den tekniske distributionsmekanisme er endnu ikke valgt.

## Inspiration til POC 2: Hamster (ikke valgt som hovedretning)

Følgende er forslag til drøftelse, ikke nye accepterede funktioner. Grundlaget er brugerens indsendte produkttekst og Hamsters offentlige produktsider, læst 22. september 2026. Produktet er ikke afprøvet i en indlogget session.

- **Projektgrundlag adskilt fra den aktuelle opgave:** Hamster beskriver [Blueprints](https://tryhamster.com/product/studio/blueprints) som produktkontekst og [Briefs](https://tryhamster.com/product/studio/briefs) som grundlag for en ændring. Hos os kan init-fasens godkendte valg være projektgrundlaget, mens hver efterfølgende ændring får en kort opgavebeskrivelse.
- **Synlige kriterier før kode:** Hamsters [Plans](https://tryhamster.com/product/studio/plans) forbinder opgaver med acceptkriterier. Forslag: vis i almindeligt dansk, hvad brugeren skal kunne gøre, og hvordan resultatet afprøves, før agenten starter.
- **Beslutninger skal følge projektet:** Hamsters [CLI](https://tryhamster.com/product/studio/cli) beskriver overførsel af kontekst til kodeværktøjer. Forslag: gem vores godkendte projektgrundlag og planer i læsbare lokale filer, så bruger og agent arbejder ud fra samme oplysninger. Det indebærer ikke en Hamster-integration.
- **Skeln mellem forslag og godkendt retning:** Vis agentens foreslåede ændringer til planen, før de erstatter godkendte valg. En teknisk ændring må ikke ubemærket ændre formålet eller teststrategien.

En kontekstgraf, mødeoptagelse, Slack-integration og teamsamarbejde fra Hamsters bredere produkt er ikke tilføjet til POC 2's omfang. Der er endnu ikke valgt en integration eller afhængighed til Hamster.

## Præcisering: et værktøj til at bygge og udgive

POC 2 skal primært gøre det muligt for ikke-tekniske brugere at vibe-code og hoste deres egne applikationer. Hamsters dokument- og planlægningsorienterede arbejdsgang er ikke valgt som produktets hovedretning.

- Brugeren beskriver ønsket i samtalen og ser resultatet i en lokal live-forhåndsvisning.
- Appen hjælper med Git, npm-pakker, nødvendige udviklingsværktøjer og Docker, hvor projektet kræver det, uden at forudsætte terminalkendskab.
- Første version skal tilstræbe både brugerens eget Claude-abonnement og en Anthropic API-nøgle, hvor den konkrete integration er understøttet og tilladt. Abonnementsadgang er en ønsket mulighed, ikke en verificeret produktfunktion. Agentmotor og loginform holdes adskilt fra brugerfladen. OpenCode er fortsat en kandidat, ikke et krav der må forhindre denne brugerrejse.
- Deployment skal være leverandøruafhængig gennem udskiftelige hostingadaptere. Azure er kun et eksempel sammen med Vercel, Hetzner, Promte og egne servere; ingen af disse er valgt som obligatorisk eller verificeret destination. Hver adapter skal beskrive understøttede applikationstyper, nødvendige tjenester, konfiguration, udgivelse og kontrol af resultatet. “Alle steder” er målet for udvidelighed, ikke et løfte om, at enhver app fungerer uændret på enhver host. Konto, ressourcevalg og omkostninger afklares ved opsætning.
- Lokal udvikling, egne modelforbindelser, Windows/macOS og de to opsætningsmuligheder fastholdes. Fælles profiler fra POC 1 skal støtte arbejdet i baggrunden.

Dette præciserer produktretningen; der er endnu ikke implementeret desktopfunktioner eller valgt en bestemt hostingtjeneste.

## POC 2: modulære forbindelser og visuel opstart

- **Uafhængige valg:** Brugerflade, agentmotor, model/login, lokal værktøjsopsætning, projektprofil og hostingforbindelse skal kunne udskiftes gennem afgrænsede grænseflader. Adaptere angiver deres faktiske muligheder; de må ikke foregive fuld kompatibilitet, når en funktion mangler.
- **Claude med API-nøgle:** Brug en dokumenteret API-/SDK-integration. Opbevar nøglen beskyttet, vis den valgte betalingsform, og skift ikke automatisk fra abonnement til betalt API-brug ved en fejl eller opbrugt kvote.
- **Claude med abonnement:** Bevar dette som krav under ekstern afklaring. Agent SDK-dokumentationen kræver forudgående godkendelse for at tilbyde claude.ai-login eller abonnementskvoter i tredjepartsprodukter. En eksisterende lokal login-session eller teknisk mulighed er ikke i sig selv dokumentation for tilladelse til vores distribution. Undgå tokenudtræk og identitetsmaskering som integrationsvej.
- **Designmateriale ved opstart:** Tilbyd et valgfrit trin, hvor brugeren kan vælge referencebilleder og andre inspirationsfiler fra maskinen, tilføje links til designguides, angive brandfarver og vælge logoer eller øvrige grafiske filer. Tilbyd også at fortsætte uden materiale og lade agenten foreslå en retning.
- **Appen organiserer materialet:** Brugeren vælger filer gennem brugerfladen; appen placerer kopier i passende projektmapper uden at overskrive eksisterende filer. Hold referencer adskilt fra aktiver, der skal offentliggøres med appen. En intern designguide må ikke automatisk ende i det offentlige webindhold. Forklar hvilke valgte materialer der deles med den tilsluttede model.
- **Visuel feedback:** Lad brugeren se og korrigere den foreslåede anvendelse af farver og logo i live-forhåndsvisningen. Gem valgene med projektet, så senere ændringer følger dem. Dette er en del af den enkle byggeoplevelse, ikke en obligatorisk dokumentproces.

### Kildegrundlag for Claude-forbindelser

Officiel dokumentation læst 22. september 2026; ingen login- eller modelkald afprøvet:

- [Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview): API-nøgle er den dokumenterede start; tredjepartslogin kræver forudgående godkendelse.
- [Loginvejledning](https://support.claude.com/en/articles/13189465-log-in-to-your-claude-account): produktudviklere henvises til API-nøgler eller understøttede cloududbydere.
- [SDK med Claude-abonnement](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan): opdateringen øverst beskriver en pauseret ændring af afregning og fortsat abonnementsforbrug. Den historiske tekst nedenunder er markeret som ikke trådt i kraft på den annoncerede dato. Siden etablerer ikke i sig selv en godkendelse af vores produkt.

Konsekvens: arkitekturen skal give plads til begge forbindelser, men abonnementsadapteren må ikke præsenteres som tilgængelig, før adgang, afregning og produktgodkendelse er afklaret. Dette blokerer ikke design og implementering af resten af den modulære app.

## POC 2: første desktopmilepæl og designretning

Electron er valgt til det første desktopgrundlag. Projektoprettelse og lokal forhåndsvisning er adskilte moduler uden Electron-afhængighed. UI og native filhandlinger forbindes gennem en begrænset IPC-bro. Agentmotor, loginform og hostingudbyder er fortsat åbne, separate integrationsvalg.

Brugerfladen skal ligne et arbejdsredskab i stil med Codex, Claude Code og OpenCode: kompakt navigation, neutrale farver, diskrete værktøjslinjer og sammenhængende paneler. Store kampagneoverskrifter, kortbaseret landingpage-layout og dekorativ websitebranding er fravalgt. Det gælder selve værktøjet; de applikationer, brugeren bygger, kan have deres eget visuelle udtryk.

Denne milepæl omfatter nye lokale projekter med navn, idé, brandfarve, referencelinks og kopier af logoer/referencefiler; fælles AI-regler; genåbning; og automatisk genindlæsning af en statisk startside ved filændringer. AI-chat, Git-handlinger, npm-/Docker-opsætning, hosting og distributionspakker er endnu ikke implementeret. Windows er målplatform, men kræver særskilt afprøvning. Se [desktopvejledningen](../desktop/README.md) for verifikationsniveau og begrænsninger.


## POC 2: agent og genbrug af design · 23. september 2026

OpenCode er den første udskiftelige agentadapter. Modelnøgler beskyttes i appens datamappe og sendes ikke ind i projektets konfiguration. Et projekt kan åbnes uden manifest og uden filændringer. Modelvalg, skill-tilpasninger og navngivne designpakker gemmes uden for repositoryet. Designpakker indeholder farve, links og kopier af materialer; brugeren vælger stadig særskilt, hvilke referencer modellen må læse.

Modelplacering, arbejdsområde og hosting skal forblive separate moduler. Kun lokalt arbejdsområde er implementeret. Kommunal styring, cloud-login og remote eksekvering kræver en afklaret host og rettighedsmodel; de fremstilles ikke som aktive funktioner. Ingen bestemt hostingudbyder er obligatorisk. Skills er synlige instruktioner, ikke en erstatning for adgangskontrol. Godkendte kommandoer kører med brugerens lokale rettigheder.

## Første resultat uden spørgsmål · 29. september 2026

En begyndergennemgang af den rigtige app bestod af 30 skærmbilleder med en ren profil, Claude-kortet og en kontrolleret model. Den fandt syv knaster:
- en generel nøglehjælp
- en tvungen modeldialog før første besked
- et langt datavindue, der blev vist både ved plan og ved bygning
- en godkendelse pr. fil med en fuld systemsti
- projektnavne som "En oversigt over tre fiktive mødelokaler, hvor"
- mappenavne, hvor æ og ø forsvandt
- en grænse på 4.096 svartokens for alle modeller

Brugeren besluttede, at testerne selv skaffer en nøgle hos Anthropic, og at filændringer godkendes én gang pr. opgave.

- **Godkendelse pr. opgave:**
  - "Tillad for denne opgave" gælder kun filændringer, som OpenCode sender med en fuld sti inden for projektmappen.
  - `.git`, `.env*`, `*.key` og `*.pem` godkendes aldrig automatisk. Kommandoer, web og filer uden for projektet spørger hver gang.
  - Tilladelsen nulstilles, når opgaven slutter eller stoppes.
  - Afgørelsen træffes i `Workbench`, ikke i brugerfladen. Grunden er, at OpenCode regner stier relativt til Git-roden eller til computerens rod, når projektet ikke har Git.
- **Accepterede vilkår huskes pr. projekt:**
  - Højst ti sæt vilkår huskes. Nøglen dækker forbindelse, adresse, model, rute, modtager, behandlingssted, opbevaring, træning, pris, sikkerhed, referencer og medsendt samtale.
  - Arbejdsmåde og skills indgår ikke. Derfor vises resuméet ikke igen ved skift fra plan til bygning.
  - Afsendelsen kræver fortsat fingeraftrykket for den aktuelle forberedelse.
- **Forvalgt model:** For Claude, Mistral og Corti vælges den anbefalede model, når projektet åbnes. Det erstatter det tidligere princip om et aktivt modelvalg. Modellen står i skrivefeltet og i resuméet før første afsendelse. Andre forbindelser kræver fortsat et valg.
- **Tokengrænser:**
  - Kendte modeller får dokumenterede grænser, og tal fra modelkataloget har forrang. Claude får 32.000 svartokens, som er OpenCodes loft.
  - Konteksten sættes til 200.000 tokens, selv om Claude 5 kan rumme en million. Det holder prisen pr. kald nede.
  - Ukendte modeller beholder 32.768 og 4.096.
  - Gatewayen afbryder nu efter to minutters stilstand i stedet for tre minutter i alt, med et samlet loft på 20 minutter. Et langt, men levende svar når dermed igennem.
- **Vilkår og priser med kilde:** Kontrolleret 29. september 2026.
  - **Anthropic** behandler data globalt uden EU-mulighed. Data slettes inden for 30 dage og bruges ikke til træning som standard. Sonnet 5.5 koster 2/10 USD pr. million tokens.
  - **Mistral** hoster data i EU, men `api.mistral.ai` lover ikke, hvor behandlingen sker. Gratisplanen må træne på data.
  - **Corti** kører EU-projekter på sin egen klynge. Data gemmes ikke og bruges ikke til træning.
  - Mistral udfasede Devstral 31. juli 2026. Mistral Medium anbefales nu; Codestral anbefales ikke til agentarbejde.
- **Projektplacering:** Projekter lægges i `Dokumenter/AI Harness`. Et projekt med samme navn får et nummer, og æ, ø og å skrives om i mappenavnet. Tests sætter deres egen dokumentmappe med `app.setPath('documents', …)`.

Åbne spørgsmål:
- **Automatisk tilstand:** Claude Codes auto mode er lukket kode og virker kun med Claude-modeller i Claude Code og Agent SDK. OpenCodes `--auto` godkender alt. Forslaget er en særskilt milepæl med to dele:
  - en sandkasse til kommandoer med Anthropics open source `sandbox-runtime`, først på Mac
  - en bedømmer, der bruger brugerens egen AI og kun spørger ved tvivl

  Windows kræver en særskilt afklaring, fordi sandkasserne der kræver administratorrettigheder.
- **Mistrals EU-endpoint:** `api.eu.mistral.ai` garanterer behandling i EU mod 10 % højere pris. Det skal afprøves med en nøgle, før det bliver standard.
- **OpenCode 1.18.33 og Zens gratis modeller:** Brugeren ville ikke bruge penge på at afprøve med en rigtig model og bad om OpenCodes gratis modeller.
  - Zen afviste 1.17.15 med beskeden "OpenCode 1.18.0 or newer is required to use the free tier". Motoren er derfor opgraderet til 1.18.33, og låsefilen er opdateret for alle fire platforme.
  - Med 1.18.33 virker de gratis modeller fra OpenCodes egen kommandolinje. Fra appen afviser Zen dem stadig: "OpenCode's free tier can only be used from within OpenCode".
  - Årsagen er, at motoren melder sig som klienten `harness` gennem `OPENCODE_CLIENT`. OpenCodes standard er `cli`, og Zen giver kun gratis adgang til OpenCodes egne klienter.
  - Appen udgiver sig ikke for at være OpenCode for at komme uden om begrænsningen. En Zen-forbindelse kræver derfor en nøgle, og hjælpeteksten siger det. Vilkårene for hver af Zens modeller står i resuméet.
  - Rigtige modelprøver bruger i stedet Mistrals gratis plan. Brugeren valgte det 29. september 2026.
  - Under udvikling finder appen den motor, `npm run runtime:prepare` har hentet til `.runtime`, før en eventuel egen installation i `~/.opencode`.
- **Ingen anbefaling af udbydere eller modeller:** Brugeren besluttede 29. september 2026, at appen ikke må anbefale noget. Valget skal bygge på brugerens egne vurderinger.
  - Claude, Mistral og Corti står fortsat øverst i den rækkefølge med faktuelle oplysninger om udbyder og land. Resten ligger bag "Vælg en anden".
  - Standardmodellen er udbyderens eget dokumenterede udgangspunkt: Claude Opus 5.5 hos Anthropic ("If you're unsure which model to use, start with Claude Opus 5.5"), Mistral Medium hos Mistral og S1 hos Corti. Det står som udbyderens, ikke som vores.
  - Under skrivefeltet står altid model, udbyder og indsats. Indsatsen er udbyderens standard, fordi OpenCode 1.18.33 kun sender `thinking: adaptive` og ingen indsats. Samme sted står samtalens tokens ind og ud med en anslået pris.
  - Tokens tælles pr. modelkald ud fra OpenCodes `step-finish`, fordi beskeden kun beholder det sidste kalds tal. Ræsonnement afregnes som output. Forbruget gemmes med samtalen og nulstilles ved ny samtale.
  - Om pris siger vi, at man betaler pr. token, og at prisen varierer meget med opgavens kompleksitet.


## Gem, fortryd og kom tilbage · 30. september 2026

Brugeren besluttede, at der gemmes en version efter hver AI-opgave, så en opgave altid kan fortrydes.

- **Git fra start:**
  - Nye projekter får en lokal Git-historik med branchen `main` og en første version, "Projekt oprettet".
  - Har computeren ingen Git-identitet, bruges den anonyme `AI Harness-bruger <bruger@ai-harness.invalid>`. Adressen kan aldrig modtage post, og en eksisterende identitet overskrives ikke.
  - Åbnede mapper røres ikke.
- **Automatiske versioner efter hver opgave:** De erstatter de tidligere strenge checkpoints, som sprang over efter kommandoer, patchværktøjer, fejl, stop og afvisninger og derfor sjældent gav noget at fortryde.
  - En version indeholder nu de filer, der ændrede sig under opgaven, målt på indhold i forhold til opgavens start. Brugerens egne ugemte ændringer fra før opgaven kommer ikke med.
  - Et stop eller en fejl gemmes som "Afbrudt AI-opgave".
  - Aldrig automatisk: hemmeligheder, beskyttede stier og store eller ukendte binære filer. Heller ikke i repositories med hooks eller filtre, under igangværende Git-handlinger, med staged ændringer eller hvis historikken er ændret under opgaven.
  - Andre programmers samtidige ændringer kan komme med. Det står i hjælpeteksten.
- **Fortryd og Gå tilbage hertil:**
  - Begge bruger den eksisterende gendannelse med kopi før gendannelse.
  - Med automatiske versioner gemmes resultatet som en ny version ("Fortrudt: …" eller "Gendannet til: …"). Historikken er dermed lineær, og man kan altid gå frem igen.
  - Kopien før sidste gendannelse vises kun efter en afbrudt gendannelse eller uden automatiske versioner.
- **Versioner i almindeligt dansk:** Dialogen viser "Alt er gemt" eller antallet af ugemte ændringer, Gem version med ét klik og en historik med tidspunkter. Filvalg, branch og identitet ligger under Avanceret og Se detaljer.
- **Kom tilbage:** Appen åbner det projekt, der sidst var åbent, med samtale, kladde og forbrug. Et projekt, brugeren har lukket med Nyt projekt, åbnes ikke igen.

Retning, brugeren foreslog 30. september 2026, ikke besluttet: De "smarte" funktioner kan blive moduler, som brugeren selv slår til og fra, hver koblet til sin skill. Det gælder versioner og fortryd, deling og hosting, GitHub-samarbejde og designpakker. Nogle vælger hele pakken, andre kun versioner. Versioner er allerede en afgrænset funktion med sin egen kontakt. Et fælles funktionspanel foreslås som en særskilt milepæl. Hostingmuligheder er undersøgt i [hosting.md](hosting.md).
