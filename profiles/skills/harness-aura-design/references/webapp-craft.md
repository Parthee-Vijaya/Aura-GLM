 Skill: Design og byg gennemarbejdede webapps og hjemmesider

## Formål

Skab visuelt sammenhængende, brugervenlige og teknisk velfungerende
webapps og hjemmesider.

Resultatet skal opleves som et færdigt produkt med en bevidst
designretning – ikke som en generisk skabelon.

Design skal understøtte indholdet, målgruppen og brugerens vigtigste
handlinger. Æstetik må aldrig stå i vejen for forståelse eller funktion.


## 1. Forstå opgaven før du designer

Identificér:

- Hvad er produktets formål?
- Hvem er målgruppen?
- Hvilken opgave skal brugeren først og fremmest kunne løse?
- Hvad er sidens eller appens primære handling?
- Er løsningen offentlig, intern, kommerciel eller personlig?
- Findes der allerede en visuel identitet?
- Er der særlige krav til tilgængelighed, sprog eller databeskyttelse?

Undersøg eksisterende kode og relevante materialer, før du ændrer noget.

Hvis information mangler:
- Vælg fornuftige standarder ved mindre designbeslutninger.
- Stil kun spørgsmål, når svaret væsentligt påvirker funktion,
  informationsarkitektur eller brand.
- Forklar kort væsentlige antagelser.
- Opfind ikke officielle oplysninger, kundeudtalelser eller integrationer.

Tilpas ambitionsniveauet til opgaven. En enkel side skal ikke gøres
unødigt kompleks.


## 2. Vælg en tydelig designretning

Definér designretningen, før komponenterne bygges.

Beskriv den med 3–5 egenskaber, eksempelvis:

- Rolig, troværdig, lokal og imødekommende.
- Præcis, professionel, kompakt og effektiv.
- Redaktionel, varm, karakterfuld og indholdsrig.
- Enkel, teknisk, moderne og fokuseret.

Vælg én sammenhængende retning frem for at blande mange stilarter.

Tilpas designet til produktet:
- Offentlige løsninger: forståelighed, tryghed og tilgængelighed.
- Arbejdsværktøjer: overblik, effektivitet og tydelige tilstande.
- Marketinghjemmesider: fortælling, troværdighed og næste handling.
- Kreative porteføljer: særpræg, billeder og typografisk karakter.
- E-handel: produktforståelse, sammenligning og tryg købsproces.

Brug ikke automatisk den samme skrifttype, farvepalet og kortstruktur
til alle projekter.


## 3. Respektér brand og kilder

Hvis en designguide findes:
- Følg dens farver, typografi, logoanvendelse og øvrige regler.
- Skeln mellem bindende regler og inspiration.
- Brug de leverede aktiver frem for hjemmelavede efterligninger.

Hvis en designguide ikke findes:
- Skab et konsistent, selvstændigt designforslag.
- Beskriv det som et forslag, ikke som en officiel identitet.
- Efterlign ikke officielle logoer eller mærker på en måde, der kan
  give indtryk af godkendelse eller tilknytning.

Brug kun billeder, skrifter og andre aktiver, som projektet må anvende.
Indlæs ikke eksterne ressourcer uden at kontrollere projektets rammer.


## 4. Byg et lille designsystem

Definér fælles designværdier, før siderne detaljeres.

### Farver

Opret semantiske farver til:
- Sidens baggrund.
- Primære og sekundære overflader.
- Primær og afdæmpet tekst.
- Kantlinjer.
- Primær handling.
- Accent.
- Succes, advarsel og fejl.

Brug få farver med tydelige roller.

En mulig startpalette til et roligt, grønt design:
- Baggrund: #FAFBF8
- Overflade: #FFFFFF
- Afdæmpet overflade: #EDF2E9
- Primær tekst: #243F39
- Primær handling: #3E6049
- Kantlinje: #DFE5DB

Paletten er kun et eksempel. Kontrollér kontrast i den faktiske
anvendelse, og justér især sekundær tekst efter behov.

Brug ikke farve som eneste signal for betydning.

### Typografi

- Vælg én primær skrifttype og eventuelt én supplerende.
- Brug skrifter, som allerede er tilgængelige, når det er muligt.
- Skab karakter gennem hierarki, vægt og proportioner – ikke ved at
  bruge mange forskellige skrifttyper.
- Brug som udgangspunkt 16 px til almindelig brødtekst.
- Brug mindre tekst med omtanke og ikke til afgørende information.
- Giv brødtekst en linjehøjde omkring 1,5–1,7.
- Hold længere tekstblokke omkring 45–75 tegn pr. linje.
- Brug flydende overskriftsstørrelser, hvor det giver mening.

Overskrifter skal have en tydelig relation til hinanden.
Spring ikke tilfældigt mellem størrelser og vægte.

### Afstande

Brug en konsistent afstandsskala, eksempelvis:
4, 8, 12, 16, 24, 32, 48, 64 og 96 px.

Afstande skal vise sammenhæng:
- Lille afstand mellem elementer, der hører sammen.
- Større afstand mellem forskellige grupper.
- Mest luft mellem hovedsektioner.

### Former og dybde

- Vælg en konsekvent strategi for hjørner.
- Brug kantlinjer til diskret struktur.
- Brug kun skygger, når de hjælper med at vise lag eller interaktion.
- Undgå at give alle elementer samme kortbaggrund og skygge.

### Design tokens

Saml gentagne værdier i CSS-variabler eller projektets eksisterende
tokensystem.

Eksempel:

:root {
  --color-bg: #fafbf8;
  --color-surface: #ffffff;
  --color-text: #243f39;
  --color-primary: #3e6049;
  --color-border: #dfe5db;

  --radius-control: 6px;
  --radius-panel: 12px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
}


## 5. Planlæg informationsarkitekturen

Organisér indhold efter brugerens behov, ikke efter organisationens
interne struktur.

Gør det hurtigt at forstå:
1. Hvad er dette?
2. Hvad kan jeg gøre her?
3. Hvad er vigtigst for mig?
4. Hvad skal jeg gøre nu?

Brug få, tydelige navigationspunkter.
Vis aktiv placering.
Brug velkendte betegnelser frem for kreative, men uklare navne.

### For hjemmesider

En mulig struktur:
- Header med identitet og navigation.
- Introduktion med klart værdiløfte.
- Primær handling.
- Relevant indhold, produkter eller ydelser.
- Dokumentation eller troværdighedsskabende information.
- Næste skridt.
- Footer med relevante oplysninger.

Brug kun sektioner, som har et reelt formål.
Opfind ikke kundeudtalelser, referencer eller resultater.

### For webapps

En mulig struktur:
- Navigation og aktuel placering.
- Sidetitel og kort forklaring.
- Primær handling.
- Søgning, filtre eller relevante værktøjer.
- Arbejdsområde, liste, tabel eller detaljevisning.
- Tydelig feedback og næste skridt.

En webapp behøver ikke en stor marketing-introduktion.
Prioritér arbejdsområdet, når brugeren kommer for at løse en opgave.


## 6. Skab visuel prioritering

Hver skærm skal have et tydeligt fokus.

- Giv den vigtigste handling størst visuel vægt.
- Brug sekundære handlinger mere afdæmpet.
- Brug tekstlinks til mindre vigtige handlinger.
- Giv destruktive handlinger et tydeligt, men afbalanceret udtryk.
- Lad ikke alle elementer konkurrere om opmærksomheden.

Brug variation i:
- Størrelse.
- Typografisk vægt.
- Kontrast.
- Placering.
- Afstand.
- Overflade.

Undgå at fremhæve alt med stærke farver, fed tekst og store knapper.


## 7. Design komponenter til deres indhold

Vælg komponent efter opgaven:

- Kort til selvstændige indholdsenheder.
- Tabeller til sammenligning og strukturerede data.
- Lister til gentagne, let skannede elementer.
- Faner til nært beslægtede visninger.
- Dialoger til afgrænsede opgaver.
- Separate sider til længere eller komplekse forløb.

Brug ikke kort til alt.

### Knapper
- Brug handlingsorienterede tekster.
- Skriv eksempelvis “Gem ændringer” frem for “OK”.
- Brug ens højde, afstande og ikonplacering.
- Vis tydelige hover-, fokus-, deaktiveret- og indlæsningstilstande.
- Undgå ikonknapper uden tilgængeligt navn.

### Formularer
- Brug synlige labels.
- Brug ikke placeholdertekst som eneste label.
- Angiv korrekt inputtype og autocomplete.
- Spørg kun om nødvendige oplysninger.
- Vis krav og validering tæt på det relevante felt.
- Bevar indtastede værdier ved fejl.
- Forklar, hvad der sker efter indsendelse.
- Undgå at vise succes, før handlingen er gennemført.

### Søgning og filtre
- Brug tydelige labels.
- Vis, når et filter er aktivt.
- Vis resultatantal, når det hjælper.
- Giv mulighed for at nulstille filtreringen.
- Forklar tomme søgeresultater.

### Dialoger
- Giv dialogen en tydelig titel.
- Håndtér fokus korrekt.
- Giv en forståelig lukkemulighed.
- Understøt Escape, når handlingen kan afbrydes.
- Returnér fokus til det udløsende element efter lukning.
- Forebyg utilsigtet tab af indhold ved vigtige handlinger.


## 8. Design alle relevante tilstande

En funktion er ikke færdig, når kun normaltilstanden er designet.

Håndtér efter behov:
- Indlæsning.
- Tom tilstand.
- Ingen søgeresultater.
- Succes.
- Valideringsfejl.
- Netværks- eller serverfejl.
- Manglende adgang.
- Deaktiveret handling.
- Langsom forbindelse.
- Delvist tilgængelige data.

Giv altid en brugbar forklaring og et muligt næste skridt.

Indlæsning må ikke ligne et tomt resultat.
En fejl må ikke præsenteres som en succes.
Eksempeldata må ikke fremstå som rigtige data.


## 9. Skriv præcis og menneskelig mikrocopy

Brug målgruppens sprog.

Skriv:
- Kort.
- Konkret.
- Venligt.
- Handlingsorienteret.
- Uden unødvendig jargon.

Forklar handlingens resultat:
- “Tilmeld dig mødet”
- “Download rapport”
- “Gem ændringer”
- “Prøv igen”
- “Nulstil filtre”

Fejlbeskeder skal forklare:
1. Hvad gik galt?
2. Er brugerens arbejde bevaret?
3. Hvad kan brugeren gøre nu?

Undgå:
- Uklare “Der opstod en fejl”-beskeder uden næste skridt.
- Overdrevet begejstring ved almindelige handlinger.
- Skyldplacering hos brugeren.
- Påstande, som systemet ikke kan dokumentere.


## 10. Gør designet responsivt

Design til indhold og tilgængelig plads – ikke kun til bestemte enheder.

- Brug fleksible grids og layouts.
- Undgå vandret rulning på almindelige sider.
- Tilpas navigation, kort og værktøjslinjer på små skærme.
- Lad formularer bruge den tilgængelige bredde.
- Hold primære handlinger lette at finde.
- Bevar vigtigt indhold på mobil.
- Brug passende klik- og trykflader.
- Sigt efter cirka 44 × 44 px for centrale touch-kontroller.

Test mindst:
- Smal mobil.
- Bred mobil eller tablet.
- Almindelig desktop.
- Stor desktop.

Kontrollér også:
- Lange overskrifter.
- Lange navne og labels.
- Mange listeelementer.
- Forstørret tekst.
- Både meget lidt og meget indhold.


## 11. Prioritér tilgængelighed

Sigt efter WCAG 2.2 niveau AA, hvor det er relevant.

- Brug semantisk HTML.
- Brug rigtige knapper til handlinger og links til navigation.
- Sørg for logisk overskriftshierarki.
- Giv formularfelter tilknyttede labels.
- Sørg for fuld tastaturbetjening.
- Vis tydelig fokusmarkering.
- Skab en logisk fokusrækkefølge.
- Brug tilstrækkelig tekstkontrast.
- Giv meningsfulde billeder alternativ tekst.
- Skjul dekorative ikoner for skærmlæsere.
- Gør vigtige statusændringer tilgængelige for hjælpemidler.
- Respektér brugerens ønske om reduceret bevægelse.

Som udgangspunkt:
- Mindst 4,5:1 kontrast for almindelig tekst.
- Mindst 3:1 for stor tekst.
- Relevante kontrolgrænser og fokusmarkeringer skal være tydelige.

Påstå ikke fuld tilgængelighed alene på baggrund af en visuel kontrol.


## 12. Brug billeder, illustrationer og ikoner bevidst

Visuelle elementer skal:
- Forklare.
- Understøtte identiteten.
- Skabe relevant stemning.
- Hjælpe med orientering.

De skal ikke blot udfylde tom plads.

- Brug en sammenhængende ikonstil.
- Kombinér uklare ikoner med tekst.
- Bevar billeders proportioner.
- Brug korrekt beskæring.
- Angiv dimensioner, når det kan forebygge layoutskift.
- Optimér tunge aktiver.
- Brug enkel original grafik, når det passer bedre end stockfotos.

Undgå dekorative illustrationer, som konkurrerer med hovedopgaven.


## 13. Brug bevægelse med tilbageholdenhed

Animation skal forklare ændringer og give feedback.

- Brug korte, rolige overgange.
- Animér især opacity og transform.
- Undgå bevægelse, der forsinker brugerens arbejde.
- Undgå konstant animation uden et tydeligt formål.
- Understøt prefers-reduced-motion.

Hovereffekter må ikke være den eneste måde at opdage funktioner på.


## 14. Implementér i projektets eksisterende rammer

- Undersøg det eksisterende framework og komponentmønster.
- Bevar fungerende arkitektur og afhængigheder.
- Genbrug eksisterende komponenter, når de passer.
- Tilføj kun nye afhængigheder, når de giver reel værdi.
- Følg miljøets regler for installation, data og integrationer.
- Adskil gentaget UI i passende komponenter.
- Brug læsbare navne og overskuelig tilstandshåndtering.
- Undgå unødvendige abstraktioner.

Byg reel funktionalitet:
- Knapper skal udføre deres angivne handling.
- Filtre skal filtrere.
- Formularer skal validere.
- Gemte ændringer skal håndteres korrekt.
- Fejl skal vises forståeligt.

Hvis en integration mangler:
- Forklar begrænsningen.
- Markér eventuelle eksempler.
- Simulér ikke en vellykket virkelig handling.


## 15. Behandl data med omtanke

- Indsaml kun nødvendige oplysninger.
- Vælg datalagring efter, hvem der må læse og skrive.
- Skeln mellem personlige, fælles og offentlige oplysninger.
- Undgå persondata i eksempelindhold.
- Gem aldrig adgangskoder eller hemmeligheder i frontendkode.
- Forklar væsentlige konsekvenser ved indsendelse.
- Stol ikke på skjult UI som adgangskontrol.
- Håndhæv adgang gennem den tilgængelige backend.

Brug ikke juridiske løfter som “fuldt GDPR-sikker” uden et
dokumenteret grundlag.


## 16. Kontrollér resultatet visuelt og funktionelt

Se den faktisk renderede løsning. Stol ikke kun på koden.

Kontrollér:
- Er sidens formål tydeligt?
- Er den vigtigste handling let at finde?
- Er typografihierarkiet sammenhængende?
- Er der passende luft?
- Er sekundær tekst læsbar?
- Er elementer korrekt justeret?
- Er der overlap, afskæring eller vandret overflow?
- Fungerer navigation, formularer og filtre?
- Er indlæsning, fejl og tomme tilstande håndteret?
- Er der runtimefejl?
- Fungerer mobilvisningen?
- Kan de vigtigste opgaver udføres med tastatur?

Ret konkrete problemer og kontrollér igen.

Skeln mellem:
- Visuelt kontrolleret.
- Funktionelt afprøvet.
- Testet med rigtige integrationer.

Påstå ikke test, som ikke er udført.


## 17. Undgå generiske designfælder

Undgå som automatisk standard:
- Store gradientoverskrifter.
- Tilfældige lilla eller blå accenter.
- Glaseffekter på alle flader.
- Identiske kort i alle sektioner.
- Overdrevne skygger.
- Meget store hjørner på alle elementer.
- Små, lysegrå tekster med dårlig læsbarhed.
- Overflødige badges og ikoner.
- Store introduktionsfelter i effektivitetsorienterede apps.
- Falske tal, kundeudsagn eller aktivitetsindikatorer.
- Dekorative knapper, som ikke virker.

Disse virkemidler er ikke forbudte, men skal vælges bevidst,
fordi de passer til produktet.


## 18. Afslut med en kort og ærlig overlevering

Fortæl:
- Hvad der er bygget eller ændret.
- Hvilke hovedfunktioner der findes.
- Hvad der er testet.
- Om data er eksempler.
- Om noget kræver opsætning eller yderligere arbejde.

Hold forklaringen kort, medmindre brugeren ønsker dokumentation.

Et flot udtryk er ikke nok. Løsningen skal være forståelig,
funktionel, tilgængelig og ærlig om sine begrænsninger.


## Opgaveskabelon

Når dette skill bruges, udfyld:

**Produkt:**
[Hvad skal bygges?]

**Målgruppe:**
[Hvem skal bruge det?]

**Primær opgave:**
[Hvad skal brugeren først og fremmest kunne gøre?]

**Vigtigste sider eller visninger:**
[Liste]

**Designretning:**
[3–5 egenskaber]

**Brandmateriale:**
[Designguide, logo, farver, skrifter – eller intet eksisterende]

**Indhold og data:**
[Rigtige data, leveret indhold eller tydeligt markerede eksempler]

**Funktioner og integrationer:**
[Hvad skal virke?]

**Tekniske rammer:**
[Eksisterende projekt, framework og begrænsninger]

**Særlige krav:**
[Sprog, tilgængelighed, adgang, mobil, databeskyttelse]

Start derefter med at undersøge projektet, vælg en tydelig
designretning, implementér løsningen og kontrollér resultatet.