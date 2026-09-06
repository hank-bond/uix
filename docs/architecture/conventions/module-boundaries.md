---
summary: "Module APIs stay intentionally small, invalid values stop through explicit guards or assertions, and Node runtime dependencies remain visible as node-prefixed imports."
kind: reference
read_when: "Read before exporting a symbol, designing a validation boundary, or introducing a Node runtime dependency."
---

# Module boundaries

The [module-boundaries.export-minimum](./rules/module-boundaries.export-minimum.md) and [module-boundaries.node-imports](./rules/module-boundaries.node-imports.md) rules state the export and import invariants. This file explains the patterns and scope notes.

## Validation

Schemas own structural validation at data boundaries. The [module-boundaries.schema-validation](./rules/module-boundaries.schema-validation.md) rule distinguishes schema validation from semantic assertions and ordinary control flow.

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

## Constrained strings

A branded string preserves a domain value's validated structural meaning across internal APIs. The [`module-boundaries.branded-strings`](./rules/module-boundaries.branded-strings.md) rule applies throughout the repository.

Keep three stages distinct: raw input, validated domain value, and external representation. Schemas define structural validity. A parser or checked encoder establishes the brand, and internal consumers require that branded type rather than arbitrary strings. Formatting, concatenation, and deserialization do not automatically preserve the structural constraints.

Declare the brand where the shared concept is defined rather than creating a separate brand for each host. One host-neutral type can represent a feature's directory address while each host encodes its own scheme and layout. That type does not prove that the address's attachment binding remains valid.

## Imports

`__dirname` and `__filename` are CommonJS module bindings, not importable values. Use them directly in the CJS main-process bundle.

Few modules need direct `process` access. Environment, working-directory, and platform reads belong in `hosts/electron/src/main/index.ts` or substrate utilities that it composes. Feature code does not import `process` directly. Add a runtime environment capability to `FeatureContext` when a feature needs one.

ESLint also rejects production feature imports of concrete host main-process code. A white-box feature test may import the internal subsystem under test. Test modules are not loaded feature code.
