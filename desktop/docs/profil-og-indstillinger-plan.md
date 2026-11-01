# Profil og Indstillinger · Implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Én brugerprofil (navn, ikon, standard-AI, arbejdsmåde, udseende, projektstandarder, hjælpeniveau) der udfyldes venligt første gang og derefter ændres i én samlet Indstillingsdialog — og aldrig spørges igen.

**Architecture:** Ny top-nøgle `profile` i settings.json ejet af `core/profile.cjs` (main-process, atomare skrivninger via `store.update`). Migration er renderer-initieret felt-for-felt med markør. Settings-dialogen er ét nyt `<dialog>` med sektioner; de fire eksisterende dialoger består og åbnes sekventielt. Copy-key er en `copyKeyFrom`-udvidelse af `connections:save`, håndhævet main-side.

**Tech Stack:** Electron (main + sandboxed renderer), ren DOM/CSS med aura-tokens.css, node:test.

**Spec:** `desktop/docs/profil-og-indstillinger-design.md` (rev. 2 — læses sammen med planen).

## Global Constraints

- Tests kører med bundlen Node: `export PATH="$PWD/.runtime/darwin-arm64/node/bin:$PATH"` fra `desktop/`.
- Hver task slutter med fuld suite grøn: `node --test --test-concurrency=1 tests/*.test.cjs` (2.030 tests, 34 Windows-skips) — og commit på branch `work/aura-prime-profil-20261101`.
- Alle UI-strenge er dansk. WCAG-AA kontrakt gælder. Ikoner/data-attributter følger aura-tokens.
- API-nøgler når aldrig hoved-rendereren; `profile.name` og `profile.icon` går aldrig til prompts, modellog, diagnostik eller feedbackrapporter.
- IPC registreres via `handle(channel, action)` i `main.cjs` og mappes i `preload.cjs` (`api.<navn>(value)`).
- `ui/*.js`-filer tilføjet til manifestet i `core/ui-assets.cjs` i samme task som filen oprettes.

## Review Focus

1. **Opgraderende bruger** med udfyldt localStorage men tom profil: migration må ikke miste tema, panel eller foretrukken forbindelse — test i Task 1 (migrate med alle tre) og Task 7 (localStorage-nøgler slettes først efter bekræftet lagring).
2. **"Vælg senere" i profil-trinnet**: profilen forbliver tom; migration må ikke gentage ved hver start — test i Task 1 (`migrated`-markør gør anden migrate til no-op).
3. **Slettet standardforbindelse**: `standardAI` ryddes med advarsel, nye projekter falder tilbage til at vælge selv — test i Task 1 (removeConnection) og Task 7 (prefill-tekst).
4. **Copy-key med ændret adresse**: samme `kind` men anden `baseURL` afvises — nøglen må ikke sendes til en anden modtager; stale revision afvises — test i Task 6.
5. **Ny samtale med eksisterende kladde**: kladde/historik vinder over `profile.workMode`; profilen gælder kun helt nye samtaler — test i Task 7.
6. **`.open`-vagter og ventetrin**: `$('#connections-dialog').open` (app.js:702) og `#…-dialog[open]`-ventetrin i scripts skal virke uændret efter Task 3 og 5 — test i Task 3/5.

---

### Task 1: `core/profile.cjs` + IPC + Preferences-omskrivning + migration

**Files:**
- Create: `core/profile.cjs`
- Modify: `core/preferences.cjs` (læser/skriver `profile.projectDefaults`)
- Modify: `main.cjs` (kanaler `profile:get/save/migrate/suggest`; fjern tilbage-skrivning i `project:create`; `nativeTheme` røres ikke her — Task 4)
- Modify: `core/workbench.cjs` (`removeConnection` rydder `standardAI`)
- Modify: `preload.cjs` (`profileGet/profileSave/profileMigrate/profileSuggest`)
- Test: `tests/profile.test.cjs` (ny), `tests/preferences.test.cjs` (omskrevet)

**Interfaces:**
- Consumes: `Store` (`read()`, `update(change)`), `Preferences`-normaliseringsregler for projectDefaults.
- Produces:
  - `class Profile { constructor(store) }` med `async get() -> { profile, warnings }`, `async save(partial) -> { profile, warnings }` (patch: kun angivne nøgler erstattes, søsterfelter bevares; heappearance-objektet erstattes som én enhed), `async migrate({ preferredConnection, workspaceTheme, surfaceOpen }) -> { profile }`.
  - Profilform (default): `{ name:'', icon:'', helpLevel:'fuld', appearance:{ theme:'system', panelOpen:true }, standardAI:{ connectionID:'', modelID:'' }, workMode:'chat', projectDefaults:{ hosting:'', designID:'', tests:'senere' }, migrated:0 }`.
  - `Profile.ICON_IDS` (12 id'er): `['star','bolt','leaf','moon','box','bird','wave','compass','flame','heart','cube','spark']`.
  - Validering: `name` string ≤ 60 tegn uden kontroltegn; `icon` i ICON_IDS eller ''; `helpLevel` ∈ {'fuld','minimal'}; `theme` ∈ {'system','light','dark'}; `panelOpen` boolean; `workMode` ∈ {'chat','plan'}; `connectionID`/`modelID` strenge ≤ 100 tegn; `projectDefaults` genbruger `Preferences`-normalisering.
  - Advarsler som `Preferences.available` (`core/preferences.cjs:13-16`): connectionID der ikke findes → ryddes + advarsel; designID der ikke findes → ryddes + advarsel.
  - Renderer-API: `harness.profileGet()`, `harness.profileSave(partial)`, `harness.profileMigrate(values)`, `harness.profileSuggest() -> string`.

- [ ] **Step 1: Skriv fejlene tests** — `tests/profile.test.cjs`: (a) `get()` på tom settings.json returnerer default-profilen; (b) `save({ name:'Parthee' })` erstatter kun navn (søsterfelter bevares); (c) `save` afviser ugyldigt ikon/hjælp/tema/arbejdsmåde med kast; (d) `migrate` med alle tre legacy-værdier + eksisterende `startupDefaults.connectionID` udfylder kun tomme felter og sætter `migrated:1`; (e) anden `migrate` er no-op selv med nye værdier; (f) `migrate` med modstridende værdier (profilfelt allerede sat) lader profilen vinde; (g) slettet `standardAI.connectionID` via `workbench.removeConnection` rydder feltet; (h) `preferences.get()` læser `profile.projectDefaults` og `preferences.save()` skriver tilbage dertil. Omskriv `tests/preferences.test.cjs` til den nye placering.
- [ ] **Step 2: Kør** `node --test tests/profile.test.cjs tests/preferences.test.cjs` — forvent FEJL.
- [ ] **Step 3: Implementér `core/profile.cjs`** efter mønsteret fra `core/preferences.cjs` (klasse + module.exports). `migrate` kører ét `store.update`: hvis `state.profile?.migrated` er 1 → returnér uændret; ellers fold `startupDefaults` (connectionID → standardAI; hosting/designID/tests → projectDefaults) og derefter renderer-værdierne (preferredConnection → standardAI.connectionID, workspaceTheme ∈ {'light','dark'} → appearance.theme, surfaceOpen ∈ {'true','false'} → appearance.panelOpen) **kun i tomme felter**, sæt `migrated:1`.
- [ ] **Step 4: Omskriv `core/preferences.cjs`**: `get()` læser `state.profile.projectDefaults` (med fallback til `state.startupDefaults` hvis profile-objektet ikke findes — overgangsperiode); `save()` skriver via `store.update` ind i `state.profile.projectDefaults` (opretter profile-objektet med default-form hvis nødvendigt).
- [ ] **Step 5: `main.cjs`**: fire `handle(...)`-linjer ved siden af `preferences:get/save` (linje ~381). `profile:suggest` → `os.userInfo().username` med try/catch. I `project:create` (linje ~233): fjern linjen `await new Preferences(workbench.store).save(startup.values);` (tilbage-skrivningen) og prefold i stedet: `available()`-kaldet starter fra `profile.projectDefaults` når `input.startup`-felter er tomme. I `core/workbench.cjs` `removeConnection`: inde i den eksisterende `store.update` ryddes `state.profile.standardAI` når `connectionID === id`.
- [ ] **Step 6: `preload.cjs`**: tilføj de fire metoder i `methods`-objektet.
- [ ] **Step 7: Kør begge testfiler** — forvent PASS. Kør fuld suite — forvent grøn.
- [ ] **Step 8: Commit** — `Add the profile store with per-field migration and IPC`.

### Task 2: `ui/profile-icons.js` + onboarding-trinnet "Din profil"

**Files:**
- Create: `ui/profile-icons.js`
- Modify: `ui/index.html` (setup-sektion + fremgangslinje), `ui/app.js` (headings, gating, Tilbage, leaveSetup), `core/ui-assets.cjs`
- Test: `tests/profile-step.test.cjs` (ny), `tests/onboarding-b.test.cjs` (berørte tilfælde)

**Interfaces:**
- Consumes: `harness.profileSave/profileSuggest`, `Profile.ICON_IDS`-listen (duplikéret i ui/profile-icons.js — core validerer).
- Produces: `window.ProfileIcons = { IDS, svg(id) -> string, initials(name) -> 'PA' }`; setup-trin `data-setup-step="profile"` med felter `#profile-name`, `#profile-icon-grid`, `#profile-theme` (radios system/lys/mørk), `#profile-help` (select fuld/minimal), knap `#profile-continue`; fremgangslinje-fase `data-phase="profile"`.

- [ ] **Step 1: Skriv fejlene tests** — profil-trin vises som første trin når profilen er tom; skjules når profilen er udfyldt og repeat-setup; `profileSuggest` præudfylder navnefeltet; "Fortsæt" gemmer via `profileSave` med felterne; fremgangslinjen har fire punkter og nummereringen 1-4 (`['profile','connection','features','idea']`); Tilbage fra 'choice' vender til 'profile' når profil-trinnet blev vist.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** — `ui/profile-icons.js` med 12 streg-SVG-glyffer (DSH-udtryk: 1.5px stroke, 24×24 viewBox, `currentColor`). I `index.html`: `<section id="setup-profile" data-setup-step="profile" hidden>` med felterne og hjælpetekst ("Hvad skal Aura kalde dig? … Temaet følger dit system, medmindre du vælger selv."), plus fremgangslinjen: `1 Din profil · 2 Forbindelse · 3 Funktioner · 4 Din idé` (Udbyder-punktet fjernes; `data-phase="provider"` og `"connection"` peger nu på samme punkt nummer 2 — justér `syncOnboardingVisuals` i app.js:130-149 så fase 'provider' også aktiverer punktet 'connection', og nummereringen er `['profile','connection','features','idea'].indexOf(...)+1`). `setupPage`-headings (app.js:186) tilføjer `profile: ['Din profil', 'Udfyld din profil — du kan altid ændre den under Indstillinger.']` og eyebrow 'DIN PROFIL'. Gating i setup-indgangen: start på 'profile' når første guidede introduktion **eller** profilen er tom (hentes via `profileGet`); ellers 'choice'. `leaveSetup` (app.js:278): før gennemførelse gemmes profilfelterne via `profileSave`; hvis `useAI` og `standardAI.connectionID` er tom, udfyldes den med den kontrollerede forbindelses-id.
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS.
- [ ] **Step 5: Commit** — `Add the onboarding profile step with icon picker and four-item progress`.

### Task 3: Settings-dialogens skelet + `openSettings(section)`

**Files:**
- Create: `ui/settings.js`, `ui/settings.css`
- Modify: `ui/index.html` (`#settings-dialog`, popover-knapper), `ui/app.js` (popover-handlers), `core/ui-assets.cjs`
- Test: `tests/settings.test.cjs` (ny)

**Interfaces:**
- Consumes: de fire eksisterende dialoger `#connections-dialog`, `#features-dialog`, `#updates-dialog`, `#support-dialog` (uændrede id'er og adfærd).
- Produces: `window.SettingsDialog = { open(section) }` hvor section ∈ {'profile','appearance','connections','features','updates','support'}; `openSettings(section)` i app.js delegerer hertil. Sektionsnav er knapper med `data-settings-section`; indholdspanel `#settings-content`. Profil/udseende er inline-sektioner (Task 4 udfylder dem; placeholder-tekst her); de fire øvrige sektioner lukker settings-dialogen og åbner den eksisterende dialog via `.showModal()` (sekventielt, aldrig nested).

- [ ] **Step 1: Skriv fejlene tests** — `openSettings('profile')` viser settings-dialogen med sektionen aktiv (`aria-current` på nav-knappen); `openSettings('features')` lukker settings-dialogen og `#features-dialog[open]` gælder; popover-knapperne kalder `openSettings` med rette sektion; `.open`-vagten `$('#connections-dialog').open` fungerer uændret; Escape/luk-knap lukker og returnerer fokus til `#settings-toggle`.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** — `<dialog id="settings-dialog">` i DSH-stil (settings.css: venstre nav 200px, radius 16-panel, alpha-kanter, aura-tokens); nav med seks punkter og SVG-ikoner; indholdspanel. De fire eksisterende popover-handlers (`connections-button` m.fl.) erstattes af `openSettings('…')`-kald; popoveren får seks punkter (Din profil, Udseende, AI-forbindelser, Funktioner, Opdateringer, Hjælp og feedback). Eksisterende dialog-knapper/`data-close` røres ikke.
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS.
- [ ] **Step 5: Commit** — `Add the unified settings dialog with section navigation`.

### Task 4: Sektionerne Din profil + Udseende (tema uden flimmer, hjælpeniveau)

**Files:**
- Modify: `ui/settings.js`, `ui/settings.css`, `ui/index.html`, `ui/workspace-calm.js`, `main.cjs`, `ui/app.js`
- Test: `tests/settings.test.cjs` (udvidet), `tests/settings-theme.test.cjs` (ny hvis separat)

**Interfaces:**
- Consumes: `harness.profileGet/profileSave`, `window.ProfileIcons`.
- Produces: indhold i sektion Profil: `#settings-name`, `#settings-icons` (grid), `#settings-work-mode`, `#settings-help`; sektion Udseende: `#settings-theme` (radios), `#settings-panel-open` (checkbox); hjælpe-klasse `body.help-minimal`; tema-hint-nøgle `aura.theme-hint.v1` (skrivebeskyttet kopi af `appearance.theme`, skrives kun af profilkoden); main: `applyProfileTheme(theme)` sætter `nativeTheme.themeSource` ('dark'/'light'/'default').

- [ ] **Step 1: Skriv fejlene tests** — åbning af sektionen viser aktuelle profilværdier; ændring af navn + gem kalder `profileSave({ name })` og bevarer ikon; temavalg 'mørk' sætter `body[data-workspace-theme="dark"]` straks og skriver hint-nøglen; hjælpeniveau 'minimal' sætter `body.help-minimal` og CSS skjuler udpegede hints (composer-genvejslinje `#composer-shortcut`, `#resume-notice .hint`) men aldrig godkendelser/privacy-tekst; tema-knappen i projektmenuen skriver til profilen (ikke `harness-workspace-theme-v1`); main: profil med `theme:'dark'` sætter `nativeTheme.themeSource='dark'` før vinduet oprettes.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** — settings.js: `fill(profile)`/`saveSection(partial)`; ved hver `profileSave` opdateres både UI og tema straks. `ui/workspace-calm.js`: `storedChoice()` læser `aura.theme-hint.v1`; klik på `#workspace-theme` kalder `harness.profileSave({ appearance: { theme } })` (synkront hint + async persist; profil er kilden). `main.cjs`: ved opstart læses profilen før `createWindow` (linje ~1030) og `nativeTheme.themeSource` sættes; `profile:save` håndhæver det samme efter gem. CSS-regler for `body.help-minimal` i settings.css. Projektstandard-felter i sektion Profil: `#settings-hosting`, `#settings-design`, `#settings-tests` + knap "Glem projektstandarder" (kalder `preferencesSave` med tomme værdier) og standard-AI-rækken (`#settings-standard-connection` + "Brug som standard"-knap i modelvælgeren kobles i Task 7).
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS.
- [ ] **Step 5: Commit** — `Add the profile and appearance settings sections with flicker-free theming`.

### Task 5: Let "Tilføj forbindelse"-flow i forbindelsesdialogen

**Files:**
- Modify: `ui/index.html` (`#connections-dialog`), `ui/app.js` (`#connection-add` + flow), `ui/connection-overview.js`, `ui/workspace-calm.css`
- Test: `tests/connection-add.test.cjs` (ny), berørte tilfælde i `tests/connection-overview.test.cjs`

**Interfaces:**
- Consumes: `moveConnectionForm` (app.js:176), `providerCards` (app.js:197), `connections:save`/`connections:models`.
- Produces: inline-flow i `#connections-dialog`: `#connection-add-flow` med udbydergitter `#add-provider-cards` (genbruger `providerCards`-listen) og formularhjem; rækkefølge **udfyld → gem → kontrollér**: efter `saveConnection` køres den eksisterende forbindelseskontrol, resultat vises som `#connection-feedback`; succes → tilbage til listen; fejl → forbindelsen forbliver oprettet med redigér/fjern i listen + fejltekst.

- [ ] **Step 1: Skriv fejlene tests** — "Tilføj forbindelse" viser udbydergitter i dialogen (setup-skærmen forbliver skjult); valg af udbyder flytter `#connection-form` ind i dialogen; gem gemmer forbindelsen og viser kontrolresultatet; "Kontrollér forbindelse"-vagter (`.open`) fungerer under flowet; annullering ("Annullér" + Escape) returnerer formularen til listen uden gem.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** — `#connection-add`-handleren ændres fra `showSetup()` til inline-flowet; `moveConnectionForm` genbruges med en tredje hjem (`#connection-form-home` i dialogen er allerede `not guided`-hjemmet — flowet sætter dialogen som aktiv kontekst og opdaterer `#save-connection`-tekst til "Gem og kontrollér"). Efter gem: kør den samme kontrollogik som setup (fetch modeller via `harness.models`), vis status, og genindlæs listen.
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS.
- [ ] **Step 5: Commit** — `Add the inline add-connection flow to the connections dialog`.

### Task 6: Copy-key — genbrug af gemte nøgler

**Files:**
- Modify: `core/workbench.cjs` (`saveConnection`), `core/credential-entry.cjs` (tilladte felter), `ui/app.js` (UI-række ved valgt udbyder), `main.cjs` (intet nyt — `connections:save` passerer allerede)
- Test: `tests/copy-key.test.cjs` (ny)

**Interfaces:**
- Consumes: `saveConnection`-input (app.js → `connections:save`).
- Produces: input-felter `copyKeyFrom` (kilde-id) og `copyKeyRevision` (kildens revision fra den offentlige forbindelse). Håndhævelse inde i `store.update` i `saveConnection`: kilden skal eksistere, have **samme `kind` og samme `baseURL`** som destinationen, og `copyKeyRevision === source.revision`; ellers kast `Error('Nøglen kan ikke genbruges: udbyderen eller adressen er ændret. Indtast nøglen igen.')`. `connection.secret = source.secret` (krypteret kopiering — ingen dekryptering). Reglen gælder kun når `input.apiKey` er fraværende. `core/credential-entry.cjs` receipt-feltliste udvides med `copyKeyFrom`/`copyKeyRevision`.

- [ ] **Step 1: Skriv fejlene tests** — kopi lykkes ved samme kind+baseURL (secret overføres, klartekst eksisterer aldrig i returværdien — `publicConnection`); afvises ved ændret baseURL; afvises ved stale revision; afvises ved ukendt kilde-id; almindelig gem uden `copyKeyFrom` uændret; redigering med uændret kind+baseURL bevarer nøglen som i dag.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** som beskrevet i Interfaces (én blok i `saveConnection` før den eksisterende secret-logik; `input.copyKeyFrom`-stien sætter `connection.secret = previous/ source`-logikken til side). UI: i add-flowet (Task 5), når valgt udbyderkind har gemte forbindelser, vises en select "Brug en gemt nøgle" (`#connection-key-reuse`) med kilderne; valg præudfylder `baseURL` fra kilden og medsender `copyKeyFrom`+`copyKeyRevision`.
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS.
- [ ] **Step 5: Commit** — `Allow reusing a saved API key for a new connection, bound to same provider and address`.

### Task 7: Forbrug af standarder + localStorage-pensionering

**Files:**
- Modify: `ui/app.js` (startup-migration, preferredConnection, workMode, chat-choice-anbefaling, standard-AI-prefill, "Brug som standard"), `ui/workspace.js` (panelOpen fra profil), `ui/workspace-calm.js` (gammel tema-nøgle fjernet), `ui/index.html` ("Valgene huskes til næste projekt"-tekst fjernes)
- Test: `tests/profile-consumption.test.cjs` (ny), berørte tilfælde i eksisterende tests

**Interfaces:**
- Consumes: `harness.profileMigrate/profileGet/profileSave`; hændelsen `aura:profile` (ny CustomEvent med profilen som detail, dispatchet af app.js når profilen er indlæst).
- Produces: `startupDefaults`/localStorage-nøgler pensioneret: `harness.preferredConnection`, `harness-workspace-theme-v1`, `aura-surface-open` slettes efter succesfuld `profileMigrate`; "Brug som standard"-knap i modelvælgeren kalder `profileSave({ standardAI: { connectionID, modelID } })`.

- [ ] **Step 1: Skriv fejlene tests** — startup: `profileMigrate` kaldes én gang med de tre localStorage-værdier og nøglerne slettes bagefter; ny samtale uden kladde/historik starter i `profile.workMode` (kladde og historik vinder — begge tilfælde testes); chat-choice-kortet for profilens arbejdsmåde er markeret anbefalet; nyt projekt forvælger `standardAI.connectionID` + `modelID` (eller forbindelsens anbefaling når modelID er tom); panel-starttilstand kommer fra `appearance.panelOpen` (workspace.js skriver til profilen, ikke localStorage); fjernet standardforbindelse giver tom prefill + advarsel.
- [ ] **Step 2: Kør** — forvent FEJL.
- [ ] **Step 3: Implementér** — app.js: efter første `connections:state` kaldes `profileMigrate`, derefter `profileGet` og `window.dispatchEvent(new CustomEvent('aura:profile', { detail }))`. `preferredConnection`-variablen (app.js:159-160) foder fra `profile.standardAI.connectionID`; leaveSetup skriver ikke længere `harness.preferredConnection`. `fillChat` (app.js:~466): `$('#work-mode')` default `'chat'` → `profile.workMode` når helt ny samtale uden kladde (firstProjectTask → 'free' består). Chat-choice (app.js:~1311): anbefalet kort får `aria-description`/klasse fra profilen. workspace.js: `surfaceOpen` init lytter på `aura:profile` i stedet for localStorage; toggle skriver `profileSave({ appearance: { panelOpen } })` (hint-straks med straks-visning via eksisterende dataset). workspace-calm.js: gammel `themeKey`-læsning fjernet (hint-nøglen fra Task 4 er den eneste). Modelvælgeren får "Brug som standard"-knap → `profileSave({ standardAI })`. `#startup-connection` i projektopstart præudfyldes fra `standardAI.connectionID`. Teksten "Valgene huskes til næste projekt" (index.html:99) fjernes; "Glem dem" findes nu kun i Indstillinger (Task 4).
- [ ] **Step 4: Kør tests + fuld suite** — forvent PASS. Kør `npm run test:desktop` — forvent 10/10 (+ profil-tjek hvis tilføjet i Task 8).
- [ ] **Step 5: Commit** — `Consume profile defaults everywhere and retire the legacy localStorage keys`.

### Task 8: Dokumentation + desktop-verifikation + version

**Files:**
- Modify: `desktop/DESIGN.md`, `desktop/docs/` (dansk brugerdokumentation hvis findes: `docs/ux-plan.md` eller ny `docs/profil.md`), `desktop/package.json` + `package-lock.json` + `core/distribution.cjs`/`update-notice.json` (version 1.0.0-beta.17 → 1.0.0-beta.18), `scripts/verify-desktop.cjs` (udvid med profil-tjek)
- Test: `npm run test:desktop` udvidet

**Interfaces:**
- Consumes: alt fra Task 1-7.
- Produces: `test:desktop` med to nye kontroller: (1) "profil udfyldes i onboarding og ændres i Indstillinger" (2) "profil genindlæses efter genstart".

- [ ] **Step 1: Udvid `scripts/verify-desktop.cjs`** med de to profil-kontroller (opret projekt → udfyld profil i onboarding → åbn Indstillinger → ret navn → genstart app-objekt → bekræft værdier).
- [ ] **Step 2: Kør** `npm run test:desktop` — forvent alle kontroller grønne.
- [ ] **Step 3: Dokumentér** — DESIGN.md får afsnittet "Profil og Indstillinger" (datamodel, sektioner, prioriteringsregler, migrationshistorik); ny `docs/profil.md` med brugervendt beskrivelse; version bumpes i alle tre kilder (distribution.cjs er single source — følg eksisterende versions-synk-test).
- [ ] **Step 4: Kør fuld suite + test:desktop** — forvent grønne.
- [ ] **Step 5: Commit** — `Document the profile feature and bump to 1.0.0-beta.18`.

## Efter Task 8

Merge til main (`git merge --ff-only`), push, CI-grøn verificeres, efter-byg-brief sendes til begge rådgivere (Claude + Codex), fund rettes, projekthukommelsen opdateres.
