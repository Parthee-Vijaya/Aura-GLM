# CVR i detaljer

Oplysningerne er kontrolleret 30. september 2026. Erhvervsstyrelsen er dataansvarlig for CVR.

## Datafordeleren

- **Tjenester:** GraphQL CVR v2, CVR/custom v1 og totaldownload i JSON eller CSV. CVR/custom v1 giver CVRPersonBegraenset, altså persondata uden CPR.
- **Adgang:** kun CVRPerson kræver ansøgning, og så også MitID Erhverv, OAuth og en IP-adresse på en godkendt liste.
- **Uafklaret:** Datafordelerens oversigt fra februar 2026 kræver MitID Erhverv, ansøgning og en godkendt IP-adresse for al CVR. CVR-siderne fra maj 2026 siger, at kun CVRPerson er begrænset. Kontrollér ved oprettelsen, hvad brugeren får adgang til.
- **Aktualitet:** Ifølge Erhvervsstyrelsen kommer data "med en vis forsinkelse".
- **Nøgle og opslag:** Brugeren opretter selv en API-nøgle som beskrevet i Datafordelerens vejledning. Nøglen bruges kun fra en server.

## Erhvervsstyrelsens system-til-system-adgang

- Elasticsearch 6.8 på `distribution.virk.dk/cvr-permanent`, med næsten realtidsdata og fuld historik.
- Gratis og åben for både virksomheder og privatpersoner.
- Adgang søges via en blanket, og behandlingen tager normalt tre uger.
- Adgangen bruger brugernavn og adgangskode (HTTP Basic), som kun må bruges fra en server.
- Vilkårene er "Vilkår for brug af danske offentlige data": data er gratis, må bruges kommercielt og leveres uden garanti.
- Erhvervsstyrelsens CVR-webservices er en anden vej og kræver OCES3-certifikat, MitID Erhverv og underskrevne dokumenter.

## Regler

- **Ingen automatisk læsning:** CVR-bekendtgørelsen § 17 forbyder at crawle cvr.dk eller bruge andre metoder til automatisk indeksering og opslag.
- **Reklamebeskyttelse:**
  - Private må ikke bruge grunddata om reklamebeskyttede enheder til direkte markedsføring.
  - Den, der videregiver kontaktoplysninger om en beskyttet enhed, skal tydeligt markere beskyttelsen.
  - Overtrædelse straffes med bøde efter CVR-loven §§ 19 og 22.
- **Persondata:**
  - CPR-numre må ikke videregives til private.
  - Navne på fuldt ansvarlige deltagere, ejere og ledelse offentliggøres.
  - Privatadresser offentliggøres, til der er gået fem år efter ophør, men ikke hvis personen har navne- og adressebeskyttelse i CPR.
  - En virksomhedsadresse kan aldrig være hemmelig.
- **Reelle ejere:** Oplysninger om reelle ejere må kun gives til dem, der har ret til dem. Uberettiget offentliggørelse straffes efter CVR-loven §§ 18, 18 a og 22.
- **Myndigheder:** CVR-loven § 15 kræver, at nye offentlige it-systemer slår oplysninger op i CVR i stedet for at spørge virksomheden. Myndigheder, der videregiver CVR-data, skal overholde forbuddet mod CPR, reglerne om reelle ejere og markeringen af reklamebeskyttelse (§ 18, stk. 9).
- **Logning:** Datatilsynet forventer, at læsning, søgning og udtræk af personoplysninger logges ud fra en risikovurdering, senest når løsningen tages i brug.

## Kilder

- System-til-system-adgang: https://datacvr.virk.dk/artikel/system-til-system-adgang-til-cvr-data
- Priser og levering: https://datacvr.virk.dk/artikel/priser-og-levering
- CVR på Datafordeleren, 13. maj 2026: https://datafordeler.dk/vejledning/brugeradgang/anmodning-om-adgang/det-centrale-virksomhedsregister-cvr/
- Erhvervsstyrelsen om Datafordeleren: https://datacvr.virk.dk/artikel/datafordeleren
- CVR-webservices: https://datacvr.virk.dk/artikel/cvr-webservices
- CVR-loven, LBK nr. 246 af 5. februar 2026: https://www.retsinformation.dk/eli/lta/2026/246
- CVR-bekendtgørelsen: https://www.retsinformation.dk/eli/lta/2022/1243
- Reklamebeskyttelse: https://datacvr.virk.dk/artikel/reklamebeskyttelse
- Adressebeskyttelse: https://datacvr.virk.dk/artikel/adressebeskyttelse
- Vilkår for brug af danske offentlige data: https://assets.eu.ctfassets.net/i6cea2ilpb83/6m9zr6aCNR3Bou4FEluutV/fe0b60f32ab7b40e7bc0260265864280/vilkaar_for_brug_af_danske_offentlige_data_v4.pdf
- Datatilsynet om logning, 20. oktober 2025: https://www.datatilsynet.dk/regler-og-vejledning/behandlingssikkerhed/katalog-over-foranstaltninger/logning-af-brugernes-anvendelser-af-personoplysninger
