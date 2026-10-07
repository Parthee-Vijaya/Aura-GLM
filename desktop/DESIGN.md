# Lys præcision

Designretning for Aura. Arbejdsområdet skal give plads til samtalen og det, brugeren bygger. Det er en app til at arbejde i, ikke en præsentation af alle funktionerne.

## Få valg

Aura skal kunne bruges af en person uden teknisk baggrund, som klikker sig igennem opsætningen uden at gå i stå. Det gælder appen, webguiden og installationerne.

- **Ét spørgsmål pr. skærm.** Overskriften er spørgsmålet, fx "Hvilket kodeværktøj bruger du?".
- **Få, store valg.** Ét eller to hovedvalg, højst tre til fire synlige. Når vi anbefaler et valg, står det først og er markeret som anbefalet. Spørger vi om noget, brugeren allerede har, fx sit kodeværktøj, vises de mest udbredte først.
- **Resten bag ét link.** Fx "Bruger du en anden udbyder? Vælg en anden" eller "Et andet værktøj". Lange lister får søgning.
- **Et klik fører videre,** når valget er entydigt. Der skal ikke også trykkes Næste.
- **Resumé først, detaljer bagefter.** Sig i almindeligt dansk, hvad der sker. Filstier, modelnavne med versionsnumre, priser pr. token og konfiguration ligger bag "Se detaljer".
- **Knappen siger, hvad der sker.** Skriv "Installer resten" frem for et afkrydsningsfelt og en generel knap.
- **Én næste handling.** Når noget er færdigt, vises det vigtigste næste skridt; andre handlinger er sekundære.

Eksempler i appen: AI-adgang har to store valg. Udbyder har tre ligestillede kort, Claude, Mistral og Corti, med faktuelle oplysninger og "En anden udbyder"; appen anbefaler aldrig en udbyder eller model. Modellen er udbyderens eget udgangspunkt, valgt på forhånd; modelknappen viser det, to alternativer og "Alle modeller". En filgodkendelse har tre knapper, hvor Tillad for denne opgave er den primære. Funktioner ved første start har to kort, Hele pakken (anbefalet) og Vælg selv. Kodeværktøj har fire kort og "Et andet værktøj".

Tæl de synlige valg, før en skærm kaldes færdig, og gennemfør forløbet i appen.

## Det, man møder

- Første skærm spørger, om man vil bygge i appen eller bruge Aura Harness i sit eget kodeværktøj.
- Den guidede opstart viser ét spørgsmål ad gangen med stor overskrift og to eller tre store valg. Først vælger man adgangsnøgle eller AI på computeren; en gemt forbindelse bliver et tredje valg. Adgangsnøgle fører til tre udbyderkort, Claude, Mistral og Corti, og "Bruger du en anden udbyder? Vælg en anden". Nøglefeltet vises først, når en udbyder er valgt. "Har du ikke en nøgle? Sådan får du en" viser konto, betaling, månedlig grænse og nøgle som nummererede trin med en knap til hver side hos udbyderen. Sidepanelet er skjult under introduktionen.
- Efter AI-trinnet spørger den guidede opstart én gang: "Hvad skal Aura hjælpe med?".
  - Der er to store valg. Hele pakken står først og er markeret Anbefalet; det andet er Vælg selv.
  - Vælg selv viser de seks funktioner som kontakter, der starter slået fra. Knappen siger, hvad der sker, fx "Fortsæt med 2 funktioner".
  - Én linje nævner det, der altid er slået til.
- Indstillinger › Funktioner viser én kontakt pr. funktion med én linje forklaring.
  - Skills og "Altid slået til" er foldet sammen.
  - Med et projekt åbent vælger man Alle projekter eller Kun projektet. En undtagelse står under funktionen med Brug standarden.
  - En slået fra funktion skjuler sine knapper, fx Del, Sikkerhedskopi, Gem version eller designvalgene. Den sletter intet.
  - Under overskriften Integrationer står én kontakt pr. system, fx CVR. Integrationer er slået fra, til man vælger dem. Deres ⓘ viser system, ejer, adgang, data, dataflow, pris og kontroldato. Ved første start vises kun de almindelige funktioner.
- "Hvad vil du bygge?" viser idé, projektnavn og Opret og fortsæt. Projektet gemmes i Dokumenter › Aura uden mappedialog; "Vælg en anden placering" er et link.
  - Flere valg er én flad liste med AI, udgivelse, tests og design, hver med ⓘ. Farve, logo og inspiration ligger ét lag længere nede.
  - De seneste valg huskes til næste projekt uden afkrydsning. "Glem dem" nulstiller dem.
- Aura Harness i dit kodeværktøj viser fire kort og "Et andet værktøj" med søgning. Et klik fører videre til mappevalget og derefter til et resumé i almindeligt dansk; de præcise filændringer ligger under Se de præcise ændringer.
  - Under Tilpas er integrationerne en kategori for sig og ikke valgt på forhånd. De tælles for sig, fx "9 af 12 skills valgt og 1 integration", og står aldrig som fravalgte. Vælg alle skills vælger ikke integrationer.
- Næste trin viser kun det valgte forløb. Nøglehjælp og tekniske oplysninger er foldet sammen. GitHub og lokale værktøjer ligger under Avanceret opsætning. Tilbage og Vælg senere er altid tilgængelige.
- Sidepanelet indeholder projekter, Nyt projekt, Åbn projekt og Indstillinger. Indstillinger har AI-forbindelser, Funktioner og Hjælp og feedback.
- AI-forbindelser er en liste med Rediger på hver forbindelse. Tilføj forbindelse går gennem den guidede opsætning med de tre udbyderkort. Rediger viser formularen med Test forbindelse og Fjern forbindelse.
- Arbejdsområdet består af samtalen og en arbejdsflade med en flytbar skillelinje. Arbejdsfladen har fem faner: Forhåndsvisning, Plan, Ændringer, Kode og Aktivitet. Forhåndsvisning er udgangspunktet.
  - Kun brugeren skifter fane. AI'ens hændelser giver Ændringer et tal og Aktivitet en prik, men flytter ikke brugeren. Nyt indhold i en åben fane vises først, når brugeren vælger det, fx med Vis dem.
  - Faneskift bevarer previewets formularer og rulning, filvalget, rulningen i de andre faner og beskedkladden.
  - Ændringer viser først et resumé med sammenligningsgrundlaget og derefter en linje-diff. Hver fil siger, om AI'en, AI'en og andre, en kommando eller brugeren ændrede den. Brugerens egne ændringer må aldrig stå som AI'ens.
  - Kode er skrivebeskyttet og viser kode som tekst. Beskyttede filer vises ikke. Filhenvisninger til AI'en står i skrivefeltet og i Før du sender.
  - Aktivitet viser kun faktiske hændelser med klokkeslæt og status i ord. Ingen simuleret terminal og ingen opdigtede testresultater.
  - Sidepanelet kan foldes sammen til ikoner. Ved 980 × 720 står fanerne på én linje; med større tekst må de bryde, men aldrig forsvinde. Et mærke på en fane ligger oven på hjørnet, så fanerne ikke flytter sig.
- Skrivefeltet er den vigtigste handling. Under det står den aktive model, udbyder og indsats og samtalens tokens ind og ud med en anslået pris. Modelknappen åbner Din AI. Den viser højst tre modeller: for kendte udbydere udbyderens eget udgangspunkt og to alternativer med faktuelle forklaringer, ellers et udvalg. Et klik på et modelkort vælger og lukker. Alle modeller og forbindelser ligger under Avanceret. Referencer vises kun, når projektet har referencefiler.
- Før første afsendelse viser "Før du sender" fire linjer: AI, hvor, træning og pris.
  - Under dem står én linje om pris og data med ⓘ. Tidligere samtale nævnes kun, når den sendes med.
  - "Se alle oplysninger" er korte rækker, og lange tekster som appens vejledning og planen har hver sin fold.
  - Resuméet vises igen, når modtager, model, pris, vilkår eller delt materiale ændrer sig, ikke ved skift fra plan til bygning.
- Første filændring i en opgave spørger, om AI'en må ændre filer i projektet. Filen vises med sin sti i projektet. "Tillad for denne opgave" gælder kun projektmappen og kun til opgaven slutter; kommandoer, web og filer udenfor spørger hver gang.
  - Et godkendelseskort siger Hvad, Hvorfor og Hvis du tillader i tre korte rækker. Ændringen og de tekniske detaljer er foldet sammen. AI'ens begrundelse er markeret som AI'ens, og et gæt om en kommando siger, at det er et gæt.
  - Afvis stopper opgaven. Afvis med en besked er et link under knapperne og lader AI'en fortsætte med brugerens besked.
- Én status: overskriften over samtalen siger kort, hvor opgaven er, og linjen under siger, hvad der sker, eller hvad AI'en venter på. Efter Stop, afvisning og fejl står vejen videre på resultatkortet; der er ingen ekstra advarselsboks eller rød linje ved siden af.
- Resultatkortets Kontroller viser kun faktiske resultater med tegn og tekst: forhåndsvisningens indlæsning og konsolfejl og kommandoernes afslutningskoder. Det, Aura ikke har kontrolleret, siges.
- Planlægning fører til et konkret forslag. Brugeren vælger at bygge; efter bygning kan man fortsætte med rettelser.
  - AI'ens spørgsmål vises ét ad gangen som store svarkort, højst fire synlige. AI'ens anbefaling står først og er markeret som AI'ens, ikke Auras. Eget svar, Tilbage og Spring over er links.
  - Projektbriefen indeholder kun brugerens egne ord: idé, ønsker og svar. Hver linje siger, hvor den kommer fra, og kan rettes.
  - Planen står under Plan i fire afsnit med teknik foldet sammen. Samtalen viser et kort med planens første linje og én primær handling: Byg. Planen kan rettes direkte eller af AI'en og genåbnes. En plan, der ikke må bygges, kan stadig læses.
- Nye projekter har versioner fra start. Efter hver AI-opgave gemmes en version, og resultatkortet tilbyder Fortryd opgaven. Historikken står under Ændringer › Versioner: "Alt er gemt" eller antallet af ugemte ændringer, én knap til Gem version og versionerne som rækker med et lille billede, et navn, typen og tiden. Én række er ét valg; de to veje tilbage står først, når en version er åbnet. Filvalg, branch og identitet ligger under Avanceret.
- Før og efter vises side om side, med samme side i samme størrelse. Mangler et billede, siger teksten det. Billederne er hjælp, ikke bevis for, at koden virker.
- Enhver gendannelse og fortrydelse har én gennemgang: billederne, et udfald pr. fil, dine ugemte ændringer og ét spørgsmål, hvis du og AI'en har rettet de samme linjer. Dine linjer er det anbefalede svar. Hvad der ellers berøres, er foldet sammen.
- Appen åbner det projekt, der sidst var åbent. Et projekt, der er lukket med Nyt projekt, åbnes ikke igen.
- Sidepanelet viser projekterne med deres samtaler; kun det åbne projekt er foldet ud, og højst seks samtaler vises, før "Vis alle". Ny samtale står øverst og som + ved projektet. En samtales status står under navnet med tekst og farvet prik: arbejder, venter på dig, nyt resultat eller afbrudt. Omdøb og slet ligger under •••.
- Flere samtaler kan arbejde samtidigt. En opgave får en kopi, hvis projektmappen er optaget. **Samtalens kopi** står over preview, og ét kort i samtalen forklarer konsekvensen med **Flet ind i projektet** som næste handling. Stien og udeladte filer er foldet sammen. Sidepanelet viser **klar til at flette**. Godkendelser og spørgsmål vises kun i den samtale, der stillede dem, og godkendelsen siger, når filen hører til kopien.
- Indfletning bruger gennemgangen før Fortryd: projektet og kopien vises side om side, øvrige projektlinjer bevares, og dine linjer er anbefalet ved konflikt. Den venter kun på opgaver i projektet og kildekopien; en synlig linje forklarer ventetiden. Et samtaleskift bevarer previewets felter og rulning. En baggrundsopgave må hverken flytte den åbne fane eller kontrollere en anden samtales preview som sit eget resultat.
- Korte handlingsbeskeder har deres egen plads i den aktive skærm. De må ikke ligge oven på skrivefeltet, fanerne eller andre knapper.
- Kommandopaletten (⌘K) er valgfri og har ingen knap; den nævnes i Hjælp. Den viser kun handlinger, der findes og kan bruges lige nu, og uden søgning højst seks handlinger, fem samtaler og tre projekter.
- Eksempler på idéer ligger bag ét link under idéfeltet og vises kun, når feltet er tomt: tre faste eksempler, der kan bygges uden server.
- Projektmenuen indeholder versioner og sikkerhedskopi. Del åbner udgivelse til test. Del og Sikkerhedskopi vises kun, når Deling og udgivelse er slået til. Funktionen er ikke med i den anbefalede pakke, så længe Del kræver udviklerværktøjer.
- Ret i siden er en frivillig til/fra-knap i forhåndsvisningens værktøjslinje. Kortet for et valgt element har højst to hovedvalg: Ret teksten og Bed AI'en ændre det. Kan Aura ikke rette selv, står grunden på kortet, og AI'en er det fremhævede valg. Tekst rettes i et felt i Aura, aldrig i selve siden, og Fortryd står ved resultatet. Et mål for AI'en står over skrivefeltet og i Før du sender, før det sendes.
- Preview viser skærmstørrelse og genindlæsning. Server, skalering og egne mål ligger i en menu. Hvis en framework-app mangler sin server, vises én handling i det tomme preview: Start forhåndsvisning. Installation og start gennemgås i en dialog; procesloggen er foldet sammen.

## Rolige skærme

Hver skærm og dialog følger samme mønster:
- **Én ting øverst:** ét spørgsmål eller én status i almindelige ord og én primær knap.
- **Højst én linje forklaring.** Resten ligger bag en ⓘ eller Se detaljer. Fagord som branch, commit, identitet, endpoint og token står kun under Avanceret.
- **Indstillinger som lister:** en kontakt eller en liste pr. række. Detaljer ligger på et lag længere nede, ikke foldet ud på samme skærm.
- **Det, der afgør beslutningen, er synligt:** Modtageren af data, prisen og handlinger, der ikke kan fortrydes, står altid som én kort linje. Tidligere samtale nævnes, når den sendes med.

ⓘ er en lille rund knap:
- Et klik åbner en boble ved knappen, og Escape eller et klik udenfor lukker den. Den åbner aldrig kun ved, at man holder musen over.
- Teksten står i knappens `data-info`, og knappen har et tilgængeligt navn, fx "Mere om pris".
- Inde i en dialog flyttes boblen ind i dialogen, så skærmlæsere kan nå den.

`npm run measure:screens` måler alle skærme med en kontrolleret model:
- synlige ord, valg, ⓘ og felter pr. skærm;
- klik pr. opgave;
- et skærmbillede af hver.

Kør målingen før og efter en ændring af en skærm, og sammenlign. Der er ingen fast grænse; tallene viser, om en skærm vokser.

## Hvad der vises hvornår

En indstilling skal have et sted, hvor den naturligt hører til. Den skal ikke gentages i navigation, status, formular og hjælpetekst på samme skærm.

Værktøjsaktivitet står under Aktivitet; samtalen viser én linje med antallet og Se Aktivitet. Spørgsmål, fejl og handlinger, der kræver godkendelse, vises på det tidspunkt, brugeren skal tage stilling. Tekniske detaljer kan åbnes. En kort resultatoversigt beskriver de faktiske ændringer; den er ikke et testbevis.

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

## Deling: version, destination og faktisk kontrol

Delingsdialoger viser én fase ad gangen: destination, gennemgang og resultat. Resuméet viser versionens genkendelige navn og tidspunkt, modtager og miljø samt adgang og omkostninger. Filer, fulde ID'er, branch, fingeraftryk og kontokonfiguration ligger under Se detaljer. Ret destination bevarer felterne og kasserer godkendelsen.

Et uploadresultat er knyttet til den gennemgåede version og destination. Udbyderens status, HTTP-svar uden login, filmatch og testpersonens adgang må ikke blandes sammen. En mislykket frisk kontrol erstatter gammel evidens. Ved ukendt upload er udbyderens oversigt vejen videre; ingen automatisk gentagelse. GitHub viser kode og historik, ikke et link til en udgivet app. Uflettede kopier står synligt som udeladt fra delingen.

Dialogerne kan rulle ved større tekst; gennemgang og resultat får synligt tastaturfokus, og Escape returnerer til åbneren. Skærmbilleder ved Electron-zoom tages med vinduets capturePage. Forståeligheden afgøres ved observation med en testperson efter docs/testforloeb.md; automatiske prøver tæller som separat teknisk evidens.
