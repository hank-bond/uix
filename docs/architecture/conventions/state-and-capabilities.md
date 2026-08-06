---
summary: "Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners."
kind: reference
read_when: "Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state."
---

# State and capabilities

The [state.single-authority](./rules/state.single-authority.md) and [state.capability-handles](./rules/state.capability-handles.md) rules state the invariants. This file defines the vocabulary and patterns.

## State ownership and asynchronous coordination

**Terminology:** A _generation_ is a replaceable object and lifetime graph, such as a manifest or Pi runtime generation. Feature activation produces an _activated feature instance_. The workspace owns those instances as its _active feature composition_, and reload creates replacements.

A _version_ is a monotonic scalar that orders asynchronous work and rejects stale results. An _id_ or _token_ correlates one operation without implying order. Do not call an ordering counter or activated feature instance a generation.

| Mechanism | Role | Constraint |
| --- | --- | --- |
| Plain field, React state, registry, buffer, or store | Current authority at its layer | Replaced at one explicit generation boundary. |
| Promise slot | Shared in-flight operation | Cleared when the operation settles. It is not mutable current state. |
| `DisposableBag` or React effect cleanup | Deterministic lifetime | Owns teardown only, never lookup or current-state selection. |
| `WeakMap` | Metadata or memo derived from an externally owned object | Use only when the value needs no deterministic cleanup and entries need no enumeration. |
| `Map` / `Set` | Owned live index or temporary algorithmic index | If it is a registry, expose register and disposal semantics rather than a raw collection. |
| Cache / projection | Regenerable derived data | State the invalidation or latest-generation commit rule. |
| Store / durable settings / Pi session entries | Durable authority | Runtime collections and renderer state remain rebuildable from it. |

A settled promise may own a genuinely write-once value when it is immutable for the owner's entire lifetime and every consumer is asynchronous. Once a value supports replacement, synchronous reads, reload, or generation-specific cleanup, use an explicit current value plus an in-flight operation.

Asynchronous projections can need two independent protections. Lifetime cancellation rejects results after owner disposal. A monotonic request version rejects an older request that resolves later.

A Boolean `alive` flag provides only lifetime cancellation. Name each counter for what it orders:

- `<operation>RequestVersion` orders asynchronous attempts. Increment it on request start and cancellation-only invalidation.
- `<state>Version` records committed semantic state. Increment it only when that state changes.
- `<artifact>BuildVersion` orders candidate builds.

A request may capture request and state versions when either change makes the result stale. Backend builders commit only a current build. Serialize instead when every requested transition must run.

Layer-specific cleanup stays idiomatic. Main-process capabilities use lifetime-named bags. Renderer subscriptions and requests use React effect cleanup with latest-request guards.

Do not introduce a generic lazy-cell abstraction until multiple consumers need identical mechanics. Explicit fields make ownership and replacement visible.

## Central ownership, capability handles

Handles hide by construction rather than enforcement. Code holding only `get(key)` cannot accidentally couple to another owner's slice. A module's reach remains visible from the handles in its context.

Only the handle crosses the boundary, so later process separation becomes a transport swap instead of a redesign. This convention defines a trust model, not a sandbox. Iframe containment remains responsible for untrusted code.

Two corollaries:

- **The owner API may remain open:** Trusted composition code can call `registry.get(scopeId, key)`. Narrow access when minting the smallest handle that serves each consumer.
- **Handles resolve lazily by id, not by captured object reference**, wherever the owner's contents can be replaced underneath (reload). A handle minted before a reload keeps working after it. An unknown target fails on first _use_, not at mint time.
