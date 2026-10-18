# Sikkerhedskontrol på GitHub

## Konfiguration

Dependabot styres af [`.github/dependabot.yml`](../.github/dependabot.yml). GitHub læser filen, når den ligger på `main`:

- Desktopafhængigheder og GitHub Actions kontrolleres ugentligt. Rettelser og mindre versionsskift samles i hver sin PR. Større versionsskift får særskilte PR'er.
- Terminalens `opencode-*`-pakker samles på tværs af platforme, også ved større versionsskift. De udgør samme motor og skal have samme version.
- Sikkerhedsrettelser har separate grupper for desktop, terminal og Actions. De følger GitHubs sikkerhedsopdateringer, ikke den ugentlige plan, og begrænses ikke til mindre versionsskift.
- Ingen opdatering flettes automatisk. En opdaterings-PR udgiver heller ikke appen eller hjemmesiden.

CodeQLs ønskede standardopsætning ligger i [`.github/codeql-default-setup.json`](../.github/codeql-default-setup.json). Den dækker JavaScript/TypeScript, Python og GitHub Actions og bevarer den eksisterende standardpakke af analyser, trusselsmodel og almindelige GitHub-runner. **GitHub indlæser ikke denne JSON-fil automatisk.** Den er grundlaget for den særskilt godkendte API-ændring nedenfor.

## Aktivering og godkendelse

Repositoryets bygge- og udgivelsesworkflows har fortsat kun manuel start. CodeQLs standardopsætning og Dependabot har deres egne automatiske kørsler hos GitHub. Brugeren godkendte 18. oktober 2026 en udtrykkelig undtagelse for disse sikkerhedskontroller, inklusive den indledende CodeQL-analyse og analyser efter PR-fletning. Godkendelsen omfatter ikke automatisk fletning, appbygning eller udgivelse. En ændring af CodeQLs sprog starter også en indledende analyse.

Kontrollér den aktuelle opsætning før ændringen:

```sh
gh api repos/ai-alliancen-org/ai-harness/code-scanning/default-setup
```

Efter godkendelse af sikkerhedsautomatikken og den indledende analyse kan den gennemgåede konfiguration anvendes fra repositoryets rod:

```sh
gh api --method PATCH repos/ai-alliancen-org/ai-harness/code-scanning/default-setup --input .github/codeql-default-setup.json
```

Kontrollér derefter svarets kørsel og læs opsætningen igen. En accepteret konfiguration dokumenterer ikke, at analysen er gennemført. Den nye JavaScript-analyse skal være afsluttet på den tilsigtede commit, og dens dækning og fejl skal gennemgås. Bevar de eksisterende sikkerhedsalarmer under ændringen.

Dependabot bliver først aktiv med de nye grupper, når brugeren har gennemgået, committet og pushet konfigurationen til `main`. Kontrollér GitHubs Dependabot-log og de faktisk oprettede PR'er; en lokal YAML-kontrol kan ikke erstatte dette.

## Gennemgang af opdateringer

Kontrollér ændringer i både manifest og låsefil. Kør relevante lokale tests og prøv den berørte funktion, før en opdatering flettes. Nye Electron- eller pakkebygger-versioner skal også prøves med den relevante installationspakke efter repositoryets udgivelsesvejledning.

Dependabot vedligeholder ikke `desktop/runtime-lock.json` eller motorversionen i `desktop/core/engine.cjs`. Ved ændring af OpenCode skal terminalens otte platformspakker fortsat stemme med desktopmotorens versionsnummer, downloadadresser og kontrolsummer. En gruppe kan stadig indeholde kun nogle af platformene, hvis kun disse har en tilgængelig opdatering eller sikkerhedsrettelse. Node og Git i runtimefilen skal også vedligeholdes særskilt. En grøn Dependabot-PR dokumenterer ikke denne sammenhæng.

## Observeret udgangspunkt, 18. oktober 2026

Ved læsende kontrol var Dependabot-alarmer, automatiske sikkerhedsrettelser, hemmelighedsscanning, push-beskyttelse og privat sårbarhedsrapportering allerede slået til. CodeQLs standardopsætning dækkede kun Actions og Python. Der var to åbne Dependabot-alarmer og to ældre JavaScript-alarmer fra CodeQL. Konfigurationen her er ikke en rettelse eller afvisning af disse fund.

## Aktiveret og observeret, 18. oktober 2026

CodeQL er udvidet med JavaScript/TypeScript. Både [opsætningskørslen](https://github.com/ai-alliancen-org/ai-harness/actions/runs/39152165707) på `4d2caa9` og [den automatiske analyse efter PR #5](https://github.com/ai-alliancen-org/ai-harness/actions/runs/39152400655) på `aa6714a` er afsluttet uden kørselsfejl. Alle tre sproganalyser er afleveret på den flettede commit uden analysefejl eller advarsler.

JavaScript-analysen genfinder de to eksisterende fund i `desktop/tests/pages.test.cjs` og `desktop/scripts/verify-history.cjs`; det bekræfter, at repositoryets CommonJS-filer indgår. Actions og Python har ingen fund i disse analyser. De to Dependabot-alarmer for `http-cache-semantics` og `sprintf-js` står fortsat åbne; GitHub angav ingen rettet version ved kontrollen.

Dependabot-konfigurationen er valideret mod skemaet og de faktiske manifester og låsefiler. Grupperingen er endnu ikke observeret på GitHub, da konfigurationen fortsat ligger som en lokal ændring. Alle fire versionerede bygge- og udgivelsesworkflows er kontrolleret og har kun manuel start.

## Kilder

- [GitHub: Dependabots konfiguration](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)
- [GitHub: sikkerhedsopdateringer](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates)
- [GitHub: ændring af CodeQLs standardopsætning](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/manage-your-configuration/edit-default-setup)
- [GitHub: API til CodeQLs standardopsætning](https://docs.github.com/en/rest/code-scanning/code-scanning#update-a-code-scanning-default-setup-configuration)
- [GitHub: Dependabots egne Actions-kørsler](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-on-actions)
