# An open public-sector application-building harness

> Historisk oplæg fra 22. september 2026. Beskrivelserne af manglende implementering gælder tidspunktet for oplægget. Se [aktuel betastatus](docs/beta.md).

Discussion brief · 22 September 2026

Status: research and proposed experiments. No harness has been implemented, unit-tested, run against real material, or deployed. Product capabilities below were checked against primary documentation; architectural recommendations are judgments, not benchmark results.

## The decision before the technology

The technologies in the initial discussion belong to different layers. They can be combined rather than selected as mutually exclusive alternatives.

Three possible products are hiding inside the word “harness”:

1. **A development harness:** helps people instruct a coding agent, edit code, execute tests, and inspect an application preview.
2. **A runtime harness:** controls agents embedded in the finished applications, including access to municipal data and consequential actions.
3. **A shared application foundation:** reusable templates, connectors, deployment definitions, documentation, and tests that make one municipality’s application usable by another.

The email promises elements of all three. A coding agent can also build an ordinary application with no AI at runtime. That application still needs its own authentication, authorization, data handling, and operational ownership.

Working definition to discuss: **An open, reusable environment for building applications with AI, with externally enforced access boundaries and evidence of what was built and approved.**

Unresolved: participant skill mix; whether Denmark-only hosting is mandatory; permitted data; whether previews or operational deployment are the intended outcome; and whether runtime agents are in scope. These choices affect architecture and should be settled before implementation planning.

## Option 1 — A portable project kit

**Composition:** AGENTS.md and tool-specific instructions, reusable skills, application templates, example datasets, tests, and deployment documentation.

**Value:** encodes public-sector development practices in a form municipalities can inspect, fork, and improve. Can guide Danish interface language, accessibility expectations, documentation, connector use, and preferred application structure.

**Limits:** instructions are not authorization. An agent can misunderstand them, encounter hostile instructions, or edit the very file that tells it what to do. A kit does not isolate files, block network requests, or prove an application is suitable for operational use. Instruction discovery and precedence also vary by client.

**POC evidence:** build the same sample application with and without the kit; compare independently checked acceptance criteria, documentation quality, and facilitator interventions. Keep the task and model constant where possible.

**Assessment:** valuable in both recommended POCs; insufficient as the sole control mechanism.

## Option 2 — A controlled environment around an existing coding agent

**Composition:** an existing coding agent inside a per-project sandbox, centrally managed policy, restricted outbound network access, scoped credentials, approvals, and an external event store.

**Value:** keeps the agent’s existing editing and debugging capabilities while controlling what its actions can affect. This is the closest fit to the email’s promises about tools, permissions, and documentation.

**Limits:** agent permission dialogs are only one layer. If the same action is reachable through an unrestricted shell, browser, or alternate credential, the rule is bypassable. A local user who controls their laptop can also bypass locally administered restrictions; a managed remote environment establishes a different boundary. A container is not automatically an adequate hostile-code or tenant-isolation boundary.

**POC evidence:** complete a useful application task, then deliberately attempt a prohibited upload, cross-project read, policy edit, and unapproved publication. Observe the denial at the enforcing component, not just the agent’s stated intention.

**Assessment:** strongest candidate for the shared technical core.

## Option 3 — A browser workspace people can build in

**Composition:** a web application with a Danish-language task brief, conversation, isolated preview, change history, comprehensible approvals, and source export; a coding engine runs behind it in a sandbox.

**Value:** can make the workflow usable without installing developer tools or understanding terminal commands. Gives municipal staff a consistent way to describe needs and inspect results.

**Limits:** the interface does not itself secure the execution. Identity, project separation, session persistence, cancellation, recovery, and preview isolation must be designed. Generated previews should use a separate origin from the management interface so generated code cannot access the control session.

**Reuse opportunity:** OpenCode exposes a server API, making it a candidate backend for a custom interface. Evaluate Promte’s actual exportable components before choosing to replace or depend on them. The email establishes an intention to release selected components, not their exact capabilities or licenses. [OpenCode server documentation](https://opencode.ai/docs/server/)

**POC evidence:** participants create and modify an application, understand an approval request, recover from a failed edit, and export a project another team can run. Record facilitator assistance and unresolved errors.

**Assessment:** a distinct usability experiment over the same core as option 2.

## Option 4 — Gateways for inference and external actions

Separate three functions:

- **Model gateway:** authenticates inference requests, selects approved providers, applies quotas, and records request metadata.
- **Tool gateway:** authorizes specific actions on data or external services, validates arguments, and verifies any required human approval.
- **Network boundary:** prevents direct connections that bypass those gateways, including connections from shell scripts and generated applications.

These are logical responsibilities; a POC need not implement three independent products. A model proxy alone cannot control arbitrary execution. A tool protocol such as MCP does not replace authorization at the service that owns the data.

An approval should be bound to the actual operation: identity, project, action, target, relevant parameters or artifact digest, and expiration. If the proposed action changes, the previous approval should not authorize it. Keep production credentials outside the coding workspace.

**Assessment:** part of the shared core where needed. Start from concrete permitted and prohibited actions before selecting a policy-engine dependency.

## Option 5 — Self-hosted inference, serving changes, or model tuning

These are separate interventions:

- **vLLM serving:** operates model inference and exposes API capabilities.
- **Serving configuration:** changes chat templates, tool parsers, constrained output, and request handling.
- **Weight changes or fine-tuning:** change learned behaviour and need a training and evaluation workflow.

vLLM documents model-specific tool-calling support and configuration. That means the full client/model/server combination must be tested; a compatible-looking HTTP endpoint is insufficient. [vLLM tool calling](https://docs.vllm.ai/en/latest/features/tool_calling/)

**Value:** control over model operation and a path to independently hosted inference. Tuning may address demonstrated coding or language failures.

**Limits:** none of these replaces external permissions. A refusal learned by a model is not an authorization boundary. Valid JSON does not establish that an action is appropriate or permitted. Model operations introduce capacity, upgrades, model-license review, and evaluation responsibilities.

**Assessment:** test an existing suitable endpoint first. Make tuning or serving modifications a separate experiment if observed failures justify them; do not make an unproven model modification a prerequisite for all participants.

## Current tool fit

### OpenCode

A promising first integration candidate because it documents custom OpenAI-compatible providers, configurable permissions, and a server interface. Corti’s current Models documentation explicitly describes using OpenCode with its endpoint. This establishes a documented integration path, not a verified end-to-end result. [Providers](https://opencode.ai/docs/providers/) · [Permissions](https://opencode.ai/docs/permissions/) · [Corti quickstart](https://docs.corti.ai/models/quickstart)

### Codex

An alternative coding client to evaluate. Official configuration supports custom model providers and sandbox settings. Verify the selected client version’s wire protocol, streaming, tool calls, and endpoint behaviour before claiming Corti compatibility; Chat Completions and Responses are not interchangeable merely because both are described as OpenAI-compatible. [Official OpenAI documentation](https://learn.chatgpt.com/docs/config-file/config-advanced)

### Claude Code

A useful comparator for coding workflow and approvals. Its gateway documentation describes Anthropic-format endpoints; a generic OpenAI-compatible endpoint alone does not establish compatibility. It also documents sandbox controls. Verify the particular model/gateway combination and distribution terms before treating it as part of a redistributable open-source product. [Gateway documentation](https://code.claude.com/docs/en/llm-gateway) · [Sandbox documentation](https://code.claude.com/docs/en/sandboxing)

### Corti and DCAI/Gefion

Corti publicly describes a coding-oriented OpenAI-compatible endpoint and an EU-CPH/Gefion infrastructure offering. Treat hosting, retention, and isolation statements as vendor claims to confirm for the supplied event service. The provided email does not establish the event’s endpoint, model version, throughput, or contractual configuration. Inference hosting also does not establish where workspaces, previews, audit logs, backups, or generated applications run. [Corti Models](https://www.corti.ai/models)

## Two recommended experiments

### POC A — Controlled coding with an existing client

**Question:** Can people build a useful application with the chosen inference service while meaningful access boundaries hold?

Candidate composition: OpenCode, Corti’s confirmed endpoint, a managed per-project execution sandbox, a portable starter kit, restricted networking, a controlled preview/publish action, and external audit events.

Use a concrete municipal task such as an internal service catalogue using synthetic records. Require a user-visible change, an independently checked test, a preview, and source export. Trigger hostile instructions in a fixture document and deliberate attempts to bypass restrictions. Confirm both successful allowed actions and blocked forbidden actions.

### POC B — A guided municipal builder

**Question:** Can the intended municipal users reach and assess a useful result without relying on a developer to operate the tooling?

Use the same agent, model, template, and control boundary where possible. Add the browser workflow, change inspection, clear approvals, recovery, and export. Candidate implementation paths are an evaluated Promte component or a custom interface over an existing agent API; which one fits is unresolved.

Compare against POC A on the same task. Measure acceptance-criteria completion, correctness, assistance requests, approval comprehension, recovery success, and reproducibility. Do not infer security from user satisfaction or coding ability from a successful connection test.

### Conditional alternative — A runtime-agent experiment

If agent-powered municipal workflows are the main objective, replace one of the above with a runtime POC: read synthetic cases, draft a proposed action, require human approval, and execute through a narrowly authorized tool. Test changed arguments, expired approvals, and retries without duplicate side effects. This is a separate hypothesis from AI-assisted application development.

## What the shared open-source deliverable should contain

The portable value is the combination of policy definitions, agent/provider adapters, sandbox configuration, starter applications, connector contracts, event schema, and executable evaluation cases. Keep provider-specific integration out of municipal business logic.

Each shared application should include source, dependency lockfiles, synthetic fixtures, configuration documentation, tests, build/deploy instructions, data-flow notes, and an identified maintenance owner. Inspect licenses for each shipped component and model; a publicly visible repository or open weights does not by itself establish redistribution rights.

Record actor, project, run ID, agent/model version, policy version, requested action, decision, approval, outcome, and artifact identifier. Store authoritative events outside the agent’s writable workspace. Prefer necessary metadata over retaining all prompts and records; log access and retention need explicit decisions.

Sharing succeeds when a second team can run and adapt the exported project without the original builder’s account or secrets. Provider portability succeeds when a second approved endpoint passes the same task and control tests, not merely when a base URL can be edited.

## Evidence required before the hackathon claims success

1. The actual chosen client/model/endpoint completes a multi-step edit–test–repair task, including streamed tool calls and recovery from failures.
2. All participating projects have separate credentials and storage boundaries. A cross-project access attempt fails.
3. A prohibited network action is denied even when attempted outside the preferred tool path; policy cannot be weakened from the agent workspace.
4. Approval denial, cancellation, expiration, and changed action parameters prevent execution. Retries do not duplicate side effects.
5. A participant understands what was built, what was approved, and how to export it. A second team runs the exported application.
6. Test expected concurrent active sessions, long conversations, quotas, and request failures against the actual event service. Forty attendees does not establish forty active agent sessions; agree the intended load with partners.

Use synthetic/public data as a proposed POC profile, pending agreement. It still matters that source, credentials, logs, and partner material follow the agreed data boundary. Danish inference alone is not proof that the entire workflow is Denmark-hosted or that an application satisfies public-sector requirements.

## Questions to settle with partners

- Participants: nontechnical staff, developers, or mixed teams? What assistance should count as a failure of the product rather than normal facilitation?
- Outcome: runnable preview, deployable source, or operation on approved infrastructure? Does the application itself need an agent?
- Data: only synthetic/public material, or a separately approved real-data use case?
- Hosting: Denmark for inference only, or also workspaces, storage, previews, logs, and application runtime?
- Corti/DCAI: exact endpoint, model and version, supported API operations, quotas, active-session capacity, hosting and retention configuration, and event support?
- Promte: which components and licenses, which self-hosting dependencies, what source export, and which controls can be enforced outside the UI?
- Stewardship: who maintains shared components and applications after the event, accepts contributions, and handles security reports?

The decision to make first is which hypothesis each POC should test. The technology choice follows from that, rather than defining the mission in advance.

## Proposed architecture and organisational assurance

Following discussion, the preferred product direction is a downloadable graphical application using OpenCode as its backend, with optional layers and community-contributed integrations. Execution location, supported operating systems, and permitted data remain undecided. The following is an architectural recommendation, not a settled implementation plan.

### Structure

- **User interface:** conversation, project brief, isolated application preview, changes, restore points, understandable approvals, and source export. Make the active organisation profile and its restrictions visible.
- **Application service:** owns authenticated users, project/session authorization, workspace lifecycle, budgets, cancellation, and event records. It mediates access to the coding engine rather than exposing all of the engine's administrative endpoints directly to users or generated code.
- **OpenCode adapter:** uses its HTTP API/TypeScript SDK behind a small internal interface. Pin a tested engine version and keep compatibility tests for session creation, event streaming, approvals, cancellation, reconnect, and export. Prefer upstream integration to a permanent engine fork.
- **Execution environment:** separate project workspaces with externally enforced filesystem and network limits, resource quotas, and termination. Model-generated code and installed dependencies are untrusted workloads. Organisation policy, approval credentials, deployment credentials, and authoritative logs stay outside that boundary.
- **Integration contracts:** separately define model providers, tool/data connectors, and execution backends. Reuse existing OpenCode provider support; contribute only the extra configuration, capability declarations, and checks the product needs. Prefer declarative integrations; executable plugins need review and a declared execution boundary.
- **Profiles and assurance:** versioned instructions, enforced restrictions, approved integrations, application templates, and independent tests. Optional components should have explicit dependency requirements. Unsupported combinations cannot claim the same guarantees as tested configurations.

OpenCode already documents a headless HTTP server, OpenAPI specification, and TypeScript SDK. Its server includes configuration and permission-management endpoints, so placing it behind an organisation-facing service is a proposed trust boundary, not merely presentation work. [Server](https://opencode.ai/docs/server/) · [SDK](https://opencode.ai/docs/sdk/)

OpenCode documents permissive permission defaults. Its ordinary remote organisational configuration can be overridden by user/project configuration; it separately documents managed settings with higher precedence. Validate the selected version and OS rather than relying on ordinary defaults to enforce policy. [Permissions](https://opencode.ai/docs/permissions/) · [Configuration precedence](https://opencode.ai/docs/config/)

### Local and managed operation

Local execution supports individual control and self-hosted inference. Its assurance depends on the actual laptop isolation and management configuration; an administrator of the host remains outside that boundary.

For organisations requiring central enforcement, recommend managed remote workspaces as the reference deployment: the desktop interface connects to an organisation-operated service, and employee projects run in isolated environments. This does not require a central commercial SaaS. Organisations or providers can operate the open-source stack. A properly managed local deployment is another option, but needs separate evidence for each supported OS.

The frontend framework and desktop wrapper should be selected after OS and execution-location decisions. A shared TypeScript interface and service integration is a reasonable candidate given the SDK, not a requirement to introduce a particular packaging dependency now.

### What confidence should mean

1. **Containment:** demonstrate that forbidden operations cannot be performed through the tested available paths, even when the model proposes them. Test direct shell/network bypass, hostile files, package installation scripts, cross-project access, policy edits, credential exposure, and approval forgery. Missing mandatory enforcement must stop execution; failure of mandatory audit recording must stop protected actions or use an explicitly designed durable queue.
2. **Application quality:** use independently maintained acceptance cases, authorization tests, accessibility checks, and human task review. Tests generated by the same agent are useful but cannot be the only evidence. Check the actual built application with realistic synthetic workflows and failure cases.
3. **Release control:** separate building and previewing from access to live systems. Where deployment is supported, a separate service releases only the exact approved artifact. Changes invalidate approval. Identify an owner, backup/restore procedure, and operational monitoring before real use.
4. **Repeatability:** publish the exact engine, model/version, provider configuration, profile, connector versions, and test results covered by each release. Re-run relevant checks when any of these change. Signed release artifacts and dependency inventories establish provenance; they do not establish correctness by themselves.
5. **Operational observation:** begin with a bounded pilot on approved material and record actual failures, interventions, and application outcomes. Provide an administrator kill switch and credential revocation. An independent security assessment should challenge the boundary before making sensitive-data assurance claims.

For every claimed restriction, maintain a traceable chain: claim → enforcing component → attempted violation → observed result → covered version/configuration. For example: “no external upload” → network policy → attempt from both a tool and shell → blocked connection plus external log event. Testing one destination does not prove all egress routes are closed; include relevant protocols, redirects, and allowed-destination misuse in the threat model.

Report four distinct maturity levels: written, unit-tested, run against real material, deployed and observed. Also name the material used: a synthetic trial does not validate sensitive-data handling. No universal “safe” badge should replace the underlying scope and evidence.

### Contribution and maintenance

Keep a documented connector manifest covering identity, version, license, maintainer, capabilities, requested permissions, credential configuration, and supported deployment modes. Require contract tests and relevant containment tests before inclusion in a verified release. Community availability does not equal organisation approval. Existing organisations pin approved versions; a new PR or connector release must not silently expand their permissions.

The assurance proposition is bounded: employees can experiment within a tested environment, and an explicit process determines whether an application is ready for operational use. It cannot honestly promise that every application an AI generates is correct or suitable for every public-sector purpose.
