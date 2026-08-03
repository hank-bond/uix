---
summary: "DisposableBag owns cleanup for app lifetime, reloadable feature activations, window bindings, and the agent driver; feature authors receive scoped capabilities rather than direct bag access."
kind: reference
status: active
---

# Lifetimes

UIX uses `DisposableBag` from `src/main/lifecycle.ts` to own cleanup-requiring capabilities. A bag contains `Disposable` objects and disposes them in reverse acquisition order.

Current main-process lifetime scopes:

- **`appBag`:** The application lifetime. It owns process handlers, protocols, IPC, window listeners, the feature composition, workspace settings, and the agent driver.
- **`featuresBag`:** A child of `appBag`. Feature reload clears it, while application shutdown disposes it.
- **Per-feature bag:** Exists for one manifest feature activation. It owns settings capabilities and returned facet lifetimes, then joins `featuresBag` after successful activation.
- **Agent driver bag:** Internal to `createAgentDriver`. It owns Pi event subscriptions and live session cleanup.

Feature authors do not receive a `DisposableBag` directly. Before `context()` and `contribute()` run, the substrate adds a provisional `SettingsScopeHandle` to the per-feature bag. It then registers every facet returned by `contribute()` and adds each returned `Disposable`, updater, appender, or other lifetime capability. Grouped register operations have strong exception safety: if a later item or facet throws, the helper disposes everything it already acquired before rethrowing. The loader commits settings and enrolls the bag into `featuresBag` only after all facets succeed.

Malformed workspace candidates fail before `featuresBag` clears. The active feature composition and settings owner remain intact.

A failed feature activation disposes its complete provisional bag and continues with sibling entries. Each returned `Disposable` removes the exact member created by registration.

Identity-aware removal prevents an earlier feature instance from deleting its replacement's member. Disposing an instance removes its live settings scope, but preserves committed manifest values.

For substrate-internal rules, see [`lifetimes.md`](../../docs/architecture/conventions/lifetimes.md).
