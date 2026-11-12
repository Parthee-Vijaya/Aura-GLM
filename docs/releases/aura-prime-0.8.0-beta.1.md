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

Udgivelsen er bygget, afprøvet og uploadet fra udgiverens egen Mac med `desktop/scripts/release-local.cjs`, uden CI. Tallene fra byggemaskinen, kildecommit og kontrolsummer står under Bygning og kontrol i udgivelsen på GitHub. Scriptet offentliggør først, når GitHubs filer matcher de afprøvede filer byte for byte. Den pakkede app er afprøvet med accepttesten. Den ældre `test:package` indgår ikke: den er forældet og fejlede på samme måde for beta 7.

Det nye udseende og de nye funktioner er udviklet og set i den kørende app i en Linux-kørsel i lyst og mørkt tema. PDF-visning er kun kontrolleret i test. macOS' native vinduesramme med det nye udseende er ikke gennemgået systematisk med skærmbilleder, som beta 7 blev.

Rigtige udbydernøgler, Windows, Intel-Mac, Linux-kommandokørsel, Apple-notarisering og cloud CI er ikke kvalificeret. Appen er ad hoc-signeret og ikke notariseret, så macOS viser en advarsel ved første åbning. Workflowet Byg testpakker starter stadig, når tagget oprettes. Det har fejlet ved hver udgivelse fra beta 3 til beta 7, offentliggør intet og indgår ikke i kvalifikationen.

Ikke med i denne udgivelse: @-henvisning til tidligere samtaler, formateret visning af Markdown og regneark, MCP-forbindelser under Skills og udvidelser, og opgaver der sender uden dig.

## Udgivet 12. november 2026

Bygget fra `a714513affc19fbe16bfe83bb8b7695affdcd1e8` på udgiverens Mac med Node 22.23.3 og offentliggjort kl. 23.00 dansk tid. Tagget `v0.8.0-beta.1` peger på samme commit på `main`.

- Samlet lokal kontrol på byggemaskinen: 2815 bestået, 35 sprunget over, 0 fejl.
- Accepttesten af den pakkede app: 22 af 22 trin, inklusive opgradering fra 0.6.0-beta.7 i samme profil.
- DMG og ZIP indeholder samme app som den afprøvede (8316 poster), ad hoc-signeret.

Efter udgivelsen er de fire filer hentet fra GitHub i et særskilt Linux-miljø og kontrolleret: alle matcher `SHA256SUMS.txt`, feedets SHA-512 og størrelse matcher ZIP-filen, feedet har én post og accepteres af opdateringskontrollen i beta 6 og beta 7, og feedets offentlige adresse svarer uden login. Resultatet står i [verification.json](aura-prime-0.8.0-beta.1-evidence/verification.json). Byggemaskinens egen `qualification.json` ligger i kandidatmappen på udgiverens Mac og er ikke lagt i repositoryet.

Undervejs stoppede to bygninger før pakning eller upload: først på en tidsafhængig fejl i før-billeder og på Homebrews Node 26.13, hvor pakkearkiverne ikke blev byte-ens, derefter på den forældede `test:package`. Ingen af dem uploadede noget.

Workflowet Byg testpakker startede ved tagget og indgår ikke i kvalifikationen.

## Kontrolsummer

- `Aura-Prime-0.8.0-beta.1-mac-arm64.dmg`: SHA-256 `23715b36d5ad58b048feaeb18b331924dbe40bc6505ac28c634af9208c6c7242`
- `Aura-Prime-0.8.0-beta.1-mac-arm64.zip`: SHA-256 `7d45906ce0f12baed79637ad4b5b8564f6ffe447f23c5d36b7d5889658c39137`
- `beta-mac.yml`: SHA-256 `b1a208b10e826aac616cb1bde3943d565f8d9d818770283785d9c43f4ac5f850`
- `SHA256SUMS.txt`: SHA-256 `68ab6b5344662694eb10157862511e5893b94d6514da7949d0e5ece7756ab630`
