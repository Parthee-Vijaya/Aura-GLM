# OpenCode 2 i Aura 1

> Historisk afprøvningsrapport fra arbejdet før commit/push. Ejeren har efterfølgende godkendt integration i sin egen fork; se [samlet ændring og aktuel verifikation](feedback/2026-10-26-merge-overview.md). Testtal og datidens leveringsstatus nedenfor bevares som historik.


Aura bruger OpenCode **2.1.4**, fastlåst i `desktop/runtime-lock.json` og terminalpakkens valgfrie platformspakker. Ved kontrollen den 25. oktober 2026 var 2.1.4 den officielle `latest`-version af `@opencode/cli`; `beta` og `dev` var særskilte kanaler. “OpenCode 2” betegner her den nye motorgeneration. Aura installerer ikke løbende nye motorversioner ved appstart.

Officielle kilder: [installation](https://opencode.ai/v2/docs/), [V1 → V2](https://opencode.ai/v2/docs/migrate-v1/), [versionsmetadata](https://registry.npmjs.org/@opencode%2fcli/2.1.4).

## Hvad opgraderes?

- Desktop og terminalklient bruger samme motorversion. Native platformspakker har faste SHA-512-kontrolsummer; Node og Git skifter ikke version.
- Auras adapter oversætter V2-samtaler, hændelser, spørgsmål og værktøjer til Auras eksisterende produktgrænseflade.
- V1-pluginpakken er fjernet. Auras egne filkontroller, opgaveliste og kommandoisolation indlæses gennem V2-hooks uden pakkeinstallation ved opstart.
- Motorens hjem, konfiguration og skill-opdagelse afgrænses til den enkelte Aura-session. Modelleverandør, datatilladelser og motorversion er fortsat separate valg.
- Privacy Gate kontrollerer fortsat den færdige udgående forespørgsel og isolerer de lokale og eksterne arbejdstrin. En ny motor giver ingen nye data- eller værktøjstilladelser.

Onboarding B, layout og det godkendte UI bevares. En konkret afvisning af en værktøjshandling bruger fortsat Auras eksisterende afvisningskort og status “Klar”; V2-hændelsen må ikke vises som en forbindelsesfejl, udløse et automatisk rettelsesforsøg eller genindsætte den afviste opgave i skrivefeltet. Terminalen filtrerer samme markerede afvisning, mens reelle fejl fortsat vises. OpenEnv og en eventuel OpenSandbox-integration er fortsat udskudt.

## Eksisterende samtaler

Almindelige samtaler får en separat `runtime-v2`-mappe. Den gamle motordatabase bevares. Ved et rent versionsskift videreføres Auras gemte samtalehistorik og plan til den nye motor; den gamle motors sessionsreference gemmes. Dette er videreførelse af Auras gemte historik, ikke et løfte om at overføre skjult motortilstand eller ubegrænset historik. Ændret forbindelse, model, rute, skills eller regler må ikke udløse samme automatiske migration.

Privacy Gates beskyttede sessioner migreres særskilt i deres egne lokale og cloudbaserede partitioner. Før V2 åbner en V1-database, gemmes en verificeret kopi af V1-filerne uden for agentens tilladte filområde. Den native prøve kontrollerer samme sessions-ID og egen historik og afviser adgang til sikkerhedskopien. En ukendt eller ufuldstændig migration stoppes.

Godkendelser af enkeltstående handlinger afspilles ikke igen. Stop starter ikke selv en ny opgave. Ved mistet kvittering kontrollerer Aura den konkrete beskeds ID, før den fortsætter; den gentager ikke blindt et modelkald eller en filhandling.

V2 bevarer den oprindelige systeminstruktion i historikken og sender senere ændringer som eksplicitte instruktionsopdateringer. Planlæg → Byg bruger derfor den seneste opdatering i samme samtale. Særskilte tests kontrollerer denne kontrakt og komprimering med den valgte model.

## Verifikation

Kontrolleret den 25. oktober 2026 på macOS Apple Silicon med den versionslåste OpenCode 2.1.4 og Node 22.23.3:

| Prøve | Resultat |
|---|---|
| Hele desktop-testpakken, inklusive native motor- og isolationstests | 1.398 bestået, 0 fejl, 0 oversprungne |
| Terminalklient og pakkedistribution | 30 bestået, 0 fejl |
| Native terminalforløb | Login, plan, byg, tillad/afvis, preview, Stop, fortsættelse, genåbning og reel HTTP-fejl bestået |
| Native godkendelser og fejl i Electron | 8 kontroller bestået, inklusive afvisning uden falsk fejl, Stop/fortryd, fejlkategorier og 980 × 720-layout |
| Native planforløb i Electron | 11 kontroller bestået, herunder Planlæg → Byg i samme samtale |
| Privacy Gate-indstillinger i Electron | 6 kontroller bestået |
| Privacy Gate-deling i Electron | 5 scenarier bestået; præcise udgående bytes, afvisning, ændret destination og adskilte sessioner kontrolleret |
| Native samtaletilladelse/YOLO | Aktivering, tilbagekaldelse, genstart og beskyttet fil bestået |
| Migration og komprimering | Reel V1-database, permanent verificeret V1-kopi, genåbning, manuel/automatisk komprimering og fejl ved sammenfatning afprøvet |
| Runtime-indhold | 5.224 filer/links verificeret mod manifest og kontrolsummer |

App-prøverne bruger den rigtige Electron-app og OpenCode-motor med kontrollerede lokale modelservere og syntetiske data. De afprøver den faktiske protokol og udførelse, ikke kvaliteten af svar fra en ekstern model. Der er ikke brugt brugercredentials eller foretaget betalte modelkald til Corti, Mistral eller andre udbydere. Windows, Linux og Intel-Mac er ikke kørt som native systemprøver; deres pakkevalg og låsemetadata er kontrolleret i testpakken.

Detaljerede logs, screenshots, modelkald og checksums ligger i den lokale rapportmappe `ReleaseReports/opencode-2.1.4-upgrade-20261025`. Testprofiler ryddes op, mens testbeviser og genereret projektkilde bevares. Eksisterende lokale Privacy Gate-ændringer er bevaret.

Den eksisterende produktionsafhængighedsanalyse viser tre højt klassificerede fund i afhængighedskæden omkring sandbox-runtime/node-forge/zod. De blev ikke introduceret af OpenCode-opgraderingen og er ikke løst ved en blind nedgradering af isolationens runtime. Denne verifikation er derfor ikke en erklæring om, at alle afhængigheder er uden kendte sårbarheder.

Tidligere testbeviser med OpenCode 1.18.33 er historiske og gælder ikke automatisk for 2.1.4. Opgraderingen er lokal kildekode og klargjort runtime; der er ikke lavet commit, push, DMG, GitHub Release eller ændret i den installerede app.
