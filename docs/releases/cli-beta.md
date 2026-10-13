Aura CLI er terminaludgaven til udviklingsmaskiner med Node 22.12 eller nyere, npm og Git. Samme npm-pakke bruges på Windows, Linux og macOS; npm henter den versionslåste OpenCode-motor til din platform. Pakken indeholder hverken AI-model, kreditter eller Electron-appen.

Hent npm-pakken og `SHA256SUMS.txt` fra denne udgivelse. Kontrollér filen, og følg `WINDOWS.md`, `LINUX.md` eller `MACOS.md`. `CLI-RELEASE.json` angiver version og kildecommit. Installationen kræver ingen kloning af repositoryet, global npm-installation eller ændring af PowerShells scriptpolitik.

**Afprøvning:** CLI'ens kodeforløb er kørt på macOS arm64 med rigtig OpenCode, faktiske projektfiler og en kontrolleret lokal modelserver. Windows, Linux og Intel-Mac mangler en prøve på en rigtig målmaskine. Udgivelseskontrollen kontrollerer arkiv, kildekode og kontrolsummer; den erstatter ikke disse installationsprøver.

API-nøgler gemmes i CLI'ens separate, adgangssætningsbeskyttede lager. Komplai tilbyder browserlogin og manuelt API-token, når backend, organisationsadgang og metadata er klar. Denne udgivelse lover ikke, at Komplais produktionsadgang er færdigafprøvet. Du kan bruge andre understøttede modelforbindelser.

Brug et separat projekt med opdigtede data. Agentens kommandoer kører med din brugers rettigheder. Installation af projektpakker, Git-gemning og testudgivelse kræver handlinger i CLI'en; pakken starter ingen GitHub Actions. Der er ingen automatisk opdatering.

[Installation og platformsguides](https://ai-alliancen-org.github.io/ai-harness/terminal.html) · [Fejlrapporter](https://github.com/ai-alliancen-org/ai-harness/issues/new/choose) · [Privat rapportering af sikkerhedsfejl](https://github.com/ai-alliancen-org/ai-harness/blob/main/SECURITY.md)
