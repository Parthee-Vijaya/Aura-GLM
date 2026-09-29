# Lys præcision

Designretning for AI Harness. Arbejdsområdet skal give plads til samtalen og det, brugeren bygger. Det er en app til at arbejde i, ikke en præsentation af alle funktionerne.

## Få valg

AI Harness skal kunne bruges af en person uden teknisk baggrund, som klikker sig igennem opsætningen uden at gå i stå. Det gælder appen, webguiden og installationerne.

- **Ét spørgsmål pr. skærm.** Overskriften er spørgsmålet, fx "Hvilket kodeværktøj bruger du?".
- **Få, store valg.** Ét eller to hovedvalg, højst tre til fire synlige. Når vi anbefaler et valg, står det først og er markeret som anbefalet. Spørger vi om noget, brugeren allerede har, fx sit kodeværktøj, vises de mest udbredte først.
- **Resten bag ét link.** Fx "Bruger du en anden udbyder? Vælg en anden" eller "Et andet værktøj". Lange lister får søgning.
- **Et klik fører videre,** når valget er entydigt. Der skal ikke også trykkes Næste.
- **Resumé først, detaljer bagefter.** Sig i almindeligt dansk, hvad der sker. Filstier, modelnavne med versionsnumre, priser pr. token og konfiguration ligger bag "Se detaljer".
- **Knappen siger, hvad der sker.** Skriv "Installer resten" frem for et afkrydsningsfelt og en generel knap.
- **Én næste handling.** Når noget er færdigt, vises det vigtigste næste skridt; andre handlinger er sekundære.

Eksempler i appen: AI-adgang har to store valg. Udbyder har tre kort og "En anden udbyder". Model har en anbefaling, to alternativer og "Alle modeller". Kodeværktøj har fire kort og "Et andet værktøj".

Tæl de synlige valg, før en skærm kaldes færdig, og gennemfør forløbet i appen.

## Det, man møder

- Første skærm spørger, om man vil bygge i appen eller bruge Harness i sit eget kodeværktøj.
- Den guidede opstart viser ét spørgsmål ad gangen med stor overskrift og to eller tre store valg. Først vælger man adgangsnøgle eller AI på computeren; en gemt forbindelse bliver et tredje valg. Adgangsnøgle fører til tre udbyderkort, Claude, Mistral og Corti, og "Bruger du en anden udbyder? Vælg en anden". Nøglefeltet vises først, når en udbyder er valgt. Sidepanelet er skjult under introduktionen.
- "Hvad vil du bygge?" viser idé, projektnavn og Opret og fortsæt. Standardvalg, AI og hosting, design og avancerede valg ligger under Flere valg.
- Harness i dit kodeværktøj viser fire kort og "Et andet værktøj" med søgning. Et klik fører videre til mappevalget og derefter til et resumé i almindeligt dansk; de præcise filændringer ligger under Se de præcise ændringer.
- Næste trin viser kun det valgte forløb. Nøglehjælp og tekniske oplysninger er foldet sammen. GitHub og lokale værktøjer ligger under Avanceret opsætning. Tilbage og Vælg senere er altid tilgængelige.
- Sidepanelet indeholder projekter, Nyt projekt, Åbn projekt og Indstillinger.
- Arbejdsområdet består af samtale og preview med en flytbar skillelinje.
- Skrivefeltet er den vigtigste handling. Modelknappen åbner AI, referencer og avancerede valg. Den viser højst tre modeller: for kendte udbydere en anbefaling og to alternativer med en kort forklaring, ellers et udvalg uden anbefaling. Alle modeller ligger under Avanceret, og pris vises, når en model er valgt, og før afsendelse.
- Planlægning fører til et konkret forslag. Brugeren vælger at bygge; efter bygning kan man fortsætte med rettelser.
- Projektmenuen indeholder versionsgemning, sikkerhedskopi og ny samtale. Del åbner udgivelse til test.
- Preview viser skærmstørrelse og genindlæsning. Server, skalering og egne mål ligger i en menu. Hvis en framework-app mangler sin server, vises én handling i det tomme preview: Start forhåndsvisning. Installation og start gennemgås i en dialog; procesloggen er foldet sammen.

## Hvad der vises hvornår

En indstilling skal have et sted, hvor den naturligt hører til. Den skal ikke gentages i navigation, status, formular og hjælpetekst på samme skærm.

Værktøjsaktivitet foldes sammen. Spørgsmål, fejl og handlinger, der kræver godkendelse, vises på det tidspunkt, brugeren skal tage stilling. Tekniske detaljer kan åbnes. En kort resultatoversigt beskriver de faktiske ændringer; den er ikke et testbevis.

Datamodtagere, pris, behandlingssted og ukendte vilkår skal fortsat kunne vurderes før afsendelse. Forenklingen må ikke skjule en ændret modtager eller give adgang på brugerens vegne.

## Visuelle valg

- Baggrund: kølig hvid `#F8FAFC`. Flader: hvid `#FFFFFF`.
- Primær handling: kobolt `#0052CC`. Svag markering: `#E8F1FF`.
- Brødtekst: `#182235`. Sekundær tekst: `#58677D`. Skillelinjer: `#E0E7F0`.
- Systemskrift på macOS og Windows. Brødtekst i samtalen er 13 px med linjehøjde 1,75. Teksten skal kunne læses uden at åbne en større visning.
- Afstande tager udgangspunkt i 4, 8, 12, 16, 24 og 32 px. Formularfelter har 8 px runding, skrivefelt 14 px og dialoger 16 px.
- Ikoner er enkle stregikoner. Ikonknapper har tilgængeligt navn og en forklarende titel.
- Bevægelse bruges ved åbning af dialoger og trin. Overgange varer 140–220 ms og slås fra ved reduceret bevægelse.

Farver og fælles komponentregler ligger i `ui/styles.css`. Nye skærme skal bruge dem, før der tilføjes særregler.

## Sprog og adgang

Skriv kort, konkret dansk. Brug handlinger som Gem version, Tilslut AI og Ret forslaget. Forklar konsekvensen ved den handling, der udløser den. Undgå faste opsummeringer, unødige gentagelser og slogans.

Kontroller skal kunne bruges med tastatur og have synligt fokus. Menuer skal kunne lukkes med Escape. Dialoger må gerne rulle på små skærme, men handlinger må ikke forsvinde. Brug farve sammen med tekst, når noget fejler eller kræver opmærksomhed.

## Afprøvning

Gennemgå både velkomst, tomt projekt, igangværende opgave, godkendelse, færdigt resultat, genåbning og fejl. Brug også vinduet ved 980 × 720 og reduceret bevægelse. Skærmbilleder alene viser ikke, om menuernes handlinger virker; gennemfør brugerforløbene i Electron.
