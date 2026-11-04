# UI/UX-overhaul · Implementationsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (eller SDD) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Én sammenhængende visuel modernisering: skaleringsrettelser, typografi-gulv, én disclosure-komponent og Fisher-inspirerede flader — uden at røre godkendte forløb.

**Architecture:** Alt er ren DOM/CSS på den eksisterende stak (aura-tokens.css som kilde). Nye komponent-regler i ét nyt stylesheet `ui/components.css` (linkes EFTER feedback-layout.css, FØR intet — sidste plads undtagen styles.css' mørk-blok-varianter som forbliver i styles.css sidst) med præfiks `.disclosure`/`.chip`/osv. Tokens udvides i aura-tokens.css. Ingen JS-framework.

**Tech Stack:** Electron 45 (Chromium ≥131: interpolate-size/::details-content tilgængelig), vanilla DOM/CSS, node:test + verify-scripts.

**Spec:** `desktop/docs/uiux-overhaul-design.md` (bindende; tal og kontrakter derinde).

## Global Constraints

- Bundlen Node på PATH (`export PATH="$PWD/.runtime/darwin-arm64/node/bin:$PATH"` fra desktop/); system-node er brudt.
- Hver skive: fuld suite grøn (`node --test --test-concurrency=1 tests/*.test.cjs`, baseline 2.258/0 fail/34 skips) + `npm run test:desktop` 13/13 + berørte verify-scripts + før/efter-screenshots (1280/1600/2560/3840px, begge temaer).
- styles.css' mørk-tema-blok (~linje 1356) forbliver sidst i filen; nye regler lægges før; struktur-test der håndhæver rækkefølgen tilføjes i Task 3.
- Dansk UI, engelske kommentarer/commits. Alle farver/radius/motion fra aura-tokens.
- Fisher-portering (Task 6-8): dokumentér originalkilde + licens i desktop/THIRD_PARTY_NOTICES.md (opret hvis den findes i forvejen) + commit-besked; ingen React/Tailwind-kodekopiering; uklar licens = stop og spørg Parthee/Jakob Fisker.
- Skive 5-8 (★): preview til Parthee FØR commit — byg på branch, tag screenshots, præsentér, afvent accept.

## Review Focus

1. Composer/tekst-kant: ved ALLE tilstande (panel åben/lukket, smal/bred, zoom 13/16) må afvigelsen være ≤1px — Task 1 test.
2. Gemt trækbredde: brugerens divider-valg må aldrig overskrives af clamp-responsiviteten — Task 2 test.
3. Typografi-gulv: ingen tekst under 11px; 11px kun tidsstempler/badges; kontrast ≥4.5:1 for 11-12px i BEGGE temaer — Task 3 test (målt, ikke antaget).
4. Disclosure-animationens reduced-motion-sti: hak i allow-discrete under `transition:none!important` må ikke fryse folds lukkede — Task 4 manuelt tjek + test.
5. Test-strukturpins: opdateres i samme commit som markup-ændringer — ALDRIG bagefter (settings-fontsize.test.cjs pinner deklarationer).

---

### Task 1: Én indholdsramme (composer/tekst-kant)
**Files:** Modify `ui/aura-tokens.css` (--chat-col), `ui/workspace-calm.css` (:46,55,66,167,174 + ≥1600/2000-blokkene), `ui/styles.css` (composer-grundregler ~:157), test i `tests/settings-fontsize.test.cjs` ( strukturpins opdateres) + evt. ny `tests/ui-frame.test.cjs`.
**Interfaces:** Produces `--chat-col` token (800px basis) + `.work-grid[data-surface="off"] #chat-panel`/`.chat-content`/`.composer`-reglerne der deler RAMMEN (gutter udenfor). Composer og chat-text skal ramme samme kant (≤1px) i alle tilstande.
- [ ] Fejlende test: kant-måling (beregnede bredder i syntetisk DOM eller CSS-parse-assertion: composer max-width + gutter == chat-content indre bredde).
- [ ] Implementér: --chat-col token; chat-content beholder max-width men FLYTTER 22px-padding til ydre wrapper (eller calc på composer); ryd modstridende 720/800/960/1040-regler (behold ≥1600/2000-trin som værdier af --chat-col via media queries: 960/1040).
- [ ] Fuld suite + test:desktop + verify-layout/workspace; screenshots 1280/1920/3840 begge temaer.
- [ ] Commit: "Unify the chat and composer into one content frame".

### Task 2: Responsivt panel-layout
**Files:** Modify `ui/styles.css` (:114 grid), `ui/workspace.js` (~:13-31 surfaceOpen/panel + :501-521), `ui/viewport.js` (:8 default 420, :18-27 split), tests `tests/*viewport*`/`tests/workspace*`.
**Interfaces:** Produces `clamp(420px, 35%, 720px)` startbredde for chat-kolonnen i BÅDE CSS (grid-template-columns) og viewport.js' `--chat-width`-init (ingen inline-værdi før brugerens første træk); gemt bredde (harness-workspace-layout-v1) vinder altid.
- [ ] Fejlende test: default-bredde følger viewport (smal→420, bred→≤720); gemt bredde respekteres efter genstart; divider-træk fungerer (eksisterende test består).
- [ ] Implementér + verificér resize/genstart/tastatur/minimumsbredder; Divider-træk-testen i verify-desktop består.
- [ ] Commit: "Scale the chat column with the viewport while panel is open".

### Task 3: Typografi-gulv + dialogstørrelser + mørk-blok-test
**Files:** Modify `ui/styles.css` (~20 font-size-regler: :55,201,205,205-208,558,659-660,749,771,1198-1214,1245-1253,1276), `ui/workspace-calm.css` (:32,53,73,79,160), `ui/feedback-layout.css` (:15,57,60), `ui/settings.css`, dialog-regler `ui/styles.css:260,347,848,901,997,1089` + `ui/onboarding-b.css:19`, ny `tests/ui-typography.test.cjs` (gulv + strukturpins) + mørk-blok-rækkefølgestest.
**Interfaces:** Produces typografi-gulv (11px kun tidsstempler/badges; 12px hjælp; 13-14px kontroller; 14-16px prosa) + dialog-størrelsesklasser (`dialog[data-size="confirm"|"wide"|"complex"]` eller klasse-baseret: 480-560 / 880-1040 / 1120-1280px) + struktur-test: styles.css mørk-blok sidst.
- [ ] Fejlende test: ingen font-size < 11px i de berørte stylesheets; dialogbredder pr. klasse; mørk-blok-rækkefølge.
- [ ] Implementér gulv (≈20 steder fra audit) + klasser + tildel pr. dialog; kontrast-måling på de løftede 11-12px-tekster i begge temaer (4.5:1 — juster --calm-faint-brug hvor den fejler).
- [ ] Commit: "Raise the type floor and size dialogs by content class".

### Task 4: Disclosure-komponenten
**Files:** Create `ui/components.css`; Modify `ui/index.html` (tilføj .disclosure til STATISKE folds ~alle `<details>`), `ui/app.js`/`ui/workspace.js`/`ui/live-work.js`/`ui/planning.js`/`ui/idea-refinement.js`/`ui/request-log-view.js`/`ui/deployment*.js`/`ui/project-settings.js`/`ui/approvals.js` (dynamiske renderere får .disclosure på details), `core/ui-assets.cjs`; test `tests/ui-disclosure.test.cjs` (ny).
**Interfaces:** Produces `.disclosure` (kompakt summary: 13px blækfarve, chevron-SVG roterende, 32px klikhøjde, :focus-visible; åben: token-padding, ingen tom minimumshøjde) + `interpolate-size: allow-keywords` + `::details-content`-animation med NATIV fallback (ingen JS). prefers-reduced-motion: global kill (styles.css:331) dækker; manuel hak-kontrol dokumenteres i rapporten.
- [ ] Fejlende test: .disclosure-klasse på alle statiske details (grep-tælling); komponent-CSS eksisterer i manifestet; summary-udseende (CSS-parse: 13px, klik-højde ≥32px).
- [ ] Implementér; ANIMEN testes visuelt i Electron (begge temaer, reduced-motion ON/OFF).
- [ ] Commit: "Add one disclosure component for all fold-out surfaces".

## Amendment (2.11.2026 · efter Parthees beslutninger + Codex-review)

Parthees beslutninger: **B1 ja** (nyt onboarding-trin D6) · **B2 Ny samtale** (stor knap; #new følg=
er Nyt projekt til ⊞ med uændret handler; Ny samtale får EGEN handler) · **B3 topbjælke** (klikbar
arbejdsmåde-chip + chip over composeren i tom tilstand) · **B4: D7 udskydes** (Forløb-fane senere)
· **B5: Nøgletrin (standard)** som default · **B6 ja: D2+D3 erstatter T6; D4 erstatter T7** ·
**Hjælp: '? '-knappen forbliver ved composeren** — de tre hjælpeniveaus betydninger er uændrede;
kun genvejslinjens tekst flyttes til tooltip.

Kilder: deepseek-design-plan.md (Claude-node) + codex-deepseek-design-review.md (9 Required,
ALLE bindende herunder).

### Bindende krav fra Codex-reviewet (gælder alle D-skiver)

- **R1 Tilladelses-pillen:** pillen er et RESUME, ikke reglen. Vis "Projektets tilladelser"
  under Byg når et samlet udsagn ikke findes; "Spørg før ændringer" KUN når det faktisk gælder
  (approvals-policy.cjs:206-234: taskRules, autoProjectFiles, sandbox, gemte regler). "Slå fra"
  forbliver ét klik — også når Byg-menu er skjult. FIRE interne værdier (chat/plan/free/build);
  "Byg den valgte plan" må aldrig blive til fri bygning ved flytning.
- **R2 Timing:** step-register med ÉN monoton observationsklokke; `session.step.streamed` er
  streamens slutpunkt (verificeret prøve); native `started` må ikke trækkes fra performance.now;
  gamle ture/dobbelte step-slut/andre sessioner afvises (engine.cjs ejerskabskontrol). Etiket:
  **"Observeret svarhastighed"** — aldrig "provider-dekodning". Recovery-snapshot får ingen nye
  tider. Hvis instrumenteringen ikke er klar, bygges D5 uden hastighedstal ("–").
- **R3 Målekontrakt:** hvert step bindes til samtale/tur/engine/modelbinding + stabilt step-id;
  hver værdi har kendt/ukendt/øvre-grænse + kilde + enhed; samme stepmængde i tæller og nævner;
  umålte steps udelades af delaggregatet; modeltid/værktøjstid kræver kvalificeret kilde;
  runSteps er pr.-opgave — samlede tal mærkes **"Målt siden denne appstart"**; Privacy Gate-
  runtime = ukendt hastighed; indholdsfri DTO til rendereren (ikke diagnostics-buffer).
- **R4 Kontrast-tokens:** særskilte tokens til læsbar sekundær/tertiær, dekorativ caption,
  accent-tekst og ikon-på-accent. Tertiær på hvid (3,7:1) og caption (2,1:1) må IKKE bære
  nødvendig tekst; accent-tekst 12-14px = mørkere variant (fed skrift hjælper IKKE); hvid pil på
  mørk accent (2,3:1) = mørkt ikon eller mørkere knapflade; alpha/blur-menuer måles over
  sammensat baggrund + uigennemsigtig fallback.
- **R5 Kortlægningstabel FØR flytning:** gammel kontrol/id → ny placering → uændret handler →
  nyt bindingspunkt → regressionsprøve. #new beholder newProject-handler; Ny samtale = ny
  handler (afsenderklade + uden-projekt-flow specificeret). (+)-menuen har ALLE FIRE stier
  (Tekst og kode / Referencemappe / PDF-dokument / Billede). Pladsholderen lover IKKE "/" og "@"
  (findes ikke i dag). Alle FEM samtalestatuser (arbejder/venter/klar-til-at-flette/nyt
  resultat/afbrudt) bevares. Sidebar-bredde = NY NØGLE i layout-objektet (overskriver aldrig).
- **R6 Ingen private tænkeuddrag:** "Forbereder svaret" med fase/varighed fra stream-progress.
  "Alle detaljer" = alle eksisterende tilladte arbejdsdetaljer. Intet resoneret indhold vises.
- **R7 Hjælpeniveauer uændrede; transcriptView:** gemmes via den fælles profilkø + aura:
  profile-saved; validering i læsning/patch/blank/migration (HELP_VALUES-mønster); Spring over
  bevarer gemt værdi (kun ny bruger → standard); brugerens manuelle foldvalg vinder over niveau;
  9-kombinationsscenarie (3 hjælpe × 3 detaljer med afventende godkendelse) i verifikationen.
- **R9 Kontekst vs. arbejdsgrænse:** "Modelkontekst: input / oplyst vindue" er ÉN måling;
  komprimeringsadvarsel er et SÆRSKILT "Arbejdsgrænse"-forhold fra motorens faktiske input-
  grænse (connections.cjs:241-261, 200k-loft + reserve). 80/95%-farver begrunder KUN kapacitet.

### Byggerækkefølge (Codex R8, bindende)

- **D0 ★ Ikon-sæt** (overtager T8's ikon-del): ui/icons.js, 24×24, currentColor, 1,5px streg;
  egne tegninger eller MIT/ISC-sæt (Lucide ISC) dokumenteret i THIRD_PARTY_NOTICES.md; DSH-ikoner
  kopieres ikke 1:1; T4's midlertidige chevron migrerer hertil. Manifest + licensnote + tests.
- **D1 ★ Sidepanelet** (DSH §3): brandrække, ⊕ Ny samtale (NY handler), Værktøjer/Mere,
  projekter+samtaler med status (5 tilstande), profil-kontorække nederst → #settings-menu.
  R5-kortlægningstabel + alle handlerflytninger + responsivitet (280px std., træk 264-420,
  ny layout-nøgle) i samme skive.
- **D2+D3 ★ ÉN composer-skive** (erstatter T6, integrerer T5): DSH §4+§5 — kort (radius 28,
  soft skygge), (+)-menu ALLE 4 stier, tilladelses-pille (R1), model·indsats-chip, rund Send/
  Stop (R4-kontrast), '? '-knap beholdes, genvejslinje → tooltip; helt-tilstand (§4): centreret
  overskrift + projekt-/arbejdsmåde-chips + T5's idé-chips + resume-banner (delingsadvarsel
  altid synlig); data-phase hero/active/settling; samme --chat-col bredde; ét ankeret popover-
  system (R5: ingen hardcodede koordinater).
- **D4a ★ Profilregler:** profile.transcriptView (compact/standard/detailed, standard='standard')
  via R7-reglerne; Indstillinger › Udseende "Arbejdsdetaljer" (tre radio-kort); body.transcript-*-
  klasser.
- **D4b ★ Trinrækker** (erstatter T7, bygger på D4a + T4's .disclosure.step): §6.3 — 24px enlinje-
  rækker, D0-ikoner, shimmer ved kørsel (reduced-motion: ingen shimmer), grupperække pr. færdig
  tur, R6-reglen (Forbereder svaret), altid-synlige sikkerhedsflader, brugerens foldvalg/fejlstatus/
  streaming bevares 100 %. Topbjælke (§6.1: titel+kbrømme+arbejdsmåde-chip B3+handlingerne) og
  brugerbobler (§6.2) og live-indikator (§6.4) i samme skive.
- **D5a ★ Målekontrakten (backend):** R2+R3 — step-register, indholdsfri DTO, tests (dubletter,
  tool-only, reasoning, afbrydelse, retry, recovery, modelskift, to samtidige samtaler, delvist
  kendte tællere; run-metrics.test.cjs bevares). Kan afkortes: uden hastighedstal hvis ikke klar.
- **D5b ★ Statuslinjen:** §7 — pills under composeren (ture/trin/tok/s + kontekst + cache),
  klik-panel (TTFT-snit, tok/s-snit, forbrug, pris), R9-reglerne, ◔-ring (skjult til kendt
  vindue, warn 80 %/error 95 % på KAPACITET).
- **D6 ★ Onboarding-trin** (B1=ja): §8 — tre radio-kort efter profiltrinnet, statisk valgkant,
  Spring over = gemt værdi (R7), radiogroup + piletaster, eksisterende baggrund.
- **T8-rest ★:** switches (apple-switch-inspireret, udvid styles.css:493), tooltips (hover+klik+
  fokus), MUST-FIX: .approval-kind/.activity-state warning 2,92:1 + accent-på-hvid 4,19:1 +
  var(--surface)7e7-typo + klik-mål ≥24px (effort-ticks, preview-status).
- **D7: UDEN FOR SCOPE** (B4). Montserrat-fravalg + Ny samtale-hierarki = bevidste DESIGN-afvigelser
  (registreret her).

### Åbne profil-fund (fra Claude-nodens review; skal verificeres + rettes i næste fix-runde)

1. repeat-setup: ny forbindelse bruges ikke som standard (ui/app.js:493-494) — verificér mod
   fix-bølge-tilstanden og ret hvis reelt.
2. "Brug"-valg på forbindelse nulstilles af settings-gem (ui/app.js:1566) — verificér og ret.
3. Avatar-dekompressionsbombe (IHDR-tjek FØR afkodning) + avatar-upload uden exclusive() — kendt
   ventelistepunkt, løftes til fix-runde.
