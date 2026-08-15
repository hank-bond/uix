---
summary: "Settled: an agent instance owns one session-branch viewpoint and lazy Pi runtime. The instance supervisor owns its lifecycle, while disposable guards protect every attachment, turn, and asynchronous use from teardown."
kind: explanation
status: resolved
---

# Agent instance state

## Purpose

The host and runtime split lets several agent instances share one workspace runtime. This note separates the durable session, the agent instance, its lazy Pi runtime, and the branch-restored feature state that the instance needs.

## Settled model

A _session_ is the durable conversation tree. An _agent instance_ is the lifecycle owner for one Pi execution at a session-branch viewpoint. It immediately owns one immutable `SessionTarget`, one independent `SessionManager`, and its _agent instance state_. The instance boots its Pi `AgentSessionRuntime` lazily. Session history and restored state are therefore available before the Pi runtime boots. After boot, the instance can be idle or running. Agent instance state is the working state at the viewpoint: the turn-state projection, agent context, Pi installation, and feature buffers that belong to the branch. Connections on one primary instance share that state, while instances on different sessions keep independent state.

The workspace runtime keeps the accepted feature composition, settings, stores, and contribution definitions. Each agent instance instantiates the stateful feature parts for its branch rather than sharing one workspace-global projection. The primary-instance policy gives each live session one owned manager. Under branch coordination, every branch-bound agent owns a private manager, while the session coordinator owns the complete graph and no long-lived manager.

The lifecycle vocabulary is settled:

- `attach` establishes a connection's owned, retargetable handle on an agent instance.
- `create` constructs an agent instance with its private manager and restored state when none exists for the target. The connection then attaches to it.
- `boot` starts the created instance's lazy Pi runtime when execution first requires it.
- `bind` remains creation-time wiring only and does not describe the connection-to-instance relationship.
- The `AgentInstanceSupervisor` owns keyed instance identity, single-flight creation, guard admission, lifetime policy, and teardown. It is not on the ordinary agent-operation hot path.
- An `AgentInstanceGuard` is a disposable teardown veto. Attachments, turns, background work, reload, and any other asynchronous instance use hold guards for their complete use. A guard can provide internal access to its instance but does not become an operational handle.
- A live guard can synchronously retain another independently releasable guard on the same managed instance. Retaining after release fails, and releasing either guard does not affect the other.
- Releasing one or every guard removes protection without promising teardown. Zero guards makes an instance eligible for supervisor policy; the first policy tears down an eligible idle instance immediately.
- A running turn owns a guard until its final safe boundary. The turn therefore explains why a disconnected instance remains live instead of requiring the final attachment release to await `agent_end`.
- Concurrent attaches share one instance creation through single-flight.

The canonical URL names one attachment's target. A browser workspace-only route resolves the newest valid session and then replaces itself with that canonical URL. Electron restores each local window or tab's canonical target from its own host profile. Neither path creates a workspace-global active session.

The controlled vocabulary lives in the [`lexicon`](../architecture/conventions/lexicon/AGENTS.md). [`agent-session-routing.md`](./agent-session-routing.md) owns the routing and lifecycle behavior.

## Log

### 2026-08-09: execution scopes decouple feature state from workspace

Separated durable sessions, live agents, and branch-restored feature working state. The workspace runtime owns one feature composition and workspace scope. Each live agent owns the turn-state projection, agent context, Pi installation, and branch-dependent buffers.

### 2026-08-09: vocabulary settled

Locked `agent instance` and `agent instance state` as the terms. The scope is the branch of the session, not the session itself: with two agents sharing one session later, each sits at its own branch viewpoint. Chose `attach` over `bind` because binding creates the artifact at creation time, while attaching is a later step over two independently existing participants. Chose `boot` as the discrete provisioning step, `single-flight` for shared boots, `retain` for the retention relationship, and `teardown` for safe lifecycle end. Retired `mount`, `lease`, `endpoint`, `port`, `coalesce`, and `retire` in the relevant senses.

### 2026-08-13: agent ownership precedes lazy Pi execution

Clarified that an agent instance owns one Pi execution, but its Pi runtime can remain unbooted. The instance owns its session manager and branch-restored state as soon as the instance boots, so attachments can read durable session state before model-bearing Pi services are needed. A running agent always has a booted Pi runtime. The session coordinator owns the complete durable graph but no long-lived manager. Every branch-bound agent retains its own mutable manager.

### 2026-08-14: guards make instance use explicit

Replaced the retention-token model with disposable `AgentInstanceGuard` capabilities issued by an `AgentInstanceSupervisor`. The supervisor remains the sole instance owner. Every asynchronous use holds a guard, and the running turn itself holds one through its safe boundary. Releasing a guard is immediate and only removes one teardown veto; zero guards permits supervisor policy but does not promise disposal. This makes attachments, detached turns, reload, and future background work use one visible lifetime rule.

### 2026-08-14: creation precedes Pi runtime boot

Refined the earlier boot term. Agent instance creation establishes the manager and restored state under the supervisor's exclusive in-flight ownership. The instance boots its Pi runtime only when execution first needs it. A guard is issued before the created instance reaches any consumer.
