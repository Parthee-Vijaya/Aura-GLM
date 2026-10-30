# Design fra opgaven og kontrol af det faktiske resultat

Denne valgfrie uddybning tilpasser Unparalleled til Auras eksisterende designmetode. Den gælder brugerprojektet, ikke værtsappen. Se [kilden og tilpasningen](provenance.md) og [MIT-noticen](unparalleled-license.md). Den giver ingen nye værktøjer, tilladelser eller automatiske modelkald.

## Opgaven bestemmer formen

En arbejdsflade, et indholdssite og en offentlig introduktionsside har forskellige opgaver. Begynd med den konkrete person og det, vedkommende skal gøre. Hvilke oplysninger er nødvendige før handlingen? Hvad sker der bagefter? Hvad skal bevares ved tilbage, nyt valg eller fejl?

Ved en app vurderes arbejdsforløb, datatæthed, overblik over valg og tilstande. Ved en landingpage vurderes budskab, troværdigt indhold, navigation og næste handling. En blandet løsning kan dele identitet og samtidig bruge forskellige kompositioner. En indholdsside behøver ikke et dashboard, og et arbejdsredskab behøver ikke en filmisk åbning.

Brug en kort [designkontrakt](design-brief.md) til at forbinde opgaven med komposition, typografi, farver, assets, mobil og afprøvning. Et nyttigt særkende kan være, at en sammenligning bevarer brugerens kriterier, eller at konsekvensen af et valg ses med det samme. Særkendet skal stadig være nyttigt efter mange besøg. Gør ikke almindelige handlinger overraskende for at vise originalitet.

Vælg selv en begrundet retning inden for godkendt scope. Undersøg kun alternativer, hvis der er et reelt uafklaret valg; fem live-varianter er ikke et standardtrin. Eksisterende identitet, tilgængelig betjening og brugerens konkrete valg har forrang. Eksempler i andre skills er inspiration, ikke installerede temaer.

## Ét gennemarbejdet udsnit først

Byg ét helt, repræsentativt forløb før mange skærme. Vælg faktisk indhold eller tydeligt mærkede demodata, herunder længere titler og værdier. Et flot tomt layout er ikke et brugbart fundament. Før mønstret gentages, skal de vigtigste handlinger, typografi, tæthed, tekstafstande og mobilforløb hænge sammen.

Vurder mønstre ud fra deres funktion. Kort kan være nyttige for uafhængige elementer; en liste eller tabel kan gøre sammenligning lettere. Afrunding, sans-serif, stærke farver og gradienter er ikke fejl i sig selv. Spørg, om gentagelsen skjuler hierarkiet, om farven har en rolle, og om det passer til det dokumenterede brand. Færre elementer er heller ikke automatisk bedre: brugeren skal stadig have relevante oplysninger og handlinger.

Kontrollér det praktiske håndværk: er fonten faktisk indlæst, er label og værdi tydeligt adskilt, passer tekst i knapper, kan navigationen rumme lange ord, og giver tilstanden mening uden farve? Hold fælles løsninger i tokens og komponenter, så en rettelse forbedrer hele produktet.

## Se → ret → se igen med et fast stop

Brug kun eksisterende tilladte preview- og testværktøjer. Et screenshot skal faktisk kunne ses af den valgte model for at tælle som modellens visuelle vurdering. En rapport eller et filnavn er ikke et billede. Projektets dataregler, samtykke og destination gælder også for billeder. Hent ikke browserpakker, scripts, fontfiler eller en anden model for at omgå en begrænsning.

1. **Se:** Gennemgå en første skærm og resten af siden, fx ved 1440 × 900 og 390 × 844. Supplér med mellembredde, kort skærm, zoom og reduceret bevægelse, når det berørte forløb kræver det. Se også den vigtigste dialog eller resultattilstand.
2. **Beskriv:** Notér højst tre prioriterede fund: skærm/tilstand, observeret problem, betydning for brugeren og ønsket kontrol efter rettelse. Skeln mellem billedobservation, måling, funktionstest og antagelse.
3. **Ret:** Saml den vigtigste fælles årsag i én afgrænset rettelse, fx afstand i et genbrugt felt eller mobilrækkefølgen. Bevar opgave, identitet, data, funktioner, planer og godkendelser.
4. **Se igen:** Tag nye billeder, sammenlign de samme størrelser og tilstande, og gentag de berørte funktionstests. Hvis en rettelse skaber en ny fejl, skal det fremgå; et nyt screenshot beviser ikke, at problemet er løst.

Brug højst to rettelsesrunder eller miljøets lavere grænse inden for det aftalte budget. Stop ved brugerens Stop/afvisning, manglende tilladelse, opbrugt budget eller ingen væsentlige fund. Et uafklaret grundproblem ved grænsen beskrives som næste skridt; begynd ikke et nyt loop med et nyt navn. Ingen automatisk model- eller udbyderændring. Målet er et godt arbejdsgrundlag, ikke endeløs kosmetisk perfektion.

Uden billedadgang kan strukturerede målinger, kodekontrol og funktionstests stadig give nyttige fund. Skriv da **ikke visuelt vurderet af modellen**. Find ikke på observationer af komposition eller billedkvalitet. Automatiske signaler er spørgsmål, der skal undersøges, ikke en dom over skønhed; fjern ikke legitime mønstre blot for at få nul fund.

## Aflever bevis frem for adjektiver

Angiv kort: den valgte retning, gennemført hovedforløb, konkrete rettelser og resterende begrænsninger. Gem tilladte før/efter-billeder med samme viewport og relevante tilstande. Rapportér målt tid og forbrug, når testen giver dem; opfind hverken pris eller kvalitetsscore. Et vellykket klikforløb, fravær af browserfejl og en visuel vurdering er forskellige beviser og skal ikke slås sammen til en generel produktionsgaranti.
