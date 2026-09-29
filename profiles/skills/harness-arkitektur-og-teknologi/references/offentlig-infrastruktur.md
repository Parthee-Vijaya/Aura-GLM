# Offentlig infrastruktur og genbrug

Pejlemærker til løsninger for danske offentlige organisationer. Kontrollér med organisationens it-arkitekt, før noget vælges. Kilderne er kontrolleret 29. september 2026.

## Genbrug før nybyg

- **OS2** er et offentligt digitaliseringsfællesskab, hvor myndigheder udvikler og forvalter løsninger sammen. Se produktkataloget og koden på GitHub, før der bygges nyt: https://www.os2.eu/os2-it-loesninger og https://github.com/OS2offdig
- **Digitaliseringskataloget** beskriver fælleskommunale løsninger og infrastruktur: https://digitaliseringskataloget.dk
- Digitaliseringsstyrelsens vejledning om open source anbefaler at undersøge eksisterende løsninger før nyudvikling og at bruge udbredte licenser.
- Fællesoffentlig digital arkitektur anbefaler at undgå afhængighed af enkelte leverandører og proprietære teknologier (arkitekturregel 2.3).

## Login

- **Borgere og virksomheder:** kræver en selvbetjeningsløsning til en myndighedsopgave sikker autentifikation, skal myndigheden bruge NemLog-in til login med MitID. NemLog-in anskaffes gennem Digitaliseringsstyrelsen og kræver aftale og opsætning.
- **Medarbejdere i andre virksomheder:** MitID Erhverv.
- **Kommunens egne medarbejdere:** brug kommunens egen identitetsløsning. Spørg den identitetsansvarlige.
- **KOMBIT Fælleskommunal Adgangsstyring:** relevant, når løsningen skal hente data fra den fælleskommunale infrastruktur på vegne af medarbejdere. Kræver registrering i Fælleskommunalt Administrationsmodul.

## Data fra fælles registre

- **Serviceplatformen (KOMBIT)** giver adgang til fx CPR og CVR. Adgang kræver registrering af systemet, certifikat og en serviceaftale. Der findes en testmyndighed til udvikling.
- **Datafordeleren** er indgangen til grunddata. Meget er frit tilgængeligt efter oprettelse; fx CPR kræver særskilt adgang. CPR-data skal på sigt hentes fra Datafordeleren i stedet for Serviceplatformens replika.
- Brug aldrig rigtige CPR- eller sagsdata i prototyper. Brug opdigtede data og testmiljøer.

## Hosting og placering

- Der er ikke fundet en generel dansk regel om, at data skal hostes i EU/EØS. Overførsler reguleres af GDPR; brug `harness-data-og-leverandoerer`, hvis den er installeret.
- Digitaliseringsstyrelsen og Datatilsynet har vejledninger om brug af cloud, og Digitaliseringsstyrelsen har materiale om digital suverænitet. Brug dem som beslutningsstøtte sammen med organisationens egne krav.

## Informationssikkerhed

- NIS2-loven gælder fra 1. juli 2025. Kommuner kan være omfattet, og kravene er risikobaserede. Inddrag informationssikkerhedskoordinatoren ved nye systemer og leverandører.
- KL anbefaler tekniske minimumskrav for kommuner, og kommuner følger principperne i ISO/IEC 27001.

## Kilder

- OS2: https://www.os2.eu/
- Vejledning om open source i den offentlige sektor: https://arkitektur.digst.dk/Vejledning-om-brug-af-open-source-i-den-offentlige-sektor
- Arkitekturregel 2.3: https://arkitektur.digst.dk/principper/princip-2-arkitektur-fremmer-sammenhaeng-innovation-og-effektivitet/arkitekturregel-23
- Lov om MitID og NemLog-in: https://www.retsinformation.dk/eli/lta/2025/333
- NemLog-in om lovgivning: https://www.nemlog-in.dk/om-nemlog-in/lovgivning/
- Fælleskommunal adgangsstyring: https://digitaliseringskataloget.dk/l%C3%B8sninger/adgangsstyring-brugere
- Tilslutning til Serviceplatformen: https://digitaliseringskataloget.dk/tilslutningsguide-anvendersystem
- Datafordeleren: https://datafordeler.dk/
- Digitaliseringsstyrelsens cloudvejledning: https://digst.dk/data/vejledning-til-anvendelse-af-cloudservices/
- Digital suverænitet: https://digst.dk/digital-transformation/digital-suveraenitet/
- NIS2-loven: https://www.retsinformation.dk/eli/lta/2025/434
- KL om informationssikkerhed i kommunerne: https://www.kl.dk/media/rojd4u0o/informationssikkerhed-i-kommunerne-jan-2024.pdf
