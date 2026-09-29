# Fagligt grundlag for AI Harness

Research og produktforslag, 28. september 2026. Formålet og de to brugsveje er projektets aftalte retning. Anbefalingerne nedenfor er forslag til det fælles indhold, ikke en vedtaget kommunal politik eller en beskrivelse af færdige funktioner.

## Det fælles produkt

AI Harness skal hjælpe kommuner med at udvikle applikationer med AI fra idé til drift. Den primære målgruppe er udviklere, IT-medarbejdere og teknisk interesserede kolleger, som vil have støtte til afgrænsning, teknologi, data, sikkerhed, afprøvning og vedligeholdelse. Man behøver ikke kunne skrive hele løsningen selv, men skal kunne tage stilling til integrationer og drift med hjælp fra relevante fagpersoner. Den enkle brugerflade skal understøtte den forståelse.

Der er to ligeværdige brugsveje. Brugeren kan lære arbejdsgangen og installere instruktionerne i sit eget kodeværktøj eller bruge den samlede AI Harness-app. Webguiden skal kunne stå alene. Appen må ikke være nødvendig for at hente, forstå eller vedligeholde det fælles indhold.

Vejledningen til mennesket skal forklare valgene. Instruktionerne til agenten skal beskrive handlingerne. Begge skal bygge på samme faglige beslutninger, men behøver ikke indeholde den samme tekst.

[Det tekniske grundlag](teknisk-grundlag.md) skelner mellem det oprindelige arkitekturforslag og den byggede app. [Værktøjsoversigten](../site/dist/vaerktoejer.html) undersøger ti andre kodeværktøjer og mulige veje til at bruge det fælles indhold.

## Hvad researchen understøtter

Et stort regelsæt er ikke dokumentation for bedre kode. *Evaluating AGENTS.md* finder i den reviderede undersøgelse ikke en generel forbedring fra projektkontekstfiler og finder højere omkostninger i de undersøgte opgaver. Det er et benchmark af bestemte agenter og repositories, ikke en afprøvning af danske kommunale brugere. Vores konklusion er derfor at afprøve korte, relevante instruktioner frem for at antage, at flere regler er bedre. [Undersøgelsen, version 2](https://arxiv.org/abs/2602.11988v2).

Agent Skills-formatet skelner mellem en kort beskrivelse, som hjælper agenten med at vælge en skill, og instruktioner, der indlæses ved brug. Det taler for et bibliotek af afgrænsede arbejdsgange. Formatet gør ikke forskellige kodeværktøjers adgangskontrol ens. [Agent Skills-specifikationen](https://agentskills.io/specification).

Sikker udvikling gælder hele forløbet, ikke kun en scanning før udgivelse. NIST beskriver sikkerhedspraksis på tværs af udviklingsprocessen, og OWASP ASVS giver konkrete krav, som kan bruges ved teknisk verifikation. Vi foreslår at udvælge relevante kontroller og dokumentere, hvordan de er afprøvet. Vi skal ikke kalde en app sikker, alene fordi agenten har læst en skill. [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final), [OWASP ASVS](https://owasp.org/projects/asvs?tab=main).

## Fire dele med forskellige opgaver

1. **Grundregler:** Et kort fælles ansvar for nøgler, filer, tilladelser, Git og ærlig rapportering af afprøvning. De skal kunne læses uden produktkendskab.
2. **Skills:** Afgrænsede arbejdsgange til eksempelvis at undersøge et eksisterende projekt, gennemgå adgangskontrol eller forberede en udgivelse. De skal indlæses, når opgaven kræver dem.
3. **Projektprofiler:** Valg om teknologi, navngivning, design, teststrategi, Git og hosting. Begrundede standardvalg med plads til organisationens egne krav.
4. **Tekniske kontroller:** Adgangsbegrænsninger, isolation, automatiske tests, beskyttelse af grene og godkendelser ved udgivelse. Disse skal håndhæves af værktøjer og driftsmiljø, ikke af Markdown alene.

En kommunal profil skal kunne skelne mellem anbefalinger og krav. Et ufravigeligt krav må ikke alene ligge i en fil, som agenten eller brugeren frit kan ændre. Konflikter skal vises og afklares for den berørte handling, ikke løses ved at love, at Harness altid har højeste prioritet.

## Forslag til praksis

### Begynd med behov og eksisterende forhold

Afklar hvem der skal bruge løsningen, de vigtigste handlinger og de nødvendige data. Stil kun spørgsmål, der ændrer et væsentligt valg. Gem en kort, læsbar beskrivelse af det aftalte og konkrete eksempler på, hvad der skal fungere.

Undersøg et eksisterende projekt, før der foreslås nye konventioner. Find dets startvejledning, låsefiler, test, instruktioner, integrationer og aktuelle ændringer. Manglende dokumentation skal markeres som usikkerhed. Harness må ikke automatisk udskifte teknologi eller opstille en ny Git-model.

### Vælg teknologi efter opgaven

Vores foreslåede udgangspunkt er at bevare en egnet eksisterende løsning og organisationens vedligeholdelseskompetencer. For nye webprojekter:

- En enkel side uden fælles data kan begynde med HTML, CSS og begrænset JavaScript.
- Indholdstunge websites kan vurderes med Astro som kandidat. Det stemmer med Astros eget fokus på indhold. [Astros anvendelsesområde](https://docs.astro.build/en/concepts/why-astro/).
- Interaktive webapps kan bruge React og TypeScript. Vite er en kandidat til en afgrænset klientapp i Harness, hvor lokal forhåndsvisning er understøttet. Det er vores produktvalg, ikke Reacts generelle anbefaling til alle nye apps. React anbefaler at overveje et framework; routing, serverfunktioner og datahentning skal derfor vælges bevidst. [React om nye apps](https://react.dev/learn/creating-a-react-app).
- Brug TypeScripts `strict`-kontroller ved nye TypeScript-projekter. De hjælper ved kompilering, men erstatter ikke validering af modtaget data. [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict).

Backend vælges særskilt. Først afklares fælles data, login, adgang, integrationer og baggrundsjob. Derefter vurderes administrerede tjenester, serverless eller egen backend ud fra krav, drift, pris og kommunens aftaler. Vercel er en hostingmulighed; Firebase er en samling tjenester. Ingen af navnene er i sig selv en komplet arkitekturbeslutning. En demo, der kun gemmer i hukommelsen, skal beskrives som sådan.

Kommunens designsystem kommer før et nyt standardtema. Tailwind kan bruges til styling, og shadcn-komponenter kan tilpasses i projektets egen kode. MUI eller Bootstrap kan være relevante alternativer. De skal ikke præsenteres som indbyrdes identiske løsninger eller installeres samlet som standard. [Tailwind](https://tailwindcss.com/docs/styling-with-utility-classes), [shadcn](https://ui.shadcn.com/docs), [MUI](https://mui.com/material-ui/getting-started/), [Bootstrap](https://getbootstrap.com/docs/5.3/getting-started/introduction/).

Native mobil- og desktopapps skal have særskilte profiler med krav til udviklingsværktøjer, afprøvning og distribution. En webforhåndsvisning dokumenterer ikke, at en iOS-app virker. Tailscale hører til netværksadgang, ikke til valget mellem CSS-værktøjer. Ingen ny server, konto eller betaling oprettes blot som følge af et forslag til teknologi.

### Skriv kode, andre kan overtage

Følg projektets formattering og navngivning. Til nye projekter foreslår vi meningsfulde engelske kodeidentifikatorer og dansk brugerflade. Domænebegreber må ikke få en forkert oversættelse for at opfylde reglen. Navne skal tydeliggøre formål og, hvor det har betydning, enhed, eksempelvis `timeoutMs`.

Kommentarer skal især forklare begrundelser, kontrakter og begrænsninger. De skal ikke gentage hver kodelinje eller gøre simple funktioner til essays. Google fremhæver blandt andet forståelighed, navngivning, kompleksitet og relevante kommentarer i kodegennemgang; vores konkrete sprogvalg er en projektanbefaling. [Googles vejledning til kodegennemgang](https://google.github.io/eng-practices/review/reviewer/looking-for.html).

### Afprøv adfærd og fejl

Hver væsentlig ændring skal have en måde at vise, at den virker. Brug tests af regler og databehandling, integrationstests ved systemgrænser og faktisk afprøvning af centrale brugerrejser. Ved en fejl bør en reproduktion eller regressionstest vise fejlen før rettelsen, når det er praktisk relevant. TDD kan vælges som arbejdsform; det er ikke et universelt krav til enhver tekst- eller layoutændring.

Kontrollér blandt andet tomme data, ugyldigt input, manglende adgang og afbrudte forbindelser, når de berøres. Ingen procentgrænse for testdækning må stå alene som kvalitetsmål. Skriv hvad der faktisk er kørt, og hvad der stadig mangler.

Tilgængelighed kræver både automatiske og menneskelige kontroller. W3C understreger, at intet automatisk værktøj alene kan afgøre, om et website er tilgængeligt. Tastatur, fokus, fejlbeskeder, kontrast og små skærme bør indgå i vores webprofiler. [W3C om evaluering](https://www.w3.org/WAI/test-evaluate/).

### Vælg Git-arbejdsgangen udtrykkeligt

Filgemning, lokale checkpoints, commits, push og deployment er forskellige handlinger. Vores forslag er hjælpsomme påmindelser om sammenhængende versioner som standard og automatisk lokal versionsgemning som et aktivt tilvalg. Samarbejde bør kunne følge korte opgavegrene og review. Eksisterende projekter beholder deres proces. Se [det konkrete forslag til Git og projektkontrol](projektkontrol.md#git-fra-filer-til-udgivelse).

## Data og drift

Der er to selvstændige dataforløb: udviklingen i kodeværktøjet og brugen af den færdige applikation. En lokal model afgør ikke, hvor appens database ligger. En app på en europæisk server afgør ikke, hvor kodeagenten sender projektmateriale hen.

Som produktkrav foreslår vi en læsbar oversigt over de relevante dataforløb: datakategorier, formål, modtagere, model- og hostingtjenester, behandling og lagring, supportadgang, logs, sikkerhedskopier, sletning, træningsbrug og mulighed for eksport. Oplysninger skal have kilde, kontroldato og en tydelig markering af det ukendte. Henvisninger til aftaler skal kunne være adgangsbegrænsede.

Datatilsynets cloudvejledning kræver overblik over hele leverandørkæden. En regionsangivelse er derfor ikke tilstrækkelig dokumentation for den samlede databehandling. Vurderingen må omfatte de faktiske aftaler og adgange, herunder eventuelle tredjelandsoverførsler. [Datatilsynets cloudvejledning](https://www.datatilsynet.dk/regler-og-vejledning/cloud).

Databeskyttelse skal indgå i design og standardindstillinger. Det understøtter vores forslag om mindst mulige datamængder og rettigheder samt syntetiske data under tidlig afprøvning. En konsekvensanalyse er påkrævet ved sandsynlig høj risiko; Harness må hjælpe med at opdage behovet, men må ikke selv erklære en kommunal behandling lovlig. [Databeskyttelse gennem design](https://www.datatilsynet.dk/regler-og-vejledning/behandlingssikkerhed/databeskyttelse-gennem-design-og-standardindstillinger), [konsekvensanalyse](https://www.datatilsynet.dk/regler-og-vejledning/behandlingssikkerhed/konsekvensanalyse).

Før drift bør projektet have en ansvarlig for vedligeholdelse, afklarede adgangsrettigheder, udgifter og databehandling samt kontroller af backup, gendannelse og fejlrapportering. Sikkerhed skal også omfatte serverbaseret adgangskontrol, validering af input og adskillelse mellem brugeres eller organisationers data. Konkrete fund skal følges til en dokumenteret løsning eller en begrundet beslutning inden for organisationens mandat. Forslaget til en sådan [registrering og udgivelsesgennemgang](projektkontrol.md) er beskrevet særskilt.

## Forslag til skillbibliotek

Navnene nedenfor beskriver fagområder, ikke færdige eksportpakker. Hver skill skal have en klar udløser, afgrænset arbejdsopgave og et kontrollerbart resultat:

1. **Idé og afgrænsning:** Ved opstart. Giv en aftalt opgave, nødvendige spørgsmål og konkrete acceptkriterier.
2. **Eksisterende projekt:** Ved tilslutning. Giv et overblik over den faktiske opsætning og et forslag, som bevarer lokale valg.
3. **Arkitektur og teknologi:** Ved nye væsentlige valg. Giv én begrundet anbefaling, relevante alternativer og driftskonsekvenser.
4. **Data og leverandører:** Ved nye dataforløb eller tjenester. Giv en opdateret oversigt, kilder og spørgsmål til ansvarlige.
5. **Nøgler og afhængigheder:** Ved integrationer og pakkeændringer. Kontrollér hemmeligheder, nødvendighed, versioner og låsefiler uden at gengive nøgler.
6. **Design og tilgængelighed:** Ved brugerfladeopgaver. Anvend godkendte referencer og afprøv det synlige resultat.
7. **Kodestil og vedligeholdelse:** Ved implementering og review. Kontrollér konventioner, kompleksitet og forståelighed.
8. **Afprøvning og fejlretning:** Ved ændringer. Giv reproduktion, relevante kontroller og faktisk evidens.
9. **Git og samarbejde:** Ved milepæle. Gennemgå de berørte ændringer og følg projektets valgte tilladelser og proces.
10. **Sikkerhedsgennemgang:** Ved berørte sikkerhedsgrænser og før drift. Kontrollér blandt andet adgang, input og dataadskillelse; registrér konkrete fund.
11. **Udgivelse og gendannelse:** Ved ønsket deployment. Gennemgå version, miljø, godkendelser, dataændringer og vej tilbage; afprøv den udgivne tjeneste.
12. **Overdragelse og drift:** Ved overdragelse. Giv en brugbar start- og driftsvejledning uden adgangsoplysninger.

Ikke alle skills skal køre på hver opgave. En tekstændring skal eksempelvis ikke udløse et nyt valg af backend. Skills skal kunne startes bevidst af brugeren, og relevant automatisk indlæsning skal afprøves pr. værktøj.

## Sådan skal brugeren få indholdet

Ved første åbning viser appen to store valg: **Byg i AI Harness-appen** og **Brug Harness i mit kodeværktøj**. Valget hører til appens første skærm; operativsystemets installer håndterer fortsat installationen. Begge veje kan åbnes igen fra sidepanelet.

Sporet til eget værktøj skal spørge om værktøj og projektmappe, vise et anbefalet udvalg og derefter vise de konkrete filændringer. Det skal ikke kræve en modelnøgle til Harness. Avancerede valg, herunder installation for alle brugerens projekter, åbnes særskilt. Webguiden skal tilbyde samme indhold, manuel ZIP-installation og en vejledning, som den eksisterende agent kan følge fra repositoryet.

Der skal være særskilte adaptere til indlæsning og kontrol:

- **Claude Code:** Projektregler i `CLAUDE.md` og skills i `.claude/skills/<navn>/SKILL.md`. `disable-model-invocation: true` betyder manuel aktivering, mens `allowed-tools` kan give forhåndstilladelser og derfor ikke må behandles som en begrænsning. [Claude Codes skills](https://code.claude.com/docs/en/skills).
- **Codex:** Projektregler i `AGENTS.md` og projektskills i `.agents/skills/<navn>/SKILL.md`. Plugins er en mulig distributionsform, men er ikke samme pakkeformat som alle andre værktøjers plugins. [Codex-skills](https://learn.chatgpt.com/docs/build-skills), [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
- **OpenCode:** Projektregler i `AGENTS.md` og skills i `.opencode/skills/<navn>/SKILL.md`. OpenCode kan også læse kompatible skillmapper; installer ikke den samme skill flere steder ved kombineret brug. [OpenCode-skills](https://opencode.ai/docs/skills/), [regler](https://opencode.ai/docs/rules/).

Installationen skal bevare eksisterende regler og tilpasninger. Den skal have en gennemgang før skrivning, version og indholdsoversigt, håndtering af navnekonflikter samt mulighed for at fortryde uden at slette andre filer. Den må ikke ændre modelkonti, tilladelser eller køre medfølgende scripts uden særskilt aftale. Opdateringer skal vise ændringer i indhold og bevare lokale tilpasninger. En kontrolsum kan påvise ændret indhold; den beviser ikke alene afsenderens identitet.

## Det er bygget, og det mangler

Status 29. september 2026:

- **Skillbiblioteket** med de 12 fagområder ovenfor ligger i `profiles/skills` som skills efter Agent Skills-formatet. Navnene begynder med `harness-` og bruger kun ASCII. Frontmatter har kun `name` og `description`, så filerne kan valideres og bruges i alle værktøjer. Detaljer og skabeloner ligger i `references/`, herunder danske offentlige krav om webtilgængelighed, databeskyttelse, login med MitID, journalisering, AI-forordningen og NIS2. [FAQ om skillsene](../profiles/SKILLS.md).
- **Adaptere til 23 kodeværktøjer og en tekst til Lovable** er beskrevet som data i `profiles/catalog.json`. `AGENTS.md` er fælles regelfil; Claude Code og Gemini CLI får en `CLAUDE.md` eller `GEMINI.md`, der importerer den. Skills lægges i `.agents/skills`, som de fleste værktøjer læser, og i værktøjets egen mappe, når det er nødvendigt, fx `.claude/skills` til Claude Code og `.kiro/skills` til Kiro. [Værktøjsoversigten](../site/dist/vaerktoejer.html) viser placering, kontrol og forbehold pr. værktøj.
- **Installationen** viser ændringerne før skrivning, overskriver aldrig, tilføjer afgrænsede afsnit mellem faste markører, registrerer version og kontrolsummer i `.harness/installation.json`, springer ændrede filer over ved opdatering og fjerner kun uændrede filer. Den bruges af appens førstevalg "Brug Harness i mit kodeværktøj", af `scripts/harness.cjs` og af byggescriptet til webguidens ZIP-pakker.
- **Webguiden** har pakker til alle værktøjerne, en vejledning, som brugerens egen kodeagent kan følge, og en FAQ om skillsene.
- **Udvælgelse:** skillsene er delt i fire kategorier. I appen kan kategorier og enkelte skills slås til og fra; grundreglerne er altid med, og udvalget huskes i installationen.

Det mangler stadig:

- En måling af, om skillsene forbedrer arbejdet for målgruppen, og om modellerne vælger den rigtige skill. Se afsnittet nedenfor.
- Afprøvning i de 21 værktøjer, der kun følger dokumentationen, og i Codex med en rigtig session.
- Installation for alle brugerens projekter på én gang, organisationsprofiler med kommunens egne krav og en måde at distribuere biblioteket uden adgang til repositoryet.
- At appens indbyggede agent bruger det fælles bibliotek med indlæsning efter behov. Den bruger i dag sine egne instruktioner i `profiles/app`.
- Registrering af data, beslutninger og godkendelse før udgivelse som funktion i appen. Skillen om data og leverandører giver indtil videre en dataoversigt i en Markdown-fil.

Repositoryet er privat. En agent, der skal hente derfra, skal bruge brugerens eksisterende godkendte adgang. Ingen vejledning må bede om at indsætte tokens i prompts eller downloadadresser. Der er endnu ikke en publiceret GitHub Pages-side.

## Vedligeholdelse og bevis for virkning

Hver faglig anbefaling bør have en begrundelse, kilder og kontroldato, ansvarlig vedligeholder, status samt en beskrivelse af, hvornår en lokal tilpasning er relevant. Konkrete produktoplysninger og vilkår skal kontrolleres igen ved relevante opdateringer. Ingen leverandør skal få en generel kvalitets- eller datagodkendelse alene ved at levere en adapter.

Vi foreslår at sammenligne samme opgaver uden Harness, med grundreglerne og med de relevante skills. Fasthold og registrér værktøjsversion, model, opgave og tilladelser, og gentag prøverne. Brug syntetiske projekter med både nye og eksisterende opsætninger. Kontroller faktisk kode, filændringer, tilladelser og brugerrejser, også når modellen hævder, at arbejdet er færdigt. En korrekt gengivelse af et kontrolord viser højst, at instruktionen er tilgængelig.

Prøverne skal blandt andet vise, at agenten reagerer på en syntetisk nøgle, respekterer afvist handling, bevarer andre ændringer og ikke gennemfører en udgivelse med manglende nødvendige beslutninger. De skal også vise, at en irrelevant skill ikke udløser ekstra arbejde. En person uden udviklererfaring skal kunne forklare næste skridt og genkende, hvornår en fagperson skal inddrages.

Researchen er sammenholdt med officielle kilder og den nuværende kode. Skills og installationsadaptere er implementeret; projektkontrollerne er ikke. Der er endnu ingen måling af, om instruktionerne forbedrer kodekvaliteten for målgruppen. Nyere undersøgelser fra 2026 finder, at generelle kontekstfiler sjældent gør agenter mere korrekte, mens fokuserede skills kan hjælpe ved bestemte opgaver, og at det er et reelt fejlpunkt, om modellen faktisk vælger skillen. [SkillsBench](https://arxiv.org/abs/2602.12670), [SWE-Skills-Bench](https://arxiv.org/abs/2603.15401).
