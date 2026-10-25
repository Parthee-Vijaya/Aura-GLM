# Aura 1 beta 0.4.0

**Kommende udgivelse — endnu ikke offentliggjort.** Dette dokument er klargjort den 25. oktober 2026. En test med status “afventer” er ikke gennemført eller godkendt af dette dokument.

| Oplysning | Status |
|---|---|
| Synligt navn | Aura 1 beta 0.4.0 |
| Planlagt teknisk version og tag | `0.4.0-beta.2` / `v0.4.0-beta.2` |
| Platform | macOS, Apple Silicon / arm64 |
| Kildecommit i den færdige pakke | `95c7056b18cf8ec22df51ac45e460404faabf483`; 215 kilde-/profilfiler kontrolleret |
| Release | [Kommende releaseadresse](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v0.4.0-beta.2); endnu ingen verificeret download |
| Senest udgivne version | [Aura 1 beta 0.3.1](https://github.com/Parthee-Vijaya/ai-harness/releases/tag/v0.3.1-beta.1) |

Versionsstigningen følger den samlede funktionelle udvidelse med appkontrol og godkendt aktivitetsvisning. Det historiske tag `v0.4.0-beta.1` er allerede optaget og flyttes ikke. Den synlige version er 0.4.0; beta-iterationen er teknisk metadata. Se [versionsreglen](POLICY.md).

## Ændringer

### Designhjælp fra de eksisterende skills

Aura indlæser hovedskillen i idéhjælp, planlægning og bygning. Modellen udarbejder designet ud fra opgaven, brugerens godkendte valg og dokumenterede brandkilder. Kommunens navn er ikke i sig selv dokumentation for officielle logoer, farver eller skrifter. Lokale designguides og `BRAND.md` kan indgå i konteksten; usete kilder skal beskrives som usete.

De afprøvede faste opgavepaletter og layoutopskrifter er taget ud af runtimeinstruktionerne. Skills kan stadig foreslå en konkret retning og komponentinspiration, herunder Fisher UI, når det passer til opgaven. Det giver ikke ekstra netadgang, installationsret eller licens til at kopiere eksternt materiale. Historisk forsøgs- og testkode bevares lokalt.

Læs [designskillens indhold og grænser](../aura-design-skill.md).

### Idéhjælp med afgrænset formatrettelse

Idéhjælpen giver plads til både modellens tænkning og det synlige svar inden for modellens oplyste loft. Et afsluttet svar i forkert format eller med for lange felter kan få én formatrettelse hos samme model. Aura afkorter ikke beskrivelsen lokalt for at få den til at passe.

Forbindelse, model, rute og den gennemgåede afsendelse kontrolleres igen. Én samlet tidsfrist og Stop gælder for begge kald. Der tilføjes ingen nye værktøjer eller data. Idéforslaget erstatter ikke en godkendt byggeplan.

### Lokal kontrol af genererede webapps

Efter relevante ændringer i `public/` afprøver Aura en uforanderlig kopi i en separat, skjult Electron-session. Eksternt netværk, Node-adgang, brugerens browserdata og øvrige projektfiler er ikke tilgængelige i prøven.

Kontrollen undersøger desktop og mobil samt et afgrænset antal enkelte klik. Den kan finde runtimefejl, vandret overløb, dækkede overskrifter, ødelagte lokale billeder og lav tekstkontrast, når farver og baggrund kan måles sikkert. Lokale skærmbilleder og rapporter er prøvebeviser; de sendes ikke automatisk til modellen.

Ved konkrete fejl kan samme model få højst to rettelsesforsøg inden for samme opgave, plan og samtale. Eksisterende godkendelser gælder. Stop, ændrede forudsætninger eller en tidligere afvist handling forhindrer automatisk fortsættelse. Den lokale kontrol vælger ikke et fælles visuelt tema.

Læs [kontrollens understøttede projekter og begrænsninger](../design-quality-control.md). En statisk kontrol er ikke en fuld prøve af formularer, ordre-, betalings- eller loginforløb, og et teknisk bestået resultat er ikke en æstetisk godkendelse.

### Aktivitet og filgennemgang

Den godkendte aktivitetsvisning beskriver arbejdet i forståelige trin, mens kommandoer og tekniske detaljer kan åbnes efter behov. Lyskanten om skrivefeltet markerer igangværende arbejde. Plan- og værktøjsgodkendelser bliver stadig vist særskilt.

En ventende filpatch, som mangler patchtekst i hændelsen, kan hente teksten fra præcis den tilsvarende kørende værktøjshandling. Bindingen omfatter blandt andet session, besked, call og aktuel anmodning. Den eksisterende godkendelsespolitik vurderer derefter handlingen normalt; hydreringen giver ingen ekstra tilladelse.

## Bevaret adfærd

Onboarding B, øvrig godkendt UI, projektoprettelse, modelvalg, vedhæftninger, referencemapper, samtaler, planer, godkendelser og adgangsgrænser skal bestå de afsluttende regressioner. Den allerede implementerede YOLO-indstilling er bevaret baseline, ikke en ny funktion i denne ændringsserie. Den gør ikke datadeling, beskyttede filer eller planer automatisk tilladt.

Bundle-, profil- og nøgleringsidentiteter bevares. Den installerede 0.3.1 og eksisterende brugerdata ændres ikke af dokumentationsarbejdet. Appversionen skal fortsat komme fra den kørende apps metadata.

## Afprøvning og udgivelsesstatus

| Kontrol | Aktuel dokumenteret status |
|---|---|
| GPT-6.1 gennem Auras normale arbejdsgang | Den opfølgende prøve skrev appen gennem to konkrete Aura-godkendelser og uden håndrettelser. Den urørte app bestod 26 browserkontroller. Agentforløbet ramte dog sin tidsgrænse på 900 sekunder efter to transporttimeouts; Auras egen appkontrol nåede ikke at starte. Stabiliteten er derfor fortsat et åbent punkt. Transporten brugte den eksisterende Codex-adgang, ikke en ny produktforbindelse. |
| Opgave med en faktisk kommunal designguide | Samme borgermødeopgave, 11 skills og originale Nyborg-logoer hos Mistral og Corti. Mistral 24/26 og Corti 14/26 browserkontroller bestod. Fuld offentlig designmanual blev ikke fundet; egne UI-farver er ikke verificeret kommunal identitet. [Rapport og screenshots](../../evals/openenv/BRAND-MODELS-2026-10-25.md). |
| Samlet desktop- og CLI-regression på slutkoden | 840/840 desktop, 27/27 CLI og 24/24 evalueringstests. Produktkoden blev efterfølgende committet uden andre ændringer end versionsmetadata. |
| Native appforløb i separat profil | Rigtig Mistral gennemførte idéhjælp → plan → bygning → rettelse → fortryd → genstart. Filter 1/5/9/99 virker på desktop og mobil. Fortryd genskaber byteidentiske filer; samtale/model/preview bevares. Prøven fra den færdige DMG afventer macOS-nøgleringen. |
| Aktivitet, glow og bevaret UI | Synlig, animeret arbejdskant målt under rigtige Mistral-kald. Native prøver af composer-glow og conversation-progress består. |
| Native regression med kontrolleret modelserver | Alle syv forløb består: opsætning, arbejdsområde, planlægning, godkendelser, genoptagelse, lyskant og samtalestatus. Disse prøver er særskilte fra de rigtige AI-kørsler. |
| Faktisk DMG og opdaterings-ZIP | Bygget fra produktcommitten. DMG-checksum, ZIP-integritet og byte-/mode-/symlink-sammenligning af 11.332 poster består. |
| Pakkens kildebevis, runtime og kontrolsummer | Kildebevis og medfølgende OpenCode 1.18.33 / Git 2.53.0 / Node 22.23.3 kontrolleret. Den monterede app starter med begrænset PATH og viser reelt preview. |
| Appsignatur og notarisering | Ad hoc-signatur består dyb og streng codesign-kontrol. Ingen Developer ID-notarisering. |
| GitHub CI | Forkens GitHub API viste 0 kørsler og 0 checks på main før push. Lokal afprøvning er ikke grøn GitHub CI. |
| Intel-Mac, Windows og en anden fysisk Mac | Ikke kvalificeret af denne planlagte Apple Silicon-pakke. |
| Release, feed og downloadbytes | Afventer publicering og kontrol af de faktisk uploadede filer. |
| Oprydning | Afventer verificeret udgivelse; ingen lokal kildekode må slettes. |

Den [tidligere modelsammenligning](../../evals/openenv/MODELSAMMENLIGNING-2026-10-25.md) dokumenterer rigtige Mistral- og Corti-kørsler med fiktive appdata, både funktionelle restfejl og manglende visuel polering. GPTs supplerende filreference blev lavet gennem en anden arbejdsgang. Resultaterne må ikke omskrives til tre ens, fejlfri Aura-prøver. De er heller ikke en native end-to-end-kvalifikation af den kommende DMG.

De verificerede kilde-, pakke- og native resultater findes i [evidensmappen](beta-0.4.0-evidence/). Tidlige fejl i prøvescripts er bevaret i rapporterne sammen med de efterfølgende beståede prøver. Afventende resultater opdateres efter faktisk gennemførelse. Historiske 0.3.1-billeder må ikke mærkes som nye 0.4.0-billeder.

## Distribution og kendte grænser

Der planlægges kun tre release-assets: DMG, opdaterings-ZIP og `SHA256SUMS.txt`. Kildecommit, runtimeversioner, manifeste og kontrolsummer skal dokumenteres fra de faktiske pakker. En grøn kildeprøve alene er ikke pakkeverifikation. Den kommende releaseadresse bliver først en gyldig downloadmulighed efter publicering.

Denne fork er særskilt fra det Code-OSS-baserede Aura-1-projekt. Udgivelsen gør ikke krav på fuld Privacy Gate eller fuld isolation af alle agentværktøjer. Skills og lokale appkontroller kan hjælpe den valgte model, men udligner ikke dokumenteret forskellene i modelkvalitet og garanterer ikke et poleret første udkast.

Efter en verificeret udgivelse beholdes højst tre færdige lokale DMG-versioner. Ubrugte byggede pakker, caches og klart syntetiske profiler kan ryddes op efter ejerskabs- og brugscheck. Lokal kode, checkouts, worktrees, beskrivelser, testkilder, brugerprojekter og credentials bevares, også når de er committed og pushed.

De lokale ændringers foreløbige fordeling på bidrag til originalen findes i [PR-efterslæbet for 0.4.0](../contributions/upstream-followup-beta-0.4.0.md). Denne releaseforberedelse opretter eller opdaterer ingen upstream-PR’er.
