# Afhængighedskontrol: Electron 45.0.0 · 27. oktober 2026

Kontrollen er foretaget **efter afhængighedsskiftet og førend den nye pakke bygning**. Kontrol omfatter forudsætningerne i afhængighedsgrænsen 26. oktober: låsefilens indhold, aktuelle advisories fra npm-registret, den faktiske runtime samt appens eksisterende afgrænsninger i Aura GLM beta 2 bygget på commit `1.0.0-beta.2` på grenen `work/aura-glm-beta2-electron45-20260927`.

## Hvad blev ændret

| Del | Før → efter | Bemærkning |
|---|---|---|
| Electron (devDep) | 44.9.3 → **45.0.0** | Hovedversionsopgradering fra Dependabot PR #8, flettet på main. Indført withoutad anden afhængighedsændring — undici er bevidst **ikke** opgraderet. |

## Kontrolkonklusioner

- **Låsefilen:** Desktop-afhængigheder er installeret med `npm ci` efter fletningen. Installationen gennemførtes uden fejl, og versionspanelet er aflæst fra den faktiske **Electron 45.0.0-runtime**.
- **Runtime-panelet:** Node-grundlag **24.22.0** (uændret fra 44.9.3), indbygget **undici 7.29.1** (uændret), Chromium **156.0.8078.48**. Node- og undici-grundlaget er dermed uforandret fra 44.9.3; kompatibilitetsprofilen er uændret. Status: Elektron-hovedskiftet ændrer ikke transport- eller runtime-kontrakten.
- **Advisories fra npm-registret:** `npm audit` på desktop giver **ingen nye fund** sammenlignet med afhængighedsgrænsen 26. oktober. Rodmanifestet (CLI + instruktionssuite) giver **0 fund**. Bemærk: `npm audit` i desktop-rapporten ligger altid op mod `npm ci`; tallet er verificerbart ved gentagen kørsel.
- **Åbne advisories:** De tre kendte fund fra afhængighedsgrænsen 26. oktober består uændret: `@anthropic-ai/sandbox-runtime` 0.0.81 (arvet markering), `node-forge` 1.4.0 ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)), `zod` 3.25.76 ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). Ingen af dem afhænger af Electron-versionen. De kompensatoriske afgrænsninger fra [afhængighedsgrænsen 26. oktober](2026-10-26-dependency-boundaries.md) § Afgrænsning i Aura gælder uændret og er ikke ændret ved denne opgradering.
- **Ekstern transport:** Auras egen `undici`-installation (7.30.1) forbliver den aktive transport gennem `core/http-runtime.cjs`. Da Electron 45 låser node- og undici-grundlaget uændret (24.22.0 / 7.29.1), består samme-version-forudsætningen for ikke at blande inkompatible WHATWG-objektidentiteter.

## Afprøvning af den nye runtime

- **Fra kilde:** Unit-suite `npm test`: **1.923 beståede / 1.955** med de to kendte miljøfejl (samme observation som ved beta 1; afprøvningsmiljø, ikke afhængighedsbasen).
- **Fra den pakkede app (Electron 45):** `verify-package` består (isoleret brugerdata, begrænset PATH, medfølgende runtime). AI-brugerrejse mod kontrolleret model: **9/9** beståede kontroller, herunder Privacy Gate-prøve. Versionsstreng verificeret direkte: `app.getVersion()` → `1.0.0-beta.2`, vinduestitel `Aura GLM`.
- **Betaudgivelser:** DMG `Aura-GLM-1.0.0-beta.2-mac-arm64.dmg` (SHA-256 `cd97ad4f…`) og ZIP `Aura-1-1.0.0-beta.2-mac-arm64.zip` (SHA-256 `28370d9f…`). Kontrolsummerne er gemt i `SHA256SUMS-1.0.0-beta.2.txt`.

## Ikke udført

- Undici 8.x er **ikke** opgraderet (Dependabot PR #1 og #7). Det fremkalder en særskilt planlagt afhængighedshændelse med genvurdering af den kompensatoriske afgrænsning og den eksisterende transportkontrakt.
- Node i OpenCode-runtime, CLI-afhængigheder og `runtime-lock.json` er uforandret og ikke prævet.
- Der er ikke foretaget en ny gennemsyn af `node-forge`-anvendelsen i sandbox-koden; afgrænsningsargumentet fra afhængighedsgrænsen 26. oktober diagramvandrer uændret.
