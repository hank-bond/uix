---
summary: "Rebase settings persistence onto worktree-owned immediate writes before resuming this deferred request-completion plan."
---

# Request completion and workspace settings persistence

## Status

Deferred and requires rebasing before implementation. [`feature-composition.md`](../docs/specs/feature-composition.md) establishes worktree-owned settings, last-write-wins manifest replacement, and immediate request-scoped persistence without a debounce or background persistence queue. The Workspace-global authority and revisioned persistence drain described below are superseded planning assumptions, not the implementation target. Preserve the request-completion distinction when revising this attempt.

The existing `uix.set_setting` handler acknowledges the live in-memory update before the manifest store's five-second debounced write. An explicit workspace reload can therefore promote disk state and discard an acknowledged setting change.

Browser-local presentation preferences follow [`browser-presentation-state.md`](../docs/specs/browser-presentation-state.md) instead. They are not application settings, and their optional persistence must not inherit this plan's manifest-write guarantees.

## Decisions

### Request completion models

Every channel request uses one of two models:

1. **Request-scoped completion.** The handler owns the operation through its declared completion boundary. Its one terminal response settles the client promise. `Type.Void()` acknowledges completed work and supplies backpressure. It never means that promised work was merely queued.
2. **Accepted independent operation.** The request transfers work to an owner whose lifetime is independent of the request or connection. Its terminal response explicitly reports acceptance and returns an operation identity plus initial status. Typed events report progress or status changes, while a query or snapshot recovers current and terminal state after missed events or reconnection. Acceptance occurs only after that owner and any promised recoverability exist.

Choose by ownership and recovery semantics, not expected duration. A request-scoped operation may take a long time. An independent operation may finish quickly. A completion event is not a second response to the accepted request.

A request's terminal response represents completion of every effect promised by its contract. Persistence is part of completion only when the operation promises persisted state.

### Workspace settings authority

Workspace settings are shared live state owned by one `WorkspaceRuntime`, independent of its Agent instances and physical connections.

- The active settings registry is authoritative within one active manifest generation.
- `get_setting` reads that live authority even while persistence is in flight.
- A mutation publishes `uix.setting_changed` immediately at workspace scope. Every attachment to the workspace receives it, regardless of selected session. A reconnected client reads the current value through `get_setting` if it missed an event.
- Startup and explicit workspace reload remain disk-hydration boundaries. They must be ordered against live persistence rather than silently choosing an older disk snapshot.
- Settings remain workspace-scoped. This work does not introduce connection-local or Agent-instance-local settings.

### Immediate persistence

Remove the intentional debounce. Use one revisioned, single-writer persistence drain for the active manifest generation:

1. A changed manifest location advances the live revision and starts the drain immediately when none is running.
2. The writer captures one current manifest snapshot and its covered revision, then performs the existing atomic temporary-file write and rename.
3. Successful persistence advances the persisted revision and settles request waiters through that revision.
4. A mutation arriving during a write remains live immediately. The writer repeats with the newer snapshot after the active write completes.
5. Multiple mutations already covered by one captured snapshot share that write. No timer delays persistence merely to create a batch.

A successful `set_setting` response means atomic replacement has completed through that mutation's revision. It does not promise file and directory `fsync` durability against sudden power loss. A later mutation may supersede an earlier value before persistence. Advancing persistence beyond the earlier revision then completes the earlier request. Every intermediate value need not appear on disk.

A failed write rejects the request waiters covered by that attempt, retains the live dirty state, and avoids an unbounded immediate retry loop. A later mutation, explicit reload, or graceful shutdown may retry the latest snapshot. The setting event remains a live-state event and is not redefined as a persistence-completion event.

### Reload and shutdown ordering

A manifest generation cannot be promoted from a disk read that raced a newer live revision. Reload waits for active persistence, stages disk, and verifies that the live revision stayed unchanged through the read. If it changed, reload discards that candidate and repeats after the writer catches up. Promotion follows the successful stability check without an asynchronous gap.

Therefore a setting mutation observed before a successful reload is persisted before disk wins at the new generation. A mutation after promotion belongs to that replacement generation. Failed persistence prevents reload from silently discarding the live change.

Graceful workspace shutdown stops request admission, lets accepted setting mutations reach their persistence boundary, and awaits the manifest drain before disposing the store. Abrupt process termination before a request succeeds remains outside the guarantee.

## Review units

### R0: Formal request-completion guidance

Add a `channels.request-completion` convention rule for the terminal-response invariant. Add channel guidance explaining request-scoped completion and accepted independent operations, including operation identity, events, reconnect-safe queryability, failure, and `Type.Void()` semantics. Update the channel how-to so its examples cannot imply that acknowledgement-only means queued work.

This unit defines contracts and examples only. It does not add a generic job registry or operation runtime.

**Review gate:** A reviewer can classify a proposed handler into one model and determine exactly when its response promise may settle. The guidance rejects both a void response that detaches promised work and an event-only independent operation with no recovery query.

### R1: Revisioned manifest persistence

Replace the manifest flush timer with one immediate single-writer drain. Keep current and persisted revisions explicit and associate persistence waiters with the revision each request must reach. Preserve atomic temporary-file replacement and dirty state after failure. Make `uix.set_setting` await the persistence boundary while preserving immediate registry mutation and workspace event publication.

Keep persistence ownership below the transport. WebSocket and Electron requests continue to share the same canonical handler and completion semantics.

**Review gate:** Focused tests prove that:

- a setting event reaches every attachment before persistence completes.
- the request promise remains pending until its covered atomic write completes.
- same-turn changes may share one write.
- a change arriving during an active write causes a later write and settles only its own revision waiters.
- all connections read the latest workspace-memory value while disk lags.
- write failure rejects covered requests, retains dirty live state, and permits a later retry.
- a no-op set resolves immediately only when the requested live state is already persisted.

### R2: Generation and lifetime coordination

Order workspace settings reload against the persistence revisions. Reject or restage every disk candidate that raced a live mutation. Never cancel a pending writer during promotion. Move manifest persistence into the workspace's awaited shutdown path. Feature cleanup and accepted requests then cannot leave an acknowledged write behind a synchronous store disposal.

Update source summaries and architecture-of-record statements that currently describe pending settings as intentionally discarded by disk-wins reload.

**Review gate:** Deterministic tests cover:

- set followed immediately by explicit reload.
- a set arriving while reload reads disk.
- rapid concurrent toggles followed by reload.
- graceful shutdown during an active write.
- persistence failure during reload or shutdown.
- reconnect and attachments targeting different sessions observing the same workspace setting.
- startup and a stable explicit reload still adopting valid external disk settings.

Run focused runtime, settings, host transport, and browser-client tests, then the full repository check.

## Boundaries

- No generic background-job implementation. R0 records the contract future jobs must follow.
- No debounce, rate limiter, or per-setting persistence policy.
- No connection-local, session-local, or Agent-instance-local setting scopes.
- No filesystem watcher, cross-process synchronization, merge protocol, or conflict detection for concurrent external manifest edits.
- No power-loss guarantee beyond successful atomic replacement as currently implemented.
- No compatibility path retaining acknowledgement-before-persistence behavior.
