# Datafordeleren

Datafordeleren er Klimadatastyrelsens platform for grunddata. Oplysningerne er kontrolleret 30. september 2026.

## Adgang

1. Opret en bruger i Datafordeler Administration med e-mail, MitID Privat eller MitID Erhverv. Samtidig accepterer man brugervilkårene. En bruger med e-mail eller MitID Privat får kun ubeskyttede data. MitID Erhverv kræves til beskyttede data og til deling i en organisation.
2. Opret et IT-system, og vælg en adgangsmetode:
   - **API-nøgle:** gælder i 2 år og giver kun ubeskyttede data.
   - **OAuth Shared Secret:** giver et token, der gælder i 60 minutter.
   - **OAuth-certifikat:** OCES3.
3. Beskyttede data kræver OAuth, en IP-adresse på en godkendt liste og godkendelse fra registret.

Frie data, der ikke kræver ansøgning:
- DAR, adresser;
- BBR, bygninger;
- MAT2, matrikler;
- DAGI, administrative inddelinger;
- EBR, ejendomsbeliggenhed;
- VUR, vurderinger.

Adgangsbegrænsede data er fx CPR, EJF og CVRPerson.

## Kald

- Adresser: `https://graphql.datafordeler.dk/DAR/v3?apiKey=<nøgle>` med GraphQL.
- Andre registre følger samme mønster: `https://graphql.datafordeler.dk/<register>/<version>`.
- En side har 100 rækker som standard og højst 1000.
- Tjenesten sender CORS-headere ved preflight, men kun for `Content-Type`. Det er ikke afprøvet, om vellykkede svar kan læses fra en browser. Datafordeleren kalder API-nøglen en privat nøgle. Kald derfor Datafordeleren fra en server, og læg nøglen i `.env`.
- De gamle REST-tjenester, webbrugere, tjenestebrugere og selfservice lukker 15. januar 2027. Brug kun GraphQL og API-nøgle eller OAuth.

## Vilkår

Frie grunddata må bruges under CC BY 4.0. Datafordeleren beder om denne kreditering:
- DAR: Klimadatastyrelsen;
- BBR: BBR;
- matrikel og EBR: Geodatastyrelsen.

Adgang kan blokeres, hvis vilkårene brydes. Den, der har hentet data ud af Datafordeleren, har selv ansvaret for brugen, også når data sammenstilles med andre data.

## Kilder

- Adgangsmetoder, 18. juni 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=187105503
- Brugertyper, 26. maj 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=187105489
- Frie og begrænsede data, 19. februar 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=191398982
- GraphQL og grænser, 18. september 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=187105434
- Lukning af de gamle tjenester 15. januar 2027: https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/nyheder/nyhedsarkiv/2026/jun/paralleldrift-paa-datafordeleren-ophoerer-den-15-januar-2027
- Brugervilkår: https://datafordeler.dk/vejledning/brugervilkaar/
- Adgang og ansvar, 2. januar 2026: https://confluence.kds.dk/display/DML/Datafordeler+adgang+og+ansvar
