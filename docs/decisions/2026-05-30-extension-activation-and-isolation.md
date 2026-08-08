---
summary: "Extensions activate sequentially, each under its own DisposableBag, with errors isolated per extension so one failure doesn't abort the rest (v0)."
kind: explanation
status: superseded
---

# Extension activation, lifetime, and error isolation

> **Superseded by [features-are-the-loadable-unit](./2026-07-01-features-are-the-loadable-unit.md).** The activation/lifetime/error-isolation mechanics carry forward under feature vocabulary. The `ExtensionAPI` lifetime surface (`register*` returning void, `createExtensionAPI` enrollment) is retired.

**Activation policy.**

- **Sequential `await`** over the discovered list (mirrors Pi). Predictable log order. One slow extension blocking the rest only matters for heavy activation work, which we discourage anyway.
- **Intra-root order sorted alphabetically by dir name**: small divergence from Pi's raw `readdir` order. Strengthens Pi's "load order" claim at zero cost and removes "logs differ between devs" surprises.
- **No same-name shadowing across roots**: both a project and global `hello/` activate independently (different `dir`s = different identities). Name collisions inside a registry are the registry's problem, not the loader's.

**Lifetime.** `register*` methods return **`void`, not `Disposable`** (mirrors Pi). The substrate ties each registration's cleanup to the extension lifecycle. The loader keeps a per-extension `DisposableBag`, and `createExtensionAPI()` enrolls disposables into it as a side effect of each `register*` call. The bag is disposed on unload. Authors never thread `Disposable` values for things they registered through the API. (For their _own_ resources, watchers, intervals, they still need cleanup discipline. Whether to expose a `uix.subscriptions` bag is TBD. Pi doesn't, and we don't yet need to.)

**Error isolation, v0 posture.**

- **Per-factory try/catch.** A throw during activation no longer halts the loop. The broken entry lands in `failed: FailedExtension[]`, siblings keep going. Return type is `{ loaded, failed }` (two arrays, separate types) rather than a discriminated union: the use cases diverge and shouldn't force narrowing.
- **Partial-activation cleanup.** The per-extension bag is built before the factory runs and enrolled in the parent only after success. On failure it's disposed locally, so anything already registered is torn back down.
- **Process-level handlers** for `uncaughtException` / `unhandledRejection` live in `lifecycle.ts` (`installProcessHandlers`), installed before any extension code. They cover async-after-activation failures and log via `main` (they can't tell host-origin from extension-origin).
- **No attribution attempted**: bundlers transform paths, top-of-stack frames are usually third-party, false negatives are common (Pi doesn't try either). Add later as a pure addition if it starts hurting.
- **Errors normalized to `Error`** (JS lets you throw anything).
- **Dogfood canary:** `.uix/extensions/broken/` deliberately throws on activation, so every `npm run dev` exercises the isolation path.

**Process posture.** v0 runs extensions in the main process. The architectural commitment is stronger than the mechanism: all extension↔host traffic goes through the injected API object. Extensions never import host internals. A future swap to `worker_threads`/`utilityProcess` per-extension isolation is a transport change, not an API change. Out of scope here: per-handler isolation (catching throws _inside_ a registered handler), which lands with the registry that invokes them.
