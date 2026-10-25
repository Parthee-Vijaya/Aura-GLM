# Bidrag til originalen efter Aura 1 beta 0.3.1

**Efterslæb efter den udgivne 0.4.0, opdateret 25. oktober 2026.** Ingen PR’er er oprettet, opdateret, lukket eller flettet som del af denne releaseforberedelse.

Fordelingen nedenfor bygger på de aktuelle lokale ændringer og [den senest dokumenterede PR-gennemgang](upstream-status-20261025.md). Det er ikke et nyt live-check af originalens main eller PR-heads. Før indsendelse skal den relevante PR og originalens nyeste main læses igen, og ændringen skal afprøves på den pågældende gren. Ved overlap opdateres den eksisterende PR frem for at oprette en dublet.

## Foreløbig fordeling

| Rækkefølge | Lokal tilføjelse | Foreslået placering | Afgrænsning og bevis før indsendelse |
|---|---|---|---|
| 1 | Design styret af eksisterende skills, valgt model og dokumenterede brandkilder | Opdatér [#23](https://github.com/ai-alliancen-org/ai-harness/pull/23); tilpas aktiveringsbindinger i [#43](https://github.com/ai-alliancen-org/ai-harness/pull/43), hvis nødvendigt | Overfør skilltekst, komponentreferencer og eksportpakker. Ingen fast opgavepalette. Dokumentér første indlæsning, brugerens valg, officielle kontra foreslåede kilder og de gennemgåede modelprøvers begrænsninger. |
| 2 | Én formatrettelse og passende svarbudget i idéhjælpen | Opdatér [#44](https://github.com/ai-alliancen-org/ai-harness/pull/44) | Samme model, destination og gennemgåede materiale, én samlet tidsfrist, virksomt Stop og ingen lokal afkortning af projektbeskrivelsen. Test lange og ugyldige svar samt ændrede forbindelser. |
| 3 | Tydeligere lyskant under arbejde | Opdatér [#18](https://github.com/ai-alliancen-org/ai-harness/pull/18) | Bevar originalens UI omkring feltet. Vis native før/efter af aktivt arbejde, pause, Stop, fejl og reduceret bevægelse. |
| 4 | Forståelig aktivitetsvisning med tekniske detaljer skjult som standard | Afstem overlap med [#46](https://github.com/ai-alliancen-org/ai-harness/pull/46) og [#47](https://github.com/ai-alliancen-org/ai-harness/pull/47), før placeringen vælges | Overfør kun det godkendte aktivitetstillæg. Planer, godkendelsesbeskeder og filgennemgang skal stadig kunne ses. Ved et selvstændigt bidrag skal det afgrænses fra arbejdsområdets og forhåndsvisningens eksisterende PR’er. |
| 5 | Manglende patchtekst hentes fra den præcise kørende værktøjshandling | Kandidat til en separat fejlrettelse, efter overlapkontrol | Vis fejlen uden gyldig patchtekst og resultatet med præcis binding til session, besked, call og pending-anmodning. Fejlmatch, Stop, afvist handling, symlinks og eksterne mål må ikke få tilladelse. Dette er ikke en ny YOLO-funktion. |
| 6 | Lokal kontrol af statiske webapps og højst to modelrettelser | Kandidat til en separat funktions-PR | Skil programkontrollen fra design-skills. Dokumentér snapshots, fil- og netgrænser, sikre fejltyper, samlet opgave, Stop og eksisterende godkendelser. Vis ægte før/efterfund og markér ikke understøttede apps ærligt. |
| 7 | OpenEnv-pilot og dokumenterede modelprøver | Kandidat til et separat evalueringsbidrag eller tilhørende testdokumentation | Hold modeladgang og private prøvedata ude af repoet. Samme opgave og vilkår skal kunne kontrolleres. Forskellig transport og fejlede forsøg bevares synligt; ingen rangliste eller kvalitetsgaranti udledes af én opgave. |

Eventuelle nye produktrettelser fra den opfølgende GPT-undersøgelse fordeles først, når årsag og rettelse er verificeret. Hvis de tilhører genforsøg eller genoptagelse, skal overlap med [#41](https://github.com/ai-alliancen-org/ai-harness/pull/41) og [#42](https://github.com/ai-alliancen-org/ai-harness/pull/42) vurderes før en ny PR.

## Bevarede bidrag og forkens egne ændringer

YOLO under Byg, den altid aktive designgrundpakke, rettet projektoprettelse og versionsmærket er allerede dokumenteret i #45, #43, #49 og #50. De genindsendes ikke som nye funktioner i denne ændringsserie. Eksisterende PR’er til originalen forbliver urørte under forkens releasearbejde.

Navnet Aura 1, version `0.4.0-beta.2`, forkens releaseadresse og opdateringsfeed er distributionsændringer i forken. De hører ikke med i generiske bidrag til originalen. Historisk #48-overlap skal fortsat håndteres særskilt og er ikke løst af dette dokument.

## Status og næste dokumentation

- Produktændringerne er gemt i `95c7056b18cf8ec22df51ac45e460404faabf483`. Lokal kildekode og rapporter er bevaret.
- 840 desktop-, 27 CLI- og 24 evalueringstests samt syv native regressioner består. Et helt forløb med rigtig Mistral består fra idé til bygning, rettelse, fortryd og genstart; en ekstra rigtig AI-prøve direkte fra den færdige DMG afventer macOS-nøgleringen.
- Med samme borgermødeopgave, skills og originale Nyborg-logoer bestod Mistral 24/26 og Corti 14/26 browserkontroller. Ingen fuld offentlig designmanual blev fundet. Rapporten viser konkrete restfejl og en begrænsning i Mistral-prøvens værktøjspolitik.
- Den opfølgende GPT-prøve gav en urørt app, der består 26 browserkontroller, men agentforløbet ramte 900 sekunders tidsfrist efter to transporttimeouts. Den er delvis transportvalidering, ikke dokumentation for løst stabilitet eller tre identiske, fejlfri modelkørsler.
- Før/efterbilleder til kommende PR-opdateringer skal komme fra de faktiske relevante grene. Historiske screenshots og billeder af modelgenererede apps må ikke fremstilles som bevis for en anden UI-version.
- [Release-noterne](../releases/aura-1-beta-0.4.0.md) adskiller beståede prøver, åbne fejl og afventende kontroller.

Ved næste commit/push opdateres dette efterslæb med den faktiske produktcommit og eventuelle nye forskelle. En lokal release ændrer ikke i sig selv en upstream-PR’s status.
