---
summary: "Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports."
kind: reference
read_when: "Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency."
---

# Module boundaries

The [module-boundaries.export-minimum](./rules/module-boundaries.export-minimum.md) and [module-boundaries.node-imports](./rules/module-boundaries.node-imports.md) rules state the export and import invariants. This file explains the patterns and scope notes.

## Validation

Use boolean guards only when the caller has a real branch to make. If failure always means "stop here," expose an assertion helper instead.

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

Call sites that cannot recover should say what they mean: `assertCanvasKey(key)` instead of repeating the `if` and `throw`.

Custom errors start with plain `Error` and a clear message. Add a custom subclass only when callers must branch on its type, as in `err instanceof InvalidCanvasKeyError`. Until then, assertion helpers keep call sites stable if the thrown type changes.

## Imports

`__dirname` and `__filename` are CommonJS module bindings, not importable values. Use them directly in the CJS main-process bundle.

Few modules need direct `process` access. Environment, working-directory, and platform reads belong in `src/main/index.ts` or substrate utilities that it composes. Feature code does not import `process` directly. Add a runtime environment capability to `FeatureContext` when a feature needs one.

ESLint also rejects production feature imports of `src/main/` and the `#backend` alias. A white-box feature test may import the internal subsystem under test. Test modules are not loaded feature code.
