# Aura Prime 0.6.0 beta 7

Teknisk version: `0.6.0-beta.7`, tag `v0.6.0-beta.7`. Bygget fra `fc972f06370ed6568299bfdd2696f659bd9e161e` til macOS på Apple Silicon. Ad hoc-signeret med hardened runtime og ikke Apple-notariseret.

## Rettelser

Opdateringskontrollen validerer GitHub-udbyderens præcise relative ZIP-navn mod den forventede fulde releaseadresse, mens udbyderens oprindelige downloadoplysninger bevares. Andre filer, stier, arkitekturer, ugyldige kontrolsummer og nedgraderinger afvises fortsat. Feedet indeholder én relativ ZIP-post.

Kommandoovervågningen læser hele den native hjælpers JSON-kvittering, før nul levende underprocesser bekræftes. Stop, rigtig proces-timeout, normal afslutning og brat runner-exit er afprøvet med løsrevne skrivere og en samtidig kommando, som fortsætter. Terminalgrænser, websøgning og MCP forbliver utilgængelige. Planvalg, godkendelser og Privacy Gate er bevaret.

Beta 6 og tidligere tags og installationsfiler er bevaret. Installer beta 7 manuelt fra DMG ved opgradering fra beta 5 eller den første beta 6. De gamle apps har ikke den nye updater-normalisering. Pakkeprøven fra beta 6 bekræfter, at lokale projekter, kladde, forbindelse og pluginvalg overlever.

## Kvalifikation

- Samlet lokal kontrol: **2.755 bestået, 34 sprunget over, 0 fejl**. Afsluttende kontraktprøver: 19/19.
- Faktisk pakket Node og ASAR: 8/8 native prøver af kommandoafslutning, herunder rigtig timeout med SIGKILL.
- Den færdige pakke: 22/22 accepttrin med separat syntetisk profil, opgradering fra beta 6 og lokal modelserver. Dette er profilmigration, ikke automatisk download og installation.
- 11 nye faktiske skærmbilleder fra beta 7. Første åbning er 600 × 700; Nyt projekt ved 980 × 720 har panehøjde 493/493 uden standardscroll i begge temaer. Navn og tema bevares efter rigtig genstart.
- DMG verificeret med hdiutil og appens deep/strict codesign. ZIP og DMG indeholder samme executable, ASAR og kildebevis.
- [Maskinlæsbar kvalifikation og billedhashes](beta7-evidence/qualification.json).

Rigtige udbydernøgler, Windows, Intel-Mac, Linux-kommandokørsel, Apple-notarisering og cloud CI er ikke kvalificeret af de lokale prøver. Beta 6's Intel-CI fejlede under runtime-klargøring med `Invalid Mach-O signature region`; dette er et særskilt åbent platformspunkt. ARM-CI's helper-stdout-fejl er rettet og bestået lokalt i den pakkede app.

## Kontrolsummer

- `Aura-Prime-0.6.0-beta.7-mac-arm64.dmg`: SHA-256 `f0a3599d45d7506a5babdb4eb1f4b661833c5bcfdcfc2116e027e63c30263172`
- `Aura-Prime-0.6.0-beta.7-mac-arm64.zip`: SHA-256 `a90fd97ee76700b9bc047958caa0327782867713fc0a9230fc259a4637694d6e`
- `beta-mac.yml`: SHA-256 `ed4962b4a7feea901817f9e2b3c9cffe1764660becaccc04e566718ef7b50f98`

[Release og downloads](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.7)
