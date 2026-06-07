---
summary: "Extensions activate sequentially, each under its own DisposableBag, with errors isolated per extension so one failure doesn't abort the rest (v0)."
status: accepted
---

# Extension activation, lifetime, and error isolation

**Activation policy.**

- **Sequential `await`** over the discovered list (mirrors pi). Predictable log order; one slow extension blocking the rest only matters for heavy activation work, which we discourage anyway.
- **Intra-root order sorted alphabetically by dir name** — small divergence from pi's raw `readdir` order; strengthens pi's "load order" claim at zero cost and removes "logs differ between devs" surprises.
- **No same-name shadowing across roots** — both a project and global `hello/` activate independently (different `dir`s = different identities). Name collisions inside a registry are the registry's problem, not the loader's.

**Lifetime.** `register*` methods return **`void`, not `Disposable`** (mirrors pi). The substrate ties each registration's cleanup to the extension lifecycle: the loader keeps a per-extension `DisposableBag`, `createExtensionAPI()` enrolls disposables into it as a side effect of each `register*` call, and the bag is disposed on unload. Authors never thread `Disposable` values for things they registered through the API. (For their _own_ resources — watchers, intervals — they still need cleanup discipline; whether to expose a `uix.subscriptions` bag is TBD. Pi doesn't, and we don't yet need to.)

**Error isolation, v0 posture.**

- **Per-factory try/catch.** A throw during activation no longer halts the loop; the broken entry lands in `failed: FailedExtension[]`, siblings keep going. Return type is `{ loaded, failed }` (two arrays, separate types) rather than a discriminated union — the use cases diverge and shouldn't force narrowing.
- **Partial-activation cleanup.** The per-extension bag is built before the factory runs and enrolled in the parent only after success; on failure it's disposed locally, so anything already registered is torn back down.
- **Process-level handlers** for `uncaughtException` / `unhandledRejection` live in `lifecycle.ts` (`installProcessHandlers`), installed before any extension code. They cover async-after-activation failures and log via `main` (they can't tell cockpit-origin from extension-origin).
- **No attribution attempted** — bundlers transform paths, top-of-stack frames are usually third-party, false negatives are common (pi doesn't try either). Add later as a pure addition if it starts hurting.
- **Errors normalized to `Error`** (JS lets you throw anything).
- **Dogfood canary:** `.uix/extensions/broken/` deliberately throws on activation, so every `npm run dev` exercises the isolation path.

**Process posture.** v0 runs extensions in the main process. The architectural commitment is stronger than the mechanism: all extension↔cockpit traffic goes through the injected API object; extensions never import cockpit internals. A future swap to `worker_threads`/`utilityProcess` per-extension isolation is a transport change, not an API change. Out of scope here: per-handler isolation (catching throws _inside_ a registered handler), which lands with the registry that invokes them.
