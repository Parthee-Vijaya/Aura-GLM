# Motoropstart: afgrænsede opstartsregistreringer

## Hvorfor

Udgivelsesnoterne til [beta 0.5.0](../releases/aura-1-beta-0.5.0.md) dokumenterer en sporadisk motoropstartsfejl som "bevaret og endnu ikke forklaret". Hidtil har en fejlet opstart ikke efterladt noget spor: ingen sammenhængskorrelation, ingen faseinddeling, ingen exit-koder. Denne ændring giver hver eneste motoropstart en identifikation og en fast faserekkefølge, så den næste sporadiske fejl kan henføres til et præcist stadium uden at gætte.

## Hvad der registreres

Modul `desktop/core/engine-startup.cjs` skriver én post pr. opstartsforsøg til `harness/diagnostics/engine-startup.jsonl` i appens brugerdatamappe. Posten indeholder udelukkende faste felter:

- `startupID` (UUID) og `startedAt` (tidspunkt)
- `mode`, `privacyIsolation`, `sandbox`, `detached` (afrundet til boolske/korte værdier)
- `events`: fast navngivne faser med tidsforskudte millisekund-mål (`find-executable`, `prepare-dirs`, `skills`, `read-guard`, `command-isolation`, `spawn`, `privacy-attestation`, `url`, `health`, `config`, `session`, `plugins`, `ready`)
- `url`: `found`, `timedOut`, `stdoutBytes`, `stderrBytes` (kun antal bytes, aldrig indhold)
- `child`: `pid`, `exitCode`, `signal`, `spawnErrorCode` (kun faste POSIX-værdier; ugyldige værdier afvises)
- `outcome`, `errorName`, `errorCode`, `httpStatus` (`errorCode` er begrænset til faste systemfejlkoder som `ENOENT`, `EACCES`, `ETIMEDOUT`)

## Hvad der aldrig registreres

Der føres ikke projektindhold, stdout/stderr-indhold, filstier, kørbarhedssti, miljøværdier, adgangskoder eller godkendelsesværdier. Ukendte signal- og fejlkoder afvises; ukendte fasenavne omdøbes til den faste værdi `unknown`, så en undertrykkelse ikke kan skjule, at en fase fandt sted. Modulet har ingen renderer-, netværks- eller rapportkanal — posterne forbliver lokale i appens datamappe.

## Afgrænsning af omfang

- Mappen oprettes af appens hovedproces via `install()`; uden installering forbliver registreringen i hukommelsen og skriver intet.
- Filen bevarer højest 200 poster (standard), hvorefter den ældste linje fjernes.
- En opstart der gennemføres og derefter stoppes (f.eks. Stop under den afsluttende kontrol) skriver først `outcome: "ready"` og tilføjer derefter en ny linje med `outcome: "error"`; begge linjer bevarer samme `startupID`. Uændrede gentagelsesfinaliseringer dedupliceres.

## Afprøvning

- `node --test --test-concurrency=1 desktop/tests/engine-startup.test.cjs` — seks prøver: fastfeltkontrakt, afvisning af ukendte værdier, JSONL-persistens med retention, ingen skrivning uden installering, og observerbarhed af en stoppet gennemført opstart.
- Efter ændringen består de eksisterende motortests (52 prøver): `node --test --test-concurrency=1 desktop/tests/engine-start.test.cjs desktop/tests/engine-compaction.test.cjs desktop/tests/engine-opencode2.test.cjs desktop/tests/engine-recovery.test.cjs desktop/tests/engine-version-migration.test.cjs desktop/tests/engine-guardian.test.cjs desktop/tests/conversation-mode.test.cjs`.
- Den samlede hurtige testkørsel (`npm test` i `desktop/`) bevarer 1.909 beståede og 32 sprunget prøver på samme måde som før ændringen; de 16 fejl der sås på afprøvningsmaskinen er miljøbetingede (mangler låst runtime, og Homebrew Node 26 afviger fra den låste Node 22.23.3) og uafhængige af denne ændring.

## Sådan læses en fejl ud

En sporadisk fejl gendannes med:
```bash
tail -n 200 "$HOME/Library/Application Support/Aura 1/harness/diagnostics/engine-startup.jsonl" | jq -c '{startupID,outcome,events: [.events[].phase],errorName,errorCode,child,url}'
```
Den sidste fase i `events` plus `errorCode`/`child` afgør, om fejlen lå i eksekverbart valg, spawn, URL-udlæsning, sundhedstjek, suficienskontrol af indstillinger, pluginindlæsning eller en afbrydelse undervejs. Feltet `mode` sammenholdes med `privacyIsolation` og `sandbox` for at se, om den sporadiske fejl kun rammer bestemte arbejdsformer.

## Grænser

Posten siger hvor og hvornår, men ikke hvorfor. En fyldt post er bevisgrundlag for den næste fejlretning — ikke en forklaring i sig selv. Sammenhold eventuelt `.jsonl` med macOS' proceslog og `docs/contributions/`-karakteriseringerne af opstartslivscyklussen (f.eks. `320a2ae`), som fortsat er gældende.
