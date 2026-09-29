# Krav i danske offentlige organisationer

Pejlemærker til, hvornår en fagperson skal inddrages. Det er ikke juridisk rådgivning, og organisationens egne procedurer går forud. Kilderne er kontrolleret 29. september 2026; kontrollér dem igen, før de bruges i en beslutning.

## Personoplysninger

- **Databeskyttelsesrådgiver (DPO):** offentlige myndigheder skal have en. Inddrag DPO'en, før en løsning behandler personoplysninger i drift. (GDPR art. 37)
- **Databehandleraftale:** skal være på plads med hver leverandør, der behandler personoplysninger for organisationen, fx hosting, SaaS og AI-tjenester. (GDPR art. 28)
- **Fortegnelse:** organisationens fortegnelse over behandlingsaktiviteter skal opdateres ved en ny behandling. Systemejeren står typisk for det. (GDPR art. 30)
- **Konsekvensanalyse (DPIA):** skal laves før en behandling, der sandsynligvis indebærer høj risiko. Datatilsynets liste nævner blandt andet ny teknologi som AI, profilering, automatiske afgørelser og følsomme oplysninger om sårbare personer. (GDPR art. 35)
- **Brud på persondatasikkerheden:** skal anmeldes til Datatilsynet uden unødig forsinkelse og om muligt inden 72 timer. Sig det straks til brugeren, og følg organisationens procedure. (GDPR art. 33)
- **Testdata:** brug fiktive eller anonymiserede data i udvikling og test. Produktionsdata i test kræver hjemmel, dataminimering, sletning og samme sikkerhed som i drift.

## Leverandører uden for EU/EØS

- Der er ikke fundet en generel dansk regel om, at data skal ligge i EU/EØS. Overførsler til tredjelande reguleres af GDPR kapitel V.
- Fjernadgang eller support fra et land uden for EU/EØS tæller også som en overførsel.
- Til USA kræves, at modtageren er certificeret under EU-US Data Privacy Framework, eller et andet overførselsgrundlag.

## Sager og arkiv

- **Journalisering:** dokumenter, der modtages eller sendes som led i sagsbehandling, skal journaliseres. Hensynet til åbenhed skal indgå, når nye it-løsninger udvikles. (Offentlighedsloven § 15 og § 1, stk. 2)
- **Arkivering:** myndigheder skal bevare elektroniske arkivalier, så de kan afleveres, og må ikke slette data i it-systemer uden bemyndigelse. (Arkivloven § 8)
- Modtager, sender eller danner appen sagsdokumenter som ansøgninger, henvendelser eller afgørelser, skal den kobles til organisationens ESDH- eller fagsystem. Appen må aldrig være den eneste kopi. Inddrag den journal- eller arkivansvarlige.

## AI i løsningen

- Brugere skal oplyses om, at de interagerer med et AI-system, fx en chatbot. En organisation, der selv udvikler og tager et AI-system i brug under eget navn, kan være udbyder efter AI-forordningen. (AI-forordningen art. 50)
- Organisationen skal støtte personalets AI-færdigheder. (Art. 4)
- Nogle offentlige anvendelser er højrisiko, fx vurdering af, om borgere er berettiget til offentlige ydelser. Her gælder skærpede krav og en konsekvensanalyse for grundlæggende rettigheder. Stop, og inddrag jura og ledelse. (Bilag III og art. 27)
- Digitaliseringsstyrelsens guide til offentlige myndigheder om brug af kunstig intelligens beskriver blandt andet, at personoplysninger kun må bruges i vurderede og godkendte værktøjer.

## Roller at inddrage

| Forhold | Typisk rolle |
|---------|--------------|
| Personoplysninger, DPIA, overførsler | Databeskyttelsesrådgiver, jurist, systemejer |
| Aftaler med leverandører | Indkøb, jurist, systemejer |
| Sager, journalisering og arkiv | Journal- eller ESDH-ansvarlig, arkivansvarlig |
| AI i løsningen | Digitaliserings- eller AI-ansvarlig, jurist, ledelse |

## Kilder

- GDPR: https://eur-lex.europa.eu/eli/reg/2016/679/oj
- Datatilsynet om konsekvensanalyse: https://www.datatilsynet.dk/regler-og-vejledning/behandlingssikkerhed/konsekvensanalyse
- Datatilsynet om testdata: https://www.datatilsynet.dk/regler-og-vejledning/behandlingssikkerhed/testdata-anvendelse-af-personoplysninger-ved-udvikling-og-test-af-it-systemer
- Datatilsynet om tredjelandsoverførsler: https://www.datatilsynet.dk/internationalt/tredjelandsoverfoersler
- Datatilsynet om overførsler til USA: https://www.datatilsynet.dk/internationalt/overfoersler-til-usa
- Offentlighedsloven: https://www.retsinformation.dk/eli/lta/2020/145
- Arkivloven: https://www.retsinformation.dk/eli/lta/2016/1201
- AI-forordningen: https://eur-lex.europa.eu/eli/reg/2024/1689/oj
- Digitaliseringsstyrelsens guide om kunstig intelligens: https://digst.dk/kunstig-intelligens/guides-til-brug-af-kunstig-intelligens/guide-offentlige-myndigheder/
