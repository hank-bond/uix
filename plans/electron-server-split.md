---
summary: "Build explicit Electron and server hosts around a shared browser client, host-side workspace supervisor, and exactly-one-workspace runtime instances. Prove concurrent workspace and agent-instance isolation before migrating hosts, then add launcher, live transport, HTTP resources, and distribution readiness."
---

# Electron and server hosts

## Unit status

- **H0** baseline established (commit before H1).
- **H1** ownership roots and dependency enforcement landed.
- **H2** in-memory host/runtime boundary proof landed.
- **H3** real workspace runtime landed. The openWorkspace substrate moved into `packages/runtime`. `createWorkspaceRuntime` composes it over host ports, and the Electron app consumes it without host migration. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids.
- **H4.0** derisk spike landed: two real Pi runtimes coexist in one process, and two live agents append disjoint branches to one session file. See the H4 section.
- **H4.1** owner primitives landed. Per-instance transcript identity, mutable state, branch-local model selection, explicit manager opening, forward `SessionTarget` identity, and the internal `AgentInstance` owner are present. Production driver retirement moves into H4.2 so the branch does not build a temporary singleton coordinator only to remove it.
- **H4.2** landed. It activates session-keyed instance supervision, guard-native lifetimes, attachment dispatch, non-blocking retarget, and teardown policy. UIX-owned lifecycle capabilities now use the ECMAScript disposal protocols without parallel named cleanup operations. H4 still ships one primary branch per session. The deferred multi-branch architecture is recorded below.
- **H4.2a** planned next. It adds cancellation and operation quiescence beside guards so parent disposal cannot wait forever on potentially unbounded external work.

## Status and intent

This plan replaces the earlier transport-first Electron/server split. The discarded spike proved that Electron-independent runtime code and a WebSocket adapter are possible. It also let Electron's global handler and broadcast model shape the transport boundary before host, workspace, attachment, and client ownership were clear. The rebuilt path treats that work as evidence rather than an implementation base.

The highest-risk questions land first as executable architecture:

1. Can two real workspace runtimes with duplicate feature, channel, and resource ids coexist and dispose independently in one process?
2. Can one workspace runtime supervise concurrent real Pi agents on separate sessions with single-flight instance creation, explicit lifetime guards, retargeting, and safe teardown?
3. Can one attachment and scoped dispatch boundary support in-memory tests, Electron IPC, and WebSocket connections without feature contracts learning transport fields?

Broad source movement and host implementation follow only after those gates pass. A failed gate pauses the plan and reopens the design rather than adding compatibility around a wrong boundary.

The plan implements the synthesis in [`host-workspace-runtime-boundaries.md`](../docs/design/host-workspace-runtime-boundaries.md), [`agent-session-routing.md`](../docs/design/agent-session-routing.md), [`agent-instance-state.md`](../docs/design/agent-instance-state.md), [`product-and-distribution.md`](../docs/design/product-and-distribution.md), and [`workspace-feature-composition.md`](../docs/design/workspace-feature-composition.md). It retains the decisions that features are the loadable unit, manifests are the composition authority, surface delivery is runtime-built, and designs remain hosting-compatible. Implementation follows the [`human-paced-implementation.md`](../docs/architecture/human-paced-implementation.md) loop: complete one review unit, explain it, and wait for approval.

## Target topology

```text
Host process
├── launcher and workspace catalog
├── WorkspaceSupervisor
│   ├── supervised workspace A
│   │   ├── WorkspaceGuard(s) → Workspace
│   │   └── WorkspaceRuntime
│   │       └── WorkspaceAgentRuntime
│   │           └── AgentInstanceSupervisor
│   └── supervised workspace B
│       ├── WorkspaceGuard(s) → Workspace
│       └── WorkspaceRuntime
│           └── WorkspaceAgentRuntime
│               └── AgentInstanceSupervisor
└── platform and transport adapters
```

The repository exposes this ownership from the beginning:

```text
packages/
  api/                 feature-author contracts
  runtime/             exactly one workspace's substrate semantics
  client/              launcher and workspace browser clients
  host/                shared host contracts and coordination, if the units prove this package

hosts/
  electron/            Electron composition root and adapters
  server/              server composition root and adapters

apps/
  features/            reusable app-layer feature implementations
  workspaces/          explicit reference and product compositions
```

The exact shared host package name remains reviewable in the first unit. The ownership boundary does not. Shared workspace supervision and launcher code stays outside every `WorkspaceRuntime`. Concrete Electron and server code remains colocated under separate host roots.

## Load-bearing boundaries

- **One runtime instance owns one workspace.** A host creates several instances in one process, and each lifetime bag isolates its workspace.
- **Supervisors own keyed child lifecycles.** The host's `WorkspaceSupervisor` owns workspace identity, single-flight runtime boot, workspace guard admission, lifetime policy, and teardown. It privately retains each `WorkspaceOwnership` and issues independent `WorkspaceGuard`s that provide its operational `Workspace` value without teardown authority. Each `WorkspaceAgentRuntime` similarly owns an `AgentInstanceSupervisor` without placing either supervisor on the ordinary request hot path.
- **Guards make agent-instance use explicit.** One primary instance per session is the first policy. The instance supervisor owns single-flight creation, guard admission, lifetime policy, and teardown. Attachments, accepted requests, running turns, reload, and background work hold disposable `AgentInstanceGuard`s for their complete asynchronous use. Disposing a guard is immediate and removes one teardown veto. It does not request cancellation. Potentially unbounded operations separately carry an owner-controlled cancellation signal and a completion boundary so parent disposal can request quiescence before waiting for guards. Zero guards permits policy but does not promise disposal. An instance owns its private session manager and restored state immediately, then boots its one Pi runtime lazily.
- **Hosts route, runtimes dispatch.** A host resolves the workspace once and owns physical connection context. It acquires one workspace guard and passes the connection's `SessionTarget` through unchanged. The guard's operational `Workspace` value creates one runtime attachment, and the host binds both capabilities to the connection. The attachment owns request authority, target guards, event observation, and disposal. Its private supervised workspace holds only the delivery closure returned at creation, selects matching receivers, and sends through host transport. Each later canonical request asks the attachment to prepare one dispatch directly. The runtime resolves an omitted `branchId`, then acquires or creates the corresponding agent instance. One canonical channel table and handler model route the request and validate its request and response. Feature payloads contain no transport or tenancy fields.
- **No global broadcast semantics.** H4 routes workspace and session events only to matching attachments. Explicit agent-instance identity and event scope wait for a concrete ephemeral-execution or stale-work requirement. A transport can optimize subscription mechanics without redefining delivery scope.
- **One wire-log boundary.** Every channel crossing records through one chokepoint with per-contract redaction. The log can be neither dodged nor spoofed, and crossing lines stay identical across hosts.
- **The launcher precedes all runtimes.** A host can serve workspace catalogs with zero active workspaces. Launcher HTTP, CLI JSON, Electron, and native clients consume one machine-readable projection.
- **The browser client is host-neutral.** Shared launcher and workspace clients receive constructed adapters. They do not inspect Electron globals or select transports.
- **Resources have one logical dispatcher.** Electron protocols and server HTTP encode workspace-qualified routes over the same runtime-owned resource semantics.
- **Apps are explicit compositions.** Hosts do not silently install app features. Shared and workspace-local features remain explicit manifest references.
- **Lifetimes compose.** The host owns physical connections. The workspace supervisor owns each supervised workspace and its runtime teardown. Each connection owns an independent workspace guard and one attachment. The guard provides an operational `Workspace` value that exposes attachment creation without disposal. Each attachment owns a replaceable target guard, and detached operations own independent guards. The supervised workspace remains the parent lifetime. The runtime owns active feature composition, while its agent instance supervisor remains the sole owner of agent instances.

## Review units

### H0: Discard the spike and establish the baseline

Begin implementation from the mainline behavior plus approved design, naming, and documentation changes. Do not migrate the unlanded transport-first runtime and WebSocket implementation forward. Preserve it only as a test and design reference. Re-adopt an independently useful change, such as the local `@uix/api` package, only when it fits the target dependency graph without upward imports.

Record the baseline Electron behavior and checks that later units must preserve. Remove or defer any unlanded decision whose conclusion depended on global broadcast or the old broadcast transport. Decide the fate of the two naming and lexicon commits that are not on main. Replay them after H1 establishes the target roots, or revalidate the vocabulary rules under main's configuration. A WebSocket choice may be recorded again after the scoped dispatch boundary proves it.

**Review gate:** The branch contains the approved design and this plan, and it passes the repository checks. No partial server transport or host-neutral runtime extraction predates the new boundary.

### H1: Establish ownership roots and dependency enforcement

Create the target package, host, and app roots with their package metadata, TypeScript boundaries, and import rules. Decide whether shared host contracts and the workspace supervisor earn `packages/host` or another explicit package. Decide where launcher/catalog schemas live without adding host operations to the feature-author API.

Keep this unit behavior-light. Do not migrate the full Electron application, features, or runtime yet. The purpose is to make illegal dependency directions visible before code moves:

- Runtime and client cannot import concrete hosts.
- Feature implementations can import author contracts but not runtime or host internals.
- Concrete hosts may compose runtime, client, and shared host code.
- App workspaces may reference shared or local features explicitly.

**Review gate:** The repository checks enforce the intended graph, and each ownership root has a clear entry responsibility. No placeholder abstraction claims behavior that later units have not proved.

### H2: Prove the host/runtime boundary in memory

Build the smallest executable contracts for workspace supervision, workspace handles, attachments, canonical request dispatch, and scoped event delivery. Candidate names remain reviewable, but the model must express:

- A supervisor acquiring an independent workspace guard through a single-flight boot promise.
- The guard providing an operational `Workspace` value that creates an attachment for an initial session target without exposing workspace disposal.
- An attachment dispatching requests and retargeting its session.
- Workspace and session event scopes. Explicit agent-instance scope is deferred until it has a concrete consumer.
- Workspace and attachment lifetimes with deterministic supervisor-owned disposal.
- A host-facing operational `Workspace` type with a private `WorkspaceOwnership` implementation.

Use fake runtimes and agents. Avoid Electron, WebSocket, HTTP, Pi, and feature loading. The scenarios should prove two workspaces with identical canonical ids, several attachments on one session, independent retargeting, scoped event delivery, failed-target rollback, and disposal isolation.

**Review gate:** The in-memory scenarios read as the architecture described in the design notes. No contract assumes one global selected session or transport-wide broadcast, and runtime isolation is in-process through lifetime bags.

### H3: Prove concurrent real workspace runtimes

_Status: landed._ The openWorkspace substrate moved into `packages/runtime` behind `createWorkspaceRuntime`. It covers documents, manifest store, workspace settings, the settings and channel registries, the resource registry, turn state, agent registries, feature loading, surfaces, and reload. Dispatch is runtime-owned canonical. `src/main` now constructs one runtime over Electron ports and keeps only host chrome. The `runtime.test.ts` suite instantiates two real workspaces with duplicate ids and exercises activation, settings, documents, dispatch, resources, surfaces, reload, events, and disposal.

Move enough backend substrate into `packages/runtime` to implement a real operational `Workspace` for exactly one workspace. Replace host handler registration with runtime-owned canonical dispatch. Keep channel and resource registries local to the runtime instance, and pass host-stamped attachment context into dispatch outside feature payloads. The E0 inventory in the appendix (from the discarded plan) already classified the Electron surface into runtime semantics and host behavior. Reuse it as the starting analysis.

Instantiate two real workspaces in one process with overlapping feature, channel, resource, and settings ids. Exercise feature activation, settings, document storage, surface registration, reload, and disposal. Process-global services must be host-owned or explicitly shared. Mutable workspace state cannot remain in module singletons.

Do not migrate Electron yet. Use in-memory host and resource adapters so failures reveal runtime isolation rather than platform behavior.

**Review gate:** Both workspaces run concurrently, reload independently, and retain duplicate local ids. Disposing either runtime removes only its state and routes. If the current lifetime bags do not form a complete workspace boundary, stop and revise the runtime composition before continuing.

### H4: Prove real agent instances

Restructured into sub-units after the H4.0 derisk findings. The gate question (whether Pi and feature state can support concurrent in-process instances) has a preliminary **Pi passes** answer. The state-model risk is UIX-owned: the per-instance refactor, the agent instance supervisor, and the feature instance boundary.

#### H4.0: Derisk spike: Pi concurrency and shared-file branch writes

_Status: landed._ Two spikes established the load-bearing assumptions with real Pi:

- A historical, env-gated concurrency spike proved that two real `AgentSessionRuntime`s can share one process with distinct services and model runtimes. UIX extension hooks remained runtime-local, concurrent model-store refresh on one copied profile succeeded, disposal stayed isolated, and opt-in real turns remained independent. The spike served as one-time de-risking evidence and was removed after the ownership model landed. It was not a stable profile-independent regression suite.
- `packages/runtime/src/agent/same-session-branches.test.ts`: two managers, and two real live agents, append disjoint branches to one session file concurrently without corruption. A fresh open sees the full tree, and each writer's stale view sees only its own branch. The append-level test runs always (no profile, no tokens).

Findings that shape the design:

- Appends are single-line O_APPEND writes, atomic per row. No file lock is needed in-process.
- Compaction is a pure append that writes a `compaction` entry. Old rows stay in the file, and only context projection skips them. It never rewrites the file.
- The only full-file rewrites are open-time: empty-file header init, session schema version migration, and new-file creation. Migration runs at most once per session file ever and is first-writer-safe. It is an initial-open rule, not a concurrent-writer rule.
- Multi-process is a non-goal. No cross-process writer topology exists, so the lock story is closed.

#### H4.1: Per-instance agent owner primitives

_Status: landed as owner primitives. Production cutover and driver retirement occur with H4.2 so UIX does not add a temporary singleton coordinator._

Extract the driver's instance-scoped state into an `AgentInstance`. Each instance owns one independent `SessionManager`, one transcript binding, one turn-state coordinator, one ephemeral transcript-id sequence, one `currentModel`, and at most one lazily booted `AgentSessionRuntime`. The instance is the lifecycle owner for one Pi execution and can be session-ready while that runtime remains unbooted. It has one immutable primary session target and no `switchSession` method. Workspace-level services such as provider auth, the model catalog, workspace settings, and session-file discovery stay shared.

H4 deliberately supports **one primary branch per session**. `SessionTarget = { sessionId, branchId? }` reserves the eventual durable branch identity. `branchId` is the first row born on a branch. H4 accepts only the primary target with `branchId` omitted. It does not walk branch trees, expose fork selection, or silently ignore a provided branch id. A branch-bearing target is unsupported until the deferred session coordinator exists.

Module-level mutable state must not leak across instances. In particular, the ephemeral live-item id sequence is instance-scoped. `selectModel` stops writing the workspace default. The chat picker records native Pi `model_change` state on the primary branch. The static workspace default remains a fallback for a branch with no model history. A separate settings path for changing that default is deferred. The reference manifest default remains `deepseek/deepseek-v4-flash`.

**Review gate:** Existing driver tests stay green. New tests prove two instances do not share the ephemeral sequence, turn-state coordinator, transcript binding, or `currentModel`. The current single-session Electron behavior is unchanged, and no H4 path claims multi-branch behavior.

#### H4.2: Guarded instance supervision and production cutover

_Status: landed._ The selected-session driver is retired. The accepted [supervised-child decision](../docs/decisions/2026-08-15-supervisors-own-guarded-children.md) and its [design record](../docs/design/shared-live-object-lifetimes.md) preserve the final ownership model and rejected alternatives. One generic `Guard<Value>` now underlies workspace and agent-instance supervision. Operational `AgentInstance` and `AgentInstanceState` values are separated from their private lifecycle ownership capabilities. Prepared dispatch preserves accepted authority across attachment retarget or closure, and Electron canonical IPC uses the same attachment path. Supervisor visits retain temporary guards internally while exposing only operational instance values. UIX-owned ownership and runtime contracts use symbol-only disposal, and parent teardown awaits guarded children.

Retire the selected-session driver. Each `WorkspaceRuntime` owns one `WorkspaceAgentRuntime`, which composes shared agent services and an `AgentInstanceSupervisor`. The first shipping policy provides one primary `AgentInstance` per session. The supervisor owns keyed identity, single-flight instance creation, guard admission, lifetime policy, and teardown. It issues disposable `AgentInstanceGuard`s but is not on the ordinary prompt or channel-request hot path. One canonical attachment-dispatch path replaces direct transport handler invocation. Remove the runtime's channel transport registrar. Concrete hosts bind physical connections to attachments and subscribe to scoped runtime events. Ordinary feature and substrate agent requests share one registered handler model, while guarded attachment authority remains outside feature payloads. Remove `ContextualChannelRunner`, `registerContextual()`, and the parallel contextual handler map rather than creating a second handler category.

An attachment owns one replaceable target guard. A successful retarget acquires the new guard and swaps it into the attachment. It disposes the old guard synchronously and returns without waiting for an old running turn or its teardown. Failed acquisition preserves the old guard and accepted target. Request acceptance synchronously retains an operation guard and asks the workspace channel table to prepare one dispatch. The channel table provides the resolved handler, schemas, and contract-owned log policy. The attachment provides immutable workspace, session, and agent-instance authority. The resulting `PreparedDispatch` owns the operation guard and can outlive attachment retarget or disposal. Accepted work can request a retarget after attachment closure. It guards the requested instance for that operation without installing a new target guard on the closed attachment. Instance-specific agent operations consume live guards rather than accepting an unprotected instance across package seams.

Every asynchronous instance use holds a guard for its complete duration. A live guard can synchronously retain another independently disposable guard on the same managed record. Retaining after disposal fails. A started turn retains its own guard before detached work begins and disposes it after the final safe boundary. Reload and reconciliation visit instances under temporary guards. Future host-authored background work acquires a guard directly instead of fabricating an attachment. A guard establishes no event subscription. Disposing a guard is immediate, idempotent, and non-blocking. It does not await state commit or instance teardown. Zero guards makes the instance eligible for supervisor policy rather than promising disposal. The first policy starts teardown for an eligible idle instance immediately. Later idle periods and always-on policy do not change guard semantics.

The live ownership map is keyed by session id in H4. Several attachments and operations on the same session hold independent guards on one instance. Its Pi runtime may be unbooted, idle, or running. This is the multi-device behavior the first server needs. The supervisor uses managed-record object identity for acquisition and teardown races. Guard disposal can begin asynchronous teardown, but the supervisor owns and observes that work. Admission either cancels teardown before its point of no return or awaits it and boots a fresh instance. Acquisition and disposal cannot both win the same record. Parent disposal stops admission, disposes owned attachment guards, drains operation guards, and awaits actual child teardown. H4 does not mint or expose an instance id without a concrete stale-work consumer. Internal guard ids and origins may support diagnostics but never become routing identity.

The host receives each physical request frame and asks its bound attachment to prepare the dispatch. It records the inbound crossing with the prepared contract policy, invokes the handler, and records the result before sending the response frame. Physical messaging and wire-log writes remain host-owned. Log policy remains workspace-channel state rather than attachment state. Unknown channels use a fixed safe policy that records their canonical id without their client-authored payload. A prompt handler retains a separate turn guard before the prepared dispatch disposes its operation guard.

H4.2 includes minimum session-scoped agent-event delivery because an old running session must never publish into an attachment that already moved. Remaining authorized attachments on the old session continue receiving its activity. With none, the turn guard lets execution persist without live delivery. Complete event conformance, snapshot recovery, and reload reconciliation remain in later units. The runtime creates one `Attachment` object with identity, target guards, dispatch, retargeting, event listeners, and disposal. Creation privately returns its supervised workspace a narrow delivery closure. The supervised workspace selects receivers from event scope and invokes delivery without gaining request authority. No host façade or second runtime attachment duplicates identity, target, or lifetime.

Migrate the existing selected-driver behavior suite to the replacement owner rather than deleting its behavior coverage. Add explicit scenarios for shared instances with unbooted Pi runtimes and prepared dispatches across concurrent retarget. Prove that prepared dispatches retain operation guards, preserve their accepted authority, and use their channel registration's log policy after the attachment moves. Cover a turn guard surviving disconnect, non-blocking running retarget, returning to the still-running instance, and guarded all-instance visitation. Also cover session event isolation, idempotent guard disposal, zero-guard policy, acquisition during pending teardown, final commit, parent drain, and guard-leak diagnostics. Do not rely on garbage collection for disposal.

**Review gate:** The lifecycle scenario list below, minus Canvas and future branch items, passes against the mocked SDK with two sessions in one runtime. The tests can account for every guard owner and prove that no asynchronous instance operation uses an unguarded raw instance. Current single-window Electron behavior remains intact, while the multi-attachment behaviors are reviewed explicitly.

#### H4.2a: Cancellable operation quiescence

H4.2 made every asynchronous use retain the generation it can touch, but guard drain alone assumes that every operation eventually settles. A channel handler, agent turn, provider login, model refresh, runtime boot, or other external call can instead wait indefinitely. Because a prepared dispatch releases its guard only after its handler settles, passive parent drain can otherwise turn a hung operation into hung workspace or process disposal.

Keep cancellation orthogonal to guarded authority. A guard remains only a synchronous teardown veto and never gains `abort()`, a signal, or completion semantics. A potentially unbounded operation instead has three explicit parts: the guard that keeps its dependencies valid, an owner-controlled cancellation signal that requests a stop, and a tracked completion boundary that proves the operation no longer uses those dependencies. User cancellation, owner shutdown, and any operation-specific deadline are distinct causes even when their signals are composed.

Add the smallest operation-lifetime machinery that serves the proved consumers. Parent disposal stops admission, requests cancellation of its active operations and in-flight child creation, waits for those operations to reach their safe boundary and release their guards, and only then disposes child ownership. Normal completion follows the same unregister-and-release path. A timeout or `Promise.race` that merely stops awaiting work is not cancellation and cannot permit teardown while late work can still touch the generation. For an integration that can ignore cancellation, this unit must choose and document an honest bounded-shutdown policy: cooperative cancellation as a required contract, integration-specific force-stop, isolation behind a terminable process boundary, or bounded detachment only where late results are structurally unable to use disposed authority.

Apply and prove the protocol across the current unbounded-operation shapes:

- Prepared dispatch owns cancellation and completion beside its operation guard. Workspace or host shutdown cancels accepted dispatches before supervisor drain. Attachment retarget and ordinary attachment closure continue to leave accepted work alive, preserving H4.2 semantics.
- Running agent turns propagate shutdown or explicit user cancellation into Pi's abort boundary and retain their turn guard until Pi reaches its final safe boundary.
- The provider-auth coordinator tracks its background run rather than only launching it with `void`. Cancellation and disposal abort pending prompts and provider work, suppress late presentation updates, and join or apply the selected bounded policy to runtime loading, provider login, and post-login model refresh.
- Workspace, agent-instance, Pi-runtime, and shared control-service single-flight boots accept owner cancellation where their dependencies support it. Parent disposal does not passively await an unbounded creation promise.
- Model refreshes, external network calls, process calls, and host capabilities are inventoried. Each potentially unbounded call either receives a propagated signal, has an integration-owned force-stop or deadline, or records why it is intrinsically bounded and needs no cancellation path.

Do not expose a generic feature-author cancellation API merely to complete this unit. Internal substrate and agent handlers can receive operation context first. A public channel-handler signal is a separate author-contract decision if real feature handlers need it. Keep cleanup pairing in the existing disposal protocols; cancellation requests quiescence but does not become a second cleanup operation.

Tests use deterministic never-settling fakes that resolve only after observing abort. They cover disposal during dispatch, turn execution, provider runtime loading, provider login, model refresh, and single-flight creation; assert that cancellation reaches the lowest controllable boundary; and prove that completion unregisters the task, releases every guard, and lets parent disposal finish. A non-cooperative fake exercises the selected bounded policy without late mutation of disposed state. Existing tests continue to prove that retarget and disconnect do not cancel accepted work.

**Review gate:** No potentially unbounded operation can hold a supervisor guard or parent-disposal join without an owned cancellation and completion policy. Workspace and host disposal cancel first, reach quiescence, account for every guard, and complete under the deterministic hanging-operation suite. Provider authentication and running turns stop at their safe boundaries without late events or state mutation, while normal retarget and disconnect semantics remain unchanged.

#### H4.3: Feature instance boundary

Split workspace-scoped feature ownership from primary-session working state: turn-state cells and agent-context buffers become per instance. The Canvas document buffer is the proving feature. Existing contribution APIs may need an instance-instantiation or context-aware callback boundary. Prove that boundary with real stateful features rather than sharing singleton closures across sessions.

This unit establishes the branch-viewpoint ownership grain without implementing several branches in one session. Each shipping instance still owns the only primary viewpoint for its session.

**Review gate:** Two sessions retain independent Canvas documents, anchors, turn state, and agent context.

#### H4.4: Complete session-scoped events and reload reconciliation

H4.2 establishes the minimum session-scoped agent-event path required by non-blocking retarget. This unit completes routing conformance and recovery across every runtime event stream. Application routing uses workspace and session scope. An attachment's accepted URL and host authorization establish its workspace and session subscription. Payload fields cannot widen it. Agent activity for the primary branch reaches every authorized attachment viewing that session. H4 has no explicit instance id or agent-instance event scope, and no legacy unscoped publication path remains beside the scoped path.

Preserve the current single-branch Chat behavior in H4, including its live transcript updates. The future all-branch feed described below is a session-scoped durable completed-entry stream, not a reason to implement branch topology or broadcast every token delta now.

Workspace feature reload commits and reconciles every live instance without cross-session state exchange.

**Review gate:** Session scope isolation and reload reconciliation pass against fake hosts in the H3 style. A client cannot spoof another workspace or session through a feature payload.

#### H4.5: Model semantics and implementation gate

Land per-instance `currentModel` projection with the workspace default as fallback. The H4.0 Pi concurrency spike remains recorded de-risking evidence rather than a permanent profile-dependent test. Exercise the finished ownership model through deterministic `WorkspaceAgentRuntime` lifecycle tests here. End-to-end concurrent live-agent smoke testing belongs to the server host in H8. There it can validate UIX attachments, transport, routing, and agent execution together.

The lifecycle contract across H4.1–H4.5, implemented and tested:

- Concurrent attachments to an absent instance awaiting one single-flight creation promise and receiving independent guards on the result.
- Attachment to an existing primary instance whose Pi runtime may be unbooted, idle, or running.
- Two live agents on distinct sessions in one workspace runtime.
- Acquire-before-disposal attachment retargeting that synchronously disposes the old guard and returns without awaiting an old running turn or teardown.
- Failed target acquisition preserving the accepted old guard and target.
- A request operation guard preserving its accepted instance across concurrent attachment retarget.
- One active turn per primary instance, with a clear busy rejection for competing prompts.
- A detached turn guard preserving the instance through its final safe boundary after every attachment leaves.
- Immediate policy teardown of an eligible idle instance at zero guards.
- An attachment acquired during the turn leaving the instance live after the turn guard disposes.
- Session-scoped agent events reaching every authorized attachment on that session.
- Two sessions retaining independent restored Canvas documents, anchors, turn state, and agent context.
- One attachment leaving a shared instance without committing, restoring, or disrupting peers.
- Final state commit only during actual agent instance teardown.
- Workspace feature reload visiting every instance under temporary guards and reconciling them without cross-session state exchange.
- Parent disposal stopping admission, cancelling parent-owned operations and in-flight creation, reaching operation quiescence, accounting for every guard, and awaiting child teardown.

Retained as later policies: configurable zero-guard idle periods, always-on instances, host-authored guarded work, static-default model setting, and the multi-branch architecture below.

**Review gate:** The replacement owner and stateful features satisfy the lifecycle above without process-global collisions, cross-session event leakage, or shared primary-session state mutation. The H4.0 evidence remains the basis for Pi's in-process viability. H8 validates the complete server-host path with opt-in live-agent smoke tests. Neither host should depend on an unproved ownership shape.

#### Deferred: multi-branch session coordination

This is an architectural constraint on H4, not an H4 deliverable. Do not partially implement it through local branch-end walks or by treating the file's last row as every manager's target.

A later branch/multi-agent unit introduces one session coordinator per active durable session:

```text
Session coordinator
├── shared graph index and branch catalog
│   ├── entry id → durable entry and branch id
│   └── branch id → mutable current head id
├── session-scoped completed-entry publisher
└── exclusive branch ownership
    ├── branch A → AgentInstance A → private SessionManager A
    └── branch B → AgentInstance B → private SessionManager B
```

The settled future responsibilities are:

- **Stable identity and mutable position:** `branchId` is the first durable row on a branch and keys exclusive branch ownership. `headId` advances on every append and positions a newly booted manager. The application never uses a mutable head as branch identity.
- **One manager per agent:** every branch-bound `AgentInstance` owns an independent Pi `SessionManager` because its leaf pointer is mutable. The coordinator provides the resolved head. Instances do not discover branch ends independently. The coordinator owns the complete graph and no long-lived manager of its own.
- **One graph derivation on cold open:** scan the session entries once to derive complete topology, `entryId → branchId`, and `branchId → headId`. A persisted head index may later accelerate this. It remains rebuildable cache, and the append-only session file stays authoritative.
- **Incremental graph updates:** instrument each private manager's durable append boundary. After Pi appends and returns an entry id, UIX reads and ingests the entry. It then advances that branch's head and publishes a session-scoped completed-entry event.
- **Session visibility, agent isolation:** authorized viewers of a session receive its graph snapshot and completed durable entries for every branch. Agents retain only their private branch context. Cross-branch agent communication or synthesis requires a future explicit mechanism and is not implied by graph visibility.
- **Application routing by branch, not instance:** future clients may hold handles to several branches and prompt their exclusive agents independently. Internal instance ids or generations may reject stale work, but have no URL, UI, or event-routing meaning.
- **Host-stamped subscriptions:** the accepted connection URL and authorization establish the session subscription. The host passes its `SessionTarget` to the runtime unchanged. It does not inspect the session graph or resolve a missing `branchId`. The session coordinator applies the default-branch policy and returns an opaque attachment for the host to bind to the connection. Runtime envelopes qualify completed entries with session and branch identity outside feature-authored payloads. A client cannot spoof another session by placing routing fields in a request.
- **Unborn branch:** a provisional internal ownership record rekeys once when its first durable append provides the branch id. No marker row or minted durable token is added solely for UIX.

The first branch UI consumes the coordinator's branch catalog. It renders human-facing previews, fork points, timestamps, or user labels. Raw branch ids remain machine identity. Token deltas may later use an explicit live-branch subscription. The all-branch session feed needs only completed durable entries.

### H5: Extract the shared launcher and workspace clients

Move browser-compatible launcher and workspace UI into `packages/client`. Each entry receives a constructed client adapter from a host-owned client bootstrap. Remove ambient Electron detection from shared code. The page-shared module mechanism (the React, TypeBox, and `@uix/api` instances that bundled surfaces resolve against) moves with the workspace client.

Give the workspace client canonical workspace-session navigation and a transport connection epoch. The URL names each attachment's target. The browser keeps no separate last-session preference. A workspace-only route resolves the most recently modified valid session, or creates one when none exists. It then replaces itself with the canonical workspace-session URL. Reloading an existing tab therefore restores its exact URL target, while a new workspace-only navigation resolves the newest session at that later time. Snapshot-backed state owners use one reusable recovery pattern rather than optional feature-by-feature reconnect callbacks. Inventory every event stream and classify it as a durable snapshot signal, an ordered live delta, or an explicitly lossy notification. Define pending mutation loss as an indeterminate outcome rather than a confirmed failure, and do not retry mutations automatically.

The launcher client consumes a host-level catalog projection and can navigate to canonical workspace-session URLs. It does not require an active workspace runtime.

**Review gate:** Both clients build in a browser-only environment over fake adapters. Session retarget updates history only after success, and direct URLs restore the same target. Reconnect tests recover all snapshot-backed state without accidentally remounting the whole client.

### H6: Rehome app features and workspace compositions

Move reusable Chat, Canvas, workspace tools, and other app-layer features under `apps/features`. Move the repository dogfood manifest and any workspace-specific source under `apps/workspaces/default`. Preserve direct manifest selection and source readability. Do not introduce global feature discovery.

Update scaffolding and development references so core runtime and hosts can build without importing the reference application. A bare test workspace must activate without Chat, Canvas, or developer tools.

**Review gate:** The default workspace behaves as before through explicit manifest references, while runtime, client, and host package graphs have no dependency on app features.

### H7: Reconstitute Electron as a discrete host

Move Electron main, preload, launcher client bootstrap, native chrome, IPC, protocol, recents, dialogs, and packaging assumptions under `hosts/electron`. The Electron host composes the shared supervisor, runtime, launcher client, and workspace client through concrete adapters.

Bind each Electron window or future tab to one workspace guard and one attachment rather than broadcasting through `BrowserWindow.getAllWindows()`. IPC requests dispatch through that bound attachment, and runtime events route only to matching windows or tabs. Persist Electron's local window/tab layout and each canonical workspace-session target in the host profile. Reopening the application then restores the local chrome the user closed. Do not write a workspace-global selected-session setting.

Bind Electron resource URLs through workspace-qualified routes. Today each runtime binds `protocol.handle` on the substrate scheme directly, so a second runtime would silently replace the first's handler. The host owns one registration and routes workspace-qualified URLs into each runtime's dispatcher. The transitional one-workspace Electron host already awaits its directly owned runtime during `before-quit`. Replace that direct ownership with the shared workspace supervisor while preserving awaited shutdown. Keep process handlers, raw IPC, protocol registration, and window lifecycle inside the Electron host.

Preserve existing dogfood behavior and add a concurrent-workspace proof with two windows. Until this unit, the one-window Electron host may create its attachment directly from the runtime because canonical host targets arrive with the H5 client work. That transition must stay constrained to one workspace window and one attachment, preserve scoped delivery, and add no Electron accommodation to runtime contracts. H7 removes the direct path and makes the supervised workspace the sole holder of attachment delivery closures. The launcher client uses the shared launcher presentation where its capabilities overlap and retains Electron-specific folder selection as an honest host capability.

**Review gate:** Electron passes existing behavior checks, and two workspace windows remain isolated despite duplicate feature ids. Session switching moves only the requesting attachment. No Electron import exists in runtime, client, app feature, or shared host-neutral code.

### H8: Build the server host, launcher, and live channel transport

Create the server composition root under `hosts/server`. It starts with zero active workspace runtimes and owns a supervisor. It exposes the launcher catalog, serves canonical routes, and creates one attachment per live connection.

Choose and implement the live transport against the proven attachment boundary. WebSocket remains the expected local choice because the channel surface is bidirectional. The unit must decide against actual operations and scoped delivery rather than inherit the discarded broadcast spike. The transport comparison analysis from the discarded spike remains available as reference in repository history.

The wire protocol uses discriminated request, response, error, and event frames with required correlation fields. Every crossing records through the shared wire-log chokepoint with per-contract redaction, so server lines match Electron lines. The host resolves workspace and initial session from the connection URL. Session switching retargets the existing attachment. Events include runtime scope, and the host delivers them only to matching connections. Pending requests reject as indeterminate after a connection loss. Bounded outbound queues drop slow clients into the snapshot recovery path.

Run one deterministic conformance suite against in-memory, Electron, and real server adapters. Include two connections on one session, independent sessions in one workspace, concurrent workspaces, retargeting, malformed frames, request errors, redacted logging, scoped fan-out, disconnect, and reconnect. Add an opt-in live-agent smoke suite at this host boundary to exercise concurrent sessions, shared-session viewers, retargeting, event isolation, and disconnect-surviving turns through UIX itself.

**Review gate:** A laptop-style and phone-style client attached to one workspace-session share one live agent and transcript stream. Retargeting either client leaves the other unchanged. No server transport mechanism appears in runtime or feature contracts.

### H9: Add HTTP resource delivery and browser parity

Bind the runtime-owned resource dispatcher to server HTTP. Serve the launcher shell, workspace shell, built surface modules, styles, feature resources, and contained content through workspace-qualified routes. Preserve logical resource identity while allowing Electron custom-protocol and HTTP encodings to differ.

Review Content Security Policy, Cross-Origin Resource Sharing, iframe origins, generated-content containment, path traversal, cache hashes, development asset resolution, and production layout. Direct requests to canonical workspace-session URLs must serve the workspace client, while invalid workspace or session ids return actionable host errors.

Complete browser parity tests for activation, reload, surfaces, Canvas writeback, settings, keybindings, session switching, provider authentication callbacks, persistence, and reconnect recovery.

**Review gate:** An ordinary supported browser can open the launcher and navigate to a workspace-session URL. It can use the reference composition and reload that URL directly. The browser retains the same runtime semantics as Electron.

### H10: Add operational and distribution readiness

Expose the launcher/catalog projection through versioned HTTP and stable CLI JSON. Add server address advertisement for a native launcher. Decide startup URL reporting, loopback bind defaults, port selection, browser opening, logs, signals, stale advertisements, profile locations, and actionable startup failures.

Perform the local-server threat review before allowing non-loopback binding. Define intentional Electron/server differences and run the shared parity matrix on macOS and a Linux or container-like environment. Then complete independent host builds and the Node single executable application packaging pass. Packaging must not pull Electron or app features into the core server artifact.

**Review gate:** The Electron and server hosts build independently over the same runtime and clients. CLI and HTTP launcher projections agree, and server discovery recovers from stale advertisements. The local safety model is documented. The core server distribution contains no Electron or batteries-included app composition.

## Decisions deliberately deferred

- Configurable zero-guard idle periods and always-on agent instance policies.
- Host-authored background agent guards and cron orchestration.
- Multiple branch-bound agents on one durable session tree.
- Ephemeral call-and-response agents, including any explicit agent-instance identity and event scope that their routing requires.
- Remote identity, tenancy, authorization, collaboration, and hosted persistence.
- Non-loopback server operation before a separate security model.
- Fruition onboarding, defaults, subscription UX, installers, updates, and final repository timing.
- Independent publication and versioning of internal packages unless distribution requires it.
- A feature marketplace or hostile-feature sandbox.

## Not in this plan

- Preserving the discarded broadcast transport or global broadcast behavior for compatibility.
- Maintaining parallel old and new runtime or renderer paths.
- Replacing Electron with another desktop shell.
- Building the native launcher UI.
- Building Fruition or hosted Fruition.
- Process-isolated workspace runtimes. Local isolation is in-process lifetime bags, and a hosted deployment isolates users by VM.
- Adding implicit feature discovery or compiled-in default features.

## Completion gate

The split completes when Electron and server are discrete hosts over one workspace-runtime implementation and one shared browser client. A supervisor can run concurrent isolated workspace instances. Connections share and retarget primary agent instances correctly. Launcher clients address canonical workspace-session URLs, and both hosts pass the shared semantic suite. Shipping the server does not imply public API stability beyond UIX's declared maturity.

## Appendix: E0 host-contract inventory

This inventory comes from the discarded transport-first plan (recorded 2026-08-08, see `spike/electron-server-split` in repository history). H3 reuses it as the starting analysis for what moves into `packages/runtime` and what stays host-owned. Unit references are remapped from the old plan's E-units to this plan's H-units. The inventory is historical evidence: it classifies the Electron surface as it existed at that commit, not the current tree.

The Electron surface is six production files. `src/main/index.ts` owns app lifecycle, windows, menu, picker, dialogs, recents, and packaged paths. `src/main/ipc.ts` is the channel transport over `ipcMain`/`webContents`. `src/main/resource-registry.ts` is the `uix-resource` custom protocol. `src/main/lifecycle.ts` provides app/window event helpers. `src/main/external-links.ts` routes window navigation to `shell.openExternal`. `src/preload/index.ts` is the renderer transport client. Everything else in `src/main` is host-neutral fs/path/Pi work.

`openWorkspace()` is already almost entirely runtime. It builds the document store, manifest store, settings, and feature loader. It owns all eight facet registries, the agent driver, the surface pipeline, and the reload coordinator. The `uix`/`agent` channel handlers are runtime too. The host pieces inside it are the window, the menu, the channel transport closures, `openExternal`, `userData` paths, and the templates path.

The smallest host contract is five ports. Each is a concrete effect the runtime already performs:

1. **Channel transport**: `registerHandler(id, handler, logOpts)` plus `publish(channel, payload, logOpts)`. Electron binds IPC today. The server binds a live bus later (H8).
2. **Resource serving**: serve normalized routes on the reserved substrate origin. Electron uses the custom protocol. The server uses HTTP (H9).
3. **Capabilities**: `openExternal(url)`, the Pi app data directory, the templates dir, and the page source (dev URL or packaged files).
4. **Workspace target**: the host picks the workspace. The runtime owns everything workspace-scoped, which is already the `appBag`/`openWorkspace` boundary.
5. **Process lifecycle**: the host starts and stops the process. The runtime owns the workspace-scoped bag and disposes on close.

Ownership calls and unresolved cases:

- Recents and the start picker stay host chrome. The server CLI (H10) takes an explicit target and has no picker.
- The menu reload binding is host chrome. The reload coordinator is runtime. The server needs a page-side or CLI reload trigger.
- `ELECTRON_RENDERER_URL` and `app.isPackaged` are Electron dev assumptions. The server dev story differs (H9).
- Packaged resource paths (preload, renderer html, icon, templates) are Electron packaging specifics. The server has its own layout (H10).
- `apiModuleDir` resolves from `app.getAppPath()`. The server resolves `@uix/api` from its own install (H10 self-resolution).
- `installProcessHandlers` is Node-neutral and stays shared.

Acceptance status: every Electron import has an owner above. The runtime is describable without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. H3 extracts `openWorkspace` into a runtime constructor taking these ports.
