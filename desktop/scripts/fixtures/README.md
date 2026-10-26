# Historiske prøvefiler

`design-foundation-legacy.cjs` bevarer det udgåede forsøg med faste paletter og en madapp-opskrift. Det er ikke aktiv produktkode og sendes ikke til modellerne. `verify-design-foundation.cjs` kan fortsat genskabe det tidligere layoutforsøg; resultatet er ikke bevis for Auras nuværende designmetode eller et modelsvar.

Den aktive vej er de eksisterende design-skills, hvor den valgte model udarbejder designet ud fra opgaven, brugerens valg og dokumenterede brandkilder.

## Fælles kontrolleret modelserver

`fake-provider.cjs` giver deterministiske modelrespons til lokale tests. Det er en rigtig HTTP-server på `127.0.0.1` med en tildelt port. Den kontakter ingen ekstern model, læser ingen credentials og skriver ingen logs eller optagelser til disk. Alle opgaver, svar og værktøjsargumenter skal være syntetiske; `synthetic: true` er en udtrykkelig erklæring fra prøven, ikke automatisk dataklassifikation.

```js
const { startFakeProvider } = require('./fake-provider.cjs');
const provider = await startFakeProvider({
  synthetic: true,
  model: 'fixture-model',
  script: [
    { status: 429, retryAfter: '0' },
    { protocol: 'chat', chunks: ['Et syntetisk ', 'svar.'] }
  ]
});
try {
  // Brug provider.url, provider.model og provider.key i en isoleret prøve.
  // provider.requests viser kopier af de syntetiske forespørgsler i hukommelsen.
} finally {
  await provider.close();
}
```

Hvert accepteret modelkald bruger præcis ét trin fra `script`. Et udtømt script afvises; serveren opfinder ikke et ekstra svar eller skifter model. Ukendt rute, fremmed Host, andet modelnavn og andre nøgler end den faste syntetiske prøvenøgle afvises. Request-observationen indeholder ikke auth-headere. Serveren kan ikke bruges som proxy eller til at optage eksterne samtaler.

| Valg | Betydning |
|---|---|
| `protocol` | `chat`, `responses` eller `anthropic`; kan kontrollere den forventede rute for trinnet. |
| `text` / `chunks` | Tekstsvar eller flere tekstdeltaer. `stream: true` i forespørgslen vælger SSE; ellers JSON. |
| `toolCalls` | Syntetiske `{ id, name, arguments }`, hvor `arguments` er en JSON-streng. Ingen værktøjer udføres. |
| `status`, `errorCode`, `retryAfter` | HTTP-fejl, eksempelvis 429, 503 eller 413. Standardkoden ved 413 er `context_length_exceeded`; den kan også kombineres med HTTP 400. |
| `delayMs` | Pause inden svarheadere, højst 60 sekunder. |
| `pauseAfterContentMs` | Pause efter streamindhold og før afslutning, højst 60 sekunder. |
| `abort` | `before-headers`, `before-content` eller `after-content`. Før-indhold-varianten sender kun en kommentar/heartbeat. |
| `abortDelayMs` | Kort ventetid før forbindelsen brydes; standard 10 ms. |

`close()` lukker forbindelser og afbryder egne ventetider. Gentagne kald returnerer samme afslutning. Script og requeststørrelse har faste grænser. Testen skal stadig lukke sin egen Aura-gateway og motor.

`desktop/tests/fake-provider.test.cjs` afprøver formater og fejl gennem rigtig localhost-HTTP og den eksisterende Aura-gateway. Den første migration er `desktop/tests/gateway-recovery.test.cjs`. De øvrige særskilte verify-servere er ikke migreret. Audit fandt 45 verify-scripts med `createServer`; de er ikke alle klassificeret som modelservere.

Prøveserveren er ikke en virkelig model, ingen kvalitetsmåling af genererede apps og ingen erstatning for kontraktprøver med den versionslåste OpenCode-motor. Gatewayens injicerede 413 demonstrerer afvisning uden transportgenforsøg. Den særskilte native prøve nedenfor viser, at OpenCode 2.1.4 derudover selv kan komprimere og fortsætte ved netop denne kontrollerede kontekstfejl.

## Observeret kontrakt fra OpenCode 2.1.4

`opencode-2.1.4-observed.json` er observeret fra den rigtige, låste motor på macOS/Apple Silicon. Modelserverens svar er syntetiske; motorens HTTP-svar og SSE-hændelser er reelle. `opencode-contract.cjs` genafspiller hændelserne gennem Auras eksisterende V2-adapter. Standardtesten `desktop/tests/opencode-contract.test.cjs` starter hverken motor eller model.

Prøven dækker tre forløb:

- Én konkret godkendelse af skrivning til `result.txt`, ét udført værktøj og ét afsluttende svar. HTTP-historik og SSE bruger samme værktøjsidentitet.
- HTTP 413 med `context_length_exceeded`, et gyldigt sammendrag og fortsættelse. Motoren udfører tre modelkald med samme model og gemmer kun én brugerbesked. Der er ingen gentagen prompt-afsendelse fra Aura.
- SIGKILL af netop prøvens OpenCode-underproces, efter at tekst er begyndt at strømme. Aura bevarer den observerede deltekst og melder motorfejl. Der fremkommer ingen succes og intet ekstra modelkald.

Det sidste er karakterisering af en fejl, **ikke automatisk genoptagelse efter crash**. Prøven dækker heller ikke alle udbyderes fejlformater, tidligere udførte værktøjer før kontekstafvisning, rigtig AI, Windows eller Linux.

Native genoptagelse af prøven kræver det eksisterende opt-in og den klargjorte runtime:

```sh
AURA_ENGINE_NATIVE=1 node --test desktop/tests/opencode-contract-native.test.cjs
AURA_ENGINE_NATIVE=1 node desktop/scripts/fixtures/record-opencode-contract.cjs
```

Den sidste kommando skriver kun den sanitiserede observation til standardoutput. Gem udskriften uden for Git, gennemgå den, og opdatér derefter den versionsmærkede fixture bevidst. Den eksisterende fixturetest fejler ved en ændret runtimeversion, indtil der findes en ny observeret kontrakt. Nativeprøven opretter og bevarer sin egen syntetiske mappe; ingen eksisterende profil åbnes.

Optageren har fast opgave, model og indhold og bruger kun localhost. Den optager parsede HTTP-JSON-svar og SSE-`data`, ikke rå headere eller byteinddeling. Konfigurations-/plugin-endpoints optages ikke. Credentials, maskinstier, porte, sessions-/besked-id'er, tidsstempler og pagineringsmarkører erstattes deterministisk. Der er ingen optagelse eller genafspilning af eksterne brugersamtaler. Den fælles modelserver erstatter fortsat ikke en native kontraktprøve.

## Native filbeskyttelse og almindelige godkendelser

`native-protected-tools.cjs` og `desktop/tests/protected-tools-native.test.cjs` afprøver 32 faste scenarier mod den faktiske versionslåste motor. Alle modeloutput og filer er syntetiske. Prøven bruger den fælles lokale modelserver; identifikatoren `gpt-synthetic-contract` vælger motorens native `patch`-værktøj uden at kontakte GPT eller nogen anden ekstern model.

```sh
AURA_ENGINE_NATIVE=1 node --test desktop/tests/protected-tools-native.test.cjs
```

Prøven bekræfter, at beskyttede write/edit/patch-handlinger afvises før godkendelse og diff-klargøring, også med store bogstaver og indrykkede patchheaders. Begge stier i en flytning kontrolleres. Almindelige write/edit/patch-handlinger skal fortsat kræve præcis én godkendelse og udføres korrekt bagefter. Den præcise valgte reference må læses, men må ikke skrives; en ikke-valgt reference afvises. Lovlige heredoc-indpakninger, CRLF og første `Environment ID`-linje har særskilte kompatibilitetsprøver.

Patch-sletning og patch-flytning af et symbolsk link afvises konservativt. Native prøver kontrollerer, at der hverken vises godkendelse, fjernes et link eller ændres på originalfilen bag linket. Det gælder også, når to `End of File`-markører står mellem Update og Move, hvilket motorens parser tillader. En almindelig filflytning med de samme markører skal stadig fungere efter godkendelse. Dermed kan en kanoniseret filsti ikke ændre sletning af et link til sletning af originalen.

Selv hvis beskyttelsen regresserer, afviser prøven enhver godkendelse til beskyttede filer. Kun foruddefinerede positive scenarier under deres egne `public/`-mapper kan godkendes. Den åbner ingen eksisterende projektmapper. Efter hver prøve lukkes motor og modelserver; den præcise nyoprettede syntetiske mappe fjernes først, når guardianprocessen er afsluttet, og `lsof` bekræfter, at ingen proces holder mappen åben. Kilde-fixtures og rapporter bevares. Standardtesten skipper nativekørslen med en eksplicit begrundelse.
