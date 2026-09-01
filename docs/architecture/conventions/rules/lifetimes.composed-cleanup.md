---
summary: "Compose ordered cleanup of owned capabilities in a disposal container instead of handwritten teardown choreography."
kind: reference
---

# Compose owned cleanup

**Rule: must.** When a scope owns several cleanup capabilities, compose them in a disposal stack or bag instead of hand-writing rollback, idempotency, or nested disposal sequencing.

**Scope:** Cleanup-only ordering among `Disposable` and `AsyncDisposable` capabilities.

**Approved example:** Use a stack for a short scope and a bag for a persistent owner:

```ts
const lifetime = new AsyncDisposableStack();
lifetime.defer(releaseGuard);
const operation = lifetime.use(tracker.acquire());

return prepare(request, () => lifetime.disposeAsync());
```

```ts
lifetime.add(resources);
lifetime.add(features);
lifetime.add(runtime);
lifetime.add(operations);

await lifetime[Symbol.asyncDispose]();
```

**Nonconforming example:** Manually coordinate several cleanup capabilities through local completion state or nested `finally` blocks:

```ts
let completion: Promise<void> | undefined;
const complete = () =>
  (completion ??= disposeOperation().finally(releaseGuard));
```

```ts
try {
  await disposeOperations();
} finally {
  try {
    await disposeRuntime();
  } finally {
    disposeResources();
  }
}
```

**Reason:** Disposal containers provide reverse-order cleanup, idempotency, rollback, and complete failure handling as one ownership mechanism. Handwritten coordination obscures the ownership order and can leak resources or mask cleanup failures.

**Exceptions:** Domain transitions that are not cleanup capabilities, such as stopping admission or notifying clients, remain explicit operations around the owned lifetime. A one-off third-party API may require a direct `try`/`finally` adapter.

**Enforcement:** Architectural review checks multi-resource acquisition and teardown paths against this rule.
