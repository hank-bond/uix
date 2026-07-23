---
summary: "Exploring how UIX admits agent-authored feature source: TypeScript-only API-conformance checks before activation, TypeBox for unknown runtime data, domain assertions for composition, and feature lifetimes for behavioral failure."
status: exploring
---

# Feature source admission

## Current synthesis

UIX should treat feature source admission as a product rail, not as an attempt to prove arbitrary program correctness. The intended authoring loop is that a non-specialist can direct an agent to build or modify a feature, request reload, and receive precise compiler diagnostics without losing the currently working workspace. The substrate only needs a dependable TypeScript-level assumption: admitted feature and surface definitions conform to the public UIX API shapes they claim to implement. Business logic, deliberate type-system escapes, metaprogramming, and runtime behavior remain the feature author's responsibility.

Feature source is TypeScript-only. JavaScript feature entries are not a supported compatibility path. UIX supplies a strict compiler project so every proposed feature is checked against the same `@uix/api` contract the substrate implements; a feature-local `tsconfig` does not weaken that boundary. `defineFeature(...)` and `defineSurface(...)` provide contextual typing where objects and callbacks are authored, while generated admission wrappers can additionally check that each module's default export is assignable to its required public definition.

A reload runs this UIX-owned TS7 check before clearing the current feature composition. Compiler failure rejects the proposed update and reports file/range diagnostics to the human and authoring agent; the existing bags remain live. Successful admission gives the loader the ordinary trust a TypeScript application places in checked internal modules, so the substrate can call hooks and route contribution shapes without recursively recreating their TypeScript types through runtime `if` chains.

Jiti can remain the source execution mechanism behind the compiler gate. UIX does not need a new backend bundling or exact-artifact system merely to establish API conformance: source races, `any`, assertions, ignored diagnostics, and intentionally deceptive code are outside the limited guarantee. A small runtime sanity assertion may still catch a missing module/default export or another loader-level impossibility, but it is defensive diagnostics rather than a parallel feature validator.

The validation model has four explicit boundaries:

- **Authored executable code → TypeScript compiler.** Feature definitions, surface definitions, callbacks, contribution return types, API use, and imports are checked before execution.
- **Unknown runtime data → TypeBox schema.** Manifest content, persisted settings, channel and IPC payloads, resource parameters, and other serialized values parse once at ingress into derived static types.
- **Cross-value meaning → domain assertion.** Duplicate ids, ownership, path containment, active references, conflicts, and other facts that depend on the current composition are checked while preparing or operating that composition.
- **Executable behavior → lifetime and error isolation.** Activation, callbacks, async effects, registration rollback, and disposal are governed by feature-scoped lifetimes and diagnostics; neither TypeScript nor schemas are expected to prove behavior correct.

Candidate preparation and feature activation are adjacent but distinct. Source, schema, and composition failures that can be established before replacement preserve the active feature composition, extending [atomic candidates and feature activation](../decisions/2026-07-13-atomic-candidates-and-feature-activation.md) to source admission. Once checked code begins activation, feature-scoped bags and provisional registrations govern rollback of substrate-owned effects. A runtime activation failure is still a runtime failure; the compiler gate improves the common authoring path without pretending arbitrary code execution is reversible.

A full repository ESLint pass is not part of the initial gate. Strict TypeScript supplies the desired API-conformance feedback. Targeted lint or AST policy should be added only for concrete authoring failures that the compiler cannot express; there is no initial requirement to close every `any`, assertion, or other intentional escape hatch.

This direction refines the trusted runtime loading established by [features are the loadable unit](../decisions/2026-07-01-features-are-the-loadable-unit.md), preserves manifest composition from [workspace manifest, not discovery](../decisions/2026-07-02-workspace-manifest-not-discovery.md), and applies the schema boundary settled by [TypeBox, not Zod](../decisions/2026-05-30-typebox-not-zod.md). It does not turn feature code into a sandbox: features remain trusted in-process code, with TypeScript admission providing authoring rails and a dependable API shape rather than a security or correctness proof.

## Open questions

- What is the smallest UIX-owned compiler project that checks a backend feature entry, its transitive imports, and its separately referenced surface entries without treating unrelated workspace files as part of the candidate?
- Should admission require both contextual `defineFeature(...)` / `defineSurface(...)` helpers and generated default-export wrappers, or can one mechanism cover every useful diagnostic?
- How should TS7 run off Electron's main thread, and what minimal caching is needed to keep repeated reloads fast?
- Which strict compiler options form the fixed feature contract, especially `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, dependency declaration checking, and Node versus DOM environments?
- Is compiler preflight one whole-workspace gate, or can features be checked independently while still preserving coherent reload behavior?
- How are separately referenced surface entries discovered early enough to check before the visible composition changes?
- How are diagnostics presented so the human and editing agent can act on the same file, range, message, and rejected candidate?

## Log

### 2026-07-14 — TypeScript becomes the feature admission boundary

Reviewing the settings work exposed an expanding `validateFeatureDefinition()` chain that attempted to reconstruct selected TypeScript facts after Jiti had already erased them. The initial question was whether TypeBox should validate the complete imported object. That separated three ideas: TypeBox schemas are runtime values suited to unknown data; TypeScript interfaces are erased and cannot be reflected without a compiler/code-generation step; function behavior cannot be proven by either mechanism.

The product intent resolved the larger direction. UIX is meant to let non-specialists build with an agent inside opinionated rails, not to accept arbitrary JavaScript plugins. UIX controls the source API and loading mechanism, TS7 makes a compiler-gated loop practical, and JavaScript compatibility has no value to preserve. The resulting model makes a UIX-owned TypeScript check the source admission gate, retains schemas for runtime data, uses domain assertions for composed relationships, and leaves bags/error isolation responsible for executable behavior. The checked candidate source must be the source used to activate replacement feature instances, and failures discoverable during candidate preparation should preserve the current active feature composition rather than being reported only after its bags are cleared.

### 2026-07-14 — admission proves API conformance, not runtime correctness

The scope was deliberately narrowed after testing the strongest counterargument. UIX does not need a content-addressed backend build system or exhaustive runtime reconstruction of TypeScript types to obtain the desired value. The compiler gate exists so substrate code can make normal TypeScript assumptions about feature definitions and contributions, and so an authoring agent gets tight diagnostics before changes mount. Jiti can continue executing admitted source; races, explicit type escapes, business errors, and runtime failures remain ordinary trusted-code concerns. TypeBox continues to own unknown data, domain assertions own composition relationships, and feature lifetimes own activation rollback.
