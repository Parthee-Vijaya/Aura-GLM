# Aura GLM beta 2

Udgivelsesdato: 27. oktober 2026. Teknisk version: `1.0.0-beta.2`. Betaudgaven indfører **Electron 45.0.0** som appens nye runtime (overført fra Dependabot-PR #8 og implementeret gennem [afhængighedsprøven samme dag](dependency-electron-45.md)).

DMG og opdaterings-ZIP er bygget fra commit med versionsbump på grenen `work/aura-glm-beta2-electron45-20261027`.

| Artefakt | SHA-256 |
|---|---|
| `Aura-GLM-1.0.0-beta.2-mac-arm64.dmg` | `cd97ad4fd2a00c6325220d86f6fbdf49297f6fdac5bcc7dc8aecaaaa28927b57` |
| `Aura-1-1.0.0-beta.2-mac-arm64.zip` | `28370d9fa1a8bf0a026c3ae4df76437d22fdd2b13dbfda9b174b24467ed73c32` |

## Indhold

- **Runtime-opgradering:** Electron 44.9.3 → **45.0.0.** Hovedskiftet er ført gennem afhængighedsprøven: ingen nye GHSAs, de tre kendte fund består uændret, den indbyggede undici forblev 7.29.1 (samme Node-grundlag 24.22.0) — Auras egen låste undici 7.30.1 forbliver aktiv transport gennem http-runtime-installationen. [Sådan blev det kontrolleret](dependency-electron-45.md).
- **Versionssynkronisering:** Versionsnummeret `1.0.0-beta.2` er indskrevet i appens metadata og verificeret direkte i den pakkede app gennem `app.getVersion()`, [præcis som med de forrige udgivelser](aura-glm-beta-1.md#navneskift-og-identitet).
- **Alt andet fra Aura GLM beta 1:** OpenCode 2.1.4, Privacy Gate, motoropstartsregistrering, CI-vagttjeneste og testbaner uforandret. Navneskiftet til "Aura GLM" i alle UI-tekster og metadata er uændret.
- Opdaterings-ZIP'en hedder bevidst fortsat `Aura-1-…` (se [beta 1-noten](aura-glm-beta-1.md) om afstemning).

## Afprøvning (samme dag)

- **Fra kilde:** Unit-suite 1.923/1.955 beståede med de to kendte miljøfejl fra afprøvningsmiljøet. Fuld AI-brugerrejse mod kontrolleret model bestod.
- **Fra den pakkede app (Electron 45):** `verify-package` består. AI-brugerrejse mod kontrolleret model består alle 9 kontroller, herunder Privacy Gate og krypteret nøgleringsbeskyttelse. Vinduestitlen er kontrolleret direkte fra den pakkede app som "Aura GLM", og versionsstrengen i appens about-metadata er verificeret som `1.0.0-beta.2` gennem `app.getVersion()`. Elektron-runtime-panel: 45.0.0 · Chromium 156.0.8078.48 · Node 24.22.0 · indbygget udici 7.29.1.

## Begrænsninger

- Ad hoc-signeret DMG, **ikke Apple-notariseret**; Gatekeeper advarer ved første start (samme procedure som tidligere betaudgivelser).
- `test:demo` fejler fortsat lokalt på menupunktet ved lille vindue (980×720) på denne afprøvningsmaskine; det er et kendt punkt, uafhængigt af udgaven (samme observation ved beta 1). CI-vagttjenesten ved næste versionstag afprøver på tværs af tre platforme.
- Ingen nuovo betalt modelprøve; alle modelkald foretages mod kontrollerede servere. Opdatering gennem appens opdateringsfunktion er ikke prøvet mellem betaudgivelserne.

## Sådan hentes betaudgaven

- DMG findes færdigbygget i `desktop/release/` på afprøvningsmaskinen (388 MB). SHA-256 verificeres med `shasum -a 256`.
- Brug et separat testprojekt med opdigtede data (arvet råd fra alle tidligere betaudgivelser). Datamappen er fælles med tidligere versioner; Aura 1-testeren genfinder sine forbindelser.

## Fortsættelse

- Elektron-hovedskifte, afhængighedsprøve, versionsmetadata og e2e-beviser er dokumenteret særskilt; se [afhængihedsnotaen for Electron 45](../feedback/2026-10-27-dependency-electron-45.md) og [beta 1-frigivelsens beviser](aura-glm-beta-1.md).
- Åbne rester: Undici 8.x-hovedskiftet (Dependabot PR #1 og #7) er bevidst ikke indført; det afventer en planlagt afhængighedshændelse med genvurdering af afgrænsningen fra [afhængighedsgrænsen 26. oktober](../feedback/2026-10-26-dependency-boundaries.md).
