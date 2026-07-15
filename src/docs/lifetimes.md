---
summary: "DisposableBag owns cleanup for app lifetime, reloadable feature activations, window registrations, and the agent driver; feature authors get cleanup through registered contributions rather than direct bag access."
status: active
---

# Lifetimes

UIX uses `DisposableBag` in `src/main/lifecycle.ts` to own cleanup-requiring registrations. A bag contains `Disposable` objects and disposes them in LIFO order.

Current main-process lifetime scopes:

- `appBag` — app lifetime; owns process handlers, protocol registration, IPC handlers, app/window listeners, the reloadable feature subtree, workspace settings, and the agent driver.
- `featuresBag` — child of `appBag`; cleared on feature reload and disposed on app shutdown.
- per-feature bag — created for each manifest feature activation; owns its provisional settings-scope registration, settings listeners, and every facet registration, and is enrolled into `featuresBag` only after successful activation.
- agent driver bag — internal to `createAgentDriver`; owns the pi event subscription and session disposal after a session exists.

Feature authors do not receive a `DisposableBag` object directly. The substrate registers a provisional settings scope into the per-feature bag before `context()` and `contribute()` run, then enrolls every facet returned by `contribute()`. Grouped registration has strong exception safety: if a later item or facet throws, helpers dispose everything they already acquired before rethrowing. The loader commits settings and enrolls the bag into `featuresBag` only after all facets succeed.

Malformed workspace candidates fail before `featuresBag` is cleared, leaving the current feature tree and settings owner intact. Per-feature activation failures dispose that feature's entire provisional bag and continue with sibling entries. Registration disposables remove the exact object they created, so cleanup from an old generation cannot remove a newer registration with the same id. Disposing a successfully activated feature removes its live settings scope but never deletes values already committed to the manifest.

For substrate-internal registration rules, see [`../../docs/architecture/conventions.md`](../../docs/architecture/conventions.md).
