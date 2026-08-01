---
summary: "Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime."
kind: reference
read_when: "Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup."
status: active
---

# Lifetimes

## Lifetime management in the main process

**Rule.** Do not call `ipcMain.handle`, `webContents.send`, `app.on`, `BrowserWindow.on`, or any API that attaches a listener without pairing cleanup directly. IPC crossings go through `src/main/ipc.ts`—`handle()` for invoke endpoints and `send()` for pushes to a window—so every crossing lands in the wire log. Everything else uses the helpers in `src/main/lifecycle.ts`. Put each returned `Disposable` into a `DisposableBag` whose lifetime matches the attached behavior.

**Why.** An unpaired listener, handler, subscription, or timer is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`; the bag requires the caller to choose where that cleanup lives. Disposing the lifetime then tears down every owned capability in reverse acquisition order.

**Pattern.**

```ts
import * as ipc from "./ipc";
import { DisposableBag, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(ipc.handle("uix:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

ipc.send(win, "uix:agentEvent", event); // push only; no cleanup capability

// Later, when this lifetime ends:
bag[Symbol.dispose]();
```

**Exceptions.** One-shot process-end events such as `will-quit` and `window-all-closed` can attach through the raw API because there is no useful earlier cleanup point. Comment the call to explain why.

**Disposable values.** Anything with non-trivial cleanup should implement `Disposable` or be wrapped with `disposable(() => ...)`. Do not discard a returned `Disposable`; route it into a bag or `using` declaration.

## When to add a lifecycle helper

When cleanup-requiring code would otherwise call a raw API such as `addEventListener`, an emitter's `.on`, a library's `.subscribe`, or `setInterval`, add a small helper to `src/main/lifecycle.ts` that attaches the behavior and returns a `Disposable`.
