# Genoptag agentens eksisterende session efter forbindelsesbrud

Et brud på agentens hændelsesstrøm skal ikke starte opgaven eller værktøjerne forfra. Aura forbinder nu til samme session igen og genindlæser dens aktuelle beskeder, spørgsmål, godkendelser og status.

## Før og efter

| Før | Efter |
|---|---|
| Et tabt hændelseskald kan blive vist som en afbrudt opgave, selv om agenten fortsat arbejder. | Hændelsesstrømmen genforbindes med afgrænsede forsøg. Autoritativ sessionstilstand genopretter visningen uden at sende brugerens prompt igen. |

## Adfærd og bevaring

- Beskeder indlæses som snapshots efter et brud, så genleverede tekststykker ikke fordobles. Aktuel prompt og komprimering har separate bindinger.
- Hvis kvitteringen for en prompt mistes, kontrolleres dens entydige ID. Prompten POSTes ikke igen i tvivlstilfældet.
- Gamle spørgsmål, besvarede godkendelser og sene afslutninger kan ikke genaktivere eller afslutte en senere opgave.
- Stop og lukning afbryder genforbindelse; et endeligt udfald bevarer den valgte plan og beskriver, at resultatet skal gennemgås.

## Test

16/16 fokuserede prøver består: genforbindelse, snapshots, dubletter, gammel afslutning, spørgsmål/godkendelser, Stop under opstart, komprimering og tabt promptkvittering.

Prøverne er kørt lokalt på macOS Apple Silicon med Node 22.23.3 og appens låste afhængigheder. De er ikke en påstand om grøn GitHub CI.

Originalens uændrede main har 514/516 beståede desktoptests. To eksisterende fixtures i `approvals.test.cjs` (linje 47 og 74) fejler også uden dette PR. Den isolerede branches fulde testlog er vedlagt; disse to fejl er ikke skjult eller sprunget over.

```sh
node --test desktop/tests/engine-recovery.test.cjs desktop/tests/engine-compaction.test.cjs desktop/tests/recovery-state.test.cjs
# Hele desktop-pakken:
cd desktop && node --test --test-concurrency=1 tests/*.test.cjs
```

Evidens: [focused.tap](focused.tap), [full.tap](full.tap).

## Integration

Den lokale samlingsprøve med de tidligere 24 bidrag, de ti opdateringer og disse syv nye bidrag består **746/746 desktoptests og 27/27 CLI-tests**. Den bruger forkens integrerede grundlag; fælles filer er flettet med bevarede bindinger, og alle 23 skill-eksporter er genbygget. Det er ikke en påstand om konfliktfri automatisk merge eller grøn hosted CI. [Manifest](integration.json), [desktoplog](integration-desktop.tap) og [CLI-log](integration-cli.tap).

Integrér efter R01 (#19) og R02 (#20), og bevar R05 (#31) ved ændringer i engine.cjs. Genforsøg mod selve modeludbyderen er et andet PR; den fælles recovery-visning må kun tilføjes én gang.

Originalt sammenligningspunkt: `dce68ea74a199ca214ab535a16ff22765d8ee8de`. Funktionerne er udskilt fra den godkendte fork-implementering `fa223d3b2ceb6f27e5fecf4c13f590913801036c`; originalens navn, runtimeversion og øvrige produktfunktioner bevares.

## Afgrænsning

Genopretter forbindelsen til en levende agentserver. Det er ikke en genstart af en død proces, og der genafspilles ikke tvetydige værktøjshandlinger. En uafklaret prompt stopper med fejl frem for at blive sendt igen.
