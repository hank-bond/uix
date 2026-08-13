---
summary: "A connection attaches to one agent instance at a session-branch viewpoint. Boots are single-flight and discrete from attach, an instance stays retained while attachments hold it and tears down at a safe boundary, and each instance owns its state at its viewpoint."
kind: explanation
status: resolved
---

# Agent and session routing

## Current synthesis

One workspace runtime owns one workspace. A _session_ is a durable conversation tree. An _agent instance_ is one live agent execution attached to a session at a branch viewpoint. An _attachment_ is a connection's owned, retargetable handle on one agent instance.

The first server resolves each session to one primary agent instance. This is an initial resolution policy, not a permanent identity rule that equates one session with one possible agent. Two connections attached to the same workspace-session pair share the same agent instance and receive its events. A prompt from a laptop therefore updates another live view on a phone, and a reconnected view restores from the durable session snapshot.

The host resolves the workspace from the canonical connection URL, then asks that workspace runtime to create an attachment for the requested session. The runtime's agent instance manager owns the session-to-primary-instance policy, single-flight boots, retention, and safe teardown. Concurrent cold attaches await one shared boot promise. A later attach to a live instance is warm.

`attach` is the connection's binding step. `boot` is the discrete provisioning step: when no instance is live for the target, the runtime boots one first, then the connection attaches. The two steps are separate concerns. `bind` remains creation-time wiring only and does not describe the connection-to-instance relationship.

A session switch retargets one attachment without rebuilding the workspace composition. The runtime acquires the target instance first and releases the old one only after the new attach succeeds. Other attachments on the old instance remain there, and their feature state does not commit or restore merely because one peer leaves. The client updates the canonical session URL after the switch response. A reconnect or direct page load reconstructs the attachment from that URL. A workspace switch is a host navigation because the feature composition may change. [`host-workspace-runtime-boundaries.md`](./host-workspace-runtime-boundaries.md) owns host, supervisor, launcher, and URL boundaries.

The canonical session URL is authoritative for one attachment. A workspace can retain a fallback session choice for the workspace-only route, recents, and launcher convenience, but that value does not become a global active session or retarget other attachments.

The first teardown policy keeps the lifecycle explicit and small. An agent instance stays retained while at least one attachment holds it. When the last attachment leaves, an idle instance tears down immediately; a running instance finishes its turn and tears down at the safe boundary. A later retention policy can add a warm-retention period, user tuning, or always-on instances without changing attachment semantics. A new attach before teardown cancels the pending teardown. A primary agent instance accepts one active turn; a competing prompt can initially reject as busy rather than introducing a hidden queue.

Runtime events carry two delivery scopes:

- Workspace events reach every attachment in the workspace.
- Session events reach attachments viewing that durable session.

H4 does not expose an ephemeral agent-instance id or event scope. Session and future branch identity cover application routing, while the manager uses object identity for lifecycle races. Ephemeral call-and-response agents may introduce explicit instance identity later when their routing or stale-work rejection establishes a concrete requirement.

Agent instance state follows the live execution viewpoint rather than the whole workspace. The workspace runtime owns one accepted feature composition, workspace settings, stores, and contribution definitions. Each agent instance owns its state at its session-branch viewpoint: the turn-state projection, agent context, Pi installation, and branch-dependent feature buffers. Connections on one primary instance share that state, while instances on different sessions cannot overwrite each other's restored state. [`agent-instance-state.md`](./agent-instance-state.md) records the vocabulary settlement.

The host can later acquire an agent instance without a client connection to author cron-style or background messages. Such work retains the instance explicitly rather than pretending to be a browser connection.

Distilled into [`2026-08-09-attachments-target-agent-instances.md`](../decisions/2026-08-09-attachments-target-agent-instances.md). Warm-retention, always-on, multi-agent, and ephemeral policies remain future work.

## Decisions, reasons, and tradeoffs

**Runtime attachment context over feature payload routing.** The host stamps workspace and connection context outside typed feature payloads. The workspace runtime resolves session and agent-instance routing through the attachment. This keeps transport and tenancy fields out of feature contracts. Tradeoff: the host and runtime need one explicit attachment boundary.

**One primary instance per session as policy.** The first server shares one agent across every connection on a workspace-session pair. This gives coherent multi-device behavior and prevents concurrent agents from writing one branch before branch semantics exist. Tradeoff: users cannot run two independent agents on one session until the target model gains agent and ref selectors.

**Attach is separate from boot.** A connection attaches to an instance; the runtime boots one first when none is live. Boot is provisioning, attach is binding, and the two steps stay discrete. Tradeoff: the manager owns two distinct operations instead of one combined acquire.

**Acquire before release on session switch.** A failed target boot leaves the connection on its accepted old instance and URL. Tradeoff: both instances can remain retained briefly during a switch.

**Retention and single-flight from the start.** The manager models the lifecycle that concurrent browser connections require instead of hiding one selected-session singleton behind transport broadcast. Tradeoff: the first server implements reference tracking even before it adds a retention period.

**Safe-boundary teardown.** Zero attachments stop retaining an idle agent, but a live turn finishes and persists before teardown. Final branch-scoped feature state commits at teardown rather than whenever one attachment leaves. A retention policy buys warmth rather than correctness and can follow without changing ownership. Tradeoff: a disconnected turn can continue with no observing client.

**Host-authored work through explicit retention.** Background work attaches to the same runtime-owned instance manager as client work. Tradeoff: the transcript model must eventually distinguish message authors without coupling authorship to connections.

## Log

### 2026-08-08: session and agent host model

Worked out the connection and agent model over the multi-client discussion. Connections are URL-scoped. Session switches re-target in place like a React SPA. Workspace switches are new connections because the client rebuilds. Agents are shared, refcounted, and keyed by workspace-session. First request coalesces the boot promise. Zero connections starts a tunable TTL, with teardown at turn boundaries. Always-on agents plus host-authored messages cover cron and background work. Multi-agent semantics, ref heads, and ephemeral agents are future unlocks recorded in the split plan.

### 2026-08-09: attachments, primary instances, and safe teardown

Separated durable sessions, live agent instances, and connection attachments. The earlier workspace-session key remains the first primary-instance resolution policy, but it no longer defines all future agent identity. This leaves a place for branch-bound and ephemeral agents without pretending their coordination semantics are already understood.

Moved attach, retarget, single-flight boot, and agent teardown into each workspace runtime's agent instance manager. The host resolves the workspace and owns the physical connection, while the runtime owns which shared agent the attachment reaches. Session switches acquire the target before releasing the old instance and update the URL only after success.

Settled the lifecycle vocabulary. An attachment is a connection's owned, retargetable handle. Boot is the discrete provisioning step, separate from attach. Bind remains creation-time wiring only. An instance stays retained while attachments hold it and tears down at a safe boundary. Recorded workspace, session, and agent-instance event scopes as the initial model for multi-device delivery without transport broadcast.

### 2026-08-12: explicit instance identity deferred

Removed explicit agent-instance ids and event scope from the H4 contract. Workspace and durable session scope cover H4 routing, future branch identity covers branch-bound application routing, and manager object identity covers lifecycle races. Ephemeral execution can introduce an explicit identity when it has a concrete routing or stale-work consumer.
