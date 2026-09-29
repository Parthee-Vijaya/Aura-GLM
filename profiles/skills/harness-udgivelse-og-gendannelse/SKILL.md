---
name: harness-udgivelse-og-gendannelse
description: Forbereder og kontrollerer en udgivelse til et test- eller driftsmiljø. Gennemgår version, miljø, konfiguration, dataændringer, nødvendige godkendelser og vejen tilbage, og afprøver den udgivne tjeneste på dens rigtige adresse bagefter. Brug den, når brugeren vil deploye, udgive, sætte i drift eller rulle en version tilbage.
---

# Udgivelse og gendannelse

En udgivelse er en beslutning om en bestemt version i et bestemt miljø. Et vellykket upload er ikke bevis for, at appen virker.

Udgiv aldrig til drift, opret aldrig betalte ressourcer og ændr aldrig domæner eller adgangsindstillinger uden brugerens udtrykkelige godkendelse af netop den handling.

## Før udgivelsen

Gennemgå [tjeklisten](references/udgivelsestjekliste.md) sammen med brugeren. Det vigtigste:

1. **Version:** hvilket commit udgives? Er der ændringer, som ikke er committet, og som derfor ikke kommer med?
2. **Miljø:** test eller drift, hvilken tjeneste, hvilken region og hvilken konto. Udgiv til et testmiljø først, når det er muligt.
3. **Konfiguration:** er miljøvariabler og hemmeligheder sat i tjenesten? Nævn kun navnene.
4. **Data:** er der databaseændringer? Hvordan rettes de, hvis udgivelsen skal rulles tilbage? En tilbagerulning af koden ruller ikke data tilbage.
5. **Kontroller:** hvilke tests og gennemgange er kørt på netop denne version, og hvad er stadig åbent?
6. **Godkendelser:** hvilke godkendelser kræver organisationen, og foreligger de fra de rette roller? Nye dataforløb, leverandører, login eller en offentligt tilgængelig adresse kan kræve en særskilt vurdering.
7. **Udgift og ejerskab:** hvem ejer kontoen, og hvad koster det?

Hvis en nødvendig beslutning mangler, så udgiv ikke til drift. Arbejdet kan fortsætte med opdigtede data i et testmiljø.

## Efter udgivelsen

1. Åbn den rigtige adresse, og gennemfør den vigtigste brugerrejse.
2. Kontrollér, at adgangsbegrænsninger virker: en bruger uden adgang skal afvises.
3. Se efter fejl i tjenestens logs.
4. Registrér udgivelsen med [udgivelsesnoten](references/udgivelsestjekliste.md): commit, tidspunkt, miljø, adresse og hvad der er kontrolleret.

Skriv præcist, hvad der er observeret. "Uploadet" og "virker på adressen" er to forskellige udsagn.

## Vejen tilbage

- Kend den forrige version, og hvordan den udgives igen.
- Tag en sikkerhedskopi af data før ændringer i databasens struktur.
- Afprøv tilbagerulningen i testmiljøet, før den kan blive nødvendig i drift.
- Ved fejl efter udgivelse: stop, beskriv hvad der er observeret, og foreslå tilbagerulning eller rettelse. Gentag ikke udgivelsen blindt; et afbrudt upload kan have et ukendt udfald.
