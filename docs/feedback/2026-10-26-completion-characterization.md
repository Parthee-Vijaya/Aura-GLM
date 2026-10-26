# Karakterisering før videre ændring af opgavestyringen

256 seedede forløb fastlåser den eksisterende adfærd ved afslutning, Stop og lukning. Otte forskellige situationer køres med hver 32 reproducerbare rækkefølger. En fejl viser både seed og hændelsesrækkefølge; prøven skjuler ingen fejl med genforsøg.

Den faktiske Workbench og ChatSession bruger syntetiske filer, checkpoints og historik på disk. Kun motoren er kontrolleret og allerede tilsluttet. Testfælder afviser netværk, serveråbning, processtart og en ny motor. Prøverne kontrollerer én afslutning, én frigivelse af projektet, én terminal historikskrivning, bevarede planvirkninger og ingen genafsendelse eller sene godkendelser. De dækker også en afslutningshændelse før afsendelsens kvittering og et spørgsmålssvar, som først kvitteres efter Stop.

Den særskilte prøve består med 256/256 på Node 22.23.3. Den første kørsel havde fejl i den nye tests forventning til afvisningstekst: en lukket motor og en tilbagekaldt godkendelse med motoren åben giver forskellige, eksisterende svar. Forventningen er rettet uden produktændring. Begge kørsler bevares under `ReleaseReports/lifecycle-characterization-20261026/`.

Dette er karakterisering før refaktorering, ikke en ny tilstandsmaskine, 10.000 modelbaserede sekvenser eller en rigtig AI-prøve. Opstart, kvalitetsrettelse, arkivering og native isolation dækkes fortsat af deres særskilte prøver.

## Den sporadiske native startfejl

To samlede kørsler har tidligere vist en sporadisk fejl ved første native motorafsendelse. Den sikre produktgrænse erstatter den underliggende fejl med en Privacy Gate-fejl, så årsagen var ikke synlig. Testen registrerer nu den oprindelige exception og begrænset motortilstand ved fejl. Den logger aldrig metodeargumenter, credentials, headers eller modelindhold. Almindelige kørsler bruger den oprindelige promise og observerer ingen vellykkede transportkald; detaljeret transportmetadata kræver det eksisterende, eksplicitte traceflag.

Fem efterfølgende komplette native produktkørsler bestod med 95/95 cases og ingen skips. Det beviser ikke, at årsagen er rettet. Rapporter og den endelige diagnostikafgrænsning bevares i `ReleaseReports/package-beta-0.5.0-20261026/startup-failure-diagnostics/`. Fejlen skal fortsat stå som uafklaret, indtil en konkret årsag er observeret og efterprøvet.

Ingen produktkode, UI, planer, tilladelsesregler, modelvalg eller genforsøg ændres af disse tests. Ingen GitHub Actions eller betalte modelkørsler startes.
