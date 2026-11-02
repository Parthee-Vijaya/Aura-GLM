# Profil og Indstillinger · Design (1. november 2026, rev. 2 efter rådgiver- og buildergennemgang)

Godkendt tilgang: **A — profil-trin i onboarding B + én samlet Indstillingsdialog.**
Parthee valgte profilens indhold: navn + ikon, standard-AI, standard arbejdsmåde,
udseende, projektstandarder og hjælpeniveau. ("Om mig til AI'en" blev fravalgt.)

Rev. 2 indarbejder fund fra Claude-rådgiver, Codex-rådgiver og builder-check:
migrationens mekanisme, copy-key-kontrakten, dialog-strategien, tema-flimmer,
"Flere valg"-funktionen, standard-AI-kontrakten og skivernes rækkefølge.

## Hvorfor

I dag skal man vælge de samme ting igen og igen: model vælges pr. projekt, arbejdsmåde
huskes ikke, "Flere valg" (hosting/design/tests) kan kun ændres i onboarding, og
"Tilføj forbindelse" genåbner hele setup-skærmen. Målet: første gang = venlig guide med
god hjælp; derefter = lige så enkelt som Claude, Codex og DeepSeek Harness — én profil,
ændres under Indstillinger, aldrig spurgt igen.

## Mål

1. Første gang: et "Din profil"-trin i onboarding B med forklarende hjælpetekst.
2. Efterfølgende: én Indstillingsdialog (DSH-stil) med sektioner, hvor profilen,
   udseendet, forbindelser, funktioner, opdateringer og hjælp kan ændres.
3. Forbindelser kan altid tilføjes/redigeres let — uden at genåbne setup-skærmen — og
   gemte API-nøgler kan genbruges til en ny forbindelse.
4. Alle profilstandarder anvendes automatisk: nye projekter/samtaler starter uden at spørge.

## Ikke-mål

- Ingen sky-synkronisering, ingen flere profiler, ingen upload af egne billeder (kun
  indbyggede ikoner + initialer), ingen ny accentfarve endnu.
- Ingen "om mig"-tekst til AI'en (fravalgt eksplicit).

## Anti-mål

- API-nøgler må aldrig ind i hoved-rendereren (nøgleringsflowet med
  credential-entry-vinduet og key receipts består uændret).
- **`profile.name` og ikon må aldrig sendes med i prompts, diagnostik, modellog eller
  feedbackrapporter** — profilen er ren UI-tilstand, ikke AI-kontekst.
- Onboarding B's godkendte struktur og privacy-gate må ikke nedrives; "Flere valg"s
  pr.-projekt-funktioner (farve, logo, links, referencefiler, designpakke) bevares.
- Ingen dobbelte kilder til sandhed: profilen i settings.json er den eneste autoritative
  kilde; localStorage-nøgler pensioneres med deres skrivere i samme skive.

## Constraints

- settings.json-schema: ny top-nøgle `profile` (app-niveau, main-process-ejet).
- IPC gennem den eksisterende registrar (`handle(channel, action)` i main.cjs); den
  fungerer uden åbent projekt (empty workbench ejer Store'en).
- UI-stakken er ren DOM/CSS med aura-tokens.css (DSH-tokens); ingen framework.
- Alle strenge er dansk; WCAG-AA gælder; tests kører med bundlen Node; hver skive
  omskriver de tests den berører (verify-preferences, verify-setup, verify-features,
  verify-contribution-update, ui-test-helpers m.fl.).

## Datamodel · `settings.json` → `profile`

```json
{
  "name": "Parthee",
  "icon": "star",
  "helpLevel": "fuld" | "minimal",
  "appearance": { "theme": "system" | "light" | "dark", "panelOpen": true },
  "standardAI": { "connectionID": "…", "modelID": "…" },
  "workMode": "chat" | "plan",
  "projectDefaults": { "hosting": "", "designID": "", "tests": "senere" },
  "migrated": 1
}
```

- `core/profile.cjs` efter mønsteret fra `core/preferences.cjs`: normalize/valider,
  `get()`/`save()` over `store.update` (atomare skrivninger).
- `standardAI.modelID` er valgfri: udfyldes via en eksplicit "Brug som standard"-handling
  i modelvælgeren; ved fraværlighed bruger nye projekter forbindelsens anbefalede model.
  Et aktuelt projekts modelvalg overskriver aldrig profilen.
- `standardAI` ryddes (med advarsel som Preferences i dag, `core/preferences.cjs:13-14`)
  når forbindelsen fjernes — indarbejdes i `removeConnection` (`core/workbench.cjs:349`).
- **`Preferences` omskrives til at læse/skrive `profile.projectDefaults`** (ikke
  startupDefaults), så `preferences:get/save`-kanalerne fortsat virker og tests rettes.
- Ikonsæt: ~12 indbyggede SVG-glyffer + initialer-fallback (to første bogstaver i en
  cirkel). `ui/profile-icons.js` er én kilde til picker, sidebar og dialog.

## Migration (renderer-initieret, felt for felt, med markør)

Hovedprocessen kan ikke læse localStorage, og "hvis profilen er tom" er utilstrækkeligt
("Vælg senere" giver tom profil → migrering igen ved hver start). Derfor:

1. Rendereren kalder **én gang ved appstart** `profile:migrate({ preferredConnection,
   workspaceTheme, surfaceOpen })` med de tre legacy-værdier
   (`harness.preferredConnection` app.js:160, `harness-workspace-theme-v1`
   workspace-calm.js:8, `aura-surface-open` workspace.js:16).
2. `core/profile.cjs` anvender dem **pr. felt** (feltet overskrives kun, hvis
   profilfeltet er tomt), sætter `profile.migrated: 1` og returnerer den endelige profil.
3. Legacy-nøglerne slettes i rendereren efter bekræftet lagring, **og de gamle skrivere
   standsset i samme skive** (workspace.js:31, workspace-calm.js:38 skriver til profil).
4. `startupDefaults` overføres i main-processen ved første `profile:migrate` (eller første
   `profile:get`): `connectionID` → `standardAI.connectionID`, resten → `projectDefaults`.
   `startupDefaults` beholdes læseligt i overgangen som fallback.
5. **Projektoprettelsens tilbage-skrivning** (`main.cjs:250`, "Valgene huskes til næste
   projekt") fjernes: projektets egne valg præfiller fra profilen men skriver ikke
   tilbage. Profilen er et fast valg, der kun ændres eksplicit i Indstillinger eller
   via "Brug som standard".

## IPC

| Kanal | Formål |
|---|---|
| `profile:get` | hele profilen (migreret, med advarsler) |
| `profile:save` | gem delmængde med validering; returnerer { profile, warnings } |
| `profile:migrate` | renderer-initieret felt-for-felt-migration (ovenfor), én gang |
| `profile:suggest` | navneforslag fra OS-brugernavn (`os.userInfo()`) |
| `connections:save` + `copyKeyFrom` | udvidelse af eksisterende kanal (se Copy-key) |

## Copy-key — genbrug af gemte nøgler

Ingen ny kanal; `connections:save` udvides med `copyKeyFrom: <connectionID>`:

- Håndhæves **inden i `saveConnection` under `store.update`**: kopi tillades kun når
  `kind` **og** `baseURL` er identiske mellem kilde og destination (samme kind er ikke
  nok — `compatible`/`azure`/`corti` kan ellers sende nøglen til en anden modtager,
  jf. `core/workbench.cjs:342` og `core/credential-entry.cjs:12-15`).
- Kildens `revision` skal matche (optimistisk lås); afviges ellers med en forklaring.
- Nøglen kopieres **krypteret** hovedprocessen imellem — klartekst når aldrig rendereren.
- `copyKeyFrom` tilføjes tilladte felter i receipt-bindingen (`credential-entry.cjs:12`).
- UI: ved udbyderkind med eksisterende forbindelse vises "Brug nøglen fra <navn>" med
  bekræftelse; destinationsskift (ændret baseURL) kræver fornyet godkendelse.

## Onboarding B · nyt trin 1 "Din profil"

- Ny `[data-setup-step="profile"]`-sektion: navn (præudfyldt via `profile:suggest`),
  ikon-picker, tema (Følg system/Lyst/Mørkt), hjælpeniveau med forklarende tekst.
  Alle felter kan udfyldes; "Vælg senere" tilladt.
- **Gating (som features-trinnet):** trinnet vises ved første guidede introduktion **eller
  hvis profilen er tom** (dækker opgraderende brugere). Repeat-setup ("Gennemgå
  opsætningen") springer profil-trinnet over, når profilen er udfyldt — man bliver aldrig
  spurgt igen.
- Fremgangslinjen bliver fire punkter — "1 Din profil · 2 Forbindelse · 3 Funktioner ·
  4 Din idé" (Udbyder og Forbindelse er ét logisk valg). `setupPage`-headings udvides
  (app.js:140-147, 186); Tilbage-navigationen (app.js:1523) kender det nye trin.
- AI-trinnet uændret; funktioner-trinnet stadig kun første guidede gang.
- **"Flere valg" bevares som pr.-projekt-sektion** forudfyldt fra profilen — kun
  tilbage-skrivningslinjen "Valgene huskes til næste projekt" fjernes, og "Glem dem"
  flyttes til Indstillinger. Alle pr.-projekt-funktioner (farve, logo, inspirationslinks,
  referencefiler, "Gem som designpakke", `#startup-connection`) består uændret.
- `leaveSetup` gemmer profilen via `profile:save`.

## Indstillingsdialogen

**Trin 1 (denne ombygning):** En ny `<dialog id="settings-dialog">` med venstre
sektionsnav (Din profil, Udseende, AI-forbindelser, Funktioner, Opdateringer, Hjælp og
feedback). De fire eksisterende dialoger **består som selvstændige dialoger** og åbnes af
settings-dialogen via ét fælles indgangspunkt `openSettings(section)` /
`settingsSection(name)` — ingen `<dialog>` i `<dialog>` (to fokusfælder), ingen
brud på `.open`-vagter (`app.js:702`), `[open]`-ventetrin i scripts eller
`data-close`-knapper (`index.html:220-251`).

**Trin 2 (senere, separat skive):** dialogindhold flyttes ind som sektioner, først når
alle vagter/ventetrin er omskrevet til `openSettings`/`settingsSection` — testændringer i
samme commit.

- **Din profil:** navn, ikon, standard-AI (forbindelse + evt. model, med "Brug som
  standard"), standard arbejdsmåde, projektstandarder (hosting/design/tests), hjælpeniveau.
- **Udseende:** tema (system/lys/mørk) + om panelet starter åbent. Temaet håndteres uden
  flimmer: hovedprocessen sætter `nativeTheme.themeSource` fra profilen **før vinduet
  oprettes** (`main.cjs:1030`), og en skrivebeskyttet localStorage-kopi bruges som
  synkront start-hint (profilen er stadig eneste kilde; kopien skrives kun af profilen).
- **AI-forbindelser:** eksisterende liste + let "Tilføj forbindelse"-flow *inde i*
  settings-dialogen, der genbruger `moveConnectionForm` (`app.js:176`). Rækkefølgen er
  **udfyld → gem → kontrollér** ("Kontrollér forbindelse" kræver en gemt id,
  `workbench.cjs:388`; "kontrollér → gem" findes ikke i koden). Ved verifikationsfejl
  tilbydes redigering eller fjernelse. "Brug nøglen fra <navn>" via copy-key.
  "Gennemgå opsætningen" består som avanceret indgang.

## Anvendelse af standarder (prioritetsregler)

- **Tema:** `profile.appearance.theme` → `nativeTheme.themeSource` (main) +
  `data-workspace-theme` (workspace-calm.js); `system` følger prefers-color-scheme.
  Temaknappen i projektmenuen skriver til profilen, ikke localStorage. Begge manuelle
  valg verificeres mod begge systemtemaer.
- **Panel:** `appearance.panelOpen` er starttilstand for arbejdsfladen (workspace.js);
  gamle localStorage-skrivere pensioneres.
- **Standard-AI:** nye projekter forvælger `standardAI.connectionID` og (hvis sat)
  `standardAI.modelID`; ellers forbindelsens anbefalede model. Aktuelt projekts valg
  ændrer ikke profilen.
- **Arbejdsmåde:** **eksisterende samtaletilstand og kladde vinder**; profilen gælder kun
  helt nye samtaler uden kladde. Første projektopgave (`firstProjectTask` → `free`)
  består. Chat-choice-kortene i nye samtaler markerer profilens arbejdsmåde som
  anbefalet (begge valg forbliver).
- **Hjælpeniveau:** `helpLevel: 'minimal'` sætter `body.help-minimal`; CSS skjuler
  **udelukkende udpegede hint** (composer-genvejslinje, intro-forklaringer,
  resume-hint). Privacyvalg, advarsler, godkendelser og "Før du sender"-tekst skjules
  aldrig.
- **Projektstandarder:** anvendes hvor startupDefaults bruges i dag; `main.cjs:233-250`
  henter `profile.projectDefaults` når rendereren ikke sender valg med.

## Nøgletal (tests)

- profile.cjs-enheder: validering, felt-for-felt-migration med modstridende og delvise
  værdier, genstart midt i migration (migreret-markøren), patch uden tab af
  søsterfelter, slettet standardforbindelse/-design giver advarsel.
- Copy-key: kopierer krypteret secret, afviser ændret baseURL/kind, afviser stale
  revision, genbrugt kvittering afvises; klartekst når aldrig rendereren.
- Onboarding: profil gemmes ved leaveSetup; "Vælg senere"-sti; gating (første gang og
  tom profil; repeat-setup springer over); fremgangslinje; Tilbage-navigation.
- Indstillinger: `openSettings` åbner rigtig sektion; gem kalder profile:save;
  valideringsfejl vises; `.open`-vagter fungerer; sektionsskift under ventende kald.
- Forbrug: ny samtale arver workMode (kladde vinder); ny projekt forvælger standard-AI;
  temaændring slår igennem uden flimmer i begge systemtemaer.
- `test:desktop` udvides med: profil udfyldes i onboarding, ændres i Indstillinger,
  genindlæses efter genstart.

## Tilgange der blev overvejet

- **B — selvstændig guide foran onboarding B:** renere, men to guides forvirrer, og
  startflowet omskrives unødigt. Fravalgt.
- **C — kun Indstillinger, ingen første-gangs-hjælp:** mindst arbejde, men opfylder ikke
  kravet om god hjælp første gang. Fravalgt.

## Skiver (1 commit pr. skive, testbar; hver skive retter sine tests)

1. `core/profile.cjs` + IPC (`get`/`save`/`migrate`/`suggest`) + Preferences omskrives
   til `profile.projectDefaults` + migration + standardAI-rydning i removeConnection
   + enhedstests (incl. preferences.test.cjs).
2. `ui/profile-icons.js` + onboarding "Din profil"-trin (gating, fremgangslinje,
   Tilbage) + profiler gemmes i leaveSetup + tests (onboarding-b.test.cjs, verify-setup).
3. Settings-dialog-skelet med sektioner + `openSettings`/`settingsSection` + popover
   åbner sektion + de fire dialoger kaldes + tests (ui-test-helpers).
4. Sektioner: Din profil + Udseende (gem via profile:save; tema via nativeTheme +
   start-hint; hjælpeniveau-klasse) + tests.
5. Let "Tilføj forbindelse"-flow i settings-dialogen (moveConnectionForm-genbrug,
   udfyld → gem → kontrollér) + tests.
6. Copy-key (`connections:save` + `copyKeyFrom`, credential-entry-felter, UI
   "Brug nøglen fra <navn>") + tests.
7. Forbrug: arbejdsmåde, tema, panel, standard-AI (modelID-forvælg), projektstandarder;
   localStorage-pensionering (nøgler + skrivere) + tilbage-skrivning fjernes +
   testomskrivninger.
8. Dokumentation (docs, DESIGN.md) + versionsbump efter release-politikken ved
   udgivelse.

## Trufne beslutninger (Parthee, 1. november 2026)

1. **"Flere valg"**: Beholdes som pr.-projekt-sektion forudfyldt fra profilen.
   Tilbage-skrivningen "Valgene huskes til næste projekt" fjernes; "Glem dem"
   flyttes til Indstillinger. Alle pr.-projekt-funktioner bevares.
2. **Standard-AI**: Fast, eksplicit valg — ændres kun i Indstillinger eller via
   "Brug som standard" i modelvælgeren. Ingen automatisk tilbage-skrivning fra
   projekter.
3. **Fremgangslinjen**: 4 punkter — "1 Din profil · 2 Forbindelse · 3 Funktioner ·
   4 Din idé" (Udbyder og Forbindelse er ét logisk valg).

## Efterladt til byggeren

- Præcis ikonliste og glyffer (12 stk., streg-ikoner i DSH-udtryk).
- Copy-key-bekræftelsestekst i UI.
- Hvor "Glem dem" for projektstandarder lander i Indstillinger.
- Eventuel tynd wrapper vedr. testventetrin afgøres af testløb i skive 3 (reglen er:
  vagter omskrives til openSettings; wrappers kun hvis uundgåeligt).

## Rev. 3 · Poleringsbølge (2.11.2026 — Parthees gennemgang af den byggede profil)

Godkendt af Parthee: alle tre ikon-valg, "skills ad gangen", begge 4K-løsninger, byg
før merge. Bygges på samme gren som rev. 1-2 (beta.18 er ikke udgivet endnu).

### Ikon-valg (erstatter rev. 2's 12-glyffer-sæt)

- **Kompakt række** i Din profil (og onboarding-trinnet) i stedet for gitter.
- Tre valg: **Initialer** (standard, cirkel med to bogstaver), **3 Aura-logo-inspirerede
  ikoner** (streg-varianter af Aura-mærket i DSH-udtryk), **upload af eget billede**
  (jpg/png, håndteres af hovedprocessen, skaleres til avatarestørrelse, gemmes som fil
  i appdata — aldrig base64 i settings.json; **sendes aldrig til AI, prompts, log eller
  feedback**, samme regel som navn).
- Profilmodel: `icon` er streng — `''` (initialer), `'aura-1'|'aura-2'|'aura-3'`, eller
  `'upload'` (refererer til gemt avatar-fil; fjernelse af fil ⇒ fald tilbage til
  initialer). Gammelt Lucide-id normaliseres til `''`. ICON_IDS udskiftes.
- Upload-IPC: main åbner filvælger (jpg/png, ~≤1 MB), skalerer med Electron
  nativeImage, gemmer under appdata, validerer; rendereren ser kun resultatet.

### Hjælpeniveau (3 trin) — styrer KUN UI-hjælp

- `helpLevel: 'fuld' | 'delvis' | 'ingen'`.
- **Fuld:** som i dag. **Delvis:** ingen stående hints; en "?"-knap ved composeren
  åbner en popover med hjælpen til den aktuelle flade (de hints der ellers ville vise).
  **Ingen:** ingen hjælp, ingen "?"-knap. Privacy, advarsler, godkendelser og "Før du
  sender" vises ALTID uanset niveau.

### Skills ad gangen (onboarding spørger ikke længere)

- Features-trinnet ("Hele pakken" / "Vælg selv") fjernes fra onboarding. Fremgangslinjen:
  **"1 Din profil · 2 Forbindelse · 3 Din idé"**.
- Standarden er grundpakken: grundregler + altid-aktive funktioner (designhjælpen
  forbliver altid aktiv pr. repo-reglen). Øvrige funktioner/skills tilvælges senere
  under Indstillinger › Funktioner, som i dag.
- `features.cjs`-defaults rettes så "standard uden valg" = grundpakken (ikke alle).

### 4K-skalering (DSH's opskrift)

- **Skriftstørrelse** i Indstillinger › Udseende: 10-16px (standard 13), gemmes i
  profilen (`appearance.fontSize`), anvendes globalt (foretrukket mekanisme: CSS-zoom
  af app-roden via variabel — px-literal-kodebasen gør rem-refaktorering urealistisk;
  alternativ: --aura-text-variabel for vigtigste flader).
- **Bredere indholdsbredder** på store skærme: min-width 1600px ⇒ chat/komposer
  800→960px, panel-lukket 900→1080px; min-width 2000px ⇒ 1040/1200px. Hero-bredder
  (520px) må vokse moderat. Ingen ændringer under 1600px.
- Begge dele dokumenteres i DESIGN.md (og retter den forældede "hele enheder"-sætning
  fra fix-bølgens feltfletning).
