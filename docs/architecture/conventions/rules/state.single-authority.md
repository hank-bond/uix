---
summary: "Name one authority for current state and keep asynchronous work, cleanup, lookup, and caching separate from it."
kind: reference
---

# Name one authority for current state

**Rule: must.** Name one authority for current state and keep asynchronous work, cleanup, lookup, and caching separate from it.

**Approved example:** Keep the current value and the shared in-flight operation distinct:

```ts
let current: Value | undefined;
let inFlightLoad: Promise<Value> | undefined;

function getValue(): Promise<Value> {
  if (current) return Promise.resolve(current);
  if (inFlightLoad) return inFlightLoad;

  const load: Promise<Value> = createValue()
    .then((value) => {
      current = value;
      return value;
    })
    .finally(() => {
      if (inFlightLoad === load) inFlightLoad = undefined;
    });
  inFlightLoad = load;
  return load;
}
```

**Nonconforming example:** Use a promise slot or cleanup bag as current state, or let completion order choose current truth.

**Reason:** A current value, registry, buffer, or store owns state. A promise coordinates asynchronous work. A bag or effect owns deterministic cleanup. None becomes a second authority. When current state can be replaced, commit the replacement at one named generation boundary.
