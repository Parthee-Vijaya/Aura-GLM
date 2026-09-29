# Produktretning og beslutninger

## Fælles Harness og to brugsveje

Retning afklaret i projektsamtalen 28. september 2026. Dette er ikke en formel vedtagelse på vegne af deltagende kommuner.

AI Harness skal samle en fælles arbejdsmetode for kommunal udvikling med AI fra idé til drift. Indholdet skal hjælpe både nye og erfarne brugere med kodekvalitet, sikkerhed, databeskyttelse, kontrol over data og overdragelse. Det skal kunne bruges gennem eget kodeværktøj og en selvstændig webguide eller samlet i desktopappen. README og hjemmesidens forside skal forklare formålet og give de to veje samme vægt.

[Det faglige grundlag](harness-grundlag.md) indeholder research og forslag til skills, teknologivalg og integration. [Projektkontrol](projektkontrol.md) beskriver forslag til konkrete risikoregistreringer, versionsbundne beslutninger, Git og tilslutning af eksisterende projekter. De tekniske forslag er endnu ikke implementeret eller godkendt som organisationspolitik. Tekstinstruktioner må ikke omtales som teknisk håndhævelse eller en garanti for GDPR.

## Præcisering af målgruppe og teknisk grundlag

Afklaret i projektsamtalen 28. september 2026: Den primære målgruppe er udviklere, IT-medarbejdere og teknisk interesserede kolleger, som vil bygge med AI, men ønsker hjælp til kode og udviklingsarbejdsgang. De skal fortsat kunne tage stilling til tjenester, data og hosting med deres organisation. Guidet opstart og et enkelt sprog bevares. Harness kræver ikke et Promte-abonnement; det indebærer ikke, at valgte modeller eller hostingtjenester er gratis.

Kildegennemgangen bekræfter det oprindelige forslag om en egen brugerflade og konfiguration omkring OpenCode uden en fork. Det samlede forslag om organisationsstyring, revisionsspor og isolation er ikke implementeret. Pi skal vurderes som mulig alternativ motor; der er ikke besluttet eller udført et skift. Se [teknisk grundlag](teknisk-grundlag.md).

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
