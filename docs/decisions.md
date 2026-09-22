# Current direction and open decisions

Meeting input · 22 September 2026

These records capture the project discussion, not formal approval by all participating organisations. No implementation has begun. The working name is **AI Harness** (`ai-harness`); municipal use is the initial context rather than a restriction on who can adopt it.

## AI Alliancen context

The [AI Alliancen website](https://ai-alliancen.org/) describes an independent professional network and introduces Agent Harness as an architecture proposal involving controls outside the agent. Its [member page](https://ai-alliancen.org/medlemmer) emphasises reusable experience across organisations and states that membership is not a product endorsement. Its [principles and meeting charter](https://ai-alliancen.org/charter) are explicitly a draft awaiting shared discussion and approval. These sources provide context, not adopted project governance or confirmed partner commitments. Reviewed 22 September 2026; the detailed knowledge page could not be retrieved during this review.

## Current direction

1. **Modular foundation.** The interface, client adapters, model connections, profiles, organisation configuration, execution controls, deployment, and evidence can be adopted separately, subject to documented dependencies.
2. **Approachable first-party interface.** Explore a downloadable application using OpenCode as its local coding backend. Do not require ordinary participants to operate a terminal.
3. **Other clients remain possible.** Design shared services and configuration contracts so participants can use existing coding clients. Do not promise equivalent support before testing each integration.
4. **Local workspaces for the POC.** Participants build on their laptops. This supersedes the earlier recommendation for centrally hosted coding workspaces. Local isolation and dependency installation remain design decisions.
5. **One real event organisation.** Assign participants to a shared Hackathon organisation. Store its configuration as organisation data rather than hardcoded application-wide settings.
6. **Individual access.** Shared organisation membership does not grant access to everyone else's projects. Service credentials and deployment permissions must be scoped and revocable.
7. **Optional organisation management.** Later deployments can inherit municipal configuration through verified organisational sign-in. Independent use remains possible without that service.
8. **Guided deployment.** Treat hosting as a separate module. Explain configuration, provider compatibility, secrets, audience, costs, checks, and recovery. Verify the actual hosted application.
9. **Open contribution model.** Providers and municipalities should be able to contribute model integrations, tool/data connectors, hosting adapters, profiles, and templates under documented contracts and tests.
10. **Evidence over blanket guarantees.** State exactly which version, environment, and configuration was tested. Guidance, enforced restrictions, application quality, and operational approval are distinct claims.

## Questions for upcoming meetings

### Product and event

- Which operating systems and managed municipal laptop restrictions must we support?
- Who are the participants, and what facilitator support will be available?
- Which concrete application tasks should demonstrate success?
- What is the required client coverage for the event, and what can be labelled experimental?
- Are only synthetic/public data permitted? Who approves the event data policy?
- Is the event outcome a preview, a persistent application, or both?

### Identity and organisation configuration

- How do participants enrol in the Hackathon organisation: invitation, event login, or existing identity providers?
- Which settings are adjustable defaults and which are mandatory restrictions?
- Who administers the event, approves publication, and can revoke access?
- Which event records are retained, for what purpose, and for how long?

### Local execution and service access

- What local sandbox mechanism supports each required OS, and what are its demonstrated limits?
- How does installation work without requiring unsupported administrator access?
- Which services must be reachable from municipal networks?
- Which credentials remain service-side, and which scoped tokens are issued to clients?
- How does each supported client inherit guidance and authenticate to shared services?

### Models and hosting

- Which actual model endpoints and versions are available, and what capacity is reserved for concurrent use?
- Which hosting integrations will partners supply, and under what licenses and operating responsibilities?
- Which application capabilities must deployments support: databases, persistent files, authentication, jobs, or external connectors?
- Who owns the hosting accounts, costs, application domains, backups, and post-event operation?
- What happens to previews, project data, and participant access after the event?

### Project stewardship

- Confirm repository name and whether discussion documents are public now.
- Select the project license and contribution terms before accepting reusable code contributions.
- Name maintainers and define how architectural decisions are accepted.
- Agree how integrations become verified and how vulnerabilities are reported privately.

## Recording later decisions

For each material decision, record the problem, chosen approach, responsible owner, consequences, and evidence needed to revisit it. Distinguish a proposal from an accepted decision. Record partner capabilities as unverified until confirmed and exercised.

## Opdateret POC-retning

- **POC 1:** En enkel dansk hjemmeside med download af fælles AI-instruktioner og værktøjsspecifikke vejledninger til Claude Code, Codex og OpenCode. Ingen konti, modelkald eller central styring i denne POC.
- **POC 2:** En installerbar app til Windows og Mac med lokal agentmotor og brugerens egne modelforbindelser. Samtalen vises til venstre og en løbende forhåndsvisning af den applikation, der bygges, til højre. Forhåndsvisningen skal afspejle de aktuelle ændringer og vise forståelig status ved opstart og fejl. De to POC'er skal dele konfigurationsgrundlag.
- Disse præciseringer erstatter tidligere beskrivelser af den første POC som en samlet desktop-, organisations- og hostingløsning. Den bredere arkitektur er fortsat en fremtidig retning.
- **POC 2, oplevelse:** Lovable-inspireret brugerflade med en lokal live-server. En fremtidig “Gem”-handling skal kunne oprette et Git-commit efter en synlig gennemgang af de relevante ændringer. En separat “Deploy”-handling skal udgive til den valgte, konfigurerede destination. Dette er produktfunktioner til senere afklaring og ændrer ikke reglen om, at assistenten ikke laver commits i dette repository.
- **POC 2, projektoprettelse:** Start nye projekter med en guidet init-/planfase. Afklar projektets navn, formål, teknologiønsker, kodekonventioner, teststrategi (herunder TDD, almindelige unit-tests eller uden unit-tests) og mappeplacering. Tilbyd forståelige anbefalinger, når brugeren ikke har en præference. Vis en samlet plan og de valgte standarder til godkendelse, før agenten opretter mappestruktur, dokumentation og projektregler. Gem valgene i projektet, så efterfølgende arbejde følger dem. Et valg uden unit-tests skal stadig have en aftalt måde at afprøve brugerrejser på. Undersøg eksisterende indhold før oprettelse; overskriv ikke en eksisterende projektmappe. Dette er et designkrav, ikke en implementeret funktion.
