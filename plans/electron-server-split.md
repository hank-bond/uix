---
summary: "Build the Electron and web hosts over the proved workspace runtime, attachment boundary, supervisor, and shared browser client, per the accepted web-host specification."
---

# Electron and server hosts

## Unit status

- **H0** baseline established (commit before H1).
- **H1** ownership roots and dependency enforcement landed.
- **H2** in-memory host/runtime boundary proof landed.
- **H3** real workspace runtime landed. The openWorkspace substrate moved into `packages/runtime`. `createWorkspaceRuntime` composes it over host ports, and the Electron app consumes it without host migration. The H3 isolation suite proves two concurrent workspaces with duplicate feature, channel, resource, and settings ids.
- **H4.0** derisk spike landed: two real Pi runtimes coexist in one process, and two live agents append disjoint branches to one session file. See the H4 section.
- **H4.1** owner primitives landed. Per-instance transcript identity, mutable state, branch-local model selection, explicit manager opening, forward `SessionTarget` identity, and the internal `AgentInstance` owner are present. Production driver retirement moves into H4.2 so the branch does not build a temporary singleton coordinator only to remove it.
- **H4.2** landed. It activates session-keyed instance supervision, guard-native lifetimes, attachment dispatch, non-blocking retarget, and teardown policy. UIX-owned lifecycle capabilities now use the ECMAScript disposal protocols without parallel named cleanup operations. The deferred multi-branch architecture moved to the Agent feature plan.
- **H4.2a** active-turn cancellation landed. Remaining operation hardening moved to [`runtime-operation-hardening.md`](./runtime-operation-hardening.md).
- **Further Agent runtime work** moved to [`agent-feature-instances-and-viewpoint-state.md`](./agent-feature-instances-and-viewpoint-state.md).
- **H5.1** launcher extraction landed in `0e2ccdc`.
- **H5.2** workspace extraction landed in `0780f80`.
- **H5.3** dependency-boundary enforcement landed. H5 is complete.
- **R0-A3** in [`agent-feature-instances-and-viewpoint-state.md`](./agent-feature-instances-and-viewpoint-state.md) have landed. **H6** (the minimal loopback server) was **discarded** as attempt 1 on 2026-08-23. The accepted [web-host specification](../docs/specs/web-host.md) replaces its requirements. **W1** landed in `780838b`. **W2** has landed. **W3** landed in `75fd789`. **W4** has landed. **W5** landed in `d8ca763`. **W6** landed in `ac412f1`. **W7** has landed. **W8-W9** have landed. **W10.1** landed in `97f63b2`. **W10.2** landed in `38c7424`. **W10.3** landed in `d8307f5`. **W10.4** is complete in the current review. **H7** is complete in the current review. H8 now covers the final two-host conformance gate.

## Status and intent

This plan's landed units (H0-H5 and the Agent feature work) established the shared substrate. That substrate covers workspace supervision, attachment dispatch, guarded agent instances, and the host-neutral browser clients. The first server attempt (H6) implemented a minimal loopback host. It was discarded. The loopback-only scope, its redirect-to-WebSocket pending-attachment handoff, `.localhost` resource origins, and missing reconnect, shutdown-notification, provider-auth, and reload behaviors did not match the non-local direction. Its lessons are recorded in the attempt summary at the end of this plan.

The accepted [web-host specification](../docs/specs/web-host.md) now defines the web host independently of one implementation attempt. This plan builds to that specification. It adopts one trust domain with deployment-provided admission. It adopts a live control plane plus an HTTP content plane including immutable content references. Sessions are created and owned by their live connection. Reconnection is client-owned. The registry is read-only. The public-origin policy is explicit, and shutdown is graceful. The specification leaves the HTTP library, live transport, message encoding, routing, and pathnames as degrees of freedom. The first web-host unit may pick them from current evidence rather than from the discarded attempt.

The plan implements the synthesis in [`host-workspace-runtime-boundaries.md`](../docs/design/host-workspace-runtime-boundaries.md), [`agent-session-routing.md`](../docs/design/agent-session-routing.md), [`agent-instance-state.md`](../docs/design/agent-instance-state.md), [`product-and-distribution.md`](../docs/design/product-and-distribution.md), and [`workspace-feature-composition.md`](../docs/design/workspace-feature-composition.md), against the accepted [web-host specification](../docs/specs/web-host.md). It retains the decisions that features are the loadable unit, manifests are the composition authority, surface delivery is runtime-built, and designs remain hosting-compatible. Implementation follows the [`human-paced-implementation.md`](../docs/architecture/human-paced-implementation.md) loop: complete one review unit, explain it, and wait for approval.

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
- **The launcher precedes all runtimes.** A host can serve workspace catalogs with zero active workspaces. Launcher HTTP, CLI JSON, Electron, and native clients consume one machine-readable projection. The first web host loads a read-only workspace registry at boot. Changing it requires a restart. The served projection contains only opaque ids, names, and canonical locations.
- **The browser client is host-neutral.** Shared launcher and workspace clients receive constructed adapters. They do not inspect Electron globals or select transports.
- **One instance is one trust domain.** Strong isolation between deployments, users, or hosted tenants. Only weak cooperative isolation among code and content admitted within one workspace. Admission is deployment-provided, through a trusted network boundary or authenticated ingress. The host performs no login and holds no credentials in this version. Non-loopback operation requires an explicit public-origin policy. Every browser-visible location and cross-origin grant derives from that policy. The host never infers public locations from request headers.
- **Live connections own their attachments.** A workspace-only URL serves a stateless shell. The connection creates its session and attachment and canonicalizes the location. No pending attachment crosses separate physical requests.
- **Reconnection is client-owned.** The server detects dead connections with periodic ping/pong. The client reconnects with capped backoff and rehydrates snapshots rather than replaying events. Pending requests are rejected locally and never auto-resent. Mutating requests return the durable identity of what they created.
- **One control plane, one content plane.** Live connections include requests, responses, events, and host-neutral immutable content references. HTTP includes the referenced content. Each fetch retains independent workspace authority and never depends on a live connection. Hosts map accepted content references onto browser transport URLs. Feature code never observes the transport encoding.
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

_Status: landed._ The openWorkspace substrate moved into `packages/runtime` behind `createWorkspaceRuntime`. It covers documents, manifest store, Workspace settings and registries, per-instance Agent registries, feature loading, surfaces, and reload. Dispatch is runtime-owned canonical. `src/main` now constructs one runtime over Electron ports and keeps only host chrome. The `runtime.test.ts` suite instantiates two real workspaces with duplicate ids and exercises activation, settings, documents, dispatch, resources, surfaces, reload, events, and disposal.

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

The host receives each physical request message and asks its bound attachment to prepare the dispatch. It records the inbound crossing with the prepared contract policy, invokes the handler, and records the result before sending the response message. Physical messaging and wire-log writes remain host-owned. Log policy remains workspace-channel state rather than attachment state. Unknown channels use a fixed safe policy that records their canonical id without their client-authored payload. A prompt handler retains a separate turn guard before the prepared dispatch disposes its operation guard.

H4.2 includes minimum session-scoped agent-event delivery because an old running session must never publish into an attachment that already moved. Remaining authorized attachments on the old session continue receiving its activity. With none, the turn guard lets execution persist without live delivery. Complete event conformance, snapshot recovery, and reload reconciliation remain in later units. The runtime creates one `Attachment` object with identity, target guards, dispatch, retargeting, event listeners, and disposal. Creation privately returns its supervised workspace a narrow delivery closure. The supervised workspace selects receivers from event scope and invokes delivery without gaining request authority. No host façade or second runtime attachment duplicates identity, target, or lifetime.

Migrate the existing selected-driver behavior suite to the replacement owner rather than deleting its behavior coverage. Add explicit scenarios for shared instances with unbooted Pi runtimes and prepared dispatches across concurrent retarget. Prove that prepared dispatches retain operation guards, preserve their accepted authority, and use their channel registration's log policy after the attachment moves. Cover a turn guard surviving disconnect, non-blocking running retarget, returning to the still-running instance, and guarded all-instance visitation. Also cover session event isolation, idempotent guard disposal, zero-guard policy, acquisition during pending teardown, final commit, parent drain, and guard-leak diagnostics. Do not rely on garbage collection for disposal.

**Review gate:** The lifecycle scenario list below, minus Canvas and future branch items, passes against the mocked SDK with two sessions in one runtime. The tests can account for every guard owner and prove that no asynchronous instance operation uses an unguarded raw instance. Current single-window Electron behavior remains intact, while the multi-attachment behaviors are reviewed explicitly.

#### H4.2a: Active-turn cancellation vertical

_Status: the active-turn vertical landed. Remaining operation hardening moved to a dedicated plan._

Commits `773918f`, `385edaf`, and `370003e` added lexical tracked turn operations, targeted Pi abort, shutdown quiescence, discrete activity events, Chat Stop/Escape controls, and late-attachment activity recovery.

Prepared dispatch, provider authentication, model refresh, single-flight boots, and the remaining external-call inventory now live in [runtime operation hardening](./runtime-operation-hardening.md). They remain important production work but no longer block a basic loopback web host.

### Runtime work split from this plan

Agent feature lifetimes, per-session Canvas state, selected-view routing, reload, and concurrent-session tests moved to [agent feature instances and viewpoint state](./agent-feature-instances-and-viewpoint-state.md). R0 reverted the unused state-builder and composition code. A1 moved feature state into the production `AgentInstance`. A2 completed the concurrent-session gate before H6.

Provider-auth browser parity, app-source rehoming, discovery, security review, and packaging moved to [server browser parity and distribution](./server-browser-parity-and-distribution.md). Reconnect recovery returned here as W6 when the accepted web-host specification replaced the discarded minimal server.

The deferred multi-branch Agent architecture is recorded in the Agent feature plan. Session-branch Git state remains in [session worktrees and turn checkpoints](./session-worktrees-and-turn-checkpoints.md).

### H5: Extract the shared launcher and workspace clients

Move browser-compatible launcher and workspace UI into `packages/client`. Each entry receives a constructed adapter from its host bootstrap. Remove ambient Electron detection from shared code. Move the page-shared React, TypeBox, and `@uix/api` module mechanism with the workspace client.

Preserve the current single-target product envelope. One page owns one attachment and one selected primary session. Session switching remains unavailable while its Agent runs. The browser needs canonical workspace-session URLs, but connection versions and complete snapshot recovery move to the parity plan.

The workspace mount receives the existing `WorkspaceClient` rather than a second transport abstraction. It may also receive one bidirectional `SessionLocationAdapter`. The shared session controller invokes its synchronous, idempotent `synchronize(sessionId)` operation only after establishing an accepted active session. This includes initial hydration, New Session, successful switching, and host-history retargeting. The adapter's subscription routes host-owned location navigation back through that controller. Electron omits it. The server implementation owns canonical URL encoding, push/replace history effects, failed-retarget restoration, and `popstate`. It never teaches the client how host URLs are encoded.

The launcher consumes a host-neutral adapter over the host-level catalog. Workspace ids remain opaque. Listing and opening are required. Creation is optional so the initial server catalog may be read-only. Host errors reject, while native-dialog cancellation is an ordinary result. The launcher does not require an active workspace runtime.

Implement H5 in three review slices:

1. **H5.1 launcher seam:** land the host-neutral launcher adapter and disposable mount in `@uix/client`, then adapt the current Electron launcher without changing its behavior.
2. **H5.2 workspace seam:** move workspace source and tests behind a disposable mount. Move shared-surface module installation with it. Preserve Electron behavior while adding session-location synchronization.
3. **H5.3 boundary proof:** enforce that the client imports no runtime, host, Electron, app implementation, repository-internal alias, or ambient preload channel. Pin those restrictions with synthetic lint tests rather than a temporary browser host.

**Result:** `@uix/client` owns both disposable page mounts and their presentation. Electron retains only documents, preload adaptation, and page bootstraps. Import and ambient-global guards keep that ownership boundary explicit. The real server entries in H6 provide the browser-only build proof.

**Review gate:** Electron behavior remains unchanged. Shared client code reads no Electron global and cannot import concrete host, runtime, app, or legacy implementation paths.

### W1: Workspace registry, catalog, and launcher

Build the read-only workspace registry loaded at boot, the versioned public catalog projection, and the launcher page served with zero active runtimes. The registry file holds opaque workspace ids and explicit `uix.workspace.json` references. The host snapshots each workspace name from its manifest and resolves relative references from the registry file. The projection exposes only ids, names, and canonical locations derived from the public-origin policy. Serve the shared launcher client over the catalog adapter, with no create or delete operations. Changing the registry or a projected manifest name requires a host restart.

**Review gate:** The launcher lists configured workspaces with zero runtimes. The catalog is versioned and contains no filesystem or storage coordinates. Restart reflects registry edits. A wrong workspace id is rejected without revealing the registry path.

### W2: Stateless workspace shell and live session creation

Serve `/workspaces/:workspace` as a stateless shell that acquires no runtime. On the live-connection upgrade, acquire the workspace through the supervisor, create a new session and attachment, and return the accepted session id and canonical path. The client canonicalizes its location with a history replacement. A direct `/workspaces/:workspace/sessions/:session` upgrade attaches to the named durable session. No pending-attachment map or cross-request handoff exists.

**Review gate:** Two tabs opening the workspace-only URL create two independent sessions and attachments. Reloading a canonical URL reattaches to that session. Closing a connection disposes its attachment without affecting a peer.

### W3: Live transport protocol

_Status: landed in `75fd789`._

Define the discriminated ready, request, response, error, and event messages with physical correlation ids. Enforce exactly one terminal response per accepted request. Reject reuse of an in-flight correlation id without disturbing the original request. Route every canonical request through the bound attachment's prepared dispatch. Record crossings through the wire-log chokepoint with contract-owned redaction. Deliver runtime events only to matching attachment targets. Malformed messages never reach dispatch and correlate only after independent id validation.

**Review gate:** Success, failure, duplicate-correlation, and disconnect semantics are proven. No workspace, session, or authentication identity appears in canonical payloads. Unknown channels log under the safe payload-omitting policy.

### W4: Content plane

_Status: landed in `e425bdd`._

Make content references host-neutral and immutable in live channel payloads, and serve the referenced bytes over HTTP. The host maps each accepted reference to a browser-fetchable URL for the workspace and session viewpoint. Each fetch retains its own workspace guard. It does not boot an Agent instance unless resolution requires one. Apply cache policy by content class. Versioned immutable content caches immutably, while pages, catalog, projections, and current-state endpoints stay no-store. Cross-origin grants derive only from the configured public-origin policy. Exported or frozen content must not require host-specific transport URLs.

**Review gate:** A referenced document survives its originating socket disconnecting. Cache headers match content class. A fetch from an unauthorized origin receives no cross-origin grant. The substrate resource pipeline serves modules, styles, CSS assets, and fonts through the same content path.

### W5: Deployment profiles and public origin

_Status: landed in `d8ca763`._

Loopback-only startup may derive the public origin from the bound address. Any non-loopback startup requires an explicit public origin. Reject request authorities and browser origins outside the configured policy without trusting client-authored headers. Support the trusted-encrypted-network plaintext profile and the TLS-or-trusted-ingress profile. Keep non-loopback binding explicit. Apply the browser security policy (CSP) over only the origins the active client needs. A failed start closes every listener, socket, and runtime it opened.

**Review gate:** Wrong-host and wrong-origin requests are rejected. Configured public origins produce correct absolute catalog, live, and content locations. The two deployment profiles satisfy the same contracts.

### W6: Reconnect, heartbeat, and request semantics

_Status: landed in `ac412f1`._

Add server-side dead-connection detection with periodic ping/pong (approximately 30 seconds) so a dead socket releases its attachment. Implement client-owned reconnection with capped backoff, triggered by close, error, network recovery, or visibility return, attaching to the session named by the canonical location. Rehydrate authoritative snapshots rather than replaying events. Reject pending client requests locally on disconnect and never auto-resent them. Mutating requests return the durable identity of the record they created. Safe retries reuse a client-supplied idempotency identity.

**Review gate:** Laptop sleep/wake, network change, and server restart scenarios recover through snapshots without duplicate prompts. A prompt confirmed before disconnect is not re-run. Optimistic user rows confirm from the reconnect snapshot.

### W7: Graceful shutdown and startup failure

_Status: landed._

On termination, stop admission and notify live connections with a shutdown message. Cancel active Agent runs through native cancellation. Close connections and dispose pending and live attachment ownership. Stop HTTP service and await workspace-supervisor teardown before exiting. The host never waits for an Agent run to complete. A failed start closes everything it opened.

**Review gate:** Termination during an active turn cancels the run, notifies clients, and exits without leaking the listener or runtimes. A failed start leaves no port or runtime alive.

### W8: Provider authentication on the browser device

_Status: landed._

The loopback web host may open provider links on its local machine. Nonlocal profiles do not open links on the server machine. The browser always exposes retained provider links and device codes, so the Codex headless/device-code flow completes from an unconfigured Pi profile. API-key and manual prompt flows continue over the existing provider-auth channels. No callback or redirect endpoint exists in this version. Full OAuth callback parity is deferred.

**Review gate:** A device-code flow completes from a fresh profile. Links and codes render and open on the client device. Loopback launch is best-effort, while nonlocal profiles require no server-side browser or callback.

### W9: Workspace reload as a substrate channel

_Status: landed._

Add a reload request to the substrate `uix` channel contract with the runtime's `ReloadResult` shape. Expose it as a shared workspace action with a non-reserved default binding and a palette entry. Reload is rejected while an Agent operation is active. A successful reload replaces the composition once and fans a composition-changed event to every attached tab without a page reload. Failures return structured diagnostics while the previous composition remains active. Electron's `CmdOrCtrl+R` menu item rehomes to the same substrate path.

**Review gate:** Browser-triggered reload activates edited feature source and manifests. Every attached tab updates its surfaces, and Electron behavior is preserved.

### W10: Web-host conformance follow-through

A code-and-test review against the accepted web-host specification found four bounded follow-up slices. Keep them independently reviewable. Browser behavior belongs in a real browser suite, while process lifecycle, guarded cancellation, and malformed wire traffic remain deterministic Node/Vitest responsibilities.

- [x] **W10.1: Browser history retargeting.** Replace the one-way location callback with a host-neutral `SessionLocationAdapter`. Accepted client selection updates host history. Browser Back and Forward route through the shared session controller. Failed retargeting restores the previous accepted location. Unit coverage proves successful traversal, failed restoration, and fatal History API failure.
- [x] **W10.2: Prepared-dispatch shutdown cancellation.** Give each accepted dispatch a workspace-owned cancellation signal and completion boundary beside its retained Agent-instance guard. Ordinary attachment close and retarget leave accepted work alive. Workspace or host shutdown requests cancellation before waiting for dispatch completion and guarded teardown. A cooperative never-settling handler must observe cancellation, settle its lexical scope, release its guard, and let shutdown finish. This slice promotes O1 from [`runtime-operation-hardening.md`](./runtime-operation-hardening.md). Provider auth, model refresh, boots, and external calls remain there.
- [x] **W10.3: Complete malformed wire logging.** Route binary and pre-ready malformed application messages through the same safe payload-omitting inbound wire-log boundary as malformed JSON. Preserve the correlated protocol-error behavior where a correlation id can be validated independently. Tests must prove malformed bytes and payload fields never enter logs or canonical dispatch.
- [x] **W10.4: Real browser behavioral suite.** Add a server integration harness that starts an isolated workspace and runs deterministic PandaScript with the installed Lightpanda binary. Cover workspace-only canonicalization, in-page session creation and switching, Back and Forward retargeting, and failed-history restoration. Also cover controllable reconnect snapshot behavior and a basic Chat/Canvas browser flow without adding test-only production endpoints. PandaScript owns browser interactions and assertions. Node owns fixture creation, server lifecycle, process output, protocol-level traffic, and cleanup. Keep unit tests for structural edge cases rather than replacing them with browser tests.

  **Result:** The harness builds into an isolated output root and starts and restarts the real server. It mutates reconnect state over the public WebSocket protocol and drives production pages with PandaScript. Lightpanda does not support Chat's CSS module scripts, so a styleless fixture composes the production Chat controls through an ordinary feature contract. Production Canvas runs in a separate fixture workspace so its iframe history does not interfere with session traversal. Lightpanda also does not complete the cross-frame `postMessage` handshake. Canvas therefore verifies the production surface, resource route, and iframe bootstrap rather than writeback. Back and Forward use browser history. The rejected-target scenario dispatches `popstate` directly because Lightpanda reloads invalid pushed entries instead of preserving the in-page document.

**Review gate:** W10 closes the concrete gaps found by the web-host specification review. Every slice passes independently. The browser suite drives production pages and routes without adding test-only host or runtime capabilities.

### H7: Reconstitute Electron as a discrete host

_Status: complete in the current review._ Electron main, preload, renderer bootstraps, native assets, IPC, protocol dispatch, recents, dialogs, and electron-vite configuration now live under `hosts/electron`. The concrete host composes `WorkspaceSupervisor`. Each workspace `webContents` owns one guard and attachment. Canonical dispatch resolves by that physical connection id. Every content request retains an independent workspace guard through a host-wide workspace-qualified resource transport. Import enforcement rejects Electron from host-neutral packages, the server host, and app features.

Move Electron main, preload, launcher bootstrap, native chrome, IPC, protocol, recents, dialogs, and packaging assumptions under `hosts/electron`. Compose the shared supervisor, runtime, launcher client, and workspace client through Electron adapters.

Bind each Electron window to one workspace guard and attachment. Its `webContents` remains the physical connection identity. Replace each runtime's direct protocol registration with one host-owned workspace-qualified dispatcher. Preserve awaited shutdown and current dogfood behavior. Rehome the `CmdOrCtrl+R` reload menu item to the substrate `uix` reload channel from W9.

Keep process handlers, raw IPC, protocol registration, and window lifecycle inside the Electron host. No Electron import may exist in runtime, client, app feature, or shared host-neutral code.

**Review gate:** Electron passes existing behavior checks from its discrete composition root. The server and Electron hosts build without importing one another.

### H8: Two-host conformance and split gate

Run one semantic suite against in-memory, Electron, and web-host adapters. The suite exercises the [web-host specification](../docs/specs/web-host.md) conformance outcomes. It covers one workspace-session attachment, canonical request success and failure, duplicate-correlation rejection, scoped events, and content dispatch with independent guards. It covers redacted logging, disconnect, reconnection with snapshot hydration, and deterministic disposal and shutdown.

Keep concurrent-session Canvas behavior, complete distribution, and hardening outside this gate. Their dedicated plans build on the same attachment, client-adapter, and resource boundaries. Reconnect, provider auth, and reload parity are already covered by W6, W8, and W9 and join the gate.

**Review gate:** Both concrete hosts run one shared workspace client over one runtime implementation. A basic Chat and Canvas flow works in Electron and a browser across the control/content split, without host-specific feature contracts.

## Decisions deliberately deferred

- Named Agents, multiple branch-bound Agents, and multi-branch coordination, tracked in the Agent feature plan.
- Complete operation cancellation and bounded shutdown, tracked in the hardening plan.
- Writable registry operations. These include creating and deleting workspaces from the launcher, and host-side directory browsing.
- OAuth callback endpoints and redirect flows. Only the device/headless flow is in scope for the first web host.
- Resource exhaustion quotas. Bounded messages, concurrent requests, and outbound backpressure are deferred until there is evidence of a problem.
- Tailscale Serve automation and Tailscale Services integration as supported deployment profiles.
- Host login, credentials, and user identity. Admission remains deployment-provided.
- Hostile multi-user tenancy on one instance. Hosted isolation remains VM- or instance-per-user.
- A feature marketplace or hostile-feature sandbox with strong per-feature isolation.
- Configurable zero-guard idle periods and always-on Agent policies.
- Host-authored background Agent guards and cron orchestration.
- Named Agents, multiple branch-bound Agents, spawning, and durable mailboxes.
- Ephemeral call-and-response Agents and explicit instance identity.
- Remote identity, tenancy, authorization, collaboration, and hosted persistence.

## Not in this plan

- Preserving the discarded broadcast transport, global broadcast behavior, or the loopback-only server implementation for compatibility.
- Maintaining parallel old and new runtime or renderer paths.
- Replacing Electron with another desktop shell.
- Building the native launcher UI.
- Building Fruition or hosted Fruition.
- Process-isolated workspace runtimes. Local isolation is in-process lifetime bags, and a hosted deployment isolates users by VM.
- Adding implicit feature discovery or compiled-in default features.
- Writable launcher operations or host login.
- OAuth callback endpoints, hostile multi-user tenancy, or marketplace isolation on one instance.

## Completion gate

The split completes when Electron and the web host are discrete hosts over one workspace runtime and shared browser client. A browser can open a workspace-only URL, create and revisit sessions, and run a basic Chat and Canvas flow across the control/content split. It can reconnect and rehydrate after a drop, and reload edited feature source. Electron preserves current behavior from its own composition root. Both hosts pass the semantic suite without host fields entering feature contracts, and the loopback and non-loopback deployment profiles satisfy the same web-host contracts.

## Appendix: E0 host-contract inventory

This inventory comes from the discarded transport-first plan (recorded 2026-08-08, see `spike/electron-server-split` in repository history). H3 reuses it as the starting analysis for what moves into `packages/runtime` and what stays host-owned. Unit references are remapped from the old plan's E-units to this plan's H-units. The inventory is historical evidence: it classifies the Electron surface as it existed at that commit, not the current tree.

The Electron surface is six production files. `src/main/index.ts` owns app lifecycle, windows, menu, launcher, dialogs, recents, and packaged paths. `src/main/ipc.ts` is the channel transport over `ipcMain`/`webContents`. `src/main/resource-registry.ts` is the `uix-resource` custom protocol. `src/main/lifecycle.ts` provides app/window event helpers. `src/main/external-links.ts` routes window navigation to `shell.openExternal`. `src/preload/index.ts` is the renderer transport client. Everything else in `src/main` is host-neutral fs/path/Pi work.

`openWorkspace()` is already almost entirely runtime. It builds the document store, manifest store, settings, and feature loader. It owns all eight facet registries, the agent driver, the surface pipeline, and the reload coordinator. The `uix`/`agent` channel handlers are runtime too. The host pieces inside it are the window, the menu, the channel transport closures, `openExternal`, `userData` paths, and the templates path.

The smallest host contract is five ports. Each is a concrete effect the runtime already performs:

1. **Channel transport**: `registerHandler(id, handler, logOpts)` plus `publish(channel, payload, logOpts)`. Electron binds IPC today. The server binds a live bus in H6.
2. **Resource serving**: serve normalized routes on the reserved substrate origin. Electron uses the custom protocol. The server uses HTTP in H6.
3. **Capabilities**: `openExternal(url)`, the Pi app data directory, the templates dir, and the page source (dev URL or packaged files).
4. **Workspace target**: the host picks the workspace. The runtime owns everything workspace-scoped, which is already the `appBag`/`openWorkspace` boundary.
5. **Process lifecycle**: the host starts and stops the process. The runtime owns the workspace-scoped bag and disposes on close.

Ownership calls and unresolved cases:

- Recents and the launcher stay host chrome. The minimal server uses its launcher and an explicit configured catalog.
- The menu reload binding is host chrome. The reload coordinator is runtime. Full browser reload UX belongs to the parity plan.
- `ELECTRON_RENDERER_URL` and `app.isPackaged` are Electron dev assumptions. H6 gives the server its own development path.
- Packaged resource paths are Electron-specific. The parity and distribution plan owns final server layout.
- `apiModuleDir` resolves from `app.getAppPath()`. The server uses its own install resolution, hardened before distribution.
- `installProcessHandlers` is Node-neutral and stays shared.

Acceptance status: every Electron import has an owner above. The runtime is describable without `Electron.App`, `BrowserWindow`, `ipcMain`, or `protocol`. H3 extracts `openWorkspace` into a runtime constructor taking these ports.

## Attempt 1 (2026-08-23): the minimal loopback server is discarded

- **Approach:** Built `hosts/server` over `node:http` plus `ws`. It used a redirect-to-WebSocket pending-attachment handoff, `.localhost` resource origins, and one configured workspace. This is the discarded H6 implementation.
- **Worked:** The shared substrate (workspace supervision, attachment dispatch, guarded agent instances, and host-neutral browser clients) held across real runtimes. Discriminated live messages, prepared dispatch, scoped event delivery, and contract-owned redaction were sound. Surface modules, styles, and CSS assets (fonts) served through logical resource URLs. The CSS asset rebasing work survives in the substrate as a committed improvement.
- **Did not work:** The loopback-only scope and the pending-attachment TTL. The `.localhost` origin encoding cannot be reached from another device. The catalog leaked `manifestPath`. Resource CORS echoed client origins. There was no reconnect, heartbeat, shutdown notification, or startup-failure cleanup. `openExternal` disabled provider authentication. Workspace reload had no browser path.
- **Promoted:** The accepted [web-host specification](../docs/specs/web-host.md) now defines the non-local host. It records one trust domain and a control/content plane with immutable content references. It records live-created sessions, client-owned reconnection, and a read-only registry. It records an explicit public origin, SIGTERM cancellation, and Codex headless auth. It also records reload as a `uix` channel. Design threads and architecture docs record the direction.
- **Unresolved:** HTTP library choice, writable registry operations, OAuth callback flows, resource quotas, Tailscale Serve automation, and hosted/marketplace strong isolation. The spec leaves the HTTP library a degree of freedom. Fastify versus a custom `node:http` path was discussed.
