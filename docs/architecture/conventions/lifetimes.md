---
summary: "Exclusive cleanup belongs to Disposable lifetimes, while independently retained shared objects use supervisor-issued guards."
kind: reference
read_when: "Read before attaching callbacks, listeners, IPC, protocols, timers, or any other behavior that requires cleanup."
---

# Lifetimes

The [lifetimes.paired-cleanup](./rules/lifetimes.paired-cleanup.md) rule requires every attachment to pair its cleanup. This file explains the main-process mechanics.

## Lifetime management in the main process

IPC crossings use `src/main/ipc.ts`: `handle()` for invoke endpoints and `send()` for window pushes. This path records every crossing in the wire log.

Other attachments use the lifetime helpers: the Electron app/window bindings in `src/main/lifecycle.ts`, and the host-neutral helpers (`DisposableBag`, `disposable`, `subscribe`, `installProcessHandlers`) in `@uix/runtime/lifecycle`. Each returned `Disposable` goes into the bag matching the behavior's lifetime. Disposing the lifetime disposes every owned capability in reverse acquisition order.

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

## Shared ownership uses guards

Use a supervisor-issued guard when several independent holders can prevent teardown of one shared live object. Each acquisition receives its own guard. Disposing that guard is synchronous, idempotent, and affects no other holder. A live guard may `retain()` another independently disposable guard for asynchronous work derived from the current authority.

The ordinary domain type defines operations. Its ownership capability combines that domain type with `Disposable` or `AsyncDisposable` lifecycle authority and remains private to the supervisor. Ownership capabilities expose that authority through the disposal protocol rather than adding a parallel named `dispose()` operation. Every guard provides the protected generation's domain value without exposing its ownership. The generic guard owns only `value`, `retain`, and `Symbol.dispose`. Domain operations remain on `Workspace`, `AgentInstance`, or another guarded value. A disposed guard rejects further value access and retention. Operations reachable only through a live guard do not add method-level disposed checks: supervisor teardown cannot start until those guards drain. Zero guards only admits the supervisor's lifetime policy. It does not promise immediate teardown, and guard disposal never awaits teardown.

```ts
interface Guard<Value> extends Disposable {
  readonly value: Value;
  retain(origin?: string): Guard<Value>;
}
```

Supervisor acquisition and `retain()` mint guards. `using` handles lexical guards. A connection, attachment, prepared dispatch, or other longer-lived holder stores its guard and disposes that guard from the holder's own disposal protocol. Rollback before transfer also invokes the guard's disposal symbol directly. Guard disposal disposes only the protection capability. Supervisor disposal drains guards and then disposes each retained ownership capability.

```ts
using workspaceGuard = await workspaceSupervisor.acquire(workspaceId);
using attachment = await workspaceGuard.value.createAttachment(target);

await handleCanonicalRequest(async (request) => {
  using _requestGuard = workspaceGuard.retain("request");
  using prepared = attachment.prepareDispatch(request);
  return await prepared.invoke();
});
```

Use the same pattern for workspace runtimes, agent instances, and future shared live objects. A parent supervisor stops admission, drains live guards, and awaits actual child teardown during its asynchronous disposal. Teardown failures remain observable and cannot silently admit a replacement beside a child that failed to dispose.

Do not replace ordinary ownership with guards. Registrations, listeners, timers, adapters, and uniquely owned child objects remain `Disposable` or `AsyncDisposable` values in lifetime bags. Guards are specifically for independently retained shared live objects.

## Supervision protocol

Every supervisor follows one ownership and teardown protocol. The supervisor is the sole owner of each admitted child. Callers use guarded domain values, and ownership disposal remains inside the supervisor except for rollback before admission.

Apply these practices to every supervised child lifecycle:

- Acquisition resolves or single-flights child creation by key, then returns one independent guard.
- Every asynchronous use holds a guard through its final safe boundary. A lexical use disposes with `using`. A longer use transfers its guard into one named disposable lifetime holder.
- Every teardown trigger joins one idempotent, single-flight teardown. Zero guards admits lifetime policy but does not itself promise teardown.
- Teardown waits for policy admission and invokes the child's ownership disposal protocol. It removes only the exact completed generation and observes failures before admitting a replacement.
- Parent disposal stops admission, drains guards, starts or joins every child teardown, and awaits completion. Synchronous bags own `Disposable` values. Asynchronous owners await `AsyncDisposable` values explicitly.
- Guard snapshots expose detached point-in-time metadata for inspection and leak tests. They provide no guard authority.

When an integration cannot follow this sequence exactly, its nearest ownership-boundary comment explains the deviation. It names the child owner, protection holder, cleanup transfer, and reason the standard sequence does not apply. A deviation does not introduce a second public cleanup protocol: `dispose` remains the cleanup operation, while teardown names the supervised lifecycle process around it.

## When to add a lifecycle helper

When cleanup-requiring code would call a raw attachment API, add a small helper beside the other lifetime helpers. The helper attaches the behavior and returns a `Disposable`.
