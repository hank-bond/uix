---
summary: "Do not attach a listener, handler, subscription, or timer without directly pairing its cleanup."
kind: reference
---

# Pair every attachment with cleanup

**Rule: must.** Do not attach a listener without directly pairing cleanup. This rule covers `ipcMain.handle`, `app.on`, `BrowserWindow.on`, and similar APIs.

**Approved example:** Put each returned `Disposable` into the bag matching the behavior's lifetime:

```ts
const bag = new DisposableBag();
bag.add(ipc.handle("uix:prompt", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));
```

**Nonconforming example:** Attach a handler without a bag or `using` declaration, so nothing owns its disposal.

**Reason:** An unpaired listener, handler, subscription, or timer is the most common leak pattern in Electron and observable-style code. The helpers return a `Disposable`. The bag requires the caller to choose where that cleanup lives. Disposing the lifetime then disposes every owned capability in reverse acquisition order.

**Exceptions:** One-shot process-end events such as `will-quit` and `window-all-closed` can attach through the raw API because there is no useful earlier cleanup point. Comment the call to explain why.
