---
summary: "Cleanup-requiring behavior uses lifecycle helpers and belongs to an explicit DisposableBag lifetime."
kind: reference
read_when: "Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup."
---

# Lifetimes

The [lifetimes.paired-cleanup](./rules/lifetimes.paired-cleanup.md) rule requires every attachment to pair its cleanup. This file explains the main-process mechanics.

## Lifetime management in the main process

IPC crossings use `src/main/ipc.ts`: `handle()` for invoke endpoints and `send()` for window pushes. This path records every crossing in the wire log.

Other attachments use the lifetime helpers: the Electron app/window bindings in `src/main/lifecycle.ts`, and the host-neutral helpers (`DisposableBag`, `disposable`, `subscribe`, `installProcessHandlers`) in `@uix/runtime/lifecycle`. Each returned `Disposable` goes into the bag matching the behavior's lifetime. Disposing the lifetime tears down every owned capability in reverse acquisition order.

```ts
import * as ipc from "./ipc";
import { DisposableBag, onApp, subscribe } from "./lifecycle";

const bag = new DisposableBag();

bag.add(ipc.handle("uix:reload", (req) => { ... }));
bag.add(onApp("activate", () => { ... }));
bag.add(subscribe(session, (event) => { ... }));

ipc.send(win, "uix:agentEvent", event); // push only; no cleanup capability

// Later, when this lifetime ends:
bag[Symbol.dispose]();
```

Disposable values with non-trivial cleanup implement `Disposable` or use `disposable(() => ...)`. Do not discard a returned `Disposable`. Put it in a bag or `using` declaration.

## When to add a lifecycle helper

When cleanup-requiring code would call a raw attachment API, add a small helper beside the other lifetime helpers. The helper attaches the behavior and returns a `Disposable`.
