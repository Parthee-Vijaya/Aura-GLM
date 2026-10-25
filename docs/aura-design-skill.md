# Aura-design til dine apps

`harness-aura-design` er en vejledning til de apps, sider og præsentationer, du bygger med Aura Harness. Den supplerer den eksisterende design- og tilgængelighedsskill med en metode til brandkilder, en konkret designretning, farver og typografi, lyst/mørkt tema, appmønstre og dokumenteret afprøvning.

## Brug i Aura og dit eget kodeværktøj

**Design og tilgængelighed er altid slået til i Aura 1.** Under **Indstillinger → Funktioner → Altid slået til** står Aura-design og byggevejledningen som del af grundpakken. Tidligere globale fravalg og projektundtagelser deaktiverer dem ikke. Det gælder også efter genstart og ved Vælg selv i opsætningen.

Hovedskillens kerne indlæses automatisk før det første modelkald i idéhjælp, Planlæg, Byg og Byg den valgte plan, uanset modeludbyder. Den kræver et gennemarbejdet første udkast med en konkret designretning, typografi, farver, sammenhængende brugerforløb og visuel kontrol. Længere referencer og design- og tilgængelighedsskillen kan hentes efter behov. Almindelig samtale tilføjes ikke automatisk byggeinstruktioner.

Den valgte model står for design og udførelse gennem de aktive skills. Aura vælger ikke faste farver eller layoutopskrifter ud fra, om opgaven handler om mad, tidsregistrering eller en hjemmeside. Brugerens godkendte design, valgte primærfarve og dokumenterede brandkilder har forrang. En lokal designguide eller `BRAND.md`, rettighedsafklarede logoer og verificerede officielle kilder kan indgå. Kommunens navn er ikke i sig selv dokumentation for et logo eller en farve.

I idéhjælpen er hovedskillen indlæst, men modellen har ingen værktøjer til at åbne links eller læse ekstra referencer. Derfor skal usete kilder og foreslåede designvalg markeres ærligt. Brugerens komponentinspiration kan undersøges under det efterfølgende arbejde med de normale tilladelser; inspiration giver ikke automatisk ret til kopiering eller installation.

Under **Tilpas instruktioner** kan du læse skillen, gemme en lokal projekttilpasning og gendanne bibliotekets fælles version. Projekttilpasningen supplerer den obligatoriske designkerne; den erstatter den ikke. Hele den indlæste tekst er med i gennemgangen før afsendelse. De eksisterende projektfiler og regler bevares.

Skillen følger også med de 23 instruktionspakker til kodeværktøjer. Den bruger hver adapters eksisterende skillplacering. Pakkerne indeholder nu 13 almindelige skills; de fire systemintegrationer er fortsat særskilte tilvalg. Eksport understøtter filplaceringen, men er ikke bevis for, at hvert kodeværktøj eller en bestemt model følger instruktionerne.

Et eksempel på en opgave:

> Byg en oversigt over vores mødelokaler. Brug den lokale designguide og de vedhæftede skitser. Vis en repræsentativ skærm, før vi beslutter designretningen. Bevar den nuværende navigation og funktioner.

## Indhold og grænser

Kernen er udvidet med brugerens metode til at omsætte en enkelt sætning til et gennemarbejdet produkt. Den fulde byggevejledning findes i `references/webapp-craft.md`. Begge dele er integreret i Aura 1 sammen med automatisk indlæsning før modelkald. Mangler hovedskillen eller er den ugyldig, stoppes byggeforespørgslen, før noget sendes.


- Brandmetode med dokumenterede kilder og tydelige antagelser.
- 43 beskrevne designretninger som inspiration, herunder fem valgfrie kompositionsopskrifter. Der følger ingen downloadede SkillsUI-skills eller 43 færdige temaer med.
- Designbrief og kvalitetsgennemgang, appmønstre og vejledning til agentarbejdsrum og paneler. Det er instruktioner til brugerprojektet, ikke nye runtimefunktioner.
- Læsbare HTML-/CSS-eksempler og en valgfri offline tokengenerator med målte kontrastpar og inputvalidering.
- Kontrol af reelle brugerhandlinger, små skærme, zoom, tastatur, temaer og bevægelse med ærlig angivelse af, hvad der ikke er afprøvet.

Biblioteket indeholder **18 Markdown-filer**, herunder valgfri komponentinspiration fra Fisher UI og andre moderne komponentkilder. Eksempelkode køres ikke ved indlæsning. Hvis den materialiseres eller køres i et brugerprojekt, gælder de normale fil- og værktøjsgodkendelser. Python er alene et valgfrit projektværktøj til generatoren og bliver ikke en afhængighed for Aura.

Skillen ændrer ikke Auras egen brugerflade, onboarding, planer, godkendelser, modelvalg eller adgang til data og netværk. Den indfører ingen Privacy Gate eller sandbox. Et godkendt design i brugerprojektet må heller ikke udskiftes uden brugerens konkrete ønske og accept. Instruktioner er vejledning, ikke teknisk håndhævelse eller garanti for en models adfærd.

## Kompatibilitet og kilde

Den gennemgåede kilde er [Aura Design 1.1](https://github.com/Parthee-Vijaya/skills_claude/tree/88ef16cf3f8916911f5f26cb5a334dbdf332d1f5/aura-design) af Parthee Vijayamohan. Den er tilpasset original AI Harness ved `dce68ea74a199ca214ab535a16ff22765d8ee8de` (`0.6.0-beta.1`).

En direkte kopi passer ikke til originalens bibliotek: det kræver navnet `harness-…`, kun frontmatterfelterne `name` og `description` samt `SKILL.md` og Markdown-referencer. Startere, brief, notice og generator er derfor tilgængelige som referencer. Originalens format- og stivalidering er uændret.

Kildens `brand_scan.py` og `qa.py` medfølger ikke: de kan henholdsvis hente vilkårlige adresser/redirects og servere hele målmapper eller hente ekstern testkode. Brug projektets allerede tilladte research- og testværktøjer. Generatorreferencen har inputvalidering og dokumenterer præcis de farvepar, den måler; den er ikke en fuld WCAG-afprøvning. En udefineret `--t-hero` i kildens valgfrie layout er erstattet af generatorens `--t-3xl`.

[Proveniensreferencen](../profiles/skills/harness-aura-design/references/provenance.md) fastholder alle 18 kildefilers SHA-256, tilpasninger og licensoplysninger. EUPL-1.2 og den medfølgende MIT-notice bevares. Organisationers logoer og fonte samt SkillsUI-materiale får ingen ny licens gennem denne skill.

## Afprøvning

Se [det oprindelige bidrags før/eftervisninger og begrænsninger](contributions/aura-design-pr.md) og [grundpakkens implementering og prøver](design-baseline.md). Eksport til andre kodeværktøjer bevarer fortsat brugerens eksplicitte skilludvalg; Aura 1s faste grundpakke gælder appens egne byggeforløb.

Under lokal afprøvning er der nu også [en programstyret appkontrol](design-quality-control.md). Dokumentet skelner mellem modelstyret design gennem skills, målbare fejl og visuel kvalitet. Det tidligere forsøg med faste designgrundlag er taget ud af modelinstruktionerne; lokal forsøgs- og testkode bevares som historisk reference. Denne udvidelse er endnu ikke udgivet i en DMG; eksport af skillen giver ikke andre kodeværktøjer Auras Electron-kontrol.
