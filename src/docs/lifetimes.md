---
summary: "Current lifetime model in UIX: DisposableBag owns cleanup for app, extension reload, window registrations, and the agent driver; extension authors receive cleanup only through registrations made on the injected API. Read when checking cleanup/reload behavior."
status: active
---

# Lifetimes

UIX uses `DisposableBag` in `src/main/lifecycle.ts` to own cleanup-requiring registrations. A bag contains `Disposable` objects and disposes them in LIFO order.

Current main-process lifetime scopes:

- `appBag` — app lifetime; owns process handlers, protocol registration, IPC handlers, app/window listeners, the extension subtree, and the agent driver.
- `extensionsBag` — child of `appBag`; cleared on UIX extension reload and disposed on app shutdown.
- per-entry extension bag — created for each activated `uix.extensions` entry and enrolled into `extensionsBag` after successful activation.
- agent driver bag — internal to `createAgentDriver`; owns the pi event subscription and session disposal after a session exists.

Extension authors do not receive a `DisposableBag` object directly. Anything registered through the injected `uix` API is enrolled in the current extension entry's bag by the cockpit. Today that means `registerCommand(...)` cleanup is automatic on reload/deactivation.

For cockpit-internal registration rules, see [`../../docs/architecture/conventions.md`](../../docs/architecture/conventions.md).
