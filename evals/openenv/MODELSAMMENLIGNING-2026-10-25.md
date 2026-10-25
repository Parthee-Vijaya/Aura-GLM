# Madbestillingsapp: rigtige modelprøver den 25. oktober 2026

Corti gennemførte det afprøvede hovedforløb med en tilbageværende prisvisningsfejl på mobil og besværlig adgang til en gemt kurv efter genindlæsning. Mistral leverede en delvist fungerende app med tre væsentlige funktionsfejl. Ingen af de to første udkast nåede den ønskede polering. GPT-6.1-Sol gav ingen færdig app gennem den tilgængelige Aura-transport, så dens designkvalitet kan ikke bedømmes i den fælles Aura-prøve. En efterfølgende GPT-filreference gennem en anden arbejdsgang er beskrevet særskilt nedenfor.

Det ønskede resultat med tre sammenlignelige, færdige apps er dermed **ikke opnået**. Alle fejlede og afbrudte forsøg er bevaret. Den strukturerede, gennemgåede opsummering findes i [JSON-rapporten](MODELSAMMENLIGNING-2026-10-25.json).

## Fælles grundlag

Alle tre fik brugerens rå madbestillingsopgave, samme demoafklaringer, 11 aktive skills med 34 skillfiler og syv identiske starterfiler. Ingen modelspecifik idéforfining, bestemt palette eller påtvunget layout blev tilføjet. Opgavehash: `2f2521346ec12ccb28ae0742316e70faf582c1a714d892eb455aee431033c48d`.

Opgave, skillmanifest, startermanifest, Auras første systemtekst og brugerbesked, angivne modellofter og Pythonrunner var ens efter normalisering af forsøgenes lokale stier. Det er kontrolleret på de faktiske afsendelsesdata. OpenCodes modelspecifikke værktøjsrepræsentationer kan stadig variere. GPT-alternativet havde yderligere transportforskelle beskrevet nedenfor.

Prøven brugte en lokal HTML/CSS/JavaScript-app i `public/`, fiktive spisesteder og kun lokale demoordrer. Ingen backend, eksterne assets, billedgenerator, pakkeinstallation, shell, Git eller netværksværktøjer. Det begrænser de mulige resultater og er ikke en generel prøve af alle Auras udviklingsmuligheder.

Aura krævede en konkret plan og normal engangsgodkendelse af hver filændring. Afgrænset læsning og søgning i appens egne sikre `public/`-filer var tilladt. Beskyttede filer, symlinks og eksterne mål var fortsat afvist. YOLO var slukket.

## Anden runde: faktiske resultater

| Model | Første færdige udkast | Anslået pris til første udkast inkl. plan | Hele forløbet | Samlet anslået pris |
|---|---|---|---|---|
| Mistral Medium 3.5, udbyderens standardindsats | 14 afsluttede kald; 208,3 sek. inkl. opstart og plan | 0,9409 USD | 61 kald; én automatisk produktrettelse | 5,7304 USD inkl. rettelsen |
| Corti S1, low | 20 afsluttede kald; 198,4 sek. inkl. opstart og plan | 0,7337 USD | 20 kald; ingen automatisk rettelse | 0,7337 USD |
| GPT-6.1-Sol, low via Codex-alternativ | Ingen færdig app | Ukendt | Fem afsluttede kald, derefter timeout; et automatisk transportgenforsøg blev afbrudt | Ukendt |

Prisen er Auras historiske overslag ud fra appens prissats og registreret forbrug, ikke en udbyderfaktura eller ny kontrol af aktuelle priser. Førsteudkastprisen er rekonstrueret fra afsluttede modeltrin frem til starten på første kvalitetskontrol; alle tokens og hele prisberegningen stemmer med de gemte totaler. Mistrals samlede pris må ikke læses som prisen på første udkast alene. Codex-abonnementsforbrug har ingen verificeret API-pris her; manglende pris betyder ikke gratis.

Fælles angivne lofter var 200.000 konteksttokens, 16.384 outputtokens pr. request, stop ved 64 registrerede afsluttede kald og 900 sekunder pr. trin. Kaldstoppet reagerer på usage-hændelser og er ikke et hårdt loft før hver afsendelse. Codex CLI'ens eget outputloft kunne ikke verificeres.

### Mistral

Plantrinnet tog 7,822 sekunder og krævede én afgrænset præcisering af planformatet på 13,279 sekunder. De i alt 21,101 sekunder indgår i tidspunktet og forbruget frem til første udkast.

Første udkast blev bevaret som snapshot `001`, før Auras automatiske rettelse. Pizzaens tilvalg, antal, pris, tom kurv, kontaktvalidering, levering og ordrehistorik virkede i browserprøven. Der blev fundet følgende fejl:

- Afhentning kunne ikke bekræftes uden leveringsadresse.
- En gemt kurv kunne vises efter genindlæsning, men bestilling udløste en `null.id`-fejl.
- Burgerstedets menu udløste en `undefined.toFixed`-fejl.
- Stedkortene manglede tastaturbetjening og almindelig kontrolsemantik.

De 24 konkrete browserkontroller gav 19 bestået og fem fejl; én fejl er den samlede runtimekontrol og må ikke tælles som endnu en selvstændig produktfejl. Ingen ekstern kommunikation blev observeret. Et særskilt eftertjek på snapshot `002` viste, at de tre centrale funktionsfejl stadig var der.

Produktets første browserkontrol fandt selv runtime- og kontrastproblemer og indledte én rettelse. Kontrastfundene faldt fra 17 til ét, men runtimefejlen bestod. Modellen bad under rettelsen om bash; den fælles prøve afviste det. Produktet standsede yderligere automatiske rettelser med `approval-rejected`. Der blev ikke tilføjet en manuel rettelse eller ekstra modelprompt.

Den uafhængige visuelle vurdering fandt genkendelig navigation og hierarki, men store gentagne gradientkort med små emoji, stor lodret plads og en lang checkoutformular. Resultatet var skabelonpræget og ikke et poleret madbestillingsprodukt.

### Corti

Snapshot `001` gennemførte tre lokale demoordrer via normal betjening: en tilpasset pizza til afhentning, en levering med adresse og en fuld bestilling fra mobil. Tilvalg og mængder gav korrekte beløb, ugyldige kontaktfelter og manglende leveringsadresse blev afvist, og alle tre ordrer samt leveringsadressen var bevaret efter genindlæsning.

En særskilt kontrol viste også, at en gemt kurv med to pizzaer og ost kunne gennemføres til bekræftelse efter normal genindlæsning (178 kr.). Navigationen var besværlig: appen vendte tilbage til forsiden uden direkte kurvadgang; brugeren måtte genvælge samme spisested for at åbne den bevarede kurv. Ingen workaround eller ændring af data blev brugt.

Der er en reel restfejl: mobilens faste Bestil-bjælke viste 89 kr., mens checkout korrekt viste 118 kr. inklusive levering. Bjælkens beløb var ikke mærket som subtotal. Bestillingen blev gennemført med det korrekte totalbeløb, men de modstridende beløb kan vildlede brugeren. Ingen JavaScript-fejl eller eksterne forespørgsler blev observeret i de afprøvede trin.

Designet havde en sammenhængende varm farvebrug, egne SVG-symboler, tydelige menurækker og en fornuftig desktopkurv. Det var stadig enkelt og skabelonpræget: kortknapperne flugtede ikke, demobanneret stoppede delvist hen over desktop, mobilintroduktionen var høj, og visse handlinger blev gentaget. Et gennemført hovedforløb er ikke en visuel godkendelse af første udkast.

### GPT-adgangen

Den direkte OpenRouter-rute til præcis `openai/gpt-6.1-sol` blev afvist med HTTP 402. Ingen betaling, grænse eller model blev ændret.

Et eksplicit autoriseret alternativ brugte den eksisterende Codex-adgang til præcis `gpt-6.1-sol` med low. Aura ejede stadig plan, værktøjer og godkendelser. Codex' native værktøjer, web og multiagent var deaktiveret. Alternativet tilføjede en engelsk transportinstruktion, et strikt svarschema og en ny Codex-proces for hver modelrequest. Det er en anden transport, og dens ekstra systemtekst, tokenforbrug og outputgrænser er ikke fuldt sammenlignelige med de direkte API-forbindelser.

I anden runde gennemførte fem rigtige GPT-kald plan og skillvalg. Sjette kald ramte broens 600-sekundersgrænse uden færdig tekst, værktøjskald eller usage. Loggen viste kun `thread.started` og `turn.started`; den afgør ikke, om der blev ventet på inferens eller transport. Samme schema var lykkedes i det foregående kald. Aura startede automatisk et identisk transportgenforsøg, som evaluatoren stoppede. Alle isolerede processer blev lukket.

Det kendte forbrug for de fem afsluttede kald var 219.865 inputtokens og 1.789 outputtokens; forbruget af de to afbrudte requests er ukendt. `public/` var stadig byte-identisk med starteren. Der er intet GPT-appdesign at rangere og ingen bestået appprøve.

## Supplerende GPT-reference med anden arbejdsgang

Efter hovedrundens timeout blev der gennemført ét særskilt GPT-6.1-Sol-kald med low gennem den eksisterende Codex-adgang. Det fik den samme opgave, startere og den bevarede request-6-samtalehistorik med Aura-systemteksten og det skillmateriale, der allerede var indsat eller læst. Det kunne ikke hente flere skillreferencer undervejs. Det returnerede alle filer som ét struktureret svar. Native værktøjer var deaktiveret, og Codex kørte read-only. De syv returnerede HTML/CSS/JavaScript/SVG-filer blev valideret og materialiseret af prøveværktøjet uden håndskrevne ændringer.

Selve det supplerende filsvar tog 188,356 sekunder; tidligere planarbejde og timeout er ikke med i dette tal. Det registrerede 48.489 inputtokens, 14.470 outputtokens og 85 reasoning-tokens. Prisen er ukendt. Der indgik ikke Auras løbende værktøjsgodkendelser, produktkontrol eller automatiske reparation i dette fil-outputforløb. Den uafhængige browserprøve brugte samme Chromium 153 og skærmvilkår som Mistral og Corti. Alle 11 konkrete flowkontroller bestod: stedvalg, tilvalg, mængder, tom kurv, kontakt- og adressevalidering, afhentning, levering, mobilbestilling, historik og en gemt kurv, der efter genindlæsning blev gennemført til bekræftelse. Ingen JavaScript- eller consolefejl og ingen eksterne forespørgsler blev observeret; de syv filer var byte-identiske før og efter.

Den uafhængige visuelle vurdering fandt sammenhængende varme flader, tydeligt hierarki, egne madillustrationer og læsbare menurækker. Det gav en mere gennemarbejdet reference, men havde fortsat en gentaget kurvtitel, en presset mobiloverskrift, genbrugt pizzaillustration, en lille Fjern-handling og lang mobilcheckout. De konkrete kontrollers succes er ikke en garanti for fejlfrihed eller en godkendelse af alle designbeslutninger.

Dette er ægte GPT-output, men **ikke en identisk Aura-prøve**. Referencen erstatter hverken timeoutresultatet eller opfylder målet om tre færdige apps gennem den samme pipeline. Dens tilblivelsestid og tokens må ikke sammenlignes direkte med hele plan-/byggeforløbet for Mistral og Corti.

## Hvorfor første runde blev gentaget

Første runde er bevaret separat. Mistral nåede 65 afsluttede kald og efterlod en ufærdig app. Corti afsluttede sit modelarbejde, men havde glemt at indlæse appens script, så den viste en tom hovedvisning. GPT-alternativets første filpatch blev afvist.

Undersøgelsen fandt to konkrete infrastrukturproblemer: evaldriveren afviste også legitime read/grep-kald til egne sikre filer, og Auras godkendelseslag kunne se en pending `apply_patch` uden patchtekst, selv om den præcise kørende værktøjsdel allerede var tilgængelig fra motoren. Derudover stoppede evaldriveren ved `>64` i stedet for `>=64` registrerede kald.

Hydreringen blev rettet med binding til præcis session, besked, værktøjsdel, call, tool, generation og aktuel pending-anmodning. Den normale godkendelsespolitik er uændret. Stop, forkerte bindinger, eksterne mål og symlinks forbliver afvist. En native protokolregression, 23 målrettede hydreringstests, 26 godkendelses- og evalpolitiktests (17 produkttests og ni evaltests) og 839 desktoptests bestod. Protokolregressionen brugte en kontrolleret server og tæller ikke som AI-kvalitetsbevis.

Alle tre blev startet frisk efter de fælles rettelser med uændret task og skills. Dermed fik GPT ikke alene forbedrede testvilkår.

## Browsergrundlag og praktiske grænser

Den primære browserprøve af begge færdige første udkast brugte Chromium 153.0.8010.12, 1440×900 desktop, 390×844 mobil, device scale 1, dansk locale, lyst tema og reduceret bevægelse. Mistrals tidligere Chrome155-billeder er bevaret separat; de normaliserede Chromium-billeder bruges til sammenligning.

Der blev kun navigeret og indtastet gennem appens almindelige UI. Ingen DOM-, lagrings- eller kildeændringer blev brugt til at få kontroller til at bestå. Kildehashes før og efter var ens. Første snapshot og produktrettelser holdes adskilt. Ingen designfeedback fra browserprøven blev sendt tilbage til modellerne.

Det er én opgave, én bevaret første runde og én fælles korrigeret runde. Resultaterne dokumenterer de konkrete forløb og er ikke en statistisk modelrangliste, en generel garanti for førsteudkast eller en end-to-end-prøve af den installerede DMG. Rå sessionsdata, forbindelseshenvisninger, lokale profiler og transportoptagelser skal forblive private. Denne rapport indeholder kun gennemgåede resultater.
