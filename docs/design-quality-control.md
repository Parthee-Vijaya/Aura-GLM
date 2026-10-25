# Kvalitet på tværs af modeller

Denne funktion er udgivet i [Aura 1 beta 0.4.0](releases/aura-1-beta-0.4.0.md). Den installerede 0.3.1 ændres først, når brugeren selv opdaterer appen.

Aura aktiverer de eksisterende design-skills med alle understøttede modeller. Den valgte model udarbejder designet ud fra opgaven, brugerens valg og dokumenterede brandkilder. Aura vælger ikke faste opgavespecifikke paletter, skrifter eller layoutopskrifter. Designmetoden hjælper modellen med at begrunde hierarki, farver, typografi, komposition, billeder og mobiladfærd; brugerens godkendte design og eksplicitte valg har forrang.

En leveret designguide, lokal `BRAND.md` og verificerede logoer/farver kan indgå i projektets kontekst. Modellen skal skelne mellem officielle kilder, brugerens egne valg og forslag. I idéhjælp uden værktøjer må den ikke påstå, at links eller logoer er undersøgt. Komponentreferencer kan inspirere arbejdet, men hverken kopiering, installation eller ekstra netadgang er automatisk tilladt.

Skills er instruktioner til modellen, ikke en garanti for dens udførelse. Den separate programstyrede appkontrol finder tekniske fejl uden at bestemme et fælles visuelt tema. Det tidligere forsøg med faste farver og en madapp-opskrift er fjernet fra runtimeinstruktionerne. Koden ligger bevaret under `desktop/scripts/fixtures/design-foundation-legacy.cjs`; den historiske verifier er ikke en test af det aktuelle modelsvar eller en aktiv designstandard.

Idéhjælpen reserverer plads til både tænkning og det synlige svar inden for modellens dokumenterede loft. Et færdigt svar med forkert format eller for lange felter kan få én formatrettelse hos samme model. Forbindelse, rute og instruktioner kontrolleres igen; Stop og én samlet tidsfrist gælder for begge kald. Indhold afkortes ikke lokalt, og ingen ny data eller værktøjer tilføjes.

## Lokal kontrol efter bygning

Efter en byggeopgave med ændringer i `public/` tager Aura en uforanderlig kopi af de tilladte webfiler. Den åbnes i en separat, skjult Electron-session med blokeret eksternt netværk, uden Node-adgang, brugerens browserdata eller projektets øvrige filer. Originalfilerne ændres ikke af kontrollen. Links til filer udenfor, beskyttede filer og for store kopier accepteres ikke.

Kontrollen venter på indlæsning og undersøger 1440 × 900 og 390 × 844 pixels samt højst otte enkelte klik fra en frisk side. Den prøver også kort med klikmarkering, selv om modellen har glemt almindelig knapsemantik. Den finder blandt andet JavaScript-fejl, vandret overløb, overskrifter dækket af faste elementer, ødelagte lokale billeder og lav tekstkontrast, når farver og baggrund kan måles sikkert. Hvis et klik skjuler sidens `main`-område, vises kun en advarsel til gennemgang: en legitim kvittering kan ligge udenfor. Det er ikke bevis på en tom side og indgår ikke i automatiske rettelsesbeskeder. Der gemmes lokale skærmbilleder og en rapport. Ingen skærmbilleder, rå fejltekster eller tekster fra den genererede side sendes automatisk videre til AI'en.

Ved konstaterede fejl kan Aura bede den samme AI om højst to rettelser inden for samme opgave, plan og samtale. Beskeden består af faste fejlbeskrivelser. Rettelser skal gennem de eksisterende værktøjsgodkendelser. Stop afbryder kontrollen; ændrede forudsætninger, uændrede filer eller en tidligere afvist handling forhindrer automatisk genoptagelse. Resterende fejl vises som et resultat, der kræver gennemgang. Filer og muligheden for at fortryde bevares.

### Ny kildeændring efter 0.4.0: tastaturfokus

Kontrollen supplerer nu med op til 12 rigtige Tab-trin på hver af de to skærmstørrelser, inden for samme samlede 40-sekundersbudget. Den kan påvise en opak, ensfarvet fokusramme, der har præcis samme sRGB-farve som en kendt ensfarvet baggrund, når der ikke er en målt alternativ markering. Fundet bruger den eksisterende rettelsesbesked og ændrer ikke værtsappens UI.

Ændret størrelse, placering eller typografi kan være en synlig fokusmarkering og skal derfor give et usikkert resultat frem for en fejl. Målingen kompenserer for almindelig dokument- og containerscroll, så Tab-scroll alene ikke skjuler en faktisk usynlig ramme. Komplekse baggrunde, skygger, pseudo-elementer, overlays, gennemsigtighed og andre usikre forhold klassificeres ikke automatisk som fejl. Det er en afgrænset stikprøve, ikke en fuld test af tastaturadgang. Denne udvidelse er endnu ikke med i den udgivne DMG.

## Hvad kontrollen ikke beviser

- En teknisk vellykket kontrol er ikke en bedømmelse af æstetik eller en garanti for et poleret design.
- Klikprøverne udfylder ikke formularer og gennemfører ikke automatisk hele bestillings-, betalings- eller loginforløbet.
- Kontrollen understøtter lokale, statiske webapps i `public/`. Apps med server, pakkeopbygning, eksterne billeder eller andre afhængigheder kan kræve særskilt afprøvning. De får ikke et falsk grønt resultat.
- Kontrastmåling springer usikre baggrunde og ikke-understøttede farverum over. Den er ikke en fuld tilgængelighedsrevision.
- Browserens begrænsninger er afgrænsning af denne prøve, ikke en påstand om fuld isolation af hele Aura eller alle værktøjer.

Alle modeller får samme skillmetode og objektive kontrol. Deres evne til at komponere, illustrere, kode og rette komplekse fejl kan fortsat være forskellig. Reelle modelprøver skal bruge samme opgave og sammenlignelige vilkår. Visuel gennemgang og hele brugerforløb skal vurderes særskilt; et bestået teknisk check er ikke bevis for flot design.

## Kontroller i repositoryet

- `desktop/tests/build-design.test.cjs`: aktivering af design-skills, fravær af faste opgaveskabeloner og respekt for eksisterende valg.
- `desktop/tests/idea-refinement.test.cjs`: det gennemgåede designforslag følger den konkrete forespørgsel.
- `desktop/tests/app-quality*.test.cjs`: filafgrænsning, sikre fund, rettelsesgrænser, Stop, samtale, plan og godkendelser.
- `desktop/scripts/verify-app-quality.cjs`: rigtig Electron med lokale prøvefiler og kontrolleret netværksmodtager.
- `desktop/scripts/verify-app-quality-focus.cjs`: rigtig Tab-input, alternative fokusmarkeringer, ændret geometri/typografi, dokument-/containerscroll og blokerede netkald. Køres med en ny evidensmappe som første argument; et valgfrit andet argument angiver en bevaret app med den kendte fokusregression. Ingen AI kontaktes.
- `evals/openenv/`: særskilte forsøg med rigtige modeller og faktiske genererede apps. [Modelsammenligningen fra 25. oktober 2026](../evals/openenv/MODELSAMMENLIGNING-2026-10-25.md) viser Mistral og Corti gennem Aura samt en særskilt GPT-reference. GPTs normale Aura-forløb endte i transporttimeout; referenceappen bruger et enklere filoutput og er derfor ikke et ligeværdigt tredje Aura-forsøg. Testdata er fiktive; modelsvar og kodeproduktion er reelle.
- [Fem kommunale GPT-prøver](../evals/openenv/MUNICIPAL-LANDINGS-2026-10-25.md): efterfølgende gennemførte Plan/Byg-forløb med rettet evalueringstransport, særskilt kodeproveniens, første/slutbilleder og bevarede historiske fejl. Det er ikke en ny DMG-prøve eller en kontrolleret tremodelsammenligning.
