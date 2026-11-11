# Ændringslog

## 0.8.0-beta.1 · 12. november 2026

Fire tilføjelser efter gennemgangen af referenceappen. Ingen af dem sender noget til en AI af sig selv, og datagennemgang, godkendelser og beskyttede filer er uændrede.

- **@ i skrivefeltet** foreslår projektets filer og tilføjer den valgte som filhenvisning. Det er samme henvisninger som fra Kode-fanen, med samme grænse på ti. E-mailadresser åbner ikke listen.
- **Word, Excel og PDF** åbner i Kode-fanen som udtrukket tekst. Word og Excel læses af en ny læser uden afhængigheder med faste grænser (5 MB fil, 256 KB tekst); PDF bruger den eksisterende lokale læser. Udtrukket tekst kan ses, men ikke bruges som henvisning til AI'en.
- **Skills og udvidelser** i sidepanelet åbner Funktioner direkte.
- **Aktivitet** viser antal målte trin og deres samlede tid i værktøjer.
- **Automatisering:** en planlagt opgave (én gang, hver dag eller hver uge) lægger sin tekst klar i skrivefeltet på tidspunktet. Du sender den selv. Opgaver udløses kun, mens Aura er åben; tid, der er gået mens appen var lukket, giver én levering. Se [docs/automatisering.md](docs/automatisering.md).
- Fokus: at skrive i et tekstfelt tæller ikke som tastaturnavigation, så skrivefeltets ring vises ved Tab, ikke under skrivning.

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
- Flade-, felt-, primærtekst-, sekundærtekst- og accentfarver følger installeret DeepSeek Harness 0.2.1-rc.5. Lyse felter er hvide.
- Oprindelig formularvalidering og oprettelse er afprøvet i den native app. README viser nye faktiske screenshots.

## 0.6.0-beta.1 · 4. november 2026

Udviklingsversion af desktopappen med fuldt UI/UX-redesign efter den installerede DeepSeek Harness-reference.

- Kompakt native førstestart, integreret Aura-logo og valgfri lokal profil uden kontologin.
- Helt skjulbar sidebar, centreret samtalestart og samlede indstillinger i lyst og mørkt tema.
- Bevarede projekt-, onboarding-, AI-, godkendelses- og datakontrolfunktioner.
- Rettet panelpræference ved projekt-/samtaleopdatering, eksplicit Arbejdsspor og profilikonernes centrering.
- README med syv faktiske native screenshots og dokumenteret visuel kontrol.

Dette er en kildekodeopdatering. Historiske udgivelser og deres egne testgrundlag findes under [docs/releases](docs/releases/).
