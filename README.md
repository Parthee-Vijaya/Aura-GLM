# Aura 1 beta 0.5.0

Dette er **Parthee-Vijayas fork af Aura Harness**. Udgaven samler OpenCode 2, Privacy Gate, designhjælp og de godkendte forbedringer af samtale og arbejdsområde. Onboarding B, øvrige funktioner, planer og godkendelser bevares. Bidrag til AI Alliancens original håndteres i særskilte PR’er.

**Testbeta af 26. oktober 2026** til macOS på Apple Silicon. Teknisk version: `0.5.0-beta.4`. 2.051 kildeprøver og 20 native coreprøver af den faktiske pakke består. Efter nøgleringsgodkendelsen består også alle valgte native pakke-/brugerfladeforløb på denne Mac. Se [omfang, før/efter og begrænsninger](docs/feedback/2026-10-26-package-followup.md). Appen er ad hoc-signeret og ikke Apple-notariseret. GitHub CI er ikke kørt for denne udgivelse.

[Hent Aura 1 beta 0.5.0 til Apple Silicon](https://github.com/Parthee-Vijaya/ai-harness/releases/download/v0.5.0-beta.4/Aura-1-0.5.0-beta.4-mac-arm64.dmg) · [Release og kontrolsummer](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v0.5.0-beta.4) · [0.5.0-noter og teststatus](docs/releases/aura-1-beta-0.5.0.md) · [Originalprojektet](https://github.com/ai-alliancen-org/ai-harness)

Prøverne bruger rigtig OpenCode og macOS-isolation med kontrollerede modelservere. Der er ikke kørt en ny betalt AI-prøve af denne DMG. En tidligere sporadisk motoropstartsfejl og tre høje afhængighedsmarkeringer er fortsat dokumenteret som åbne forhold. Brug et separat testprojekt med opdigtede data; se udgivelsesnoterne.

**Tidligere modelprøver:** [Fem kommunale landing pages med GPT-6.1 Sol](evals/openenv/MUNICIPAL-LANDINGS-2026-10-25.md) gennemførte Auras Plan/Byg-forløb med 331 browserkontroller, 60 visuelle kontrolpunkter og screenshots fra både første og sidste udkast. De 79 modelkald i denne runde havde ingen timeout; tidligere fejlede forsøg, resterende advarsler og 26 fejlede modellæsninger er dokumenteret. Dette er historisk kilde-/modelevidens, ikke en ny prøve af 0.5.0-pakken. Designvejledningen i appen opfordrer til at kombinere Aura-design med relevante designskills, som det aktuelle miljø faktisk tilbyder; den installerer ingen eksterne skills.

**Privacy Gate i denne pakke:** Kontrol af hele modelkaldet, separate lokale/cloudbaserede sessioner, native procesisolation og kontrolleret genoptagelse efter Stop. Se [opsætning, sikkerhedsgrænser og afprøvning](docs/privacy-gate.md). Videre OpenEnv-/OpenSandbox-arbejde er [gemt til senere](docs/deferred-openenv-sandbox.md).

**Godkendt feedback og robusthed i denne pakke:** Kompakt skrivefelt, status tæt ved samtalen, justerbar sidebar, direkte svar på AI-spørgsmål, forklaring af arbejdsformer og et enklere resultatkort. OpenCode er opgraderet til 2.1.4; fælles filbeskyttelse og Stop/genoptagelse er styrket. [Samlet ændringsoverblik, afprøvning og begrænsninger](docs/feedback/2026-10-26-merge-overview.md). Stop under motoropstart og opdatering af en allerede godkendt statisk forhåndsvisning efter gendannelse har desuden afgrænsede rettelser og regressionstests.

## Design- og arbejdsfunktioner, der videreføres

- **Design gennem skills og den valgte model.** Aura indlæser designmetoden fra første idé- og byggeforsøg. Modellen skaber designet ud fra opgaven, brugerens valg og dokumenterede designguides, logoer og farver. Aura påtvinger ikke alle apps den samme palette eller layoutopskrift. Se [designskillen](docs/aura-design-skill.md).
- **Mere robust idéhjælp.** Et afsluttet svar med ugyldigt format kan få én formatrettelse hos samme model under samme samlede tidsfrist. Stop, den gennemgåede afsendelse og modelvalget bevares. Forslaget er stadig ikke en godkendt byggeplan.
- **Lokal afprøvning af genererede webapps.** En afgrænset kopi af en statisk app i `public/` kontrolleres ved desktop- og mobilstørrelse for blandt andet runtimefejl, overløb, billeder og målelig tekstkontrast. Konkrete fund kan udløse højst to rettelsesforsøg med samme model og de eksisterende godkendelser. Se [omfang og begrænsninger](docs/design-quality-control.md).
- **Tydelig aktivitet under arbejdet.** Den godkendte aktivitetsvisning samler arbejdet i forståelige trin og gør tekniske detaljer valgfrie. Lyskanten om skrivefeltet viser, når AI’en arbejder. Planer, filgennemgang og værktøjsgodkendelser er fortsat særskilte.
- **Præcise værktøjsgodkendelser.** En ventende filpatch kan hente den manglende patchtekst fra netop den tilsvarende kørende værktøjshandling. Bindingen til samtale, besked og handling kontrolleres før den normale godkendelsesvurdering.

Design-skills er vejledning, ikke en garanti for et flot eller fejlfrit første udkast. De [dokumenterede modelprøver](evals/openenv/MODELSAMMENLIGNING-2026-10-25.md) viser reelle forskelle mellem Mistral og Corti. GPT-referenceappen brugte en anden transport og kan ikke tælle som en tredje identisk Aura-prøve. De opfølgende [GPT-prøver](evals/openenv/GPT-TRANSPORT-2026-10-25.md), [brandprøver med officielle Nyborg-logoer](evals/openenv/BRAND-MODELS-2026-10-25.md) og native afprøvning er dokumenteret særskilt. GPT-appen bestod 26 browserkontroller, men agentforløbet ramte tidsgrænsen; afventende prøver er ikke beståede prøver.

## Det bevarer vi

- Onboarding B med store udbyderkort, brandfarver og visualisering, projektnavn over idéen og den eksisterende projektoprettelse.
- Det godkendte arbejdsområde, én plusmenu til tekstfiler, billeder, PDF og referencemapper, modelvalg, forbrug og kontekst under skrivefeltet.
- Planvalg, værktøjsgodkendelser, datagennemgang, samtalehistorik samt afgrænset genforsøg og genoptagelse uden blind gentagelse af udførte handlinger.
- Den allerede implementerede **YOLO**-indstilling under **Byg**: efter advarsel gælder den kun den aktuelle samtale, indtil den slås fra eller appen lukkes. Planer, datadeling, beskyttede filer og tekniske adgangsgrænser består. Se [YOLO og samtaletilladelser](docs/yolo.md).
- Appnavnet **Aura 1**, synlig version fra den kørende app, eksisterende data- og nøgleringsidentiteter samt forkens opdateringskanal.

Pakken stammer fra produktcommit `320a2ae433e1b3e64130d448e43c7a2491b62605`; kildebevis, testtal, pakkeintegritet og afprøvningens grænser er dokumenteret i [release-noterne](docs/releases/aura-1-beta-0.5.0.md). Der påstås ikke Apple-notarisering, grøn GitHub CI, Intel-/Windows-afprøvning, kvalifikation på en ren maskine eller modeluafhængig designkvalitet. Denne fork er særskilt fra det Code-OSS-baserede Aura-1-projekt.

**Nyere kildekode:** Serverdialogens godkendte tekst er rettet, så den beskriver, at previewservere fortsætter ved projektskift. Funktionen er uændret. Denne tekstændring er endnu ikke i den udgivne 0.5.0-DMG.

[Versions- og oprydningsregel](docs/releases/POLICY.md): kun tre seneste færdige lokale DMG-versioner beholdes; lokal kildekode, worktrees, beskrivelser og brugerdata bevares. Brug en separat profil ved afprøvning.

![Tidligere udgivet Aura 1 beta 0.3.1 med synligt versionsnummer](docs/images/aura-1-beta-0.3.1/workspace.png)

*Billedet viser den udgivne 0.3.1 og dokumenterer ikke 0.5.0. Historiske skærmbilleder og originalens vejledninger følger nedenfor.*

---

<p align="center">
  <img src="docs/images/aura-icon.png" width="88" alt="Aura">
</p>

# Aura Harness

Aura Harness hjælper dig med at bygge applikationer med AI og holde styr på opgaven, koden og afprøvningen. Brug desktopappen **Aura**, arbejd i terminalen, eller læg de fælles instruktioner i det kodeværktøj, du allerede arbejder med.

Projektet tager udgangspunkt i kommunernes behov og henvender sig til udviklere, IT-medarbejdere og teknisk interesserede kolleger, der vil bygge, forstå og gennemgå deres egne løsninger.

[Kom i gang](#kom-i-gang) · [Brug dit eget kodeværktøj](#brug-dit-eget-kodeværktøj) · [Betastatus](https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/beta.md) · [Bidrag](https://github.com/ai-alliancen-org/ai-harness/blob/main/CONTRIBUTING.md)

![Auras arbejdsområde med samtale, projektoversigt og et lokalt eksempel med tre mødelokaler i forhåndsvisningen.](docs/images/aura-arbejdsomraade.png)

*Arbejdsområdet i Aura. Eksempelprojektet er åbnet lokalt og bruger opdigtede mødelokaler. Skærmbilledet viser forhåndsvisningen, ikke resultatet af en live-modelkørsel.*

> **Udviklingsbeta.** Appen er under afprøvning. Brug opdigtede data og et separat testprojekt. Læs [betastatus og kendte begrænsninger](https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/beta.md), før du installerer.

## Vælg, hvordan du vil arbejde

| | Aura-appen | Dit eget kodeværktøj |
|---|---|---|
| **Du får** | Samtale, plan, kodeændringer, forhåndsvisning og versioner i samme arbejdsområde. | Fælles grundregler og skills til arbejdet fra idé til drift. |
| **Du vælger selv** | AI-forbindelse, model, projekt og funktioner. | Kodeværktøj, model og hvilke skills der installeres. |
| **Kom i gang** | Start appen, og vælg **Byg i Aura-appen**. | Vælg **Brug Aura Harness i mit kodeværktøj**, eller installér fra kommandolinjen. |

![Auras første skærm med valget mellem at bygge i appen og bruge Aura Harness i sit eget kodeværktøj.](docs/images/aura-velkomst.png)

*Begge indgange kan åbnes igen fra appens sidepanel.*

## Byg i Aura

Beskriv, hvad du vil lave, og arbejd videre med AI’en i et lokalt projekt. Samtalen står ved siden af arbejdsfladen, hvor du kan se resultatet og gennemgå det arbejde, der ligger bag.

- **Afklar og planlæg.** Beskriv brugerne, opgaven og de vigtigste krav. Gennemgå AI’ens forslag, før du beder den bygge.
- **Følg ændringerne.** Gennemgå filændringer og de handlinger, der kræver din godkendelse. Ved lange forslag kan **Vis flere linjer** indlæse resten før godkendelse; se [gennemgang af alle diff-linjer](docs/contributions/f31.md). Fanerne Plan, Ændringer, Kode og Aktivitet samler detaljerne.
- **Medtag udvalgte tekstfiler.** Vælg **Vedhæft filer** i samtalen, eller **Referencemappe · kun læsning** for at vælge enkelte filer fra en mappe. Gennemgå indholdet, og godkend den konkrete afsendelse. Se [filvalg og grænser](docs/contributions/f13.md) samt [referencemapper og før/efterprøven](docs/contributions/f14.md).
- **Læs tidligere beskeder.** Åbn en gemt samtale, og vælg **Indlæs tidligere beskeder** over beskederne for at hente næste gemte del. Det starter ingen AI-opgave. Se [visningsindlæsning, grænser og før/efterprøven](docs/contributions/f12.md).
- **Medtag et billede.** Samme filvalg kan gennemgå PNG/JPEG før deling med en model og eventuel rute med angivet billedstøtte. Se [billedgennemgang og størrelsesgrænser](docs/contributions/f16.md).
- **Medtag tekst fra PDF.** Samme filvalg udtrækker tekst lokalt og viser den side for side før deling. Se [PDF-gennemgang, grænser og afprøvning](docs/contributions/f15.md); hele den gennemgåede udtrukne tekst medsendes.
- **Se og afprøv resultatet.** Brug forhåndsvisningen til at prøve løsningen i forskellige skærmstørrelser. Understøttede webprojekter kan startes gennem appen.
- **Gem og fortryd.** Brug lokale Git-versioner til at følge arbejdet og gennemgå en tidligere version, før du gendanner den.

Projektfilerne ligger på din computer. Du kan åbne dem i en anden editor og fortsætte arbejdet dér. AI-modellen vælges separat og kan køre hos en udbyder eller på en modelserver, du har adgang til.

I **Før du sender → Se alle oplysninger** kan du gennemgå appens præcise tekstfragmenter under **Sporbar kontekst**. Se [kontekstbinding, afgrænsning og afprøvning](docs/contributions/f08.md).

### Vælg den hjælp, du har brug for

Under **Indstillinger → Funktioner** vælger du blandt andet planlægning, versioner, kodekvalitet og hjælp til sikkerhed og data. Design og tilgængelighed er altid slået til. Valgene kan gælde alle projekter eller kun det aktuelle. Integrationer som Adresser og CVR vælges til særskilt.

![Dialogen Funktioner med valg af planlægning, versioner, design, sikkerhed, kodekvalitet og integrationer.](docs/images/aura-funktioner.png)

*Funktionerne styrer, hvilke arbejdsgange og instruktioner Aura stiller til rådighed. De er ikke en sikkerheds- eller myndighedsgodkendelse.*

Designfunktionen indeholder også [Aura-design til dine apps](docs/aura-design-skill.md): en genbrugelig metode til brandkilder, designretning, farver, temaer og appmønstre i dit projekt. Den er altid med i grundpakken og indlæses fra første idé- eller byggeforsøg, også med Mistral og Corti. Første udkast skal allerede have gennemarbejdet typografi, farver, layout og brugerforløb. Det giver ingen ekstra værktøjstilladelser og ændrer ikke et godkendt design på egen hånd.

## Brug Aura i terminalen

Aura CLI giver adgang til samme kodeagent, regler og modelforbindelser fra terminalen. Du kan planlægge, gennemgå filændringer, se preview i browseren og genoptage samtalen. Git-versioner, projektkommandoer og testudgivelser kræver din godkendelse.

CLI'en kræver Node 22.12 eller nyere, npm og Git. Hent pakken og vejledningen til Windows, Linux eller macOS på [terminalsiden](https://ai-alliancen-org.github.io/ai-harness/terminal.html). Download kræver ingen kloning af repositoryet. Platformsafprøvningen fremgår af [teststatus](docs/teststatus.md).

[Windows: PowerShell og CMD](cli/WINDOWS.md) · [Linux](cli/LINUX.md) · [macOS](cli/MACOS.md) · [Kommandoer og nøglelager](cli/README.md). [CLI-beta 0.2.0-beta.6](https://github.com/ai-alliancen-org/ai-harness/releases/tag/cli-v0.2.0-beta.6) er offentliggjort.

## Brug dit eget kodeværktøj

Aura Harness kan også bruges uden desktopappen. Grundreglerne og de fælles skills er læsbare tekstfiler, som kodeagenten kan bruge til afgrænsning, arkitektur, design, kodning, afprøvning, data og drift.

Der er pakker til blandt andet Claude Code, Codex, OpenCode, Cursor, GitHub Copilot, Gemini CLI, Mistral Vibe og Zed. Lovable får en tekst til platformens egne felter. Se [kataloget og de enkelte skills](https://github.com/ai-alliancen-org/ai-harness/blob/main/profiles/SKILLS.md).

![Auras værktøjsvalg med Claude Code, GitHub Copilot, Codex og Cursor samt adgang til de øvrige værktøjer.](docs/images/aura-kodevaerktoej.png)

*Appen viser, hvilke filer og afsnit der ændres, før du installerer. Egne regler bevares, og lokalt ændrede filer springes over ved opdatering.*

Fra repositoryets rod kan du også installere i et andet projekt:

```bash
node scripts/harness.cjs install --tools codex --project ../mit-projekt
```

Skillsene giver instruktioner til agenten. De indeholder ikke scripts eller værktøjstilladelser. Indlæsningen er afprøvet i Claude Code og OpenCode med en kontrolleret modelserver; de øvrige værktøjer følger deres dokumentation. Det viser ikke, hvor godt en bestemt model følger instruktionerne.

## Kom i gang

### Prøv appen

Når du har en Aura-installation, kan du vælge **Prøv et eksempel** ved opstart. Det indbyggede eksempel bruger faste svar og kræver hverken en AI-konto eller en API-nøgle.

![Det indbyggede eksempel med en besked om bibliotekets aktiviteter og den tilhørende forhåndsvisning.](docs/images/aura-eksempel.png)

*Et lokalt eksempel, der viser samspillet mellem besked og forhåndsvisning. Der foretages ingen modelkald.*

Originalprojektets [downloads til Mac og Windows](https://ai-alliancen-org.github.io/ai-harness/desktop.html) har deres egne versions- og signeringsoplysninger. Forkens aktuelle testbeta er [Aura 1 beta 0.5.0](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v0.5.0-beta.4), som ikke er notariseret. Se [test- og udgivelsesstatus](docs/releases/aura-1-beta-0.5.0.md), før du vælger en pakke.

### Start fra kildekoden

Kræver adgang til repositoryet, Git, Node.js 22.12 eller nyere og npm.

```bash
git clone https://github.com/ai-alliancen-org/ai-harness.git
cd ai-harness/desktop
npm ci
npm run runtime:prepare
npm start
```

`runtime:prepare` henter og kontrollerer de versioner af de medfølgende værktøjer, som projektet har låst. Vælg derefter din AI-forbindelse i appen, eller fortsæt uden AI for at se dig omkring. Adgang og eventuel betaling til model- og hostingtjenester håndteres særskilt.

AI-forbindelsens nøgle indtastes gennem **Indtast nøgle sikkert** i et separat vindue. Vælg **Brug denne nøgle**, og gem derefter forbindelsen i den oprindelige formular. Se [nøgleindtastningens afgrænsning og før/efterprøven](docs/contributions/f05.md).

Ved manuel GitHub-adgang åbner du **Avanceret · forbind med GitHub-token** i delingsdialogen og vælger **Indtast token sikkert**. Tokenet indtastes i samme isolerede nøglevindue; kontoen kontrolleres, før adgangen gemmes krypteret. Se [GitHub-token, rettigheder og før/efterprøven](docs/contributions/f06.md).

Ved lokal pakning bindes produktfilerne til en Git-commit, og runtime-filerne kontrolleres mod de låste arkiver. Se [pakkens kildebevis, kontrolkommando og begrænsninger](docs/contributions/t04.md).

Se [installation, opsætning og lokale testkommandoer](https://github.com/ai-alliancen-org/ai-harness/blob/main/desktop/README.md).

## Teknologi, data og betastatus

Aura er en Electron-app til Mac og Windows med OpenCode som lokal kodeagent. Vi bruger en fast version gennem en adapter; AI-modellen er et separat valg. Grundregler og skills kommer fra det samme bibliotek, uanset om du bruger Aura eller dit eget kodeværktøj.

Motoren i den aktuelle arbejdsgren er opgraderet til den stabile OpenCode **2.1.4** fra V2-kanalen. Versionen er låst; appstart opdaterer den ikke automatisk. Opgraderingen er endnu ikke udgivet i en DMG. Se [V2-opgraderingen, samtalemigrationen og testgrundlaget](docs/opencode-2-upgrade.md).

På macOS og Linux følger oprydningen af OpenCodes procesgruppe også brat lukning af Aura eller terminalklienten. Se [procesoprydning, afgrænsning og den reproducerbare prøve](docs/contributions/r05.md). Windows beholder sin hidtidige nedlukning.

Datagennemgangen skelner mellem modelkatalogets oplysninger og observationer fra gennemførte værktøjsforløb. Se [modelstøtte, konkrete observationer og deres begrænsninger](docs/contributions/f09.md).

Lokale projektfiler betyder ikke, at al databehandling er lokal. En ekstern model eller hostingtjeneste kan modtage kode og data. Den konkrete brug skal derfor vurderes ud fra de valgte tjenester, adgangsforhold og organisationens krav.

Appen har endnu ikke fælles organisationslogin, en isoleret sandbox for hele agenten eller et revisionsspor med verificerede godkendere. Et komplet forløb fra download til drift er heller ikke afprøvet på en almindelig testers egen computer. Instruktionerne erstatter ikke en vurdering af sikkerhed, persondata eller drift.

[Læs det tekniske grundlag](https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/teknisk-grundlag.md) og [retningen for det fælles Aura Harness](https://github.com/ai-alliancen-org/ai-harness/blob/main/docs/harness-grundlag.md).

## Find rundt og bidrag

| Mappe | Indhold |
|---|---|
| `desktop/` | Aura-appen, agentadapteren og lokale prøver. |
| `profiles/` | Grundregler, skills og kataloget over kodeværktøjer. |
| `site/` | Webguiden og pakker til de understøttede værktøjer. |
| `scripts/` | Installation og bygning af instruktionspakker. |
| `docs/` | Betastatus, afprøvning, teknisk grundlag og vejledninger. |

Bidrag med fejlrapporter, erfaringer fra afprøvning, forbedrede instruktioner eller kode. Beskriv, hvad du forsøgte, hvad du forventede, og hvad der skete. Se [bidragsvejledningen](https://github.com/ai-alliancen-org/ai-harness/blob/main/CONTRIBUTING.md), eller [opret en issue](https://github.com/ai-alliancen-org/ai-harness/issues). Sikkerhedsproblemer skal [rapporteres privat](https://github.com/ai-alliancen-org/ai-harness/blob/main/SECURITY.md).

Koden er licenseret under [EUPL-1.2](https://github.com/ai-alliancen-org/ai-harness/blob/main/LICENSE).

*Skærmbillederne er taget i Aura 0.2.0-beta.5 på macOS den 11. oktober 2026 med isolerede appdata og opdigtede eksempler.*
