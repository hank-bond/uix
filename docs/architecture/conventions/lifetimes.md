---
summary: "Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime."
kind: reference
read_when: "Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup."
status: active
---

# Lifetimes

## Lifetime management in the main process

**Rule:** Do not attach a listener without directly pairing cleanup. This rule covers `ipcMain.handle`, `app.on`, `BrowserWindow.on`, and similar APIs.

IPC crossings use `src/main/ipc.ts`: `handle()` for invoke endpoints and `send()` for window pushes. This path records every crossing in the wire log.

Other attachments use helpers from `src/main/lifecycle.ts`. Put each returned `Disposable` into the bag matching the behavior's lifetime.

**Why:** An unpaired listener, handler, subscription, or timer is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`. The bag requires the caller to choose where that cleanup lives. Disposing the lifetime then tears down every owned capability in reverse acquisition order.

**Pattern:**

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

**Exceptions:** One-shot process-end events such as `will-quit` and `window-all-closed` can attach through the raw API because there is no useful earlier cleanup point. Comment the call to explain why.

**Disposable values:** Anything with non-trivial cleanup should implement `Disposable` or use `disposable(() => ...)`. Do not discard a returned `Disposable`. Put it in a bag or `using` declaration.

## When to add a lifecycle helper

When cleanup-requiring code would call a raw attachment API, add a small helper to `src/main/lifecycle.ts`. The helper attaches the behavior and returns a `Disposable`.
