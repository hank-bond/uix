---
summary: "Cockpit reload tears down and re-activates extensions through an extensionsBag child lifetime without restarting Electron, delegating to pi's session.reload()."
read_when: "Read when touching reload, lifetime scoping, or jiti module loading."
status: accepted
---

# Manual reload with an extensionsBag child scope

- **Scope boundary.** App-lifetime resources (process handlers, `BrowserWindow`, agent driver, IPC handlers) stay in `appBag`. Extension activations enroll under a child `extensionsBag`, so reload tears down every extension contribution without restarting Electron or touching the agent/window/IPC substrate.
- **`clear()` vs dispose.** `DisposableBag.clear()` drains current items LIFO but keeps the bag reusable; `[Symbol.dispose]()` marks it permanently disposed then drains. The reusable child bag avoids accumulating dead bags across reloads.
- **Whole-subtree reload.** v0 disposes and re-activates all extensions, not just changed ones — wholesale reload is the boundary test that proves lifetimes are scoped correctly. Diff reload can optimize later.
- **Discovery before teardown.** Discovery is side-effect-free (dir/package.json reads), so it runs before `extensionsBag.clear()`. If discovery throws, the old tree stays active, `reload_failed` is logged, and the IPC invoke rejects. Once activation starts, per-extension failures are captured in `failed[]` and siblings continue.
- **Single-flight load.** Concurrent reload triggers share the `inFlightExtensionLoad` Promise. Watcher-driven reload can add a dirty/queued second pass later; v0 only prevents overlapping clear/activate.
- **Cockpit-level trigger.** Main exposes `uix:reload` through the preload bridge as `window.uix.reload()`. It reloads the UIX tree and, if a pi session already exists, delegates to pi's own `session.reload()` — it deliberately does not create a session just to service reload. No throwaway renderer button; the hook is ready for a future command palette / `/reload` chat command.
- **jiti for extension code.** Extension entries load through `jiti` with `moduleCache: false`, so project/user `.ts` files edit-and-reload in a packaged app without rebuilding UIX or Node ESM cache-busting. jiti is a loader/transpiler, not a sandbox.
- **Deferred.** File-watcher auto-reload waits for the watcher service; per-handler error isolation waits for the real command registry.
