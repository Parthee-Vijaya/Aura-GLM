# Aura Prime: materialesystem og funktionsparitet

Bestilt af Parthee den 11. november 2026: Aura Prime skal være lige så gennemarbejdet som referenceappen, kunne det samme hvor det passer til Aura, og have sit eget udtryk. Parthee har bedt om, at arbejdet går i gang uden yderligere godkendelsestrin.

**Mål:** Erstat tilnærmede enkeltværdier med ét materialesystem (radius, hårstreg, elevation, fokus, accent), og luk derefter de funktionshuller, der giver mening for Auras brugere.

**Tilgang:** Rettelserne laves i de regler, der allerede ejer fladen. Der tilføjes ikke et nyt overstyringslag. En test håndhæver skalaen, så den ikke skrider igen.

**Kilde for referenceværdier:** referenceappens åbne kildekode (MIT), dens temastilark og radiusvejledning, læst 11. november 2026. Auras navn, logo og egne farver bevares.

## Faste rammer

- Ingen funktions-, tilladelses- eller dataændringer i fase 1. Privacy Gate, godkendelser, YOLO-grænser og onboarding B er uændrede.
- Kode og commits på engelsk, dokumentation og UI-tekst på dansk.
- Hele `npm run check` skal bestå. Tests, der fastholder en gammel værdi, opdateres til den nye værdi med begrundelse i commit.
- Visuel kontrol sker på den kørende Electron-app i lyst og mørkt tema. Linux-kørslen her kvalificerer ikke macOS' native vinduesramme.

## Fase 1 · Materialesystemet

| Emne | Før | Efter |
| --- | --- | --- |
| Radius | Over 30 forskellige værdier | 4 / 8 / 12 / 16 / 20 / 28 px samt cirkel og kapsel |
| Skrivefelt | 1 px kant, 24 px, ingen skygge, 2 px blå ramme | Ingen kant, 28 px, blød elevation med 0,5 px streg |
| Neutrale kanter | 1 px | 0,5 px hårstreg (`--aura-hairline`) |
| Menuer og dialoger | Kant plus tung skygge | Elevation alene; stregen ligger i skyggen |
| Fokus | Ring ved ethvert fokus | Ring ved tastatur; rolig tilstand ved museklik på knapper |
| Accent | Referenceappens blå | Auras grønne fra logoet; blå prik bevares i mærket |
| Sidebar | 23 px wordmark, kantet Ny samtale-knap, 38 px rækker | 18 px wordmark, rækker på 36 px med 12 px radius |

Opgaver:

- [x] `desktop/tests/material-scale.test.cjs`: afviser radius uden for skalaen i `desktop/ui/*.css`, kræver elevation-tokens og 28 px panelradius, og afviser neutral kant sammen med elevation på skrivefeltet.
- [x] `ui/aura-tokens.css`: `--aura-radius-panel: 28px`, `--aura-hairline`, `--aura-elevation-soft|panel|prominent`, accentrollerne i Aura-grøn med beregnet kontrast.
- [x] Alle stylesheets: radiusværdier til nærmeste trin efter rolle; neutrale 1 px kanter til hårstreg.
- [x] `ui/workspace-calm.css`: skrivefelt, sidebar, brand og hero.
- [x] `ui/components.css`: menu-materialet uden egen kant.
- [x] `ui/input-modality.js` og fokusreglen: `data-input-modality` på `<html>`.
- [x] `desktop/DESIGN.md`, `CHANGELOG.md` og version.

Bevidst udeladt i fase 1: `@media (hover: hover)` om hover-regler (lille værdi i en desktop-app), sammenlægning af de 14 stylesheets (stor risiko uden visuel regressionstest pr. skærm) og en ny samtalestartstekst.

## Fase 2 · Det, der passer til Aura

Hvert punkt får sin egen gren og beskrivelse.

1. **@-henvisninger i skrivefeltet** til projektfiler og tidligere samtaler. Genbruger slash-menuens popup og går gennem den eksisterende datagennemgang før afsendelse.
2. **Dokumentvisning** i arbejdsfladen for Word, Excel, PDF og Markdown. Kræver nye afhængigheder og en afgørelse om, hvordan de pakkes.
3. **Skills og udvidelser** som én side: skills, integrationer og kommende MCP-forbindelser samlet, i stedet for Funktioner under Indstillinger alene.
4. **Arbejdsspor** med varighed pr. trin og samlet tid.

## Fase 3 · Automatisering

Planlagte og gentagne opgaver, der vender tilbage til deres samtale. Kører kun, mens appen er åben, og hver kørsel følger projektets godkendelser. Kræver afklaring af, hvad en planlagt opgave må gøre uden en bruger ved skærmen.

## Fravalgt

Plugins, der kører med brugerens fulde rettigheder, automatisk godkendelse af værktøjshandlinger, en tilstand med fuld adgang og stemmeinput. De strider mod Auras regel om, at handlinger uden for projektmappen kræver et udtrykkeligt ja.

## Status 12. november 2026

Fase 1 er leveret som 0.7.0-beta.1. Fase 2 og 3 er leveret som 0.8.0-beta.1 i disse afgrænsninger:

| Punkt | Leveret | Ikke leveret |
| --- | --- | --- |
| @-henvisninger | Projektfiler, via de eksisterende filhenvisninger | Tidligere samtaler |
| Dokumentvisning | Word, Excel og PDF som udtrukket tekst i Kode-fanen | Formateret visning; Markdown vises fortsat som tekst |
| Skills og udvidelser | Sidepanelrække, der åbner Funktioner | MCP-forbindelser og en samlet side |
| Arbejdsspor | Antal målte trin og samlet tid i værktøjer | Samlet tid pr. opgave fra start til slut |
| Automatisering | Planlagte opgaver, der lægger teksten klar; du sender | Opgaver, der sender uden en bruger |

De to åbne valg blev afgjort forsigtigt: ingen nye afhængigheder til dokumentvisning, og en planlagt opgave må kun forberede, ikke sende. Begge kan udvides, hvis Parthee beslutter det.

