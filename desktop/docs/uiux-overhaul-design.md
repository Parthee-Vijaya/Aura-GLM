# UI/UX-overhaul · Design (2.11.2026)

Parthee-bestilling: (1) skaleringsfejl ("chatboksen skalerer ikke med"), (2) "amateur-agtige
fold ud vindue hvor når der er foldet er meget langt og tomt felt med lille tekst",
(3) moderne komponenter fra Fisher UI (jakobfisker.dk/da/ui) porteret til Auras vanilla-stak.
Godkendt til byg: skive 1-4 straks; skive 5-8 efter preview-godkendning pr. skive.
Design grundlag: audit (uiux-brief.md) + Claude-uiux.md + Codex-uiux.md (rådgiverplaner).

## Mål

1. Composer og samtaletekst deler præcis samme kant; ingen modstridende bredde-regler.
2. Store skærme (≥1600px) udnyttes: panel-åben-chat skalerer, dialoger får indholds-
   bestemte størrelser, typografien har et læsbart gulv.
3. Alle ~40 fold-ud-flader føles som én pæn komponent: kompakt lukket, højdeanimeret åben.
4. Fisher-inspireret modernisering af composer, turoversigter og kontroller.

## Ikke-mål

- Ingen framework-migrering (ren DOM/CSS); ingen omskrivning af onboarding B eller
  godkendte forløb (Privacy Gate, YOLO, planer, godkendelser); ingen dekorations-portering
  (liquid-metal, konfetti, carousels, thinking-orbs, wheel-picker).

## Anti-mål

- Ingen React/Tailwind-kodekopiering fra Fisher-komponenter — vanilla-genimplementering
  med dokumenteret kilde + licens pr. port (THIRD_PARTY_NOTICES + commit-besked);
  uklar licens ⇒ spørgsmål til Jakob Fisker FØR portering.
- Ændringer af godkendte flader (skive 5-8) må ikke committes uden Parthees
  preview-godkendning.
- styles.css' mørk-tema-blok (linje ~1356) forbliver filens sidste — nye regler lægges
  før; en struktur-test håndhæver rækkefølgen.

## Kernetal (begge rådgivere syntetiseret)

- **Indholdsramme:** ét token `--chat-col` (800px basis; 960/1040 ved ≥1600/≥2000 er
  beholdt); gutter (22px) udenfor rammen — composer og tekst rammer samme kant (max 1px
  afvigelse).
- **Panel-åben chat-kolonne:** `clamp(420px, 35%, 720px)` — implementeres i CSS OG i
  viewport.js' `--chat-width` (inline-stil vinder over CSS); brugerens gemte trækbredde
  respekteres fortsat.
- **Dialog-størrelsesklasser:** bekræftelser 480-560px; forbindelser/funktioner 880-1040px;
  opgave-/data-dialoger 1120-1280px; alt begrænset til viewport − gutter; indhold bestemmer
  højden; kun én scrollregion pr. dialog.
- **Typografi-gulv:** 11px KUN sekundære tidsstempler/badges; 12px hjælpetekst;
  13-14px labels/kontroller; 14-16px samtaleprosa. Kontrast mindst 4.5:1 (11-12px tekst
  særligt kritisk — `--calm-faint` på genvejslinjen skal måles i begge temaer).
- **Hero:** `min(640px, 100%)`-orden (~60-70ch), clamp på overskrift, ingen stor vh-luft
  ved lave vinduer.
- **Disclosure-kontrakt:** native `<details><summary>` + eksisterende id'er bevares;
  én opt-in-klasse `.disclosure` med kompakt summary (13px blækfarve, roterende chevron,
  32px klikhøjde, :focus-visible) + højdeanimation via `interpolate-size`/`::details-content`
  (Chromium ≥131; Electron 45 opfylder) med NATIV åbning som fallback — ingen JS-reserve
  uden konkret runtime-behov.

## Skiver (1 commit-sgruppe pr. skive; preview-gate markeret ★)

1. **Én indholdsramme:** --chat-col-token, gutter-omlægning, rydning af modstridende
   720/800/960/1040-regler. Kun CSS.
2. **Panel-åbent + responsivt layout:** clamp i CSS + viewport.js; resize/genstart/tastatur/
   minimumsbredder testes.
3. **Typografi-gulv + dialogstørrelser:** ~20 små tekststørrelser løftes; dialogklasser.
4. **Disclosure-komponenten:** .disclosure på alle statiske folds (grundlaget), derefter
   de dynamiske renderere.
5. ★ **Idé-valg (tags/chips) + resume-banner:** #idea-options → chips med valgt værdi
   synlig; tekniske valg samlet ét sted; resume-notice → inline-banner (kun forklaringen
   folder; delingsadvarslen forbliver synlig på ALLE hjælpeniveauer — commit 2e79ed0).
6. ★ **Moderne composer (prompt-input):** Fisher-inspireret med eksisterende handlinger;
   ét ankeret popover-system (model-picker er allerede JS-ankret — app.js:2566; foren
   med mode-menu og info-pop; ingen overlap ved divider/zoom/lange modelnavne).
7. ★ **Turoversigt + værktøjsresultater:** task-rows/tool-result-stil på work-progress og
   aktivitetsfolds; brugerens foldvalg, fejlstatus og streaming bevares.
8. ★ **Kontroller + ikoner:** apple-switch på alle checkboxes (udvid styles.css:493);
   SVG-ikonsæt erstatter unicode-glyffer; tooltip erstatter ⓘ-knap (hover + klik, WCAG-AA).

## Verifikation pr. skive

Fuld suite (2.258) + test:desktop 13/13 + berørte verify-scripts (layout/workspace,
planning/resume, chat/conversation-progress, approvals efter flade) + visuel Electron-
kontrol i begge temaer ved smalt/1440/1920/3840px og zoom 13/16/200% + før/efter-
skærmbilleder. WCAG: kontrast 4.5:1, fokusring 3:1, målstørrelse ≥24×24px, reflow ved
320px. Test-strukturpins opdateres i SAMME commit (settings-fontsize.test.cjs:291 piner
selektorer og deklarationer); adfærddsbeviser bevares.

## Risici (håndteres løbende)

Mørk-tema-blok sidst (test tilføjes); prefers-reduced-motion skal også dække
allow-discrete-hak (manuelt tjek); forced-colors: ikoner currentColor, chips/switches
med kant ikke kun baggrund; godkendelser/Privacy Gate/YOLO/onboarding B får eksplicit
regressionskontrol ved hver berørt ændring; Fisher-licensdokumentation pr. port.
