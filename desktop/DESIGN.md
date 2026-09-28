# Lys præcision

Designretning for AI Harness. Arbejdsområdet skal give plads til samtalen og det, brugeren bygger. Det er en app til at arbejde i, ikke en præsentation af alle funktionerne.

## Det, man møder

- Sidepanelet indeholder projekter, Nyt projekt, Åbn projekt og Indstillinger.
- Arbejdsområdet består af samtale og preview med en flytbar skillelinje.
- Skrivefeltet er den vigtigste handling. Modelknappen åbner AI, referencer og avancerede valg.
- Planlægning fører til et konkret forslag. Brugeren vælger at bygge; efter bygning kan man fortsætte med rettelser.
- Projektmenuen indeholder versionsgemning, sikkerhedskopi og ny samtale. Del åbner udgivelse til test.
- Preview viser skærmstørrelse og genindlæsning. Server, skalering og egne mål ligger i en menu.

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
