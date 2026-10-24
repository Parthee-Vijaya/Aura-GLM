# Aktivér den valgte hovedskill før planlægning og bygning

At installere en designskill sikrer ikke, at modellen læser den. Den aktive og validerede harness-aura-design-kerne indgår nu før første modelkald ved Planlæg, Byg og Arbejd direkte. Samme metode kan bruges i idéhjælpen og i eksport til andre værktøjer.

## Før og efter

| Før | Efter |
|---|---|
| Designskillen kan være tilgængelig som værktøj, men modellen skal selv vælge at åbne den. | Den aktive kerne er allerede indlæst i byggeforløbet. Fravalg, brugerens egen projektskill og de eksisterende godkendelser respekteres. |

## Adfærd og bevaring

- Aktiveringen afhænger af designfunktionen og den effektive projektskill. Almindelig chat får ikke automatisk byggeinstruktionerne.
- Skillindhold valideres og kontrolleres igen omkring motorstart. Ændret eller fravalgt indhold kræver ny gennemgang frem for tavst at skifte instruktioner.
- Eksporterede projektinstruktioner fortæller andre værktøjer, hvilken skill de skal starte med. Pakkerne indeholder fortsat de valgte skills og referencer.
- Dette PR indeholder aktiveringsmekanismen. Selve metoden og webapp-referencen ligger i #23. Uden den skill fungerer appen fortsat uden automatisk indlæsning.

## Test

11/11 fokuserede prøver består. Seks yderligere forløb kører rigtig Workbench → OpenCode 1.18.33 → adapter → lokal HTTP-modtager med Mistral-/Corti-protokoller, til-/fravalg og CLI. Den første forespørgsel kontrolleres for den nøjagtige skilltekst.

Prøverne er kørt lokalt på macOS Apple Silicon med Node 22.23.3 og appens låste afhængigheder. De er ikke en påstand om grøn GitHub CI.

Originalens uændrede main har 514/516 beståede desktoptests. To eksisterende fixtures i `approvals.test.cjs` (linje 47 og 74) fejler også uden dette PR. Den isolerede branches fulde testlog er vedlagt; disse to fejl er ikke skjult eller sprunget over.

```sh
node --test desktop/tests/build-design.test.cjs desktop/tests/features.test.cjs
node desktop/scripts/verify-primary-build-skill.cjs
# Hele desktop-pakken:
cd desktop && node --test --test-concurrency=1 tests/*.test.cjs
```

Evidens: [focused.tap](focused.tap), [full.tap](full.tap), [native.json](native.json). Den samme transportprøve er også kørt med den fulde skill fra #23 i samlingsversionen: [native-integrated.json](native-integrated.json).

## Integration

Den lokale samlingsprøve med de tidligere 24 bidrag, de ti opdateringer og disse syv nye bidrag består **746/746 desktoptests og 27/27 CLI-tests**. Den bruger forkens integrerede grundlag; fælles filer er flettet med bevarede bindinger, og alle 23 skill-eksporter er genbygget. Det er ikke en påstand om konfliktfri automatisk merge eller grøn hosted CI. [Manifest](integration.json), [desktoplog](integration-desktop.tap) og [CLI-log](integration-cli.tap).

Integrér indholds-PR #23 først. Efter kombinationen skal `node scripts/build-packages.cjs` køres og de 23 opdaterede arkiver samt katalog/site kontrolleres ind i integrationscommitten. F08 (#36) skal også registrere hovedskillen i den gennemgåede appkontekst. Samlingsprøven omfatter begge dele.

Originalt sammenligningspunkt: `dce68ea74a199ca214ab535a16ff22765d8ee8de`. Funktionerne er udskilt fra den godkendte fork-implementering `fa223d3b2ceb6f27e5fecf4c13f590913801036c`; originalens navn, runtimeversion og øvrige produktfunktioner bevares.

## Afgrænsning

Transportprøven bruger kontrollerede lokale svar. Den beviser instruktionernes tilstedeværelse og fravalg, ikke at alle Mistral- eller Corti-modeller leverer samme visuelle kvalitet. Modellen får ingen ekstra fil-, værktøjs- eller datatilladelse.
