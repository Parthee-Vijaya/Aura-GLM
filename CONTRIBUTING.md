# Bidrag til Aura Harness

Dansk er dokumentets primære sprog. En engelsk version følger nedenfor.

## Projektets aktuelle fokus

Projektet er i en tidlig afklarings- og designfase. Den første POC skal være en enkel brugerflade, hvor man kan hente AI-konfigurationsfiler og læse, hvordan de bruges med blandt andet Claude Code, Codex og OpenCode.

Konfigurationerne skal formidle god udviklingspraksis, eksempelvis versionsstyring og at undgå hemmeligheder i commits. Instruktioner til en AI er vejledning og kan ikke i sig selv garantere, at regler bliver overholdt.

Bidrag til krav, anvendelsestilfælde, konfigurationsfiler, vejledninger og afprøvning er velkomne. Større udvidelser bør drøftes, før implementeringen begynder.

## Sådan bidrager du

- Beskriv behovet og de mennesker, bidraget skal hjælpe, gerne med et konkret kommunalt eksempel.
- Skeln mellem en foreslået funktion og en eksisterende, afprøvet funktion.
- Angiv, hvilket værktøj eller hvilken del af projektet bidraget vedrører, samt eventuelle nye afhængigheder.
- Forklar, hvordan andre kan efterprøve resultatet, også når noget går galt. For værktøjsspecifikke konfigurationer skal du angive, hvilke versioner og miljøer du har afprøvet dem i.
- Skriv vejledninger, så de kan følges uden indforstået teknisk viden. Brug dansk som udgangspunkt.
- Medtag ikke borgeroplysninger, adgangskoder, API-nøgler, privat korrespondance eller fortrolige oplysninger fra samarbejdspartnere. Brug pladsholdere i eksempler.

## Fremtidige integrationer

På sigt ønsker vi at understøtte bidrag med modelforbindelser, værktøjs- og datakonnektorer, hostingadaptere, skabeloner og organisationsprofiler. Deres endelige grænseflader er endnu ikke fastlagt, og de er ikke krav til den første POC.

Et integrationsforslag bør beskrive den ansvarlige vedligeholder, licens, understøttede versioner, funktioner, konfiguration, nødvendige rettigheder, håndtering af legitimationsoplysninger og driftsansvar. Medtag et reproducerbart eksempel på korrekt funktion samt relevante eksempler på afviste handlinger og genopretning efter fejl.

At en integration er tilgængelig fra fællesskabet, er ikke det samme som, at projektet har verificeret den, eller at en kommune har godkendt den. Et bidrag må ikke ubemærket udvide eksisterende installationers rettigheder eller blive aktiveret som standard.

## Beslutninger, der stadig mangler

Projektet er licenseret under EUPL-1.2; se [LICENSE](LICENSE). Bidrag modtages under samme licens. Projektets vedligeholdere, bidragsvilkår, proces for verifikation af integrationer og private kanal til indrapportering af sikkerhedsproblemer er endnu ikke fastlagt. Disse forhold skal afklares, før eksterne kodebidrag påbegyndes.

---

# Contributing to Aura Harness

Danish is the primary language of this document. This section provides the English version.

## Current project focus

The project is in an early discovery and design phase. The first POC will be a simple interface where people can download AI configuration files and learn how to use them with tools including Claude Code, Codex, and OpenCode.

The configurations should convey good development practices, such as version control and keeping secrets out of commits. AI instructions provide guidance and cannot, by themselves, guarantee that rules are followed.

Contributions to requirements, use cases, configuration files, guides, and evaluation are welcome. Larger extensions should be discussed before implementation begins.

## How to contribute

- Describe the need and the people your contribution should help, preferably with a concrete municipal example.
- Distinguish a proposed feature from an existing, tested feature.
- Identify the tool or part of the project your contribution concerns, along with any new dependencies.
- Explain how others can verify the result, including failure cases. For tool-specific configurations, state which versions and environments you tested them in.
- Write guides that can be followed without assumed technical knowledge. Use Danish by default.
- Do not include citizen records, passwords, API keys, private correspondence, or confidential partner information. Use placeholders in examples.

## Future integrations

In the longer term, we intend to support contributions of model connections, tool and data connectors, hosting adapters, templates, and organisation profiles. Their final interfaces are not yet specified, and they are not requirements for the first POC.

An integration proposal should identify its maintainer, license, supported versions, capabilities, configuration, required permissions, credential handling, and operating responsibilities. Include a reproducible success case and relevant examples of denied actions and recovery from failures.

Community availability, project verification, and approval by an individual municipality are different statuses. A contribution must not silently expand existing installations' permissions or become enabled by default.

## Decisions still required

The project is licensed under the EUPL-1.2; see [LICENSE](LICENSE). Contributions are accepted under the same licence. The maintainers, contribution terms, integration-verification process, and private security-reporting channel are not yet established. These matters must be resolved before external code contributions begin.
