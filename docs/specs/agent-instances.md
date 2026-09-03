---
summary: "An Agent instance runs one session branch, restores its feature state before use, and starts Pi only when needed."
kind: reference
status: draft
---

# Agent instances

## Contract

An _Agent instance_ owns one live Pi execution at an Agent viewpoint. It also owns that viewpoint's session manager, current transcript view, and Agent feature instances.

The Agent-instance supervisor creates and destroys instances. It issues guards to attachments, requests, turns, reload operations, and headless jobs.

## Dependencies

This specification depends on [`agent-viewpoints.md`](./agent-viewpoints.md), [`shared-live-object-guards.md`](./shared-live-object-guards.md), and [`feature-turn-state.md`](./feature-turn-state.md).

## Boundary

The Agent instance owns live execution and mutable state for one viewpoint. The supervisor creates, retains, and tears down instances by key. An attachment holds a guard for its target instance but does not own that instance. Pi runs the model after the instance starts its Pi runtime.

## Requirements

- Instance creation **must** create its session manager and Agent feature instances.
- Instance creation **must** restore branch state before exposing the instance to a caller.
- Creating or attaching to an instance **must not** start Pi model services.
- An operation that needs Pi **must** start the Pi runtime lazily.
- Concurrent start requests **must** share one Pi startup attempt.
- Concurrent acquisitions for one target **must** share one instance creation attempt.
- Each successful acquisition **must** return an independent guard for that exact live instance.
- Every asynchronous operation **must** hold a guard until it can no longer access the instance.
- A running Agent turn **must** hold its own guard.
- Disconnecting every attachment **must not** end a guarded turn.
- One primary Agent instance **must** run at most one turn at a time. A competing prompt **may** fail as busy instead of entering a queue.
- An instance with no guards **may** be torn down according to supervisor policy.
- Teardown **must** finish active persistence and restoration work before it disposes feature and Pi resources.
- Concurrent teardown requests **must** share one teardown attempt.
- A headless job **must** acquire an Agent-instance guard directly instead of creating an attachment.
- Reloading or replacing an instance **must not** force a client to reconnect when it continues to target the same viewpoint.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Concurrent callers share instance creation and receive separate guards.
2. Session and feature state are available before Pi starts.
3. Concurrent Pi operations share one startup attempt.
4. A running turn continues after every attachment closes.
5. A second prompt receives the defined busy behavior.
6. Teardown starts only after all guards are disposed and active persistence and restoration work finishes.

## Degrees of freedom

A conforming implementation may choose its manager types, Pi adapter, idle-retention policy, and whether viewpoint changes reload or replace the instance.

## Open questions

- What supervisor key identifies concurrent branch Agents in one session?
- Which failures allow restart, and which require instance replacement?
- How are long-lived headless Agents configured and inspected?
