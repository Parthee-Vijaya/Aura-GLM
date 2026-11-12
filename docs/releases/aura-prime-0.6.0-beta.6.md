# Aura Prime 0.6.0 beta 6

Teknisk version: `0.6.0-beta.6`, tag `v0.6.0-beta.6`. Udviklingsbeta til macOS på Apple Silicon, ad hoc-signeret og ikke Apple-notariseret.

## Ændringer

Stop og runnerens afslutning stopper nu også løsrevne underprocesser pr. kommando på macOS. En særskilt værtsovervågning overlever runnerens SIGKILL og timeout. Operativsystemets arvede Seatbelt-beslutninger afgrænser hver kommando, og den native hjælper bekræfter nul levende medlemmer før almindelig afslutning. En privat pipe holder brugerkommandoen tilbage, indtil afgrænsningen er bekræftet. En anden samtidig kommando fortsætter.

Samme levetidskontrol gælder eksplicit godkendte almindelige kommandoer uden at give dem nye fil- eller netrettigheder. Automatisk kommandokørsel med denne garanti er ikke tilgængelig på Linux eller Windows. Terminalgrænser forbliver utilgængelige, fordi samlet output- og outputfil-loft stadig mangler. Websøgning og MCP forbliver utilgængelige. Planvalg, godkendelser, Privacy Gate og YOLO-grænser er bevaret.

Beta 6 samler desuden forbindelsestjek i trin, oplyste modelevner, kontekstvisning, forklaring af ventetid, søgning efter lokale servere, dato på leverandørvilkår og Cloudflare-kontohjælp fra den aktuelle gren. README viser faktiske billeder fra den færdige app med syntetiske data.

## Installation og kvalifikation

Åbn DMG'en og træk Aura Prime til Programmer. Første åbning kan kræve højreklik og Åbn. Opgradering fra beta 5 afprøves med særskilt syntetisk profil og lokal modelserver. Dette er en profilopgradering, ikke en prøve af automatisk download.

Pakken er bygget fra kildecommit `0cce3b8a9a52cf4a36912fd00eb1578e80b8aab9` med Electron 45.0.0 og den låste Node 22.23.3-runtime.

- Samlet lokal kontrol: **2.753 bestået, 34 sprunget over, 0 fejl**.
- Den faktiske pakkes procesprøve: **8 af 8 bestået**, inklusive samtidighed og løsrevne skrivere.
- Pakkeaccept med opgradering fra beta 5: **22 trin bestået**. Projekt, kladde, nøglefri forbindelse og pluginvalg følger med. Den syntetiske model kører lokalt; prøven registrerede nul nøgleopslag.
- Native optagelse: **11 billeder**, begge temaer, 980×720 uden standardscroll, profilvalg og rigtig genstart med bevaret navn og tema.
- `codesign --verify --deep --strict` består for den færdige app og kopier fra DMG/ZIP. Artefakternes kildefiler, runtime og signaturidentitet er kontrolleret.
- Den tidligere native MCP-`ECONNRESET` kunne ikke genskabes i den fokuserede prøve eller den samlede slutkontrol. Ingen fejl er skjult.

[Struktureret kvalifikationsgrundlag](beta6-evidence/qualification.json).

| Artefakt | SHA-256 |
|---|---|
| `Aura-Prime-0.6.0-beta.6-mac-arm64.dmg` | `ba1f95dd57c72ea041ea5885db428b5c4ffc2ea9dc96367a1abfaa9e57ad80b8` |
| `Aura-Prime-0.6.0-beta.6-mac-arm64.zip` | `87006359ae1afd8453e7a346420f115f6e9e46b1f9da9ee84a165b600519936e` |
| `beta-mac.yml` | `134b0babfba6b9f028f941b42695fec5f30b1b029feada9a66dd37bd5b0ccc6b` |
 Apple-notarisering, Windows, Linux, Intel-Mac og rigtige udbydernøgler er ikke kvalificeret af denne release.

[Release og kontrolsummer](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.6)
