---
summary: "DisposableBag owns cleanup for app lifetime, reloadable feature activations, window registrations, and the agent driver; feature authors get cleanup through registered contributions rather than direct bag access."
status: active
---

# Lifetimes

UIX uses `DisposableBag` in `src/main/lifecycle.ts` to own cleanup-requiring registrations. A bag contains `Disposable` objects and disposes them in LIFO order.

Current main-process lifetime scopes:

- `appBag` — app lifetime; owns process handlers, protocol registration, IPC handlers, app/window listeners, the reloadable feature subtree, workspace settings, and the agent driver.
- `featuresBag` — child of `appBag`; cleared on feature reload and disposed on app shutdown.
- per-feature bag — created for each activated manifest feature entry and enrolled into `featuresBag` after successful activation.
- agent driver bag — internal to `createAgentDriver`; owns the pi event subscription and session disposal after a session exists.

Feature authors do not receive a `DisposableBag` object directly. Anything registered through `FeatureDefinition.contribute(ctx)` is enrolled in that activation's per-feature bag by the substrate. Reload disposes the old bags and then activates fresh feature definitions from the manifest.

Malformed manifests fail before `featuresBag` is cleared, leaving the current feature tree intact. Per-feature activation failures dispose that feature's partially built bag and continue with sibling entries.

For substrate-internal registration rules, see [`../../docs/architecture/conventions.md`](../../docs/architecture/conventions.md).
