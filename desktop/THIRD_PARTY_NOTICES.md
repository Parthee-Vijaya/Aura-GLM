# Tredjepartsnoter · Aura Prime desktop

Denne fil er den ene kilde for al tredjepartskode og -materiale, der følger med den
pakkede app — påkrævet af UI/UX-overhaul-planen (docs/uiux-overhaul-plan.md) og
DSH-porteringsreglerne: originalkilde og licens dokumenteres her og i commit-beskeden;
uklar licens = stop og spørg Parthee, før der bygges videre.

## ui/profile-icons.js — profilglyffer (profil-funktionen)

Tre stregglyffer (aura-1, aura-2, aura-3) tegnet specifikt til Aura Prime i
DSH-linjeidiomet (24×24 viewBox, 1,5 px streg, `currentColor`). De er originale
tegninger uden lånt geometri. Heltallet `initials` er egen kode.

## Designgrundlag

Aura-tokens (ui/aura-tokens.css) bygger på DeepSeek Harness'
`packages/client/ui-theme/src/styles/design-platform.css` (MIT,
github.com/deepseek-ai/deepseek-harness) — værdier, ikke kode; ingen CSS- eller
TSX-filer er kopieret 1:1.

## Historik

- 2.11.2026: Et samlet 27-ikon-sæt (D0) blev bygget og vist til preview, men
  afvist af Parthee og udgået; se aura-prime-review/d0-discarded/. Chevronen i
  disclosure-komponenten forbliver den inline SVG, der fulgte med skive T4.
