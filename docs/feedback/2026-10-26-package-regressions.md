# Rettelser fundet under pakkekvalifikation

## Stop under motoropstart

En igangværende isolationskontrol kunne fortsætte efter Stop. To karakteriseringstests viste henholdsvis en starttilladelse efter tilbagekaldelse og en motorproces startet efter anmodning om lukning.

Motorens start og lukning har nu fælles ejerskab. Lukning afbryder ventende transport, afviser sene hændelser og venter på ressourcer, der allerede er ved at blive oprettet. Proces og isolation afsluttes hver én gang. En fejl ved afslutning af isolation bliver fortsat en fejl; den rapporteres ikke som vellykket oprydning. Isolationen kontrollerer tilbagekaldelse igen efter asynkrone kontroller og før en starttilladelse udleveres.

Før rettelsen fejlede to af de tre oprindelige cases. Efter rettelsen består 81 målrettede tests af opstart, Stop, genoptagelse, komprimering, V2-kontrakt, målinger og hybrid-adapter. Det er kontrollerede proces-/transportcases, ikke en prøve med en betalt AI-model. Den tidligere sporadiske native opstartsfejl er ikke dermed bevist forklaret. Dette er heller ikke en fuld tilstandsmaskine eller automatisk crashgenoptagelse.

## Forhåndsvisning efter gendannelse

I den første pakkede prøve var filen korrekt efter genstart og “Fortryd gendannelse”, mens forhåndsvisningen stadig viste den tidligere version. Gendannelsen kunne afsluttes før første måling af filrevisionen; den første måling opfattede derefter den ændrede fil som udgangspunkt.

Efter en bekræftet gendannelse med faktiske filændringer genindlæses kun den allerede åbne statiske forhåndsvisning i den samme aktive samtale. Der startes ingen projektserver, åbnes ingen ny destination eller ændres en datagodkendelse. Eksterne, blokerede, forældede eller uændrede resultater genindlæses ikke. Den reproducerende test gik fra fejl til bestået; resultatdialogens 18 tests og 36 relaterede preview-/plantests består.

## Prøvernes kontrakter

Pakketestene validerer appens executable, ASAR, profil og medfølgende runtime. En ugyldig pakkesti giver fejl frem for at starte kildekoden. Onboardingprøven følger den allerede godkendte fokusrækkefølge og teksten “Aura 1”. Recoveryprøven åbner previewfanen, men kræver stadig det konkrete gendannede indhold.

Frameworkprøven afventer en færdig opstartsgennemgang, før den ændrer projektopsætningen for at prøve afvisning af et forældet samtykke. Den gamle forventning om automatisk serverstop ved projektskift var forkert: Aura bevarer allerede separate projekters servere i baggrunden. Prøven skal bevise både bevaret preview ved projektskift, eksplicit Stop og afslutning af alle prøvens servere ved lukning.

Den lokale artefaktkontrol har en eksplicit ad-hoc-tilstand. Den kræver fortsat identiske appfiler, links og rettigheder i original, DMG og ZIP, kildebevis og gyldige kodesignaturer. Den kontrollerer også, at signaturen faktisk er ad hoc uden certifikatidentitet. Apple-notarisering og offentlig distributionsgodkendelse markeres som ikke udført; standardtilstanden for en notariseret udgivelse er uændret.

## Beviser og afgrænsning

De oprindelige fejl og testmaterialer bevares under `ReleaseReports/package-beta-0.5.0-20261026/` og `ReleaseReports/lifecycle-characterization-20261026/`. Den første pakkes 20 native Privacy Gate-/migrationscases og de fire Privacy Gate-/feedback-UI-prøver består. En ekstra kildekørsels recoveryprøve ventede i macOS-nøgleringen og blev stoppet; den tæller ikke som bestået. Den endelige pakke skal genbygges og prøves efter produktrettelserne.

Ingen UI-retning, værktøjsrettighed, planregel, YOLO-semantik eller model er ændret. Ingen automatisk genafsendelse tilføjes. Kildekode, tidligere rapporter og brugerdata bevares. Aktuel pakkestatus fremgår af [noterne til beta 0.5.0](../releases/aura-1-beta-0.5.0.md).
