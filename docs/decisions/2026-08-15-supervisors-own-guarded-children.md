---
summary: "Supervisors exclusively own keyed shared live objects and issue independent guards that provide operations while withholding teardown authority."
kind: explanation
status: accepted
---

# Supervisors own guarded children

## Context

Workspaces and agent instances are live objects used independently by connections, accepted requests, running turns, reload, and background work. Teardown must not invalidate active use, but those users must not receive authority to destroy the shared object.

Earlier forms mixed these concerns through retention tokens, narrowed handle interfaces, method-level disposed assertions, and parallel `release()` or `dispose()` methods. Anonymous counts could detect zero holders but could not identify leaked authority. Disposal-triggered safe-boundary waits also made attachment retarget depend on unrelated running work.

## Decision

A supervisor is the sole lifecycle owner for each keyed shared live child. It retains a private `XOwnership` capability and issues an independent `Guard<Value>` to each user. The ordinary value exposes domain operations, while the ownership capability adds `Disposable` or `AsyncDisposable` teardown authority.

A guard exposes only its protected operational value, `retain()`, and `Symbol.dispose`. Disposing it synchronously and idempotently removes one teardown veto. It never disposes the child or promises that teardown has completed. Zero guards only admits the supervisor's policy.

The supervisor tracks exact guard ids and diagnostic origins. Parent disposal stops admission, joins in-flight child creation, waits for every guard to drain, and then invokes the ownership capability's disposal protocol. Guard snapshots are detached diagnostics and expose no live authority.

UIX-owned lifecycle capabilities use the ECMAScript disposal protocols without parallel named cleanup methods. Lexical holders use `using` or `await using`. Longer-lived holders store capabilities and dispose them through their own lifetime protocol. External APIs retain their native cleanup contracts.

Nested supervision remains explicit. A child guard does not implicitly retain its parent. Callers hold the workspace and agent-instance capabilities required for their complete operation, so each supervisor can account for its own holders.

Cleanup duration is independent from guarded use. Disposable bags aggregate exclusively owned capabilities. Supervisors coordinate independent teardown vetoes around an exclusively owned child. Either form may require asynchronous cleanup.

## Consequences

- Domain APIs do not duplicate lifecycle subsets or repeat disposed assertions when a live guard structurally guarantees validity.
- Attachments, prepared requests, turns, reload, visitation, and background work account for their asynchronous use with guards.
- Retarget and disconnect remain synchronous because detached work owns separate protection.
- Exact guard maps support idempotence, leak diagnostics, and deterministic parent drain.
- `visitLiveInstances()` keeps temporary guards private and gives visitors only operational values.
- Workspace and agent-instance supervisors compose without hidden parent retention.
- Exclusive listeners, registrations, adapters, and unique children continue to use ordinary lifetime bags rather than guards.

## Design record

[`shared-live-object-lifetimes.md`](../design/shared-live-object-lifetimes.md) preserves the rejected paths and the reasoning behind this conclusion.
