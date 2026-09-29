---
name: harness-design-og-tilgaengelighed
description: Bygger brugerflader ud fra organisationens designsystem eller godkendte referencer og afprøver tilgængelighed med både værktøjer og hænder. Kontrollerer tastatur, fokus, kontrast, formularer, fejlbeskeder, overskrifter og små skærme og ser resultatet i browseren. Brug den, når en side, formular eller komponent bygges eller ændres, og før en offentlig side udgives.
---

# Design og tilgængelighed

En brugerflade er først færdig, når den er set i browseren og kan bruges med tastatur, skærmlæser og på en lille skærm.

## Design

1. Brug organisationens designsystem og designguide først. Læs de referencer, brugeren har valgt, og angiv, hvad du bygger på. Opfind ikke indhold fra sider, du ikke kunne læse.
2. Design det første sammenhængende brugerforløb: layout, typografi, farver, navigation og realistisk, opdigtet dansk eksempelindhold.
3. Tænk mobil først, og tag tomme tilstande, fejltilstande og indlæsning med.
4. Skriv brugerfladetekster i et klart, konkret dansk. Knapper siger, hvad der sker.
5. Kopiér ikke logoer, billeder eller tekster med uafklarede rettigheder.
6. Undgå dekorative dashboards og generiske marketingtekster, som ikke hjælper opgaven.

## Tilgængelighed

Danske offentlige organers websteder og apps skal overholde standarden EN 301 549, som i praksis betyder WCAG 2.1 på niveau AA. Byg efter WCAG 2.2 AA, som den nyeste udgave af standarden bygger på. Hvert websted og hver app skal have en tilgængelighedserklæring i Digitaliseringsstyrelsens WAS-tool, og den skal opdateres ved ændringer og mindst én gang om året. Brug [tjeklisten](references/tilgaengelighed.md).

Kontrollér altid i hånden:

- Hele forløbet kan gennemføres med tastatur, og fokus er synligt og følger en logisk rækkefølge.
- Formularfelter har synlige labels, og fejlbeskeder forklarer problemet ved det rigtige felt.
- Overskrifter følger en logisk struktur, og siden har `lang="da"`.
- Tekst har tilstrækkelig kontrast, og information bæres ikke af farve alene.
- Siden kan forstørres til 200 procent og bruges på en smal skærm uden vandret rulning.
- Billeder har meningsfulde alternative tekster, og dekorative billeder skjules for skærmlæsere.

Kør også et automatisk værktøj som axe eller Lighthouse, hvis det er muligt. Et automatisk værktøj finder kun en del af problemerne og kan ikke alene afgøre, om en side er tilgængelig.

## Se resultatet

Åbn siden i browseren på computer- og mobilbredde. Tag skærmbilleder, hvis værktøjet kan, og sammenlign med referencerne. Påstå ikke, at brugeren har godkendt designet.

## Aflevering

Skriv, hvad der er kontrolleret automatisk, hvad der er kontrolleret i hånden, og hvilke kendte problemer der er tilbage. Kald ikke løsningen tilgængelig på baggrund af en automatisk scanning.
