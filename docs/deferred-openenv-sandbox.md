# Udskudt: OpenEnv og OpenSandbox

**Besluttet 25. oktober 2026:** Parthee bad om at gemme nedenstående til senere og prioritere færdiggørelse af Privacy Gate. Ingen nye modelprøver, OpenSandbox-installation eller produktintegration startes som del af den udskudte opgave.

Dette udskyder valget af OpenSandbox og den videre OpenEnv-pilot. Det udskyder ikke den håndhævede fil- og netværksisolation, der er nødvendig for Privacy Gates beskyttelsesløfter.

## Verificeret udgangspunkt

- OpenEnv 0.10.0 er en separat pilot under `evals/openenv/`, som bruger Auras Workbench, planvalg og godkendelser. Den er ikke en sikkerhedssandbox og skal ikke i sig selv med i en DMG.
- Mistral- og Corti-forløb og fem efterfølgende GPT-forløb findes med screenshots og bevaret fejlhistorik. De fem kommunale GPT-forløb er ikke en ny, kontrolleret tremodelsammenligning på den sidste skilltekst og fokusrettelse.
- Den fælles pilotrunner understøtter Mistral/Corti; GPT og flere senere prøver bruger særskilte scripts. Faste gentagelser og en samlet releasekontrol mangler.
- Forkens eksisterende isolation bruger `@anthropic-ai/sandbox-runtime` til udvalgte automatiske kommandoer. Den omfatter ikke automatisk alle enkeltgodkendte kommandoer, pakkeinstallationer eller previewservere. Previewets browserbeskyttelse er ikke OS-isolation af serverprocessen.
- OpenSandbox er ikke integreret. Dets dokumenterede lokale opsætning kræver Docker. Driftsform, installation, ressourceforbrug og platformstøtte skal derfor vurderes før en produktbeslutning.
- Design- og evalueringsopfølgningen er sendt i [forkens PR #25](https://github.com/Parthee-Vijaya/ai-harness/pull/25). Status ved denne notits: åben, ikke merged og ikke i en ny DMG.

## Arbejdet, der genoptages efter en ny bestilling

1. Saml OpenEnv-prøverne i én reproducerbar runner og rapport. Frys opgave, materialer, kildecommit, skills og tilladelsesgrænser. Hold billige protokoltests adskilt fra betalte modelkørsler.
2. Kør samme opgave med GPT, Mistral og Corti og flere friske gentagelser, eksempelvis tre pr. model. Gem første og sidste udkast, faktisk funktion, visuel vurdering, fejl, rettelser, timeout og forbrug. Ingen manuelle kodeændringer for at forbedre modellens resultat.
3. Byg en afgrænset lokal OpenSandbox-pilot: ét normalt bygge-, installations- og previewforløb. Mål opstartstid, disk og hukommelse, og sammenhold med Auras eksisterende isolation før valg af produktmotor.
4. Afprøv kontrolleret filudveksling og netværk, beskyttede filer, symlinks, underprocesser, installationsscripts, preview, Stop og genoptagelse. Ingen usikret reservevej eller ophævelse af planer, godkendelser og dataregler.
5. Ved senere produktintegration: bevar det godkendte UI og gennemfør native accept fra den faktisk installerede app. En vellykket evalueringskørsel er ikke i sig selv en DMG-kvalifikation.

## Kilder

- [Pilot og afgrænsning](../evals/openenv/README.md)
- [Fem kommunale GPT-forløb](../evals/openenv/MUNICIPAL-LANDINGS-2026-10-25.md)
- [OpenSandbox, officiel dokumentation](https://github.com/opensandbox-group/OpenSandbox)

Genkontrollér versions-, PR- og driftsstatus, når arbejdet genoptages. Denne note er en prioriteringsbeslutning, ikke en bestået integrationstest.
