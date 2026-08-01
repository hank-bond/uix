---
summary: "Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports."
read_when: "Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency."
status: active
---

# Module boundaries

## Module API surface

**Rule.** Don't export a symbol until another module needs to import that symbol by name.

**Why.** Every export is a small API commitment. Keeping internal helper types and constants private until they have a real consumer makes refactors cheaper and makes ownership clearer.

**Pattern.** An exported function may use a private parameter interface:

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

**Exception.** Public API modules (for example `@uix/api` types) intentionally export stable shapes for feature authors. Those are designed API surfaces, not internal implementation details.

## Validation

**Rule.** Use boolean guards only when the caller has a real branch to make. If failure always means "stop here," expose an assertion helper instead.

**Shape.**

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

**Custom errors.** Start with plain `Error` and a clear message. Add a custom `Error` subclass only when a caller needs to branch on the failure type (e.g. `err instanceof InvalidCanvasKeyError`). Until then, assertion helpers keep the call sites stable if the thrown error type changes later.

## Imports

**Rule.** Import Node built-ins explicitly with the `node:` prefix, even the ones that are technically available as globals (`process`, `Buffer`).

(`__dirname` and `__filename` are _not_ covered — they're CJS module-level bindings, not importable values. Use them as-is in the main-process bundle, which electron-vite emits as CJS.)

```ts
import process from "node:process"; // not: just use the global
import path from "node:path";
import fs from "node:fs";
```

**Why.**

- **Visibility.** The import list is where a reader scans to see what a module touches. A module that reads `process.env` or `process.cwd()` has a real dependency on the runtime environment; surfacing it at the top of the file makes that legible.
- **Consistency.** We already import `path`, `fs`, `os` etc. as modules. Treating `process` the same way removes a special case.
- **Lint enforcement.** ESLint rejects ambient `process` and `Buffer` access and bare Node built-in imports, so runtime dependencies stay visible and consistently use the `node:` prefix.

**Scope.** In practice, very few modules should need direct `process` access at all. Things that read environment variables, cwd, or platform state should either be in the composition root (`src/main/index.ts`) or be substrate utilities that it wires together, such as `log.ts` and `lifecycle.ts`. Feature code does not import `process` directly; runtime environment capabilities belong in the injected `FeatureContext` when a feature needs them.

ESLint also rejects production feature imports of `src/main/` and the `#backend` alias. White-box feature tests may import an internal subsystem when that subsystem is the subject of the test; those test modules are not loaded feature code.
