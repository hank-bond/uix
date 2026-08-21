---
summary: "Module APIs stay intentionally small, validated constructors preserve checked invariants in types, and Node runtime dependencies remain visible as node-prefixed imports."
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

## Validated constructors

A validated constructor turns one successful boundary check into a type-level fact that downstream code can trust.

Keep the candidate type separate from the accepted type. The validated constructor checks every invariant represented by the accepted type and remains its only ordinary construction path. Downstream APIs accept the accepted type and do not repeat those static checks. Values produced later by callbacks, deserialization, or other dynamic work still validate at their own boundaries.

Use a private `unique symbol` brand for immutable primitive values. The constructor performs the one justified assertion after validation. The value remains the original primitive at execution time.

```ts
const CanvasKeyBrand: unique symbol = Symbol("CanvasKey");

type CanvasKey = string & {
  readonly [CanvasKeyBrand]: true;
};

function parseCanvasKey(candidate: string): CanvasKey {
  if (!canvasKeyPattern.test(candidate)) {
    throw new Error(`Invalid Canvas key: ${candidate}`);
  }
  return candidate as CanvasKey;
}
```

Use a class with private state and a private constructor for an internal composite value that needs stronger nominal construction. Expose one static operation that validates the candidate, snapshots the invariant-bearing data, and invokes the constructor. The private state prevents a plain object or object spread from satisfying the accepted type.

```ts
class AgentCompositionDefinition {
  readonly #features: readonly AdmittedAgentFeatureDefinition[];

  private constructor(features: readonly AdmittedAgentFeatureDefinition[]) {
    this.#features = Object.freeze([...features]);
  }

  static create(
    candidate: CandidateAgentComposition,
  ): AgentCompositionDefinition {
    validateAgentComposition(candidate);
    return new AgentCompositionDefinition(candidate.features);
  }

  get features(): readonly AdmittedAgentFeatureDefinition[] {
    return this.#features;
  }
}
```

A plain branded object remains appropriate when an accepted value must retain a plain serializable shape. Admission must then own or freeze every field whose mutation could invalidate the proof. Serialization removes the proof in every representation, so external or persisted values always return through their validated constructor.

Validated types provide a trusted-code boundary, not a hostile-code security boundary. Deliberate assertions and `any` can bypass TypeScript, so the validating cast stays local and conspicuous. Prefer module privacy and an exclusive construction path before adding specialized lint enforcement.

## Imports

`__dirname` and `__filename` are CommonJS module bindings, not importable values. Use them directly in the CJS main-process bundle.

Few modules need direct `process` access. Environment, working-directory, and platform reads belong in `src/main/index.ts` or substrate utilities that it composes. Feature code does not import `process` directly. Add a runtime environment capability to `FeatureContext` when a feature needs one.

ESLint also rejects production feature imports of `src/main/` and the `#backend` alias. A white-box feature test may import the internal subsystem under test. Test modules are not loaded feature code.
