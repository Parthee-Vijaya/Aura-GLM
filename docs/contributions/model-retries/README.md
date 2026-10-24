# Genforsøg langsomme modelkald uden at gentage leverede handlinger

Et langsomt svar eller en midlertidig 429/503 kunne afslutte opgaven, selv om den samme forespørgsel kunne gennemføres. Gatewayen får nu afgrænsede genforsøg og ekstra ventetid på den eksisterende forbindelse. En allerede leveret tekst- eller værktøjsstrøm genafspilles aldrig.

## Før og efter

| Før | Efter |
|---|---|
| Et midlertidigt udfald afslutter modelkaldet; et nyt manuelt forsøg kan gentage arbejde. | Samme model, destination og uændrede forespørgsel forsøges højst tre gange, men kun før modelindhold er leveret. Et endeligt udfald bevarer den valgte plan. |

## Adfærd og bevaring

- 120 sekunders inaktivitet efterfølges af 180 sekunders ekstra ventetid på samme kald. En samlet grænse på 20 minutter omfatter både ventetid og genforsøg.
- 408, 429, 500, 502, 503 og 504 kan forsøges igen. Retry-After respekteres op til 60 sekunder; login-, adgangs- og konfigurationsfejl gentages ikke.
- SSE-heartbeats tæller ikke som modelindhold. En afbrudt strøm efter leveret indhold giver en fejl frem for et nyt modelkald. Stop afbryder også ventetiden mellem forsøg.
- Der skiftes ikke udbyder eller model. Genoptagelse af agentens hændelsesforbindelse er et særskilt bidrag.

## Test

34/34 fokuserede HTTP-/protokolprøver består. De afprøver identiske payloads, timeout, 429/503, Retry-After, Stop, delvise tool-calls, afbrudt EOF og låsning efter udtømte forsøg.

Prøverne er kørt lokalt på macOS Apple Silicon med Node 22.23.3 og appens låste afhængigheder. De er ikke en påstand om grøn GitHub CI.

Originalens uændrede main har 514/516 beståede desktoptests. To eksisterende fixtures i `approvals.test.cjs` (linje 47 og 74) fejler også uden dette PR. Den isolerede branches fulde testlog er vedlagt; disse to fejl er ikke skjult eller sprunget over.

```sh
node --test desktop/tests/transport-retry.test.cjs desktop/tests/providers.test.cjs desktop/tests/openai-azure.test.cjs desktop/tests/recovery-state.test.cjs
# Hele desktop-pakken:
cd desktop && node --test --test-concurrency=1 tests/*.test.cjs
```

Evidens: [focused.tap](focused.tap), [full.tap](full.tap).

## Integration

Den lokale samlingsprøve med de tidligere 24 bidrag, de ti opdateringer og disse syv nye bidrag består **746/746 desktoptests og 27/27 CLI-tests**. Den bruger forkens integrerede grundlag; fælles filer er flettet med bevarede bindinger, og alle 23 skill-eksporter er genbygget. Det er ikke en påstand om konfliktfri automatisk merge eller grøn hosted CI. [Manifest](integration.json), [desktoplog](integration-desktop.tap) og [CLI-log](integration-cli.tap).

Berører samme gateway og chatlivscyklus som R02 (#20), F08 (#36) og bidraget om sessionsgenoptagelse. Bevar deres bindinger og fælles recovery-håndtering ved integration.

Originalt sammenligningspunkt: `dce68ea74a199ca214ab535a16ff22765d8ee8de`. Funktionerne er udskilt fra den godkendte fork-implementering `fa223d3b2ceb6f27e5fecf4c13f590913801036c`; originalens navn, runtimeversion og øvrige produktfunktioner bevares.

## Afgrænsning

Dette forhindrer klienten i at genafspille leverede værktøjskald. Det lover ikke, at en udbyder ikke har beregnet eller faktureret et kald, hvis svaret aldrig nåede klienten. Lange kvotestop og strømbrud efter leveret indhold kræver stadig gennemgang.
