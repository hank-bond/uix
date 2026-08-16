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
| `agent instance` | noun | Lifecycle owner for one Pi execution at a session-branch viewpoint. It owns its private session manager and restored state before its Pi runtime boots. | "the primary agent instance", "the instance boots its Pi runtime" | "the agent runtime owns the session manager before the instance exists" |
| `attachment` | noun | One connection's runtime-created, retargetable capability. It owns request authority, its current agent instance guard, event observation, and disposal. The supervised workspace receives a private delivery closure instead of wrapping it in another attachment. | "the connection's attachment retargets" | "the runtime attachment", "the session binding" |
| `guard` | noun | Generic disposable capability whose existence prevents a supervisor from starting teardown for one shared live object. Every holder receives an independently disposable guard that provides that generation's operational value without its ownership capability. Disposing a guard removes that holder's protection but does not promise teardown. | "the turn holds an agent instance guard", "the connection owns a workspace guard" | "the attachment guard dispatches the request" |
| `prepared dispatch` | noun | One accepted canonical request with immutable attachment authority, a resolved workspace channel entry, and an operation guard. The host uses its contract policy to log before invoking it. | "the prepared dispatch survives attachment retarget" | "the attachment's log policy" |
| `canonical URL` | noun | The workspace-session deep link (`/w/:workspaceId/s/:sessionId`) that is one attachment's authoritative target. | "the canonical URL names the target" | "the selected session URL" |
| `client bootstrap` | noun | Per-host page entry that constructs the transport client and mounts the shared client. | "the Electron client bootstrap" | "the page entry" |
| `dependencies` | noun | The concrete effects a workspace runtime requires from its host, injected at construction. | "the runtime declares its dependencies" | "the host ports" |
| `discovery` | noun | The look-up of a running server's advertised address. | "server discovery", "a native launcher discovers the server" | "the server registry" |
| `fallback session` | noun | The newest valid session, or a new session, resolved only when a workspace address omits a session target. The browser then replaces that address with the canonical URL. It is not a persisted global selection. | "the workspace-only route resolves the fallback session" | "the selected session" |
| `host` | noun | The process and platform owner: lifecycle, transports, native capabilities, and workspace supervision. | "the Electron host", "the server host" | "the host runtime" (use `the host`) |
| `launcher` | noun | The shared pre-workspace client that selects or creates workspaces over host capability endpoints. | "the launcher client", "the native launcher" | "the workspace supervisor" for pre-workspace selection |
| `single-flight` | adjective | Concurrent identical requests share one in-flight operation promise, so the underlying work runs once. | "single-flight instance creation" | "coalesced instance creation" |
| `supervisor` | noun | Lifecycle owner for keyed shared live children. It owns child identity, single-flight creation, independent guard admission, lifetime policy, and teardown, then provides the protected child or narrower handles for ordinary work. | "the workspace supervisor", "the agent instance supervisor" | "the workspace router" for connection traffic |
| `teardown` | noun | Owner-coordinated lifecycle process that ends one supervised shared child's lifecycle after policy admits it. Use `dispose` for the deterministic cleanup operation on one object. | "the supervisor starts instance teardown after every guard disposes" | "teardown the instance" (use "dispose the instance" or "start instance teardown") |
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
| `coalesce` | verb | Retired for controlled use. Use `single-flight` when concurrent requests share one in-flight operation. | "single-flight instance creation" | "coalesced instance creation" |
| `join` | verb | Retired in the agent-lifecycle sense. Attaching to a live agent instance is `attach`, not `join`. | "the connection attaches to the live instance" | "the connection joins the agent" |
| `lease` | noun | Retired in the agent-lifecycle sense because it suggests expiration or exclusivity. Use `attachment` for the connection's handle and `guard` for an explicit teardown-protection capability. | "an attachment holds an agent instance guard" | "an attachment holds a lease on the agent" |
| `retire` | verb | Retired for live-object lifecycle end. Use `dispose` for direct cleanup or `teardown` for the supervised lifecycle process. The term remains valid for retired terms, retired feature ids, and other existing senses. | "the supervisor starts instance teardown" | "the agent retires" |

## Locked meanings

The word stays, with one meaning that cannot drift. A locked row states the prose-usage boundary for a term that also holds a UIX-owned row, which keeps the meaning and code examples.

| Term | Part of speech | Approved meaning / alternatives | Approved example | Nonconforming example |
| --- | --- | --- | --- | --- |
| `assemble` | verb | Prose boundary: do not use `combine`, `join`, `merge`, or `collect` for assembly. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Assembles each feature's system-prompt section in workspace order" | "Collects each feature's system-prompt section and joins them for Pi" |
| `commit` | verb | Accept validated candidate state into an authority at an explicit boundary. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "Commits and restores each feature's private branch state" | "Saves and restores each feature's private branch state" |
| `deliver` | verb | Provide one already validated and scoped event to one receiver selected by its event scope. Do not use for requests or physical transport frames. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the attachment receives the delivered event" | "the registry delivers the canonical request" |
| `dispatch` | verb | Route a canonical request under an attachment's established authority toward its registered channel handler. Do not use for event publication, event delivery, or the handler's later domain effects. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the attachment dispatches the canonical request" | "the host dispatches the agent event" |
| `dispose` | verb | Invoke one capability's deterministic cleanup operation. Disposing a guard relinquishes only that holder's protection. Disposing an ownership capability tears down its domain value. Use `teardown` for the supervisor-coordinated process. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the attachment disposes its guard", "the supervisor disposes the instance ownership during teardown" | "the attachment disposes the shared instance when it closes" |
| `emit` | verb | Produce one event occurrence at its source and notify the source's immediate listeners. Do not emit values or rows. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the runtime emits the scoped event" | "emits the authoritative born-keyed row" (use `returns`) |
| `endpoint` | noun | An HTTP or API address. Do not use for live domain objects. | "server endpoints the native launcher queries" | "the workspace endpoint" (use `Workspace`) |
| `expose` | verb | Make reachable through a public contract. | "jiti's interop proxy exposes named exports" | "exposes the address to the renderer" (use `provides`) |
| `mirror` | verb | Reflect live external changes or events into an internal view or state, with side effects. The non-pure counterpart to `derive`. | "Mirrors live Pi session events as renderer transcript updates", "mirrors Pi-initiated model changes into status" | "Turns live Pi session events into renderer transcript updates" |
| `mount` | verb | Surface mounting only: attach a surface to a display or lifetime owner. Do not use for agents. An agent instance is created, and a connection attaches to it. | "the mount path", "mounts each surface" | "mounts an agent on a session" |
| `persist` | verb | Write durable state. The mechanism verb. | "Pi persists the entry" | "Pi saves the entry" |
| `port` | noun | A network port. Do not use for host-injected effects. | "the server binds a port" | "the host ports" (use `dependencies`) |
| `provide` | verb | Actively hand something to a consumer. | "provides the resource address" | "supplies the resource address" |
| `publish` | verb | Place one schema-validated event onto its declared channel through a publisher capability. Do not use for request routing or final receiver delivery. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the feature publishes its changed event" | "the runtime publishes the canonical request" |
| `release` | verb | Describe the protection removed by guard disposal, not a separate cleanup operation. Prefer _dispose the guard_ when naming the action. | "disposing the guard releases its teardown veto" | "release the guard" |
| `rekey` | verb | Replace a live row's temporary transport identity with its durable canonical identity at the persistence boundary. | "Rekeys temporary live transcript IDs to durable Pi entry IDs when Pi persists messages" | "Replaces temporary live transcript IDs with durable Pi entry IDs when messages are saved" |
| `retain` | verb | Hold onto a value or membership across changes. On a guard, retain means mint another independently disposable guard for the same supervised object. Prefer over `keep` for this sense. | "retains the latest value", "dispatch retains an operation guard from the attachment guard" | "keeps the latest value" |
| `Runtime` | noun | Prose boundary: `runtime` names an engine. Attributive use survives only in engine names (the feature runtime, surface runtime, agent runtime, workspace runtime, Pi runtime). A thing of the engine is `live`, the engine's, or the domain word. Say `at execution time`, not `at runtime`. The code vocabulary lives in the [role-terms section](./code-terms.md#uix-owned-role-terms). | "the agent runtime owns Pi services and sessions", "at execution time" | "at runtime", "runtime artifacts" |
| `send` | verb | Write one encoded request, response, or event frame through a physical connection. Do not use for semantic request routing or event delivery. The code vocabulary lives in the [operation-terms section](./code-terms.md#uix-owned-operation-terms). | "the host sends the response frame" | "the workspace sends the request to its handler" |
| `validate` | verb | Apply schema or structural checks. `check` remains for constraint tests. | "validates query with TypeBox" | "checks query with TypeBox" |
