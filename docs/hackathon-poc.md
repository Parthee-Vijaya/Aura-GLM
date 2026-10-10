# Hackathon POC

> Historisk oplæg til den første POC, ikke en beskrivelse af den aktuelle app. Se [betastatus](beta.md) og [teststatus](teststatus.md) for det, der findes og er afprøvet.

Proposed event: 23 October 2026 · approximately 30–40 participants

**Maturity: written.** This is a discussion specification. No application, integration, isolation boundary, or deployment workflow has been implemented or tested.

## Intended participant journey

1. Install and open the application, or connect a supported existing coding client.
2. Sign in and receive individual access to the shared Hackathon organisation.
3. See the active profile, approved services, and applicable restrictions.
4. Create a local project from a suitable template and describe the application.
5. Inspect its preview, request changes, understand approvals, and recover from an unsuccessful edit.
6. Run checks and review what is ready or unresolved.
7. Select a compatible, approved hosting destination and complete guided configuration.
8. Approve the concrete deployment, verify the hosted result, and export the source and setup instructions.

This describes the full desired journey; it is not a commitment that all named clients or hosting providers are supported. Meetings must identify the actual combinations to implement and verify.

## Event organisation

One organisation profile supplies common guidance, service connections, and permissions. Each participant has an individual identity and scoped access. Collaboration requires an explicit sharing mechanism; membership alone does not share local files.

The coding engine runs locally. Central services may authenticate users, enforce access to models and connectors, manage usage, and perform approved deployments. Shared provider master credentials must not be distributed to participants or exposed to the coding agent.

Organisers need visibility into service health and consumption, a way to revoke access, and support diagnostics that do not require indiscriminate collection of participant files or prompts. Decide the precise diagnostic data and retention policy before the event.

## Deployment experience

The module should determine application requirements and show compatible destinations. Its configuration form distinguishes public settings, server-side secrets, and build-time settings. Secret values must not be solicited through agent chat or embedded in browser bundles.

A deployment starts from a complete, reproducible project snapshot rather than incidental laptop state. Record the artifact and configuration being approved. When a provider rebuilds source, record and check the resulting remote artifact rather than claiming it is identical without evidence.

Verify the actual deployed URL and representative workflows. State whether data survives restart and redeployment. Code rollback and database recovery are separate capabilities. Temporary previews need explicit access settings and expiration; persistent applications need an operational owner.

## Evidence required

- **Local setup:** the installer and recovery flow succeed on the actual supported OS configurations, including relevant municipal laptop restrictions.
- **Coding workflow:** the selected client/model pair completes editing, tool calls, testing, error recovery, cancellation, and reconnect against a real sample project.
- **Configuration:** guidance loads correctly; mandatory shared-service restrictions cannot be weakened by project settings or alternate client calls.
- **Isolation:** test the actual promised local boundary, with attempted reads outside the workspace and forbidden network operations. Report uncovered paths honestly.
- **Identity and access:** test wrong-project access, revoked credentials, exhausted quotas, and attempts to reuse another participant's approval.
- **Application quality:** independent acceptance cases exercise the generated application, including its important failure cases. Agent-written tests are supplementary evidence.
- **Hosting:** a clean-source deployment passes live workflow checks; restart and update preserve expected data. Recovery is demonstrated within its stated limits.
- **Portability:** a second team runs the exported project without the original participant's credentials or undocumented laptop files.
- **Event load:** exercise the agreed concurrent-session load and provider quotas, including interruptions and rate limits. Participant count alone does not establish the expected active workload.
- **Support and exit:** demonstrate participant help, access revocation, source export, and the agreed post-event retention process.

For each result record: configuration/version, input material, expected behaviour, observed behaviour, limitations, and evidence location. A synthetic-data trial must not be presented as validation of sensitive-data use.

## Operational readiness decisions

Before participant onboarding, identify the owners of identity, model capacity, local installation support, hosting, incident response, and post-event cleanup. Agree what happens when an external service fails; do not silently route data to another provider.

Accounts, quotas, network reachability, and deployment targets must be exercised before the live event. Keep participant-facing explanations actionable: what happened, what was preserved, and what they can do next.
