---
summary: "Current authority, asynchronous work, cleanup, and caching remain separate while consumers receive narrowly scoped, lazily resolved capabilities instead of owners."
read_when: "Read before introducing mutable or asynchronous state, caches, state owners, replacement boundaries, or scoped access to owned state."
status: active
---

# State and capabilities

## State ownership and asynchronous coordination

**Rule.** Name one authority for current state and keep asynchronous work, cleanup, lookup, and caching separate from it.

**Terminology.** A **generation** is a real replaceable object/lifetime graph, such as a manifest or Pi runtime generation. Feature activation is a process that produces an **activated feature instance**; the workspace owns the current instances as its **active feature composition** and reload creates replacement instances. A **version** is a monotonic scalar that orders async work and rejects stale results (`requestVersion`, `buildVersion`). An **id** or **token** correlates one operation without implying order. Do not call an ordering counter or an activated feature instance a generation.

| Mechanism | Role | Constraint |
| --- | --- | --- |
| Plain field, React state, registry, buffer, or store | Current authority at its layer | Replaced at one explicit generation boundary. |
| Promise slot | Shared in-flight operation | Cleared when the operation settles; it is not mutable current state. |
| `DisposableBag` or React effect cleanup | Deterministic lifetime | Owns teardown only, never lookup or current-state selection. |
| `WeakMap` | Metadata or memo derived from an externally owned object | Use only when the value needs no deterministic cleanup and entries need no enumeration. |
| `Map` / `Set` | Owned live index or temporary algorithmic index | If it is a registry, expose register and disposal semantics rather than a raw collection. |
| Cache / projection | Regenerable derived data | State the invalidation or latest-generation commit rule. |
| Store / durable settings / Pi session entries | Durable authority | Runtime collections and renderer state remain rebuildable from it. |

For replaceable asynchronous state, keep the current value and shared operation distinct:

```ts
let current: Value | undefined;
let inFlightLoad: Promise<Value> | undefined;

function getValue(): Promise<Value> {
  if (current) return Promise.resolve(current);
  if (inFlightLoad) return inFlightLoad;

  const load: Promise<Value> = createValue()
    .then((value) => {
      current = value;
      return value;
    })
    .finally(() => {
      if (inFlightLoad === load) inFlightLoad = undefined;
    });
  inFlightLoad = load;
  return load;
}
```

A settled promise may own a genuinely write-once value when it is immutable for the owner's entire lifetime and every consumer is asynchronous. Once a value supports replacement, synchronous reads, reload, or generation-specific cleanup, use an explicit current value plus an in-flight operation.

Async projections need two independent protections where applicable: lifetime cancellation rejects results after their owner unmounts/disposes, while a monotonic request version rejects an older request that resolves after a newer one. A boolean `alive` flag provides only the first. Name the counter for what it orders: `<operation>RequestVersion` (or local `requestVersion` when only one operation exists) orders asynchronous attempts and increments both on start and cancellation-only invalidation; `<state>Version` records committed semantic state and increments only when that state changes; `<artifact>BuildVersion` orders candidate builds. A request may capture both a request version and a state version when either changing makes its result stale. Backend candidate builders likewise commit only if their build version is still current, or serialize operations when every requested transition must run.

Layer-specific cleanup stays idiomatic: main-process cleanup capabilities go into lifetime-named bags; renderer subscriptions and requests use React effect cleanup plus latest-request guards. Do not introduce a generic lazy-cell abstraction until multiple consumers need identical mechanics—the explicit fields make ownership and replacement visible.

## Central ownership, capability handles

**Rule.** State lives in one central owner (a store or registry); consumers never get the owner itself. They get a **handle**: a small object of functions closed over exactly the slice they may touch, minted by the owner (`forX(id)`, an accessor returning a location, an owner-scoped factory). A handle's method signatures carry no addressing parameter — the closure already chose the target.

**Why.** Hiding by construction, not enforcement. Code that only holds `get(key)` cannot _accidentally_ couple to another owner's slice; a module's entire reach is legible from the handles its context receives; and because nothing crosses the boundary except what the handle carries, moving consumers to another process later is a mechanical transport swap, not a redesign. This is a trust-model convention, not a sandbox — in-process code can always escape a closure if it tries; containment for untrusted code is the iframe transport's job.

**Pattern.** The same shape at every layer:

```ts
// registry mints a scope-bound settings handle: get(key), not get(scopeId, key)
const settings = registry.forScope(featureId);

// store mints a location: two methods over one tree position, path pre-bound
const location = manifest.settingsNamespace("agent");

// FeatureContext is a bag of these: settings handle, publisher factory
// scoped to the feature id, id-scoped logger, per-feature DisposableBag
```

Two corollaries:

- **The owner's own API may be open** (`registry.get(scopeId, key)`) for trusted composition-root code and channel handlers; the narrowing happens at the point where a handle is doled out, and each consumer gets the narrowest handle that serves it.
- **Handles resolve lazily by id, not by captured object reference**, wherever the owner's contents can be replaced underneath (reload). A handle minted before a reload keeps working after it; an unknown target fails on first _use_, not at mint time.
