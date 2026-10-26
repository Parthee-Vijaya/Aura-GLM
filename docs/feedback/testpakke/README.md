# Testpakke: Aura-feedback

Klar til senere brugertest efter Parthees valg den 26. oktober 2026. Ingen deltagere er kontaktet, og ingen menneskelige resultater er indsamlet. Pakken er testmateriale, ikke en DMG eller ny udgivelse.

## Materiale

- [Opgaven til deltageren](opgave.md): samme opgave og efterfølgende ændring til alle.
- [Sessioner](sessioner.csv): én række pr. gennemført eller afbrudt forsøg, uden personnavne.
- [Observationer](observationer.csv): nummererede hændelser og relative tider. Kan åbnes i Excel.
- [Hændelsesformat](events-template.json): kun et startpunkt; ingen konstrueret succes.
- [Fuld protokol](../2026-10-26-user-study.md): måledefinitioner og analyse.
- [Teknisk status](../2026-10-26-integration.md): hvad der faktisk er afprøvet.

## Før testdagen

1. Vælg en senere verificeret Mac- og Windows-testpakke fra samme kildeversion. Registrér pakkehash og skillhash. Den aktuelle ændring er kun kørt fra lokal kildekode på Mac.
2. Brug separate profiler og nye testprojekter. Bevar eksisterende projekter og forbindelser.
3. Vælg én bestemt model, samme arbejdsform og en udgiftsgrænse. Lad deltageren bruge det sikre nøglefelt, hvis adgang mangler.
4. Aftal deltagelse og eventuel optagelse. Standard er alene nummererede observationer.
5. Giv opgaven, men peg ikke på knapperne. Mål først, når deltageren har forstået opgaven.

## Observer især

- Finder deltageren svaret, når Aura spørger? Kan vedkommende skrive med det samme?
- Forstår deltageren forskellen på arbejde, ventende valg og færdigt resultat?
- Kommer de samme spørgsmål igen, selv om briefen allerede har svarene?
- Kan sidepanelet ændres med mus og tastatur? Kan zoom ændres via menuen og med dansk tastatur?
- Er planens hovedpunkter forståelige, og kan den fulde plan åbnes?
- Bliver plan, data og værktøjer stadig gennemgået, når de kræver godkendelse?
- Bevares en forbindelse ved Annuller, Escape og klik udenfor fjernelsesdialogen?
- Kan deltageren gennemføre demoens hovedforløb? En tom preview tæller ikke som succes.

## Efter hvert forsøg

Registrér også fejl, stop og manglende preview. Ingen personnavne, rå prompts, nøgledata eller samtalelog i skemaerne. Gem testresultater lokalt; der er ingen automatisk telemetri. Fortolk kontrollerede tekniske test og bruger-/modeltest hver for sig.

Det medfølgende JSON-startpunkt er uafsluttet. Analysér det først efter registrering af den virkelige session; et manglende resultat skal stå som ukendt. Analyseværktøjet og dets tilladte hændelser er beskrevet i den fulde protokol.
