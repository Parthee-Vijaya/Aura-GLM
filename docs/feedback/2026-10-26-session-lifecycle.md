# Samtalens afslutning: karakterisering og afgrænsede rettelser

Som første del af harness-reviewets P0-4 er den aktuelle `ChatSession` afprøvet, før dens tilstandsstyring ændres. Prøverne bruger den faktiske Workbench, opgave-, godkendelses- og historiklogik samt syntetiske filer på disk. Motoren er kontrolleret, så samtidige hændelser kan placeres præcist; ingen rigtig model, nøglering eller brugerprofil indgår.

## Fund og rettelser

To samtidige Stop-kald kunne vise to resultatkort og forsøge at frigive projektet to gange. Kun det første forsøg ejede faktisk projektet, og selve opgaven blev gemt én gang. Lukning, mens Stop ventede på motorens afbrydelse, kunne desuden afslutte opgaven som `interrupted`, hvorefter Stop overskrev historikken med `stopped`.

Stop deler nu ét igangværende forløb. Lukning afventer både afbrydelsen og Stop-forløbets sidste historikskrivning. Er lukningen begyndt først, slutter et efterfølgende Stop sig til den. Forberedelse og afsendelse af en ny besked afvises også under den sidste lagring, selv om selve opgaven allerede er afsluttet.

En efterfølgende kontrol af det offentlige Stop-kald fandt, at gentagne tryk efter afslutning kunne fjerne en genereret plan og ændre en inaktiv samtales status. Stop er nu uvirksomt, når der hverken er en aktiv kørsel, opstart, afsendelse, opgave, kvalitetskontrol eller komprimering. Aktivt arbejde beholder sin eksisterende Stop-adfærd; en allerede igangværende normal afslutning overtages fortsat ikke af Stop.

## Afprøvning

`desktop/tests/session-lifecycle-characterization.test.cjs` indeholder **20 deterministiske prøver**. De dækker gentagne terminalhændelser, Stop under afslutning, lukning under afslutning, afbrydelsens sene hændelser, forsinkede automatiske og manuelle godkendelser, de to rækkefølger af Stop/lukning samt gentagne Stop efter afslutning. Blandt de kontrollerede invarianter er:

- Ét opgaveresultat og én frigivelse af projektet.
- Intet svar på en godkendelse efter Stop, heller ikke hvis policykontrollen først bliver færdig bagefter.
- Samme slutstatus i opgave og gemt historik.
- Ingen ny afsendelse under den sidste Stop-lagring.
- Uændrede syntetiske kildefiler og bevarede planer ved Stop i en inaktiv samtale.

De første 14 prøver gav 12 beståede og to reproducerede racefejl. Den særskilte kontrol af Stop i inaktiv tilstand tilføjede tre reproducerede fejl. Efter rettelserne består **105/105 målrettede tests uden skips**: de 20 nye prøver samt eksisterende Workbench-, godkendelses-, spørgsmåls-, kvalitets-, recovery-, måle- og Privacy Gate-statustests.

Rå output bevares under `~/Library/Application Support/Aura1/ReleaseReports/feedback-20261026/backlog-followup/`:

- `session-lifecycle-characterization-2.tap`: de oprindelige to racefejl.
- `session-lifecycle-idle-stop-before.tap`: gentaget Stop før den sidste rettelse.
- `session-lifecycle-after-3.tap`: den samlede målrettede kontrol efter rettelserne.

## Afgrænsning

Dette er karakterisering og små rettelser af fælles ejerskab under afslutning. Den fulde tilstandsmaskine, modelbaseret afprøvning af 10.000 hændelsesforløb og automatisk genoptagelse efter motorcrash er ikke implementeret her. Prøverne dokumenterer kontrollerede hændelsesforløb, ikke drift med en rigtig cloudmodel eller native Windows/Linux-afprøvning. UI, onboarding B, planvalg, YOLO og datadelingsregler er uændrede. Arbejdet er lokalt og ikke udgivet.
