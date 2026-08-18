---
summary: "Build flat facet lifecycles, per-Agent feature instances, isolated primary-session Canvas checkouts, and selected-view I/O without implementing multi-branch Agents."
---

# Agent feature instances and viewpoint state

## Status and relationship to the host split

This plan begins after the basic web host vertical. The initial server may keep one visible session target per page, block session switching while its Agent runs, and make no background-run or reconnect guarantee. Those product limits avoid exposing the current shared Canvas state across concurrent session viewpoints.

The [Electron and server host split](./electron-server-split.md) proves shared clients and two concrete hosts first. This plan then removes the temporary single-session restrictions for both hosts. The remaining cancellation inventory lives in [runtime operation hardening](./runtime-operation-hardening.md).

## Settled architecture

A feature remains one manifest-selected source, admission, and reload unit. Its optional facets are flat factories. The substrate privately schedules each facet across three operation phases:

1. Workspace facet registration.
2. Agent facet instantiation and restoration.
3. Pi installation when the Agent runtime boots.

Workspace and Agent contexts are disjoint bumper lanes. Workspace context extensions reach only workspace facets. Each Agent viewpoint receives a fresh feature context containing narrow scoped capabilities. It receives no workspace context extension, mutable repository owner, or sibling Agent state.

Facet operations fail independently where the downstream integration permits. Successful siblings remain live. Each operation retains structured feature, facet, phase, and original-error identity for tests and later diagnostics. Full report transport and recovery UX remain in the [agent-assisted runtime recovery backlog](./backlog.md).

The workspace owns shared repositories and immutable versions. One session-branch viewpoint owns each mutable checkout head. An `AgentInstance` owns only the live feature projections and scoped capabilities operating against that viewpoint.

## Review units

### A1: Flat facet factories and scoped Agent feature instances

Replace aggregate `contribute()` with flat optional facet factories. Authors describe capabilities without selecting their registration or installation schedule. Keep one feature entry as the source and reload boundary even for Agent-only or workspace-only features.

Add separate workspace-context and Agent-instance-context factories. Agent facet types cannot access workspace context extensions. Agent contexts contain only read-only configuration, logging, and substrate-issued viewpoint capabilities. Trusted code can still create module globals deliberately, but the supported path never requires shared mutable Agent state.

Model today's homogeneous Agent as one explicit internal `AgentCompositionDefinition`. It selects every successfully admitted Agent facet in manifest order. Add no named-Agent manifest syntax, Agent key, branch behavior, or wire field.

Move mutable Agent registries and facet bags under `AgentInstance`. Instantiate tools, overrides, prompt sections, skills, turn state, Agent context, and instance channels per Agent. Install their Pi-facing pieces independently where Pi permits. Preserve structured internal outcomes without building a report registry or channel.

Migrate first-party features and workspace templates to the flat contract. Canvas may remain a known transitional user of shared `DocumentStore.current`. Keep the renderer's running-session transition gate.

**Review gate:** Two Agent instances receive disjoint contexts, registries, mutable contribution state, and facet lifetimes. Agent-only features need no empty workspace contribution. One failed facet leaves successful siblings live and retains exact operation identity.

### A2: Viewpoint-scoped managed-document checkouts

Replace Canvas's workspace-global current bytes with a checkout issued for one `SessionTarget` viewpoint. The workspace document repository owns immutable content-plus-metadata versions and checkout creation. The viewpoint owns its mutable resource-to-version head map.

H4 still has one primary branch per session. Key the first implementation by that accepted target while preserving the complete `SessionTarget` seam. Do not expose session or branch identity in Canvas document ids, feature payloads, or checkout operations.

A successful mutation writes one immutable content-and-anchor version and advances only that checkout's head. Run-boundary turn state records the current head map. Intermediate versions remain storage history rather than rollback nodes. Normal teardown commits final refs. Crash recovery never silently replaces a newer dirty checkout with an older checkpoint.

Move `CanvasDocumentBuffer`, anchors, tools, turn-state callbacks, and model-visible context into Canvas's Agent-instance context. Begin by settling the checkout persistence API and migration of legacy workspace-global current bytes. Preserve existing immutable versions and turn-state refs. Defer retention and garbage collection.

**Review gate:** Two primary session targets mutate, snapshot, restore, dispose, and recreate independent Canvas checkouts over one shared repository. Their versions and anchors never cross.

### A3: Selected-view Canvas I/O and overlap cutover

Add the instance-bound feature channel path. Workspace registration owns canonical channel contracts and validation. Prepared attachment dispatch selects one Agent instance and invokes that instance's handler table. Feature requests contain no tenancy or routing fields.

Canvas view resolution returns immutable version identity for the selected checkout. Workspace resources serve that version without an Agent guard. Human writeback advances the selected checkout. Agent changes publish session-scoped invalidation to matching attachments.

Treat Canvas prompt actions as one accepted operation. Writeback and prompt submission use the same guarded Agent instance. Retarget cannot apply the state mutation to one session and start another session's run.

Update Canvas when the accepted session-selection version changes. Reject stale iframe messages and present the selected immutable view. Prove that an old guarded turn on session A can overlap new work on session B. Remove the renderer's running-session transition gate only after this suite passes.

**Review gate:** Two sessions retain independent Canvas content, anchors, turn state, context, tools, writeback, resources, and events. Retarget stays non-blocking, and stale frames cannot write into the new target.

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
