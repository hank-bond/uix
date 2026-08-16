---
summary: "Supervisors exclusively own keyed live objects while independent guards let several holders prevent teardown without receiving lifecycle authority."
kind: explanation
status: resolved
---

# Shared live object lifetimes

## Current synthesis

A shared live object has one lifecycle owner and potentially many independent users. A supervisor owns each keyed child through a private ownership capability. Every user receives an independently disposable `Guard<Value>` that provides the operational domain value without exposing teardown authority.

A guard is one teardown veto, not partial ownership, an exclusive lease, or an event subscription. Acquisition and `retain()` mint separate guards. Disposing a guard relinquishes only that holder's veto. Zero guards admits the supervisor's lifetime policy but does not promise immediate teardown.

The supervisor tracks each live guard by an internal id and diagnostic origin. Exact entries make duplicate disposal harmless and support point-in-time leak snapshots. During parent disposal, the supervisor stops admission, joins in-flight creation, waits for every guard entry to disappear, and then disposes its private ownership capability.

Operational and lifecycle authority remain separate when a value crosses its owner boundary. `Workspace` and `AgentInstance` expose domain operations. `WorkspaceOwnership` and `AgentInstanceOwnership` add lifecycle authority and remain private to their supervisors. An exclusive child used only by its owner can implement a disposal protocol directly without an artificial ownership split.

Nested supervisors do not imply hidden lifetime retention. An agent-instance guard does not protect its enclosing workspace. A physical connection owns a workspace guard and an attachment as sibling capabilities. Accepted work retains the workspace authority needed at ingress, while prepared dispatch owns its selected agent-instance operation guard. Each supervisor can therefore account for and drain its own users.

Cleanup duration is independent from sharing. `DisposableBag` and `AsyncDisposableBag` aggregate exclusively owned capabilities. A supervisor coordinates independent guards around one exclusively owned child. Either exclusive or supervised teardown can be synchronous or asynchronous.

The normative mechanics live in [`lifetimes.md`](../architecture/conventions/lifetimes.md). The accepted conclusion lives in [`2026-08-15-supervisors-own-guarded-children.md`](../decisions/2026-08-15-supervisors-own-guarded-children.md).

## Log

### 2026-08-14: retention tokens and disposal waits were too implicit

The first model counted attachment retention and delayed final disposal until a running turn reached a safe boundary. This tied retarget latency to old work and made detached operations exceptional. A caller could hold retention without carrying the protected operational value.

The replacement makes each asynchronous use visible as a guard. Attachments hold target guards, prepared requests hold operation guards, and running turns hold guards through their final safe boundary. Retarget can dispose the old attachment guard immediately because old work explains its own lifetime.

### 2026-08-15: narrowed handles and method assertions duplicated the wrong boundary

One refinement attempted to expose restricted handle interfaces and add disposed assertions to every domain operation. This duplicated each domain API and treated invalid use as a method-level concern.

The guard already establishes the structural lifetime boundary. Teardown cannot begin while a live guard exists, so operations reachable only through that guard need no repeated assertion. The ordinary domain type now carries operations, while a private `XOwnership` capability adds lifecycle authority. This preserves least authority without maintaining parallel operational interfaces.

### 2026-08-15: one disposal protocol replaced release aliases

An intermediate guard API exposed `release()` beside `Symbol.dispose`. Ownership types also exposed named `dispose()` methods beside disposal symbols. Both forms created two public cleanup paths for one lifecycle transition and weakened `using` as the standard lexical form.

UIX-owned guards and ownership capabilities now expose only the ECMAScript disposal protocols. Guard disposal relinquishes protection. Ownership disposal tears down the domain object. Pi's named runtime cleanup remains because that contract is external to UIX.

### 2026-08-15: exact guard maps support diagnosis and least authority

A count can answer whether any holder remains, but it cannot identify leaked holders or remove one exact issuance. Supervisors therefore retain an internal map from guard id to origin. Each guard closes over its own id and deletes exactly that entry once.

The map remains supervisor state and never becomes shared ownership. `getGuardSnapshot()` returns detached diagnostic metadata without guard authority. Likewise, `visitLiveInstances()` owns temporary guards internally and passes only operational `AgentInstance` values to visitors.

### 2026-08-15: nested supervision remains explicit

Allowing an agent-instance guard to retain its workspace would hide authority across supervision levels. It would also make workspace drain depend on capabilities that the workspace supervisor did not issue to that operation.

The accepted model keeps the levels independent. Connections retain workspace guards beside their attachments. Request ingress retains workspace authority, and prepared dispatch retains agent-instance authority. Child use never silently extends the parent lifetime.

### 2026-08-15: asynchronous cleanup is not guard bookkeeping

The asynchronous disposal protocol was initially easy to conflate with waiting for shared holders. They are separate axes. Asynchronous cleanup means teardown returns a promise, regardless of whether the resource has one user or many guarded users.

An async bag is a LIFO aggregate owner. It contains no guard ids, counters, origins, or zero-waiters. A supervisor is the component that tracks guards and waits for them to drain. The transitional Electron host directly owns one workspace runtime through an async bag. H7 replaces that direct path with `WorkspaceSupervisor` when Electron gains canonical workspace-session targets.
