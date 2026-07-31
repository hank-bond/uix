---
summary: "Cleanup-requiring behavior registers through lifecycle helpers and belongs to an explicit DisposableBag lifetime."
read_when: "Read before registering callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup."
status: active
---

# Registrations and lifetimes

## Lifetime management (main process)

**Rule.** Don't call `ipcMain.handle`, `webContents.send`, `app.on`, `BrowserWindow.on`, or anything that follows the "register a listener and forget it" shape directly. IPC crossings go through `src/main/ipc.ts` — `handle()` for invoke endpoints, `send()` for pushes to a window — so every crossing lands in the wire log. Everything else uses the helpers in `src/main/lifecycle.ts`. Put what the registration helpers return into a `DisposableBag` whose lifetime matches the thing being listened for.

**Why.** Registration without un-registration is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`; the bag enforces that you have _somewhere_ for the disposable to live. You can't register without picking a lifetime, and disposing the lifetime is one call.

**Pattern.**

```ts
import * as ipc from "./ipc";
import { DisposableBag, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(ipc.handle("uix:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

ipc.send(win, "uix:agentEvent", event); // push, not a registration — no bag

// later, when this lifetime ends:
bag[Symbol.dispose]();
```

**Exceptions.** One-shot process-end events (`will-quit`, `window-all-closed`) can be registered raw — there is no useful moment to remove them. Comment the call to explain why.

**Disposable values.** Anything with non-trivial cleanup should implement `Disposable` (or be wrappable with `disposable(() => ...)`). A function whose return value is `Disposable` cannot be discarded silently without it leaking — make sure every call site routes it into a bag or `using`.

## When to add a new lifecycle helper

When you need to register something cleanup-requiring and the call site would otherwise reach for a raw API (`addEventListener`, an emitter's `.on`, a library's `.subscribe`, `setInterval`, etc.), add a small helper to `src/main/lifecycle.ts` that wraps it and returns a `Disposable`. The helper is ~5 lines; the convention is preserved.
