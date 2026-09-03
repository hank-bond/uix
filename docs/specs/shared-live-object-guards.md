---
summary: "A supervisor owns each shared object, and guards keep it alive for independent callers."
kind: reference
status: draft
---

# Shared live-object guards

## Contract

A _guard_ gives one caller access to a shared live object and keeps that object alive. The supervisor remains the object's only lifecycle owner.

Each guard protects the specific object generation it was issued for. Callers can dispose their guards without affecting each other.

## Boundary

The supervisor creates and destroys shared objects. It also issues guards and waits for them during shutdown.

The guard provides the object's operations. It does not provide lifecycle control. Listeners, timers, and exclusively owned children use ordinary disposable ownership instead of guards.

## Requirements

- Each acquisition **must** issue a separate guard for one live generation.
- A live guard **must** provide the guarded value without exposing teardown authority.
- A live guard **may** retain another guard for the same generation.
- Disposing one guard **must not** affect another guard.
- Guard disposal **must** be synchronous and idempotent.
- A disposed guard **must** reject value access and further retention.
- When no guards remain, the supervisor **may** apply its idle policy. Disposing the last guard does not require immediate teardown.
- Guard disposal **must not** wait for teardown.
- The supervisor **must** single-flight creation and teardown for each object key.
- During shutdown, the supervisor **must** stop admission, finish in-flight creation, wait for every guard, and then await child teardown.
- A child guard **must not** retain its parent supervisor's object. A caller that uses both objects **must** hold both guards.
- Diagnostic snapshots **may** include detached holder metadata. They **must not** grant access or retention authority.

## Conformance

A conforming implementation demonstrates these outcomes:

1. Several callers acquire guards for one generation and remain independent.
2. A retained guard remains valid after its source guard is disposed.
3. A disposed guard rejects access and retention.
4. The supervisor does not tear down a guarded object.
5. Shutdown stops admission, drains all guards, and awaits teardown.
6. If teardown fails while the old generation still exists, the supervisor does not create a replacement beside it.

## Degrees of freedom

A conforming implementation may choose guard identifiers, diagnostic metadata, internal data structures, wait mechanisms, and idle-retention policy.

## Open questions

- Which guard diagnostics should the public inspection API provide?
