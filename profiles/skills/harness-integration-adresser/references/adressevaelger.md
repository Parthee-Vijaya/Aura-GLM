# Adressevælgeren

Klimadatastyrelsens Adressevælger erstatter DAWA's autocomplete. Oplysningerne er kontrolleret 30. september 2026.

## Søgning

- `https://adressevaelger.dk/adresser/soeg?tekst=<tekst>&token=adressevaelger123` finder adresser med etage og dør.
- `https://adressevaelger.dk/husnumre/soeg?tekst=<tekst>&token=adressevaelger123` finder husnumre, altså bygningens indgang.
- `https://adressevaelger.dk/soeg?tekst=<tekst>&maal=navngivenvejpostnummer&token=adressevaelger123` finder veje uden adresser.

Parametre:
- **Søgetekst:** `tekst` er fritekst på 1–73 tegn. I stedet for `tekst` kan man bruge `vejnavn`; `husnummer`, `postnummer` og `etage` virker kun sammen med `vejnavn`.
- **Afgrænsning:** `kommunekode` er en eller flere firecifrede koder adskilt af komma, og så søges kun i de kommuner. `medtagforeloebige=true` tager foreløbige adresser med.
- **Antal fund:** `maksimum` er 100 som standard og højst 200.
- **Token:** `token` er obligatorisk.

Søgningen er fonetisk og ikke følsom for store og små bogstaver. Er søgningen ikke entydig, kan svaret indeholde fund af typen `navngivenvej`, `navngivenvejpostnummer` eller `husnummer` i stedet for `adresse`. Tag postnummeret med for at undgå det.

Svar:

```json
{"status":"ok","beskrivelse":"","fund":[{"type":"adresse","id":"70865c44-d570-44e7-a6f5-6f7c90add725","titel":"Rådhuspladsen 1, 1550 København V","husnummerId":"0a3f507a-ec01-32b8-e044-0003ba298018"}]}
```

## Opslag med ID

- `https://adressevaelger.dk/husnumre/<id>?token=adressevaelger123` giver blandt andet:
  - `husnummer.adgangsadressebetegnelse` og `husnummer.vejnavn`;
  - `husnummer.postnummer.postnr` og `husnummer.postnummer.navn`;
  - `husnummer.navngivenvejkommunedel.kommune` og `husnummer.navngivenvejkommunedel.vejkode`;
  - `husnummer.adgangspunkt.koordinater.x` og `.y`.
- `https://adressevaelger.dk/adresser/<id>?token=adressevaelger123` giver de samme oplysninger for en adresse med etage og dør.

Koordinaterne er ETRS89 UTM zone 32 (`EPSG:25832`) i meter, fx x 724434,93 og y 6175755,61 for Rådhuspladsen 1. DAWA brugte WGS84, så en app, der flyttes fra DAWA, skal omregne til kortet.

## Token og brugerstyring

Tokenet skal i dag være mindst 10 vilkårlige tegn. Klimadatastyrelsen anbefaler, at alle bruger `adressevaelger123`, så overgangen til brugerstyring bliver nemmere. Brugerstyring forventes ultimo 2026 eller primo 2027. Så skal man oprette sig som bruger. Klimadatastyrelsen har en notifikationsservice, man kan tilmelde sig. Tjenesten sender `Access-Control-Allow-Origin: *` og kan kaldes fra en browser. Der er ikke planlagt en grænse for antal kald.

## Søgekomponent

Klimadatastyrelsen har en færdig søgekomponent til browseren: https://github.com/Klimadatastyrelsen/adressevaelger

## Kilder

- Fonetisk søgning, 26. juni 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=244318431
- Opslag med ID, 29. juni 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=246743156
- Brugerstyring og token, 4. maj 2026: https://confluence.kds.dk/pages/viewpage.action?pageId=236486723
- DAWA lukker 1. oktober 2026 kl. 10, opdateret 2. september 2026: https://dataforsyningen.dk/data/4924
