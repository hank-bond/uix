---
summary: "Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports."
kind: reference
read_when: "Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency."
status: active
---

# Module boundaries

## Module API surface

**Rule:** Don't export a symbol until another module needs to import that symbol by name.

**Why:** Every export is a small API commitment. Keeping internal helper types and constants private until they have a real consumer makes refactors cheaper and makes ownership clearer.

**Pattern:** An exported function may use a private parameter interface:

```ts
interface CreateThingOptions {
  onChange: () => void;
}

export function createThing(opts: CreateThingOptions) {
  opts.onChange();
}
```

Callers still get type checking and autocomplete when passing object literals:

```ts
createThing({ onChange: notify });
```

Export `CreateThingOptions` later, in the same change that introduces a real caller that needs to name/import it.

**Exception:** Public API modules (for example `@uix/api` types) intentionally export stable shapes for feature authors. Those are designed API surfaces, not internal implementation details.

## Validation

**Rule:** Use boolean guards only when the caller has a real branch to make. If failure always means "stop here," expose an assertion helper instead.

**Shape:**

```ts
export function isCanvasKey(key: string): boolean {
  return canvasKeyPattern.test(key);
}

export function assertCanvasKey(key: string): void {
  if (!isCanvasKey(key)) {
    throw new Error(invalidCanvasKeyMessage(key));
  }
}
```

Call sites that cannot recover should say what they mean:

```ts
assertCanvasKey(key);
```

instead of repeating:

```ts
if (!isCanvasKey(key)) {
  throw new Error(...);
}
```

**Custom errors:** Start with plain `Error` and a clear message. Add a custom subclass only when callers must branch on its type. For example, a caller might test `err instanceof InvalidCanvasKeyError`. Until then, assertion helpers keep call sites stable if the thrown type changes.

## Imports

**Rule:** Import Node built-ins explicitly with the `node:` prefix, even the ones that are technically available as globals (`process`, `Buffer`).

`__dirname` and `__filename` are CommonJS (CJS) module bindings, not importable values. Use them directly in the CJS main-process bundle.

```ts
import process from "node:process"; // not: just use the global
import path from "node:path";
import fs from "node:fs";
```

**Why:**

- **Visibility:** Readers scan imports to see what a module touches. A module reading `process.env` or `process.cwd()` depends on the runtime environment. Importing `process` makes that dependency visible.
- **Consistency:** UIX already imports `path`, `fs`, and `os` as modules. Treating `process` the same way removes a special case.
- **Lint enforcement:** ESLint rejects ambient `process` and `Buffer` access. It also rejects bare Node built-in imports, keeping runtime dependencies visible and `node:`-prefixed.

**Scope:** Few modules need direct `process` access. Environment, working-directory, and platform reads belong in `src/main/index.ts` or substrate utilities that it composes.

Feature code does not import `process` directly. Add a runtime environment capability to `FeatureContext` when a feature needs one.

ESLint also rejects production feature imports of `src/main/` and the `#backend` alias. A white-box feature test may import the internal subsystem under test. Test modules are not loaded feature code.
