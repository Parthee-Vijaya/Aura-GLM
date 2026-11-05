# Aura Prime 0.6.0 beta 6

Teknisk version: `0.6.0-beta.6`, tag `v0.6.0-beta.6`. Udviklingsbeta til macOS på Apple Silicon, ad hoc-signeret og ikke Apple-notariseret.

## Ændringer

Stop og runnerens afslutning stopper nu også løsrevne underprocesser pr. kommando på macOS. En særskilt værtsovervågning overlever runnerens SIGKILL og timeout. Operativsystemets arvede Seatbelt-beslutninger afgrænser hver kommando, og den native hjælper bekræfter nul levende medlemmer før almindelig afslutning. En privat pipe holder brugerkommandoen tilbage, indtil afgrænsningen er bekræftet. En anden samtidig kommando fortsætter.

Samme levetidskontrol gælder eksplicit godkendte almindelige kommandoer uden at give dem nye fil- eller netrettigheder. Automatisk kommandokørsel med denne garanti er ikke tilgængelig på Linux eller Windows. Terminalgrænser forbliver utilgængelige, fordi samlet output- og outputfil-loft stadig mangler. Websøgning og MCP forbliver utilgængelige. Planvalg, godkendelser, Privacy Gate og YOLO-grænser er bevaret.

Beta 6 samler desuden forbindelsestjek i trin, oplyste modelevner, kontekstvisning, forklaring af ventetid, søgning efter lokale servere, dato på leverandørvilkår og Cloudflare-kontohjælp fra den aktuelle gren. README viser faktiske billeder fra den færdige app med syntetiske data.

## Installation og kvalifikation

Åbn DMG'en og træk Aura Prime til Programmer. Første åbning kan kræve højreklik og Åbn. Opgradering fra beta 5 afprøves med særskilt syntetisk profil og lokal modelserver. Dette er en profilopgradering, ikke en prøve af automatisk download.

Endelige kildeidentiteter, testresultater og artefaktkontrolsummer tilføjes efter pakkekvalifikationen. Apple-notarisering, Windows, Linux, Intel-Mac og rigtige udbydernøgler er ikke kvalificeret af denne release.

[Release og kontrolsummer](https://github.com/Parthee-Vijaya/Aura-Prime/releases/tag/v0.6.0-beta.6)
