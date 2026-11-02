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

### Task 5 ★: Idé-valg som chips + resume-banner (preview før commit)
**Files:** Modify `ui/index.html` (:119-125 #idea-options), `ui/idea-refinement.js`, `ui/composer-help.js` (hvis hint-flytning), `ui/app.js` (resume-notice-rendering :725, :1186-1208 datafolds), `ui/components.css`, `ui/workspace-calm.css`; test: `tests/*idea*`/`tests/*resume*` + verify-planning/verify-chat.
**Interfaces:** #idea-options → chip/tags-picker (radio-chips for platform/data/UI/design; valgt værdi SYNLIBAR på chippen; "Tekniske ønsker" som ÉN flad sektion, ingen nested details); resume-notice → inline-banner (kun forklaringen folder; delingsadvarslen altid synlig — 2e79ed0-reglen). Samme gemte værdier og brief-output (idea:*-payload uændret).
- [ ] Preview til Parthee (screenshots begge temaer) → accept → commit.

### Task 6 ★: Moderne composer + ét popover-system (preview før commit)
**Files:** Modify `ui/index.html` (composer), `ui/app.js` (model-picker :2566, mode-menu), `ui/conversation-mode.js`, `ui/feedback-layout.js`/`.css`, `ui/workspace-calm.css`, `ui/styles.css` (:1314); test: composer/tests + verify-chat.
**Interfaces:** Prompt-input-inspireret composer (Fisher prompt-input/prompt-input-2: aktivér-og-udvid-antydning, chips, runde handlinger — bevarendes: alle eksisterende handlinger, genveje, materialer, arbejdsmåde, YOLO-adfærd) + ÉT popover-system ([popover] + ankeret positionering; model-picker er allerede JS-ankret — foren mode-menu + info-pop til samme mekanik; hardcodede koordinater ud). Ingen overlap ved divider, zoom, lange modelnavne.
- [ ] Preview → accept → commit. THIRD_PARTY_NOTICES: prompt-input-kilde + licens.

### Task 7 ★: Turoversigt + værktøjsresultater (preview før commit)
**Files:** Modify `ui/live-work.js` (:17-27 work-progress-card), `ui/workspace.js` (:461-476 activity-output), `ui/styles.css` (:1238-1266, :659-660), `ui/components.css`; test: conversation-progress-verify + existing fold-behavior tests.
**Interfaces:** task-rows/tool-result-inspireret: summary-række med status-markering (✓/!/·-glyffer → SVG), tidsstempler, roterende chevron; åben = trinliste med token-afstande; NESTET teknisk fold beholdes som .disclosure. Brugerens foldvalg (auto-kollaps + manuel override), fejlstatus og streamingforløb bevares 100%.
- [ ] Preview → accept → commit. Notices: task-rows/tool-result-kilder.

### Task 8 ★: Kontroller + ikoner + tooltips (preview før commit)
**Files:** Create `ui/icons.js` (SVG-sæt); Modify `ui/settings.js`/`ui/settings.css`, `ui/styles.css` (:39 checkbox, :511-515 ⓘ, :493-497 pill-switch udvides), `ui/index.html`, relevante renderere (≡ ◇ ⌄ ▸ ✦-glyffer); test: settings/app-name + nye ikon-tests.
**Interfaces:** apple-switch-inspireret switch på ALLE checkboxes (spring-motion via CSS, tastatur=eksisterende native, drag valgfrit); SVG-ikonsæt (currentColor, 24×24) erstatter unicode-glyffer på chat-choice/navigation/menu/progress; tooltip-komponent (hover + klik + fokus, WCAG-AA) erstatter ⓘ-pop. Native selects bevares i denne skive (listbox-erstatning er egen fremtidig skive — undgå scope creep).
- [ ] Preview → accept → commit. Notices: apple-switch-kilde.

## Efter Task 8

Efter-byg-brief til begge rådgivere på HELE deltaet → fix-bølge → merge til main → CI → projekthukommelse. DMG-beta.18-releasen kan herefter overvejes samlet.
