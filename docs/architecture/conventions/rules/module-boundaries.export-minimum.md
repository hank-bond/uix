---
summary: "Do not export a symbol until another module needs to import that symbol by name."
kind: reference
---

# Export only what has a consumer

**Rule: must.** Do not export a symbol until another module needs to import that symbol by name.

**Approved example:** An exported function may use a private parameter interface:

```ts
interface CreateThingOptions {
  onChange: () => void;
}

export function createThing(opts: CreateThingOptions) {
  opts.onChange();
}
```

**Nonconforming example:** Export `CreateThingOptions` before a caller exists that imports it by name.

**Reason:** Every export is a small API commitment. Keeping internal helper types and constants private until they have a real consumer makes refactors cheaper and makes ownership clearer.

**Exceptions:** Public API modules (for example `@uix/api` types) intentionally export stable shapes for feature authors. Those are designed API surfaces, not internal implementation details.
