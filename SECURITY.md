# Sikkerhed

## Rapportér privat

Send sikkerhedsproblemer til **Parthee Vijayamohan på [pavi@kalundborg.dk](mailto:pavi@kalundborg.dk)**. Brug emnet “Aura Harness: sikkerhedsrapport”. Opret ikke en offentlig issue eller pull request med sårbarhedens detaljer.

Beskriv den berørte version, hvad der kan ske, og hvordan fejlen kan gentages med opdigtede data. Medtag gerne de nødvendige trin og relevante filnavne. Send ikke adgangsnøgler, borgeroplysninger eller komplette projekt- og logarkiver. Hvis mere materiale er nødvendigt, aftaler vi, hvordan det kan deles.

Kontaktpersonen gennemgår rapporten og aftaler den videre håndtering med bidragyderne. Projektet har ingen garanteret svartid eller døgnbemandet support. Offentliggørelse af fejlens detaljer og en eventuel rettelse aftales med rapportøren.

## Versioner og omfang

Projektet er en udviklingsbeta. Sikkerhedsrapporter modtages om den aktuelle kode på `main`, instruktionspakkerne, webguiden og den seneste udgivne app. Ældre testversioner har ingen særskilt vedligeholdelsesordning. En rettelse i kildekoden er ikke nødvendigvis med i en installationspakke endnu; kontrollér udgivelsesnoterne for den konkrete version.

Appens kodeagent kører på brugerens computer. Godkendelser og instruktioner begrænser arbejdsgangen, men hele agenten er ikke isoleret i en sandbox. Projektindhold kan sendes til de AI- og hostingtjenester, brugeren forbinder. Brug af Aura Harness er ikke en godkendelse til personoplysninger eller produktionsdrift.

Se [betastatus](docs/beta.md) for kendte begrænsninger og [teststatus](docs/teststatus.md) for den faktiske afprøvning. Undersøg kun egne testprojekter og miljøer, som du har tilladelse til at afprøve. En sikkerhedsrapport giver ikke tilladelse til at tilgå andres data eller tjenester.
