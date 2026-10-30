# Aura-design til dine apps

`harness-aura-design` er en vejledning til de apps, sider og præsentationer, du bygger med Aura Harness. Den supplerer den eksisterende design- og tilgængelighedsskill med en metode til brandkilder, en konkret designretning, farver og typografi, lyst/mørkt tema, appmønstre og dokumenteret afprøvning.

## Brug i Aura og dit eget kodeværktøj

**Design og tilgængelighed er altid slået til i Aura 1.** Under **Indstillinger → Funktioner → Altid slået til** står Aura-design og byggevejledningen som del af grundpakken. Tidligere globale fravalg og projektundtagelser deaktiverer dem ikke. Det gælder også efter genstart og ved Vælg selv i opsætningen.

Hovedskillens kerne og tre korte referencer indlæses automatisk før det første modelkald i idéhjælp, Planlæg, Byg og Byg den valgte plan, uanset modeludbyder. Referencerne dækker designbrief, brandresearch og komponentinspiration. De leveres som hele filer inden for et samlet loft på 12 KiB; manglende eller for store filer angives som udeladte. Metoden kræver et gennemarbejdet første udkast med en konkret designretning, typografi, farver, sammenhængende brugerforløb og visuel kontrol. Længere referencer og design- og tilgængelighedsskillen kan hentes efter behov. Almindelig samtale tilføjes ikke automatisk byggeinstruktioner.

Den valgte model står for design og udførelse gennem de aktive skills. Aura vælger ikke faste farver eller layoutopskrifter ud fra, om opgaven handler om mad, tidsregistrering eller en hjemmeside. Brugerens godkendte design, valgte primærfarve og dokumenterede brandkilder har forrang. En lokal designguide eller `BRAND.md`, rettighedsafklarede logoer og verificerede officielle kilder kan indgå. Kommunens navn er ikke i sig selv dokumentation for et logo eller en farve.

I idéhjælpen er hovedskillen indlæst, men modellen har ingen værktøjer til at åbne links eller læse ekstra referencer. Derfor skal usete kilder og foreslåede designvalg markeres ærligt. Brugerens komponentinspiration kan undersøges under det efterfølgende arbejde med de normale tilladelser; inspiration giver ikke automatisk ret til kopiering eller installation.

Under **Tilpas instruktioner** kan du læse skillen, gemme en lokal projekttilpasning og gendanne bibliotekets fælles version. Projekttilpasningen supplerer den obligatoriske designkerne; den erstatter den ikke. Ældre tilpasninger kan fortsat åbnes og gemmes uden at få brugerens tekst omskrevet, når biblioteket får nye grundreferencer. Ukendte referencer afvises stadig. Hele den indlæste tekst er med i gennemgangen før afsendelse. De eksisterende projektfiler og regler bevares.

Skillen følger også med de 23 instruktionspakker til kodeværktøjer. Den bruger hver adapters eksisterende skillplacering. Pakkerne indeholder nu 13 almindelige skills; de fire systemintegrationer er fortsat særskilte tilvalg. Eksport understøtter filplaceringen, men er ikke bevis for, at hvert kodeværktøj eller en bestemt model følger instruktionerne.

### Sammen med andre designskills

Aura-design instruerer modellen i også at bruge relevante design-, frontend-, komponent- og visuelle kvalitetsskills, som det aktuelle miljø faktisk tilbyder. Eksporten til eksempelvis Codex og Claude Code kan derfor arbejde sammen med deres installerede designskills. Modellen skal læse de relevante instruktioner, forene dem med brugerens design og kort angive, hvad den faktisk anvendte. Designgrundpakken, planer og tilladelser bevares.

I selve Aura kommer skills fortsat fra det gennemgåede fælles bibliotek. Et valg af GPT eller Claude importerer ikke automatisk platformens eller computerens øvrige skills. Denne ændring er vejledning om samarbejde mellem tilgængelige skills; den tilføjer ingen eksterne skillpakker, værtsværktøjer eller ny API-integration. Nye konkrete skills skal gennemgås og indgå i biblioteket, før Aura kan tilbyde dem. Det samme materiale kan derefter bruges af Mistral og Corti, når det er kompatibelt.

Det stemmer med leverandørernes skelnen mellem model og tilknyttede ressourcer: [OpenAI beskriver skills som eksplicit tilgængelige instruktioner og filer](https://developers.openai.com/api/docs/guides/tools-skills), og [Claude dokumenterer særskilt opsætning af API-skills](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview). Der påstås ikke adgang til interne designinstruktioner i ChatGPT eller Claude.

Et eksempel på en opgave:

> Byg en oversigt over vores mødelokaler. Brug den lokale designguide og de vedhæftede skitser. Vis en repræsentativ skærm, før vi beslutter designretningen. Bevar den nuværende navigation og funktioner.

## Indhold og grænser

Kernen er udvidet med brugerens metode til at omsætte en enkelt sætning til et gennemarbejdet produkt. Den fulde byggevejledning findes i `references/webapp-craft.md`. Begge dele er integreret i Aura 1 sammen med automatisk indlæsning før modelkald. Mangler hovedskillen eller er den ugyldig, stoppes byggeforespørgslen, før noget sendes.


- Brandmetode med dokumenterede kilder og tydelige antagelser.
- 43 beskrevne designretninger som inspiration, herunder fem valgfrie kompositionsopskrifter. Der følger ingen downloadede SkillsUI-skills eller 43 færdige temaer med.
- Designbrief og kvalitetsgennemgang, appmønstre og vejledning til agentarbejdsrum og paneler. Det er instruktioner til brugerprojektet, ikke nye runtimefunktioner.
- Læsbare HTML-/CSS-eksempler og en valgfri offline tokengenerator med målte kontrastpar og inputvalidering.
- Kontrol af reelle brugerhandlinger, små skærme, zoom, tastatur, temaer og bevægelse med ærlig angivelse af, hvad der ikke er afprøvet.

Biblioteket indeholder **24 Markdown-filer**, herunder valgfri komponentinspiration fra Fisher UI og andre moderne komponentkilder. Unparalleled bidrager med en tilpasset metode til konkret designbrief, ét færdigt brugerforløb og afgrænset review. Oversight Supply indgår som inspirationsreference med egne metodeformuleringer og links; ingen proprietære templates, prompts eller assets medfølger. Eksempelkode køres ikke ved indlæsning. Hvis den materialiseres eller køres i et brugerprojekt, gælder de normale fil- og værktøjsgodkendelser. Python er alene et valgfrit projektværktøj til generatoren og bliver ikke en afhængighed for Aura.

Open Design Agent Kit bidrager med to lokale, passive HTML/CSS-eksempler: en landingpage og et redaktionelt overblik. Ved et nyt UI skal modellen læse ét relevant eksempel før designforslag og UI-kode. Aura viser det konkrete native skillkald først, og skillresultatet giver de præcise filstier. Et allerede læst eksempel genbruges i samme samtale. Modellen vælger stadig udtrykket og kan forkaste det, hvis det ikke passer. Ved vedligeholdelse bevares eksisterende godkendt UI, og idéhjælp uden værktøjer bruger kun indlæst materiale. Google Fonts-afhængigheder er fjernet fra overblikseksemplet. Fuld Apache-2.0-licens, kittets MIT-notice og låste kildehashes følger med. Eksemplerne har statiske demohandlinger, som modellen selv skal implementere og afprøve. Ingen MCP-server, CLI, scripts eller automatisk installation medfølger.

Skillen ændrer ikke Auras egen brugerflade, onboarding, planer, godkendelser, modelvalg eller adgang til data og netværk. Den indfører ingen Privacy Gate eller sandbox. Et godkendt design i brugerprojektet må heller ikke udskiftes uden brugerens konkrete ønske og accept. Instruktioner er vejledning, ikke teknisk håndhævelse eller garanti for en models adfærd.

## Kompatibilitet og kilde

Den gennemgåede kilde er [Aura Design 1.1](https://github.com/Parthee-Vijaya/skills_claude/tree/88ef16cf3f8916911f5f26cb5a334dbdf332d1f5/aura-design) af Parthee Vijayamohan. Den er tilpasset original AI Harness ved `dce68ea74a199ca214ab535a16ff22765d8ee8de` (`0.6.0-beta.1`).

En direkte kopi passer ikke til originalens bibliotek: det kræver navnet `harness-…`, kun frontmatterfelterne `name` og `description` samt `SKILL.md` og Markdown-referencer. Startere, brief, notice og generator er derfor tilgængelige som referencer. Originalens format- og stivalidering er uændret.

Kildens `brand_scan.py` og `qa.py` medfølger ikke: de kan henholdsvis hente vilkårlige adresser/redirects og servere hele målmapper eller hente ekstern testkode. Brug projektets allerede tilladte research- og testværktøjer. Generatorreferencen har inputvalidering og dokumenterer præcis de farvepar, den måler; den er ikke en fuld WCAG-afprøvning. En udefineret `--t-hero` i kildens valgfrie layout er erstattet af generatorens `--t-3xl`.

[Proveniensreferencen](../profiles/skills/harness-aura-design/references/provenance.md) fastholder alle 18 kildefilers SHA-256, tilpasninger og licensoplysninger. EUPL-1.2 og den medfølgende MIT-notice bevares. Organisationers logoer og fonte samt SkillsUI-materiale får ingen ny licens gennem denne skill.

## Afprøvning

Se [rettelsen af eksempellæsning og den nye rigtige AI-prøve](design-example-reading-20261030.md). Begge modeller har nu dokumenteret læsning og efterfølgende modtagelse af eksempelkoden. Mistrals app består 11 relevante funktionskriterier; én feltvalidering er ikke relevant. Corti læste filen, men leverede ingen ny app efter to afbrudte byggesvar. Læsning er ikke i sig selv dokumentation for flot design.

Se [Open Design-prøven med samme opgave og budget](open-design-examples-20261030.md) for fire nye AI-forløb, funktionskontroller, tid og pris. Efter-prøverne modtog kataloget, men ingen læsninger af de to nye eksempelfiler blev registreret. Der er derfor endnu ikke dokumentation for, at eksemplerne løfter designkvaliteten.

Se [Unparalleled/Oversight-prøven med rigtig Mistral og Corti](design-methods-20261030.md) for samme opgave og budget, faktiske funktionsudfald, tid, pris og begrænsninger. Integration af en metode er ikke i sig selv dokumentation for bedre design.

Se [det oprindelige bidrags før/eftervisninger og begrænsninger](contributions/aura-design-pr.md) og [grundpakkens implementering og prøver](design-baseline.md). Eksport til andre kodeværktøjer bevarer fortsat brugerens eksplicitte skilludvalg; Aura 1s faste grundpakke gælder appens egne byggeforløb.

Under lokal afprøvning er der nu også [en programstyret appkontrol](design-quality-control.md). Dokumentet skelner mellem modelstyret design gennem skills, målbare fejl og visuel kvalitet. Det tidligere forsøg med faste designgrundlag er taget ud af modelinstruktionerne; lokal forsøgs- og testkode bevares som historisk reference. Denne udvidelse er endnu ikke udgivet i en DMG; eksport af skillen giver ikke andre kodeværktøjer Auras Electron-kontrol.
