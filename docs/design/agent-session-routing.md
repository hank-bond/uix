---
summary: "A connection attachment owns a guard on one session-bound agent instance and dispatches with guarded authority. Turns and asynchronous operations hold independent guards, and the instance supervisor applies teardown policy only after every guard releases."
kind: explanation
status: resolved
---

# Agent and session routing

## Current synthesis

One workspace runtime owns one workspace. A _session_ is a durable conversation tree. An _agent instance_ is the lifecycle owner for one Pi execution at a session-branch viewpoint. It owns its session manager and restored state before its Pi runtime boots. An _attachment_ is a connection's owned, retargetable handle on one agent instance.

The first server resolves each session to one primary agent instance. This is an initial resolution policy, not a permanent identity rule that equates one session with one possible agent. Two connections attached to the same workspace-session pair share the same agent instance and receive its events. A prompt from a laptop therefore updates another live view on a phone, and a reconnected view restores from the durable session snapshot.

The host resolves the workspace from the canonical connection URL, acquires its narrow `WorkspaceHandle` through the workspace supervisor, and asks that handle to create an attachment for the requested session. The runtime's `AgentInstanceSupervisor` owns the session-to-primary-instance policy, single-flight boots, guard admission, lifetime policy, and teardown. Concurrent attaches to an absent instance await one shared boot promise. Later attaches receive guards on the existing instance whether its Pi runtime is unbooted, idle, or running.

`attach` is the connection's binding step. `boot` is the discrete provisioning step: when no instance exists for the target, the runtime boots one first, then the connection attaches. The instance owns its session manager and restored state immediately, while its Pi runtime remains lazy until an operation requires execution. `bind` remains creation-time wiring only and does not describe the connection-to-instance relationship.

After connection setup, the attachment is the host's request capability for that workspace connection. The host treats the canonical payload as opaque and asks the attachment to prepare its dispatch. The attachment synchronously retains an operation guard and snapshots trusted workspace, session, and agent-instance authority. The workspace channel table contributes its resolved handler, schemas, and contract-owned log policy. The resulting `PreparedDispatch` owns the operation guard, so it can outlive attachment retarget or disposal without moving the accepted request or permitting instance teardown. If accepted work requests a retarget after its attachment has closed, it still resolves and guards the requested agent instance for the operation but does not install a new target guard on the closed attachment. The host records the inbound crossing with the prepared log policy, invokes the prepared handler, records the result, and sends the response frame. Ordinary feature handlers ignore attachment authority, while substrate agent handlers consume the same internal context. The `ContextualChannelRunner` type does not become a second handler category, and routing fields never enter feature payloads.

A session switch retargets one attachment without rebuilding the workspace composition. The runtime acquires a guard for the target instance first, changes the attachment only after acquisition succeeds, releases the old target guard immediately, and returns without waiting for old work or teardown. The switch response and canonical URL update therefore complete promptly while a long-running task continues under its own guard on the original instance. Other attachments and operations on that instance keep their guards. Feature state does not commit or restore merely because one peer leaves. A reconnect or direct page load reconstructs the attachment and its target guard from its canonical URL. A workspace switch is a host navigation because the feature composition may change. [`host-workspace-runtime-boundaries.md`](./host-workspace-runtime-boundaries.md) owns host, workspace-supervisor, launcher, and URL boundaries.

The canonical session URL is authoritative for one browser attachment. A workspace-only URL resolves the most recently modified valid session, or creates one when none exists, and then replaces itself with the canonical workspace-session URL. Reloading that tab therefore preserves its exact target, while a new workspace-only navigation resolves the newest session at that later time. Electron has no workspace-global selected session either: its host profile restores each local window or tab's canonical workspace-session target.

The first teardown policy keeps the lifecycle explicit and small. Every asynchronous instance use holds a guard for its complete duration. A live guard can synchronously retain another independently releasable guard on the same managed instance. Retaining after release fails. An attachment holds a target guard, canonical dispatch retains an operation guard, and a started turn owns a turn guard until its final safe boundary. Releasing a guard is synchronous, idempotent, and non-blocking. Zero guards makes the instance eligible for policy rather than promising disposal; the first policy tears down an eligible idle instance immediately. A later policy can add an idle period, user tuning, or always-on instances without changing guard or attachment semantics. A primary agent instance accepts one active turn. A competing prompt can initially reject as busy rather than introducing a hidden queue.

The runtime creates one attachment object with event observation as well as dispatch and retargeting. Creation privately gives the supervised workspace a narrow delivery closure. Runtime events use two delivery scopes, and the supervised workspace selects receivers before invoking that closure:

- Workspace events reach every attachment in the workspace.
- Session events reach attachments viewing that durable session.

The attachment does not select event receivers or send transport frames. The supervised workspace does not gain request authority or agent guards.

The primary-instance model does not expose an ephemeral agent-instance id or event scope. Session identity and branch identity cover application routing, while the instance supervisor uses managed-record object identity for lifecycle races. Ephemeral call-and-response agents may introduce explicit instance identity later when their routing or stale-work rejection establishes a concrete requirement.

Agent instance state follows the session-branch viewpoint rather than the whole workspace, even while the Pi runtime remains unbooted. The workspace runtime owns one accepted feature composition, workspace settings, stores, and contribution definitions. Each agent instance owns its state at its viewpoint: the turn-state projection, agent context, Pi installation, and branch-dependent feature buffers. Connections on one primary instance share that state, while instances on different sessions cannot overwrite each other's restored state. [`agent-instance-state.md`](./agent-instance-state.md) records the vocabulary settlement.

The host can later acquire an agent instance guard without a client connection to author cron-style or background messages. Detached work holds that guard through its complete asynchronous use rather than pretending to be a browser connection. A guard establishes no event subscription, so work can remain live without a connected receiver.

The original attachment model was distilled into [`2026-08-09-attachments-target-agent-instances.md`](../decisions/2026-08-09-attachments-target-agent-instances.md). The guard-native refinement below replaces that record's retention-token mechanism without changing its attachment, single-flight boot, or shared-instance conclusions. Zero-guard idle periods, always-on, multi-agent, and ephemeral policies remain future work.

## Decisions, reasons, and tradeoffs

**Prepared dispatch over feature payload routing.** The host binds each physical connection to one attachment and asks it to prepare each opaque canonical request. The attachment contributes immutable guarded authority, while the workspace channel table contributes the handler, schemas, and log policy. The host then logs and invokes that prepared dispatch. Closing the attachment does not cancel accepted work. An accepted retarget after closure guards the requested instance only for that operation and leaves the closed attachment unchanged. This keeps transport and tenancy fields out of feature contracts and keeps static policy at workspace scope. Tradeoff: every accepted request has one short-lived disposable dispatch object.

**One primary instance per session as policy.** The first server shares one agent across every connection on a workspace-session pair. This gives coherent multi-device behavior and prevents concurrent agents from writing one branch before branch semantics exist. Tradeoff: users cannot run two independent agents on one session until the target model gains agent and ref selectors.

**Attach is separate from boot.** A connection attaches to an instance. The runtime boots one first when none exists. Boot provisions the instance, its private manager, and its restored state without forcing the lazy Pi runtime to boot. The instance supervisor owns both boot admission and target-guard acquisition, while the attachment remains the connection capability. Tradeoff: attach can await provisioning even though releasing its later guard is synchronous.

**Acquire before release on session switch.** A failed target boot leaves the connection on its accepted old instance and URL. After acquisition, the attachment replaces its target guard and releases the old guard immediately. Old operations continue under independent guards. Tradeoff: both instances can remain guarded briefly during the switch, and session-scoped event delivery must already prevent old activity from reaching the new target.

**Guards and single-flight from the start.** The instance supervisor models the lifecycle that concurrent browser connections require instead of hiding one selected-session singleton behind transport broadcast. Attachments, requests, turns, reload, and background work use the same disposable guard rule. Tradeoff: every asynchronous instance use must make its lifetime protection explicit.

**Turns guard their own safe boundary.** A started turn derives a guard before detached work begins and releases it after the final commit-safe boundary. Disconnecting releases only the attachment guard, so the turn can finish with no observing client. The supervisor needs no release operation that waits for `agent_end`; zero guards is already a safe teardown point. Final branch-scoped feature state commits at actual teardown rather than whenever one attachment leaves. Tradeoff: detached operations must release their guards reliably in `finally` paths.

**Host-authored work through guards.** Background work acquires an instance guard through the same runtime-owned supervisor as client attachments without pretending to be a connection. A guard provides lifetime safety but no connection routing or event subscription. Tradeoff: the transcript model must eventually distinguish message authors without coupling authorship to connections.

## Log

### 2026-08-08: session and agent host model

Worked out the connection and agent model over the multi-client discussion. Connections are URL-scoped. Session switches re-target in place like a React SPA. Workspace switches are new connections because the client rebuilds. Agents are shared, refcounted, and keyed by workspace-session. First request coalesces the boot promise. Zero connections starts a tunable TTL, with teardown at turn boundaries. Always-on agents plus host-authored messages cover cron and background work. Multi-agent semantics, ref heads, and ephemeral agents are future unlocks recorded in the split plan.

### 2026-08-09: attachments, primary instances, and safe teardown

Separated durable sessions, live agent instances, and connection attachments. The earlier workspace-session key remains the first primary-instance resolution policy, but it no longer defines all future agent identity. This leaves a place for branch-bound and ephemeral agents without pretending their coordination semantics are already understood.

Moved attach, retarget, single-flight boot, and agent teardown into each workspace runtime's agent instance manager. The host resolves the workspace and owns the physical connection, while the runtime owns which shared agent the attachment reaches. Session switches acquire the target before releasing the old instance and update the URL only after success.

Settled the lifecycle vocabulary. An attachment is a connection's owned, retargetable handle. Boot is the discrete provisioning step, separate from attach. Bind remains creation-time wiring only. An instance stays retained while attachments hold it and tears down at a safe boundary. Recorded workspace, session, and agent-instance event scopes as the initial model for multi-device delivery without transport broadcast.

### 2026-08-12: explicit instance identity deferred

Removed explicit agent-instance ids and event scope from the H4 contract. Workspace and durable session scope cover H4 routing, future branch identity covers branch-bound application routing, and manager object identity covers lifecycle races. Ephemeral execution can introduce an explicit identity when it has a concrete routing or stale-work consumer.

### 2026-08-13: dispatch, lazy Pi runtimes, and non-blocking retarget

Settled one canonical request-dispatch path from a physical connection through its attachment into the workspace channel table. Ordinary and substrate requests share one handler model. Attachment authority remains outside feature payloads. An agent instance owns its private session manager and restored state before its lazy Pi runtime boots. Retarget acquires the target instance and returns without waiting for an old running turn. The old instance checks its current retention count at the safe boundary. Session-scoped delivery is therefore required when this lifecycle first becomes live.

Removed the workspace-global fallback preference. Browser workspace-only routes resolve the newest valid session and then replace the workspace-only URL with its canonical URL. Electron restores each local window or tab's target from its own host profile.

### 2026-08-14: guard-native agent lifetimes

Replaced retention tokens and release-triggered safe-boundary waits with `AgentInstanceGuard` capabilities issued by an `AgentInstanceSupervisor`. Attachments own replaceable target guards. Prepared dispatch retains an immutable operation guard, and a started turn owns another guard through its final safe boundary. Releasing any guard is immediate and cannot promise instance disposal. Zero guards only admits supervisor teardown policy. This makes retarget non-blocking by construction and gives reload and future background work the same explicit lifetime rule.

### 2026-08-14: one attachment object

Collapsed the proposed host attachment façade and runtime attachment delegate into one runtime-created `Attachment`. It owns target authority, guard mechanics, event listeners, and disposal. The supervised workspace receives only a private delivery closure alongside creation, preserving host-owned receiver selection without duplicating attachment identity or lifetime.

### 2026-08-14: prepared dispatch joins authority and channel policy

Kept log policy on the workspace channel registration rather than exposing it as attachment state. Request acceptance combines a retained operation guard and immutable attachment authority with the registered handler, schemas, and log policy in one disposable `PreparedDispatch`. The host uses that policy to record the physical crossing, then invokes the prepared handler and sends the response. Disposing or retargeting the attachment cannot revoke already accepted work. When accepted work requests a retarget after attachment closure, it acquires a guard for the requested instance without installing that guard on the closed attachment.
