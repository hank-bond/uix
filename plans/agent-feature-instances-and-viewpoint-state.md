---
summary: "Build grouped workspace/Agent facet lifecycles, per-Agent feature states, isolated primary-session Canvas checkouts, and selected-view I/O without implementing multi-branch Agents."
---

# Agent feature instances and viewpoint state

## Status and relationship to the host split

A1 design is settled and implementation starts with A1.1 in a separate review session. No A1 production code has landed yet.

A1-A3 now precede the basic web host vertical. A server whose useful vertical is several tabs on different sessions must not ship against workspace-global Canvas working state. H6 therefore follows selected-view Canvas I/O and admits several browser attachments from its first supported flow instead of adding a temporary one-connection-per-workspace policy.

A4-A5 then finish reload reconciliation and full cross-host concurrency hardening. The [Electron and server host split](./electron-server-split.md) still owns the concrete hosts and conformance gate. The remaining cancellation inventory lives in [runtime operation hardening](./runtime-operation-hardening.md).

## Settled architecture

A feature remains one manifest-selected source, admission, and reload unit. Its definition has top-level `workspaceState` and `agentState` prerequisite builders plus grouped `workspace` and `agent` contribution sections. Grouping exposes the durable state dependency and authority lanes without letting authors schedule sibling operations. The substrate privately schedules each facet across three operation phases:

1. Workspace feature-state construction and workspace-facet registration.
2. Agent feature-state construction, Agent-facet instantiation, and restoration.
3. Pi installation when the Agent runtime boots.

`WorkspaceFeatureState` and `AgentFeatureState` are live object graphs: mutable state plus the services and capabilities that operate on it. A workspace feature state reaches only `workspace.*`; one fresh Agent feature state reaches only `agent.*` for one viewpoint. The old model-visible `agentContext` facet becomes `agent.modelContext`: turn state durably projects selected Agent feature state, while model context projects selected information directly to inference.

State builders begin with readonly substrate-provided fields. Workspace base state provides writable feature settings, workspace document authority, workspace-scoped event publishing, and logging. Agent base state provides read-only feature settings, viewpoint document capabilities, session-scoped event publishing, and logging. A builder accepts only chained, single-entry `state.add({ name: value })` calls. Each successful addition transfers any disposal capability immediately into a provisional candidate bag and returns a builder widened by that field. Duplicate or substrate-field names fail loudly and dispose the rejected incoming value. Completed feature states are shallow-frozen and omit `add`; contribution factories can operate on state but cannot extend its shape. A feature with no state builder receives only its matching substrate base. State builders and contribution factories remain synchronous wiring in A1. Asynchronous work stays in owned channel handlers, tool execution, turn-state snapshot/restore, model-context materialization, document operations, and Pi installation. If state construction throws, every accepted addition rolls back and no contribution in that section runs.

Top-level feature settings hydrate before either state. Workspace feature state receives the writable feature-scoped handle; Agent feature state initially receives the same confirmed workspace values through a read-only view. There is no session-settings override layer. A future session-owned value may materialize a workspace default at session creation without becoming a permanent fallback stack.

Channel descriptors stay inside their authority section and split static protocol from state-bound implementation: `{ contract, handlers(state) }`. The substrate admits canonical ids, schemas, log policy, and the section's routing lane from `contract` before invoking handlers. `workspace.channels` constructs one handler set and publishes workspace-scoped events. `agent.channels` constructs one handler set per Agent feature state, dispatches through the attachment-selected instance, and publishes session-scoped events. One contract belongs entirely to one lane.

Facet operations fail independently where the downstream integration permits. Successful siblings remain live. State-construction failure blocks only its matching contribution section. Each operation retains structured feature, lane, facet, phase, and original-error identity for tests and later diagnostics. Full report transport and recovery UX remain in the [agent-assisted runtime recovery backlog](./backlog.md).

The workspace owns shared repositories and immutable versions. One session-branch viewpoint owns each mutable checkout head. An `AgentInstance` owns only the live feature projections and scoped capabilities operating against that viewpoint.

## Review units

### A1: Grouped facet lanes and scoped Agent feature instances

Replace aggregate `contribute()` with optional `workspace` and `agent` contribution sections. Keep `workspaceState()` and `agentState()` top-level so their earlier prerequisite lifecycle is explicit. Each returns its final typed builder; the accumulated readonly state reaches only the matching section. Each sibling contribution remains a separate callable and failure boundary; object order never schedules it. Keep one feature entry as the source and reload boundary even for Agent-only or workspace-only features.

Agent facet types cannot access workspace feature state. Agent feature states contain read-only workspace configuration, logging, and substrate-issued viewpoint capabilities whose methods do not accept session, attachment, or sibling identity. Trusted code can still create module globals deliberately, but the supported path never requires shared mutable Agent state.

Model today's homogeneous Agent as one explicit internal `AgentCompositionDefinition` containing the accepted generation's reusable `AgentFeatureDefinition`s in manifest order. Each Agent feature definition carries feature identity, order, `baseTools` policy, its optional state builder, and its grouped Agent contributions, but no live Workspace feature state. Every `AgentInstance` receives that immutable composition snapshot, constructs each Agent feature state, and registers successful contribution results into instance-owned registries. Add no named-Agent manifest syntax, Agent key, branch behavior, or wire field.

Use one `agent.tools` contribution shape. Add optional `baseTools: true` beside one manifest feature entry: manifest parsing rejects more than one marked entry, and admission verifies that the marked entry provides Agent tools. The marked feature's local tool names remain prefix-free; every other feature derives `${featureId}__${localName}`. This composition role grants no extra authority. Remove the separate exact-name/override contribution path; a failed base-tools feature never causes a silent fallback or replacement provider.

Move mutable Agent registries and facet bags under `AgentInstance`. Instantiate tools, prompt sections, skills, turn state, model context, and instance channels per Agent. Install their Pi-facing pieces independently where Pi permits. Preserve structured internal outcomes without building a report registry or channel.

Feature admission validates identity and settings once. Workspace feature state constructs once per admitted generation; Agent feature state constructs once per Agent viewpoint. State construction is atomic and completes into a provisional candidate bag before the completed state becomes available to contributions. After state succeeds, each contribution factory and registration owns a provisional operation bag that rolls back only that operation on failure. A4 separately stages whole replacement generations before swapping the active generation. A state-construction failure marks its matching section blocked. Agent creation remains usable when optional feature operations fail; substrate failures required to create the instance still fail creation.

Implement A1 in three review slices. The first two are executable architecture proofs used directly by the final cutover, not alternate production paths.

#### A1.1: Feature-state construction kernel

Add the author-contract builder types and one runtime implementation for Workspace and Agent feature state without changing the production `FeatureDefinition` yet. A builder starts from a readonly substrate base, accepts only chained single-entry `add()` calls, accumulates the inferred state type, and finalizes to a readonly shallow-frozen object without construction authority.

Back every construction with a provisional mixed sync/async disposal owner. A successful addition transfers its disposal capability before the next acquisition. Duplicate keys, substrate-field collisions, invalid multi-key additions, and a later factory throw dispose the complete candidate in reverse order. A rejected incoming disposable is enrolled before the builder throws so asynchronous cleanup remains awaitable by the operation owner. Factories remain synchronous even though rollback may be asynchronous.

Define the structured internal operation outcome vocabulary here: feature, lane, phase, optional facet, status (`succeeded`, `failed`, or `blocked`), and original error. Do not add report transport or UI.

**Review gate:** Type tests prove state inference across a chain and the absence of `add()` on completed state. Runtime tests prove collision diagnostics, shallow freezing, exact reverse disposal, mixed disposal protocols, and complete rollback after every failure point.

Stop for review before A1.2.

#### A1.2: Per-Agent composition engine proof

Build the internal `AgentCompositionDefinition` and `AgentFeatureDefinition` over the state kernel. Add one instance-owned feature-state collection and registry bundle for tools, system-prompt sections, skills, turn state, model context, and Agent channel handlers. Keep the existing production feature loader and workspace-global registries unchanged during this proof.

Instantiate synthetic Agent feature definitions in manifest order against two real `AgentInstance` owners with fake Pi installation. Each feature state owns its provisional additions and successful facet bags. A state failure blocks that feature's Agent section for only that instance. After state succeeds, each facet constructs and registers independently; one failure rolls back only that operation. Pi-facing installers consume the accepted instance registry snapshot in semantic order and retain exact feature/facet/phase outcomes.

Implement the unified tool resolver in this engine. One composition feature may be marked as the base-tools provider; its local names remain prefix-free, while every other tool is feature-prefixed. Duplicate resolved names fail the later tool facet without affecting sibling facets. Agent channel descriptors retain their static contract separately from their per-instance handlers so A1.3 can bind canonical dispatch without transport fields.

**Review gate:** Two instances built from one composition receive disjoint feature states, mutable registries, model-context buffers, and lifetimes. Tests cover shared composition definitions, state failure in only one viewpoint, sibling-facet survival, base-tool naming and collision, independent Pi installation, and complete disposal accounting. No production request path uses the proof engine yet.

Stop for review before A1.3.

#### A1.3: Author-contract and production cutover

Replace `FeatureDefinition.context`/`contribute` with top-level `workspaceState`/`agentState` and grouped `workspace`/`agent` sections in one breaking migration. Do not retain an adapter for the old shape. Change the loader from whole-feature registration to definition/settings admission, atomic Workspace feature-state construction, independent Workspace facet operations, and emission of the accepted generation's `AgentCompositionDefinition`.

Add `baseTools?: true` beside manifest feature entries. Manifest validation rejects several marked entries before loading source; admission verifies that the marked entry has `agent.tools`. Remove `AgentToolOverrideContribution`, the override resolver/registry path, and exact-name feature APIs. Migrate the reference manifest and bare workspace template to mark their workspace-tool provider.

Give every `AgentInstance` the accepted composition and cut production over to the A1.2 engine. Remove workspace-global feature Agent registries from `WorkspaceRuntime`; shared provider/model services remain workspace-owned. Tool-catalog requests resolve through the attachment's guarded instance. Bind admitted Agent channel contracts into the canonical workspace table and dispatch to handlers in the selected instance without payload routing fields. Workspace and Agent publishers retain workspace and session scope respectively.

Rename the old model-visible `AgentContext*` author/runtime family to `ModelContext*`, including registries, resolution, assemblers, logs, docs, and tests. Migrate Chat, Canvas, workspace tools, every workspace template, and user-facing feature guidance to the grouped contract. Canvas may use one explicitly temporary feature-private closure over its workspace document store so per-Agent buffers and facets can exist before checkouts land; do not expose the mutable store through the public Agent base. Keep Canvas writeback in `workspace.channels` and keep the renderer's running-session transition gate until A2-A3 remove both temporary limits. A1's production Agent base contains read-only feature settings, session-scoped publishing, and logging; A2 adds viewpoint document capabilities.

Preserve current startup, prompting, model control, provider authentication, transcript, and reload behavior. A1 does not claim replacement-generation atomicity during reload; A4 owns candidate generation swapping and mixed-generation prevention. Update the architecture record and implementation guide only after the old contract and vocabulary are absent from production source.

**Review gate:** Two production Agent instances receive disjoint Agent feature states, registries, mutable contribution state, and facet lifetimes. Agent-only features need no empty Workspace section. The one base-tools feature resolves prefix-free names through the ordinary tool path. One failed facet leaves successful siblings live with exact operation identity. Existing Electron behavior remains intact, the full repository checks pass, and searches find no old `contribute`, feature `context`, Agent-tool override, or model-visible `AgentContext` production path.

Stop for review before A2.

### A2: Viewpoint-scoped managed-document checkouts

Replace Canvas's workspace-global current bytes with a checkout issued for one `SessionTarget` viewpoint. The workspace document repository owns immutable content-plus-metadata versions and checkout creation. The viewpoint owns its mutable resource-to-version head map.

H4 still has one primary branch per session. Key the first implementation by that accepted target while preserving the complete `SessionTarget` seam. Do not expose session or branch identity in Canvas document ids, feature payloads, or checkout operations.

A successful mutation writes one immutable content-and-anchor version and advances only that checkout's head. Run-boundary turn state records the current head map. Intermediate versions remain storage history rather than rollback nodes. Normal teardown commits final refs. Crash recovery never silently replaces a newer dirty checkout with an older checkpoint.

Move `CanvasDocumentBuffer`, anchors, tools, turn-state callbacks, and model context into Canvas's Agent feature state. Begin by settling the checkout persistence API and migration of legacy workspace-global current bytes. Preserve existing immutable versions and turn-state refs. Defer retention and garbage collection.

**Review gate:** Two primary session targets mutate, snapshot, restore, dispose, and recreate independent Canvas checkouts over one shared repository. Their versions and anchors never cross.

### A3: Selected-view Canvas I/O and overlap cutover

Cut Canvas over to the instance-bound feature channel path introduced in A1. Each `agent.channels` descriptor exposes a static contract during feature admission and constructs handlers from one Agent feature state. Workspace registration owns canonical ids, schemas, log policy, and the Agent-routing marker. Prepared attachment dispatch selects one Agent instance and invokes that instance's handler table. Feature requests contain no tenancy or routing fields.

Canvas view resolution returns immutable version identity for the selected checkout. Workspace resources serve that version without an Agent guard. Human writeback advances the selected checkout. Agent changes publish session-scoped invalidation to matching attachments.

Treat Canvas prompt actions as one accepted operation. Writeback and prompt submission use the same guarded Agent instance. Retarget cannot apply the state mutation to one session and start another session's run.

Update Canvas when the accepted session-selection version changes. Reject stale iframe messages and present the selected immutable view. Prove that an old guarded turn on session A can overlap new work on session B. Remove the renderer's running-session transition gate only after this suite passes.

**Review gate:** Two sessions retain independent Canvas content, anchors, turn state, model context, tools, writeback, resources, and events. Retarget stays non-blocking, and stale frames cannot write into the new target.

### A4: Reload and event reconciliation

Complete session-scoped event conformance across every runtime stream. Workspace reload checkpoints every live viewpoint and constructs replacement facet instances under temporary guards. It never exchanges state between sessions or leaves old-generation callbacks registered.

Decide active-run reload behavior and replacement policy when only some candidate facets fail. Preserve partial facet failure without mixing callbacks from different source generations accidentally.

**Review gate:** Scoped events and reload reconciliation pass against fake hosts. Reload accounts for every old and replacement facet lifetime, and payloads cannot widen attachment authority.

### A5: Concurrent-session implementation gate

Finish per-instance model projection and run the deterministic lifecycle suite. Cover shared attachments, concurrent sessions, non-blocking retarget, detached turns, zero-guard teardown, final commit, reload, scoped events, and parent disposal.

**Review gate:** Electron and web clients can expose concurrent session viewpoints without shared mutable feature state, event leakage, or lifecycle ambiguity.

## Deferred: named Agents and multi-branch coordination

The author and runtime seams above permit a later workspace manifest to name Agent compositions selecting admitted feature facets with read-only feature configuration. Branch creation persists one Agent composition key immutably. One Agent owns one branch, and changing persona means creating another branch.

A later session coordinator owns the complete graph, branch heads, exclusive branch writers, durable inboxes, and spawn links. Each branch-bound Agent owns a private Pi manager and isolated Canvas, file, and database checkouts.

Spawning is asynchronous and creates a branch from any selected conversation node. Detached work grants no messaging authority. Explicit cooperation grants a two-way mailbox. Automatic-result flow lets the spawning Agent send follow-ups while the coordinator forwards each link-triggered child run's final response.

Messages persist before scheduling. Idle or cold recipients start a new branch-local run, while running recipients queue delivery. Cooperative task graphs never imply one distributed run or rollback transaction. Cross-Agent communication uses these durable messages rather than shared mutable feature state.

## Not in this plan

- Named-Agent manifest syntax or configuration editors.
- Multiple logical attachments in one page.
- Git worktrees or Dolt branches.
- Lifecycle-report channels, recovery UI, or diagnostics tools.
- Mutable cross-Agent feature state.
