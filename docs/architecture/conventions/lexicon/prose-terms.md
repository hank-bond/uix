---
summary: "Prose boundaries for comments and documentation: reserved domain nouns, locked meanings, and retired words."
kind: reference
read_when: "Read before writing or reviewing wording in comments, summaries, or docs."
---

# Prose terms

## Reserved terms

A reserved word owns its approved meaning. Other senses of the same word are nonconforming.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `turn` | noun | One user–agent prompt–response exchange. | "agent turn", "turn state" | "Turns read and write tool paths into stable locations" (verb use) |
| `store` | noun | Durable source-of-truth API or implementation. | "the document store" | "Stores each document's current content" (use `persists`) |
| `buffer` | noun | Live, feature-specific working projection over a store. | "canvas document buffer" | "Buffers feature-provided context" (use `accumulates`) |
| `surface` | noun | Contributed UI composition. | "the workspace surface" | "the error surfaces when it fails" (use `appears`) |
| `contract` | noun | The explicit public definition of a feature–substrate boundary: the schema- and type-only surface a feature author declares and the substrate implements. A channel is the request/event form of a contract. | "the agent channel contract", "author contracts that features import" | "durability defines the contract" (use `guarantees`), "contract comments" (use `behavioral comments`) |
| `live` | adjective | Instantiated in the runtime and bound to its current point-in-time state: the in-engine form, as opposed to a declarative definition, a persisted record, or a frozen snapshot. Use `current` for the present item in an immutable linked chain (messages) and `selected`/`active` for session choice and projection. The verb `lives` (reside) is a homograph with a different pronunciation, a separate word not governed here. | "a live session", "live transcript IDs", "live state" | "the live message" for the present message in the immutable transcript chain (use `current`) |
| `channel` | noun | A contract for typed requests, responses, and events exchanged over the substrate transport. | "feature channel requests" | "channels resources into the runtime" (use `routes`) |
| `report` | noun | A collection of information prepared for agent or human consumption, such as an analysis artifact. | "reports, dashboards, and knowledge tools", "a report renderer" | "Myers reports only real changes" (use `returns`), "report diagnostics" (use `expose`) |
| `advertise` | verb | Publish the server's address in a well-known location so clients can find it. | "the server advertises its address" | "registers in a server registry" |
| `app` | noun | A distributable host plus an explicit workspace and feature composition. Do not use for infrastructure or generic software. | "Fruition is an app", "an app is a host plus a composition" | "the Electron app" for the Electron host |
| `adapter` | noun | Translator across communication capabilities. | "the launcher adapters", "an Electron adapter" | "the transport binding" |
| `agent instance` | noun | One live agent execution attached to a session at a branch viewpoint. | "the primary agent instance", "an agent instance boots" | "an agent mount" |
| `attachment` | noun | A connection's owned, retargetable handle on one agent instance. | "the connection's attachment retargets" | "the session binding" |
| `canonical URL` | noun | The workspace-session deep link (`/w/:workspaceId/s/:sessionId`) that is one attachment's authoritative target. | "the canonical URL names the target" | "the selected session URL" |
| `client bootstrap` | noun | Per-host page entry that constructs the transport client and mounts the shared client. | "the Electron client bootstrap" | "the page entry" |
| `dependencies` | noun | The concrete effects a workspace runtime requires from its host, injected at construction. | "the runtime declares its dependencies" | "the host ports" |
| `discovery` | noun | The look-up of a running server's advertised address. | "server discovery", "a native launcher discovers the server" | "the server registry" |
| `fallback session` | noun | A workspace-level session choice used by the workspace-only route and launcher. It is not a global active session. | "the fallback session" | "the selected session" |
| `host` | noun | The process and platform owner: lifecycle, transports, native capabilities, and workspace supervision. | "the Electron host", "the server host" | "the host runtime" (use `the host`) |
| `launcher` | noun | The shared pre-workspace client that selects or creates workspaces over host capability endpoints. | "the launcher client", "the native launcher" | "the workspace supervisor" for pre-workspace selection |
| `single-flight` | adjective | Concurrent identical requests share one in-flight operation promise, so the underlying work runs once. | "a single-flight boot" | "a coalesced boot" |
| `supervisor` | noun | Host-internal component that supervises and routes requests to workspace runtimes. | "the workspace supervisor" | "the supervisor app" for a native launcher |
| `teardown` | verb | End a live object's lifecycle safely at its boundary. | "the instance tears down at the turn boundary" | "the agent retires" |
| `viewpoint` | noun | A live object's position in ordered history, such as an agent instance's branch, leaf, or ref in a session tree. | "at the instance's session-branch viewpoint" | "the agent's session scope" |

## Retired terms

The word is banned in all senses. Use the stated alternative.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `Registration` | noun | Retired because it named several lifecycle stages. Use `ResolvedXContribution` for registry-ready input, `RegisteredX` for live registry state, and a capability role for the returned value. | `ResolvedActionContribution`, `RegisteredAction` | `ActionRegistration` |
| `save` | verb | Retired. Use `persist` for durable storage, `defer` for a later time, `protect` for keeping safe. | "Persists each document's current content" | "Saves each document's current content", "save it for later" |
| `verify` | verb | Retired for structural checks. Use `validate`. | "validates the transport scheme and origin host" | "verifies the transport scheme and origin host" |
| `supply` | verb | Retired. Use `provide`. | "provides the resource address" | "supplies the resource address" |
| `carry` | verb | Retired. Name the actual relationship: `includes`, `holds`, or the specific relation. | "the factory return type holds the schema" | "the factory return type carries the schema" |
| `coalesce` | verb | Retired for controlled use. Use `single-flight` when concurrent requests share one in-flight operation. | "a single-flight boot" | "coalesced boot" |
| `join` | verb | Retired in the agent-lifecycle sense. Attaching to a live agent instance is `attach`, not `join`. | "the connection attaches to the live instance" | "the connection joins the agent" |
| `lease` | noun | Retired in the agent-lifecycle sense. Use `attachment` for the connection's handle and `retain` for the retention relationship. | "an instance stays retained while attachments hold it" | "an attachment holds a lease on the agent" |
| `retire` | verb | Retired for live-object lifecycle end. Use `teardown`. The term remains valid for retired terms, retired feature ids, and other existing senses. | "the instance tears down" | "the agent retires" |

## Locked meanings

The word stays, with one meaning that cannot drift. A locked row states the prose-usage boundary for a term that also holds a UIX-owned row, which keeps the meaning and code examples.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `assemble` | verb | Prose boundary: do not use `combine`, `join`, `merge`, or `collect` for assembly. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Assembles each feature's system-prompt section in workspace order" | "Collects each feature's system-prompt section and joins them for Pi" |
| `validate` | verb | Apply schema or structural checks. `check` remains for constraint tests. | "validates query with TypeBox" | "checks query with TypeBox" |
| `commit` | verb | Accept validated candidate state into an authority at an explicit boundary. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Commits and restores each feature's private branch state" | "Saves and restores each feature's private branch state" |
| `endpoint` | noun | An HTTP or API address. Do not use for runtime handles. | "server endpoints the native launcher queries" | "the workspace endpoint" (use `WorkspaceHandle`) |
| `mount` | verb | Surface mounting only: attach a surface to a display or lifetime owner. Do not use for agents. An agent instance boots, and a connection attaches to it. | "the mount path", "mounts each surface" | "mounts an agent on a session" |
| `persist` | verb | Write durable state. The mechanism verb. | "Pi persists the entry" | "Pi saves the entry" |
| `port` | noun | A network port. Do not use for host-injected effects. | "the server binds a port" | "the host ports" (use `dependencies`) |
| `provide` | verb | Actively hand something to a consumer. | "provides the resource address" | "supplies the resource address" |
| `expose` | verb | Make reachable through a public contract. | "jiti's interop proxy exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `emit` | verb | Produce an event. Do not emit values or rows. | "main emits the event" | "emits the authoritative born-keyed row" (use `sends`) |
| `retain` | verb | Hold onto a value or membership across changes. Prefer over `keep` for this sense. | "retains the latest value" | "keeps the latest value" |
| `mirror` | verb | Reflect live external changes or events into an internal view or state, with side effects. The non-pure counterpart to `derive`. | "Mirrors live Pi session events as renderer transcript updates", "mirrors Pi-initiated model changes into status" | "Turns live Pi session events into renderer transcript updates" |
| `rekey` | verb | Replace a live row's temporary transport identity with its durable canonical identity at the persistence boundary. | "Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages" | "Replaces temporary live transcript IDs with durable Pi entry IDs when messages are saved" |
| `Runtime` | noun | Prose boundary: `runtime` names an engine. Attributive use survives only in engine names (the feature runtime, surface runtime, agent runtime, workspace runtime, Pi runtime). A thing of the engine is `live`, the engine's, or the domain word. Say `at execution time`, not `at runtime`. The code vocabulary lives in the [role-terms section](./code-terms.md#uix-owned-role-terms). | "the agent runtime owns Pi services and sessions", "at execution time" | "at runtime", "runtime artifacts" |
