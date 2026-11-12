# Aura Prime 0.8.0 beta 1

Teknisk version: `0.8.0-beta.1`, tag `v0.8.0-beta.1`. Første udgivelse efter 0.6.0 beta 7. Den indeholder alt fra beta 7 samt arbejdet fra kildeversionerne `0.7.0-beta.1` og `0.8.0-beta.1`, som ikke har været udgivet hver for sig.

## Nyt udseende

Hele appen følger ét materialesystem. Funktioner, tilladelser og data er uændrede af det.

- Radius følger seks trin efter rolle (4, 8, 12, 16, 20 og 28 px), og neutrale kanter er hårstreger på 0,5 px.
- Skrivefelt, menuer og dialoger har kanten i en blød elevation i stedet for kant plus skygge. Baggrunden bag dialoger dæmper uden sløring.
- Skrivefeltet har 28 px radius og ingen farvet ramme ved klik. Fokusringe vises ved tastaturbrug og skjules efter museklik på knapper, faner og rækker. Tekstfelter beholder deres markering.
- Accenten er Auras grønne fra logoet. Kontrasten beregnes i en test.
- Sidepanelet har ordmærket med små bogstaver, Ny samtale som navigationsrække og rækker på 36 px.

## Nye funktioner

Ingen af dem sender noget til en AI af sig selv.

- **@ i skrivefeltet** foreslår projektets filer og tilføjer den valgte som filhenvisning, med samme grænse på ti som fra Kode-fanen.
- **Word, Excel og PDF** åbner i Kode-fanen som udtrukket tekst. Grænserne er 5 MB fil og 256 KB tekst. Udtrukket tekst kan ses, men ikke bruges som henvisning til AI'en.
- **Skills og udvidelser** i sidepanelet åbner Funktioner direkte.
- **Aktivitet** viser antal målte trin og deres samlede tid i værktøjer.
- **Automatisering:** en planlagt opgave (én gang, hver dag eller hver uge) lægger sin tekst klar i skrivefeltet på tidspunktet. Du sender den selv. Opgaver udløses kun, mens Aura er åben. Se [vejledningen](../automatisering.md).

## Uændret fra beta 7

Datagennemgang, godkendelser, planvalg, beskyttede filer og Privacy Gate er uændrede. Terminalgrænser, websøgning og MCP forbliver utilgængelige. Udbyderkataloget, plugin-indstillingerne, forbindelsestjekket i trin og modelevnerne fra beta 4 til beta 7 er med; de to udviklingslinjer blev samlet på `main` den 12. november 2026.

## Opgradering

Opdateringsfeedet har samme form som i beta 7: én post med opdaterings-ZIP'en under dens relative navn. Formen er afprøvet mod den opdateringskontrol, beta 7 indeholder. Selve download og installation fra feedet er ikke afprøvet mellem to udgivelser, heller ikke for beta 7; DMG'en kan altid installeres manuelt. Beta 5 og den første beta 6 skal fortsat opgraderes manuelt fra DMG.

Beta 7 og tidligere tags og installationsfiler er bevaret.

## Kvalifikation

Udgivelsen er bygget, afprøvet og uploadet fra udgiverens egen Mac med `desktop/scripts/release-local.cjs`, uden CI. Tallene fra byggemaskinen, kildecommit og kontrolsummer står under Bygning og kontrol i udgivelsen på GitHub. Scriptet offentliggør først, når GitHubs filer matcher de afprøvede filer byte for byte.

Det nye udseende og de nye funktioner er udviklet og set i den kørende app i en Linux-kørsel i lyst og mørkt tema. PDF-visning er kun kontrolleret i test. macOS' native vinduesramme med det nye udseende er ikke gennemgået systematisk med skærmbilleder, som beta 7 blev.

Rigtige udbydernøgler, Windows, Intel-Mac, Linux-kommandokørsel, Apple-notarisering og cloud CI er ikke kvalificeret. Appen er ad hoc-signeret og ikke notariseret, så macOS viser en advarsel ved første åbning. Workflowet Byg testpakker starter stadig, når tagget oprettes. Det har fejlet ved hver udgivelse fra beta 3 til beta 7, offentliggør intet og indgår ikke i kvalifikationen.

Ikke med i denne udgivelse: @-henvisning til tidligere samtaler, formateret visning af Markdown og regneark, MCP-forbindelser under Skills og udvidelser, og opgaver der sender uden dig.
