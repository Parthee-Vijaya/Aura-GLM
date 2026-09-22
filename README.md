# AI Harness

A proposed modular, open-source foundation for building and deploying applications with AI.

The initial use case is municipal application development, with context from [AI Alliancen](https://ai-alliancen.org/). The modules are intended to be reusable across organisations and providers.

**Status: discovery and design.** This repository currently contains discussion documents, not working software. It captures an initial design conversation for wider review, not formal approval by AI Alliancen or participating organisations. Implementation choices and partner commitments still need review. AI Harness (`ai-harness`) is a working name, and an open-source license has not yet been selected.

## What we want to make possible

Municipal staff should be able to describe an application, build and inspect it with AI, and publish it through a guided workflow. Organisations should be able to supply shared instructions, approved services, and enforceable access rules. Providers and municipalities should be able to contribute integrations without owning the whole stack.

The proposed foundation is modular:

- **User interface:** a downloadable application that makes development approachable without operating a terminal.
- **Coding-client integration:** OpenCode behind the first-party interface; integration paths for people who prefer OpenCode directly, Claude Code, or Codex. Support and guarantees must be verified separately for each client.
- **Model connections:** approved APIs, Corti, Azure-hosted models, or self-hosted inference, subject to compatibility testing.
- **Project profiles:** versioned guidance, templates, restrictions, and checks, with a visible distinction between advice and enforced policy.
- **Organisation setup:** optional sign-in and centrally managed configuration, permissions, service connections, and allowances.
- **Execution controls:** explicitly scoped isolation and access restrictions appropriate to the environment.
- **Deployment:** guided configuration, secret handling, clean builds, provider selection, live verification, and recovery.
- **Evidence:** records of what was requested, permitted, tested, released, and observed.

People can use the complete application or adopt individual components. Optional layers have dependencies: a configuration cannot claim protections it does not actually enforce.

## First proof of concept

The proposed demonstration is a hackathon on **23 October 2026**, with roughly **30–40 participants** from different organisations.

- Participants build in **local workspaces on their own laptops**.
- The downloadable interface is expected to manage OpenCode locally.
- Everyone is assigned to a real, shared **Hackathon organisation** with centrally maintained rules and service configuration.
- Participants retain individual identities and permissions. Common policy does not imply access to each other's projects or secrets.
- Shared services may provide inference, connectors, and deployment without hosting the coding workspaces centrally.
- Hosting generated applications is separate from where participants build them.

The desired experience is: sign in → start a project → describe and refine an application → inspect its preview → run checks → publish to a compatible destination → verify and export it.

Which client integrations, operating systems, models, and deployment destinations the event will support remains to be decided and tested. Synthetic/public data is the proposed event baseline, pending agreement.

## Boundaries we intend to make explicit

Instructions guide an agent; they do not themselves enforce permissions. Restrictions on shared services must be enforced by those services. Restrictions on local execution need a tested local boundary. An unmanaged laptop's owner can operate outside this harness.

A controlled development environment does not establish that a generated application is correct or ready for operational use. Application checks, human review, and release decisions are separate. Agents embedded inside the finished applications are a separate runtime concern.

## Meeting documents

- [Current direction and open decisions](docs/decisions.md)
- [Hackathon POC and evidence needed](docs/hackathon-poc.md)
- [Earlier options research](harness-options.md) — background analysis containing alternatives that have since changed; the current direction above and the decision record take precedence.
- [Contributing](CONTRIBUTING.md)

No implementation, provider certification, security guarantee, or production readiness is claimed. Progress should distinguish **written → unit-tested → run against real material → deployed and observed**, naming the inputs and environment used.
