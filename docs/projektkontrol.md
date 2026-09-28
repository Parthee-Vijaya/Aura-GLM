# Projektkontrol, Git og godkendelse af udgivelser

Produktforslag, 28. september 2026. Dette beskriver ønsket adfærd og afprøvning. Det er ikke en færdig funktion eller en ny godkendelse til at ændre brugerens Git. Se også [det faglige grundlag](harness-grundlag.md).

## Registrér det konkrete forhold

Harness bør hjælpe brugeren med at følge åbne spørgsmål, fejl og beslutninger gennem projektet. En observation kan komme fra brugeren, en automatisk kontrol, en kodegennemgang eller agenten. Kilden skal fremgå. Agentens forslag er ikke i sig selv et bekræftet fund.

En registrering skal beskrive forholdet, hvad det berører, konsekvensen, relevant dokumentation, ansvarlig rolle og næste handling. Status kan være **skal undersøges**, **kræver handling**, **afventer ansvarlig**, **løst og kontrolleret** eller **ikke relevant med begrundelse**. En afgrænset risikobeslutning kan registreres særskilt. At acceptere en risiko gør ikke en ulovlig behandling lovlig.

Eksempel: “Løsningen skal sende brugernes mailadresser til en ny beskedtjeneste. Formål og slettefrist er beskrevet, men tjenestens aftale og supportadgang er ikke afklaret.” Det giver noget konkret at handle på. En generel “GDPR godkendt”-markering gør ikke.

Den dataansvarlige har ansvaret for og skal kunne dokumentere passende foranstaltninger. En bruger i Harness overtager ikke automatisk kommunens mandat ved at klikke på en knap. DPO, sikkerhedsfunktion og systemansvarlige skal inddrages efter deres faktiske roller; en DPO må ikke blot gøres til universel godkender i produktet. [Den dataansvarliges forpligtelser](https://www.datatilsynet.dk/regler-og-vejledning/grundlaeggende-begreber/hvad-er-dine-forpligtelser/den-dataansvarliges-forpligtelser), [DPO-rollen](https://www.datatilsynet.dk/regler-og-vejledning/databeskyttelsesraadgivere-dpoer).

## Dokumentation, som kan følge projektet

En læsbar Markdown-fil er velegnet til overblik og begrundelser. Til maskinelle kontroller foreslår vi et versioneret JSON-format, som også kan vises som Markdown. Der bør være én datakilde, så brugerflade og dokument ikke kan modsige hinanden. Det kræver ikke en proprietær database.

Formatet bør mindst registrere:

- Et stabilt ID, revision, kilde og beskrivelse uden persondataeksempler eller hemmeligheder.
- Berørte datakategorier, tjenester, funktioner og miljøer.
- Krav eller risiko, ansvarlig rolle, status, begrundelse og evidenshenvisninger.
- Ved en beslutning: hvem der traf den, deres mandat, tidspunkt og tidskilde, præcis revision og beslutningens omfang.
- For en udgivelse: kildecommit, byggeartefaktets kontrolsum, destinationsmiljø, relevante konfigurationsversioner og hvilke beslutninger der er lagt til grund. Nøgleværdier skal aldrig indgå.

Beslutninger tilføjes som nye hændelser. En ændring må ikke lydløst omskrive det tidligere “godkendt”. Git kan dokumentere ændringshistorik og review, men en lokal fil og omskrivbar Git-historik er ikke et manipulationssikret revisionsspor.

Hvis brugeren selv skriver “Bjørn”, og tidspunktet kommer fra computeren, skal appen kalde det **lokalt registreret af brugeren**. Dokumenteret identitet kræver en autentificeret konto; dokumenteret mandat kræver mere end login. En stærkere løsning kan henvise til organisationens eksisterende review- eller godkendelsessystem med kontrolleret adgang og tidsregistrering. GitHub, GitLab, Codeberg eller egne systemer kan have forskellige muligheder. De skal afprøves særskilt.

Navne og beslutningshistorik kan selv indeholde personoplysninger. Offentlige repositories bør kun have en passende, begrænset projektoversigt. Personoplysninger, aftaler og følsomme fund kan ligge i organisationens adgangsbegrænsede system med henvisninger fra projektet. Aftal opbevaring og sletning; læg ikke alt permanent i Git, blot fordi det er teknisk muligt.

## Før en udgivelse

Brugeren skal se en kort gennemgang af den konkrete udgivelse med mulighed for at åbne detaljer:

1. Hvilken appversion og hvilket miljø er valgt? Er der ændringer, som ikke er med i den gennemgåede version?
2. Hvilke nye eller ændrede dataforløb, adgange, leverandører og udgifter er der?
3. Hvilke kontroller er kørt på versionen, og hvilke forhold er stadig åbne?
4. Hvilke godkendelser kræver projektets politik, og foreligger de fra de rette roller?
5. Hvordan kontrolleres den faktiske tjeneste, og hvordan kan man rulle tilbage eller gendanne data?

Knappen kan eksempelvis hedde **Godkend denne udgivelse til test**. Handlingen skal være afgrænset til version, miljø og viste forhold. Den skal ikke kaldes accept af GDPR og er ikke de registreredes samtykke til behandling.

Nye datatyper, modtagere, supportadgange, væsentlige adgangsændringer eller hostingændringer skal markere berørte beslutninger til ny gennemgang. Rettelse af en stavefejl skal ikke automatisk genåbne alle databeslutninger. Udgivelsens tekniske kontroller skal dog passe til den aktuelle kode og konfiguration. Også ændringer uden for Git, eksempelvis leverandørvilkår og driftsopsætning, kan gøre en tidligere vurdering utilstrækkelig.

Agenten kan foreslå, hvilke beslutninger en ændring berører. Hvis sammenhængen ikke kan afgøres, skal den fremgå som uafklaret. Fravær af fund må ikke vises som bevis for fravær af problemer. Automatisk detektion bør kombineres med få konkrete spørgsmål om data, brugere og drift.

En manglende nødvendig beslutning skal blokere den berørte udgivelse under den valgte organisationspolitik. Brugeren kan stadig arbejde på kode og afprøve med syntetiske data inden for de øvrige tilladelser. Ufravigelige krav må ikke kunne omgås med en generel “jeg accepterer”-knap.

## Hvor kontrollen skal håndhæves

En kontrol i appen stopper kun appens egen udgivelsesvej. Hvis kommunen kræver obligatorisk review, skal det også håndhæves i repositoryet og udgivelsesmiljøet, med adgang til produktionsnøgler begrænset til den godkendte proces. Ellers kan en anden klient springe skærmen over.

GitHub-miljøer kan eksempelvis kræve review før udgivelse og tilbageholde miljøets hemmeligheder, indtil kravet er opfyldt. Tilgængeligheden afhænger af abonnement og repositorytype. Vi skal kontrollere den konkrete tjenestes muligheder frem for at antage, at alle Git-tjenester understøtter samme kontrol. [GitHub om udgivelsesmiljøer](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

Politikken og selve kontrollen skal også beskyttes mod ændringer fra den agent, som kontrolleres. Appen skal forklare, om der kun er vejledning, en lokal kontrol eller en håndhævet kontrol hos udgivelsestjenesten. En lokal fil med værdien `approved: true` må aldrig være tilstrækkelig autorisation til produktion.

## Git: fra filer til udgivelse

Disse er foreslåede standardvalg for projekter, der bruger Harness. De ændrer ikke Git-reglerne for arbejdet i dette repository.

**Gem filer løbende.** Autosave beskytter kladden. Det giver hverken en Git-version, review eller en kopi på en anden maskine. Agenten bør desuden kunne stoppe uden at efterlade uklare igangværende handlinger.

**Gem sammenhængende versioner.** Standardforløbet bør foreslå et checkpoint efter en afgrænset opgave, vise ændringerne og de faktisk udførte kontroller og lade brugeren gemme en version. En prompt er ikke en stabil enhed: én opgave kan kræve flere prompts, og en afbrudt prompt kan efterlade delvise ændringer.

**Tilbyd automatisk lokal versionsgemning som et tilvalg.** Brugeren vælger projekt og ramme på forhånd. En afsluttet AI-opgave kan derefter udløse et checkpoint, når ændringerne kan afgrænses, de aftalte kontroller er gennemført, og ingen uafklarede hemmelighedsfund eller sammenblandede ændringer står i vejen. Tomme opgaver giver ingen commit. Afbrudte eller fejlede opgaver må ikke mærkes som gennemførte versioner. En særskilt gendannelseskopi af ufærdigt arbejde skal tydeligt have en anden status. Automatikken giver ingen ret til push, merge eller udgivelse.

**Adskil gemning og samarbejde.** “Gem version” betyder lokal commit, når Git er sat op. “Send til repository” betyder push til den valgte destination. Første tilslutning skal vise ejer, repository og synlighed. Brugeren skal forstå forskellen på lokal historik og en fjernkopi. GitHub er én mulighed, ikke et krav om AI Alliancens organisation.

**Brug grene efter samarbejdsformen.** Til et enkelt lokalt prøveprojekt kan en enkel historik være tilstrækkelig. Til teamarbejde foreslår vi en beskyttet hovedgren, korte opgavegrene og pull requests med relevante kontroller og review. Det følger den enkle grenbaserede model i GitHub flow, men er ikke begrænset til GitHub. [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow).

**Brug worktrees, når der faktisk arbejdes parallelt.** De giver separate arbejdsmapper til forskellige grene. De skal ikke være en obligatorisk øvelse for en ny bruger eller oprettes for hver prompt. De isolerer heller ikke automatisk processer, netværk eller hemmeligheder som en sandbox ville gøre. [Gits worktree-dokumentation](https://git-scm.com/docs/git-worktree).

**Gør miljøer til miljøer.** Test og produktion bør som udgangspunkt pege på kendte commits og byggeartefakter med adskilte data og nøgler. Opret ikke automatisk permanente `test`- og `prod`-grene ved klik på deployment. Hvor det er muligt, promoveres samme afprøvede artefakt. Hvis miljøafhængig indbygget konfiguration kræver en ny bygning, skal dens identitet og kontroller registreres. En pull request kan få et midlertidigt preview uden at gøre testdata offentlige.

**Review giver ikke automatisk driftstilladelse.** En godkendt pull request handler om ændringen. Udgivelsesgodkendelsen handler også om version, miljø, data, drift og mandat. Gendannelse af kode ruller heller ikke automatisk en databasemigrering tilbage. Begge dele skal indgå i den konkrete vej tilbage.

## Når projektet allerede findes

Tilslutning skal begynde med en læsende gennemgang. Vis eksisterende instruktioner, sprog, låsefiler, start- og testkommandoer, Git-status, grene, remotes, CI og hostingopsætning i en kort opsummering. Kør ikke projektkommandoer eller upload filer blot for at opdage projektet.

Foreslå derefter de relevante Harness-dele. Vis de præcise ændringer, og lad brugeren vælge. Tilføj ikke en ny formatter, pakkehåndtering, Git-identitet, branchestrategi eller hostingtjeneste som en skjult følge af at importere skills. Ukendte kommandoer og tidligere installationer er ikke tillidserklæringer.

Bevar både staged og unstaged arbejde og allerede eksisterende filkonflikter. En agentversion må kun omfatte den tilsigtede ændring. Hvis brugerens og agentens ændringer i samme fil ikke kan adskilles sikkert, kræves manuel gennemgang i stedet for automatisk staging. Der må ikke køres en samlet `git add .`, nulstilling, rebase eller force-push som oprydning.

Opret et overblik over kendte forhold ved tilslutning. Gamle fund må ikke uden videre tilskrives den nye ændring, og manglende historik må ikke omsættes til en opdigtet tidligere godkendelse. En ny udgivelse vurderes efter den aftalte politik, også når et åbent problem er ældre end Harness.

## Afprøvning før funktionen kan kaldes klar

Brug syntetiske projekter og kontroller både filerne og de faktiske handlinger:

- Et nyt dataflow bliver registreret; samme observation giver ikke dubletter. En afvist observation kan begrundes uden at blive slettet fra historikken.
- En anden konto uden det nødvendige mandat kan ikke godkende. Et selvangivet navn og lokalt klokkeslæt vises ikke som verificeret.
- Ændrede relevante forhold gør beslutningen forældet. En gammel beslutning, ændret statusfil eller forkert artefakt kan ikke frigive den beskyttede udgivelse.
- Eksport og logs udelader hemmeligheder og følsomme bilag. Begrænsede henvisninger bliver ikke offentlige ved en almindelig projektpakke.
- Automatisk checkpoint håndterer ingen ændringer, stop, fejl, syntetisk nøgle, eksisterende staged arbejde og ændringer fra en anden proces uden at inkludere forkert indhold.
- Import, opdatering og fjernelse af Harness bevarer lokale regler, projekthistorik og øvrige filer. Eksisterende CI og udgivelsesregler er uændrede uden et aktivt valg.
- Testudgivelse og produktion bruger den tilsigtede version. Den faktiske tjeneste, adgangsgrænse og gendannelsesvej afprøves efter udgivelse.

Dette forslag er dokumenteret, men kontrolregisteret, den beskrevne godkendelsesbinding og den samlede Git-politik er endnu ikke implementeret eller afprøvet. Appens eksisterende versionsfunktioner og konkrete testresultater er beskrevet i [teststatus](teststatus.md).
