# Aura Prime — forkens arbejdsregler

- Dette repository er `Parthee-Vijaya/Aura-Prime` (navneskiftet fra Aura GLM til Aura Prime er vedtaget 1. november 2026; navnet har én kilde i `desktop/core/distribution.cjs`). Originalen og dens åbne PR'er ændres kun ved en særskilt bestilling.
- Bevar det godkendte UI, onboarding B, funktioner, planer og godkendelser. UI/UX-ændringer kræver brugerens konkrete ønske og accept; en allerede givet accept skal ikke gentages.
- Kommunikation og dokumentation er på dansk; kode, symbolnavne og commits er på engelsk.
- **Designhjælpen er altid aktiv i Aura Prime.** Bevar Aura-design og den leverede byggevejledning som grundpakke fra første idé-, plan- og byggeforsøg. Første udkast skal have gennemarbejdet design og visuel kontrol. Gamle fravalg og projekttilpasninger må ikke fjerne grundmetoden; planer, dataregler og værktøjsgodkendelser gælder fortsat.
- Følg [release- og oprydningsreglerne](docs/releases/POLICY.md). Fra 2026-11-01 hedder produktet **Aura Prime**; versionsrækken fra 2026-10-25 begyndte ved **Aura 1 beta 0.3.1**.
- Vælg selv næste versionsnummer efter ændringens størrelse, og synkronisér appmetadata, installationspakke, feed, release og dokumentation. Versionsmærket i UI læser den kørende apps metadata.
- **Lokal kildekode må aldrig slettes som oprydning**, heller ikke efter commit og push. Det omfatter lokale checkouts, worktrees, prøvescripts og lokale ændringer. Commit/push er ikke en sletningstilladelse.
- Oprydning må kun fjerne verificerede, ubrugte byggede pakker, caches og syntetiske testdata. Bevar brugerdata, credentials, rapporter og udgivelsesbeskrivelser. Undersøg processer, åbne filer og referencer før sletning.

- **YOLO er en samtaletilladelse under Byg.** Kræv en konkret advarsel og bekræftelse før aktivering; valget skal kunne tilbagekaldes og må ikke gemmes til næste appstart. Det erstatter almindelige værktøjsgodkendelser, men må ikke ophæve planvalg, datadelingsregler, beskyttede filer eller teknisk isolation.
