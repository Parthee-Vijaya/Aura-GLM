# Ændringslog

## 0.8.0-beta.1 · 12. november 2026

Fire tilføjelser efter gennemgangen af referenceappen. Ingen af dem sender noget til en AI af sig selv, og datagennemgang, godkendelser og beskyttede filer er uændrede.

- **@ i skrivefeltet** foreslår projektets filer og tilføjer den valgte som filhenvisning. Det er samme henvisninger som fra Kode-fanen, med samme grænse på ti. E-mailadresser åbner ikke listen.
- **Word, Excel og PDF** åbner i Kode-fanen som udtrukket tekst. Word og Excel læses af en ny læser uden afhængigheder med faste grænser (5 MB fil, 256 KB tekst); PDF bruger den eksisterende lokale læser. Udtrukket tekst kan ses, men ikke bruges som henvisning til AI'en.
- **Skills og udvidelser** i sidepanelet åbner Funktioner direkte.
- **Aktivitet** viser antal målte trin og deres samlede tid i værktøjer.
- **Automatisering:** en planlagt opgave (én gang, hver dag eller hver uge) lægger sin tekst klar i skrivefeltet på tidspunktet. Du sender den selv. Opgaver udløses kun, mens Aura er åben; tid, der er gået mens appen var lukket, giver én levering. Se [docs/automatisering.md](docs/automatisering.md).
- Fokus: at skrive i et tekstfelt tæller ikke som tastaturnavigation, så skrivefeltets ring vises ved Tab, ikke under skrivning.
- **Rettet:** en version, du selv gemmer, får nu det forrige billede af samme visning som før-billede, også når de to billeder er gemt i samme millisekund. Før blev de sammenlignet på tidsstempel, og på en hurtig maskine manglede før-billedet.
- **Lokal udgivelse uden CI:** `desktop/scripts/release-local.cjs` bygger, afprøver og samler en Mac-beta på udgiverens egen Mac og offentliggør den først, når GitHubs filer matcher de afprøvede. Se [docs/udgivelse.md](docs/udgivelse.md).

Ikke med i denne runde: @-henvisning til tidligere samtaler, formateret visning af Markdown og regneark, MCP-forbindelser under Skills og udvidelser, og opgaver der sender uden dig. Kontrolleret i den kørende app i en Linux-kørsel; PDF-visning er kun kontrolleret i test.

## 0.7.0-beta.1 · 12. november 2026

Materialesystem for hele desktopappen. Ingen funktions-, tilladelses- eller dataændringer.

- Radius følger seks trin efter rolle (4/8/12/16/20/28 px). 88 afvigende værdier er flyttet, og en test afviser nye.
- Neutrale kanter er hårstreger på 0,5 px. Skrivefelt, menuer og dialoger har kanten i en blød elevation i stedet for kant plus skygge.
- Skrivefeltet har 28 px radius og ingen farvet ramme ved klik. Accentringen vises ved tastaturbrug.
- Fokusringe følger inputmåden: synlige ved tastatur, skjulte efter museklik på knapper, faner og rækker. Tekstfelter beholder deres markering.
- Accenten er Auras grønne fra logoet i stedet for referenceappens blå. Kontrasten beregnes i testen.
- Sidebar: ordmærke på 18 px med små bogstaver, Ny samtale som navigationsrække og rækker på 36 px.
- Baggrunden bag dialoger dæmper uden sløring.

Kontrolleret i den kørende app i en Linux-kørsel i lyst og mørkt tema. macOS' native vinduesramme er ikke kontrolleret i denne runde. Planen for de næste faser står i [desktop/docs/materialesystem-plan.md](desktop/docs/materialesystem-plan.md).
## 0.6.0-beta.7 · 5. november 2026

- Opdateringskontrollen accepterer GitHub-udbyderens præcise relative ZIP-navn og validerer den fulde forventede releaseadresse uden at ændre udbyderens downloadoplysninger. Forkerte filer, stier, arkitekturer og kontrolsummer afvises fortsat.
- Kommandoovervågningen venter på hele hjælperens JSON-kvittering før kontrol af nul levende underprocesser.
- Beta 6-tagget og dets installationsfiler bevares. Installer beta 7 manuelt fra DMG ved opgradering fra beta 5 eller den første beta 6.

## 0.6.0-beta.6 · 5. november 2026

- **Forbindelsestjek i trin.** En gemt forbindelse kan tjekkes for adresse, nøgle og modelliste hver for sig, uden modelkald.
- **Modelevner.** Modelvælgeren viser værktøjer, billeder, streaming og ræsonnement, når udbyderen eller kataloget oplyser det. Ukendt vises som ukendt.
- **Kontekstvisning virker.** Når plugin'et er slået til, viser statuslinjen en lille måler for brugt kontekst.
- **Acceptprøve af den færdige pakke** (`npm run test:package-acceptance`) med isoleret profil, lokal mockserver og opgradering fra beta 5.
- **Cloudflare Workers AI** udfyldes ud fra konto-id, og LM Studio, vLLM og Ollama har porthjælp.
- **Ventetid forklares.** Under et svar står det, om Aura starter motoren, venter på modellen, venter på godkendelse eller prøver igen.
- **Lokale servere findes automatisk.** LM Studio og vLLM på standardporte foreslås under AI-forbindelser. Logo-fliser til de nye udbydere, og vinduet maksimeres ikke længere efter velkomsten.
- **Vilkår med dato pr. emne** (træning, region, opbevaring). Kontroller ældre end 180 dage markeres.
- **Websøgning forbliver slået fra** med en præcis begrundelse, og søgeværktøjet fjernes nu helt fra motorens værktøjsliste.
- **Terminalgrænser og lokal MCP forbliver slået fra** med præcise begrundelser. Et samlet output- og outputfil-loft mangler fortsat. Felterne til tidsgrænse og outputloft vises først, når grænserne kan håndhæves.

- **Stop afslutter kommandoens underprocesser på macOS.** Hver kommando får en særskilt arvet procesafgrænsning og en værtsovervågning. Stop, timeout, normal afslutning og brat runner-exit afslutter også løsrevne og forældreløse skrivere, uden at stoppe samtidige kommandoer. Almindelige eksplicit godkendte kommandoer får samme levetidskontrol. Automatisk kommandokørsel er utilgængelig på Linux og Windows, indtil tilsvarende afslutning kan kvalificeres.
- **Aktuelle native billeder i README.** Velkomst, valgfri lokal profil, indstillinger, Nyt projekt ved 980×720, arbejdsflade og skjult sidebar er optaget i den færdige beta 6 med syntetiske data.

## 0.6.0-beta.5 · 4. november 2026

- **Flere AI-udbydere under Indstillinger › AI-forbindelser.** Tilføj forbindelse har stadig kortene med logoer for Corti, Alexandra, Mistral, OpenAI, Claude, Azure, OpenRouter, Zen, Ollama og Egen server. Under kortene ligger en dropdown med de nye udbydere: Google Gemini, Groq, Together, Fireworks, Cerebras, xAI, Perplexity, Hugging Face, NVIDIA, Moonshot (Kimi), Cloudflare Workers AI, LM Studio og vLLM. Adressen er udfyldt på forhånd, og der er et link til udbyderens nøgleside. Ukontrollerede vilkår vises som "Ikke kontrolleret af Aura".
- **Egen server** tager nu også et udbyder-ID og en protokol (OpenAI Chat Completions, OpenAI Responses eller Anthropic Messages). Nøglen indtastes fortsat kun i det sikre nøglevindue.
- **Plugins under Indstillinger.** Hent websider kan sættes til *Spørg først* eller *Slået fra*, og kontekstvisning kan slås til. Subagenter, websøgning, terminalgrænser, sprogservere og MCP-servere vises under *Venter på sikker tilkobling* med en begrundelse. De kan ikke slås til, før de er dækket af godkendelser, sandbox og Privacy Gate. MCP-servere kan gemmes, men startes ikke.
- **Samtalen ligner referencen mere.** Statuslinjen under skrivefeltet har ikoner for kontekst, hastighed, tokens og pris. Modelchippen har en vælgerpil, og arbejdsmåden står kun i topbjælken under en samtale. Pladsholderen nævner `/` for kommandoer.

## 0.6.0-beta.4 · 4. november 2026

- Versionsmærket i appen viser nu hele versionen på samme form som releasen, fx **0.6.0 beta 4** (tidligere "beta 0.6.0").

## 0.6.0-beta.3 · 4. november 2026

Rettelser efter en selvstændig UX/UI-gennemgang af beta.2.

- Idékladden i Nyt projekt bevares, når man går tilbage til arbejdsfladen og åbner formularen igen.
- Opsætningstrinnenes handlinger (fx Gem og fortsæt) bliver synlige i bunden, mens lange trin ruller.
- Opsætningens trinliste vises kun i det guidede førstegangsforløb, ikke ved Nyt projekt fra et projekt eller efter Fortsæt uden profil.
- Forfin idéen uden AI-forbindelse åbner forbindelsesopsætningen og bevarer kladden.
- Fokus går til sidepanelknappen, når sidepanelet åbnes igen, og til skrivefeltet efter Tilbage til arbejdsfladen.
- Indstillingen for arbejdsfladen ved opstart har fået en retvisende tekst.
- Aura-logoet viser sin midterprik i lyst tema. Tilstandstegn, infoknapper, fokusramme, Send uden valgt AI og opsætningens links er justeret.

## 0.6.0-beta.2 · 4. november 2026

- Nyt projekt viser standardfelter, placering og Opret uden scroll ved 980×720 og normal tekststørrelse.
- Opret-handlingen har en fast bundrække. Udvidede tilvalg og længere indhold ruller separat, og tilbagehandlingen ligger i headeren.
- Flade-, felt-, primærtekst-, sekundærtekst- og accentfarver er samlet i en neutral palette med blå accent. Lyse felter er hvide.
- Oprindelig formularvalidering og oprettelse er afprøvet i den native app. README viser nye faktiske screenshots.

## 0.6.0-beta.1 · 4. november 2026

Udviklingsversion af desktopappen med fuldt UI/UX-redesign.

- Kompakt native førstestart, integreret Aura-logo og valgfri lokal profil uden kontologin.
- Helt skjulbar sidebar, centreret samtalestart og samlede indstillinger i lyst og mørkt tema.
- Bevarede projekt-, onboarding-, AI-, godkendelses- og datakontrolfunktioner.
- Rettet panelpræference ved projekt-/samtaleopdatering, eksplicit Arbejdsspor og profilikonernes centrering.
- README med syv faktiske native screenshots og dokumenteret visuel kontrol.

Dette er en kildekodeopdatering. Historiske udgivelser og deres egne testgrundlag findes under [docs/releases](docs/releases/).
