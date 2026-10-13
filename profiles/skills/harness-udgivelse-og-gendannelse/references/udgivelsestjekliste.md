# Tjekliste og udgivelsesnote

## Tjekliste før udgivelse

- [ ] Arbejdsmappen er ren, og den udgivne version er et kendt commit.
- [ ] Bygningen er lavet fra den version, ikke fra lokale filer, der ikke er committet.
- [ ] Miljø, tjeneste, region og konto er bekræftet af brugeren.
- [ ] Miljøvariabler og hemmeligheder er sat i tjenesten. Ingen hemmeligheder i koden.
- [ ] Databaseændringer har en sikkerhedskopi og en plan for tilbagerulning.
- [ ] Relevante tests og den vigtigste brugerrejse er afprøvet på denne version.
- [ ] Sikkerhedsgennemgangen er gennemført for ændringer i login, adgang, input og data.
- [ ] Gennemgangens kodeversion, miljø, værktøjer, regelsæt og kontroldato er kendt. Manglende kontroller, mistanker og bekræftede fejl er oplyst hver for sig.
- [ ] Åbne fund har næste handling og ansvarlig rolle. Krævede beslutninger er faktisk truffet; ændrede dataforløb, afhængigheder, agentrettigheder eller miljøer er vurderet på ny, hvor de berører godkendelsen.
- [ ] Dataoversigten er opdateret, og nye dataforløb eller leverandører er vurderet af de rette roller.
- [ ] Offentlige websteder og apps har en opdateret tilgængelighedserklæring i Digitaliseringsstyrelsens WAS-tool.
- [ ] Personoplysninger i drift: databehandleraftaler og fortegnelse er på plads, og en konsekvensanalyse er lavet ved høj risiko.
- [ ] Sagsdokumenter journaliseres og bevares i organisationens ESDH- eller fagsystem.
- [ ] Udgift og ejerskab af kontoen er afklaret.
- [ ] Den forrige version kan udgives igen.
- [ ] Brugeren har godkendt netop denne udgivelse til netop dette miljø.

## Kontrol efter udgivelse

- [ ] Den rigtige adresse svarer over HTTPS.
- [ ] Den vigtigste brugerrejse er gennemført på adressen.
- [ ] En bruger uden adgang afvises.
- [ ] Logs viser ingen nye fejl.

## Udgivelsesnote

```markdown
## <dato> · <miljø>

- Version: <commit-id og kort beskrivelse>
- Adresse: <URL>
- Tjeneste og region: <...>
- Godkendt af: <rolle>, <tidspunkt>. Registreret lokalt af brugeren, ikke verificeret identitet.
- Kontrolleret før udgivelse: <tests, gennemgange>
- Kontrolgrundlag: <kode- og konfigurationsversion, miljø, dato, værktøjsversioner og regelsæt>
- Manglende kontroller: <hvad, hvorfor og næste handling; skriv ingen, hvis alle aftalte kontroller er gennemført>
- Kontrolleret efter udgivelse: <brugerrejse, adgang, logs>
- Dataændringer: <ingen / beskrivelse og backup>
- Vejen tilbage: <forrige version og fremgangsmåde>
- Åbne forhold: <fund-id, bekræftet fejl eller mistanke, konsekvens, næste handling og ansvarlig rolle>
- Beslutninger: <henvisning til faktisk modtagne godkendelser for denne version og dette miljø, også eventuel risikoaccept>
```

Bevar tidligere udgivelsesnoter. Ved en ny version skal det fremgå, hvilke kontroller der er gentaget, og hvorfor eventuel tidligere dokumentation fortsat er relevant. Skabelonen dokumenterer en beslutning; den verificerer ikke identitet eller overholdelse af GDPR.
