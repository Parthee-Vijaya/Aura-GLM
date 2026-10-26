# Bekræftet fjernelse af AI-forbindelser

26. oktober 2026. Implementeret efter brugerens godkendelse af feedbackprototypen.

Et klik på **Fjern forbindelse** åbner nu en konkret gennemgang. Den nævner forbindelsen, at dens gemte adgangsoplysninger fjernes fra Aura 1, og at projekter og samtaler bevares. En nøgle tilbagekaldes ikke hos udbyderen. En tidligere komplai-OAuth-forbindelse får i stedet den relevante forklaring om tilbagekaldelse af loginadgangen.

**Annuller** har fokus fra begyndelsen. Enter med dette fokus, Escape, Annuller og et faktisk klik uden for bekræftelsen afbryder uden fjernelse. Tom plads inde i dialogen er ikke et klik udenfor. Under den igangsatte fjernelse er knapperne låst, så der ikke opstår tvivl om, hvorvidt handlingen allerede er gennemført.

Fjernelsen bruger det konkrete id fra gennemgangen. Den afviser et ændret forbindelsesvalg, ændret indhold, lukket forbindelsesoversigt eller ændret navigation. Et dobbeltklik kalder ikke hovedprocessens fjernelse igen. Hovedprocessens eksisterende afvisning af forbindelser i brug er bevaret. En fejl giver et synligt resultat og kræver et nyt klik; der er ingen automatisk gentagelse.

Kun dialogen **Hjælp og feedback** får en ny binding til at lukke ved klik udenfor. Kommandopaletten og infoboblerne havde allerede denne mulighed. Forbindelsesformularer, nøglefelter, datadeling, planer og værktøjsgodkendelser får ingen generel luk-binding. En kladde i forbindelsesformularen bevares, når man klikker udenfor.

## Afprøvning

- **9/9 enhedstests** af det faktiske UI-modul med en kontrolleret DOM: fokus, tekster, fravær af nøgleindhold, Annuller, Escape, backdrop, ændret valg, dobbeltklik, gentagen åbning, fejl og den afgrænsede luk-binding.
- **17/17 native kontroller** i den rigtige Electron-app på macOS arm64 med to nøglefri syntetiske forbindelser og en separat testprofil. Testen bruger den rigtige hovedproces, IPC og lokale lagring. Den kontrollerer, at første klik ikke fjerner, og at den bekræftede dobbelte kliksekvens kun når backend én gang med det oprindelige id. Den anden forbindelse, chatkladden og projektfilen bevares.
- Ingen model, udbyder, nøglering eller ekstern netværkstjeneste bruges. Git-skrivninger er eksplicit afvist i nativeprøven. Ingen rendererfejl blev registreret.
- Windows-nativeafprøvning mangler; en macOS-prøve må ikke beskrives som en Windows-prøve.

Rapporter og visuelt gennemgåede skærmbilleder ligger i `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/connections/`. Prøvens kilde er `desktop/scripts/verify-connection-removal-feedback.cjs`. Testprofiler og syntetisk projektkode er bevaret; testappen er lukket.
