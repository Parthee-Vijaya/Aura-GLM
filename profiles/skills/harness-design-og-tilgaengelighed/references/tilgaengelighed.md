# Tjekliste til tilgængelighed

Et udvalg af de vigtigste kontroller efter WCAG på niveau AA til små webapps. Skriv for hvert punkt: i orden, fund eller ikke relevant.

## Tastatur og fokus

- [ ] Alle funktioner kan bruges med tastatur, uden fælder, hvor fokus sidder fast.
- [ ] Fokus er tydeligt synligt og skjules ikke bag andre elementer.
- [ ] Fokusrækkefølgen følger den visuelle rækkefølge.
- [ ] Dialoger flytter fokus ind, kan lukkes med Escape og sender fokus tilbage.
- [ ] Der er et "gå til indhold"-link på sider med gentagen navigation.

## Struktur og sprog

- [ ] Siden har `lang="da"` og en beskrivende titel.
- [ ] Overskrifter følger en logisk rækkefølge uden spring.
- [ ] Knapper er `<button>`, og links er `<a>`. Klikbare `<div>`-elementer bruges ikke.
- [ ] Landmarks som `<header>`, `<main>` og `<nav>` bruges.

## Formularer og fejl

- [ ] Hvert felt har en synlig label, der er koblet til feltet.
- [ ] Påkrævede felter er markeret i tekst, ikke kun med farve eller stjerne.
- [ ] Fejlbeskeder står ved feltet, forklarer problemet og annonceres for skærmlæsere.
- [ ] Brugeren kan rette og indsende igen uden at miste det indtastede.

## Syn og visning

- [ ] Almindelig tekst har en kontrast på mindst 4,5:1 og stor tekst mindst 3:1.
- [ ] Knapper, felter og fokusmarkeringer har en kontrast på mindst 3:1 mod omgivelserne.
- [ ] Information bæres ikke af farve alene.
- [ ] Siden kan forstørres til 200 procent, og indholdet fungerer ved 320 CSS-pixels bredde uden vandret rulning.
- [ ] Bevægelse og animation kan undgås, og intet blinker mere end tre gange i sekundet.

## Billeder og medier

- [ ] Meningsfulde billeder har en alternativ tekst, der dækker indholdet.
- [ ] Dekorative billeder har tom alternativ tekst.
- [ ] Video har undertekster, og lyd har en tekstversion.

## Afprøvning

- [ ] Automatisk kontrol med fx axe eller Lighthouse er kørt, og fundene er vurderet.
- [ ] Hele brugerforløbet er gennemført med tastatur alene.
- [ ] En skærmlæser er brugt på de vigtigste sider, fx VoiceOver på Mac eller NVDA på Windows.
- [ ] Siden er set på en smal mobilbredde.

## Offentlige websteder

- [ ] Tilgængelighedserklæringen er oprettet eller opdateret i Digitaliseringsstyrelsens WAS-tool og linket fra sidefoden, og det er aftalt, hvem i organisationen der vedligeholder den.
- [ ] Undtagelser, fx indhold fra tredjepart, og eventuelle fravigelser er begrundet i erklæringen.

Kilder, kontrolleret 29. september 2026: lov om tilgængelighed af offentlige organers websteder og mobilapplikationer (https://www.retsinformation.dk/eli/lta/2018/692), bekendtgørelsen om standarden (https://www.retsinformation.dk/eli/lta/2021/2180) og Digitaliseringsstyrelsen om tilgængelighedserklæringen (https://digst.dk/digital-inklusion/webtilgaengelighed/om-tilgaengelighedserklaeringen/).
