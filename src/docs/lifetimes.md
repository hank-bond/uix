---
summary: "DisposableBag owns cleanup for app lifetime, reloadable feature activations, window bindings, and the agent driver; feature authors receive scoped capabilities rather than direct bag access."
status: active
---

# Lifetimes

UIX uses `DisposableBag` from `src/main/lifecycle.ts` to own cleanup-requiring capabilities. A bag contains `Disposable` objects and disposes them in reverse acquisition order.

Current main-process lifetime scopes:

- `appBag` — app lifetime; owns process handlers, the protocol binding, IPC handlers, app/window listeners, the active feature composition, workspace settings, and the agent driver.
- `featuresBag` — child of `appBag`; cleared on feature reload and disposed on app shutdown.
- per-feature bag — created for each manifest feature activation; owns its `SettingsScopeHandle`, settings listener disposables, and every facet's returned lifetime capability, and joins `featuresBag` only after successful activation.
- agent driver bag — internal to `createAgentDriver`; owns Pi event subscriptions and session cleanup after a session exists.

Feature authors do not receive a `DisposableBag` directly. Before `context()` and `contribute()` run, the substrate adds a provisional `SettingsScopeHandle` to the per-feature bag. It then registers every facet returned by `contribute()` and adds each returned `Disposable`, updater, appender, or other lifetime capability. Grouped register operations have strong exception safety: if a later item or facet throws, the helper disposes everything it already acquired before rethrowing. The loader commits settings and enrolls the bag into `featuresBag` only after all facets succeed.

Malformed workspace candidates fail before `featuresBag` is cleared, leaving the active feature composition and settings owner intact. A failed feature activation disposes that entry's entire provisional bag and continues with sibling entries. A returned `Disposable` removes the exact registry member created by its register operation, so disposing an earlier activated feature instance cannot remove a replacement member with the same id. Disposing an activated feature instance removes its live settings scope but never deletes values already committed to the manifest.

For substrate-internal rules, see [`../../docs/architecture/conventions/lifetimes.md`](../../docs/architecture/conventions/lifetimes.md).
